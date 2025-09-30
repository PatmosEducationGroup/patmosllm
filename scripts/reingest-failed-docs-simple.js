#!/usr/bin/env node
/**
 * Re-ingest the 4 documents by directly calling the ingestion functions
 * This version uses inline implementation to avoid TypeScript import issues
 */

const { createClient } = require('@supabase/supabase-js')
const { Pinecone } = require('@pinecone-database/pinecone')
require('dotenv').config({ path: '.env.local' })

// Simple text chunking function
function chunkText(text, chunkSize = 1000, overlap = 200) {
  const chunks = []
  let startIndex = 0
  let chunkIndex = 0

  while (startIndex < text.length) {
    const endIndex = Math.min(startIndex + chunkSize, text.length)
    const chunkContent = text.slice(startIndex, endIndex)
    
    // Estimate token count (rough approximation: 1 token ≈ 3.2 chars)
    const tokenCount = Math.ceil(chunkContent.length / 3.2)
    
    chunks.push({
      content: chunkContent,
      index: chunkIndex,
      tokenCount: tokenCount
    })
    
    chunkIndex++
    startIndex += chunkSize - overlap
  }

  return chunks
}

// Create embeddings using Voyage AI
async function createEmbeddings(texts) {
  const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY
  const response = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${VOYAGE_API_KEY}`
    },
    body: JSON.stringify({
      input: texts,
      model: 'voyage-3-large'
    })
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Voyage API error: ${error}`)
  }

  const data = await response.json()
  return data.data.map(item => item.embedding)
}

// Store chunks in Pinecone
async function storeChunks(chunks, pineconeIndex) {
  const namespace = process.env.PINECONE_NAMESPACE || 'default'

  const vectors = chunks.map(chunk => ({
    id: chunk.id,
    values: chunk.embedding,
    metadata: {
      documentId: chunk.documentId,
      documentTitle: chunk.metadata.documentTitle,
      documentAuthor: chunk.metadata.documentAuthor || '',
      chunkIndex: chunk.metadata.chunkIndex,
      content: chunk.content.substring(0, 1000), // Pinecone metadata limit
      tokenCount: chunk.metadata.tokenCount
    }
  }))

  // Upsert in batches of 100
  for (let i = 0; i < vectors.length; i += 100) {
    const batch = vectors.slice(i, i + 100)
    await pineconeIndex.namespace(namespace).upsert(batch)
  }
}

async function processDocument(documentId, supabase, pineconeIndex) {
  // Get document
  const { data: document, error: docError } = await supabase
    .from('documents')
    .select('*')
    .eq('id', documentId)
    .single()

  if (docError || !document) {
    throw new Error('Document not found')
  }

  if (!document.content) {
    throw new Error('Document has no content')
  }

  console.log(`  Content: ${document.content.length} characters`)

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
    throw new Error(`Failed to create ingest job: ${jobError.message}`)
  }

  try {
    // Chunk text
    console.log(`  Chunking text...`)
    const chunks = chunkText(document.content, 1000, 200)
    console.log(`  Created ${chunks.length} chunks`)

    if (chunks.length === 0) {
      throw new Error('No chunks created')
    }

    // Create embeddings in batches
    console.log(`  Creating embeddings...`)
    const chunkContents = chunks.map(c => c.content)
    
    // Process in batches of 100 to avoid rate limits
    const allEmbeddings = []
    for (let i = 0; i < chunkContents.length; i += 100) {
      const batch = chunkContents.slice(i, i + 100)
      console.log(`    Batch ${Math.floor(i/100) + 1}/${Math.ceil(chunkContents.length/100)}...`)
      const batchEmbeddings = await createEmbeddings(batch)
      allEmbeddings.push(...batchEmbeddings)
      
      // Wait 1 second between batches
      if (i + 100 < chunkContents.length) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }

    console.log(`  Created ${allEmbeddings.length} embeddings`)

    if (allEmbeddings.length !== chunks.length) {
      throw new Error(`Embedding mismatch: ${chunks.length} chunks, ${allEmbeddings.length} embeddings`)
    }

    // Store chunks in database
    console.log(`  Storing chunks in database...`)
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
        embedding: allEmbeddings[i]
      })
    }

    console.log(`  Stored ${chunkRecords.length} chunks in database`)

    // Store in Pinecone
    console.log(`  Storing embeddings in Pinecone...`)
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

    await storeChunks(pineconeChunks, pineconeIndex)

    // Update job
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
      chunksCreated: chunks.length
    }

  } catch (error) {
    await supabase
      .from('ingest_jobs')
      .update({
        status: 'failed',
        error_message: error.message,
        completed_at: new Date().toISOString()
      })
      .eq('id', job.id)

    throw error
  }
}

async function main() {
  console.log('🔄 Starting re-ingestion of 4 failed documents...\n')

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  // Initialize Pinecone
  const pinecone = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY
  })
  const pineconeIndex = pinecone.index(process.env.PINECONE_INDEX || 'patmosllm-voyage')

  const failedDocuments = [
    { id: '36befb69-e7de-41d7-9c46-90a8b1fecf55', title: 'Hindi_2414_Book' },
    { id: 'db8663e6-261d-4fe2-9a9b-9ecfffa030a9', title: 'Chinese_2414_Book' },
    { id: 'd39ae664-dec6-401d-a283-5d742d7618dd', title: 'Bengali_2414_Book' },
    { id: '82de496c-c7d6-4c00-9fe6-c1240a8f34ce', title: '24_14-arabic' }
  ]

  let successCount = 0
  let failCount = 0

  for (const doc of failedDocuments) {
    console.log(`\n${'='.repeat(80)}`)
    console.log(`Processing: ${doc.title}`)
    console.log(`Document ID: ${doc.id}`)
    console.log('='.repeat(80))

    try {
      const result = await processDocument(doc.id, supabase, pineconeIndex)

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
      console.log('\nWaiting 3 seconds before next document...')
      await new Promise(resolve => setTimeout(resolve, 3000))
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
    console.log('\n❌ All documents failed.')
  }
}

main().catch(error => {
  console.error('\n💥 Fatal error:', error)
  process.exit(1)
})
