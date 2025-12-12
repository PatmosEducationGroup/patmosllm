// Chat Service - Business logic extracted from route.ts
// Handles caching, intent classification, context building, and conversation management

import { withSupabaseAdmin } from '@/lib/supabase'
import { createEmbedding } from '@/lib/openai'
import { intelligentSearch, type SearchResult as HybridSearchResult } from '@/lib/hybrid-search'
import { intelligentClarification } from '@/lib/intelligent-clarification'
import { userContextManager } from '@/lib/userContextManager'
import { trackOnboardingMilestone } from '@/lib/onboardingTracker'
import { trackUsage } from '@/lib/donation-tracker'
import {
  advancedCache,
  CACHE_NAMESPACES,
  CACHE_TTL,
  getCachedConversationHistory,
  cacheConversationHistory
} from '@/lib/advanced-cache'
import { logger, loggers, logError } from '@/lib/logger'
import { pMap, pTimeout, retry } from '@/lib/utils/performance'
import type {
  QueryIntent,
  DocumentFormat,
  IntentResult,
  CachedChatResponse,
  Source
} from '@/types/chat'

// =================================================================
// CACHE HELPERS
// =================================================================

export function generateQuestionCacheKey(question: string, userId: string): string {
  const normalized = question
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
  return `${normalized}-${userId.substring(0, 8)}`
}

export function getCachedChatResponse(question: string, userId: string): CachedChatResponse | null {
  const cacheKey = generateQuestionCacheKey(question, userId)
  loggers.cache({ cacheKey, userId: userId.substring(0, 8) }, 'Cache lookup')
  const result = advancedCache.get<CachedChatResponse>(
    CACHE_NAMESPACES.CHAT_HISTORY,
    cacheKey
  )
  loggers.cache({
    hit: !!result,
    question: question.substring(0, 50),
    userId: userId.substring(0, 8)
  }, `Cache ${result ? 'HIT' : 'MISS'}`)
  return result
}

export function setCachedChatResponse(
  question: string,
  userId: string,
  answer: string,
  sources: Array<{ title: string; author?: string; chunk_id: string }>
): void {
  const cacheKey = generateQuestionCacheKey(question, userId)
  const responseData: CachedChatResponse = {
    answer,
    sources,
    timestamp: Date.now()
  }
  advancedCache.set(
    CACHE_NAMESPACES.CHAT_HISTORY,
    cacheKey,
    responseData,
    CACHE_TTL.MEDIUM
  )
}

// =================================================================
// INTENT CLASSIFICATION
// =================================================================

export function classifyIntent(
  question: string,
  hasHistory: boolean,
  lastAnswerLength: number
): IntentResult {
  const q = question.toLowerCase()

  // Document generation detection
  const docFormats: Record<string, RegExp> = {
    pdf: /\b(pdf|portable document)\b/i,
    pptx: /\b(powerpoint|ppt|pptx|presentation|slides?|slideshow)\b/i,
    xlsx: /\b(excel|xlsx?|spreadsheet|workbook|table)\b/i
  }

  const docVerbs = /\b(create|make|generate|give me|export|download|save|produce|write|turn.*into|convert.*to)\b/i

  for (const [format, regex] of Object.entries(docFormats)) {
    if (regex.test(q) && docVerbs.test(q)) {
      return {
        intent: 'generate_document',
        documentFormat: format as DocumentFormat
      }
    }
  }

  // Transform detection
  const transformVerbs = /\b(add|create|develop|write|make|generate|expand|elaborate|revise|divide|integrate|turn|convert|include|incorporate|design|construct|build)\b/i
  const refsPrior = /\b(that|this|the outline|the plan|those|these|it|them)\b/i
  const isShortImperative = q.split(' ').length <= 6 && transformVerbs.test(q)

  if (hasHistory && lastAnswerLength > 400) {
    if (refsPrior.test(q) || isShortImperative) {
      return { intent: 'transform_prior_artifact' }
    }
  }

  // Synthesis detection
  const synthKeywords = /\b(outline|scope|sequence|syllabus|curriculum|framework|weekly|modules?|lesson plan|teaching plan|course design)\b/i
  if (synthKeywords.test(q)) {
    return { intent: 'synthesize_from_docs' }
  }

  // Basic factual detection
  const basicFactualPatterns = /^(what is|what's|who is|who's|define|explain|describe|tell me about)\s/i
  if (basicFactualPatterns.test(q) && q.split(' ').length <= 8) {
    return { intent: 'basic_factual' }
  }

  return { intent: 'retrieve_from_docs' }
}

