import { NextRequest } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase'
import { createEmbedding } from '@/lib/openai'
import { searchChunks } from '@/lib/pinecone'
import { getCurrentUser } from '@/lib/auth'
import { chatRateLimit } from '@/lib/rate-limiter';
import { getIdentifier } from '@/lib/get-identifier';
import { sanitizeInput } from '@/lib/input-sanitizer';
import { trackOnboardingMilestone } from '@/lib/onboardingTracker'
import OpenAI from 'openai'
import { hashQuestion, getCachedResponse, setCachedResponse } from '@/lib/cache'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

export async function POST(request: NextRequest) {
  try {
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
    const { data: session, error: sessionError } = await supabaseAdmin
      .from('chat_sessions')
      .select('id')
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .single()

    if (sessionError || !session) {
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
    // STEP 2: VECTOR SEARCH - Find relevant document chunks
    // =================================================================
    console.log('Searching for relevant chunks...')
    const relevantChunks = await searchChunks(
      questionEmbedding,
      20,
      0.3
    )

    console.log(`Found ${relevantChunks.length} relevant chunks`)

    // =================================================================
    // HANDLE NO RESULTS - Return helpful message if no relevant content
    // =================================================================
    if (relevantChunks.length === 0) {
      const noResultsMessage = "I couldn't find any relevant information in the uploaded documents to answer your question. You might want to try rephrasing your question or check if relevant documents have been uploaded."
      
      // Save conversation with no sources
      await supabaseAdmin
        .from('conversations')
        .insert({
          user_id: user.id,
          session_id: sessionId,
          question: trimmedQuestion,
          answer: noResultsMessage,
          sources: []
        })

      return new Response(
        JSON.stringify({
          type: 'complete',
          answer: noResultsMessage,
          sources: []
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
        content: chunk.content,
        title: chunk.documentTitle,
        author: chunk.documentAuthor
      }))

    const uniqueDocuments = new Set(context.map(c => c.title)).size
    console.log(`Using context from ${uniqueDocuments} different documents with ${context.length} total chunks`)

    // =================================================================
    // STEP 4: PREPARE SOURCES FOR FRONTEND
    // =================================================================
    const sources = relevantChunks
      .reduce((acc, chunk) => {
        if (!acc.find(source => source.title === chunk.documentTitle)) {
          acc.push({
            title: chunk.documentTitle,
            author: chunk.documentAuthor || undefined,
            chunk_id: chunk.id
          })
        }
        return acc
      }, [] as Array<{
        title: string
        author?: string
        chunk_id: string
      }>)
      .slice(0, 8)

    // =================================================================
    // STEP 5: GET CONVERSATION HISTORY FOR CONTEXT
    // =================================================================
    console.log('Fetching conversation history...')
    const { data: recentConversations, error: historyError } = await supabaseAdmin
      .from('conversations')
      .select('question, answer')
      .eq('session_id', sessionId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .limit(2) // Get last 2 messages only

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
      
    const systemPrompt = `You're a helpful AI assistant that answers questions using the organization's knowledge base.

Be conversational and natural - like you're talking to a colleague. Don't be overly formal or robotic.

Key instructions:
- Answer directly and helpfully using the provided documents
- Use the conversation history to provide contextual responses
- If someone asks "tell me more about that" or similar, refer to the previous conversation
- If you don't know something from the docs, just say so naturally
- Keep it friendly and conversational
- Make reasonable connections between related information
- Be confident when the information is clear
- DON'T cite sources in your response - sources will be shown separately
- Synthesize information across documents when it makes sense
- Use a natural, helpful tone

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
              
              // Save conversation to database
              await supabaseAdmin
                .from('conversations')
                .insert({
                  user_id: user.id,
                  session_id: sessionId,
                  question: trimmedQuestion,
                  answer: fullResponse,
                  sources: sources
                })

              // Update session timestamp
              await supabaseAdmin
                .from('chat_sessions')
                .update({ updated_at: new Date().toISOString() })
                .eq('id', sessionId)

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

              console.log(`Successfully saved streaming conversation for ${user.email}`)
              
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