// lib/logger.ts - Lightweight console-based logger (no dependencies)

/**
 * Structured logger using console with JSON output
 *
 * Provides better logging than plain console.log with:
 * - Structured JSON output (easy to parse/search)
 * - Log levels (debug, info, warn, error)
 * - Timestamps
 * - Context fields
 *
 * Usage:
 *   logger.info({ userId, action: 'login' }, 'User logged in');
 *   logError(error, { documentId, operation: 'process' });
 */

const logger = {
  info: (context: Record<string, unknown>, message: string) => {
    console.log(JSON.stringify({
      level: 30,
      time: Date.now(),
      env: process.env.NODE_ENV,
      app: 'patmosllm',
      ...context,
      msg: message
    }))
  },
  error: (context: Record<string, unknown>, message: string) => {
    console.error(JSON.stringify({
      level: 50,
      time: Date.now(),
      env: process.env.NODE_ENV,
      app: 'patmosllm',
      ...context,
      msg: message
    }))
  },
  warn: (context: Record<string, unknown>, message: string) => {
    console.warn(JSON.stringify({
      level: 40,
      time: Date.now(),
      env: process.env.NODE_ENV,
      app: 'patmosllm',
      ...context,
      msg: message
    }))
  },
  debug: (context: Record<string, unknown>, message: string) => {
    if (process.env.NODE_ENV === 'development') {
      console.debug(JSON.stringify({
        level: 20,
        time: Date.now(),
        env: process.env.NODE_ENV,
        app: 'patmosllm',
        ...context,
        msg: message
      }))
    }
  },
}

/**
 * Log with specific categories for easier filtering
 */
export const loggers = {
  security: (context: Record<string, unknown>, message: string) =>
    logger.info({ ...context, category: 'security' }, message),

  performance: (context: Record<string, unknown>, message: string) =>
    logger.info({ ...context, category: 'performance' }, message),

  database: (context: Record<string, unknown>, message: string) =>
    logger.debug({ ...context, category: 'database' }, message),

  ai: (context: Record<string, unknown>, message: string) =>
    logger.debug({ ...context, category: 'ai' }, message),

  cache: (context: Record<string, unknown>, message: string) =>
    logger.debug({ ...context, category: 'cache' }, message),

  auth: (context: Record<string, unknown>, message: string) =>
    logger.info({ ...context, category: 'auth' }, message),
}

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
    )
  } else {
    logger.error({ ...context, error }, 'Unknown error occurred')
  }
}

export { logger }
export default logger
