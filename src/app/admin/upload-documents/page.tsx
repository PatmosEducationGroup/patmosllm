'use client'

import { useState } from 'react'
import { logError } from '@/lib/logger'
import { validateFile } from '@/lib/clientValidation'
import { Input } from '@/components/ui/Input'
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from '@/components/ui/Card'
import { Alert } from '@/components/ui/Alert'
import { ToastProvider, useToast } from '@/components/ui/Toast'
import { Checkbox } from '@/components/ui/Checkbox'
import {
  TOAST_DURATION_SUCCESS_BRIEF_MS,
  TOAST_DURATION_ERROR_MS,
  TOAST_DURATION_DEFAULT_MS,
  DELAY_BETWEEN_UPLOADS_MS,
} from '@/lib/constants'
import { AdminErrorBoundary } from '@/components/ErrorBoundary'
import Link from 'next/link'
import { useAdminAuth } from '@/hooks/useAdminAuth'
import { AdminLoadingScreen } from '@/components/admin/AdminLoadingScreen'
import { AdminAccessDenied } from '@/components/admin/AdminAccessDenied'
import { formatFileSize } from '@/lib/admin-utils'

interface Document {
  id: string
  title: string
}

function AdminPageContent() {
  const { addToast } = useToast()
  const [documents, setDocuments] = useState<Document[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadSuccess, setUploadSuccess] = useState(false)
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
      contactPerson: string,
      contactEmail: string,
      downloadEnabled: boolean
    }
  }[]>([])
  const [isProcessingQueue, setIsProcessingQueue] = useState(false)
  const [useSharedMetadata, setUseSharedMetadata] = useState(true)
  const [_showMetadataEditor, setShowMetadataEditor] = useState(false)
  const [uploadTitle, setUploadTitle] = useState('')
  const [uploadAuthor, setUploadAuthor] = useState('')
  const [uploadAmazonUrl, setUploadAmazonUrl] = useState('')
  const [uploadDownloadEnabled, setUploadDownloadEnabled] = useState(true)
  const [uploadContactPerson, setUploadContactPerson] = useState('')
  const [uploadContactEmail, setUploadContactEmail] = useState('')

  const { user, loading, error, accessDenied, setError } = useAdminAuth({
    requiredRoles: ['ADMIN', 'CONTRIBUTOR', 'SUPER_ADMIN'],
    onAuthenticated: async () => {
      await loadDocuments()
    }
  })

  const loadDocuments = async () => {
    try {
      const response = await fetch('/api/admin/documents?limit=200')
      const data = await response.json()

      if (data.success) {
        setDocuments(data.documents)
        setError(null)
      } else {
        setError(data.error)
      }
    } catch (error) {
      logError(error instanceof Error ? error : new Error('Operation failed'), {
        operation: 'API route',
        phase: 'request_handling',
        severity: 'high',
        errorContext: 'Operation failed'
      })
      setError('Failed to load documents')
    }
  }

  // File upload functions
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])

    if (files.length === 0) return

    if (uploadQueue.length + files.length > 20) {
      setError(`Maximum 20 files total. Currently have ${uploadQueue.length} files in queue.`)
      return
    }

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

    const existingQueueFiles = uploadQueue.map(item => `${item.file.name}-${item.file.size}`)
    const existingDocNames = documents.map(doc => doc.title)

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
          contactPerson: uploadContactPerson,
          contactEmail: uploadContactEmail,
          downloadEnabled: uploadDownloadEnabled
        }
      }))
    ])
    if (allDuplicates.length === 0) setError(null)
    setShowMetadataEditor(true)

    if (!uploadTitle && newFiles.length > 0) {
      setUploadTitle(newFiles[0].name.replace(/\.[^/.]+$/, ''))
    }

    const fileInput = e.target
    fileInput.value = ''
  }

  const retryWithBackoff = async (fn: () => Promise<Response>, maxRetries = 3): Promise<Response> => {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await fn()
        if (response.status === 429 && attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 10000)
          await new Promise(resolve => setTimeout(resolve, delay))
          continue
        }
        return response
      } catch (error) {
        logError(error instanceof Error ? error : new Error('Operation failed'), {
          operation: 'API route',
          phase: 'request_handling',
          severity: 'high',
          errorContext: 'Operation failed'
        })
        if (attempt === maxRetries) throw error
        const delay = Math.min(1000 * Math.pow(2, attempt), 5000)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
    throw new Error('Max retries exceeded')
  }

  const processUploadQueue = async () => {
    if (uploadQueue.length === 0 || !user) return

    setIsProcessingQueue(true)
    setUploadSuccess(false)

    for (let i = 0; i < uploadQueue.length; i++) {
      const queueItem = uploadQueue[i]
      if (queueItem.status !== 'pending') continue

      setUploadQueue(prev => prev.map((item, index) =>
        index === i ? { ...item, status: 'uploading' as const } : item
      ))

      try {
        await uploadSingleFile(queueItem.file, i)

        setUploadQueue(prev => prev.map((item, index) =>
          index === i ? { ...item, status: 'completed' as const, progress: 100 } : item
        ))

        addToast({
          type: 'success',
          title: 'Upload Complete',
          message: `"${queueItem.metadata.title}" uploaded successfully`,
          duration: TOAST_DURATION_SUCCESS_BRIEF_MS
        })
      } catch (error) {
        logError(error instanceof Error ? error : new Error('Operation failed'), {
          operation: 'API route',
          phase: 'request_handling',
          severity: 'high',
          errorContext: 'Operation failed'
        })
        setUploadQueue(prev => prev.map((item, index) =>
          index === i ? {
            ...item,
            status: 'error' as const,
            error: 'Upload failed'
          } : item
        ))

        const errorMessage = 'Upload failed'
        addToast({
          type: 'error',
          title: 'Upload Failed',
          message: `"${queueItem.metadata.title}": ${errorMessage}`,
          duration: TOAST_DURATION_ERROR_MS
        })
      }

      if (i < uploadQueue.length - 1) {
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_UPLOADS_MS))
      }
    }

    setIsProcessingQueue(false)

    const completedCount = uploadQueue.filter(item => item.status === 'completed').length
    const errorCount = uploadQueue.filter(item => item.status === 'error').length

    if (completedCount > 0 || errorCount > 0) {
      if (errorCount === 0) {
        addToast({
          type: 'success',
          title: 'All Uploads Complete',
          message: `Successfully uploaded ${completedCount} file${completedCount > 1 ? 's' : ''}`,
          duration: TOAST_DURATION_DEFAULT_MS
        })
        setUploadSuccess(true)
      } else if (completedCount === 0) {
        addToast({
          type: 'error',
          title: 'All Uploads Failed',
          message: `${errorCount} file${errorCount > 1 ? 's' : ''} failed to upload`,
          duration: TOAST_DURATION_ERROR_MS
        })
      } else {
        addToast({
          type: 'warning',
          title: 'Upload Complete with Errors',
          message: `${completedCount} successful, ${errorCount} failed`,
          duration: TOAST_DURATION_ERROR_MS
        })
      }
    }

    setTimeout(() => {
      setUploadQueue(currentQueue => {
        const allCompleted = currentQueue.every(item => item.status === 'completed' || item.status === 'error')
        if (allCompleted) {
          setSelectedFiles([])
          setShowMetadataEditor(false)
          const fileInput = document.getElementById('file-upload') as HTMLInputElement
          if (fileInput) fileInput.value = ''
          return []
        }
        return currentQueue
      })
    }, 3000)
  }

  const uploadSingleFile = async (file: File, queueIndex: number) => {
    const maxSupabaseSize = 50 * 1024 * 1024
    const useBlob = file.size > maxSupabaseSize

    if (useBlob) {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('title', uploadQueue[queueIndex].metadata.title.trim() || file.name)
      formData.append('author', uploadQueue[queueIndex].metadata.author.trim() || '')
      formData.append('amazon_url', uploadQueue[queueIndex].metadata.amazonUrl.trim() || '')
      formData.append('download_enabled', uploadQueue[queueIndex].metadata.downloadEnabled.toString())
      formData.append('contact_person', uploadQueue[queueIndex].metadata.contactPerson.trim() || '')
      formData.append('contact_email', uploadQueue[queueIndex].metadata.contactEmail.trim() || '')

      const blobResponse = await retryWithBackoff(() => fetch('/api/upload/blob', {
        method: 'POST',
        body: formData
      }))

      const blobData = await blobResponse.json()
      if (!blobData.success) {
        throw new Error(blobData.error || 'Upload and processing failed')
      }

    } else {
      const presignedResponse = await retryWithBackoff(() => fetch('/api/upload/presigned', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
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

      setUploadQueue(prev => prev.map((item, index) =>
        index === queueIndex ? { ...item, progress: 20 } : item
      ))

      const uploadResponse = await fetch(presignedData.uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type }
      })

      if (!uploadResponse.ok) {
        throw new Error(`Upload failed: ${uploadResponse.statusText}`)
      }

      setUploadQueue(prev => prev.map((item, index) =>
        index === queueIndex ? { ...item, progress: 60 } : item
      ))

      const processResponse = await retryWithBackoff(() => fetch('/api/upload/process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          storagePath: presignedData.storagePath,
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
          title: uploadQueue[queueIndex].metadata.title.trim() || file.name,
          author: uploadQueue[queueIndex].metadata.author.trim() || null,
          amazon_url: uploadQueue[queueIndex].metadata.amazonUrl.trim() || null,
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
    if (!selectedFiles.length || !user) return
    await processUploadQueue()
  }

  if (loading) {
    return <AdminLoadingScreen />
  }

  if (accessDenied) {
    return <AdminAccessDenied error={error} />
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-200">
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <Card className="mb-8 bg-white/80 backdrop-blur-xl border-slate-200/40 shadow-xl">
          <CardHeader>
            <CardTitle className="text-3xl text-slate-800">
              Upload Documents
            </CardTitle>
            <CardDescription className="text-base">
              Upload files to the document library
            </CardDescription>
          </CardHeader>
        </Card>

        {error && (
          <Alert variant="error" className="mb-6">
            {error}
          </Alert>
        )}

        {/* Upload success banner */}
        {uploadSuccess && (
          <div style={{
            marginBottom: '24px',
            padding: '16px',
            background: 'rgba(240, 253, 244, 0.9)',
            border: '1px solid #bbf7d0',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px'
          }}>
            <span style={{ color: '#15803d', fontSize: '14px', fontWeight: '500' }}>
              Files uploaded successfully.
            </span>
            <Link
              href="/admin/uploaded-documents"
              style={{
                color: '#15803d',
                fontSize: '14px',
                fontWeight: '600',
                textDecoration: 'underline'
              }}
            >
              View Document Library
            </Link>
          </div>
        )}

        {/* File Upload Section */}
        {user && ['ADMIN', 'CONTRIBUTOR', 'SUPER_ADMIN'].includes(user.role) && (
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
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>
                  Buy Online (Optional)
                </label>
                <input
                  type="url"
                  value={uploadAmazonUrl}
                  onChange={(e) => setUploadAmazonUrl(e.target.value)}
                  disabled={uploading}
                  placeholder="https://amazon.com/... or other purchase link"
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
                  label="Enable resource access/download for users"
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
                              <span style={{ fontSize: '12px', color: '#10b981' }}>Completed</span>
                            )}
                            {item.status === 'error' && (
                              <span style={{ fontSize: '12px', color: '#ef4444' }} title={item.error}>
                                Error
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
                   uploadQueue.every(item => item.status === 'completed') && uploadQueue.length > 0 ? 'All Uploads Complete' :
                   uploadQueue.some(item => item.status === 'error') && uploadQueue.every(item => item.status !== 'pending') ? 'Upload Issues' :
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
      </div>
    </div>
  )
}

export default function AdminPage() {
  return (
    <AdminErrorBoundary>
      <ToastProvider>
        <AdminPageContent />
      </ToastProvider>
    </AdminErrorBoundary>
  )
}
