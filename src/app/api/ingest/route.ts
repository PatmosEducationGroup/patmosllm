import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase'
import { chunkText } from '@/lib/fileProcessors'
import { createEmbeddings } from '@/lib/openai'
import { storeChunks } from '@/lib/pinecone'
import { getCurrentUser } from '@/lib/auth'

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
    if (!user || user.role !== 'ADMIN') {
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
    if (!user || user.role !== 'ADMIN') {
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

    // Get document from database
    const { data: document, error: docError } = await supabaseAdmin
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single()

    if (docError || !document) {
      return NextResponse.json(
        { success: false, error: 'Document not found' },
        { status: 404 }
      )
    }

    if (!document.content) {
      return NextResponse.json(
        { success: false, error: 'Document has no content to process' },
        { status: 400 }
      )
    }

    // Create ingest job
    const { data: job, error: jobError } = await supabaseAdmin
      .from('ingest_jobs')
      .insert({
        document_id: documentId,
        status: 'processing',
        started_at: new Date().toISOString()
      })
      .select()
      .single()

    if (jobError) {
      return NextResponse.json(
        { success: false, error: 'Failed to create ingest job' },
        { status: 500 }
      )
    }

    try {
      console.log(`Starting ingestion for document: ${document.title}`)

      // Step 1: Chunk the text
      console.log('Chunking text...')
      const chunks = chunkText(document.content, 1000, 200)
      console.log(`Created ${chunks.length} chunks`)

      if (chunks.length === 0) {
        throw new Error('No chunks created from document content')
      }

      // Step 2: Create embeddings for all chunks
      console.log('Creating embeddings...')
      const chunkContents = chunks.map(chunk => chunk.content)
      const embeddings = await createEmbeddings(chunkContents)
      console.log(`Created ${embeddings.length} embeddings`)

      // Step 3: Store chunks in database
      console.log('Storing chunks in database...')
      const chunkRecords = []
      
      for (let i = 0; i < chunks.length; i++) {
        const { data: chunkRecord, error: chunkError } = await supabaseAdmin
          .from('chunks')
          .insert({
            document_id: documentId,
            content: chunks[i].content,
            chunk_index: chunks[i].index,
            token_count: chunks[i].tokenCount,
            metadata: {
              documentTitle: document.title,
              documentAuthor: document.author,
              processingDate: new Date().toISOString()
            }
          })
          .select()
          .single()

        if (chunkError) {
          throw new Error(`Failed to store chunk ${i}: ${chunkError.message}`)
        }

        chunkRecords.push({
          ...chunkRecord,
          embedding: embeddings[i]
        })
      }

      // Step 4: Store embeddings in Pinecone
      console.log('Storing embeddings in Pinecone...')
      const pineconeChunks = chunkRecords.map(chunk => ({
        id: chunk.id,
        documentId: documentId,
        chunkIndex: chunk.chunk_index,
        content: chunk.content,
        embedding: chunk.embedding,
        metadata: {
          documentTitle: document.title,
          documentAuthor: document.author,
          chunkIndex: chunk.chunk_index,
          tokenCount: chunk.token_count
        }
      }))

      await storeChunks(pineconeChunks)

      // Update job status to completed
      await supabaseAdmin
        .from('ingest_jobs')
        .update({
          status: 'completed',
          chunks_created: chunks.length,
          completed_at: new Date().toISOString()
        })
        .eq('id', job.id)

      console.log(`Successfully ingested document: ${document.title}`)

      return NextResponse.json({
        success: true,
        chunksCreated: chunks.length,
        documentTitle: document.title
      })

    } catch (processingError) {
      console.error('Processing error:', processingError)

      // Update job status to failed
      await supabaseAdmin
        .from('ingest_jobs')
        .update({
          status: 'failed',
          error_message: processingError instanceof Error ? processingError.message : 'Unknown error',
          completed_at: new Date().toISOString()
        })
        .eq('id', job.id)

      throw processingError
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