// Retry failed document migrations with improved rate limiting
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

// Simplified version of the ingest function for this script
async function processDocument(documentId) {
  try {
    console.log('   📋 Creating ingest job...')
    
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
      throw new Error(`Failed to create job: ${jobError.message}`)
    }

    console.log(`   📄 Fetching document...`)
    
    // Get document content
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single()

    if (docError || !document) {
      throw new Error(`Document not found: ${docError?.message}`)
    }

    if (!document.content) {
      throw new Error('Document has no content')
    }

    console.log(`   ✂️  Creating chunks...`)
    
    // Create chunks (simplified version)
    const chunks = chunkTextForVoyage(document.content, 800, 150)
    console.log(`   📦 Created ${chunks.length} chunks`)

    if (chunks.length === 0) {
      throw new Error('No chunks created from content')
    }

    // Create embeddings in small batches
    console.log('   🔮 Creating embeddings...')
    const embeddings = []
    const batchSize = 10 // Small batches for retry safety
    const chunkContents = chunks.map(chunk => chunk.content)

    for (let i = 0; i < chunkContents.length; i += batchSize) {
      const batch = chunkContents.slice(i, i + batchSize)
      const batchNumber = Math.floor(i/batchSize) + 1
      const totalBatches = Math.ceil(chunkContents.length/batchSize)
      
      console.log(`   📊 Processing embedding batch ${batchNumber}/${totalBatches}`)
      
      try {
        const response = await voyage.embed({
          input: batch.map(text => text.trim()),
          model: 'voyage-3-large'
        })
        
        const batchEmbeddings = response.data?.map(item => item?.embedding).filter(Boolean) || []
        embeddings.push(...batchEmbeddings)
      } catch (error) {
        if (error.message && error.message.includes('429')) {
          console.log('   ⏳ Rate limit hit, waiting 60 seconds...')
          await new Promise(resolve => setTimeout(resolve, 60000))
          
          // Retry smaller batch
          const response = await voyage.embed({
            input: batch.map(text => text.trim()),
            model: 'voyage-3-large'
          })
          
          const batchEmbeddings = response.data?.map(item => item?.embedding).filter(Boolean) || []
          embeddings.push(...batchEmbeddings)
        } else {
          throw error
        }
      }
      
      // Delay between batches
      if (batchNumber < totalBatches) {
        console.log('   ⏳ Waiting 30 seconds between batches...')
        await new Promise(resolve => setTimeout(resolve, 30000))
      }
    }

    console.log(`   ✅ Created ${embeddings.length} embeddings`)

    // Store chunks in database
    console.log('   💾 Storing chunks in database...')
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
            processingDate: new Date().toISOString(),
            retryNote: 'Retried with enhanced rate limiting'
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

    // Store in Pinecone
    console.log('   🌲 Storing embeddings in Pinecone...')
    const index = pinecone.index(process.env.PINECONE_INDEX)
    const namespace = process.env.PINECONE_NAMESPACE || 'default'
    
    const vectors = chunkRecords.map(chunk => ({
      id: chunk.id,
      values: chunk.embedding,
      metadata: {
        documentId: documentId,
        chunkIndex: chunk.chunk_index,
        content: chunk.content.substring(0, 40000),
        documentTitle: document.title || '',
        documentAuthor: document.author || '',
        tokenCount: chunk.token_count || 0
      }
    }))

    const pineBatchSize = 50
    for (let i = 0; i < vectors.length; i += pineBatchSize) {
      const batch = vectors.slice(i, i + pineBatchSize)
      await index.namespace(namespace).upsert(batch)
      console.log(`   🌲 Stored Pinecone batch ${Math.floor(i/pineBatchSize) + 1}/${Math.ceil(vectors.length/pineBatchSize)}`)
    }

    // Update job to completed
    await supabase
      .from('ingest_jobs')
      .update({
        status: 'completed',
        chunks_created: chunks.length,
        completed_at: new Date().toISOString()
      })
      .eq('id', job.id)

    return { success: true, chunksCreated: chunks.length }

  } catch (error) {
    console.error(`   ❌ Processing error: ${error.message}`)
    
    // Update job to failed
    try {
      await supabase
        .from('ingest_jobs')
        .update({
          status: 'failed',
          error_message: `Retry failed: ${error.message}`,
          completed_at: new Date().toISOString()
        })
        .eq('document_id', documentId)
    } catch (updateError) {
      console.error('   ⚠️  Could not update job status:', updateError.message)
    }
    
    return { success: false, error: error.message }
  }
}

