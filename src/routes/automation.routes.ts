import { Router, Request, Response, NextFunction } from 'express';
import { Rule } from '../models/Rule';
import { AutomationLog, ExecutionStatus } from '../models/AutomationLog';
import { ruleEngine } from '../services/ruleEngine';
import { triggerService } from '../services/triggerService';
import logger from '../utils/logger';

const router = Router();

// Error handler wrapper
const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Validation middleware
const validateRuleInput = (req: Request, res: Response, next: NextFunction): void => {
  const { name, trigger, action } = req.body;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    res.status(400).json({ error: 'Rule name is required' });
    return;
  }

  if (!trigger || !trigger.event) {
    res.status(400).json({ error: 'Trigger with event is required' });
    return;
  }

  if (!action || !action.type) {
    res.status(400).json({ error: 'Action with type is required' });
    return;
  }

  next();
};

// ==================== RULE ROUTES ====================

/**
 * GET /api/rules
 * List all rules with optional filtering
 */
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const {
      enabled,
      event,
      tag,
      page = '1',
      limit = '50',
    } = req.query;

    const filter: Record<string, unknown> = {};

    if (enabled !== undefined) {
      filter.enabled = enabled === 'true';
    }

    if (event) {
      filter['trigger.event'] = event as string;
    }

    if (tag) {
      filter.tags = tag as string;
    }

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;

    const [rules, total] = await Promise.all([
      Rule.find(filter)
        .sort({ priority: -1, createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Rule.countDocuments(filter),
    ]);

    res.json({
      data: rules,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  })
);

/**
 * GET /api/rules/stats
 * Get rule execution statistics
 */
router.get(
  '/stats',
  asyncHandler(async (_req: Request, res: Response) => {
    const totalRules = await Rule.countDocuments();
    const enabledRules = await Rule.countDocuments({ enabled: true });
    const disabledRules = totalRules - enabledRules;

    const logStats = await AutomationLog.getStats();

    res.json({
      rules: {
        total: totalRules,
        enabled: enabledRules,
        disabled: disabledRules,
      },
      executions: logStats,
    });
  })
);

/**
 * GET /api/rules/:id
 * Get a single rule by ID
 */
router.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const rule = await Rule.findById(req.params.id).lean();

    if (!rule) {
      res.status(404).json({ error: 'Rule not found' });
      return;
    }

    res.json({ data: rule });
  })
);

/**
 * POST /api/rules
 * Create a new rule
 */
router.post(
  '/',
  validateRuleInput,
  asyncHandler(async (req: Request, res: Response) => {
    const rule = new Rule({
      name: req.body.name,
      description: req.body.description,
      trigger: req.body.trigger,
      action: req.body.action,
      enabled: req.body.enabled !== false,
      priority: req.body.priority || 0,
      createdBy: req.body.createdBy,
      tags: req.body.tags || [],
      metadata: req.body.metadata || {},
    });

    await rule.save();

    logger.info('Rule created', { ruleId: rule._id, ruleName: rule.name });

    res.status(201).json({
      message: 'Rule created successfully',
      data: rule,
    });
  })
);

/**
 * PUT /api/rules/:id
 * Update an existing rule
 */
router.put(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const rule = await Rule.findById(req.params.id);

    if (!rule) {
      res.status(404).json({ error: 'Rule not found' });
      return;
    }

    const allowedUpdates = [
      'name',
      'description',
      'trigger',
      'action',
      'enabled',
      'priority',
      'tags',
      'metadata',
    ];

    for (const field of allowedUpdates) {
      if (req.body[field] !== undefined) {
        (rule as unknown as Record<string, unknown>)[field] = req.body[field];
      }
    }

    await rule.save();

    logger.info('Rule updated', { ruleId: rule._id, ruleName: rule.name });

    res.json({
      message: 'Rule updated successfully',
      data: rule,
    });
  })
);

/**
 * DELETE /api/rules/:id
 * Delete a rule
 */
router.delete(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const rule = await Rule.findByIdAndDelete(req.params.id);

    if (!rule) {
      res.status(404).json({ error: 'Rule not found' });
      return;
    }

    logger.info('Rule deleted', { ruleId: rule._id, ruleName: rule.name });

    res.json({
      message: 'Rule deleted successfully',
    });
  })
);

/**
 * POST /api/rules/:id/execute
 * Manually trigger a rule execution
 */
router.post(
  '/:id/execute',
  asyncHandler(async (req: Request, res: Response) => {
    const rule = await Rule.findById(req.params.id);

    if (!rule) {
      res.status(404).json({ error: 'Rule not found' });
      return;
    }

    const eventData = req.body.data || req.body || {};

    logger.info('Manual rule execution triggered', {
      ruleId: rule._id,
      ruleName: rule.name,
    });

    const result = await ruleEngine.executeRule(rule, eventData, true);

    res.json({
      message: 'Rule execution completed',
      data: {
        ruleId: rule._id,
        ruleName: rule.name,
        result,
      },
    });
  })
);

