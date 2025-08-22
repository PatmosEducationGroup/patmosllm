import type { NextConfig } from 'next'

// Import environment validation
const { logEnvironmentStatus } = require('./lib/env-validator')

// Validate environment variables at build time
logEnvironmentStatus();

const nextConfig: NextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['pdf2pic', 'mammoth']
  },
  api: {
    bodyParser: {
      sizeLimit: '50mb', // Increase from default 1mb to match your file validation
    },
    responseLimit: false,
  },
};

export default nextConfig;