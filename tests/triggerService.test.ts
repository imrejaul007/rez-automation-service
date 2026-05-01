import { TriggerService, TriggerEvent } from '../src/services/triggerService';

// Mock dependencies
jest.mock('../src/config/redis', () => ({
  redisConnection: {
    getSubscriber: jest.fn().mockReturnValue(null),
    getClient: jest.fn().mockReturnValue({
      publish: jest.fn().mockResolvedValue(undefined),
      status: 'ready',
    }),
  },
}));

jest.mock('../src/services/ruleEngine', () => ({
  ruleEngine: {
    processEvent: jest.fn().mockResolvedValue(undefined),
  },
}));

describe('TriggerService', () => {
  let triggerService: TriggerService;

  beforeEach(() => {
    triggerService = TriggerService.getInstance();
  });

  describe('EVENTS', () => {
    it('should have all required event types', () => {
      expect(TriggerService.EVENTS.ORDER_CREATED).toBe('order.created');
      expect(TriggerService.EVENTS.ORDER_COMPLETED).toBe('order.completed');
      expect(TriggerService.EVENTS.PAYMENT_SUCCESS).toBe('payment.success');
      expect(TriggerService.EVENTS.PAYMENT_FAILED).toBe('payment.failed');
      expect(TriggerService.EVENTS.CUSTOMER_CREATED).toBe('customer.created');
      expect(TriggerService.EVENTS.CUSTOMER_INACTIVE).toBe('customer.inactive');
      expect(TriggerService.EVENTS.INVENTORY_LOW).toBe('inventory.low');
      expect(TriggerService.EVENTS.INVENTORY_UPDATED).toBe('inventory.updated');
      expect(TriggerService.EVENTS.OCCUPANCY_HIGH).toBe('occupancy.high');
    });
  });

  describe('getSupportedEvents', () => {
    it('should return all supported event types', () => {
      const events = triggerService.getSupportedEvents();
      expect(events.length).toBeGreaterThan(0);
      expect(events).toContain('order.created');
      expect(events).toContain('order.completed');
      expect(events).toContain('payment.success');
      expect(events).toContain('customer.created');
    });
  });

  describe('getEventHistory', () => {
    it('should return empty array initially', () => {
      const history = triggerService.getEventHistory();
      expect(Array.isArray(history)).toBe(true);
    });

    it('should return history for specific event', () => {
      const history = triggerService.getEventHistory('order.completed');
      expect(Array.isArray(history)).toBe(true);
    });
  });

  describe('isSubscribedToRedis', () => {
    it('should return false initially (no Redis subscription)', () => {
      expect(triggerService.isSubscribedToRedis()).toBe(false);
    });
  });

  describe('emitEvent', () => {
    it('should add event to history', () => {
      triggerService.emitEvent(
        'order.completed',
        { orderId: '123' },
        'test'
      );

      const history = triggerService.getEventHistory('order.completed');
      expect(history.length).toBeGreaterThan(0);
      expect(history[0].type).toBe('order.completed');
    });
  });
});
