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

// Generate chat response with context
export async function generateChatResponse(
  question: string,
  context: Array<{
    content: string
    title: string
    author?: string
  }>
): Promise<{
  answer: string
  usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}> {
  try {
    // Build context string
    const contextString = context
      .map((item) => 
        `[Source: "${item.title}"${item.author ? ` by ${item.author}` : ''}]\n${item.content}`
      )
      .join('\n\n')
    
    const systemPrompt = `You are a helpful assistant that answers questions based on the provided documents. 

Instructions:
- Answer the question using the information provided in the documents
- When documents contain directly relevant information, cite them specifically
- When documents contain related or foundational concepts that help answer the question, you may make reasonable inferences and connections
- ALWAYS cite documents by their exact titles when referencing them: "According to [Document Title]..." or "As stated in [Document Title]..."
- If an author is provided, include it: "According to [Document Title] by [Author]..."
- When making inferences from related content, be clear about what is directly stated vs. what can be reasonably inferred
- Synthesize information across multiple documents when relevant, citing each source specifically
- If the documents don't contain sufficient information to answer the question, say so
- Keep your answer clear and helpful

Available documents:
${contextString}`

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: question }
      ],
      temperature: 0.3,
      max_tokens: 1000
    })
    
    const answer = response.choices[0]?.message?.content
    if (!answer) {
      throw new Error('No response generated')
    }
    
    return {
      answer,
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