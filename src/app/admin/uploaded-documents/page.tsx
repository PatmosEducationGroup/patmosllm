'use client'

import { useState, useCallback } from 'react'
import { logError } from '@/lib/logger'
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from '@/components/ui/Card'
import { Alert } from '@/components/ui/Alert'
import { ToastProvider, useToast } from '@/components/ui/Toast'
import { AdminErrorBoundary } from '@/components/ErrorBoundary'
import { useAdminAuth } from '@/hooks/useAdminAuth'
import { formatFileSize, formatDate } from '@/lib/admin-utils'
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
  processing?: boolean
  amazon_url?: string
  resource_url?: string
  download_enabled: boolean
  contact_person?: string
  contact_email?: string
  uploaded_by: string
  source_type?: string
  source_url?: string
  storagePath?: string
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

function UploadedDocumentsContent() {
  const { addToast } = useToast()
  const [documents, setDocuments] = useState<Document[]>([])
  const [pagination, setPagination] = useState<PaginationState>({ page: 1, limit: 20, total: 0, totalPages: 0 })
  const [ingestJobs, setIngestJobs] = useState<IngestJob[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [sortField, setSortField] = useState<'title' | 'author' | 'created_at' | 'file_size' | 'word_count' | 'uploader'>('created_at')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [editingDoc, setEditingDoc] = useState<Document | null>(null)
  const [saving, setSaving] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [documentToDelete, setDocumentToDelete] = useState<{id: string, title: string} | null>(null)
  const [reingestingDocs, setReingestingDocs] = useState<Set<string>>(new Set())
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  const loadDocuments = useCallback(async (page: number, limit: number) => {
    try {
      const response = await fetch(`/api/admin/documents?source_type=upload&page=${page}&limit=${limit}`)
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
        errorContext: 'Failed to load documents'
      })
      setError('Failed to load documents')
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
      (doc.author && doc.author.toLowerCase().includes(query)) ||
      (doc.mimeType && doc.mimeType.toLowerCase().includes(query))
    )
  }

  const handleSave = async () => {
    if (!editingDoc) return

    setSaving(true)
    setError(null)

    try {
      const response = await fetch(`/api/admin/documents/${editingDoc.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editingDoc.title,
          author: editingDoc.author,
          amazon_url: editingDoc.amazon_url,
          download_enabled: editingDoc.download_enabled,
          contact_person: editingDoc.contact_person,
          contact_email: editingDoc.contact_email
        })
      })

      const data = await response.json()

      if (data.success) {
        setDocuments(docs => docs.map(doc =>
          doc.id === editingDoc.id ? { ...doc, ...data.document } : doc
        ))
        setEditingDoc(null)
      } else {
        setError(data.error)
      }
    } catch (error) {
      logError(error instanceof Error ? error : new Error('Operation failed'), {
        operation: 'handleSave',
        phase: 'request_handling',
        severity: 'high',
        errorContext: 'Failed to save document changes'
      })
      setError('Failed to save document changes')
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setEditingDoc(null)
    setError(null)
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

  const handleDocumentDownload = async (documentId: string, title: string) => {
    try {
      const response = await fetch(`/api/documents/download/${documentId}`)
      if (!response.ok) throw new Error('Failed to generate download URL')
      const data = await response.json()
      if (data.url) {
        const link = document.createElement('a')
        link.href = data.url
        link.download = title
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
      }
    } catch (error) {
      logError(error instanceof Error ? error : new Error('Download failed'), {
        operation: 'document_download',
        phase: 'request_handling',
        severity: 'medium',
        errorContext: 'Failed to download document'
      })
      setError('Failed to download document')
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

  if (loading) return <AdminLoadingScreen />
  if (accessDenied) return <AdminAccessDenied error={error} />

  const filteredDocs = sortDocuments(getFilteredDocuments())

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-200">
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <Card className="mb-8 bg-white/80 backdrop-blur-xl border-slate-200/40 shadow-xl">
          <CardHeader>
            <CardTitle className="text-3xl text-slate-800">
              Document Library
            </CardTitle>
            <CardDescription className="text-base">
              {pagination.total} document{pagination.total !== 1 ? 's' : ''} in the library
            </CardDescription>
          </CardHeader>
        </Card>

        {error && (
          <Alert variant="error" className="mb-6">
            {error}
          </Alert>
        )}

        {/* Documents Table */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.8)',
          backdropFilter: 'blur(12px)',
          borderRadius: '20px',
          border: '1px solid rgba(226, 232, 240, 0.4)',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
          overflow: 'hidden',
          marginBottom: '20px'
        }}>
          <div style={{ padding: '24px', borderBottom: '1px solid rgba(226, 232, 240, 0.4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b', marginBottom: '4px' }}>Document Library</h2>
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
                  placeholder="Search by title, author, type..."
                />

                <PageSizeSelector pageSize={pageSize} onPageSizeChange={handlePageSizeChange} />

                {(userData?.role === 'ADMIN' || userData?.role === 'SUPER_ADMIN') && (
                  <span style={{
                    fontSize: '12px',
                    fontWeight: '500',
                    color: 'rgb(158, 205, 85)',
                    padding: '4px 12px',
                    backgroundColor: '#d1fae5',
                    borderRadius: '16px'
                  }}>{userData?.role === 'SUPER_ADMIN' ? 'SUPER ADMIN' : 'ADMIN'}</span>
                )}
              </div>
            </div>
          </div>

          {filteredDocs.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>
              {searchQuery ? `No uploaded documents match "${searchQuery}"` : 'No uploaded documents found'}
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
                        onSort={(f) => handleSort(f as typeof sortField)}
                      />
                    )}
                    <SortableTableHeader
                      label="Title"
                      field="title"
                      currentSortField={sortField}
                      sortDirection={sortDirection}
                      onSort={(f) => handleSort(f as typeof sortField)}
                    />
                    <SortableTableHeader
                      label="Author"
                      field="author"
                      currentSortField={sortField}
                      sortDirection={sortDirection}
                      onSort={(f) => handleSort(f as typeof sortField)}
                    />
                    <SortableTableHeader
                      label="Size"
                      field="file_size"
                      currentSortField={sortField}
                      sortDirection={sortDirection}
                      onSort={(f) => handleSort(f as typeof sortField)}
                    />
                    <SortableTableHeader
                      label="Words"
                      field="word_count"
                      currentSortField={sortField}
                      sortDirection={sortDirection}
                      onSort={(f) => handleSort(f as typeof sortField)}
                    />
                    <SortableTableHeader
                      label="Date"
                      field="created_at"
                      currentSortField={sortField}
                      sortDirection={sortDirection}
                      onSort={(f) => handleSort(f as typeof sortField)}
                    />
                    <StaticTableHeader label="Links" />
                    <StaticTableHeader label="Contact" />
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
                          {doc.chunkCount !== undefined && (
                            <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
                              {doc.chunkCount} chunks
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '12px', fontSize: '14px', color: '#64748b' }}>
                          {doc.author || '-'}
                        </td>
                        <td style={{ padding: '12px', fontSize: '14px', color: '#64748b' }}>
                          {formatFileSize(doc.fileSize)}
                        </td>
                        <td style={{ padding: '12px', fontSize: '14px', color: '#64748b' }}>
                          {doc.wordCount && !isNaN(doc.wordCount) ? doc.wordCount.toLocaleString() : '-'}
                          {doc.pageCount && !isNaN(doc.pageCount) && (
                            <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
                              {doc.pageCount} pages
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '12px', fontSize: '14px', color: '#64748b' }}>
                          {formatDate(doc.createdAt)}
                        </td>
                        <td style={{ padding: '12px' }}>
                          {doc.amazon_url && (
                            <div style={{ marginBottom: '4px' }}>
                              <a
                                href={doc.amazon_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ fontSize: '12px', color: '#2563eb', textDecoration: 'none' }}
                              >
                                Amazon
                              </a>
                            </div>
                          )}
                          {doc.resource_url && (
                            <div>
                              <a
                                href={doc.resource_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ fontSize: '12px', color: 'rgb(158, 205, 85)', textDecoration: 'none' }}
                              >
                                Resource
                              </a>
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '12px', fontSize: '14px', color: '#64748b' }}>
                          {doc.contact_person && <div>{doc.contact_person}</div>}
                          {doc.contact_email && (
                            <div>
                              <a href={`mailto:${doc.contact_email}`} style={{ color: '#2563eb', textDecoration: 'none' }}>
                                {doc.contact_email}
                              </a>
                            </div>
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
                              {!doc.download_enabled && (
                                <span style={{
                                  fontSize: '11px',
                                  color: '#f59e0b',
                                  backgroundColor: '#fef3c7',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  fontWeight: '500'
                                }}>
                                  Download Disabled
                                </span>
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
                          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            <button
                              onClick={() => handleDocumentDownload(doc.id, doc.title)}
                              style={{
                                fontSize: '12px',
                                fontWeight: '500',
                                color: '#059669',
                                backgroundColor: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                textDecoration: 'underline',
                                padding: 0
                              }}
                            >
                              Download
                            </button>
                            <button
                              onClick={() => setEditingDoc(doc)}
                              style={{
                                fontSize: '12px',
                                fontWeight: '500',
                                color: '#6366f1',
                                backgroundColor: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                textDecoration: 'underline',
                                padding: 0
                              }}
                            >
                              Edit
                            </button>
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
                          </div>
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
            itemLabel="documents"
          />
        </div>

        {/* Edit Modal */}
        {editingDoc && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50
          }}>
            <div style={{
              background: 'rgba(255, 255, 255, 0.95)',
              backdropFilter: 'blur(12px)',
              borderRadius: '20px',
              padding: '24px',
              maxWidth: '600px',
              width: '90%',
              maxHeight: '80vh',
              overflowY: 'auto',
              border: '1px solid rgba(226, 232, 240, 0.4)',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
            }}>
              <h3 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '24px', color: '#1e293b' }}>
                Edit Document Metadata
              </h3>

              <div style={{ display: 'grid', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '8px', color: '#374151' }}>
                    Title *
                  </label>
                  <input
                    type="text"
                    value={editingDoc.title}
                    onChange={(e) => setEditingDoc({...editingDoc, title: e.target.value})}
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '1px solid rgba(203, 213, 225, 0.6)',
                      borderRadius: '12px',
                      fontSize: '14px',
                      background: 'rgba(255, 255, 255, 0.8)',
                      outline: 'none'
                    }}
                    onFocus={(e) => e.currentTarget.style.borderColor = 'rgb(130, 179, 219)'}
                    onBlur={(e) => e.currentTarget.style.borderColor = 'rgba(203, 213, 225, 0.6)'}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '8px', color: '#374151' }}>
                    Author
                  </label>
                  <input
                    type="text"
                    value={editingDoc.author || ''}
                    onChange={(e) => setEditingDoc({...editingDoc, author: e.target.value})}
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '1px solid rgba(203, 213, 225, 0.6)',
                      borderRadius: '12px',
                      fontSize: '14px',
                      background: 'rgba(255, 255, 255, 0.8)',
                      outline: 'none'
                    }}
                    onFocus={(e) => e.currentTarget.style.borderColor = 'rgb(130, 179, 219)'}
                    onBlur={(e) => e.currentTarget.style.borderColor = 'rgba(203, 213, 225, 0.6)'}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '8px', color: '#374151' }}>
                    Buy Online
                  </label>
                  <input
                    type="url"
                    value={editingDoc.amazon_url || ''}
                    onChange={(e) => setEditingDoc({...editingDoc, amazon_url: e.target.value})}
                    placeholder="https://amazon.com/... or other purchase link"
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '1px solid rgba(203, 213, 225, 0.6)',
                      borderRadius: '12px',
                      fontSize: '14px',
                      background: 'rgba(255, 255, 255, 0.8)',
                      outline: 'none'
                    }}
                    onFocus={(e) => e.currentTarget.style.borderColor = 'rgb(130, 179, 219)'}
                    onBlur={(e) => e.currentTarget.style.borderColor = 'rgba(203, 213, 225, 0.6)'}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '8px', color: '#374151' }}>
                      Contact Person
                    </label>
                    <input
                      type="text"
                      value={editingDoc.contact_person || ''}
                      onChange={(e) => setEditingDoc({...editingDoc, contact_person: e.target.value})}
                      placeholder="John Doe"
                      style={{
                        width: '100%',
                        padding: '12px',
                        border: '1px solid rgba(203, 213, 225, 0.6)',
                        borderRadius: '12px',
                        fontSize: '14px',
                        background: 'rgba(255, 255, 255, 0.8)',
                        outline: 'none'
                      }}
                      onFocus={(e) => e.currentTarget.style.borderColor = 'rgb(130, 179, 219)'}
                      onBlur={(e) => e.currentTarget.style.borderColor = 'rgba(203, 213, 225, 0.6)'}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '8px', color: '#374151' }}>
                      Contact Email
                    </label>
                    <input
                      type="email"
                      value={editingDoc.contact_email || ''}
                      onChange={(e) => setEditingDoc({...editingDoc, contact_email: e.target.value})}
                      placeholder="contact@example.com"
                      style={{
                        width: '100%',
                        padding: '12px',
                        border: '1px solid rgba(203, 213, 225, 0.6)',
                        borderRadius: '12px',
                        fontSize: '14px',
                        background: 'rgba(255, 255, 255, 0.8)',
                        outline: 'none'
                      }}
                      onFocus={(e) => e.currentTarget.style.borderColor = 'rgb(130, 179, 219)'}
                      onBlur={(e) => e.currentTarget.style.borderColor = 'rgba(203, 213, 225, 0.6)'}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="checkbox"
                    checked={editingDoc.download_enabled}
                    onChange={(e) => setEditingDoc({...editingDoc, download_enabled: e.target.checked})}
                    style={{ width: '16px', height: '16px' }}
                  />
                  <label style={{ fontSize: '14px', color: '#374151' }}>
                    Enable resource access/download for users
                  </label>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
                <button
                  onClick={handleCancel}
                  disabled={saving}
                  style={{
                    padding: '8px 16px',
                    fontSize: '14px',
                    color: '#64748b',
                    backgroundColor: 'white',
                    border: '1px solid rgba(203, 213, 225, 0.6)',
                    borderRadius: '8px',
                    cursor: saving ? 'not-allowed' : 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !editingDoc.title.trim()}
                  style={{
                    padding: '8px 16px',
                    fontSize: '14px',
                    color: 'white',
                    background: saving || !editingDoc.title.trim() ? '#9ca3af' : 'linear-gradient(135deg, rgb(130, 179, 219) 0%, rgb(90, 155, 212) 100%)',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: saving || !editingDoc.title.trim() ? 'not-allowed' : 'pointer'
                  }}
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        <DeleteConfirmationModal
          isOpen={showDeleteModal}
          onClose={() => { setShowDeleteModal(false); setDocumentToDelete(null) }}
          onDelete={() => documentToDelete && deleteDocument(documentToDelete.id)}
          title="Delete Document"
          itemName={documentToDelete?.title || ''}
        />
      </div>
    </div>
  )
}

export default function UploadedDocumentsPage() {
  return (
    <AdminErrorBoundary>
      <ToastProvider>
        <UploadedDocumentsContent />
      </ToastProvider>
    </AdminErrorBoundary>
  )
}
