'use client'

import { useEffect, useState } from 'react'
import { logError } from '@/lib/logger'
import { useUser } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import AdminNavbar from '@/components/AdminNavbar'
import OnboardingAnalyticsDashboard from '@/components/OnboardingAnalyticsDashboard'

export default function OnboardingAnalyticsPage() {
  const { user, isLoaded } = useUser()
  const router = useRouter()
  const [isAuthorized, setIsAuthorized] = useState(false)

  useEffect(() => {
    const checkAuth = async () => {
      if (!isLoaded) return
      
      if (!user) {
        router.push('/sign-in')
        return
      }

      try {
        const response = await fetch('/api/auth')
        const data = await response.json()
        
        if (!['ADMIN', 'SUPER_ADMIN'].includes(data.user?.role)) {
          router.push('/')
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
router.push('/')
  }
    }

    checkAuth()
  }, [isLoaded, user, router])

  if (!isLoaded || !isAuthorized) {
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
         <AdminNavbar />
        <OnboardingAnalyticsDashboard />
      </div>
    </div>
  )
}