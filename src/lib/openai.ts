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
  try {
    const response = await voyage.embed({
      input: [text.trim()],
      model: 'voyage-3-large'
    })
    
    if (!response.data || !response.data[0] || !response.data[0].embedding) {
      throw new Error('No embedding returned from Voyage API')
    }
    return response.data[0].embedding
  } catch (error) {
    console.error('Error creating embedding:', error)
    throw new Error(`Failed to create embedding: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

// Create embeddings for multiple texts with progressive retry and batch size reduction
export async function createEmbeddings(texts: string[], retryCount: number = 0): Promise<number[][]> {
  const maxRetries = 3
  const baseMaxTokens = 110000 // Conservative limit under 120K

  try {
    // Adjust token limit based on retry count (progressive reduction)
    const maxTokens = baseMaxTokens - (retryCount * 20000) // Reduce by 20K tokens per retry
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
      model: 'voyage-3-large'
    })

    return response.data?.map(item => item?.embedding).filter(Boolean) as number[][] || []
  } catch (error) {
    console.error(`Error creating embeddings (attempt ${retryCount + 1}):`, error)

    // Check if this is a token limit error and we haven't exceeded max retries
    if (error instanceof Error &&
        (error.message.includes('max allowed tokens') || error.message.includes('too large')) &&
        retryCount < maxRetries) {

      const newRetryCount = retryCount + 1
      const waitTime = Math.pow(2, newRetryCount) * 5000 // Exponential backoff: 10s, 20s, 40s

      console.log(`Token limit error detected. Retrying with smaller batches in ${waitTime/1000}s (attempt ${newRetryCount}/${maxRetries})...`)
      await new Promise(resolve => setTimeout(resolve, waitTime))

      // Retry with reduced token limit
      return createEmbeddings(texts, newRetryCount)
    }

    // Check for rate limit errors
    if (error instanceof Error && error.message.includes('429')) {
      const waitTime = 30000 + (retryCount * 15000) // 30s + 15s per retry
      console.log(`Rate limit error. Waiting ${waitTime/1000}s before retry...`)
      await new Promise(resolve => setTimeout(resolve, waitTime))

      if (retryCount < maxRetries) {
        return createEmbeddings(texts, retryCount + 1)
      }
    }

    // Enhanced error message with token information
    const batchTokens = estimateBatchTokenCount(texts)
    const errorMessage = `Failed to create embeddings after ${retryCount + 1} attempts (${texts.length} texts, ~${batchTokens} tokens): ${error instanceof Error ? error.message : 'Unknown error'}`

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
    console.error('Error generating chat response:', error)
    throw new Error(`Failed to generate response: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

// Count tokens in text (improved approximation for Voyage models)
export function estimateTokenCount(text: string): number {
  // Voyage tokenizer is similar to other modern tokenizers
  // More conservative estimate: ~3.2 chars per token for mixed content
  // Add padding for safety margins and special tokens
  const baseTokens = Math.ceil(text.length / 3.2)
  const paddingFactor = 1.15 // 15% safety margin
  return Math.ceil(baseTokens * paddingFactor)
}

// Estimate total tokens for a batch of texts
export function estimateBatchTokenCount(texts: string[]): number {
  return texts.reduce((total, text) => total + estimateTokenCount(text), 0)
}

// Create token-aware batches for Voyage API (120K token limit per batch)
export function createTokenAwareBatches(texts: string[], maxTokensPerBatch: number = 110000): string[][] {
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