import { NextRequest } from 'next/server'
import { auth } from '@clerk/nextjs/server'
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
  console.log(`Cache lookup: key="${cacheKey}"`)
  const result = advancedCache.get<CachedChatResponse>(
    CACHE_NAMESPACES.CHAT_HISTORY,
    cacheKey
  )
  console.log(`Cache ${result ? 'HIT' : 'MISS'} for question: "${question.substring(0, 50)}..."`)
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

export async function POST(_request: NextRequest) {
  try {
    // =================================================================
    // RATE LIMITING - Prevent abuse by limiting requests per user/IP
    // =================================================================
    const identifier = getIdentifier(_request);
    const rateLimitResult = chatRateLimit(identifier);
    
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

    // =================================================================
    // AUTHENTICATION - Verify user is logged in with Clerk
    // =================================================================
    const { userId } = await auth()
    if (!userId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Authentication required' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // =================================================================
    // USER VERIFICATION - Check user exists in our database
    // =================================================================
    const user = await getCurrentUser()
    if (!user) {
      return new Response(
        JSON.stringify({ success: false, error: 'User not found in database' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Capture user details for use in async operations
    const currentUserId = user.id
    const userEmail = user.email
    const clerkUserId = userId // userId is guaranteed non-null at this point

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
    console.log(`Processing question: "${trimmedQuestion}" for user: ${userEmail}`)

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
          .single()
        return !!data
      }).catch(() => false),

      // 2. Check cache for instant response
      Promise.resolve(getCachedChatResponse(trimmedQuestion, currentUserId)),

      // 3. Get conversation history (uses new composite index: idx_conversations_session_user_created)
      getCachedConversationHistory(sessionId) ||
        withSupabaseAdmin(async (supabase) => {
          const { data } = await supabase
            .from('conversations')
            .select('question, answer')
            .eq('session_id', sessionId)
            .eq('user_id', currentUserId)
            .order('created_at', { ascending: false })
            .limit(3) // Keep for context quality
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

    if (cachedResponse) {
      console.log(`Advanced cache hit! Returning instant response for user: ${currentUserId}`)

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

    console.log(`Cache miss for user ${currentUserId}, proceeding with full processing`)

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
    console.log(`Using pre-fetched conversation history (${conversationHistory.length} messages)`)

    // Cache the history for future requests
    if (conversationHistory.length > 0) {
      cacheConversationHistory(sessionId, conversationHistory)
    }

    // Create contextual search query by combining current question with recent context
    let contextualSearchQuery = trimmedQuestion
    if (conversationHistory && conversationHistory.length > 0) {
      // Extract key topics from recent conversation to add context
      const recentTopics = (conversationHistory as Array<{question: string; answer: string}>)
        .map(conv => conv.question)
        .join(' ')
      // Only add context if the current question seems like a follow-up (pronouns, incomplete subjects)
      const isFollowUpQuestion = /^(what|how|why|when|where)['']?s\s+(it|this|that|they|their)/i.test(trimmedQuestion) ||
                                 /^(and|but|also|so|then)\s/i.test(trimmedQuestion) ||
                                 trimmedQuestion.length < 30 // Short questions likely need context

      if (isFollowUpQuestion) {
        contextualSearchQuery = `${recentTopics} ${trimmedQuestion}`
        console.log(`Enhanced search query with context: "${contextualSearchQuery}"`)
      }
    }

    // =================================================================
    // STEP 2: EMBEDDING GENERATION - Convert contextual query to vector
    // =================================================================
    console.log('Creating question embedding...')
    const questionEmbedding = await createEmbedding(contextualSearchQuery)

    // =================================================================
    // STEP 3: HYBRID SEARCH - Advanced semantic + keyword search with context
    // =================================================================
    console.log('Starting intelligent hybrid search...')
    const searchResult = await intelligentSearch(
      contextualSearchQuery,
      questionEmbedding,
      {
        maxResults: 20,
        minSemanticScore: 0.2, // Lowered from 0.3 for better recall
        minKeywordScore: 0.05, // Lowered from 0.1 for better recall
        userId: currentUserId,
        enableCache: true
      }
    )

    const relevantChunks = searchResult.results
    console.log(`Hybrid search completed: ${relevantChunks.length} chunks found using ${searchResult.searchStrategy} (confidence: ${(searchResult.confidence * 100).toFixed(1)}%)`)

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
      console.log(`🎯 INTELLIGENT CLARIFICATION TRIGGERED: ${clarificationAnalysis.clarificationType} (confidence: ${(clarificationAnalysis.confidence * 100).toFixed(1)}%)`)
      console.log(`📊 Decision reasoning: ${clarificationAnalysis.reasoning}`)

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
          1 // Low satisfaction score for no results
        )
      } catch (memoryError) {
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

    // =================================================================
    // STEP 3: DOCUMENT DIVERSITY OPTIMIZATION
    // =================================================================
    const chunksByDocument = relevantChunks.reduce((acc, chunk) => {
      const key = chunk.documentTitle
      if (!acc[key]) acc[key] = []
      acc[key].push(chunk)
      return acc
    }, {} as Record<string, typeof relevantChunks>)

    const context = Object.entries(chunksByDocument)
      .map(([title, chunks]) => ({
        title,
        chunks: chunks.slice(0, 4) // Keep good quality
      }))
      .sort((a, b) => b.chunks[0].score - a.chunks[0].score)
      .flatMap(group => group.chunks)
      .slice(0, 8) // Restored to original for quality
      .map(chunk => ({
        content: chunk.content || 'No content available',
        title: chunk.documentTitle,
        author: chunk.documentAuthor
      }))

    const uniqueDocuments = new Set(context.map(c => c.title)).size
    console.log(`Using context from ${uniqueDocuments} different documents with ${context.length} total chunks`)

    // DEBUG: Log the actual documents being used for complex queries
    if (context.length < 8) {
    }

    // =================================================================
    // NONSENSE QUERY CHECK - Early exit for gibberish/nonsense
    // =================================================================
    // The clarificationAnalysis was already performed earlier in the route
    // Check if it indicates very low confidence (nonsense/gibberish)
    if (clarificationAnalysis.confidence <= 0.1) {
      console.log(`🚫 NONSENSE/GIBBERISH DETECTED by intelligent system: "${trimmedQuestion}" (confidence: ${clarificationAnalysis.confidence}) - early exit`)
      return new Response(
        JSON.stringify({
          answer: "I don't have information about that. Please ask about topics related to the available documents.",
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
    // =================================================================
    if (context.length === 0 || searchResult.confidence <= 0.1) {
      console.log(`🚫 NONSENSE QUERY - Early exit triggered - context: ${context.length} chunks, confidence: ${searchResult.confidence}% - providing brief response`)
      return new Response(
        JSON.stringify({
          answer: "I don't have information about that. Please ask about topics related to the available documents.",
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
    // STEP 4: PREPARE SOURCES FOR FRONTEND WITH METADATA
    // =================================================================
    
    // Get unique document titles from chunks
    const uniqueDocumentTitles = [...new Set(relevantChunks.map(chunk => chunk.documentTitle))]
    
    // Fetch document metadata from database with connection pooling
    const documentsWithMetadata = await withSupabaseAdmin(async (supabase) => {
      const { data, error } = await supabase
        .from('documents')
        .select(`
          title,
          author,
          amazon_url,
          resource_url,
          download_enabled,
          contact_person,
          contact_email
        `)
        .in('title', uniqueDocumentTitles)

      if (error) {
        return []
      }
      return data || []
    })

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
        amazon_url?: string
        resource_url?: string
        download_enabled: boolean
        contact_person?: string
        contact_email?: string
      }>)
      .slice(0, 8)

    // =================================================================
    // STEP 5: FORMAT CONVERSATION HISTORY FOR AI PROMPT
    // =================================================================
    let conversationHistoryText = ''
    if (conversationHistory && conversationHistory.length > 0) {
      conversationHistoryText = '\n\n=== RECENT CONVERSATION HISTORY ===\n'
      ;(conversationHistory as Array<{question: string; answer: string}>).forEach(conv => {
        conversationHistoryText += `User: ${conv.question}\nAssistant: ${conv.answer}\n\n`
      })
      conversationHistoryText += '=== END CONVERSATION HISTORY ===\n'
      console.log(`Including ${conversationHistory.length} previous messages for context`)
    }

    // =================================================================
    // STEP 6: BUILD CONTEXT AND SYSTEM PROMPT WITH HISTORY
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

${conversationHistoryText}

Available documents:
${contextDocuments}`


    // =================================================================
    // STEP 7: STREAMING AI RESPONSE
    // =================================================================

    let stream
    try {
      stream = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: trimmedQuestion }
        ],
        temperature: 0.3,
        max_tokens: 2000, // Restored to original for quality
        stream: true,
      })
    } catch (openaiError) {
      console.error(`❌ OpenAI API call failed:`, openaiError)
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
          let chunkCount = 0
          for await (const chunk of stream) {
            chunkCount++
            const content = chunk.choices[0]?.delta?.content || ''

            if (content) {
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
              break
            }
          }

          // Send completion signal
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'complete',
            fullResponse: fullResponse
          })}\n\n`))

        } catch (error) {
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
              console.log(`✅ ADVANCED CACHE: Stored complete response (${fullResponse.length} chars) for user ${currentUserId}`)
              
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
                  console.error('Error saving conversation:', insertError)
                  throw insertError
                }

                conversationId = conversation?.id || null

                // Update session timestamp
                const { error: updateError } = await supabase
                  .from('chat_sessions')
                  .update({ updated_at: new Date().toISOString() })
                  .eq('id', sessionId)

                if (updateError) {
                  console.error('Error updating session:', updateError)
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
                  sources
                )

                console.log(`✅ MEMORY: Updated user context and logged conversation for user ${currentUserId}`)
              } catch (memoryError) {
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

              console.log(`Successfully saved streaming conversation for user ${currentUserId}`)
              
            } catch (cacheError) {
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
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Chat request failed'
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}