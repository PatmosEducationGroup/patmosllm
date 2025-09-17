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
import { 
  advancedCache, 
  CACHE_NAMESPACES, 
  getCachedConversationHistory,
  cacheConversationHistory 
} from '@/lib/advanced-cache'
import OpenAI from 'openai'
import { hashQuestion, getCachedResponse, setCachedResponse } from '@/lib/cache'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

export async function POST(request: NextRequest) {
  try {
    console.log('=== CHAT API CALLED ===')
    // =================================================================
    // RATE LIMITING - Prevent abuse by limiting requests per user/IP
    // =================================================================
    const identifier = getIdentifier(request);
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

    // =================================================================
    // INPUT VALIDATION - Get and sanitize the user's question
    // =================================================================
    const { question, sessionId } = await request.json()
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

    // =================================================================
    // SESSION VERIFICATION - Ensure session belongs to this user
    // =================================================================
    const session = await withSupabaseAdmin(async (supabase) => {
      const { data, error } = await supabase
        .from('chat_sessions')
        .select('id')
        .eq('id', sessionId)
        .eq('user_id', user.id)
        .single()
      
      if (error || !data) {
        throw new Error('Invalid session')
      }
      return data
    }).catch(() => null)

    if (!session) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid session' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const trimmedQuestion = question.trim()
    console.log(`Processing question: "${trimmedQuestion}" for user: ${user.email}`)

    // =================================================================
    // STEP 1.5: CHECK CACHE FOR INSTANT RESPONSES
    // =================================================================
    const questionHash = hashQuestion(trimmedQuestion)
    const cachedResponse = getCachedResponse(questionHash)

    if (cachedResponse) {
      console.log(`Cache hit! Returning instant response for hash: ${questionHash}`)
      
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

    console.log(`Cache miss for hash: ${questionHash}, proceeding with full processing`)

    // =================================================================
    // ONBOARDING TRACKING - Track first chat milestone
    // =================================================================
    await trackOnboardingMilestone({
      clerkUserId: userId,
      milestone: 'first_chat',
      metadata: {
        question_length: trimmedQuestion.length,
        session_id: sessionId,
        timestamp: new Date().toISOString()
      }
    })

    // =================================================================
    // STEP 1: EMBEDDING GENERATION - Convert question to vector
    // =================================================================
    console.log('Creating question embedding...')
    const questionEmbedding = await createEmbedding(trimmedQuestion)

    // =================================================================
    // STEP 2: HYBRID SEARCH - Advanced semantic + keyword search
    // =================================================================
    console.log('Starting intelligent hybrid search...')
    console.log(`DEBUG: About to search for: "${trimmedQuestion}"`)
    const searchResult = await intelligentSearch(
      trimmedQuestion,
      questionEmbedding,
      {
        maxResults: 20,
        minSemanticScore: 0.2, // Lowered from 0.3 for better recall
        minKeywordScore: 0.05, // Lowered from 0.1 for better recall
        userId: user.id,
        enableCache: true
      }
    )
    console.log(`DEBUG: Search completed, found ${searchResult.results.length} results`)

    const relevantChunks = searchResult.results
    console.log(`Hybrid search completed: ${relevantChunks.length} chunks found using ${searchResult.searchStrategy} (confidence: ${(searchResult.confidence * 100).toFixed(1)}%)`)

    // =================================================================
    // HANDLE NO RESULTS - Return helpful message if no relevant content
    // =================================================================
    if (relevantChunks.length === 0) {
      const noResultsMessage = searchResult.suggestions && searchResult.suggestions.length > 0
        ? `I couldn't find any relevant information in the uploaded documents to answer your question. ${searchResult.suggestions.join(' ')} You might also want to check if relevant documents have been uploaded.`
        : "I couldn't find any relevant information in the uploaded documents to answer your question. You might want to try rephrasing your question or check if relevant documents have been uploaded."
      
      // Save conversation with no sources using connection pool
      await withSupabaseAdmin(async (supabase) => {
        await supabase
          .from('conversations')
          .insert({
            user_id: user.id,
            session_id: sessionId,
            question: trimmedQuestion,
            answer: noResultsMessage,
            sources: []
          })
      })

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
        chunks: chunks.slice(0, 4)
      }))
      .sort((a, b) => b.chunks[0].score - a.chunks[0].score)
      .flatMap(group => group.chunks)
      .slice(0, 8)
      .map(chunk => ({
        content: chunk.content || 'No content available',
        title: chunk.documentTitle,
        author: chunk.documentAuthor
      }))

    const uniqueDocuments = new Set(context.map(c => c.title)).size
    console.log(`Using context from ${uniqueDocuments} different documents with ${context.length} total chunks`)

    // DEBUG: Log the actual documents being used for complex queries
    if (context.length < 8) {
      console.log('DEBUG - Documents found:')
      context.forEach((chunk, i) => {
        console.log(`  ${i + 1}. "${chunk.title}" by ${chunk.author || 'Unknown'}: ${chunk.content.substring(0, 80)}...`)
      })
    }

    // =================================================================
    // SECURITY CHECK: REFUSE IF NO RELEVANT DOCUMENTS FOUND OR LOW CONFIDENCE
    // =================================================================
    if (context.length === 0 || searchResult.confidence < 0.1) {
      console.log(`Security check triggered - context: ${context.length} chunks, confidence: ${searchResult.confidence}% - refusing to answer`)
      return new Response(
        JSON.stringify({
          answer: "I don't have information about that in the available documents. Please contact support if you need help with topics outside our knowledge base.",
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
        console.error('Error fetching document metadata:', error)
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
    // STEP 5: GET CONVERSATION HISTORY FOR CONTEXT (WITH CACHING)
    // =================================================================
    console.log('Fetching conversation history with caching...')
    let recentConversations = getCachedConversationHistory(sessionId)
    
    if (!recentConversations) {
      // Cache miss - fetch from database using optimized connection
      const conversations = await withSupabaseAdmin(async (supabase) => {
        const { data, error } = await supabase
          .from('conversations')
          .select('question, answer')
          .eq('session_id', sessionId)
          .eq('user_id', user.id)
          .order('created_at', { ascending: true })
          .limit(2) // Get last 2 messages only
        
        if (error) {
          console.error('Error fetching conversation history:', error)
          return []
        }
        return data || []
      })
      
      recentConversations = conversations
      cacheConversationHistory(sessionId, conversations)
      console.log(`Conversation history cached for session ${sessionId}`)
    } else {
      console.log(`Using cached conversation history for session ${sessionId}`)
    }

    let conversationHistory = ''
    if (recentConversations && recentConversations.length > 0) {
      conversationHistory = '\n\n=== RECENT CONVERSATION HISTORY ===\n'
      recentConversations.forEach((conv, index) => {
        conversationHistory += `User: ${conv.question}\nAssistant: ${conv.answer}\n\n`
      })
      conversationHistory += '=== END CONVERSATION HISTORY ===\n'
      console.log(`Including ${recentConversations.length} previous messages for context`)
    }

    // =================================================================
    // STEP 6: BUILD CONTEXT AND SYSTEM PROMPT WITH HISTORY
    // =================================================================
    const contextDocuments = context
      .map((item) =>
        `=== ${item.title}${item.author ? ` by ${item.author}` : ''} ===\n${item.content}`
      )
      .join('\n\n')

    // DEBUG: Log context being passed to AI
    console.log(`DEBUG CONTEXT: Passing ${context.length} documents to AI`)
    console.log(`DEBUG CONTEXT: Total context length: ${contextDocuments.length} characters`)
    if (contextDocuments.length === 0) {
      console.log('ERROR: No context documents found! This will cause "no information" response')
    } else {
      console.log(`DEBUG CONTEXT: First document preview: ${context[0]?.title} - ${context[0]?.content?.substring(0, 100)}...`)
    }
      
    // TEMPORARY DEBUG: Show what context is being passed to AI
    const debugResponse = `DEBUG PRODUCTION CONTEXT:
Length: ${contextDocuments.length} characters
Context count: ${context.length} documents
First 300 chars: "${contextDocuments.substring(0, 300)}..."
Search confidence: ${searchResult.confidence}
Security check passed: ${!(context.length === 0 || searchResult.confidence < 0.1)}`

    return new Response(
      JSON.stringify({ content: debugResponse }),
      { headers: { 'Content-Type': 'application/json' } }
    )

    const systemPrompt = `You are a document-based AI assistant. You MUST ONLY answer questions using information from the provided documents below.

STRICT RULES - NO EXCEPTIONS:
- ONLY use information that appears in the provided documents
- NEVER use your general knowledge or training data
- NEVER provide information from outside sources, even if you know it
- NEVER make assumptions or provide general knowledge beyond what's in the documents
- If someone asks about topics completely unrelated to the documents (like baking, cooking, general facts not in docs), refuse politely

Response guidelines when documents contain relevant information:
- Be helpful and comprehensive - if the documents discuss the topic, provide a full answer
- Synthesize and connect information across the provided documents
- Draw reasonable connections between related concepts found in the documents
- Use conversation history for context when it relates to the documents
- DON'T cite sources in your response - sources will be shown separately

Only say "I don't have information about that in the available documents" if:
- The topic is completely absent from all provided documents
- The documents contain no relevant information whatsoever
- The question asks about something entirely outside the scope of the uploaded content

${conversationHistory}

Available documents:
${contextDocuments}`

    // =================================================================
    // STEP 7: STREAMING AI RESPONSE
    // =================================================================
    console.log('Starting streaming AI response...')
    
    const stream = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: trimmedQuestion }
      ],
      temperature: 0.3,
      max_tokens: 2000,
      stream: true,
    })

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
          for await (const chunk of stream) {
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
          console.error('Streaming error:', error)
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'error',
            error: 'Failed to generate response'
          })}\n\n`))
        } finally {
          controller.close()
          
          // ✅ PERFECT CACHE TIMING - Only cache after streaming is 100% complete
          if (streamingComplete && fullResponse.trim()) {
            try {
              await setCachedResponse(questionHash, fullResponse, sources)
              console.log(`✅ PERFECT CACHE: Stored complete response (${fullResponse.length} chars)`)
              
              // Save conversation to database using connection pool
              const currentUserId = user.id // Capture user ID before async operation
              await withSupabaseAdmin(async (supabase) => {
                const { error: insertError } = await supabase
                  .from('conversations')
                  .insert({
                    user_id: currentUserId,
                    session_id: sessionId,
                    question: trimmedQuestion,
                    answer: fullResponse,
                    sources: sources
                  })

                if (insertError) {
                  console.error('Error saving conversation:', insertError)
                  throw insertError
                }

                // Update session timestamp
                const { error: updateError } = await supabase
                  .from('chat_sessions')
                  .update({ updated_at: new Date().toISOString() })
                  .eq('id', sessionId)

                if (updateError) {
                  console.error('Error updating session:', updateError)
                }
              })

              // Clear cached conversation history since we added a new message
              advancedCache.delete(CACHE_NAMESPACES.CHAT_HISTORY, sessionId)

              // Track onboarding milestone
              await trackOnboardingMilestone({
                clerkUserId: userId,
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
              console.error('Cache storage error:', cacheError)
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
    console.error('Chat error:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Chat request failed' 
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}