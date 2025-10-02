// Intelligent Question Clarification System
// Analyzes actual search results to determine if clarification would improve answer quality

import type { SearchResult } from './hybrid-search'

// =================================================================
// TYPE DEFINITIONS
// =================================================================

export interface ClarificationAnalysis {
  needsClarification: boolean
  confidence: number
  clarificationType: 'content_diversity' | 'topic_clustering' | 'low_confidence_broad' | 'scope_ambiguity' | 'none'
  reasoning: string
  clarificationMessage?: string
  suggestedRefinements?: string[]
  contentThemes?: ContentTheme[]
}

export interface ContentTheme {
  name: string
  description: string
  resultCount: number
  avgScore: number
}

export interface TopicAspect {
  name: string
  description: string
  resultCount: number
  keywords: string[]
  avgScore: number
}

export interface SearchAnalysisInput {
  query: string
  searchResults: SearchResult[]
  searchConfidence: number
  searchStrategy: string
  recentConversations?: Array<{ question: string; answer: string }>
  wasQueryEnhanced?: boolean
  originalQuery?: string
  enhancedQuery?: string
}

// =================================================================
// INTELLIGENT CLARIFICATION SYSTEM
// =================================================================

export class IntelligentClarificationSystem {

  /**
   * Main entry point - analyzes search results to determine if clarification is beneficial
   */
  analyzeSearchResults(input: SearchAnalysisInput): ClarificationAnalysis {
    const { query, searchResults, searchConfidence, recentConversations, wasQueryEnhanced, originalQuery, enhancedQuery } = input

    // Use the appropriate query for analysis - original query for nonsense detection, enhanced for content analysis
    const queryForAnalysis = originalQuery || query
    const actualSearchQuery = enhancedQuery || query

    console.log(`🔍 CLARIFICATION ANALYSIS: original="${queryForAnalysis}", enhanced="${actualSearchQuery}", wasEnhanced=${wasQueryEnhanced}`);

    // Pre-filter: Quick deterministic checks for obvious garbage (OpenAI-inspired)
    const preFilterResult = this.preFilterQuery(query)
    if (preFilterResult.isRejected) {
      console.log(`🚫 PRE-FILTER REJECTION: "${query}" - ${preFilterResult.reason}`)
      return {
        needsClarification: false,
        confidence: 0.01, // Extremely low confidence for garbage
        clarificationType: 'none',
        reasoning: `Pre-filter rejection: ${preFilterResult.reason}`
      }
    }

    // If no results, no clarification needed - let the system handle "no results" response
    if (searchResults.length === 0) {
      return {
        needsClarification: false,
        confidence: 1.0,
        clarificationType: 'none',
        reasoning: 'No search results found'
      }
    }

    // Check for obvious gibberish patterns first - use original query
    const isGibberish = this.detectGibberish(queryForAnalysis)
    if (isGibberish) {
      console.log(`🚫 GIBBERISH DETECTED: "${queryForAnalysis}" - obvious keyboard mashing`)
      return {
        needsClarification: false,
        confidence: 0.01, // Extremely low confidence for gibberish
        clarificationType: 'none',
        reasoning: 'Query appears to be gibberish or random characters'
      }
    }

    // Coverage-based analysis (OpenAI-inspired) - use original query for nonsense detection
    const coverageAnalysis = this.analyzeCoverage(searchResults, queryForAnalysis, wasQueryEnhanced)

    // Check for nonsensical queries using coverage metrics
    if (coverageAnalysis.isNonsensical) {
      console.log(`🚫 NONSENSICAL QUERY DETECTED: "${query}" - ${coverageAnalysis.reasoning}`)
      return {
        needsClarification: false,
        confidence: 0.05, // Very low confidence indicates poor results
        clarificationType: 'none',
        reasoning: coverageAnalysis.reasoning
      }
    }

    // Check if this is a clarification follow-up
    const isFollowUp = this.isClarificationFollowUp(query, recentConversations)
    if (isFollowUp) {
      console.log(`🎯 CLARIFICATION FOLLOW-UP DETECTED: "${query}" - proceeding directly to answer`)
      return {
        needsClarification: false,
        confidence: Math.max(searchConfidence, 0.7),
        clarificationType: 'none',
        reasoning: 'Query is a follow-up to recent clarification'
      }
    }

    // If high confidence and focused results, proceed directly
    if (searchConfidence > 0.7 && this.isResultSetFocused(searchResults)) {
      return {
        needsClarification: false,
        confidence: searchConfidence,
        clarificationType: 'none',
        reasoning: 'High confidence results with focused content'
      }
    }

    // Analyze for different types of clarification opportunities
    const documentDiversityAnalysis = this.analyzeDocumentDiversity(searchResults)
    const topicClusteringAnalysis = this.analyzeTopicClustering(searchResults, queryForAnalysis)
    const confidenceBreadthAnalysis = this.analyzeLowConfidenceBreadth(searchResults, searchConfidence)
    const scopeAmbiguityAnalysis = this.analyzeScopeAmbiguity(searchResults, queryForAnalysis)

    // Smart clarification decision logic
    return this.makeSmartClarificationDecision({
      documentDiversityAnalysis,
      topicClusteringAnalysis,
      confidenceBreadthAnalysis,
      scopeAmbiguityAnalysis,
      searchConfidence,
      resultCount: searchResults.length,
      query
    })
  }

  /**
   * Check if result set is focused (similar documents/topics)
   */
  private isResultSetFocused(results: SearchResult[]): boolean {
    if (results.length <= 3) return true

    // Check document diversity
    const uniqueDocuments = new Set(results.map(r => r.documentTitle))
    const documentDiversityRatio = uniqueDocuments.size / results.length

    // If results come from few documents, they're likely focused
    return documentDiversityRatio < 0.4
  }

