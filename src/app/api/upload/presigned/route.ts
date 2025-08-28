import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'
import { uploadRateLimit } from '@/lib/rate-limiter'
import { getIdentifier } from '@/lib/get-identifier'
import { sanitizeInput } from '@/lib/input-sanitizer'

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const identifier = getIdentifier(request)
    const rateLimitResult = uploadRateLimit(identifier)
    
    if (!rateLimitResult.success) {
      return NextResponse.json({
        success: false,
        error: rateLimitResult.message,
      }, { status: 429 })
    }

    // Authentication
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      )
    }

    const user = await getCurrentUser()
  if (!user || !['ADMIN', 'CONTRIBUTOR'].includes(user.role)) {
  return NextResponse.json(
    { success: false, error: 'Only administrators and contributors can upload files' },
    { status: 403 }
  )
    }

    const { fileName, fileSize, mimeType } = await request.json()

    if (!fileName || !fileSize || !mimeType) {
      return NextResponse.json(
        { success: false, error: 'File name, size, and type required' },
        { status: 400 }
      )
    }

    // Validate file size (50MB limit)
    if (fileSize > 50 * 1024 * 1024) {
      return NextResponse.json(
        { success: false, error: 'File size exceeds 50MB limit' },
        { status: 400 }
      )
    }

    // Validate file type
    const allowedTypes = [
      'application/pdf',
      'text/plain', 
      'text/markdown',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ]
    
    if (!allowedTypes.includes(mimeType)) {
      return NextResponse.json(
        { success: false, error: 'Invalid file type' },
        { status: 400 }
      )
    }

    // Generate unique file path
    const timestamp = Date.now()
    const cleanFileName = sanitizeInput(fileName).replace(/[^a-zA-Z0-9.-]/g, '_')
    const storagePath = `${timestamp}_${cleanFileName}`

    // Generate presigned URL (15 minute expiry)
    const { data: presignedData, error: presignedError } = await supabaseAdmin.storage
      .from(process.env.SUPABASE_BUCKET!)
      .createSignedUploadUrl(storagePath, {
        upsert: false
      })

    if (presignedError) {
      console.error('Presigned URL generation error:', presignedError)
      return NextResponse.json(
        { success: false, error: 'Failed to generate upload URL' },
        { status: 500 }
      )
    }

    // Store upload metadata for later processing
    const uploadMetadata = {
      userId: user.id,
      storagePath,
      fileName,
      fileSize,
      mimeType,
      createdAt: new Date().toISOString(),
      signedUrl: presignedData.signedUrl,
      token: presignedData.token
    }

    // Store metadata temporarily (you could use Redis, but for now use Supabase)
    const { error: metadataError } = await supabaseAdmin
      .from('upload_sessions')
      .insert({
        id: presignedData.token,
        user_id: user.id,
        storage_path: storagePath,
        file_name: fileName,
        file_size: fileSize,
        mime_type: mimeType,
        expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString() // 15 minutes
      })

    if (metadataError) {
      console.error('Failed to store upload session:', metadataError)
      // Continue anyway - the upload can still work
    }

    return NextResponse.json({
      success: true,
      uploadUrl: presignedData.signedUrl,
      token: presignedData.token,
      storagePath,
      expiresIn: 900 // 15 minutes in seconds
    })

  } catch (error) {
    console.error('Presigned URL API error:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to generate upload URL' 
      },
      { status: 500 }
    )
  }
}