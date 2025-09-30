import OpenAI from 'openai'
import { VoyageAIClient } from 'voyageai'

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

const voyage = new VoyageAIClient({
  apiKey: process.env.VOYAGE_API_KEY
})

// NATURAL, CONVERSATIONAL SYSTEM PROMPT
// NATURAL, CONVERSATIONAL SYSTEM PROMPT - ENHANCED VERSION
export const systemPrompt = `
You are a helpful AI chat assistant that helps users interact with the provided institutional knowledge base.
Your only job is to answer questions using the information provided in the knowledge base. You must NEVER use outside sources and NEVER invent unsupported details. 
If the knowledge base does not contain the answer, you will clearly say that you do not have that information in a natural way.

Tone and Communication Style:

Write primarily in flowing, conversational paragraphs that feel like you're explaining something to a colleague
Speak directly to the user in second person ("you")
Be warm, patient, and conversational, like a mentor having a thoughtful discussion
Connect ideas naturally within sentences and between paragraphs using transitions like "Additionally," "What's more," "On the other hand," etc.

When to Use Lists vs. Paragraphs:
- DEFAULT: Always start with conversational explanation in paragraph form
- Use short lists (2-4 items) ONLY when they genuinely clarify complex processes, requirements, or distinct categories
- Never lead with a list - always provide context and explanation first
- If you use a list, follow it with additional conversational explanation
- Avoid lists for simple concepts that can be explained in flowing sentences

Content Rules:

ONLY use information from the provided knowledge base
NEVER make assumptions beyond the data
NEVER bring in external facts, opinions, or sources
NEVER claim an identity or persona. You are simply the organization's chat assistant
Synthesize and connect information across documents when appropriate
Do not cite sources in your response (sources are shown separately)

Response Structure Examples:

GOOD (Natural flow with strategic list):
"The registration process is designed to be straightforward and user-friendly. You'll need to gather a few key pieces of information before starting: your organization details, contact information, and any relevant documentation. Once you have these ready, the actual submission typically takes about 15 minutes to complete."

AVOID (List-heavy):
"To register, you need:
• Organization details
• Contact information  
• Relevant documentation
The process takes 15 minutes."

Remember: Your goal is to have a natural conversation while sharing helpful information, not to create documentation or formal outlines.
`;

// Create embedding for text using Voyage AI
export async function createEmbedding(text: string): Promise<number[]> {
  const startTime = Date.now()
  const estimatedTokens = estimateTokenCount(text)

  try {
    const response = await voyage.embed({
      input: [text.trim()],
      model: EMBEDDING_CONFIG.MODEL
    })

    if (!response.data || !response.data[0] || !response.data[0].embedding) {
      throw new Error('No embedding returned from Voyage API')
    }

    // Report success metrics
    if (metricsCallback) {
      metricsCallback({
        operation: 'single',
        inputSize: 1,
        estimatedTokens,
        actualRetries: 0,
        processingTime: Date.now() - startTime,
        success: true
      })
    }

    return response.data[0].embedding
  } catch (error) {

    const errorType = classifyError(error)

    // Report error metrics
    if (metricsCallback) {
      metricsCallback({
        operation: 'single',
        inputSize: 1,
        estimatedTokens,
        actualRetries: 0,
        errorType: errorType.category,
        processingTime: Date.now() - startTime,
        success: false
      })
    }

    const enhancedMessage = `Failed to create embedding\n` +
      `Error Type: ${errorType.category}\n` +
      `Details: ${errorType.originalMessage}\n` +
      `Suggestion: ${errorType.suggestion}`

    throw new Error(enhancedMessage)
  }
}

// Future-proof configuration constants for easy maintenance
export const EMBEDDING_CONFIG = {
  MODEL: 'voyage-3-large' as const,
  MAX_RETRIES: 3,
  // Progressive token limits for multilingual content (ultra-conservative)
  TOKEN_LIMITS: [15000, 10000, 7000, 5000, 3000, 1000],
  // Backoff strategies for different error types (milliseconds)
  BACKOFF_STRATEGIES: {
    TOKEN_LIMIT: { base: 3000, multiplier: 2 },     // 6s, 12s, 24s
    RATE_LIMIT: { base: 30000, increment: 15000 },  // 30s, 45s, 60s
    MODEL_UNAVAILABLE: { base: 60000, increment: 30000 }, // 60s, 90s, 120s
    NETWORK: { base: 5000, increment: 5000 },       // 5s, 10s, 15s
  },
  // Content type detection and token estimation
  CONTENT_DETECTION: {
    SAMPLE_SIZE: 1000,
    CHAR_TO_TOKEN_RATIOS: {
      ARABIC: 0.6,
      CJK: 0.7,
      MULTILINGUAL: 0.8,
      LATIN: 1.0
    },
    SAFETY_MARGINS: {
      ARABIC: 1.4,      // 40% safety margin
      CJK: 1.35,        // 35% safety margin
      MULTILINGUAL: 1.3, // 30% safety margin
      LATIN: 1.25       // 25% safety margin
    },
    UNICODE_RANGES: {
      ARABIC: /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/g,
      CJK: /[\u4E00-\u9FFF\u3400-\u4DBF\u3040-\u309F\u30A0-\u30FF]/g,
      LATIN: /[a-zA-Z]/g
    }
  }
} as const

