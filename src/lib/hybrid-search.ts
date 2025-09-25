// Hybrid Search Implementation: Combines semantic + keyword search for enhanced accuracy
import { searchChunks } from './pinecone'
import { supabaseAdmin } from './supabase'
import { advancedCache, CACHE_NAMESPACES, CACHE_TTL } from './advanced-cache'

export interface SearchResult {
  id: string
  score: number
  documentId: string
  documentTitle: string
  documentAuthor?: string
  chunkIndex: number
  content: string
  tokenCount: number
  searchType: 'semantic' | 'keyword' | 'hybrid'
  relevanceScore: number
  originalScore?: number  // For debugging title boosting
  titleBoost?: number     // For debugging title boosting
}

interface HybridSearchOptions {
  semanticWeight: number // 0-1, weight for semantic search
  keywordWeight: number // 0-1, weight for keyword search  
  minSemanticScore: number // Minimum semantic similarity
  minKeywordScore: number // Minimum keyword relevance
  maxResults: number // Maximum results to return
  enableCache: boolean // Whether to use caching
  userId?: string // For personalized caching
}

// Default hybrid search configuration
const DEFAULT_HYBRID_OPTIONS: HybridSearchOptions = {
  semanticWeight: 0.7,
  keywordWeight: 0.3,
  minSemanticScore: 0.3, // Lowered back to 0.3 for better recall of relevant content
  minKeywordScore: 0.1,  // Lowered back to 0.1 for better recall of relevant content
  maxResults: 15,
  enableCache: true
}

// Advanced keyword scoring using TF-IDF like approach
function calculateKeywordRelevance(query: string, content: string): number {
  const queryTerms = query.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(term => term.length > 2) // Filter out very short terms
  
  if (queryTerms.length === 0) return 0

  const contentLower = content.toLowerCase()
  const contentWords = contentLower.split(/\s+/)
  const contentLength = contentWords.length

  let totalScore = 0
  let matchedTerms = 0

  for (const term of queryTerms) {
    // Exact matches get higher score
    const exactMatches = (contentLower.match(new RegExp(`\\b${term}\\b`, 'g')) || []).length
    
    // Partial matches (contains the term)
    const partialMatches = (contentLower.match(new RegExp(term, 'g')) || []).length - exactMatches
    
    if (exactMatches > 0 || partialMatches > 0) {
      matchedTerms++
      
      // TF (Term Frequency) component
      const termFrequency = (exactMatches * 2 + partialMatches) / contentLength
      
      // Position bonus - terms appearing early get higher score
      const firstPosition = contentLower.indexOf(term)
      const positionBonus = firstPosition >= 0 ? (1 - firstPosition / contentLower.length) * 0.2 : 0
      
      // Exact match bonus
      const exactBonus = exactMatches > 0 ? 0.3 : 0
      
      // Multiple occurrence bonus
      const frequencyBonus = Math.min((exactMatches + partialMatches) * 0.1, 0.5)
      
      totalScore += termFrequency + positionBonus + exactBonus + frequencyBonus
    }
  }

  // Coverage bonus - more query terms matched = higher score
  const coverage = matchedTerms / queryTerms.length
  const coverageBonus = coverage * 0.4

  return Math.min((totalScore + coverageBonus) * coverage, 1.0)
}

// Keyword-based search using SQL full-text search
async function keywordSearch(
  query: string, 
  maxResults: number = 10,
  minScore: number = 0.1
): Promise<SearchResult[]> {
  try {
    // Use SQL full-text search with PostgreSQL's to_tsvector and to_tsquery
    const { data: chunks, error } = await supabaseAdmin
      .from('chunks')
      .select(`
        id,
        document_id,
        chunk_index,
        content,
        token_count,
        documents!inner(
          title,
          author
        )
      `)
      .textSearch('content', query, { 
        type: 'websearch',
        config: 'english'
      })
      .limit(maxResults * 2) // Get more for filtering

    if (error) throw error

    if (!chunks || chunks.length === 0) {
      return []
    }

    // Calculate relevance scores for each result
    const scoredResults: SearchResult[] = chunks
      .map(chunk => {
        const relevanceScore = calculateKeywordRelevance(query, chunk.content)
        
        return {
          id: chunk.id,
          score: relevanceScore,
          documentId: chunk.document_id,
          documentTitle: (chunk.documents as unknown as { title: string; author?: string }).title,
          documentAuthor: (chunk.documents as unknown as { title: string; author?: string }).author,
          chunkIndex: chunk.chunk_index,
          content: chunk.content,
          tokenCount: chunk.token_count,
          searchType: 'keyword' as const,
          relevanceScore
        }
      })
      .filter(result => result.relevanceScore >= minScore)
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, maxResults)

    return scoredResults

  } catch (error) {
    console.error('Keyword search error:', error)
    return []
  }
}