// =================================================================
// SESSION VALIDATION
// =================================================================

export async function validateSession(sessionId: string, userId: string): Promise<boolean> {
  return withSupabaseAdmin(async (supabase) => {
    const { data } = await supabase
      .from('chat_sessions')
      .select('id')
      .eq('id', sessionId)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .single()
    return !!data
  }).catch(() => false)
}

// =================================================================
// CONVERSATION HISTORY
// =================================================================

export async function getConversationHistory(
  sessionId: string,
  userId: string
): Promise<Array<{ question: string; answer: string }>> {
  const cached = getCachedConversationHistory(sessionId)
  if (cached) return cached as Array<{ question: string; answer: string }>

  return withSupabaseAdmin(async (supabase) => {
    const historyLimit = process.env.FF_CHAT_HISTORY_2_TURNS === 'true' ? 2 : 3
    const { data } = await supabase
      .from('conversations')
      .select('question, answer')
      .eq('session_id', sessionId)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(historyLimit)
    return (data || []) as Array<{ question: string; answer: string }>
  })
}

export function cacheHistory(
  sessionId: string,
  history: Array<{ question: string; answer: string }>
): void {
  if (history.length > 0) {
    cacheConversationHistory(sessionId, history)
  }
}

// =================================================================
// SEARCH & CONTEXT BUILDING
// =================================================================

export async function performSearch(
  question: string,
  conversationHistory: Array<{ question: string; answer: string }>,
  userId: string,
  requestId: string
): Promise<{
  contextualQuery: string
  embedding: number[]
  searchResult: {
    results: HybridSearchResult[]
    searchStrategy: string
    confidence: number
    suggestions?: string[]
  }
}> {
  // Build contextual search query
  let contextualQuery = question
  if (conversationHistory.length > 0) {
    const recentTopics = conversationHistory.map(conv => conv.question).join(' ')
    const isFollowUp =
      /^(what|how|why|when|where|who)['']?s?\s+(it|this|that|they|their|them|these|those)/i.test(question) ||
      /^(and|but|also|so|then)\s/i.test(question) ||
      /(tell me more|what about|how about|what else|anything else|can you|could you explain)/i.test(question) ||
      (question.length < 10 && /^(why|how|when|where|what|who)\??$/i.test(question))

    if (isFollowUp) {
      contextualQuery = `${recentTopics} ${question}`
      logger.info({
        originalQuery: question.substring(0, 50),
        enhancedQuery: contextualQuery.substring(0, 100)
      }, 'Enhanced search query with context')
    }
  }

  // Create embedding
  const embedding = await createEmbedding(contextualQuery, userId, requestId)

  // Perform hybrid search
  const searchMaxResults = process.env.FF_K_17 === 'true' ? 17 : 20
  const searchResult = await intelligentSearch(
    contextualQuery,
    embedding,
    {
      maxResults: searchMaxResults,
      minSemanticScore: 0.5,
      minKeywordScore: 0.05,
      userId,
      enableCache: true
    }
  )

  return { contextualQuery, embedding, searchResult }
}

export function buildContext(chunks: HybridSearchResult[]): Array<{
  content: string
  title: string
  author?: string
}> {
  const chunksByDocument = chunks.reduce((acc, chunk) => {
    const key = chunk.documentTitle
    if (!acc[key]) acc[key] = []
    acc[key].push(chunk)
    return acc
  }, {} as Record<string, HybridSearchResult[]>)

  const contextChunkLimit = process.env.FF_CTX_CHUNKS_7 === 'true' ? 7 : 8

  return Object.entries(chunksByDocument)
    .map(([title, docChunks]) => ({
      title,
      chunks: docChunks.slice(0, 4)
    }))
    .sort((a, b) => b.chunks[0].score - a.chunks[0].score)
    .flatMap(group => group.chunks)
    .slice(0, contextChunkLimit)
    .map(chunk => ({
      content: chunk.content || 'No content available',
      title: chunk.documentTitle,
      author: chunk.documentAuthor
    }))
}

// =================================================================
// CLARIFICATION ANALYSIS
// =================================================================

export function analyzeClarification(
  question: string,
  searchResults: HybridSearchResult[],
  searchConfidence: number,
  searchStrategy: string,
  conversationHistory: Array<{ question: string; answer: string }>,
  wasQueryEnhanced: boolean,
  originalQuery: string,
  enhancedQuery: string
) {
  return intelligentClarification.analyzeSearchResults({
    query: question,
    searchResults,
    searchConfidence,
    searchStrategy,
    recentConversations: conversationHistory,
    wasQueryEnhanced,
    originalQuery,
    enhancedQuery
  })
}

