'use client'

/**
 * Delete Account Page
 * Soft delete with 30-day grace period
 */

import { useState, useEffect } from 'react'
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { ToastProvider, useToast } from '@/components/ui/Toast'
import { Trash2, AlertTriangle, Shield, Info } from 'lucide-react'
import { logError } from '@/lib/logger'

interface UserStats {
  totalConversations: number
  totalSystemDocuments: number // System-wide documents
  accountCreatedAt: string
}

function DeleteAccountContent() {
  const { addToast } = useToast()
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [userStats, setUserStats] = useState<UserStats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmText, setConfirmText] = useState('')
  const [showConfirmation, setShowConfirmation] = useState(false)

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
        totalSystemDocuments: 623,
        accountCreatedAt: '2025-09-01T00:00:00Z'
      })
    } catch (err) {
      logError(err instanceof Error ? err : new Error('Failed to load stats'), {
        operation: 'loadUserStats',
        component: 'DeleteAccount'
      })
      setError('Failed to load user statistics')
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteAccount = async () => {
    if (confirmText !== 'DELETE') {
      setError('Please type DELETE to confirm account deletion')
      return
    }

    setDeleting(true)
    setError(null)

    try {
      // TODO: Implement soft delete API
      await new Promise(resolve => setTimeout(resolve, 2000)) // Simulated delay

      addToast({
        title: 'Account Deletion Scheduled',
        message: 'Your account will be deleted in 30 days. Check your email for cancellation instructions.',
        type: 'success'
      })

      // Placeholder: In production, this would redirect after scheduling deletion
      setShowConfirmation(false)
      setConfirmText('')
    } catch (err) {
      logError(err instanceof Error ? err : new Error('Delete failed'), {
        operation: 'handleDeleteAccount',
        component: 'DeleteAccount'
      })
      setError('Failed to schedule account deletion. Please try again.')
      addToast({
        title: 'Deletion Failed',
        message: 'Failed to schedule account deletion. Please try again.',
        type: 'error'
      })
    } finally {
      setDeleting(false)
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
        <h2 className="text-3xl font-bold text-gray-900">Delete Account</h2>
        <p className="text-gray-600 mt-2">
          Permanently delete your account and all associated data
        </p>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="error">
          {error}
        </Alert>
      )}

      {/* Warning Notice */}
      <Card className="border-yellow-500">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-yellow-600 flex-shrink-0 mt-1" />
            <div>
              <h3 className="font-semibold text-yellow-900 mb-2">Important Warning</h3>
              <p className="text-sm text-yellow-800 mb-2">
                Deleting your account is a serious action with the following consequences:
              </p>
              <ul className="text-sm text-yellow-800 list-disc list-inside space-y-1">
                <li>Your account will be scheduled for permanent deletion in 30 days</li>
                <li>You can cancel the deletion at any time within the 30-day period</li>
                <li>After 30 days, all your data will be permanently deleted</li>
                <li>This action cannot be undone after the 30-day grace period</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Grace Period Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            30-Day Grace Period
          </CardTitle>
          <CardDescription>
            You can change your mind and keep your account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-700 mb-4">
            When you delete your account, we don&apos;t remove your data immediately. Instead, we schedule
            it for deletion in 30 days. During this grace period:
          </p>
          <ul className="text-sm text-gray-700 list-disc list-inside space-y-2 mb-4">
            <li>You can still log in to your account</li>
            <li>All your data remains accessible</li>
            <li>You&apos;ll receive a confirmation email with a cancellation link</li>
            <li>You can cancel the deletion at any time from your settings or the email link</li>
          </ul>
          <p className="text-sm text-gray-700">
            After 30 days, if you haven&apos;t cancelled, all your data will be permanently deleted from
            our systems.
          </p>
        </CardContent>
      </Card>

      {/* What Will Be Deleted */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="w-5 h-5" />
            What Will Be Deleted
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-700 mb-4">
            After the 30-day grace period, the following data will be permanently deleted:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-red-50 p-4 rounded-lg">
              <h4 className="font-semibold text-gray-900 mb-2">Personal Data</h4>
              <ul className="text-sm text-gray-700 space-y-1">
                <li>• Profile information</li>
                <li>• Email address</li>
                <li>• Account preferences</li>
                <li>• Authentication data</li>
              </ul>
            </div>
            <div className="bg-red-50 p-4 rounded-lg">
              <h4 className="font-semibold text-gray-900 mb-2">Activity Data</h4>
              <ul className="text-sm text-gray-700 space-y-1">
                <li>• All conversations ({userStats?.totalConversations || 0})</li>
                <li>• Chat history</li>
                <li>• Conversation memory</li>
                <li>• Topic progression</li>
              </ul>
            </div>
            <div className="bg-red-50 p-4 rounded-lg">
              <h4 className="font-semibold text-gray-900 mb-2">Document Access</h4>
              <ul className="text-sm text-gray-700 space-y-1">
                <li>• Access to {userStats?.totalSystemDocuments || 0} documents</li>
                <li>• Your document annotations</li>
                <li>• Personalized search data</li>
                <li>• Document preferences</li>
              </ul>
            </div>
            <div className="bg-red-50 p-4 rounded-lg">
              <h4 className="font-semibold text-gray-900 mb-2">Analytics</h4>
              <ul className="text-sm text-gray-700 space-y-1">
                <li>• Usage statistics</li>
                <li>• Activity logs</li>
                <li>• Performance data</li>
                <li>• Anonymized analytics</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Before You Delete */}
      <Card className="border-blue-500">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <Info className="w-6 h-6 text-blue-600 flex-shrink-0 mt-1" />
            <div>
              <h3 className="font-semibold text-blue-900 mb-2">Before You Delete</h3>
              <p className="text-sm text-blue-800 mb-3">
                Consider the following options before deleting your account:
              </p>
              <ul className="text-sm text-blue-800 list-disc list-inside space-y-1">
                <li>Download a copy of your data using the Data Request page</li>
                <li>Review your conversation history one last time</li>
                <li>Check if there are any important documents you want to save</li>
                <li>Contact support if you have account issues instead</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Delete Account Section */}
      <Card className="border-red-500">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-600">
            <Trash2 className="w-5 h-5" />
            Delete My Account
          </CardTitle>
          <CardDescription>
            This will schedule your account for permanent deletion
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!showConfirmation ? (
            <Button
              onClick={() => setShowConfirmation(true)}
              variant="destructive"
              className="w-full sm:w-auto"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              I Want to Delete My Account
            </Button>
          ) : (
            <div className="space-y-4">
              <div className="bg-red-50 border-l-4 border-red-500 p-4">
                <p className="font-semibold text-red-900 mb-2">Final Confirmation</p>
                <p className="text-sm text-red-800 mb-4">
                  Type <strong>DELETE</strong> in the box below to confirm account deletion.
                  You will receive an email with instructions to cancel if you change your mind.
                </p>
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="Type DELETE to confirm"
                  className="w-full px-4 py-2 border border-red-300 rounded-lg focus:ring-2 focus:ring-red-400 focus:border-red-400 outline-none"
                />
              </div>

              <div className="flex gap-3">
                <Button
                  onClick={handleDeleteAccount}
                  disabled={deleting || confirmText !== 'DELETE'}
                  variant="destructive"
                  className="flex-1"
                >
                  {deleting ? (
                    <>
                      <LoadingSpinner size="sm" className="mr-2" />
                      Scheduling Deletion...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4 mr-2" />
                      Confirm Deletion
                    </>
                  )}
                </Button>
                <button
                  onClick={() => {
                    setShowConfirmation(false)
                    setConfirmText('')
                    setError(null)
                  }}
                  className="flex-1 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium cursor-pointer"
                  disabled={deleting}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <p className="text-sm text-gray-500 mt-4">
            You will receive a confirmation email with a cancellation link that remains active for 30 days.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

export default function DeleteAccountPage() {
  return (
    <ToastProvider>
      <DeleteAccountContent />
    </ToastProvider>
  )
}
