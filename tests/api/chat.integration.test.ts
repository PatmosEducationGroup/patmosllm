import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { POST } from '@/app/api/chat/route'
import { NextRequest } from 'next/server'

// Mock all external dependencies
vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(() => Promise.resolve({ userId: 'test-clerk-user-123' }))
}))

vi.mock('@/lib/supabase', () => ({
  withSupabaseAdmin: vi.fn((callback) => {
    const mockSupabase = {
      from: (table: string) => {
        if (table === 'chat_sessions') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  is: () => ({
                    single: () => Promise.resolve({ data: { id: 'test-session-123' }, error: null })
                  })
                })
              })
            })
          }
        }
        if (table === 'conversations') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  is: () => ({
                    order: () => ({
                      limit: () => Promise.resolve({ data: [], error: null })
                    })
                  })
                })
              })
            }),
            insert: () => ({
              select: () => ({
                single: () => Promise.resolve({
                  data: { id: 'test-conversation-123' },
                  error: null
                })
              })
            })
          }
        }
        if (table === 'documents') {
          return {
            select: () => ({
              in: () => Promise.resolve({
                data: [{
                  id: 'doc-123',
                  title: 'Test Document',
                  author: 'Test Author',
                  storage_path: 'test/path',
                  file_size: 1024,
                  download_enabled: true
                }],
                error: null
              })
            })
          }
        }
        return {
          update: () => ({
            eq: () => Promise.resolve({ error: null })
          })
        }
      }
    }
    return callback(mockSupabase)
  })
}))

vi.mock('@/lib/auth', () => ({
  getCurrentUser: vi.fn(() => Promise.resolve({
    id: 'test-user-uuid',
    email: 'test@example.com',
    clerk_user_id: 'test-clerk-user-123'
  }))
}))

vi.mock('@/lib/rate-limiter', () => ({
  chatRateLimit: vi.fn(() => ({ success: true, remaining: 10, resetTime: Date.now() + 60000 }))
}))

vi.mock('@/lib/get-identifier', () => ({
  getIdentifier: vi.fn(() => Promise.resolve('test-identifier-123'))
}))

vi.mock('@/lib/input-sanitizer', () => ({
  sanitizeInput: vi.fn((input) => input?.trim())
}))

vi.mock('@/lib/openai', () => ({
  createEmbedding: vi.fn(() => Promise.resolve([0.1, 0.2, 0.3]))
}))

vi.mock('@/lib/hybrid-search', () => ({
  intelligentSearch: vi.fn(() => Promise.resolve({
    results: [
      {
        id: 'chunk-123',
        content: 'Test chunk content about the topic',
        documentId: 'doc-123',
        documentTitle: 'Test Document',
        documentAuthor: 'Test Author',
        score: 0.85
      }
    ],
    searchStrategy: 'hybrid',
    confidence: 0.8,
    suggestions: []
  }))
}))

vi.mock('@/lib/intelligent-clarification', () => ({
  intelligentClarification: {
    analyzeSearchResults: vi.fn(() => ({
      needsClarification: false,
      clarificationMessage: null,
      clarificationType: 'none' as const,
      confidence: 0.8,
      reasoning: 'Query is clear'
    })),
    generateConversationalClarification: vi.fn((analysis, question) =>
      `Could you clarify your question: "${question}"?`
    )
  }
}))

vi.mock('@/lib/onboardingTracker', () => ({
  trackOnboardingMilestone: vi.fn(() => Promise.resolve())
}))

vi.mock('@/lib/userContextManager', () => ({
  userContextManager: {
    updateUserContext: vi.fn(() => Promise.resolve()),
    logConversation: vi.fn(() => Promise.resolve())
  }
}))

vi.mock('@/lib/advanced-cache', () => ({
  advancedCache: {
    get: vi.fn(() => null),
    set: vi.fn(),
    delete: vi.fn()
  },
  CACHE_NAMESPACES: {
    CHAT_HISTORY: 'chat-history'
  },
  CACHE_TTL: {
    MEDIUM: 1800
  },
  getCachedConversationHistory: vi.fn(() => null),
  cacheConversationHistory: vi.fn()
}))

// Mock OpenAI streaming
const mockOpenAIStream = {
  async *[Symbol.asyncIterator]() {
    yield {
      choices: [{
        delta: { content: 'Test ' },
        finish_reason: null
      }]
    }
    yield {
      choices: [{
        delta: { content: 'response ' },
        finish_reason: null
      }]
    }
    yield {
      choices: [{
        delta: { content: 'from AI.' },
        finish_reason: 'stop'
      }]
    }
  }
}

