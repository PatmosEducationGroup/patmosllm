/**
 * Temporary File Storage Utility
 * Manages temporary document files in /tmp directory
 * Files are automatically cleaned up after 5 minutes
 */

import { promises as fs } from 'fs'
import path from 'path'
import crypto from 'crypto'
import { logError, logger } from '@/lib/logger'

const TEMP_DIR = '/tmp/patmosllm-documents'
const FILE_EXPIRATION_MS = 5 * 60 * 1000 // 5 minutes

/**
 * Initialize temp directory
 */
async function ensureTempDir() {
  try {
    await fs.mkdir(TEMP_DIR, { recursive: true })
  } catch (error) {
    logError(error instanceof Error ? error : new Error('Temp directory creation failed'), {
      operation: 'ensureTempDir',
      tempDir: TEMP_DIR
    })
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
  logger.info({
    fileId,
    fileSize: buffer.length,
    extension,
    filename: sanitizedFilename,
    operation: 'temp_file_stored'
  }, `Stored temporary file: ${fileId} (${buffer.length} bytes)`)

  // Schedule cleanup after expiration
  setTimeout(async () => {
    try {
      await fs.unlink(filePath)
      logger.info({
        fileId,
        operation: 'temp_file_auto_deleted'
      }, `Auto-deleted expired file: ${fileId}`)
    } catch (error) {
      logError(error instanceof Error ? error : new Error('Temp file cleanup failed'), {
        operation: 'saveTempFile',
        phase: 'auto_cleanup',
        severity: 'low',
        fileId,
        filePath,
        errorContext: 'Failed to auto-delete expired temp file - may already be deleted'
      })
      logger.debug({
        fileId,
        operation: 'temp_file_already_cleaned'
      }, `File already cleaned up: ${fileId}`)
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
        logger.info({
          file,
          ageMs: age,
          operation: 'temp_file_cleanup'
        }, `Cleaned up old file: ${file}`)
      }
    }
  } catch (error) {
    logError(error instanceof Error ? error : new Error('File cleanup failed'), {
      operation: 'cleanupExpiredFiles',
      tempDir: TEMP_DIR
    })
  }
}

/**
 * Get download URL for a file
 */
export function getDownloadUrl(fileId: string): string {
  return `/api/download/${fileId}`
}
