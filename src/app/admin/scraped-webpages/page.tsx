'use client'

import { useState, useCallback } from 'react'
import { logError } from '@/lib/logger'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from '@/components/ui/Card'
import { Alert } from '@/components/ui/Alert'
import { ToastProvider, useToast } from '@/components/ui/Toast'
import { AdminErrorBoundary } from '@/components/ErrorBoundary'
import { useAdminAuth } from '@/hooks/useAdminAuth'
import { formatDate } from '@/lib/admin-utils'
import {
  AdminLoadingScreen,
  AdminAccessDenied,
  StatusBadge,
  SearchInput,
  PageSizeSelector,
  Pagination,
  SortableTableHeader,
  StaticTableHeader,
  DeleteConfirmationModal
} from '@/components/admin'

interface Document {
  id: string
  title: string
  author?: string
  wordCount?: number
  pageCount?: number
  fileSize: number
  mimeType: string
  createdAt: string
  source_type?: string
  source_url?: string
  uploaded_by: string
  chunkCount?: number
  users?: {
    email: string
    name?: string
  }
}

interface IngestJob {
  id: string
  document_id: string
  status: string
  error_message?: string
  chunks_created: number
}

interface PaginationState {
  page: number
  limit: number
  total: number
  totalPages: number
}

function ScrapedWebpagesContent() {
  const { addToast } = useToast()
  const [documents, setDocuments] = useState<Document[]>([])
  const [pagination, setPagination] = useState<PaginationState>({ page: 1, limit: 20, total: 0, totalPages: 0 })
  const [ingestJobs, setIngestJobs] = useState<IngestJob[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [sortField, setSortField] = useState<'title' | 'author' | 'created_at' | 'file_size' | 'word_count' | 'uploader'>('created_at')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [documentToDelete, setDocumentToDelete] = useState<{id: string, title: string} | null>(null)
  const [reingestingDocs, setReingestingDocs] = useState<Set<string>>(new Set())
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  const loadDocuments = useCallback(async (page: number, limit: number) => {
    try {
      const response = await fetch(`/api/admin/documents?source_type=web_scraped&page=${page}&limit=${limit}`)
      const data = await response.json()

      if (data.success) {
        setDocuments(data.documents)
        setPagination(data.pagination)
        setError(null)
      } else {
        setError(data.error)
      }
    } catch (error) {
      logError(error instanceof Error ? error : new Error('Operation failed'), {
        operation: 'loadDocuments',
        phase: 'request_handling',
        severity: 'high',
        errorContext: 'Failed to load scraped webpages'
      })
      setError('Failed to load scraped webpages')
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const loadIngestJobs = async () => {
    try {
      const response = await fetch('/api/ingest')
      const data = await response.json()

      if (data.success) {
        setIngestJobs(data.jobs)
      }
    } catch (error) {
      logError(error instanceof Error ? error : new Error('Operation failed'), {
        operation: 'loadIngestJobs',
        phase: 'request_handling',
        severity: 'medium',
        errorContext: 'Failed to load ingest jobs'
      })
    }
  }

  const { user: userData, loading, error, accessDenied, setError } = useAdminAuth({
    requiredRoles: ['ADMIN', 'CONTRIBUTOR', 'SUPER_ADMIN'],
    onAuthenticated: async () => {
      await Promise.all([loadDocuments(1, pageSize), loadIngestJobs()])
    }
  })

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const sortDocuments = (docs: Document[]) => {
    return [...docs].sort((a, b) => {
      let aVal: string | number | undefined
      let bVal: string | number | undefined

      switch (sortField) {
        case 'title':
          aVal = a.title
          bVal = b.title
          break
        case 'author':
          aVal = a.author || ''
          bVal = b.author || ''
          break
        case 'created_at':
          aVal = a.createdAt
          bVal = b.createdAt
          break
        case 'file_size':
          aVal = a.fileSize || 0
          bVal = b.fileSize || 0
          break
        case 'word_count':
          aVal = a.wordCount || 0
          bVal = b.wordCount || 0
          break
        case 'uploader':
          aVal = a.users?.name || a.users?.email || ''
          bVal = b.users?.name || b.users?.email || ''
          break
        default:
          aVal = a.createdAt
          bVal = b.createdAt
      }

      if (aVal === undefined || aVal === '') return 1
      if (bVal === undefined || bVal === '') return -1

      let comparison = 0
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        comparison = aVal.toLowerCase().localeCompare(bVal.toLowerCase())
      } else {
        comparison = aVal > bVal ? 1 : -1
      }

      return sortDirection === 'asc' ? comparison : -comparison
    })
  }

  const getFilteredDocuments = () => {
    if (!searchQuery.trim()) return documents

    const query = searchQuery.toLowerCase()
    return documents.filter(doc =>
      doc.title.toLowerCase().includes(query) ||
      (doc.source_url && doc.source_url.toLowerCase().includes(query))
    )
  }

  const handleReingest = async (documentId: string, documentTitle: string) => {
    try {
      setReingestingDocs(prev => new Set(prev).add(documentId))

      const response = await fetch('/api/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId })
      })

      const data = await response.json()

      if (data.success) {
        addToast({
          type: 'success',
          message: `Successfully started reingest for "${documentTitle}". Created ${data.chunksCreated || 'unknown'} chunks.`
        })
        await Promise.all([loadDocuments(currentPage, pageSize), loadIngestJobs()])
      } else {
        addToast({
          type: 'error',
          message: `Failed to reingest "${documentTitle}": ${data.error || ''}`
        })
      }
    } catch (error) {
      logError(error instanceof Error ? error : new Error('Operation failed'), {
        operation: 'handleReingest',
        phase: 'request_handling',
        severity: 'high',
        errorContext: 'Failed to reingest document'
      })
      addToast({
        type: 'error',
        message: `Failed to reingest "${documentTitle}"`
      })
    } finally {
      setReingestingDocs(prev => {
        const newSet = new Set(prev)
        newSet.delete(documentId)
        return newSet
      })
    }
  }

  const deleteDocument = async (documentId: string) => {
    if (!userData) return

    if (!['ADMIN', 'SUPER_ADMIN'].includes(userData.role)) {
      setError('Only administrators can delete documents')
      return
    }

    if (!documentToDelete) {
      setError('No document selected for deletion')
      return
    }

    try {
      const response = await fetch(`/api/documents?id=${documentToDelete.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' }
      })

      const data = await response.json()

      if (data.success) {
        setDocuments(documents.filter(doc => doc.id !== documentId))
        setShowDeleteModal(false)
        setDocumentToDelete(null)
        // Refresh to update total count
        loadDocuments(currentPage, pageSize)
      } else {
        setError(data.error)
      }
    } catch (error) {
      logError(error instanceof Error ? error : new Error('Operation failed'), {
        operation: 'deleteDocument',
        phase: 'request_handling',
        severity: 'high',
        errorContext: 'Failed to delete document'
      })
      setError('Failed to delete document')
    }
  }

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage)
    loadDocuments(newPage, pageSize)
  }

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize)
    setCurrentPage(1)
    loadDocuments(1, newSize)
  }

  if (loading) {
    return <AdminLoadingScreen />
  }

  if (accessDenied) {
    return <AdminAccessDenied error={error} />
  }

  const filteredDocs = sortDocuments(getFilteredDocuments())

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-200">
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <Card className="mb-8 bg-white/80 backdrop-blur-xl border-slate-200/40 shadow-xl">
          <CardHeader>
            <CardTitle className="text-3xl text-slate-800">
              Webpage Library
            </CardTitle>
            <CardDescription className="text-base">
              {pagination.total} scraped webpage{pagination.total !== 1 ? 's' : ''} in the library
            </CardDescription>
          </CardHeader>
        </Card>

        {error && (
          <Alert variant="error" className="mb-6">
            {error}
          </Alert>
        )}

        {/* Scraped Pages Table */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.8)',
          backdropFilter: 'blur(12px)',
          borderRadius: '20px',
          border: '1px solid rgba(226, 232, 240, 0.4)',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
          overflow: 'hidden'
        }}>
          <div style={{ padding: '24px', borderBottom: '1px solid rgba(226, 232, 240, 0.4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b', marginBottom: '4px' }}>Webpage Library</h2>
                <div style={{ fontSize: '14px', color: '#64748b' }}>
                  {pagination.total} total
                  {searchQuery && ` • ${filteredDocs.length} matching "${searchQuery}"`}
                  {pagination.totalPages > 1 && ` • Page ${pagination.page} of ${pagination.totalPages}`}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <SearchInput
                  value={searchQuery}
                  onChange={setSearchQuery}
                  placeholder="Search by title or URL..."
                />

                <PageSizeSelector
                  pageSize={pageSize}
                  onPageSizeChange={handlePageSizeChange}
                />
              </div>
            </div>
          </div>

          {filteredDocs.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>
              {searchQuery ? `No scraped webpages match "${searchQuery}"` : 'No scraped webpages found'}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', tableLayout: 'auto' }}>
                <thead style={{ backgroundColor: 'rgba(248, 250, 252, 0.8)' }}>
                  <tr>
                    {(userData?.role === 'ADMIN' || userData?.role === 'SUPER_ADMIN') && (
                      <SortableTableHeader
                        label="Uploader"
                        field="uploader"
                        currentSortField={sortField}
                        sortDirection={sortDirection}
                        onSort={(field) => handleSort(field as typeof sortField)}
                      />
                    )}
                    <SortableTableHeader
                      label="Webpage"
                      field="title"
                      currentSortField={sortField}
                      sortDirection={sortDirection}
                      onSort={(field) => handleSort(field as typeof sortField)}
                    />
                    <SortableTableHeader
                      label="Details"
                      field="word_count"
                      currentSortField={sortField}
                      sortDirection={sortDirection}
                      onSort={(field) => handleSort(field as typeof sortField)}
                    />
                    <StaticTableHeader label="Source URL" />
                    <StaticTableHeader label="Status" />
                    <StaticTableHeader label="Actions" />
                  </tr>
                </thead>
                <tbody style={{ backgroundColor: 'white' }}>
                  {filteredDocs.map((doc) => {
                    const job = ingestJobs.find(j => j.document_id === doc.id)
                    const status = job?.status || 'completed'

                    return (
                      <tr key={doc.id} style={{ borderTop: '1px solid rgba(226, 232, 240, 0.4)' }}>
                        {(userData?.role === 'ADMIN' || userData?.role === 'SUPER_ADMIN') && (
                          <td style={{ padding: '12px', fontSize: '14px', color: '#64748b' }}>
                            {doc.users?.name || doc.users?.email || 'Unknown'}
                          </td>
                        )}
                        <td style={{ padding: '12px' }}>
                          <div style={{
                            fontSize: '14px',
                            fontWeight: '500',
                            color: '#111827',
                            wordBreak: 'break-word',
                            overflowWrap: 'anywhere',
                            hyphens: 'auto',
                            lineHeight: '1.4',
                            maxWidth: '250px'
                          }}>
                            {doc.title}
                          </div>
                        </td>
                        <td style={{ padding: '12px', fontSize: '14px', color: '#64748b' }}>
                          {doc.wordCount && !isNaN(doc.wordCount) && <div>{doc.wordCount.toLocaleString()} words</div>}
                          <div style={{ fontSize: '12px', marginTop: '4px' }}>
                            {formatDate(doc.createdAt)}
                          </div>
                        </td>
                        <td style={{ padding: '12px' }}>
                          {doc.source_url && (
                            <a
                              href={doc.source_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                fontSize: '12px',
                                color: '#2563eb',
                                textDecoration: 'none',
                                wordBreak: 'break-all',
                                overflowWrap: 'anywhere',
                                lineHeight: '1.4'
                              }}
                            >
                              {doc.source_url}
                            </a>
                          )}
                        </td>
                        <td style={{ padding: '12px' }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                              <StatusBadge status={status} />
                              {status === 'failed' && (
                                <button
                                  onClick={() => handleReingest(doc.id, doc.title)}
                                  disabled={reingestingDocs.has(doc.id)}
                                  style={{
                                    fontSize: '12px',
                                    fontWeight: '500',
                                    color: 'rgb(130, 179, 219)',
                                    backgroundColor: 'transparent',
                                    border: '1px solid rgb(130, 179, 219)',
                                    padding: '4px 8px',
                                    borderRadius: '8px',
                                    cursor: reingestingDocs.has(doc.id) ? 'not-allowed' : 'pointer',
                                    opacity: reingestingDocs.has(doc.id) ? 0.5 : 1
                                  }}
                                >
                                  {reingestingDocs.has(doc.id) ? 'Reingesting...' : 'Retry'}
                                </button>
                              )}
                            </div>
                            {status === 'completed' && doc.chunkCount !== undefined && (
                              <div style={{ fontSize: '12px', color: '#64748b' }}>
                                Chunks: {doc.chunkCount.toLocaleString()}
                              </div>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: '12px' }}>
                          <button
                            onClick={() => {
                              setDocumentToDelete({ id: doc.id, title: doc.title })
                              setShowDeleteModal(true)
                            }}
                            style={{
                              fontSize: '12px',
                              fontWeight: '500',
                              color: '#dc2626',
                              backgroundColor: 'transparent',
                              border: 'none',
                              cursor: 'pointer',
                              textDecoration: 'underline',
                              padding: 0
                            }}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          <Pagination
            pagination={pagination}
            currentPage={currentPage}
            onPageChange={handlePageChange}
            itemLabel="webpages"
          />
        </div>

        <DeleteConfirmationModal
          isOpen={showDeleteModal}
          onClose={() => {
            setShowDeleteModal(false)
            setDocumentToDelete(null)
          }}
          onDelete={() => documentToDelete && deleteDocument(documentToDelete.id)}
          title="Delete Scraped Webpage"
          itemName={documentToDelete?.title ?? ''}
          warnings={[
            'The scraped content will be permanently removed',
            'All associated chat history will remain but lose document references',
            'Vector embeddings will be deleted from the search index',
            'This cannot be undone'
          ]}
        />
      </div>
    </div>
  )
}

export default function ScrapedWebpagesPage() {
  return (
    <AdminErrorBoundary>
      <ToastProvider>
        <ScrapedWebpagesContent />
      </ToastProvider>
    </AdminErrorBoundary>
  )
}
