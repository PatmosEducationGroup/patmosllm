import { Pinecone } from '@pinecone-database/pinecone'

// Initialize Pinecone client
const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY!
})

// Get the index
const index = pinecone.index(process.env.PINECONE_INDEX!)

// Store document chunks in Pinecone
export async function storeChunks(chunks: Array<{
  id: string
  documentId: string
  chunkIndex: number
  content: string
  embedding: number[]
  metadata: {
    documentTitle: string
    documentAuthor?: string
    chunkIndex: number
    tokenCount: number
  }
}>): Promise<void> {
  try {
    // Convert to Pinecone format
    const vectors = chunks.map(chunk => ({
      id: chunk.id,
      values: chunk.embedding,
      metadata: {
        documentId: chunk.documentId,
        documentTitle: chunk.metadata.documentTitle,
        documentAuthor: chunk.metadata.documentAuthor || '',
        chunkIndex: chunk.chunkIndex,
        tokenCount: chunk.metadata.tokenCount,
        content: chunk.content // Store content in metadata for retrieval
      }
    }))

    // Upload to Pinecone in batches
    const batchSize = 100
    const namespace = process.env.PINECONE_NAMESPACE || 'default'

    for (let i = 0; i < vectors.length; i += batchSize) {
      const batch = vectors.slice(i, i + batchSize)
      
      await index.namespace(namespace).upsert(batch)
      
      console.log(`Uploaded batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(vectors.length / batchSize)}`)
    }

    console.log(`Successfully stored ${vectors.length} chunks in Pinecone`)
  } catch (error) {
    console.error('Error storing chunks in Pinecone:', error)
    throw new Error(`Failed to store chunks: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

// Search for relevant chunks
export async function searchChunks(
  queryEmbedding: number[],
  topK: number = 10,
  minScore: number = 0.5
): Promise<Array<{
  id: string
  score: number
  documentId: string
  documentTitle: string
  documentAuthor?: string
  chunkIndex: number
  content: string
  tokenCount: number
}>> {
  try {
    const namespace = process.env.PINECONE_NAMESPACE || 'default'
    
    const searchResponse = await index.namespace(namespace).query({
      vector: queryEmbedding,
      topK,
      includeMetadata: true,
      includeValues: false
    })

    if (!searchResponse.matches) {
      return []
    }

    // Filter by minimum score and format results
    const results = searchResponse.matches
      .filter(match => (match.score || 0) >= minScore)
      .map(match => ({
        id: match.id,
        score: match.score || 0,
        documentId: match.metadata?.documentId as string,
        documentTitle: match.metadata?.documentTitle as string,
        documentAuthor: match.metadata?.documentAuthor as string,
        chunkIndex: match.metadata?.chunkIndex as number,
        content: match.metadata?.content as string,
        tokenCount: match.metadata?.tokenCount as number
      }))

    console.log(`Found ${results.length} relevant chunks (score >= ${minScore})`)
    
    return results
  } catch (error) {
    console.error('Error searching Pinecone:', error)
    throw new Error(`Failed to search chunks: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

// Delete chunks for a specific document
export async function deleteDocumentChunks(documentId: string): Promise<void> {
  try {
    const namespace = process.env.PINECONE_NAMESPACE || 'default'
    
    // First, find all chunk IDs for this document
    const searchResponse = await index.namespace(namespace).query({
      vector: new Array(1024).fill(0), // Dummy vector for Voyage embeddings (1024 dimensions)
      topK: 10000, // Large number to get all chunks
      filter: {
        documentId: { $eq: documentId }
      },
      includeMetadata: false,
      includeValues: false
    })

    if (searchResponse.matches && searchResponse.matches.length > 0) {
      const chunkIds = searchResponse.matches.map(match => match.id)
      
      // Delete the chunks
      await index.namespace(namespace).deleteMany(chunkIds)
      
      console.log(`Deleted ${chunkIds.length} chunks for document ${documentId}`)
    }
  } catch (error) {
    console.error('Error deleting document chunks:', error)
    throw new Error(`Failed to delete chunks: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

// Get statistics about the index
export async function getIndexStats(): Promise<{
  totalVectors: number
  dimension: number
  namespace: string
}> {
  try {
    const stats = await index.describeIndexStats()
    const namespace = process.env.PINECONE_NAMESPACE || 'default'
    
    return {
      totalVectors: stats.totalRecordCount || 0,
      dimension: stats.dimension || 1536,
      namespace
    }
  } catch (error) {
    console.error('Error getting index stats:', error)
    throw new Error(`Failed to get index stats: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

// Test Pinecone connection
export async function testConnection(): Promise<boolean> {
  try {
    await getIndexStats()
    return true
  } catch (error) {
    console.error('Pinecone connection test failed:', error)
    return false
  }
}