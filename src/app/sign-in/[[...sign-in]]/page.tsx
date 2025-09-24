'use client'

import { SignIn } from '@clerk/nextjs'
import { useAuth } from '@clerk/nextjs'

export default function Page() {
  const { isLoaded, userId } = useAuth()

  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-200 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-400 to-primary-500 flex items-center justify-center text-white text-2xl font-bold mb-4 mx-auto animate-pulse shadow-2xl">
            H.E
          </div>
          <div className="text-neutral-600 text-lg font-medium">
            Loading authentication...
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-200 flex items-center justify-center">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-400 to-primary-500 flex items-center justify-center text-white text-2xl font-bold mb-4 mx-auto shadow-2xl">
            H.E
          </div>
          <h1 className="text-2xl font-bold text-neutral-800 mb-2">
            Welcome to Heaven.Earth
          </h1>
          <p className="text-neutral-600">
            Your AI-powered knowledge assistant
          </p>
        </div>
        <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-2xl p-6 border border-neutral-200/40">
          <SignIn
            appearance={{
              elements: {
                rootBox: "mx-auto",
                card: "bg-transparent shadow-none",
              }
            }}
          />
        </div>
      </div>
    </div>
  )
}