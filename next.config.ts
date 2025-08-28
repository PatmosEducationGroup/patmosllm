import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  serverExternalPackages: ['pdf2pic', 'mammoth'],  // Updated from experimental
  
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? {
      exclude: ['error', 'warn']  // Keep error and warning logs
    } : false
  },
};

export default nextConfig;