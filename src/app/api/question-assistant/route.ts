import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getCurrentUser } from '@/lib/auth'
import { questionQualityAssistant } from '@/lib/question-quality-assistant'
import { chatRateLimit } from '@/lib/rate-limiter'
import { getIdentifier } from '@/lib/get-identifier'
import { sanitizeInput } from '@/lib/input-sanitizer'

export async function POST(_request: NextRequest) {
  try {
    // =================================================================
    // RATE LIMITING & AUTHENTICATION
    // =================================================================
    const identifier = getIdentifier(_request)
    const rateLimitResult = chatRateLimit(identifier)

    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: rateLimitResult.message, resetTime: rateLimitResult.resetTime },
        { status: 429 }
      )
    }

    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 403 })
    }

    // =================================================================
    // HANDLE QUESTION ANALYSIS
    // =================================================================
    const { action, question } = await _request.json()

    if (action === 'analyze') {
      if (!question || typeof question !== 'string') {
        return NextResponse.json({ error: 'Question is required' }, { status: 400 })
      }

      const sanitizedQuestion = sanitizeInput(question)

      try {
        // Analyze question quality
        const analysis = await questionQualityAssistant.analyzeQuestion(sanitizedQuestion)

        // Get relevant templates
        const templates = questionQualityAssistant.getRelevantTemplates(sanitizedQuestion)

        return NextResponse.json({
          success: true,
          analysis,
          templates
        })

      } catch (_error) {
        return NextResponse.json(
          { error: 'Failed to analyze question' },
          { status: 500 }
        )
      }
    }

    if (action === 'get_templates') {
      const { topic } = await _request.json()

      try {
        const templates = topic
          ? questionQualityAssistant.getRelevantTemplates(topic)
          : [] // Could return all templates or category-based ones

        return NextResponse.json({
          success: true,
          templates
        })

      } catch (_error) {
        return NextResponse.json(
          { error: 'Failed to get templates' },
          { status: 500 }
        )
      }
    }

    if (action === 'get_builder') {
      const { topic } = await _request.json()

      try {
        const builder = questionQualityAssistant.generateQuestionBuilder(topic)

        return NextResponse.json({
          success: true,
          builder
        })

      } catch (_error) {
        return NextResponse.json(
          { error: 'Failed to get question builder' },
          { status: 500 }
        )
      }
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })

  } catch (_error) {
    return NextResponse.json(
      { error: 'Question assistant request failed' },
      { status: 500 }
    )
  }
}

export async function GET(_request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 403 })
    }

    const url = new URL(_request.url)
    const action = url.searchParams.get('action')

    if (action === 'templates') {
      const _category = url.searchParams.get('category')

      // This could be expanded to return filtered templates
      return NextResponse.json({
        success: true,
        templates: [] // Implement template filtering if needed
      })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })

  } catch (_error) {
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 }
    )
  }
}