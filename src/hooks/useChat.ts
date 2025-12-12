'use client'

import { useState, useCallback, useRef } from 'react'
import type { Message, Source, DocumentDownload, StreamEvent } from '@/types/chat'
import { STREAM_TIMEOUT, EMPTY_CHUNK_LIMIT } from '@/lib/chatUtils'

interface UseChatOptions {
  onSessionCreate?: (question: string) => Promise<string | null>
  onSessionTitleUpdate?: (sessionId: string, title: string) => Promise<void>
}

interface UseChatReturn {
  messages: Message[]
  input: string
  loading: boolean
  error: string
  isStreaming: boolean
  setInput: (input: string) => void
  setMessages: (messages: Message[] | ((prev: Message[]) => Message[])) => void
  handleSubmit: (e: React.FormEvent, sessionId: string | null) => Promise<void>
  clearMessages: () => void
  clearError: () => void
}

export function useChat(options: UseChatOptions = {}): UseChatReturn {
  const { onSessionCreate, onSessionTitleUpdate } = options

  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)

  const abortControllerRef = useRef<AbortController | null>(null)

  const clearMessages = useCallback(() => {
    setMessages([])
    setError('')
  }, [])

  const clearError = useCallback(() => {
    setError('')
  }, [])

  const handleSubmit = useCallback(async (
    e: React.FormEvent,
    sessionId: string | null
  ) => {
    e.preventDefault()
    if (!input.trim() || loading) return

    const question = input.trim()
    setInput('')
    setError('')
    setLoading(true)

    // Add user message immediately
    const userMessage: Message = { role: 'user', content: question }
    setMessages(prev => [...prev, userMessage])

    // Create session if needed
    let activeSessionId = sessionId
    if (!activeSessionId && onSessionCreate) {
      activeSessionId = await onSessionCreate(question)
      if (!activeSessionId) {
        setError('Failed to create chat session')
        setLoading(false)
        return
      }
    }

    if (!activeSessionId) {
      setError('No active session')
      setLoading(false)
      return
    }

    // Add placeholder assistant message
    const assistantMessage: Message = {
      role: 'assistant',
      content: '',
      isStreaming: true
    }
    setMessages(prev => [...prev, assistantMessage])
    setIsStreaming(true)

    // Abort any existing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    abortControllerRef.current = new AbortController()

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          sessionId: activeSessionId
        }),
        signal: abortControllerRef.current.signal
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `HTTP ${response.status}`)
      }

      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('No response body')
      }

      const decoder = new TextDecoder()
      let buffer = ''
      let fullContent = ''
      let sources: Source[] = []
      let documentDownload: DocumentDownload | undefined
      let emptyChunkCount = 0
      let updateScheduled = false

      const startTime = Date.now()

      // Process stream with requestAnimationFrame batching
      const processBuffer = () => {
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue

          try {
            const data = JSON.parse(line.slice(6)) as StreamEvent

            switch (data.type) {
              case 'sources':
                sources = data.sources || []
                break

              case 'chunk':
                if (data.content) {
                  fullContent += data.content
                  emptyChunkCount = 0
                } else {
                  emptyChunkCount++
                }
                break

              case 'document':
                documentDownload = {
                  format: data.format as 'pdf' | 'pptx' | 'xlsx',
                  filename: data.filename,
                  downloadUrl: data.downloadUrl,
                  size: data.size,
                  expiresAt: data.expiresAt
                }
                break

              case 'complete':
                fullContent = data.fullResponse || fullContent
                break

              case 'error':
              case 'document_error':
                console.error('Stream error:', data.error)
                break
            }
          } catch {
            // Ignore parse errors
          }
        }

        // Update message state
        if (!updateScheduled) {
          updateScheduled = true
          requestAnimationFrame(() => {
            setMessages(prev => {
              const newMessages = [...prev]
              const lastIdx = newMessages.length - 1
              if (lastIdx >= 0 && newMessages[lastIdx].role === 'assistant') {
                newMessages[lastIdx] = {
                  ...newMessages[lastIdx],
                  content: fullContent,
                  sources,
                  documentDownload,
                  isStreaming: true
                }
              }
              return newMessages
            })
            updateScheduled = false
          })
        }
      }

      // Read stream
      while (true) {
        // Timeout check
        if (Date.now() - startTime > STREAM_TIMEOUT) {
          console.warn('Stream timeout reached')
          break
        }

        // Empty chunk limit check
        if (emptyChunkCount > EMPTY_CHUNK_LIMIT) {
          console.warn('Too many empty chunks')
          break
        }

        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        processBuffer()
      }

      // Final buffer process
      if (buffer) {
        buffer += '\n'
        processBuffer()
      }

      // Finalize message
      setMessages(prev => {
        const newMessages = [...prev]
        const lastIdx = newMessages.length - 1
        if (lastIdx >= 0 && newMessages[lastIdx].role === 'assistant') {
          newMessages[lastIdx] = {
            ...newMessages[lastIdx],
            content: fullContent,
            sources,
            documentDownload,
            isStreaming: false
          }
        }
        return newMessages
      })

      // Update session title with first question (if it's a new session)
      if (messages.length === 0 && onSessionTitleUpdate && activeSessionId) {
        onSessionTitleUpdate(activeSessionId, question.substring(0, 50))
      }

    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // Request was aborted - this is expected
        return
      }

      console.error('Chat error:', err)
      setError(err instanceof Error ? err.message : 'Failed to send message')

      // Remove the failed assistant message
      setMessages(prev => {
        const newMessages = [...prev]
        if (newMessages.length > 0 && newMessages[newMessages.length - 1].role === 'assistant') {
          newMessages.pop()
        }
        return newMessages
      })
    } finally {
      setLoading(false)
      setIsStreaming(false)
      abortControllerRef.current = null
    }
  }, [input, loading, messages.length, onSessionCreate, onSessionTitleUpdate])

  return {
    messages,
    input,
    loading,
    error,
    isStreaming,
    setInput,
    setMessages,
    handleSubmit,
    clearMessages,
    clearError
  }
}
