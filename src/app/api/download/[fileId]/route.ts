/**
 * Download API Route
 * Serves generated documents (PDF, PPTX, XLSX) with proper authentication
 * Files are stored temporarily and cleaned up after download
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { promises as fs } from 'fs'
import path from 'path'

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
    // Authenticate user
    const { userId } = await auth()
    if (!userId) {
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
        console.log(`🗑️  Deleted temporary file: ${fileId}`)
      } catch (error) {
        console.error(`Error deleting file ${fileId}:`, error)
      }
    }, 1000)

    // Return file
    return new NextResponse(fileBuffer as BodyInit, { headers })

  } catch (error) {
    console.error('Error in download endpoint:', error)
    return new NextResponse('Internal server error', { status: 500 })
  }
}
