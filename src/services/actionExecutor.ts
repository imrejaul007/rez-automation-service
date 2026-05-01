import { IAction, IActionConfig } from '../models/Rule';
import logger from '../utils/logger';
import axios from 'axios';

export interface ActionResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
  skipped?: boolean;
  reason?: string;
}

export interface ActionContext {
  [key: string]: unknown;
}

class ActionExecutor {
  private static instance: ActionExecutor;
  private actionHandlers: Map<string, (config: IActionConfig, context: ActionContext) => Promise<ActionResult>>;

  private constructor() {
    this.actionHandlers = new Map();
    this.registerDefaultHandlers();
  }

  public static getInstance(): ActionExecutor {
    if (!ActionExecutor.instance) {
      ActionExecutor.instance = new ActionExecutor();
    }
    return ActionExecutor.instance;
  }

  /**
   * Register default action handlers
   */
  private registerDefaultHandlers(): void {
    this.registerHandler('send_offer', this.handleSendOffer.bind(this));
    this.registerHandler('create_po', this.handleCreatePO.bind(this));
    this.registerHandler('update_price', this.handleUpdatePrice.bind(this));
    this.registerHandler('notify', this.handleNotify.bind(this));
    this.registerHandler('webhook', this.handleWebhook.bind(this));
    this.registerHandler('email', this.handleEmail.bind(this));
    this.registerHandler('sms', this.handleSMS.bind(this));
  }

  /**
   * Register a custom action handler
   */
  public registerHandler(
    actionType: string,
    handler: (config: IActionConfig, context: ActionContext) => Promise<ActionResult>
  ): void {
    this.actionHandlers.set(actionType, handler);
    logger.info('Registered action handler', { actionType });
  }

