'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from '@/components/ui/Card'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import Link from 'next/link'
import { logError } from '@/lib/logger'

interface InvitationData {
  id: string
  email: string
  role: string
  invitedBy: string
  expiresAt: string
  expired: boolean
}

export default function AcceptInvitationPage() {
  const params = useParams()
  const router = useRouter()
  const token = params.token as string

  // Loading and error states
  const [invitation, setInvitation] = useState<InvitationData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Form fields
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  // GDPR Consent checkboxes
  const [ageConfirmed, setAgeConfirmed] = useState(false)
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [privacyAccepted, setPrivacyAccepted] = useState(false)
  const [cookiesAccepted, setCookiesAccepted] = useState(true) // Default to true (opt-out)

  // Form validation errors
  const [passwordError, setPasswordError] = useState('')

  // =========================================================================
  // LOAD INVITATION - Validate token on mount
  // =========================================================================
  useEffect(() => {
    if (token) {
      validateInvitation()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  const validateInvitation = async () => {
    try {
      // Call API to validate invitation token
      const response = await fetch(`/api/invite/${token}/validate`)
      const data = await response.json()

      if (data.success) {
        setInvitation(data.invitation)
      } else {
        setError(data.error)
      }
    } catch (err) {
      logError(err instanceof Error ? err : new Error('Failed to validate invitation'), {
        operation: 'validate_invitation',
        token
      })
      setError('Failed to validate invitation')
    } finally {
      setLoading(false)
    }
  }

  // =========================================================================
  // PASSWORD VALIDATION
  // =========================================================================
  const validatePassword = (pwd: string): boolean => {
    if (pwd.length < 8) {
      setPasswordError('Password must be at least 8 characters')
      return false
    }
    if (!/[A-Z]/.test(pwd)) {
      setPasswordError('Password must contain at least one uppercase letter')
      return false
    }
    if (!/[a-z]/.test(pwd)) {
      setPasswordError('Password must contain at least one lowercase letter')
      return false
    }
    if (!/[0-9]/.test(pwd)) {
      setPasswordError('Password must contain at least one number')
      return false
    }
    setPasswordError('')
    return true
  }

  // =========================================================================
  // FORM SUBMISSION - Create Supabase user with consent
  // =========================================================================
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setPasswordError('')

    // Validate passwords match
    if (password !== confirmPassword) {
      setPasswordError('Passwords do not match')
      return
    }

    // Validate password strength
    if (!validatePassword(password)) {
      return
    }

    // Validate all required consents
    if (!ageConfirmed || !termsAccepted || !privacyAccepted) {
      setError('Please accept all required terms to continue')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const response = await fetch('/api/auth/accept-invitation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          password,
          consents: {
            age_confirmed: ageConfirmed,
            terms_accepted: termsAccepted,
            privacy_accepted: privacyAccepted,
            cookies_accepted: cookiesAccepted,
            consent_timestamp: new Date().toISOString()
          }
        })
      })

      const data = await response.json()

      if (data.success) {
        // Store cookie consent in localStorage for Sentry
        if (cookiesAccepted) {
          localStorage.setItem('cookie_consent', 'all')
          localStorage.setItem('cookie_consent_timestamp', new Date().toISOString())
        } else {
          localStorage.setItem('cookie_consent', 'essential')
          localStorage.setItem('cookie_consent_timestamp', new Date().toISOString())
        }

        // Success! Redirect to login
        router.push('/sign-in?message=Account created successfully. Please sign in.')
      } else {
        setError(data.error || 'Failed to create account')
      }
    } catch (err) {
      logError(err instanceof Error ? err : new Error('Failed to accept invitation'), {
        operation: 'accept_invitation',
        token
      })
      setError('Failed to create account. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // =========================================================================
  // LOADING STATE
  // =========================================================================
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-200 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <LoadingSpinner size="lg" />
          <div className="text-neutral-600 font-medium">Validating invitation...</div>
        </div>
      </div>
    )
  }

  // =========================================================================
  // ERROR STATE - Invalid/expired invitation
  // =========================================================================
  if (error || !invitation) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-200 flex items-center justify-center p-6">
        <Card className="max-w-md w-full bg-white/80 backdrop-blur-xl border-slate-200/40 shadow-xl">
          <CardContent className="pt-8 text-center">
            <div className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center text-red-600 text-2xl mb-6 mx-auto">
              ⚠️
            </div>
            <CardTitle className="text-xl text-red-600 mb-4">Invalid Invitation</CardTitle>
            <CardDescription className="text-neutral-600 mb-6">
              {error || 'This invitation link is invalid or has expired.'}
            </CardDescription>
            <Button onClick={() => router.push('/')} className="w-full">
              Go to Homepage
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // =========================================================================
  // EXPIRED STATE
  // =========================================================================
  if (invitation.expired) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-200 flex items-center justify-center p-6">
        <Card className="max-w-md w-full bg-white/80 backdrop-blur-xl border-slate-200/40 shadow-xl">
          <CardContent className="pt-8 text-center">
            <div className="w-16 h-16 rounded-2xl bg-yellow-100 flex items-center justify-center text-yellow-600 text-2xl mb-6 mx-auto">
              ⏰
            </div>
            <CardTitle className="text-xl text-yellow-600 mb-4">Invitation Expired</CardTitle>
            <CardDescription className="text-neutral-600 mb-6">
              This invitation has expired. Please contact your administrator for a new invitation.
            </CardDescription>
            <Button onClick={() => router.push('/')} className="w-full">
              Go to Homepage
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // =========================================================================
  // MAIN FORM - Account creation with consent capture
  // =========================================================================
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-200 flex items-center justify-center p-6">
      <div className="max-w-lg w-full">
        {/* Welcome Header */}
        <Card className="mb-6 bg-white/80 backdrop-blur-xl border-slate-200/40 shadow-xl">
          <CardHeader className="text-center">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-400 to-primary-500 flex items-center justify-center text-white text-2xl font-bold mb-4 mx-auto shadow-lg">
              MT
            </div>
            <CardTitle className="text-2xl text-slate-800 mb-2">Welcome to Multiply Tools</CardTitle>
            <CardDescription className="text-base text-neutral-600">
              <span className="font-medium">{invitation.invitedBy}</span> has invited you to join as a{' '}
              <span className="font-semibold text-primary-600">{invitation.role}</span>
            </CardDescription>
            <div className="mt-3 text-sm text-primary-600">
              Please create your account using: <span className="font-semibold">{invitation.email}</span>
            </div>
          </CardHeader>
        </Card>

        {/* Sign Up Form with GDPR Consent */}
        <Card className="bg-white/80 backdrop-blur-xl border-slate-200/40 shadow-xl">
          <CardContent className="p-8">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Password Fields */}
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-neutral-700 mb-2">
                  Password
                </label>
                <input
                  type="password"
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-2 border border-neutral-200/60 rounded-xl focus:border-primary-400 focus:ring-2 focus:ring-primary-200 transition-all duration-200 bg-white/50"
                  required
                  minLength={8}
                />
                <p className="mt-1 text-xs text-neutral-500">
                  At least 8 characters with uppercase, lowercase, and number
                </p>
              </div>

              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-neutral-700 mb-2">
                  Confirm Password
                </label>
                <input
                  type="password"
                  id="confirmPassword"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-2 border border-neutral-200/60 rounded-xl focus:border-primary-400 focus:ring-2 focus:ring-primary-200 transition-all duration-200 bg-white/50"
                  required
                />
              </div>

              {passwordError && (
                <div className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{passwordError}</div>
              )}

              {/* GDPR Consent Section */}
              <div className="pt-4 border-t border-neutral-200">
                <h3 className="text-sm font-semibold text-neutral-700 mb-4">Required Agreements</h3>

                <div className="space-y-3">
                  {/* Age Confirmation */}
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={ageConfirmed}
                      onChange={(e) => setAgeConfirmed(e.target.checked)}
                      className="mt-1 w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                      required
                    />
                    <span className="text-sm text-neutral-700">
                      I confirm that I am 13 years of age or older
                    </span>
                  </label>

                  {/* Terms of Service */}
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={termsAccepted}
                      onChange={(e) => setTermsAccepted(e.target.checked)}
                      className="mt-1 w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                      required
                    />
                    <span className="text-sm text-neutral-700">
                      I agree to the{' '}
                      <Link href="/terms" className="text-primary-600 hover:text-primary-700 underline" target="_blank">
                        Terms of Service
                      </Link>
                    </span>
                  </label>

                  {/* Privacy Policy */}
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={privacyAccepted}
                      onChange={(e) => setPrivacyAccepted(e.target.checked)}
                      className="mt-1 w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                      required
                    />
                    <span className="text-sm text-neutral-700">
                      I have read and accept the{' '}
                      <Link href="/privacy" className="text-primary-600 hover:text-primary-700 underline" target="_blank">
                        Privacy Policy
                      </Link>
                    </span>
                  </label>

                  {/* Cookie Consent (Optional) */}
                  <div className="pt-2 border-t border-neutral-100">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={cookiesAccepted}
                        onChange={(e) => setCookiesAccepted(e.target.checked)}
                        className="mt-1 w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                      />
                      <div className="flex-1">
                        <span className="text-sm text-neutral-700">
                          I accept analytics and error tracking cookies
                        </span>
                        <p className="mt-1 text-xs text-neutral-500">
                          Optional: Helps us improve the app. You can change this later in settings.
                        </p>
                      </div>
                    </label>
                  </div>
                </div>
              </div>

              {/* Error Message */}
              {error && <div className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{error}</div>}

              {/* Submit Button */}
              <Button
                type="submit"
                disabled={submitting || !ageConfirmed || !termsAccepted || !privacyAccepted}
                className="w-full bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700"
              >
                {submitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <LoadingSpinner size="sm" />
                    Creating account...
                  </span>
                ) : (
                  'Create Account'
                )}
              </Button>

              {/* Footer */}
              <p className="text-xs text-center text-neutral-500">
                Already have an account?{' '}
                <Link href="/sign-in" className="text-primary-600 hover:text-primary-700 underline">
                  Sign in
                </Link>
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