// =================================================================
// SOURCE METADATA FETCHING
// =================================================================

export async function fetchSourceMetadata(
  chunks: HybridSearchResult[]
): Promise<Source[]> {
  const uniqueDocumentIds = [...new Set(chunks.map(chunk => chunk.documentId))]

  const documentsWithMetadata = await pMap(
    uniqueDocumentIds,
    async (docId) => {
      return await retry(
        () => pTimeout(
          withSupabaseAdmin(async (supabase) => {
            const { data, error } = await supabase
              .from('documents')
              .select(`
                id,
                title,
                author,
                storage_path,
                file_size,
                amazon_url,
                resource_url,
                download_enabled,
                contact_person,
                contact_email
              `)
              .eq('id', docId)
              .single()

            if (error) throw error
            return data
          }),
          1500
        ),
        { retries: 1, minTimeout: 120, maxTimeout: 250 }
      ).catch((error) => {
        loggers.database({ docId, error: error.message }, 'Metadata fetch failed (tolerated)')
        return null
      })
    },
    { concurrency: 8 }
  ).then(results => results.filter(r => r !== null))

  return chunks
    .reduce((acc, chunk) => {
      if (!acc.find(source => source.title === chunk.documentTitle)) {
        const metadata = documentsWithMetadata?.find(doc => doc.title === chunk.documentTitle)
        acc.push({
          title: chunk.documentTitle,
          author: chunk.documentAuthor || undefined,
          chunk_id: chunk.id,
          document_id: chunk.documentId,
          has_file: !!metadata?.storage_path,
          file_size: metadata?.file_size || undefined,
          amazon_url: metadata?.amazon_url || undefined,
          resource_url: metadata?.resource_url || undefined,
          download_enabled: metadata?.download_enabled || false,
          contact_person: metadata?.contact_person || undefined,
          contact_email: metadata?.contact_email || undefined
        })
      }
      return acc
    }, [] as Source[])
    .slice(0, 8)
}

// =================================================================
// SYSTEM PROMPT BUILDING
// =================================================================

export function buildSystemPrompt(
  conversationHistory: Array<{ question: string; answer: string }>,
  context: Array<{ content: string; title: string; author?: string }>
): string {
  let conversationHistoryText = ''
  if (conversationHistory.length > 0) {
    conversationHistoryText = '\n\n=== RECENT CONVERSATION HISTORY ===\n'
    conversationHistory.forEach(conv => {
      conversationHistoryText += `User: ${conv.question}\nAssistant: ${conv.answer}\n\n`
    })
    conversationHistoryText += '=== END CONVERSATION HISTORY ===\n'
  }

  const contextDocuments = context
    .map((item) =>
      `=== ${item.title}${item.author ? ` by ${item.author}` : ''} ===\n${item.content}`
    )
    .join('\n\n')

  return `Golden Rule: Every answer must be built only from the documents provided. You may never bring in outside knowledge.

How to answer:

If the user's question involves more than one topic covered in the documents, you must combine insights across those documents into one unified response.

If one document describes a need or problem (e.g. orphans of war) and another describes a practice or solution (e.g. creative prayer), you must connect them. Do not treat them separately.

Always expand as much as the documents allow. If there are details about needs, context, or practices, weave them together.

Use a warm, conversational tone, but stay focused on the documents.

Do not cite sources — they will be shown separately.

Only say "I don't have information about that in the available documents" if:

The question's subject is completely absent across all documents,

AND there is no way to combine existing material into a relevant answer.

Transformation Rule: When asked to restructure, expand, reformat, or schedule content (such as "add homework to that outline" or "create weekly topics"), you may only work with:
1. The previous assistant response provided below (if present)
2. The available documents provided below

You may NOT introduce new claims, facts, or content that aren't in these sources.

Missing Content Handling: When asked to add specific content (scripture, readings, assignments, etc.):
- If that content exists in the provided documents, integrate it naturally
- If that content is NOT in the documents, create the requested structure using only available material, and note briefly which sections could be enhanced with additional resources

Do NOT ask users to upload or select documents - they cannot do this.

Document Generation: When users request a PDF, PowerPoint, or Excel file (e.g., "Create a PDF of that outline", "Make me a PowerPoint presentation"), provide a brief confirmation message. The system will automatically generate the requested file and provide a download link.

Example responses:
- "I've created a PDF version of the outline. You can download it below."
- "I've generated a PowerPoint presentation with the curriculum content. Your download link is ready."
- "I've prepared an Excel spreadsheet with the structured data. Click below to download."

${conversationHistoryText}

Available documents:
${contextDocuments}`
}

