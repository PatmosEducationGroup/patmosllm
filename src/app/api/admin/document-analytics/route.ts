import { NextRequest, NextResponse } from 'next/server'
import { logError } from '@/lib/logger'
import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'

export async function GET(_request: NextRequest) {
  try {
    // getCurrentUser() handles both Supabase and Clerk auth
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 })
    }

    if (!['ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
      return NextResponse.json({ success: false, error: 'Admin access required' }, { status: 403 })
    }

    // Get all documents with metadata
    const { data: documents } = await supabaseAdmin
      .from('documents')
      .select('id, title, author, file_size, created_at, uploaded_by')
      .order('created_at', { ascending: false })

    // Get all conversations to analyze document usage
    const { data: conversations } = await supabaseAdmin
      .from('conversations')
      .select('id, question, sources, created_at')
      .order('created_at', { ascending: false })

    // Calculate document usage statistics
    const documentStats = documents?.map(doc => {
      // Count how many conversations referenced this document
      const references = conversations?.filter(conv => {
        const sources = Array.isArray(conv.sources) ? conv.sources : []
        return sources.some(source => source.title === doc.title)
      }) || []

      // Get recent questions about this document (last 30 days)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      const recentReferences = references.filter(ref => new Date(ref.created_at) > thirtyDaysAgo)

      // Calculate engagement metrics
      const totalReferences = references.length
      const recentReferences30d = recentReferences.length
      const avgQuestionsPerDay = recentReferences30d / 30
      
      // Health score calculation (0-100)
      const daysSinceUpload = (Date.now() - new Date(doc.created_at).getTime()) / (1000 * 60 * 60 * 24)
      const expectedUsage = Math.max(1, daysSinceUpload / 7) // Expected ~1 use per week
      const healthScore = Math.min(100, Math.round((totalReferences / expectedUsage) * 50))

      return {
        id: doc.id,
        title: doc.title,
        author: doc.author,
        file_size: doc.file_size,
        created_at: doc.created_at,
        uploaded_by: doc.uploaded_by,
        stats: {
          totalReferences,
          recentReferences30d,
          avgQuestionsPerDay: Math.round(avgQuestionsPerDay * 100) / 100,
          healthScore,
          daysSinceUpload: Math.round(daysSinceUpload),
          lastUsed: references.length > 0 ? references[0].created_at : null
        },
        recentQuestions: recentReferences.slice(0, 5).map(ref => ({
          question: ref.question,
          created_at: ref.created_at
        }))
      }
    }) || []

    // Sort by health score (most used first)
    documentStats.sort((a, b) => b.stats.healthScore - a.stats.healthScore)

    // Calculate overall analytics
    const totalDocuments = documents?.length || 0
    const totalConversations = conversations?.length || 0
    const documentsWithUsage = documentStats.filter(doc => doc.stats.totalReferences > 0).length
    const unusedDocuments = totalDocuments - documentsWithUsage

    // Most popular search terms (extract from questions)
    const searchTerms = conversations?.map(conv => conv.question.toLowerCase()) || []
    const termFrequency = searchTerms.reduce((acc, question) => {
     const words = question.split(/\W+/).filter((word: string) => word.length > 3)
      words.forEach((word: string) => {
        acc[word] = (acc[word] || 0) + 1
      })
      return acc
    }, {} as Record<string, number>)

    const topSearchTerms = Object.entries(termFrequency)
     .sort(([, a], [, b]) => (b as number) - (a as number))
      .slice(0, 10)
      .map(([term, count]) => ({ term, count }))

    return NextResponse.json({
      success: true,
      analytics: {
        overview: {
          totalDocuments,
          totalConversations,
          documentsWithUsage,
          unusedDocuments,
          avgHealthScore: Math.round(documentStats.reduce((sum, doc) => sum + doc.stats.healthScore, 0) / totalDocuments) || 0
        },
        documents: documentStats,
        topSearchTerms
      }
    })

  } catch (error) {
    logError(error instanceof Error ? error : new Error('Internal server error'), {
      operation: 'API admin/document-analytics',
      phase: 'request_handling',
      severity: 'high',
      errorContext: 'Internal server error'
    })
return NextResponse.json({ success: false, error: 'Failed to fetch analytics' }, { status: 500 })
  }
}