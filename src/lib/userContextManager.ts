import { withSupabaseAdmin } from '@/lib/supabase'
import { advancedCache, CACHE_NAMESPACES, CACHE_TTL } from '@/lib/advanced-cache'

// =================================================================
// TYPE DEFINITIONS - Memory system interfaces
// =================================================================
export interface UserContext {
  userId: string

  // Topic Knowledge & Interest Tracking
  topicFamiliarity: Record<string, {
    level: number        // 0-1 expertise level
    interactions: number // How many times discussed
    lastAsked: Date     // When last discussed
    commonQuestions: string[] // Their typical question patterns
    relatedConcepts?: string[] // Connected topics for this user
  }>

  // Question Patterns & Preferences
  questionPatterns: {
    preferredDetailLevel: 'summary' | 'detailed' | 'comprehensive'
    commonIntents: Array<{
      category: 'factual' | 'conceptual' | 'comparative' | 'procedural' | 'exploratory'
      frequency: number
      successRate: number // How satisfied they were with answers
    }>
    followUpTendency: number // 0-1, how often they ask follow-ups
    averageSessionLength: number
  }

  // Session Memory
  currentSessionTopics: string[]
  crossSessionConnections: Array<{
    sessionId: string
    relatedTopics: string[]
    timestamp: Date
    questionPatterns?: string[]
  }>

  // Behavioral Insights
  behavioralInsights: {
    expertiseLevel: 'beginner' | 'intermediate' | 'advanced'
    preferredSources: string[]      // Which document types they find most helpful
    frustrationIndicators: number   // Times they've reformulated questions
    conceptualGrowth: Record<string, {
      startLevel: number
      currentLevel: number
      progressRate: number
    }>
  }
}

export interface ConversationMemory {
  id: string
  userId: string
  sessionId: string | null
  conversationId: string | null
  questionText: string
  questionIntent: string
  questionComplexity: number
  ambiguityScore: number
  extractedTopics: string[]
  userSatisfaction: number | null
  clarificationRequested: boolean
  followUpGenerated: boolean
  isFollowUp: boolean
  relatedConversationIds: string[]
  personalizedThreshold: number | null
  recommendedComplexity: string | null
  createdAt: Date
}

export interface TopicProgression {
  userId: string
  topicName: string
  expertiseLevel: number
  firstInteractionDate: Date
  lastInteractionDate: Date
  totalInteractions: number
  successfulInteractions: number
  progressionRate: number
  plateauDetected: boolean
  connectedTopics: string[]
}

// =================================================================
// USER CONTEXT MANAGER CLASS - Singleton pattern for memory management
// =================================================================
class UserContextManager {
  private static instance: UserContextManager
  private contextCache = new Map<string, UserContext>()

  public static getInstance(): UserContextManager {
    if (!UserContextManager.instance) {
      UserContextManager.instance = new UserContextManager()
    }
    return UserContextManager.instance
  }

  // =================================================================
  // CONTEXT LOADING - Get user context with caching
  // =================================================================
  async getUserContext(userId: string): Promise<UserContext> {
    // Check advanced cache first
    const cacheKey = `user_context_${userId}`
    let context = advancedCache.get<UserContext>(CACHE_NAMESPACES.USER_SESSIONS, cacheKey)

    if (context) {
      return context
    }

    // Load from database
    context = await this.loadContextFromDB(userId)

    // Cache for future requests
    advancedCache.set(CACHE_NAMESPACES.USER_SESSIONS, cacheKey, context, CACHE_TTL.SHORT)

    return context
  }

