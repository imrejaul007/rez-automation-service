import { Rule, IRule, ITriggerCondition } from '../models/Rule';
import { AutomationLog, ExecutionStatus } from '../models/AutomationLog';
import { actionExecutor, ActionResult } from './actionExecutor';
import logger from '../utils/logger';
import { config } from '../config/env';

export interface RuleMatch {
  rule: IRule;
  score: number;
}

export interface EventData {
  event: string;
  data: Record<string, unknown>;
  timestamp?: Date;
  source?: string;
}

export interface ConditionResult {
  passed: boolean;
  reason?: string;
}

class RuleEngine {
  private static instance: RuleEngine;
  private isProcessing: boolean = false;
  private eventQueue: EventData[] = [];

  private constructor() {}

  public static getInstance(): RuleEngine {
    if (!RuleEngine.instance) {
      RuleEngine.instance = new RuleEngine();
    }
    return RuleEngine.instance;
  }

  /**
   * Process an incoming event and execute matching rules
   */
  public async processEvent(eventData: EventData): Promise<void> {
    const { event, data } = eventData;

    logger.info('Processing event', { event, dataKeys: Object.keys(data) });

    try {
      // Find all enabled rules that match this event
      const matchingRules = await this.findMatchingRules(event);

      if (matchingRules.length === 0) {
        logger.debug('No matching rules found for event', { event });
        return;
      }

      logger.info(`Found ${matchingRules.length} matching rules`, {
        event,
        ruleNames: matchingRules.map((r) => r.rule.name),
      });

      // Process rules with concurrency limit
      await this.processRulesConcurrently(matchingRules, data);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error processing event', { event, error: errorMessage });
      throw error;
    }
  }

  /**
   * Find all rules that match the given event
   */
  public async findMatchingRules(event: string): Promise<RuleMatch[]> {
    const rules = await Rule.findByEvent(event);

    const matches: RuleMatch[] = [];

    for (const rule of rules) {
      if (rule.enabled) {
        // Rules are sorted by priority, so we can assign score based on position
        matches.push({
          rule,
          score: rule.priority,
        });
      }
    }

    // Sort by score (priority) descending
    matches.sort((a, b) => b.score - a.score);

    return matches;
  }

  /**
   * Evaluate trigger conditions against event data
   */
  public evaluateConditions(
    conditions: ITriggerCondition[],
    data: Record<string, unknown>
  ): ConditionResult {
    if (!conditions || conditions.length === 0) {
      return { passed: true };
    }

    for (const condition of conditions) {
      const result = this.evaluateSingleCondition(condition, data);

      if (!result.passed) {
        return result;
      }
    }

    return { passed: true };
  }

  /**
   * Evaluate a single condition against event data
   */
  private evaluateSingleCondition(
    condition: ITriggerCondition,
    data: Record<string, unknown>
  ): ConditionResult {
    // Handle nested conditions (AND/OR logic)
    if (condition.conditions && condition.conditions.length > 0) {
      const logic = condition.logic || 'and';
      return this.evaluateNestedConditions(condition.conditions, logic, data);
    }

    // Handle simple conditions
    const { field, operator, value } = condition;

    if (!field) {
      return { passed: true };
    }

    const fieldValue = this.getNestedValue(data, field);

    switch (operator) {
      case 'eq':
        return { passed: fieldValue === value };

      case 'ne':
        return { passed: fieldValue !== value };

      case 'gt':
        return { passed: Number(fieldValue) > Number(value) };

      case 'gte':
        return { passed: Number(fieldValue) >= Number(value) };

      case 'lt':
        return { passed: Number(fieldValue) < Number(value) };

      case 'lte':
        return { passed: Number(fieldValue) <= Number(value) };

      case 'in':
        return {
          passed: Array.isArray(value) && (value as Array<string | number>).includes(fieldValue as string | number),
        };

      case 'nin':
        return {
          passed: Array.isArray(value) && !(value as Array<string | number>).includes(fieldValue as string | number),
        };

      case 'contains':
        if (typeof fieldValue === 'string' && typeof value === 'string') {
          return { passed: fieldValue.includes(value) };
        }
        if (Array.isArray(fieldValue)) {
          return { passed: fieldValue.includes(value) };
        }
        return { passed: false };

      case 'exists':
        const shouldExist = value === true || value === 'true';
        const exists = fieldValue !== undefined && fieldValue !== null;
        return { passed: shouldExist === exists };

      default:
        return { passed: true };
    }
  }

