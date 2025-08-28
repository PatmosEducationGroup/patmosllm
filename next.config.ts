import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  serverExternalPackages: ['pdf2pic', 'mammoth'],  // Updated from experimental
  api: {
    bodyParser: {
      sizeLimit: '50mb', // Increase from default 1mb to match your file validation
    },
    responseLimit: false,
  },
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? {
      exclude: ['error', 'warn']  // Keep error and warning logs
    } : false
  },
};

export default nextConfig;