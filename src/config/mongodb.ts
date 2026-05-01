import mongoose, { Mongoose, ConnectionOptions } from 'mongoose';
import { config } from './env';
import logger from '../utils/logger';

class MongoDBConnection {
  private static instance: MongoDBConnection;
  private connection: Mongoose | null = null;
  private isConnected: boolean = false;

  private constructor() {}

  public static getInstance(): MongoDBConnection {
    if (!MongoDBConnection.instance) {
      MongoDBConnection.instance = new MongoDBConnection();
    }
    return MongoDBConnection.instance;
  }

  public async connect(): Promise<void> {
    if (this.isConnected) {
      logger.info('MongoDB is already connected');
      return;
    }

    try {
      const options: ConnectionOptions = {
        maxPoolSize: 10,
        minPoolSize: 2,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        family: 4,
        retryWrites: true,
        w: 'majority',
      };

      logger.info('Connecting to MongoDB...', {
        host: config.mongodb.uri.replace(/\/\/.*@/, '//***@'),
        database: 'rez-automation'
      });

      this.connection = await mongoose.connect(config.mongodb.uri, options);
      this.isConnected = true;

      mongoose.connection.on('connected', () => {
        logger.info('MongoDB connected successfully');
      });

      mongoose.connection.on('error', (err) => {
        logger.error('MongoDB connection error', { error: err.message });
      });

      mongoose.connection.on('disconnected', () => {
        logger.warn('MongoDB disconnected');
        this.isConnected = false;
      });

      mongoose.connection.on('reconnected', () => {
        logger.info('MongoDB reconnected');
        this.isConnected = true;
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to connect to MongoDB', { error: errorMessage });
      throw error;
    }
  }

  public async disconnect(): Promise<void> {
    if (!this.isConnected) {
      logger.info('MongoDB is already disconnected');
      return;
    }

    try {
      await mongoose.disconnect();
      this.isConnected = false;
      this.connection = null;
      logger.info('MongoDB disconnected successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error disconnecting from MongoDB', { error: errorMessage });
      throw error;
    }
  }

  public isHealthy(): boolean {
    return this.isConnected && mongoose.connection.readyState === 1;
  }

  public getConnection(): Mongoose | null {
    return this.connection;
  }
}

export const mongoDBConnection = MongoDBConnection.getInstance();
export default mongoDBConnection;
