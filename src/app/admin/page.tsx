'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import AdminNavbar from '@/components/AdminNavbar'

interface Document {
  id: string
  title: string
  author?: string
  mimeType: string
  fileSize: number
  wordCount: number
  pageCount?: number
  createdAt: string
  ingestStatus: string
  chunksCreated: number
  ingestError?: string
}

export default function AdminPage() {
  const { isLoaded, userId } = useAuth()
  const router = useRouter()
  const [documents, setDocuments] = useState<Document[]>([])
  const [uploading, setUploading] = useState(false)
  const [ingesting, setIngesting] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Redirect if not authenticated
  useEffect(() => {
    if (isLoaded && !userId) {
      router.push('/sign-in')
    }
  }, [isLoaded, userId, router])

  // Load documents on mount
  useEffect(() => {
    if (userId) {
      loadDocuments()
    }
  }, [userId])

  const loadDocuments = async () => {
    try {
      const response = await fetch('/api/documents')
      const data = await response.json()
      
      if (data.success) {
        setDocuments(data.documents)
      } else {
        setError(data.error)
      }
    } catch (err) {
      setError('Failed to load documents')
    } finally {
      setLoading(false)
    }
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Get title and author
    const title = prompt('Enter document title:', file.name.replace(/\.[^/.]+$/, ''))
    if (!title) return

    const author = prompt('Enter author (optional):') || ''

    setUploading(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('title', title)
      formData.append('author', author)

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      })

      const data = await response.json()

      if (data.success) {
        // Automatically start ingestion
        await startIngestion(data.document.id)
        await loadDocuments() // Refresh list
      } else {
        setError(data.error)
      }
    } catch (err) {
      setError('Upload failed')
    } finally {
      setUploading(false)
      // Reset file input
      event.target.value = ''
    }
  }

  const startIngestion = async (documentId: string) => {
    setIngesting(prev => new Set([...prev, documentId]))

    try {
      const response = await fetch('/api/ingest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ documentId })
      })

      const data = await response.json()

      if (!data.success) {
        setError(data.error)
      }

      await loadDocuments() // Refresh to show updated status
    } catch (err) {
      setError('Ingestion failed')
    } finally {
      setIngesting(prev => {
        const newSet = new Set(prev)
        newSet.delete(documentId)
        return newSet
      })
    }
  }

  const deleteDocument = async (documentId: string) => {
    if (!confirm('Are you sure you want to delete this document?')) return

    try {
      const response = await fetch(`/api/documents?id=${documentId}`, {
        method: 'DELETE'
      })

      const data = await response.json()

      if (data.success) {
        await loadDocuments() // Refresh list
      } else {
        setError(data.error)
      }
    } catch (err) {
      setError('Delete failed')
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-green-600 bg-green-100'
      case 'processing': return 'text-blue-600 bg-blue-100'
      case 'failed': return 'text-red-600 bg-red-100'
      case 'pending': return 'text-yellow-600 bg-yellow-100'
      default: return 'text-gray-600 bg-gray-100'
    }
  }

  if (!isLoaded || !userId) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>Loading...</div>
  }

  return (
    <div>
      <AdminNavbar />
      
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '1.5rem' }}>
        <div style={{ marginBottom: '2rem' }}>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 'bold', color: '#111827', marginBottom: '0.5rem' }}>
            Document Management
          </h1>
          <p style={{ color: '#6b7280' }}>Upload and manage documents for the knowledge base</p>
        </div>

        {error && (
          <div style={{ 
            marginBottom: '1.5rem', 
            padding: '1rem', 
            backgroundColor: '#fef2f2', 
            border: '1px solid #fecaca', 
            color: '#dc2626', 
            borderRadius: '0.375rem' 
          }}>
            {error}
          </div>
        )}

        {/* Upload Section */}
        <div style={{ 
          marginBottom: '2rem', 
          padding: '1.5rem', 
          backgroundColor: 'white', 
          borderRadius: '0.5rem', 
          border: '1px solid #e5e7eb' 
        }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '1rem' }}>Upload New Document</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <input
              type="file"
              accept=".txt,.md,.pdf,.docx"
              onChange={handleFileUpload}
              disabled={uploading}
              className="input"
              style={{ flex: 1 }}
            />
            {uploading && (
              <div style={{ color: '#2563eb' }}>Uploading and processing...</div>
            )}
          </div>
          <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.5rem' }}>
            Supported formats: TXT, MD, PDF, DOCX (max 50MB)
          </p>
        </div>

        {/* Documents List */}
        <div style={{ backgroundColor: 'white', borderRadius: '0.5rem', border: '1px solid #e5e7eb' }}>
          <div style={{ padding: '1.5rem', borderBottom: '1px solid #e5e7eb' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: '600' }}>Documents ({documents.length})</h2>
          </div>

          {loading ? (
            <div style={{ padding: '1.5rem', textAlign: 'center' }}>Loading documents...</div>
          ) : documents.length === 0 ? (
            <div style={{ padding: '1.5rem', textAlign: 'center', color: '#6b7280' }}>
              No documents uploaded yet
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%' }}>
                <thead style={{ backgroundColor: '#f9fafb' }}>
                  <tr>
                    <th style={{ padding: '0.75rem 1.5rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: '500', color: '#6b7280', textTransform: 'uppercase' }}>
                      Document
                    </th>
                    <th style={{ padding: '0.75rem 1.5rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: '500', color: '#6b7280', textTransform: 'uppercase' }}>
                      Details
                    </th>
                    <th style={{ padding: '0.75rem 1.5rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: '500', color: '#6b7280', textTransform: 'uppercase' }}>
                      Status
                    </th>
                    <th style={{ padding: '0.75rem 1.5rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: '500', color: '#6b7280', textTransform: 'uppercase' }}>
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody style={{ backgroundColor: 'white' }}>
                  {documents.map((doc) => (
                    <tr key={doc.id} style={{ borderTop: '1px solid #e5e7eb' }}>
                      <td style={{ padding: '1rem 1.5rem' }}>
                        <div>
                          <div style={{ fontSize: '0.875rem', fontWeight: '500', color: '#111827' }}>
                            {doc.title}
                          </div>
                          {doc.author && (
                            <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                              by {doc.author}
                            </div>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '1rem 1.5rem', fontSize: '0.875rem', color: '#6b7280' }}>
                        <div>{formatFileSize(doc.fileSize)}</div>
                        <div>{doc.wordCount.toLocaleString()} words</div>
                        {doc.pageCount && <div>{doc.pageCount} pages</div>}
                      </td>
                      <td style={{ padding: '1rem 1.5rem' }}>
                        <span style={{ 
                          display: 'inline-flex', 
                          padding: '0.25rem 0.5rem', 
                          fontSize: '0.75rem', 
                          fontWeight: '600', 
                          borderRadius: '9999px',
                          backgroundColor: doc.ingestStatus === 'completed' ? '#f0fdf4' : doc.ingestStatus === 'processing' ? '#eff6ff' : doc.ingestStatus === 'failed' ? '#fef2f2' : '#fffbeb',
                          color: doc.ingestStatus === 'completed' ? '#16a34a' : doc.ingestStatus === 'processing' ? '#2563eb' : doc.ingestStatus === 'failed' ? '#dc2626' : '#d97706'
                        }}>
                          {doc.ingestStatus === 'not_started' ? 'Ready to process' : doc.ingestStatus}
                        </span>
                        {doc.ingestStatus === 'completed' && (
                          <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                            {doc.chunksCreated} chunks created
                          </div>
                        )}
                        {doc.ingestError && (
                          <div style={{ fontSize: '0.75rem', color: '#dc2626', marginTop: '0.25rem' }}>
                            Error: {doc.ingestError}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '1rem 1.5rem', fontSize: '0.875rem' }}>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          {doc.ingestStatus === 'not_started' && (
                            <button
                              onClick={() => startIngestion(doc.id)}
                              disabled={ingesting.has(doc.id)}
                              className="btn"
                              style={{ 
                                color: '#2563eb', 
                                backgroundColor: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                opacity: ingesting.has(doc.id) ? 0.5 : 1
                              }}
                            >
                              {ingesting.has(doc.id) ? 'Processing...' : 'Process'}
                            </button>
                          )}
                          <button
                            onClick={() => deleteDocument(doc.id)}
                            className="btn"
                            style={{ 
                              color: '#dc2626', 
                              backgroundColor: 'transparent',
                              border: 'none',
                              cursor: 'pointer'
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}