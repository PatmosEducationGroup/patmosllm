'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@clerk/nextjs'
import AdminNavbar from '@/components/AdminNavbar'
import { 
  FileText, 
  TrendingUp, 
  TrendingDown, 
  Eye, 
  MessageSquare, 
  Calendar,
  BarChart3,
  AlertTriangle,
  CheckCircle,
  RefreshCw
} from 'lucide-react'

interface DocumentAnalytics {
  overview: {
    totalDocuments: number
    totalConversations: number
    documentsWithUsage: number
    unusedDocuments: number
    avgHealthScore: number
  }
  documents: Array<{
    id: string
    title: string
    author: string | null
    file_size: number
    created_at: string
    uploaded_by: string
    stats: {
      totalReferences: number
      recentReferences30d: number
      avgQuestionsPerDay: number
      healthScore: number
      daysSinceUpload: number
      lastUsed: string | null
    }
    recentQuestions: Array<{
      question: string
      created_at: string
    }>
  }>
  topSearchTerms: Array<{
    term: string
    count: number
  }>
}

export default function DocumentAnalyticsPage() {
  const { getToken } = useAuth()
  const [analytics, setAnalytics] = useState<DocumentAnalytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedDocument, setSelectedDocument] = useState<DocumentAnalytics['documents'][0] | null>(null)

  const fetchAnalytics = async () => {
    try {
      setLoading(true)
      const token = await getToken()
      
      const response = await fetch('/api/admin/document-analytics', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          setAnalytics(data.analytics)
          setError(null)
        } else {
          setError(data.error || 'Failed to fetch analytics')
        }
      } else {
        setError('Failed to fetch document analytics')
      }
    } catch (err) {
      console.error('Error fetching analytics:', err)
      setError('Failed to load analytics')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAnalytics()
  }, [])

  const formatFileSize = (bytes: number) => {
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    if (bytes === 0) return '0 Bytes'
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i]
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  const getHealthColor = (score: number) => {
    if (score >= 70) return 'text-green-600 bg-green-100'
    if (score >= 40) return 'text-yellow-600 bg-yellow-100'
    return 'text-red-600 bg-red-100'
  }

  const getHealthIcon = (score: number) => {
    if (score >= 70) return <CheckCircle className="h-4 w-4 text-green-500" />
    if (score >= 40) return <Eye className="h-4 w-4 text-yellow-500" />
    return <AlertTriangle className="h-4 w-4 text-red-500" />
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AdminNavbar />
        <div className="max-w-7xl mx-auto py-6 px-4">
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
            <span className="ml-2 text-gray-600">Loading analytics...</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminNavbar />
      
      <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Document Analytics</h1>
            <p className="mt-2 text-gray-600">
              Analyze document usage patterns and optimize your knowledge base
            </p>
          </div>
          <button
            onClick={fetchAnalytics}
            disabled={loading}
            className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-md p-4">
            <AlertTriangle className="h-5 w-5 text-red-400 inline mr-2" />
            <span className="text-red-800">{error}</span>
          </div>
        )}

        {analytics && (
          <div className="space-y-8">
            {/* Overview Stats */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center">
                  <FileText className="h-8 w-8 text-blue-500" />
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">Total Documents</p>
                    <p className="text-2xl font-bold text-gray-900">{analytics.overview.totalDocuments}</p>
                  </div>
                </div>
              </div>
              
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center">
                  <CheckCircle className="h-8 w-8 text-green-500" />
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">Documents Used</p>
                    <p className="text-2xl font-bold text-gray-900">{analytics.overview.documentsWithUsage}</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center">
                  <AlertTriangle className="h-8 w-8 text-red-500" />
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">Unused Documents</p>
                    <p className="text-2xl font-bold text-gray-900">{analytics.overview.unusedDocuments}</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center">
                  <MessageSquare className="h-8 w-8 text-purple-500" />
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">Total Questions</p>
                    <p className="text-2xl font-bold text-gray-900">{analytics.overview.totalConversations}</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center">
                  <BarChart3 className="h-8 w-8 text-orange-500" />
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">Avg Health Score</p>
                    <p className="text-2xl font-bold text-gray-900">{analytics.overview.avgHealthScore}/100</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Document Performance Table */}
            <div className="bg-white shadow overflow-hidden sm:rounded-md">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-medium text-gray-900">Document Performance</h2>
                <p className="text-sm text-gray-600">Health score based on usage frequency vs time since upload</p>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Document</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Health Score</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Usage</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Recent Activity</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Age</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {analytics.documents.map((doc) => (
                      <tr key={doc.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <FileText className="h-5 w-5 text-gray-400 mr-3" />
                            <div>
                              <div className="text-sm font-medium text-gray-900">{doc.title}</div>
                              <div className="text-sm text-gray-500">
                                {doc.author && `by ${doc.author} • `}{formatFileSize(doc.file_size)}
                              </div>
                            </div>
                          </div>
                        </td>
                        
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            {getHealthIcon(doc.stats.healthScore)}
                            <span className={`ml-2 inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getHealthColor(doc.stats.healthScore)}`}>
                              {doc.stats.healthScore}/100
                            </span>
                          </div>
                        </td>

                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          <div>{doc.stats.totalReferences} total references</div>
                          <div className="text-xs text-gray-500">
                            {doc.stats.recentReferences30d} in last 30 days
                          </div>
                        </td>

                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          <div>{doc.stats.avgQuestionsPerDay}/day average</div>
                          <div className="text-xs text-gray-500">
                            {doc.stats.lastUsed ? `Last used ${formatDate(doc.stats.lastUsed)}` : 'Never used'}
                          </div>
                        </td>

                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {doc.stats.daysSinceUpload} days old
                        </td>

                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <button
                            onClick={() => setSelectedDocument(doc)}
                            className="text-blue-600 hover:text-blue-900"
                          >
                            View Details
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Popular Search Terms */}
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">Popular Search Terms</h2>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {analytics.topSearchTerms.map((term, index) => (
                  <div key={term.term} className="text-center p-3 bg-gray-50 rounded-lg">
                    <div className="text-lg font-bold text-gray-900">{term.count}</div>
                    <div className="text-sm text-gray-600 truncate">{term.term}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Document Detail Modal */}
        {selectedDocument && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-2xl w-full max-h-96 overflow-y-auto p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">
                  Document Details: {selectedDocument.title}
                </h3>
                <button
                  onClick={() => setSelectedDocument(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <span className="text-2xl">×</span>
                </button>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-medium">Health Score:</span> {selectedDocument.stats.healthScore}/100
                  </div>
                  <div>
                    <span className="font-medium">Total References:</span> {selectedDocument.stats.totalReferences}
                  </div>
                  <div>
                    <span className="font-medium">Recent Usage:</span> {selectedDocument.stats.recentReferences30d} (30 days)
                  </div>
                  <div>
                    <span className="font-medium">Daily Average:</span> {selectedDocument.stats.avgQuestionsPerDay}
                  </div>
                </div>

                <div>
                  <h4 className="font-medium text-gray-900 mb-2">Recent Questions ({selectedDocument.recentQuestions.length})</h4>
                  {selectedDocument.recentQuestions.length > 0 ? (
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {selectedDocument.recentQuestions.map((q, index) => (
                        <div key={index} className="p-2 bg-gray-50 rounded text-sm">
                          <div className="font-medium">{q.question}</div>
                          <div className="text-gray-500 text-xs">{formatDate(q.created_at)}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-500 text-sm">No recent questions</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}