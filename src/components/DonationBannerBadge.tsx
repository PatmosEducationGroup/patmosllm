'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Heart } from 'lucide-react'

interface DonationEstimate {
  estimate: number
  formatted: string
  tracking?: string
}

export function DonationBannerBadge() {
  const [estimate, setEstimate] = useState<DonationEstimate | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchEstimate() {
      try {
        const response = await fetch('/api/user/donation-estimate')
        if (!response.ok) throw new Error('Failed to fetch')

        const data = await response.json()

        // Don't show if tracking is disabled
        if (data.tracking === 'disabled') {
          setEstimate(null)
        } else {
          setEstimate(data)
        }
      } catch {
        // Silent failure
        setEstimate(null)
      } finally {
        setLoading(false)
      }
    }

    fetchEstimate()
  }, [])

  if (loading || !estimate) {
    return null // Don't show anything while loading or if no data
  }

  return (
    <Link
      href="/settings/donate"
      className="block w-full no-underline group"
    >
      <div className="relative overflow-hidden bg-white border-2 border-primary-200 rounded-xl p-4 shadow-sm hover:shadow-md hover:border-primary-400 transition-all duration-200">
        <div className="space-y-2">
          {/* Top section - Amount */}
          <div className="flex items-center justify-center">
            <span className="text-2xl font-bold text-primary-600">
              ${estimate.estimate.toFixed(2)}
            </span>
          </div>

          {/* Bottom section */}
          <div className="pt-2 border-t border-gray-100 space-y-1.5">
            <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide text-center">
              Your monthly usage
            </div>
            <div className="flex items-center justify-center gap-2">
              <Heart className="w-4 h-4 fill-red-500 text-red-500" />
              <span className="text-sm font-medium text-gray-700 group-hover:text-primary-600 transition-colors">
                Donate to cover it
              </span>
              <svg className="w-3.5 h-3.5 text-gray-400 group-hover:text-primary-600 group-hover:translate-x-0.5 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </Link>
  )
}
