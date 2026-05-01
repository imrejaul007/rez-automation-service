import { customerRules, seedCustomerRules, CustomerRuleDefinition } from '../src/rules/customerRules';
import { inventoryRules, seedInventoryRules } from '../src/rules/inventoryRules';
import { pricingRules, seedPricingRules } from '../src/rules/pricingRules';
import { loyaltyRules, seedLoyaltyRules } from '../src/rules/loyaltyRules';

// Mock Rule model
jest.mock('../src/models/Rule', () => {
  const mockRule = {
    findOne: jest.fn().mockResolvedValue(null),
    save: jest.fn().mockResolvedValue(true),
  };
  return {
    Rule: mockRule,
  };
});

// Mock logger
jest.mock('../src/utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('Rules Definitions', () => {
  describe('Customer Rules', () => {
    it('should have at least one customer rule', () => {
      expect(customerRules.length).toBeGreaterThan(0);
    });

    it('should have valid rule structure', () => {
      customerRules.forEach((rule: CustomerRuleDefinition) => {
        expect(rule.name).toBeDefined();
        expect(rule.description).toBeDefined();
        expect(rule.trigger).toBeDefined();
        expect(rule.trigger.event).toBeDefined();
        expect(rule.action).toBeDefined();
        expect(rule.action.type).toBeDefined();
        expect(rule.action.config).toBeDefined();
      });
    });

    it('should have valid trigger events', () => {
      const validEvents = ['customer.created', 'customer.updated', 'customer.inactive'];
      customerRules.forEach((rule: CustomerRuleDefinition) => {
        expect(validEvents).toContain(rule.trigger.event);
      });
    });

    it('should have valid action types', () => {
      const validTypes = ['send_offer', 'notify', 'webhook', 'email', 'sms'];
      customerRules.forEach((rule: CustomerRuleDefinition) => {
        expect(validTypes).toContain(rule.action.type);
      });
    });
  });

  describe('Inventory Rules', () => {
    it('should have at least one inventory rule', () => {
      expect(inventoryRules.length).toBeGreaterThan(0);
    });

    it('should have valid trigger events', () => {
      const validEvents = ['inventory.low', 'inventory.updated', 'inventory.out_of_stock'];
      inventoryRules.forEach((rule) => {
        expect(validEvents).toContain(rule.trigger.event);
      });
    });

    it('should have valid action types', () => {
      const validTypes = ['create_po', 'notify'];
      inventoryRules.forEach((rule) => {
        expect(validTypes).toContain(rule.action.type);
      });
    });
  });

  describe('Pricing Rules', () => {
    it('should have at least one pricing rule', () => {
      expect(pricingRules.length).toBeGreaterThan(0);
    });

    it('should have valid trigger events', () => {
      const validEvents = ['occupancy.high', 'occupancy.low', 'occupancy.normal'];
      pricingRules.forEach((rule) => {
        expect(validEvents).toContain(rule.trigger.event);
      });
    });

    it('should have valid action types', () => {
      const validTypes = ['update_price', 'send_offer'];
      pricingRules.forEach((rule) => {
        expect(validTypes).toContain(rule.action.type);
      });
    });
  });

  describe('Loyalty Rules', () => {
    it('should have at least one loyalty rule', () => {
      expect(loyaltyRules.length).toBeGreaterThan(0);
    });

    it('should have valid trigger events', () => {
      const validEvents = ['order.completed', 'order.created', 'customer.updated'];
      loyaltyRules.forEach((rule) => {
        expect(validEvents).toContain(rule.trigger.event);
      });
    });

    it('should have valid action types', () => {
      const validTypes = ['send_offer', 'notify'];
      loyaltyRules.forEach((rule) => {
        expect(validTypes).toContain(rule.action.type);
      });
    });
  });

  describe('seedCustomerRules', () => {
    it('should be a function', () => {
      expect(typeof seedCustomerRules).toBe('function');
    });
  });

  describe('seedInventoryRules', () => {
    it('should be a function', () => {
      expect(typeof seedInventoryRules).toBe('function');
    });
  });

  describe('seedPricingRules', () => {
    it('should be a function', () => {
      expect(typeof seedPricingRules).toBe('function');
    });
  });

  describe('seedLoyaltyRules', () => {
    it('should be a function', () => {
      expect(typeof seedLoyaltyRules).toBe('function');
    });
  });
});
