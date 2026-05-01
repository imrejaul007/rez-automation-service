import mongoose, { Document, Schema, Model } from 'mongoose';

// Trigger condition interface
export interface ITriggerCondition {
  field?: string;
  operator?: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'nin' | 'contains' | 'exists';
  value?: string | number | boolean | string[] | number[];
  conditions?: ITriggerCondition[];
  logic?: 'and' | 'or';
}

// Trigger interface
export interface ITrigger {
  event: string;
  conditions?: ITriggerCondition[];
}

// Action config interface
export interface IActionConfig {
  [key: string]: string | number | boolean | object | undefined;
}

// Action interface
export interface IAction {
  type: 'send_offer' | 'create_po' | 'update_price' | 'notify' | 'webhook' | 'email' | 'sms';
  config: IActionConfig;
}

// Rule document interface
export interface IRule extends Document {
  name: string;
  description?: string;
  trigger: ITrigger;
  action: IAction;
  enabled: boolean;
  priority: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

// Rule schema
const TriggerConditionSchema = new Schema<ITriggerCondition>(
  {
    field: { type: String },
    operator: {
      type: String,
      enum: ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in', 'nin', 'contains', 'exists'],
    },
    value: { type: Schema.Types.Mixed },
    conditions: { type: [Schema.Types.Mixed] },
    logic: { type: String, enum: ['and', 'or'] },
  },
  { _id: false }
);

const TriggerSchema = new Schema<ITrigger>(
  {
    event: { type: String, required: true, index: true },
    conditions: { type: [TriggerConditionSchema], default: [] },
  },
  { _id: false }
);

const ActionConfigSchema = new Schema<IActionConfig>(
  {},
  { strict: false, _id: false }
);

const ActionSchema = new Schema<IAction>(
  {
    type: {
      type: String,
      required: true,
      enum: ['send_offer', 'create_po', 'update_price', 'notify', 'webhook', 'email', 'sms'],
    },
    config: { type: ActionConfigSchema, required: true },
  },
  { _id: false }
);

const RuleSchema = new Schema<IRule>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 255,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
    trigger: {
      type: TriggerSchema,
      required: true,
    },
    action: {
      type: ActionSchema,
      required: true,
    },
    enabled: {
      type: Boolean,
      default: true,
      index: true,
    },
    priority: {
      type: Number,
      default: 0,
      index: true,
    },
    createdBy: {
      type: String,
      trim: true,
    },
    tags: [{
      type: String,
      trim: true,
      lowercase: true,
    }],
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret) => {
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Indexes
RuleSchema.index({ name: 1 });
RuleSchema.index({ 'trigger.event': 1, enabled: 1 });
RuleSchema.index({ priority: -1, createdAt: -1 });
RuleSchema.index({ tags: 1 });
RuleSchema.index({ enabled: 1, priority: -1 });

// Pre-save middleware to ensure valid configuration
RuleSchema.pre('save', function (next) {
  if (!this.trigger || !this.trigger.event) {
    return next(new Error('Rule must have a trigger event'));
  }
  if (!this.action || !this.action.type) {
    return next(new Error('Rule must have an action'));
  }
  next();
});

// Static methods
RuleSchema.statics.findByEvent = function (event: string): Promise<IRule[]> {
  return this.find({ 'trigger.event': event, enabled: true })
    .sort({ priority: -1 })
    .exec();
};

RuleSchema.statics.findEnabledRules = function (): Promise<IRule[]> {
  return this.find({ enabled: true })
    .sort({ priority: -1, createdAt: -1 })
    .exec();
};

// Instance methods
RuleSchema.methods.disable = function (): Promise<IRule> {
  this.enabled = false;
  return this.save();
};

RuleSchema.methods.enable = function (): Promise<IRule> {
  this.enabled = true;
  return this.save();
};

export const Rule: Model<IRule> = mongoose.model<IRule>('Rule', RuleSchema);

export default Rule;
