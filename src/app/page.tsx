'use client'

// =================================================================
// IMPORTS - All necessary dependencies for the chat interface
// =================================================================
import { useState, useRef, useEffect } from 'react'
import { useAuth, UserButton } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import ReactMarkdown from 'react-markdown'

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
// MAIN CHAT COMPONENT - The primary chat interface
// =================================================================
export default function ChatPage() {
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
        // Success feedback could be added here
      } else {
        setError(data.error || 'Failed to send message')
      }
    } catch (err) {
      setError('Failed to send contact message')
    } finally {
      setSendingContact(false)
    }
  }
  
  // Load all user chat sessions from the server
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
  // STREAMING CHAT MESSAGE HANDLING - Updated for real-time responses
  // =================================================================
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || loading || !currentSessionId) return

    // Create user message for immediate display
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

    // Create streaming assistant message placeholder
    const assistantMessageId = (Date.now() + 1).toString()
    const assistantMessage: Message = {
      id: assistantMessageId,
      type: 'assistant',
      content: '',
      timestamp: new Date(),
      isStreaming: true
    }

    setMessages(prev => [...prev, assistantMessage])

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          question: questionText,
          sessionId: currentSessionId 
        })
      })

      if (!response.ok) {
        throw new Error('Failed to get response')
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) {
        throw new Error('No response body')
      }

      let streamedContent = ''
      let sources: Source[] = []
      let buffer = '' // Buffer to batch small updates

      // Batch update function for smoother rendering
      const batchUpdate = () => {
        if (buffer) {
          streamedContent += buffer
          buffer = ''
          
          setMessages(prev => prev.map(msg => 
            msg.id === assistantMessageId
              ? { ...msg, content: streamedContent }
              : msg
          ))
        }
      }

      // Set up interval for batched updates (every 50ms for smooth effect)
      const updateInterval = setInterval(batchUpdate, 50)

      while (true) {
        const { done, value } = await reader.read()
        
        if (done) {
          clearInterval(updateInterval)
          batchUpdate() // Final update
          break
        }

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              
              if (data.type === 'chunk') {
                buffer += data.content // Add to buffer instead of immediate update
              } else if (data.type === 'sources') {
                sources = data.sources
              } else if (data.type === 'complete') {
                clearInterval(updateInterval)
                
                // Final update with sources
                setMessages(prev => prev.map(msg => 
                  msg.id === assistantMessageId
                    ? { 
                        ...msg, 
                        content: streamedContent + buffer || data.fullResponse,
                        sources: sources,
                        isStreaming: false
                      }
                    : msg
                ))
              } else if (data.type === 'error') {
                clearInterval(updateInterval)
                setError(data.error)
              }
            } catch (parseError) {
              console.error('Error parsing streaming data:', parseError)
            }
          }
        }
      }

      // Auto-update session title based on first question
      if (messages.length === 0 && currentSessionTitle === 'New Chat') {
        const newTitle = questionText.length > 50 
          ? questionText.substring(0, 47) + '...'
          : questionText
        updateSessionTitle(currentSessionId, newTitle)
      }
      
      loadSessions()

    } catch (err) {
      console.error('Streaming error:', err)
      setError('Failed to get response')
      
      // Remove the failed streaming message
      setMessages(prev => prev.filter(msg => msg.id !== assistantMessageId))
    } finally {
      setLoading(false)
      setIsStreaming(false)
    }
  }

  // =================================================================
  // UI EVENT HANDLERS - User interface interactions
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
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <div>Loading...</div>
      </div>
    )
  }

  // =================================================================
  // MAIN UI RENDER - Complete chat interface layout with streaming
  // =================================================================
  return (
    <div style={{ display: 'flex', height: '100vh', backgroundColor: '#f9fafb' }}>
      
      {/* Sidebar */}
      <div style={{ 
        width: sidebarOpen ? '300px' : '0px',
        backgroundColor: '#111827',
        transition: 'width 0.3s ease',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column'
      }}>
        
        <div style={{ padding: '1rem', borderBottom: '1px solid #374151' }}>
          <button
            onClick={handleNewChatClick}
            style={{
              width: '100%',
              backgroundColor: '#374151',
              color: 'white',
              border: 'none',
              padding: '0.75rem',
              borderRadius: '0.375rem',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: '500'
            }}
          >
            + New Chat
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem' }}>
          {loadingSessions ? (
            <div style={{ padding: '1rem', color: '#9ca3af', textAlign: 'center' }}>
              Loading...
            </div>
          ) : sessions.length === 0 ? (
            <div style={{ padding: '1rem', color: '#9ca3af', textAlign: 'center' }}>
              No conversations yet
            </div>
          ) : (
            sessions.map((session) => (
              <div
                key={session.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  margin: '0.25rem 0',
                  backgroundColor: session.id === currentSessionId ? '#374151' : 'transparent',
                  borderRadius: '0.375rem',
                  transition: 'background-color 0.2s'
                }}
              >
                <div
                  onClick={() => loadSession(session.id)}
                  style={{
                    flex: 1,
                    padding: '0.75rem',
                    color: session.id === currentSessionId ? 'white' : '#d1d5db',
                    cursor: 'pointer',
                    fontSize: '0.875rem'
                  }}
                >
                  <div style={{ fontWeight: '500', marginBottom: '0.25rem' }}>
                    {session.title}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                    {formatDate(session.updatedAt)} • {session.messageCount} messages
                  </div>
                </div>
                
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    deleteSession(session.id)
                  }}
                  style={{
                    backgroundColor: 'transparent',
                    border: 'none',
                    color: '#9ca3af',
                    cursor: 'pointer',
                    padding: '0.5rem',
                    fontSize: '0.875rem',
                    opacity: 0.7
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                  onMouseLeave={(e) => e.currentTarget.style.opacity = '0.7'}
                >
                  ✕
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        
        {/* Header Bar */}
        <div style={{ 
          backgroundColor: 'white', 
          borderBottom: '1px solid #e5e7eb', 
          padding: '1rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              style={{
                backgroundColor: 'transparent',
                border: 'none',
                fontSize: '1.25rem',
                cursor: 'pointer',
                color: '#6b7280'
              }}
            >
              ☰
            </button>
            <div>
              <h1 style={{ fontSize: '1.125rem', fontWeight: '600', color: '#111827' }}>
                {currentSessionTitle}
              </h1>
              <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                Knowledge Base Chat
              </p>
            </div>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <Link
              href="/admin"
              style={{
                fontSize: '0.875rem',
                color: '#2563eb',
                textDecoration: 'none',
                fontWeight: '500'
              }}
            >
              Admin Tools
            </Link>
            <UserButton afterSignOutUrl="/" />
          </div>
        </div>

        {/* Messages Container with Streaming Support */}
        <div style={{ 
          flex: 1, 
          overflowY: 'auto', 
          padding: '1rem',
          maxWidth: '800px',
          margin: '0 auto',
          width: '100%'
        }}>
          
          {messages.length === 0 && !loading && (
            <div style={{ 
              textAlign: 'center', 
              color: '#6b7280', 
              marginTop: '2rem',
              fontSize: '1.125rem'
            }}>
              Ask a question about the documents in our knowledge base
            </div>
          )}

          {/* Chat Messages with Streaming Support */}
          {messages.map((message) => (
            <div
              key={message.id}
              style={{
                marginBottom: '1.5rem',
                display: 'flex',
                justifyContent: message.type === 'user' ? 'flex-end' : 'flex-start'
              }}
            >
              <div
                style={{
                  maxWidth: '70%',
                  padding: '1rem',
                  borderRadius: '1rem',
                  backgroundColor: message.type === 'user' ? '#2563eb' : 'white',
                  color: message.type === 'user' ? 'white' : '#111827',
                  border: message.type === 'assistant' ? '1px solid #e5e7eb' : 'none'
                }}
              >
                {/* Message Content with Markdown Rendering */}
                {message.type === 'assistant' ? (
                  <div>
                    <ReactMarkdown
                      components={{
                        p: ({children}) => <div style={{ marginBottom: '0.5rem' }}>{children}</div>,
                        strong: ({children}) => <strong style={{ fontWeight: '600' }}>{children}</strong>,
                        ul: ({children}) => <ul style={{ paddingLeft: '1.5rem', marginBottom: '0.5rem' }}>{children}</ul>,
                        ol: ({children}) => <ol style={{ paddingLeft: '1.5rem', marginBottom: '0.5rem' }}>{children}</ol>,
                        li: ({children}) => <li style={{ marginBottom: '0.25rem' }}>{children}</li>,
                        h1: ({children}) => <h1 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '0.5rem' }}>{children}</h1>,
                        h2: ({children}) => <h2 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '0.5rem' }}>{children}</h2>,
                        h3: ({children}) => <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '0.5rem' }}>{children}</h3>,
                        code: ({children}) => <code style={{ backgroundColor: '#f3f4f6', padding: '0.125rem 0.25rem', borderRadius: '0.25rem', fontSize: '0.875rem' }}>{children}</code>
                      }}
                    >
                      {message.content}
                    </ReactMarkdown>
                    
                    {/* Streaming Cursor Animation */}
                    {message.isStreaming && (
                      <span style={{ 
                        display: 'inline-block',
                        width: '2px',
                        height: '1rem',
                        backgroundColor: '#2563eb',
                        marginLeft: '2px',
                        animation: 'blink 1s infinite'
                      }} />
                    )}
                  </div>
                ) : (
                  <div style={{ whiteSpace: 'pre-wrap' }}>{message.content}</div>
                )}

                {/* Enhanced Source Citations with Metadata */}
                {message.sources && message.sources.length > 0 && !message.isStreaming && (
                  <div style={{ 
                    marginTop: '0.75rem', 
                    paddingTop: '0.75rem', 
                    borderTop: '1px solid #e5e7eb' 
                  }}>
                    <div style={{ fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>
                      Sources:
                    </div>
                    <div>
                      {message.sources.map((source, index) => (
                        <div key={index} style={{ 
                          marginBottom: '0.75rem',
                          padding: '0.5rem',
                          backgroundColor: '#f9fafb',
                          borderRadius: '0.375rem',
                          border: '1px solid #f3f4f6'
                        }}>
                          {/* Document Title and Author */}
                          <div style={{ fontSize: '0.875rem', marginBottom: '0.25rem' }}>
                            <strong>{source.title}</strong>
                            {source.author && (
                              <span style={{ color: '#6b7280' }}> by {source.author}</span>
                            )}
                          </div>
                          
                          {/* Links Section */}
                          {(source.amazon_url || (source.resource_url && source.download_enabled)) && (
                            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.25rem' }}>
                              {source.amazon_url && (
                                <a
                                  href={source.amazon_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{
                                    fontSize: '0.75rem',
                                    color: '#2563eb',
                                    textDecoration: 'none',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.25rem',
                                    padding: '0.25rem 0.5rem',
                                    backgroundColor: '#eff6ff',
                                    borderRadius: '0.25rem',
                                    border: '1px solid #dbeafe'
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = '#dbeafe'
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = '#eff6ff'
                                  }}
                                >
                                  Amazon/Store
                                </a>
                              )}
                              
                              {source.resource_url && source.download_enabled && (
                                <a
                                  href={source.resource_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{
                                    fontSize: '0.75rem',
                                    color: '#059669',
                                    textDecoration: 'none',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.25rem',
                                    padding: '0.25rem 0.5rem',
                                    backgroundColor: '#ecfdf5',
                                    borderRadius: '0.25rem',
                                    border: '1px solid #d1fae5'
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = '#d1fae5'
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = '#ecfdf5'
                                  }}
                                >
                                  Download/Resource
                                </a>
                              )}
                            </div>
                          )}
                          
                          {/* Privacy-Preserving Contact Information */}
                          {source.contact_person && source.contact_email && (
                            <div style={{ fontSize: '0.75rem' }}>
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
                                  fontSize: '0.75rem',
                                  color: '#2563eb',
                                  backgroundColor: 'transparent',
                                  border: 'none',
                                  cursor: 'pointer',
                                  textDecoration: 'underline',
                                  padding: 0
                                }}
                              >
                                Questions about this resource? Contact {source.contact_person}
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Message Timestamp */}
                <div style={{ 
                  fontSize: '0.75rem', 
                  marginTop: '0.5rem',
                  color: message.type === 'user' ? 'rgba(255,255,255,0.7)' : '#9ca3af'
                }}>
                  {message.timestamp.toLocaleTimeString()}
                </div>
              </div>
            </div>
          ))}

          {/* Enhanced Loading Indicator with Typing Animation */}
          {isStreaming && (
            <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: '1.5rem' }}>
              <div style={{
                maxWidth: '70%',
                padding: '1rem',
                borderRadius: '1rem',
                backgroundColor: 'white',
                border: '1px solid #e5e7eb'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#6b7280' }}>
                  <div style={{ display: 'flex', gap: '2px' }}>
                    <div style={{ 
                      width: '6px', 
                      height: '6px', 
                      borderRadius: '50%', 
                      backgroundColor: '#2563eb',
                      animation: 'bounce 1.4s ease-in-out infinite both',
                      animationDelay: '0s'
                    }}></div>
                    <div style={{ 
                      width: '6px', 
                      height: '6px', 
                      borderRadius: '50%', 
                      backgroundColor: '#2563eb',
                      animation: 'bounce 1.4s ease-in-out infinite both',
                      animationDelay: '0.16s'
                    }}></div>
                    <div style={{ 
                      width: '6px', 
                      height: '6px', 
                      borderRadius: '50%', 
                      backgroundColor: '#2563eb',
                      animation: 'bounce 1.4s ease-in-out infinite both',
                      animationDelay: '0.32s'
                    }}></div>
                  </div>
                  <span>AI is thinking...</span>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div style={{
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#dc2626',
              padding: '1rem',
              borderRadius: '0.375rem',
              marginBottom: '1rem',
              textAlign: 'center'
            }}>
              {error}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Form */}
        <div style={{ 
          backgroundColor: 'white', 
          borderTop: '1px solid #e5e7eb', 
          padding: '1rem',
          maxWidth: '800px',
          margin: '0 auto',
          width: '100%'
        }}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '0.75rem' }}>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question about the documents..."
              disabled={loading || !currentSessionId || isStreaming}
              className="input"
              style={{ flex: 1 }}
            />
            <button
              type="submit"
              disabled={loading || !input.trim() || !currentSessionId || isStreaming}
              className="btn btn-primary"
            >
              {isStreaming ? 'Streaming...' : loading ? 'Sending...' : 'Send'}
            </button>
          </form>
        </div>
      </div>

      {/* Contact Modal */}
      {showContactModal && contactInfo && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '0.5rem',
            padding: '1.5rem',
            maxWidth: '500px',
            width: '90%',
            maxHeight: '80vh',
            overflowY: 'auto'
          }}>
            <h3 style={{
              fontSize: '1.25rem',
              fontWeight: '600',
              marginBottom: '1rem'
            }}>
              Contact {contactInfo.person}
            </h3>
            
            <p style={{
              fontSize: '0.875rem',
              color: '#6b7280',
              marginBottom: '1.5rem'
            }}>
              Send a message about "{contactInfo.documentTitle}"
            </p>

            <form onSubmit={handleContactSubmit} style={{ display: 'grid', gap: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '0.875rem',
                    fontWeight: '500',
                    marginBottom: '0.5rem'
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
                      padding: '0.5rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      fontSize: '0.875rem'
                    }}
                  />
                </div>
                
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '0.875rem',
                    fontWeight: '500',
                    marginBottom: '0.5rem'
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
                      padding: '0.5rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      fontSize: '0.875rem'
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  marginBottom: '0.5rem'
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
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                    fontSize: '0.875rem'
                  }}
                />
              </div>

              <div>
                <label style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  marginBottom: '0.5rem'
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
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                    fontSize: '0.875rem',
                    resize: 'vertical'
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowContactModal(false)
                    setContactInfo(null)
                    setContactForm({ senderName: '', senderEmail: '', subject: '', message: '' })
                  }}
                  disabled={sendingContact}
                  style={{
                    padding: '0.5rem 1rem',
                    fontSize: '0.875rem',
                    color: '#6b7280',
                    backgroundColor: 'white',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                    cursor: sendingContact ? 'not-allowed' : 'pointer'
                  }}
                >
                  Cancel
                </button>
                
                <button
                  type="submit"
                  disabled={sendingContact}
                  style={{
                    padding: '0.5rem 1rem',
                    fontSize: '0.875rem',
                    color: 'white',
                    backgroundColor: sendingContact ? '#9ca3af' : '#2563eb',
                    border: 'none',
                    borderRadius: '0.375rem',
                    cursor: sendingContact ? 'not-allowed' : 'pointer'
                  }}
                >
                  {sendingContact ? 'Sending...' : 'Send Message'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CSS Animations */}
      <style jsx>{`
        @keyframes blink {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }
        
        @keyframes bounce {
          0%, 80%, 100% { transform: scale(0); }
          40% { transform: scale(1); }
        }
      `}</style>
    </div>
  )
}