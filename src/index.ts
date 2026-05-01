import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';

import { config } from './config/env';
import { mongoDBConnection } from './config/mongodb';
import { redisConnection } from './config/redis';
import { initSentry } from './config/sentry';
import automationRoutes from './routes/automation.routes';
import { triggerService } from './services/triggerService';
import { ruleWorker } from './workers/ruleWorker';
import { seedCustomerRules } from './rules/customerRules';
import { seedInventoryRules } from './rules/inventoryRules';
import { seedPricingRules } from './rules/pricingRules';
import { seedLoyaltyRules } from './rules/loyaltyRules';
import logger from './utils/logger';

// Initialize Sentry error tracking
initSentry();

class ApplicationServer {
  private app: Application;
  private server: ReturnType<Application['listen']> | null = null;

  constructor() {
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  /**
   * Setup Express middleware
   */
  private setupMiddleware(): void {
    // Security middleware
    this.app.use(helmet());

    // CORS
    this.app.use(cors({
      origin: '*',
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    }));

    // Compression
    this.app.use(compression());

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request logging
    this.app.use((req: Request, _res: Response, next: NextFunction) => {
      logger.debug('Incoming request', {
        method: req.method,
        path: req.path,
        query: req.query,
      });
      next();
    });
  }

  /**
   * Setup routes
   */
  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (_req: Request, res: Response) => {
      res.json({
        status: 'healthy',
        service: 'rez-automation-service',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      });
    });

    // API routes
    this.app.use('/api', automationRoutes);

    // 404 handler
    this.app.use((_req: Request, res: Response) => {
      res.status(404).json({
        error: 'Not Found',
        message: 'The requested resource was not found',
      });
    });
  }

  /**
   * Setup error handling
   */
  private setupErrorHandling(): void {
    // Global error handler
    this.app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
      logger.error('Unhandled error', {
        error: err.message,
        stack: err.stack,
      });

      res.status(500).json({
        error: 'Internal Server Error',
        message: config.nodeEnv === 'development' ? err.message : 'An error occurred',
      });
    });
  }

  /**
   * Initialize connections and start server
   */
  public async start(): Promise<void> {
    try {
      logger.info('Starting ReZ Automation Service...');

      // Connect to MongoDB
      await mongoDBConnection.connect();

      // Connect to Redis
      await redisConnection.connect();

      // Initialize trigger service
      await triggerService.initialize();

      // Seed default rules
      await this.seedDefaultRules();

      // Start rule worker
      await ruleWorker.start();

      // Start HTTP server
      this.server = this.app.listen(config.port, () => {
        logger.info(`Server started on port ${config.port}`, {
          nodeEnv: config.nodeEnv,
          port: config.port,
        });
      });

      // Graceful shutdown handling
      this.setupGracefulShutdown();

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to start server', { error: errorMessage });
      throw error;
    }
  }

  /**
   * Seed default rules
   */
  private async seedDefaultRules(): Promise<void> {
    try {
      logger.info('Seeding default rules...');

      await Promise.all([
        seedCustomerRules(),
        seedInventoryRules(),
        seedPricingRules(),
        seedLoyaltyRules(),
      ]);

      logger.info('Default rules seeded successfully');

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error seeding default rules', { error: errorMessage });
      // Don't throw - seeding failure shouldn't prevent startup
    }
  }

  /**
   * Setup graceful shutdown
   */
  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, starting graceful shutdown...`);

      try {
        // Stop accepting new connections
        if (this.server) {
          await new Promise<void>((resolve) => {
            this.server!.close(() => {
              logger.info('HTTP server closed');
              resolve();
            });
          });
        }

        // Stop rule worker
        await ruleWorker.stop();

        // Cleanup trigger service
        await triggerService.cleanup();

        // Disconnect from Redis
        await redisConnection.disconnect();

        // Disconnect from MongoDB
        await mongoDBConnection.disconnect();

        logger.info('Graceful shutdown completed');
        process.exit(0);

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Error during shutdown', { error: errorMessage });
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception', { error: error.message, stack: error.stack });
      shutdown('uncaughtException');
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason) => {
      logger.error('Unhandled rejection', { reason });
      shutdown('unhandledRejection');
    });
  }

  /**
   * Stop the server
   */
  public async stop(): Promise<void> {
    if (!this.server) {
      logger.warn('Server is not running');
      return;
    }

    return new Promise((resolve, reject) => {
      this.server!.close((err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Get Express app instance (for testing)
   */
  public getApp(): Application {
    return this.app;
  }
}

// Create and start application
const app = new ApplicationServer();

// Start the server
app.start().catch((error) => {
  logger.error('Failed to start application', { error: error.message });
  process.exit(1);
});

export default app;
