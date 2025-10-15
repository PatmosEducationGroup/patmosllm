'use client'

/**
 * Cookies Management Page
 * Manage cookie preferences and tracking consent
 */

import { useState } from 'react'
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { ToastProvider, useToast } from '@/components/ui/Toast'
import { Cookie, Shield, BarChart, Settings as SettingsIcon } from 'lucide-react'

function CookiesContent() {
  const { addToast } = useToast()
  const [saving, setSaving] = useState(false)

  // Cookie preferences state
  const [preferences, setPreferences] = useState({
    necessary: true, // Always on, can't be disabled
    analytics: true,
    functional: true,
    marketing: false
  })

  const handleSavePreferences = async () => {
    setSaving(true)

    try {
      // TODO: Implement cookie preferences API
      await new Promise(resolve => setTimeout(resolve, 1000)) // Simulated delay

      addToast({
        title: 'Preferences Saved',
        message: 'Your cookie preferences have been updated successfully',
        type: 'success'
      })
    } catch (_error) {
      addToast({
        title: 'Save Failed',
        message: 'Failed to save your preferences. Please try again.',
        type: 'error'
      })
    } finally {
      setSaving(false)
    }
  }

  const handleAcceptAll = () => {
    setPreferences({
      necessary: true,
      analytics: true,
      functional: true,
      marketing: true
    })
  }

  const handleRejectAll = () => {
    setPreferences({
      necessary: true, // Always required
      analytics: false,
      functional: false,
      marketing: false
    })
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h2 className="text-3xl font-bold text-gray-900">Cookies Management</h2>
        <p className="text-gray-600 mt-2">
          Control how we use cookies and tracking technologies
        </p>
      </div>

      {/* Cookie Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cookie className="w-5 h-5" />
            About Cookies
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-700 mb-4">
            Cookies are small text files that are stored on your device when you visit our website.
            They help us provide you with a better experience by remembering your preferences and
            understanding how you use our service.
          </p>
          <p className="text-sm text-gray-700">
            You can control which types of cookies we use below. Note that disabling some cookies
            may impact your experience and functionality of the service.
          </p>
        </CardContent>
      </Card>

      {/* Cookie Categories */}
      <div className="space-y-4">
        {/* Necessary Cookies */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="w-5 h-5 text-green-600" />
                  <h3 className="font-semibold text-gray-900">Necessary Cookies</h3>
                  <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full font-medium">
                    Always Active
                  </span>
                </div>
                <p className="text-sm text-gray-600 mb-3">
                  These cookies are essential for the website to function properly. They enable core
                  functionality such as security, authentication, and network management. These cookies
                  cannot be disabled.
                </p>
                <div className="text-xs text-gray-500">
                  Examples: Session authentication, security tokens, load balancing
                </div>
              </div>
              <div className="ml-4">
                <div className="w-12 h-6 bg-green-600 rounded-full relative cursor-not-allowed opacity-60">
                  <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full"></div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Analytics Cookies */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <BarChart className="w-5 h-5 text-blue-600" />
                  <h3 className="font-semibold text-gray-900">Analytics Cookies</h3>
                </div>
                <p className="text-sm text-gray-600 mb-3">
                  These cookies help us understand how visitors interact with our website by collecting
                  and reporting information anonymously. This helps us improve our service and user experience.
                </p>
                <div className="text-xs text-gray-500">
                  Examples: Sentry error tracking, usage statistics, performance monitoring
                </div>
              </div>
              <div className="ml-4">
                <button
                  onClick={() => setPreferences({ ...preferences, analytics: !preferences.analytics })}
                  className={`w-12 h-6 rounded-full relative transition-colors cursor-pointer border-none ${
                    preferences.analytics ? 'bg-primary-600' : 'bg-gray-300'
                  }`}
                  aria-label="Toggle analytics cookies"
                >
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                    preferences.analytics ? 'right-1' : 'left-1'
                  }`}></div>
                </button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Functional Cookies */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <SettingsIcon className="w-5 h-5 text-purple-600" />
                  <h3 className="font-semibold text-gray-900">Functional Cookies</h3>
                </div>
                <p className="text-sm text-gray-600 mb-3">
                  These cookies enable enhanced functionality and personalization, such as remembering your
                  preferences and settings. Disabling these may affect some features.
                </p>
                <div className="text-xs text-gray-500">
                  Examples: Language preferences, theme settings, UI customizations
                </div>
              </div>
              <div className="ml-4">
                <button
                  onClick={() => setPreferences({ ...preferences, functional: !preferences.functional })}
                  className={`w-12 h-6 rounded-full relative transition-colors cursor-pointer border-none ${
                    preferences.functional ? 'bg-primary-600' : 'bg-gray-300'
                  }`}
                  aria-label="Toggle functional cookies"
                >
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                    preferences.functional ? 'right-1' : 'left-1'
                  }`}></div>
                </button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Marketing Cookies */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-5 h-5 text-orange-600">📢</span>
                  <h3 className="font-semibold text-gray-900">Marketing Cookies</h3>
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full font-medium">
                    Not Used
                  </span>
                </div>
                <p className="text-sm text-gray-600 mb-3">
                  We currently do not use marketing or advertising cookies. This option is here for
                  transparency and future use if our cookie policy changes.
                </p>
                <div className="text-xs text-gray-500">
                  Examples: Ad targeting, conversion tracking, retargeting
                </div>
              </div>
              <div className="ml-4">
                <button
                  onClick={() => setPreferences({ ...preferences, marketing: !preferences.marketing })}
                  className={`w-12 h-6 rounded-full relative transition-colors cursor-pointer border-none ${
                    preferences.marketing ? 'bg-primary-600' : 'bg-gray-300'
                  }`}
                  aria-label="Toggle marketing cookies"
                >
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                    preferences.marketing ? 'right-1' : 'left-1'
                  }`}></div>
                </button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Button
          onClick={handleSavePreferences}
          disabled={saving}
          className="flex-1 sm:flex-initial"
        >
          {saving ? 'Saving...' : 'Save Preferences'}
        </Button>
        <button
          onClick={handleAcceptAll}
          className="flex-1 sm:flex-initial px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium cursor-pointer"
        >
          Accept All
        </button>
        <button
          onClick={handleRejectAll}
          className="flex-1 sm:flex-initial px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium cursor-pointer"
        >
          Reject All (Except Necessary)
        </button>
      </div>

      {/* Additional Information */}
      <Card>
        <CardHeader>
          <CardTitle>Need More Information?</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-700">
            For more details about how we use cookies and protect your privacy, please review our{' '}
            <a href="/privacy" className="text-primary-600 hover:underline font-medium">
              Privacy Policy
            </a>
            .
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

export default function CookiesPage() {
  return (
    <ToastProvider>
      <CookiesContent />
    </ToastProvider>
  )
}
