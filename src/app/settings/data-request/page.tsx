'use client'

/**
 * Data Request Page
 * GDPR-compliant data export functionality
 */

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from '@/components/ui/Card'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { Alert } from '@/components/ui/Alert'
import { ToastProvider, useToast } from '@/components/ui/Toast'
import { Download, Info } from 'lucide-react'
import { logError } from '@/lib/logger'

interface UserStats {
  totalConversations: number
  totalSystemDocuments: number // Total documents in system (not user-uploaded)
  accountCreatedAt: string
}

function DataRequestContent() {
  const { addToast } = useToast()
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [userStats, setUserStats] = useState<UserStats | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadUserStats()
  }, [])

  async function loadUserStats() {
    try {
      setLoading(true)
      // For now, we'll use mock data
      // In production, fetch from /api/user/stats
      setUserStats({
        totalConversations: 42,
        totalSystemDocuments: 623, // System-wide document count
        accountCreatedAt: '2025-09-01T00:00:00Z'
      })
    } catch (err) {
      logError(err instanceof Error ? err : new Error('Failed to load stats'), {
        operation: 'loadUserStats',
        component: 'DataRequest'
      })
      setError('Failed to load user statistics')
    } finally {
      setLoading(false)
    }
  }

  async function handleExportData() {
    try {
      setExporting(true)
      setError(null)

      const response = await fetch('/api/privacy/export', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        if (response.status === 429) {
          const data = await response.json()
          throw new Error(data.error || 'Too many export requests. Please try again later.')
        }
        throw new Error('Failed to export data')
      }

      const result = await response.json()

      // Download the data as JSON file
      const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: 'application/json' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `my-data-export-${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)

      addToast({
        title: 'Data Export Complete',
        message: `Successfully exported ${result.metadata.totalRecords} records`,
        type: 'success'
      })
    } catch (err) {
      logError(err instanceof Error ? err : new Error('Export failed'), {
        operation: 'handleExportData',
        component: 'DataRequest'
      })
      setError(err instanceof Error ? err.message : 'Failed to export data')
      addToast({
        title: 'Export Failed',
        message: err instanceof Error ? err.message : 'Failed to export data',
        type: 'error'
      })
    } finally {
      setExporting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h2 className="text-3xl font-bold text-gray-900">Data Request</h2>
        <p className="text-gray-600 mt-2">
          Download all your personal data (GDPR compliance)
        </p>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="error">
          {error}
        </Alert>
      )}

      {/* GDPR Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="w-5 h-5" />
            Your Data Rights
          </CardTitle>
          <CardDescription>
            Under GDPR Article 20, you have the right to data portability
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-700 mb-4">
            You can request a complete export of all your personal data stored in our system.
            This export includes all information we hold about you in a machine-readable format.
          </p>
          <p className="text-sm text-gray-700">
            Your export will be delivered as a JSON file containing all your data,
            which can be imported into other services or kept for your records.
          </p>
        </CardContent>
      </Card>

      {/* Data Export Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="w-5 h-5" />
            Export Your Data
          </CardTitle>
          <CardDescription>
            Download all your data in JSON format
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-gray-700 mb-4 font-medium">
            Your export includes:
          </p>
          <ul className="list-disc list-inside text-gray-700 space-y-2 mb-6">
            <li>Your profile information</li>
            <li>All conversations ({userStats?.totalConversations || 0} total)</li>
            <li>Access to {userStats?.totalSystemDocuments || 0} documents (system-wide library)</li>
            <li>User preferences and settings</li>
            <li>Conversation memory and topic progression</li>
            <li>Activity history and statistics</li>
          </ul>

          <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-6">
            <div className="flex">
              <Info className="w-5 h-5 text-blue-500 mr-3 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-blue-800 text-sm">Processing Time</p>
                <p className="text-blue-700 text-sm mt-1">
                  Your data will be exported immediately. For accounts with large amounts of data,
                  this may take a few moments to complete.
                </p>
              </div>
            </div>
          </div>

          <Button
            onClick={handleExportData}
            disabled={exporting}
            className="w-full sm:w-auto"
          >
            {exporting ? (
              <>
                <LoadingSpinner size="sm" className="mr-2" />
                Preparing Export...
              </>
            ) : (
              <>
                <Download className="w-4 h-4 mr-2" />
                Export My Data
              </>
            )}
          </Button>

          <p className="text-sm text-gray-500 mt-4">
            <strong>Rate limit:</strong> 1 export per hour per user
          </p>
        </CardContent>
      </Card>

      {/* Account Summary */}
      {userStats && (
        <Card>
          <CardHeader>
            <CardTitle>Account Summary</CardTitle>
            <CardDescription>
              Overview of your data
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-primary-50 p-4 rounded-lg">
                <p className="text-sm text-gray-600 mb-1">Account Created</p>
                <p className="text-lg font-bold text-gray-900">
                  {new Date(userStats.accountCreatedAt).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                  })}
                </p>
              </div>
              <div className="bg-secondary-50 p-4 rounded-lg">
                <p className="text-sm text-gray-600 mb-1">Total Conversations</p>
                <p className="text-lg font-bold text-gray-900">{userStats.totalConversations}</p>
              </div>
              <div className="bg-green-50 p-4 rounded-lg">
                <p className="text-sm text-gray-600 mb-1">Documents Available</p>
                <p className="text-lg font-bold text-gray-900">{userStats.totalSystemDocuments}</p>
                <p className="text-xs text-gray-500 mt-0.5">system-wide</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export default function DataRequestPage() {
  return (
    <ToastProvider>
      <DataRequestContent />
    </ToastProvider>
  )
}
