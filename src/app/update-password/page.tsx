/**
 * Update Password Page
 *
 * Allows users to set their new Supabase password after clicking the reset link
 * Part of the migration flow from Clerk to Supabase Auth
 */

'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function UpdatePasswordPage() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const router = useRouter()

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    // Validation
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setLoading(true)

    try {
      // Update password in Supabase
      const { error: updateError } = await supabase.auth.updateUser({
        password
      })

      if (updateError) {
        setError(updateError.message)
        setLoading(false)
        return
      }

      // Mark user as migrated via API
      await fetch('/api/user/mark-migrated', {
        method: 'POST'
      })

      setSuccess(true)
      setLoading(false)

      // Redirect to chat after 2 seconds
      setTimeout(() => {
        router.push('/chat')
      }, 2000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err) || 'Failed to update password')
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-200 flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-2xl p-8 border border-neutral-200/40">
            <div className="text-center">
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
              <h1 className="text-2xl font-bold text-neutral-800 mb-2">Password Updated!</h1>
              <p className="text-neutral-600 mb-4">
                Your account has been successfully migrated
              </p>
              <p className="text-sm text-neutral-500">Redirecting to chat in 2 seconds...</p>
            </div>
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
          <h1 className="text-2xl font-bold text-neutral-800 mb-2">Set Your New Password</h1>
          <p className="text-neutral-600">Create a secure password for your account</p>
        </div>

        <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-2xl p-8 border border-neutral-200/40">
          <form onSubmit={handleUpdatePassword} className="space-y-4">
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

            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
              <p className="text-xs text-blue-700">
                <strong>Password requirements:</strong>
              </p>
              <ul className="text-xs text-blue-600 mt-1 list-disc list-inside">
                <li>At least 8 characters long</li>
                <li>Mix of letters, numbers, and symbols recommended</li>
              </ul>
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
              {loading ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
