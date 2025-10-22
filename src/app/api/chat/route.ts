import { NextRequest } from 'next/server'
import { withSupabaseAdmin } from '@/lib/supabase'
import { createEmbedding } from '@/lib/openai'
import { intelligentSearch } from '@/lib/hybrid-search'
import { getCurrentUser } from '@/lib/auth'
import { chatRateLimit } from '@/lib/rate-limiter';
import { getIdentifier } from '@/lib/get-identifier';
import { sanitizeInput } from '@/lib/input-sanitizer';
import { trackOnboardingMilestone } from '@/lib/onboardingTracker'
import { userContextManager } from '@/lib/userContextManager'
import { intelligentClarification } from '@/lib/intelligent-clarification'
import {
  advancedCache,
  CACHE_NAMESPACES,
  CACHE_TTL,
  getCachedConversationHistory,
  cacheConversationHistory
} from '@/lib/advanced-cache'
import OpenAI from 'openai'
import { logger, loggers, logError } from '@/lib/logger'
import { trackUsage } from '@/lib/donation-tracker'
import { pMap, pTimeout, retry } from '@/lib/utils/performance'
import { createPerformanceTimings, buildPerformanceMetrics } from '@/lib/performance-tracking'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

// Advanced cache helper functions for chat responses
function generateQuestionCacheKey(question: string, userId: string): string {
  // Normalize question for better cache hits while maintaining user context
  const normalized = question
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')

  return `${normalized}-${userId.substring(0, 8)}`
}

interface CachedChatResponse {
  answer: string
  sources: Array<{title: string; author?: string; chunk_id: string}>
  timestamp: number
}

function getCachedChatResponse(question: string, userId: string): CachedChatResponse | null {
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

function setCachedChatResponse(
  question: string,
  userId: string,
  answer: string,
  sources: Array<{title: string; author?: string; chunk_id: string}>
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
    CACHE_TTL.MEDIUM // 30 minutes for chat responses
  )
}

// =================================================================
// INTENT CLASSIFICATION - Determine query type for context routing
// =================================================================
type QueryIntent = 'retrieve_from_docs' | 'basic_factual' | 'synthesize_from_docs' | 'transform_prior_artifact' | 'generate_document'
type DocumentFormat = 'pdf' | 'pptx' | 'xlsx' | null

interface IntentResult {
  intent: QueryIntent
  documentFormat?: DocumentFormat
}

function classifyIntent(question: string, hasHistory: boolean, lastAnswerLength: number): IntentResult {
  const q = question.toLowerCase()

  // Document generation detection: user wants downloadable file
  const docFormats = {
    pdf: /\b(pdf|portable document)\b/i,
    pptx: /\b(powerpoint|ppt|pptx|presentation|slides?|slideshow)\b/i,
    xlsx: /\b(excel|xlsx?|spreadsheet|workbook|table)\b/i
  }

  const docVerbs = /\b(create|make|generate|give me|export|download|save|produce|write|turn.*into|convert.*to)\b/i

  // Check for document generation intent
  // This must be checked FIRST before transform detection
  for (const [format, regex] of Object.entries(docFormats)) {
    if (regex.test(q) && docVerbs.test(q)) {
      return {
        intent: 'generate_document',
        documentFormat: format as DocumentFormat
      }
    }
  }

  // Transform detection: user wants to modify/expand the last AI response
  const transformVerbs = /\b(add|create|develop|write|make|generate|expand|elaborate|revise|divide|integrate|turn|convert|include|incorporate|design|construct|build)\b/i
  const refsPrior = /\b(that|this|the outline|the plan|those|these|it|them)\b/i

  // Short imperative commands after substantial response = likely transformation
  const isShortImperative = q.split(' ').length <= 6 && transformVerbs.test(q)

  if (hasHistory && lastAnswerLength > 400) {
    // Explicit reference to prior content OR short imperative after long response
    if (refsPrior.test(q) || isShortImperative) {
      return { intent: 'transform_prior_artifact' }
    }
  }

  // Synthesis detection: user wants structured organization from docs
  const synthKeywords = /\b(outline|scope|sequence|syllabus|curriculum|framework|weekly|modules?|lesson plan|teaching plan|course design)\b/i
  if (synthKeywords.test(q)) {
    return { intent: 'synthesize_from_docs' }
  }

  // Basic factual detection: simple "what is X" or "who is X" questions
  // These should use lower thresholds since they're direct factual lookups
  const basicFactualPatterns = /^(what is|what's|who is|who's|define|explain|describe|tell me about)\s/i
  if (basicFactualPatterns.test(q) && q.split(' ').length <= 8) {
    return { intent: 'basic_factual' }
  }

  // Default: normal retrieval
  return { intent: 'retrieve_from_docs' }
}