// Combined hybrid search function
export async function hybridSearch(
  query: string,
  queryEmbedding: number[],
  options: Partial<HybridSearchOptions> = {}
): Promise<SearchResult[]> {
  const opts = { ...DEFAULT_HYBRID_OPTIONS, ...options }
  
  // Check cache first if enabled
  if (opts.enableCache) {
    const cacheKey = `${query}-${JSON.stringify(opts)}`
    const cached = advancedCache.get<SearchResult[]>(
      CACHE_NAMESPACES.SEARCH_RESULTS, 
      cacheKey,
      { userId: opts.userId }
    )
    if (cached) {
      console.log('Returning cached hybrid search results')
      return cached
    }
  }

  try {
    // Run semantic and keyword searches in parallel
    const [semanticResults, keywordResults] = await Promise.all([
      searchChunks(queryEmbedding, opts.maxResults, opts.minSemanticScore),
      keywordSearch(query, opts.maxResults, opts.minKeywordScore)
    ])

    // Convert semantic results to SearchResult format
    const semanticSearchResults: SearchResult[] = semanticResults.map(result => ({
      ...result,
      searchType: 'semantic' as const,
      relevanceScore: result.score
    }))

    // Create a map for merging results by chunk ID
    const resultMap = new Map<string, SearchResult>()

    // Add semantic results with semantic weight
    semanticSearchResults.forEach(result => {
      const weightedScore = result.score * opts.semanticWeight
      resultMap.set(result.id, {
        ...result,
        score: weightedScore,
        searchType: 'semantic',
        relevanceScore: result.score
      })
    })

    // Add or merge keyword results with keyword weight
    keywordResults.forEach(result => {
      const weightedScore = result.relevanceScore * opts.keywordWeight
      
      if (resultMap.has(result.id)) {
        // Merge with existing semantic result
        const existingResult = resultMap.get(result.id)!
        const hybridScore = existingResult.score + weightedScore
        
        resultMap.set(result.id, {
          ...existingResult,
          score: hybridScore,
          searchType: 'hybrid',
          relevanceScore: Math.max(existingResult.relevanceScore, result.relevanceScore)
        })
      } else {
        // Add as new keyword-only result
        resultMap.set(result.id, {
          ...result,
          score: weightedScore,
          searchType: 'keyword',
          relevanceScore: result.relevanceScore
        })
      }
    })

    // Apply title relevance boosting before final sorting
    const queryTerms = query.toLowerCase().split(/\s+/).filter(term => term.length > 2)
    // console.log(`DEBUG TITLE BOOSTING: Query terms extracted: [${queryTerms.join(', ')}]`)

    const boostedResults = Array.from(resultMap.values()).map(result => {
      let titleBoost = 0
      const titleLower = result.documentTitle.toLowerCase()
      const matchedTerms: string[] = []

      // Check for exact title word matches
      for (const term of queryTerms) {
        if (titleLower.includes(term)) {
          titleBoost += 0.15 // Boost per matching term
          matchedTerms.push(term)
        }
      }

      // Apply stronger boost for exact title concept matches
      const strongMatchTerms = queryTerms.filter(term => titleLower.includes(term))
      let conceptBonus = 0
      if (strongMatchTerms.length >= 2) {
        conceptBonus = 0.3 // Multiple term match bonus
        titleBoost += conceptBonus
      } else if (strongMatchTerms.length === 1) {
        conceptBonus = 0.2 // Single strong term match
        titleBoost += conceptBonus
      }

      // Debug logging for title boosting (show all results with boosts)
      // if (titleBoost > 0) {
      //   console.log(`DEBUG TITLE BOOST: "${result.documentTitle}"`)
      //   console.log(`  - Original score: ${result.score.toFixed(4)}`)
      //   console.log(`  - Matched terms: [${matchedTerms.join(', ')}] (${matchedTerms.length}/${queryTerms.length})`)
      //   console.log(`  - Term boost: ${(matchedTerms.length * 0.15).toFixed(3)}`)
      //   console.log(`  - Concept bonus: ${conceptBonus.toFixed(3)}`)
      //   console.log(`  - Total title boost: ${titleBoost.toFixed(3)}`)
      //   console.log(`  - Final score: ${(result.score + titleBoost).toFixed(4)}`)
      // }

      return {
        ...result,
        score: result.score + titleBoost,
        originalScore: result.score,
        titleBoost
      }
    })

    // Convert to array and sort by boosted combined score
    const hybridResults = boostedResults
      .sort((a, b) => b.score - a.score)
      .slice(0, opts.maxResults)

    // Add diversity scoring to prevent too many results from the same document
    const diversifiedResults = diversifyResults(hybridResults)

    // Debug: Show final results with titles and scores
    // console.log(`DEBUG FINAL RESULTS (after title boosting and diversity filtering):`)
    // diversifiedResults.slice(0, 10).forEach((result, i) => {
    //   console.log(`  ${i+1}. "${result.documentTitle}" - Score: ${result.score.toFixed(4)} (original: ${result.originalScore?.toFixed(4)}, boost: ${result.titleBoost?.toFixed(3)})`)
    // })

    // Cache results if enabled
    if (opts.enableCache) {
      const cacheKey = `${query}-${JSON.stringify(opts)}`
      advancedCache.set(
        CACHE_NAMESPACES.SEARCH_RESULTS,
        cacheKey,
        diversifiedResults,
        CACHE_TTL.SHORT,
        { userId: opts.userId }
      )
    }

    console.log(`Hybrid search results: ${semanticResults.length} semantic + ${keywordResults.length} keyword = ${diversifiedResults.length} hybrid`)

    return diversifiedResults

  } catch (error) {
    console.error('Hybrid search error:', error)
    throw new Error(`Hybrid search failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

// Diversify results to avoid too many chunks from the same document
function diversifyResults(results: SearchResult[], maxPerDocument: number = 3): SearchResult[] {
  const documentCounts = new Map<string, number>()
  const diversified: SearchResult[] = []

  for (const result of results) {
    const currentCount = documentCounts.get(result.documentId) || 0
    
    if (currentCount < maxPerDocument) {
      diversified.push(result)
      documentCounts.set(result.documentId, currentCount + 1)
    }
  }

  return diversified
}

// Enhanced search with question intent analysis
export async function intelligentSearch(
  query: string,
  queryEmbedding: number[],
  options: Partial<HybridSearchOptions> = {}
): Promise<{
  results: SearchResult[]
  searchStrategy: string
  confidence: number
  suggestions?: string[]
}> {
  // Preprocess query to extract core concepts for better matching
  const processedQuery = preprocessQuery(query)

  // If query was preprocessed, we need a new embedding for the processed query
  let finalEmbedding = queryEmbedding
  if (processedQuery !== query) {
    console.log(`Creating new embedding for processed query: "${processedQuery}"`)
    const { createEmbedding } = await import('@/lib/openai')
    finalEmbedding = await createEmbedding(processedQuery)
  }

  // Analyze query intent to adjust search strategy
  const queryAnalysis = analyzeQueryIntent(processedQuery)

  // Adjust weights based on query type
  const adjustedOptions = { ...options }

  switch (queryAnalysis.type) {
    case 'factual':
      // Balanced approach for factual questions - semantic is still important
      adjustedOptions.semanticWeight = 0.7
      adjustedOptions.keywordWeight = 0.3
      break
    case 'conceptual':
      // Favor semantic search for conceptual questions
      adjustedOptions.semanticWeight = 0.8
      adjustedOptions.keywordWeight = 0.2
      break
    case 'comparative':
      // Balanced approach for comparisons
      adjustedOptions.semanticWeight = 0.6
      adjustedOptions.keywordWeight = 0.4
      break
    default:
      // Use default weights
      break
  }

  const results = await hybridSearch(processedQuery, finalEmbedding, adjustedOptions)
  
  // Calculate confidence based on top result scores and result consistency
  const confidence = calculateSearchConfidence(results, queryAnalysis)

  return {
    results,
    searchStrategy: `${queryAnalysis.type} (${adjustedOptions.semanticWeight}/${adjustedOptions.keywordWeight})`,
    confidence,
    suggestions: queryAnalysis.suggestions
  }
}

// Analyze query intent for better search strategy
function analyzeQueryIntent(query: string): {
  type: 'factual' | 'conceptual' | 'comparative' | 'general'
  confidence: number
  suggestions: string[]
} {
  const queryLower = query.toLowerCase()
  const suggestions: string[] = []
  
  // Factual question patterns
  const factualPatterns = [
    /^(what|when|where|who|which|how much|how many)/,
    /\b(define|definition|meaning|date|number|name|list)\b/,
    /\b(is|are|was|were|will be|has|have|had)\s/
  ]
  
  // Conceptual question patterns
  const conceptualPatterns = [
    /^(how|why|explain|describe|teach)/,
    /\b(understand|concept|theory|principle|process|mechanism)\b/,
    /\b(significance|importance|impact|effect|influence)\b/,
    /\b(teach me|show me|guide me|help me)\b/,
    /\b(learn|learning|instruction|training)\b/
  ]
  
  // Comparative question patterns
  const comparativePatterns = [
    /\b(compare|comparison|versus|vs|difference|similar|different)\b/,
    /\b(better|worse|best|worst|more|less|advantage|disadvantage)\b/,
    /\b(between|among|against)\b.*\b(and|or)\b/
  ]

  const factualScore = factualPatterns.reduce((score, pattern) => 
    score + (pattern.test(queryLower) ? 1 : 0), 0
  )
  
  const conceptualScore = conceptualPatterns.reduce((score, pattern) => 
    score + (pattern.test(queryLower) ? 1 : 0), 0
  )
  
  const comparativeScore = comparativePatterns.reduce((score, pattern) => 
    score + (pattern.test(queryLower) ? 1 : 0), 0
  )

  // Add suggestions based on query analysis
  if (query.length < 10) {
    suggestions.push("Try adding more specific terms to your question")
  }
  
  if (!queryLower.includes('?') && (queryLower.includes('what') || queryLower.includes('how'))) {
    suggestions.push("Consider rephrasing as a complete question")
  }

  // Determine type based on highest score
  const maxScore = Math.max(factualScore, conceptualScore, comparativeScore)
  
  if (maxScore === 0) {
    return { type: 'general', confidence: 0.5, suggestions }
  }
  
  let type: 'factual' | 'conceptual' | 'comparative' | 'general' = 'general'
  
  if (factualScore === maxScore) {
    type = 'factual'
  } else if (conceptualScore === maxScore) {
    type = 'conceptual'
  } else if (comparativeScore === maxScore) {
    type = 'comparative'
  }

  return {
    type,
    confidence: Math.min(maxScore / 3, 1), // Normalize to 0-1
    suggestions
  }
}

// Calculate search confidence based on results
function calculateSearchConfidence(results: SearchResult[], _queryAnalysis: Record<string, unknown>): number {
  if (results.length === 0) return 0

  // Base confidence from top result score
  const topScore = results[0].score
  let confidence = Math.min(topScore * 0.7, 0.7)

  // Boost confidence if multiple results have similar scores (consistency)
  if (results.length >= 2) {
    const secondScore = results[1].score
    const scoreConsistency = secondScore / topScore
    if (scoreConsistency > 0.8) {
      confidence += 0.15
    }
  }

  // Boost confidence for hybrid results (both semantic and keyword matched)
  const hybridCount = results.filter(r => r.searchType === 'hybrid').length
  if (hybridCount > 0) {
    confidence += (hybridCount / results.length) * 0.15
  }

  return Math.min(confidence, 1.0)
}

// Query preprocessing to extract core concepts and reduce application-specific noise
function preprocessQuery(query: string): string {
  const queryLower = query.toLowerCase()

  // Universal pattern: Extract core action before "for [context]"
  // Example: "teach me to pray creatively for orphans of war" -> "teach me to pray creatively"
  const forContextPattern = /^(.*?)\s+for\s+.+$/i

  const match = queryLower.match(forContextPattern)
  if (match) {
    const coreQuery = match[1].trim()
    // console.log(`DEBUG PREPROCESSING: "${query}" -> "${coreQuery}"`)
    return coreQuery
  }

  return query // Return original if no patterns match
}

export default hybridSearch