  private async loadContextFromDB(userId: string): Promise<UserContext> {
    return withSupabaseAdmin(async (supabase) => {
      const { data: contextData, error } = await supabase
        .from('user_context')
        .select('*')
        .eq('user_id', userId)
        .single()

      if (error && error.code !== 'PGRST116') {
        throw new Error('Failed to load user context')
      }

      // If no context exists, create default
      if (!contextData) {
        return this.createDefaultContext(userId)
      }

      // Parse and return existing context with proper structure validation
      const questionPatterns = contextData.question_patterns || {
        preferredDetailLevel: 'detailed',
        commonIntents: [],
        followUpTendency: 0.5,
        averageSessionLength: 0
      }

      // Ensure commonIntents is always an array
      if (!Array.isArray(questionPatterns.commonIntents)) {
        questionPatterns.commonIntents = []
      }

      return {
        userId,
        topicFamiliarity: contextData.topic_familiarity || {},
        questionPatterns,
        currentSessionTopics: contextData.current_session_topics || [],
        crossSessionConnections: contextData.cross_session_connections || [],
        behavioralInsights: contextData.behavioral_insights || {
          expertiseLevel: 'beginner',
          preferredSources: [],
          frustrationIndicators: 0,
          conceptualGrowth: {}
        }
      }
    })
  }

  private createDefaultContext(userId: string): UserContext {
    return {
      userId,
      topicFamiliarity: {},
      questionPatterns: {
        preferredDetailLevel: 'detailed',
        commonIntents: [],
        followUpTendency: 0.5,
        averageSessionLength: 0
      },
      currentSessionTopics: [],
      crossSessionConnections: [],
      behavioralInsights: {
        expertiseLevel: 'beginner',
        preferredSources: [],
        frustrationIndicators: 0,
        conceptualGrowth: {}
      }
    }
  }

  // =================================================================
  // CONTEXT UPDATING - Update user context with new conversation data
  // =================================================================
  async updateUserContext(
    userId: string,
    question: string,
    response: string,
    sources: Array<{title: string; author?: string; chunk_id: string}>,
    sessionId: string,
    userSatisfaction?: number
  ): Promise<void> {
    try {
      const context = await this.getUserContext(userId)

      // Extract topics from the conversation
      const topics = await this.extractTopics(question, response, sources)

      // Update topic familiarity
      await this.updateTopicFamiliarity(context, topics, question, userSatisfaction)

      // Update question patterns
      await this.updateQuestionPatterns(context, question, userSatisfaction)

      // Update session topics
      context.currentSessionTopics = [...new Set([...context.currentSessionTopics, ...topics])]

      // Update cross-session connections
      await this.updateCrossSessionConnections(context, sessionId, topics)

      // Save to database
      await this.saveContextToDB(context)

      // Update cache
      const cacheKey = `user_context_${userId}`
      advancedCache.set(CACHE_NAMESPACES.USER_SESSIONS, cacheKey, context, CACHE_TTL.SHORT)

    } catch (error) {
      // Don't throw - memory updates shouldn't break the main chat flow
    }
  }

  // =================================================================
  // TOPIC EXTRACTION - Extract main topics from conversation using GPT
  // =================================================================
  private async extractTopics(question: string, response: string, sources: Array<{title: string; author?: string}>): Promise<string[]> {
    try {
      // Import OpenAI instance dynamically to avoid import issues
      const { openai } = await import('@/lib/openai')

      if (!openai) {
        console.error('OpenAI instance not available for topic extraction')
        return this.fallbackTopicExtraction(question, response)
      }

      const sourceContext = sources.map(s => s.title || '').join(', ')

      const prompt = `Extract 2-3 main theological/spiritual topics from this conversation:

Question: ${question}
Response: ${response.substring(0, 500)}...
Sources: ${sourceContext}

Return topics as a JSON array of strings. Topics should be:
- Theological concepts (e.g., "prayer", "salvation", "worship")
- Biblical themes (e.g., "Genesis creation", "New Testament")
- Practical ministry (e.g., "church planting", "missions")
- Spiritual disciplines (e.g., "Bible study", "discipleship")

Example: ["prayer", "spiritual warfare", "missions"]`

      const result = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        max_tokens: 100
      })

      const content = result.choices[0]?.message?.content
      if (!content) return ['general']