  /**
   * Analyze if results contain diverse content themes that warrant clarification
   */
  private analyzeDocumentDiversity(results: SearchResult[]): ClarificationAnalysis {
    // Extract key themes from the actual search results content
    const contentThemes = this.extractContentThemes(results)

    // Need at least 3 distinct themes to warrant clarification
    if (contentThemes.length < 3) {
      return {
        needsClarification: false,
        confidence: 0.3,
        clarificationType: 'content_diversity',
        reasoning: 'Insufficient content theme diversity'
      }
    }

    // Check if themes are well-represented (not dominated by one theme)
    const themeCounts = contentThemes.map(t => t.resultCount)
    const maxCount = Math.max(...themeCounts)
    const totalCount = themeCounts.reduce((sum, count) => sum + count, 0)
    const dominanceRatio = maxCount / totalCount

    // If one theme dominates (>70%), don't clarify
    if (dominanceRatio > 0.7) {
      return {
        needsClarification: false,
        confidence: 0.4,
        clarificationType: 'content_diversity',
        reasoning: 'One content theme dominates results'
      }
    }

    // Generate document-based clarification options
    const documentOptions = this.generateDocumentBasedOptions(results, contentThemes)

    return {
      needsClarification: true,
      confidence: 0.8,
      clarificationType: 'content_diversity',
      reasoning: 'Results contain multiple distinct content themes',
      clarificationMessage: this.generateDocumentBasedClarificationMessage(contentThemes, documentOptions),
      contentThemes,
      suggestedRefinements: documentOptions
    }
  }


  /**
   * Analyze if results cluster into distinct topic areas
   */
  private analyzeTopicClustering(results: SearchResult[], query: string): ClarificationAnalysis {
    // Identify distinct aspects/subtopics within the search results
    const topicAspects = this.identifyTopicAspects(results, query)

    if (topicAspects.length < 2) {
      return {
        needsClarification: false,
        confidence: 0.3,
        clarificationType: 'topic_clustering',
        reasoning: 'Results focus on single aspect of the topic'
      }
    }

    // Check if aspects are well-represented (each has multiple results)
    const wellRepresentedAspects = topicAspects.filter(aspect => aspect.resultCount >= 2)

    if (wellRepresentedAspects.length < 2) {
      return {
        needsClarification: false,
        confidence: 0.4,
        clarificationType: 'topic_clustering',
        reasoning: 'Topic aspects not well-represented in results'
      }
    }

    // Generate document-based clarification options for topic aspects
    const topAspects = wellRepresentedAspects
      .sort((a, b) => b.resultCount - a.resultCount)
      .slice(0, 3)

    const aspectOptions = topAspects.map(aspect =>
      `${aspect.name} (from ${aspect.resultCount} sources)`
    )

//     const _aspectDescriptions = topAspects
//       .map(aspect => `• **${aspect.name}**: ${aspect.description}`)
//       .join('\n')

    return {
      needsClarification: true,
      confidence: 0.7,
      clarificationType: 'topic_clustering',
      reasoning: `Results contain ${wellRepresentedAspects.length} distinct aspects of the topic`,
      clarificationMessage: this.generateTopicClusteringMessage(query, topAspects),
      suggestedRefinements: aspectOptions
    }
  }

  /**
   * Identify distinct aspects/subtopics within search results
   */
  private identifyTopicAspects(results: SearchResult[], query: string): TopicAspect[] {
    const queryLower = query.toLowerCase()
    const aspects: TopicAspect[] = []

    // Define common topic aspects with their identifying patterns
    const aspectPatterns = this.getTopicAspectPatterns(queryLower)

    for (const [aspectName, pattern] of aspectPatterns) {
      const matchingResults = results.filter(result => {
        const title = result.documentTitle.toLowerCase()
        const content = result.content?.toLowerCase() || ''

        return pattern.keywords.some(keyword =>
          title.includes(keyword) || content.includes(keyword)
        )
      })

      if (matchingResults.length > 0) {
        const avgScore = matchingResults.reduce((sum, r) => sum + r.score, 0) / matchingResults.length

        aspects.push({
          name: aspectName,
          description: pattern.description,
          resultCount: matchingResults.length,
          keywords: pattern.keywords,
          avgScore
        })
      }
    }

    return aspects
  }

  /**
   * Get topic aspect patterns for different types of queries
   */
  private getTopicAspectPatterns(query: string): Map<string, { keywords: string[], description: string }> {
    const patterns = new Map()

    // Baptism-related aspects
    if (query.includes('baptism') || query.includes('baptize')) {
      patterns.set('Water Baptism Practices', {
        keywords: ['water', 'immersion', 'ceremony', 'practice', 'ritual'],
        description: 'Ceremonial practices and water baptism procedures'
      })
      patterns.set('Spirit Baptism', {
        keywords: ['spirit', 'holy spirit', 'pentecost', 'spiritual'],
        description: 'Baptism of the Holy Spirit and spiritual aspects'
      })
      patterns.set('Biblical Baptism', {
        keywords: ['jesus', 'john', 'jordan', 'biblical', 'scripture'],
        description: 'Biblical accounts and examples of baptism'
      })
      patterns.set('Infant vs Adult', {
        keywords: ['infant', 'child', 'adult', 'believer', 'age'],
        description: 'Different perspectives on age for baptism'
      })
      patterns.set('Theological Significance', {
        keywords: ['theology', 'doctrine', 'meaning', 'significance', 'salvation'],
        description: 'Theological meaning and doctrinal importance'
      })
    }

    // Prayer-related aspects
    if (query.includes('prayer') || query.includes('pray')) {
      patterns.set('Personal Prayer', {
        keywords: ['personal', 'individual', 'private', 'devotion', 'quiet'],
        description: 'Individual prayer and personal devotional practices'
      })
      patterns.set('Corporate Prayer', {
        keywords: ['corporate', 'church', 'group', 'congregation', 'together'],
        description: 'Group prayer and congregational worship'
      })
      patterns.set('Prayer Methods', {
        keywords: ['method', 'technique', 'approach', 'steps', 'keys'],
        description: 'Different methods and approaches to prayer'
      })
      patterns.set('Types of Prayer', {
        keywords: ['intercession', 'petition', 'thanksgiving', 'praise', 'confession'],
        description: 'Different types and forms of prayer'
      })
    }

    // Church-related aspects
    if (query.includes('church')) {
      patterns.set('Church as Building', {
        keywords: ['building', 'structure', 'facility', 'location', 'place'],
        description: 'Physical church buildings and facilities'
      })
      patterns.set('Church as Body', {
        keywords: ['body', 'community', 'fellowship', 'believers', 'congregation'],
        description: 'Church as the body of believers and community'
      })
      patterns.set('Church Leadership', {
        keywords: ['leadership', 'pastor', 'elder', 'deacon', 'ministry'],
        description: 'Church leadership and organizational structure'
      })
      patterns.set('Church Mission', {
        keywords: ['mission', 'purpose', 'evangelism', 'outreach', 'discipleship'],
        description: 'Church mission and evangelistic purposes'
      })
    }

    // Ministry-related aspects
    if (query.includes('ministry')) {
      patterns.set('Pastoral Ministry', {
        keywords: ['pastoral', 'pastor', 'shepherd', 'care', 'counseling'],
        description: 'Pastoral care and shepherding ministry'
      })
      patterns.set('Teaching Ministry', {
        keywords: ['teaching', 'education', 'instruction', 'study', 'learning'],
        description: 'Educational and teaching aspects of ministry'
      })
      patterns.set('Evangelism Ministry', {
        keywords: ['evangelism', 'outreach', 'missions', 'witness', 'sharing'],
        description: 'Evangelistic and outreach ministry'
      })
      patterns.set('Service Ministry', {
        keywords: ['service', 'helping', 'practical', 'needs', 'compassion'],
        description: 'Practical service and helping ministries'
      })
    }

    return patterns
  }

