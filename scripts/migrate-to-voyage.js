// Migration script to create new Pinecone index and re-ingest all documents with Voyage embeddings
import { Pinecone } from '@pinecone-database/pinecone'
import { createClient } from '@supabase/supabase-js'
import { VoyageAIClient } from 'voyageai'
import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'

// Import the proper chunking function
const chunkTextCode = fs.readFileSync(path.join(process.cwd(), 'src/lib/fileProcessors.ts'), 'utf8')
const chunkTextMatch = chunkTextCode.match(/export function chunkText\([\s\S]*?\n\}/);
if (!chunkTextMatch) {
  throw new Error('Could not find chunkText function in fileProcessors.ts')
}

// Create a simple version of chunkText function inline
function chunkText(text, chunkSize = 1000, overlap = 200) {
  const words = text.split(/\s+/)
  const chunks = []
  let currentIndex = 0

  for (let i = 0; i < words.length; i += chunkSize - overlap) {
    const chunkWords = words.slice(i, i + chunkSize)
    const content = chunkWords.join(' ')

    if (content.trim()) {
      chunks.push({
        content: content.trim(),
        index: currentIndex++,
        tokenCount: chunkWords.length
      })
    }
  }

  return chunks.length > 0 ? chunks : [{ content: text, index: 0, tokenCount: words.length }]
}

dotenv.config({ path: '.env.local' })

const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY
})

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const voyage = new VoyageAIClient({
  apiKey: process.env.VOYAGE_API_KEY
})

