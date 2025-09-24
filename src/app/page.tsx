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
import { Modal } from '@/components/ui/Modal'

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
      {/* Enhanced Mobile-First Header */}
      <header className="bg-white/90 backdrop-blur-xl border-b border-neutral-200/40 sticky top-0 z-50 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-4">
          <div className="flex items-center justify-between">
            {/* Enhanced Logo */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-gradient-to-br from-primary-400 to-primary-500 flex items-center justify-center text-white font-bold text-lg shadow-lg">
                H.E
              </div>
              <div>
                <h1 className="text-lg md:text-xl font-bold text-neutral-800">Heaven.Earth</h1>
                <p className="text-xs text-neutral-600 hidden sm:block">AI Knowledge Assistant</p>
              </div>
            </div>

            {/* Enhanced Right side actions */}
            <div className="flex items-center gap-2 md:gap-4">
              {userId ? (
                <div className="flex items-center gap-2 md:gap-3">
                  <Link
                    href="/chat"
                    className="min-h-[44px] px-3 md:px-4 py-2 text-sm font-medium text-neutral-600 hover:text-primary-600 transition-all duration-200 rounded-lg hover:bg-primary-50 flex items-center"
                  >
                    <MessageCircle className="w-4 h-4 mr-2 md:mr-1" />
                    <span className="hidden sm:inline">Go to Chat</span>
                    <span className="sm:hidden">Chat</span>
                  </Link>
                  <Link
                    href="/admin"
                    className="min-h-[44px] px-3 md:px-4 py-2 text-sm font-medium text-neutral-600 hover:text-primary-600 transition-all duration-200 rounded-lg hover:bg-primary-50 flex items-center"
                  >
                    <span className="hidden sm:inline">Admin</span>
                    <span className="sm:hidden">⚙️</span>
                  </Link>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => setShowAuth(true)}
                  className="min-h-[44px] px-6 font-medium shadow-sm hover:shadow-md active:scale-95"
                >
                  <span className="hidden sm:inline">Sign In</span>
                  <span className="sm:hidden">Sign In</span>
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 md:px-6 py-8 md:py-12">
        {/* Enhanced Mobile-First Hero Section */}
        <div className="text-center mb-12 md:mb-16">
          <div className="w-20 h-20 md:w-24 md:h-24 rounded-3xl bg-gradient-to-br from-primary-400 to-primary-500 flex items-center justify-center text-white text-3xl md:text-4xl font-bold mb-6 md:mb-8 mx-auto shadow-2xl">
            H.E
          </div>
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-neutral-800 mb-4 md:mb-6 px-4">
            Welcome to Heaven.Earth
          </h1>
          <p className="text-lg md:text-xl text-neutral-600 mb-6 md:mb-8 max-w-2xl mx-auto px-4">
            Your AI-powered spiritual knowledge companion
          </p>
          {userId ? (
            <div className="flex items-center justify-center gap-4">
              <Button
                size="lg"
                onClick={() => router.push('/chat')}
                className="shadow-lg min-h-[52px] px-8 text-base font-semibold active:scale-95"
              >
                <MessageCircle className="w-5 h-5 mr-2" />
                Continue to Chat
              </Button>
            </div>
          ) : null}
        </div>

        {/* Enhanced Question Options Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8 mb-12 md:mb-16">
          {QUESTION_OPTIONS.map((option) => {
            const Icon = option.icon
            return (
              <Card
                key={option.id}
                className="bg-white/90 backdrop-blur-xl border-neutral-200/40 shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105 cursor-pointer group active:scale-95"
                onClick={() => handleQuestionClick(option.question)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    handleQuestionClick(option.question)
                  }
                }}
                tabIndex={0}
                role="button"
                aria-label={`Ask question: ${option.question}`}
              >
                <CardHeader className="text-center pb-4 px-6 pt-6">
                  <div className={`w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-gradient-to-br ${option.color} flex items-center justify-center text-white mb-4 mx-auto shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                    <Icon className="w-8 h-8 md:w-10 md:h-10" />
                  </div>
                  <div className="text-sm md:text-base text-neutral-600 mb-3 leading-relaxed">
                    {option.description}
                  </div>
                </CardHeader>
                <CardContent className="pt-0 px-6 pb-6">
                  <div className="bg-gradient-to-r from-neutral-50 to-neutral-100 rounded-xl p-4 md:p-5 mb-4">
                    <p className="text-neutral-800 font-medium text-center leading-relaxed text-sm md:text-base">
                      &ldquo;{option.question}&rdquo;
                    </p>
                  </div>
                  <div className="flex items-center justify-center text-primary-600 font-semibold text-sm md:text-base group-hover:text-primary-700 transition-colors min-h-[44px]">
                    <span className="flex items-center gap-2">
                      Ask this question
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-300" />
                    </span>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>

        {/* Enhanced Mobile Features Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 mb-12 md:mb-16">
          <div className="text-center p-6 rounded-2xl bg-white/60 backdrop-blur-sm border border-neutral-200/40 shadow-lg hover:shadow-xl transition-all duration-300">
            <div className="w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-gradient-to-br from-blue-400 to-blue-500 flex items-center justify-center text-white mb-4 mx-auto shadow-lg">
              <Globe className="w-8 h-8 md:w-10 md:h-10" />
            </div>
            <h3 className="text-lg md:text-xl font-semibold text-neutral-800 mb-3">Global Missions</h3>
            <p className="text-neutral-600 text-sm md:text-base leading-relaxed">
              Access comprehensive resources on worldwide missions and ministry strategies
            </p>
          </div>
          <div className="text-center p-6 rounded-2xl bg-white/60 backdrop-blur-sm border border-neutral-200/40 shadow-lg hover:shadow-xl transition-all duration-300">
            <div className="w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-gradient-to-br from-green-400 to-green-500 flex items-center justify-center text-white mb-4 mx-auto shadow-lg">
              <Book className="w-8 h-8 md:w-10 md:h-10" />
            </div>
            <h3 className="text-lg md:text-xl font-semibold text-neutral-800 mb-3">Spiritual Growth</h3>
            <p className="text-neutral-600 text-sm md:text-base leading-relaxed">
              Discover prayers, practices, and teachings for deeper spiritual development
            </p>
          </div>
          <div className="text-center p-6 rounded-2xl bg-white/60 backdrop-blur-sm border border-neutral-200/40 shadow-lg hover:shadow-xl transition-all duration-300 md:col-span-1">
            <div className="w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-gradient-to-br from-purple-400 to-purple-500 flex items-center justify-center text-white mb-4 mx-auto shadow-lg">
              <Users className="w-8 h-8 md:w-10 md:h-10" />
            </div>
            <h3 className="text-lg md:text-xl font-semibold text-neutral-800 mb-3">Ministry Tools</h3>
            <p className="text-neutral-600 text-sm md:text-base leading-relaxed">
              Find practical resources for church planting, leadership, and community building
            </p>
          </div>
        </div>

        {/* Enhanced Mobile CTA Section */}
        {!userId && (
          <div className="text-center">
            <Card className="bg-gradient-to-br from-primary-50 to-primary-100 border-primary-200 shadow-2xl max-w-lg mx-auto">
              <CardContent className="py-8 md:py-10 px-6 md:px-8">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-400 to-primary-500 flex items-center justify-center text-white font-bold text-2xl mb-6 mx-auto">
                  ✨
                </div>
                <h3 className="text-xl md:text-2xl font-bold text-neutral-800 mb-4">
                  Ready to explore more?
                </h3>
                <p className="text-neutral-600 mb-8 text-base md:text-lg leading-relaxed">
                  Sign in to access the full knowledge base and start meaningful conversations
                </p>
                <Button
                  size="lg"
                  onClick={() => setShowAuth(true)}
                  className="shadow-lg hover:shadow-xl min-h-[52px] px-8 text-base font-semibold active:scale-95 w-full sm:w-auto"
                >
                  <span className="flex items-center gap-2">
                    Get Started
                    <ArrowRight className="w-5 h-5" />
                  </span>
                </Button>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Enhanced Authentication Modal */}
      <Modal
        isOpen={showAuth && !userId}
        onClose={() => {
          setShowAuth(false)
          setSelectedQuestion(null)
        }}
        title=""
        size="md"
        showCloseButton={false}
      >
        <div className="text-center mb-6">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-400 to-primary-500 flex items-center justify-center text-white font-bold text-lg">
              H.E
            </div>
            <h3 className="text-xl font-bold text-neutral-800">
              Sign in to Heaven.Earth
            </h3>
          </div>
          {selectedQuestion && (
            <p className="text-sm text-neutral-600 bg-primary-50 border border-primary-200 rounded-lg p-3">
              <span className="font-medium">Ready to explore:</span><br />
              &ldquo;{selectedQuestion.length > 60 ? selectedQuestion.substring(0, 57) + '...' : selectedQuestion}&rdquo;
            </p>
          )}
        </div>

        <div className="flex justify-end mb-4">
          <button
            onClick={() => {
              setShowAuth(false)
              setSelectedQuestion(null)
            }}
            className="min-w-[44px] min-h-[44px] text-neutral-400 hover:text-neutral-600 transition-all duration-200 p-3 rounded-xl hover:bg-neutral-100 flex items-center justify-center active:scale-95"
            aria-label="Close sign in modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Enhanced SignIn Component */}
        <SignIn
          appearance={{
            elements: {
              rootBox: "mx-auto w-full",
              card: "bg-transparent shadow-none border-0 w-full",
              headerTitle: "text-xl md:text-2xl font-bold text-neutral-800 mb-2 text-center",
              headerSubtitle: "text-neutral-600 text-sm text-center mb-4",
              socialButtonsBlockButton: "border border-neutral-200/60 hover:bg-neutral-50 rounded-xl transition-all duration-200 text-neutral-700 min-h-[48px] w-full font-medium shadow-sm hover:shadow-md active:scale-98",
              socialButtonsBlockButtonText: "font-medium text-base",
              socialButtonsProviderIcon: "w-5 h-5",
              dividerLine: "bg-neutral-200",
              dividerText: "text-neutral-500 text-sm",
              formButtonPrimary: "bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 rounded-xl font-medium transition-all duration-200 shadow-lg hover:shadow-xl min-h-[48px] w-full active:scale-98",
              formFieldInput: "border border-neutral-200/60 rounded-xl focus:border-primary-400 focus:ring-2 focus:ring-primary-200 transition-all duration-200 bg-white/80 backdrop-blur-sm min-h-[48px] px-4 text-base",
              formFieldLabel: "text-neutral-700 font-medium text-sm mb-2",
              footerActionLink: "text-primary-600 hover:text-primary-700 font-medium transition-colors duration-200 text-center block py-2",
              identityPreviewText: "text-neutral-600",
              formResendCodeLink: "text-primary-600 hover:text-primary-700 font-medium min-h-[44px] flex items-center justify-center",
              otpCodeFieldInput: "border border-neutral-200/60 rounded-xl focus:border-primary-400 focus:ring-2 focus:ring-primary-200 min-h-[48px] text-center text-lg font-medium",
              formFieldAction: "min-h-[44px] flex items-center justify-center",
              formFieldSuccessText: "text-green-600 text-sm text-center",
              formFieldErrorText: "text-red-600 text-sm",
              alertError: "bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm",
              loadingIcon: "w-5 h-5"
            },
            variables: {
              colorPrimary: "#6366f1",
              colorBackground: "transparent",
              colorInputBackground: "rgba(255, 255, 255, 0.8)",
              colorInputText: "#374151",
              borderRadius: "12px",
              spacingUnit: "1rem",
              fontFamily: "inherit"
            }
          }}
          routing="hash"
          afterSignInUrl={selectedQuestion ? `/chat?question=${encodeURIComponent(selectedQuestion)}` : "/chat"}
        />
      </Modal>
    </div>
  )
}