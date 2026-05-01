/**
 * Sentry Configuration for rez-automation-service
 * Event-driven rule automation service
 */
import * as Sentry from '@sentry/node';

const SENTRY_DSN = process.env.SENTRY_DSN;
const ENVIRONMENT = process.env.NODE_ENV || 'development';
const RELEASE = process.env.GIT_SHA || process.env.npm_package_version || '1.0.0';

export function initSentry(): void {
  if (!SENTRY_DSN) {
    console.warn('[Sentry] SENTRY_DSN not set - error tracking disabled');
    return;
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: ENVIRONMENT,
    release: RELEASE,

    // Sample rates
    tracesSampleRate: ENVIRONMENT === 'production' ? 0.1 : 1.0,
    profilesSampleRate: ENVIRONMENT === 'production' ? 0.1 : 1.0,

    // Enable in development
    debug: ENVIRONMENT !== 'production',

    // Enable HTTP tracing
    integrations: [
      // Enable HTTP tracing
      new Sentry.Integrations.Http({ tracing: true }),
      // Enable Express tracing
      ...Sentry.autoDiscoverNodePerformanceMonitoringIntegrations(),
    ],

    // Ignore common errors
    ignoreErrors: [
      // User cancelled
      'AbortError',
      'User aborted',
      // Network errors
      'ECONNRESET',
      'ETIMEDOUT',
      'Network request failed',
      // Validation errors
      'ValidationError',
      'ZodError',
    ],

    // Deny URLs
    denyUrls: [
      /localhost/,
      /127\.0\.0\.1/,
    ],

    // Attach stack traces
    attachStacktrace: true,

    // Normalize paths
    normalizeDepth: 5,
  });

  console.log('[Sentry] Initialized', { environment: ENVIRONMENT, release: RELEASE });
}

/**
 * Set user context for Sentry
 */
export function setUserContext(userId: string, metadata?: Record<string, unknown>): void {
  Sentry.setUser({ id: userId, ...metadata });
}

/**
 * Capture custom event
 */
export function captureEvent(name: string, data?: Record<string, unknown>): void {
  Sentry.captureEvent({
    type: 'transaction',
    transaction: name,
    contexts: data ? { [name]: data } : undefined,
  });
}

/**
 * Capture error with context
 */
export function captureError(error: Error, context?: Record<string, unknown>): void {
  if (context) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Sentry.captureException(error, { contexts: context as any });
  } else {
    Sentry.captureException(error);
  }
}

/**
 * Add breadcrumb for debugging
 */
export function addBreadcrumb(message: string, data?: Record<string, unknown>): void {
  Sentry.addBreadcrumb({
    category: 'automation',
    message,
    data,
    level: 'info',
  });
}

export { Sentry };
