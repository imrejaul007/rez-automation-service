import cron from 'node-cron';
import { Rule } from '../models/Rule';
import { ruleEngine } from '../services/ruleEngine';
import { triggerService } from '../services/triggerService';
import logger from '../utils/logger';
import { config } from '../config/env';

export interface ScheduledTask {
  id: string;
  name: string;
  cronExpression: string;
  task: cron.ScheduledTask;
  enabled: boolean;
}

class RuleWorker {
  private static instance: RuleWorker;
  private scheduledTasks: Map<string, ScheduledTask> = new Map();
  private isRunning: boolean = false;
  private checkInterval: NodeJS.Timeout | null = null;

  // Default scheduled tasks configuration
  private static readonly DEFAULT_SCHEDULES = [
    {
      id: 'inactive-check',
      name: 'Check for inactive customers',
      cronExpression: '0 9 * * *', // Daily at 9 AM
      event: 'customer.inactive',
      dataGenerator: () => ({ checkedAt: new Date().toISOString() }),
    },
    {
      id: 'inventory-check',
      name: 'Check low inventory items',
      cronExpression: '0 */4 * * *', // Every 4 hours
      event: 'inventory.low',
      dataGenerator: () => ({ checkedAt: new Date().toISOString() }),
    },
    {
      id: 'occupancy-check',
      name: 'Check occupancy levels',
      cronExpression: '*/15 * * * *', // Every 15 minutes
      event: 'occupancy.high',
      dataGenerator: () => ({ checkedAt: new Date().toISOString() }),
    },
  ];

  private constructor() {}

  public static getInstance(): RuleWorker {
    if (!RuleWorker.instance) {
      RuleWorker.instance = new RuleWorker();
    }
    return RuleWorker.instance;
  }

  /**
   * Initialize and start the rule worker
   */
  public async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Rule worker is already running');
      return;
    }

    logger.info('Starting rule worker...');
    this.isRunning = true;

    // Start default scheduled tasks if enabled
    if (config.features.enableScheduledRules) {
      await this.startDefaultSchedules();
    }

    // Start rule cache refresh
    this.startCacheRefresh();

    // Start queue processor
    this.startQueueProcessor();

    logger.info('Rule worker started successfully');
  }

  /**
   * Stop the rule worker
   */
  public async stop(): Promise<void> {
    if (!this.isRunning) {
      logger.warn('Rule worker is not running');
      return;
    }

    logger.info('Stopping rule worker...');
    this.isRunning = false;

    // Stop all scheduled tasks
    for (const [id, scheduledTask] of this.scheduledTasks) {
      scheduledTask.task.stop();
      logger.debug('Stopped scheduled task', { id });
    }

    this.scheduledTasks.clear();

    // Stop intervals
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    logger.info('Rule worker stopped');
  }

  /**
   * Start default scheduled tasks
   */
  private async startDefaultSchedules(): Promise<void> {
    for (const schedule of RuleWorker.DEFAULT_SCHEDULES) {
      this.scheduleTask(
        schedule.id,
        schedule.name,
        schedule.cronExpression,
        async () => {
          const eventData = schedule.dataGenerator();
          await triggerService.processEvent(schedule.event, eventData, {
            source: 'scheduler',
          });
        }
      );
    }
  }

  /**
   * Schedule a new task
   */
  public scheduleTask(
    id: string,
    name: string,
    cronExpression: string,
    handler: () => Promise<void>
  ): void {
    // Validate cron expression
    if (!cron.validate(cronExpression)) {
      throw new Error(`Invalid cron expression: ${cronExpression}`);
    }

    // Stop existing task with same ID
    const existingTask = this.scheduledTasks.get(id);
    if (existingTask) {
      existingTask.task.stop();
    }

    const task = cron.schedule(cronExpression, async () => {
      logger.debug('Executing scheduled task', { id, name });

      try {
        await handler();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Scheduled task error', { id, name, error: errorMessage });
      }
    });

    this.scheduledTasks.set(id, {
      id,
      name,
      cronExpression,
      task,
      enabled: true,
    });

    logger.info('Scheduled task created', { id, name, cronExpression });
  }

  /**
   * Unschedule a task
   */
  public unscheduleTask(id: string): boolean {
    const task = this.scheduledTasks.get(id);
    if (task) {
      task.task.stop();
      this.scheduledTasks.delete(id);
      logger.info('Task unscheduled', { id });
      return true;
    }
    return false;
  }

  /**
   * Enable/disable a scheduled task
   */
  public toggleTask(id: string, enabled: boolean): boolean {
    const task = this.scheduledTasks.get(id);
    if (task) {
      if (enabled) {
        task.task.start();
      } else {
        task.task.stop();
      }
      task.enabled = enabled;
      logger.info('Task toggled', { id, enabled });
      return true;
    }
    return false;
  }

  /**
   * Get all scheduled tasks
   */
  public getScheduledTasks(): Array<{
    id: string;
    name: string;
    cronExpression: string;
    enabled: boolean;
  }> {
    return Array.from(this.scheduledTasks.values()).map((task) => ({
      id: task.id,
      name: task.name,
      cronExpression: task.cronExpression,
      enabled: task.enabled,
    }));
  }

  /**
   * Start cache refresh for rules
   */
  private startCacheRefresh(): void {
    const refreshInterval = 60000; // 1 minute

    this.checkInterval = setInterval(async () => {
      try {
        await this.refreshRuleCache();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Error refreshing rule cache', { error: errorMessage });
      }
    }, refreshInterval);

    logger.debug('Rule cache refresh started', { intervalMs: refreshInterval });
  }

  /**
   * Refresh the rule cache
   */
  private async refreshRuleCache(): Promise<void> {
    // In a production environment, this would refresh any cached rules
    // For now, we just verify connectivity
    const enabledRulesCount = await Rule.countDocuments({ enabled: true });
    logger.debug('Rule cache refreshed', { enabledRulesCount });
  }

  /**
   * Start queue processor
   */
  private startQueueProcessor(): void {
    const processInterval = config.worker.intervalMs;

    setInterval(async () => {
      if (ruleEngine.getQueueLength() > 0) {
        await ruleEngine.processQueue();
      }
    }, processInterval);

    logger.debug('Queue processor started', { intervalMs: processInterval });
  }

  /**
   * Check if worker is running
   */
  public isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Get worker status
   */
  public getStatus(): {
    isRunning: boolean;
    scheduledTasks: number;
    queueLength: number;
  } {
    return {
      isRunning: this.isRunning,
      scheduledTasks: this.scheduledTasks.size,
      queueLength: ruleEngine.getQueueLength(),
    };
  }
}

export const ruleWorker = RuleWorker.getInstance();
export default ruleWorker;