      try {
        const topics = JSON.parse(content)
        return Array.isArray(topics) ? topics.slice(0, 3) : ['general']
      } catch (error) {
        // Fallback: extract keywords if JSON parsing fails
        return this.extractKeywords(question, response).slice(0, 3)
      }

    } catch (error) {
      return this.fallbackTopicExtraction(question, response)
    }
  }

  private fallbackTopicExtraction(question: string, response: string): string[] {
    // Use keyword extraction as fallback
    const extracted = this.extractKeywords(question, response).slice(0, 3)
    return extracted.length > 0 ? extracted : ['general']
  }

  private extractKeywords(question: string, response: string): string[] {
    const text = `${question} ${response}`.toLowerCase()
    const keywords = [
      'prayer', 'worship', 'bible', 'scripture', 'theology', 'faith', 'jesus', 'christ',
      'church', 'ministry', 'missions', 'evangelism', 'discipleship', 'salvation',
      'holy spirit', 'trinity', 'creation', 'genesis', 'gospel', 'kingdom'
    ]

    return keywords.filter(keyword => text.includes(keyword)).slice(0, 3) || ['general']
  }

  // =================================================================
  // TOPIC FAMILIARITY UPDATES
  // =================================================================
  private async updateTopicFamiliarity(
    context: UserContext,
    topics: string[],
    question: string,
    satisfaction?: number
  ): Promise<void> {
    const questionComplexity = await this.assessQuestionComplexity(question)

    topics.forEach(topic => {
      if (!context.topicFamiliarity[topic]) {
        context.topicFamiliarity[topic] = {
          level: 0.1, // Start as beginner
          interactions: 0,
          lastAsked: new Date(),
          commonQuestions: []
        }
      }

      const topicData = context.topicFamiliarity[topic]
      topicData.interactions++
      topicData.lastAsked = new Date()
      topicData.commonQuestions.push(question)

      // Increase familiarity based on question complexity and satisfaction
      const complexityBonus = questionComplexity * 0.05
      const satisfactionBonus = (satisfaction || 3) / 5 * 0.05 // Scale to 0-0.05
      topicData.level = Math.min(1.0, topicData.level + complexityBonus + satisfactionBonus)

      // Keep only recent questions
      if (topicData.commonQuestions.length > 10) {
        topicData.commonQuestions = topicData.commonQuestions.slice(-5)
      }
    })
  }

  private async assessQuestionComplexity(question: string): Promise<number> {
    // Simple complexity assessment based on length and keywords
    const complexWords = ['theology', 'eschatology', 'hermeneutics', 'exegesis', 'soteriology']
    const hasComplexWords = complexWords.some(word => question.toLowerCase().includes(word))
    const lengthScore = Math.min(question.length / 200, 1) // Longer questions = more complex

    return hasComplexWords ? Math.max(0.7, lengthScore) : lengthScore * 0.5
  }

  // =================================================================
  // QUESTION PATTERNS UPDATES
  // =================================================================
  private async updateQuestionPatterns(
    context: UserContext,
    question: string,
    satisfaction?: number
  ): Promise<void> {
    const intent = await this.classifyQuestionIntent(question)

    // Update intent frequency
    let intentData = context.questionPatterns.commonIntents.find(i => i.category === intent)
    if (!intentData) {
      intentData = { category: intent, frequency: 0, successRate: 0 }
      context.questionPatterns.commonIntents.push(intentData)
    }

    intentData.frequency++
    if (satisfaction !== undefined) {
      // Update success rate with exponential moving average
      intentData.successRate = (intentData.successRate * 0.8) + ((satisfaction / 5) * 0.2)
    }
  }

  private async classifyQuestionIntent(question: string): Promise<'factual' | 'conceptual' | 'comparative' | 'procedural' | 'exploratory'> {
    const q = question.toLowerCase()

    if (q.includes('what is') || q.includes('define') || q.includes('who is')) return 'factual'
    if (q.includes('how') || q.includes('steps') || q.includes('process')) return 'procedural'
    if (q.includes('compare') || q.includes('difference') || q.includes('versus')) return 'comparative'
    if (q.includes('why') || q.includes('explain') || q.includes('understand')) return 'conceptual'

    return 'exploratory'
  }

  // =================================================================
  // CROSS-SESSION CONNECTIONS
  // =================================================================
  private async updateCrossSessionConnections(
    context: UserContext,
    sessionId: string,
    topics: string[]
  ): Promise<void> {
    // Add current session to connections
    const existingConnection = context.crossSessionConnections.find(c => c.sessionId === sessionId)

    if (existingConnection) {
      existingConnection.relatedTopics = [...new Set([...existingConnection.relatedTopics, ...topics])]
    } else {
      context.crossSessionConnections.push({
        sessionId,
        relatedTopics: topics,
        timestamp: new Date()
      })
    }

    // Keep only recent connections (last 50 sessions)
    if (context.crossSessionConnections.length > 50) {
      context.crossSessionConnections = context.crossSessionConnections
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
        .slice(0, 50)
    }
  }

  // =================================================================
  // DATABASE PERSISTENCE
  // =================================================================
  private async saveContextToDB(context: UserContext): Promise<void> {
    return withSupabaseAdmin(async (supabase) => {
      const { error } = await supabase
        .from('user_context')
        .upsert({
          user_id: context.userId,
          topic_familiarity: context.topicFamiliarity,
          question_patterns: context.questionPatterns,
          behavioral_insights: context.behavioralInsights,
          current_session_topics: context.currentSessionTopics,
          cross_session_connections: context.crossSessionConnections,
          updated_at: new Date().toISOString()
        })

      if (error) {
        throw new Error('Failed to save user context')
      }
    })
  }

  // =================================================================
  // CONVERSATION MEMORY LOGGING
  // =================================================================
  async logConversation(
    userId: string,
    sessionId: string | null,
    conversationId: string | null,
    question: string,
    response: string,
    sources: Array<{title: string; author?: string; chunk_id: string}>,
    satisfaction?: number
  ): Promise<void> {
    try {
      const topics = await this.extractTopics(question, response, sources)
      const intent = await this.classifyQuestionIntent(question)
      const complexity = await this.assessQuestionComplexity(question)

      return withSupabaseAdmin(async (supabase) => {
        const { error } = await supabase
          .from('conversation_memory')
          .insert({
            user_id: userId,
            session_id: sessionId,
            conversation_id: conversationId,
            question_text: question,
            question_intent: intent,
            question_complexity: complexity,
            ambiguity_score: 0, // Will be enhanced later
            extracted_topics: topics,
            user_satisfaction: satisfaction || null,
            clarification_requested: false,
            follow_up_generated: false,
            is_follow_up: false,
            related_conversation_ids: [],
            personalized_threshold: null,
            recommended_complexity: null
          })

        if (error) {
        }
      })
    } catch (error) {
      // Don't throw - memory logging shouldn't break chat
    }
  }

  // =================================================================
  // ENHANCED CONTEXT MANAGEMENT - Context validation and continuation
  // =================================================================

  /**
   * Detect context gaps in user questions
   */
  async detectContextGaps(
    question: string,
    userId: string,
    sessionId: string
  ): Promise<{
    hasContextGap: boolean
    missingContext?: string[]
    suggestedContext?: string[]
    confirmationNeeded: boolean
  }> {
    const context = await this.getUserContext(userId)
    const lowerQ = question.toLowerCase()

    // Check for pronouns without clear antecedents
    const pronouns = ['it', 'this', 'that', 'they', 'them', 'these', 'those']
    const foundPronouns = pronouns.filter(pronoun =>
      new RegExp(`\\b${pronoun}\\b`).test(lowerQ)
    )

    if (foundPronouns.length === 0) {
      return { hasContextGap: false, confirmationNeeded: false }
    }

    // Look for recent session topics that might provide context
    const recentSession = context.crossSessionConnections
      .find(conn => conn.sessionId === sessionId)

    const recentTopics = recentSession?.relatedTopics || []
    const allRecentTopics = context.crossSessionConnections
      .filter(conn => Date.now() - conn.timestamp.getTime() < 7 * 24 * 60 * 60 * 1000) // Last 7 days
      .flatMap(conn => conn.relatedTopics)
      .slice(0, 10)

    return {
      hasContextGap: true,
      missingContext: foundPronouns,
      suggestedContext: recentTopics.length > 0 ? recentTopics : allRecentTopics.slice(0, 3),
      confirmationNeeded: recentTopics.length > 0
    }
  }

  /**
   * Generate context confirmation questions
   */
  async generateContextConfirmation(
    question: string,
    suggestedContext: string[],
    userId: string
  ): Promise<string[]> {
    if (suggestedContext.length === 0) return []

    const confirmations = []

    // Generate contextual questions based on recent topics
    if (suggestedContext.length === 1) {
      confirmations.push(`Are you asking about ${suggestedContext[0]} from our previous conversation?`)
    } else if (suggestedContext.length > 1) {
      confirmations.push(`Are you referring to one of these topics we discussed: ${suggestedContext.slice(0, 3).join(', ')}?`)
    }

    return confirmations
  }

  /**
   * Validate cross-session context continuation
   */
  async validateContextContinuation(
    question: string,
    userId: string,
    sessionId: string,
    conversationHistory: Array<{question: string; answer: string}>
  ): Promise<{
    isValidContinuation: boolean
    contextualQuestion?: string
    confidence: number
  }> {
    const context = await this.getUserContext(userId)

    // Check if question seems to continue from previous sessions
    const hasContextualTerms = /\b(it|this|that|they|them|we discussed|as mentioned|from before)\b/i.test(question)

    if (!hasContextualTerms) {
      return { isValidContinuation: true, confidence: 1.0 }
    }

    // If there's no conversation history in current session, might be cross-session reference
    if (conversationHistory.length === 0) {
      const recentTopics = context.crossSessionConnections
        .filter(conn => conn.sessionId !== sessionId)
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
        .slice(0, 3)
        .flatMap(conn => conn.relatedTopics)

      if (recentTopics.length > 0) {
        const contextualQuestion = this.buildContextualQuestion(question, recentTopics)
        return {
          isValidContinuation: false,
          contextualQuestion,
          confidence: 0.7
        }
      }
    }

    return { isValidContinuation: true, confidence: 0.8 }
  }

  /**
   * Build enhanced contextual question with cross-session information
   */
  private buildContextualQuestion(originalQuestion: string, recentTopics: string[]): string {
    // Create a more informed question by adding recent context
    const contextSummary = recentTopics.slice(0, 3).join(', ')
    return `${originalQuestion} (Context from recent conversations: ${contextSummary})`
  }

  /**
   * Improve context tracking with topic threads
   */
  async trackTopicThread(
    userId: string,
    sessionId: string,
    topics: string[],
    question: string
  ): Promise<void> {
    const context = await this.getUserContext(userId)

    // Enhanced topic tracking with question patterns
    for (const topic of topics) {
      // Track how this topic connects to others in the thread
      const relatedTopics = topics.filter(t => t !== topic)

      // Update topic familiarity with thread information
      if (context.topicFamiliarity[topic]) {
        // Add cross-topic relationships
        if (!context.topicFamiliarity[topic].relatedConcepts) {
          context.topicFamiliarity[topic].relatedConcepts = []
        }

        // Add unique related concepts
        const existingRelated = context.topicFamiliarity[topic].relatedConcepts || []
        context.topicFamiliarity[topic].relatedConcepts = [
          ...new Set([...existingRelated, ...relatedTopics])
        ].slice(0, 10) // Keep top 10 related concepts
      }
    }

    // Update cross-session connections with enhanced information
    const existingConnection = context.crossSessionConnections.find(c => c.sessionId === sessionId)

    if (existingConnection) {
      existingConnection.relatedTopics = [...new Set([...existingConnection.relatedTopics, ...topics])]
      existingConnection.timestamp = new Date()

      // Add question patterns for this session
      if (!existingConnection.questionPatterns) {
        existingConnection.questionPatterns = []
      }
      existingConnection.questionPatterns.push(question)
      existingConnection.questionPatterns = existingConnection.questionPatterns.slice(-5) // Keep last 5
    } else {
      context.crossSessionConnections.push({
        sessionId,
        relatedTopics: topics,
        timestamp: new Date(),
        questionPatterns: [question]
      })
    }

    // Update the context in memory and database
    await this.saveContextToDB(context)
  }

  /**
   * Get contextual suggestions for better questions
   */
  async getContextualSuggestions(
    userId: string,
    currentQuestion: string
  ): Promise<{
    relatedTopics: string[]
    suggestedQuestions: string[]
    connectionOpportunities: string[]
  }> {
    const context = await this.getUserContext(userId)

    // Find topics related to current question
    const questionWords = currentQuestion.toLowerCase().split(/\s+/)
    const relatedTopics = Object.keys(context.topicFamiliarity)
      .filter(topic => {
        return questionWords.some(word =>
          topic.toLowerCase().includes(word) ||
          word.includes(topic.toLowerCase())
        )
      })
      .slice(0, 5)

    // Generate suggestions based on user's learning patterns
    const suggestedQuestions = this.generateContextualQuestions(context, relatedTopics)

    // Find connection opportunities between topics
    const connectionOpportunities = this.findTopicConnections(context, relatedTopics)

    return {
      relatedTopics,
      suggestedQuestions,
      connectionOpportunities
    }
  }

  private generateContextualQuestions(context: UserContext, topics: string[]): string[] {
    const suggestions = []

    for (const topic of topics.slice(0, 3)) {
      const familiarity = context.topicFamiliarity[topic]
      if (familiarity) {
        if (familiarity.level < 0.3) {
          suggestions.push(`What are the basic principles of ${topic}?`)
        } else if (familiarity.level < 0.7) {
          suggestions.push(`How can I apply ${topic} in practical situations?`)
        } else {
          suggestions.push(`What are advanced concepts in ${topic} I should explore?`)
        }
      }
    }

    return suggestions.slice(0, 3)
  }

  private findTopicConnections(context: UserContext, currentTopics: string[]): string[] {
    const connections = []

    for (const topic of currentTopics) {
      const familiarity = context.topicFamiliarity[topic]
      if (familiarity && familiarity.relatedConcepts) {
        const related = familiarity.relatedConcepts
          .filter(concept => !currentTopics.includes(concept))
          .slice(0, 2)

        for (const concept of related) {
          connections.push(`How does ${topic} relate to ${concept}?`)
        }
      }
    }

    return connections.slice(0, 3)
  }

  // =================================================================
  // MEMORY ANALYTICS
  // =================================================================
  async getMemoryStats(userId: string): Promise<{
    totalTopics: number
    expertiseAreas: string[]
    learningProgress: Record<string, number>
    conversationCount: number
  }> {
    const context = await this.getUserContext(userId)

    const expertiseAreas = Object.entries(context.topicFamiliarity)
      .filter(([_topic, data]) => data.level > 0.6)
      .map(([topic, _data]) => topic)

    const learningProgress = Object.fromEntries(
      Object.entries(context.topicFamiliarity)
        .map(([topic, data]) => [topic, Math.round(data.level * 100)])
    )

    return {
      totalTopics: Object.keys(context.topicFamiliarity).length,
      expertiseAreas,
      learningProgress,
      conversationCount: Object.values(context.topicFamiliarity)
        .reduce((sum, data) => sum + data.interactions, 0)
    }
  }
}

// Export singleton instance
export const userContextManager = UserContextManager.getInstance()
export default userContextManager