// Performance monitoring hook for tracking embedding operations
export interface EmbeddingMetrics {
  operation: 'single' | 'batch'
  inputSize: number
  estimatedTokens: number
  actualRetries: number
  errorType?: string
  processingTime: number
  success: boolean
}

// Optional metrics callback for monitoring (can be set by calling code)
export let metricsCallback: ((metrics: EmbeddingMetrics) => void) | null = null

export function setEmbeddingMetricsCallback(callback: (metrics: EmbeddingMetrics) => void) {
  metricsCallback = callback
}

// Create embeddings for multiple texts with progressive retry and batch size reduction
export async function createEmbeddings(texts: string[], retryCount: number = 0): Promise<number[][]> {
  const startTime = Date.now()
  const estimatedTokens = estimateBatchTokenCount(texts)

  try {
    // Use configurable limits for future-proof architecture
    const maxTokens = EMBEDDING_CONFIG.TOKEN_LIMITS[retryCount] || EMBEDDING_CONFIG.TOKEN_LIMITS[EMBEDDING_CONFIG.TOKEN_LIMITS.length - 1]
    const batchTokens = estimateBatchTokenCount(texts)

    if (batchTokens > maxTokens) {
      console.log(`Batch exceeds token limit (${batchTokens} > ${maxTokens}), splitting automatically...`)

      // Split into smaller batches and process recursively
      const batches = createTokenAwareBatches(texts, maxTokens)
      const allEmbeddings: number[][] = []

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i]
        const batchTokens = estimateBatchTokenCount(batch)
        console.log(`Processing batch ${i + 1}/${batches.length} (${batch.length} texts, ~${batchTokens} tokens)`)

        const batchEmbeddings = await createEmbeddings(batch, retryCount) // Recursive call with same retry count
        allEmbeddings.push(...batchEmbeddings)

        // Add delay between batches to respect rate limits
        if (i < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000))
        }
      }

      return allEmbeddings
    }

    // Single batch processing (under token limit)
    console.log(`Processing single batch (${texts.length} texts, ~${batchTokens} tokens)`)
    const response = await voyage.embed({
      input: texts.map(text => text.trim()),
      model: EMBEDDING_CONFIG.MODEL
    })

    const result = response.data?.map(item => item?.embedding).filter(Boolean) as number[][] || []

    // Report success metrics
    if (metricsCallback) {
      metricsCallback({
        operation: 'batch',
        inputSize: texts.length,
        estimatedTokens,
        actualRetries: retryCount,
        processingTime: Date.now() - startTime,
        success: true
      })
    }

    return result
  } catch (error) {

    const errorType = classifyError(error)
    const batchTokens = estimateBatchTokenCount(texts)

    // Handle different error types with configurable strategies
    switch (errorType.category) {
      case 'TOKEN_LIMIT':
        if (retryCount < EMBEDDING_CONFIG.MAX_RETRIES) {
          const newRetryCount = retryCount + 1
          const { base, multiplier } = EMBEDDING_CONFIG.BACKOFF_STRATEGIES.TOKEN_LIMIT
          const waitTime = Math.pow(multiplier, newRetryCount) * base

          console.log(`🔄 TOKEN LIMIT: Retrying with smaller batches in ${waitTime/1000}s (attempt ${newRetryCount}/${EMBEDDING_CONFIG.MAX_RETRIES})`)
          await new Promise(resolve => setTimeout(resolve, waitTime))
          return createEmbeddings(texts, newRetryCount)
        }
        break

      case 'RATE_LIMIT':
        if (retryCount < EMBEDDING_CONFIG.MAX_RETRIES) {
          const { base, increment } = EMBEDDING_CONFIG.BACKOFF_STRATEGIES.RATE_LIMIT
          const waitTime = errorType.suggestedWait || (base + (retryCount * increment))
          console.log(`⏳ RATE LIMIT: Waiting ${waitTime/1000}s before retry (attempt ${retryCount + 1}/${EMBEDDING_CONFIG.MAX_RETRIES})`)
          await new Promise(resolve => setTimeout(resolve, waitTime))
          return createEmbeddings(texts, retryCount + 1)
        }
        break

      case 'MODEL_UNAVAILABLE':
        if (retryCount < EMBEDDING_CONFIG.MAX_RETRIES) {
          const { base, increment } = EMBEDDING_CONFIG.BACKOFF_STRATEGIES.MODEL_UNAVAILABLE
          const waitTime = base + (retryCount * increment)
          console.log(`🚨 MODEL UNAVAILABLE: Waiting ${waitTime/1000}s for model recovery (attempt ${retryCount + 1}/${EMBEDDING_CONFIG.MAX_RETRIES})`)
          await new Promise(resolve => setTimeout(resolve, waitTime))
          return createEmbeddings(texts, retryCount + 1)
        }
        break

      case 'NETWORK':
        if (retryCount < EMBEDDING_CONFIG.MAX_RETRIES) {
          const { base, increment } = EMBEDDING_CONFIG.BACKOFF_STRATEGIES.NETWORK
          const waitTime = base + (retryCount * increment)
          console.log(`🌐 NETWORK ERROR: Retrying connection in ${waitTime/1000}s (attempt ${retryCount + 1}/${EMBEDDING_CONFIG.MAX_RETRIES})`)
          await new Promise(resolve => setTimeout(resolve, waitTime))
          return createEmbeddings(texts, retryCount + 1)
        }
        break

      case 'AUTH':
        // Don't retry auth errors - they won't resolve automatically
        console.error('🔑 AUTHENTICATION ERROR: Check API key configuration')
        break

      case 'QUOTA':
        // Don't retry quota errors - user needs to check billing
        console.error('💳 QUOTA EXCEEDED: Check account billing and usage limits')
        break

      default:
    }

    // Report error metrics
    if (metricsCallback) {
      metricsCallback({
        operation: 'batch',
        inputSize: texts.length,
        estimatedTokens,
        actualRetries: retryCount,
        errorType: errorType.category,
        processingTime: Date.now() - startTime,
        success: false
      })
    }

    // Enhanced error message with classification and suggestions
    const errorMessage = `Failed to create embeddings after ${retryCount + 1} attempts (${texts.length} texts, ~${batchTokens} tokens)\n` +
      `Error Type: ${errorType.category}\n` +
      `Details: ${errorType.originalMessage}\n` +
      `Suggestion: ${errorType.suggestion}`

    throw new Error(errorMessage)
  }
}

