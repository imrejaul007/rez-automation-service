import { RuleEngine, EventData, RuleMatch } from '../src/services/ruleEngine';

// Mock dependencies
jest.mock('../src/models/Rule');
jest.mock('../src/models/AutomationLog');
jest.mock('../src/config/env', () => ({
  config: {
    worker: {
      concurrency: 5,
    },
  },
}));

describe('RuleEngine', () => {
  let ruleEngine: RuleEngine;

  beforeEach(() => {
    ruleEngine = RuleEngine.getInstance();
  });

  describe('evaluateConditions', () => {
    it('should return true for empty conditions', () => {
      const result = ruleEngine.evaluateConditions([], { field: 'value' });
      expect(result.passed).toBe(true);
    });

    it('should evaluate equals condition', () => {
      const conditions = [
        { field: 'status', operator: 'eq', value: 'active' },
      ];
      const data = { status: 'active' };
      const result = ruleEngine.evaluateConditions(conditions, data);
      expect(result.passed).toBe(true);
    });

    it('should fail equals condition with mismatched value', () => {
      const conditions = [
        { field: 'status', operator: 'eq', value: 'active' },
      ];
      const data = { status: 'inactive' };
      const result = ruleEngine.evaluateConditions(conditions, data);
      expect(result.passed).toBe(false);
    });

    it('should evaluate greater than condition', () => {
      const conditions = [
        { field: 'count', operator: 'gt', value: 10 },
      ];
      const data = { count: 15 };
      const result = ruleEngine.evaluateConditions(conditions, data);
      expect(result.passed).toBe(true);
    });

    it('should evaluate less than condition', () => {
      const conditions = [
        { field: 'count', operator: 'lt', value: 10 },
      ];
      const data = { count: 5 };
      const result = ruleEngine.evaluateConditions(conditions, data);
      expect(result.passed).toBe(true);
    });

    it('should evaluate in array condition', () => {
      const conditions = [
        { field: 'status', operator: 'in', value: ['pending', 'active'] },
      ];
      const data = { status: 'pending' };
      const result = ruleEngine.evaluateConditions(conditions, data);
      expect(result.passed).toBe(true);
    });

    it('should evaluate contains condition for strings', () => {
      const conditions = [
        { field: 'name', operator: 'contains', value: 'John' },
      ];
      const data = { name: 'John Doe' };
      const result = ruleEngine.evaluateConditions(conditions, data);
      expect(result.passed).toBe(true);
    });

    it('should evaluate exists condition', () => {
      const conditions = [
        { field: 'email', operator: 'exists', value: true },
      ];
      const data = { email: 'test@example.com' };
      const result = ruleEngine.evaluateConditions(conditions, data);
      expect(result.passed).toBe(true);
    });

    it('should evaluate nested AND conditions', () => {
      const conditions = [
        {
          conditions: [
            { field: 'status', operator: 'eq', value: 'active' },
            { field: 'count', operator: 'gt', value: 5 },
          ],
          logic: 'and',
        },
      ];
      const data = { status: 'active', count: 10 };
      const result = ruleEngine.evaluateConditions(conditions, data);
      expect(result.passed).toBe(true);
    });

    it('should evaluate nested OR conditions', () => {
      const conditions = [
        {
          conditions: [
            { field: 'status', operator: 'eq', value: 'active' },
            { field: 'status', operator: 'eq', value: 'pending' },
          ],
          logic: 'or',
        },
      ];
      const data = { status: 'pending' };
      const result = ruleEngine.evaluateConditions(conditions, data);
      expect(result.passed).toBe(true);
    });

    it('should handle nested field access with dot notation', () => {
      const conditions = [
        { field: 'user.profile.name', operator: 'eq', value: 'John' },
      ];
      const data = { user: { profile: { name: 'John' } } };
      const result = ruleEngine.evaluateConditions(conditions, data);
      expect(result.passed).toBe(true);
    });
  });

  describe('Queue Management', () => {
    it('should queue events', () => {
      const eventData: EventData = {
        event: 'order.completed',
        data: { orderId: '123' },
      };

      ruleEngine.queueEvent(eventData);
      expect(ruleEngine.getQueueLength()).toBe(1);
    });

    it('should handle multiple queued events', () => {
      const events: EventData[] = [
        { event: 'order.completed', data: { orderId: '1' } },
        { event: 'order.created', data: { orderId: '2' } },
        { event: 'customer.inactive', data: { customerId: '3' } },
      ];

      events.forEach((e) => ruleEngine.queueEvent(e));
      expect(ruleEngine.getQueueLength()).toBe(3);
    });
  });
});
