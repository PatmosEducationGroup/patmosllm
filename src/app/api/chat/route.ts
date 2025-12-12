import { NextRequest } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { chatRateLimit } from '@/lib/rate-limiter'
import { getIdentifier } from '@/lib/get-identifier'
import { sanitizeInput } from '@/lib/input-sanitizer'
import { trackOnboardingMilestone } from '@/lib/onboardingTracker'
import { intelligentClarification } from '@/lib/intelligent-clarification'
import { advancedCache, CACHE_NAMESPACES } from '@/lib/advanced-cache'
import OpenAI from 'openai'
import { logger, loggers, logError } from '@/lib/logger'
import { createPerformanceTimings, buildPerformanceMetrics } from '@/lib/performance-tracking'

// Import service functions
import {
  getCachedChatResponse,
  setCachedChatResponse,
  classifyIntent,
  validateSession,
  getConversationHistory,
  cacheHistory,
  performSearch,
  buildContext,
  analyzeClarification,
  fetchSourceMetadata,
  buildSystemPrompt,
  saveConversation,
  updateMemorySystem,
  trackChatUsage,
  isLowQualityResult
} from '@/services/chatService'

import { safeGenerateDocument } from '@/services/documentGenerationService'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

export async function POST(_request: NextRequest) {
  try {
    // =================================================================
    // AUTHENTICATION
    // =================================================================
    const user = await getCurrentUser()
    if (!user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Authentication required' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // =================================================================
    // RATE LIMITING
    // =================================================================
    const identifier = await getIdentifier(_request)
    const rateLimitResult = await chatRateLimit(identifier, user.role)

    if (!rateLimitResult.success) {
      return new Response(
        JSON.stringify({
          error: rateLimitResult.message,
          resetTime: rateLimitResult.resetTime
        }),
        { status: 429, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const currentUserId = user.id
    const userEmail = user.email
    const authUserId = user.auth_user_id

    // =================================================================
    // INPUT VALIDATION
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
    // PERFORMANCE TRACKING
    // =================================================================
    const timings = createPerformanceTimings()

    // =================================================================
    // PARALLEL BATCH 1: SESSION + CACHE + HISTORY
    // =================================================================
    const [sessionValid, cachedResponse, conversationHistory] = await Promise.all([
      validateSession(sessionId, currentUserId),
      Promise.resolve(getCachedChatResponse(trimmedQuestion, currentUserId)),
      getConversationHistory(sessionId, currentUserId)
    ])

    if (!sessionValid) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid session' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // =================================================================
    // CACHE HIT - Return instantly
    // =================================================================
    timings.cacheCheck = Date.now() - timings.start
    timings.cacheHit = !!cachedResponse

    if (cachedResponse) {
      loggers.cache({
        userId: currentUserId,
        answerLength: cachedResponse.answer.length,
        sourcesCount: cachedResponse.sources.length
      }, 'Cache hit - returning instant response')

      const encoder = new TextEncoder()
      const readable = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'sources',
            sources: cachedResponse.sources,
            chunksFound: cachedResponse.sources.length,
            cached: true
          })}\n\n`))

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
    // ONBOARDING TRACKING
    // =================================================================
    if (authUserId) {
      await trackOnboardingMilestone({
        authUserId,
        milestone: 'first_chat',
        metadata: {
          question_length: trimmedQuestion.length,
          session_id: sessionId,
          timestamp: new Date().toISOString()
        }
      })
    }

    // Cache history for future requests
    cacheHistory(sessionId, conversationHistory)

    // =================================================================
    // INTENT CLASSIFICATION
    // =================================================================
    const lastAnswerLength = conversationHistory.length > 0
      ? conversationHistory[0].answer?.length || 0
      : 0

    // Get last substantial artifact
    let lastArtifact = ''
    for (const conv of conversationHistory) {
      if (conv.answer.length >= 200) {
        lastArtifact = conv.answer
        break
      }
    }
    if (!lastArtifact && conversationHistory.length > 0) {
      lastArtifact = conversationHistory[0].answer || ''
    }

    const intentResult = classifyIntent(trimmedQuestion, conversationHistory.length > 0, lastAnswerLength)
    const queryIntent = intentResult.intent
    const documentFormat = intentResult.documentFormat

    loggers.ai({
      queryIntent,
      documentFormat,
      hasHistory: conversationHistory.length > 0
    }, 'Query intent classified')

    // =================================================================
    // SEARCH & EMBEDDING
    // =================================================================
    const requestId = crypto.randomUUID()
    const { contextualQuery, searchResult } = await performSearch(
      trimmedQuestion,
      conversationHistory,
      currentUserId,
      requestId
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
    // CLARIFICATION ANALYSIS
    // =================================================================
    const clarificationAnalysis = analyzeClarification(
      trimmedQuestion,
      relevantChunks,
      searchResult.confidence,
      searchResult.searchStrategy,
      conversationHistory,
      contextualQuery !== trimmedQuestion,
      trimmedQuestion,
      contextualQuery
    )

    // Handle clarification needed
    if (clarificationAnalysis.needsClarification && clarificationAnalysis.clarificationMessage) {
      loggers.ai({
        clarificationType: clarificationAnalysis.clarificationType,
        confidence: clarificationAnalysis.confidence
      }, 'Clarification triggered')

      const conversationalMessage = intelligentClarification.generateConversationalClarification(
        clarificationAnalysis,
        trimmedQuestion
      )

      await saveConversation(currentUserId, sessionId, trimmedQuestion, conversationalMessage, [])

      const encoder = new TextEncoder()
      const readable = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'sources',
            sources: [],
            chunksFound: 0
          })}\n\n`))

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
    // HANDLE NO RESULTS
    // =================================================================
    if (relevantChunks.length === 0) {
      const allowTransformBypass = queryIntent === 'transform_prior_artifact' && lastArtifact.trim()

      if (!allowTransformBypass) {
        const noResultsMessage = searchResult.suggestions?.length
          ? `I couldn't find any relevant information in the uploaded documents to answer your question. ${searchResult.suggestions.join(' ')} You might also want to check if relevant documents have been uploaded.`
          : "I couldn't find any relevant information in the uploaded documents to answer your question. You might want to try rephrasing your question or check if relevant documents have been uploaded."

        const conversationId = await saveConversation(currentUserId, sessionId, trimmedQuestion, noResultsMessage, [])
        await updateMemorySystem(currentUserId, sessionId, conversationId, trimmedQuestion, noResultsMessage, [], false)

        return new Response(
          JSON.stringify({
            type: 'complete',
            answer: noResultsMessage,
            sources: [],
            searchStrategy: searchResult.searchStrategy,
            confidence: searchResult.confidence
          }),
          { headers: { 'Content-Type': 'application/json' } }
        )
      }
    }

    // =================================================================
    // BUILD CONTEXT
    // =================================================================
    const context = buildContext(relevantChunks)
    const uniqueDocuments = new Set(context.map(c => c.title)).size

    loggers.performance({
      uniqueDocuments,
      totalChunks: context.length,
      userId: currentUserId
    }, 'Context prepared')

    // =================================================================
    // QUALITY CHECKS
    // =================================================================
    const topChunkScore = relevantChunks[0]?.score || 0

    // Check for nonsense/gibberish
    if (clarificationAnalysis.confidence <= 0.1) {
      const nonsenseMessage = "I don't have information about that. Please ask about topics related to the available documents."
      const conversationId = await saveConversation(currentUserId, sessionId, trimmedQuestion, nonsenseMessage, [])
      await updateMemorySystem(currentUserId, sessionId, conversationId, trimmedQuestion, nonsenseMessage, [], false)

      return new Response(
        JSON.stringify({ answer: nonsenseMessage, sources: [], session_id: sessionId, cached: false }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Check quality thresholds
    const { isLow, allowOverride } = isLowQualityResult(
      context.length,
      searchResult.confidence,
      topChunkScore,
      queryIntent,
      lastArtifact
    )

    if (isLow && !allowOverride) {
      const lowConfidenceMessage = "I don't have information about that. Please ask about topics related to the available documents."
      const conversationId = await saveConversation(currentUserId, sessionId, trimmedQuestion, lowConfidenceMessage, [])
      await updateMemorySystem(currentUserId, sessionId, conversationId, trimmedQuestion, lowConfidenceMessage, [], false)

      return new Response(
        JSON.stringify({ answer: lowConfidenceMessage, sources: [], session_id: sessionId, cached: false }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // =================================================================
    // FETCH SOURCE METADATA
    // =================================================================
    const sources = await fetchSourceMetadata(relevantChunks)
    timings.metadata = Date.now() - timings.start

    // =================================================================
    // BUILD SYSTEM PROMPT
    // =================================================================
    const systemPrompt = buildSystemPrompt(conversationHistory, context)
    timings.promptBuild = Date.now() - timings.start

    // Build user message
    let userMessage = trimmedQuestion
    if (queryIntent === 'transform_prior_artifact' && lastArtifact.trim()) {
      userMessage = `Previous assistant response to build upon:\n---\n${lastArtifact}\n---\n\nUser request: ${trimmedQuestion}`
    }

    // =================================================================
    // STREAMING AI RESPONSE
    // =================================================================
    let stream
    try {
      stream = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
        temperature: 0.3,
        max_tokens: 2000,
        stream: true
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
    // CREATE STREAMING RESPONSE
    // =================================================================
    let fullResponse = ''
    let streamingComplete = false

    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      async start(controller) {
        // Send sources immediately
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          type: 'sources',
          sources,
          chunksFound: relevantChunks.length,
          documentsUsed: uniqueDocuments
        })}\n\n`))

        try {
          let firstTokenRecorded = false
          for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || ''

            if (content) {
              if (!firstTokenRecorded) {
                timings.firstToken = Date.now() - timings.start
                firstTokenRecorded = true
              }

              fullResponse += content
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: 'chunk',
                content
              })}\n\n`))
            }

            if (chunk.choices[0]?.finish_reason === 'stop') {
              streamingComplete = true
              timings.streamComplete = Date.now() - timings.start
              break
            }
          }

          // =================================================================
          // DOCUMENT GENERATION
          // =================================================================
          if (queryIntent === 'generate_document' && documentFormat && fullResponse.trim()) {
            const contentToExport = lastArtifact?.trim() ? lastArtifact : fullResponse
            const generatedDoc = await safeGenerateDocument(
              documentFormat,
              fullResponse,
              contentToExport,
              sources,
              currentUserId,
              sessionId
            )

            if (generatedDoc) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: 'document',
                format: documentFormat,
                filename: generatedDoc.fileId,
                downloadUrl: generatedDoc.downloadUrl,
                size: generatedDoc.size,
                expiresAt: generatedDoc.expiresAt
              })}\n\n`))
            } else {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: 'document_error',
                error: 'Failed to generate document. Please try again.'
              })}\n\n`))
            }
          }

          // Send completion signal
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'complete',
            fullResponse
          })}\n\n`))

        } catch (error) {
          logError(error instanceof Error ? error : new Error('Streaming failed'), {
            operation: 'API chat',
            phase: 'streaming',
            userId: currentUserId
          })
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'error',
            error: 'Failed to generate response'
          })}\n\n`))
        } finally {
          controller.close()

          // =================================================================
          // POST-STREAM: Cache, Save, Track
          // =================================================================
          if (streamingComplete && fullResponse.trim()) {
            try {
              setCachedChatResponse(trimmedQuestion, currentUserId, fullResponse, sources)

              const conversationId = await saveConversation(
                currentUserId,
                sessionId,
                trimmedQuestion,
                fullResponse,
                sources
              )

              await updateMemorySystem(
                currentUserId,
                sessionId,
                conversationId,
                trimmedQuestion,
                fullResponse,
                sources,
                true
              )

              // Clear cached conversation history
              advancedCache.delete(CACHE_NAMESPACES.CHAT_HISTORY, sessionId)

              // Track usage
              await trackChatUsage(
                currentUserId,
                authUserId,
                sessionId,
                systemPrompt.length,
                userMessage.length,
                fullResponse.length,
                sources.length,
                uniqueDocuments,
                relevantChunks.length,
                requestId
              )

              // Log performance metrics
              const perfMetrics = buildPerformanceMetrics(
                timings,
                currentUserId,
                sessionId,
                Math.ceil((systemPrompt.length + userMessage.length) / 4),
                Math.ceil(fullResponse.length / 4),
                {
                  chatHistory2: process.env.FF_CHAT_HISTORY_2_TURNS === 'true',
                  ctx7: process.env.FF_CTX_CHUNKS_7 === 'true',
                  k17: process.env.FF_K_17 === 'true',
                  summaryBuffer: false
                },
                false
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
              }, 'Chat request completed')

            } catch (_postStreamError) {
              // Silently tolerate - don't break chat
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
    logError(error instanceof Error ? error : new Error('Chat request failed'), {
      operation: 'API chat',
      phase: 'request_handling',
      severity: 'critical'
    })
    return new Response(
      JSON.stringify({ success: false, error: 'Chat request failed' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
