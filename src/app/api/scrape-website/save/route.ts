// src/app/api/scrape-website/save/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'
import { sanitizeInput } from '@/lib/input-sanitizer'
import { processDocumentVectors } from '@/lib/ingest'
import { trackOnboardingMilestone } from '@/lib/onboardingTracker'

// Helper function to clean text content for database storage
function cleanTextContent(content: string): string {
  if (!content) return ''
  
  return content
    .replace(/\u0000/g, '') // Remove null bytes
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '') // Remove control characters
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim()
}

// Calculate word count
function calculateWordCount(content: string): number {
  return content.trim().split(/\s+/).filter(word => word.length > 0).length
}

interface ScrapedPage {
  url: string
  content: string
  title: string
  selected: boolean
  success: boolean
}

interface BatchProcessResult {
  success: boolean
  processed: number
  failed: number
  documents: Array<{
    id: string
    title: string
    author: string
    url: string
    wordCount: number
    fileSize: number
  }>
  errors: string[]
}

export async function POST(_request: NextRequest) {
  try {
    // Check authentication
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    // Get current user
    const user = await getCurrentUser()
    if (!user || !['SUPER_ADMIN', 'ADMIN', 'CONTRIBUTOR'].includes(user.role)) {
      return NextResponse.json({ error: 'Upload access denied' }, { status: 403 })
    }

    // Parse request body
    const { scrapedPages }: { scrapedPages: ScrapedPage[] } = await _request.json()

    if (!scrapedPages || !Array.isArray(scrapedPages)) {
      return NextResponse.json({ error: 'Invalid scraped pages data' }, { status: 400 })
    }

    const selectedPages = scrapedPages.filter(page => page.selected && page.success)
    
    if (selectedPages.length === 0) {
      return NextResponse.json({ error: 'No valid pages selected' }, { status: 400 })
    }

    console.log(`Batch processing ${selectedPages.length} scraped pages`)

    const result: BatchProcessResult = {
      success: true,
      processed: 0,
      failed: 0,
      documents: [],
      errors: []
    }

    // Process all pages in a transaction-like manner
    for (const page of selectedPages) {
      try {
        // Clean and validate content
        const cleanedContent = cleanTextContent(page.content)
        
        if (!cleanedContent || cleanedContent.length < 100) {
          result.failed++
          result.errors.push(`${page.url}: Content too short or invalid`)
          continue
        }

        // Calculate metrics
        const wordCount = calculateWordCount(cleanedContent)
        
        // Extract domain for author field
        const urlObj = new URL(page.url)
        const domain = urlObj.hostname
        
        // Clean title and create author
        const cleanTitle = sanitizeInput(page.title || page.url)
        const author = `Web scraped from ${domain}`

        // Create document record
        const { data: document, error: dbError } = await supabaseAdmin
          .from('documents')
          .insert({
            title: cleanTitle,
            author: author,
            storage_path: `scraped/${Date.now()}-${cleanTitle.replace(/[^a-zA-Z0-9]/g, '-').slice(0, 50)}.txt`,
            mime_type: 'text/plain',
            file_size: Buffer.byteLength(cleanedContent, 'utf8'),
            content: cleanedContent,
            word_count: wordCount,
            page_count: null,
            uploaded_by: user.id,
            processed_at: new Date().toISOString(),
            source_type: 'web_scraped',
            source_url: page.url,
            // Set metadata defaults for scraped content
            amazon_url: null,
            resource_url: null,
            download_enabled: false,
            contact_person: null,
            contact_email: null
          })
          .select()
          .single()

        if (dbError) {
          result.failed++
          result.errors.push(`${page.url}: Database error - ${dbError.message}`)
          continue
        }

        // Start vector processing (don't wait for completion)
        try {
          processDocumentVectors(document.id, user.id).catch(_error => {
          })
        } catch (ingestError) {
          console.error(`Error starting vector processing for ${document.id}:`, ingestError)
          // Don't fail the entire operation for vector processing errors
        }

        result.processed++
        result.documents.push({
          id: document.id,
          title: document.title,
          author: document.author,
          url: page.url,
          wordCount: document.word_count,
          fileSize: document.file_size
        })

        console.log(`Successfully processed: ${cleanTitle} (${wordCount} words)`)

      } catch (pageError) {
        console.error(`Error processing page ${page.url}:`, pageError)
        result.failed++
        result.errors.push(`${page.url}: ${pageError instanceof Error ? pageError.message : ''}`)
      }
    }

    // Track onboarding milestone for first document upload
    if (result.processed > 0) {
      try {
        await trackOnboardingMilestone({
          clerkUserId: userId,
          milestone: 'first_document_upload',
          metadata: {
            batch_scraped: true,
            pages_processed: result.processed,
            total_words: result.documents.reduce((sum, doc) => sum + (doc.wordCount || 0), 0),
            source_domains: [...new Set(selectedPages.map(p => new URL(p.url).hostname))]
          }
        })
      } catch (milestoneError) {
        console.error('Failed to track onboarding milestone:', milestoneError)
      }
    }

    // Determine overall success
    result.success = result.processed > 0

    console.log(`Batch processing complete: ${result.processed} processed, ${result.failed} failed`)

    return NextResponse.json({
      success: true,
      message: result.processed > 0 
        ? `Successfully processed ${result.processed} pages${result.failed > 0 ? ` (${result.failed} failed)` : ''}`
        : 'No pages could be processed',
      result
    })

  } catch (_error) {
    return NextResponse.json(
      { 
        success: false, 
        error: 'Batch processing failed',
        details: ''
      },
      { status: 500 }
    )
  }
}