// =================================================================
// CONVERSATION SAVING
// =================================================================

export async function saveConversation(
  userId: string,
  sessionId: string,
  question: string,
  answer: string,
  sources: Source[]
): Promise<string | null> {
  let conversationId: string | null = null

  await withSupabaseAdmin(async (supabase) => {
    const { data: conversation, error: insertError } = await supabase
      .from('conversations')
      .insert({
        user_id: userId,
        session_id: sessionId,
        question,
        answer,
        sources
      })
      .select('id')
      .single()

    if (insertError) {
      logError(insertError, {
        userId,
        sessionId,
        operation: 'save_conversation'
      })
      throw insertError
    }

    conversationId = conversation?.id || null

    // Update session timestamp
    const { error: updateError } = await supabase
      .from('chat_sessions')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', sessionId)

    if (updateError) {
      logError(updateError, {
        userId,
        sessionId,
        operation: 'update_session_timestamp'
      })
    }
  })

  return conversationId
}

// =================================================================
// MEMORY INTEGRATION
// =================================================================

export async function updateMemorySystem(
  userId: string,
  sessionId: string,
  conversationId: string | null,
  question: string,
  answer: string,
  sources: Source[],
  hadSearchResults: boolean
): Promise<void> {
  try {
    await userContextManager.updateUserContext(
      userId,
      question,
      answer,
      sources,
      sessionId
    )

    await userContextManager.logConversation(
      userId,
      sessionId,
      conversationId,
      question,
      answer,
      sources,
      undefined,
      hadSearchResults
    )

    logger.info({
      userId,
      sessionId,
      conversationId
    }, 'Memory system - updated user context and logged conversation')
  } catch (_memoryError) {
    // Don't throw - memory errors shouldn't break the chat experience
  }
}

// =================================================================
// USAGE TRACKING
// =================================================================

export async function trackChatUsage(
  userId: string,
  authUserId: string | undefined,
  sessionId: string,
  systemPromptLength: number,
  userMessageLength: number,
  responseLength: number,
  sourcesCount: number,
  uniqueDocuments: number,
  chunksFound: number,
  requestId: string
): Promise<void> {
  // Track onboarding milestone (only if authUserId is available)
  if (authUserId) {
    await trackOnboardingMilestone({
      authUserId,
      milestone: 'first_successful_answer',
      metadata: {
        answer_length: responseLength,
        sources_count: sourcesCount,
        documents_used: uniqueDocuments,
        chunks_found: chunksFound,
        cached: false
      }
    })
  }

  // Track OpenAI usage for donation cost
  const estimatedPromptTokens = Math.ceil((systemPromptLength + userMessageLength) / 4)
  const estimatedCompletionTokens = Math.ceil(responseLength / 4)
  const estimatedTotalTokens = estimatedPromptTokens + estimatedCompletionTokens

  trackUsage({
    userId,
    service: 'openai',
    totalTokens: estimatedTotalTokens,
    operationCount: 1,
    requestId
  }).catch(() => {}) // Silent failure - never block chat
}

// =================================================================
// QUALITY CHECKS
// =================================================================

export function getQualityThresholds(queryIntent: QueryIntent): {
  confidenceThreshold: number
  scoreThreshold: number
} {
  if (queryIntent === 'synthesize_from_docs') {
    return { confidenceThreshold: 0.35, scoreThreshold: 0.40 }
  }
  if (queryIntent === 'basic_factual') {
    return { confidenceThreshold: 0.4, scoreThreshold: 0.45 }
  }
  return { confidenceThreshold: 0.7, scoreThreshold: 0.55 }
}

export function isLowQualityResult(
  contextLength: number,
  searchConfidence: number,
  topChunkScore: number,
  queryIntent: QueryIntent,
  lastArtifact: string
): { isLow: boolean; allowOverride: boolean } {
  const { confidenceThreshold, scoreThreshold } = getQualityThresholds(queryIntent)

  const allowTransformOverride = queryIntent === 'transform_prior_artifact' && !!lastArtifact.trim()
  const allowDocumentOverride = queryIntent === 'generate_document' && (!!lastArtifact.trim() || contextLength > 0)
  const allowOverride = allowTransformOverride || allowDocumentOverride

  const isLow =
    (contextLength === 0 && !allowOverride) ||
    (searchConfidence <= 0.1 && !allowOverride) ||
    (!allowOverride && searchConfidence < confidenceThreshold && topChunkScore < scoreThreshold)

  return { isLow, allowOverride }
}
