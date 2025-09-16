// Migrate documents that failed due to Voyage API content length limits
import { createClient } from '@supabase/supabase-js'
import { VoyageAIClient } from 'voyageai'
import { Pinecone } from '@pinecone-database/pinecone'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const voyage = new VoyageAIClient({
  apiKey: process.env.VOYAGE_API_KEY
})

const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY
})

// Create embeddings using Voyage AI
async function createEmbeddings(texts) {
  try {
    const response = await voyage.embed({
      input: texts.map(text => text.trim()),
      model: 'voyage-3-large'
    })
    
    return response.data?.map(item => item?.embedding).filter(Boolean) || []
  } catch (error) {
    console.error('Error creating embeddings:', error)
    throw new Error(`Failed to create embeddings: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

// Store chunks in Pinecone
async function storeChunks(chunks) {
  try {
    const index = pinecone.index(process.env.PINECONE_INDEX)
    const namespace = process.env.PINECONE_NAMESPACE || 'default'
    
    const vectors = chunks.map(chunk => ({
      id: chunk.id,
      values: chunk.embedding,
      metadata: {
        documentId: chunk.documentId,
        chunkIndex: chunk.chunkIndex,
        content: chunk.content.substring(0, 40000), // Pinecone metadata limit
        documentTitle: chunk.metadata.documentTitle || '',
        documentAuthor: chunk.metadata.documentAuthor || '',
        tokenCount: chunk.metadata.tokenCount || 0
      }
    }))

    const batchSize = 100
    for (let i = 0; i < vectors.length; i += batchSize) {
      const batch = vectors.slice(i, i + batchSize)
      await index.namespace(namespace).upsert(batch)
      console.log(`      📦 Uploaded batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(vectors.length / batchSize)}`)
    }
    
  } catch (error) {
    console.error('Error storing chunks in Pinecone:', error)
    throw new Error(`Failed to store chunks: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

// Enhanced chunking function for very large documents
function chunkTextForVoyage(text, maxChunkSize = 800, overlap = 150) {
  const sentences = text.match(/[^\.!?]+[\.!?]+/g) || [text]
  const chunks = []
  let currentChunk = ''
  let chunkIndex = 0

  for (const sentence of sentences) {
    const cleanSentence = sentence.trim()
    
    // If adding this sentence would exceed the limit, finalize current chunk
    if (currentChunk.length + cleanSentence.length > maxChunkSize && currentChunk.length > 0) {
      chunks.push({
        content: currentChunk.trim(),
        index: chunkIndex++,
        tokenCount: Math.ceil(currentChunk.length / 4) // Rough token estimate
      })
      
      // Start new chunk with overlap
      const words = currentChunk.split(' ')
      const overlapWords = words.slice(-Math.floor(overlap / 6)) // Rough overlap
      currentChunk = overlapWords.join(' ') + ' ' + cleanSentence
    } else {
      currentChunk += (currentChunk ? ' ' : '') + cleanSentence
    }
  }

  // Add final chunk
  if (currentChunk.trim()) {
    chunks.push({
      content: currentChunk.trim(),
      index: chunkIndex,
      tokenCount: Math.ceil(currentChunk.length / 4)
    })
  }

  return chunks
}

async function migrateFailedDocuments() {
  try {
    console.log('🔄 Starting migration of documents that failed due to content length...\n')
    
    // Get documents that failed due to Voyage content length limits
    const { data: failedJobs, error } = await supabase
      .from('ingest_jobs')
      .select(`
        id,
        document_id,
        error_message,
        documents (
          id,
          title,
          author,
          storage_path,
          content,
          mime_type
        )
      `)
      .eq('status', 'failed')
      .like('error_message', '%message length too large%')
    
    if (error) {
      throw new Error(`Failed to fetch failed jobs: ${error.message}`)
    }
    
    console.log(`📋 Found ${failedJobs.length} documents to migrate`)
    
    for (let i = 0; i < failedJobs.length; i++) {
      const job = failedJobs[i]
      const document = job.documents
      
      console.log(`\n📝 [${i + 1}/${failedJobs.length}] Processing: ${document.title}`)
      
      try {
        // Delete the failed job first
        await supabase
          .from('ingest_jobs')
          .delete()
          .eq('id', job.id)
        
        // Create new processing job
        const { data: newJob, error: jobError } = await supabase
          .from('ingest_jobs')
          .insert({
            document_id: document.id,
            status: 'processing',
            started_at: new Date().toISOString()
          })
          .select()
          .single()

        if (jobError) {
          throw new Error(`Failed to create new job: ${jobError.message}`)
        }

        // Use existing content
        const content = document.content
        
        if (!content) {
          throw new Error('No content available for processing - document may need to be re-uploaded')
        }

        // Chunk with smaller, Voyage-optimized chunks
        console.log('   ✂️  Creating smaller chunks for Voyage API...')
        const chunks = chunkTextForVoyage(content, 800, 150) // Smaller chunks
        console.log(`   📦 Created ${chunks.length} chunks`)

        if (chunks.length === 0) {
          throw new Error('No chunks created from content')
        }

        // Create embeddings in smaller batches with more conservative rate limiting
        console.log('   🔮 Creating embeddings with enhanced rate limiting...')
        const embeddings = []
        const batchSize = 20 // Smaller batches for problematic content
        const chunkContents = chunks.map(chunk => chunk.content)

        for (let j = 0; j < chunkContents.length; j += batchSize) {
          const batch = chunkContents.slice(j, j + batchSize)
          const batchNumber = Math.floor(j/batchSize) + 1
          const totalBatches = Math.ceil(chunkContents.length/batchSize)
          
          console.log(`   📊 Processing embedding batch ${batchNumber}/${totalBatches} (${batch.length} chunks)`)
          
          try {
            const batchEmbeddings = await createEmbeddings(batch)
            embeddings.push(...batchEmbeddings)
          } catch (error) {
            if (error instanceof Error && error.message.includes('429')) {
              console.log('   ⏳ Rate limit hit, waiting 60 seconds...')
              await new Promise(resolve => setTimeout(resolve, 60000))
              
              // Retry with even smaller batch
              console.log(`   🔄 Retrying with smaller batch...`)
              const smallerBatch = batch.slice(0, 5) // Try just 5 at a time
              const batchEmbeddings = await createEmbeddings(smallerBatch)
              embeddings.push(...batchEmbeddings)
              
              // Process remaining in smaller chunks
              for (let k = 5; k < batch.length; k += 5) {
                const microBatch = batch.slice(k, k + 5)
                console.log(`   📦 Processing micro-batch ${Math.floor(k/5) + 1}...`)
                const microEmbeddings = await createEmbeddings(microBatch)
                embeddings.push(...microEmbeddings)
                await new Promise(resolve => setTimeout(resolve, 30000)) // 30s between micro-batches
              }
            } else {
              throw error
            }
          }
          
          // Extended delay between batches for problematic documents
          if (batchNumber < totalBatches) {
            console.log('   ⏳ Waiting 45 seconds between batches...')
            await new Promise(resolve => setTimeout(resolve, 45000))
          }
        }

        console.log(`   ✅ Created ${embeddings.length} embeddings`)

        // Store chunks in database
        console.log('   💾 Storing chunks in database...')
        const chunkRecords = []
        
        for (let k = 0; k < chunks.length; k++) {
          const { data: chunkRecord, error: chunkError } = await supabase
            .from('chunks')
            .insert({
              document_id: document.id,
              content: chunks[k].content,
              chunk_index: chunks[k].index,
              token_count: chunks[k].tokenCount,
              metadata: {
                documentTitle: document.title,
                documentAuthor: document.author,
                processingDate: new Date().toISOString(),
                migrationNote: 'Migrated with enhanced chunking for Voyage API'
              }
            })
            .select()
            .single()

          if (chunkError) {
            throw new Error(`Failed to store chunk ${k}: ${chunkError.message}`)
          }

          chunkRecords.push({
            ...chunkRecord,
            embedding: embeddings[k]
          })
        }

        // Store embeddings in Pinecone
        console.log('   🌲 Storing embeddings in Pinecone...')
        const pineconeChunks = chunkRecords.map(chunk => ({
          id: chunk.id,
          documentId: document.id,
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

        // Store in Pinecone in batches
        const pineconeeBatchSize = 50
        for (let k = 0; k < pineconeChunks.length; k += pineconeeBatchSize) {
          const pineconeBatch = pineconeChunks.slice(k, k + pineconeeBatchSize)
          console.log(`   🌲 Storing Pinecone batch ${Math.floor(k/pineconeeBatchSize) + 1}/${Math.ceil(pineconeChunks.length/pineconeeBatchSize)}`)
          await storeChunks(pineconeBatch)
        }

        // Update job status to completed
        await supabase
          .from('ingest_jobs')
          .update({
            status: 'completed',
            chunks_created: chunks.length,
            completed_at: new Date().toISOString()
          })
          .eq('id', newJob.id)

        console.log(`   ✅ Successfully migrated: ${document.title}`)

      } catch (processingError) {
        console.error(`   ❌ Failed to migrate "${document.title}":`, processingError.message)
        
        // Update job to failed if it exists
        try {
          await supabase
            .from('ingest_jobs')
            .update({
              status: 'failed',
              error_message: `Migration failed: ${processingError.message}`,
              completed_at: new Date().toISOString()
            })
            .eq('document_id', document.id)
        } catch (updateError) {
          console.error('   ⚠️  Could not update job status:', updateError.message)
        }
      }
    }

    console.log('\n🎉 Migration completed!')
    console.log('📊 Check the admin panel to verify all documents are now processed.')

  } catch (error) {
    console.error('❌ Migration script error:', error)
  }
}

migrateFailedDocuments()