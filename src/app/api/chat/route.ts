import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase'
import { createEmbedding, generateChatResponse } from '@/lib/openai'
import { searchChunks } from '@/lib/pinecone'
import { getCurrentUser } from '@/lib/auth'
import { chatRateLimit } from '@/lib/rate-limiter';
import { getIdentifier } from '@/lib/get-identifier';
import { sanitizeInput } from '@/lib/input-sanitizer';
import { trackOnboardingMilestone } from '@/lib/onboardingTracker'


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
          status: 429, // "Too Many Requests" status code
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // =================================================================
    // AUTHENTICATION - Verify user is logged in with Clerk
    // =================================================================
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      )
    }

    // =================================================================
    // USER VERIFICATION - Check user exists in our database
    // =================================================================
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found in database' },
        { status: 403 }
      )
    }

    // =================================================================
    // INPUT VALIDATION - Get and sanitize the user's question
    // =================================================================
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
      return NextResponse.json(
        { success: false, error: 'Invalid session' },
        { status: 400 }
      )
    }

const trimmedQuestion = question.trim()
console.log(`Processing question: "${trimmedQuestion}" for user: ${user.email}`)

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
    // IMPROVED: More chunks, lower threshold for better diversity
    // =================================================================
    console.log('Searching for relevant chunks...')
    const relevantChunks = await searchChunks(
      questionEmbedding,
      20, // INCREASED: Get more chunks for better document coverage
      0.3 // LOWERED: Include more varied sources (was 0.5)
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
          question: trimmedQuestion,
          answer: noResultsMessage,
          sources: []
        })

      return NextResponse.json({
        success: true,
        answer: noResultsMessage,
        sources: []
      })
    }

    // =================================================================
    // STEP 3: DOCUMENT DIVERSITY OPTIMIZATION
    // NEW: Ensure we get chunks from multiple documents, not just one
    // =================================================================
    
    // Group chunks by document title to ensure multi-document representation
    const chunksByDocument = relevantChunks.reduce((acc, chunk) => {
      const key = chunk.documentTitle
      if (!acc[key]) acc[key] = []
      acc[key].push(chunk)
      return acc
    }, {} as Record<string, typeof relevantChunks>)

    // Take up to 4 chunks per document to prevent single-document dominance
    // Sort documents by their best chunk's similarity score
    const context = Object.entries(chunksByDocument)
      .map(([title, chunks]) => ({
        title,
        chunks: chunks.slice(0, 4) // Maximum 4 chunks per document
      }))
      .sort((a, b) => b.chunks[0].score - a.chunks[0].score) // Sort by best similarity score
      .flatMap(group => group.chunks) // Flatten back to chunk array
      .slice(0, 16) // Total limit of 16 chunks to fit in context window
      .map(chunk => ({
        content: chunk.content,
        title: chunk.documentTitle,
        author: chunk.documentAuthor
      }))

    const uniqueDocuments = new Set(context.map(c => c.title)).size
    console.log(`Using context from ${uniqueDocuments} different documents with ${context.length} total chunks`)

    // =================================================================
    // STEP 4: AI RESPONSE GENERATION - Get synthesized answer from GPT
    // =================================================================
    console.log('Generating AI response with multi-document synthesis...')
    const chatResponse = await generateChatResponse(trimmedQuestion, context)


    // =================================================================
    // STEP 5: SOURCE PREPARATION - Create citation list for frontend
    // =================================================================
    const sources = relevantChunks
      .reduce((acc, chunk) => {
        // Deduplicate by document title to avoid showing same document multiple times
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
      .slice(0, 8) // INCREASED: Show up to 8 source documents (was 5)

// =================================================================
// ONBOARDING TRACKING - Track successful answer milestone
// =================================================================
if (chatResponse.answer && chatResponse.answer.length > 0) {
  await trackOnboardingMilestone({
    clerkUserId: userId,
    milestone: 'first_successful_answer',
    metadata: {
      answer_length: chatResponse.answer.length,
      sources_count: sources.length,
      documents_used: uniqueDocuments,
      chunks_found: relevantChunks.length
    }
  })
}

    // =================================================================
    // STEP 6: DATABASE PERSISTENCE - Save conversation for history
    // =================================================================
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

    // Update session timestamp to track last activity
    await supabaseAdmin
      .from('chat_sessions')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', sessionId)

    console.log(`Successfully answered question for ${user.email}`)

    // =================================================================
    // RESPONSE - Return comprehensive answer with metadata
    // =================================================================
    return NextResponse.json({
      success: true,
      answer: chatResponse.answer,
      sources: sources,
      chunksFound: relevantChunks.length,
      documentsUsed: uniqueDocuments, // NEW: Show how many documents contributed
      tokensUsed: chatResponse.usage.total_tokens
    })

  } catch (error) {
    // =================================================================
    // ERROR HANDLING - Log and return user-friendly error message
    // =================================================================
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