export async function POST(_request: NextRequest) {
  try {
    // =================================================================
    // AUTHENTICATION - getCurrentUser() handles both Supabase and Clerk auth
    // =================================================================
    const user = await getCurrentUser()
    if (!user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Authentication required' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // =================================================================
    // RATE LIMITING - Role-based tiered limits (after auth)
    // Regular: 30/5min, Contributor: 150/5min, Admin: 1500/5min, Super Admin: 3000/5min
    // =================================================================
    const identifier = await getIdentifier(_request);
    const rateLimitResult = await chatRateLimit(identifier, user.role);

    if (!rateLimitResult.success) {
      return new Response(
        JSON.stringify({
          error: rateLimitResult.message,
          resetTime: rateLimitResult.resetTime
        }),
        {
          status: 429,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Capture user details for use in async operations
    const currentUserId = user.id
    const userEmail = user.email
    const clerkUserId = user.clerk_id // Use clerk_id from user record

    // =================================================================
    // INPUT VALIDATION - Get and sanitize the user's question
    // =================================================================
    const { question, sessionId } = await _request.json()
    const sanitizedQuestion = sanitizeInput(question)
    
    if (!sanitizedQuestion || typeof sanitizedQuestion !== 'string' || sanitizedQuestion.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Question is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    if (!sessionId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Session ID is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const trimmedQuestion = question.trim()
    logger.info({
      question: trimmedQuestion.substring(0, 100),
      userEmail,
      userId: currentUserId,
      sessionId
    }, 'Processing chat question')

    // =================================================================
    // PERFORMANCE TRACKING - Start timing instrumentation
    // =================================================================
    const timings = createPerformanceTimings()

    // =================================================================
    // PARALLEL BATCH 1: SESSION VALIDATION + CACHE CHECK + CONVERSATION HISTORY
    // Fetch everything we need upfront in parallel for maximum speed
    // =================================================================
    const [sessionValid, cachedResponse, conversationHistory] = await Promise.all([
      // 1. Validate session (uses new composite index: idx_chat_sessions_id_user)
      withSupabaseAdmin(async (supabase) => {
        const { data } = await supabase
          .from('chat_sessions')
          .select('id')
          .eq('id', sessionId)
          .eq('user_id', currentUserId)
          .is('deleted_at', null)
          .single()
        return !!data
      }).catch(() => false),

      // 2. Check cache for instant response
      Promise.resolve(getCachedChatResponse(trimmedQuestion, currentUserId)),

      // 3. Get conversation history (uses new composite index: idx_conversations_session_user_created)
      getCachedConversationHistory(sessionId) ||
        withSupabaseAdmin(async (supabase) => {
          // Feature flag: FF_CHAT_HISTORY_2_TURNS reduces history from 3 to 2 turns for speed
          const historyLimit = process.env.FF_CHAT_HISTORY_2_TURNS === 'true' ? 2 : 3
          const { data } = await supabase
            .from('conversations')
            .select('question, answer')
            .eq('session_id', sessionId)
            .eq('user_id', currentUserId)
            .is('deleted_at', null)
            .order('created_at', { ascending: false })
            .limit(historyLimit)
          return data || []
        })
    ])

    // Validate session result
    if (!sessionValid) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid session' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // =================================================================
    // STEP 1.5: RETURN CACHED RESPONSE IF AVAILABLE (instant)
    // =================================================================
    timings.cacheCheck = Date.now() - timings.start
    timings.cacheHit = !!cachedResponse

    if (cachedResponse) {
      loggers.cache({
        userId: currentUserId,
        answerLength: cachedResponse.answer.length,
        sourcesCount: cachedResponse.sources.length
      }, 'Advanced cache hit - returning instant response')

      // Return cached response immediately as streaming format
      const encoder = new TextEncoder()
      const readable = new ReadableStream({
        start(controller) {
          // Send sources
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'sources',
            sources: cachedResponse.sources,
            chunksFound: cachedResponse.sources.length,
            cached: true
          })}\n\n`))

          // Send complete response instantly
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'complete',
            fullResponse: cachedResponse.answer
          })}\n\n`))

          controller.close()
        }
      })

      return new Response(readable, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        }
      })
    }

    loggers.cache({ userId: currentUserId }, 'Cache miss - proceeding with full processing')

    // =================================================================
    // STEP 1.6: CLARIFICATION ANALYSIS - Check if question needs clarification
    // Note: Conversation history already fetched in parallel batch above
    // =================================================================

    // =================================================================
    // ONBOARDING TRACKING - Track first chat milestone
    // =================================================================
    await trackOnboardingMilestone({
      clerkUserId: clerkUserId,
      milestone: 'first_chat',
      metadata: {
        question_length: trimmedQuestion.length,
        session_id: sessionId,
        timestamp: new Date().toISOString()
      }
    })

    // =================================================================
    // STEP 1: USE PRE-FETCHED CONVERSATION HISTORY FOR CONTEXTUAL SEARCH
    // Already fetched in parallel batch above for optimal performance
    // =================================================================
    logger.info({
      conversationCount: conversationHistory.length,
      sessionId
    }, 'Using pre-fetched conversation history')

    // Cache the history for future requests
    if (conversationHistory.length > 0) {
      cacheConversationHistory(sessionId, conversationHistory)
    }

    // =================================================================
    // INTENT CLASSIFICATION - Determine query type for optimal handling
    // =================================================================
    const lastAnswerLength = conversationHistory.length > 0
      ? (conversationHistory[0] as {answer: string}).answer?.length || 0
      : 0

    // Get last artifact - for document generation, skip short confirmation messages (< 200 chars)
    // and find the most recent substantial content
    let lastArtifact = ''
    for (const conv of conversationHistory) {
      const answer = (conv as {answer: string}).answer || ''
      if (answer.length >= 200) {
        lastArtifact = answer
        break
      }
    }

    // Fallback to most recent if all are short
    if (!lastArtifact && conversationHistory.length > 0) {
      lastArtifact = (conversationHistory[0] as {answer: string}).answer || ''
    }

    const intentResult = classifyIntent(trimmedQuestion, conversationHistory.length > 0, lastAnswerLength)
    const queryIntent = intentResult.intent
    const documentFormat = intentResult.documentFormat

    loggers.ai({
      queryIntent,
      documentFormat,
      hasHistory: conversationHistory.length > 0
    }, 'Query intent classified')

    if (queryIntent === 'transform_prior_artifact') {
      loggers.ai({
        artifactLength: lastArtifact.length
      }, 'Transform mode - using last artifact as primary context')
    }

    if (queryIntent === 'generate_document') {
      loggers.ai({
        documentFormat,
        source: lastArtifact ? 'last_artifact' : 'search_results'
      }, 'Document generation mode activated')
    }

    // Create contextual search query by combining current question with recent context
    let contextualSearchQuery = trimmedQuestion
    if (conversationHistory && conversationHistory.length > 0) {
      // Extract key topics from recent conversation to add context
      const recentTopics = (conversationHistory as Array<{question: string; answer: string}>)
        .map(conv => conv.question)
        .join(' ')
      // Only add context if the current question is actually a follow-up
      const isFollowUpQuestion =
        // Pronouns referring to previous context
        /^(what|how|why|when|where|who)['']?s?\s+(it|this|that|they|their|them|these|those)/i.test(trimmedQuestion) ||
        // Conjunctions starting sentences
        /^(and|but|also|so|then)\s/i.test(trimmedQuestion) ||
        // Follow-up phrases
        /(tell me more|what about|how about|what else|anything else|can you|could you explain)/i.test(trimmedQuestion) ||
        // Ultra-short contextual questions (likely need context)
        (trimmedQuestion.length < 10 && /^(why|how|when|where|what|who)\??$/i.test(trimmedQuestion))

      if (isFollowUpQuestion) {
        contextualSearchQuery = `${recentTopics} ${trimmedQuestion}`
        logger.info({
          originalQuery: trimmedQuestion.substring(0, 50),
          enhancedQuery: contextualSearchQuery.substring(0, 100)
        }, 'Enhanced search query with context')
      }
    }

    // =================================================================
    // STEP 2: EMBEDDING GENERATION - Convert contextual query to vector
    // =================================================================
    loggers.ai({ queryLength: contextualSearchQuery.length }, 'Creating question embedding')
    const requestId = crypto.randomUUID() // For donation tracking idempotency
    const questionEmbedding = await createEmbedding(contextualSearchQuery, currentUserId, requestId)

    // =================================================================
    // STEP 3: HYBRID SEARCH - Advanced semantic + keyword search with context
    // =================================================================
    // Feature flag: FF_K_17 reduces search results from 20 to 17 for speed
    const searchMaxResults = process.env.FF_K_17 === 'true' ? 17 : 20

    loggers.performance({ userId: currentUserId }, 'Starting intelligent hybrid search')
    const searchResult = await intelligentSearch(
      contextualSearchQuery,
      questionEmbedding,
      {
        maxResults: searchMaxResults,
        minSemanticScore: 0.5, // Raised to 0.5 to filter weak false positives
        minKeywordScore: 0.05, // Lowered from 0.1 for better recall
        userId: currentUserId,
        enableCache: true
      }
    )

    const relevantChunks = searchResult.results
    timings.search = Date.now() - timings.start

    loggers.performance({
      chunksFound: relevantChunks.length,
      searchStrategy: searchResult.searchStrategy,
      confidence: searchResult.confidence,
      searchTime: timings.search,
      userId: currentUserId
    }, 'Hybrid search completed')

    // =================================================================
    // INTELLIGENT CLARIFICATION ANALYSIS - Check if clarification would improve results
    // =================================================================
    const clarificationAnalysis = intelligentClarification.analyzeSearchResults({
      query: trimmedQuestion,
      searchResults: relevantChunks,
      searchConfidence: searchResult.confidence,
      searchStrategy: searchResult.searchStrategy,
      recentConversations: conversationHistory as Array<{ question: string; answer: string }> || [],
      // Pass info about whether the search query was enhanced with context
      wasQueryEnhanced: contextualSearchQuery !== trimmedQuestion,
      originalQuery: trimmedQuestion,
      enhancedQuery: contextualSearchQuery
    })

    // If clarification is beneficial, provide conversational guidance
    if (clarificationAnalysis.needsClarification && clarificationAnalysis.clarificationMessage) {
      loggers.ai({
        clarificationType: clarificationAnalysis.clarificationType,
        confidence: clarificationAnalysis.confidence,
        reasoning: clarificationAnalysis.reasoning
      }, 'Intelligent clarification triggered')

      // Generate enhanced conversational clarification
      const conversationalMessage = intelligentClarification.generateConversationalClarification(
        clarificationAnalysis,
        trimmedQuestion
      )

      // Save the clarification response as a conversation
      await withSupabaseAdmin(async (supabase) => {
        await supabase
          .from('conversations')
          .insert({
            user_id: currentUserId,
            session_id: sessionId,
            question: trimmedQuestion,
            answer: conversationalMessage,
            sources: []
          })
      })

      // Return clarification as streaming response
      const encoder = new TextEncoder()
      const readable = new ReadableStream({
        start(controller) {
          // Send sources (empty for clarification)
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'sources',
            sources: [],
            chunksFound: 0
          })}\n\n`))

          // Send the enhanced clarification message
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'complete',
            fullResponse: conversationalMessage
          })}\n\n`))

          controller.close()
        }
      })

      return new Response(readable, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        }
      })
    }

    // =================================================================
    // HANDLE NO RESULTS - Return helpful message if no relevant content
    // =================================================================
    if (relevantChunks.length === 0) {
      // Transform override: If we're transforming a prior artifact, skip the no-results message
      const allowTransformBypass = queryIntent === 'transform_prior_artifact' && lastArtifact.trim()

      if (allowTransformBypass) {
        loggers.ai({
          artifactLength: lastArtifact.length,
          queryIntent
        }, 'Transform bypass - continuing with artifact despite zero search results')
        // Don't return early - continue to generation with artifact as context
      } else {
        const noResultsMessage = searchResult.suggestions && searchResult.suggestions.length > 0
          ? `I couldn't find any relevant information in the uploaded documents to answer your question. ${searchResult.suggestions.join(' ')} You might also want to check if relevant documents have been uploaded.`
          : "I couldn't find any relevant information in the uploaded documents to answer your question. You might want to try rephrasing your question or check if relevant documents have been uploaded."
      
      // Save conversation with no sources using connection pool
      let noResultsConversationId: string | null = null
      await withSupabaseAdmin(async (supabase) => {
        const { data: conversation, error } = await supabase
          .from('conversations')
          .insert({
            user_id: currentUserId,
            session_id: sessionId,
            question: trimmedQuestion,
            answer: noResultsMessage,
            sources: []
          })
          .select('id')
          .single()

        if (!error && conversation) {
          noResultsConversationId = conversation.id
        }
      })

      // Log to memory system even for no-results responses
      try {
        await userContextManager.logConversation(
          currentUserId,
          sessionId,
          noResultsConversationId,
          trimmedQuestion,
          noResultsMessage,
          [],
          1, // Low satisfaction score for no results
          false // No search results found
        )
      } catch (_memoryError) {
      }

      return new Response(
        JSON.stringify({
          type: 'complete',
          answer: noResultsMessage,
          sources: [],
          searchStrategy: searchResult.searchStrategy,
          confidence: searchResult.confidence,
          suggestions: searchResult.suggestions
        }),
        { headers: { 'Content-Type': 'application/json' } }
      )
      }
    }

    // =================================================================
    // STEP 3: DOCUMENT DIVERSITY OPTIMIZATION
    // =================================================================
    const chunksByDocument = relevantChunks.reduce((acc, chunk) => {
      const key = chunk.documentTitle
      if (!acc[key]) acc[key] = []
      acc[key].push(chunk)
      return acc
    }, {} as Record<string, typeof relevantChunks>)

    // Feature flag: FF_CTX_CHUNKS_7 reduces context chunks from 8 to 7 for speed
    const contextChunkLimit = process.env.FF_CTX_CHUNKS_7 === 'true' ? 7 : 8

    const context = Object.entries(chunksByDocument)
      .map(([title, chunks]) => ({
        title,
        chunks: chunks.slice(0, 4) // Keep good quality
      }))
      .sort((a, b) => b.chunks[0].score - a.chunks[0].score)
      .flatMap(group => group.chunks)
      .slice(0, contextChunkLimit)
      .map(chunk => ({
        content: chunk.content || 'No content available',
        title: chunk.documentTitle,
        author: chunk.documentAuthor
      }))

    const uniqueDocuments = new Set(context.map(c => c.title)).size
    loggers.performance({
      uniqueDocuments,
      totalChunks: context.length,
      userId: currentUserId
    }, 'Context prepared from documents')

    // =================================================================
    // NONSENSE QUERY CHECK - Early exit for gibberish/nonsense
    // =================================================================
    // The clarificationAnalysis was already performed earlier in the route
    // Check if it indicates very low confidence (nonsense/gibberish)
    if (clarificationAnalysis.confidence <= 0.1) {
      loggers.ai({
        question: trimmedQuestion.substring(0, 50),
        confidence: clarificationAnalysis.confidence
      }, 'Nonsense/gibberish detected - early exit')

      const nonsenseMessage = "I don't have information about that. Please ask about topics related to the available documents."

      // Save conversation with no sources using connection pool
      let nonsenseConversationId: string | null = null
      await withSupabaseAdmin(async (supabase) => {
        const { data: conversation, error } = await supabase
          .from('conversations')
          .insert({
            user_id: currentUserId,
            session_id: sessionId,
            question: trimmedQuestion,
            answer: nonsenseMessage,
            sources: []
          })
          .select('id')
          .single()

        if (!error && conversation) {
          nonsenseConversationId = conversation.id
        }
      })

      // Log to memory system
      try {
        await userContextManager.logConversation(
          currentUserId,
          sessionId,
          nonsenseConversationId,
          trimmedQuestion,
          nonsenseMessage,
          [],
          1, // Low satisfaction score
          false // No search results found
        )
      } catch (_memoryError) {
      }

      return new Response(
        JSON.stringify({
          answer: nonsenseMessage,
          sources: [],
          session_id: sessionId,
          cached: false
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    }

    // =================================================================
    // SECURITY CHECK: REFUSE IF NO RELEVANT DOCUMENTS FOUND OR LOW CONFIDENCE
    // Exceptions:
    // - transform_prior_artifact: allow low confidence when we have a last artifact
    // - synthesize_from_docs: use relaxed thresholds for multi-document synthesis
    // =================================================================
    const topChunkScore = relevantChunks[0]?.score || 0

    // Different thresholds based on query intent
    let confidenceThreshold = 0.7
    let scoreThreshold = 0.55

    if (queryIntent === 'synthesize_from_docs') {
      // Synthesis queries naturally have lower scores (weaving multiple docs)
      confidenceThreshold = 0.35
      scoreThreshold = 0.40
      loggers.ai({
        confidenceThreshold,
        scoreThreshold,
        queryIntent
      }, 'Using relaxed thresholds for synthesis query')
    } else if (queryIntent === 'basic_factual') {
      // Basic factual questions should use lower thresholds
      // These are simple lookups like "what is prayer"
      confidenceThreshold = 0.4
      scoreThreshold = 0.45
      loggers.ai({
        confidenceThreshold,
        scoreThreshold,
        queryIntent
      }, 'Using relaxed thresholds for basic factual query')
    }

    // Special intent overrides: Transform or document generation bypass quality checks
    const allowTransformOverride = queryIntent === 'transform_prior_artifact' && lastArtifact.trim()
    const allowDocumentOverride = queryIntent === 'generate_document' && (lastArtifact.trim() || context.length > 0)
    const allowOverride = allowTransformOverride || allowDocumentOverride

    const isLowQuality =
      (context.length === 0 && !allowOverride) ||
      (searchResult.confidence <= 0.1 && !allowOverride) ||
      // Intent-aware dual-threshold
      (!allowOverride && searchResult.confidence < confidenceThreshold && topChunkScore < scoreThreshold)

    if (isLowQuality) {
      // Check if we should allow this anyway due to special intent override
      if (allowTransformOverride) {
        loggers.ai({
          confidence: searchResult.confidence,
          artifactLength: lastArtifact.length,
          supportingChunks: context.length
        }, 'Transform override - allowing despite low search confidence')
        // Continue to generation (don't return early)
      } else if (allowDocumentOverride) {
        loggers.ai({
          confidence: searchResult.confidence,
          source: lastArtifact ? 'last_artifact' : 'search_results',
          contentLength: lastArtifact ? lastArtifact.length : context.length
        }, 'Document override - allowing generation despite low search confidence')
        // Continue to generation (don't return early)
      } else {
      loggers.ai({
        contextChunks: context.length,
        confidence: searchResult.confidence,
        topScore: topChunkScore
      }, 'Low quality results - early exit triggered')

      const lowConfidenceMessage = "I don't have information about that. Please ask about topics related to the available documents."

      // Save conversation with no sources using connection pool
      let lowConfidenceConversationId: string | null = null
      await withSupabaseAdmin(async (supabase) => {
        const { data: conversation, error } = await supabase
          .from('conversations')
          .insert({
            user_id: currentUserId,
            session_id: sessionId,
            question: trimmedQuestion,
            answer: lowConfidenceMessage,
            sources: []
          })
          .select('id')
          .single()

        if (!error && conversation) {
          lowConfidenceConversationId = conversation.id
        }
      })

      // Log to memory system
      try {
        await userContextManager.logConversation(
          currentUserId,
          sessionId,
          lowConfidenceConversationId,
          trimmedQuestion,
          lowConfidenceMessage,
          [],
          1, // Low satisfaction score
          false // No search results found
        )
      } catch (_memoryError) {
      }

      return new Response(
        JSON.stringify({
          answer: lowConfidenceMessage,
          sources: [],
          session_id: sessionId,
          cached: false
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    }
    }

    // =================================================================
    // STEP 4: PREPARE SOURCES FOR FRONTEND WITH METADATA
    // Parallel metadata fetch with retry and concurrency control
    // =================================================================

    // Get unique document IDs from chunks (more efficient than titles)
    const uniqueDocumentIds = [...new Set(relevantChunks.map(chunk => chunk.documentId))];

    // Fetch document metadata in parallel with retry and concurrency control
    // This replaces the sequential .in() query with parallel per-document fetches
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

              if (error) {
                throw error
              }
              return data
            }),
            1500 // 1.5s timeout per document
          ),
          { retries: 1, minTimeout: 120, maxTimeout: 250 } // Retry with jitter for transient errors
        ).catch((error) => {
          // Log error but don't fail - partial metadata is better than no metadata
          loggers.database({ docId, error: error.message }, 'Metadata fetch failed (tolerated)')
          return null
        })
      },
      { concurrency: 8 } // Max 8 parallel requests to avoid DB overload
    ).then(results => results.filter(r => r !== null)) // Remove null results

    timings.metadata = Date.now() - timings.start

    // Build sources array with metadata
    const sources = relevantChunks
      .reduce((acc, chunk) => {
        if (!acc.find(source => source.title === chunk.documentTitle)) {
          // Find metadata for this document
          const metadata = documentsWithMetadata?.find(doc => doc.title === chunk.documentTitle)
          
          acc.push({
            title: chunk.documentTitle,
            author: chunk.documentAuthor || undefined,
            chunk_id: chunk.id,
            document_id: chunk.documentId,
            has_file: !!metadata?.storage_path,
            file_size: metadata?.file_size || undefined,
            // Add metadata fields
            amazon_url: metadata?.amazon_url || undefined,
            resource_url: metadata?.resource_url || undefined,
            download_enabled: metadata?.download_enabled || false,
            contact_person: metadata?.contact_person || undefined,
            contact_email: metadata?.contact_email || undefined
          })
        }
        return acc
      }, [] as Array<{
        title: string
        author?: string
        chunk_id: string
        document_id: string
        has_file: boolean
        file_size?: number
        amazon_url?: string
        resource_url?: string
        download_enabled: boolean
        contact_person?: string
        contact_email?: string
      }>)
      .slice(0, 8)

    // =================================================================
    // STEP 5: FORMAT CONVERSATION HISTORY FOR AI PROMPT
    // For transform_prior_artifact, include the last artifact as primary context
    // =================================================================
    let conversationHistoryText = ''
    if (conversationHistory && conversationHistory.length > 0) {
      conversationHistoryText = '\n\n=== RECENT CONVERSATION HISTORY ===\n'
      ;(conversationHistory as Array<{question: string; answer: string}>).forEach(conv => {
        conversationHistoryText += `User: ${conv.question}\nAssistant: ${conv.answer}\n\n`
      })
      conversationHistoryText += '=== END CONVERSATION HISTORY ===\n'
      logger.info({
        messageCount: conversationHistory.length
      }, 'Including previous messages for context')
    }

    // =================================================================
    // STEP 6: BUILD CONTEXT AND SYSTEM PROMPT WITH HISTORY
    // Include last artifact for transformation requests
    // =================================================================
    const contextDocuments = context
      .map((item) =>
        `=== ${item.title}${item.author ? ` by ${item.author}` : ''} ===\n${item.content}`
      )
      .join('\n\n')

    const systemPrompt = `Golden Rule: Every answer must be built only from the documents provided. You may never bring in outside knowledge.

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

    timings.promptBuild = Date.now() - timings.start

    // =================================================================
    // STEP 7: STREAMING AI RESPONSE
    // =================================================================

    // Build user message - include artifact context for transformations
    let userMessage = trimmedQuestion
    if (queryIntent === 'transform_prior_artifact' && lastArtifact.trim()) {
      userMessage = `Previous assistant response to build upon:\n---\n${lastArtifact}\n---\n\nUser request: ${trimmedQuestion}`
      loggers.ai({
        artifactLength: lastArtifact.length,
        queryIntent
      }, 'Including previous artifact in user message for transformation')
    }

    let stream
    try {
      stream = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
        temperature: 0.3,
        max_tokens: 2000, // Restored to original for quality
        stream: true,
      })
    } catch (openaiError) {
      logError(openaiError instanceof Error ? openaiError : new Error('OpenAI API call failed'), {
        userId: currentUserId,
        sessionId,
        endpoint: 'chat'
      })
      throw new Error(`OpenAI API failed: ${openaiError instanceof Error ? openaiError.message : ''}`)
    }

    // =================================================================
    // STEP 8: CREATE STREAMING RESPONSE WITH PERFECT CACHE TIMING
    // =================================================================
    let fullResponse = ''
    let streamingComplete = false

    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      async start(controller) {
        // Send sources immediately
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          type: 'sources',
          sources: sources,
          chunksFound: relevantChunks.length,
          documentsUsed: uniqueDocuments
        })}\n\n`))

        try {
          let _chunkCount = 0
          let firstTokenRecorded = false
          for await (const chunk of stream) {
            _chunkCount++
            const content = chunk.choices[0]?.delta?.content || ''

            if (content) {
              // Record first token latency (FTL)
              if (!firstTokenRecorded) {
                timings.firstToken = Date.now() - timings.start
                firstTokenRecorded = true
              }

              fullResponse += content

              // Send each chunk to the frontend
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: 'chunk',
                content: content
              })}\n\n`))
            }

            // Check if streaming is finished
            if (chunk.choices[0]?.finish_reason === 'stop') {
              streamingComplete = true
              timings.streamComplete = Date.now() - timings.start
              break
            }
          }

          // =================================================================
          // DOCUMENT GENERATION: Generate downloadable file if requested
          // IMPORTANT: Must happen BEFORE complete signal so frontend receives it
          // =================================================================
          if (queryIntent === 'generate_document' && documentFormat && fullResponse.trim()) {
            try {
              loggers.ai({
                documentFormat,
                responseLength: fullResponse.length
              }, `Generating ${documentFormat.toUpperCase()} document`)

              const { generatePDF, generatePPTX, generateXLSX } = await import('@/lib/document-generator')
              const { storeTempFile, getDownloadUrl } = await import('@/lib/temp-file-storage')

              // Generate intelligent title from content
              const generateSmartTitle = (content: string): string => {
                // Extract first heading if exists
                const headingMatch = content.match(/^#+ (.+)$/m)
                if (headingMatch) {
                  return headingMatch[1].trim()
                }

                // Otherwise use first sentence (up to 60 chars)
                const firstSentence = content.split(/[.!?]\s/)[0].trim()
                if (firstSentence.length > 0 && firstSentence.length <= 60) {
                  return firstSentence
                }

                // Fallback to first 50 chars
                return content.substring(0, 50).trim() + (content.length > 50 ? '...' : '')
              }

              // Prepare metadata for document generation
              const contentToExport = lastArtifact && lastArtifact.trim() ? lastArtifact : fullResponse
              loggers.ai({
                contentSource: lastArtifact && lastArtifact.trim() ? 'lastArtifact' : 'fullResponse',
                contentLength: contentToExport.length
              }, 'Document content source selected')
              const smartTitle = generateSmartTitle(contentToExport)
              loggers.ai({ title: smartTitle }, 'Generated document title')

              const documentMetadata = {
                title: smartTitle,
                content: contentToExport,
                sources: sources,
                timestamp: new Date()
              }

              // Create clean filename from title
              const createFilename = (title: string, _ext: string): string => {
                const clean = title
                  .toLowerCase()
                  .replace(/[^a-z0-9\s-]/g, '') // Remove special chars
                  .replace(/\s+/g, '-')          // Spaces to hyphens
                  .replace(/-+/g, '-')           // Multiple hyphens to one
                  .substring(0, 50)              // Max 50 chars
                  .replace(/^-+|-+$/g, '')       // Trim hyphens

                return clean || 'document'
              }

              // Generate document based on format
              let buffer: Buffer
              let filename: string

              switch (documentFormat) {
                case 'pdf':
                  buffer = await generatePDF(documentMetadata)
                  filename = createFilename(smartTitle, 'pdf')
                  break
                case 'pptx':
                  buffer = await generatePPTX(documentMetadata)
                  filename = createFilename(smartTitle, 'pptx')
                  break
                case 'xlsx':
                  buffer = await generateXLSX(documentMetadata)
                  filename = createFilename(smartTitle, 'xlsx')
                  break
                default:
                  throw new Error(`Unsupported format: ${documentFormat}`)
              }

              // Store file temporarily (storeTempFile will add timestamp and random ID)
              const fileId = await storeTempFile(buffer, documentFormat, filename)
              const downloadUrl = getDownloadUrl(fileId)

              loggers.ai({
                fileId,
                format: documentFormat,
                size: buffer.length
              }, 'Document generated successfully')

              // Send document metadata to frontend
              const documentMetadataPayload = {
                type: 'document',
                format: documentFormat,
                filename: fileId,
                downloadUrl: downloadUrl,
                size: buffer.length,
                expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString()
              }
              loggers.ai({
                format: documentFormat,
                fileId,
                size: buffer.length
              }, 'Streaming document metadata to frontend')
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(documentMetadataPayload)}\n\n`))

            } catch (docError) {
              logError(docError instanceof Error ? docError : new Error('Document generation failed'), {
                userId: currentUserId,
                sessionId,
                documentFormat
              })
              // Send error to frontend but don't fail the entire request
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: 'document_error',
                error: 'Failed to generate document. Please try again.'
              })}\n\n`))
            }
          }

          // Send completion signal AFTER document generation
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'complete',
            fullResponse: fullResponse
          })}\n\n`))

        } catch (error) {
    logError(error instanceof Error ? error : new Error('Operation failed'), {
      operation: 'API chat',
      phase: 'request_handling',
      severity: 'critical',
      errorContext: 'Operation failed'
    })
controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'error',
            error: 'Failed to generate response'
          })}\n\n`))
  } finally {
          controller.close()
          
          // ✅ PERFECT CACHE TIMING - Only cache after streaming is 100% complete
          if (streamingComplete && fullResponse.trim()) {
            try {
              setCachedChatResponse(trimmedQuestion, currentUserId, fullResponse, sources)
              loggers.cache({
                userId: currentUserId,
                responseLength: fullResponse.length,
                sourcesCount: sources.length
              }, 'Advanced cache - stored complete response')
              
              // Save conversation to database using connection pool
              let conversationId: string | null = null
              await withSupabaseAdmin(async (supabase) => {
                const { data: conversation, error: insertError } = await supabase
                  .from('conversations')
                  .insert({
                    user_id: currentUserId,
                    session_id: sessionId,
                    question: trimmedQuestion,
                    answer: fullResponse,
                    sources: sources
                  })
                  .select('id')
                  .single()

                if (insertError) {
                  logError(insertError, {
                    userId: currentUserId,
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
                    userId: currentUserId,
                    sessionId,
                    operation: 'update_session_timestamp'
                  })
                }
              })

              // =================================================================
              // MEMORY INTEGRATION: Update user context and log conversation
              // =================================================================
              try {
                // Update user context with this conversation
                await userContextManager.updateUserContext(
                  currentUserId,
                  trimmedQuestion,
                  fullResponse,
                  sources,
                  sessionId
                )

                // Log conversation to memory system
                await userContextManager.logConversation(
                  currentUserId,
                  sessionId,
                  conversationId,
                  trimmedQuestion,
                  fullResponse,
                  sources,
                  undefined, // satisfaction will be user-provided later
                  true // Had search results
                )

                logger.info({
                  userId: currentUserId,
                  sessionId,
                  conversationId
                }, 'Memory system - updated user context and logged conversation')
              } catch (_memoryError) {
                // Don't throw - memory errors shouldn't break the chat experience
              }

              // Clear cached conversation history since we added a new message
              advancedCache.delete(CACHE_NAMESPACES.CHAT_HISTORY, sessionId)

              // Track onboarding milestone
              await trackOnboardingMilestone({
                clerkUserId: clerkUserId,
                milestone: 'first_successful_answer',
                metadata: {
                  answer_length: fullResponse.length,
                  sources_count: sources.length,
                  documents_used: uniqueDocuments,
                  chunks_found: relevantChunks.length,
                  cached: false
                }
              })

              loggers.database({
                userId: currentUserId,
                conversationId,
                responseLength: fullResponse.length
              }, 'Successfully saved streaming conversation')

              // Track OpenAI streaming usage for donation cost
              // Estimate tokens: rough heuristic of 1 token ≈ 4 characters
              const estimatedPromptTokens = Math.ceil((systemPrompt.length + userMessage.length) / 4)
              const estimatedCompletionTokens = Math.ceil(fullResponse.length / 4)
              const estimatedTotalTokens = estimatedPromptTokens + estimatedCompletionTokens

              trackUsage({
                userId: currentUserId,
                service: 'openai',
                totalTokens: estimatedTotalTokens,
                operationCount: 1,
                requestId
              }).catch(() => {}) // Silent failure - never block chat

            } catch (_cacheError) {
              // Silently tolerate cache/database errors - don't break chat
            }

            // =================================================================
            // PERFORMANCE METRICS - Always log, even if cache/database failed
            // Moved outside try-catch to ensure metrics are always captured
            // =================================================================
            try {
              const estimatedPromptTokens = Math.ceil((systemPrompt.length + userMessage.length) / 4)
              const estimatedCompletionTokens = Math.ceil(fullResponse.length / 4)

              const perfMetrics = buildPerformanceMetrics(
                timings,
                currentUserId,
                sessionId,
                estimatedPromptTokens,
                estimatedCompletionTokens,
                {
                  chatHistory2: process.env.FF_CHAT_HISTORY_2_TURNS === 'true',
                  ctx7: process.env.FF_CTX_CHUNKS_7 === 'true',
                  k17: process.env.FF_K_17 === 'true',
                  summaryBuffer: false // Not implemented yet
                },
                false // usedSummaryBuffer - not implemented yet
              )

              loggers.performance({
                ...perfMetrics,
                breakdown: {
                  cacheCheck: timings.cacheCheck,
                  search: timings.search,
                  metadata: timings.metadata,
                  promptBuild: timings.promptBuild,
                  ftl: perfMetrics.ftl,
                  ttlt: perfMetrics.ttlt
                }
              }, 'Chat request completed - full performance metrics')
            } catch (perfError) {
              // Log error but don't fail
              logError(perfError instanceof Error ? perfError : new Error('Performance logging failed'), {
                userId: currentUserId,
                sessionId
              })
            }
          }
        }
      }
    })

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    })
  } catch (error) {
    logError(error instanceof Error ? error : new Error('Operation failed'), {
      operation: 'API chat',
      phase: 'request_handling',
      severity: 'critical',
      errorContext: 'Operation failed'
    })
return new Response(
      JSON.stringify({
        success: false,
        error: 'Chat request failed'
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}