'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Menu, X, User, Settings, Shield, LogOut } from 'lucide-react'
import Link from 'next/link'
import { logError } from '@/lib/logger'
import { ToastProvider, useToastActions } from '@/components/ui/Toast'
import { ChatErrorBoundary } from '@/components/ErrorBoundary'

// Import extracted components
import { ChatSidebar } from '@/components/chat/ChatSidebar'
import { ChatMessages } from '@/components/chat/ChatMessages'
import { ChatInput } from '@/components/chat/ChatInput'
import { FeedbackModal, ContactModal } from '@/components/chat/ChatModals'

// =================================================================
// LOCAL TYPES (matching page structure)
// =================================================================
interface Source {
  title: string
  author?: string
  chunk_id: string
  document_id: string
  has_file: boolean
  file_size?: number
  amazon_url?: string
  resource_url?: string
  download_enabled: boolean
  contact_person?: string
  contact_email?: string
}

interface DocumentDownload {
  format: 'pdf' | 'pptx' | 'xlsx'
  filename: string
  downloadUrl: string
  size: number
  expiresAt: string
}

interface Message {
  id: string
  type: 'user' | 'assistant'
  content: string
  sources?: Source[]
  timestamp: Date
  isStreaming?: boolean
  document?: DocumentDownload
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
// MAIN CHAT COMPONENT
// =================================================================
function ChatPageContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { success: showSuccessToast, error: showErrorToast } = useToastActions()

