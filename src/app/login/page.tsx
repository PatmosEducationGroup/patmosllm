/**
 * Smart Login Page
 *
 * Email-first flow that adapts based on migration status:
 * 1. User enters email
 * 2. Check if migrated
 * 3a. If migrated → Show Supabase password field
 * 3b. If not migrated → Show Clerk password field → Auto-migrate
 */

'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase-client'

export const dynamic = 'force-dynamic'

type LoginStep = 'email' | 'password'
type AuthSource = 'supabase' | 'clerk' | null

function LoginForm() {
  const [step, setStep] = useState<LoginStep>('email')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authSource, setAuthSource] = useState<AuthSource>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const router = useRouter()
  const searchParams = useSearchParams()

  // Check if user is already logged in
  useEffect(() => {
    const checkSession = async () => {
      const supabase = createClient()
      const {
        data: { session }
      } = await supabase.auth.getSession()

      if (session?.user) {
        // User is already logged in, redirect to chat
        console.log('[Login] User already logged in, redirecting to /chat')
        router.push('/chat')
      }
    }

    checkSession()
  }, [router])

  useEffect(() => {
    // Check for migration success
    if (searchParams.get('migrated') === 'true') {
      setSuccessMessage('Migration complete! Please sign in with your new password.')
    }
  }, [searchParams])

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      // Check migration status
      const response = await fetch('/api/auth/check-migration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Failed to check account')
        setLoading(false)
        return
      }

      if (!data.exists) {
        setError('No account found with this email')
        setLoading(false)
        return
      }

      // If user is not migrated, redirect to Clerk login
      if (!data.migrated) {
        // Redirect to Clerk's sign-in page for unmigrated users
        router.push('/sign-in')
        return
      }

      // User is migrated - show Supabase password field
      setAuthSource('supabase')
      setStep('password')
      setLoading(false)
    } catch (_err) {
      setError('An error occurred. Please try again.')
      setLoading(false)
    }
  }

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const endpoint =
      authSource === 'supabase'
        ? '/api/auth/login-supabase'
        : '/api/auth/login-clerk'

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Login failed')
        setLoading(false)
        return
      }

      // Success! Use window.location for full page reload to ensure cookies are set
      window.location.href = data.redirect || '/chat'
    } catch (_err) {
      setError('An error occurred. Please try again.')
      setLoading(false)
    }
  }

  const handleBack = () => {
    setStep('email')
    setPassword('')
    setError('')
    setAuthSource(null)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-200 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-400 to-primary-500 flex items-center justify-center text-white text-2xl font-bold mb-4 mx-auto shadow-2xl">
            MT
          </div>
          <h1 className="text-3xl font-bold text-neutral-800 mb-2">
            Welcome to Multiply Tools
          </h1>
          <p className="text-neutral-600">
            {step === 'email'
              ? 'Sign in to access your account'
              : 'Enter your password to continue'}
          </p>
        </div>

        <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-2xl p-8 border border-neutral-200/40">
          {step === 'email' ? (
            <form onSubmit={handleEmailSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-2 border border-neutral-200/60 rounded-xl focus:border-primary-400 focus:ring-2 focus:ring-primary-200 transition-all duration-200 bg-white/50"
                  placeholder="you@example.com"
                  required
                  disabled={loading}
                  autoFocus
                />
              </div>

              {successMessage && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-3">
                  <p className="text-sm text-green-600">{successMessage}</p>
                </div>
              )}

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white font-medium py-3 rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Checking...' : 'Continue'}
              </button>
            </form>
          ) : (
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">
                  Email Address
                </label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 px-4 py-2 border border-neutral-200/60 rounded-xl bg-neutral-50 text-neutral-600">
                    {email}
                  </div>
                  <button
                    type="button"
                    onClick={handleBack}
                    className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                  >
                    Change
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-2 border border-neutral-200/60 rounded-xl focus:border-primary-400 focus:ring-2 focus:ring-primary-200 transition-all duration-200 bg-white/50"
                  placeholder="Enter your password"
                  required
                  disabled={loading}
                  autoFocus
                />
              </div>


              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white font-medium py-3 rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Signing in...' : 'Sign In'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-200 flex items-center justify-center"><div>Loading...</div></div>}>
      <LoginForm />
    </Suspense>
  )
}
