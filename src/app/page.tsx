'use client'

import { useState, useRef, useEffect } from 'react'
import { useAuth, UserButton } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface Source {
  title: string
  author?: string
  chunk_id: string
}

interface Message {
  id: string
  type: 'user' | 'assistant'
  content: string
  sources?: Source[]
  timestamp: Date
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

export default function ChatPage() {
  const { isLoaded, userId } = useAuth()
  const router = useRouter()
  
  // Chat state
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  
  // Session state
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [currentSessionTitle, setCurrentSessionTitle] = useState('New Chat')
  const [loadingSessions, setLoadingSessions] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(true)

  // Redirect if not authenticated
  useEffect(() => {
    if (isLoaded && !userId) {
      router.push('/sign-in')
    }
  }, [isLoaded, userId, router])

  // Load sessions on mount
  useEffect(() => {
    if (userId) {
      loadSessions()
    }
  }, [userId])

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const loadSessions = async () => {
    console.log('loadSessions called')
    try {
      const response = await fetch('/api/chat/sessions')
      const data = await response.json()
      console.log('loadSessions response:', data)
      
      if (data.success) {
        setSessions(data.sessions)
        
        // If no current session and sessions exist, load the most recent one
        if (!currentSessionId && data.sessions.length > 0) {
          console.log('Loading most recent session:', data.sessions[0].id)
          loadSession(data.sessions[0].id)
        } else if (!currentSessionId && data.sessions.length === 0) {
          // Create first session if none exist
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
        
        // Convert conversations to messages
        const conversationMessages: Message[] = []
        data.conversations.forEach((conv: Conversation) => {
          // Add user message
          conversationMessages.push({
            id: `user-${conv.id}`,
            type: 'user',
            content: conv.question,
            timestamp: new Date(conv.created_at)
          })
          
          // Add assistant message
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

      console.log('Response status:', response.status)
      console.log('Response ok:', response.ok)

      const data = await response.json()
      console.log('createNewSession response data:', data)

      if (data.success) {
        console.log('Session created successfully:', data.session)
        setCurrentSessionId(data.session.id)
        setCurrentSessionTitle(data.session.title)
        setMessages([])
        setError(null)
        
        // Reload sessions to update sidebar
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
        loadSessions() // Refresh sidebar
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
      // If we're deleting the current session, clear it
      if (sessionId === currentSessionId) {
        setCurrentSessionId(null)
        setCurrentSessionTitle('New Chat')
        setMessages([])
      }
      
      // Reload sessions to update sidebar
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
    setError(null)

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

      const data = await response.json()

      if (data.success) {
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          type: 'assistant',
          content: data.answer,
          sources: data.sources,
          timestamp: new Date()
        }

        setMessages(prev => [...prev, assistantMessage])
        
        // Auto-update session title based on first question
        if (messages.length === 0 && currentSessionTitle === 'New Chat') {
          const newTitle = questionText.length > 50 
            ? questionText.substring(0, 47) + '...'
            : questionText
          updateSessionTitle(currentSessionId, newTitle)
        }
        
        // Refresh sessions to update message count
        loadSessions()
      } else {
        setError(data.error)
      }
    } catch (err) {
      setError('Failed to get response')
    } finally {
      setLoading(false)
    }
  }

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

  if (!isLoaded || !userId) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <div>Loading...</div>
      </div>
    )
  }

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
        {/* Sidebar Header */}
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

        {/* Sessions List */}
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
        {/* Header */}
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

        {/* Messages Container */}
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
                <div style={{ whiteSpace: 'pre-wrap' }}>{message.content}</div>

                {message.sources && message.sources.length > 0 && (
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
                        <div key={index} style={{ fontSize: '0.875rem', marginBottom: '0.25rem' }}>
                          • <strong>{source.title}</strong>
                          {source.author && (
                            <span style={{ color: '#6b7280' }}> by {source.author}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

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

          {loading && (
            <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: '1.5rem' }}>
              <div style={{
                maxWidth: '70%',
                padding: '1rem',
                borderRadius: '1rem',
                backgroundColor: 'white',
                border: '1px solid #e5e7eb'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#6b7280' }}>
                  <div style={{ 
                    width: '8px', 
                    height: '8px', 
                    borderRadius: '50%', 
                    backgroundColor: '#2563eb',
                    animation: 'pulse 1.5s ease-in-out infinite'
                  }}></div>
                  <span>Thinking...</span>
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
              disabled={loading || !currentSessionId}
              className="input"
              style={{ flex: 1 }}
            />
            <button
              type="submit"
              disabled={loading || !input.trim() || !currentSessionId}
              className="btn btn-primary"
            >
              {loading ? 'Sending...' : 'Send'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}