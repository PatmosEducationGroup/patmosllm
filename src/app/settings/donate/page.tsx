'use client'

import { useEffect, useState } from 'react'

interface DonationEstimate {
  estimate: number
  perDay: number
  formatted: string
  perDayFormatted: string
  valueFraming: string
  lastUpdated: string | null
  totalTokens: number
  totalOperations: number
  tracking?: string
  message?: string
}

export default function DonatePage() {
  const [estimate, setEstimate] = useState<DonationEstimate | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchEstimate() {
      try {
        const response = await fetch('/api/user/donation-estimate')
        if (!response.ok) {
          throw new Error('Failed to fetch donation estimate')
        }
        const data = await response.json()

        // Handle tracking disabled case
        if (data.tracking === 'disabled') {
          setEstimate(null)
          setLoading(false)
          return
        }

        setEstimate(data)
      } catch (err) {
        console.error('Failed to load estimate:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchEstimate()
  }, [])

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-12 px-4">
      <div className="max-w-2xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-3">
            Support Our Work
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-400">
            Your transparency and optional donation help keep this service running.
          </p>
        </div>

        {/* Main Estimate Card */}
        {loading ? (
          <div className="animate-pulse bg-white dark:bg-gray-800 rounded-2xl h-72 shadow-lg" />
        ) : estimate ? (
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-lg border border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-medium text-gray-600 dark:text-gray-400 mb-4 text-center">
              Your Usage This Month
            </h2>

            <div className="text-center mb-6">
              <div className="text-6xl font-bold text-blue-600 dark:text-blue-400 mb-2">
                {estimate.formatted}
              </div>
              <p className="text-gray-600 dark:text-gray-400 text-lg">
                ({estimate.perDayFormatted} — {estimate.valueFraming})
              </p>
            </div>

            <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
              <div className="grid grid-cols-2 gap-6 text-center">
                <div>
                  <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">LLM Tokens</div>
                  <div className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
                    {estimate.totalTokens.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Operations</div>
                  <div className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
                    {estimate.totalOperations.toLocaleString()}
                  </div>
                </div>
              </div>
              {estimate.lastUpdated && (
                <p className="text-xs text-gray-500 dark:text-gray-400 text-center mt-4">
                  Last updated: {new Date(estimate.lastUpdated).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric'
                  })}
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-2xl p-6 text-center">
            <p className="text-yellow-900 dark:text-yellow-100">
              Usage tracking is disabled. Enable it in{' '}
              <a href="/settings/privacy" className="underline font-medium">
                Settings → Privacy
              </a>{' '}
              to see your donation estimate.
            </p>
          </div>
        )}

        {/* How It Works */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-lg border border-gray-200 dark:border-gray-700">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
            How It Works
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6 leading-relaxed">
            We believe in open, honest costs — no hidden fees.
            This estimate reflects the approximate expense of running AI services for your activity
            (LLM tokens, data processing, and storage).
          </p>
          <ul className="space-y-3 text-gray-600 dark:text-gray-400">
            <li className="flex items-start">
              <span className="text-blue-500 mr-3 mt-1">✓</span>
              <span>Based on total LLM tokens and system operations</span>
            </li>
            <li className="flex items-start">
              <span className="text-blue-500 mr-3 mt-1">✓</span>
              <span>Includes a small 10% infrastructure margin</span>
            </li>
            <li className="flex items-start">
              <span className="text-blue-500 mr-3 mt-1">✓</span>
              <span>Updated once daily at 2:00 AM UTC</span>
            </li>
          </ul>
        </div>

        {/* Want to Help */}
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-2xl p-8 border border-blue-200 dark:border-blue-800">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
            Want to Help?
          </h2>
          <p className="text-gray-700 dark:text-gray-300 mb-4 leading-relaxed">
            This project runs on donations. If you find it useful, consider giving to help keep it free for everyone.
          </p>
          <p className="text-gray-600 dark:text-gray-400 text-sm">
            Donation option coming soon
          </p>
        </div>
      </div>
    </div>
  )
}
