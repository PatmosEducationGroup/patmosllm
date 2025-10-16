// src/lib/ingest.ts
import { supabaseAdmin } from '@/lib/supabase'
import { chunkText } from '@/lib/fileProcessors'
import { createEmbeddings } from '@/lib/openai'
import { storeChunks } from '@/lib/pinecone'
import { logger, loggers, logError } from '@/lib/logger'

export async function processDocumentVectors(documentId: string, userId: string) {
  // Get document from database
  const { data: document, error: docError } = await supabaseAdmin
    .from('documents')
    .select('*')
    .eq('id', documentId)
    .single()

  if (docError || !document) {
    throw new Error('Document not found')
  }

  if (!document.content) {
    throw new Error('Document has no content to process')
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
    throw new Error('Failed to create ingest job')
  }

  try {
    logger.info({
      documentId,
      documentTitle: document.title,
      contentLength: document.content.length,
      jobId: job.id
    }, 'Starting document ingestion')

    // Step 1: Chunk the text
    logger.info({ documentId, documentTitle: document.title }, 'Chunking document text')
    const chunks = chunkText(document.content, 1000, 200)
    loggers.performance({
      documentId,
      documentTitle: document.title,
      chunksCreated: chunks.length,
      chunkSize: 1000,
      overlap: 200
    }, 'Text chunking completed')

    if (chunks.length === 0) {
      throw new Error('No chunks created from document content')
    }

    // Step 2: Create embeddings using token-aware batching
    logger.info({
      documentId,
      documentTitle: document.title,
      chunksToEmbed: chunks.length
    }, 'Creating embeddings with token-aware batching')
    const chunkContents = chunks.map(chunk => chunk.content)
    let embeddings: number[][]

    try {
      // Generate requestId for idempotency
      const requestId = crypto.randomUUID()

      // The createEmbeddings function now handles token validation and automatic batching
      embeddings = await createEmbeddings(chunkContents, 0, userId, requestId)
      loggers.ai({
        documentId,
        documentTitle: document.title,
        embeddingsCreated: embeddings.length,
        embeddingModel: 'voyage-3-large',
        dimension: embeddings[0]?.length || 0
      }, 'Successfully created embeddings')

      if (embeddings.length !== chunks.length) {
        throw new Error(`Embedding count mismatch: expected ${chunks.length}, got ${embeddings.length}`)
      }
    } catch (error) {
      logError(error instanceof Error ? error : new Error('Embedding generation failed during document processing'), {
        operation: 'processDocumentVectors',
        phase: 'embedding_generation',
        severity: 'high',
        documentId,
        documentTitle: document.title,
        chunkCount: chunks.length,
        errorContext: 'Failed to generate embeddings for document chunks'
      })

      if (error instanceof Error && error.message.includes('429')) {
        logger.warn({
          documentId,
          documentTitle: document.title,
          error: error.message,
          retryDelay: 30000
        }, 'Rate limit hit, waiting before retry')
        await new Promise(resolve => setTimeout(resolve, 30000))

        // Retry with the improved system
        logger.info({
          documentId,
          documentTitle: document.title,
          attempt: 'retry'
        }, 'Retrying embeddings with token-aware batching')
        const retryRequestId = crypto.randomUUID()
        embeddings = await createEmbeddings(chunkContents, 0, userId, retryRequestId)

        if (embeddings.length !== chunks.length) {
          throw new Error(`Embedding count mismatch on retry: expected ${chunks.length}, got ${embeddings.length}`)
        }
      } else {
        throw error
      }
    }

    // Step 3: Store chunks in database
    logger.info({
      documentId,
      documentTitle: document.title,
      chunksToStore: chunks.length
    }, 'Storing chunks in database')
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

    loggers.database({
      documentId,
      documentTitle: document.title,
      chunksInserted: chunkRecords.length,
      operation: 'chunk_insert'
    }, 'Chunks stored in database')

    // Step 4: Store embeddings in Pinecone in batches
    logger.info({
      documentId,
      documentTitle: document.title,
      vectorsToStore: chunkRecords.length
    }, 'Storing embeddings in Pinecone')
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

    // Store in Pinecone in batches of 100 vectors at a time
    const pineconeeBatchSize = 100
    for (let i = 0; i < pineconeChunks.length; i += pineconeeBatchSize) {
      const pineconeBatch = pineconeChunks.slice(i, i + pineconeeBatchSize)
      const batchNumber = Math.floor(i/pineconeeBatchSize) + 1
      const totalBatches = Math.ceil(pineconeChunks.length/pineconeeBatchSize)

      loggers.database({
        documentId,
        documentTitle: document.title,
        batchNumber,
        totalBatches,
        batchSize: pineconeBatch.length,
        operation: 'pinecone_upsert'
      }, `Storing Pinecone batch ${batchNumber}/${totalBatches}`)
      await storeChunks(pineconeBatch)
    }

    // Update job status to completed
    await supabaseAdmin
      .from('ingest_jobs')
      .update({
        status: 'completed',
        chunks_created: chunks.length,
        completed_at: new Date().toISOString()
      })
      .eq('id', job.id)

    logger.info({
      documentId,
      documentTitle: document.title,
      chunksCreated: chunks.length,
      jobId: job.id,
      status: 'completed'
    }, 'Document ingestion completed successfully')

    return {
      success: true,
      chunksCreated: chunks.length,
      documentTitle: document.title
    }

  } catch (processingError) {
    logError(processingError instanceof Error ? processingError : new Error(String(processingError)), {
      documentId,
      documentTitle: document.title,
      jobId: job.id,
      operation: 'document_ingestion'
    })

    // Update job status to failed
    await supabaseAdmin
      .from('ingest_jobs')
      .update({
        status: 'failed',
        error_message: processingError instanceof Error ? processingError.message : '',
        completed_at: new Date().toISOString()
      })
      .eq('id', job.id)

    throw processingError
  }
}