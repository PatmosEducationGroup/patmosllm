'use client'

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

export default function ModernChatPage() {
  const { isLoaded, userId } = useAuth()
  const router = useRouter()
  
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [currentSessionTitle, setCurrentSessionTitle] = useState('New Chat')
  const [loadingSessions, setLoadingSessions] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [isStreaming, setIsStreaming] = useState(false)

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

  const [showFeedbackModal, setShowFeedbackModal] = useState(false)
  const [feedbackForm, setFeedbackForm] = useState({
    name: '',
    email: '',
    message: ''
  })
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false)
  const [feedbackSubmitStatus, setFeedbackSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle')

  useEffect(() => {
    if (isLoaded && !userId) {
      router.push('/sign-in')
    }
  }, [isLoaded, userId, router])

  useEffect(() => {
    if (userId) {
      loadSessions()
    }
  }, [userId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleFeedbackInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFeedbackForm(prev => ({ ...prev, [name]: value }))
  }

  const handleFeedbackSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmittingFeedback(true)
    setFeedbackSubmitStatus('idle')

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      setError('Failed to create new chat')
    }
  }

  const updateSessionTitle = async (sessionId: string, newTitle: string) => {
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
      console.error('Failed to update session title:', err)
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

    let updateInterval: NodeJS.Timeout | null = null
    let timeoutId: NodeJS.Timeout | null = null
    let isStreamComplete = false

    const cleanup = () => {
      if (updateInterval) clearInterval(updateInterval)
      if (timeoutId) clearTimeout(timeoutId)
    }

    try {
      const abortController = new AbortController()
      
      timeoutId = setTimeout(() => {
        abortController.abort()
      }, 120000)

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

      const contentType = response.headers.get('content-type')
      if (!contentType?.includes('text/plain') && !contentType?.includes('text/event-stream')) {
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

      while (!isStreamComplete) {
        try {
          const { done, value } = await reader.read()
          
          if (done) {
            batchUpdate()
            break
          }

          if (!value || value.length === 0) continue

          const chunk = decoder.decode(value, { stream: true })
          if (!chunk.trim()) continue

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
                  batchUpdate()
                  
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
                console.error('Error parsing streaming data:', parseError)
              }
            }
          }
        } catch (readError) {
          console.error('Stream read error:', readError)
          break
        }
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
      setMessages(prev => prev.filter(msg => msg.id !== assistantMessageId))
    } finally {
      cleanup()
      setLoading(false)
      setIsStreaming(false)
    }
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-[#82b3db] flex items-center justify-center text-white text-2xl font-bold mb-4 mx-auto animate-pulse shadow-xl">
            H.E
          </div>
          <div className="text-gray-500 text-lg font-medium">
            Loading your workspace...
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen bg-gray-50 flex overflow-hidden">
      {/* Beta Banner */}
      <div className="fixed top-0 left-0 right-0 bg-[#82b3db] text-white py-2 px-6 text-center text-sm font-medium z-40">
        <div className="flex items-center justify-center gap-3">
          <span className="bg-[#9ecd55] text-gray-900 px-2 py-1 rounded-full text-xs font-bold">BETA</span>
          <span>This system is in beta testing - Your feedback helps us improve</span>
          <button onClick={() => setShowFeedbackModal(true)} className="underline font-semibold hover:no-underline">
            Share Feedback
          </button>
        </div>
      </div>

      {/* Header */}
      <div className="fixed top-12 left-0 right-0 bg-white border-b border-gray-200 px-6 py-4 z-30">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-[#82b3db] flex items-center justify-center text-white font-bold text-lg">
              H.E
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">Heaven.Earth</h1>
              <p className="text-sm text-gray-500">Knowledge Base Assistant</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowFeedbackModal(true)}
              className="px-3 py-2 bg-[#82b3db] text-white font-medium rounded-lg text-sm hover:bg-[#6a9bc9] transition-colors"
            >
              Feedback
            </button>
            <Link href="/admin" className="text-sm text-gray-500 hover:text-gray-900 font-medium">
              Admin Tools
            </Link>
            <UserButton afterSignOutUrl="/" />
          </div>
        </div>
      </div>

      {/* Sidebar */}
      <div className={`bg-white border-r border-gray-200 transition-all duration-300 ${sidebarOpen ? 'w-80' : 'w-0'} overflow-hidden`} style={{ marginTop: '104px' }}>
        <div className="flex flex-col h-full">
          <div className="p-4 border-b border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-800">Conversations</h2>
              <button onClick={() => setSidebarOpen(false)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X size={18} className="text-gray-500" />
              </button>
            </div>
            <button 
              onClick={() => createNewSession()}
              className="w-full flex items-center justify-center space-x-2 px-4 py-3 bg-[#82b3db] text-white rounded-lg font-medium hover:bg-[#6a9bc9] transition-colors"
            >
              <Plus size={18} />
              <span>New Chat</span>
            </button>
          </div>

          <div className="p-4 border-b border-gray-100">
            <div className="relative">
              <Search size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search conversations..."
                className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#82b3db] focus:border-transparent"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {loadingSessions ? (
              <div className="text-center py-4">
                <div className="w-6 h-6 border-2 border-gray-300 border-t-[#82b3db] rounded-full mx-auto mb-2 animate-spin"></div>
                <span className="text-gray-500">Loading...</span>
              </div>
            ) : sessions.length === 0 ? (
              <div className="text-center py-4 text-gray-500">
                <MessageCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                No conversations yet
              </div>
            ) : (
              <div className="space-y-2">
                {sessions.map((session) => (
                  <div
                    key={session.id}
                    onClick={() => loadSession(session.id)}
                    className={`p-3 rounded-lg cursor-pointer transition-colors group ${
                      currentSessionId === session.id 
                        ? 'bg-blue-50 border-l-4 border-[#82b3db]' 
                        : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900 text-sm truncate mb-1">
                          {session.title}
                        </div>
                        <div className="flex items-center justify-between text-xs text-gray-500">
                          <span>{formatDate(session.updatedAt)}</span>
                          <span>{session.messageCount} messages</span>
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          deleteSession(session.id)
                        }}
                        className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 p-1 transition-all"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col" style={{ marginTop: '104px' }}>
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              {!sidebarOpen && (
                <button onClick={() => setSidebarOpen(true)} className="p-2 hover:bg-gray-100 rounded-lg">
                  <Menu size={18} className="text-gray-600" />
                </button>
              )}
              <div>
                <h1 className="text-lg font-semibold text-gray-900">{currentSessionTitle}</h1>
                <p className="text-sm text-gray-500">AI Assistant • Online</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-[#9ecd55] rounded-full"></div>
              <span className="text-sm text-gray-500">Active</span>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-gray-50">
          <div className="max-w-4xl mx-auto px-6 py-8">
            {messages.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-16 h-16 bg-[#82b3db] rounded-2xl mx-auto mb-6 flex items-center justify-center text-white text-2xl font-bold">
                  H.E
                </div>
                <h2 className="text-2xl font-semibold text-gray-900 mb-3">Welcome to Heaven.Earth</h2>
                <p className="text-gray-600 mb-12 text-lg">I can help you explore and understand your document library. Ask me anything!</p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto">
                  {[
                    { icon: "🙏", title: "How do I pray effectively?", desc: "Learn prayer techniques" },
                    { icon: "📖", title: "Bible study methods", desc: "Explore study techniques" },
                    { icon: "💡", title: "Finding spiritual guidance", desc: "Get direction for life" },
                    { icon: "🤝", title: "Community and fellowship", desc: "Build relationships" }
                  ].map((suggestion, i) => (
                    <button
                      key={i}
                      onClick={() => setInput(suggestion.title)}
                      className="p-4 bg-white rounded-xl border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all text-left group"
                    >
                      <div className="flex items-center space-x-3">
                        <div className="text-2xl">{suggestion.icon}</div>
                        <div>
                          <div className="font-medium text-gray-900 group-hover:text-[#82b3db] transition-colors">
                            {suggestion.title}
                          </div>
                          <div className="text-sm text-gray-500">{suggestion.desc}</div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-8">
                {messages.map((message) => (
                  <div key={message.id} className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-3xl ${message.type === 'user' ? 'order-2' : 'order-1'}`}>
                      <div
                        className={`rounded-2xl px-6 py-4 ${
                          message.type === 'user'
                            ? 'bg-[#82b3db] text-white ml-12'
                            : 'bg-white shadow-sm border border-gray-100 mr-12'
                        }`}
                      >
                        {message.type === 'assistant' ? (
                          <div>
                            <div className="prose prose-sm max-w-none">
                              <ReactMarkdown>
                                {message.content}
                              </ReactMarkdown>
                            </div>
                            {message.isStreaming && (
                              <span className="inline-block w-0.5 h-5 ml-1 bg-[#82b3db] animate-pulse" />
                            )}
                          </div>
                        ) : (
                          <div className="whitespace-pre-wrap">{message.content}</div>
                        )}

                        {message.sources && message.sources.length > 0 && !message.isStreaming && (
                          <div className="mt-4 pt-4 border-t border-gray-100">
                            <div className="flex items-center space-x-2 mb-3 text-sm font-medium text-gray-700">
                              <Globe size={14} />
                              <span>Sources:</span>
                            </div>
                            <div className="space-y-2">
                              {message.sources.map((source, i) => (
                                <div key={i} className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                                  <div className="font-medium text-sm text-gray-900 mb-1">{source.title}</div>
                                  {source.author && (
                                    <div className="text-xs text-gray-500 mb-2">by {source.author}</div>
                                  )}
                                  <div className="flex items-center space-x-2">
                                    {source.amazon_url && (
                                      <a 
                                        href={ensureHttps(source.amazon_url)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center space-x-1 px-2 py-1 bg-blue-50 text-[#82b3db] text-xs rounded-md hover:bg-blue-100 transition-colors"
                                      >
                                        <ShoppingCart size={12} />
                                        <span>Store</span>
                                      </a>
                                    )}
                                    {source.resource_url && source.download_enabled && (
                                      <a 
                                        href={ensureHttps(source.resource_url)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center space-x-1 px-2 py-1 bg-green-50 text-[#9ecd55] text-xs rounded-md hover:bg-green-100 transition-colors"
                                      >
                                        <Download size={12} />
                                        <span>Download</span>
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
                                        className="inline-flex items-center space-x-1 px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-md hover:bg-gray-200 transition-colors"
                                      >
                                        <User size={12} />
                                        <span>Contact {source.contact_person}</span>
                                      </button>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className={`flex items-center space-x-1 mt-3 text-xs ${
                          message.type === 'user' ? 'text-blue-100' : 'text-gray-400'
                        }`}>
                          <Clock size={12} />
                          <span>{message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                
                {isStreaming && (
                  <div className="flex justify-start">
                    <div className="bg-white rounded-2xl px-6 py-4 shadow-sm border border-gray-100 mr-12">
                      <div className="flex items-center space-x-3">
                        <div className="flex space-x-1">
                          {[0, 1, 2].map(i => (
                            <div
                              key={i}
                              className="w-2 h-2 bg-[#82b3db] rounded-full animate-bounce"
                              style={{ animationDelay: `${i * 150}ms` }}
                            />
                          ))}
                        </div>
                        <span className="text-sm text-gray-500 flex items-center space-x-1">
                          <Zap size={14} />
                          <span>AI is thinking...</span>
                        </span>
                      </div>
                    </div>
                  </div>
                )}
                
                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-600 p-4 rounded-xl text-center">
                    <div className="flex items-center justify-center space-x-2">
                      <Shield size={16} />
                      <span>{error}</span>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        </div>

        <div className="bg-white border-t border-gray-200 px-6 py-4">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-end space-x-4">
              <div className="flex-1 relative">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSubmit(e as React.FormEvent)
                    }
                  }}
                  placeholder="Ask me anything about your documents..."
                  className="w-full resize-none border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#82b3db] focus:border-transparent max-h-32"
                  rows={1}
                />
              </div>
              <button
                onClick={handleSubmit}
                disabled={!input.trim() || loading || isStreaming}
                className={`p-3 rounded-xl transition-colors ${
                  input.trim() && !loading && !isStreaming
                    ? 'bg-[#82b3db] text-white hover:bg-[#6a9bc9]'
                    : 'bg-gray-200 text-gray-400'
                }`}
              >
                {loading || isStreaming ? (
                  <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Send size={18} />
                )}
              </button>
            </div>
            <div className="flex items-center justify-between mt-2 text-xs text-gray-400">
              <span>Press Enter to send, Shift + Enter for new line</span>
              <span>Powered by AI</span>
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      {showFeedbackModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Beta Feedback</h3>
              <button onClick={() => setShowFeedbackModal(false)}>
                <X size={20} className="text-gray-400 hover:text-gray-600" />
              </button>
            </div>

            {feedbackSubmitStatus === 'success' ? (
              <div className="text-center py-6">
                <div className="w-12 h-12 bg-[#82b3db] rounded-full flex items-center justify-center text-white text-xl mb-3 mx-auto">
                  ✓
                </div>
                <h4 className="font-semibold mb-1">Thank you!</h4>
                <p className="text-gray-600 text-sm">Your feedback helps us improve.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <input
                  type="text"
                  name="name"
                  value={feedbackForm.name}
                  onChange={handleFeedbackInputChange}
                  placeholder="Your name"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#82b3db]"
                />
                <input
                  type="email"
                  name="email"
                  value={feedbackForm.email}
                  onChange={handleFeedbackInputChange}
                  placeholder="Your email"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#82b3db]"
                />
                <textarea
                  name="message"
                  value={feedbackForm.message}
                  onChange={handleFeedbackInputChange}
                  placeholder="Your feedback..."
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#82b3db] resize-none"
                />
                
                {feedbackSubmitStatus === 'error' && (
                  <p className="text-red-600 text-sm">Error sending feedback. Please try again.</p>
                )}

                <div className="flex space-x-3">
                  <button
                    onClick={() => setShowFeedbackModal(false)}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleFeedbackSubmit}
                    disabled={isSubmittingFeedback}
                    className="flex-1 px-4 py-2 bg-[#82b3db] text-white rounded-lg hover:bg-[#6a9bc9] disabled:opacity-50 transition-colors"
                  >
                    {isSubmittingFeedback ? 'Sending...' : 'Send'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {showContactModal && contactInfo && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-1">Contact {contactInfo.person}</h3>
            <p className="text-sm text-gray-600 mb-4">About "{contactInfo.documentTitle}"</p>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  value={contactForm.senderName}
                  onChange={(e) => setContactForm(prev => ({ ...prev, senderName: e.target.value }))}
                  placeholder="Your name"
                  className="px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#82b3db]"
                />
                <input
                  type="email"
                  value={contactForm.senderEmail}
                  onChange={(e) => setContactForm(prev => ({ ...prev, senderEmail: e.target.value }))}
                  placeholder="Your email"
                  className="px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#82b3db]"
                />
              </div>
              <input
                type="text"
                value={contactForm.subject}
                onChange={(e) => setContactForm(prev => ({ ...prev, subject: e.target.value }))}
                placeholder="Subject"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#82b3db]"
              />
              <textarea
                value={contactForm.message}
                onChange={(e) => setContactForm(prev => ({ ...prev, message: e.target.value }))}
                placeholder="Your message..."
                rows={4}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#82b3db] resize-none"
              />

              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => {
                    setShowContactModal(false)
                    setContactInfo(null)
                    setContactForm({ senderName: '', senderEmail: '', subject: '', message: '' })
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleContactSubmit}
                  disabled={sendingContact}
                  className="px-4 py-2 bg-[#82b3db] text-white rounded-lg hover:bg-[#6a9bc9] disabled:opacity-50 transition-colors"
                >
                  {sendingContact ? 'Sending...' : 'Send'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}