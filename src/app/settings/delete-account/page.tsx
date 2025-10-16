'use client'

/**
 * Delete Account Page
 * Soft delete with 30-day grace period
 */

import { useState, useEffect } from 'react'
import { useAuth } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
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
  const { signOut } = useAuth()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [canceling, setCanceling] = useState(false)
  const [userStats, setUserStats] = useState<UserStats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmText, setConfirmText] = useState('')
  const [showConfirmation, setShowConfirmation] = useState(false)
  const [deletionScheduledFor, setDeletionScheduledFor] = useState<string | null>(null)

  useEffect(() => {
    loadUserData()
  }, [])

  async function loadUserData() {
    try {
      setLoading(true)

      // Fetch user profile to check deletion status
      const profileResponse = await fetch('/api/user/profile')
      if (profileResponse.ok) {
        const profileData = await profileResponse.json()
        console.log('[DeleteAccount] Profile data:', profileData)
        console.log('[DeleteAccount] deleted_at:', profileData.profile?.deleted_at)
        setDeletionScheduledFor(profileData.profile?.deleted_at || null)
      } else {
        console.log('[DeleteAccount] Profile fetch failed:', profileResponse.status)
      }

      // Fetch real user statistics
      const statsResponse = await fetch('/api/user/stats')
      if (statsResponse.ok) {
        const statsData = await statsResponse.json()
        setUserStats({
          totalConversations: statsData.totalConversations,
          totalSystemDocuments: statsData.totalSystemDocuments,
          accountCreatedAt: statsData.accountCreatedAt
        })
      }
    } catch (err) {
      logError(err instanceof Error ? err : new Error('Failed to load user data'), {
        operation: 'loadUserData',
        component: 'DeleteAccount'
      })
      setError('Failed to load user information')
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
      const response = await fetch('/api/privacy/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ confirmation: confirmText }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to schedule account deletion')
      }

      addToast({
        title: 'Account Deletion Scheduled',
        message: 'Your account will be deleted in 30 days. Redirecting to home page...',
        type: 'success'
      })

      setShowConfirmation(false)
      setConfirmText('')

      // Wait a moment for the toast to be visible
      await new Promise(resolve => setTimeout(resolve, 1500))

      // Sign out and redirect to home page
      await signOut()
      router.push('/')
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

  const handleCancelDeletion = async () => {
    setCanceling(true)
    setError(null)

    try {
      const response = await fetch('/api/privacy/cancel-deletion', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to cancel account deletion')
      }

      addToast({
        title: 'Deletion Cancelled',
        message: 'Your account deletion has been cancelled. Your account will remain active.',
        type: 'success'
      })

      // Reload user data to hide cancellation UI
      await loadUserData()
    } catch (err) {
      logError(err instanceof Error ? err : new Error('Cancel deletion failed'), {
        operation: 'handleCancelDeletion',
        component: 'DeleteAccount'
      })
      setError('Failed to cancel account deletion. Please try again.')
      addToast({
        title: 'Cancellation Failed',
        message: 'Failed to cancel account deletion. Please try again.',
        type: 'error'
      })
    } finally {
      setCanceling(false)
    }
  }

  const getDaysUntilDeletion = () => {
    if (!deletionScheduledFor) return 0
    const deletionDate = new Date(deletionScheduledFor)
    const now = new Date()
    const diffTime = deletionDate.getTime() - now.getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    return Math.max(0, diffDays)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  console.log('[DeleteAccount] Render - deletionScheduledFor:', deletionScheduledFor)

  return (
    <div className="space-y-6">
      {/* Deletion Scheduled Notice - PRIORITY: Show at very top */}
      {deletionScheduledFor && (
        <Card className="border-orange-500 bg-orange-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-orange-900">
              <AlertTriangle className="w-5 h-5" />
              Account Deletion Scheduled
            </CardTitle>
            <CardDescription className="text-orange-800">
              Your account is scheduled for permanent deletion
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="bg-white p-4 rounded-lg border border-orange-200">
                <p className="text-sm text-gray-700 mb-3">
                  Your account deletion is scheduled for:
                </p>
                <p className="text-2xl font-bold text-orange-900 mb-2">
                  {formatDate(deletionScheduledFor)}
                </p>
                <p className="text-sm text-gray-600">
                  <strong>{getDaysUntilDeletion()} days</strong> remaining until permanent deletion
                </p>
              </div>

              <div className="bg-white p-4 rounded-lg border border-orange-200">
                <p className="text-sm text-gray-700 mb-3">
                  <strong>What happens next:</strong>
                </p>
                <ul className="text-sm text-gray-700 space-y-2">
                  <li>• You can still log in and use your account normally</li>
                  <li>• All your data remains accessible during the grace period</li>
                  <li>• You can cancel the deletion at any time before {formatDate(deletionScheduledFor)}</li>
                  <li>• After the grace period expires, all your data will be permanently deleted</li>
                </ul>
              </div>

              <Button
                onClick={handleCancelDeletion}
                disabled={canceling}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 text-lg"
              >
                {canceling ? (
                  <>
                    <LoadingSpinner size="sm" className="mr-2" />
                    Cancelling Deletion...
                  </>
                ) : (
                  <>
                    <Shield className="w-4 h-4 mr-2" />
                    Cancel Account Deletion
                  </>
                )}
              </Button>

              <p className="text-xs text-gray-600 text-center">
                Cancelling will immediately restore your account to active status
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Page Header */}
      <div>
        <h2 className="text-3xl font-bold text-gray-900">
          {deletionScheduledFor ? 'Account Deletion Scheduled' : 'Delete Account'}
        </h2>
        <p className="text-gray-600 mt-2">
          {deletionScheduledFor
            ? 'Your account is scheduled for deletion. Cancel above to restore access.'
            : 'Permanently delete your account and all associated data'}
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
                <li>Review your conversation history one last time</li>
                <li>Contact support if you have account issues instead</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Delete Account Section - Only show if deletion not scheduled */}
      {!deletionScheduledFor && (
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
              className="bg-red-600 hover:bg-red-700 text-white font-bold px-8 py-3 text-lg"
            >
              DELETE
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

              <div className="flex flex-col gap-3">
                <Button
                  onClick={handleDeleteAccount}
                  disabled={deleting || confirmText !== 'DELETE'}
                  variant="destructive"
                  className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 text-base"
                >
                  {deleting ? (
                    <>
                      <LoadingSpinner size="sm" className="mr-2" />
                      Scheduling Deletion...
                    </>
                  ) : (
                    'CONFIRM DELETE MY ACCOUNT'
                  )}
                </Button>
                <button
                  onClick={() => {
                    setShowConfirmation(false)
                    setConfirmText('')
                    setError(null)
                  }}
                  className="w-full px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium cursor-pointer"
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
      )}
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
