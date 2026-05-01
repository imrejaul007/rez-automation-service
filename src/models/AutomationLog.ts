import mongoose, { Document, Schema, Model } from 'mongoose';

// Execution status enum
export enum ExecutionStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  SUCCESS = 'success',
  FAILED = 'failed',
  SKIPPED = 'skipped',
  RETRYING = 'retrying',
}

// Log entry document interface
export interface IAutomationLog extends Document {
  ruleId: mongoose.Types.ObjectId;
  ruleName: string;
  event: string;
  status: ExecutionStatus;
  triggerData: Record<string, unknown>;
  actionResult?: Record<string, unknown>;
  errorMessage?: string;
  executionTimeMs: number;
  retryCount: number;
  createdAt: Date;
  completedAt?: Date;
  metadata?: Record<string, unknown>;
  // Instance methods
  markRunning(): void;
  markSuccess(result: Record<string, unknown>, executionTimeMs: number): void;
  markFailed(error: string, executionTimeMs: number): void;
  markSkipped(reason: string): void;
  incrementRetry(): void;
}

// Extended model interface with static methods
export interface IAutomationLogModel extends Model<IAutomationLog> {
  findByRule(ruleId: string, limit?: number): Promise<IAutomationLog[]>;
  findByStatus(status: ExecutionStatus, limit?: number): Promise<IAutomationLog[]>;
  findByEvent(event: string, limit?: number): Promise<IAutomationLog[]>;
  getStats(startDate?: Date, endDate?: Date): Promise<Record<string, unknown>>;
  getRecentLogs(limit?: number): Promise<IAutomationLog[]>;
}

// Automation log schema
const AutomationLogSchema = new Schema<IAutomationLog>(
  {
    ruleId: {
      type: Schema.Types.ObjectId,
      ref: 'Rule',
      required: true,
      index: true,
    },
    ruleName: {
      type: String,
      required: true,
      trim: true,
    },
    event: {
      type: String,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(ExecutionStatus),
      default: ExecutionStatus.PENDING,
      index: true,
    },
    triggerData: {
      type: Schema.Types.Mixed,
      default: {},
    },
    actionResult: {
      type: Schema.Types.Mixed,
    },
    errorMessage: {
      type: String,
    },
    executionTimeMs: {
      type: Number,
      default: 0,
    },
    retryCount: {
      type: Number,
      default: 0,
    },
    completedAt: {
      type: Date,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Indexes for efficient querying
AutomationLogSchema.index({ ruleId: 1, createdAt: -1 });
AutomationLogSchema.index({ event: 1, status: 1 });
AutomationLogSchema.index({ status: 1, createdAt: -1 });
AutomationLogSchema.index({ createdAt: -1 });
AutomationLogSchema.index({ ruleName: 1, status: 1 });

// TTL index to automatically delete old logs (after 30 days)
AutomationLogSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 30 * 24 * 60 * 60 }
);

// Static methods
AutomationLogSchema.statics.findByRule = function (
  ruleId: string,
  limit: number = 100
): Promise<IAutomationLog[]> {
  return this.find({ ruleId: new mongoose.Types.ObjectId(ruleId) })
    .sort({ createdAt: -1 })
    .limit(limit)
    .exec();
};

AutomationLogSchema.statics.findByStatus = function (
  status: ExecutionStatus,
  limit: number = 100
): Promise<IAutomationLog[]> {
  return this.find({ status })
    .sort({ createdAt: -1 })
    .limit(limit)
    .exec();
};

AutomationLogSchema.statics.findByEvent = function (
  event: string,
  limit: number = 100
): Promise<IAutomationLog[]> {
  return this.find({ event })
    .sort({ createdAt: -1 })
    .limit(limit)
    .exec();
};

AutomationLogSchema.statics.getStats = async function (
  startDate?: Date,
  endDate?: Date
): Promise<Record<string, unknown>> {
  const match: Record<string, unknown> = {};
  if (startDate || endDate) {
    match.createdAt = {};
    if (startDate) {
      (match.createdAt as Record<string, Date>).$gte = startDate;
    }
    if (endDate) {
      (match.createdAt as Record<string, Date>).$lte = endDate;
    }
  }

  const stats = await this.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        avgExecutionTime: { $avg: '$executionTimeMs' },
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: '$count' },
        statuses: {
          $push: {
            status: '$_id',
            count: '$count',
            avgExecutionTime: { $round: ['$avgExecutionTime', 2] },
          },
        },
      },
    },
  ]);

  return stats[0] || { total: 0, statuses: [] };
};

AutomationLogSchema.statics.getRecentLogs = function (
  limit: number = 50
): Promise<IAutomationLog[]> {
  return this.find()
    .sort({ createdAt: -1 })
    .limit(limit)
    .exec();
};

// Instance methods
AutomationLogSchema.methods.markRunning = function (): void {
  this.status = ExecutionStatus.RUNNING;
};

AutomationLogSchema.methods.markSuccess = function (
  result: Record<string, unknown>,
  executionTimeMs: number
): void {
  this.status = ExecutionStatus.SUCCESS;
  this.actionResult = result;
  this.executionTimeMs = executionTimeMs;
  this.completedAt = new Date();
};

AutomationLogSchema.methods.markFailed = function (
  error: string,
  executionTimeMs: number
): void {
  this.status = ExecutionStatus.FAILED;
  this.errorMessage = error;
  this.executionTimeMs = executionTimeMs;
  this.completedAt = new Date();
};

AutomationLogSchema.methods.markSkipped = function (reason: string): void {
  this.status = ExecutionStatus.SKIPPED;
  this.errorMessage = reason;
  this.completedAt = new Date();
};

AutomationLogSchema.methods.incrementRetry = function (): void {
  this.retryCount += 1;
  this.status = ExecutionStatus.RETRYING;
};

export const AutomationLog = mongoose.model<IAutomationLog, IAutomationLogModel>(
  'AutomationLog',
  AutomationLogSchema
);

export default AutomationLog;