/**
 * POST /api/rules/:id/toggle
 * Toggle rule enabled/disabled status
 */
router.post(
  '/:id/toggle',
  asyncHandler(async (req: Request, res: Response) => {
    const rule = await Rule.findById(req.params.id);

    if (!rule) {
      res.status(404).json({ error: 'Rule not found' });
      return;
    }

    rule.enabled = !rule.enabled;
    await rule.save();

    logger.info('Rule toggled', {
      ruleId: rule._id,
      ruleName: rule.name,
      enabled: rule.enabled,
    });

    res.json({
      message: `Rule ${rule.enabled ? 'enabled' : 'disabled'} successfully`,
      data: { enabled: rule.enabled },
    });
  })
);

// ==================== EVENT ROUTES ====================

/**
 * POST /api/events
 * Trigger an event for processing
 */
router.post(
  '/events',
  asyncHandler(async (req: Request, res: Response) => {
    const { event, data } = req.body;

    if (!event || typeof event !== 'string') {
      res.status(400).json({ error: 'Event type is required' });
      return;
    }

    const supportedEvents = triggerService.getSupportedEvents();
    if (!supportedEvents.includes(event)) {
      res.status(400).json({
        error: 'Unknown event type',
        supportedEvents,
      });
      return;
    }

    await triggerService.processEvent(event, data || {}, {
      source: 'api',
    });

    logger.info('Event triggered via API', { event });

    res.json({
      message: 'Event processed successfully',
      data: { event, data },
    });
  })
);

/**
 * GET /api/events
 * Get supported event types
 */
router.get(
  '/events',
  asyncHandler(async (_req: Request, res: Response) => {
    const events = triggerService.getSupportedEvents();

    res.json({
      data: events,
    });
  })
);

/**
 * GET /api/events/history
 * Get event history
 */
router.get(
  '/events/history',
  asyncHandler(async (req: Request, res: Response) => {
    const { event, limit = '100' } = req.query;
    const limitNum = parseInt(limit as string, 10);

    const history = triggerService.getEventHistory(event as string, limitNum);

    res.json({
      data: history,
    });
  })
);

// ==================== LOG ROUTES ====================

/**
 * GET /api/logs
 * Get automation execution logs
 */
router.get(
  '/logs',
  asyncHandler(async (req: Request, res: Response) => {
    const {
      ruleId,
      ruleName,
      event,
      status,
      startDate,
      endDate,
      page = '1',
      limit = '50',
    } = req.query;

    const filter: Record<string, unknown> = {};

    if (ruleId) {
      filter.ruleId = ruleId;
    }

    if (ruleName) {
      filter.ruleName = ruleName;
    }

    if (event) {
      filter.event = event;
    }

    if (status && Object.values(ExecutionStatus).includes(status as ExecutionStatus)) {
      filter.status = status;
    }

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) {
        (filter.createdAt as Record<string, Date>).$gte = new Date(startDate as string);
      }
      if (endDate) {
        (filter.createdAt as Record<string, Date>).$lte = new Date(endDate as string);
      }
    }

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;

    const [logs, total] = await Promise.all([
      AutomationLog.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      AutomationLog.countDocuments(filter),
    ]);

    res.json({
      data: logs,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  })
);

/**
 * GET /api/logs/stats
 * Get execution statistics
 */
router.get(
  '/logs/stats',
  asyncHandler(async (req: Request, res: Response) => {
    const { startDate, endDate } = req.query;

    const stats = await AutomationLog.getStats(
      startDate ? new Date(startDate as string) : undefined,
      endDate ? new Date(endDate as string) : undefined
    );

    res.json({ data: stats });
  })
);

/**
 * GET /api/logs/:id
 * Get a single log entry
 */
router.get(
  '/logs/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const log = await AutomationLog.findById(req.params.id).lean();

    if (!log) {
      res.status(404).json({ error: 'Log entry not found' });
      return;
    }

    res.json({ data: log });
  })
);

// ==================== HEALTH CHECK ====================

/**
 * GET /api/health
 * Health check endpoint
 */
router.get(
  '/health',
  asyncHandler(async (_req: Request, res: Response) => {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        ruleEngine: {
          queueLength: ruleEngine.getQueueLength(),
        },
        triggerService: {
          isSubscribed: triggerService.isSubscribedToRedis(),
          supportedEvents: triggerService.getSupportedEvents().length,
        },
      },
    };

    res.json(health);
  })
);

export default router;
