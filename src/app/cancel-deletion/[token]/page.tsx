'use client'

/**
 * Public Account Deletion Cancellation Page
 *
 * Allows users to cancel scheduled deletion via magic link from email
 * No authentication required - token-based verification
 */

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { CheckCircle, XCircle, Shield } from 'lucide-react'

export default function CancelDeletionPage() {
  const params = useParams()
  const router = useRouter()
  const token = params.token as string

  const [loading, setLoading] = useState(true)
  const [canceling, setCanceling] = useState(false)
  const [status, setStatus] = useState<'validating' | 'valid' | 'invalid' | 'cancelled' | 'error'>('validating')
  const [error, setError] = useState<string | null>(null)
  const [email, setEmail] = useState<string | null>(null)

  useEffect(() => {
    validateToken()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  async function validateToken() {
    try {
      setLoading(true)

      const response = await fetch(`/api/privacy/validate-deletion-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token })
      })

      const data = await response.json()

      if (response.ok && data.valid) {
        setStatus('valid')
        setEmail(data.email)
      } else {
        setStatus('invalid')
        setError(data.error || 'Invalid or expired cancellation link')
      }
    } catch (_err) {
      setStatus('error')
      setError('Failed to validate cancellation link')
    } finally {
      setLoading(false)
    }
  }

  async function handleCancel() {
    try {
      setCanceling(true)
      setError(null)

      const response = await fetch('/api/privacy/cancel-deletion', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token })
      })

      const data = await response.json()

      if (response.ok) {
        setStatus('cancelled')

        // Redirect to login after 3 seconds
        setTimeout(() => {
          router.push('/login')
        }, 3000)
      } else {
        throw new Error(data.error || 'Failed to cancel deletion')
      }
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Failed to cancel deletion')
    } finally {
      setCanceling(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <LoadingSpinner size="lg" className="mx-auto mb-4" />
            <p className="text-gray-600">Validating cancellation link...</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
            Multiply Tools
          </h1>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          {status === 'valid' && (
            <>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-orange-900">
                  <Shield className="w-6 h-6" />
                  Cancel Account Deletion
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="bg-blue-50 border-l-4 border-blue-500 p-4">
                    <p className="text-sm text-blue-900">
                      You&apos;re about to cancel the scheduled deletion for:
                    </p>
                    <p className="font-semibold text-blue-900 mt-1">{email}</p>
                  </div>

                  <p className="text-sm text-gray-700">
                    Clicking the button below will immediately restore your account and cancel the scheduled deletion.
                  </p>

                  {error && (
                    <div className="bg-red-50 border-l-4 border-red-500 p-4">
                      <p className="text-sm text-red-900">{error}</p>
                    </div>
                  )}

                  <Button
                    onClick={handleCancel}
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
                        Cancel Deletion & Restore Account
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </>
          )}

          {status === 'cancelled' && (
            <>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-green-900">
                  <CheckCircle className="w-6 h-6" />
                  Deletion Cancelled Successfully!
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="bg-green-50 border-l-4 border-green-500 p-4">
                    <p className="text-sm text-green-900">
                      Your account has been restored. You can now log in and continue using Multiply Tools.
                    </p>
                  </div>

                  <p className="text-sm text-gray-600 text-center">
                    Redirecting to login page in 3 seconds...
                  </p>

                  <Button
                    onClick={() => router.push('/login')}
                    className="w-full"
                  >
                    Go to Login
                  </Button>
                </div>
              </CardContent>
            </>
          )}

          {(status === 'invalid' || status === 'error') && (
            <>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-red-900">
                  <XCircle className="w-6 h-6" />
                  Invalid Cancellation Link
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="bg-red-50 border-l-4 border-red-500 p-4">
                    <p className="text-sm text-red-900">
                      {error || 'This cancellation link is invalid or has expired.'}
                    </p>
                  </div>

                  <p className="text-sm text-gray-700">
                    If you need to cancel your account deletion, please log in to your account and visit your settings page.
                  </p>

                  <Button
                    onClick={() => router.push('/login')}
                    className="w-full"
                  >
                    Go to Login
                  </Button>
                </div>
              </CardContent>
            </>
          )}
        </Card>
      </main>
    </div>
  )
}