  /**
   * Evaluate nested conditions with AND/OR logic
   */
  private evaluateNestedConditions(
    conditions: ITriggerCondition[],
    logic: 'and' | 'or',
    data: Record<string, unknown>
  ): ConditionResult {
    if (logic === 'and') {
      for (const condition of conditions) {
        const result = this.evaluateSingleCondition(condition, data);
        if (!result.passed) {
          return result;
        }
      }
      return { passed: true };
    } else {
      // OR logic
      for (const condition of conditions) {
        const result = this.evaluateSingleCondition(condition, data);
        if (result.passed) {
          return { passed: true };
        }
      }
      return { passed: false, reason: 'No conditions matched for OR logic' };
    }
  }

  /**
   * Get nested value from object using dot notation
   */
  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    const keys = path.split('.');
    let current: unknown = obj;

    for (const key of keys) {
      if (current === null || current === undefined) {
        return undefined;
      }
      if (typeof current === 'object') {
        current = (current as Record<string, unknown>)[key];
      } else {
        return undefined;
      }
    }

    return current;
  }

  /**
   * Process rules concurrently with a limit
   */
  private async processRulesConcurrently(
    ruleMatches: RuleMatch[],
    data: Record<string, unknown>
  ): Promise<void> {
    const concurrency = config.worker.concurrency;
    const chunks: RuleMatch[][] = [];

    for (let i = 0; i < ruleMatches.length; i += concurrency) {
      chunks.push(ruleMatches.slice(i, i + concurrency));
    }

    for (const chunk of chunks) {
      await Promise.all(
        chunk.map(async (match) => {
          try {
            await this.executeRule(match.rule, data);
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger.error('Error executing rule', {
              ruleName: match.rule.name,
              error: errorMessage,
            });
          }
        })
      );
    }
  }

  /**
   * Execute a single rule
   */
  public async executeRule(
    rule: IRule,
    eventData: Record<string, unknown>,
    _manual: boolean = false
  ): Promise<ActionResult> {
    const startTime = Date.now();

    // Create log entry
    const log = new AutomationLog({
      ruleId: rule._id,
      ruleName: rule.name,
      event: rule.trigger.event,
      status: ExecutionStatus.PENDING,
      triggerData: eventData,
    });

    try {
      await log.save();

      // Mark as running
      log.markRunning();
      await log.save();

      // Check conditions if any
      if (rule.trigger.conditions && rule.trigger.conditions.length > 0) {
        const conditionResult = this.evaluateConditions(
          rule.trigger.conditions,
          eventData
        );

        if (!conditionResult.passed) {
          log.markSkipped(
            conditionResult.reason || 'Conditions not met'
          );
          await log.save();
          logger.info('Rule skipped due to conditions', {
            ruleName: rule.name,
            reason: conditionResult.reason,
          });
          return {
            success: false,
            skipped: true,
            reason: conditionResult.reason,
          };
        }
      }

      // Execute action
      const result = await actionExecutor.execute(rule.action, eventData);

      const executionTime = Date.now() - startTime;

      if (result.success) {
        log.markSuccess(result.data || {}, executionTime);
        await log.save();
        logger.info('Rule executed successfully', {
          ruleName: rule.name,
          executionTimeMs: executionTime,
        });
      } else {
        log.markFailed(result.error || 'Action execution failed', executionTime);
        await log.save();
        logger.error('Rule execution failed', {
          ruleName: rule.name,
          error: result.error,
        });
      }

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const executionTime = Date.now() - startTime;

      log.markFailed(errorMessage, executionTime);
      await log.save();

      logger.error('Rule execution error', {
        ruleName: rule.name,
        error: errorMessage,
      });

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Queue an event for processing
   */
  public queueEvent(eventData: EventData): void {
    this.eventQueue.push(eventData);
    logger.debug('Event queued', {
      event: eventData.event,
      queueLength: this.eventQueue.length,
    });
  }

  /**
   * Process queued events
   */
  public async processQueue(): Promise<void> {
    if (this.isProcessing || this.eventQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    try {
      while (this.eventQueue.length > 0) {
        const event = this.eventQueue.shift();
        if (event) {
          await this.processEvent(event);
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Get queue length
   */
  public getQueueLength(): number {
    return this.eventQueue.length;
  }

  /**
   * Get all rules with their statistics
   */
  public async getRulesWithStats(): Promise<Array<IRule & { executionCount: number; lastExecuted?: Date }>> {
    const rules = await Rule.find().sort({ priority: -1, createdAt: -1 });

    const rulesWithStats = await Promise.all(
      rules.map(async (rule) => {
        const lastLog = await AutomationLog.findOne({ ruleId: rule._id })
          .sort({ createdAt: -1 });

        return {
          ...(rule.toObject() as unknown as IRule),
          executionCount: await AutomationLog.countDocuments({ ruleId: rule._id }),
          lastExecuted: lastLog?.createdAt,
        } as IRule & { executionCount: number; lastExecuted?: Date };
      })
    );

    return rulesWithStats;
  }
}

export const ruleEngine = RuleEngine.getInstance();
export default ruleEngine;
