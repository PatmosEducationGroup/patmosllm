// Question Quality Assistant for Real-time Question Improvement
import { openai } from '@/lib/openai'

// =================================================================
// TYPE DEFINITIONS
// =================================================================

export interface QuestionQualityAnalysis {
  score: number // 0-100 quality score
  level: 'excellent' | 'good' | 'fair' | 'needs_improvement'
  strengths: string[]
  issues: QualityIssue[]
  suggestions: QualitySuggestion[]
  examples: {
    current: string
    improved: string[]
  }
}

export interface QualityIssue {
  type: 'clarity' | 'specificity' | 'context' | 'structure' | 'scope'
  severity: 'low' | 'medium' | 'high'
  description: string
  position?: { start: number; end: number } // Character positions for highlighting
}

export interface QualitySuggestion {
  type: 'add_context' | 'be_specific' | 'clarify_scope' | 'improve_structure' | 'provide_examples'
  description: string
  example?: string
  priority: 'high' | 'medium' | 'low'
}

export interface QuestionTemplate {
  id: string
  title: string
  description: string
  template: string
  category: 'theological' | 'practical' | 'pastoral' | 'biblical' | 'ministry'
  examples: string[]
  whenToUse: string
}

// =================================================================
// QUESTION TEMPLATES LIBRARY
// =================================================================

const QUESTION_TEMPLATES: QuestionTemplate[] = [
  {
    id: 'biblical_interpretation',
    title: 'Biblical Interpretation',
    description: 'For understanding specific Bible passages or concepts',
    template: 'What does [passage/concept] mean in [context], and how does it apply to [situation]?',
    category: 'biblical',
    examples: [
      'What does "love your enemies" mean in Matthew 5:44, and how does it apply to workplace conflicts?',
      'What does Paul mean by "faith working through love" in Galatians 5:6, and how does it apply to daily Christian living?'
    ],
    whenToUse: 'When you need to understand a specific Bible passage or theological concept'
  },
  {
    id: 'practical_ministry',
    title: 'Ministry Practice',
    description: 'For practical ministry situations and applications',
    template: 'How can I [action] in [context] while being faithful to [biblical principle]?',
    category: 'practical',
    examples: [
      'How can I lead effective Bible studies in a diverse small group while being faithful to sound biblical interpretation?',
      'How can I encourage struggling believers in our church while being faithful to both truth and grace?'
    ],
    whenToUse: 'When facing practical ministry challenges or decisions'
  },
  {
    id: 'theological_understanding',
    title: 'Theological Concepts',
    description: 'For deeper understanding of theological topics',
    template: 'What is the biblical understanding of [concept], and how does it relate to [related concept/situation]?',
    category: 'theological',
    examples: [
      'What is the biblical understanding of sanctification, and how does it relate to daily Christian growth?',
      'What is the biblical understanding of church discipline, and how does it relate to love and restoration?'
    ],
    whenToUse: 'When exploring theological concepts or doctrinal questions'
  },
  {
    id: 'pastoral_care',
    title: 'Pastoral Care',
    description: 'For pastoral counseling and care situations',
    template: 'How should I pastorally respond to someone who [situation] while maintaining [biblical values]?',
    category: 'pastoral',
    examples: [
      'How should I pastorally respond to someone who is struggling with doubt while maintaining both honesty and faith?',
      'How should I pastorally respond to someone who is dealing with grief while maintaining both comfort and truth?'
    ],
    whenToUse: 'When providing pastoral care or counseling'
  },
  {
    id: 'ministry_strategy',
    title: 'Ministry Strategy',
    description: 'For developing ministry approaches and strategies',
    template: 'What biblical principles should guide [ministry area] for [target group], and what practical approaches align with these principles?',
    category: 'ministry',
    examples: [
      'What biblical principles should guide youth ministry for teenagers, and what practical approaches align with these principles?',
      'What biblical principles should guide evangelism for our community, and what practical approaches align with these principles?'
    ],
    whenToUse: 'When developing ministry strategies or approaches'
  }
]

// =================================================================
// QUALITY PATTERNS AND INDICATORS
// =================================================================

