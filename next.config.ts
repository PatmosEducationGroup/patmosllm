import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  serverExternalPackages: [
    'pdf2pic',
    'mammoth',
    'sharp',
    'fluent-ffmpeg',
    '@ffmpeg-installer/ffmpeg',
    '@ffprobe-installer/ffprobe',
    'tesseract.js',
    'music-metadata'
  ],  // Server-only packages
  
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? {
      exclude: ['error', 'warn']  // Keep error and warning logs
    } : false
  },
};

export default nextConfig;