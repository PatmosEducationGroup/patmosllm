import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase'
import { validateFile, extractTextFromFile } from '@/lib/fileProcessors'
import { getCurrentUser } from '@/lib/auth'
import { uploadRateLimit } from '@/lib/rate-limiter';
import { getIdentifier } from '@/lib/get-identifier';
import { sanitizeInput } from '@/lib/input-sanitizer';
import { validateFileSignature, validateFileSize, validateFileName, scanForMaliciousContent } from '@/lib/file-security';

export async function POST(request: NextRequest) {
  try {
    // RATE LIMITING - Check this FIRST
    const identifier = getIdentifier(request);
    const rateLimitResult = uploadRateLimit(identifier);
    
    if (!rateLimitResult.success) {
      return new Response(
        JSON.stringify({
          error: rateLimitResult.message,
          resetTime: rateLimitResult.resetTime
        }),
        { 
          status: 429,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Check authentication
    const { userId } = await auth()

    // Get current user and check permissions
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found in database' },
        { status: 403 }
      )
    }

    // Only ADMINs can upload for now
    if (user.role !== 'ADMIN') {
      return NextResponse.json(
        { success: false, error: 'Only administrators can upload files' },
        { status: 403 }
      )
    }

    // Parse form data
    const formData = await request.formData()
    const file = formData.get('file') as File
    const title = sanitizeInput(formData.get('title') as string)
    const author = sanitizeInput(formData.get('author') as string)

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file provided' },
        { status: 400 }
      )
    }

    // Validate file
const validation = validateFile(file)
if (!validation.valid) {
  return NextResponse.json(
    { success: false, error: validation.error },
    { status: 400 }
  )
}

// Convert file to buffer
const buffer = Buffer.from(await file.arrayBuffer())

// Additional security checks
if (!validateFileSize(file.size)) {
  return NextResponse.json(
    { success: false, error: 'File size exceeds 50MB limit' },
    { status: 400 }
  )
}

if (!validateFileSignature(buffer, file.type)) {
  return NextResponse.json(
    { success: false, error: 'File signature does not match file type' },
    { status: 400 }
  )
}

if (!scanForMaliciousContent(buffer)) {
  return NextResponse.json(
    { success: false, error: 'File contains potentially malicious content' },
    { status: 400 }
  )
}

    // Extract text content
    console.log(`Extracting text from ${file.name}...`)
    const extraction = await extractTextFromFile(buffer, file.type, file.name)

    // Generate storage path
    const timestamp = Date.now()
    const cleanFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
    const storagePath = `${timestamp}_${cleanFileName}`

    // Upload file to Supabase storage
    console.log(`Uploading file to storage: ${storagePath}`)
    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from(process.env.SUPABASE_BUCKET!)
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: false
      })

    if (uploadError) {
      console.error('Storage upload error:', uploadError)
      return NextResponse.json(
        { success: false, error: `Upload failed: ${uploadError.message}` },
        { status: 500 }
      )
    }

    // Save document record to database
    console.log('Saving document record to database...')
    const { data: document, error: dbError } = await supabaseAdmin
      .from('documents')
      .insert({
        title: title || file.name,
        author: author || null,
        storage_path: storagePath,
        mime_type: file.type,
        file_size: file.size,
        content: extraction.content,
        word_count: extraction.wordCount,
        page_count: extraction.pageCount || null,
        uploaded_by: user.id,
        processed_at: new Date().toISOString()
      })
      .select()
      .single()

    if (dbError) {
      console.error('Database insert error:', dbError)
      
      // Clean up uploaded file if database insert fails
      await supabaseAdmin.storage
        .from(process.env.SUPABASE_BUCKET!)
        .remove([storagePath])

      return NextResponse.json(
        { success: false, error: `Database error: ${dbError.message}` },
        { status: 500 }
      )
    }

    console.log(`Successfully uploaded and processed: ${document.title}`)

    return NextResponse.json({
      success: true,
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
    console.error('Upload error:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Upload failed' 
      },
      { status: 500 }
    )
  }
}