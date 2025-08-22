import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase'
import { extractTextFromFile } from '@/lib/fileProcessors'
import { getCurrentUser } from '@/lib/auth'
import { uploadRateLimit } from '@/lib/rate-limiter'
import { getIdentifier } from '@/lib/get-identifier'
import { sanitizeInput } from '@/lib/input-sanitizer'

export async function POST(request: NextRequest) {
  try {
    // RATE LIMITING - Check this FIRST
    const identifier = getIdentifier(request)
    const rateLimitResult = uploadRateLimit(identifier)
    
    if (!rateLimitResult.success) {
      return NextResponse.json({
        success: false,
        error: rateLimitResult.message,
      }, { status: 429 })
    }

    // Check authentication
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      )
    }

    // Get current user
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      )
    }

    // Get request data
    const { storagePath, fileName, fileSize, mimeType, title, author } = await request.json()

    if (!storagePath || !fileName) {
      return NextResponse.json(
        { success: false, error: 'Storage path and filename required' },
        { status: 400 }
      )
    }

    // Validate file size
    if (fileSize > 50 * 1024 * 1024) { // 50MB
      return NextResponse.json(
        { success: false, error: 'File size exceeds 50MB limit' },
        { status: 400 }
      )
    }

    // Sanitize inputs
    const cleanTitle = sanitizeInput(title || fileName)
    const cleanAuthor = author ? sanitizeInput(author) : null

    console.log(`Processing uploaded file: ${storagePath}`)

    // Download file from Supabase Storage for processing
    const { data: fileData, error: downloadError } = await supabaseAdmin.storage
      .from(process.env.SUPABASE_BUCKET!)
      .download(storagePath)

    if (downloadError) {
      console.error('Error downloading file from storage:', downloadError)
      return NextResponse.json(
        { success: false, error: 'Failed to download file for processing' },
        { status: 500 }
      )
    }

    // Convert blob to buffer for processing
    const buffer = Buffer.from(await fileData.arrayBuffer())

    // Extract text content
    console.log(`Extracting text from ${fileName}...`)
    const extraction = await extractTextFromFile(buffer, mimeType, fileName)

    if (!extraction.success) {
      console.error('Text extraction failed:', extraction.error)
      return NextResponse.json(
        { success: false, error: extraction.error },
        { status: 400 }
      )
    }

    console.log(`Extracted ${extraction.wordCount} words from ${fileName}`)

    // Save document record to database
    console.log('Saving document record to database...')
    const { data: document, error: dbError } = await supabaseAdmin
      .from('documents')
      .insert({
        title: cleanTitle,
        author: cleanAuthor,
        storage_path: storagePath,
        mime_type: mimeType,
        file_size: fileSize,
        content: extraction.content,
        word_count: extraction.wordCount,
        page_count: extraction.pageCount || null,
        uploaded_by: user.id,
        processed_at: new Date().toISOString()
      })
      .select()
      .single()

    if (dbError) {
      console.error('Database error:', dbError)
      return NextResponse.json(
        { success: false, error: 'Failed to save document record' },
        { status: 500 }
      )
    }

    console.log(`Document saved with ID: ${document.id}`)

    // Start vector processing job
    try {
      const ingestResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/ingest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ documentId: document.id })
      })

      if (!ingestResponse.ok) {
        console.error('Failed to start ingest job')
      } else {
        console.log('Vector processing job started')
      }
    } catch (ingestError) {
      console.error('Error starting ingest job:', ingestError)
      // Don't fail the upload if vector processing fails
    }

    console.log(`Successfully processed: ${cleanTitle}`)

    return NextResponse.json({
      success: true,
      message: `Successfully uploaded and processed: ${cleanTitle}`,
      document: {
        id: document.id,
        title: document.title,
        author: document.author,
        wordCount: document.word_count,
        pageCount: document.page_count,
        fileSize: document.file_size,
        mimeType: document.mime_type,
        createdAt: document.created_at
      }
    })

  } catch (error) {
    console.error('Processing error:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Processing failed' 
      },
      { status: 500 }
    )
  }
}