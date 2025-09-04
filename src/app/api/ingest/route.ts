import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'
import { processDocumentVectors } from '@/lib/ingest'

// GET - Load ingest jobs for admin interface
export async function GET(request: NextRequest) {
  try {
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
    { success: false, error: 'Admin access required' },
    { status: 403 }
  )
}

    // Get all ingest jobs
    const { data: jobs, error } = await supabaseAdmin
      .from('ingest_jobs')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json(
        { success: false, error: 'Failed to load ingest jobs' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      jobs: jobs || []
    })

  } catch (error) {
    console.error('Ingest GET error:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to load jobs' 
      },
      { status: 500 }
    )
  }
}

// POST - Start new ingest job
export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      )
    }

    // Get current user and check permissions
const user = await getCurrentUser()
if (!user || !['ADMIN', 'CONTRIBUTOR', 'SUPER_ADMIN'].includes(user.role)) {
  return NextResponse.json(
    { success: false, error: 'Admin access required' },
    { status: 403 }
  )
}

    // Get document ID from request
    const { documentId } = await request.json()
    if (!documentId) {
      return NextResponse.json(
        { success: false, error: 'Document ID required' },
        { status: 400 }
      )
    }

    // Use the shared batched processing function
    try {
      const result = await processDocumentVectors(documentId, userId)
      return NextResponse.json(result)
    } catch (processingError) {
      console.error('Processing error:', processingError)
      return NextResponse.json(
        { 
          success: false, 
          error: processingError instanceof Error ? processingError.message : 'Ingestion failed' 
        },
        { status: 500 }
      )
    }

  } catch (error) {
    console.error('Ingest error:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Ingestion failed' 
      },
      { status: 500 }
    )
  }
}