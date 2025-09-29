// Sample document content to understand what we can search for
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function sampleDocumentContent() {
  try {
    console.log('📋 Sampling content from processed documents...\n')

    // Get the Urdu document that was successfully processed
    const { data: doc, error } = await supabase
      .from('documents')
      .select('id, title, content')
      .eq('title', 'Urdu_2414_Book')
      .single()

    if (error || !doc) {
      console.log('❌ Could not find Urdu document')
      return
    }

    console.log(`📝 Document: ${doc.title}`)
    console.log(`🆔 ID: ${doc.id}`)
    console.log(`📄 Content length: ${doc.content?.length || 0} chars`)

    if (doc.content) {
      // Show first 1000 characters to see what's in it
      console.log('\n📖 First 1000 characters:')
      console.log('=' .repeat(80))
      console.log(doc.content.substring(0, 1000))
      console.log('=' .repeat(80))

      // Look for English words or phrases
      const englishPattern = /[a-zA-Z]{3,}/g
      const englishWords = doc.content.match(englishPattern) || []
      const uniqueEnglishWords = [...new Set(englishWords.slice(0, 20))]

      console.log('\n🔍 Sample English words found:')
      console.log(uniqueEnglishWords.join(', '))

      // Also check chunks to see what was actually indexed
      const { data: chunks, error: chunkError } = await supabase
        .from('chunks')
        .select('content')
        .eq('document_id', doc.id)
        .limit(3)

      if (!chunkError && chunks && chunks.length > 0) {
        console.log('\n📋 Sample indexed chunks:')
        chunks.forEach((chunk, i) => {
          console.log(`\nChunk ${i + 1}:`)
          console.log(chunk.content.substring(0, 200) + '...')
        })
      }
    }

  } catch (error) {
    console.error('❌ Error:', error)
  }
}

sampleDocumentContent()