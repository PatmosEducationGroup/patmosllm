'use client'

import { useState, useEffect } from 'react'
import { logError } from '@/lib/logger'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardTitle, CardDescription } from '@/components/ui/Card'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'


export default function InvitePage() {
  const params = useParams()
  const router = useRouter()
  const token = params.token as string

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (token) {
      validateInvitation()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  const validateInvitation = async () => {
    try {
      // Validate and redirect to Supabase invitation acceptance flow
      const response = await fetch(`/api/invite/${token}/validate`)
      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          // Valid Supabase invitation - redirect to acceptance flow
          router.push(`/invite/${token}/accept`)
          return
        }
      }

      // Invalid or expired invitation
      setError('This invitation link is invalid or has expired.')
    } catch (err) {
      logError(err instanceof Error ? err : new Error('Operation failed'), {
        operation: 'validateInvitation',
        phase: 'request_handling',
        severity: 'medium',
        errorContext: 'Failed to validate invitation'
      })
      setError('Failed to validate invitation')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-200 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <LoadingSpinner size="lg" />
          <div className="text-neutral-600 font-medium">Validating invitation...</div>
        </div>
      </div>
    )
  }

  // Error state
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-200 flex items-center justify-center p-6">
      <Card className="max-w-md w-full bg-white/80 backdrop-blur-xl border-slate-200/40 shadow-xl">
        <CardContent className="pt-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center text-red-600 text-2xl mb-6 mx-auto">
            ⚠️
          </div>
          <CardTitle className="text-xl text-red-600 mb-4">Invalid Invitation</CardTitle>
          <CardDescription className="text-neutral-600 mb-6">
            {error || 'This invitation link is invalid or has expired.'}
          </CardDescription>
          <Button
            onClick={() => router.push('/')}
            className="w-full"
          >
            Go to Homepage
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
