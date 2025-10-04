/**
 * Temporary File Storage Utility
 * Manages temporary document files in /tmp directory
 * Files are automatically cleaned up after 5 minutes
 */

import { promises as fs } from 'fs'
import path from 'path'
import crypto from 'crypto'

const TEMP_DIR = '/tmp/patmosllm-documents'
const FILE_EXPIRATION_MS = 5 * 60 * 1000 // 5 minutes

/**
 * Initialize temp directory
 */
async function ensureTempDir() {
  try {
    await fs.mkdir(TEMP_DIR, { recursive: true })
  } catch (error) {
    console.error('Error creating temp directory:', error)
  }
}

/**
 * Store a file in temporary storage
 * Returns the fileId for download
 */
export async function storeTempFile(
  buffer: Buffer,
  extension: 'pdf' | 'pptx' | 'xlsx',
  filename?: string
): Promise<string> {
  await ensureTempDir()

  // Generate unique file ID
  const timestamp = Date.now()
  const random = crypto.randomBytes(8).toString('hex')
  const sanitizedFilename = filename
    ? filename.replace(/[^a-zA-Z0-9_-]/g, '-').substring(0, 50)
    : 'document'

  const fileId = `${sanitizedFilename}-${timestamp}-${random}.${extension}`
  const filePath = path.join(TEMP_DIR, fileId)

  // Write file
  await fs.writeFile(filePath, buffer)
  console.log(`💾 Stored temporary file: ${fileId} (${buffer.length} bytes)`)

  // Schedule cleanup after expiration
  setTimeout(async () => {
    try {
      await fs.unlink(filePath)
      console.log(`🗑️  Auto-deleted expired file: ${fileId}`)
    } catch (_error) {
      // File might already be deleted by download endpoint
      console.log(`⚠️  File already cleaned up: ${fileId}`)
    }
  }, FILE_EXPIRATION_MS)

  return fileId
}

/**
 * Clean up all expired files (run periodically)
 */
export async function cleanupExpiredFiles(): Promise<void> {
  try {
    await ensureTempDir()
    const files = await fs.readdir(TEMP_DIR)
    const now = Date.now()

    for (const file of files) {
      const filePath = path.join(TEMP_DIR, file)
      const stats = await fs.stat(filePath)
      const age = now - stats.mtimeMs

      if (age > FILE_EXPIRATION_MS) {
        await fs.unlink(filePath)
        console.log(`🗑️  Cleaned up old file: ${file}`)
      }
    }
  } catch (error) {
    console.error('Error during file cleanup:', error)
  }
}

/**
 * Get download URL for a file
 */
export function getDownloadUrl(fileId: string): string {
  return `/api/download/${fileId}`
}
