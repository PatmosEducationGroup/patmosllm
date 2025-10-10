/**
 * Migration Landing Page
 *
 * Shown to users who need to migrate from Clerk to Supabase Auth
 * Prompts them to set a new password via email
 */

'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@clerk/nextjs'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function MigratePage() {
  const { isLoaded, userId, signOut } = useAuth()
  const [email, setEmail] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string>('')
  const router = useRouter()

  useEffect(() => {
    // Fetch user's email from Clerk
    if (isLoaded && userId) {
      fetch('/api/user/email')
        .then((res) => res.json())
        .then((data) => {
          if (data.email) {
            setEmail(data.email)
          }
        })
        .catch(() => {
          setError('Failed to fetch your email. Please try again.')
        })
    }
  }, [isLoaded, userId])

  const handleSendResetEmail = async () => {
    if (!email) {
      setError('Email is required')
      return
    }

    setLoading(true)
    setError('')

    try {
      // Send password reset email via Supabase
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?type=recovery`
      })

      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }

      setSent(true)
      setLoading(false)

      // Sign out from Clerk after sending email
      setTimeout(() => {
        signOut()
        router.push('/sign-in')
      }, 5000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err) || 'Failed to send email')
      setLoading(false)
    }
  }

  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-200 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-400 to-primary-500 flex items-center justify-center text-white text-2xl font-bold mb-4 mx-auto animate-pulse shadow-2xl">
            MT
          </div>
          <div className="text-neutral-600 text-lg font-medium">Loading...</div>
        </div>
      </div>
    )
  }

  if (sent) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-200 flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-2xl p-8 border border-neutral-200/40">
            <div className="text-center mb-6">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                <svg
                  className="w-8 h-8 text-green-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-neutral-800 mb-2">Check Your Email</h1>
              <p className="text-neutral-600">
                We&apos;ve sent a password reset link to <strong>{email}</strong>
              </p>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
              <p className="text-sm text-blue-800">
                <strong>Next steps:</strong>
              </p>
              <ol className="text-sm text-blue-700 mt-2 space-y-1 list-decimal list-inside">
                <li>Check your email inbox</li>
                <li>Click the password reset link</li>
                <li>Create a new secure password</li>
                <li>Log in with your new password</li>
              </ol>
            </div>

            <p className="text-xs text-neutral-500 text-center">
              Redirecting to sign in page in 5 seconds...
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-200 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-400 to-primary-500 flex items-center justify-center text-white text-2xl font-bold mb-4 mx-auto shadow-2xl">
            MT
          </div>
          <h1 className="text-2xl font-bold text-neutral-800 mb-2">Account Migration Required</h1>
          <p className="text-neutral-600">
            We&apos;re upgrading our authentication system for better security
          </p>
        </div>

        <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-2xl p-8 border border-neutral-200/40">
          <div className="mb-6">
            <p className="text-neutral-700 mb-4">
              To continue using Multiply Tools, you need to set a new password for your account.
            </p>

            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-4">
              <p className="text-sm text-yellow-800">
                <strong>Why is this needed?</strong>
              </p>
              <p className="text-sm text-yellow-700 mt-1">
                We&apos;re migrating to a new authentication provider that gives you more control over
                your data and improves security.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">
                  Your Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-2 border border-neutral-200/60 rounded-xl focus:border-primary-400 focus:ring-2 focus:ring-primary-200 transition-all duration-200 bg-white/50"
                  placeholder="your@email.com"
                  disabled={loading}
                />
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}

              <button
                onClick={handleSendResetEmail}
                disabled={loading || !email}
                className="w-full bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white font-medium py-3 rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Sending...' : 'Send Password Reset Email'}
              </button>

              <p className="text-xs text-neutral-500 text-center">
                You&apos;ll receive an email with a link to set your new password
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
