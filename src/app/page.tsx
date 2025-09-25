'use client'

import { useState, useMemo } from 'react'
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

// All available question options with icons and descriptions
const ALL_QUESTION_OPTIONS = [
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
  },
  {
    id: 'muslim-neighbors',
    question: 'How do I share the gospel with my Muslim neighbors?',
    description: 'Gain biblical insight and practical tools for loving, respectful evangelism among Muslims.',
    icon: Heart,
    color: 'from-orange-400 to-red-500'
  },
  {
    id: 'making-disciples',
    question: 'What does the Bible teach about making disciples?',
    description: 'Learn the scriptural mandate and Christ-centered practices for multiplying faithful disciples.',
    icon: Book,
    color: 'from-purple-400 to-indigo-500'
  },
  {
    id: 'young-people-missions',
    question: 'How can I equip young people for global missions?',
    description: 'Discover strategies to inspire and prepare the next generation to take the gospel to the nations.',
    icon: Users,
    color: 'from-teal-400 to-cyan-500'
  },
  {
    id: 'prayer-mission',
    question: 'What role does prayer play in advancing God\'s mission?',
    description: 'Understand the power of intercession and how it fuels gospel breakthrough worldwide.',
    icon: Heart,
    color: 'from-rose-400 to-pink-500'
  },
  {
    id: 'persecuted-christians',
    question: 'How can I support persecuted Christians around the world?',
    description: 'Explore ways to pray, advocate, and provide tangible support to suffering believers.',
    icon: Globe,
    color: 'from-amber-400 to-orange-500'
  },
  {
    id: 'biblical-leadership',
    question: 'What are biblical models of leadership in ministry?',
    description: 'Study Christlike servant leadership patterns that strengthen churches and movements.',
    icon: Users,
    color: 'from-emerald-400 to-teal-500'
  },
  {
    id: 'unreached-people',
    question: 'How do I reach unreached people groups effectively?',
    description: 'Examine strategies and biblical convictions for taking the gospel where Christ is not yet known.',
    icon: Globe,
    color: 'from-blue-500 to-indigo-600'
  },
  {
    id: 'holistic-mission',
    question: 'What does holistic mission look like?',
    description: 'Learn how proclaiming the gospel integrates with mercy, justice, and community transformation.',
    icon: Church,
    color: 'from-violet-400 to-purple-500'
  },
  {
    id: 'church-nations-heart',
    question: 'How can my church develop a heart for the nations?',
    description: 'Find resources to mobilize your congregation toward global mission and the Great Commission.',
    icon: Church,
    color: 'from-lime-400 to-green-500'
  },
  {
    id: 'holy-spirit-mission',
    question: 'What is the role of the Holy Spirit in mission?',
    description: 'Understand how the Spirit empowers, guides, and sustains gospel ministry worldwide.',
    icon: Search,
    color: 'from-sky-400 to-blue-500'
  }
]

export default function LandingPage() {
  const { isLoaded, userId } = useAuth()
  const router = useRouter()
  const [selectedQuestion, setSelectedQuestion] = useState<string | null>(null)
  const [showAuth, setShowAuth] = useState(false)

  // Randomly select 3 questions from the pool on each page load
  const selectedQuestions = useMemo(() => {
    const shuffled = [...ALL_QUESTION_OPTIONS].sort(() => 0.5 - Math.random())
    return shuffled.slice(0, 3)
  }, [])

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
        <div className="mb-12 md:mb-16"></div>

        {/* Enhanced Question Options Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8 mb-12 md:mb-16">
          {selectedQuestions.map((option) => {
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

        {/* Continue to Chat Button */}
        {userId && (
          <div className="text-center mb-12 md:mb-16">
            <Button
              size="lg"
              onClick={() => router.push('/chat')}
              className="shadow-lg hover:shadow-xl min-h-[52px] px-8 text-base font-semibold active:scale-95"
            >
              <MessageCircle className="w-5 h-5 mr-2" />
              Continue to Chat
            </Button>
          </div>
        )}

      </div>

      {/* New Informational Section */}
      <div className="bg-gradient-to-br from-neutral-100/80 to-slate-200/60 py-12 md:py-16">
        <div className="max-w-6xl mx-auto px-4 md:px-6">
          <div className="text-center mb-8 md:mb-12">
            <div className="max-w-4xl mx-auto mb-8">
              <div className="bg-white/80 backdrop-blur-sm border-l-4 border-primary-500 rounded-r-xl p-6 md:p-8 shadow-lg">
                <div className="flex items-start gap-4">
                  <div className="text-primary-500 text-3xl md:text-4xl font-serif leading-none">&quot;</div>
                  <p className="text-base md:text-lg text-neutral-700 leading-relaxed italic">
                    We are honored to offer an extraordinary library of teachings, books, training, and resources crafted by champions of the faith—pastors, missionaries, spiritual fathers, and faithful practitioners who have given their lives to Christ&apos;s mission. Rooted in Scripture and tested through real ministry, these resources provide timeless wisdom, practical guidance, and gospel-driven insight that you won&apos;t find collected anywhere else. This is more than a knowledge base—it&apos;s a treasury to equip believers and churches to proclaim Jesus and make disciples in every nation.
                  </p>
                </div>
              </div>
            </div>
            <h2 className="text-2xl md:text-3xl font-bold text-neutral-800 mb-4">
              Explore Gospel-Centered Resources
            </h2>
            <p className="text-lg text-neutral-600 max-w-2xl mx-auto">
              Access Christ-focused tools to strengthen discipleship, proclaim the gospel, and equip the church for God&apos;s mission.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12">
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 text-white mb-4">
                <Globe className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-semibold text-neutral-800 mb-3">Global Missions</h3>
              <p className="text-neutral-600 leading-relaxed">
                Discover biblical strategies for world evangelization, cross-cultural ministry insights, and practical resources for sharing Christ with unreached peoples and communities.
              </p>
            </div>

            <div className="text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-green-600 text-white mb-4">
                <Book className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-semibold text-neutral-800 mb-3">Spiritual Growth</h3>
              <p className="text-neutral-600 leading-relaxed">
                Deepen your walk with Jesus through prayer, Bible study, gospel-centered teaching, and devotional resources that keep Christ at the center of life and faith.
              </p>
            </div>

            <div className="text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 text-white mb-4">
                <Users className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-semibold text-neutral-800 mb-3">Ministry Tools</h3>
              <p className="text-neutral-600 leading-relaxed">
                Equip yourself for the work of the gospel with resources for church planting, leadership development, pastoral care, and building faithful, Christ-exalting communities.
              </p>
            </div>
          </div>

          {!userId && (
            <div className="text-center mt-12 md:mt-16">
              <div className="max-w-md mx-auto">
                <h3 className="text-xl font-semibold text-neutral-800 mb-4">
                  Ready to begin?
                </h3>
                <p className="text-neutral-600 mb-6 leading-relaxed">
                  Sign in to access the full library and start equipping yourself to live out and proclaim the good news of Jesus Christ.
                </p>
                <Button
                  size="lg"
                  onClick={() => setShowAuth(true)}
                  className="shadow-lg hover:shadow-xl min-h-[52px] px-8 text-base font-semibold active:scale-95"
                >
                  <span className="flex items-center gap-2">
                    Get Started
                    <ArrowRight className="w-5 h-5" />
                  </span>
                </Button>
              </div>
            </div>
          )}
        </div>
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