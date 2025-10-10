import { NextRequest, NextResponse } from 'next/server'
import { logError } from '@/lib/logger'
import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'
import { processDocumentVectors } from '@/lib/ingest'

// GET - Load ingest jobs for admin interface
export async function GET(_request: NextRequest) {
  try {
    // getCurrentUser() handles both Supabase and Clerk auth
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      )
    }

    if (!['ADMIN', 'CONTRIBUTOR', 'SUPER_ADMIN'].includes(user.role)) {
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
    logError(error instanceof Error ? error : new Error('Internal server error'), {
      operation: 'API ingest',
      phase: 'request_handling',
      severity: 'high',
      errorContext: 'Internal server error'
    })
return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to load jobs' 
      },
      { status: 500 }
    )
  }
}

// POST - Start new ingest job
export async function POST(_request: NextRequest) {
  try {
    // getCurrentUser() handles both Supabase and Clerk auth
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      )
    }

    // Check permissions
    if (!['ADMIN', 'CONTRIBUTOR', 'SUPER_ADMIN'].includes(user.role)) {
      return NextResponse.json(
        { success: false, error: 'Admin access required' },
        { status: 403 }
      )
    }

    // Get document ID from request
    const { documentId } = await _request.json()
    if (!documentId) {
      return NextResponse.json(
        { success: false, error: 'Document ID required' },
        { status: 400 }
      )
    }

    // Use the shared batched processing function
    try {
      const result = await processDocumentVectors(documentId, user.id)
      return NextResponse.json(result)
    } catch (processingError) {
      return NextResponse.json(
        { 
          success: false, 
          error: processingError instanceof Error ? processingError.message : 'Ingestion failed' 
        },
        { status: 500 }
      )
    }

  } catch (error) {
    logError(error instanceof Error ? error : new Error('Internal server error'), {
      operation: 'API ingest',
      phase: 'request_handling',
      severity: 'high',
      errorContext: 'Internal server error'
    })
return NextResponse.json(
      { 
        success: false, 
        error: 'Ingestion failed' 
      },
      { status: 500 }
    )
  }
}