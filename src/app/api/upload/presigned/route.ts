import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'
import { uploadRateLimit } from '@/lib/rate-limiter'
import { getIdentifier } from '@/lib/get-identifier'
import { sanitizeInput } from '@/lib/input-sanitizer'
import { SUPPORTED_MIME_TYPES, SUPPORTED_EXTENSIONS } from '@/lib/clientValidation'
import { logError } from '@/lib/logger'

export async function POST(_request: NextRequest) {
  try {
    // Rate limiting
    const identifier = await getIdentifier(_request)
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
if (!user || !['ADMIN', 'CONTRIBUTOR', 'SUPER_ADMIN'].includes(user.role)) {
  return NextResponse.json(
    { success: false, error: 'Only administrators and contributors can upload files' },
    { status: 403 }
  )
}

    const { fileName, fileSize, mimeType } = await _request.json()

    if (!fileName || !fileSize || !mimeType) {
      return NextResponse.json(
        { success: false, error: 'File name, size, and type required' },
        { status: 400 }
      )
    }

    // Validate file size (150MB limit for multimedia content)
    if (fileSize > 150 * 1024 * 1024) {
      return NextResponse.json(
        { success: false, error: 'File size exceeds 150MB limit' },
        { status: 400 }
      )
    }

    // Enhanced file type validation with extension fallback
    const getFileExtension = (filename: string): string => {
      return filename.toLowerCase().substring(filename.lastIndexOf('.'))
    }

    const fileExtension = getFileExtension(fileName)
    const isSupportedMimeType = SUPPORTED_MIME_TYPES.includes(mimeType)
    const isSupportedExtension = SUPPORTED_EXTENSIONS.includes(fileExtension)

    if (!isSupportedMimeType && !isSupportedExtension) {
      return NextResponse.json(
        { success: false, error: `Unsupported file type: ${fileName} (${mimeType}). Supported types: TXT, MD, PDF, DOCX, PPTX, Images, Audio, Video` },
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
      logError(new Error(`Presigned URL generation failed: ${presignedError.message}`), {
        operation: 'presigned_url_generation',
        fileName,
        fileSize,
        mimeType,
        userId: user.id,
        errorMessage: presignedError.message,
        phase: 'presigned_url_creation',
        severity: 'critical'
      })

      return NextResponse.json(
        { success: false, error: 'Failed to generate upload URL' },
        { status: 500 }
      )
    }

    // Store upload metadata for later processing
    const _uploadMetadata = {
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
      // Continue anyway - the upload can still work
      // This is medium severity because upload can proceed without session tracking
      logError(new Error(`Upload session storage failed: ${metadataError.message}`), {
        operation: 'upload_session_storage',
        fileName,
        fileSize,
        userId: user.id,
        token: presignedData.token,
        dbErrorCode: metadataError.code,
        phase: 'session_metadata_write',
        severity: 'medium'
      })
    }

    return NextResponse.json({
      success: true,
      uploadUrl: presignedData.signedUrl,
      token: presignedData.token,
      storagePath,
      expiresIn: 900 // 15 minutes in seconds
    })

  } catch (error) {
    logError(error instanceof Error ? error : new Error('Presigned upload route failed'), {
      operation: 'presigned_upload_route',
      phase: 'unknown',
      severity: 'critical'
    })

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to generate upload URL'
      },
      { status: 500 }
    )
  }
}