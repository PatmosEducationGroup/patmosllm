'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

export default function CookieConsentBanner() {
  const [showBanner, setShowBanner] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  // Individual cookie preferences (default to enabled - user can opt out)
  const [analyticsEnabled, setAnalyticsEnabled] = useState(true)
  const [errorTrackingEnabled, setErrorTrackingEnabled] = useState(true)

  useEffect(() => {
    // Check if user has already made a choice
    const cookiePreference = localStorage.getItem('cookie_consent')
    if (!cookiePreference) {
      setShowBanner(true)
    }
    setIsLoading(false)
  }, [])

  const handleAcceptAll = () => {
    const timestamp = new Date().toISOString()
    localStorage.setItem('cookie_consent', 'all')
    localStorage.setItem('cookie_consent_timestamp', timestamp)

    // Enable analytics/tracking (Sentry, Vercel Analytics, etc.)
    enableAnalytics()

    setShowBanner(false)
  }

  const handleEssentialOnly = () => {
    const timestamp = new Date().toISOString()
    localStorage.setItem('cookie_consent', 'essential')
    localStorage.setItem('cookie_consent_timestamp', timestamp)

    // Disable analytics/tracking
    disableAnalytics()

    setShowBanner(false)
    setShowModal(false)
  }

  const handleCustomPreferences = () => {
    const timestamp = new Date().toISOString()
    const preferences = {
      essential: true, // Always true
      analytics: analyticsEnabled,
      errorTracking: errorTrackingEnabled,
    }

    localStorage.setItem(
      'cookie_consent',
      analyticsEnabled && errorTrackingEnabled ? 'all' : 'custom'
    )
    localStorage.setItem('cookie_consent_timestamp', timestamp)
    localStorage.setItem('cookie_preferences', JSON.stringify(preferences))

    // Enable/disable based on selection
    if (analyticsEnabled || errorTrackingEnabled) {
      enableAnalytics()
    } else {
      disableAnalytics()
    }

    setShowBanner(false)
    setShowModal(false)
  }

  const handleDeclineAll = () => {
    handleEssentialOnly()
  }

  const enableAnalytics = () => {
    // Enable Sentry
    if (
      typeof window !== 'undefined' &&
      'Sentry' in window &&
      window.Sentry &&
      typeof window.Sentry === 'object'
    ) {
      // Sentry will already be initialized, this just ensures it's active
      const sentry = window.Sentry as { init?: (config: { enabled: boolean }) => void }
      sentry.init?.({ enabled: true })
    }

    // Enable Vercel Analytics if present
    if (
      typeof window !== 'undefined' &&
      'va' in window &&
      window.va &&
      typeof window.va === 'function'
    ) {
      // Vercel Analytics consent event
      window.va('event', { name: 'consent', data: { consent: 'all' } })
    }
  }

  const disableAnalytics = () => {
    // Disable Sentry session replay
    if (
      typeof window !== 'undefined' &&
      'Sentry' in window &&
      window.Sentry &&
      typeof window.Sentry === 'object'
    ) {
      const sentry = window.Sentry as {
        getCurrentScope?: () => { setUser: (user: null) => void } | undefined
      }
      sentry.getCurrentScope?.()?.setUser(null)
    }

    // Signal to Vercel Analytics that user opted out
    if (
      typeof window !== 'undefined' &&
      'va' in window &&
      window.va &&
      typeof window.va === 'function'
    ) {
      window.va('event', { name: 'consent', data: { consent: 'essential' } })
    }
  }

  // Don't render anything while checking localStorage (prevents flash)
  if (isLoading || !showBanner) {
    return null
  }

  return (
    <>
      {/* Cookie Banner */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-white border border-gray-200 rounded-lg shadow-lg max-w-md w-full mx-4">
        <div className="px-4 py-3">
          <div className="flex flex-col gap-3">
            {/* Message */}
            <p className="text-xs text-gray-600 text-center">
              We use cookies to improve your experience.
            </p>

            {/* Buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleAcceptAll}
                className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-primary-600 rounded-md hover:bg-primary-700 transition-colors shadow-sm"
              >
                Accept All
              </button>
              <button
                onClick={handleEssentialOnly}
                className="px-3 py-2 text-xs font-medium text-gray-600 bg-gray-50 rounded-md hover:bg-gray-100 transition-colors border border-gray-200"
              >
                Essential Only
              </button>
              <button
                onClick={() => setShowModal(true)}
                className="px-2 py-2 text-xs font-medium text-gray-500 hover:text-primary-600 transition-colors whitespace-nowrap"
              >
                More
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Cookie Preferences Modal */}
      {showModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black bg-opacity-50">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-gray-900">
                  Cookie Preferences
                </h2>
                <button
                  onClick={() => setShowModal(false)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <svg
                    className="w-6 h-6"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>

              {/* Description */}
              <p className="text-sm text-gray-600 mb-6">
                We use cookies to enhance your experience. You can choose which
                categories of cookies to accept below.{' '}
                <Link
                  href="/privacy"
                  className="text-primary-600 hover:text-primary-700 underline"
                >
                  Read our Privacy Policy
                </Link>
              </p>

              {/* Cookie Categories */}
              <div className="space-y-4 mb-6">
                {/* Essential Cookies - Always On */}
                <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg">
                  <input
                    type="checkbox"
                    checked={true}
                    disabled
                    className="mt-1 w-4 h-4 text-primary-600 border-gray-300 rounded"
                  />
                  <div className="flex-1">
                    <h3 className="text-sm font-semibold text-gray-900">
                      Essential Cookies
                    </h3>
                    <p className="text-xs text-gray-600 mt-1">
                      Required for the website to function. These cannot be
                      disabled.
                    </p>
                  </div>
                </div>

                {/* Analytics Cookies */}
                <div className="flex items-start gap-3 p-4 border border-gray-200 rounded-lg">
                  <input
                    type="checkbox"
                    checked={analyticsEnabled}
                    onChange={(e) => setAnalyticsEnabled(e.target.checked)}
                    className="mt-1 w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                  />
                  <div className="flex-1">
                    <h3 className="text-sm font-semibold text-gray-900">
                      Analytics Cookies
                    </h3>
                    <p className="text-xs text-gray-600 mt-1">
                      Help us understand how you use the site to improve your
                      experience (Vercel Analytics).
                    </p>
                  </div>
                </div>

                {/* Error Tracking */}
                <div className="flex items-start gap-3 p-4 border border-gray-200 rounded-lg">
                  <input
                    type="checkbox"
                    checked={errorTrackingEnabled}
                    onChange={(e) => setErrorTrackingEnabled(e.target.checked)}
                    className="mt-1 w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                  />
                  <div className="flex-1">
                    <h3 className="text-sm font-semibold text-gray-900">
                      Error Tracking
                    </h3>
                    <p className="text-xs text-gray-600 mt-1">
                      Helps us identify and fix bugs to improve reliability
                      (Sentry).
                    </p>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={handleCustomPreferences}
                  className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-primary-600 rounded-md hover:bg-primary-700 transition-colors"
                >
                  Save Preferences
                </button>
                <button
                  onClick={handleDeclineAll}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                >
                  Decline All
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
