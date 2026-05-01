import { EventEmitter } from 'events';
import { ruleEngine, EventData } from './ruleEngine';
import logger from '../utils/logger';
import { redisConnection } from '../config/redis';
import { config } from '../config/env';

export interface TriggerEvent {
  type: string;
  data: Record<string, unknown>;
  timestamp?: Date;
  source?: string;
}

class TriggerService extends EventEmitter {
  private static instance: TriggerService;
  private isSubscribed: boolean = false;
  private eventHistory: Map<string, TriggerEvent[]>;
  private maxHistorySize: number = 1000;

  // Supported event types
  public static readonly EVENTS = {
    // Order events
    ORDER_CREATED: 'order.created',
    ORDER_COMPLETED: 'order.completed',
    ORDER_CANCELLED: 'order.cancelled',
    ORDER_REFUNDED: 'order.refunded',

    // Payment events
    PAYMENT_SUCCESS: 'payment.success',
    PAYMENT_FAILED: 'payment.failed',
    PAYMENT_PENDING: 'payment.pending',

    // Customer events
    CUSTOMER_CREATED: 'customer.created',
    CUSTOMER_UPDATED: 'customer.updated',
    CUSTOMER_INACTIVE: 'customer.inactive',
    CUSTOMER_CHURNED: 'customer.churned',

    // Inventory events
    INVENTORY_LOW: 'inventory.low',
    INVENTORY_UPDATED: 'inventory.updated',
    INVENTORY_OUT_OF_STOCK: 'inventory.out_of_stock',

    // Reservation events
    RESERVATION_CREATED: 'reservation.created',
    RESERVATION_CONFIRMED: 'reservation.confirmed',
    RESERVATION_CANCELLED: 'reservation.cancelled',
    RESERVATION_NO_SHOW: 'reservation.no_show',

    // Occupancy events
    OCCUPANCY_HIGH: 'occupancy.high',
    OCCUPANCY_LOW: 'occupancy.low',
    OCCUPANCY_NORMAL: 'occupancy.normal',
  };

  private constructor() {
    super();
    this.eventHistory = new Map();
  }

  public static getInstance(): TriggerService {
    if (!TriggerService.instance) {
      TriggerService.instance = new TriggerService();
    }
    return TriggerService.instance;
  }

  /**
   * Initialize trigger service and subscribe to Redis channels
   */
  public async initialize(): Promise<void> {
    if (config.features.enableEventListener) {
      await this.subscribeToRedis();
      logger.info('Trigger service initialized');
    } else {
      logger.info('Trigger service initialized (event listener disabled)');
    }
  }

  /**
   * Subscribe to Redis pub/sub channels
   */
  private async subscribeToRedis(): Promise<void> {
    const subscriber = redisConnection.getSubscriber();

    if (!subscriber) {
      logger.warn('Redis subscriber not available, falling back to local events');
      this.setupLocalEventListeners();
      return;
    }

    try {
      // Subscribe to all event channels
      const channels = Object.values(TriggerService.EVENTS);

      await subscriber.subscribe(...channels);
      this.isSubscribed = true;

      subscriber.on('message', (channel: string, message: string) => {
        this.handleRedisMessage(channel, message);
      });

      logger.info('Subscribed to Redis channels', { channels });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to subscribe to Redis', { error: errorMessage });
      this.setupLocalEventListeners();
    }
  }

  /**
   * Setup local event listeners as fallback
   */
  private setupLocalEventListeners(): void {
    // Listen for local events
    Object.values(TriggerService.EVENTS).forEach((eventType) => {
      this.on(eventType, async (data: Record<string, unknown>) => {
        await this.processEvent(eventType, data);
      });
    });

    logger.info('Local event listeners configured');
  }

  /**
   * Handle Redis message
   */
  private async handleRedisMessage(channel: string, message: string): Promise<void> {
    try {
      const data = JSON.parse(message);
      await this.processEvent(channel, data);
    } catch (error) {
      logger.error('Failed to process Redis message', {
        channel,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Process an event through the rule engine
   */
  public async processEvent(
    eventType: string,
    data: Record<string, unknown>,
    options?: { source?: string; skipHistory?: boolean }
  ): Promise<void> {
    const eventData: EventData = {
      event: eventType,
      data,
      timestamp: new Date(),
      source: options?.source || 'trigger_service',
    };

    // Store in history if not skipped
    if (!options?.skipHistory) {
      this.addToHistory(eventType, eventData as unknown as TriggerEvent);
    }

    // Publish to Redis if connected
    await this.publishToRedis(eventType, data);

    // Process through rule engine
    await ruleEngine.processEvent(eventData);

    // Emit local event
    this.emit(eventType, data);
  }

  /**
   * Publish event to Redis
   */
  private async publishToRedis(
    eventType: string,
    data: Record<string, unknown>
  ): Promise<void> {
    try {
      const client = redisConnection.getClient();
      if (client && client.status === 'ready') {
        await client.publish(
          eventType,
          JSON.stringify({
            ...data,
            timestamp: new Date().toISOString(),
            publishedBy: 'trigger_service',
          })
        );
      }
    } catch (error) {
      logger.error('Failed to publish to Redis', {
        eventType,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Emit an event locally
   */
  public emitEvent(
    eventType: string,
    data: Record<string, unknown>,
    source?: string
  ): void {
    const event: TriggerEvent = {
      type: eventType,
      data,
      timestamp: new Date(),
      source,
    };

    this.addToHistory(eventType, event);

    // Emit locally
    this.emit(eventType, data);

    // Also trigger processing
    this.processEvent(eventType, data, { source, skipHistory: true });

    logger.debug('Event emitted', { eventType, source });
  }

  /**
   * Add event to history
   */
  private addToHistory(eventType: string, event: TriggerEvent): void {
    let history = this.eventHistory.get(eventType) || [];
    history.unshift(event);

    // Trim history to max size
    if (history.length > this.maxHistorySize) {
      history = history.slice(0, this.maxHistorySize);
    }

    this.eventHistory.set(eventType, history);
  }

  /**
   * Get event history for a specific event type
   */
  public getEventHistory(
    eventType?: string,
    limit: number = 100
  ): TriggerEvent[] {
    if (eventType) {
      return (this.eventHistory.get(eventType) || []).slice(0, limit);
    }

    // Return all events sorted by timestamp
    const allEvents: TriggerEvent[] = [];
    this.eventHistory.forEach((events) => {
      allEvents.push(...events);
    });

    return allEvents
      .sort((a, b) => {
        const dateA = a.timestamp?.getTime() || 0;
        const dateB = b.timestamp?.getTime() || 0;
        return dateB - dateA;
      })
      .slice(0, limit);
  }

  /**
   * Get supported event types
   */
  public getSupportedEvents(): string[] {
    return Object.values(TriggerService.EVENTS);
  }

  /**
   * Check if subscribed to Redis
   */
  public isSubscribedToRedis(): boolean {
    return this.isSubscribed;
  }

  /**
   * Cleanup resources
   */
  public async cleanup(): Promise<void> {
    const subscriber = redisConnection.getSubscriber();
    if (subscriber) {
      try {
        const channels = Object.values(TriggerService.EVENTS);
        await subscriber.unsubscribe(...channels);
        this.isSubscribed = false;
        logger.info('Unsubscribed from Redis channels');
      } catch (error) {
        logger.error('Error unsubscribing from Redis', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    this.eventHistory.clear();
    this.removeAllListeners();
  }
}

export const triggerService = TriggerService.getInstance();
export default triggerService;
