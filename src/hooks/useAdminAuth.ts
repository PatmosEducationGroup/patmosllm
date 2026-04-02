'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { logError } from '@/lib/logger'

export interface AdminUser {
  id: string
  role: string
  email: string
  name?: string
}

interface UseAdminAuthOptions {
  requiredRoles?: string[]
  onAuthenticated?: (user: AdminUser) => void | Promise<void>
}

interface UseAdminAuthReturn {
  user: AdminUser | null
  loading: boolean
  error: string | null
  accessDenied: boolean
  setError: (error: string | null) => void
}

const DEFAULT_ROLES = ['ADMIN', 'CONTRIBUTOR', 'SUPER_ADMIN']

export function useAdminAuth(options: UseAdminAuthOptions = {}): UseAdminAuthReturn {
  const { requiredRoles = DEFAULT_ROLES, onAuthenticated } = options
  const router = useRouter()
  const [user, setUser] = useState<AdminUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [accessDenied, setAccessDenied] = useState(false)

  const fetchUserData = useCallback(async () => {
    try {
      const userResponse = await fetch('/api/auth')

      if (userResponse.status === 401) {
        router.push('/login')
        return
      }

      if (userResponse.status === 404) {
        setAccessDenied(true)
        setError('Access denied: Your account has not been properly set up.')
        setLoading(false)
        return
      }

      const userData = await userResponse.json()

      if (!userData.success) {
        setAccessDenied(true)
        setError('Access denied: Unable to verify your permissions.')
        setLoading(false)
        return
      }

      setUser(userData.user)

      if (!requiredRoles.includes(userData.user.role)) {
        setAccessDenied(true)
        setError('Access denied: You do not have the required permissions to access this page.')
        setLoading(false)
        return
      }

      setLoading(false)

      if (onAuthenticated) {
        onAuthenticated(userData.user)
      }
    } catch (err) {
      logError(err instanceof Error ? err : new Error('Operation failed'), {
        operation: 'useAdminAuth',
        phase: 'request_handling',
        severity: 'high',
        errorContext: 'Failed to fetch user data'
      })
      setAccessDenied(true)
      setError('Access denied: Unable to verify your permissions.')
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    fetchUserData()
  }, [fetchUserData])

  return { user, loading, error, accessDenied, setError }
}
