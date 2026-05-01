import { Rule } from '../models/Rule';
import logger from '../utils/logger';

export interface InventoryRuleDefinition {
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

export const inventoryRules: InventoryRuleDefinition[] = [
  {
    name: 'Low Inventory Alert',
    description: 'Create purchase order when inventory falls below threshold',
    trigger: {
      event: 'inventory.low',
      conditions: [
        { field: 'currentStock', operator: 'lte', value: 10 },
      ],
    },
    action: {
      type: 'create_po',
      config: {
        threshold: 10,
        autoApprove: false,
        quantity: 50,
      },
    },
    priority: 15,
    tags: ['inventory', 'purchasing', 'critical'],
  },
  {
    name: 'Out of Stock Alert',
    description: 'Send urgent alert when item is out of stock',
    trigger: {
      event: 'inventory.updated',
      conditions: [
        { field: 'currentStock', operator: 'eq', value: 0 },
      ],
    },
    action: {
      type: 'notify',
      config: {
        template: 'out_of_stock_alert',
        channels: ['slack', 'email', 'sms'],
        subject: 'URGENT: Item Out of Stock',
      },
    },
    priority: 25,
    tags: ['inventory', 'alert', 'urgent'],
  },
  {
    name: 'Inventory Restock Confirmation',
    description: 'Notify team when inventory is replenished',
    trigger: {
      event: 'inventory.updated',
      conditions: [
        { field: 'restockReason', operator: 'eq', value: 'purchase_order' },
        { field: 'previousStock', operator: 'eq', value: 0 },
      ],
    },
    action: {
      type: 'notify',
      config: {
        template: 'inventory_restock',
        channels: ['slack'],
        subject: 'Inventory Restocked',
      },
    },
    priority: 5,
    tags: ['inventory', 'confirmation'],
  },
  {
    name: 'Overstock Warning',
    description: 'Alert when inventory exceeds maximum threshold',
    trigger: {
      event: 'inventory.updated',
      conditions: [
        { field: 'currentStock', operator: 'gt', value: 500 },
      ],
    },
    action: {
      type: 'notify',
      config: {
        template: 'overstock_warning',
        channels: ['email'],
        subject: 'Overstock Warning',
      },
    },
    priority: 8,
    tags: ['inventory', 'warning'],
  },
  {
    name: 'Expiry Date Warning',
    description: 'Alert when items are approaching expiry date',
    trigger: {
      event: 'inventory.updated',
      conditions: [
        { field: 'daysUntilExpiry', operator: 'lte', value: 7 },
        { field: 'hasExpiryDate', operator: 'eq', value: true },
      ],
    },
    action: {
      type: 'notify',
      config: {
        template: 'expiry_warning',
        channels: ['slack', 'email'],
        subject: 'Items Approaching Expiry',
      },
    },
    priority: 12,
    tags: ['inventory', 'expiry', 'waste_prevention'],
  },
  {
    name: 'Seasonal Inventory Adjustment',
    description: 'Create PO for seasonal items based on demand forecast',
    trigger: {
      event: 'inventory.updated',
      conditions: [
        { field: 'isSeasonal', operator: 'eq', value: true },
        { field: 'seasonStartDays', operator: 'lte', value: 30 },
      ],
    },
    action: {
      type: 'create_po',
      config: {
        threshold: 20,
        autoApprove: true,
        quantityMultiplier: 1.5,
      },
    },
    priority: 10,
    tags: ['inventory', 'seasonal', 'purchasing'],
  },
];

/**
 * Seed inventory rules to the database
 */
export async function seedInventoryRules(): Promise<void> {
  try {
    logger.info('Seeding inventory rules...');

    for (const ruleDef of inventoryRules) {
      const existingRule = await Rule.findOne({ name: ruleDef.name });

      if (existingRule) {
        logger.debug('Inventory rule already exists', { ruleName: ruleDef.name });
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
          category: 'inventory',
        },
      });

      await rule.save();
      logger.info('Inventory rule seeded', { ruleName: ruleDef.name });
    }

    logger.info('Inventory rules seeding completed', {
      totalRules: inventoryRules.length,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error seeding inventory rules', { error: errorMessage });
    throw error;
  }
}

/**
 * Get all inventory rule definitions
 */
export function getInventoryRuleDefinitions(): InventoryRuleDefinition[] {
  return [...inventoryRules];
}

export default inventoryRules;
