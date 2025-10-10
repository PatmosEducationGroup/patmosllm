/**
 * Forced Password Migration Page
 *
 * IMMEDIATELY after Clerk login, user is redirected here to set a new password
 * They cannot access the app until they complete this step
 */

'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'

export default function MigratePasswordPage() {
  const { isLoaded, userId } = useAuth()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  useEffect(() => {
    if (!isLoaded) return

    // If not logged into Clerk, redirect to sign-in
    if (!userId) {
      router.push('/sign-in')
      return
    }

    // Check if already migrated - if so, redirect to chat
    checkMigrationStatus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, userId, router])

  const checkMigrationStatus = async () => {
    try {
      const response = await fetch('/api/auth/check-migration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clerkUserId: userId })
      })

      const data = await response.json()

      if (data.migrated) {
        // Already migrated, go to chat
        router.push('/chat')
        return
      }

      setLoading(false)
    } catch (err) {
      console.error('Failed to check migration status:', err)
      setLoading(false)
    }
  }

  const validatePassword = (pwd: string): string | null => {
    if (pwd.length < 8) return 'Password must be at least 8 characters'
    if (!/[A-Z]/.test(pwd)) return 'Password must contain an uppercase letter'
    if (!/[a-z]/.test(pwd)) return 'Password must contain a lowercase letter'
    if (!/[0-9]/.test(pwd)) return 'Password must contain a number'
    return null
  }

  const handleCreatePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    // Validate password strength
    const validationError = validatePassword(password)
    if (validationError) {
      setError(validationError)
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setSubmitting(true)

    try {
      // Complete migration by setting password
      const response = await fetch('/api/auth/complete-migration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clerkUserId: userId,
          password
        })
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Migration failed. Please try again.')
        setSubmitting(false)
        return
      }

      // Sign out of Clerk
      await fetch('/api/auth/clerk-signout', { method: 'POST' })

      // Redirect to login with success message
      router.push('/login?migrated=true')
    } catch (err) {
      console.error('Migration error:', err)
      setError('An error occurred. Please try again.')
      setSubmitting(false)
    }
  }

  if (!isLoaded || loading) {
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-200 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-400 to-primary-500 flex items-center justify-center text-white text-2xl font-bold mb-4 mx-auto shadow-2xl">
            MT
          </div>
          <h1 className="text-2xl font-bold text-neutral-800 mb-2">One More Step</h1>
          <p className="text-neutral-600">
            We&apos;re upgrading our authentication system for better security
          </p>
        </div>

        <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-2xl p-8 border border-neutral-200/40">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
            <p className="text-sm text-blue-800">
              <strong>Quick setup required:</strong>
            </p>
            <p className="text-sm text-blue-700 mt-1">
              Create a new password for your account. You&apos;ll use this password for all future logins.
            </p>
          </div>

          <form onSubmit={handleCreatePassword} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                New Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2 border border-neutral-200/60 rounded-xl focus:border-primary-400 focus:ring-2 focus:ring-primary-200 transition-all duration-200 bg-white/50"
                placeholder="At least 8 characters"
                required
                disabled={loading}
                minLength={8}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                Confirm Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-2 border border-neutral-200/60 rounded-xl focus:border-primary-400 focus:ring-2 focus:ring-primary-200 transition-all duration-200 bg-white/50"
                placeholder="Re-enter your password"
                required
                disabled={loading}
                minLength={8}
              />
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3">
              <p className="text-xs text-yellow-800">
                <strong>Password requirements:</strong>
              </p>
              <ul className="text-xs text-yellow-700 mt-1 list-disc list-inside">
                <li>At least 8 characters long</li>
                <li>At least one uppercase letter</li>
                <li>At least one lowercase letter</li>
                <li>At least one number</li>
              </ul>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white font-medium py-3 rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Completing Migration...' : 'Complete Migration'}
            </button>

            <p className="text-xs text-neutral-500 text-center">
              This is a one-time setup. You&apos;ll use this password for all future logins.
            </p>
          </form>
        </div>
      </div>
    </div>
  )
}
