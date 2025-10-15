'use client'

/**
 * Privacy Settings Page
 *
 * Allows users to:
 * - Export all their data (GDPR compliance)
 * - Delete their account (with 30-day grace period)
 * - Manage privacy preferences
 *
 * Phase 8: Privacy Settings Portal
 */

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from '@/components/ui/Card'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { Alert } from '@/components/ui/Alert'
import { ToastProvider, useToast } from '@/components/ui/Toast'
import { Download, Trash2, ArrowLeft, AlertTriangle } from 'lucide-react'
import { logError } from '@/lib/logger'

interface UserStats {
  totalConversations: number
  totalDocuments: number
  accountCreatedAt: string
}

function PrivacySettingsContent() {
  const router = useRouter()
  const { addToast } = useToast()
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [userStats, setUserStats] = useState<UserStats | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Load user statistics
  useEffect(() => {
    loadUserStats()
  }, [])

  async function loadUserStats() {
    try {
      setLoading(true)
      // For now, we'll use mock data
      // In production, fetch from /api/user/stats
      setUserStats({
        totalConversations: 218,
        totalDocuments: 623,
        accountCreatedAt: '2025-09-01T00:00:00Z'
      })
    } catch (err) {
      logError(err instanceof Error ? err : new Error('Failed to load stats'), {
        operation: 'loadUserStats',
        component: 'PrivacySettings'
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
        component: 'PrivacySettings'
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

  function handleDeleteAccount() {
    // This will be implemented in the next step (soft delete API)
    addToast({
      title: 'Coming Soon',
      message: 'Account deletion will be available in the next update',
      type: 'info'
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-200">
      {/* Multiply Tools Header */}
      <div className="bg-white border-b border-neutral-200 px-4 sm:px-6 lg:px-8 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-400 to-primary-500 flex items-center justify-center text-white font-bold text-lg shadow-lg">
              MT
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Multiply Tools</h1>
              <p className="text-xs text-gray-600">Interact. Learn. Multiply.</p>
            </div>
          </div>
          <Button
            onClick={() => router.push('/chat')}
            variant="ghost"
            className="flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Back to Chat</span>
          </Button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Page Title */}
        <div className="mb-8">
          <h2 className="text-4xl font-bold text-gray-900">Privacy & Data Settings</h2>
          <p className="text-gray-600 mt-2">
            Manage your personal data and privacy preferences
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <Alert variant="error" className="mb-6">
            {error}
          </Alert>
        )}

        {/* Data Export Section */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Download className="w-5 h-5 mr-2" />
              Data Export
            </CardTitle>
            <CardDescription>
              Download all your data in JSON format (GDPR compliance)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-gray-700 mb-4">
              Export includes:
            </p>
            <ul className="list-disc list-inside text-gray-700 space-y-1 mb-6">
              <li>Your profile information</li>
              <li>All conversations ({userStats?.totalConversations || 0})</li>
              <li>All uploaded documents ({userStats?.totalDocuments || 0})</li>
              <li>User preferences and settings</li>
              <li>Conversation memory and topic progression</li>
            </ul>
            <Button
              onClick={handleExportData}
              disabled={exporting}
              className="w-full sm:w-auto"
            >
              {exporting ? (
                <>
                  <LoadingSpinner size="sm" className="mr-2" />
                  Exporting...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 mr-2" />
                  Export My Data
                </>
              )}
            </Button>
            <p className="text-sm text-gray-500 mt-4">
              Rate limit: 1 export per hour
            </p>
          </CardContent>
        </Card>

        {/* Account Deletion Section */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center text-red-600">
              <Trash2 className="w-5 h-5 mr-2" />
              Account Deletion
            </CardTitle>
            <CardDescription>
              Permanently delete your account and all associated data
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 mb-6">
              <div className="flex">
                <AlertTriangle className="w-5 h-5 text-yellow-500 mr-3 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-yellow-800">Warning: This action is reversible for 30 days</p>
                  <p className="text-yellow-700 text-sm mt-1">
                    Your account will be scheduled for deletion after 30 days. You can cancel at any time before then.
                  </p>
                </div>
              </div>
            </div>

            <p className="text-gray-700 mb-4">
              What will be deleted:
            </p>
            <ul className="list-disc list-inside text-gray-700 space-y-1 mb-6">
              <li>All conversations and chat history ({userStats?.totalConversations || 0})</li>
              <li>All uploaded documents ({userStats?.totalDocuments || 0})</li>
              <li>User profile and preferences</li>
              <li>Vector embeddings and search data</li>
              <li>Conversation memory and analytics</li>
            </ul>

            <Button
              onClick={handleDeleteAccount}
              variant="destructive"
              className="w-full sm:w-auto"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete My Account
            </Button>
            <p className="text-sm text-gray-500 mt-4">
              You will receive a confirmation email with a cancellation link
            </p>
          </CardContent>
        </Card>

        {/* Account Info */}
        <Card>
          <CardHeader>
            <CardTitle>Account Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm text-gray-700">
              <p>
                <span className="font-semibold">Account created:</span>{' '}
                {userStats?.accountCreatedAt
                  ? new Date(userStats.accountCreatedAt).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })
                  : 'Unknown'}
              </p>
              <p>
                <span className="font-semibold">Total conversations:</span> {userStats?.totalConversations || 0}
              </p>
              <p>
                <span className="font-semibold">Total documents:</span> {userStats?.totalDocuments || 0}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="mt-8 pt-8 border-t border-gray-200">
          <p className="text-sm text-gray-600">
            Questions about privacy?{' '}
            <a href="/privacy" className="text-blue-600 hover:underline">
              View Privacy Policy
            </a>
            {' | '}
            <a href="/terms" className="text-blue-600 hover:underline">
              Terms of Service
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}

export default function PrivacySettingsPage() {
  return (
    <ToastProvider>
      <PrivacySettingsContent />
    </ToastProvider>
  )
}
