/**
 * Download API Route
 * Serves generated documents (PDF, PPTX, XLSX) with proper authentication
 * Files are stored temporarily and cleaned up after download
 */

import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { promises as fs } from 'fs'
import path from 'path'
import { logger } from '@/lib/logger'

const TEMP_DIR = '/tmp/patmosllm-documents'

/**
 * GET /api/download/[fileId]
 * Downloads a generated document file
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  try {
    // getCurrentUser() handles Supabase auth
    const user = await getCurrentUser()
    if (!user) {
      return new NextResponse('Unauthorized', { status: 401 })
    }

    const { fileId } = await params

    // Validate fileId format (should be alphanumeric with extension)
    if (!fileId || !/^[a-zA-Z0-9_-]+\.(pdf|pptx|xlsx)$/.test(fileId)) {
      return new NextResponse('Invalid file ID', { status: 400 })
    }

    // Construct file path
    const filePath = path.join(TEMP_DIR, fileId)

    // Check if file exists
    try {
      await fs.access(filePath)
    } catch {
      return new NextResponse('File not found or expired', { status: 404 })
    }

    // Read file
    const fileBuffer = await fs.readFile(filePath)

    // Determine content type based on extension
    const extension = path.extname(fileId).toLowerCase()
    const contentTypes: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    }

    const contentType = contentTypes[extension] || 'application/octet-stream'

    // Create response headers
    const headers = new Headers()
    headers.set('Content-Type', contentType)
    headers.set('Content-Disposition', `attachment; filename="${fileId}"`)
    headers.set('Content-Length', fileBuffer.length.toString())
    headers.set('Cache-Control', 'no-cache, no-store, must-revalidate')

    // Delete file after successful read (fire and forget)
    // Using setTimeout to avoid blocking the response
    setTimeout(async () => {
      try {
        await fs.unlink(filePath)
        logger.info({ fileId, filePath, operation: 'cleanup' }, 'Deleted temporary file')
      } catch (error) {
        logger.error({ fileId, error: error instanceof Error ? error.message : 'Unknown error' }, 'Error deleting temporary file')
      }
    }, 1000)

    // Return file
    return new NextResponse(fileBuffer as BodyInit, { headers })

  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : 'Unknown error', operation: 'download' }, 'Error in download endpoint')
    return new NextResponse('Internal server error', { status: 500 })
  }
}
