'use client'

import { SignIn } from '@clerk/nextjs'
import { useAuth } from '@clerk/nextjs'

export default function Page() {
  const { isLoaded, userId } = useAuth()
  
  console.log('Sign-in page loaded', { isLoaded, userId })
  
  if (!isLoaded) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        minHeight: '100vh',
        background: '#f9fafb'
      }}>
        <div>Loading Clerk...</div>
      </div>
    )
  }

  return (
    <div style={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      minHeight: '100vh',
      background: '#f9fafb'
    }}>
      <div>
        <h1>Sign In Page</h1>
        <p>Clerk loaded: {isLoaded ? 'Yes' : 'No'}</p>
        <p>User ID: {userId || 'None'}</p>
        <SignIn />
      </div>
    </div>
  )
}