// lib/env.ts - Zod-based environment validation
import { z } from 'zod';
import { logger } from './logger';

/**
 * Environment variable schema with validation
 * Validates at startup to catch configuration errors early
 */
const envSchema = z.object({
  // Authentication
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1, 'Clerk publishable key required'),
  CLERK_SECRET_KEY: z.string().min(1, 'Clerk secret key required'),

  // Database & Storage
  NEXT_PUBLIC_SUPABASE_URL: z.string().url('Invalid Supabase URL'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, 'Supabase anon key required'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'Supabase service role key required'),
  SUPABASE_BUCKET: z.string().min(1, 'Supabase bucket name required'),
  BLOB_READ_WRITE_TOKEN: z.string().min(1, 'Vercel Blob token required'),

  // AI Services
  OPENAI_API_KEY: z.string().min(1, 'OpenAI API key required'),
  VOYAGE_API_KEY: z.string().min(1, 'Voyage API key required'),
  PINECONE_API_KEY: z.string().min(1, 'Pinecone API key required'),
  PINECONE_INDEX: z.string().min(1, 'Pinecone index name required'),
  PINECONE_NAMESPACE: z.string().min(1, 'Pinecone namespace required'),

  // Application
  NEXT_PUBLIC_APP_URL: z.string().url('Invalid app URL'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Security (optional)
  CSRF_SECRET: z.string().optional(),
  RATE_LIMIT_EXEMPT_USERS: z.string().optional(),

  // Communication (optional)
  RESEND_API_KEY: z.string().optional(),

  // Privacy Features (optional)
  PRIVACY_FEATURES_ENABLED: z.string().optional(),
  ENABLE_PROFILE_EDITING: z.string().optional(),
});

/**
 * Parsed and validated environment variables
 * Use this instead of process.env for type safety
 */
export const env = envSchema.parse(process.env);

/**
 * Validate environment on module load
 * Throws descriptive error if validation fails
 */
export function validateEnv() {
  try {
    envSchema.parse(process.env);
    logger.info({ validatedVars: Object.keys(envSchema.shape).length }, '✅ Environment variables validated successfully');
    return { valid: true, errors: [] };
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.error({ errorCount: error.errors.length, errors: error.errors }, '❌ Environment validation failed');
      error.errors.forEach((err) => {
        logger.error({ field: err.path.join('.'), message: err.message, code: err.code }, `Validation error: ${err.path.join('.')}: ${err.message}`);
      });

      if (process.env.NODE_ENV === 'production') {
        throw new Error('Cannot start in production with invalid environment variables');
      }

      return {
        valid: false,
        errors: error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
        })),
      };
    }
    throw error;
  }
}