// Enhanced chunking function for Voyage
function chunkTextForVoyage(text, maxChunkSize = 800, overlap = 150) {
  const sentences = text.match(/[^\.!?]+[\.!?]+/g) || [text]
  const chunks = []
  let currentChunk = ''
  let chunkIndex = 0

  for (const sentence of sentences) {
    const cleanSentence = sentence.trim()
    
    if (currentChunk.length + cleanSentence.length > maxChunkSize && currentChunk.length > 0) {
      chunks.push({
        content: currentChunk.trim(),
        index: chunkIndex++,
        tokenCount: Math.ceil(currentChunk.length / 4)
      })
      
      // Start new chunk with overlap
      const words = currentChunk.split(' ')
      const overlapWords = words.slice(-Math.floor(overlap / 6))
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

async function retryFailedMigrations() {
  try {
    console.log('🔄 Retrying failed document migrations...\n')
    
    // Get all failed documents (excluding the 2 that are too large for Voyage)
    const { data: failedJobs, error } = await supabase
      .from('ingest_jobs')
      .select(`
        id,
        document_id,
        error_message,
        documents (
          id,
          title,
          author
        )
      `)
      .eq('status', 'failed')
      .order('created_at', { ascending: true })
    
    if (error) {
      throw new Error(`Failed to fetch failed jobs: ${error.message}`)
    }
    
    console.log(`📋 Found ${failedJobs.length} failed documents`)
    
    // Filter out documents that are too large for Voyage API
    const retryableJobs = failedJobs.filter(job => 
      !job.error_message?.includes('message length too large')
    )
    
    const tooLargeJobs = failedJobs.filter(job => 
      job.error_message?.includes('message length too large')
    )
    
    console.log(`✅ Retryable documents: ${retryableJobs.length}`)
    console.log(`⚠️  Too large for Voyage API: ${tooLargeJobs.length}`)
    
    if (tooLargeJobs.length > 0) {
      console.log('\\n⚠️  Documents too large for Voyage API (skipping):')
      tooLargeJobs.forEach(job => {
        console.log(`   - ${job.documents?.title}`)
      })
    }
    
    console.log('\\n🔄 Retrying documents...')
    
    // Retry each document by triggering re-ingestion
    let successCount = 0
    let failCount = 0
    
    for (let i = 0; i < retryableJobs.length; i++) {
      const job = retryableJobs[i]
      const docTitle = job.documents?.title || 'Unknown'
      
      console.log(`\\n📝 [${i + 1}/${retryableJobs.length}] Retrying: ${docTitle}`)
      
      try {
        // Delete the failed job
        await supabase
          .from('ingest_jobs')
          .delete()
          .eq('id', job.id)
        
        // Trigger re-ingestion directly using the ingest function
        console.log(`   🔄 Starting direct ingestion...`)
        const result = await processDocument(job.document_id)
        
        if (result.success) {
          console.log(`   ✅ Successfully processed (${result.chunksCreated} chunks)`)
          successCount++
        } else {
          console.log(`   ❌ Processing failed: ${result.error}`)
          failCount++
        }
        
        // Add delay between requests to avoid overwhelming the system
        if (i < retryableJobs.length - 1) {
          console.log('   ⏳ Waiting 5 seconds before next retry...')
          await new Promise(resolve => setTimeout(resolve, 5000))
        }
        
      } catch (error) {
        console.log(`   ❌ Error retrying "${docTitle}": ${error.message}`)
        failCount++
      }
    }
    
    console.log('\\n🎉 Retry Summary:')
    console.log(`✅ Successfully queued for retry: ${successCount}`)
    console.log(`❌ Failed to retry: ${failCount}`)
    console.log(`⚠️  Skipped (too large): ${tooLargeJobs.length}`)
    
    if (successCount > 0) {
      console.log('\\n📝 Note: Documents have been processed with enhanced rate limiting.')
      console.log('   Check the admin panel to verify the completed jobs.')
      console.log('   All successful documents should now be searchable.')
    }
    
  } catch (error) {
    console.error('❌ Script error:', error)
  }
}

retryFailedMigrations()