'use client'

import { useEffect, useState } from 'react'
import { logError } from '@/lib/logger'
// Clerk hooks removed - now using session-based auth
import { useRouter } from 'next/navigation'
import OnboardingAnalyticsDashboard from '@/components/OnboardingAnalyticsDashboard'

export default function OnboardingAnalyticsPage() {
  const router = useRouter()
  const [isAuthorized, setIsAuthorized] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const checkAuth = async () => {
      try {
        // Session-based auth - uses cookies automatically
        const response = await fetch('/api/auth')

        if (response.status === 401) {
          // Not authenticated - redirect to login
          router.push('/login')
          return
        }

        const data = await response.json()

        if (!data.success) {
          router.push('/login')
          return
        }

        if (!['ADMIN', 'SUPER_ADMIN'].includes(data.user?.role)) {
          router.push('/chat')
          return
        }

        setIsAuthorized(true)
      } catch (error) {
        logError(error instanceof Error ? error : new Error('Operation failed'), {
          operation: 'API route',
          phase: 'request_handling',
          severity: 'medium',
          errorContext: 'Operation failed'
        })
        router.push('/chat')
      } finally {
        setLoading(false)
      }
    }

    checkAuth()
  }, [router])

  if (loading || !isAuthorized) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-3">Loading...</span>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <OnboardingAnalyticsDashboard />
      </div>
    </div>
  )
}