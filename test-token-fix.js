// Test script to validate the Voyage token limit fix
import { estimateTokenCount, estimateBatchTokenCount, createTokenAwareBatches } from './src/lib/openai.ts'

console.log('🧪 Testing Voyage Token Limit Fixes\n')

// Test 1: Token estimation accuracy
console.log('1. Testing improved token estimation:')
const sampleTexts = [
  'Short text',
  'This is a medium length text that contains multiple sentences. It should have a reasonable token count estimate.',
  'This is a very long text that would previously cause issues with token estimation. '.repeat(50),
]

sampleTexts.forEach((text, i) => {
  const tokens = estimateTokenCount(text)
  console.log(`   Text ${i + 1}: ${text.length} chars → ~${tokens} tokens (ratio: ${(text.length/tokens).toFixed(2)} chars/token)`)
})

// Test 2: Batch token counting
console.log('\n2. Testing batch token counting:')
const batchTokens = estimateBatchTokenCount(sampleTexts)
const individualSum = sampleTexts.reduce((sum, text) => sum + estimateTokenCount(text), 0)
console.log(`   Batch method: ${batchTokens} tokens`)
console.log(`   Individual sum: ${individualSum} tokens`)
console.log(`   Match: ${batchTokens === individualSum ? '✅' : '❌'}`)

// Test 3: Token-aware batching
console.log('\n3. Testing token-aware batching:')
const largeBatch = Array(100).fill('This is a sample text chunk that will be used for testing. '.repeat(20))
const totalTokens = estimateBatchTokenCount(largeBatch)
console.log(`   Total texts: ${largeBatch.length}`)
console.log(`   Total estimated tokens: ${totalTokens}`)

const batches = createTokenAwareBatches(largeBatch, 50000) // 50K token limit for testing
console.log(`   Split into ${batches.length} batches:`)
batches.forEach((batch, i) => {
  const batchTokens = estimateBatchTokenCount(batch)
  console.log(`     Batch ${i + 1}: ${batch.length} texts, ~${batchTokens} tokens`)
})

// Test 4: Edge case - single large text
console.log('\n4. Testing single large text splitting:')
const largeText = 'This is a very large text document that exceeds the token limit. '.repeat(2000)
const largeTextTokens = estimateTokenCount(largeText)
console.log(`   Large text: ${largeText.length} chars, ~${largeTextTokens} tokens`)

const largeBatches = createTokenAwareBatches([largeText], 50000)
console.log(`   Split into ${largeBatches.length} batches`)
largeBatches.forEach((batch, i) => {
  batch.forEach((text, j) => {
    console.log(`     Batch ${i + 1}, Text ${j + 1}: ${text.length} chars, ~${estimateTokenCount(text)} tokens`)
  })
})

console.log('\n✅ All tests completed! The fix should prevent token limit errors.')