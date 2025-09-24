'use client'

// =================================================================
// IMPORTS - All necessary dependencies for the modern chat interface
// =================================================================
import { useState, useRef, useEffect, Suspense } from 'react'
import { useAuth, UserButton } from '@clerk/nextjs'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import {
  MessageCircle,
  Menu,
  X,
  Plus,
  Trash2,
  Search,
  Download,
  ShoppingCart,
  User,
  Clock,
  Zap,
  Globe,
  Shield
} from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { ToastProvider, useToast, useToastActions } from '@/components/ui/Toast'

const ensureHttps = (url: string): string => {
  if (!url) return url
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url
  }
  return `https://${url}`
}

// =================================================================
// TYPE DEFINITIONS - Interface definitions for data structures
// =================================================================
interface Source {
  title: string
  author?: string
  chunk_id: string
  amazon_url?: string
  resource_url?: string
  download_enabled: boolean
  contact_person?: string
  contact_email?: string
}

interface Message {
  id: string
  type: 'user' | 'assistant'
  content: string
  sources?: Source[]
  timestamp: Date
  isStreaming?: boolean
}

interface ChatSession {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  messageCount: number
}

interface Conversation {
  id: string
  question: string
  answer: string
  sources: Source[]
  created_at: string
}

// =================================================================
// MAIN CHAT COMPONENT - The primary modern chat interface
// =================================================================
function ChatPageContent() {
  // =================================================================
  // AUTHENTICATION HOOKS - Handle user authentication state
  // =================================================================
  const { isLoaded, userId } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { success: showSuccessToast, error: showErrorToast } = useToastActions()
  
  // =================================================================
  // CHAT STATE MANAGEMENT - Core chat functionality state
  // =================================================================
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  
  // =================================================================
  // SESSION STATE MANAGEMENT - Chat session handling state
  // =================================================================
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [currentSessionTitle, setCurrentSessionTitle] = useState('New Chat')
  const [loadingSessions, setLoadingSessions] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(true)

  // =================================================================
  // STREAMING STATE - Handle real-time response streaming
  // =================================================================
  const [isStreaming, setIsStreaming] = useState(false)

  // =================================================================
  // CONTACT MODAL STATE - Handle contact form functionality
  // =================================================================
  const [showContactModal, setShowContactModal] = useState(false)
  const [contactInfo, setContactInfo] = useState<{
    person: string
    email: string
    documentTitle: string
  } | null>(null)
  const [contactForm, setContactForm] = useState({
    senderName: '',
    senderEmail: '',
    subject: '',
    message: ''
  })
  const [sendingContact, setSendingContact] = useState(false)

  // =================================================================
  // FEEDBACK MODAL STATE - Handle beta feedback functionality
  // =================================================================
  const [showFeedbackModal, setShowFeedbackModal] = useState(false)
  const [feedbackForm, setFeedbackForm] = useState({
    name: '',
    email: '',
    message: ''
  })
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false)
  const [feedbackSubmitStatus, setFeedbackSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle')

  // =================================================================
  // AUTHENTICATION EFFECT - Redirect unauthenticated users
  // =================================================================
  useEffect(() => {
    if (isLoaded && !userId) {
      router.push('/sign-in')
    }
  }, [isLoaded, userId, router])

  // =================================================================
  // SESSION LOADING EFFECT - Load user's chat sessions on mount
  // =================================================================
  useEffect(() => {
    if (userId) {
      loadSessions()
    }
  }, [userId])

  // =================================================================
  // PREFILLED QUESTION EFFECT - Handle question from landing page
  // =================================================================
  useEffect(() => {
    const questionParam = searchParams.get('question')
    if (questionParam && currentSessionId && !loading) {
      setInput(decodeURIComponent(questionParam))
      // Clear the URL parameter
      const newUrl = '/chat'
      window.history.replaceState({}, '', newUrl)
    }
  }, [searchParams, currentSessionId, loading])

  // =================================================================
  // AUTO-SCROLL EFFECT - Scroll to bottom when new messages arrive
  // =================================================================
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // =================================================================
  // GLOBAL EDGE SWIPE GESTURE HANDLER - Allow opening sidebar from anywhere
  // =================================================================
  useEffect(() => {
    let isHandlingSwipe = false

    const handleTouchStart = (e: TouchEvent) => {
      const startX = e.touches[0].clientX
      const startY = e.touches[0].clientY

      // Only handle swipes from the left edge (first 20px)
      if (startX > 20 || sidebarOpen || isHandlingSwipe) return

      isHandlingSwipe = true
      let moved = false

      const handleTouchMove = (moveEvent: TouchEvent) => {
        const currentX = moveEvent.touches[0].clientX
        const currentY = moveEvent.touches[0].clientY
        const diffX = currentX - startX
        const diffY = Math.abs(currentY - startY)

        // Ignore if moved too much vertically (likely scrolling)
        if (diffY > 50) {
          cleanup()
          return
        }

        moved = true

        // Open sidebar if swiped right by more than 80px
        if (diffX > 80 && !sidebarOpen) {
          setSidebarOpen(true)
          cleanup()
        }
      }

      const handleTouchEnd = () => {
        cleanup()
      }

      const cleanup = () => {
        isHandlingSwipe = false
        document.removeEventListener('touchmove', handleTouchMove)
        document.removeEventListener('touchend', handleTouchEnd)
      }

      document.addEventListener('touchmove', handleTouchMove, { passive: true })
      document.addEventListener('touchend', handleTouchEnd, { passive: true })
    }

    // Only add global gesture on mobile devices
    if (window.innerWidth < 768) {
      document.addEventListener('touchstart', handleTouchStart, { passive: true })
    }

    return () => {
      document.removeEventListener('touchstart', handleTouchStart)
    }
  }, [sidebarOpen])

  // AUTO-RESIZE TEXTAREA - Reset height when input is cleared
  // =================================================================
  useEffect(() => {
    if (!input) {
      const textarea = document.querySelector('textarea')
      if (textarea) {
        textarea.style.height = 'auto'
      }
    }
  }, [input])

  // =================================================================
  // FEEDBACK FORM HANDLERS - Handle beta feedback submission
  // =================================================================
  const handleFeedbackInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFeedbackForm(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleFeedbackSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmittingFeedback(true)
    setFeedbackSubmitStatus('idle')

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: 'patmoseducationgroup@gmail.com',
          contactPerson: 'Heaven.Earth Team',
          documentTitle: 'Beta Testing Feedback',
          senderName: feedbackForm.name,
          senderEmail: feedbackForm.email,
          subject: 'Beta Feedback - Heaven.Earth',
          message: feedbackForm.message
        }),
      })

      if (response.ok) {
        showSuccessToast('Thank you for your feedback! This helps us improve the system.')
        setFeedbackForm({ name: '', email: '', message: '' })
        setShowFeedbackModal(false)
        setFeedbackSubmitStatus('idle')
      } else {
        showErrorToast('There was an error sending your feedback. Please try again.')
        setFeedbackSubmitStatus('error')
      }
    } catch (error) {
      showErrorToast('There was an error sending your feedback. Please try again.')
      setFeedbackSubmitStatus('error')
    } finally {
      setIsSubmittingFeedback(false)
    }
  }

  // =================================================================
  // CONTACT FORM HANDLER - Send contact email
  // =================================================================
  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!contactInfo) return
    
    setSendingContact(true)
    
    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: contactInfo.email,
          contactPerson: contactInfo.person,
          documentTitle: contactInfo.documentTitle,
          senderName: contactForm.senderName,
          senderEmail: contactForm.senderEmail,
          subject: contactForm.subject,
          message: contactForm.message
        })
      })
      
      const data = await response.json()
      
      if (data.success) {
        showSuccessToast('Your message has been sent successfully!')
        setShowContactModal(false)
        setContactInfo(null)
        setContactForm({ senderName: '', senderEmail: '', subject: '', message: '' })
      } else {
        showErrorToast(data.error || 'Failed to send message')
      }
    } catch (err) {
      showErrorToast('Failed to send contact message')
    } finally {
      setSendingContact(false)
    }
  }
  
  // =================================================================
  // SESSION MANAGEMENT FUNCTIONS - All chat session operations
  // =================================================================
  const loadSessions = async () => {
    try {
      const response = await fetch('/api/chat/sessions')
      const data = await response.json()

      if (data.success) {
        setSessions(data.sessions)

        if (!currentSessionId && data.sessions.length > 0) {
          loadSession(data.sessions[0].id)
        } else if (!currentSessionId && data.sessions.length === 0) {
          createNewSession()
        }
      } else {
        setError(data.error)
      }
    } catch (err) {
      setError('Failed to load chat sessions')
    } finally {
      setLoadingSessions(false)
    }
  }

  const loadSession = async (sessionId: string) => {
    try {
      const response = await fetch(`/api/chat/sessions/${sessionId}`)
      const data = await response.json()

      if (data.success) {
        setCurrentSessionId(sessionId)
        setCurrentSessionTitle(data.session.title)

        const conversationMessages: Message[] = []
        data.conversations.forEach((conv: Conversation) => {
          conversationMessages.push({
            id: `user-${conv.id}`,
            type: 'user',
            content: conv.question,
            timestamp: new Date(conv.created_at)
          })

          conversationMessages.push({
            id: `assistant-${conv.id}`,
            type: 'assistant',
            content: conv.answer,
            sources: conv.sources,
            timestamp: new Date(conv.created_at)
          })
        })

        setMessages(conversationMessages)
        setError(null)
      } else {
        setError(data.error)
      }
    } catch (err) {
      setError('Failed to load conversation')
    }
  }

  const createNewSession = async (title?: string) => {
    try {
      const response = await fetch('/api/chat/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ title: title || 'New Chat' })
      })

      const data = await response.json()

      if (data.success) {
        setCurrentSessionId(data.session.id)
        setCurrentSessionTitle(data.session.title)
        setMessages([])
        setError(null)

        await loadSessions()
      } else {
        setError(data.error)
      }
    } catch (err) {
      setError('Failed to create new chat')
    }
  }

  const updateSessionTitle = async (sessionId: string, newTitle: string) => {
    try {
      const response = await fetch(`/api/chat/sessions/${sessionId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ title: newTitle })
      })

      if (response.ok) {
        setCurrentSessionTitle(newTitle)
        loadSessions()
      }
    } catch (err) {
      // Silent error handling for session title updates
    }
  }

  const deleteSession = async (sessionId: string) => {
    if (!confirm('Are you sure you want to delete this conversation? This action cannot be undone.')) {
      return
    }

    try {
      const response = await fetch(`/api/chat/sessions/${sessionId}`, {
        method: 'DELETE'
      })

      const data = await response.json()

      if (data.success) {
        if (sessionId === currentSessionId) {
          setCurrentSessionId(null)
          setCurrentSessionTitle('New Chat')
          setMessages([])
        }

        await loadSessions()
      } else {
        setError(data.error)
      }
    } catch (err) {
      setError('Failed to delete conversation')
    }
  }

  // =================================================================
  // STREAMING CHAT MESSAGE HANDLING - Real-time chat functionality
  // =================================================================
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || loading || !currentSessionId) return

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: input.trim(),
      timestamp: new Date()
    }

    setMessages(prev => [...prev, userMessage])
    const questionText = input.trim()
    setInput('')
    setLoading(true)
    setIsStreaming(true)
    setError(null)

    const assistantMessageId = (Date.now() + 1).toString()
    const assistantMessage: Message = {
      id: assistantMessageId,
      type: 'assistant',
      content: '',
      timestamp: new Date(),
      isStreaming: true
    }

    setMessages(prev => [...prev, assistantMessage])

    // Timeout and cleanup management
    let updateInterval: NodeJS.Timeout | null = null
    let timeoutId: NodeJS.Timeout | null = null
    let isStreamComplete = false

    const cleanup = () => {
      if (updateInterval) {
        clearInterval(updateInterval)
        updateInterval = null
      }
      if (timeoutId) {
        clearTimeout(timeoutId)
        timeoutId = null
      }
    }

    try {
      // Create AbortController for request timeout
      const abortController = new AbortController()
      
      // Set overall timeout for the entire request (2 minutes)
      timeoutId = setTimeout(() => {
        abortController.abort()
      }, 120000)

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          question: questionText,
          sessionId: currentSessionId 
        }),
        signal: abortController.signal
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`HTTP ${response.status}: ${errorText}`)
      }

      // Check if response is actually streaming
      const contentType = response.headers.get('content-type')
      if (!contentType?.includes('text/plain') && !contentType?.includes('text/event-stream')) {
        // Handle non-streaming JSON response
        const jsonResponse = await response.json()
        
        setMessages(prev => prev.map(msg => 
          msg.id === assistantMessageId
            ? { 
                ...msg, 
                content: jsonResponse.answer || 'No response received',
                sources: jsonResponse.sources || [],
                isStreaming: false
              }
            : msg
        ))
        
        isStreamComplete = true
        return
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) {
        throw new Error('No response body available for streaming')
      }

      let streamedContent = ''
      let sources: Source[] = []
      let buffer = ''
      const streamStartTime = Date.now()

      const batchUpdate = () => {
        if (buffer && !isStreamComplete) {
          streamedContent += buffer
          buffer = ''
          
          setMessages(prev => prev.map(msg => 
            msg.id === assistantMessageId
              ? { ...msg, content: streamedContent }
              : msg
          ))
        }
      }

      updateInterval = setInterval(batchUpdate, 50)

      // Stream reading with additional safety checks
      let consecutiveEmptyChunks = 0
      const maxEmptyChunks = 100 // Prevent infinite loops on empty streams
      
      while (!isStreamComplete) {
        // Add timeout check for stream reading
        if (Date.now() - streamStartTime > 90000) {
          break
        }

        try {
          const { done, value } = await reader.read()
          
          if (done) {
            batchUpdate() // Final update
            break
          }

          if (!value || value.length === 0) {
            consecutiveEmptyChunks++
            if (consecutiveEmptyChunks > maxEmptyChunks) {
              break
            }
            continue
          }

          consecutiveEmptyChunks = 0
          const chunk = decoder.decode(value, { stream: true })
          
          if (!chunk.trim()) {
            continue // Skip empty chunks
          }

          const lines = chunk.split('\n').filter(line => line.trim())

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const dataStr = line.slice(6).trim()
                if (!dataStr) continue
                
                const data = JSON.parse(dataStr)
                
                if (data.type === 'chunk' && data.content) {
                  buffer += data.content
                } else if (data.type === 'sources' && data.sources) {
                  sources = data.sources
                } else if (data.type === 'complete') {
                  isStreamComplete = true
                  batchUpdate() // Final update
                  
                  setMessages(prev => prev.map(msg => 
                    msg.id === assistantMessageId
                      ? { 
                          ...msg, 
                          content: streamedContent + buffer || data.fullResponse || 'No content received',
                          sources: sources,
                          isStreaming: false
                        }
                      : msg
                  ))
                  break
                } else if (data.type === 'error') {
                  isStreamComplete = true
                  throw new Error(data.error || 'Stream error occurred')
                }
              } catch (parseError) {
                // Continue processing other lines instead of failing completely
              }
            }
          }
        } catch (readError) {
          break
        }
      }

      // Ensure we have some content even if stream didn't complete properly
      if (!isStreamComplete && (streamedContent || buffer)) {
        setMessages(prev => prev.map(msg =>
          msg.id === assistantMessageId
            ? {
                ...msg,
                content: streamedContent + buffer,
                sources: sources,
                isStreaming: false
              }
            : msg
        ))
      }

      if (messages.length === 0 && currentSessionTitle === 'New Chat') {
        const newTitle = questionText.length > 50 
          ? questionText.substring(0, 47) + '...'
          : questionText
        updateSessionTitle(currentSessionId, newTitle)
      }
      
      loadSessions()

    } catch (err) {
      let errorMessage = 'Failed to get response'
      if (err instanceof Error) {
        if (err.name === 'AbortError') {
          errorMessage = 'Request timed out - please try again'
        } else {
          errorMessage = err.message
        }
      }

      setError(errorMessage)

      // Remove the failed assistant message
      setMessages(prev => prev.filter(msg => msg.id !== assistantMessageId))
    } finally {
      cleanup()
      setLoading(false)
      setIsStreaming(false)
    }
  }

  // =================================================================
  // UTILITY FUNCTIONS - Helper functions for UI
  // =================================================================
  const handleNewChatClick = () => {
    createNewSession()
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    
    if (days === 0) return 'Today'
    if (days === 1) return 'Yesterday'
    if (days < 7) return `${days} days ago`
    return date.toLocaleDateString()
  }

  // =================================================================
  // LOADING STATE - Show loading spinner while authenticating
  // =================================================================
  if (!isLoaded || !userId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-200 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-400 to-primary-500 flex items-center justify-center text-white text-2xl font-bold mb-4 mx-auto animate-pulse shadow-2xl">
            H.E
          </div>
          <div className="text-neutral-600 text-lg font-medium">
            Loading your workspace...
          </div>
        </div>
      </div>
    )
  }

  // =================================================================
  // MAIN UI RENDER - Complete modern chat interface layout
  // =================================================================
  return (
    <div className="flex flex-col h-screen bg-white overflow-hidden">
      
      {/* Modern Beta Banner */}
      <div className="bg-gradient-to-r from-primary-400 to-primary-600 text-white px-6 py-3 text-center text-sm font-medium relative overflow-hidden">
        <div className="absolute inset-0 bg-white/10 animate-pulse"></div>
        <div className="relative flex items-center justify-center gap-3">
          <span className="bg-secondary-400 text-neutral-800 px-3 py-1 rounded-full text-xs font-bold tracking-wider">
            BETA
          </span>
          <span>This system is in beta testing - Your feedback helps us improve</span>
          <button
            onClick={() => setShowFeedbackModal(true)}
            className="bg-gradient-to-r from-white/20 to-white/10 hover:from-white/30 hover:to-white/20 px-4 py-2 rounded-lg font-semibold border border-white/30 text-white cursor-pointer transition-all duration-200 min-h-[36px]"
          >
            Share Feedback
          </button>
        </div>
      </div>


      <div className="flex flex-1 overflow-hidden">
        {/* Enhanced Mobile Backdrop Overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-30 md:hidden transition-all duration-300 ease-out"
            onClick={() => setSidebarOpen(false)}
            onTouchStart={() => setSidebarOpen(false)}
            aria-label="Close sidebar"
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                setSidebarOpen(false)
              }
            }}
          />
        )}

        {/* Enhanced Mobile Animated Sidebar with Gesture Support */}
        <div
          className={`bg-white border-r border-neutral-200 transition-all duration-300 ease-out flex flex-col overflow-hidden shadow-2xl md:shadow-none ${
            sidebarOpen
              ? 'w-80 fixed inset-y-0 left-0 z-40 md:static md:w-64 transform translate-x-0'
              : 'w-0 md:w-0 fixed inset-y-0 left-0 z-40 md:static transform -translate-x-full md:translate-x-0'
          }`}
          onTouchStart={(e) => {
            const startX = e.touches[0].clientX
            const handleTouchMove = (moveEvent: TouchEvent) => {
              const currentX = moveEvent.touches[0].clientX
              const diff = currentX - startX

              // Close sidebar if swiped left by more than 100px
              if (diff < -100 && sidebarOpen) {
                setSidebarOpen(false)
                document.removeEventListener('touchmove', handleTouchMove)
                document.removeEventListener('touchend', handleTouchEnd)
              }
            }

            const handleTouchEnd = () => {
              document.removeEventListener('touchmove', handleTouchMove)
              document.removeEventListener('touchend', handleTouchEnd)
            }

            document.addEventListener('touchmove', handleTouchMove, { passive: true })
            document.addEventListener('touchend', handleTouchEnd, { passive: true })
          }}
        >
          <div className={`transition-opacity duration-300 flex flex-col h-full ${sidebarOpen ? 'opacity-100' : 'opacity-0'}`}>
            {/* New Chat Button */}
            <div className="p-4 border-b border-neutral-200">
              <button
                onClick={handleNewChatClick}
                className="w-full bg-gradient-to-r from-primary-400 to-primary-600 text-white px-4 py-3 rounded-xl font-medium flex items-center gap-3 shadow-lg border-none cursor-pointer transition-all duration-200 hover:shadow-xl hover:scale-105"
              >
                <Plus size={20} />
                New Conversation
              </button>
            </div>

            {/* Search Bar */}
            <div className="p-4 border-b border-neutral-200">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
                <input
                  type="text"
                  placeholder="Search conversations..."
                  className="w-full bg-neutral-50 text-neutral-900 pl-10 pr-4 py-2 rounded-lg border border-neutral-300 outline-none transition-colors duration-200 text-sm focus:border-primary-400 focus:ring-2 focus:ring-primary-400/20"
                />
              </div>
            </div>

            {/* Sessions List */}
            <div className="flex-1 overflow-y-auto p-2">
              {loadingSessions ? (
                <div className="p-4 text-neutral-600 text-center">
                  <div className="w-6 h-6 border-2 border-slate-400 border-t-transparent rounded-full mx-auto mb-2 animate-spin"></div>
                  Loading conversations...
                </div>
              ) : sessions.length === 0 ? (
                <div className="p-4 text-neutral-600 text-center">
                  <MessageCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  No conversations yet
                </div>
              ) : (
                sessions.map((session, index) => (
                  <div
                    key={session.id}
                    className={`group p-4 rounded-xl mb-2 cursor-pointer transition-all duration-200 animate-slide-up border ${
                      session.id === currentSessionId
                        ? 'bg-primary-400/10 border-primary-400/30'
                        : 'bg-transparent border-transparent hover:bg-neutral-50'
                    }`}
                    style={{ animationDelay: `${index * 100}ms` }}
                    onClick={() => loadSession(session.id)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-neutral-900 font-medium text-sm mb-1 overflow-hidden text-ellipsis whitespace-nowrap transition-colors duration-200 hover:text-primary-400">
                          {session.title}
                        </h3>
                        <p className="text-neutral-600 text-xs my-2">
                          {formatDate(session.updatedAt)} • {session.messageCount} messages
                        </p>
                        <div className="flex items-center gap-2">
                          <MessageCircle className="w-3 h-3 text-neutral-600" />
                          <span className="text-xs text-neutral-600">{session.messageCount}</span>
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          deleteSession(session.id)
                        }}
                        className="opacity-0 group-hover:opacity-100 md:opacity-100 text-neutral-400 bg-transparent border-none cursor-pointer min-w-[44px] min-h-[44px] p-2 flex items-center justify-center transition-all duration-200 hover:text-red-500 hover:bg-red-50 rounded-lg"
                        aria-label={`Delete conversation: ${session.title}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Sidebar Footer */}
            <div className="border-t border-neutral-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-400 to-primary-500 flex items-center justify-center text-white font-bold text-sm">
                    H.E
                  </div>
                  <div>
                    <div className="text-sm font-medium text-neutral-900">Heaven.Earth</div>
                    <div className="text-xs text-neutral-600">Knowledge Assistant</div>
                  </div>
                </div>
                <UserButton afterSignOutUrl="/" />
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowFeedbackModal(true)}
                  className="flex-1 bg-gradient-to-r from-primary-400 to-primary-600 text-white px-3 py-3 rounded-lg text-xs font-medium border-none cursor-pointer transition-all duration-200 hover:shadow-lg hover:scale-105 min-h-[44px]"
                >
                  Feedback
                </button>
                <Link
                  href="/admin"
                  className="flex-1 text-xs text-neutral-600 bg-neutral-100 hover:bg-neutral-200 px-3 py-3 rounded-lg no-underline font-medium text-center transition-colors duration-200 min-h-[44px] flex items-center justify-center"
                >
                  Admin Tools
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col relative">
          {/* Enhanced Mobile Menu Button */}
          <div className="md:hidden bg-white border-b border-neutral-200 px-4 py-3">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="min-w-[48px] min-h-[48px] p-3 rounded-xl bg-gradient-to-r from-neutral-50 to-neutral-100 border border-neutral-200 text-neutral-700 cursor-pointer transition-all duration-200 hover:from-neutral-100 hover:to-neutral-150 hover:shadow-lg flex items-center justify-center active:scale-95"
                aria-label={sidebarOpen ? "Close sidebar menu" : "Open sidebar menu"}
                onTouchStart={(e) => {
                  const startX = e.touches[0].clientX

                  const handleTouchMove = (moveEvent: TouchEvent) => {
                    const currentX = moveEvent.touches[0].clientX
                    const diff = currentX - startX

                    // Open sidebar if swiped right by more than 50px from left edge
                    if (diff > 50 && startX < 50 && !sidebarOpen) {
                      setSidebarOpen(true)
                      document.removeEventListener('touchmove', handleTouchMove)
                      document.removeEventListener('touchend', handleTouchEnd)
                    }
                  }

                  const handleTouchEnd = () => {
                    document.removeEventListener('touchmove', handleTouchMove)
                    document.removeEventListener('touchend', handleTouchEnd)
                  }

                  document.addEventListener('touchmove', handleTouchMove, { passive: true })
                  document.addEventListener('touchend', handleTouchEnd, { passive: true })
                }}
              >
                <div className={`transform transition-transform duration-300 ${sidebarOpen ? 'rotate-180' : 'rotate-0'}`}>
                  {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
                </div>
              </button>

              {/* Mobile App Title */}
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-400 to-primary-500 flex items-center justify-center text-white font-bold text-sm">
                  H.E
                </div>
                <h1 className="text-lg font-semibold text-neutral-800">Heaven.Earth</h1>
              </div>

              {/* Mobile User Button */}
              <div className="min-w-[48px] min-h-[48px] flex items-center justify-center">
                <UserButton afterSignOutUrl="/" />
              </div>
            </div>
          </div>

          {/* Messages Container - COMPLETELY FIXED */}
          <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4 md:py-6">
            <div className="max-w-4xl mx-auto flex flex-col gap-4 md:gap-6">
            {messages.length === 0 && !loading && (
              <div className="text-center py-20">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-400 to-primary-500 flex items-center justify-center text-white text-2xl font-bold mb-6 mx-auto animate-pulse shadow-2xl">
                  H.E
                </div>
                <h3 className="text-xl font-semibold text-neutral-800 mb-2">
                  Welcome to Heaven.Earth
                </h3>
                <p className="text-neutral-600 text-lg">
                  Ask any question about our knowledge base to get started
                </p>
              </div>
            )}

            {/* Chat Messages - FIXED ALIGNMENT */}
            {messages.map((message, index) => (
              <div
                key={message.id}
                className={`flex w-full animate-slide-up ${
                  message.type === 'user' ? 'justify-end' : 'justify-start'
                }`}
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <div className={`${
                  message.type === 'user' ? 'max-w-2xl' : 'w-full'
                }`}>
                  <div
                    className={`rounded-2xl p-4 md:p-6 shadow-lg ${
                      message.type === 'user'
                        ? 'bg-gradient-to-br from-primary-400 to-primary-500 text-white'
                        : 'bg-white border border-neutral-200 text-neutral-900'
                    }`}
                  >
                    {/* Message Content */}
                    {message.type === 'assistant' ? (
                      <div>
                        <ReactMarkdown
                          components={{
                            p: ({children}) => <div className="mb-3 text-neutral-700">{children}</div>,
                            strong: ({children}) => <strong className="font-semibold text-neutral-800">{children}</strong>,
                            ul: ({children}) => <ul className="list-disc pl-6 mb-3 flex flex-col gap-1">{children}</ul>,
                            ol: ({children}) => <ol className="list-decimal pl-6 mb-3 flex flex-col gap-1">{children}</ol>,
                            li: ({children}) => <li className="text-neutral-700">{children}</li>,
                            h1: ({children}) => <h1 className="text-xl font-semibold text-neutral-800 mb-3">{children}</h1>,
                            h2: ({children}) => <h2 className="text-lg font-semibold text-neutral-800 mb-3">{children}</h2>,
                            h3: ({children}) => <h3 className="text-base font-semibold text-neutral-800 mb-2">{children}</h3>,
                            code: ({children}) => <code className="bg-neutral-100 px-2 py-0.5 rounded text-sm font-mono text-neutral-800">{children}</code>
                          }}
                        >
                          {message.content}
                        </ReactMarkdown>

                        {/* Streaming Cursor */}
                        {message.isStreaming && (
                          <span className="inline-block w-0.5 h-5 ml-1 bg-primary-400 animate-pulse" />
                        )}
                      </div>
                    ) : (
                      <div className="whitespace-pre-wrap text-white/95">
                        {message.content}
                      </div>
                    )}

                    {/* Enhanced Source Citations */}
                    {message.sources && message.sources.length > 0 && !message.isStreaming && (
                      <div className="mt-6 pt-4 border-t border-neutral-200/30">
                        <div className="text-sm font-semibold text-neutral-700 mb-3 flex items-center gap-2">
                          <Globe className="w-4 h-4" />
                          Sources:
                        </div>
                        <div className="flex flex-col gap-3">
                          {message.sources.map((source, i) => (
                            <div
                              key={i}
                              className="bg-neutral-50/80 rounded-xl p-4 border border-neutral-200/40 transition-all duration-200 animate-slide-up hover:shadow-lg"
                              style={{ animationDelay: `${i * 0.1}s` }}
                            >
                              <div className="flex items-start justify-between mb-3">
                                <div>
                                  <h4 className="font-semibold text-neutral-800 text-sm m-0">
                                    {source.title}
                                  </h4>
                                  {source.author && (
                                    <p className="text-xs text-neutral-600 mt-1 m-0">
                                      by {source.author}
                                    </p>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-2 flex-wrap">
                                {source.amazon_url && (
                                  <a
                                    href={ensureHttps(source.amazon_url)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-2 px-4 py-3 text-xs font-medium rounded-lg no-underline transition-all duration-200 bg-gradient-to-r from-primary-400/20 to-primary-400/10 text-primary-600 border border-primary-400/30 hover:scale-105 min-h-[44px]"
                                  >
                                    <ShoppingCart className="w-3 h-3" />
                                    Store
                                  </a>
                                )}

                                {source.resource_url && source.download_enabled && (
                                  <a
                                    href={ensureHttps(source.resource_url)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-2 px-4 py-3 text-xs font-medium rounded-lg no-underline transition-all duration-200 bg-gradient-to-r from-secondary-400/20 to-secondary-400/10 text-secondary-600 border border-secondary-400/30 hover:scale-105 min-h-[44px]"
                                  >
                                    <Download className="w-3 h-3" />
                                    Download
                                  </a>
                                )}

                                {source.contact_person && source.contact_email && (
                                  <button
                                    onClick={() => {
                                      setContactInfo({
                                        person: source.contact_person!,
                                        email: source.contact_email!,
                                        documentTitle: source.title
                                      })
                                      setShowContactModal(true)
                                    }}
                                    className="inline-flex items-center gap-2 px-4 py-3 text-xs font-medium text-neutral-600 bg-white rounded-lg border border-slate-300 cursor-pointer transition-all duration-200 hover:text-neutral-800 hover:border-slate-400 hover:scale-105 min-h-[44px]"
                                  >
                                    <User className="w-3 h-3" />
                                    Contact {source.contact_person}
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Message Timestamp */}
                    <div className={`text-xs mt-3 flex items-center gap-1 ${
                      message.type === 'user' ? 'text-white/70' : 'text-neutral-400'
                    }`}>
                      <Clock className="w-3 h-3" />
                      {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {/* Modern Loading Animation */}
            {isStreaming && (
              <div className="flex w-full">
                <div className="w-full max-w-4xl">
                  <div className="w-full flex justify-start">
                    <div className="max-w-3xl bg-white border border-neutral-200 rounded-2xl p-6 shadow-lg">
                  <div className="flex items-center gap-3">
                    <div className="flex gap-1">
                      {[0, 1, 2].map(i => (
                        <div
                          key={i}
                          className="w-2 h-2 rounded-full bg-primary-400 animate-bounce"
                          style={{ animationDelay: `${i * 0.2}s` }}
                        ></div>
                      ))}
                    </div>
                    <span className="text-sm text-neutral-700 flex items-center gap-2 animate-pulse">
                      <Zap className="w-4 h-4" />
                      AI is thinking...
                    </span>
                  </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="flex w-full">
                <div className="w-full max-w-4xl mx-auto">
                  <div className="w-full flex justify-start">
                    <div className="max-w-3xl bg-red-50 border border-red-200 text-red-600 p-6 rounded-xl text-center shadow-lg">
                <div className="flex items-center justify-center gap-2">
                  <Shield className="w-5 h-5" />
                  {error}
                </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Modern Input Area */}
          <div className="bg-white border-t border-neutral-200 flex justify-center">
            <div className="w-full max-w-4xl px-4 md:px-6 py-4 md:py-6">
              <div className="max-w-4xl w-full">
                <textarea
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value)
                    // Auto-resize textarea
                    const textarea = e.target as HTMLTextAreaElement
                    textarea.style.height = 'auto'
                    textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px'
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSubmit(e as React.FormEvent)
                    }
                  }}
                  placeholder="Ask a question about the documents..."
                  disabled={loading || !currentSessionId || isStreaming}
                  rows={1}
                  className="w-full p-4 md:p-6 bg-neutral-50 border border-neutral-300 rounded-2xl resize-none outline-none text-sm md:text-base text-neutral-900 min-h-12 md:min-h-14 max-h-50 transition-all duration-200 focus:ring-2 focus:ring-primary-400/50 focus:border-primary-400"
                  style={{ overflow: 'hidden' }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Enhanced Feedback Modal */}
      <Modal
        isOpen={showFeedbackModal}
        onClose={() => setShowFeedbackModal(false)}
        title="Beta Feedback"
        size="md"
      >
        <div className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Name
            </label>
            <input
              type="text"
              name="name"
              value={feedbackForm.name}
              onChange={handleFeedbackInputChange}
              required
              className="w-full p-4 bg-white/80 backdrop-blur-xl border border-neutral-200/60 rounded-xl text-sm outline-none transition-all duration-200 focus:border-primary-400 focus:ring-2 focus:ring-primary-400/50"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Email
            </label>
            <input
              type="email"
              name="email"
              value={feedbackForm.email}
              onChange={handleFeedbackInputChange}
              required
              className="w-full p-4 bg-white/80 backdrop-blur-xl border border-neutral-200/60 rounded-xl text-sm outline-none transition-all duration-200 focus:border-primary-400 focus:ring-2 focus:ring-primary-400/50"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Feedback
            </label>
            <textarea
              name="message"
              value={feedbackForm.message}
              onChange={handleFeedbackInputChange}
              required
              rows={4}
              placeholder="Share your thoughts, bugs you've found, or suggestions for improvement..."
              className="w-full p-4 bg-white/80 backdrop-blur-xl border border-neutral-200/60 rounded-xl text-sm outline-none resize-vertical transition-all duration-200 focus:border-primary-400 focus:ring-2 focus:ring-primary-400/50"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowFeedbackModal(false)}
              className="flex-1 px-4 py-3 border border-slate-300 text-neutral-700 rounded-xl bg-white cursor-pointer text-sm font-medium transition-all duration-200 hover:bg-neutral-50"
            >
              Cancel
            </button>
            <button
              onClick={handleFeedbackSubmit}
              disabled={isSubmittingFeedback}
              className={`flex-1 px-4 py-3 rounded-xl border-none text-sm font-medium transition-all duration-200 ${
                isSubmittingFeedback
                  ? 'bg-neutral-300 text-neutral-600 cursor-not-allowed'
                  : 'bg-gradient-to-r from-primary-400 to-primary-600 text-white cursor-pointer hover:scale-105'
              }`}
            >
              {isSubmittingFeedback ? 'Sending...' : 'Send Feedback'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Enhanced Contact Modal */}
      <Modal
        isOpen={showContactModal && !!contactInfo}
        onClose={() => {
          setShowContactModal(false)
          setContactInfo(null)
          setContactForm({ senderName: '', senderEmail: '', subject: '', message: '' })
        }}
        title={contactInfo ? `Contact ${contactInfo.person}` : 'Contact'}
        size="lg"
      >
        {contactInfo && (
          <>
            <p className="text-sm text-neutral-600 mb-6">
              Send a message about &ldquo;{contactInfo.documentTitle}&rdquo;
            </p>

            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-700">
                    Your Name *
                  </label>
                  <input
                    type="text"
                    value={contactForm.senderName}
                    onChange={(e) => setContactForm(prev => ({ ...prev, senderName: e.target.value }))}
                    required
                    className="w-full p-3 bg-white/80 border border-neutral-200/60 rounded-lg text-sm outline-none transition-all duration-200 focus:border-primary-400 focus:ring-2 focus:ring-primary-400/50"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-700">
                    Your Email *
                  </label>
                  <input
                    type="email"
                    value={contactForm.senderEmail}
                    onChange={(e) => setContactForm(prev => ({ ...prev, senderEmail: e.target.value }))}
                    required
                    className="w-full p-3 bg-white/80 border border-neutral-200/60 rounded-lg text-sm outline-none transition-all duration-200 focus:border-primary-400 focus:ring-2 focus:ring-primary-400/50"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 text-gray-700">
                  Subject *
                </label>
                <input
                  type="text"
                  value={contactForm.subject}
                  onChange={(e) => setContactForm(prev => ({ ...prev, subject: e.target.value }))}
                  required
                  placeholder="Question about the document..."
                  className="w-full p-3 bg-white/80 border border-neutral-200/60 rounded-lg text-sm outline-none transition-all duration-200 focus:border-primary-400 focus:ring-2 focus:ring-primary-400/50"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 text-gray-700">
                  Message *
                </label>
                <textarea
                  value={contactForm.message}
                  onChange={(e) => setContactForm(prev => ({ ...prev, message: e.target.value }))}
                  required
                  rows={4}
                  placeholder="Your question or comment..."
                  className="w-full p-3 bg-white/80 border border-neutral-200/60 rounded-lg text-sm outline-none resize-vertical transition-all duration-200 focus:border-primary-400 focus:ring-2 focus:ring-primary-400/50"
                />
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowContactModal(false)
                    setContactInfo(null)
                    setContactForm({ senderName: '', senderEmail: '', subject: '', message: '' })
                  }}
                  disabled={sendingContact}
                  className={`px-4 py-3 text-sm text-neutral-600 bg-white border border-slate-300 rounded-lg transition-all duration-200 ${
                    sendingContact ? 'cursor-not-allowed' : 'cursor-pointer hover:bg-neutral-50'
                  }`}
                >
                  Cancel
                </button>
                <button
                  onClick={handleContactSubmit}
                  disabled={sendingContact}
                  className={`px-4 py-3 text-sm border-none rounded-lg transition-all duration-200 ${
                    sendingContact
                      ? 'bg-neutral-300 text-neutral-600 cursor-not-allowed'
                      : 'bg-gradient-to-r from-primary-400 to-primary-600 text-white cursor-pointer hover:scale-105'
                  }`}
                >
                  {sendingContact ? 'Sending...' : 'Send Message'}
                </button>
              </div>
            </div>
          </>
        )}
      </Modal>

    </div>
  )
}

export default function ModernChatPage() {
  return (
    <ToastProvider>
      <Suspense fallback={
        <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
          <div className="text-neutral-600">Loading chat...</div>
        </div>
      }>
        <ChatPageContent />
      </Suspense>
    </ToastProvider>
  )
}