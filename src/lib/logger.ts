// lib/logger.ts
import pino from 'pino';

/**
 * Structured logger using Pino
 *
 * Provides better logging than console.log with:
 * - Structured JSON output (easy to parse/search)
 * - Log levels (debug, info, warn, error, fatal)
 * - Timestamps
 * - Context fields
 * - Pretty printing in development
 *
 * Usage:
 *   logger.info({ userId, action: 'login' }, 'User logged in');
 *   logger.error({ error, documentId }, 'Failed to process document');
 *   logger.warn({ threshold: 0.7, actual: 0.5 }, 'Low confidence result');
 */

const isDevelopment = process.env.NODE_ENV === 'development';

export const logger = pino({
  level: process.env.LOG_LEVEL || (isDevelopment ? 'info' : 'info'), // Changed from debug to info in dev to reduce noise

  // Disable pino-pretty transport in development to avoid worker thread issues with Next.js
  // Logs will be JSON format but functional
  transport: undefined,

  // Base context for all logs
  base: {
    env: process.env.NODE_ENV,
    app: 'patmosllm',
  },

  // Redact sensitive fields
  redact: {
    paths: [
      'password',
      'token',
      'apiKey',
      'secret',
      'authorization',
      '*.password',
      '*.token',
      '*.apiKey',
      '*.secret',
    ],
    censor: '[REDACTED]',
  },
});

/**
 * Create a child logger with additional context
 *
 * Usage:
 *   const userLogger = createLogger({ userId: '123' });
 *   userLogger.info('Action performed');
 */
export function createLogger(context: Record<string, unknown>) {
  return logger.child(context);
}

/**
 * Log with specific categories for easier filtering
 */
export const loggers = {
  // Security-related logs
  security: (context: Record<string, unknown>, message: string) =>
    logger.info({ ...context, category: 'security' }, message),

  // Performance/metrics logs
  performance: (context: Record<string, unknown>, message: string) =>
    logger.info({ ...context, category: 'performance' }, message),

  // Database operation logs
  database: (context: Record<string, unknown>, message: string) =>
    logger.debug({ ...context, category: 'database' }, message),

  // AI/LLM operation logs
  ai: (context: Record<string, unknown>, message: string) =>
    logger.debug({ ...context, category: 'ai' }, message),

  // Cache operation logs
  cache: (context: Record<string, unknown>, message: string) =>
    logger.debug({ ...context, category: 'cache' }, message),

  // Auth operation logs
  auth: (context: Record<string, unknown>, message: string) =>
    logger.info({ ...context, category: 'auth' }, message),
};

/**
 * Helper to log errors with full stack trace
 */
export function logError(error: unknown, context: Record<string, unknown> = {}) {
  if (error instanceof Error) {
    logger.error(
      {
        ...context,
        error: {
          message: error.message,
          stack: error.stack,
          name: error.name,
        },
      },
      error.message
    );
  } else {
    logger.error({ ...context, error }, 'Unknown error occurred');
  }
}
