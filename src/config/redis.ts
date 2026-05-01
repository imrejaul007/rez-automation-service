import IORedis, { RedisOptions } from 'ioredis';
import { config } from './env';
import logger from '../utils/logger';

type Redis = IORedis;

class RedisConnection {
  private static instance: RedisConnection;
  private client: IORedis | null = null;
  private subscriber: IORedis | null = null;
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

      this.client = new IORedis(options);
      this.subscriber = new IORedis(options);

      this.client.on('connect', () => {
        logger.info('Redis client connected');
      });

      this.client.on('ready', () => {
        logger.info('Redis client ready');
        this.isConnected = true;
      });

      this.client.on('error', (err) => {
        logger.error('Redis client error', { error: err.message });
      });

      this.client.on('close', () => {
        logger.warn('Redis connection closed');
        this.isConnected = false;
      });

      this.client.on('reconnecting', () => {
        logger.info('Redis reconnecting...');
      });

      // Wait for connection to be ready
      await new Promise<void>((resolve, reject) => {
        if (!this.client) {
          reject(new Error('Redis client not initialized'));
          return;
        }

        this.client.once('ready', () => {
          this.isConnected = true;
          resolve();
        });

        this.client.once('error', (err) => {
          reject(err);
        });
      });

      logger.info('Redis connected successfully');

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to connect to Redis', { error: errorMessage });
      throw error;
    }
  }

  public async disconnect(): Promise<void> {
    if (!this.isConnected && !this.client) {
      logger.info('Redis is already disconnected');
      return;
    }

    try {
      if (this.subscriber) {
        await this.subscriber.quit();
        this.subscriber = null;
      }

      if (this.client) {
        await this.client.quit();
        this.client = null;
      }

      this.isConnected = false;
      logger.info('Redis disconnected successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error disconnecting from Redis', { error: errorMessage });
      throw error;
    }
  }

  public getClient(): Redis | null {
    return this.client;
  }

  public getSubscriber(): Redis | null {
    return this.subscriber;
  }

  public isHealthy(): boolean {
    return this.isConnected && this.client?.status === 'ready';
  }

  // Helper methods for common operations
  public async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (!this.client) {
      throw new Error('Redis client not connected');
    }

    const fullKey = `${config.redis.keyPrefix}${key}`;
    if (ttlSeconds) {
      await this.client.setex(fullKey, ttlSeconds, value);
    } else {
      await this.client.set(fullKey, value);
    }
  }

  public async get(key: string): Promise<string | null> {
    if (!this.client) {
      throw new Error('Redis client not connected');
    }

    const fullKey = `${config.redis.keyPrefix}${key}`;
    return await this.client.get(fullKey);
  }

  public async del(key: string): Promise<void> {
    if (!this.client) {
      throw new Error('Redis client not connected');
    }

    const fullKey = `${config.redis.keyPrefix}${key}`;
    await this.client.del(fullKey);
  }

  public async publish(channel: string, message: string): Promise<void> {
    if (!this.client) {
      throw new Error('Redis client not connected');
    }

    await this.client.publish(channel, message);
  }

  public async lpush(key: string, value: string): Promise<void> {
    if (!this.client) {
      throw new Error('Redis client not connected');
    }

    const fullKey = `${config.redis.keyPrefix}${key}`;
    await this.client.lpush(fullKey, value);
  }

  public async rpop(key: string): Promise<string | null> {
    if (!this.client) {
      throw new Error('Redis client not connected');
    }

    const fullKey = `${config.redis.keyPrefix}${key}`;
    return await this.client.rpop(fullKey);
  }
}

export const redisConnection = RedisConnection.getInstance();
export default redisConnection;