async function migrateToVoyage() {
  try {
    const newIndexName = 'patmosllm-voyage'
    
    console.log('🚀 Starting migration to Voyage AI embeddings...')
    
    // Step 1: Create new Pinecone index
    console.log('\n📦 Step 1: Creating new Pinecone index...')
    
    const existingIndexes = await pinecone.listIndexes()
    const indexExists = existingIndexes.indexes?.some(index => index.name === newIndexName)
    
    if (!indexExists) {
      await pinecone.createIndex({
        name: newIndexName,
        dimension: 1024, // Voyage-3-large dimension
        metric: 'cosine',
        spec: {
          serverless: {
            cloud: 'aws',
            region: 'us-east-1'
          }
        }
      })
      console.log(`✅ Created new index: ${newIndexName}`)
      
      // Wait for index to be ready
      console.log('⏳ Waiting for index to be ready...')
      await new Promise(resolve => setTimeout(resolve, 60000)) // Wait 1 minute
    } else {
      console.log(`✅ Index ${newIndexName} already exists`)
    }
    
    // Step 2: Get all documents from Supabase
    console.log('\n📋 Step 2: Fetching all documents from database...')
    
    const { data: documents, error } = await supabase
      .from('documents')
      .select('id, title, content, author')
      .order('created_at', { ascending: true })
    
    if (error) {
      throw new Error(`Failed to fetch documents: ${error.message}`)
    }
    
    console.log(`📄 Found ${documents.length} documents to migrate`)
    
    // Step 3: Re-ingest each document
    console.log('\n🔄 Step 3: Re-ingesting documents with Voyage embeddings...')
    
    const newIndex = pinecone.index(newIndexName)
    const namespace = process.env.PINECONE_NAMESPACE || 'default'
    
    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i]
      console.log(`\n📝 Processing document ${i + 1}/${documents.length}: ${doc.title}`)
      
      try {
        // Check if document was already successfully migrated by checking chunks table
        const { data: existingChunks, error: chunksCheckError } = await supabase
          .from('chunks')
          .select('id')
          .eq('document_id', doc.id)
          .limit(1)

        if (!chunksCheckError && existingChunks && existingChunks.length > 0) {
          console.log(`   ✅ Document "${doc.title}" already has chunks in database - skipping`)
          continue
        }
        
        // Delete any failed/incomplete ingest jobs
        await supabase
          .from('ingest_jobs')
          .delete()
          .eq('document_id', doc.id)
        
        // Create new ingest job
        const { data: ingestJob, error: jobError } = await supabase
          .from('ingest_jobs')
          .insert({
            document_id: doc.id,
            status: 'processing',
            chunks_created: 0
          })
          .select()
          .single()
        
        if (jobError) {
          console.error(`❌ Failed to create ingest job for ${doc.title}:`, jobError.message)
          continue
        }
        
        // Split content into chunks using proper chunking with overlap
        const chunks = chunkText(doc.content, 1000, 200) // Match main system
        console.log(`   📊 Created ${chunks.length} chunks`)

        // Step 1: Store chunks in database first (critical for search)
        console.log(`   💾 Storing chunks in database...`)
        const chunkRecords = []

        for (let i = 0; i < chunks.length; i++) {
          const { data: chunkRecord, error: chunkError } = await supabase
            .from('chunks')
            .insert({
              document_id: doc.id,
              content: chunks[i].content,
              chunk_index: chunks[i].index,
              token_count: chunks[i].tokenCount,
            })
            .select()
            .single()

          if (chunkError) {
            throw new Error(`Failed to store chunk ${i}: ${chunkError.message}`)
          }

          chunkRecords.push(chunkRecord)
        }
        console.log(`   ✅ Stored ${chunkRecords.length} chunks in database`)

        // Step 2: Create embeddings for all chunks
        const chunkContents = chunks.map(chunk => chunk.content)
        const embeddings = await createEmbeddingsInBatches(chunkContents)
        console.log(`   🧠 Generated ${embeddings.length} embeddings`)

        // Step 3: Prepare vectors for Pinecone with proper IDs
        const vectors = chunkRecords.map((chunkRecord, index) => ({
          id: chunkRecord.id, // Use database chunk ID
          values: embeddings[index],
          metadata: {
            documentId: doc.id,
            documentTitle: doc.title,
            documentAuthor: doc.author || '',
            chunkIndex: chunks[index].index,
            tokenCount: chunks[index].tokenCount,
            content: chunks[index].content
          }
        }))

        // Step 4: Upload to new Pinecone index
        await newIndex.namespace(namespace).upsert(vectors)
        console.log(`   ✅ Uploaded ${vectors.length} vectors to Pinecone`)
        
        // Update ingest job
        await supabase
          .from('ingest_jobs')
          .update({
            status: 'completed',
            chunks_created: chunks.length,
            completed_at: new Date().toISOString()
          })
          .eq('id', ingestJob.id)
        
        console.log(`   ✅ Document "${doc.title}" migrated successfully`)
        
        // Small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 2000))
        
      } catch (error) {
        console.error(`❌ Failed to migrate "${doc.title}":`, error.message)
        
        // Update ingest job as failed
        await supabase
          .from('ingest_jobs')
          .update({
            status: 'failed',
            error_message: error.message
          })
          .eq('document_id', doc.id)
      }
    }
    
    console.log('\n🎉 Migration completed!')
    console.log('\n📝 Next steps:')
    console.log('1. Update your .env.local file:')
    console.log(`   PINECONE_INDEX=${newIndexName}`)
    console.log('2. Restart your development server')
    console.log('3. Test search functionality with new Voyage embeddings')
    
  } catch (error) {
    console.error('❌ Migration failed:', error)
  }
}


// Helper function to create embeddings in batches
async function createEmbeddingsInBatches(chunks) {
  const batchSize = 50 // Voyage AI batch limit
  const allEmbeddings = []
  
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize)
    
    try {
      const response = await voyage.embed({
        input: batch,
        model: 'voyage-3-large'
      })
      
      const embeddings = response.data?.map(item => item?.embedding).filter(Boolean) || []
      allEmbeddings.push(...embeddings)
      
      console.log(`   🔄 Processed batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(chunks.length / batchSize)}`)
      
      // Small delay between batches
      await new Promise(resolve => setTimeout(resolve, 1000))
      
    } catch (error) {
      console.error(`Failed to create embeddings for batch starting at ${i}:`, error)
      throw error
    }
  }
  
  return allEmbeddings
}

// Run migration
migrateToVoyage()