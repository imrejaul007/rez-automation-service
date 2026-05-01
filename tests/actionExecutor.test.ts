import { ActionExecutor, ActionResult } from '../src/services/actionExecutor';

describe('ActionExecutor', () => {
  let actionExecutor: ActionExecutor;

  beforeEach(() => {
    actionExecutor = ActionExecutor.getInstance();
  });

  describe('getRegisteredActionTypes', () => {
    it('should return all registered action types', () => {
      const types = actionExecutor.getRegisteredActionTypes();
      expect(types).toContain('send_offer');
      expect(types).toContain('create_po');
      expect(types).toContain('update_price');
      expect(types).toContain('notify');
      expect(types).toContain('webhook');
      expect(types).toContain('email');
      expect(types).toContain('sms');
    });
  });

  describe('execute', () => {
    it('should return error for unknown action type', async () => {
      const result = await actionExecutor.execute(
        { type: 'unknown_action', config: {} },
        {}
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown action type');
    });

    it('should execute send_offer action', async () => {
      const result = await actionExecutor.execute(
        {
          type: 'send_offer',
          config: { discount: 10, offerType: 'test' },
        },
        { customerId: 'cust_123' }
      );
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.customerId).toBe('cust_123');
      expect(result.data?.discount).toBe(10);
    });

    it('should execute create_po action', async () => {
      const result = await actionExecutor.execute(
        {
          type: 'create_po',
          config: { threshold: 10 },
        },
        { itemId: 'item_123', itemName: 'Test Item' }
      );
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.poId).toBeDefined();
    });

    it('should execute update_price action', async () => {
      const result = await actionExecutor.execute(
        {
          type: 'update_price',
          config: { multiplier: 1.2 },
        },
        { itemId: 'item_123', currentPrice: 100 }
      );
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.newPrice).toBe(120);
    });

    it('should apply min price constraint', async () => {
      const result = await actionExecutor.execute(
        {
          type: 'update_price',
          config: { multiplier: 0.5, minPrice: 80 },
        },
        { itemId: 'item_123', currentPrice: 100 }
      );
      expect(result.success).toBe(true);
      expect(result.data?.newPrice).toBe(80);
    });

    it('should apply max price constraint', async () => {
      const result = await actionExecutor.execute(
        {
          type: 'update_price',
          config: { multiplier: 2, maxPrice: 150 },
        },
        { itemId: 'item_123', currentPrice: 100 }
      );
      expect(result.success).toBe(true);
      expect(result.data?.newPrice).toBe(150);
    });

    it('should execute notify action', async () => {
      const result = await actionExecutor.execute(
        {
          type: 'notify',
          config: { template: 'followup', channels: ['email'] },
        },
        { customerId: 'cust_123', customerName: 'John' }
      );
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.notificationId).toBeDefined();
    });

    it('should execute email action', async () => {
      const result = await actionExecutor.execute(
        {
          type: 'email',
          config: { subject: 'Test Email' },
        },
        { customerEmail: 'test@example.com' }
      );
      expect(result.success).toBe(true);
      expect(result.data?.emailId).toBeDefined();
    });

    it('should execute sms action', async () => {
      const result = await actionExecutor.execute(
        {
          type: 'sms',
          config: { message: 'Test SMS' },
        },
        { customerPhone: '+1234567890' }
      );
      expect(result.success).toBe(true);
      expect(result.data?.smsId).toBeDefined();
    });
  });

  describe('registerHandler', () => {
    it('should register a custom action handler', async () => {
      const customHandler = jest.fn().mockResolvedValue({
        success: true,
        data: { custom: true },
      });

      actionExecutor.registerHandler('custom_action', customHandler);

      const types = actionExecutor.getRegisteredActionTypes();
      expect(types).toContain('custom_action');

      const result = await actionExecutor.execute(
        { type: 'custom_action', config: {} },
        {}
      );
      expect(customHandler).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });
  });
});
