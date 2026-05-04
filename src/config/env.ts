import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

interface EnvConfig {
  port: number;
  nodeEnv: string;
  mongodb: {
    uri: string;
    user: string;
    password: string;
    authSource: string;
    replicaSet: string;
    ssl: boolean;
  };
  redis: {
    host: string;
    port: number;
    password: string;
    db: number;
    keyPrefix: string;
  };
  logging: {
    level: string;
    filePath: string;
  };
  worker: {
    concurrency: number;
    intervalMs: number;
  };
  event: {
    retryAttempts: number;
    retryDelayMs: number;
  };
  features: {
    enableScheduledRules: boolean;
    enableEventListener: boolean;
  };
}

function getEnvVar(key: string, defaultValue?: string): string {
  const value = process.env[key];
  if (value !== undefined) {
    return value;
  }
  if (defaultValue !== undefined) {
    return defaultValue;
  }
  throw new Error(`Required environment variable ${key} is not set`);
}

function getEnvNum(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Environment variable ${key} must be a valid number`);
  }
  return parsed;
}

function getEnvBool(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true';
}

function parseRedisUrl(url: string): { host: string; port: number; password: string; db: number } {
  try {
    const parsed = new URL(url);
    const password = parsed.password || '';
    const db = parsed.pathname ? parseInt(parsed.pathname.slice(1), 10) || 0 : 0;
    return {
      host: parsed.hostname,
      port: parseInt(parsed.port, 10) || 6379,
      password,
      db,
    };
  } catch {
    return { host: 'localhost', port: 6379, password: '', db: 0 };
  }
}

function buildMongoUri(): string {
  const mongoUriFromEnv = process.env.MONGODB_URI;

  // If MONGODB_URI is set, use it directly
  if (mongoUriFromEnv) {
    return mongoUriFromEnv;
  }

  // Fallback: build URI from individual components
  const user = getEnvVar('MONGODB_USER', '');
  const password = getEnvVar('MONGODB_PASSWORD', '');
  const host = getEnvVar('MONGODB_HOST', 'localhost:27017');
  const dbName = getEnvVar('MONGODB_DB', 'rez-automation');
  const authSource = getEnvVar('MONGODB_AUTH_SOURCE', 'admin');
  const replicaSet = getEnvVar('MONGODB_REPLICA_SET', '');
  const ssl = getEnvBool('MONGODB_SSL', false);

  let uri = 'mongodb://';
  if (user && password) {
    uri += `${encodeURIComponent(user)}:${encodeURIComponent(password)}@`;
  }
  uri += host;
  uri += `/${dbName}`;
  if (authSource) {
    uri += uri.includes('?') ? `&authSource=${authSource}` : `?authSource=${authSource}`;
  }
  if (replicaSet) {
    uri += uri.includes('?') ? `&replicaSet=${replicaSet}` : `?replicaSet=${replicaSet}`;
  }
  if (ssl) {
    uri += uri.includes('?') ? '&ssl=true' : '?ssl=true';
  }

  return uri;
}

export const config: EnvConfig = {
  port: getEnvNum('PORT', 3001),
  nodeEnv: getEnvVar('NODE_ENV', 'development'),

  mongodb: {
    uri: buildMongoUri(),
    user: process.env.MONGODB_USER || '',
    password: process.env.MONGODB_PASSWORD || '',
    authSource: getEnvVar('MONGODB_AUTH_SOURCE', 'admin'),
    replicaSet: getEnvVar('MONGODB_REPLICA_SET', ''),
    ssl: getEnvBool('MONGODB_SSL', false),
  },

  redis: (() => {
    const redisUrl = process.env.REDIS_URL;
    if (redisUrl) {
      const parsed = parseRedisUrl(redisUrl);
      return {
        host: parsed.host,
        port: parsed.port,
        password: parsed.password,
        db: parsed.db,
        keyPrefix: getEnvVar('REDIS_KEY_PREFIX', 'rez:automation:'),
      };
    }
    return {
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT, 10) : 6379,
      password: process.env.REDIS_PASSWORD || '',
      db: process.env.REDIS_DB ? parseInt(process.env.REDIS_DB, 10) : 0,
      keyPrefix: getEnvVar('REDIS_KEY_PREFIX', 'rez:automation:'),
    };
  })(),

  logging: {
    level: getEnvVar('LOG_LEVEL', 'info'),
    filePath: getEnvVar('LOG_FILE_PATH', './logs/automation.log'),
  },

  worker: {
    concurrency: getEnvNum('WORKER_CONCURRENCY', 5),
    intervalMs: getEnvNum('WORKER_INTERVAL_MS', 1000),
  },

  event: {
    retryAttempts: getEnvNum('EVENT_RETRY_ATTEMPTS', 3),
    retryDelayMs: getEnvNum('EVENT_RETRY_DELAY_MS', 1000),
  },

  features: {
    enableScheduledRules: getEnvBool('ENABLE_SCHEDULED_RULES', true),
    enableEventListener: getEnvBool('ENABLE_EVENT_LISTENER', true),
  },
};

export default config;