  // =================================================================
  // AUTH & UI STATE
  // =================================================================
  const [canAdmin, setCanAdmin] = useState(false)
  const [isAuthChecking, setIsAuthChecking] = useState(true)
  const [showUserDropdown, setShowUserDropdown] = useState(false)
  // Start closed on mobile, open on desktop (set properly in useEffect to avoid hydration mismatch)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // =================================================================
  // CHAT STATE
  // =================================================================
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isStreaming, setIsStreaming] = useState(false)

  // =================================================================
  // SESSION STATE
  // =================================================================
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [currentSessionTitle, setCurrentSessionTitle] = useState('New Chat')
  const [loadingSessions, setLoadingSessions] = useState(true)

  // =================================================================
  // MODAL STATE
  // =================================================================
  const [showFeedbackModal, setShowFeedbackModal] = useState(false)
  const [feedbackForm, setFeedbackForm] = useState({ name: '', email: '', message: '' })
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false)

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
  // SESSION MANAGEMENT
  // =================================================================
  const loadSessions = useCallback(async () => {
    try {
      const response = await fetch('/api/chat/sessions')
      const data = await response.json()
      if (data.success) {
        setSessions(data.sessions)
      } else {
        setError(data.error)
      }
    } catch (err) {
      logError(err instanceof Error ? err : new Error('Failed to load sessions'), {})
      setError('Failed to load chat sessions')
    } finally {
      setLoadingSessions(false)
    }
  }, [])

  const loadSession = useCallback(async (sessionId: string) => {
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
      logError(err instanceof Error ? err : new Error('Failed to load session'), {})
      setError('Failed to load conversation')
    }
  }, [])

  const createNewSession = useCallback(async (title?: string) => {
    try {
      const response = await fetch('/api/chat/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      logError(err instanceof Error ? err : new Error('Failed to create session'), {})
      setError('Failed to create new chat')
    }
  }, [loadSessions])

  const updateSessionTitle = useCallback(async (sessionId: string, newTitle: string) => {
    try {
      const response = await fetch(`/api/chat/sessions/${sessionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle })
      })

      if (response.ok) {
        setCurrentSessionTitle(newTitle)
        loadSessions()
      }
    } catch (err) {
      logError(err instanceof Error ? err : new Error('Failed to update title'), {})
    }
  }, [loadSessions])

  const deleteSession = useCallback(async (sessionId: string) => {
    if (!confirm('Are you sure you want to delete this conversation? This action cannot be undone.')) {
      return
    }

    try {
      const response = await fetch(`/api/chat/sessions/${sessionId}`, { method: 'DELETE' })
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
      logError(err instanceof Error ? err : new Error('Failed to delete session'), {})
      setError('Failed to delete conversation')
    }
  }, [currentSessionId, loadSessions])

  // =================================================================
  // CHAT SUBMISSION
  // =================================================================
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || loading || isStreaming) return

    // Auto-create session if needed
    let sessionId = currentSessionId
    if (!sessionId) {
      try {
        const response = await fetch('/api/chat/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: 'New Chat' })
        })
        const data = await response.json()
        if (data.success) {
          sessionId = data.session.id
          setCurrentSessionId(sessionId)
          setCurrentSessionTitle(data.session.title)
          setMessages([])
          await loadSessions()
        } else {
          setError('Failed to create chat session')
          return
        }
      } catch (err) {
        logError(err instanceof Error ? err : new Error('Failed to create session'), {})
        setError('Failed to create chat session')
        return
      }
    }

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

    let timeoutId: NodeJS.Timeout | null = null

    try {
      const abortController = new AbortController()
      timeoutId = setTimeout(() => abortController.abort(), 120000)

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: questionText, sessionId }),
        signal: abortController.signal
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`HTTP ${response.status}: ${errorText}`)
      }

      const contentType = response.headers.get('content-type')
      if (!contentType?.includes('text/plain') && !contentType?.includes('text/event-stream')) {
        const jsonResponse = await response.json()
        setMessages(prev => prev.map(msg =>
          msg.id === assistantMessageId
            ? { ...msg, content: jsonResponse.answer || 'No response received', sources: jsonResponse.sources || [], isStreaming: false }
            : msg
        ))
        return
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) throw new Error('No response body')

      let streamedContent = ''
      let sources: Source[] = []
      let documentDownload: DocumentDownload | undefined

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n').filter(line => line.trim())

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6).trim())

              if (data.type === 'chunk' && data.content) {
                streamedContent += data.content
                setMessages(prev => prev.map(msg =>
                  msg.id === assistantMessageId ? { ...msg, content: streamedContent } : msg
                ))
              } else if (data.type === 'sources') {
                sources = data.sources
              } else if (data.type === 'document') {
                documentDownload = {
                  format: data.format,
                  filename: data.filename,
                  downloadUrl: data.downloadUrl,
                  size: data.size,
                  expiresAt: data.expiresAt
                }
              } else if (data.type === 'complete') {
                setMessages(prev => prev.map(msg =>
                  msg.id === assistantMessageId
                    ? { ...msg, content: streamedContent || data.fullResponse, sources, document: documentDownload, isStreaming: false }
                    : msg
                ))
              } else if (data.type === 'error') {
                throw new Error(data.error)
              }
            } catch {
              // Skip parse errors
            }
          }
        }
      }

      // Update session title if first message
      if (messages.length === 0 && currentSessionTitle === 'New Chat' && sessionId) {
        const newTitle = questionText.length > 50 ? questionText.substring(0, 47) + '...' : questionText
        updateSessionTitle(sessionId, newTitle)
      }

      loadSessions()

    } catch (err) {
      let errorMessage = 'Failed to get response'
      if (err instanceof Error) {
        errorMessage = err.name === 'AbortError' ? 'Request timed out - please try again' : err.message
      }
      setError(errorMessage)
      setMessages(prev => prev.filter(msg => msg.id !== assistantMessageId))
    } finally {
      if (timeoutId) clearTimeout(timeoutId)
      setLoading(false)
      setIsStreaming(false)
    }
  }, [input, loading, isStreaming, currentSessionId, currentSessionTitle, messages.length, loadSessions, updateSessionTitle])

  // =================================================================
  // HANDLERS
  // =================================================================
  const handleDocumentDownload = useCallback(async (documentId: string, title: string) => {
    try {
      const response = await fetch(`/api/documents/download/${documentId}`)
      if (!response.ok) throw new Error('Failed to generate download URL')

      const data = await response.json()
      const link = document.createElement('a')
      link.href = data.url
      link.download = data.filename || title
      link.target = '_blank'
      link.rel = 'noopener noreferrer'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (err) {
      logError(err instanceof Error ? err : new Error('Download failed'), {})
      alert('Failed to download document. Please try again.')
    }
  }, [])

  const handleSignOut = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/signout', { method: 'POST' })
      if (response.ok) {
        router.push('/')
      } else {
        showErrorToast('Failed to sign out. Please try again.')
      }
    } catch (err) {
      logError(err instanceof Error ? err : new Error('Sign out failed'), {})
      showErrorToast('Failed to sign out. Please try again.')
    }
  }, [router, showErrorToast])

  const handleFeedbackSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmittingFeedback(true)

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: 'admin@multiplytools.app',
          contactPerson: 'Multiply Tools Team',
          documentTitle: 'Beta Testing Feedback',
          senderName: feedbackForm.name,
          senderEmail: feedbackForm.email,
          subject: 'Beta Feedback - Multiply Tools',
          message: feedbackForm.message
        })
      })

      if (response.ok) {
        showSuccessToast('Thank you for your feedback!')
        setFeedbackForm({ name: '', email: '', message: '' })
        setShowFeedbackModal(false)
      } else {
        showErrorToast('Error sending feedback. Please try again.')
      }
    } catch (err) {
      logError(err instanceof Error ? err : new Error('Feedback failed'), {})
      showErrorToast('Error sending feedback. Please try again.')
    } finally {
      setIsSubmittingFeedback(false)
    }
  }, [feedbackForm, showSuccessToast, showErrorToast])

  const handleContactSubmit = useCallback(async (e: React.FormEvent) => {
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
      logError(err instanceof Error ? err : new Error('Contact failed'), {})
      showErrorToast('Failed to send contact message')
    } finally {
      setSendingContact(false)
    }
  }, [contactInfo, contactForm, showSuccessToast, showErrorToast])

  // =================================================================
  // EFFECTS
  // =================================================================

  // Open sidebar on desktop after mount (avoid hydration mismatch)
  useEffect(() => {
    if (window.innerWidth >= 768) {
      setSidebarOpen(true)
    }
  }, [])

  useEffect(() => {
    const initialize = async () => {
      try {
        await Promise.all([
          loadSessions(),
          fetch('/api/user/can-admin')
            .then(res => res.json())
            .then(data => setCanAdmin(data.canAdmin))
            .catch(() => setCanAdmin(false))
        ])
      } finally {
        setIsAuthChecking(false)
      }
    }
    initialize()
  }, [loadSessions])

  useEffect(() => {
    const questionParam = searchParams.get('question')
    if (questionParam && currentSessionId && !loading) {
      setInput(decodeURIComponent(questionParam))
      window.history.replaceState({}, '', '/chat')
    }
  }, [searchParams, currentSessionId, loading])

  useEffect(() => {
    if (!input) {
      const textarea = document.querySelector('textarea')
      if (textarea) textarea.style.height = 'auto'
    }
  }, [input])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (showUserDropdown && !(e.target as HTMLElement).closest('[aria-label="User menu"]')) {
        setShowUserDropdown(false)
      }
    }

    if (showUserDropdown) {
      document.addEventListener('click', handleClickOutside)
      return () => document.removeEventListener('click', handleClickOutside)
    }
  }, [showUserDropdown])

  // Global edge swipe
  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      const startX = e.touches[0].clientX
      if (startX > 20 || sidebarOpen) return

      const handleTouchMove = (moveEvent: TouchEvent) => {
        const currentX = moveEvent.touches[0].clientX
        if (currentX - startX > 80 && !sidebarOpen) {
          setSidebarOpen(true)
          cleanup()
        }
      }

      const handleTouchEnd = () => cleanup()

      const cleanup = () => {
        document.removeEventListener('touchmove', handleTouchMove)
        document.removeEventListener('touchend', handleTouchEnd)
      }

      document.addEventListener('touchmove', handleTouchMove, { passive: true })
      document.addEventListener('touchend', handleTouchEnd, { passive: true })
    }

    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      document.addEventListener('touchstart', handleTouchStart, { passive: true })
    }

    return () => document.removeEventListener('touchstart', handleTouchStart)
  }, [sidebarOpen])

  // =================================================================
  // LOADING STATE
  // =================================================================
  if (isAuthChecking) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-200 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-400 to-primary-500 flex items-center justify-center text-white text-2xl font-bold mb-4 mx-auto animate-pulse shadow-2xl">
            MT
          </div>
          <div className="text-neutral-600 text-lg font-medium">Loading your workspace...</div>
        </div>
      </div>
    )
  }

  // =================================================================
  // RENDER
  // =================================================================
  return (
    <div className="flex flex-col h-screen bg-white overflow-hidden">
      {/* Beta Banner */}
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
        {/* Sidebar */}
        <ChatSidebar
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
          sessions={sessions}
          currentSessionId={currentSessionId}
          loadingSessions={loadingSessions}
          showUserDropdown={showUserDropdown}
          setShowUserDropdown={setShowUserDropdown}
          canAdmin={canAdmin}
          onNewChat={() => createNewSession()}
          onLoadSession={loadSession}
          onDeleteSession={deleteSession}
          onSignOut={handleSignOut}
          onFeedbackClick={() => setShowFeedbackModal(true)}
        />

        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col relative">
          {/* Mobile Header */}
          <div className="md:hidden bg-white border-b border-neutral-200 px-4 py-3">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="min-w-[48px] min-h-[48px] p-3 rounded-xl bg-gradient-to-r from-neutral-50 to-neutral-100 border border-neutral-200 text-neutral-700 cursor-pointer transition-all duration-200"
                aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
              >
                {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
              </button>

              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-400 to-primary-500 flex items-center justify-center text-white font-bold text-sm">
                  MT
                </div>
                <h1 className="text-lg font-semibold text-neutral-800">Multiply Tools</h1>
              </div>

              <div className="min-w-[48px] min-h-[48px] flex items-center justify-center relative">
                <button
                  onClick={() => setShowUserDropdown(!showUserDropdown)}
                  className="w-10 h-10 rounded-lg bg-gradient-to-br from-secondary-400 to-secondary-500 flex items-center justify-center text-white font-bold cursor-pointer border-none"
                  aria-label="User menu"
                >
                  <User className="w-5 h-5" />
                </button>
                {showUserDropdown && (
                  <div className="absolute top-full right-0 mt-2 w-48 bg-white rounded-lg shadow-xl border border-neutral-200 py-2 z-50">
                    <Link href="/settings" className="w-full px-4 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50 flex items-center gap-2 no-underline">
                      <Settings className="w-4 h-4" />
                      Settings
                    </Link>
                    {canAdmin && (
                      <Link href="/admin" className="w-full px-4 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50 flex items-center gap-2 no-underline">
                        <Shield className="w-4 h-4" />
                        Admin
                      </Link>
                    )}
                    <button onClick={handleSignOut} className="w-full px-4 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50 flex items-center gap-2 bg-transparent border-none cursor-pointer">
                      <LogOut className="w-4 h-4" />
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Messages */}
          <ChatMessages
            messages={messages}
            loading={loading}
            isStreaming={isStreaming}
            error={error}
            onContactClick={(info) => {
              setContactInfo(info)
              setShowContactModal(true)
            }}
            onDownloadClick={handleDocumentDownload}
          />

          {/* Input */}
          <ChatInput
            input={input}
            setInput={setInput}
            onSubmit={handleSubmit}
            loading={loading}
            isStreaming={isStreaming}
          />
        </div>
      </div>

      {/* Modals */}
      <FeedbackModal
        isOpen={showFeedbackModal}
        onClose={() => setShowFeedbackModal(false)}
        form={feedbackForm}
        onInputChange={(e) => {
          const { name, value } = e.target
          setFeedbackForm(prev => ({ ...prev, [name]: value }))
        }}
        onSubmit={handleFeedbackSubmit}
        isSubmitting={isSubmittingFeedback}
      />

      <ContactModal
        isOpen={showContactModal}
        contactInfo={contactInfo}
        onClose={() => {
          setShowContactModal(false)
          setContactInfo(null)
          setContactForm({ senderName: '', senderEmail: '', subject: '', message: '' })
        }}
        form={contactForm}
        onFormChange={(field, value) => setContactForm(prev => ({ ...prev, [field]: value }))}
        onSubmit={handleContactSubmit}
        isSending={sendingContact}
      />
    </div>
  )
}

export default function ModernChatPage() {
  return (
    <ChatErrorBoundary>
      <ToastProvider>
        <Suspense fallback={
          <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
            <div className="text-neutral-600">Loading chat...</div>
          </div>
        }>
          <ChatPageContent />
        </Suspense>
      </ToastProvider>
    </ChatErrorBoundary>
  )
}