  /**
   * Execute an action with the given context
   */
  public async execute(
    action: IAction,
    context: ActionContext
  ): Promise<ActionResult> {
    const { type, config } = action;

    logger.info('Executing action', { type, config });

    const handler = this.actionHandlers.get(type);

    if (!handler) {
      logger.error('Unknown action type', { type });
      return {
        success: false,
        error: `Unknown action type: ${type}`,
      };
    }

    try {
      return await handler(config, context);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Action execution error', { type, error: errorMessage });
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Send offer action handler
   */
  private async handleSendOffer(
    config: IActionConfig,
    context: ActionContext
  ): Promise<ActionResult> {
    const { discount, offerType, templateId, channels } = config;

    logger.info('Sending offer', {
      discount,
      offerType,
      customerId: context.customerId,
    });

    // In production, this would integrate with marketing/loyalty service
    const offerData = {
      customerId: context.customerId,
      discount: Number(discount) || 10,
      offerType: offerType || 'discount',
      templateId: templateId || 'default',
      channels: channels || ['email', 'sms'],
      createdAt: new Date().toISOString(),
      context: {
        orderId: context.orderId,
        totalAmount: context.totalAmount,
      },
    };

    // Simulate sending offer
    logger.info('Offer created successfully', { offerData });

    return {
      success: true,
      data: {
        offerId: `offer_${Date.now()}`,
        ...offerData,
      },
    };
  }

  /**
   * Create purchase order action handler
   */
  private async handleCreatePO(
    config: IActionConfig,
    context: ActionContext
  ): Promise<ActionResult> {
    const { threshold, supplierId, autoApprove } = config;

    logger.info('Creating purchase order', {
      threshold,
      supplierId,
      itemId: context.itemId,
    });

    const poData = {
      supplierId: supplierId || 'default_supplier',
      items: [
        {
          itemId: context.itemId,
          itemName: context.itemName,
          quantity: context.currentStock || threshold || 10,
          unitPrice: context.unitPrice || 0,
        },
      ],
      threshold: Number(threshold) || 10,
      autoApprove: autoApprove === true,
      status: autoApprove === true ? 'approved' : 'pending',
      createdAt: new Date().toISOString(),
      triggeredBy: 'automation_low_inventory',
    };

    // Simulate PO creation
    logger.info('Purchase order created', { poData });

    return {
      success: true,
      data: {
        poId: `po_${Date.now()}`,
        ...poData,
      },
    };
  }

  /**
   * Update price action handler
   */
  private async handleUpdatePrice(
    config: IActionConfig,
    context: ActionContext
  ): Promise<ActionResult> {
    const { multiplier, strategy, maxPrice, minPrice } = config;

    logger.info('Updating price', {
      multiplier,
      itemId: context.itemId,
      currentPrice: context.currentPrice,
    });

    const currentPrice = Number(context.currentPrice) || 0;
    const priceMultiplier = Number(multiplier) || 1.2;
    let newPrice = currentPrice * priceMultiplier;

    // Apply min/max constraints
    if (minPrice && newPrice < Number(minPrice)) {
      newPrice = Number(minPrice);
    }
    if (maxPrice && newPrice > Number(maxPrice)) {
      newPrice = Number(maxPrice);
    }

    const priceUpdate = {
      itemId: context.itemId,
      itemName: context.itemName,
      previousPrice: currentPrice,
      newPrice: Math.round(newPrice * 100) / 100,
      multiplier: priceMultiplier,
      strategy: strategy || 'dynamic_pricing',
      updatedAt: new Date().toISOString(),
    };

    // Simulate price update
    logger.info('Price updated', { priceUpdate });

    return {
      success: true,
      data: priceUpdate,
    };
  }

  /**
   * Notify action handler
   */
  private async handleNotify(
    config: IActionConfig,
    context: ActionContext
  ): Promise<ActionResult> {
    const { template, channels, subject, message } = config;

    logger.info('Sending notification', {
      template,
      channels,
      customerId: context.customerId,
    });

    const notificationData = {
      customerId: context.customerId,
      template: template || 'default',
      channels: channels || ['email'],
      subject: subject || 'Notification from ReZ',
      message: message || this.interpolateMessage(template as string, context),
      data: context,
      sentAt: new Date().toISOString(),
    };

    // Simulate sending notification
    logger.info('Notification sent', { notificationData });

    return {
      success: true,
      data: {
        notificationId: `notif_${Date.now()}`,
        ...notificationData,
      },
    };
  }

  /**
   * Webhook action handler
   */
  private async handleWebhook(
    config: IActionConfig,
    context: ActionContext
  ): Promise<ActionResult> {
    const { url, method, headers, timeout } = config;

    if (!url) {
      return {
        success: false,
        error: 'Webhook URL is required',
      };
    }

    logger.info('Calling webhook', { url, method });

    try {
      const response = await axios({
        method: (method as string) || 'POST',
        url: url as string,
        data: context,
        headers: headers as Record<string, string> || {},
        timeout: Number(timeout) || 30000,
      });

      return {
        success: true,
        data: {
          statusCode: response.status,
          response: response.data,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Email action handler
   */
  private async handleEmail(
    config: IActionConfig,
    context: ActionContext
  ): Promise<ActionResult> {
    const { to, subject, template, variables } = config;

    logger.info('Sending email', { to, subject, template });

    const emailData = {
      to: to || context.customerEmail,
      subject: subject || 'Message from ReZ',
      template: template || 'default',
      variables: variables || context,
      sentAt: new Date().toISOString(),
    };

    // Simulate email sending
    logger.info('Email sent', { emailData });

    return {
      success: true,
      data: {
        emailId: `email_${Date.now()}`,
        ...emailData,
      },
    };
  }

  /**
   * SMS action handler
   */
  private async handleSMS(
    config: IActionConfig,
    context: ActionContext
  ): Promise<ActionResult> {
    const { to, message, template } = config;

    logger.info('Sending SMS', { to, template });

    const smsData = {
      to: to || context.customerPhone,
      message: message || this.interpolateMessage(template as string, context),
      template: template || 'default',
      sentAt: new Date().toISOString(),
    };

    // Simulate SMS sending
    logger.info('SMS sent', { smsData });

    return {
      success: true,
      data: {
        smsId: `sms_${Date.now()}`,
        ...smsData,
      },
    };
  }

  /**
   * Interpolate message template with context variables
   */
  private interpolateMessage(
    template: string,
    context: ActionContext
  ): string {
    let message = template;

    // Common template replacements
    const replacements: Record<string, string | number | undefined> = {
      '{{customerName}}': context.customerName as string,
      '{{orderId}}': context.orderId as string,
      '{{totalAmount}}': context.totalAmount as number,
      '{{itemName}}': context.itemName as string,
      '{{discount}}': context.discount as number,
    };

    for (const [key, value] of Object.entries(replacements)) {
      if (value !== undefined) {
        message = message.replace(new RegExp(key, 'g'), String(value));
      }
    }

    return message;
  }

  /**
   * Get all registered action types
   */
  public getRegisteredActionTypes(): string[] {
    return Array.from(this.actionHandlers.keys());
  }
}

export const actionExecutor = ActionExecutor.getInstance();
export default actionExecutor;
