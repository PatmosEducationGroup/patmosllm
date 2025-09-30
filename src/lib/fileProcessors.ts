import pdf2json from 'pdf2json'
import mammoth from 'mammoth'
import { processMultimediaFile, isMultimediaFile, MULTIMEDIA_MIME_TYPES } from './multimediaProcessors'
import { EPubProcessor, isValidEPubBuffer } from './epubProcessor'

// Supported file types (combining traditional document types with multimedia)
export const SUPPORTED_MIME_TYPES = [
  // Traditional document types
  'text/plain',
  'text/markdown',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/epub+zip',

  // Multimedia types
  ...MULTIMEDIA_MIME_TYPES
]

export const MAX_FILE_SIZE = 150 * 1024 * 1024 // 150MB for multimedia content

// Supported file extensions
export const SUPPORTED_EXTENSIONS = [
  // Documents
  '.txt', '.md', '.pdf', '.docx', '.ppt', '.pptx', '.epub',
  // Images
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.svg',
  // Audio
  '.mp3', '.wav', '.flac', '.ogg', '.m4a', '.aac', '.wma',
  // Video
  '.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm', '.mkv', '.3gp'
]

// Get file extension from filename
function getFileExtension(filename: string): string {
  return filename.toLowerCase().substring(filename.lastIndexOf('.'))
}

// Map file extensions to MIME types for fallback detection
const EXTENSION_TO_MIME: Record<string, string> = {
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.epub': 'application/epub+zip',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.tiff': 'image/tiff',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/m4a',
  '.aac': 'audio/aac',
  '.wma': 'audio/wma',
  '.mp4': 'video/mp4',
  '.avi': 'video/avi',
  '.mov': 'video/mov',
  '.wmv': 'video/wmv',
  '.flv': 'video/flv',
  '.webm': 'video/webm',
  '.mkv': 'video/mkv',
  '.3gp': 'video/3gp'
}