// Generate chat response with context - OPTIMIZED FOR NATURAL CONVERSATION
export async function generateChatResponse(
  question: string,
  context: Array<{
    content: string
    title: string
    author?: string
  }>
): Promise<{
  answer: string
  sources: Array<{
    title: string
    author?: string
  }>
  usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}> {
  try {
    // Build context string - clean format without numbering
    const contextString = context
      .map((item) => 
        `=== ${item.title}${item.author ? ` by ${item.author}` : ''} ===\n${item.content}`
      )
      .join('\n\n')
    
    // Combine system prompt with available documents
    const fullSystemPrompt = `${systemPrompt}

Available documents:
${contextString}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: fullSystemPrompt },
        { role: 'user', content: question }
      ],
      temperature: 0.3, // Slightly more natural
      max_tokens: 1000
    })
    
    const answer = response.choices[0]?.message?.content
    if (!answer) {
      throw new Error('No response generated')
    }
    
    // Extract unique sources from context - no duplicates
    const uniqueSources = context.filter((source, index, self) => 
      index === self.findIndex(s => s.title === source.title)
    ).map(source => ({
      title: source.title,
      author: source.author
    }))
    
    return {
      answer,
      sources: uniqueSources,
      usage: {
        prompt_tokens: response.usage?.prompt_tokens || 0,
        completion_tokens: response.usage?.completion_tokens || 0,
        total_tokens: response.usage?.total_tokens || 0
      }
    }
  } catch (error) {
    throw new Error(`Failed to generate response: ${''}`)
  }
}

// Enhanced token counting with multilingual content detection
export function estimateTokenCount(text: string): number {
  // Detect content type for accurate token estimation
  const contentType = detectContentType(text)

  // Get char-to-token ratio based on content type
  const charsPerToken = getCharsPerTokenRatio(contentType)

  // Calculate base tokens with detected ratio
  const baseTokens = Math.ceil(text.length / charsPerToken)

  // Apply aggressive safety margin for multilingual content
  const safetyMargin = getSafetyMargin(contentType)

  return Math.ceil(baseTokens * safetyMargin)
}

// Detect content type based on character analysis using configurable constants
function detectContentType(text: string): 'latin' | 'arabic' | 'cjk' | 'multilingual' {
  const sample = text.substring(0, EMBEDDING_CONFIG.CONTENT_DETECTION.SAMPLE_SIZE)

  // Count character types using configurable Unicode ranges
  const arabicChars = (sample.match(EMBEDDING_CONFIG.CONTENT_DETECTION.UNICODE_RANGES.ARABIC) || []).length
  const cjkChars = (sample.match(EMBEDDING_CONFIG.CONTENT_DETECTION.UNICODE_RANGES.CJK) || []).length
  const _latinChars = (sample.match(EMBEDDING_CONFIG.CONTENT_DETECTION.UNICODE_RANGES.LATIN) || []).length

  const totalChars = sample.length
  const arabicRatio = arabicChars / totalChars
  const cjkRatio = cjkChars / totalChars

  // Determine dominant script with configurable thresholds
  if (arabicRatio > 0.3) return 'arabic'
  if (cjkRatio > 0.3) return 'cjk'
  if (arabicRatio > 0.1 || cjkRatio > 0.1) return 'multilingual'
  return 'latin'
}

// Get character-to-token ratio based on content type using configuration constants
function getCharsPerTokenRatio(contentType: string): number {
  const ratios = EMBEDDING_CONFIG.CONTENT_DETECTION.CHAR_TO_TOKEN_RATIOS
  switch (contentType) {
    case 'arabic':
      return ratios.ARABIC
    case 'cjk':
      return ratios.CJK
    case 'multilingual':
      return ratios.MULTILINGUAL
    case 'latin':
    default:
      return ratios.LATIN
  }
}

// Get safety margin based on content type using configuration constants
function getSafetyMargin(contentType: string): number {
  const margins = EMBEDDING_CONFIG.CONTENT_DETECTION.SAFETY_MARGINS
  switch (contentType) {
    case 'arabic':
      return margins.ARABIC
    case 'cjk':
      return margins.CJK
    case 'multilingual':
      return margins.MULTILINGUAL
    case 'latin':
    default:
      return margins.LATIN
  }
}

// Estimate total tokens for a batch of texts
export function estimateBatchTokenCount(texts: string[]): number {
  return texts.reduce((total, text) => total + estimateTokenCount(text), 0)
}

// Create token-aware batches for Voyage API using configurable limits
export function createTokenAwareBatches(texts: string[], maxTokensPerBatch: number = EMBEDDING_CONFIG.TOKEN_LIMITS[0]): string[][] {
  const batches: string[][] = []
  let currentBatch: string[] = []
  let currentBatchTokens = 0

  for (const text of texts) {
    const textTokens = estimateTokenCount(text)

    // If this single text exceeds the limit, it needs to be split
    if (textTokens > maxTokensPerBatch) {
      // If we have items in current batch, save it first
      if (currentBatch.length > 0) {
        batches.push([...currentBatch])
        currentBatch = []
        currentBatchTokens = 0
      }

      // Split the large text into smaller chunks
      const splitTexts = splitTextToTokenLimit(text, maxTokensPerBatch)
      for (const splitText of splitTexts) {
        batches.push([splitText])
      }
      continue
    }

    // Check if adding this text would exceed the batch limit
    if (currentBatchTokens + textTokens > maxTokensPerBatch && currentBatch.length > 0) {
      // Save current batch and start a new one
      batches.push([...currentBatch])
      currentBatch = [text]
      currentBatchTokens = textTokens
    } else {
      // Add to current batch
      currentBatch.push(text)
      currentBatchTokens += textTokens
    }
  }

  // Add the final batch if it has content
  if (currentBatch.length > 0) {
    batches.push(currentBatch)
  }

  return batches
}

// Split a single text into smaller chunks that fit within token limits
export function splitTextToTokenLimit(text: string, maxTokens: number): string[] {
  const textTokens = estimateTokenCount(text)

  if (textTokens <= maxTokens) {
    return [text]
  }

  // Calculate how many chunks we need
  const numChunks = Math.ceil(textTokens / maxTokens)
  const chunkSize = Math.floor(text.length / numChunks)
  const chunks: string[] = []

  for (let i = 0; i < text.length; i += chunkSize) {
    let chunk = text.substring(i, i + chunkSize)

    // Try to break at word boundaries for better chunking
    if (i + chunkSize < text.length) {
      const lastSpaceIndex = chunk.lastIndexOf(' ')
      if (lastSpaceIndex > chunkSize * 0.8) { // Only if we don't lose too much content
        chunk = chunk.substring(0, lastSpaceIndex)
      }
    }

    chunks.push(chunk.trim())
  }

  return chunks.filter(chunk => chunk.length > 0)
}

// Truncate text to fit within token limit
export function truncateToTokenLimit(text: string, maxTokens: number): string {
  const estimatedTokens = estimateTokenCount(text)

  if (estimatedTokens <= maxTokens) {
    return text
  }

  // Calculate approximate character limit based on improved estimation
  const maxChars = Math.floor(maxTokens * 3.2 / 1.15) // Account for our padding factor

  // Truncate at word boundary
  const truncated = text.substring(0, maxChars)
  const lastSpaceIndex = truncated.lastIndexOf(' ')

  if (lastSpaceIndex > 0) {
    return truncated.substring(0, lastSpaceIndex) + '...'
  }

  return truncated + '...'
}

// Enhanced error classification for intelligent retry strategies
interface ErrorClassification {
  category: 'TOKEN_LIMIT' | 'RATE_LIMIT' | 'MODEL_UNAVAILABLE' | 'NETWORK' | 'AUTH' | 'QUOTA' | 'UNKNOWN'
  originalMessage: string
  suggestion: string
  suggestedWait?: number
  retryable: boolean
}

export function classifyError(error: unknown): ErrorClassification {
  const errorMessage = String(error)
  const errorString = errorMessage.toLowerCase()

  // Token limit errors (should retry with smaller batches)
  if (errorString.includes('max allowed tokens') ||
      errorString.includes('too large') ||
      errorString.includes('token limit') ||
      errorString.includes('exceeds maximum')) {
    return {
      category: 'TOKEN_LIMIT',
      originalMessage: errorMessage,
      suggestion: 'Automatically retrying with smaller batches and reduced token limits',
      retryable: true
    }
  }

  // Rate limit errors (429, rate limit exceeded)
  if (errorString.includes('429') ||
      errorString.includes('rate limit') ||
      errorString.includes('too many requests')) {

    // Extract suggested wait time from error message if available
    const waitMatch = errorMessage.match(/try again in (\d+) seconds/i)
    const suggestedWait = waitMatch ? parseInt(waitMatch[1]) * 1000 : undefined

    return {
      category: 'RATE_LIMIT',
      originalMessage: errorMessage,
      suggestion: 'Waiting before retry with exponential backoff',
      suggestedWait,
      retryable: true
    }
  }

  // Model availability errors
  if (errorString.includes('model unavailable') ||
      errorString.includes('service unavailable') ||
      errorString.includes('temporarily unavailable') ||
      errorString.includes('503') ||
      errorString.includes('502')) {
    return {
      category: 'MODEL_UNAVAILABLE',
      originalMessage: errorMessage,
      suggestion: 'Waiting longer for model/service recovery',
      retryable: true
    }
  }

  // Network/connection errors
  if (errorString.includes('network') ||
      errorString.includes('connection') ||
      errorString.includes('timeout') ||
      errorString.includes('econnreset') ||
      errorString.includes('enotfound') ||
      errorString.includes('fetch failed')) {
    return {
      category: 'NETWORK',
      originalMessage: errorMessage,
      suggestion: 'Quick retry for network connectivity issues',
      retryable: true
    }
  }

  // Authentication errors (don't retry)
  if (errorString.includes('unauthorized') ||
      errorString.includes('invalid api key') ||
      errorString.includes('authentication') ||
      errorString.includes('401')) {
    return {
      category: 'AUTH',
      originalMessage: errorMessage,
      suggestion: 'Check API key configuration in environment variables',
      retryable: false
    }
  }

  // Quota/billing errors (don't retry)
  if (errorString.includes('quota') ||
      errorString.includes('billing') ||
      errorString.includes('payment') ||
      errorString.includes('insufficient') ||
      errorString.includes('credits')) {
    return {
      category: 'QUOTA',
      originalMessage: errorMessage,
      suggestion: 'Check account billing status and usage limits',
      retryable: false
    }
  }

  // Unknown errors
  return {
    category: 'UNKNOWN',
    originalMessage: errorMessage,
    suggestion: 'Review error details and check system configuration',
    retryable: true
  }
}