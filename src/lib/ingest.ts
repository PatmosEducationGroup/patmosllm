// src/lib/ingest.ts
import { supabaseAdmin } from '@/lib/supabase'
import { chunkText } from '@/lib/fileProcessors'
import { createEmbeddings } from '@/lib/openai'
import { storeChunks } from '@/lib/pinecone'

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
    console.log(`Starting ingestion for document: ${document.title}`)

    // Step 1: Chunk the text
    console.log('Chunking text...')
    const chunks = chunkText(document.content, 1000, 200)
    console.log(`Created ${chunks.length} chunks`)

    if (chunks.length === 0) {
      throw new Error('No chunks created from document content')
    }

    // Step 2: Create embeddings in batches
    console.log('Creating embeddings in batches...')
    const embeddings = []
    const batchSize = 100 // Process 1000 chunks at a time
    const chunkContents = chunks.map(chunk => chunk.content)

    for (let i = 0; i < chunkContents.length; i += batchSize) {
      const batch = chunkContents.slice(i, i + batchSize)
      const batchNumber = Math.floor(i/batchSize) + 1
      const totalBatches = Math.ceil(chunkContents.length/batchSize)
      
      console.log(`Processing embedding batch ${batchNumber}/${totalBatches} (${batch.length} chunks)`)
      const batchEmbeddings = await createEmbeddings(batch)
      embeddings.push(...batchEmbeddings)
    }

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

    // Step 4: Store embeddings in Pinecone in batches
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

    // Store in Pinecone in batches of 100 vectors at a time
    const pineconeeBatchSize = 100
    for (let i = 0; i < pineconeChunks.length; i += pineconeeBatchSize) {
      const pineconeBatch = pineconeChunks.slice(i, i + pineconeeBatchSize)
      const batchNumber = Math.floor(i/pineconeeBatchSize) + 1
      const totalBatches = Math.ceil(pineconeChunks.length/pineconeeBatchSize)
      
      console.log(`Storing Pinecone batch ${batchNumber}/${totalBatches} (${pineconeBatch.length} vectors)`)
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

    console.log(`Successfully ingested document: ${document.title}`)

    return {
      success: true,
      chunksCreated: chunks.length,
      documentTitle: document.title
    }

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
}