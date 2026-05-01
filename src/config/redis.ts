import Redis, { RedisOptions } from 'ioredis';
import { config } from './env';
import logger from '../utils/logger';

class RedisConnection {
  private static instance: RedisConnection;
  private client: Redis | null = null;
  private subscriber: Redis | null = null;
  private isConnected: boolean = false;

  private constructor() {}

  public static getInstance(): RedisConnection {
    if (!RedisConnection.instance) {
      RedisConnection.instance = new RedisConnection();
    }
    return RedisConnection.instance;
  }

  private getConnectionOptions(): RedisOptions {
    const options: RedisOptions = {
      host: config.redis.host,
      port: config.redis.port,
      db: config.redis.db,
      keyPrefix: config.redis.keyPrefix,
      retryStrategy: (times: number) => {
        if (times > 10) {
          logger.error('Redis max retry attempts reached');
          return null;
        }
        const delay = Math.min(times * 100, 3000);
        return delay;
      },
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: false,
    };

    if (config.redis.password) {
      options.password = config.redis.password;
    }

    return options;
  }

  public async connect(): Promise<void> {
    if (this.isConnected) {
      logger.info('Redis is already connected');
      return;
    }

    try {
      const options = this.getConnectionOptions();

      logger.info('Connecting to Redis...', {
        host: config.redis.host,
        port: config.redis.port,
        db: config.redis.db,
      });

      this.client = new Redis(options);
      this.subscriber = new Redis(options);

      this.client.on('connect', () => {
        logger.info('Redis client connected');
      });

      this.client.on('ready', () => {
        logger.info('Redis client ready');
        this.isConnected = true;
      });

      this.client.on('error', (error) => {
        logger.error('Redis client error', { error: error.message });
      });

      this.client.on('close', () => {
        logger.warn('Redis connection closed');
        this.isConnected = false;
      });

      this.subscriber.on('error', (error) => {
        logger.error('Redis subscriber error', { error: error.message });
      });

      await this.client.connect();
      await this.subscriber.connect();

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to connect to Redis', { error: errorMessage });
      throw error;
    }
  }

  public async disconnect(): Promise<void> {
    try {
      if (this.client) {
        await this.client.quit();
        this.client = null;
      }
      if (this.subscriber) {
        await this.subscriber.quit();
        this.subscriber = null;
      }
      this.isConnected = false;
      logger.info('Redis disconnected');
    } catch (error) {
      logger.error('Error disconnecting from Redis', { error });
    }
  }

  public getClient(): Redis {
    if (!this.client) {
      this.client = new Redis(this.getConnectionOptions());
    }
    return this.client;
  }

  public getSubscriber(): Redis {
    if (!this.subscriber) {
      this.subscriber = new Redis(this.getConnectionOptions());
    }
    return this.subscriber;
  }

  public isReady(): boolean {
    return this.isConnected && this.client?.status === 'ready';
  }
}

export const redisConnection = RedisConnection.getInstance();
export const getRedisClient = () => redisConnection.getClient();
export const getRedisSubscriber = () => redisConnection.getSubscriber();
export const connectRedis = () => redisConnection.connect();
export const disconnectRedis = () => redisConnection.disconnect();
export const isRedisConnected = () => redisConnection.isReady();
