import EPub from 'epub2'
import { load } from 'cheerio'

interface EPubMetadata {
  title: string
  creator: string // author
  publisher?: string
  description?: string
  language?: string
  rights?: string
  date?: string
}

interface EPubChapter {
  id: string
  title: string
  content: string
  order: number
  wordCount: number
}

interface ProcessedEPub {
  metadata: EPubMetadata
  chapters: EPubChapter[]
  fullText: string
  wordCount: number
  chapterCount: number
}

// Define minimal EPUB type interface
interface EPubInstance {
  metadata: {
    title?: string
    creator?: string
    author?: string
    publisher?: string
    description?: string
    language?: string
    rights?: string
    date?: string
  }
  flow: Array<{
    id: string
    title?: string
  }>
  on: (event: string, callback: (data?: Error) => void) => void
  parse: () => void
  getChapter: (id: string, callback: (error: Error, text: string) => void) => void
}

export class EPubProcessor {
  private epub!: EPubInstance // Will be initialized in parse()

  constructor(private buffer: Buffer) {}

  async parse(): Promise<ProcessedEPub> {
    // Initialize EPUB parser
    this.epub = await this.initializeEPub()

    // Extract metadata
    const metadata = await this.extractMetadata()

    // Extract all chapters
    const chapters = await this.extractChapters()

    // Combine all text
    const fullText = chapters.map(ch => `Chapter: ${ch.title}\n\n${ch.content}`).join('\n\n')
    const wordCount = this.calculateWordCount(fullText)

    return {
      metadata,
      chapters,
      fullText,
      wordCount,
      chapterCount: chapters.length
    }
  }

  private async initializeEPub(): Promise<EPubInstance> {
    return new Promise((resolve, reject) => {
      // EPub constructor accepts buffer but TypeScript types don't reflect this
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const epub = new (EPub as any)(this.buffer) as EPubInstance

      epub.on('end', () => resolve(epub))
      epub.on('error', (error?: Error) => reject(error || new Error('EPUB parsing failed')))

      epub.parse()
    })
  }

  private async extractMetadata(): Promise<EPubMetadata> {
    const meta = this.epub.metadata

    return {
      title: meta.title || 'Untitled',
      creator: meta.creator || meta.author || 'Unknown Author',
      publisher: meta.publisher,
      description: meta.description,
      language: meta.language,
      rights: meta.rights,
      date: meta.date
    }
  }

  private async extractChapters(): Promise<EPubChapter[]> {
    const chapters: EPubChapter[] = []
    const flow = this.epub.flow // Array of chapter references in reading order

    // Limit to prevent extremely large EPUBs from causing issues
    const maxChapters = 500
    const chaptersToProcess = Math.min(flow.length, maxChapters)

    if (flow.length > maxChapters) {
      console.warn(`EPUB has ${flow.length} chapters, limiting to ${maxChapters}`)
    }

    for (let i = 0; i < chaptersToProcess; i++) {
      const chapter = flow[i]

      try {
        const content = await this.getChapterContent(chapter.id)

        chapters.push({
          id: chapter.id,
          title: chapter.title || `Chapter ${i + 1}`,
          content,
          order: i,
          wordCount: this.calculateWordCount(content)
        })
      } catch (_error) {
        // Continue with other chapters
      }
    }

    return chapters
  }

  private async getChapterContent(chapterId: string): Promise<string> {
    return new Promise((resolve, reject) => {
      this.epub.getChapter(chapterId, (error: Error, text: string) => {
        if (error) {
          reject(error)
        } else {
          // Clean HTML and extract text
          const cleanedText = this.cleanHtmlContent(text)
          resolve(cleanedText)
        }
      })
    })
  }

  private cleanHtmlContent(html: string): string {
    const $ = load(html, {
      normalizeWhitespace: true,
      decodeEntities: true
    })

    // Remove scripts, styles, and other non-content elements
    $('script, style, meta, link, noscript').remove()

    // Get text content
    let text = $('body').text()

    // If no body, try the whole document
    if (!text.trim()) {
      text = $.root().text()
    }

    // Clean whitespace while preserving paragraph breaks
    text = text
      .replace(/\r\n/g, '\n')
      .replace(/\n\s*\n\s*\n+/g, '\n\n') // Multiple newlines to double newline
      .replace(/[ \t]+/g, ' ') // Multiple spaces to single space
      .trim()

    return text
  }

  private calculateWordCount(text: string): number {
    return text.trim().split(/\s+/).filter(word => word.length > 0).length
  }
}

// Helper function to validate EPUB file
export function isValidEPubBuffer(buffer: Buffer): boolean {
  // EPUB files are ZIP archives, check for ZIP signature (PK)
  if (buffer.length < 4) return false

  const zipSignature = buffer.slice(0, 4)
  return zipSignature[0] === 0x50 &&
         zipSignature[1] === 0x4B &&
         (zipSignature[2] === 0x03 || zipSignature[2] === 0x05) &&
         (zipSignature[3] === 0x04 || zipSignature[3] === 0x06)
}