  /**
   * Analyze if we have many results but low confidence (suggests need for refinement)
   */
  private analyzeLowConfidenceBreadth(results: SearchResult[], confidence: number): ClarificationAnalysis {
    // Check for quality of results - distinguish broad but valid vs mostly irrelevant
//     const _scores = results.map(r => r.score)
    const goodResults = results.filter(r => r.score >= 0.5) // Reasonably relevant results
    const decentResults = results.filter(r => r.score >= 0.4) // Marginally relevant results

    // Many results with low confidence suggests the query is too broad
    // BUT only if there are some decent results indicating the query is valid but needs refinement
    if (results.length >= 10 && confidence < 0.6) {
      // If we have some good results mixed in, this is truly a broad query that needs clarification
      if (goodResults.length >= 2 || decentResults.length >= 4) {
        return {
          needsClarification: true,
          confidence: 0.7,
          clarificationType: 'low_confidence_broad',
          reasoning: 'Many results with mixed confidence suggests query too broad but valid',
          clarificationMessage: `I found ${results.length} potentially relevant sections, but the results are quite broad. Could you be more specific about what aspect you're most interested in?`
        }
      } else {
        // If ALL results are poor quality, this is likely a nonsensical/irrelevant query
        return {
          needsClarification: false,
          confidence: 0.2,
          clarificationType: 'low_confidence_broad',
          reasoning: 'Many results but all with very low relevance - likely irrelevant query'
        }
      }
    }

    return {
      needsClarification: false,
      confidence: 0.3,
      clarificationType: 'low_confidence_broad',
      reasoning: 'Results are either focused or confidence is adequate'
    }
  }

  /**
   * Analyze if results suggest different scopes/levels of detail
   */
  private analyzeScopeAmbiguity(results: SearchResult[], _query: string): ClarificationAnalysis {
    // Check if results span from basic/overview to detailed/specific content
    const hasOverviewContent = results.some(r =>
      r.documentTitle.toLowerCase().includes('introduction') ||
      r.documentTitle.toLowerCase().includes('overview') ||
      r.documentTitle.toLowerCase().includes('basics')
    )

    const hasDetailedContent = results.some(r =>
      r.documentTitle.toLowerCase().includes('advanced') ||
      r.documentTitle.toLowerCase().includes('detailed') ||
      r.documentTitle.toLowerCase().includes('deep')
    )

    if (hasOverviewContent && hasDetailedContent) {
      return {
        needsClarification: true,
        confidence: 0.6,
        clarificationType: 'scope_ambiguity',
        reasoning: 'Results span both overview and detailed content',
        clarificationMessage: 'I found both introductory and detailed information. Would you prefer a general overview or more in-depth content?'
      }
    }

    return {
      needsClarification: false,
      confidence: 0.3,
      clarificationType: 'scope_ambiguity',
      reasoning: 'No scope ambiguity detected'
    }
  }

  /**
   * Extract key content themes from search results based on actual content
   */
  private extractContentThemes(results: SearchResult[]): Array<{name: string, description: string, resultCount: number, avgScore: number}> {
    const themes: Map<string, {results: SearchResult[], totalScore: number}> = new Map()

    // Analyze each result to identify themes based on content and document titles
    for (const result of results) {
      const resultThemes = this.identifyContentThemes(result)

      for (const theme of resultThemes) {
        if (!themes.has(theme)) {
          themes.set(theme, { results: [], totalScore: 0 })
        }
        themes.get(theme)!.results.push(result)
        themes.get(theme)!.totalScore += result.score
      }
    }

    // Convert to theme objects with descriptions
    return Array.from(themes.entries())
      .map(([themeName, data]) => ({
        name: themeName,
        description: this.generateThemeDescription(themeName, data.results),
        resultCount: data.results.length,
        avgScore: data.totalScore / data.results.length
      }))
      .filter(theme => theme.resultCount >= 2) // Only themes with multiple results
      .sort((a, b) => b.avgScore - a.avgScore)
  }

