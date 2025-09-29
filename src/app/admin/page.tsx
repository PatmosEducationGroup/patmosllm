'use client'

import { useState, useEffect } from 'react'
import { useAuth, useUser } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import AdminNavbar from '@/components/AdminNavbar'
import { validateFile } from '@/lib/clientValidation'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from '@/components/ui/Card'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { Alert } from '@/components/ui/Alert'
import { ToastProvider, useToast } from '@/components/ui/Toast'
import { Checkbox } from '@/components/ui/Checkbox'
import { Modal } from '@/components/ui/Modal'
import { AlertCircle } from 'lucide-react'

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

function AdminPageContent() {
  const { isLoaded, userId, getToken } = useAuth()
  useUser() // Keep the hook call for proper loading state
  const router = useRouter()
  const { addToast } = useToast()
  const [documents, setDocuments] = useState<Document[]>([])
  const [ingestJobs, setIngestJobs] = useState<IngestJob[]>([])
  const [userData, setUserData] = useState<UserData | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [scrapingMessage, setScrapingMessage] = useState<string | null>(null)
  const [scrapingMessageType, setScrapingMessageType] = useState<'info' | 'error'>('info')
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [uploadQueue, setUploadQueue] = useState<{
    file: File, 
    progress: number, 
    status: 'pending' | 'uploading' | 'completed' | 'error', 
    error?: string,
    metadata: {
      title: string,
      author: string,
      amazonUrl: string,
      resourceUrl: string,
      contactPerson: string,
      contactEmail: string,
      downloadEnabled: boolean
    }
  }[]>([])
  const [isProcessingQueue, setIsProcessingQueue] = useState(false)
  const [useSharedMetadata, setUseSharedMetadata] = useState(true)
  const [showMetadataEditor, setShowMetadataEditor] = useState(false)
  const [uploadTitle, setUploadTitle] = useState('')
  const [uploadAuthor, setUploadAuthor] = useState('')
  const [uploadAmazonUrl, setUploadAmazonUrl] = useState('')
  const [uploadResourceUrl, setUploadResourceUrl] = useState('')
  const [uploadDownloadEnabled, setUploadDownloadEnabled] = useState(true)
  const [uploadContactPerson, setUploadContactPerson] = useState('')
  const [uploadContactEmail, setUploadContactEmail] = useState('')
  const [accessDenied, setAccessDenied] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [documentToDelete, setDocumentToDelete] = useState<{id: string, title: string} | null>(null)
  const [reingestingDocs, setReingestingDocs] = useState<Set<string>>(new Set())

  // Metadata editing states
  const [editingDoc, setEditingDoc] = useState<Document | null>(null)
  const [saving, setSaving] = useState(false)

  // Web scraping states
  const [websiteUrl, setWebsiteUrl] = useState('')
  const [isDiscovering, setIsDiscovering] = useState(false)
  const [discoveredPages, setDiscoveredPages] = useState<{url: string, selected: boolean}[]>([])
  const [scrapingProgress, setScrapingProgress] = useState(0)
  const [isScrapingPages, setIsScrapingPages] = useState(false)
  const [scrapedContent, setScrapedContent] = useState<ScrapedPage[]>([])
  const [showPreview, setShowPreview] = useState(false)
  
  // Pagination states (for discovery pages)
  const [currentPage, setCurrentPage] = useState(1)
  const [pagesPerPage, setPagesPerPage] = useState(20)
  const [showAllPages, setShowAllPages] = useState(false)

  // New states for document and scraped page management
  const [searchQuery, setSearchQuery] = useState('')

  // Pagination states for documents
  const [documentsCurrentPage, setDocumentsCurrentPage] = useState(1)
  const [documentsPerPage, setDocumentsPerPage] = useState(20)

  // Pagination states for scraped pages
  const [scrapedPagesCurrentPage, setScrapedPagesCurrentPage] = useState(1)
  const [scrapedPagesPerPage, setScrapedPagesPerPage] = useState(20)

  // Check authentication and permissions
  useEffect(() => {
    if (isLoaded && !userId) {
      router.push('/sign-in')
    } else if (isLoaded && userId) {
      fetchUserData()
    }
  }, [isLoaded, userId, router]) // eslint-disable-line react-hooks/exhaustive-deps

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
      
      if (!['ADMIN', 'CONTRIBUTOR', 'SUPER_ADMIN'].includes(userData.user.role)) {
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
      const token = await getToken()
      
      const response = await fetch('/api/admin/documents', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      
      const data = await response.json()
      
      if (data.success) {
        setDocuments(data.documents)
        setError(null)
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

  // Metadata editing functions
  const handleEdit = (doc: Document) => {
    setEditingDoc({...doc})
    setError(null)
  }

  const handleSave = async () => {
    if (!editingDoc) return
    
    setSaving(true)
    setError(null)
    
    try {
      const token = await getToken()
      const response = await fetch(`/api/admin/documents/${editingDoc.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          title: editingDoc.title,
          author: editingDoc.author,
          amazon_url: editingDoc.amazon_url,
          resource_url: editingDoc.resource_url,
          download_enabled: editingDoc.download_enabled,
          contact_person: editingDoc.contact_person,
          contact_email: editingDoc.contact_email
        })
      })
      
      const data = await response.json()
      
      if (data.success) {
        setDocuments(docs => docs.map(doc => 
          doc.id === editingDoc.id ? {...doc, ...data.document} : doc
        ))
        setEditingDoc(null)
      } else {
        setError(data.error)
      }
    } catch (err) {
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
      // Add to reingesting set
      setReingestingDocs(prev => new Set(prev).add(documentId))

      const token = await getToken()
      const response = await fetch('/api/ingest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          documentId: documentId
        })
      })

      const data = await response.json()

      if (data.success) {
        addToast({
          type: 'success',
          message: `Successfully started reingest for "${documentTitle}". Created ${data.chunksCreated || 'unknown'} chunks.`
        })

        // Refresh documents and ingest jobs to show updated status
        await Promise.all([loadDocuments(), loadIngestJobs()])
      } else {
        addToast({
          type: 'error',
          message: `Failed to reingest "${documentTitle}": ${data.error || 'Unknown error'}`
        })
      }
    } catch (err) {
      addToast({
        type: 'error',
        message: `Failed to reingest "${documentTitle}": ${err instanceof Error ? err.message : 'Unknown error'}`
      })
    } finally {
      // Remove from reingesting set
      setReingestingDocs(prev => {
        const newSet = new Set(prev)
        newSet.delete(documentId)
        return newSet
      })
    }
  }

  // Web scraping functions
  const discoverWebsitePages = async () => {
    if (!websiteUrl.trim()) return
    
    setIsDiscovering(true)
    setScrapingMessage(null)
    
    let normalizedUrl = websiteUrl.trim()
    if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
      normalizedUrl = 'https://' + normalizedUrl
    }
    
    try {
      const token = await getToken()
      const response = await fetch('/api/scrape-website', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          url: normalizedUrl,
          action: 'discover'
        })
      })
      
      const data = await response.json()
      
      if (data.success) {
        setDiscoveredPages(data.links.map((url: string) => ({ url, selected: false })))
        setCurrentPage(1)
        setShowAllPages(false)
        
        const discoveryMethod = data.discoveryMethod === 'recursive_crawl' ? 'Enhanced Crawling' : 'Single Page'
        const methodDetails = data.discoveryMethod === 'recursive_crawl' 
          ? ` (depth: ${data.crawlDepth} levels)` 
          : ''
        
        const message = data.totalFound > 1 ?
          `Found ${data.totalFound} pages using ${discoveryMethod}${methodDetails}.` :
          null
          
        setScrapingMessage(message)
        setScrapingMessageType('info')
      } else {
        setScrapingMessage(data.error || 'Failed to discover pages')
        setScrapingMessageType('error')
      }
    } catch (err) {
      setScrapingMessage('Failed to discover website pages')
      setScrapingMessageType('error')
    } finally {
      setIsDiscovering(false)
    }
  }

  const scrapeSelectedPages = async () => {
    const selectedUrls = discoveredPages.filter(page => page.selected).map(page => page.url)
    
    if (selectedUrls.length === 0) {
      setScrapingMessage('Please select at least one page to scrape')
      setScrapingMessageType('error')
      return
    }
    
    setIsScrapingPages(true)
    setScrapingProgress(0)
    setScrapingMessage(null)
    
    try {
      const token = await getToken()
      const response = await fetch('/api/scrape-website', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          action: 'scrape',
          urls: selectedUrls
        })
      })
      
      const data = await response.json()
      
      if (data.success) {
        setScrapedContent(data.results.map((result: ScrapedPage) => ({
          ...result,
          selected: result.success
        })))
        setShowPreview(true)
        
        const failedCount = data.results.filter((r: ScrapedPage) => !r.success).length
        if (failedCount > 0) {
          setScrapingMessage(`Warning: ${failedCount} pages failed to scrape. Review the results below.`)
          setScrapingMessageType('error')
        }
      } else {
        setScrapingMessage(data.error || 'Failed to scrape pages')
        setScrapingMessageType('error')
      }
    } catch (err) {
      setScrapingMessage('Failed to scrape website pages')
      setScrapingMessageType('error')
    } finally {
      setIsScrapingPages(false)
      setScrapingProgress(100)
    }
  }

  const saveSelectedContent = async () => {
    const selectedContent = scrapedContent.filter(page => page.selected && page.success)
    
    if (selectedContent.length === 0) {
      setScrapingMessage('Please select at least one page to save')
      setScrapingMessageType('error')
      return
    }
    
    setUploading(true)
    setUploadProgress(0)
    setScrapingMessage(null)
    
    try {
      const token = await getToken()
      if (!token) {
        throw new Error('Authentication required')
      }

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
        
        if (result.failed > 0) {
          setScrapingMessage(
            `Processed ${result.processed} pages successfully. ${result.failed} pages failed:\n` +
            result.errors.slice(0, 3).join('\n') + 
            (result.errors.length > 3 ? `\n...and ${result.errors.length - 3} more` : '')
          )
          setScrapingMessageType('error')
        } else {
          setScrapingMessage(null)
        }
        
        setWebsiteUrl('')
        setDiscoveredPages([])
        setScrapedContent([])
        setShowPreview(false)
        
        await loadDocuments()
        await loadIngestJobs()
        
      } else {
        throw new Error(data.error || 'Batch processing failed')
      }
        
    } catch (err) {
      setScrapingMessage('Failed to save scraped content: ' + (err instanceof Error ? err.message : 'Unknown error'))
      setScrapingMessageType('error')
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
  
  const getPaginatedPages = () => {
    if (showAllPages) {
      return discoveredPages
    }
    
    const startIndex = (currentPage - 1) * pagesPerPage
    const endIndex = startIndex + pagesPerPage
    return discoveredPages.slice(startIndex, endIndex)
  }
  
  const getTotalPages = () => {
    return Math.ceil(discoveredPages.length / pagesPerPage)
  }
  
  const getGlobalIndex = (localIndex: number) => {
    if (showAllPages) {
      return localIndex
    }
    return (currentPage - 1) * pagesPerPage + localIndex
  }

  const toggleScrapedPageSelection = (index: number) => {
    setScrapedContent(prev => prev.map((page, i) =>
      i === index ? { ...page, selected: !page.selected } : page
    ))
  }

  // Helper functions for document/scraped page separation and filtering
  const getFilteredDocuments = () => {
    return documents.filter(doc => {
      // Filter uploaded documents (not web scraped)
      const isUploadedDoc = doc.source_type !== 'web_scraped'
      if (!isUploadedDoc) return false

      // Apply search filter
      if (!searchQuery.trim()) return true

      const query = searchQuery.toLowerCase()
      return (
        doc.title.toLowerCase().includes(query) ||
        (doc.author && doc.author.toLowerCase().includes(query)) ||
        (doc.mimeType && doc.mimeType.toLowerCase().includes(query))
      )
    })
  }

  const getFilteredScrapedPages = () => {
    return documents.filter(doc => {
      // Filter scraped web pages only
      const isScrapedPage = doc.source_type === 'web_scraped'
      if (!isScrapedPage) return false

      // Apply search filter
      if (!searchQuery.trim()) return true

      const query = searchQuery.toLowerCase()
      return (
        doc.title.toLowerCase().includes(query) ||
        (doc.source_url && doc.source_url.toLowerCase().includes(query))
      )
    })
  }

  const getPaginatedDocuments = () => {
    const filtered = getFilteredDocuments()
    const startIndex = (documentsCurrentPage - 1) * documentsPerPage
    const endIndex = startIndex + documentsPerPage
    return filtered.slice(startIndex, endIndex)
  }

  const getPaginatedScrapedPages = () => {
    const filtered = getFilteredScrapedPages()
    const startIndex = (scrapedPagesCurrentPage - 1) * scrapedPagesPerPage
    const endIndex = startIndex + scrapedPagesPerPage
    return filtered.slice(startIndex, endIndex)
  }

  // Pagination helper functions
  const getTotalDocumentPages = () => {
    return Math.ceil(getFilteredDocuments().length / documentsPerPage)
  }

  const getTotalScrapedPages = () => {
    return Math.ceil(getFilteredScrapedPages().length / scrapedPagesPerPage)
  }

  const handleDocumentsPageSizeChange = (newSize: number) => {
    setDocumentsPerPage(newSize)
    setDocumentsCurrentPage(1) // Reset to first page when changing page size
  }

  const handleScrapedPagesPageSizeChange = (newSize: number) => {
    setScrapedPagesPerPage(newSize)
    setScrapedPagesCurrentPage(1) // Reset to first page when changing page size
  }

  // File upload functions
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    
    if (files.length === 0) return
    
    // Check total files including existing queue
    if (uploadQueue.length + files.length > 20) {
      setError(`Maximum 20 files total. Currently have ${uploadQueue.length} files in queue.`)
      return
    }
    
    // Validate files using the enhanced validation logic from fileProcessors
    const validationResults = files.map(file => ({
      file,
      validation: validateFile(file)
    }))

    const invalidFiles = validationResults.filter(result => !result.validation.valid)
    if (invalidFiles.length > 0) {
      const errorMessages = invalidFiles.map(result =>
        `${result.file.name}: ${result.validation.error}`
      ).join('; ')
      setError(`File validation failed: ${errorMessages}`)
      return
    }
    
    const oversizedFiles = files.filter(file => file.size > 150 * 1024 * 1024)
    if (oversizedFiles.length > 0) {
      setError(`Files too large (>150MB): ${oversizedFiles.map(f => f.name).join(', ')}`)
      return
    }

    // Check for duplicates in current queue based on file name and size
    const existingQueueFiles = uploadQueue.map(item => `${item.file.name}-${item.file.size}`)
    
    // Check for duplicates against already uploaded documents in database
    const existingDocNames = documents.map(doc => doc.title)
    const fileBasenames = files.map(file => file.name.replace(/\.[^/.]+$/, ''))
    
    const queueDuplicates = files.filter(file => existingQueueFiles.includes(`${file.name}-${file.size}`))
    const dbDuplicates = files.filter(file => {
      const basename = file.name.replace(/\.[^/.]+$/, '')
      return existingDocNames.includes(basename)
    })
    
    const allDuplicates = [...queueDuplicates, ...dbDuplicates]
    const newFiles = files.filter(file => {
      const inQueue = existingQueueFiles.includes(`${file.name}-${file.size}`)
      const inDb = existingDocNames.includes(file.name.replace(/\.[^/.]+$/, ''))
      return !inQueue && !inDb
    })
    
    if (allDuplicates.length > 0) {
      const queueDupNames = queueDuplicates.map(f => f.name)
      const dbDupNames = dbDuplicates.map(f => f.name)
      
      let errorMsg = ''
      if (queueDupNames.length > 0) {
        errorMsg += `Already in queue: ${queueDupNames.join(', ')}`
      }
      if (dbDupNames.length > 0) {
        if (errorMsg) errorMsg += '. '
        errorMsg += `Already uploaded: ${dbDupNames.join(', ')}`
      }
      setError(errorMsg)
    }
    
    if (newFiles.length === 0) return
    
    setSelectedFiles(prev => [...prev, ...newFiles])
    setUploadQueue(prev => [
      ...prev,
      ...newFiles.map(file => ({
        file,
        progress: 0,
        status: 'pending' as const,
        metadata: {
          title: file.name.replace(/\.[^/.]+$/, ''),
          author: uploadAuthor,
          amazonUrl: uploadAmazonUrl,
          resourceUrl: uploadResourceUrl,
          contactPerson: uploadContactPerson,
          contactEmail: uploadContactEmail,
          downloadEnabled: uploadDownloadEnabled
        }
      }))
    ])
    if (allDuplicates.length === 0) setError(null)
    setShowMetadataEditor(true)
    
    // Set title from first file if no title set
    if (!uploadTitle && newFiles.length > 0) {
      setUploadTitle(newFiles[0].name.replace(/\.[^/.]+$/, ''))
    }

    // Clear the file input so users can re-select the same files
    const fileInput = e.target
    fileInput.value = ''
  }

  // Retry wrapper for API calls with exponential backoff
  const retryWithBackoff = async (fn: () => Promise<Response>, maxRetries = 3): Promise<Response> => {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await fn()
        if (response.status === 429 && attempt < maxRetries) {
          // Rate limited, wait with exponential backoff
          const delay = Math.min(1000 * Math.pow(2, attempt), 10000) // Max 10 seconds
          console.log(`Rate limited, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries + 1})`)
          await new Promise(resolve => setTimeout(resolve, delay))
          continue
        }
        return response
      } catch (error) {
        if (attempt === maxRetries) throw error
        // Wait before retry
        const delay = Math.min(1000 * Math.pow(2, attempt), 5000)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
    throw new Error('Max retries exceeded')
  }

  const processUploadQueue = async () => {
    if (uploadQueue.length === 0 || !userData) return

    setIsProcessingQueue(true)

    for (let i = 0; i < uploadQueue.length; i++) {
      const queueItem = uploadQueue[i]
      if (queueItem.status !== 'pending') continue

      // Update status to uploading
      setUploadQueue(prev => prev.map((item, index) =>
        index === i ? { ...item, status: 'uploading' as const } : item
      ))

      try {
        await uploadSingleFile(queueItem.file, i)

        // Mark as completed
        setUploadQueue(prev => prev.map((item, index) =>
          index === i ? { ...item, status: 'completed' as const, progress: 100 } : item
        ))

        // Show success toast for individual file
        addToast({
          type: 'success',
          title: 'Upload Complete',
          message: `"${queueItem.metadata.title}" uploaded successfully`,
          duration: 3000
        })
      } catch (error) {
        // Mark as error
        setUploadQueue(prev => prev.map((item, index) =>
          index === i ? {
            ...item,
            status: 'error' as const,
            error: error instanceof Error ? error.message : 'Upload failed'
          } : item
        ))

        // Show error toast for individual file
        const errorMessage = error instanceof Error ? error.message : 'Upload failed'
        addToast({
          type: 'error',
          title: 'Upload Failed',
          message: `"${queueItem.metadata.title}": ${errorMessage}`,
          duration: 8000
        })
      }

      // Add delay between uploads to avoid rate limiting
      if (i < uploadQueue.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000)) // 2 second delay (increased)
      }
    }

    setIsProcessingQueue(false)
    loadDocuments() // Refresh document list
    loadIngestJobs() // Refresh ingest jobs

    // Show completion summary toast
    const completedCount = uploadQueue.filter(item => item.status === 'completed').length
    const errorCount = uploadQueue.filter(item => item.status === 'error').length

    if (completedCount > 0 || errorCount > 0) {
      if (errorCount === 0) {
        addToast({
          type: 'success',
          title: 'All Uploads Complete',
          message: `Successfully uploaded ${completedCount} file${completedCount > 1 ? 's' : ''}`,
          duration: 5000
        })
      } else if (completedCount === 0) {
        addToast({
          type: 'error',
          title: 'All Uploads Failed',
          message: `${errorCount} file${errorCount > 1 ? 's' : ''} failed to upload`,
          duration: 8000
        })
      } else {
        addToast({
          type: 'warning',
          title: 'Upload Complete with Errors',
          message: `${completedCount} successful, ${errorCount} failed`,
          duration: 8000
        })
      }
    }

    // Auto-clear completed uploads after a brief delay for better UX
    setTimeout(() => {
      setUploadQueue(currentQueue => {
        const allCompleted = currentQueue.every(item => item.status === 'completed' || item.status === 'error')
        if (allCompleted) {
          setSelectedFiles([])
          setShowMetadataEditor(false)
          // Reset file input
          const fileInput = document.getElementById('file-upload') as HTMLInputElement
          if (fileInput) fileInput.value = ''
          return [] // Clear the queue
        }
        return currentQueue // Keep the current queue if not all completed
      })
    }, 3000) // 3 second delay to let users see the completion status
  }

  const uploadSingleFile = async (file: File, queueIndex: number) => {
    const token = await getToken()
    if (!token) throw new Error('Authentication required')

    const maxSupabaseSize = 50 * 1024 * 1024 // 50MB
    const useBlob = file.size > maxSupabaseSize

    if (useBlob) {
      // Use Vercel Blob for large files
      console.log(`Using Vercel Blob for large file: ${file.name} (${file.size} bytes)`)
      
      // Create FormData for blob upload with metadata
      const formData = new FormData()
      formData.append('file', file)
      formData.append('title', uploadQueue[queueIndex].metadata.title.trim() || file.name)
      formData.append('author', uploadQueue[queueIndex].metadata.author.trim() || '')
      formData.append('amazon_url', uploadQueue[queueIndex].metadata.amazonUrl.trim() || '')
      formData.append('resource_url', uploadQueue[queueIndex].metadata.resourceUrl.trim() || '')
      formData.append('download_enabled', uploadQueue[queueIndex].metadata.downloadEnabled.toString())
      formData.append('contact_person', uploadQueue[queueIndex].metadata.contactPerson.trim() || '')
      formData.append('contact_email', uploadQueue[queueIndex].metadata.contactEmail.trim() || '')

      // Upload to Vercel Blob and process in one call with retry logic
      const blobResponse = await retryWithBackoff(() => fetch('/api/upload/blob', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      }))

      const blobData = await blobResponse.json()
      if (!blobData.success) {
        throw new Error(blobData.error || 'Upload and processing failed')
      }

    } else {
      // Use Supabase for smaller files (existing logic)
      console.log(`Using Supabase for regular file: ${file.name} (${file.size} bytes)`)

      // Get presigned URL with retry logic
      const presignedResponse = await retryWithBackoff(() => fetch('/api/upload/presigned', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type
        })
      }))

      const presignedData = await presignedResponse.json()
      if (!presignedData.success) {
        throw new Error(presignedData.error || 'Failed to get upload URL')
      }

      // Update progress
      setUploadQueue(prev => prev.map((item, index) => 
        index === queueIndex ? { ...item, progress: 20 } : item
      ))

      // Upload to Supabase
      const uploadResponse = await fetch(presignedData.uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type }
      })

      if (!uploadResponse.ok) {
        throw new Error(`Upload failed: ${uploadResponse.statusText}`)
      }

      // Update progress
      setUploadQueue(prev => prev.map((item, index) => 
        index === queueIndex ? { ...item, progress: 60 } : item
      ))

      // Process the file with retry logic
      const processResponse = await retryWithBackoff(() => fetch('/api/upload/process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          storagePath: presignedData.storagePath,
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
          title: uploadQueue[queueIndex].metadata.title.trim() || file.name,
          author: uploadQueue[queueIndex].metadata.author.trim() || null,
          amazon_url: uploadQueue[queueIndex].metadata.amazonUrl.trim() || null,
          resource_url: uploadQueue[queueIndex].metadata.resourceUrl.trim() || null,
          download_enabled: uploadQueue[queueIndex].metadata.downloadEnabled,
          contact_person: uploadQueue[queueIndex].metadata.contactPerson.trim() || null,
          contact_email: uploadQueue[queueIndex].metadata.contactEmail.trim() || null
        })
      }))

      const processData = await processResponse.json()
      if (!processData.success) {
        throw new Error(processData.error || 'Processing failed')
      }
    }

    // Final progress update
    setUploadQueue(prev => prev.map((item, index) => 
      index === queueIndex ? { ...item, progress: 100 } : item
    ))
  }

  const updateQueueItemMetadata = (index: number, field: string, value: string | boolean) => {
    setUploadQueue(prev => prev.map((item, i) => 
      i === index ? {
        ...item,
        metadata: { ...item.metadata, [field]: value }
      } : item
    ))
  }

  const applySharedMetadata = () => {
    if (!useSharedMetadata) return
    
    setUploadQueue(prev => prev.map(item => ({
      ...item,
      metadata: {
        ...item.metadata,
        author: uploadAuthor,
        amazonUrl: uploadAmazonUrl,
        contactPerson: uploadContactPerson,
        contactEmail: uploadContactEmail,
        downloadEnabled: uploadDownloadEnabled
      }
    })))
  }

  const handleUpload = async () => {
    if (!selectedFiles.length || !userData) return

    await processUploadQueue()
  }

  const deleteDocument = async (documentId: string) => {
    if (!confirm('Are you sure you want to delete this document?')) return
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

  const formatFileSize = (bytes: number | null | undefined) => {
    if (!bytes || isNaN(bytes)) return 'Unknown size'
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    if (bytes === 0) return '0 Bytes'
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i]
  }

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return 'Unknown date'
    const date = new Date(dateString)
    if (isNaN(date.getTime())) return 'Invalid date'
    return date.toLocaleDateString('en-US', {
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
        return { bg: '#f0fdf4', color: '#16a34a', text: '#16a34a', dot: '#16a34a' }
      case 'processing':
        return { bg: '#fef3c7', color: '#d97706', text: '#d97706', dot: '#d97706' }
      case 'failed':
        return { bg: '#fef2f2', color: '#dc2626', text: '#dc2626', dot: '#dc2626' }
      default:
        return { bg: '#f3f4f6', color: '#6b7280', text: '#6b7280', dot: '#6b7280' }
    }
  }

  if (!isLoaded || !userId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-200 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white text-2xl font-bold mb-4 mx-auto animate-pulse shadow-2xl">
            H.E
          </div>
          <div className="text-slate-600 text-lg font-medium">
            Loading admin panel...
          </div>
        </div>
      </div>
    )
  }

  if (accessDenied) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-200 flex items-center justify-center p-8">
        <Card className="w-full max-w-md text-center shadow-2xl">
          <CardContent className="pt-8">
            <div className="text-5xl mb-4 text-red-600">🚫</div>
            <CardTitle className="text-2xl text-red-600 mb-4">Access Denied</CardTitle>
            <CardDescription className="text-base mb-6 max-w-sm mx-auto">
              {error}
            </CardDescription>
            <Button
              onClick={() => router.push('/')}
              className="w-full"
            >
              Go to Chat
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (loading) {
    return (
      <div>
        <AdminNavbar userRole={userData?.role} />
        <div className="flex justify-center items-center min-h-[calc(100vh-80px)] bg-gradient-to-br from-slate-50 to-slate-200">
          <LoadingSpinner size="lg" text="Loading..." />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-200">
      <AdminNavbar userRole={userData?.role} />

      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <Card className="mb-8 bg-white/80 backdrop-blur-xl border-slate-200/40 shadow-xl">
          <CardHeader>
            <CardTitle className="text-3xl text-slate-800">
              Content Management
            </CardTitle>
            <CardDescription className="text-base">
              Upload documents, scrape websites, and manage document metadata
            </CardDescription>
          </CardHeader>
        </Card>

        {error && (
          <Alert variant="error" className="mb-6">
            {error}
          </Alert>
        )}

        {/* File Upload Section */}
        {userData && ['ADMIN', 'CONTRIBUTOR', 'SUPER_ADMIN'].includes(userData.role) && (
          <Card className="mb-8 bg-white/80 backdrop-blur-xl border-slate-200/40 shadow-xl">
            <CardHeader>
              <CardTitle className="text-xl text-slate-800">
                Upload Document
              </CardTitle>
            </CardHeader>
            <CardContent>
            
            <div style={{ display: 'grid', gap: '16px' }}>
              {/* File Selection */}
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>
                  Select Files - Max 20 files, 150MB each
                  <br />
                  <span style={{ fontSize: '12px', color: '#64748b', fontWeight: '400' }}>
                    Documents: PDF, TXT, MD, DOCX, PPT, PPTX • Images: JPG, PNG, GIF, WebP, BMP, TIFF, SVG • Audio: MP3, WAV, FLAC, OGG, M4A, AAC, WMA • Video: MP4, AVI, MOV, WMV, WebM, FLV, MKV, 3GP
                  </span>
                </label>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'stretch' }}>
                  <input
                    id="file-upload"
                    type="file"
                    accept=".pdf,.txt,.md,.docx,.ppt,.pptx,.epub,.jpg,.jpeg,.png,.gif,.webp,.bmp,.tiff,.svg,.mp3,.wav,.flac,.ogg,.m4a,.aac,.wma,.mp4,.mov,.avi,.wmv,.webm,.flv,.mkv,.3gp"
                    multiple
                    onChange={handleFileSelect}
                    disabled={uploading || isProcessingQueue}
                    style={{
                      flex: 1,
                      padding: '12px',
                      border: '1px solid rgba(203, 213, 225, 0.6)',
                      borderRadius: '12px',
                      fontSize: '14px',
                      background: 'rgba(255, 255, 255, 0.8)'
                    }}
                  />
                  {uploadQueue.length > 0 && !isProcessingQueue && (
                    <button
                      onClick={() => {
                        const addFileInput = document.getElementById('add-more-files') as HTMLInputElement
                        addFileInput?.click()
                      }}
                      disabled={uploading || uploadQueue.length >= 20}
                      style={{
                        background: uploadQueue.length >= 20 ? '#cbd5e1' : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                        color: uploadQueue.length >= 20 ? '#64748b' : 'white',
                        padding: '12px 16px',
                        border: 'none',
                        borderRadius: '12px',
                        fontSize: '14px',
                        fontWeight: '500',
                        cursor: uploadQueue.length >= 20 ? 'not-allowed' : 'pointer',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      Add More
                    </button>
                  )}
                </div>
                
                {/* Hidden file input for adding more files */}
                <input
                  id="add-more-files"
                  type="file"
                  accept=".pdf,.txt,.md,.docx,.ppt,.pptx,.jpg,.jpeg,.png,.gif,.webp,.bmp,.tiff,.svg,.mp3,.wav,.flac,.ogg,.m4a,.aac,.wma,.mp4,.mov,.avi,.wmv,.webm,.flv,.mkv,.3gp"
                  multiple
                  onChange={handleFileSelect}
                  disabled={uploading || isProcessingQueue}
                  style={{ display: 'none' }}
                />
              </div>

              {/* Basic Document Info */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <Input
                    label="Title (Optional)"
                    value={uploadTitle}
                    onChange={(e) => setUploadTitle(e.target.value)}
                    disabled={uploading}
                    placeholder="Document title..."
                  />
                </div>
                
                <div>
                  <Input
                    label="Author (Optional)"
                    value={uploadAuthor}
                    onChange={(e) => setUploadAuthor(e.target.value)}
                    disabled={uploading}
                    placeholder="Author name..."
                  />
                </div>
              </div>

              {/* Resource Links Section */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>
                    Amazon/Bookstore URL (Optional)
                  </label>
                  <input
                    type="url"
                    value={uploadAmazonUrl}
                    onChange={(e) => setUploadAmazonUrl(e.target.value)}
                    disabled={uploading}
                    placeholder="https://amazon.com/..."
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '1px solid rgba(203, 213, 225, 0.6)',
                      borderRadius: '12px',
                      fontSize: '14px',
                      background: 'rgba(255, 255, 255, 0.8)'
                    }}
                  />
                </div>
                
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>
                    Resource URL (Optional)
                  </label>
                  <input
                    type="url"
                    value={uploadResourceUrl}
                    onChange={(e) => setUploadResourceUrl(e.target.value)}
                    disabled={uploading}
                    placeholder="https://github.com/... or download link"
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '1px solid rgba(203, 213, 225, 0.6)',
                      borderRadius: '12px',
                      fontSize: '14px',
                      background: 'rgba(255, 255, 255, 0.8)'
                    }}
                  />
                </div>
              </div>

              {/* Contact Information Section */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <Input
                    label="Contact Person (Optional)"
                    value={uploadContactPerson}
                    onChange={(e) => setUploadContactPerson(e.target.value)}
                    disabled={uploading}
                    placeholder="John Doe"
                  />
                </div>
                
                <div>
                  <Input
                    label="Contact Email (Optional)"
                    type="email"
                    value={uploadContactEmail}
                    onChange={(e) => setUploadContactEmail(e.target.value)}
                    disabled={uploading}
                    placeholder="contact@example.com"
                  />
                </div>
              </div>

              {/* Download Enabled Checkbox */}
              <div>
                <Checkbox
                  checked={uploadDownloadEnabled}
                  onCheckedChange={setUploadDownloadEnabled}
                  disabled={uploading}
                  label="Enable resource access for users"
                />
              </div>

              {/* Shared Metadata Settings */}
              {uploadQueue.length > 0 && (
                <div style={{
                  padding: '16px',
                  background: 'rgba(130, 179, 219, 0.1)',
                  borderRadius: '12px',
                  marginBottom: '16px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                    <h4 style={{ margin: '0', fontSize: '16px', fontWeight: '600' }}>
                      Upload Queue ({uploadQueue.length} files)
                    </h4>
                    <Checkbox
                      checked={useSharedMetadata}
                      onCheckedChange={(checked) => {
                        setUseSharedMetadata(checked)
                        if (checked) {
                          applySharedMetadata()
                        }
                      }}
                      label="Use shared metadata for all files"
                      size="sm"
                    />
                  </div>

                  {/* Shared metadata controls */}
                  {useSharedMetadata && (
                    <div style={{ 
                      padding: '16px', 
                      background: 'rgba(255, 255, 255, 0.6)', 
                      borderRadius: '8px', 
                      marginBottom: '16px',
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                      gap: '12px'
                    }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '6px' }}>
                          Author (applies to all)
                        </label>
                        <input
                          type="text"
                          value={uploadAuthor}
                          onChange={(e) => {
                            setUploadAuthor(e.target.value)
                            applySharedMetadata()
                          }}
                          placeholder="Author name..."
                          style={{
                            width: '100%',
                            padding: '8px',
                            border: '1px solid #cbd5e1',
                            borderRadius: '6px',
                            fontSize: '13px'
                          }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '6px' }}>
                          Contact Person (applies to all)
                        </label>
                        <input
                          type="text"
                          value={uploadContactPerson}
                          onChange={(e) => {
                            setUploadContactPerson(e.target.value)
                            applySharedMetadata()
                          }}
                          placeholder="Contact person..."
                          style={{
                            width: '100%',
                            padding: '8px',
                            border: '1px solid #cbd5e1',
                            borderRadius: '6px',
                            fontSize: '13px'
                          }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '6px' }}>
                          Contact Email (applies to all)
                        </label>
                        <input
                          type="email"
                          value={uploadContactEmail}
                          onChange={(e) => {
                            setUploadContactEmail(e.target.value)
                            applySharedMetadata()
                          }}
                          placeholder="contact@example.com"
                          style={{
                            width: '100%',
                            padding: '8px',
                            border: '1px solid #cbd5e1',
                            borderRadius: '6px',
                            fontSize: '13px'
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Individual file metadata */}
                  <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                    {uploadQueue.map((item, index) => (
                      <div key={index} style={{
                        padding: '16px',
                        background: 'rgba(255, 255, 255, 0.8)',
                        borderRadius: '8px',
                        marginBottom: '12px',
                        border: '1px solid rgba(0,0,0,0.1)'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                          <div>
                            <div style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b' }}>
                              {item.file.name}
                            </div>
                            <div style={{ fontSize: '12px', color: '#64748b' }}>
                              {formatFileSize(item.file.size)} • {item.file.type}
                            </div>
                          </div>
                          <div style={{ minWidth: '100px', textAlign: 'right' }}>
                            {item.status === 'pending' && (
                              <span style={{ fontSize: '12px', color: '#64748b' }}>Ready to upload</span>
                            )}
                            {item.status === 'uploading' && (
                              <div style={{ fontSize: '12px', color: 'rgb(130, 179, 219)' }}>
                                Uploading {item.progress}%
                              </div>
                            )}
                            {item.status === 'completed' && (
                              <span style={{ fontSize: '12px', color: '#10b981' }}>✓ Completed</span>
                            )}
                            {item.status === 'error' && (
                              <span style={{ fontSize: '12px', color: '#ef4444' }} title={item.error}>
                                ✗ Error
                              </span>
                            )}
                          </div>
                        </div>
                        
                        {/* Individual metadata controls */}
                        <div style={{ 
                          display: 'grid', 
                          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
                          gap: '12px' 
                        }}>
                          <div>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', marginBottom: '4px' }}>
                              Title
                            </label>
                            <input
                              type="text"
                              value={item.metadata.title}
                              onChange={(e) => updateQueueItemMetadata(index, 'title', e.target.value)}
                              disabled={item.status === 'uploading' || item.status === 'completed'}
                              style={{
                                width: '100%',
                                padding: '6px',
                                border: '1px solid #cbd5e1',
                                borderRadius: '4px',
                                fontSize: '12px',
                                background: item.status === 'uploading' || item.status === 'completed' ? '#f8f9fa' : 'white'
                              }}
                            />
                          </div>
                          <div>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', marginBottom: '4px' }}>
                              Amazon/Download URL
                            </label>
                            <input
                              type="url"
                              value={item.metadata.amazonUrl}
                              onChange={(e) => updateQueueItemMetadata(index, 'amazonUrl', e.target.value)}
                              disabled={item.status === 'uploading' || item.status === 'completed'}
                              placeholder="https://amazon.com/..."
                              style={{
                                width: '100%',
                                padding: '6px',
                                border: '1px solid #cbd5e1',
                                borderRadius: '4px',
                                fontSize: '12px',
                                background: item.status === 'uploading' || item.status === 'completed' ? '#f8f9fa' : 'white'
                              }}
                            />
                          </div>
                          <div>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', marginBottom: '4px' }}>
                              Resource URL
                            </label>
                            <input
                              type="url"
                              value={item.metadata.resourceUrl}
                              onChange={(e) => updateQueueItemMetadata(index, 'resourceUrl', e.target.value)}
                              disabled={item.status === 'uploading' || item.status === 'completed'}
                              placeholder="https://github.com/..."
                              style={{
                                width: '100%',
                                padding: '6px',
                                border: '1px solid #cbd5e1',
                                borderRadius: '4px',
                                fontSize: '12px',
                                background: item.status === 'uploading' || item.status === 'completed' ? '#f8f9fa' : 'white'
                              }}
                            />
                          </div>
                          {!useSharedMetadata && (
                            <>
                              <div>
                                <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', marginBottom: '4px' }}>
                                  Author
                                </label>
                                <input
                                  type="text"
                                  value={item.metadata.author}
                                  onChange={(e) => updateQueueItemMetadata(index, 'author', e.target.value)}
                                  disabled={item.status === 'uploading' || item.status === 'completed'}
                                  placeholder="Author name..."
                                  style={{
                                    width: '100%',
                                    padding: '6px',
                                    border: '1px solid #cbd5e1',
                                    borderRadius: '4px',
                                    fontSize: '12px',
                                    background: item.status === 'uploading' || item.status === 'completed' ? '#f8f9fa' : 'white'
                                  }}
                                />
                              </div>
                              <div>
                                <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', marginBottom: '4px' }}>
                                  Contact Person
                                </label>
                                <input
                                  type="text"
                                  value={item.metadata.contactPerson}
                                  onChange={(e) => updateQueueItemMetadata(index, 'contactPerson', e.target.value)}
                                  disabled={item.status === 'uploading' || item.status === 'completed'}
                                  placeholder="Contact person..."
                                  style={{
                                    width: '100%',
                                    padding: '6px',
                                    border: '1px solid #cbd5e1',
                                    borderRadius: '4px',
                                    fontSize: '12px',
                                    background: item.status === 'uploading' || item.status === 'completed' ? '#f8f9fa' : 'white'
                                  }}
                                />
                              </div>
                              <div>
                                <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', marginBottom: '4px' }}>
                                  Contact Email
                                </label>
                                <input
                                  type="email"
                                  value={item.metadata.contactEmail}
                                  onChange={(e) => updateQueueItemMetadata(index, 'contactEmail', e.target.value)}
                                  disabled={item.status === 'uploading' || item.status === 'completed'}
                                  placeholder="contact@example.com"
                                  style={{
                                    width: '100%',
                                    padding: '6px',
                                    border: '1px solid #cbd5e1',
                                    borderRadius: '4px',
                                    fontSize: '12px',
                                    background: item.status === 'uploading' || item.status === 'completed' ? '#f8f9fa' : 'white'
                                  }}
                                />
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Global Progress Bar */}
                  {isProcessingQueue && (
                    <div style={{
                      marginTop: '16px',
                      padding: '12px',
                      background: 'rgba(82, 179, 82, 0.1)',
                      borderRadius: '8px',
                      border: '1px solid rgba(82, 179, 82, 0.2)'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '14px', fontWeight: '500', color: '#059669' }}>
                          Overall Progress
                        </span>
                        <span style={{ fontSize: '12px', color: '#6b7280' }}>
                          {uploadQueue.filter(item => item.status === 'completed').length} / {uploadQueue.length} completed
                        </span>
                      </div>
                      <div style={{
                        width: '100%',
                        height: '8px',
                        background: '#e5e7eb',
                        borderRadius: '4px',
                        overflow: 'hidden'
                      }}>
                        <div style={{
                          width: `${uploadQueue.length > 0 ? (uploadQueue.filter(item => item.status === 'completed').length / uploadQueue.length) * 100 : 0}%`,
                          height: '100%',
                          background: 'linear-gradient(90deg, #10b981 0%, #059669 100%)',
                          transition: 'width 0.3s ease'
                        }} />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Upload Actions */}
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <button
                  onClick={handleUpload}
                  disabled={uploadQueue.length === 0 || isProcessingQueue || uploadQueue.every(item => item.status !== 'pending')}
                  style={{
                    background: uploadQueue.length === 0 || isProcessingQueue || uploadQueue.every(item => item.status !== 'pending') ? '#cbd5e1' : 'linear-gradient(135deg, rgb(130, 179, 219) 0%, rgb(90, 155, 212) 100%)',
                    color: uploadQueue.length === 0 || isProcessingQueue || uploadQueue.every(item => item.status !== 'pending') ? '#64748b' : 'white',
                    padding: '12px 24px',
                    border: 'none',
                    borderRadius: '12px',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: uploadQueue.length === 0 || isProcessingQueue || uploadQueue.every(item => item.status !== 'pending') ? 'not-allowed' : 'pointer'
                  }}
                >
                  {isProcessingQueue ? 'Processing...' : 
                   uploadQueue.every(item => item.status === 'completed') && uploadQueue.length > 0 ? '✅ All Uploads Complete' :
                   uploadQueue.some(item => item.status === 'error') && uploadQueue.every(item => item.status !== 'pending') ? '⚠️ Upload Issues' :
                   `Upload ${uploadQueue.filter(item => item.status === 'pending').length} Files`}
                </button>
                
                {uploadQueue.length > 0 && !isProcessingQueue && (
                  <button
                    onClick={() => {
                      setUploadQueue([])
                      setSelectedFiles([])
                      setShowMetadataEditor(false)
                      const fileInput = document.getElementById('file-upload') as HTMLInputElement
                      if (fileInput) fileInput.value = ''
                    }}
                    style={{
                      background: 'transparent',
                      color: '#64748b',
                      padding: '12px 16px',
                      border: '1px solid #cbd5e1',
                      borderRadius: '12px',
                      fontSize: '14px',
                      cursor: 'pointer'
                    }}
                  >
                    Clear Queue
                  </button>
                )}
              </div>
            </div>
            </CardContent>
          </Card>
        )}

        {/* Scraping Messages */}
        {scrapingMessage && (
          <div style={{
            marginBottom: '24px',
            padding: '16px',
            background: scrapingMessageType === 'error' ? 'rgba(254, 242, 242, 0.8)' : 'rgba(240, 249, 255, 0.8)',
            backdropFilter: 'blur(12px)',
            border: `1px solid ${scrapingMessageType === 'error' ? '#fecaca' : '#bfdbfe'}`,
            color: scrapingMessageType === 'error' ? '#dc2626' : '#1d4ed8',
            borderRadius: '12px'
          }}>
            {scrapingMessage}
          </div>
        )}

        {/* Web Scraping Section */}
        {userData && ['ADMIN', 'CONTRIBUTOR', 'SUPER_ADMIN'].includes(userData.role) && (
          <div style={{
            marginBottom: '32px',
            background: 'rgba(255, 255, 255, 0.8)',
            backdropFilter: 'blur(12px)',
            borderRadius: '20px',
            padding: '24px',
            border: '1px solid rgba(226, 232, 240, 0.4)',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)'
          }}>
            <h2 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '16px', color: '#1e293b' }}>
              Scrape Website
            </h2>
            <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '16px' }}>
              Enter a website URL to discover and scrape all pages within the same domain. The scraper uses enhanced discovery with:
            </p>
            <ul style={{ fontSize: '14px', color: '#64748b', marginBottom: '16px', paddingLeft: '20px' }}>
              <li>• Sitemap.xml parsing for comprehensive page discovery</li>
              <li>• Recursive crawling up to 3 levels deep to find nested pages</li>
              <li>• Smart filtering to exclude non-content pages and file downloads</li>
              <li>• Subdomain support for blog.example.com, www.example.com, etc.</li>
            </ul>
            
            <div style={{ display: 'grid', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>
                  Website URL
                </label>
                <input
                  type="url"
                  value={websiteUrl}
                  onChange={(e) => {
                    setWebsiteUrl(e.target.value)
                    if (discoveredPages.length > 0) {
                      setDiscoveredPages([])
                      setScrapedContent([])
                      setShowPreview(false)
                      setScrapingMessage(null)
                      setCurrentPage(1)
                      setShowAllPages(false)
                    }
                  }}
                  disabled={isDiscovering || isScrapingPages || uploading}
                  placeholder="example.com (https:// will be added automatically)"
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid rgba(203, 213, 225, 0.6)',
                    borderRadius: '12px',
                    fontSize: '14px',
                    background: 'rgba(255, 255, 255, 0.8)'
                  }}
                />
              </div>

              <button
                onClick={discoverWebsitePages}
                disabled={!websiteUrl.trim() || isDiscovering || isScrapingPages || uploading}
                style={{
                  background: !websiteUrl.trim() || isDiscovering || isScrapingPages || uploading ? '#cbd5e1' : 'linear-gradient(135deg, rgb(158, 205, 85) 0%, rgb(132, 204, 22) 100%)',
                  color: !websiteUrl.trim() || isDiscovering || isScrapingPages || uploading ? '#64748b' : 'white',
                  padding: '12px 24px',
                  border: 'none',
                  borderRadius: '12px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: !websiteUrl.trim() || isDiscovering || isScrapingPages || uploading ? 'not-allowed' : 'pointer',
                  width: 'fit-content'
                }}
              >
                {isDiscovering ? '🔍 Discovering Pages... (up to 5 minutes)' : 'Discover Pages'}
              </button>
              
              {isDiscovering && (
                <div style={{
                  marginTop: '16px',
                  padding: '16px',
                  background: 'rgba(240, 249, 255, 0.8)',
                  border: '1px solid #dbeafe',
                  borderRadius: '12px',
                  fontSize: '14px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                    <div style={{
                      width: '16px',
                      height: '16px',
                      border: '2px solid #3b82f6',
                      borderTopColor: 'transparent',
                      borderRadius: '50%',
                      animation: 'spin 1s linear infinite',
                      marginRight: '8px'
                    }}></div>
                    <span style={{ fontWeight: '500', color: '#1d4ed8' }}>Deep crawling website...</span>
                  </div>
                  <div style={{ color: '#64748b', fontSize: '12px' }}>
                    • Crawling 3 levels deep to find all pages<br/>
                    • Processing pages in parallel batches of 5<br/>
                    • No page limit - discovering as many as possible<br/>
                    • Check browser console for real-time progress
                  </div>
                </div>
              )}

              {discoveredPages.length > 0 && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <p style={{ fontSize: '14px', fontWeight: '500' }}>
                      Select pages to scrape ({discoveredPages.filter(p => p.selected).length} of {discoveredPages.length} selected)
                    </p>
                    
                    {!showAllPages && discoveredPages.length > pagesPerPage && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
                        <span>Page {currentPage} of {getTotalPages()}</span>
                        <button
                          onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                          disabled={currentPage === 1}
                          style={{
                            padding: '4px 8px',
                            backgroundColor: currentPage === 1 ? '#e5e7eb' : 'rgb(130, 179, 219)',
                            color: currentPage === 1 ? '#9ca3af' : 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                            fontSize: '12px'
                          }}
                        >
                          ←
                        </button>
                        <button
                          onClick={() => setCurrentPage(Math.min(getTotalPages(), currentPage + 1))}
                          disabled={currentPage === getTotalPages()}
                          style={{
                            padding: '4px 8px',
                            backgroundColor: currentPage === getTotalPages() ? '#e5e7eb' : 'rgb(130, 179, 219)',
                            color: currentPage === getTotalPages() ? '#9ca3af' : 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: currentPage === getTotalPages() ? 'not-allowed' : 'pointer',
                            fontSize: '12px'
                          }}
                        >
                          →
                        </button>
                      </div>
                    )}
                  </div>
                  
                  <div style={{
                    maxHeight: showAllPages ? '500px' : '300px',
                    overflowY: 'auto',
                    padding: '16px',
                    background: 'rgba(248, 250, 252, 0.8)',
                    borderRadius: '12px',
                    border: '1px solid rgba(226, 232, 240, 0.4)'
                  }}>
                    {getPaginatedPages().map((page, index) => {
                      const globalIndex = getGlobalIndex(index)
                      return (
                        <div key={globalIndex} style={{
                          display: 'flex',
                          alignItems: 'center',
                          marginBottom: '8px',
                          padding: '8px',
                          backgroundColor: 'white',
                          borderRadius: '8px',
                          border: page.selected ? '2px solid rgb(130, 179, 219)' : '1px solid #e5e7eb'
                        }}>
                          <input
                            type="checkbox"
                            checked={page.selected}
                            onChange={() => togglePageSelection(globalIndex)}
                            style={{
                              marginRight: '12px',
                              width: '16px',
                              height: '16px',
                              cursor: 'pointer'
                            }}
                          />
                          <span style={{
                            fontSize: '14px',
                            color: '#374151',
                            wordBreak: 'break-all',
                            flex: 1
                          }}>
                            {page.url}
                          </span>
                          <span style={{
                            fontSize: '12px',
                            color: '#64748b',
                            marginLeft: '8px'
                          }}>
                            #{globalIndex + 1}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                  
                  <div style={{ marginTop: '16px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    <button
                      onClick={() => setDiscoveredPages(prev => prev.map(p => ({ ...p, selected: true })))}
                      disabled={isScrapingPages || uploading}
                      style={{
                        background: 'linear-gradient(135deg, rgb(158, 205, 85) 0%, rgb(132, 204, 22) 100%)',
                        color: 'white',
                        padding: '8px 16px',
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '12px',
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
                        backgroundColor: '#64748b',
                        color: 'white',
                        padding: '8px 16px',
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: '500',
                        cursor: isScrapingPages || uploading ? 'not-allowed' : 'pointer'
                      }}
                    >
                      Deselect All
                    </button>
                    
                    {discoveredPages.length > pagesPerPage && (
                      <button
                        onClick={() => setShowAllPages(!showAllPages)}
                        disabled={isScrapingPages || uploading}
                        style={{
                          backgroundColor: showAllPages ? '#dc2626' : 'rgb(130, 179, 219)',
                          color: 'white',
                          padding: '8px 16px',
                          border: 'none',
                          borderRadius: '8px',
                          fontSize: '12px',
                          fontWeight: '500',
                          cursor: isScrapingPages || uploading ? 'not-allowed' : 'pointer'
                        }}
                      >
                        {showAllPages ? `Show Pages (20 per page)` : `Show All ${discoveredPages.length} Pages`}
                      </button>
                    )}
                    
                    <button
                      onClick={scrapeSelectedPages}
                      disabled={isScrapingPages || uploading || discoveredPages.filter(p => p.selected).length === 0}
                      style={{
                        background: isScrapingPages || uploading || discoveredPages.filter(p => p.selected).length === 0 ? '#9ca3af' : 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                        color: 'white',
                        padding: '8px 16px',
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '12px',
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
            marginBottom: '32px',
            background: 'rgba(255, 255, 255, 0.8)',
            backdropFilter: 'blur(12px)',
            borderRadius: '20px',
            padding: '24px',
            border: '1px solid rgba(226, 232, 240, 0.4)',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)'
          }}>
            <h2 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '16px', color: '#1e293b' }}>
              Review Scraped Content ({scrapedContent.filter(p => p.selected).length} selected)
            </h2>
            
            <div style={{ maxHeight: '400px', overflowY: 'auto', marginBottom: '16px' }}>
              {scrapedContent.map((page, index) => (
                <div key={index} style={{
                  padding: '16px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '12px',
                  marginBottom: '8px',
                  backgroundColor: page.success ? '#f9fafb' : '#fef2f2'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                    {page.success && (
                      <input
                        type="checkbox"
                        checked={page.selected || false}
                        onChange={() => toggleScrapedPageSelection(index)}
                        style={{ marginRight: '8px' }}
                      />
                    )}
                    <span style={{
                      fontSize: '14px',
                      fontWeight: '500',
                      color: page.success ? '#111827' : '#dc2626'
                    }}>
                      {page.title || page.url}
                    </span>
                  </div>
                  
                  {page.success ? (
                    <div style={{ fontSize: '12px', color: '#64748b' }}>
                      {page.content?.slice(0, 200)}...
                    </div>
                  ) : (
                    <div style={{ fontSize: '12px', color: '#dc2626' }}>
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
                background: uploading || scrapedContent.filter(p => p.selected).length === 0 ? '#9ca3af' : 'linear-gradient(135deg, rgb(130, 179, 219) 0%, rgb(90, 155, 212) 100%)',
                color: 'white',
                padding: '12px 24px',
                border: 'none',
                borderRadius: '12px',
                fontSize: '14px',
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
          <div style={{ marginBottom: '32px' }}>
            <div style={{
              width: '100%',
              backgroundColor: '#e5e7eb',
              borderRadius: '4px',
              height: '8px'
            }}>
              <div style={{
                width: `${uploadProgress || scrapingProgress}%`,
                backgroundColor: 'rgb(130, 179, 219)',
                height: '100%',
                borderRadius: '4px',
                transition: 'width 0.3s ease'
              }} />
            </div>
            <p style={{ fontSize: '14px', color: '#64748b', marginTop: '4px' }}>
              {isScrapingPages ? 'Scraping website content...' : 
               uploadProgress < 20 ? 'Getting upload URL...' : 
               uploadProgress < 60 ? 'Uploading file...' : 'Processing...'}
            </p>
          </div>
        )}

        {/* Search Bar */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.8)',
          backdropFilter: 'blur(12px)',
          borderRadius: '20px',
          border: '1px solid rgba(226, 232, 240, 0.4)',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
          padding: '20px',
          marginBottom: '20px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ fontSize: '16px', fontWeight: '500', color: '#1e293b' }}>Search:</div>
            <input
              type="text"
              placeholder="Search documents and scraped pages by title, author, or URL..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid rgba(226, 232, 240, 0.6)',
                fontSize: '14px',
                backgroundColor: 'white'
              }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: '#ef4444',
                  color: 'white',
                  fontSize: '12px',
                  fontWeight: '500',
                  cursor: 'pointer'
                }}
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Uploaded Documents */}
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b', marginBottom: '4px' }}>Uploaded Documents</h2>
                <div style={{ fontSize: '14px', color: '#64748b' }}>
                  {getFilteredDocuments().length} document{getFilteredDocuments().length !== 1 ? 's' : ''}
                  {searchQuery && ` matching "${searchQuery}"`}
                  {getFilteredDocuments().length > 0 && (
                    <span>
                      {' • '}
                      Page {documentsCurrentPage} of {getTotalDocumentPages()}
                      ({getPaginatedDocuments().length} showing)
                    </span>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {/* Page Size Selector */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ fontSize: '12px', color: '#64748b' }}>Show:</span>
                  {[20, 50, 100].map(size => (
                    <button
                      key={size}
                      onClick={() => handleDocumentsPageSizeChange(size)}
                      style={{
                        fontSize: '12px',
                        fontWeight: '500',
                        color: documentsPerPage === size ? 'white' : '#64748b',
                        backgroundColor: documentsPerPage === size ? 'rgb(130, 179, 219)' : 'transparent',
                        border: '1px solid rgba(226, 232, 240, 0.6)',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                      onMouseEnter={(e) => {
                        if (documentsPerPage !== size) {
                          e.currentTarget.style.backgroundColor = 'rgba(130, 179, 219, 0.1)'
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (documentsPerPage !== size) {
                          e.currentTarget.style.backgroundColor = 'transparent'
                        }
                      }}
                    >
                      {size}
                    </button>
                  ))}
                  <button
                    onClick={() => handleDocumentsPageSizeChange(getFilteredDocuments().length || 1)}
                    style={{
                      fontSize: '12px',
                      fontWeight: '500',
                      color: documentsPerPage >= getFilteredDocuments().length ? 'white' : '#64748b',
                      backgroundColor: documentsPerPage >= getFilteredDocuments().length ? 'rgb(130, 179, 219)' : 'transparent',
                      border: '1px solid rgba(226, 232, 240, 0.6)',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      if (documentsPerPage < getFilteredDocuments().length) {
                        e.currentTarget.style.backgroundColor = 'rgba(130, 179, 219, 0.1)'
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (documentsPerPage < getFilteredDocuments().length) {
                        e.currentTarget.style.backgroundColor = 'transparent'
                      }
                    }}
                  >
                    All
                  </button>
                </div>
                {userData?.role === 'SUPER_ADMIN' && (
                  <span style={{
                    fontSize: '12px',
                    fontWeight: '500',
                    color: 'rgb(158, 205, 85)',
                    padding: '4px 12px',
                    backgroundColor: '#d1fae5',
                    borderRadius: '16px'
                  }}>SUPER ADMIN - Viewing all documents</span>
                )}
              </div>
            </div>
          </div>

          {getPaginatedDocuments().length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>
              {searchQuery ? `No uploaded documents match "${searchQuery}"` : 'No uploaded documents found'}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', tableLayout: 'auto' }}>
                <thead style={{ backgroundColor: 'rgba(248, 250, 252, 0.8)' }}>
                  <tr>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '500', color: '#64748b', textTransform: 'uppercase' }}>
                      Document
                    </th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '500', color: '#64748b', textTransform: 'uppercase' }}>
                      Details
                    </th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '500', color: '#64748b', textTransform: 'uppercase' }}>
                      Links
                    </th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '500', color: '#64748b', textTransform: 'uppercase' }}>
                      Contact
                    </th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '500', color: '#64748b', textTransform: 'uppercase' }}>
                      Status
                    </th>
                    {userData?.role === 'SUPER_ADMIN' && (
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '500', color: '#64748b', textTransform: 'uppercase' }}>
                        Uploader
                      </th>
                    )}
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '500', color: '#64748b', textTransform: 'uppercase' }}>
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody style={{ backgroundColor: 'white' }}>
                  {getPaginatedDocuments().map((doc) => {
                    const job = ingestJobs.find(j => j.document_id === doc.id)
                    const status = job?.status || 'completed'
                    const statusColors = getStatusColor(status)

                    return (
                      <tr key={doc.id} style={{ borderTop: '1px solid rgba(226, 232, 240, 0.4)' }}>
                        <td style={{ padding: '12px' }}>
                          <div>
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
                            {doc.author && (
                              <div style={{
                                fontSize: '14px',
                                color: '#64748b',
                                wordBreak: 'break-word',
                                overflowWrap: 'anywhere',
                                marginTop: '4px'
                              }}>
                                by {doc.author}
                              </div>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: '12px', fontSize: '14px', color: '#64748b' }}>
                          <div>{formatFileSize(doc.fileSize)}</div>
                          {doc.wordCount && !isNaN(doc.wordCount) && <div>{doc.wordCount.toLocaleString()} words</div>}
                          {doc.pageCount && !isNaN(doc.pageCount) && <div>{doc.pageCount} pages</div>}
                          <div style={{ fontSize: '12px', marginTop: '4px' }}>
                            {formatDate(doc.createdAt)}
                          </div>
                        </td>
                        <td style={{ padding: '12px' }}>
                          {doc.amazon_url && (
                            <div style={{ marginBottom: '4px' }}>
                              <a
                                href={doc.amazon_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  fontSize: '12px',
                                  color: '#2563eb',
                                  textDecoration: 'none'
                                }}
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
                                style={{
                                  fontSize: '12px',
                                  color: 'rgb(158, 205, 85)',
                                  textDecoration: 'none'
                                }}
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
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                          }}>
                            <span style={{
                              fontSize: '12px',
                              fontWeight: '500',
                              color: statusColors.text,
                              backgroundColor: statusColors.bg,
                              padding: '4px 8px',
                              borderRadius: '8px',
                              textTransform: 'capitalize',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}>
                              <span style={{
                                width: '6px',
                                height: '6px',
                                borderRadius: '50%',
                                backgroundColor: statusColors.dot
                              }}></span>
                              {status}
                            </span>
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
                                  opacity: reingestingDocs.has(doc.id) ? 0.5 : 1,
                                  transition: 'all 0.2s'
                                }}
                                onMouseEnter={(e) => {
                                  if (!reingestingDocs.has(doc.id)) {
                                    e.currentTarget.style.backgroundColor = 'rgb(130, 179, 219)'
                                    e.currentTarget.style.color = 'white'
                                  }
                                }}
                                onMouseLeave={(e) => {
                                  if (!reingestingDocs.has(doc.id)) {
                                    e.currentTarget.style.backgroundColor = 'transparent'
                                    e.currentTarget.style.color = 'rgb(130, 179, 219)'
                                  }
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
                                Private
                              </span>
                            )}
                          </div>
                        </td>
                        {userData?.role === 'SUPER_ADMIN' && (
                          <td style={{ padding: '12px', fontSize: '14px', color: '#64748b' }}>
                            {doc.users?.name || doc.users?.email || 'Unknown'}
                          </td>
                        )}
                        <td style={{ padding: '12px' }}>
                          <div style={{ display: 'flex', gap: '8px' }}>
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

          {/* Documents Pagination */}
          {getFilteredDocuments().length > 0 && getTotalDocumentPages() > 1 && (
            <div style={{
              padding: '16px 24px',
              borderTop: '1px solid rgba(226, 232, 240, 0.4)',
              backgroundColor: 'rgba(248, 250, 252, 0.5)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div style={{ fontSize: '14px', color: '#64748b' }}>
                Showing {((documentsCurrentPage - 1) * documentsPerPage) + 1} to{' '}
                {Math.min(documentsCurrentPage * documentsPerPage, getFilteredDocuments().length)} of{' '}
                {getFilteredDocuments().length} documents
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {/* Previous Button */}
                <button
                  onClick={() => setDocumentsCurrentPage(Math.max(1, documentsCurrentPage - 1))}
                  disabled={documentsCurrentPage === 1}
                  style={{
                    padding: '6px 12px',
                    fontSize: '14px',
                    color: documentsCurrentPage === 1 ? '#9ca3af' : '#374151',
                    backgroundColor: 'white',
                    border: '1px solid rgba(226, 232, 240, 0.6)',
                    borderRadius: '6px',
                    cursor: documentsCurrentPage === 1 ? 'not-allowed' : 'pointer',
                    opacity: documentsCurrentPage === 1 ? 0.6 : 1
                  }}
                >
                  ← Previous
                </button>

                {/* Page Numbers */}
                <div style={{ display: 'flex', gap: '4px' }}>
                  {Array.from({ length: Math.min(7, getTotalDocumentPages()) }, (_, i) => {
                    let pageNumber;
                    const totalPages = getTotalDocumentPages();

                    if (totalPages <= 7) {
                      pageNumber = i + 1;
                    } else if (documentsCurrentPage <= 4) {
                      pageNumber = i + 1;
                    } else if (documentsCurrentPage >= totalPages - 3) {
                      pageNumber = totalPages - 6 + i;
                    } else {
                      pageNumber = documentsCurrentPage - 3 + i;
                    }

                    return (
                      <button
                        key={pageNumber}
                        onClick={() => setDocumentsCurrentPage(pageNumber)}
                        style={{
                          padding: '6px 10px',
                          fontSize: '14px',
                          fontWeight: '500',
                          color: documentsCurrentPage === pageNumber ? 'white' : '#374151',
                          backgroundColor: documentsCurrentPage === pageNumber ? 'rgb(130, 179, 219)' : 'white',
                          border: '1px solid rgba(226, 232, 240, 0.6)',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                          minWidth: '36px'
                        }}
                        onMouseEnter={(e) => {
                          if (documentsCurrentPage !== pageNumber) {
                            e.currentTarget.style.backgroundColor = 'rgba(130, 179, 219, 0.1)'
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (documentsCurrentPage !== pageNumber) {
                            e.currentTarget.style.backgroundColor = 'white'
                          }
                        }}
                      >
                        {pageNumber}
                      </button>
                    );
                  })}
                </div>

                {/* Next Button */}
                <button
                  onClick={() => setDocumentsCurrentPage(Math.min(getTotalDocumentPages(), documentsCurrentPage + 1))}
                  disabled={documentsCurrentPage === getTotalDocumentPages()}
                  style={{
                    padding: '6px 12px',
                    fontSize: '14px',
                    color: documentsCurrentPage === getTotalDocumentPages() ? '#9ca3af' : '#374151',
                    backgroundColor: 'white',
                    border: '1px solid rgba(226, 232, 240, 0.6)',
                    borderRadius: '6px',
                    cursor: documentsCurrentPage === getTotalDocumentPages() ? 'not-allowed' : 'pointer',
                    opacity: documentsCurrentPage === getTotalDocumentPages() ? 0.6 : 1
                  }}
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Scraped Webpages */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.8)',
          backdropFilter: 'blur(12px)',
          borderRadius: '20px',
          border: '1px solid rgba(226, 232, 240, 0.4)',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
          overflow: 'hidden'
        }}>
          <div style={{ padding: '24px', borderBottom: '1px solid rgba(226, 232, 240, 0.4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b', marginBottom: '4px' }}>Scraped Webpages</h2>
                <div style={{ fontSize: '14px', color: '#64748b' }}>
                  {getFilteredScrapedPages().length} webpage{getFilteredScrapedPages().length !== 1 ? 's' : ''}
                  {searchQuery && ` matching "${searchQuery}"`}
                  {getFilteredScrapedPages().length > 0 && (
                    <span>
                      {' • '}
                      Page {scrapedPagesCurrentPage} of {getTotalScrapedPages()}
                      ({getPaginatedScrapedPages().length} showing)
                    </span>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {/* Page Size Selector */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ fontSize: '12px', color: '#64748b' }}>Show:</span>
                  {[20, 50, 100].map(size => (
                    <button
                      key={size}
                      onClick={() => handleScrapedPagesPageSizeChange(size)}
                      style={{
                        fontSize: '12px',
                        fontWeight: '500',
                        color: scrapedPagesPerPage === size ? 'white' : '#64748b',
                        backgroundColor: scrapedPagesPerPage === size ? 'rgb(130, 179, 219)' : 'transparent',
                        border: '1px solid rgba(226, 232, 240, 0.6)',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                      onMouseEnter={(e) => {
                        if (scrapedPagesPerPage !== size) {
                          e.currentTarget.style.backgroundColor = 'rgba(130, 179, 219, 0.1)'
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (scrapedPagesPerPage !== size) {
                          e.currentTarget.style.backgroundColor = 'transparent'
                        }
                      }}
                    >
                      {size}
                    </button>
                  ))}
                  <button
                    onClick={() => handleScrapedPagesPageSizeChange(getFilteredScrapedPages().length || 1)}
                    style={{
                      fontSize: '12px',
                      fontWeight: '500',
                      color: scrapedPagesPerPage >= getFilteredScrapedPages().length ? 'white' : '#64748b',
                      backgroundColor: scrapedPagesPerPage >= getFilteredScrapedPages().length ? 'rgb(130, 179, 219)' : 'transparent',
                      border: '1px solid rgba(226, 232, 240, 0.6)',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      if (scrapedPagesPerPage < getFilteredScrapedPages().length) {
                        e.currentTarget.style.backgroundColor = 'rgba(130, 179, 219, 0.1)'
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (scrapedPagesPerPage < getFilteredScrapedPages().length) {
                        e.currentTarget.style.backgroundColor = 'transparent'
                      }
                    }}
                  >
                    All
                  </button>
                </div>
              </div>
            </div>
          </div>

          {getPaginatedScrapedPages().length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>
              {searchQuery ? `No scraped webpages match "${searchQuery}"` : 'No scraped webpages found'}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', tableLayout: 'auto' }}>
                <thead style={{ backgroundColor: 'rgba(248, 250, 252, 0.8)' }}>
                  <tr>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '500', color: '#64748b', textTransform: 'uppercase' }}>
                      Webpage
                    </th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '500', color: '#64748b', textTransform: 'uppercase' }}>
                      Details
                    </th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '500', color: '#64748b', textTransform: 'uppercase' }}>
                      Source URL
                    </th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '500', color: '#64748b', textTransform: 'uppercase' }}>
                      Status
                    </th>
                    {userData?.role === 'SUPER_ADMIN' && (
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '500', color: '#64748b', textTransform: 'uppercase' }}>
                        Uploader
                      </th>
                    )}
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '500', color: '#64748b', textTransform: 'uppercase' }}>
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody style={{ backgroundColor: 'white' }}>
                  {getPaginatedScrapedPages().map((doc) => {
                    const job = ingestJobs.find(j => j.document_id === doc.id)
                    const status = job?.status || 'completed'
                    const statusColors = getStatusColor(status)

                    return (
                      <tr key={doc.id} style={{ borderTop: '1px solid rgba(226, 232, 240, 0.4)' }}>
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
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                          }}>
                            <span style={{
                              fontSize: '12px',
                              fontWeight: '500',
                              color: statusColors.text,
                              backgroundColor: statusColors.bg,
                              padding: '4px 8px',
                              borderRadius: '8px',
                              textTransform: 'capitalize',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}>
                              <span style={{
                                width: '6px',
                                height: '6px',
                                borderRadius: '50%',
                                backgroundColor: statusColors.dot
                              }}></span>
                              {status}
                            </span>
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
                                  opacity: reingestingDocs.has(doc.id) ? 0.5 : 1,
                                  transition: 'all 0.2s'
                                }}
                                onMouseEnter={(e) => {
                                  if (!reingestingDocs.has(doc.id)) {
                                    e.currentTarget.style.backgroundColor = 'rgb(130, 179, 219)'
                                    e.currentTarget.style.color = 'white'
                                  }
                                }}
                                onMouseLeave={(e) => {
                                  if (!reingestingDocs.has(doc.id)) {
                                    e.currentTarget.style.backgroundColor = 'transparent'
                                    e.currentTarget.style.color = 'rgb(130, 179, 219)'
                                  }
                                }}
                              >
                                {reingestingDocs.has(doc.id) ? 'Reingesting...' : 'Retry'}
                              </button>
                            )}
                          </div>
                        </td>
                        {userData?.role === 'SUPER_ADMIN' && (
                          <td style={{ padding: '12px', fontSize: '14px', color: '#64748b' }}>
                            {doc.users?.name || doc.users?.email || 'Unknown'}
                          </td>
                        )}
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

          {/* Scraped Pages Pagination */}
          {getFilteredScrapedPages().length > 0 && getTotalScrapedPages() > 1 && (
            <div style={{
              padding: '16px 24px',
              borderTop: '1px solid rgba(226, 232, 240, 0.4)',
              backgroundColor: 'rgba(248, 250, 252, 0.5)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div style={{ fontSize: '14px', color: '#64748b' }}>
                Showing {((scrapedPagesCurrentPage - 1) * scrapedPagesPerPage) + 1} to{' '}
                {Math.min(scrapedPagesCurrentPage * scrapedPagesPerPage, getFilteredScrapedPages().length)} of{' '}
                {getFilteredScrapedPages().length} webpages
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {/* Previous Button */}
                <button
                  onClick={() => setScrapedPagesCurrentPage(Math.max(1, scrapedPagesCurrentPage - 1))}
                  disabled={scrapedPagesCurrentPage === 1}
                  style={{
                    padding: '6px 12px',
                    fontSize: '14px',
                    color: scrapedPagesCurrentPage === 1 ? '#9ca3af' : '#374151',
                    backgroundColor: 'white',
                    border: '1px solid rgba(226, 232, 240, 0.6)',
                    borderRadius: '6px',
                    cursor: scrapedPagesCurrentPage === 1 ? 'not-allowed' : 'pointer',
                    opacity: scrapedPagesCurrentPage === 1 ? 0.6 : 1
                  }}
                >
                  ← Previous
                </button>

                {/* Page Numbers */}
                <div style={{ display: 'flex', gap: '4px' }}>
                  {Array.from({ length: Math.min(7, getTotalScrapedPages()) }, (_, i) => {
                    let pageNumber;
                    const totalPages = getTotalScrapedPages();

                    if (totalPages <= 7) {
                      pageNumber = i + 1;
                    } else if (scrapedPagesCurrentPage <= 4) {
                      pageNumber = i + 1;
                    } else if (scrapedPagesCurrentPage >= totalPages - 3) {
                      pageNumber = totalPages - 6 + i;
                    } else {
                      pageNumber = scrapedPagesCurrentPage - 3 + i;
                    }

                    return (
                      <button
                        key={pageNumber}
                        onClick={() => setScrapedPagesCurrentPage(pageNumber)}
                        style={{
                          padding: '6px 10px',
                          fontSize: '14px',
                          fontWeight: '500',
                          color: scrapedPagesCurrentPage === pageNumber ? 'white' : '#374151',
                          backgroundColor: scrapedPagesCurrentPage === pageNumber ? 'rgb(130, 179, 219)' : 'white',
                          border: '1px solid rgba(226, 232, 240, 0.6)',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                          minWidth: '36px'
                        }}
                        onMouseEnter={(e) => {
                          if (scrapedPagesCurrentPage !== pageNumber) {
                            e.currentTarget.style.backgroundColor = 'rgba(130, 179, 219, 0.1)'
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (scrapedPagesCurrentPage !== pageNumber) {
                            e.currentTarget.style.backgroundColor = 'white'
                          }
                        }}
                      >
                        {pageNumber}
                      </button>
                    );
                  })}
                </div>

                {/* Next Button */}
                <button
                  onClick={() => setScrapedPagesCurrentPage(Math.min(getTotalScrapedPages(), scrapedPagesCurrentPage + 1))}
                  disabled={scrapedPagesCurrentPage === getTotalScrapedPages()}
                  style={{
                    padding: '6px 12px',
                    fontSize: '14px',
                    color: scrapedPagesCurrentPage === getTotalScrapedPages() ? '#9ca3af' : '#374151',
                    backgroundColor: 'white',
                    border: '1px solid rgba(226, 232, 240, 0.6)',
                    borderRadius: '6px',
                    cursor: scrapedPagesCurrentPage === getTotalScrapedPages() ? 'not-allowed' : 'pointer',
                    opacity: scrapedPagesCurrentPage === getTotalScrapedPages() ? 0.6 : 1
                  }}
                >
                  Next →
                </button>
              </div>
            </div>
          )}
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
                      outline: 'none',
                      transition: 'all 0.2s'
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
                      outline: 'none',
                      transition: 'all 0.2s'
                    }}
                    onFocus={(e) => e.currentTarget.style.borderColor = 'rgb(130, 179, 219)'}
                    onBlur={(e) => e.currentTarget.style.borderColor = 'rgba(203, 213, 225, 0.6)'}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '8px', color: '#374151' }}>
                    Amazon/Bookstore URL
                  </label>
                  <input
                    type="url"
                    value={editingDoc.amazon_url || ''}
                    onChange={(e) => setEditingDoc({...editingDoc, amazon_url: e.target.value})}
                    placeholder="https://amazon.com/..."
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '1px solid rgba(203, 213, 225, 0.6)',
                      borderRadius: '12px',
                      fontSize: '14px',
                      background: 'rgba(255, 255, 255, 0.8)',
                      outline: 'none',
                      transition: 'all 0.2s'
                    }}
                    onFocus={(e) => e.currentTarget.style.borderColor = 'rgb(130, 179, 219)'}
                    onBlur={(e) => e.currentTarget.style.borderColor = 'rgba(203, 213, 225, 0.6)'}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '8px', color: '#374151' }}>
                    Resource URL (Git, FTP, Download, etc.)
                  </label>
                  <input
                    type="url"
                    value={editingDoc.resource_url || ''}
                    onChange={(e) => setEditingDoc({...editingDoc, resource_url: e.target.value})}
                    placeholder="https://github.com/... or https://yoursite.com/file.pdf"
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '1px solid rgba(203, 213, 225, 0.6)',
                      borderRadius: '12px',
                      fontSize: '14px',
                      background: 'rgba(255, 255, 255, 0.8)',
                      outline: 'none',
                      transition: 'all 0.2s'
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
                        outline: 'none',
                        transition: 'all 0.2s'
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
                        outline: 'none',
                        transition: 'all 0.2s'
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
                    Enable download/resource access
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
                    cursor: saving ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    if (!saving) e.currentTarget.style.backgroundColor = '#f8fafc'
                  }}
                  onMouseLeave={(e) => {
                    if (!saving) e.currentTarget.style.backgroundColor = 'white'
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
                    cursor: saving || !editingDoc.title.trim() ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    if (!saving && editingDoc.title.trim()) {
                      e.currentTarget.style.transform = 'scale(1.05)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!saving && editingDoc.title.trim()) {
                      e.currentTarget.style.transform = 'scale(1)'
                    }
                  }}
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      
      <style jsx>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>

      {/* Delete Document Confirmation Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false)
          setDocumentToDelete(null)
        }}
        title="Delete Document"
        size="md"
      >
        {documentToDelete && (
          <div className="space-y-4">
            <div className="flex items-start space-x-3">
              <AlertCircle className="h-6 w-6 text-red-500 flex-shrink-0 mt-1" />
              <div>
                <p className="text-sm text-gray-900">
                  Are you sure you want to <strong>permanently delete</strong> the document <strong>&ldquo;{documentToDelete.title}&rdquo;</strong>?
                </p>
                <ul className="mt-3 text-sm text-gray-600 space-y-1">
                  <li>• The document file will be permanently removed</li>
                  <li>• All associated chat history will remain but lose document references</li>
                  <li>• Vector embeddings will be deleted from the search index</li>
                  <li>• This cannot be undone</li>
                </ul>
              </div>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-md p-3">
              <p className="text-sm text-red-800">
                <strong>Warning:</strong> This action is permanent and cannot be reversed.
              </p>
            </div>

            <div className="flex justify-end space-x-3 pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setShowDeleteModal(false)
                  setDocumentToDelete(null)
                }}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => documentToDelete && deleteDocument(documentToDelete.id)}
              >
                Delete Document
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

export default function AdminPage() {
  return (
    <ToastProvider>
      <AdminPageContent />
    </ToastProvider>
  )
}