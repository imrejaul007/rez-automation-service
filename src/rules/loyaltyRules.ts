import { Rule } from '../models/Rule';
import logger from '../utils/logger';

export interface LoyaltyRuleDefinition {
  name: string;
  description: string;
  trigger: {
    event: string;
    conditions?: Array<{
      field: string;
      operator: string;
      value: string | number | boolean | string[] | number[];
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

export const loyaltyRules: LoyaltyRuleDefinition[] = [
  {
    name: 'Post-Order Follow-up',
    description: 'Send follow-up message after order completion',
    trigger: {
      event: 'order.completed',
    },
    action: {
      type: 'notify',
      config: {
        template: 'followup',
        channels: ['email', 'sms'],
        subject: 'Thank you for your order!',
        delayMinutes: 30,
      },
    },
    priority: 10,
    tags: ['loyalty', 'followup', 'engagement'],
  },
  {
    name: 'First Order Reward',
    description: 'Send reward coupon after first order',
    trigger: {
      event: 'order.completed',
      conditions: [
        { field: 'orderCount', operator: 'eq', value: 1 },
      ],
    },
    action: {
      type: 'send_offer',
      config: {
        discount: 20,
        offerType: 'first_order_reward',
        channels: ['email', 'sms'],
        templateId: 'welcome_discount',
        expiresInDays: 30,
      },
    },
    priority: 25,
    tags: ['loyalty', 'onboarding', 'reward'],
  },
  {
    name: 'Order Milestone Reward',
    description: 'Send reward when customer reaches order milestones',
    trigger: {
      event: 'order.completed',
      conditions: [
        { field: 'orderCount', operator: 'in', value: [5, 10, 25, 50, 100] },
      ],
    },
    action: {
      type: 'send_offer',
      config: {
        discount: 15,
        offerType: 'milestone_reward',
        channels: ['email', 'sms', 'app_notification'],
        templateId: 'milestone_reward',
        tierBonus: true,
      },
    },
    priority: 20,
    tags: ['loyalty', 'milestone', 'reward'],
  },
  {
    name: 'Loyalty Points Expiry Warning',
    description: 'Notify customers before their points expire',
    trigger: {
      event: 'customer.inactive',
      conditions: [
        { field: 'pointsExpiryDays', operator: 'lte', value: 14 },
        { field: 'loyaltyPoints', operator: 'gt', value: 500 },
      ],
    },
    action: {
      type: 'notify',
      config: {
        template: 'points_expiry_reminder',
        channels: ['email', 'sms'],
        subject: 'Your loyalty points are expiring soon!',
      },
    },
    priority: 18,
    tags: ['loyalty', 'points', 'retention'],
  },
  {
    name: 'VIP Tier Upgrade',
    description: 'Notify and reward customers when they upgrade to VIP',
    trigger: {
      event: 'customer.updated',
      conditions: [
        { field: 'tierChanged', operator: 'eq', value: true },
        { field: 'newTier', operator: 'eq', value: 'vip' },
      ],
    },
    action: {
      type: 'send_offer',
      config: {
        discount: 30,
        offerType: 'vip_upgrade_reward',
        channels: ['email', 'sms', 'app_notification'],
        templateId: 'vip_welcome',
        exclusiveBenefits: true,
      },
    },
    priority: 22,
    tags: ['loyalty', 'vip', 'upgrade'],
  },
  {
    name: 'Referral Reward',
    description: 'Send reward when a referred customer makes first order',
    trigger: {
      event: 'order.completed',
      conditions: [
        { field: 'referredBy', operator: 'exists', value: true },
        { field: 'orderCount', operator: 'eq', value: 1 },
      ],
    },
    action: {
      type: 'notify',
      config: {
        template: 'referral_success',
        channels: ['email'],
        subject: 'Your referral made a purchase!',
      },
    },
    priority: 15,
    tags: ['loyalty', 'referral', 'reward'],
  },
  {
    name: 'Abandoned Cart Reminder',
    description: 'Send reminder for abandoned carts',
    trigger: {
      event: 'order.created',
      conditions: [
        { field: 'abandonedCart', operator: 'eq', value: true },
        { field: 'cartValue', operator: 'gt', value: 50 },
      ],
    },
    action: {
      type: 'notify',
      config: {
        template: 'abandoned_cart',
        channels: ['email', 'sms'],
        subject: 'You left something behind!',
        delayMinutes: 60,
      },
    },
    priority: 12,
    tags: ['loyalty', 'cart', 'recovery'],
  },
  {
    name: 'Birthday Reward',
    description: 'Send birthday offer to loyalty members',
    trigger: {
      event: 'customer.updated',
      conditions: [
        { field: 'isBirthday', operator: 'eq', value: true },
      ],
    },
    action: {
      type: 'send_offer',
      config: {
        discount: 15,
        offerType: 'birthday_reward',
        channels: ['email', 'sms'],
        templateId: 'birthday_offer',
        expiresInDays: 7,
      },
    },
    priority: 23,
    tags: ['loyalty', 'birthday', 'reward'],
  },
];

/**
 * Seed loyalty rules to the database
 */
export async function seedLoyaltyRules(): Promise<void> {
  try {
    logger.info('Seeding loyalty rules...');

    for (const ruleDef of loyaltyRules) {
      const existingRule = await Rule.findOne({ name: ruleDef.name });

      if (existingRule) {
        logger.debug('Loyalty rule already exists', { ruleName: ruleDef.name });
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
          category: 'loyalty',
        },
      });

      await rule.save();
      logger.info('Loyalty rule seeded', { ruleName: ruleDef.name });
    }

    logger.info('Loyalty rules seeding completed', {
      totalRules: loyaltyRules.length,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error seeding loyalty rules', { error: errorMessage });
    throw error;
  }
}

/**
 * Get all loyalty rule definitions
 */
export function getLoyaltyRuleDefinitions(): LoyaltyRuleDefinition[] {
  return [...loyaltyRules];
}

export default loyaltyRules;
