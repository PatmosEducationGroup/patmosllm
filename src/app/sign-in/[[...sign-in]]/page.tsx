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
                card: "bg-transparent shadow-none border-0",
                headerTitle: "text-xl font-bold text-slate-800 mb-2",
                headerSubtitle: "text-neutral-600 text-sm mb-4",
                socialButtonsBlockButton: "border border-neutral-200/60 hover:bg-neutral-50 rounded-xl transition-colors duration-200 text-neutral-700",
                socialButtonsBlockButtonText: "font-medium",
                dividerLine: "bg-neutral-200",
                dividerText: "text-neutral-500 text-sm",
                formButtonPrimary: "bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 rounded-xl font-medium transition-all duration-200 shadow-lg hover:shadow-xl",
                formFieldInput: "border border-neutral-200/60 rounded-xl focus:border-primary-400 focus:ring-2 focus:ring-primary-200 transition-all duration-200 bg-white/50",
                formFieldLabel: "text-neutral-700 font-medium text-sm",
                footerActionLink: "text-primary-600 hover:text-primary-700 font-medium transition-colors duration-200",
                identityPreviewText: "text-neutral-600",
                formResendCodeLink: "text-primary-600 hover:text-primary-700",
                otpCodeFieldInput: "border border-neutral-200/60 rounded-lg focus:border-primary-400"
              },
              variables: {
                colorPrimary: "#6366f1",
                colorBackground: "transparent",
                colorInputBackground: "rgba(255, 255, 255, 0.5)",
                colorInputText: "#374151",
                borderRadius: "12px",
                spacingUnit: "1rem"
              }
            }}
          />
        </div>
      </div>
    </div>
  )
}