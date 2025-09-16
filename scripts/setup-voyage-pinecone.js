// Setup Pinecone index for Voyage AI embeddings (1024 dimensions)
import { Pinecone } from '@pinecone-database/pinecone'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY
})

async function setupVoyageIndex() {
  try {
    const indexName = 'patmosllm-voyage'
    
    console.log('🚀 Setting up Pinecone index for Voyage AI...')
    
    // Check if index already exists
    const existingIndexes = await pinecone.listIndexes()
    const indexExists = existingIndexes.indexes?.some(index => index.name === indexName)
    
    if (indexExists) {
      console.log(`✅ Index "${indexName}" already exists`)
      return
    }
    
    // Create new index with 1024 dimensions for Voyage-3-large
    await pinecone.createIndex({
      name: indexName,
      dimension: 1024,
      metric: 'cosine',
      spec: {
        serverless: {
          cloud: 'aws',
          region: 'us-east-1'
        }
      }
    })
    
    console.log(`✅ Created new Pinecone index: ${indexName}`)
    console.log('📝 Update your .env.local file:')
    console.log(`PINECONE_INDEX=${indexName}`)
    console.log('')
    console.log('🔄 After updating .env.local, restart your development server')
    
  } catch (error) {
    console.error('❌ Error setting up Pinecone index:', error)
  }
}

setupVoyageIndex()