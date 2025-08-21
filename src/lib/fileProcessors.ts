import pdf2json from 'pdf2json'
import mammoth from 'mammoth'

// Supported file types
export const SUPPORTED_MIME_TYPES = [
  'text/plain',
  'text/markdown', 
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]

export const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB

// Validate file type and size
export function validateFile(file: File): { valid: boolean; error?: string } {
  if (!SUPPORTED_MIME_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: `Unsupported file type: ${file.type}. Supported types: TXT, MD, PDF, DOCX`
    }
  }

  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB. Max size: 50MB`
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
}> {
  try {
    switch (mimeType) {
      case 'text/plain':
      case 'text/markdown':
        return await extractFromText(buffer)
      
      case 'application/pdf':
        return await extractFromPDF(buffer)
      
      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        return await extractFromWord(buffer)
      
      default:
        throw new Error(`Unsupported file type: ${mimeType}`)
    }
  } catch (error) {
    console.error(`Error extracting text from ${filename}:`, error)
    throw new Error(`Failed to extract text from ${filename}: ${error instanceof Error ? error.message : 'Unknown error'}`)
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
    const pdfParser = new (pdf2json as any)()
    
    pdfParser.on('pdfParser_dataError', (errData: any) => {
      reject(new Error(`PDF parsing error: ${errData.parserError}`))
    })
    
    pdfParser.on('pdfParser_dataReady', (pdfData: any) => {
      try {
        let content = ''
        let pageCount = 0
        
        if (pdfData.Pages) {
          pageCount = pdfData.Pages.length
          
          for (const page of pdfData.Pages) {
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
        reject(new Error(`Error processing PDF data: ${error instanceof Error ? error.message : 'Unknown error'}`))
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
    throw new Error(`Word document processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
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