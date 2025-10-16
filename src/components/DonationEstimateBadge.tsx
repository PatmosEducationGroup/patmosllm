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

interface DonationEstimateBadgeProps {
  variant?: 'compact' | 'full'
  className?: string
}

export function DonationEstimateBadge({ variant = 'compact', className = '' }: DonationEstimateBadgeProps) {
  const [estimate, setEstimate] = useState<DonationEstimate | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
          setError(null)
          setLoading(false)
          return
        }

        setEstimate(data)
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load estimate')
      } finally {
        setLoading(false)
      }
    }

    fetchEstimate()
  }, [])

  if (loading) {
    return (
      <div className={`animate-pulse bg-gray-200 dark:bg-gray-700 rounded-lg ${variant === 'compact' ? 'h-10 w-32' : 'h-20 w-48'} ${className}`} />
    )
  }

  if (error) {
    return null // Silent failure - don't show anything if there's an error
  }

  if (!estimate) {
    return null // Don't show if tracking is disabled
  }

  if (variant === 'compact') {
    return (
      <div className={`inline-flex items-center gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg ${className}`}>
        <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
          This month: ${estimate.formatted}
        </span>
        <span className="text-xs text-blue-600 dark:text-blue-300">
          {estimate.valueFraming}
        </span>
      </div>
    )
  }

  return (
    <div className={`bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 shadow-sm ${className}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Your Usage This Month
          </h3>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-blue-600 dark:text-blue-400">
              ${estimate.formatted}
            </span>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              ({estimate.perDayFormatted})
            </span>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            {estimate.valueFraming}
          </p>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
        <div className="grid grid-cols-2 gap-4 text-xs">
          <div>
            <span className="text-gray-500 dark:text-gray-400">Total Tokens</span>
            <p className="font-medium text-gray-900 dark:text-gray-100">
              {estimate.totalTokens.toLocaleString()}
            </p>
          </div>
          <div>
            <span className="text-gray-500 dark:text-gray-400">Operations</span>
            <p className="font-medium text-gray-900 dark:text-gray-100">
              {estimate.totalOperations.toLocaleString()}
            </p>
          </div>
        </div>
        {estimate.lastUpdated && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            Last updated: {new Date(estimate.lastUpdated).toLocaleDateString()}
          </p>
        )}
      </div>
    </div>
  )
}