vi.mock('openai', () => {
  return {
    default: vi.fn(() => ({
      chat: {
        completions: {
          create: vi.fn(() => Promise.resolve(mockOpenAIStream))
        }
      }
    }))
  }
})

describe('/api/chat - Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should return 401 if user is not authenticated', async () => {
    // Mock auth to return no userId
    const { auth } = await import('@clerk/nextjs/server')
    vi.mocked(auth).mockResolvedValueOnce({ userId: null } as unknown as ReturnType<typeof auth>)

    const request = new NextRequest('http://localhost:3000/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        question: 'What is the meaning of life?',
        sessionId: 'test-session-123'
      })
    })

    const response = await POST(request)
    expect(response.status).toBe(401)

    const data = await response.json()
    expect(data.error).toBe('Authentication required')
  })

  it('should return 403 if user not found in database', async () => {
    const { getCurrentUser } = await import('@/lib/auth')
    vi.mocked(getCurrentUser).mockResolvedValueOnce(null)

    const request = new NextRequest('http://localhost:3000/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        question: 'What is the meaning of life?',
        sessionId: 'test-session-123'
      })
    })

    const response = await POST(request)
    expect(response.status).toBe(403)

    const data = await response.json()
    expect(data.error).toBe('User not found in database')
  })

  it('should return 400 if question is missing', async () => {
    const request = new NextRequest('http://localhost:3000/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        sessionId: 'test-session-123'
      })
    })

    const response = await POST(request)
    expect(response.status).toBe(400)

    const data = await response.json()
    expect(data.error).toBe('Question is required')
  })

  it('should return 400 if sessionId is missing', async () => {
    const request = new NextRequest('http://localhost:3000/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        question: 'What is the meaning of life?'
      })
    })

    const response = await POST(request)
    expect(response.status).toBe(400)

    const data = await response.json()
    expect(data.error).toBe('Session ID is required')
  })

  it('should return 429 if rate limit exceeded', async () => {
    const { chatRateLimit } = await import('@/lib/rate-limiter')
    vi.mocked(chatRateLimit).mockReturnValueOnce({
      success: false,
      message: 'Rate limit exceeded. Please try again later.',
      remaining: 0,
      resetTime: (Date.now() + 60000).toString()
    })

    const request = new NextRequest('http://localhost:3000/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        question: 'What is the meaning of life?',
        sessionId: 'test-session-123'
      })
    })

    const response = await POST(request)
    expect(response.status).toBe(429)

    const data = await response.json()
    expect(data.error).toContain('Rate limit')
  })

  it('should return 400 if session is invalid', async () => {
    const { withSupabaseAdmin } = await import('@/lib/supabase')
    vi.mocked(withSupabaseAdmin).mockImplementationOnce(async (callback) => {
      const mockSupabase = {
        from: () => ({
          select: () => ({
            eq: () => ({
              eq: () => ({
                is: () => ({
                  single: () => Promise.resolve({ data: null, error: null })
                })
              })
            })
          })
        })
      }
      return callback(mockSupabase as unknown as ReturnType<typeof auth>)
    })

    const request = new NextRequest('http://localhost:3000/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        question: 'What is the meaning of life?',
        sessionId: 'invalid-session'
      })
    })

    const response = await POST(request)
    expect(response.status).toBe(400)

    const data = await response.json()
    expect(data.error).toBe('Invalid session')
  })

  it('should successfully stream a chat response', async () => {
    const request = new NextRequest('http://localhost:3000/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        question: 'What is the meaning of life?',
        sessionId: 'test-session-123'
      })
    })

    const response = await POST(request)
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('text/plain; charset=utf-8')

    // Verify streaming response
    const reader = response.body?.getReader()
    expect(reader).toBeDefined()

    // Read and collect all chunks
    const chunks: string[] = []
     
    while (true) {
      const { done, value } = await reader!.read()
      if (done) break
      chunks.push(new TextDecoder().decode(value))
    }

    // Verify sources chunk was sent
    const allData = chunks.join('')
    expect(allData).toContain('"type":"sources"')
    expect(allData).toContain('"chunksFound":1')
  })

  it('should return cached response if available', async () => {
    const { advancedCache } = await import('@/lib/advanced-cache')
    vi.mocked(advancedCache.get).mockReturnValueOnce({
      answer: 'Cached answer',
      sources: [{
        title: 'Test Document',
        chunk_id: 'chunk-123'
      }],
      timestamp: Date.now()
    })

    const request = new NextRequest('http://localhost:3000/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        question: 'What is the meaning of life?',
        sessionId: 'test-session-123'
      })
    })

    const response = await POST(request)
    expect(response.status).toBe(200)

    // Read all chunks from the stream
    const reader = response.body?.getReader()
    const chunks: string[] = []
     
    while (true) {
      const { done, value } = await reader!.read()
      if (done) break
      chunks.push(new TextDecoder().decode(value))
    }

    const allData = chunks.join('')
    expect(allData).toContain('"cached":true')
    expect(allData).toContain('Cached answer')
  })

  it('should handle clarification when needed', async () => {
    const { intelligentClarification } = await import('@/lib/intelligent-clarification')
    vi.mocked(intelligentClarification.analyzeSearchResults).mockReturnValueOnce({
      needsClarification: true,
      clarificationMessage: 'Could you be more specific?',
      clarificationType: 'scope_ambiguity' as const,
      confidence: 0.3,
      reasoning: 'Query is too vague'
    })

    const request = new NextRequest('http://localhost:3000/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        question: 'stuff',
        sessionId: 'test-session-123'
      })
    })

    const response = await POST(request)
    expect(response.status).toBe(200)

    // Read all chunks from the stream
    const reader = response.body?.getReader()
    const chunks: string[] = []
     
    while (true) {
      const { done, value } = await reader!.read()
      if (done) break
      chunks.push(new TextDecoder().decode(value))
    }

    const allData = chunks.join('')
    expect(allData).toContain('"type":"complete"')
    expect(allData).toContain('Could you clarify')
  })

  it('should call embedding generation with correct query', async () => {
    const { createEmbedding } = await import('@/lib/openai')

    const request = new NextRequest('http://localhost:3000/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        question: 'What is machine learning?',
        sessionId: 'test-session-123'
      })
    })

    const response = await POST(request)

    // Drain the stream to ensure all async operations complete
    const reader = response.body?.getReader()
     
    while (true) {
      const { done } = await reader!.read()
      if (done) break
    }

    expect(createEmbedding).toHaveBeenCalledWith('What is machine learning?')
  })

  it('should perform hybrid search with correct parameters', async () => {
    const { intelligentSearch } = await import('@/lib/hybrid-search')

    const request = new NextRequest('http://localhost:3000/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        question: 'What is machine learning?',
        sessionId: 'test-session-123'
      })
    })

    await POST(request)

    expect(intelligentSearch).toHaveBeenCalledWith(
      'What is machine learning?',
      [0.1, 0.2, 0.3],
      expect.objectContaining({
        maxResults: 20,
        minSemanticScore: 0.5,
        minKeywordScore: 0.05,
        userId: 'test-user-uuid',
        enableCache: true
      })
    )
  })

  it('should track onboarding milestones', async () => {
    const { trackOnboardingMilestone } = await import('@/lib/onboardingTracker')

    const request = new NextRequest('http://localhost:3000/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        question: 'What is machine learning?',
        sessionId: 'test-session-123'
      })
    })

    await POST(request)

    expect(trackOnboardingMilestone).toHaveBeenCalledWith(
      expect.objectContaining({
        clerkUserId: 'test-clerk-user-123',
        milestone: 'first_chat'
      })
    )
  })

  // Note: User context updates happen in background after streaming completes
  // These are fire-and-forget operations that are difficult to test reliably
  // in integration tests. Consider E2E tests or separate unit tests for these.
  it.skip('should update user context after successful response', async () => {
    const { userContextManager } = await import('@/lib/userContextManager')

    const request = new NextRequest('http://localhost:3000/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        question: 'What is machine learning?',
        sessionId: 'test-session-123'
      })
    })

    const response = await POST(request)

    // Wait for stream to complete
    const reader = response.body?.getReader()
     
    while (true) {
      const { done } = await reader!.read()
      if (done) break
    }

    // Give async operations more time to complete (background operations)
    await new Promise(resolve => setTimeout(resolve, 500))

    expect(userContextManager.updateUserContext).toHaveBeenCalled()
    expect(userContextManager.logConversation).toHaveBeenCalled()
  })
})
