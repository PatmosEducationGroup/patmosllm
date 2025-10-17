'use client'

import { useState, useEffect, Fragment } from 'react'
// Clerk hooks removed - now using session-based auth
import {
  AlertCircle,
  RefreshCw,
  Download,
  Filter,
  TrendingDown,
  MessageCircle,
  Search,
  ChevronDown,
  ChevronUp
} from 'lucide-react'

interface QuestionQuality {
  id: string
  created_at: string
  question_text: string
  question_intent: string
  question_complexity: number
  ambiguity_score: number
  user_satisfaction: number | null
  clarification_requested: boolean
  had_search_results: boolean
  extracted_topics: string[]
  user_id: string
  session_id: string | null
  conversation_id: string | null
  users: {
    email: string
    name: string | null
  }
}

interface Stats {
  total: number
  avgSatisfaction: number
  clarificationCount: number
  noResultsCount: number
  avgComplexity: number
}

export default function QuestionQualityPage() {
  const [questions, setQuestions] = useState<QuestionQuality[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

  // Filters
  const [minSatisfaction, setMinSatisfaction] = useState<number>(2)
  const [clarificationOnly, setClarificationOnly] = useState(false)
  const [noResultsOnly, setNoResultsOnly] = useState(false)

  const fetchData = async () => {
    try {
      setLoading(true)
      setError(null)

      const params = new URLSearchParams({
        minSatisfaction: minSatisfaction.toString(),
        clarificationOnly: clarificationOnly.toString(),
        noResultsOnly: noResultsOnly.toString(),
        limit: '100'
      })

      // Session-based auth - uses cookies automatically
      const response = await fetch(`/api/admin/question-quality?${params}`, {
        headers: {
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        throw new Error('Failed to fetch question quality data')
      }

      const data = await response.json()
      setQuestions(data.questions || [])
      setStats(data.stats || null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minSatisfaction, clarificationOnly, noResultsOnly])

  const toggleRow = (id: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const exportToCSV = () => {
    const headers = ['Date', 'User Email', 'Question', 'Satisfaction', 'Complexity', 'Had Results', 'Topics']
    const rows = questions.map(q => [
      new Date(q.created_at).toLocaleString(),
      q.users.email,
      `"${q.question_text.replace(/"/g, '""')}"`,
      q.user_satisfaction?.toString() || 'N/A',
      q.question_complexity.toFixed(2),
      q.had_search_results ? 'Yes' : 'No',
      `"${q.extracted_topics.join(', ')}"`
    ])

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `question-quality-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    window.URL.revokeObjectURL(url)
  }

  const getSatisfactionColor = (satisfaction: number | null) => {
    if (satisfaction === null) return 'text-gray-400'
    if (satisfaction <= 1) return 'text-red-600'
    if (satisfaction <= 2) return 'text-orange-500'
    if (satisfaction <= 3) return 'text-yellow-500'
    return 'text-green-500'
  }

  const getSatisfactionBadge = (satisfaction: number | null) => {
    if (satisfaction === null) return 'Unknown'
    if (satisfaction <= 1) return 'Very Low'
    if (satisfaction <= 2) return 'Low'
    if (satisfaction <= 3) return 'Medium'
    if (satisfaction <= 4) return 'Good'
    return 'Excellent'
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">

      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Question Quality Analysis</h1>
          <p className="text-gray-600">Monitor and analyze questions that required clarification or had low satisfaction</p>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center gap-2 mb-2">
                <MessageCircle className="w-5 h-5 text-blue-600" />
                <h3 className="text-sm font-medium text-gray-600">Total Issues</h3>
              </div>
              <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
            </div>

            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingDown className="w-5 h-5 text-orange-600" />
                <h3 className="text-sm font-medium text-gray-600">Avg Satisfaction</h3>
              </div>
              <p className="text-2xl font-bold text-gray-900">{stats.avgSatisfaction.toFixed(2)}/5</p>
            </div>

            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="w-5 h-5 text-yellow-600" />
                <h3 className="text-sm font-medium text-gray-600">Clarifications</h3>
              </div>
              <p className="text-2xl font-bold text-gray-900">{stats.clarificationCount}</p>
            </div>

            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center gap-2 mb-2">
                <Search className="w-5 h-5 text-red-600" />
                <h3 className="text-sm font-medium text-gray-600">No Results</h3>
              </div>
              <p className="text-2xl font-bold text-gray-900">{stats.noResultsCount}</p>
            </div>

            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center gap-2 mb-2">
                <Filter className="w-5 h-5 text-purple-600" />
                <h3 className="text-sm font-medium text-gray-600">Avg Complexity</h3>
              </div>
              <p className="text-2xl font-bold text-gray-900">{stats.avgComplexity.toFixed(2)}</p>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-600" />
              <span className="text-sm font-medium text-gray-700">Filters:</span>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">Max Satisfaction:</label>
              <select
                value={minSatisfaction}
                onChange={(e) => setMinSatisfaction(Number(e.target.value))}
                className="px-3 py-1 border border-gray-300 rounded-md text-sm"
              >
                <option value="1">≤ 1 (Very Low)</option>
                <option value="2">≤ 2 (Low)</option>
                <option value="3">≤ 3 (Medium)</option>
              </select>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={clarificationOnly}
                onChange={(e) => setClarificationOnly(e.target.checked)}
                className="rounded border-gray-300"
              />
              <span className="text-sm text-gray-700">Clarification Requested Only</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={noResultsOnly}
                onChange={(e) => setNoResultsOnly(e.target.checked)}
                className="rounded border-gray-300"
              />
              <span className="text-sm text-gray-700">No Results Only</span>
            </label>

            <button
              onClick={fetchData}
              className="ml-auto flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>

            <button
              onClick={exportToCSV}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-sm"
              disabled={questions.length === 0}
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          </div>
        </div>

        {/* Questions Table */}
        {loading ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-4" />
            <p className="text-gray-600">Loading question quality data...</p>
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
            <p className="text-red-800">{error}</p>
          </div>
        ) : questions.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <MessageCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Issues Found</h3>
            <p className="text-gray-600">All questions meet the quality criteria!</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                      User
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                      Question
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                      Satisfaction
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                      Complexity
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">

                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {questions.map((q) => (
                    <Fragment key={q.id}>
                      <tr className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                          {new Date(q.created_at).toLocaleString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          <div className="font-medium">{q.users.name || 'Unknown'}</div>
                          <div className="text-xs text-gray-500">{q.users.email}</div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900 max-w-md">
                          <div className="line-clamp-2">{q.question_text}</div>
                        </td>
                        <td className="px-4 py-3 text-sm whitespace-nowrap">
                          <span className={`font-medium ${getSatisfactionColor(q.user_satisfaction)}`}>
                            {q.user_satisfaction !== null ? `${q.user_satisfaction}/5` : 'N/A'}
                          </span>
                          <div className="text-xs text-gray-500">{getSatisfactionBadge(q.user_satisfaction)}</div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {q.question_complexity.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <div className="flex flex-col gap-1">
                            {!q.had_search_results && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                                No Results
                              </span>
                            )}
                            {q.clarification_requested && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                                Clarification
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-right">
                          <button
                            onClick={() => toggleRow(q.id)}
                            className="text-blue-600 hover:text-blue-800 transition-colors"
                          >
                            {expandedRows.has(q.id) ? (
                              <ChevronUp className="w-4 h-4" />
                            ) : (
                              <ChevronDown className="w-4 h-4" />
                            )}
                          </button>
                        </td>
                      </tr>
                      {expandedRows.has(q.id) && (
                        <tr className="bg-gray-50">
                          <td colSpan={7} className="px-4 py-4">
                            <div className="space-y-3 text-sm">
                              <div>
                                <span className="font-medium text-gray-700">Full Question:</span>
                                <p className="mt-1 text-gray-900">{q.question_text}</p>
                              </div>
                              <div className="grid grid-cols-3 gap-4">
                                <div>
                                  <span className="font-medium text-gray-700">Intent:</span>
                                  <p className="text-gray-600 capitalize">{q.question_intent}</p>
                                </div>
                                <div>
                                  <span className="font-medium text-gray-700">Ambiguity Score:</span>
                                  <p className="text-gray-600">{q.ambiguity_score.toFixed(2)}</p>
                                </div>
                                <div>
                                  <span className="font-medium text-gray-700">Session ID:</span>
                                  <p className="text-gray-600 font-mono text-xs">{q.session_id || 'N/A'}</p>
                                </div>
                              </div>
                              {q.extracted_topics.length > 0 && (
                                <div>
                                  <span className="font-medium text-gray-700">Topics:</span>
                                  <div className="flex flex-wrap gap-2 mt-1">
                                    {q.extracted_topics.map((topic, idx) => (
                                      <span
                                        key={idx}
                                        className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs"
                                      >
                                        {topic}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
