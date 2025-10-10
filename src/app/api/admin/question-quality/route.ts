import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { withSupabaseAdmin } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'
import { logError } from '@/lib/logger'

export async function GET(request: NextRequest) {
  try {
    // getCurrentUser() handles both Supabase and Clerk auth
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 })
    }

    if (user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ success: false, error: 'Super admin access required' }, { status: 403 })
    }

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams
    const minSatisfaction = searchParams.get('minSatisfaction') ? Number(searchParams.get('minSatisfaction')) : 2
    const clarificationOnly = searchParams.get('clarificationOnly') === 'true'
    const noResultsOnly = searchParams.get('noResultsOnly') === 'true'
    const limit = searchParams.get('limit') ? Number(searchParams.get('limit')) : 100
    const offset = searchParams.get('offset') ? Number(searchParams.get('offset')) : 0

    const result = await withSupabaseAdmin(async (supabase) => {
      // Build the query
      let query = supabase
        .from('conversation_memory')
        .select(`
          id,
          created_at,
          question_text,
          question_intent,
          question_complexity,
          ambiguity_score,
          user_satisfaction,
          clarification_requested,
          had_search_results,
          extracted_topics,
          user_id,
          session_id,
          conversation_id,
          users!inner(email, name)
        `)
        .order('created_at', { ascending: false })

      // Apply filters for "unsuccessful" questions
      if (minSatisfaction !== null) {
        query = query.or(`user_satisfaction.lte.${minSatisfaction},user_satisfaction.is.null`)
      }

      if (clarificationOnly) {
        query = query.eq('clarification_requested', true)
      }

      if (noResultsOnly) {
        query = query.eq('had_search_results', false)
      }

      // Pagination
      query = query.range(offset, offset + limit - 1)

      const { data, error } = await query

      if (error) {
        logError(error, {
          operation: 'fetch_question_quality',
          adminUserId: user.id,
          adminEmail: user.email,
          filters: { minSatisfaction, clarificationOnly, noResultsOnly, limit, offset }
        })
        throw error
      }

      // Get summary stats
      const statsQuery = supabase
        .from('conversation_memory')
        .select('user_satisfaction, clarification_requested, had_search_results, question_complexity', { count: 'exact' })

      let statsFilterQuery = statsQuery.or(`user_satisfaction.lte.${minSatisfaction},user_satisfaction.is.null`)

      if (clarificationOnly) {
        statsFilterQuery = statsFilterQuery.eq('clarification_requested', true)
      }

      if (noResultsOnly) {
        statsFilterQuery = statsFilterQuery.eq('had_search_results', false)
      }

      const { data: statsData, count: totalCount } = await statsFilterQuery

      // Calculate statistics
      const stats = {
        total: totalCount || 0,
        avgSatisfaction: (statsData && statsData.length > 0)
          ? statsData.reduce((acc, row) => acc + (row.user_satisfaction || 0), 0) / statsData.length
          : 0,
        clarificationCount: statsData?.filter(row => row.clarification_requested).length || 0,
        noResultsCount: statsData?.filter(row => !row.had_search_results).length || 0,
        avgComplexity: (statsData && statsData.length > 0)
          ? statsData.reduce((acc, row) => acc + (row.question_complexity || 0), 0) / statsData.length
          : 0
      }

      return { data, count: totalCount || 0, stats }
    })

    return NextResponse.json({
      success: true,
      questions: result.data,
      total: result.count,
      stats: result.stats,
      pagination: {
        limit,
        offset,
        hasMore: (result.count || 0) > offset + limit
      }
    })
  } catch (error) {
    logError(error, {
      operation: 'question_quality_api',
      endpoint: '/api/admin/question-quality'
    })
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
