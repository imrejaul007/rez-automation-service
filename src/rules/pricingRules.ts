import { Rule } from '../models/Rule';
import logger from '../utils/logger';

export interface PricingRuleDefinition {
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

export const pricingRules: PricingRuleDefinition[] = [
  {
    name: 'High Occupancy Dynamic Pricing',
    description: 'Increase prices when occupancy is high (>80%)',
    trigger: {
      event: 'occupancy.high',
      conditions: [
        { field: 'occupancyRate', operator: 'gt', value: 80 },
      ],
    },
    action: {
      type: 'update_price',
      config: {
        multiplier: 1.2,
        strategy: 'dynamic_pricing',
        maxIncrease: 50,
        applyTo: 'all_items',
      },
    },
    priority: 20,
    tags: ['pricing', 'dynamic', 'revenue'],
  },
  {
    name: 'Low Occupancy Discount',
    description: 'Reduce prices when occupancy is low (<30%)',
    trigger: {
      event: 'occupancy.low',
      conditions: [
        { field: 'occupancyRate', operator: 'lt', value: 30 },
      ],
    },
    action: {
      type: 'update_price',
      config: {
        multiplier: 0.85,
        strategy: 'dynamic_pricing',
        maxDiscount: 20,
        applyTo: 'selected_items',
      },
    },
    priority: 18,
    tags: ['pricing', 'dynamic', 'promotion'],
  },
  {
    name: 'Happy Hour Pricing',
    description: 'Apply happy hour discounts during off-peak hours',
    trigger: {
      event: 'occupancy.low',
      conditions: [
        { field: 'hour', operator: 'in', value: [14, 15, 16, 21, 22, 23] },
      ],
    },
    action: {
      type: 'update_price',
      config: {
        multiplier: 0.75,
        strategy: 'happy_hour',
        applyTo: 'beverages',
        autoRevert: true,
        revertAt: { hour: 18, minute: 0 },
      },
    },
    priority: 22,
    tags: ['pricing', 'happy_hour', 'off_peak'],
  },
  {
    name: 'Weekend Premium',
    description: 'Apply premium pricing on weekends',
    trigger: {
      event: 'occupancy.high',
      conditions: [
        { field: 'dayOfWeek', operator: 'in', value: [0, 6] }, // Sunday, Saturday
      ],
    },
    action: {
      type: 'update_price',
      config: {
        multiplier: 1.15,
        strategy: 'weekend_premium',
        applyTo: 'all_items',
      },
    },
    priority: 15,
    tags: ['pricing', 'weekend', 'premium'],
  },
  {
    name: 'Demand-Based Surge',
    description: 'Surge pricing based on real-time demand',
    trigger: {
      event: 'occupancy.high',
      conditions: [
        { field: 'demandScore', operator: 'gt', value: 85 },
        { field: 'isSpecialEvent', operator: 'eq', value: true },
      ],
    },
    action: {
      type: 'update_price',
      config: {
        multiplier: 1.5,
        strategy: 'surge_pricing',
        maxIncrease: 100,
        applyTo: 'all_items',
      },
    },
    priority: 25,
    tags: ['pricing', 'surge', 'demand'],
  },
  {
    name: 'Off-Peak Promotion',
    description: 'Promotional pricing during slow periods',
    trigger: {
      event: 'occupancy.low',
      conditions: [
        { field: 'occupancyRate', operator: 'lt', value: 20 },
        { field: 'hour', operator: 'in', value: [11, 12, 13] }, // Lunch hours
      ],
    },
    action: {
      type: 'send_offer',
      config: {
        discount: 15,
        offerType: 'off_peak_lunch',
        channels: ['email', 'app_notification'],
        templateId: 'lunch_promotion',
      },
    },
    priority: 16,
    tags: ['pricing', 'promotion', 'lunch'],
  },
];

/**
 * Seed pricing rules to the database
 */
export async function seedPricingRules(): Promise<void> {
  try {
    logger.info('Seeding pricing rules...');

    for (const ruleDef of pricingRules) {
      const existingRule = await Rule.findOne({ name: ruleDef.name });

      if (existingRule) {
        logger.debug('Pricing rule already exists', { ruleName: ruleDef.name });
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
          category: 'pricing',
        },
      });

      await rule.save();
      logger.info('Pricing rule seeded', { ruleName: ruleDef.name });
    }

    logger.info('Pricing rules seeding completed', {
      totalRules: pricingRules.length,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error seeding pricing rules', { error: errorMessage });
    throw error;
  }
}

/**
 * Get all pricing rule definitions
 */
export function getPricingRuleDefinitions(): PricingRuleDefinition[] {
  return [...pricingRules];
}

export default pricingRules;