const POSITIVE_PATTERNS = [
  { pattern: /\b(specifically|particularly|in the context of|regarding|concerning)\b/i, weight: 5, type: 'specificity' },
  { pattern: /\b(how does this apply|what does this mean for|in my situation|in our context)\b/i, weight: 8, type: 'application' },
  { pattern: /\b(biblical|scripture|according to|based on|what does God's word say)\b/i, weight: 6, type: 'biblical_grounding' },
  { pattern: /\b(both|while also|balanced approach|on one hand|on the other hand)\b/i, weight: 4, type: 'balance' },
  { pattern: /\b(example|for instance|such as|like when|in cases where)\b/i, weight: 3, type: 'examples' }
]

const NEGATIVE_PATTERNS = [
  { pattern: /^(what about|how about|tell me about)\s+\w+\s*\??$/i, weight: -8, type: 'too_broad' },
  { pattern: /\b(good|bad|better|best|right|wrong)(?!\s+(news|shepherd|samaritan))\b/i, weight: -3, type: 'vague_qualifiers' },
  { pattern: /^(what|how|why)\s+(is|are|do|does)\s+\w+\s*\??$/i, weight: -5, type: 'minimal_content' },
  { pattern: /\b(help|advice|guidance|tips)\s*\??$/i, weight: -4, type: 'generic_request' },
  { pattern: /\b(it|this|that|they|them)\b(?!.*\b(means|refers|indicates)\b)/i, weight: -2, type: 'unclear_references' }
]

// =================================================================
// QUESTION QUALITY ASSISTANT CLASS
// =================================================================

export class QuestionQualityAssistant {

  /**
   * Analyze question quality in real-time
   */
  async analyzeQuestion(question: string): Promise<QuestionQualityAnalysis> {
    const baseScore = this.calculateBaseScore(question)
    const issues = this.identifyIssues(question)
    const strengths = this.identifyStrengths(question)
    const suggestions = this.generateSuggestions(question, issues)

    // Adjust score based on issues
    const issuesPenalty = issues.reduce((penalty, issue) => {
      const severityWeight = { low: 2, medium: 5, high: 10 }[issue.severity]
      return penalty + severityWeight
    }, 0)

    const finalScore = Math.max(0, Math.min(100, baseScore - issuesPenalty))
    const level = this.determineQualityLevel(finalScore)

    const examples = await this.generateExamples(question, suggestions)

    return {
      score: finalScore,
      level,
      strengths,
      issues,
      suggestions: suggestions.slice(0, 4), // Limit suggestions
      examples
    }
  }

  /**
   * Get relevant question templates based on question content
   */
  getRelevantTemplates(question: string): QuestionTemplate[] {
    const lowerQuestion = question.toLowerCase()

    const scored = QUESTION_TEMPLATES.map(template => {
      let relevance = 0

      // Category-based scoring
      if (template.category === 'biblical' && /\b(bible|scripture|passage|verse|biblical)\b/i.test(question)) relevance += 3
      if (template.category === 'practical' && /\b(how|practical|apply|practice|do|implement)\b/i.test(question)) relevance += 3
      if (template.category === 'pastoral' && /\b(pastoral|counsel|care|help|struggling|dealing with)\b/i.test(question)) relevance += 3
      if (template.category === 'theological' && /\b(theology|doctrine|concept|understanding|belief)\b/i.test(question)) relevance += 3
      if (template.category === 'ministry' && /\b(ministry|church|serve|mission|outreach)\b/i.test(question)) relevance += 3

      // Keyword matching
      for (const example of template.examples) {
        const keywords = example.toLowerCase().split(/\s+/)
        for (const keyword of keywords) {
          if (keyword.length > 3 && lowerQuestion.includes(keyword)) {
            relevance += 1
          }
        }
      }

      return { template, relevance }
    })

    return scored
      .filter(item => item.relevance > 0)
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, 3)
      .map(item => item.template)
  }

  /**
   * Generate guided question builder steps
   */
  generateQuestionBuilder(_topic?: string): {
    steps: Array<{
      title: string
      description: string
      examples: string[]
      placeholder: string
    }>
    finalTemplate: string
  } {
    return {
      steps: [
        {
          title: "What's your main topic?",
          description: "Identify the core subject or concept you're asking about",
          examples: ["prayer", "biblical interpretation", "church leadership", "evangelism"],
          placeholder: "e.g., prayer for difficult situations"
        },
        {
          title: "What's your specific context?",
          description: "Describe your particular situation or setting",
          examples: ["in youth ministry", "for new believers", "in a secular workplace", "during times of suffering"],
          placeholder: "e.g., in a multicultural church setting"
        },
        {
          title: "What outcome are you seeking?",
          description: "What kind of response or guidance would be most helpful?",
          examples: ["biblical principles", "practical steps", "theological understanding", "pastoral wisdom"],
          placeholder: "e.g., practical approaches that honor Scripture"
        },
        {
          title: "Any specific challenges?",
          description: "What particular difficulties or constraints are you facing? (optional)",
          examples: ["limited resources", "cultural barriers", "time constraints", "diverse backgrounds"],
          placeholder: "e.g., working with people from different theological backgrounds"
        }
      ],
      finalTemplate: "How can I approach [topic] [context] in a way that [outcome], especially when [challenges]?"
    }
  }

  /**
   * Calculate base quality score
   */
  private calculateBaseScore(question: string): number {
    let score = 50 // Base score

    // Length considerations
    const wordCount = question.trim().split(/\s+/).length
    if (wordCount < 5) score -= 15
    else if (wordCount < 10) score -= 5
    else if (wordCount > 8 && wordCount < 25) score += 10
    else if (wordCount > 40) score -= 5

    // Pattern matching
    for (const { pattern, weight } of POSITIVE_PATTERNS) {
      if (pattern.test(question)) score += weight
    }

    for (const { pattern, weight } of NEGATIVE_PATTERNS) {
      if (pattern.test(question)) score += weight // weight is negative
    }

    // Question structure
    if (question.includes('?')) score += 3
    if (/^(how|what|why|when|where|which)\b/i.test(question)) score += 5
    if (question.includes(' and ')) score += 2 // Compound questions

    return score
  }

  /**
   * Identify specific issues with the question
   */
  private identifyIssues(question: string): QualityIssue[] {
    const issues: QualityIssue[] = []
    const words = question.trim().split(/\s+/)

    // Too short
    if (words.length < 5) {
      issues.push({
        type: 'clarity',
        severity: 'high',
        description: 'Question is very brief and may lack necessary detail'
      })
    }

    // Vague references
    if (/\b(it|this|that|they|them)\b/i.test(question) && !/\b(means|refers|indicates)\b/i.test(question)) {
      issues.push({
        type: 'context',
        severity: 'medium',
        description: 'Contains unclear references that may need clarification'
      })
    }

    // Too broad
    if (/^(what about|how about|tell me about)\s+\w+\s*\??$/i.test(question.trim())) {
      issues.push({
        type: 'scope',
        severity: 'high',
        description: 'Question is very broad and could benefit from more focus'
      })
    }

    // Vague qualifiers
    const vague = /\b(good|bad|better|best|right|wrong|effective|successful)(?!\s+(news|shepherd|samaritan|works|faith))\b/gi
    const matches = question.match(vague)
    if (matches && matches.length > 0) {
      issues.push({
        type: 'specificity',
        severity: 'low',
        description: 'Uses vague qualifiers that could be more specific'
      })
    }

    // Missing question mark
    if (!question.includes('?') && /^(what|how|why|when|where|which|is|are|do|does|can|could|should|would)/i.test(question)) {
      issues.push({
        type: 'structure',
        severity: 'low',
        description: 'Appears to be a question but missing question mark'
      })
    }

    return issues
  }

  /**
   * Identify strengths in the question
   */
  private identifyStrengths(question: string): string[] {
    const strengths: string[] = []

    if (/\b(specifically|particularly|in the context of)\b/i.test(question)) {
      strengths.push('Includes specific context or details')
    }

    if (/\b(biblical|scripture|according to|based on)\b/i.test(question)) {
      strengths.push('Seeks biblical grounding')
    }

    if (/\b(how does this apply|what does this mean for|in my situation)\b/i.test(question)) {
      strengths.push('Asks for practical application')
    }

    if (/\b(both|while also|balanced)\b/i.test(question)) {
      strengths.push('Seeks balanced perspective')
    }

    if (question.includes(' and ') || question.includes(' or ')) {
      strengths.push('Addresses multiple aspects')
    }

    const wordCount = question.trim().split(/\s+/).length
    if (wordCount >= 10 && wordCount <= 25) {
      strengths.push('Good length - detailed but focused')
    }

    return strengths
  }

  /**
   * Generate improvement suggestions
   */
  private generateSuggestions(question: string, issues: QualityIssue[]): QualitySuggestion[] {
    const suggestions: QualitySuggestion[] = []

    for (const issue of issues) {
      switch (issue.type) {
        case 'clarity':
          suggestions.push({
            type: 'add_context',
            description: 'Add more details about your specific situation or what you\'re trying to understand',
            priority: 'high'
          })
          break

        case 'context':
          suggestions.push({
            type: 'add_context',
            description: 'Clarify what "it", "this", or "they" refers to in your question',
            priority: 'high'
          })
          break

        case 'scope':
          suggestions.push({
            type: 'clarify_scope',
            description: 'Narrow your focus to a specific aspect of the topic',
            example: 'Instead of "How about prayer?", try "How can I develop a consistent daily prayer routine?"',
            priority: 'high'
          })
          break

        case 'specificity':
          suggestions.push({
            type: 'be_specific',
            description: 'Replace vague terms with specific criteria or goals',
            example: 'Instead of "good ministry", specify what kind of impact or approach you\'re seeking',
            priority: 'medium'
          })
          break

        case 'structure':
          suggestions.push({
            type: 'improve_structure',
            description: 'Consider rephrasing as a clear question',
            priority: 'low'
          })
          break
      }
    }

    // Add general suggestions if no specific issues
    if (suggestions.length === 0) {
      if (!/\b(context|situation|setting|background)\b/i.test(question)) {
        suggestions.push({
          type: 'add_context',
          description: 'Consider adding context about your specific situation',
          priority: 'medium'
        })
      }

      if (!/\b(biblical|scripture)\b/i.test(question)) {
        suggestions.push({
          type: 'provide_examples',
          description: 'Consider asking how this relates to biblical principles',
          priority: 'low'
        })
      }
    }

    return suggestions
  }

  /**
   * Generate improved examples using AI
   */
  private async generateExamples(question: string, suggestions: QualitySuggestion[]): Promise<{ current: string; improved: string[] }> {
    try {
      if (!openai || suggestions.length === 0) {
        return { current: question, improved: [] }
      }

      const suggestionSummary = suggestions
        .map(s => `- ${s.description}`)
        .join('\n')

      const prompt = `Original question: "${question}"

Improvement suggestions:
${suggestionSummary}

Generate 2 improved versions of this question for a Christian/theological context. Each improved version should:
1. Address the suggestions above
2. Be more specific and actionable
3. Maintain the original intent
4. Be suitable for a ministry/theological knowledge base

Format as JSON:
{
  "improved": ["version 1", "version 2"]
}`

      const result = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 200
      })

      const content = result.choices[0]?.message?.content
      if (!content) return { current: question, improved: [] }

      try {
        const parsed = JSON.parse(content)
        return {
          current: question,
          improved: Array.isArray(parsed.improved) ? parsed.improved.slice(0, 2) : []
        }
      } catch (parseError) {
        console.error('Failed to parse question examples:', parseError)
        return { current: question, improved: [] }
      }

    } catch (_error) {
      return { current: question, improved: [] }
    }
  }

  /**
   * Determine quality level from score
   */
  private determineQualityLevel(score: number): 'excellent' | 'good' | 'fair' | 'needs_improvement' {
    if (score >= 85) return 'excellent'
    if (score >= 70) return 'good'
    if (score >= 55) return 'fair'
    return 'needs_improvement'
  }
}

// Export singleton instance
export const questionQualityAssistant = new QuestionQualityAssistant()