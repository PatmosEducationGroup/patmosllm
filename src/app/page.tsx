'use client'

// =================================================================
// IMPORTS - All necessary dependencies for the modern chat interface
// =================================================================
import { useState, useRef, useEffect } from 'react'
import { useAuth, UserButton } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import { 
  MessageCircle, 
  Send, 
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
export default function ModernChatPage() {
  // =================================================================
  // AUTHENTICATION HOOKS - Handle user authentication state
  // =================================================================
  const { isLoaded, userId } = useAuth()
  const router = useRouter()
  
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
  // AUTO-SCROLL EFFECT - Scroll to bottom when new messages arrive
  // =================================================================
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

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
        setFeedbackSubmitStatus('success')
        setFeedbackForm({ name: '', email: '', message: '' })
        setTimeout(() => {
          setShowFeedbackModal(false)
          setFeedbackSubmitStatus('idle')
        }, 2000)
      } else {
        setFeedbackSubmitStatus('error')
      }
    } catch (error) {
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
        setShowContactModal(false)
        setContactInfo(null)
        setContactForm({ senderName: '', senderEmail: '', subject: '', message: '' })
      } else {
        setError(data.error || 'Failed to send message')
      }
    } catch (err) {
      setError('Failed to send contact message')
    } finally {
      setSendingContact(false)
    }
  }
  
  // =================================================================
  // SESSION MANAGEMENT FUNCTIONS - All chat session operations
  // =================================================================
  const loadSessions = async () => {
    console.log('loadSessions called')
    try {
      const response = await fetch('/api/chat/sessions')
      const data = await response.json()
      console.log('loadSessions response:', data)
      
      if (data.success) {
        setSessions(data.sessions)
        
        if (!currentSessionId && data.sessions.length > 0) {
          console.log('Loading most recent session:', data.sessions[0].id)
          loadSession(data.sessions[0].id)
        } else if (!currentSessionId && data.sessions.length === 0) {
          console.log('No sessions exist, creating first one')
          createNewSession()
        }
      } else {
        console.error('loadSessions error:', data.error)
        setError(data.error)
      }
    } catch (err) {
      console.error('loadSessions catch:', err)
      setError('Failed to load chat sessions')
    } finally {
      setLoadingSessions(false)
    }
  }

  const loadSession = async (sessionId: string) => {
    console.log('loadSession called with:', sessionId)
    try {
      const response = await fetch(`/api/chat/sessions/${sessionId}`)
      const data = await response.json()
      console.log('loadSession response:', data)
      
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
        console.error('loadSession error:', data.error)
        setError(data.error)
      }
    } catch (err) {
      console.error('loadSession catch:', err)
      setError('Failed to load conversation')
    }
  }

  const createNewSession = async (title?: string) => {
    console.log('createNewSession called with title:', title)
    
    try {
      console.log('Making POST request to /api/chat/sessions')
      const response = await fetch('/api/chat/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ title: title || 'New Chat' })
      })

      const data = await response.json()
      console.log('createNewSession response data:', data)

      if (data.success) {
        console.log('Session created successfully:', data.session)
        setCurrentSessionId(data.session.id)
        setCurrentSessionTitle(data.session.title)
        setMessages([])
        setError(null)
        
        await loadSessions()
      } else {
        console.error('createNewSession API error:', data.error)
        setError(data.error)
      }
    } catch (err) {
      console.error('createNewSession catch error:', err)
      setError('Failed to create new chat')
    }
  }

  const updateSessionTitle = async (sessionId: string, newTitle: string) => {
    console.log('updateSessionTitle called:', sessionId, newTitle)
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
      console.error('Failed to update session title:', err)
    }
  }

  const deleteSession = async (sessionId: string) => {
    if (!confirm('Are you sure you want to delete this conversation? This action cannot be undone.')) {
      return
    }

    console.log('deleteSession called with:', sessionId)
    try {
      const response = await fetch(`/api/chat/sessions/${sessionId}`, {
        method: 'DELETE'
      })

      const data = await response.json()
      console.log('deleteSession response:', data)

      if (data.success) {
        if (sessionId === currentSessionId) {
          setCurrentSessionId(null)
          setCurrentSessionTitle('New Chat')
          setMessages([])
        }
        
        await loadSessions()
      } else {
        console.error('deleteSession error:', data.error)
        setError(data.error)
      }
    } catch (err) {
      console.error('deleteSession catch:', err)
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
        console.error('Request timeout - aborting')
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
          console.error('Stream timeout - stopping read loop')
          break
        }

        try {
          const { done, value } = await reader.read()
          
          if (done) {
            console.log('Stream completed normally')
            batchUpdate() // Final update
            break
          }

          if (!value || value.length === 0) {
            consecutiveEmptyChunks++
            if (consecutiveEmptyChunks > maxEmptyChunks) {
              console.error('Too many empty chunks - stopping stream')
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
                console.error('Error parsing streaming data:', parseError, 'Raw line:', line)
                // Continue processing other lines instead of failing completely
              }
            }
          }
        } catch (readError) {
          console.error('Stream read error:', readError)
          break
        }
      }

      // Ensure we have some content even if stream didn't complete properly
      if (!isStreamComplete && (streamedContent || buffer)) {
        console.warn('Stream incomplete but has content - finalizing message')
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
      console.error('Streaming error:', err)
      
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
    console.log('New Chat button clicked!')
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
      <div style={{ 
        minHeight: '100vh', 
        background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div 
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '16px',
              background: 'linear-gradient(135deg, #82b3db 0%, #5a9bd4 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: '24px',
              fontWeight: 'bold',
              marginBottom: '16px',
              marginLeft: 'auto',
              marginRight: 'auto',
              animation: 'pulse 2s infinite',
              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.25)'
            }}
          >
            H.E
          </div>
          <div style={{ color: '#64748b', fontSize: '18px', fontWeight: '500' }}>
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
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      height: '100vh', 
      background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
      overflow: 'hidden'
    }}>
      
      {/* Modern Beta Banner */}
      <div 
        style={{ 
          background: 'linear-gradient(135deg, #82b3db 0%, #5a9bd4 100%)',
          color: 'white',
          padding: '12px 24px',
          textAlign: 'center',
          fontSize: '14px',
          fontWeight: '500',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        <div style={{ 
          position: 'absolute', 
          inset: 0, 
          background: 'rgba(255,255,255,0.1)', 
          animation: 'pulse 2s infinite' 
        }}></div>
        <div style={{ 
          position: 'relative', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          gap: '12px' 
        }}>
          <span style={{ 
            backgroundColor: '#9ecd55', 
            color: '#1e293b',
            padding: '4px 12px', 
            borderRadius: '9999px', 
            fontSize: '12px', 
            fontWeight: 'bold', 
            letterSpacing: '0.05em'
          }}>
            BETA
          </span>
          <span>This system is in beta testing - Your feedback helps us improve</span>
          <button
            onClick={() => setShowFeedbackModal(true)}
            style={{
              textDecoration: 'underline',
              fontWeight: '600',
              background: 'transparent',
              border: 'none',
              color: 'white',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'none'}
            onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'underline'}
          >
            Share Feedback
          </button>
        </div>
      </div>

      {/* Modern Header */}
      <header style={{ 
        background: 'rgba(255, 255, 255, 0.8)', 
        backdropFilter: 'blur(12px)', 
        borderBottom: '1px solid rgba(226, 232, 240, 0.4)', 
        padding: '16px 24px' 
      }}>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between', 
          maxWidth: '1280px', 
          margin: '0 auto' 
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div 
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #82b3db 0%, #5a9bd4 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontWeight: 'bold',
                fontSize: '18px',
                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.25)',
                cursor: 'pointer',
                transition: 'transform 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
              onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
            >
              H.E
            </div>
            <div>
              <h1 style={{ fontSize: '20px', fontWeight: 'bold', color: '#1e293b', margin: 0 }}>
                Heaven.Earth
              </h1>
              <p style={{ fontSize: '14px', color: '#64748b', margin: 0 }}>
                Knowledge Base Assistant
              </p>
            </div>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <button
              onClick={() => setShowFeedbackModal(true)}
              style={{
                background: 'linear-gradient(135deg, #82b3db 0%, #5a9bd4 100%)',
                color: 'white',
                padding: '8px 16px',
                borderRadius: '12px',
                fontSize: '14px',
                fontWeight: '500',
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.25)',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = '0 20px 40px -12px rgba(0, 0, 0, 0.25)'
                e.currentTarget.style.transform = 'scale(1.05)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = '0 10px 25px -5px rgba(0, 0, 0, 0.25)'
                e.currentTarget.style.transform = 'scale(1)'
              }}
            >
              Feedback
            </button>
            <Link
              href="/admin"
              style={{
                fontSize: '14px',
                color: '#64748b',
                textDecoration: 'none',
                fontWeight: '500',
                transition: 'color 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = '#1e293b'
                e.currentTarget.style.textDecoration = 'underline'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = '#64748b'
                e.currentTarget.style.textDecoration = 'none'
              }}
            >
              Admin Tools
            </Link>
            <UserButton afterSignOutUrl="/" />
          </div>
        </div>
      </header>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Modern Animated Sidebar */}
        <div 
          style={{ 
            width: sidebarOpen ? '320px' : '0px',
            background: 'linear-gradient(180deg, rgba(130, 179, 219, 0.1) 0%, rgba(158, 205, 85, 0.05) 100%), #1e293b',
            backdropFilter: 'blur(12px)',
            transition: 'all 0.3s ease-out',
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
            overflow: 'hidden'
          }}
        >
          <div style={{ 
            opacity: sidebarOpen ? 1 : 0, 
            transition: 'opacity 0.3s', 
            display: 'flex', 
            flexDirection: 'column', 
            height: '100%' 
          }}>
            {/* New Chat Button */}
            <div style={{ padding: '16px', borderBottom: '1px solid rgba(100, 116, 139, 0.5)' }}>
              <button
                onClick={handleNewChatClick}
                style={{
                  width: '100%',
                  background: 'linear-gradient(135deg, #82b3db 0%, #5a9bd4 100%)',
                  color: 'white',
                  padding: '12px 16px',
                  borderRadius: '12px',
                  fontWeight: '500',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.25)',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = '0 20px 40px -12px rgba(0, 0, 0, 0.25)'
                  e.currentTarget.style.transform = 'scale(1.02)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = '0 10px 25px -5px rgba(0, 0, 0, 0.25)'
                  e.currentTarget.style.transform = 'scale(1)'
                }}
              >
                <Plus size={20} />
                New Conversation
              </button>
            </div>

            {/* Search Bar */}
            <div style={{ padding: '16px', borderBottom: '1px solid rgba(100, 116, 139, 0.5)' }}>
              <div style={{ position: 'relative' }}>
                <Search 
                  style={{ 
                    position: 'absolute', 
                    left: '12px', 
                    top: '50%', 
                    transform: 'translateY(-50%)', 
                    width: '16px', 
                    height: '16px', 
                    color: '#94a3b8' 
                  }} 
                />
                <input
                  type="text"
                  placeholder="Search conversations..."
                  style={{
                    width: '100%',
                    background: 'rgba(30, 41, 59, 0.5)',
                    color: 'white',
                    paddingLeft: '40px',
                    paddingRight: '16px',
                    paddingTop: '8px',
                    paddingBottom: '8px',
                    borderRadius: '8px',
                    border: '1px solid rgba(100, 116, 139, 0.3)',
                    outline: 'none',
                    transition: 'border-color 0.2s',
                    fontSize: '14px'
                  }}
                  onFocus={(e) => e.currentTarget.style.borderColor = '#82b3db'}
                  onBlur={(e) => e.currentTarget.style.borderColor = 'rgba(100, 116, 139, 0.3)'}
                />
              </div>
            </div>

            {/* Sessions List */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
              {loadingSessions ? (
                <div style={{ padding: '16px', color: '#94a3b8', textAlign: 'center' }}>
                  <div style={{ 
                    width: '24px', 
                    height: '24px', 
                    border: '2px solid #94a3b8', 
                    borderTopColor: 'transparent', 
                    borderRadius: '50%', 
                    margin: '0 auto 8px', 
                    animation: 'spin 1s linear infinite' 
                  }}></div>
                  Loading conversations...
                </div>
              ) : sessions.length === 0 ? (
                <div style={{ padding: '16px', color: '#94a3b8', textAlign: 'center' }}>
                  <MessageCircle style={{ width: '32px', height: '32px', margin: '0 auto 8px', opacity: 0.5 }} />
                  No conversations yet
                </div>
              ) : (
                sessions.map((session, index) => (
                  <div
                    key={session.id}
                    style={{
                      padding: '16px',
                      borderRadius: '12px',
                      marginBottom: '8px',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      backgroundColor: session.id === currentSessionId ? 'rgba(100, 116, 139, 0.4)' : 'transparent',
                      border: session.id === currentSessionId ? '1px solid rgba(130, 179, 219, 0.2)' : '1px solid transparent',
                      animationDelay: `${index * 100}ms`,
                      animation: 'slideInLeft 0.5s ease-out forwards'
                    }}
                    onClick={() => loadSession(session.id)}
                    onMouseEnter={(e) => {
                      if (session.id !== currentSessionId) {
                        e.currentTarget.style.backgroundColor = 'rgba(100, 116, 139, 0.3)'
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (session.id !== currentSessionId) {
                        e.currentTarget.style.backgroundColor = 'transparent'
                      }
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'start', justifyContent: 'space-between' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <h3 style={{ 
                          color: 'white', 
                          fontWeight: '500', 
                          fontSize: '14px', 
                          marginBottom: '4px', 
                          overflow: 'hidden', 
                          textOverflow: 'ellipsis', 
                          whiteSpace: 'nowrap',
                          transition: 'color 0.2s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.color = '#9ecd55'}
                        onMouseLeave={(e) => e.currentTarget.style.color = 'white'}
                        >
                          {session.title}
                        </h3>
                        <p style={{ 
                          color: '#94a3b8', 
                          fontSize: '12px', 
                          marginBottom: '8px', 
                          margin: '8px 0' 
                        }}>
                          {formatDate(session.updatedAt)} • {session.messageCount} messages
                        </p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <MessageCircle style={{ width: '12px', height: '12px', color: '#64748b' }} />
                          <span style={{ fontSize: '12px', color: '#64748b' }}>{session.messageCount}</span>
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          deleteSession(session.id)
                        }}
                        style={{
                          opacity: 0,
                          color: '#94a3b8',
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          padding: '4px',
                          transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.color = '#ef4444'
                          e.currentTarget.style.opacity = '1'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color = '#94a3b8'
                        }}
                      >
                        <Trash2 style={{ width: '16px', height: '16px' }} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Main Chat Area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
          {/* Chat Header */}
          <div style={{ 
            background: 'rgba(255, 255, 255, 0.6)', 
            backdropFilter: 'blur(12px)', 
            borderBottom: '1px solid rgba(226, 232, 240, 0.4)', 
            padding: '16px 24px' 
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <button
                  onClick={() => setSidebarOpen(!sidebarOpen)}
                  style={{
                    padding: '8px',
                    borderRadius: '8px',
                    background: 'transparent',
                    border: 'none',
                    color: '#64748b',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
                </button>
                <div>
                  <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b', margin: 0 }}>
                    {currentSessionTitle}
                  </h2>
                  <p style={{ fontSize: '14px', color: '#64748b', margin: 0 }}>
                    AI Assistant • Online
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div 
                  style={{ 
                    width: '12px', 
                    height: '12px', 
                    borderRadius: '50%', 
                    backgroundColor: '#9ecd55',
                    animation: 'pulse 2s infinite'
                  }}
                ></div>
                <span style={{ fontSize: '14px', color: '#64748b' }}>Active</span>
              </div>
            </div>
          </div>

          {/* Messages Container */}
          <div style={{ 
            flex: 1, 
            overflowY: 'auto', 
            padding: '24px', 
            display: 'flex',
            flexDirection: 'column',
            gap: '24px'
          }}>
            {messages.length === 0 && !loading && (
              <div style={{ textAlign: 'center', paddingTop: '80px', paddingBottom: '80px' }}>
                <div 
                  style={{
                    width: '64px',
                    height: '64px',
                    borderRadius: '16px',
                    background: 'linear-gradient(135deg, #82b3db 0%, #5a9bd4 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontSize: '24px',
                    fontWeight: 'bold',
                    marginBottom: '24px',
                    marginLeft: 'auto',
                    marginRight: 'auto',
                    animation: 'pulse 2s infinite',
                    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.25)'
                  }}
                >
                  H.E
                </div>
                <h3 style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b', marginBottom: '8px' }}>
                  Welcome to Heaven.Earth
                </h3>
                <p style={{ color: '#64748b', fontSize: '18px' }}>
                  Ask any question about our knowledge base to get started
                </p>
              </div>
            )}

            {/* Chat Messages */}
            {messages.map((message, index) => (
              <div
                key={message.id}
                style={{
                  display: 'flex',
                  justifyContent: message.type === 'user' ? 'flex-end' : 'flex-start',
                  animation: `fadeInUp 0.5s ease-out ${index * 0.1}s both`
                }}
              >
                <div style={{ 
                  maxWidth: '896px', 
                  order: message.type === 'user' ? 2 : 1 
                }}>
                  <div
                    style={{
                      borderRadius: '16px',
                      padding: '24px',
                      boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.25)',
                      marginLeft: message.type === 'user' ? '48px' : '0',
                      marginRight: message.type === 'user' ? '0' : '48px',
                      background: message.type === 'user' 
                        ? 'linear-gradient(135deg, #82b3db 0%, #5a9bd4 100%)' 
                        : 'rgba(255, 255, 255, 0.8)',
                      backdropFilter: message.type === 'assistant' ? 'blur(12px)' : 'none',
                      border: message.type === 'assistant' ? '1px solid rgba(226, 232, 240, 0.4)' : 'none',
                      color: message.type === 'user' ? 'white' : '#1e293b'
                    }}
                  >
                    {/* Message Content */}
                    {message.type === 'assistant' ? (
                      <div>
                        <ReactMarkdown
                          components={{
                            p: ({children}) => <div style={{ marginBottom: '12px', color: '#334155' }}>{children}</div>,
                            strong: ({children}) => <strong style={{ fontWeight: '600', color: '#1e293b' }}>{children}</strong>,
                            ul: ({children}) => <ul style={{ listStyleType: 'disc', paddingLeft: '24px', marginBottom: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>{children}</ul>,
                            ol: ({children}) => <ol style={{ listStyleType: 'decimal', paddingLeft: '24px', marginBottom: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>{children}</ol>,
                            li: ({children}) => <li style={{ color: '#334155' }}>{children}</li>,
                            h1: ({children}) => <h1 style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b', marginBottom: '12px' }}>{children}</h1>,
                            h2: ({children}) => <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b', marginBottom: '12px' }}>{children}</h2>,
                            h3: ({children}) => <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', marginBottom: '8px' }}>{children}</h3>,
                            code: ({children}) => <code style={{ backgroundColor: '#f1f5f9', padding: '2px 8px', borderRadius: '4px', fontSize: '14px', fontFamily: 'monospace', color: '#1e293b' }}>{children}</code>
                          }}
                        >
                          {message.content}
                        </ReactMarkdown>
                        
                        {/* Streaming Cursor */}
                        {message.isStreaming && (
                          <span 
                            style={{ 
                              display: 'inline-block',
                              width: '2px',
                              height: '20px',
                              marginLeft: '4px',
                              backgroundColor: '#82b3db',
                              animation: 'pulse 2s infinite'
                            }}
                          />
                        )}
                      </div>
                    ) : (
                      <div style={{ whiteSpace: 'pre-wrap', color: 'rgba(255,255,255,0.95)' }}>
                        {message.content}
                      </div>
                    )}

                    {/* Enhanced Source Citations */}
                    {message.sources && message.sources.length > 0 && !message.isStreaming && (
                      <div style={{ 
                        marginTop: '24px', 
                        paddingTop: '16px', 
                        borderTop: '1px solid rgba(226, 232, 240, 0.3)' 
                      }}>
                        <div style={{ 
                          fontSize: '14px', 
                          fontWeight: '600', 
                          color: '#334155', 
                          marginBottom: '12px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px'
                        }}>
                          <Globe style={{ width: '16px', height: '16px' }} />
                          Sources:
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          {message.sources.map((source, i) => (
                            <div 
                              key={i} 
                              style={{ 
                                backgroundColor: 'rgba(248, 250, 252, 0.8)',
                                borderRadius: '12px',
                                padding: '16px',
                                border: '1px solid rgba(226, 232, 240, 0.4)',
                                transition: 'all 0.2s',
                                animation: `slideInRight 0.5s ease-out ${i * 0.1}s both`
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 10px 25px -5px rgba(0, 0, 0, 0.1)'}
                              onMouseLeave={(e) => e.currentTarget.style.boxShadow = 'none'}
                            >
                              <div style={{ 
                                display: 'flex', 
                                alignItems: 'start', 
                                justifyContent: 'space-between', 
                                marginBottom: '12px' 
                              }}>
                                <div>
                                  <h4 style={{ 
                                    fontWeight: '600', 
                                    color: '#1e293b', 
                                    fontSize: '14px', 
                                    margin: 0 
                                  }}>
                                    {source.title}
                                  </h4>
                                  {source.author && (
                                    <p style={{ 
                                      fontSize: '12px', 
                                      color: '#64748b', 
                                      marginTop: '4px', 
                                      margin: 0 
                                    }}>
                                      by {source.author}
                                    </p>
                                  )}
                                </div>
                              </div>
                              
                              <div style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '8px', 
                                flexWrap: 'wrap' 
                              }}>
                                {source.amazon_url && (
                                  <a
                                    href={ensureHttps(source.amazon_url)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '8px',
                                      padding: '6px 12px',
                                      fontSize: '12px',
                                      fontWeight: '500',
                                      borderRadius: '8px',
                                      textDecoration: 'none',
                                      transition: 'all 0.2s',
                                      background: 'linear-gradient(135deg, rgba(130, 179, 219, 0.2) 0%, rgba(130, 179, 219, 0.1) 100%)',
                                      color: '#82b3db',
                                      border: '1px solid rgba(130, 179, 219, 0.3)'
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
                                    onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                                  >
                                    <ShoppingCart style={{ width: '12px', height: '12px' }} />
                                    Store
                                  </a>
                                )}
                                
                                {source.resource_url && source.download_enabled && (
                                  <a
                                    href={ensureHttps(source.resource_url)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '8px',
                                      padding: '6px 12px',
                                      fontSize: '12px',
                                      fontWeight: '500',
                                      borderRadius: '8px',
                                      textDecoration: 'none',
                                      transition: 'all 0.2s',
                                      background: 'linear-gradient(135deg, rgba(158, 205, 85, 0.2) 0%, rgba(158, 205, 85, 0.1) 100%)',
                                      color: '#9ecd55',
                                      border: '1px solid rgba(158, 205, 85, 0.3)'
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
                                    onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                                  >
                                    <Download style={{ width: '12px', height: '12px' }} />
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
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '8px',
                                      padding: '6px 12px',
                                      fontSize: '12px',
                                      fontWeight: '500',
                                      color: '#64748b',
                                      backgroundColor: 'white',
                                      borderRadius: '8px',
                                      border: '1px solid #cbd5e1',
                                      cursor: 'pointer',
                                      transition: 'all 0.2s'
                                    }}
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.color = '#1e293b'
                                      e.currentTarget.style.borderColor = '#94a3b8'
                                      e.currentTarget.style.transform = 'scale(1.05)'
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.color = '#64748b'
                                      e.currentTarget.style.borderColor = '#cbd5e1'
                                      e.currentTarget.style.transform = 'scale(1)'
                                    }}
                                  >
                                    <User style={{ width: '12px', height: '12px' }} />
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
                    <div style={{
                      fontSize: '12px',
                      marginTop: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      color: message.type === 'user' ? 'rgba(255,255,255,0.7)' : '#94a3b8'
                    }}>
                      <Clock style={{ width: '12px', height: '12px' }} />
                      {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {/* Modern Loading Animation */}
            {isStreaming && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{
                  background: 'rgba(255, 255, 255, 0.8)',
                  backdropFilter: 'blur(12px)',
                  border: '1px solid rgba(226, 232, 240, 0.4)',
                  borderRadius: '16px',
                  padding: '24px',
                  boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.25)',
                  marginRight: '48px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {[0, 1, 2].map(i => (
                        <div
                          key={i}
                          style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            backgroundColor: '#82b3db',
                            animation: `bounce 1.4s ease-in-out ${i * 0.2}s infinite`
                          }}
                        ></div>
                      ))}
                    </div>
                    <span style={{ 
                      fontSize: '14px', 
                      color: '#64748b', 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '8px',
                      animation: 'pulse 2s infinite' 
                    }}>
                      <Zap style={{ width: '16px', height: '16px' }} />
                      AI is thinking...
                    </span>
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div style={{
                background: 'rgba(254, 242, 242, 0.8)',
                backdropFilter: 'blur(12px)',
                border: '1px solid #fecaca',
                color: '#dc2626',
                padding: '24px',
                borderRadius: '12px',
                textAlign: 'center',
                boxShadow: '0 10px 25px -5px rgba(220, 38, 38, 0.1)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                  <Shield style={{ width: '20px', height: '20px' }} />
                  {error}
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Modern Input Area */}
          <div style={{ 
            background: 'rgba(255, 255, 255, 0.6)', 
            backdropFilter: 'blur(12px)', 
            borderTop: '1px solid rgba(226, 232, 240, 0.4)', 
            padding: '24px' 
          }}>
            <div style={{ maxWidth: '896px', margin: '0 auto' }}>
              <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end' }}>
                <div style={{ flex: 1, position: 'relative' }}>
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        handleSubmit(e as React.FormEvent)
                      }
                    }}
                    placeholder="Ask a question about the documents..."
                    disabled={loading || !currentSessionId || isStreaming}
                    rows={1}
                    style={{
                      width: '100%',
                      padding: '24px',
                      background: 'rgba(255, 255, 255, 0.8)',
                      backdropFilter: 'blur(12px)',
                      border: '1px solid rgba(226, 232, 240, 0.6)',
                      borderRadius: '16px',
                      resize: 'none',
                      outline: 'none',
                      fontSize: '16px',
                      color: '#334155',
                      minHeight: '56px',
                      transition: 'all 0.2s'
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.outline = '2px solid rgba(130, 179, 219, 0.5)'
                      e.currentTarget.style.borderColor = '#82b3db'
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.outline = 'none'
                      e.currentTarget.style.borderColor = 'rgba(226, 232, 240, 0.6)'
                    }}
                  />
                </div>
                <button
                  onClick={handleSubmit}
                  disabled={loading || !input.trim() || !currentSessionId || isStreaming}
                  style={{
                    padding: '16px 24px',
                    borderRadius: '16px',
                    fontWeight: '500',
                    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    transition: 'all 0.2s',
                    border: 'none',
                    cursor: loading || !input.trim() || !currentSessionId || isStreaming ? 'not-allowed' : 'pointer',
                    background: loading || !input.trim() || !currentSessionId || isStreaming
                      ? '#cbd5e1'
                      : 'linear-gradient(135deg, #82b3db 0%, #5a9bd4 100%)',
                    color: loading || !input.trim() || !currentSessionId || isStreaming ? '#64748b' : 'white'
                  }}
                  onMouseEnter={(e) => {
                    if (!loading && input.trim() && currentSessionId && !isStreaming) {
                      e.currentTarget.style.boxShadow = '0 20px 40px -12px rgba(0, 0, 0, 0.25)'
                      e.currentTarget.style.transform = 'scale(1.05)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!loading && input.trim() && currentSessionId && !isStreaming) {
                      e.currentTarget.style.boxShadow = '0 10px 25px -5px rgba(0, 0, 0, 0.25)'
                      e.currentTarget.style.transform = 'scale(1)'
                    }
                  }}
                >
                  {loading ? (
                    <div style={{ 
                      width: '20px', 
                      height: '20px', 
                      border: '2px solid #94a3b8', 
                      borderTopColor: 'transparent', 
                      borderRadius: '50%', 
                      animation: 'spin 1s linear infinite' 
                    }}></div>
                  ) : (
                    <Send style={{ width: '20px', height: '20px' }} />
                  )}
                  {isStreaming ? 'Streaming...' : loading ? 'Sending...' : 'Send'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Feedback Modal */}
      {showFeedbackModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px',
          zIndex: 50
        }}>
          <div style={{
            background: 'rgba(255, 255, 255, 0.9)',
            backdropFilter: 'blur(12px)',
            borderRadius: '16px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            maxWidth: '512px',
            width: '100%',
            padding: '24px',
            border: '1px solid rgba(226, 232, 240, 0.4)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h3 style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b', margin: 0 }}>
                Beta Feedback
              </h3>
              <button
                onClick={() => setShowFeedbackModal(false)}
                style={{
                  color: '#94a3b8',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'color 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.color = '#64748b'}
                onMouseLeave={(e) => e.currentTarget.style.color = '#94a3b8'}
              >
                <X style={{ width: '24px', height: '24px' }} />
              </button>
            </div>

            {feedbackSubmitStatus === 'success' ? (
              <div style={{ textAlign: 'center', padding: '32px 0' }}>
                <div 
                  style={{
                    width: '64px',
                    height: '64px',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #82b3db 0%, #5a9bd4 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontSize: '24px',
                    margin: '0 auto 16px'
                  }}
                >
                  ✓
                </div>
                <h4 style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b', marginBottom: '8px' }}>
                  Thank you for your feedback!
                </h4>
                <p style={{ color: '#64748b' }}>This helps us improve the system.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={{ 
                    display: 'block', 
                    fontSize: '14px', 
                    fontWeight: '500', 
                    color: '#374151', 
                    marginBottom: '8px'
                  }}>
                    Name
                  </label>
                  <input
                    type="text"
                    name="name"
                    value={feedbackForm.name}
                    onChange={handleFeedbackInputChange}
                    required
                    style={{
                      width: '100%',
                      padding: '16px',
                      background: 'rgba(255, 255, 255, 0.8)',
                      backdropFilter: 'blur(12px)',
                      border: '1px solid rgba(226, 232, 240, 0.6)',
                      borderRadius: '12px',
                      fontSize: '14px',
                      outline: 'none',
                      transition: 'all 0.2s'
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = '#82b3db'
                      e.currentTarget.style.outline = '2px solid rgba(130, 179, 219, 0.5)'
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = 'rgba(226, 232, 240, 0.6)'
                      e.currentTarget.style.outline = 'none'
                    }}
                  />
                </div>

                <div>
                  <label style={{ 
                    display: 'block', 
                    fontSize: '14px', 
                    fontWeight: '500', 
                    color: '#374151', 
                    marginBottom: '8px'
                  }}>
                    Email
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={feedbackForm.email}
                    onChange={handleFeedbackInputChange}
                    required
                    style={{
                      width: '100%',
                      padding: '16px',
                      background: 'rgba(255, 255, 255, 0.8)',
                      backdropFilter: 'blur(12px)',
                      border: '1px solid rgba(226, 232, 240, 0.6)',
                      borderRadius: '12px',
                      fontSize: '14px',
                      outline: 'none',
                      transition: 'all 0.2s'
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = '#82b3db'
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = 'rgba(226, 232, 240, 0.6)'
                    }}
                  />
                </div>

                <div>
                  <label style={{ 
                    display: 'block', 
                    fontSize: '14px', 
                    fontWeight: '500', 
                    color: '#374151', 
                    marginBottom: '8px'
                  }}>
                    Feedback
                  </label>
                  <textarea
                    name="message"
                    value={feedbackForm.message}
                    onChange={handleFeedbackInputChange}
                    required
                    rows={4}
                    placeholder="Share your thoughts, bugs you've found, or suggestions for improvement..."
                    style={{
                      width: '100%',
                      padding: '16px',
                      background: 'rgba(255, 255, 255, 0.8)',
                      backdropFilter: 'blur(12px)',
                      border: '1px solid rgba(226, 232, 240, 0.6)',
                      borderRadius: '12px',
                      fontSize: '14px',
                      outline: 'none',
                      resize: 'vertical',
                      transition: 'all 0.2s'
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = '#82b3db'
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = 'rgba(226, 232, 240, 0.6)'
                    }}
                  />
                </div>

                {feedbackSubmitStatus === 'error' && (
                  <p style={{ color: '#dc2626', fontSize: '14px' }}>
                    There was an error sending your feedback. Please try again.
                  </p>
                )}

                <div style={{ display: 'flex', gap: '12px', paddingTop: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setShowFeedbackModal(false)}
                    style={{
                      flex: 1,
                      padding: '12px 16px',
                      border: '1px solid #cbd5e1',
                      color: '#334155',
                      borderRadius: '12px',
                      backgroundColor: 'white',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: '500',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleFeedbackSubmit}
                    disabled={isSubmittingFeedback}
                    style={{
                      flex: 1,
                      background: isSubmittingFeedback ? '#cbd5e1' : 'linear-gradient(135deg, #82b3db 0%, #5a9bd4 100%)',
                      color: isSubmittingFeedback ? '#64748b' : 'white',
                      padding: '12px 16px',
                      borderRadius: '12px',
                      border: 'none',
                      cursor: isSubmittingFeedback ? 'not-allowed' : 'pointer',
                      fontSize: '14px',
                      fontWeight: '500',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      if (!isSubmittingFeedback) e.currentTarget.style.transform = 'scale(1.05)'
                    }}
                    onMouseLeave={(e) => {
                      if (!isSubmittingFeedback) e.currentTarget.style.transform = 'scale(1)'
                    }}
                  >
                    {isSubmittingFeedback ? 'Sending...' : 'Send Feedback'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Contact Modal */}
      {showContactModal && contactInfo && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px',
          zIndex: 50
        }}>
          <div style={{
            background: 'rgba(255, 255, 255, 0.9)',
            backdropFilter: 'blur(12px)',
            borderRadius: '16px',
            padding: '24px',
            maxWidth: '500px',
            width: '100%',
            maxHeight: '90vh',
            overflowY: 'auto',
            border: '1px solid rgba(226, 232, 240, 0.4)'
          }}>
            <h3 style={{
              fontSize: '20px',
              fontWeight: '600',
              marginBottom: '8px',
              color: '#1e293b'
            }}>
              Contact {contactInfo.person}
            </h3>
            
            <p style={{
              fontSize: '14px',
              color: '#64748b',
              marginBottom: '24px'
            }}>
              Send a message about &ldquo;{contactInfo.documentTitle}&rdquo;
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: '500',
                    marginBottom: '8px',
                    color: '#374151'
                  }}>
                    Your Name *
                  </label>
                  <input
                    type="text"
                    value={contactForm.senderName}
                    onChange={(e) => setContactForm(prev => ({ ...prev, senderName: e.target.value }))}
                    required
                    style={{
                      width: '100%',
                      padding: '12px',
                      background: 'rgba(255, 255, 255, 0.8)',
                      border: '1px solid rgba(226, 232, 240, 0.6)',
                      borderRadius: '8px',
                      fontSize: '14px',
                      outline: 'none',
                      transition: 'all 0.2s'
                    }}
                    onFocus={(e) => e.currentTarget.style.borderColor = '#82b3db'}
                    onBlur={(e) => e.currentTarget.style.borderColor = 'rgba(226, 232, 240, 0.6)'}
                  />
                </div>
                
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: '500',
                    marginBottom: '8px',
                    color: '#374151'
                  }}>
                    Your Email *
                  </label>
                  <input
                    type="email"
                    value={contactForm.senderEmail}
                    onChange={(e) => setContactForm(prev => ({ ...prev, senderEmail: e.target.value }))}
                    required
                    style={{
                      width: '100%',
                      padding: '12px',
                      background: 'rgba(255, 255, 255, 0.8)',
                      border: '1px solid rgba(226, 232, 240, 0.6)',
                      borderRadius: '8px',
                      fontSize: '14px',
                      outline: 'none',
                      transition: 'all 0.2s'
                    }}
                    onFocus={(e) => e.currentTarget.style.borderColor = '#82b3db'}
                    onBlur={(e) => e.currentTarget.style.borderColor = 'rgba(226, 232, 240, 0.6)'}
                  />
                </div>
              </div>

              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '500',
                  marginBottom: '8px',
                  color: '#374151'
                }}>
                  Subject *
                </label>
                <input
                  type="text"
                  value={contactForm.subject}
                  onChange={(e) => setContactForm(prev => ({ ...prev, subject: e.target.value }))}
                  required
                  placeholder="Question about the document..."
                  style={{
                    width: '100%',
                    padding: '12px',
                    background: 'rgba(255, 255, 255, 0.8)',
                    border: '1px solid rgba(226, 232, 240, 0.6)',
                    borderRadius: '8px',
                    fontSize: '14px',
                    outline: 'none',
                    transition: 'all 0.2s'
                  }}
                  onFocus={(e) => e.currentTarget.style.borderColor = '#82b3db'}
                  onBlur={(e) => e.currentTarget.style.borderColor = 'rgba(226, 232, 240, 0.6)'}
                />
              </div>

              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '500',
                  marginBottom: '8px',
                  color: '#374151'
                }}>
                  Message *
                </label>
                <textarea
                  value={contactForm.message}
                  onChange={(e) => setContactForm(prev => ({ ...prev, message: e.target.value }))}
                  required
                  rows={4}
                  placeholder="Your question or comment..."
                  style={{
                    width: '100%',
                    padding: '12px',
                    background: 'rgba(255, 255, 255, 0.8)',
                    border: '1px solid rgba(226, 232, 240, 0.6)',
                    borderRadius: '8px',
                    fontSize: '14px',
                    outline: 'none',
                    resize: 'vertical',
                    transition: 'all 0.2s'
                  }}
                  onFocus={(e) => e.currentTarget.style.borderColor = '#82b3db'}
                  onBlur={(e) => e.currentTarget.style.borderColor = 'rgba(226, 232, 240, 0.6)'}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowContactModal(false)
                    setContactInfo(null)
                    setContactForm({ senderName: '', senderEmail: '', subject: '', message: '' })
                  }}
                  disabled={sendingContact}
                  style={{
                    padding: '12px 16px',
                    fontSize: '14px',
                    color: '#64748b',
                    backgroundColor: 'white',
                    border: '1px solid #cbd5e1',
                    borderRadius: '8px',
                    cursor: sendingContact ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    if (!sendingContact) e.currentTarget.style.backgroundColor = '#f8fafc'
                  }}
                  onMouseLeave={(e) => {
                    if (!sendingContact) e.currentTarget.style.backgroundColor = 'white'
                  }}
                >
                  Cancel
                </button>
                
                <button
                  onClick={handleContactSubmit}
                  disabled={sendingContact}
                  style={{
                    padding: '12px 16px',
                    fontSize: '14px',
                    color: sendingContact ? '#64748b' : 'white',
                    background: sendingContact ? '#cbd5e1' : 'linear-gradient(135deg, #82b3db 0%, #5a9bd4 100%)',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: sendingContact ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    if (!sendingContact) e.currentTarget.style.transform = 'scale(1.05)'
                  }}
                  onMouseLeave={(e) => {
                    if (!sendingContact) e.currentTarget.style.transform = 'scale(1)'
                  }}
                >
                  {sendingContact ? 'Sending...' : 'Send Message'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CSS Animations */}
      <style jsx>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        @keyframes slideInLeft {
          from {
            opacity: 0;
            transform: translateX(-20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        
        @keyframes slideInRight {
          from {
            opacity: 0;
            transform: translateX(20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        @keyframes bounce {
          0%, 80%, 100% {
            transform: translateY(0);
          }
          40% {
            transform: translateY(-10px);
          }
        }

        @keyframes spin {
          0% {
            transform: rotate(0deg);
          }
          100% {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  )
}