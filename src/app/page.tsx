'use client'

import { useState } from 'react'
import { useAuth, SignIn } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, CardContent } from '@/components/ui/Card'
import {
  Heart,
  Church,
  Search,
  MessageCircle,
  ArrowRight,
  Globe,
  Book,
  Users,
  X
} from 'lucide-react'

// Pre-defined question options with icons and descriptions
const QUESTION_OPTIONS = [
  {
    id: 'frontline-workers',
    question: 'Teach me to pray for frontline workers in disaster areas.',
    description: 'Learn compassionate prayer strategies for those serving in crisis situations',
    icon: Heart,
    color: 'from-red-400 to-pink-500'
  },
  {
    id: 'church-planting',
    question: 'How can I start a church planting movement in my city?',
    description: 'Discover practical steps and biblical foundations for church multiplication',
    icon: Church,
    color: 'from-blue-400 to-indigo-500'
  },
  {
    id: 'missions-research',
    question: 'What are the most important areas of research in missions?',
    description: 'Explore current trends and critical needs in global missions work',
    icon: Search,
    color: 'from-green-400 to-emerald-500'
  }
]

export default function LandingPage() {
  const { isLoaded, userId } = useAuth()
  const router = useRouter()
  const [selectedQuestion, setSelectedQuestion] = useState<string | null>(null)
  const [showAuth, setShowAuth] = useState(false)

  // Handle question button clicks
  const handleQuestionClick = (question: string) => {
    if (!isLoaded) return

    if (userId) {
      // User is authenticated, navigate to chat with the question
      const encodedQuestion = encodeURIComponent(question)
      router.push(`/chat?question=${encodedQuestion}`)
    } else {
      // User is not authenticated, store question and show auth
      setSelectedQuestion(question)
      setShowAuth(true)
    }
  }

  // Handle successful authentication
  const handleAuthSuccess = () => {
    if (selectedQuestion) {
      const encodedQuestion = encodeURIComponent(selectedQuestion)
      router.push(`/chat?question=${encodedQuestion}`)
    } else {
      router.push('/chat')
    }
  }

  // Loading state
  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-200 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-400 to-primary-500 flex items-center justify-center text-white text-2xl font-bold mb-4 mx-auto animate-pulse shadow-2xl">
            H.E
          </div>
          <div className="text-neutral-600 text-lg font-medium">
            Loading Heaven.Earth...
          </div>
        </div>
      </div>
    )
  }

  // Main landing page
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-200">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-xl border-b border-neutral-200/40 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-400 to-primary-500 flex items-center justify-center text-white font-bold text-lg shadow-lg">
                H.E
              </div>
              <div>
                <h1 className="text-xl font-bold text-neutral-800">Heaven.Earth</h1>
                <p className="text-xs text-neutral-600">AI Knowledge Assistant</p>
              </div>
            </div>

            {/* Right side actions */}
            <div className="flex items-center gap-4">
              {userId ? (
                <div className="flex items-center gap-3">
                  <Link
                    href="/chat"
                    className="text-sm text-neutral-600 hover:text-primary-600 transition-colors"
                  >
                    Go to Chat
                  </Link>
                  <Link
                    href="/admin"
                    className="text-sm text-neutral-600 hover:text-primary-600 transition-colors"
                  >
                    Admin
                  </Link>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAuth(true)}
                >
                  Sign In
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-12">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-primary-400 to-primary-500 flex items-center justify-center text-white text-4xl font-bold mb-8 mx-auto shadow-2xl">
            H.E
          </div>
          <h1 className="text-5xl font-bold text-neutral-800 mb-6">
            Welcome to Heaven.Earth
          </h1>
          {userId ? (
            <div className="flex items-center justify-center gap-4">
              <Button
                size="lg"
                onClick={() => router.push('/chat')}
                className="shadow-lg"
              >
                <MessageCircle className="w-5 h-5 mr-2" />
                Continue to Chat
              </Button>
            </div>
          ) : null}
        </div>

        {/* Question Options */}
        <div className="grid md:grid-cols-3 gap-8 mb-16">
          {QUESTION_OPTIONS.map((option) => {
            const Icon = option.icon
            return (
              <Card
                key={option.id}
                className="bg-white/80 backdrop-blur-xl border-neutral-200/40 shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105 cursor-pointer group"
                onClick={() => handleQuestionClick(option.question)}
              >
                <CardHeader className="text-center pb-4">
                  <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${option.color} flex items-center justify-center text-white mb-4 mx-auto shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                    <Icon className="w-8 h-8" />
                  </div>
                  <div className="text-sm text-neutral-600 mb-3">
                    {option.description}
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="bg-gradient-to-r from-neutral-50 to-neutral-100 rounded-xl p-4 mb-4">
                    <p className="text-neutral-800 font-medium text-center leading-relaxed">
                      "{option.question}"
                    </p>
                  </div>
                  <div className="flex items-center justify-center text-primary-600 font-medium text-sm group-hover:text-primary-700 transition-colors">
                    Ask this question
                    <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform duration-300" />
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>

        {/* Features Section */}
        <div className="grid md:grid-cols-3 gap-8 mb-16">
          <div className="text-center">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-400 to-blue-500 flex items-center justify-center text-white mb-4 mx-auto">
              <Globe className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-semibold text-neutral-800 mb-2">Global Missions</h3>
            <p className="text-neutral-600">
              Access comprehensive resources on worldwide missions and ministry strategies
            </p>
          </div>
          <div className="text-center">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-400 to-green-500 flex items-center justify-center text-white mb-4 mx-auto">
              <Book className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-semibold text-neutral-800 mb-2">Spiritual Growth</h3>
            <p className="text-neutral-600">
              Discover prayers, practices, and teachings for deeper spiritual development
            </p>
          </div>
          <div className="text-center">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-400 to-purple-500 flex items-center justify-center text-white mb-4 mx-auto">
              <Users className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-semibold text-neutral-800 mb-2">Ministry Tools</h3>
            <p className="text-neutral-600">
              Find practical resources for church planting, leadership, and community building
            </p>
          </div>
        </div>

        {/* CTA Section */}
        {!userId && (
          <div className="text-center">
            <Card className="bg-gradient-to-br from-primary-50 to-primary-100 border-primary-200 shadow-xl max-w-md mx-auto">
              <CardContent className="py-8">
                <h3 className="text-xl font-bold text-neutral-800 mb-4">
                  Ready to explore more?
                </h3>
                <p className="text-neutral-600 mb-6">
                  Sign in to access the full knowledge base and start meaningful conversations
                </p>
                <Button
                  size="lg"
                  onClick={() => setShowAuth(true)}
                  className="shadow-lg"
                >
                  Get Started
                </Button>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Authentication Modal */}
      {showAuth && !userId && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white/90 backdrop-blur-xl rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto border border-neutral-200/40">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-xl font-bold text-neutral-800">
                    Sign in to Heaven.Earth
                  </h3>
                  {selectedQuestion && (
                    <p className="text-sm text-neutral-600 mt-1">
                      You'll be taken to your question after signing in
                    </p>
                  )}
                </div>
                <button
                  onClick={() => {
                    setShowAuth(false)
                    setSelectedQuestion(null)
                  }}
                  className="text-neutral-400 hover:text-neutral-600 transition-colors p-2 rounded-lg hover:bg-neutral-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <SignIn
                appearance={{
                  elements: {
                    rootBox: "mx-auto",
                    card: "bg-transparent shadow-none border-0",
                    headerTitle: "text-2xl font-bold text-neutral-800 mb-2",
                    headerSubtitle: "text-neutral-600 text-sm",
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
                routing="hash"
                afterSignInUrl="/chat"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}