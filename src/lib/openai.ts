import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

// Create embedding for text
export async function createEmbedding(text: string): Promise<number[]> {
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text.trim(),
      encoding_format: 'float'
    })
    
    return response.data[0].embedding
  } catch (error) {
    console.error('Error creating embedding:', error)
    throw new Error(`Failed to create embedding: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

// Create embeddings for multiple texts (batch processing)
export async function createEmbeddings(texts: string[]): Promise<number[][]> {
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: texts.map(text => text.trim()),
      encoding_format: 'float'
    })
    
    return response.data.map(item => item.embedding)
  } catch (error) {
    console.error('Error creating embeddings:', error)
    throw new Error(`Failed to create embeddings: ${error instanceof Error ? error.message : 'Unknown error'}`)
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
    
    // NATURAL, CONVERSATIONAL SYSTEM PROMPT
    const systemPrompt = `You're a helpful AI assistant that answers questions using the organization's knowledge base.

Be conversational and natural - like you're talking to a colleague. Don't be overly formal or robotic.

Key instructions:
- Answer directly and helpfully using the provided documents
- If you don't know something from the docs, just say so naturally
- Keep it friendly and conversational
- Make reasonable connections between related information
- Be confident when the information is clear
- DON'T cite sources in your response - sources will be shown separately
- Synthesize information across documents when it makes sense
- Use a natural, helpful tone

Available documents:
${contextString}`

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
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

// Count tokens in text (rough approximation)
export function estimateTokenCount(text: string): number {
  // GPT tokenization is complex, but roughly 1 token ≈ 4 characters for English
  return Math.ceil(text.length / 4)
}

// Truncate text to fit within token limit
export function truncateToTokenLimit(text: string, maxTokens: number): string {
  const estimatedTokens = estimateTokenCount(text)
  
  if (estimatedTokens <= maxTokens) {
    return text
  }
  
  // Calculate approximate character limit
  const maxChars = maxTokens * 4
  
  // Truncate at word boundary
  const truncated = text.substring(0, maxChars)
  const lastSpaceIndex = truncated.lastIndexOf(' ')
  
  if (lastSpaceIndex > 0) {
    return truncated.substring(0, lastSpaceIndex) + '...'
  }
  
  return truncated + '...'
}