import { Rule, IRule } from '../models/Rule';
import logger from '../utils/logger';

export interface CustomerRuleDefinition {
  name: string;
  description: string;
  trigger: {
    event: string;
    conditions?: Array<{
      field: string;
      operator: string;
      value: string | number | boolean;
    }>;
  };
  action: {
    type: string;
    config: Record<string, unknown>;
  };
  enabled?: boolean;
  priority?: number;
  tags?: string[];
}

export const customerRules: CustomerRuleDefinition[] = [
  {
    name: 'Churn Prevention - 30 Days Inactive',
    description: 'Send a discount offer to customers who have been inactive for 30 days',
    trigger: {
      event: 'customer.inactive',
      conditions: [
        { field: 'daysSinceLastActivity', operator: 'gte', value: 30 },
      ],
    },
    action: {
      type: 'send_offer',
      config: {
        discount: 10,
        offerType: 'churn_prevention',
        channels: ['email', 'sms'],
        templateId: 'churn_prevention_v1',
      },
    },
    priority: 10,
    tags: ['customer', 'churn', 'marketing'],
  },
  {
    name: 'Customer Welcome',
    description: 'Send welcome notification to new customers',
    trigger: {
      event: 'customer.created',
    },
    action: {
      type: 'notify',
      config: {
        template: 'welcome',
        channels: ['email', 'sms'],
        subject: 'Welcome to ReZ!',
      },
    },
    priority: 20,
    tags: ['customer', 'onboarding'],
  },
  {
    name: 'High Value Customer Alert',
    description: 'Notify sales team when a high value customer is created',
    trigger: {
      event: 'customer.created',
      conditions: [
        { field: 'lifetimeValue', operator: 'gte', value: 10000 },
      ],
    },
    action: {
      type: 'notify',
      config: {
        template: 'high_value_alert',
        channels: ['slack', 'email'],
        subject: 'High Value Customer Alert',
      },
    },
    priority: 15,
    tags: ['customer', 'sales', 'alert'],
  },
  {
    name: 'Customer Update Follow-up',
    description: 'Send follow-up after customer profile update',
    trigger: {
      event: 'customer.updated',
      conditions: [
        { field: 'updatedFields', operator: 'contains', value: 'preferences' },
      ],
    },
    action: {
      type: 'notify',
      config: {
        template: 'profile_update_thanks',
        channels: ['email'],
      },
    },
    priority: 5,
    tags: ['customer', 'engagement'],
  },
  {
    name: 'VIP Customer Birthday',
    description: 'Send birthday offer to VIP customers',
    trigger: {
      event: 'customer.updated',
      conditions: [
        { field: 'isBirthday', operator: 'eq', value: true },
        { field: 'tier', operator: 'eq', value: 'vip' },
      ],
    },
    action: {
      type: 'send_offer',
      config: {
        discount: 25,
        offerType: 'birthday',
        channels: ['email', 'sms'],
        templateId: 'vip_birthday',
      },
    },
    priority: 25,
    tags: ['customer', 'vip', 'birthday', 'loyalty'],
  },
  {
    name: 'Churn Risk Detection',
    description: 'Identify and flag customers at high churn risk',
    trigger: {
      event: 'customer.inactive',
      conditions: [
        { field: 'declineInOrders', operator: 'gte', value: 3 },
        { field: 'daysSinceLastActivity', operator: 'gte', value: 14 },
      ],
    },
    action: {
      type: 'notify',
      config: {
        template: 'churn_risk_alert',
        channels: ['slack', 'email'],
        subject: 'Customer Churn Risk Alert',
      },
    },
    priority: 12,
    tags: ['customer', 'churn', 'risk'],
  },
];

/**
 * Seed customer rules to the database
 */
export async function seedCustomerRules(): Promise<void> {
  try {
    logger.info('Seeding customer rules...');

    for (const ruleDef of customerRules) {
      // Check if rule already exists
      const existingRule = await Rule.findOne({ name: ruleDef.name });

      if (existingRule) {
        logger.debug('Customer rule already exists', { ruleName: ruleDef.name });
        continue;
      }

      const rule = new Rule({
        name: ruleDef.name,
        description: ruleDef.description,
        trigger: ruleDef.trigger,
        action: ruleDef.action as any,
        enabled: ruleDef.enabled !== false,
        priority: ruleDef.priority || 0,
        tags: ruleDef.tags,
        metadata: {
          seeded: true,
          category: 'customer',
        },
      });

      await rule.save();
      logger.info('Customer rule seeded', { ruleName: ruleDef.name });
    }

    logger.info('Customer rules seeding completed', {
      totalRules: customerRules.length,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error seeding customer rules', { error: errorMessage });
    throw error;
  }
}

/**
 * Get all customer rule definitions
 */
export function getCustomerRuleDefinitions(): CustomerRuleDefinition[] {
  return [...customerRules];
}

export default customerRules;
