'use client'

import { useState, useEffect } from 'react'
import { useAuth, useUser } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import AdminNavbar from '@/components/AdminNavbar'

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
}

interface IngestJob {
  id: string
  document_id: string
  status: string
  error_message?: string
  chunks_created: number
}

interface UserData {
  id: string
  role: string
  email: string
  name?: string
}

interface ScrapedPage {
  url: string
  success: boolean
  content?: string
  title?: string
  error?: string
  selected?: boolean
}

export default function AdminPage() {
  const { isLoaded, userId, getToken } = useAuth()
  const { user: clerkUser } = useUser()
  const router = useRouter()
  const [documents, setDocuments] = useState<Document[]>([])
  const [ingestJobs, setIngestJobs] = useState<IngestJob[]>([])
  const [userData, setUserData] = useState<UserData | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploadTitle, setUploadTitle] = useState('')
  const [uploadAuthor, setUploadAuthor] = useState('')
  const [accessDenied, setAccessDenied] = useState(false)

  // Web scraping states
  const [websiteUrl, setWebsiteUrl] = useState('')
  const [isDiscovering, setIsDiscovering] = useState(false)
  const [discoveredPages, setDiscoveredPages] = useState<{url: string, selected: boolean}[]>([])
  const [scrapingProgress, setScrapingProgress] = useState(0)
  const [isScrapingPages, setIsScrapingPages] = useState(false)
  const [scrapedContent, setScrapedContent] = useState<ScrapedPage[]>([])
  const [showPreview, setShowPreview] = useState(false)

  // Check authentication and permissions
  useEffect(() => {
    if (isLoaded && !userId) {
      router.push('/sign-in')
    } else if (isLoaded && userId) {
      fetchUserData()
    }
  }, [isLoaded, userId, router])

  const fetchUserData = async () => {
    try {
      const token = await getToken()
      
      const userResponse = await fetch('/api/auth', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      
      if (userResponse.status === 404) {
        setAccessDenied(true)
        setError('Access denied: Your account has not been properly set up.')
        setLoading(false)
        return
      }
      
      const userData = await userResponse.json()
      
      if (!userData.success) {
        setAccessDenied(true)
        setError('Access denied: Unable to verify your permissions.')
        setLoading(false)
        return
      }
      
      setUserData(userData.user)
      
      if (!['ADMIN', 'CONTRIBUTOR'].includes(userData.user.role)) {
        setAccessDenied(true)
        setError('Access denied: You need admin or contributor permissions to access this page.')
        setLoading(false)
        return
      }
      
      loadDocuments()
      loadIngestJobs()
      
    } catch (err) {
      console.error('Error fetching user data:', err)
      setAccessDenied(true)
      setError('Access denied: Unable to verify your permissions.')
      setLoading(false)
    }
  }

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

  const loadIngestJobs = async () => {
    try {
      const response = await fetch('/api/ingest')
      const data = await response.json()
      
      if (data.success) {
        setIngestJobs(data.jobs)
      }
    } catch (err) {
      console.error('Failed to load ingest jobs:', err)
    }
  }

  // Web scraping functions
  const discoverWebsitePages = async () => {
    if (!websiteUrl.trim()) return
    
    setIsDiscovering(true)
    setError(null)
    
    try {
      const response = await fetch('/api/scrape-website', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: websiteUrl.trim(),
          action: 'discover'
        })
      })
      
      const data = await response.json()
      
      if (data.success) {
        // Convert links to objects with selected: false by default
        setDiscoveredPages(data.links.map((url: string) => ({ url, selected: false })))
        setError(data.totalFound > 50 ? 
          `Found ${data.totalFound} pages, showing first 50 for review` : 
          null
        )
      } else {
        setError(data.error || 'Failed to discover pages')
      }
    } catch (err) {
      setError('Failed to discover website pages')
    } finally {
      setIsDiscovering(false)
    }
  }

  const scrapeSelectedPages = async () => {
    const selectedUrls = discoveredPages.filter(page => page.selected).map(page => page.url)
    
    if (selectedUrls.length === 0) {
      setError('Please select at least one page to scrape')
      return
    }
    
    setIsScrapingPages(true)
    setScrapingProgress(0)
    setError(null)
    
    try {
      const response = await fetch('/api/scrape-website', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'scrape',
          urls: selectedUrls
        })
      })
      
      const data = await response.json()
      
      if (data.success) {
        setScrapedContent(data.results.map((result: ScrapedPage) => ({
          ...result,
          selected: result.success // Auto-select successful scrapes
        })))
        setShowPreview(true)
        
        const failedCount = data.results.filter((r: ScrapedPage) => !r.success).length
        if (failedCount > 0) {
          setError(`Warning: ${failedCount} pages failed to scrape. Review the results below.`)
        }
      } else {
        setError(data.error || 'Failed to scrape pages')
      }
    } catch (err) {
      setError('Failed to scrape website pages')
    } finally {
      setIsScrapingPages(false)
      setScrapingProgress(100)
    }
  }

  // Replace your existing saveSelectedContent function in page.tsx
