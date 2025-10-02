'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { SignUp } from '@clerk/nextjs'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from '@/components/ui/Card'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'


interface InvitationData {
  email: string
  name?: string
  role: string
  invitedBy: string
  expired: boolean
}

export default function InvitePage() {
  const params = useParams()
  const router = useRouter()
  const token = params.token as string
  
  const [invitation, setInvitation] = useState<InvitationData | null>(null)
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
      const response = await fetch(`/api/invite/${token}`)
      const data = await response.json()
      
      if (data.success) {
        setInvitation(data.invitation)
      } else {
        setError(data.error)
      }
    } catch (_error) {
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

  if (error || !invitation) {
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

  if (invitation.expired) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-200 flex items-center justify-center p-6">
        <Card className="max-w-md w-full bg-white/80 backdrop-blur-xl border-slate-200/40 shadow-xl">
          <CardContent className="pt-8 text-center">
            <div className="w-16 h-16 rounded-2xl bg-yellow-100 flex items-center justify-center text-yellow-600 text-2xl mb-6 mx-auto">
              ⏰
            </div>
            <CardTitle className="text-xl text-yellow-600 mb-4">Invitation Expired</CardTitle>
            <CardDescription className="text-neutral-600 mb-6">
              This invitation has expired. Please contact your administrator for a new invitation.
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-200 flex items-center justify-center p-6">
      <div className="max-w-lg w-full">
        {/* Welcome Header */}
        <Card className="mb-6 bg-white/80 backdrop-blur-xl border-slate-200/40 shadow-xl">
          <CardHeader className="text-center">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-400 to-primary-500 flex items-center justify-center text-white text-2xl font-bold mb-4 mx-auto shadow-lg">
              MT
            </div>
            <CardTitle className="text-2xl text-slate-800 mb-2">
              Welcome to Multiply Tools
            </CardTitle>
            <CardDescription className="text-base text-neutral-600">
              <span className="font-medium">{invitation.invitedBy}</span> has invited you to join as a <span className="font-semibold text-primary-600">{invitation.role}</span>
            </CardDescription>
            <div className="mt-3 text-sm text-primary-600">
              Please create your account using: <span className="font-semibold">{invitation.email}</span>
            </div>
          </CardHeader>
        </Card>

        {/* Sign Up Form */}
        <Card className="bg-white/80 backdrop-blur-xl border-slate-200/40 shadow-xl">
          <CardContent className="p-8">
            <SignUp
              forceRedirectUrl={`/api/invite/${token}/complete`}
              signInUrl="/sign-in"
              initialValues={{
                emailAddress: invitation.email
              }}
              appearance={{
                elements: {
                  rootBox: "w-full",
                  card: "shadow-none border-0 p-0 bg-transparent",
                  headerTitle: "text-xl font-bold text-slate-800 mb-2",
                  headerSubtitle: "text-neutral-600 text-sm mb-4",
                  socialButtonsBlockButton: "border border-neutral-200/60 hover:bg-neutral-50 rounded-xl transition-colors duration-200 text-neutral-700",
                  formButtonPrimary: "bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 rounded-xl font-medium transition-all duration-200 shadow-lg hover:shadow-xl",
                  formFieldInput: "border border-neutral-200/60 rounded-xl focus:border-primary-400 focus:ring-2 focus:ring-primary-200 transition-all duration-200 bg-white/50",
                  formFieldLabel: "text-neutral-700 font-medium text-sm",
                  footerActionLink: "text-primary-600 hover:text-primary-700 font-medium transition-colors duration-200"
                },
                variables: {
                  colorPrimary: "#6366f1",
                  colorBackground: "transparent",
                  colorInputBackground: "rgba(255, 255, 255, 0.5)",
                  borderRadius: "12px"
                }
              }}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}