  /**
   * Identify content themes for a single search result
   */
  private identifyContentThemes(result: SearchResult): string[] {
    const themes: string[] = []
    const title = result.documentTitle.toLowerCase()
    const content = result.content?.toLowerCase() || ''

    // Check for practical/instructional content
    if (title.includes('how to') || content.includes('steps') || content.includes('guide') ||
        title.includes('keys to') || content.includes('practice')) {
      themes.push('practical guidance')
    }

    // Check for biblical/scriptural content
    if (title.includes('bible') || title.includes('scripture') || content.includes('biblical') ||
        title.includes('translation') || content.includes('verse')) {
      themes.push('biblical perspective')
    }

    // Check for theological/doctrinal content
    if (title.includes('theology') || title.includes('doctrine') || content.includes('theological') ||
        title.includes('teaching') || content.includes('doctrine')) {
      themes.push('theological understanding')
    }

    // Check for historical/background content
    if (content.includes('history') || content.includes('background') || content.includes('origin') ||
        title.includes('introduction') || content.includes('context')) {
      themes.push('historical context')
    }

    // Check for devotional/spiritual content
    if (title.includes('devotional') || content.includes('spiritual') || title.includes('prayer') ||
        content.includes('worship') || title.includes('praise')) {
      themes.push('spiritual application')
    }

    // Check for commentary/editorial content
    if (title.includes('editorial') || title.includes('commentary') || content.includes('commentary') ||
        title.includes('reflection') || content.includes('analysis')) {
      themes.push('commentary and reflection')
    }

    // If no specific themes found, categorize by document type
    if (themes.length === 0) {
      if (title.includes('curriculum') || title.includes('training')) {
        themes.push('educational content')
      } else {
        themes.push('general discussion')
      }
    }

    return themes
  }

  /**
   * Generate a natural description for a content theme
   */
  private generateThemeDescription(themeName: string, results: SearchResult[]): string {
    const documentTitles = results.map(r => r.documentTitle).slice(0, 2)

    switch (themeName) {
      case 'practical guidance':
        return `step-by-step instructions and practical approaches from sources like "${documentTitles[0]}"`
      case 'biblical perspective':
        return `scriptural insights and biblical references from "${documentTitles[0]}" and similar sources`
      case 'theological understanding':
        return `doctrinal explanations and theological concepts from "${documentTitles[0]}"`
      case 'historical context':
        return `background information and historical perspectives from "${documentTitles[0]}"`
      case 'spiritual application':
        return `devotional insights and spiritual practices from "${documentTitles[0]}"`
      case 'commentary and reflection':
        return `editorial perspectives and reflective commentary from "${documentTitles[0]}"`
      case 'educational content':
        return `structured learning materials from "${documentTitles[0]}"`
      default:
        return `general information from "${documentTitles[0]}" and related sources`
    }
  }

  /**
   * Generate document-based clarification options from actual search results
   */
  private generateDocumentBasedOptions(results: SearchResult[], themes: Array<{name: string, description: string, resultCount: number}>): string[] {
    const options: string[] = []

    // Extract top documents by score for each theme
    const themeDocuments = new Map<string, SearchResult[]>()

    for (const result of results) {
      const resultThemes = this.identifyContentThemes(result)
      for (const theme of resultThemes) {
        if (!themeDocuments.has(theme)) {
          themeDocuments.set(theme, [])
        }
        themeDocuments.get(theme)!.push(result)
      }
    }

    // Generate options based on actual documents found
    for (const theme of themes.slice(0, 4)) { // Limit to top 4 themes
      const documents = themeDocuments.get(theme.name) || []
      const topDocument = documents.sort((a, b) => b.score - a.score)[0]

      if (topDocument) {
        const docTitle = topDocument.documentTitle.replace(/\.(pdf|docx?|txt)$/i, '')
        options.push(`${theme.name} (see "${docTitle}")`)
      } else {
        options.push(theme.name)
      }
    }

    // Add document-specific options if we have highly relevant documents
    const topDocuments = results
      .filter(r => r.score >= 0.6)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)

    for (const doc of topDocuments) {
      const docTitle = doc.documentTitle.replace(/\.(pdf|docx?|txt)$/i, '')
      if (!options.some(opt => opt.includes(docTitle))) {
        options.push(`Focus on "${docTitle}"`)
      }
    }