const saveSelectedContent = async () => {
  const selectedContent = scrapedContent.filter(page => page.selected && page.success)
  
  if (selectedContent.length === 0) {
    setError('Please select at least one page to save')
    return
  }
  
  setUploading(true)
  setUploadProgress(0)
  setError(null)
  
  try {
    const token = await getToken()
    if (!token) {
      throw new Error('Authentication required')
    }

    console.log(`Batch processing ${selectedContent.length} pages...`)

    // Call the new batch processing API
    const response = await fetch('/api/scrape-website/save', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        scrapedPages: selectedContent
      })
    })

    const data = await response.json()
    
    setUploadProgress(100)
    
    if (!response.ok) {
      throw new Error(data.error || `Server error: ${response.status}`)
    }

    if (data.success) {
      const { result } = data
      
      // Show detailed results
      if (result.failed > 0) {
        setError(
          `Processed ${result.processed} pages successfully. ${result.failed} pages failed:\n` +
          result.errors.slice(0, 3).join('\n') + 
          (result.errors.length > 3 ? `\n...and ${result.errors.length - 3} more` : '')
        )
      } else {
        setError(null)
        console.log(`Successfully processed all ${result.processed} pages`)
      }
      
      // Reset scraping state
      setWebsiteUrl('')
      setDiscoveredPages([])
      setScrapedContent([])
      setShowPreview(false)
      
      // Reload documents to show new scraped content
      await loadDocuments()
      await loadIngestJobs()
      
    } else {
      throw new Error(data.error || 'Batch processing failed')
    }
      
  } catch (err) {
    console.error('Batch processing error:', err)
    setError('Failed to save scraped content: ' + (err instanceof Error ? err.message : 'Unknown error'))
  } finally {
    setUploading(false)
    setUploadProgress(0)
  }
}

  const togglePageSelection = (index: number) => {
    setDiscoveredPages(prev => prev.map((page, i) => 
      i === index ? { ...page, selected: !page.selected } : page
    ))
  }

  const toggleScrapedPageSelection = (index: number) => {
    setScrapedContent(prev => prev.map((page, i) => 
      i === index ? { ...page, selected: !page.selected } : page
    ))
  }

  // File upload functions (existing code)
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const allowedTypes = ['application/pdf', 'text/plain', 'text/markdown', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
      if (!allowedTypes.includes(file.type)) {
        setError('Please select a valid file type (PDF, TXT, MD, DOCX)')
        return
      }

      if (file.size > 50 * 1024 * 1024) {
        setError('File size must be less than 50MB')
        return
      }

      setSelectedFile(file)
      setError(null)
      
      if (!uploadTitle) {
        setUploadTitle(file.name.replace(/\.[^/.]+$/, ''))
      }
    }
  }

  const handleUpload = async () => {
    if (!selectedFile || !userData) return

    setUploading(true)
    setUploadProgress(0)
    setError(null)

    try {
      const token = await getToken()
      if (!token) {
        throw new Error('Authentication required')
      }

      setUploadProgress(10)

      const presignedResponse = await fetch('/api/upload/presigned', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          fileName: selectedFile.name,
          fileSize: selectedFile.size,
          mimeType: selectedFile.type
        })
      })

      const presignedData = await presignedResponse.json()

      if (!presignedData.success) {
        throw new Error(presignedData.error || 'Failed to get upload URL')
      }

      setUploadProgress(20)

      const uploadResponse = await fetch(presignedData.uploadUrl, {
        method: 'PUT',
        body: selectedFile,
        headers: {
          'Content-Type': selectedFile.type,
        }
      })

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text()
        throw new Error(`Upload failed: ${uploadResponse.statusText} - ${errorText}`)
      }

      setUploadProgress(60)

      const processResponse = await fetch('/api/upload/process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          storagePath: presignedData.storagePath,
          fileName: selectedFile.name,
          fileSize: selectedFile.size,
          mimeType: selectedFile.type,
          title: uploadTitle.trim() || selectedFile.name,
          author: uploadAuthor.trim() || null
        })
      })

      const processData = await processResponse.json()

      if (!processData.success) {
        throw new Error(processData.error || 'Processing failed')
      }

      setUploadProgress(100)

      setSelectedFile(null)
      setUploadTitle('')
      setUploadAuthor('')
      
      const fileInput = document.getElementById('file-upload') as HTMLInputElement
      if (fileInput) fileInput.value = ''

      await loadDocuments()
      await loadIngestJobs()

    } catch (err) {
      console.error('Upload error:', err)
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      setUploadProgress(0)
    }
  }

  const deleteDocument = async (documentId: string) => {
    if (!confirm('Are you sure you want to delete this document?')) return
    if (!userData) return

    if (userData.role !== 'ADMIN') {
      setError('Only administrators can delete documents')
      return
    }

    try {
      const response = await fetch(`/api/documents?id=${documentId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        }
      })

      const data = await response.json()

      if (data.success) {
        setDocuments(documents.filter(doc => doc.id !== documentId))
      } else {
        setError(data.error)
      }
    } catch (err) {
      setError('Failed to delete document')
    }
  }

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
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return { bg: '#f0fdf4', color: '#16a34a' }
      case 'processing':
        return { bg: '#fef3c7', color: '#d97706' }
      case 'failed':
        return { bg: '#fef2f2', color: '#dc2626' }
      default:
        return { bg: '#f3f4f6', color: '#6b7280' }
    }
  }

  if (!isLoaded || !userId) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>Loading...</div>
  }

  if (accessDenied) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '2rem' }}>
        <h1 style={{ fontSize: '1.875rem', fontWeight: 'bold', color: '#dc2626', marginBottom: '1rem' }}>
          Access Denied
        </h1>
        <p style={{ color: '#6b7280', textAlign: 'center', marginBottom: '2rem', maxWidth: '500px' }}>
          {error}
        </p>
        <button
          onClick={() => router.push('/')}
          style={{
            backgroundColor: '#2563eb',
            color: 'white',
            padding: '0.75rem 1.5rem',
            border: 'none',
            borderRadius: '0.375rem',
            cursor: 'pointer',
            fontSize: '0.875rem',
            fontWeight: '500'
          }}
        >
          Go to Chat
        </button>
      </div>
    )
  }

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>Loading...</div>
  }

  return (
    <div>
      <AdminNavbar />
      
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '1.5rem' }}>
        {/* Header */}
        <div style={{ marginBottom: '2rem' }}>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 'bold', color: '#111827', marginBottom: '0.5rem' }}>
            Content Management
          </h1>
          <p style={{ color: '#6b7280' }}>
            Upload documents or scrape websites to train your AI knowledge base
            {userData && (
              <span style={{ marginLeft: '1rem', fontSize: '0.875rem', color: '#2563eb' }}>
                Logged in as {userData.role}: {userData.email}
              </span>
            )}
          </p>
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

        {/* File Upload Section */}
        {userData && ['ADMIN', 'CONTRIBUTOR'].includes(userData.role) && (
          <div style={{ 
            marginBottom: '2rem', 
            padding: '1.5rem', 
            backgroundColor: 'white', 
            borderRadius: '0.5rem', 
            border: '1px solid #e5e7eb' 
          }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '1rem' }}>Upload Document</h2>
            
            <div style={{ display: 'grid', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>
                  Select File (PDF, TXT, MD, DOCX - Max 50MB)
                </label>
                <input
                  id="file-upload"
                  type="file"
                  accept=".pdf,.txt,.md,.docx"
                  onChange={handleFileSelect}
                  disabled={uploading}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                    fontSize: '0.875rem'
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>
                    Title (Optional)
                  </label>
                  <input
                    type="text"
                    value={uploadTitle}
                    onChange={(e) => setUploadTitle(e.target.value)}
                    disabled={uploading}
                    placeholder="Document title..."
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      fontSize: '0.875rem'
                    }}
                  />
                </div>
                
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>
                    Author (Optional)
                  </label>
                  <input
                    type="text"
                    value={uploadAuthor}
                    onChange={(e) => setUploadAuthor(e.target.value)}
                    disabled={uploading}
                    placeholder="Author name..."
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      fontSize: '0.875rem'
                    }}
                  />
                </div>
              </div>

              {selectedFile && (
                <div style={{ 
                  padding: '0.75rem', 
                  backgroundColor: '#f9fafb', 
                  borderRadius: '0.375rem',
                  fontSize: '0.875rem',
                  color: '#6b7280'
                }}>
                  Selected: {selectedFile.name} ({formatFileSize(selectedFile.size)})
                </div>
              )}

              <button
                onClick={handleUpload}
                disabled={!selectedFile || uploading}
                style={{
                  backgroundColor: !selectedFile || uploading ? '#9ca3af' : '#3b82f6',
                  color: 'white',
                  padding: '0.75rem 1.5rem',
                  border: 'none',
                  borderRadius: '0.375rem',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  cursor: !selectedFile || uploading ? 'not-allowed' : 'pointer',
                  width: 'fit-content'
                }}
              >
                {uploading ? 'Uploading...' : 'Upload Document'}
              </button>
            </div>
          </div>
        )}

        {/* Web Scraping Section */}
        {userData && ['ADMIN', 'CONTRIBUTOR'].includes(userData.role) && (
          <div style={{ 
            marginBottom: '2rem', 
            padding: '1.5rem', 
            backgroundColor: 'white', 
            borderRadius: '0.5rem', 
            border: '1px solid #e5e7eb' 
          }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '1rem' }}>Scrape Website</h2>
            <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '1rem' }}>
              Enter a website URL to discover and scrape all pages within the same domain
            </p>
            
            <div style={{ display: 'grid', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>
                  Website URL
                </label>
                <input
                  type="url"
                  value={websiteUrl}
                  onChange={(e) => {
                    setWebsiteUrl(e.target.value)
                    // Clear previous results when URL changes
                    if (discoveredPages.length > 0) {
                      setDiscoveredPages([])
                      setScrapedContent([])
                      setShowPreview(false)
                    }
                  }}
                  disabled={isDiscovering || isScrapingPages || uploading}
                  placeholder="https://example.com"
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                    fontSize: '0.875rem'
                  }}
                />
              </div>

              <button
                onClick={discoverWebsitePages}
                disabled={!websiteUrl.trim() || isDiscovering || isScrapingPages || uploading}
                style={{
                  backgroundColor: !websiteUrl.trim() || isDiscovering || isScrapingPages || uploading ? '#9ca3af' : '#10b981',
                  color: 'white',
                  padding: '0.75rem 1.5rem',
                  border: 'none',
                  borderRadius: '0.375rem',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  cursor: !websiteUrl.trim() || isDiscovering || isScrapingPages || uploading ? 'not-allowed' : 'pointer',
                  width: 'fit-content'
                }}
              >
                {isDiscovering ? 'Discovering Pages...' : 'Discover Pages'}
              </button>

              {discoveredPages.length > 0 && (
                <div>
                  <p style={{ fontSize: '0.875rem', fontWeight: '500', marginBottom: '1rem' }}>
                    Select pages to scrape ({discoveredPages.filter(p => p.selected).length} selected):
                  </p>
                  <div style={{ 
                    maxHeight: '300px', 
                    overflowY: 'auto', 
                    padding: '1rem', 
                    backgroundColor: '#f9fafb', 
                    borderRadius: '0.375rem',
                    border: '1px solid #e5e7eb'
                  }}>
                    {discoveredPages.map((page, index) => (
                      <div key={index} style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        marginBottom: '0.5rem',
                        padding: '0.5rem',
                        backgroundColor: 'white',
                        borderRadius: '0.25rem',
                        border: page.selected ? '2px solid #3b82f6' : '1px solid #e5e7eb'
                      }}>
                        <input
                          type="checkbox"
                          checked={page.selected}
                          onChange={() => togglePageSelection(index)}
                          style={{ 
                            marginRight: '0.75rem',
                            width: '16px',
                            height: '16px',
                            cursor: 'pointer'
                          }}
                        />
                        <span style={{ 
                          fontSize: '0.875rem',
                          color: '#374151',
                          wordBreak: 'break-all',
                          flex: 1
                        }}>
                          {page.url}
                        </span>
                      </div>
                    ))}
                  </div>
                  
                  <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
                    <button
                      onClick={() => setDiscoveredPages(prev => prev.map(p => ({ ...p, selected: true })))}
                      disabled={isScrapingPages || uploading}
                      style={{
                        backgroundColor: '#10b981',
                        color: 'white',
                        padding: '0.5rem 1rem',
                        border: 'none',
                        borderRadius: '0.375rem',
                        fontSize: '0.75rem',
                        fontWeight: '500',
                        cursor: isScrapingPages || uploading ? 'not-allowed' : 'pointer'
                      }}
                    >
                      Select All
                    </button>
                    
                    <button
                      onClick={() => setDiscoveredPages(prev => prev.map(p => ({ ...p, selected: false })))}
                      disabled={isScrapingPages || uploading}
                      style={{
                        backgroundColor: '#6b7280',
                        color: 'white',
                        padding: '0.5rem 1rem',
                        border: 'none',
                        borderRadius: '0.375rem',
                        fontSize: '0.75rem',
                        fontWeight: '500',
                        cursor: isScrapingPages || uploading ? 'not-allowed' : 'pointer'
                      }}
                    >
                      Deselect All
                    </button>
                    
                    <button
                      onClick={scrapeSelectedPages}
                      disabled={isScrapingPages || uploading || discoveredPages.filter(p => p.selected).length === 0}
                      style={{
                        backgroundColor: isScrapingPages || uploading || discoveredPages.filter(p => p.selected).length === 0 ? '#9ca3af' : '#f59e0b',
                        color: 'white',
                        padding: '0.5rem 1rem',
                        border: 'none',
                        borderRadius: '0.375rem',
                        fontSize: '0.75rem',
                        fontWeight: '500',
                        cursor: isScrapingPages || uploading || discoveredPages.filter(p => p.selected).length === 0 ? 'not-allowed' : 'pointer'
                      }}
                    >
                      {isScrapingPages ? 'Scraping...' : `Scrape ${discoveredPages.filter(p => p.selected).length} Selected Pages`}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Content Preview Section */}
        {showPreview && scrapedContent.length > 0 && (
          <div style={{ 
            marginBottom: '2rem', 
            padding: '1.5rem', 
            backgroundColor: 'white', 
            borderRadius: '0.5rem', 
            border: '1px solid #e5e7eb' 
          }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '1rem' }}>
              Review Scraped Content ({scrapedContent.filter(p => p.selected).length} selected)
            </h2>
            
            <div style={{ maxHeight: '400px', overflowY: 'auto', marginBottom: '1rem' }}>
              {scrapedContent.map((page, index) => (
                <div key={index} style={{ 
                  padding: '1rem', 
                  border: '1px solid #e5e7eb', 
                  borderRadius: '0.375rem', 
                  marginBottom: '0.5rem',
                  backgroundColor: page.success ? '#f9fafb' : '#fef2f2'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.5rem' }}>
                    {page.success && (
                      <input
                        type="checkbox"
                        checked={page.selected || false}
                        onChange={() => toggleScrapedPageSelection(index)}
                        style={{ marginRight: '0.5rem' }}
                      />
                    )}
                    <span style={{ 
                      fontSize: '0.875rem', 
                      fontWeight: '500',
                      color: page.success ? '#111827' : '#dc2626'
                    }}>
                      {page.title || page.url}
                    </span>
                  </div>
                  
                  {page.success ? (
                    <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                      {page.content?.slice(0, 200)}...
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.75rem', color: '#dc2626' }}>
                      Error: {page.error}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <button
              onClick={saveSelectedContent}
              disabled={uploading || scrapedContent.filter(p => p.selected).length === 0}
              style={{
                backgroundColor: uploading || scrapedContent.filter(p => p.selected).length === 0 ? '#9ca3af' : '#3b82f6',
                color: 'white',
                padding: '0.75rem 1.5rem',
                border: 'none',
                borderRadius: '0.375rem',
                fontSize: '0.875rem',
                fontWeight: '500',
                cursor: uploading || scrapedContent.filter(p => p.selected).length === 0 ? 'not-allowed' : 'pointer'
              }}
            >
              {uploading ? 'Saving Content...' : `Save ${scrapedContent.filter(p => p.selected).length} Selected Pages`}
            </button>
          </div>
        )}

        {/* Progress Bar */}
        {(uploading || isScrapingPages) && (
          <div style={{ marginBottom: '2rem' }}>
            <div style={{ 
              width: '100%', 
              backgroundColor: '#e5e7eb', 
              borderRadius: '0.25rem', 
              height: '0.5rem' 
            }}>
              <div style={{ 
                width: `${uploadProgress || scrapingProgress}%`, 
                backgroundColor: '#3b82f6', 
                height: '100%', 
                borderRadius: '0.25rem',
                transition: 'width 0.3s ease'
              }} />
            </div>
            <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' }}>
              {isScrapingPages ? 'Scraping website content...' : 
               uploadProgress < 20 ? 'Getting upload URL...' : 
               uploadProgress < 60 ? 'Uploading file...' : 'Processing...'}
            </p>
          </div>
        )}

        {/* Documents List */}
        <div style={{ backgroundColor: 'white', borderRadius: '0.5rem', border: '1px solid #e5e7eb' }}>
          <div style={{ padding: '1.5rem', borderBottom: '1px solid #e5e7eb' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: '600' }}>
              Documents ({documents.length})
            </h2>
          </div>

          {documents.length === 0 ? (
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
                      Created
                    </th>
                    {userData?.role === 'ADMIN' && (
                      <th style={{ padding: '0.75rem 1.5rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: '500', color: '#6b7280', textTransform: 'uppercase' }}>
                        Actions
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody style={{ backgroundColor: 'white' }}>
                  {documents.map((doc) => {
                    const job = ingestJobs.find(j => j.document_id === doc.id)
                    const status = job?.status || 'completed'
                    const statusColors = getStatusColor(status)
                    
                    return (
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
                          {doc.wordCount && <div>{doc.wordCount.toLocaleString()} words</div>}
                          {doc.pageCount && <div>{doc.pageCount} pages</div>}
                        </td>
                        <td style={{ padding: '1rem 1.5rem' }}>
                          <span style={{ 
                            display: 'inline-flex', 
                            padding: '0.25rem 0.5rem', 
                            fontSize: '0.75rem', 
                            fontWeight: '600', 
                            borderRadius: '9999px',
                            backgroundColor: statusColors.bg,
                            color: statusColors.color
                          }}>
                            {status}
                            {job && status === 'completed' && ` (${job.chunks_created} chunks)`}
                          </span>
                          {job?.error_message && (
                            <div style={{ fontSize: '0.75rem', color: '#dc2626', marginTop: '0.25rem' }}>
                              {job.error_message}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '1rem 1.5rem', fontSize: '0.875rem', color: '#6b7280' }}>
                          {formatDate(doc.createdAt)}
                        </td>
                        {userData?.role === 'ADMIN' && (
                          <td style={{ padding: '1rem 1.5rem' }}>
                            <button
                              onClick={() => deleteDocument(doc.id)}
                              style={{
                                padding: '0.25rem 0.75rem',
                                fontSize: '0.75rem',
                                color: '#dc2626',
                                backgroundColor: 'transparent',
                                border: '1px solid #dc2626',
                                borderRadius: '0.375rem',
                                cursor: 'pointer'
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = '#fef2f2'
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = 'transparent'
                              }}
                            >
                              Delete
                            </button>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}