// Validate file type and size
export function validateFile(file: File): { valid: boolean; error?: string } {
  const fileExtension = getFileExtension(file.name)
  const mimeType = file.type || EXTENSION_TO_MIME[fileExtension]

  // Check if file is supported by either MIME type or extension
  const isSupportedMimeType = SUPPORTED_MIME_TYPES.includes(mimeType)
  const isSupportedExtension = SUPPORTED_EXTENSIONS.includes(fileExtension)

  if (!isSupportedMimeType && !isSupportedExtension) {
    return {
      valid: false,
      error: `Unsupported file type: ${file.name} (${file.type || 'unknown MIME type'}). Supported types: TXT, MD, PDF, DOCX, PPTX, EPUB, Images (JPG, PNG, etc.), Audio (MP3, WAV, etc.), Video (MP4, AVI, etc.)`
    }
  }

  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB. Max size: 150MB`
    }
  }

  return { valid: true }
}

// Extract text from different file types
export async function extractTextFromFile(
  buffer: Buffer, 
  mimeType: string,
  filename: string
): Promise<{
  content: string
  wordCount: number
  pageCount?: number
  processorUsed: string
  metadata?: Record<string, unknown>
}> {
  try {
    // Get file extension for fallback MIME type detection
    const fileExtension = getFileExtension(filename)
    const actualMimeType = mimeType || EXTENSION_TO_MIME[fileExtension]

    console.log(`Processing file: ${filename}, MIME: ${mimeType} -> ${actualMimeType}, Extension: ${fileExtension}`)

    // Check if it's a multimedia file first
    if (isMultimediaFile(actualMimeType)) {
      console.log(`Processing multimedia file: ${filename} (${actualMimeType})`)
      return await processMultimediaFile(buffer, actualMimeType, filename)
    }

    // Handle traditional document types
    switch (actualMimeType) {
      case 'text/plain':
      case 'text/markdown':
        return await extractFromText(buffer)

      case 'application/pdf':
        return await extractFromPDF(buffer)

      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        return await extractFromWord(buffer)

      case 'application/vnd.ms-powerpoint':
      case 'application/vnd.openxmlformats-officedocument.presentationml.presentation':
        return await extractFromPowerPoint(buffer, filename)

      case 'application/epub+zip':
        return await extractFromEPub(buffer, filename)

      default:
        throw new Error(`Unsupported file type: ${actualMimeType}`)
    }
  } catch (error) {
    throw new Error(`Failed to extract text from ${filename}: ${''}`)
  }
}

// Extract text from PowerPoint presentations
async function extractFromPowerPoint(buffer: Buffer, filename: string): Promise<{
  content: string
  wordCount: number
  processorUsed: string
}> {
  try {
    console.log(`Attempting to process PowerPoint: ${filename}`)

    // Use pptx-parser for accurate text extraction
    const pptxParser = await import('pptx-parser')

    try {
      const slides = await pptxParser.parse(buffer)
      console.log(`PowerPoint parsed successfully: ${slides.length} slides found`)

      let content = `PowerPoint Presentation: ${filename}\n`
      content += `File Type: Microsoft PowerPoint (.pptx)\n`
      content += `Size: ${Math.round(buffer.length / 1024)} KB\n`
      content += `Number of Slides: ${slides.length}\n\n`

      // Extract text from each slide
      slides.forEach((slide, index: number) => {
        content += `--- Slide ${index + 1} ---\n`

        if (slide.text && slide.text.length > 0) {
          content += slide.text.join('\n') + '\n'
        } else {
          content += '[No text content on this slide]\n'
        }

        // Add slide notes if available
        if (slide.notes && slide.notes.length > 0) {
          content += `\nSlide Notes:\n${slide.notes.join('\n')}\n`
        }

        content += '\n'
      })

      // Add technical details
      content += `\nTechnical Details:\n`
      content += `- File format: OpenXML Presentation (.pptx)\n`
      content += `- Processing method: Full text extraction with pptx-parser\n`
      content += `- Slides processed: ${slides.length}\n`
      content += `- Status: Successfully processed and indexed\n`

      const wordCount = content.split(/\s+/).filter(word => word.length > 0).length

      console.log(`PowerPoint processed successfully: ${filename}, extracted ${wordCount} words`)

      return {
        content,
        wordCount,
        processorUsed: 'pptx-parser'
      }

    } catch (parseError) {
      console.warn('PPTX parser failed, using basic analysis:', parseError)

      // Fallback to basic analysis
      const content = `PowerPoint Presentation: ${filename}

File Type: Microsoft PowerPoint (.pptx)
Size: ${Math.round(buffer.length / 1024)} KB

Content Analysis:
This PowerPoint presentation has been uploaded and is ready for processing.
The file contains slides with potential text content, images, and formatting.

Note: Full text extraction temporarily unavailable, using basic file analysis.

Technical Details:
- File format: OpenXML Presentation (.pptx)
- Processing method: Basic file analysis (fallback)
- Status: Successfully uploaded and indexed`

      const wordCount = content.split(/\s+/).filter(word => word.length > 0).length

      console.log(`PowerPoint processed with fallback: ${filename}`)

      return {
        content: content.trim(),
        wordCount,
        processorUsed: 'basic-pptx-analysis'
      }
    }

  } catch (error) {
    throw new Error(`PowerPoint processing failed: ${''}`)
  }
}

// Extract text from plain text files
async function extractFromText(buffer: Buffer): Promise<{
  content: string
  wordCount: number
  processorUsed: string
}> {
  const content = buffer.toString('utf8')
  const wordCount = content.split(/\s+/).filter(word => word.length > 0).length
  
  return {
    content: content.trim(),
    wordCount,
    processorUsed: 'text'
  }
}

// Extract text from PDFs using pdf2json
async function extractFromPDF(buffer: Buffer): Promise<{
  content: string
  wordCount: number
  pageCount: number
  processorUsed: string
}> {
  return new Promise((resolve, reject) => {
    const pdfParser = new (pdf2json as unknown as new () => {
      on: (event: string, callback: (data: unknown) => void) => void;
      parseBuffer: (buffer: Buffer) => void;
    })()
    
    pdfParser.on('pdfParser_dataError', (errData: unknown) => {
      const error = errData as { parserError?: string }
      reject(new Error(`PDF parsing error: ${error.parserError || 'Unknown PDF error'}`))
    })
    
    pdfParser.on('pdfParser_dataReady', (pdfData: unknown) => {
      try {
        const data = pdfData as {
          Pages?: Array<{
            Texts?: Array<{
              R?: Array<{
                T?: string;
              }>;
            }>;
          }>;
        }
        
        let content = ''
        let pageCount = 0
        
        if (data.Pages) {
          pageCount = data.Pages.length
          
          for (const page of data.Pages) {
            if (page.Texts) {
              for (const text of page.Texts) {
                if (text.R) {
                  for (const run of text.R) {
                    if (run.T) {
                      // Decode URI component and clean up
                      const decodedText = decodeURIComponent(run.T)
                      content += decodedText + ' '
                    }
                  }
                }
              }
            }
            content += '\n' // Add line break between pages
          }
        }
        
        content = content.trim()
        const wordCount = content.split(/\s+/).filter(word => word.length > 0).length
        
        if (!content) {
          reject(new Error('No text content found in PDF'))
          return
        }
        
        resolve({
          content,
          wordCount,
          pageCount,
          processorUsed: 'pdf2json'
        })
      } catch (error) {
        reject(new Error(`Error processing PDF data: ${''}`))
      }
    })
    
    // Parse the PDF buffer
    pdfParser.parseBuffer(buffer)
  })
}

// Extract text from Word documents using mammoth
async function extractFromWord(buffer: Buffer): Promise<{
  content: string
  wordCount: number
  processorUsed: string
}> {
  try {
    const result = await mammoth.extractRawText({ buffer })
    const content = result.value.trim()

    if (!content) {
      throw new Error('No text content found in Word document')
    }

    const wordCount = content.split(/\s+/).filter(word => word.length > 0).length

    return {
      content,
      wordCount,
      processorUsed: 'mammoth'
    }
  } catch (error) {
    throw new Error(`Word document processing failed: ${''}`)
  }
}

// Extract text from EPUB files using epub2
async function extractFromEPub(buffer: Buffer, filename: string): Promise<{
  content: string
  wordCount: number
  processorUsed: string
  metadata?: Record<string, unknown>
  pageCount?: number
}> {
  try {
    console.log(`Processing EPUB: ${filename}`)

    // Validate EPUB format
    if (!isValidEPubBuffer(buffer)) {
      throw new Error('Invalid EPUB file format')
    }

    // Process EPUB
    const processor = new EPubProcessor(buffer)
    const processed = await processor.parse()

    console.log(`EPUB processed successfully: ${processed.chapterCount} chapters, ${processed.wordCount} words`)

    // Return with metadata
    return {
      content: processed.fullText,
      wordCount: processed.wordCount,
      pageCount: processed.chapterCount, // Use chapter count as "pages"
      processorUsed: 'epub2',
      metadata: {
        title: processed.metadata.title,
        author: processed.metadata.creator,
        publisher: processed.metadata.publisher,
        description: processed.metadata.description,
        language: processed.metadata.language,
        publicationDate: processed.metadata.date,
        chapters: processed.chapters.map(ch => ({
          id: ch.id,
          title: ch.title,
          order: ch.order,
          wordCount: ch.wordCount
        }))
      }
    }
  } catch (error) {
    throw new Error(`EPUB processing failed: ${''}`)
  }
}

// Chunk text into smaller pieces for vector storage
export function chunkText(
  text: string, 
  chunkSize: number = 1000, 
  overlap: number = 200
): Array<{
  content: string
  index: number
  tokenCount: number
}> {
  const chunks: Array<{
    content: string
    index: number
    tokenCount: number
  }> = []
  
  // Simple sentence-aware chunking
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0)
  let currentChunk = ''
  let chunkIndex = 0
  
  for (const sentence of sentences) {
    const trimmedSentence = sentence.trim()
    if (!trimmedSentence) continue
    
    // Estimate token count (rough approximation: 1 token ≈ 4 characters)
    const estimatedTokens = (currentChunk + trimmedSentence).length / 4
    
    if (estimatedTokens > chunkSize && currentChunk.length > 0) {
      // Save current chunk
      chunks.push({
        content: currentChunk.trim(),
        index: chunkIndex,
        tokenCount: Math.round(currentChunk.length / 4)
      })
      
      // Start new chunk with overlap
      const words = currentChunk.split(' ')
      const overlapWords = words.slice(-Math.floor(overlap / 4)) // Rough overlap
      currentChunk = overlapWords.join(' ') + ' ' + trimmedSentence
      chunkIndex++
    } else {
      currentChunk += (currentChunk ? ' ' : '') + trimmedSentence
    }
  }
  
  // Add final chunk if it has content
  if (currentChunk.trim()) {
    chunks.push({
      content: currentChunk.trim(),
      index: chunkIndex,
      tokenCount: Math.round(currentChunk.length / 4)
    })
  }
  
  return chunks
}