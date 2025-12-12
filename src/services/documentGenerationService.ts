// Document Generation Service
// Handles PDF, PPTX, and XLSX document creation

import { loggers, logError } from '@/lib/logger'
import type { DocumentFormat, Source } from '@/types/chat'

// =================================================================
// TITLE GENERATION
// =================================================================

/**
 * Generates an intelligent title from content
 * Tries: heading > first sentence > first 50 chars
 */
export function generateSmartTitle(content: string): string {
  // Extract first heading if exists
  const headingMatch = content.match(/^#+ (.+)$/m)
  if (headingMatch) {
    return headingMatch[1].trim()
  }

  // Otherwise use first sentence (up to 60 chars)
  const firstSentence = content.split(/[.!?]\s/)[0].trim()
  if (firstSentence.length > 0 && firstSentence.length <= 60) {
    return firstSentence
  }

  // Fallback to first 50 chars
  return content.substring(0, 50).trim() + (content.length > 50 ? '...' : '')
}

/**
 * Creates a clean filename from a title
 */
export function createFilename(title: string): string {
  const clean = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Remove special chars
    .replace(/\s+/g, '-')          // Spaces to hyphens
    .replace(/-+/g, '-')           // Multiple hyphens to one
    .substring(0, 50)              // Max 50 chars
    .replace(/^-+|-+$/g, '')       // Trim hyphens

  return clean || 'document'
}

// =================================================================
// DOCUMENT GENERATION
// =================================================================

export interface DocumentMetadata {
  title: string
  content: string
  sources: Source[]
  timestamp: Date
}

export interface GeneratedDocument {
  buffer: Buffer
  filename: string
  fileId: string
  downloadUrl: string
  size: number
  expiresAt: string
}

/**
 * Generates a document in the specified format
 */
export async function generateDocument(
  format: DocumentFormat,
  content: string,
  lastArtifact: string,
  sources: Source[]
): Promise<GeneratedDocument> {
  if (!format) {
    throw new Error('Document format is required')
  }

  const { generatePDF, generatePPTX, generateXLSX } = await import('@/lib/document-generator')
  const { storeTempFile, getDownloadUrl } = await import('@/lib/temp-file-storage')

  // Use last artifact if available, otherwise use current response
  const contentToExport = lastArtifact && lastArtifact.trim() ? lastArtifact : content

  loggers.ai({
    contentSource: lastArtifact && lastArtifact.trim() ? 'lastArtifact' : 'fullResponse',
    contentLength: contentToExport.length
  }, 'Document content source selected')

  const smartTitle = generateSmartTitle(contentToExport)
  loggers.ai({ title: smartTitle }, 'Generated document title')

  const documentMetadata: DocumentMetadata = {
    title: smartTitle,
    content: contentToExport,
    sources,
    timestamp: new Date()
  }

  // Generate document based on format
  let buffer: Buffer
  let filename: string

  switch (format) {
    case 'pdf':
      buffer = await generatePDF(documentMetadata)
      filename = createFilename(smartTitle)
      break
    case 'pptx':
      buffer = await generatePPTX(documentMetadata)
      filename = createFilename(smartTitle)
      break
    case 'xlsx':
      buffer = await generateXLSX(documentMetadata)
      filename = createFilename(smartTitle)
      break
    default:
      throw new Error(`Unsupported format: ${format}`)
  }

  // Store file temporarily
  const fileId = await storeTempFile(buffer, format, filename)
  const downloadUrl = getDownloadUrl(fileId)

  loggers.ai({
    fileId,
    format,
    size: buffer.length
  }, 'Document generated successfully')

  return {
    buffer,
    filename: fileId,
    fileId,
    downloadUrl,
    size: buffer.length,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString()
  }
}

/**
 * Handles document generation with error handling
 * Returns null if generation fails (non-fatal)
 */
export async function safeGenerateDocument(
  format: DocumentFormat,
  content: string,
  lastArtifact: string,
  sources: Source[],
  userId: string,
  sessionId: string
): Promise<GeneratedDocument | null> {
  try {
    loggers.ai({
      documentFormat: format,
      responseLength: content.length
    }, `Generating ${format?.toUpperCase()} document`)

    return await generateDocument(format, content, lastArtifact, sources)
  } catch (docError) {
    logError(docError instanceof Error ? docError : new Error('Document generation failed'), {
      userId,
      sessionId,
      documentFormat: format
    })
    return null
  }
}
