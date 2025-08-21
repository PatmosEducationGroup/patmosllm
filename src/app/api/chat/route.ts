import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase'
import { createEmbedding, generateChatResponse } from '@/lib/openai'
import { searchChunks } from '@/lib/pinecone'
import { getCurrentUser } from '@/lib/auth'
import { chatRateLimit } from '@/lib/rate-limiter';
import { getIdentifier } from '@/lib/get-identifier';
import { sanitizeInput } from '@/lib/input-sanitizer';

export async function POST(request: NextRequest) {
  try {
    // RATE LIMITING - Check this FIRST before doing anything else
    const identifier = getIdentifier(request);
    const rateLimitResult = chatRateLimit(identifier);
    
    if (!rateLimitResult.success) {
      return new Response(
        JSON.stringify({
          error: rateLimitResult.message,
          resetTime: rateLimitResult.resetTime
        }),
        { 
          status: 429, // "Too Many Requests" status code
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    // Check authentication
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      )
    }

    // Get current user
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found in database' },
        { status: 403 }
      )
    }

    // Get question from request
    const { question, sessionId } = await request.json()
    const sanitizedQuestion = sanitizeInput(question)
   if (!sanitizedQuestion || typeof sanitizedQuestion !== 'string' || sanitizedQuestion.length === 0) {
  return NextResponse.json(
    { success: false, error: 'Question is required' },
    { status: 400 }
  )
}

    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: 'Session ID is required' },
        { status: 400 }
      )
    }

    // Verify session belongs to user
    const { data: session, error: sessionError } = await supabaseAdmin
      .from('chat_sessions')
      .select('id')
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .single()

    if (sessionError || !session) {
      return NextResponse.json(
        { success: false, error: 'Invalid session' },
        { status: 400 }
      )
    }

    const trimmedQuestion = question.trim()
    console.log(`Processing question: "${trimmedQuestion}" for user: ${user.email}`)

    // Step 1: Create embedding for the question
    console.log('Creating question embedding...')
    const questionEmbedding = await createEmbedding(trimmedQuestion)

    // Step 2: Search for relevant chunks in Pinecone
    console.log('Searching for relevant chunks...')
    const relevantChunks = await searchChunks(
      questionEmbedding,
      10, // Top 10 results
      0.5 // Minimum similarity score
    )

    console.log(`Found ${relevantChunks.length} relevant chunks`)

    if (relevantChunks.length === 0) {
      // Save conversation with no sources
      await supabaseAdmin
        .from('conversations')
        .insert({
          user_id: user.id,
          question: trimmedQuestion,
          answer: "I couldn't find any relevant information in the uploaded documents to answer your question. You might want to try rephrasing your question or check if relevant documents have been uploaded.",
          sources: []
        })

      return NextResponse.json({
        success: true,
        answer: "I couldn't find any relevant information in the uploaded documents to answer your question. You might want to try rephrasing your question or check if relevant documents have been uploaded.",
        sources: []
      })
    }

    // Step 3: Prepare context for ChatGPT
    const context = relevantChunks.map(chunk => ({
      content: chunk.content,
      title: chunk.documentTitle,
      author: chunk.documentAuthor
    }))

    // Step 4: Generate response with ChatGPT
    console.log('Generating AI response...')
    const chatResponse = await generateChatResponse(trimmedQuestion, context)

    // Step 5: Prepare sources for response
    const sources = relevantChunks
      .reduce((acc, chunk) => {
        // Deduplicate by document title
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
      .slice(0, 5) // Limit to top 5 source documents

    // Step 6: Save conversation to database with session
    console.log('Saving conversation to database...')
    await supabaseAdmin
      .from('conversations')
      .insert({
        user_id: user.id,
        session_id: sessionId,
        question: trimmedQuestion,
        answer: chatResponse.answer,
        sources: sources
      })

    // Update session timestamp
    await supabaseAdmin
      .from('chat_sessions')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', sessionId)

    console.log(`Successfully answered question for ${user.email}`)

    return NextResponse.json({
      success: true,
      answer: chatResponse.answer,
      sources: sources,
      chunksFound: relevantChunks.length,
      tokensUsed: chatResponse.usage.total_tokens
    })

  } catch (error) {
    console.error('Chat error:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Chat request failed' 
      },
      { status: 500 }
    )
  }
}