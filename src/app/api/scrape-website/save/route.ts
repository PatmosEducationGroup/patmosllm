// src/app/api/scrape-website/save/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'
import { sanitizeInput } from '@/lib/input-sanitizer'
import { processDocumentVectors } from '@/lib/ingest'
import { trackOnboardingMilestone } from '@/lib/onboardingTracker'
import { logError, logger } from '@/lib/logger'

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

    logger.info({
      operation: 'scrape_website_save_batch',
      userId: user.id,
      userRole: user.role,
      pagesTotal: scrapedPages.length,
      pagesSelected: selectedPages.length,
      phase: 'batch_start'
    }, `Batch processing ${selectedPages.length} scraped pages`)

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

        // Create document record using atomic transaction
        const { data: transactionResult, error: rpcError } = await supabaseAdmin
          .rpc('save_document_transaction', {
            p_title: cleanTitle,
            p_author: author,
            p_storage_path: `scraped/${Date.now()}-${cleanTitle.replace(/[^a-zA-Z0-9]/g, '-').slice(0, 50)}.txt`,
            p_mime_type: 'text/plain',
            p_file_size: Buffer.byteLength(cleanedContent, 'utf8'),
            p_content: cleanedContent,
            p_word_count: wordCount,
            p_page_count: null,
            p_uploaded_by: user.id,
            p_source_type: 'web_scraped',
            p_source_url: page.url
          })

        if (rpcError || !transactionResult?.success) {
          result.failed++
          result.errors.push(`${page.url}: Transaction failed - ${transactionResult?.error || rpcError?.message}`)
          logError(new Error(transactionResult?.error || 'Document transaction failed'), {
            operation: 'save_document_transaction',
            userId: user.id,
            url: page.url,
            title: cleanTitle,
            phase: 'database_transaction',
            severity: 'high',
            dbError: rpcError?.message,
            transactionError: transactionResult?.error
          })
          continue
        }

        // Extract document data from transaction result
        const documentId = transactionResult.document_id
        const document = {
          id: documentId,
          title: cleanTitle,
          author: author,
          word_count: wordCount,
          file_size: Buffer.byteLength(cleanedContent, 'utf8')
        }

        // Start vector processing (don't wait for completion)
        try {
          processDocumentVectors(document.id, user.id).catch(vectorError => {
            // CRITICAL: Vector processing failed - document saved but not searchable
            logError(vectorError instanceof Error ? vectorError : new Error('Vector processing failed'), {
              operation: 'process_document_vectors',
              documentId: document.id,
              userId: user.id,
              title: document.title,
              url: page.url,
              phase: 'vector_embedding',
              severity: 'critical',
              impact: 'Document saved but not searchable - manual reprocessing required'
            })
          })
        } catch (ingestError) {
          // Error initiating vector processing
          logError(ingestError instanceof Error ? ingestError : new Error('Failed to initiate vector processing'), {
            operation: 'initiate_vector_processing',
            documentId: document.id,
            userId: user.id,
            title: document.title,
            url: page.url,
            phase: 'vector_init',
            severity: 'high',
            impact: 'Document saved but vector processing not started'
          })
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

        logger.info({
          operation: 'scrape_page_save',
          documentId: document.id,
          userId: user.id,
          title: cleanTitle,
          url: page.url,
          wordCount: wordCount,
          fileSize: document.file_size,
          phase: 'document_saved'
        }, `Successfully processed: ${cleanTitle} (${wordCount} words)`)

      } catch (pageError) {
        // Page-level processing error
        logError(pageError instanceof Error ? pageError : new Error('Page processing failed'), {
          operation: 'scrape_page_process',
          userId: user.id,
          url: page.url,
          title: page.title,
          phase: 'page_processing',
          severity: 'medium',
          impact: 'Single page failed but batch continues'
        })
        result.failed++
        result.errors.push(`${page.url}: ${pageError instanceof Error ? pageError.message : 'Unknown error'}`)
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
        // Non-critical: Milestone tracking failed but documents saved successfully
        logError(milestoneError instanceof Error ? milestoneError : new Error('Milestone tracking failed'), {
          operation: 'track_onboarding_milestone',
          clerkUserId: userId,
          milestone: 'first_document_upload',
          pagesProcessed: result.processed,
          phase: 'onboarding_tracking',
          severity: 'low',
          impact: 'Analytics not recorded but operation succeeded'
        })
      }
    }

    // Determine overall success
    result.success = result.processed > 0

    logger.info({
      operation: 'scrape_website_save_batch',
      userId: user.id,
      processed: result.processed,
      failed: result.failed,
      totalPages: selectedPages.length,
      successRate: `${((result.processed / selectedPages.length) * 100).toFixed(1)}%`,
      phase: 'batch_complete'
    }, `Batch processing complete: ${result.processed} processed, ${result.failed} failed`)

    return NextResponse.json({
      success: true,
      message: result.processed > 0 
        ? `Successfully processed ${result.processed} pages${result.failed > 0 ? ` (${result.failed} failed)` : ''}`
        : 'No pages could be processed',
      result
    })

  } catch (error) {
    // CRITICAL: Top-level batch processing failure
    logError(error instanceof Error ? error : new Error('Batch processing failed'), {
      operation: 'scrape_website_save_batch',
      userId: 'unknown', // May not have userId if auth fails
      phase: 'batch_processing',
      severity: 'critical',
      impact: 'Entire batch operation failed - no documents saved'
    })

    return NextResponse.json(
      {
        success: false,
        error: 'Batch processing failed',
        details: error instanceof Error ? error.message : 'Unknown error occurred'
      },
      { status: 500 }
    )
  }
}