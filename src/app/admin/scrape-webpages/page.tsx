'use client'

import { useState } from 'react'
import { logError } from '@/lib/logger'
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from '@/components/ui/Card'
import { Alert } from '@/components/ui/Alert'
import { ToastProvider } from '@/components/ui/Toast'
import { AdminErrorBoundary } from '@/components/ErrorBoundary'
import { useAdminAuth } from '@/hooks/useAdminAuth'
import { AdminLoadingScreen } from '@/components/admin/AdminLoadingScreen'
import { AdminAccessDenied } from '@/components/admin/AdminAccessDenied'
import Link from 'next/link'

interface ScrapedPage {
  url: string
  success: boolean
  content?: string
  title?: string
  error?: string
  selected?: boolean
}

function ScrapeWebpagesContent() {
  const { user: userData, loading, error, accessDenied, setError } = useAdminAuth({
    requiredRoles: ['ADMIN', 'CONTRIBUTOR', 'SUPER_ADMIN'],
  })
  const [saveSuccess, setSaveSuccess] = useState(false)

  // Web scraping states
  const [websiteUrl, setWebsiteUrl] = useState('')
  const [isDiscovering, setIsDiscovering] = useState(false)
  const [discoveryTimedOut, setDiscoveryTimedOut] = useState(false)
  const [discoveredPages, setDiscoveredPages] = useState<{url: string, selected: boolean}[]>([])
  const [scrapingProgress, setScrapingProgress] = useState(0)
  const [isScrapingPages, setIsScrapingPages] = useState(false)
  const [scrapedContent, setScrapedContent] = useState<ScrapedPage[]>([])
  const [showPreview, setShowPreview] = useState(false)
  const [scrapingMessage, setScrapingMessage] = useState<string | null>(null)
  const [scrapingMessageType, setScrapingMessageType] = useState<'info' | 'error'>('info')
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)

  // Pagination states (for discovery pages)
  const [currentPage, setCurrentPage] = useState(1)
  const [pagesPerPage] = useState(20)
  const [showAllPages, setShowAllPages] = useState(false)

  const discoverWebsitePages = async (resumeFromCheckpoint = false) => {
    if (!websiteUrl.trim()) return

    setIsDiscovering(true)
    setScrapingMessage(null)

    let normalizedUrl = websiteUrl.trim()
    if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
      normalizedUrl = 'https://' + normalizedUrl
    }

    try {
      const response = await fetch('/api/scrape-website', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: normalizedUrl,
          action: 'discover',
          resumeFromCheckpoint
        })
      })

      if (!response.ok) {
        const text = await response.text()
        throw new Error(text || `Server error: ${response.status}`)
      }

      const data = await response.json()

      if (data.success) {
        const newPages = data.links.map((url: string) => ({ url, selected: false }))

        if (resumeFromCheckpoint && discoveredPages.length > 0) {
          const existingUrls = new Set(discoveredPages.map((p: { url: string }) => p.url))
          const uniqueNewPages = newPages.filter((p: { url: string }) => !existingUrls.has(p.url))
          setDiscoveredPages(prev => [...prev, ...uniqueNewPages])
        } else {
          setDiscoveredPages(newPages)
        }
        setCurrentPage(1)
        setShowAllPages(false)
        setDiscoveryTimedOut(!!data.timedOut)

        if (data.timedOut) {
          setScrapingMessage(
            `Found ${data.totalFound} pages so far. Discovery timed out with more pages remaining. Click "Continue Discovery" to find more pages.`
          )
          setScrapingMessageType('info')
        } else {
          const message = data.totalFound > 1
            ? `Discovery complete. Found ${data.totalFound} pages total.`
            : null
          setScrapingMessage(message)
          setScrapingMessageType('info')
        }
        setIsDiscovering(false)
      } else {
        setScrapingMessage(data.error || 'Failed to discover pages')
        setScrapingMessageType('error')
        setIsDiscovering(false)
      }
    } catch (error) {
      logError(error instanceof Error ? error : new Error('Operation failed'), {
        operation: 'discoverWebsitePages',
        phase: 'request_handling',
        severity: 'high',
        errorContext: 'Failed to discover website pages'
      })
      setScrapingMessage('Failed to discover website pages')
      setScrapingMessageType('error')
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
      const response = await fetch('/api/scrape-website', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'scrape',
          urls: selectedUrls
        })
      })

      if (!response.ok) {
        const text = await response.text()
        throw new Error(text || `Server error: ${response.status}`)
      }

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
    } catch (error) {
      logError(error instanceof Error ? error : new Error('Operation failed'), {
        operation: 'scrapeSelectedPages',
        phase: 'request_handling',
        severity: 'high',
        errorContext: 'Failed to scrape website pages'
      })
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
      const response = await fetch('/api/scrape-website/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scrapedPages: selectedContent })
      })

      setUploadProgress(100)

      if (!response.ok) {
        const text = await response.text()
        throw new Error(text || `Server error: ${response.status}`)
      }

      const data = await response.json()

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
          setSaveSuccess(true)
        }

        setWebsiteUrl('')
        setDiscoveredPages([])
        setScrapedContent([])
        setShowPreview(false)

      } else {
        throw new Error(data.error || 'Batch processing failed')
      }

    } catch (error) {
      logError(error instanceof Error ? error : new Error('Operation failed'), {
        operation: 'saveSelectedContent',
        phase: 'request_handling',
        severity: 'high',
        errorContext: 'Failed to save scraped content'
      })
      setScrapingMessage('Failed to save scraped content')
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

  if (loading) {
    return <AdminLoadingScreen />
  }

  if (accessDenied) {
    return <AdminAccessDenied error={error} />
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-200">
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

      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <Card className="mb-8 bg-white/80 backdrop-blur-xl border-slate-200/40 shadow-xl">
          <CardHeader>
            <CardTitle className="text-3xl text-slate-800">
              Scrape Webpages
            </CardTitle>
            <CardDescription className="text-base">
              Discover and scrape website pages to add to the document library
            </CardDescription>
          </CardHeader>
        </Card>

        {error && (
          <Alert variant="error" className="mb-6">
            {error}
          </Alert>
        )}

        {/* Save success banner */}
        {saveSuccess && (
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
              Pages scraped and saved successfully.
            </span>
            <Link
              href="/admin/scraped-webpages"
              style={{
                color: '#15803d',
                fontSize: '14px',
                fontWeight: '600',
                textDecoration: 'underline'
              }}
            >
              View Webpage Library
            </Link>
          </div>
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
                      setDiscoveryTimedOut(false)
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

              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  onClick={() => discoverWebsitePages(false)}
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
                  {isDiscovering ? 'Discovering Pages... (up to 5 minutes)' : 'Discover Pages'}
                </button>

                {discoveryTimedOut && !isDiscovering && (
                  <button
                    onClick={() => discoverWebsitePages(true)}
                    disabled={isScrapingPages || uploading}
                    style={{
                      background: isScrapingPages || uploading ? '#cbd5e1' : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                      color: isScrapingPages || uploading ? '#64748b' : 'white',
                      padding: '12px 24px',
                      border: 'none',
                      borderRadius: '12px',
                      fontSize: '14px',
                      fontWeight: '500',
                      cursor: isScrapingPages || uploading ? 'not-allowed' : 'pointer',
                      width: 'fit-content'
                    }}
                  >
                    Continue Discovery
                  </button>
                )}
              </div>

              <p style={{ fontSize: '12px', color: '#64748b', margin: '4px 0 0 0' }}>
                Page discovery is limited to 5 minutes per run. For large sites, click &quot;Continue Discovery&quot; to resume where it left off.
              </p>

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
      </div>
    </div>
  )
}

export default function ScrapeWebpagesPage() {
  return (
    <AdminErrorBoundary>
      <ToastProvider>
        <ScrapeWebpagesContent />
      </ToastProvider>
    </AdminErrorBoundary>
  )
}
