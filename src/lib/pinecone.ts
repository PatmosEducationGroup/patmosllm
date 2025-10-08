import { Pinecone } from '@pinecone-database/pinecone'
import { logError, logger } from './logger'

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
    // Convert to Pinecone format with size-limited metadata
    const vectors = chunks.map(chunk => {
      // Trim content to fit within Pinecone's 40KB metadata limit
      const trimmedContent = trimContentForMetadata(chunk.content)

      return {
        id: chunk.id,
        values: chunk.embedding,
        metadata: {
          documentId: chunk.documentId,
          documentTitle: truncateString(chunk.metadata.documentTitle, 200),
          documentAuthor: truncateString(chunk.metadata.documentAuthor || '', 100),
          chunkIndex: chunk.chunkIndex,
          tokenCount: chunk.metadata.tokenCount,
          content: trimmedContent, // Store trimmed content in metadata
          contentLength: chunk.content.length // Store original length for reference
        }
      }
    })

    // Upload to Pinecone in batches
    const batchSize = 100
    const namespace = process.env.PINECONE_NAMESPACE || 'default'

    for (let i = 0; i < vectors.length; i += batchSize) {
      const batch = vectors.slice(i, i + batchSize)
      
      await index.namespace(namespace).upsert(batch)

      logger.info(
        {
          batchNumber: Math.floor(i / batchSize) + 1,
          totalBatches: Math.ceil(vectors.length / batchSize),
          namespace
        },
        'Uploaded batch to Pinecone'
      )
    }

    logger.info(
      { vectorCount: vectors.length, namespace },
      'Successfully stored chunks in Pinecone'
    )
  } catch (error) {
    logError(error instanceof Error ? error : new Error('Failed to store chunks in Pinecone'), {
      operation: 'storeChunks',
      chunkCount: chunks.length,
      namespace: process.env.PINECONE_NAMESPACE || 'default',
      documentIds: [...new Set(chunks.map(c => c.documentId))],
    })
    throw new Error(`Failed to store chunks in Pinecone: ${error instanceof Error ? error.message : 'Unknown error'}`)
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

    // DEBUG: Log raw Pinecone results for complex queries to understand ranking
    if (searchResponse.matches.length > 0 && searchResponse.matches[0].score && searchResponse.matches[0].score < 0.7) {
      const topResults = searchResponse.matches.slice(0, 5).map((match, i) => ({
        rank: i + 1,
        score: match.score?.toFixed(4),
        documentTitle: match.metadata?.documentTitle,
      }))
      logger.debug(
        { topResults, threshold: 0.7 },
        'Raw Pinecone search results for low-confidence query'
      )
    }

    // Filter by minimum score
    const filteredMatches = searchResponse.matches.filter(match => (match.score || 0) >= minScore)

    // Extract chunk IDs and check which need full content
    const _chunkIds = filteredMatches.map(match => match.id)
    const truncatedIds = filteredMatches
      .filter(match => {
        const content = match.metadata?.content as string
        return content && content.endsWith('...[truncated]')
      })
      .map(match => match.id)

    // Batch fetch full content for truncated chunks (if any)
    let fullContentMap = new Map<string, string>()
    if (truncatedIds.length > 0) {
      try {
        const supabase = await import('./supabase')
        const { data: fullChunks } = await supabase.supabaseAdmin
          .from('chunks')
          .select('id, content')
          .in('id', truncatedIds)

        if (fullChunks) {
          fullContentMap = new Map(fullChunks.map(chunk => [chunk.id, chunk.content]))
        }
      } catch (error) {
        // This is non-critical - we can fall back to truncated content
        logError(error instanceof Error ? error : new Error('Batch fetch of full content failed'), {
          operation: 'searchChunks.batchFetch',
          truncatedChunkCount: truncatedIds.length,
          truncatedIds: truncatedIds.slice(0, 5), // Log first 5 for debugging
        })
        logger.warn(
          { truncatedChunkCount: truncatedIds.length },
          'Batch fetch failed for truncated chunks, using truncated content'
        )
      }
    }

    // Format results with full content where available
    const results = filteredMatches.map(match => {
      let content = match.metadata?.content as string

      // Use full content if available from batch fetch
      if (fullContentMap.has(match.id)) {
        content = fullContentMap.get(match.id)!
      }

      return {
        id: match.id,
        score: match.score || 0,
        documentId: match.metadata?.documentId as string,
        documentTitle: match.metadata?.documentTitle as string,
        documentAuthor: match.metadata?.documentAuthor as string,
        chunkIndex: match.metadata?.chunkIndex as number,
        content,
        tokenCount: match.metadata?.tokenCount as number
      }
    })

    logger.info(
      { resultCount: results.length, minScore, topK },
      'Found relevant chunks in Pinecone'
    )

    return results
  } catch (error) {
    logError(error instanceof Error ? error : new Error('Failed to search chunks in Pinecone'), {
      operation: 'searchChunks',
      topK,
      minScore,
      namespace: process.env.PINECONE_NAMESPACE || 'default',
      embeddingDimension: queryEmbedding.length,
    })
    throw new Error(`Failed to search chunks in Pinecone: ${error instanceof Error ? error.message : 'Unknown error'}`)
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

      logger.info(
        { deletedChunkCount: chunkIds.length, documentId, namespace },
        'Deleted chunks for document from Pinecone'
      )
    } else {
      logger.info(
        { documentId, namespace },
        'No chunks found to delete for document in Pinecone'
      )
    }
  } catch (error) {
    logError(error instanceof Error ? error : new Error('Failed to delete chunks from Pinecone'), {
      operation: 'deleteDocumentChunks',
      documentId,
      namespace: process.env.PINECONE_NAMESPACE || 'default',
    })
    throw new Error(`Failed to delete chunks for document ${documentId}: ${error instanceof Error ? error.message : 'Unknown error'}`)
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
      dimension: stats.dimension || 1024,
      namespace
    }
  } catch (error) {
    logError(error instanceof Error ? error : new Error('Failed to get index stats from Pinecone'), {
      operation: 'getIndexStats',
      namespace: process.env.PINECONE_NAMESPACE || 'default',
      index: process.env.PINECONE_INDEX,
    })
    throw new Error(`Failed to get index stats: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

// Test Pinecone connection
export async function testConnection(): Promise<boolean> {
  try {
    await getIndexStats()
    logger.info({ operation: 'testConnection' }, 'Pinecone connection test successful')
    return true
  } catch (error) {
    // This is a health check - log at debug level to avoid noise
    logError(error instanceof Error ? error : new Error('Pinecone connection test failed'), {
      operation: 'testConnection',
      namespace: process.env.PINECONE_NAMESPACE || 'default',
      index: process.env.PINECONE_INDEX,
    })
    return false
  }
}

// Helper function to trim content to fit in Pinecone metadata (40KB limit)
function trimContentForMetadata(content: string): string {
  // Leave room for other metadata fields (estimate ~5KB for other fields)
  const maxContentBytes = 35000

  // Convert string to bytes (UTF-8 encoding)
  const encoder = new TextEncoder()
  const contentBytes = encoder.encode(content)

  if (contentBytes.length <= maxContentBytes) {
    return content
  }

  // Trim to fit, but try to break at sentence boundaries
  let trimmed = new TextDecoder().decode(contentBytes.slice(0, maxContentBytes))

  // Try to break at last sentence ending
  const lastSentenceEnd = Math.max(
    trimmed.lastIndexOf('.'),
    trimmed.lastIndexOf('!'),
    trimmed.lastIndexOf('?')
  )

  if (lastSentenceEnd > maxContentBytes * 0.8) {
    trimmed = trimmed.substring(0, lastSentenceEnd + 1)
  }

  return trimmed + '...[truncated]'
}

// Helper function to truncate strings to specific lengths
function truncateString(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str
  return str.substring(0, maxLength - 3) + '...'
}