    return options.slice(0, 5) // Return at most 5 options
  }

  /**
   * Generate document-based clarification message that references actual sources
   */
  private generateDocumentBasedClarificationMessage(themes: Array<{name: string, description: string, resultCount: number}>, options: string[]): string {
    if (themes.length === 0) {
      return "I found several relevant sources. Could you help me understand what specific aspect you're most interested in?"
    }

    const topThemes = themes.slice(0, 3)
    const themeDescriptions = topThemes.map(theme => `**${theme.name}** (${theme.resultCount} sources)`).join(', ')

    let message = `I found information covering ${themeDescriptions}. `

    if (options.length > 0) {
      message += `Which approach would be most helpful:\n\n`
      options.slice(0, 4).forEach((option, index) => {
        message += `${index + 1}. ${option}\n`
      })
    }

    return message.trim()
  }

  /**
   * Generate topic clustering message with document references
   */
  private generateTopicClusteringMessage(query: string, aspects: TopicAspect[]): string {
    const aspectList = aspects.map((aspect, index) =>
      `${index + 1}. **${aspect.name}**: ${aspect.description} (${aspect.resultCount} sources)`
    ).join('\n')

    return `I found information about different aspects of "${query}":\n\n${aspectList}\n\nWhich aspect interests you most?`
  }

  /**
   * Generate natural, conversational clarification message
   */
  private generateNaturalClarificationMessage(themes: Array<{name: string, description: string, resultCount: number}>): string {
    const topThemes = themes.slice(0, 3)

    if (topThemes.length === 2) {
      return `I found information covering ${topThemes[0].description} as well as ${topThemes[1].description}. Which approach would be more helpful for what you're looking for?`
    }

    if (topThemes.length >= 3) {
      const firstTwo = topThemes.slice(0, 2).map(t => t.description).join(', ')
      const last = topThemes[2].description
      return `I found several different approaches to your question including ${firstTwo}, and ${last}. What aspect interests you most?`
    }

    return `I found different perspectives on your question. Could you help me understand what specific aspect you're most interested in?`
  }

  /**
   * Smart clarification decision engine - combines all analysis results
   */
  private makeSmartClarificationDecision(input: {
    documentDiversityAnalysis: ClarificationAnalysis
    topicClusteringAnalysis: ClarificationAnalysis
    confidenceBreadthAnalysis: ClarificationAnalysis
    scopeAmbiguityAnalysis: ClarificationAnalysis
    searchConfidence: number
    resultCount: number
    query: string
  }): ClarificationAnalysis {
    const {
      documentDiversityAnalysis,
      topicClusteringAnalysis,
      confidenceBreadthAnalysis,
      scopeAmbiguityAnalysis,
      searchConfidence,
      resultCount,
      query
    } = input

    // Collect all clarification opportunities
    const clarificationOpportunities = [
      documentDiversityAnalysis,
      topicClusteringAnalysis,
      confidenceBreadthAnalysis,
      scopeAmbiguityAnalysis
    ].filter(analysis => analysis.needsClarification)

    // If no clarification opportunities, proceed directly
    if (clarificationOpportunities.length === 0) {
      return {
        needsClarification: false,
        confidence: Math.max(searchConfidence, 0.6),
        clarificationType: 'none',
        reasoning: 'Search results are sufficiently focused for direct answer'
      }
    }

    // Prioritize clarification types based on value to user
    const priorityWeights = new Map([
      ['topic_clustering', 1.0],        // Highest: Different aspects of same topic
      ['content_diversity', 0.8],       // High: Different content themes
      ['low_confidence_broad', 0.6],    // Medium: Too broad, needs refinement
      ['scope_ambiguity', 0.4],         // Lower: Overview vs detailed
    ])

    // Calculate weighted scores for each clarification opportunity
    const weightedOpportunities = clarificationOpportunities.map(opportunity => ({
      ...opportunity,
      weightedScore: opportunity.confidence * (priorityWeights.get(opportunity.clarificationType) || 0.5)
    }))

    // Sort by weighted score (highest first)
    weightedOpportunities.sort((a, b) => b.weightedScore - a.weightedScore)

    // Apply smart filtering rules
    const bestOpportunity = weightedOpportunities[0]

    // Don't clarify if search confidence is very high and results are focused
    if (searchConfidence > 0.75 && resultCount <= 8) {
      return {
        needsClarification: false,
        confidence: searchConfidence,
        clarificationType: 'none',
        reasoning: 'High confidence with focused results - proceeding directly'
      }
    }

    // Don't clarify if the best opportunity has low confidence
    if (bestOpportunity.confidence < 0.5) {
      return {
        needsClarification: false,
        confidence: Math.max(searchConfidence, 0.5),
        clarificationType: 'none',
        reasoning: 'Clarification opportunities have low confidence'
      }
    }

    // Don't clarify very specific queries that already seem focused
    const isQuerySpecific = this.isQuerySpecific(query)
    console.log(`🔍 Query specificity check: "${query}" → specific: ${isQuerySpecific}, searchConfidence: ${searchConfidence.toFixed(3)}`)

    if (isQuerySpecific && searchConfidence > 0.6) {
      console.log(`✅ SKIPPING CLARIFICATION: Query is specific enough (${searchConfidence.toFixed(3)} confidence)`)
      return {
        needsClarification: false,
        confidence: searchConfidence,
        clarificationType: 'none',
        reasoning: 'Query is already specific enough'
      }
    }

    // Apply minimum thresholds for different clarification types
    switch (bestOpportunity.clarificationType) {
      case 'content_diversity':
        // DISABLED: Content diversity should ALWAYS trigger synthesis, not clarification
        // Multiple themes from different documents = perfect synthesis opportunity!
        // The system should combine insights from all themes into one comprehensive answer
        console.log(`❌ Content diversity clarification DISABLED - multiple themes = synthesis opportunity (${documentDiversityAnalysis.contentThemes?.length || 0} themes, ${searchConfidence.toFixed(3)} confidence)`)
        break

      case 'topic_clustering':
        // Only clarify if we have clear distinct aspects AND it's not already specific
        console.log(`📊 Topic clustering: confidence ${bestOpportunity.confidence.toFixed(3)}, resultCount ${resultCount}, thresholds: conf>0.75, results>=12`)
        if (bestOpportunity.confidence > 0.75 && resultCount >= 12) {
          console.log(`✅ TOPIC CLUSTERING CLARIFICATION APPROVED`)
          return bestOpportunity
        }
        console.log(`❌ Topic clustering clarification rejected (doesn't meet thresholds)`)
        break

      case 'low_confidence_broad':
        // Only clarify if we have many results with genuinely low confidence
        if (resultCount >= 10 && searchConfidence < 0.55) {
          return bestOpportunity
        }
        break

      case 'scope_ambiguity':
        // Only clarify if it's a clear scope issue
        if (bestOpportunity.confidence > 0.6) {
          return bestOpportunity
        }
        break
    }

    // Default: don't clarify if we don't meet the specific thresholds
    console.log(`✅ SKIPPING CLARIFICATION: No opportunities met quality thresholds`)
    return {
      needsClarification: false,
      confidence: Math.max(searchConfidence, 0.6),
      clarificationType: 'none',
      reasoning: 'Clarification opportunities did not meet quality thresholds'
    }
  }

  /**
   * Check if query is already specific enough
   */
  private isQuerySpecific(query: string): boolean {
    const queryLower = query.toLowerCase()

    // Check for specific qualifiers
    const specificTerms = [
      'water', 'spirit', 'infant', 'adult', 'believer',
      'personal', 'corporate', 'individual', 'group',
      'biblical', 'theological', 'practical', 'spiritual',
      'method', 'technique', 'approach', 'steps', 'process',
      'history', 'origin', 'purpose', 'meaning', 'significance',
      'practices', 'procedures', 'ceremonies', 'rituals', 'traditions',
      'instructions', 'guidelines', 'requirements', 'details'
    ]

    const hasSpecificTerms = specificTerms.some(term => queryLower.includes(term))

    // Check for specific question patterns
    const specificPatterns = [
      /how to\s+\w+/i,                    // "how to pray"
      /what is the\s+\w+/i,              // "what is the difference"
      /\w+\s+(process|method|steps)/i,    // "baptism process"
      /difference between/i,              // "difference between"
      /types of\s+\w+/i,                 // "types of prayer"
      /\w+\s+in the bible/i,             // "baptism in the bible"
      /biblical\s+\w+/i,                 // "biblical baptism"
    ]

    const hasSpecificPattern = specificPatterns.some(pattern => pattern.test(query))

    return hasSpecificTerms || hasSpecificPattern || query.length > 30
  }

  /**
   * Generate enhanced conversational clarification message
   */
  generateConversationalClarification(analysis: ClarificationAnalysis, query: string): string {
    if (!analysis.clarificationMessage) {
      return this.generateFallbackClarificationMessage(analysis, query)
    }

    // Enhance the message with conversational elements
    const baseMessage = analysis.clarificationMessage

    // Add contextual intro based on clarification type
    let intro = ''
    switch (analysis.clarificationType) {
      case 'content_diversity':
        intro = 'I found several types of resources about your question. '
        break
      case 'topic_clustering':
        intro = 'Your question touches on different aspects of this topic. '
        break
      case 'low_confidence_broad':
        intro = 'I found quite a bit of information, but it covers a wide range. '
        break
      case 'scope_ambiguity':
        intro = 'I found resources at different levels of detail. '
        break
    }

    // Add encouraging closing
    const closingOptions = [
      'Let me know which direction interests you most!',
      'Which would be most helpful for your situation?',
      'What aspect would you like me to focus on?',
      'Which approach would work best for you?'
    ]

    const randomClosing = closingOptions[Math.floor(Math.random() * closingOptions.length)]

    // Combine with natural flow
    return `${intro}${baseMessage.replace(/\n\nWhich.*\?$/, '')}\n\n${randomClosing}`
  }

  /**
   * Generate fallback clarification message when none is provided
   */
  private generateFallbackClarificationMessage(analysis: ClarificationAnalysis, query: string): string {
    switch (analysis.clarificationType) {
      case 'content_diversity':
        return `I found information about "${query}" in several different types of resources. Could you let me know what kind of information would be most helpful - practical guidance, theological background, biblical examples, or something else?`

      case 'topic_clustering':
        return `There are several different aspects to "${query}" that I can help with. What particular angle or perspective are you most interested in exploring?`

      case 'low_confidence_broad':
        return `I found quite a bit of information related to "${query}", but it's pretty broad. Could you help me understand what specific aspect or question you have in mind?`

      case 'scope_ambiguity':
        return `I can provide either a general overview or go into more specific details about "${query}". What level of depth would be most useful for you right now?`

      default:
        return `I'd like to make sure I give you the most helpful information about "${query}". Could you tell me a bit more about what you're specifically looking for?`
    }
  }

  /**
   * Create context-aware clarification suggestions
   */
  generateContextualSuggestions(analysis: ClarificationAnalysis, query: string): string[] {
    const suggestions: string[] = []

    // Generate suggestions based on the type of clarification
    switch (analysis.clarificationType) {
      case 'content_diversity':
        if (analysis.contentThemes) {
          analysis.contentThemes.forEach(theme => {
            suggestions.push(`Focus on ${theme.name}`)
          })
        }
        break

      case 'topic_clustering':
        suggestions.push(`Be more specific about which aspect of ${query} you're interested in`)
        suggestions.push(`Add context about your situation or goal`)
        break

      case 'low_confidence_broad':
        suggestions.push(`Try a more specific question about ${query}`)
        suggestions.push(`Include what you already know or what you're trying to accomplish`)
        break

      case 'scope_ambiguity':
        suggestions.push(`Specify whether you want an overview or detailed information`)
        suggestions.push(`Mention your experience level with this topic`)
        break
    }

    return suggestions
  }

  /**
   * Check if the current query is a follow-up to a recent clarification
   */
  private isClarificationFollowUp(query: string, recentConversations?: Array<{ question: string; answer: string }>): boolean {
    if (!recentConversations || recentConversations.length === 0) {
      return false
    }

    const queryLower = query.toLowerCase().trim()

    // PRIORITY 1: Check for contextual follow-up questions (pronouns referring to previous topic)
    const contextualFollowUpPatterns = [
      /^(is\s+)?(it|this|that|they|he|she)\s+(a|an)?\s*\w+/i,  // "is it a person", "is this correct", etc.
      /^(what|how|why|when|where|who)['']?s\s+(it|this|that|they|their)/i,  // "what's it", "how's this", etc.
      /^(does|did|can|will|would|should|could)\s+(it|this|that|they|he|she)/i,  // "does it work", etc.
      /^(and|but|also|so|then)\s/i,  // Questions starting with conjunctions
      /^(tell me|show me|explain)\s+(more|about|how|why)/i  // "tell me more", "explain how"
    ]

    const isContextualFollowUp = contextualFollowUpPatterns.some(pattern => pattern.test(queryLower))

    if (isContextualFollowUp) {
      console.log(`✅ CONTEXTUAL FOLLOW-UP detected: "${query}" - likely refers to previous topic`)
      return true
    }

    // Check the most recent conversation for clarification patterns
    const mostRecentAnswer = recentConversations[0]?.answer?.toLowerCase() || ''

    // Check if the most recent answer was a clarification (contains clarification keywords)
    const clarificationIndicators = [
      'which area would be most helpful',
      'which aspect would you like to focus on',
      'what aspect interests you most',
      'which direction interests you most',
      'which would be most helpful for your situation',
      'what aspect would you like me to focus on',
      'which approach would work best for you'
    ]

    const wasRecentClarification = clarificationIndicators.some(indicator =>
      mostRecentAnswer.includes(indicator)
    )

    if (!wasRecentClarification) {
      return false
    }

    console.log(`🔍 Recent clarification detected in answer: "${mostRecentAnswer.substring(0, 100)}..."`)

    // Define clarification response patterns based on natural themes
    const clarificationResponseTerms = [
      // Content themes that might be mentioned in clarifications
      'practical guidance', 'practical', 'step-by-step', 'instructions', 'how to',
      'biblical perspective', 'biblical', 'scripture', 'scriptural',
      'theological understanding', 'theological', 'theology', 'doctrine', 'doctrinal',
      'historical context', 'historical', 'history', 'background', 'context',
      'spiritual application', 'spiritual', 'devotional', 'worship', 'prayer',
      'commentary and reflection', 'commentary', 'reflection', 'editorial',
      'educational content', 'educational', 'training', 'learning',
      'general discussion', 'general', 'overview',
      // Common response patterns
      'approaches', 'perspective', 'aspect', 'angle', 'focus',
      'guidance', 'insights', 'understanding', 'application'
    ]

    // Check if the query matches any clarification response terms
    const isFollowUpTerm = clarificationResponseTerms.some(term => {
      // Exact match or query starts with the term
      return queryLower === term || queryLower.startsWith(term + ' ') || queryLower.endsWith(' ' + term)
    })

    if (isFollowUpTerm) {
      console.log(`✅ Clarification follow-up confirmed: "${query}" matches response term`)
      return true
    }

    // Check if it's a short, focused query that could be a clarification response
    const isShortFocusedQuery = query.split(' ').length <= 3 && query.length <= 25

    if (isShortFocusedQuery && wasRecentClarification) {
      console.log(`✅ Short focused query after clarification: "${query}"`)
      return true
    }

    console.log(`❌ Not a clarification follow-up: "${query}"`)
    return false
  }

  /**
   * Detect obvious gibberish patterns (keyboard mashing, random characters)
   */
  private detectGibberish(query: string): boolean {
    const trimmed = query.trim().toLowerCase()

    // Too short to be gibberish
    if (trimmed.length < 3) return false

    // Check for obvious keyboard mashing patterns
    const gibberishPatterns = [
      // Keyboard rows
      /^[qwertyuiop]+$/,
      /^[asdfghjkl]+$/,
      /^[zxcvbnm]+$/,
      // Repeated character patterns
      /^(.)\1{3,}$/,
      // Mixed random patterns (like "asdfasdgalfgj" - common consonant clusters without vowels)
      /^[bcdfghjklmnpqrstvwxyz]*[aeiou]?[bcdfghjklmnpqrstvwxyz]{3,}[bcdfghjklmnpqrstvwxyz]+$/
    ]

    // Check for vowel-less sequences longer than 4 characters
    if (trimmed.length > 4 && !/[aeiou]/.test(trimmed)) {
      return true
    }

    // Check for random character mashups (like "asdfasdgalfgj")
    if (trimmed.length > 6) {
      // Count consonant clusters vs vowels
      const consonantClusters = (trimmed.match(/[bcdfghjklmnpqrstvwxyz]{2,}/g) || []).length
      const vowels = (trimmed.match(/[aeiou]/g) || []).length

      // If it's mostly consonant clusters with very few vowels, likely gibberish
      if (consonantClusters >= 2 && vowels <= 1) {
        return true
      }
    }

    // Check against gibberish patterns
    return gibberishPatterns.some(pattern => pattern.test(trimmed))
  }

  /**
   * Coverage-based analysis (OpenAI-inspired) - better than single confidence scores
   * Analyzes result coverage and quality to detect nonsensical queries
   */
  private analyzeCoverage(searchResults: SearchResult[], query: string, wasQueryEnhanced?: boolean): {
    isNonsensical: boolean
    reasoning: string
    coverage: number
    topScore: number
  } {
    const scores = searchResults.map(r => r.score)
    const topScore = Math.max(...scores)
    const avgScore = scores.reduce((sum, score) => sum + score, 0) / scores.length

    // Calculate coverage: number of chunks meeting quality thresholds
    const semanticThreshold = 0.35  // T_sem from OpenAI approach
    const _keywordThreshold = 0.12   // T_kw from OpenAI approach (we don't have separate keyword scores, so use semantic)

    const coverage = searchResults.filter(r => r.score >= semanticThreshold).length
    const minCoverage = 2  // MIN_COVERAGE from OpenAI approach

    // Single word queries need special handling with corpus relevance
    const words = query.trim().split(/\s+/)
    if (words.length === 1) {
      const singleWord = words[0].toLowerCase()
      const corpusRelevance = this.analyzeCorpusRelevance(singleWord, searchResults)

      console.log(`📊 Single word analysis: "${singleWord}" - coverage: ${coverage}, topScore: ${topScore.toFixed(3)}, corpusRelevance: ${corpusRelevance.relevanceScore.toFixed(3)}, wasEnhanced: ${wasQueryEnhanced}`)

      // If the query was enhanced but the original is a single word with poor results,
      // be more aggressive about calling it nonsensical
      if (wasQueryEnhanced) {
        // The search results might look good because of context enhancement,
        // but the original single word is still nonsensical
        if (!corpusRelevance.isCorpusRelevant && corpusRelevance.relevanceScore < 0.2) {
          return {
            isNonsensical: true,
            reasoning: `Single word "${singleWord}" enhanced with context but has very low corpus relevance (score: ${corpusRelevance.relevanceScore.toFixed(3)}, ${corpusRelevance.reasoning})`,
            coverage,
            topScore
          }
        }
      }

      // Enhanced single word filtering using corpus analysis
      if (coverage < minCoverage && topScore < 0.5 && !corpusRelevance.isCorpusRelevant) {
        return {
          isNonsensical: true,
          reasoning: `Single word "${singleWord}" has low corpus relevance (coverage: ${coverage}, topScore: ${topScore.toFixed(3)}, corpusAnalysis: ${corpusRelevance.reasoning})`,
          coverage,
          topScore
        }
      }

      // Even if basic thresholds pass, check if it's a meaningful word in our corpus
      if (corpusRelevance.isCorpusRelevant) {
        console.log(`✅ Single word "${singleWord}" is corpus-relevant: ${corpusRelevance.reasoning}`)
      } else if (coverage >= minCoverage || topScore >= 0.5) {
        console.log(`⚠️ Single word "${singleWord}" passes basic thresholds but low corpus relevance: ${corpusRelevance.reasoning}`)
      }
    }

    // Multi-word queries: check coverage-based nonsense detection
    if (coverage < minCoverage && topScore < 0.5) {
      return {
        isNonsensical: true,
        reasoning: `Low coverage query (coverage: ${coverage}, topScore: ${topScore.toFixed(3)}, avgScore: ${avgScore.toFixed(3)})`,
        coverage,
        topScore
      }
    }

    // Query appears to have sufficient coverage
    return {
      isNonsensical: false,
      reasoning: `Adequate coverage (coverage: ${coverage}, topScore: ${topScore.toFixed(3)})`,
      coverage,
      topScore
    }
  }

  /**
   * Analyze corpus-based relevance for single words (domain-agnostic approach)
   * Uses actual search results to determine if a single word is meaningful in our corpus
   */
  private analyzeCorpusRelevance(word: string, searchResults: SearchResult[]): {
    isCorpusRelevant: boolean
    relevanceScore: number
    reasoning: string
  } {
    if (searchResults.length === 0) {
      return {
        isCorpusRelevant: false,
        relevanceScore: 0.0,
        reasoning: 'No search results to analyze corpus relevance'
      }
    }

    // Analyze how the word appears in document titles and content
    const wordLower = word.toLowerCase()
    let titleMatches = 0
    let contentMatches = 0
    let contextualMatches = 0
    const totalDocuments = new Set<string>()

    for (const result of searchResults) {
      const title = result.documentTitle.toLowerCase()
      const content = (result.content || '').toLowerCase()

      totalDocuments.add(result.documentTitle)

      // Check for title matches (high relevance indicator)
      if (title.includes(wordLower)) {
        titleMatches++
      }

      // Check for content matches
      if (content.includes(wordLower)) {
        contentMatches++

        // Check for contextual usage (word appears with meaningful context)
        const wordRegex = new RegExp(`\\b${wordLower}\\b`, 'g')
        const matches = content.match(wordRegex) || []
        contextualMatches += matches.length
      }
    }

    // Calculate corpus relevance metrics
    const documentSpread = totalDocuments.size
    const titleRelevance = titleMatches / Math.min(searchResults.length, 10) // Cap for score calculation
    const contentRelevance = contentMatches / Math.min(searchResults.length, 10)
    const contextualDensity = contextualMatches / Math.max(searchResults.length, 1)

    // Compute overall relevance score
    const relevanceScore = (titleRelevance * 0.4) + (contentRelevance * 0.3) + (Math.min(contextualDensity, 1.0) * 0.3)

    // Determine if corpus-relevant based on multiple factors
    let isCorpusRelevant = false
    let reasoning = ''

    // Strong signals of corpus relevance
    if (titleMatches >= 2) {
      isCorpusRelevant = true
      reasoning = `Appears in ${titleMatches} document titles, high topic relevance`
    } else if (contextualDensity >= 0.8 && documentSpread >= 3) {
      isCorpusRelevant = true
      reasoning = `High contextual usage (${contextualDensity.toFixed(2)}) across ${documentSpread} documents`
    } else if (relevanceScore >= 0.35) {
      isCorpusRelevant = true
      reasoning = `Good overall corpus relevance score (${relevanceScore.toFixed(3)})`
    } else if (contentMatches >= 5 && documentSpread >= 2) {
      isCorpusRelevant = true
      reasoning = `Appears in ${contentMatches} content sections across ${documentSpread} documents`
    } else {
      // Check for edge cases where word might be corpus-relevant despite low metrics
      const hasHighScoreResults = searchResults.some(r => r.score >= 0.6)
      if (hasHighScoreResults && contentMatches >= 1) {
        isCorpusRelevant = true
        reasoning = `Has high-scoring results (≥0.6) with content presence`
      } else {
        reasoning = `Low corpus relevance: titleMatches=${titleMatches}, contentMatches=${contentMatches}, documentSpread=${documentSpread}, relevanceScore=${relevanceScore.toFixed(3)}`
      }
    }

    return {
      isCorpusRelevant,
      relevanceScore,
      reasoning
    }
  }

  /**
   * Pre-filter for deterministic garbage rejection (OpenAI-inspired)
   * Fast checks to reject obvious garbage before expensive operations
   */
  private preFilterQuery(query: string): { isRejected: boolean; reason?: string } {
    const trimmed = query.trim()

    // Length bounds check
    if (trimmed.length < 2) {
      return { isRejected: true, reason: 'Query too short (< 2 chars)' }
    }
    if (trimmed.length > 1500) {
      return { isRejected: true, reason: 'Query too long (> 1500 chars)' }
    }

    // Non-alphabetic character ratio check
    const nonAlpha = (trimmed.match(/[^a-zA-Z0-9\s]/g) || []).length
    const nonAlphaRatio = nonAlpha / trimmed.length
    if (nonAlphaRatio > 0.6) {
      return { isRejected: true, reason: `Too many non-alphanumeric chars (${(nonAlphaRatio * 100).toFixed(1)}%)` }
    }

    // Repeated character patterns (like "aaaaaaa")
    if (/(.)\1{4,}/.test(trimmed)) {
      return { isRejected: true, reason: 'Repeated character pattern detected' }
    }

    // High emoji/symbol density check
    const emojis = (trimmed.match(/\p{Extended_Pictographic}/gu) || []).length
    if (emojis > 10) {
      return { isRejected: true, reason: `Too many emojis (${emojis})` }
    }

    // All checks passed
    return { isRejected: false }
  }
}

// Export singleton instance
export const intelligentClarification = new IntelligentClarificationSystem()