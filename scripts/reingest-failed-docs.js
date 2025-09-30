#!/usr/bin/env node
/**
 * Re-ingest the 4 documents that failed to create chunks via API calls
 *
 * These documents have content extracted but no ingest jobs were created:
 * - Hindi_2414_Book
 * - Chinese_2414_Book
 * - Bengali_2414_Book
 * - 24_14-arabic
 */

const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

// Direct implementation of the ingest logic to avoid TypeScript/path issues
async function processDocument(documentId, supabase) {
  // Import the necessary modules
  const { chunkText } = await import('../dist/lib/fileProcessors.js')
  const { createEmbeddings } = await import('../dist/lib/openai.js')
  const { storeChunks } = await import('../dist/lib/pinecone.js')

  // Get document from database
  const { data: document, error: docError } = await supabase
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
  const { data: job, error: jobError } = await supabase
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
    console.log(`  Chunking text...`)
    const chunks = chunkText(document.content, 1000, 200)
    console.log(`  Created ${chunks.length} chunks`)

    if (chunks.length === 0) {
      throw new Error('No chunks created from document content')
    }

    // Create embeddings
    console.log('  Creating embeddings...')
    const chunkContents = chunks.map(chunk => chunk.content)
    const embeddings = await createEmbeddings(chunkContents)
    console.log(`  Created ${embeddings.length} embeddings`)

    if (embeddings.length !== chunks.length) {
      throw new Error(`Embedding count mismatch: expected ${chunks.length}, got ${embeddings.length}`)
    }

    // Store chunks in database
    console.log('  Storing chunks in database...')
    const chunkRecords = []
    
    for (let i = 0; i < chunks.length; i++) {
      const { data: chunkRecord, error: chunkError } = await supabase
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

    // Store embeddings in Pinecone
    console.log('  Storing embeddings in Pinecone...')
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

    const batchSize = 100
    for (let i = 0; i < pineconeChunks.length; i += batchSize) {
      const batch = pineconeChunks.slice(i, i + batchSize)
      await storeChunks(batch)
    }

    // Update job status
    await supabase
      .from('ingest_jobs')
      .update({
        status: 'completed',
        chunks_created: chunks.length,
        completed_at: new Date().toISOString()
      })
      .eq('id', job.id)

    return {
      success: true,
      chunksCreated: chunks.length,
      documentTitle: document.title
    }

  } catch (processingError) {
    // Update job status to failed
    await supabase
      .from('ingest_jobs')
      .update({
        status: 'failed',
        error_message: processingError.message,
        completed_at: new Date().toISOString()
      })
      .eq('id', job.id)

    throw processingError
  }
}

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  const failedDocuments = [
    { id: '36befb69-e7de-41d7-9c46-90a8b1fecf55', title: 'Hindi_2414_Book' },
    { id: 'db8663e6-261d-4fe2-9a9b-9ecfffa030a9', title: 'Chinese_2414_Book' },
    { id: 'd39ae664-dec6-401d-a283-5d742d7618dd', title: 'Bengali_2414_Book' },
    { id: '82de496c-c7d6-4c00-9fe6-c1240a8f34ce', title: '24_14-arabic' }
  ]

  console.log('🔄 Starting re-ingestion of 4 failed documents...\n')

  let successCount = 0
  let failCount = 0

  for (const doc of failedDocuments) {
    console.log(`\n${'='.repeat(80)}`)
    console.log(`Processing: ${doc.title}`)
    console.log(`Document ID: ${doc.id}`)
    console.log('='.repeat(80))

    try {
      const result = await processDocument(doc.id, supabase)

      if (result.success) {
        console.log(`✅ SUCCESS: Created ${result.chunksCreated} chunks`)
        successCount++

        // Verify
        const { count } = await supabase
          .from('chunks')
          .select('id', { count: 'exact', head: true })
          .eq('document_id', doc.id)

        console.log(`✓ Verified: ${count} chunks in database`)
      }

    } catch (error) {
      console.error(`❌ ERROR: ${error.message}`)
      failCount++
    }

    // Wait between documents
    if (doc !== failedDocuments[failedDocuments.length - 1]) {
      console.log('\nWaiting 2 seconds...')
      await new Promise(resolve => setTimeout(resolve, 2000))
    }
  }

  console.log(`\n\n${'='.repeat(80)}`)
  console.log('📊 FINAL RESULTS')
  console.log('='.repeat(80))
  console.log(`✅ Successful: ${successCount}/${failedDocuments.length}`)
  console.log(`❌ Failed: ${failCount}/${failedDocuments.length}`)
  console.log('='.repeat(80))

  if (successCount === failedDocuments.length) {
    console.log('\n🎉 All documents successfully re-ingested!')
  } else if (successCount > 0) {
    console.log('\n⚠️  Some documents failed. Check errors above.')
  } else {
    console.log('\n❌ All documents failed. Check errors and try again.')
  }
}

main().catch(error => {
  console.error('\n💥 Fatal error:', error)
  process.exit(1)
})
