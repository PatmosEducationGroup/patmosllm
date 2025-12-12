'use client'

import { useState, useCallback } from 'react'
import type { ChatSession, Message } from '@/types/chat'

interface UseSessionsReturn {
  sessions: ChatSession[]
  currentSessionId: string | null
  currentSessionTitle: string
  loadingSessions: boolean
  loadSessions: () => Promise<void>
  loadSession: (sessionId: string) => Promise<Message[]>
  createNewSession: (firstQuestion?: string) => Promise<string | null>
  updateSessionTitle: (sessionId: string, title: string) => Promise<void>
  deleteSession: (sessionId: string) => Promise<void>
  setCurrentSessionId: (id: string | null) => void
  setCurrentSessionTitle: (title: string) => void
}

export function useSessions(): UseSessionsReturn {
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [currentSessionTitle, setCurrentSessionTitle] = useState('New Chat')
  const [loadingSessions, setLoadingSessions] = useState(false)

  const loadSessions = useCallback(async () => {
    setLoadingSessions(true)
    try {
      const response = await fetch('/api/chat/sessions')
      if (response.ok) {
        const data = await response.json()
        setSessions(data.sessions || [])
      }
    } catch (error) {
      console.error('Failed to load sessions:', error)
    } finally {
      setLoadingSessions(false)
    }
  }, [])

  const loadSession = useCallback(async (sessionId: string): Promise<Message[]> => {
    try {
      const response = await fetch(`/api/chat/sessions/${sessionId}`)
      if (response.ok) {
        const data = await response.json()
        setCurrentSessionId(sessionId)
        setCurrentSessionTitle(data.session?.title || 'Chat')

        // Convert conversations to messages
        const loadedMessages: Message[] = []
        if (data.conversations) {
          for (const conv of data.conversations) {
            loadedMessages.push({
              role: 'user',
              content: conv.question
            })
            loadedMessages.push({
              role: 'assistant',
              content: conv.answer,
              sources: conv.sources || []
            })
          }
        }
        return loadedMessages
      }
    } catch (error) {
      console.error('Failed to load session:', error)
    }
    return []
  }, [])

  const createNewSession = useCallback(async (firstQuestion?: string): Promise<string | null> => {
    try {
      const response = await fetch('/api/chat/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: firstQuestion
            ? firstQuestion.substring(0, 50)
            : 'New Chat'
        })
      })

      if (response.ok) {
        const data = await response.json()
        const newSession = data.session
        setSessions(prev => [newSession, ...prev])
        setCurrentSessionId(newSession.id)
        setCurrentSessionTitle(newSession.title)
        return newSession.id
      }
    } catch (error) {
      console.error('Failed to create session:', error)
    }
    return null
  }, [])

  const updateSessionTitle = useCallback(async (sessionId: string, title: string) => {
    try {
      const response = await fetch(`/api/chat/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title })
      })

      if (response.ok) {
        setSessions(prev =>
          prev.map(s =>
            s.id === sessionId ? { ...s, title } : s
          )
        )
        if (currentSessionId === sessionId) {
          setCurrentSessionTitle(title)
        }
      }
    } catch (error) {
      console.error('Failed to update session title:', error)
    }
  }, [currentSessionId])

  const deleteSession = useCallback(async (sessionId: string) => {
    try {
      const response = await fetch(`/api/chat/sessions/${sessionId}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        setSessions(prev => prev.filter(s => s.id !== sessionId))
        if (currentSessionId === sessionId) {
          setCurrentSessionId(null)
          setCurrentSessionTitle('New Chat')
        }
      }
    } catch (error) {
      console.error('Failed to delete session:', error)
    }
  }, [currentSessionId])

  return {
    sessions,
    currentSessionId,
    currentSessionTitle,
    loadingSessions,
    loadSessions,
    loadSession,
    createNewSession,
    updateSessionTitle,
    deleteSession,
    setCurrentSessionId,
    setCurrentSessionTitle
  }
}
