// lib/env-validator.ts
import { logger } from './logger'

const REQUIRED_ENV_VARS = [
  'OPENAI_API_KEY',
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_BUCKET',
  'PINECONE_API_KEY',
  'PINECONE_INDEX',
  'PINECONE_NAMESPACE',
  'NEXT_PUBLIC_APP_URL'
] as const;

interface ValidationResult {
  valid: boolean;
  missing: string[];
  warnings: string[];
}

/**
 * Validate that all required environment variables are set
 *
 * @returns Validation result with missing vars and warnings
 */
export function validateEnvironment(): ValidationResult {
  const missing: string[] = [];
  const warnings: string[] = [];

  for (const envVar of REQUIRED_ENV_VARS) {
    const value = process.env[envVar];

    if (!value) {
      missing.push(envVar);
    } else if (value.includes('your_') || value.includes('sk-proj-example')) {
      warnings.push(`${envVar} appears to be a placeholder value`);
    }
  }

  // Check for test/development keys in production
  if (process.env.NODE_ENV === 'production') {
    if (process.env.NEXT_PUBLIC_APP_URL === 'http://localhost:3000') {
      warnings.push('APP_URL is still set to localhost in production');
    }
  }

  return {
    valid: missing.length === 0,
    missing,
    warnings
  };
}

/**
 * Log environment validation status to console
 * Throws error in production if required variables are missing
 *
 * @returns Validation result
 */
export function logEnvironmentStatus(): ValidationResult {
  const validation = validateEnvironment();

  if (!validation.valid) {
    logger.error({ missing: validation.missing, count: validation.missing.length }, '❌ CRITICAL: Missing required environment variables');
    validation.missing.forEach(envVar => {
      logger.error({ envVar }, `Missing environment variable: ${envVar}`);
    });

    if (process.env.NODE_ENV === 'production') {
      throw new Error('Cannot start in production with missing environment variables');
    }
  }

  if (validation.warnings.length > 0) {
    logger.warn({ warnings: validation.warnings, count: validation.warnings.length }, '⚠️  Environment warnings');
    validation.warnings.forEach(warning => {
      logger.warn({ warning }, warning);
    });
  }

  if (validation.valid && validation.warnings.length === 0) {
    logger.info({ validatedVars: REQUIRED_ENV_VARS.length }, '✅ All environment variables validated');
  }

  return validation;
}
