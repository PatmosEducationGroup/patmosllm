'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { SignUp } from '@clerk/nextjs'

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
    } catch (err) {
      setError('Failed to validate invitation')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <div>Validating invitation...</div>
      </div>
    )
  }

  if (error || !invitation) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <div style={{ textAlign: 'center', maxWidth: '400px', padding: '2rem' }}>
          <h1 style={{ color: '#dc2626', marginBottom: '1rem' }}>Invalid Invitation</h1>
          <p style={{ color: '#6b7280', marginBottom: '2rem' }}>
            {error || 'This invitation link is invalid or has expired.'}
          </p>
          <button 
            onClick={() => router.push('/')}
            style={{
              backgroundColor: '#2563eb',
              color: 'white',
              padding: '0.75rem 1.5rem',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: 'pointer'
            }}
          >
            Go to Homepage
          </button>
        </div>
      </div>
    )
  }

  if (invitation.expired) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <div style={{ textAlign: 'center', maxWidth: '400px', padding: '2rem' }}>
          <h1 style={{ color: '#dc2626', marginBottom: '1rem' }}>Invitation Expired</h1>
          <p style={{ color: '#6b7280', marginBottom: '2rem' }}>
            This invitation has expired. Please contact your administrator for a new invitation.
          </p>
          <button 
            onClick={() => router.push('/')}
            style={{
              backgroundColor: '#2563eb',
              color: 'white',
              padding: '0.75rem 1.5rem',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: 'pointer'
            }}
          >
            Go to Homepage
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', backgroundColor: '#f9fafb' }}>
      <div style={{ maxWidth: '500px', width: '100%', padding: '2rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
            Welcome to Heaven.Earth
          </h1>
          <p style={{ color: '#6b7280' }}>
            {invitation.invitedBy} has invited you to join as a <strong>{invitation.role}</strong>
          </p>
          <p style={{ color: '#2563eb', fontSize: '0.875rem', marginTop: '0.5rem' }}>
            Please create your account using: <strong>{invitation.email}</strong>
          </p>
        </div>
        
        <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '0.5rem', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)' }}>
<SignUp 
  forceRedirectUrl={`/api/invite/${token}/complete`}
  signInUrl="/sign-in"
  initialValues={{
    emailAddress: invitation.email
  }}
  appearance={{
    elements: {
      rootBox: "w-full",
      card: "shadow-none border-0 p-0"
    }
  }}
  routing="path"
  path="/invite/[token]"
/>
        </div>
      </div>
    </div>
  )
}