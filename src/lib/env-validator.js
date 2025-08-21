// lib/env-validator.js

const REQUIRED_ENV_VARS = [
  'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
  'CLERK_SECRET_KEY',
  'OPENAI_API_KEY',
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_BUCKET',
  'PINECONE_API_KEY',
  'PINECONE_INDEX',
  'PINECONE_NAMESPACE',
  'NEXT_PUBLIC_APP_URL'
];

export function validateEnvironment() {
  const missing = [];
  const warnings = [];

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
    if (process.env.CLERK_SECRET_KEY?.includes('test')) {
      warnings.push('Using test Clerk keys in production');
    }
    
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

export function logEnvironmentStatus() {
  const validation = validateEnvironment();
  
  if (!validation.valid) {
    console.error('❌ CRITICAL: Missing required environment variables:');
    validation.missing.forEach(envVar => {
      console.error(`  - ${envVar}`);
    });
    
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Cannot start in production with missing environment variables');
    }
  }
  
  if (validation.warnings.length > 0) {
    console.warn('⚠️  Environment warnings:');
    validation.warnings.forEach(warning => {
      console.warn(`  - ${warning}`);
    });
  }
  
  if (validation.valid && validation.warnings.length === 0) {
    console.log('✅ All environment variables validated');
  }
  
  return validation;
}