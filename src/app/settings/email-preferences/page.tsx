'use client'

/**
 * Email Preferences Settings Page
 * Manage email notification preferences
 */

import { useState, useEffect } from 'react'
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { ToastProvider, useToast } from '@/components/ui/Toast'
import { Alert } from '@/components/ui/Alert'
import { Mail, Bell, Sparkles } from 'lucide-react'
import { logError } from '@/lib/logger'

interface EmailPreferences {
  productUpdates: boolean
  activitySummaries: boolean
  tipsAndTricks: boolean
  securityAlerts: boolean
}

function EmailPreferencesContent() {
  const { addToast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [preferences, setPreferences] = useState<EmailPreferences>({
    productUpdates: true,
    activitySummaries: true,
    tipsAndTricks: false,
    securityAlerts: true
  })

  useEffect(() => {
    loadPreferences()
  }, [])

  async function loadPreferences() {
    try {
      setLoading(true)
      const response = await fetch('/api/user/email-preferences', {
        credentials: 'include'
      })

      if (!response.ok) {
        throw new Error('Failed to fetch email preferences')
      }

      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error || 'Failed to load preferences')
      }

      setPreferences(data.preferences)
    } catch (err) {
      logError(err instanceof Error ? err : new Error('Failed to load preferences'), {
        operation: 'loadEmailPreferences',
        component: 'EmailPreferences'
      })
      setError('Failed to load email preferences')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)

    try {
      const response = await fetch('/api/user/email-preferences', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify(preferences)
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to save preferences')
      }

      addToast({
        title: 'Preferences Saved',
        message: data.message || 'Your email preferences have been updated successfully',
        type: 'success'
      })
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to save preferences. Please try again.'
      logError(err instanceof Error ? err : new Error('Preferences save failed'), {
        operation: 'handleSaveEmailPreferences',
        component: 'EmailPreferences'
      })
      setError(errorMessage)
      addToast({
        title: 'Save Failed',
        message: errorMessage,
        type: 'error'
      })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-gray-600">Loading preferences...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h2 className="text-3xl font-bold text-gray-900">Email Preferences</h2>
        <p className="text-gray-600 mt-2">
          Manage how we communicate with you via email
        </p>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="error">
          {error}
        </Alert>
      )}

      {/* Product Updates */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary-600" />
            Product Updates
          </CardTitle>
          <CardDescription>
            Stay informed about new features and improvements
          </CardDescription>
        </CardHeader>
        <CardContent>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={preferences.productUpdates}
              onChange={(e) => setPreferences({ ...preferences, productUpdates: e.target.checked })}
              className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-400"
            />
            <span className="text-sm text-gray-700">Send me product updates and announcements</span>
          </label>
        </CardContent>
      </Card>

      {/* Activity Summaries */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-secondary-600" />
            Activity Summaries
          </CardTitle>
          <CardDescription>
            Receive periodic summaries of your usage and insights
          </CardDescription>
        </CardHeader>
        <CardContent>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={preferences.activitySummaries}
              onChange={(e) => setPreferences({ ...preferences, activitySummaries: e.target.checked })}
              className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-400"
            />
            <span className="text-sm text-gray-700">Send me weekly activity summaries</span>
          </label>
        </CardContent>
      </Card>

      {/* Tips and Best Practices */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-blue-600" />
            Tips and Best Practices
          </CardTitle>
          <CardDescription>
            Learn how to get the most out of Multiply Tools
          </CardDescription>
        </CardHeader>
        <CardContent>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={preferences.tipsAndTricks}
              onChange={(e) => setPreferences({ ...preferences, tipsAndTricks: e.target.checked })}
              className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-400"
            />
            <span className="text-sm text-gray-700">Send me tips and best practices</span>
          </label>
        </CardContent>
      </Card>

      {/* Security Alerts */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            Security Alerts
          </CardTitle>
          <CardDescription>
            Critical notifications about your account security (highly recommended)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={preferences.securityAlerts}
              onChange={(e) => setPreferences({ ...preferences, securityAlerts: e.target.checked })}
              className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-400"
            />
            <span className="text-sm text-gray-700">Send me important security alerts</span>
          </label>
          <p className="text-xs text-gray-500 mt-2 ml-7">
            We strongly recommend keeping this enabled to stay informed about important security events.
          </p>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end pt-4">
        <Button
          onClick={handleSave}
          disabled={saving}
          className="w-full sm:w-auto"
        >
          {saving ? 'Saving...' : 'Save Preferences'}
        </Button>
      </div>
    </div>
  )
}

export default function EmailPreferencesPage() {
  return (
    <ToastProvider>
      <EmailPreferencesContent />
    </ToastProvider>
  )
}
