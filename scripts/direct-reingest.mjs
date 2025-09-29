// Direct reingest script using ES modules
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Import the ingest function directly
async function importIngestFunction() {
  try {
    const ingestModule = await import('../src/lib/ingest.ts')
    return ingestModule.processDocumentVectors
  } catch (error) {
    console.error('Failed to import ingest function:', error)
    throw error
  }
}

async function reingestFailedDocuments() {
  try {
    console.log('🔄 Starting direct reingest of failed documents...\n')

    // Get the specific documents you mentioned
    const targetDocuments = [
      '24_14-arabic',
      'Bengali_2414_Book',
      'Chinese_2414_Book',
      'Hindi_2414_Book',
      'Urdu_2414_Book'
    ]

    console.log('🎯 Target documents:')
    targetDocuments.forEach((title, i) => {
      console.log(`   ${i + 1}. ${title}`)
    })

    // Find these documents in the database
    const { data: documents, error } = await supabase
      .from('documents')
      .select('id, title, author')
      .in('title', targetDocuments)
      .order('created_at', { ascending: true })

    if (error) {
      throw new Error(`Failed to fetch documents: ${error.message}`)
    }

    console.log(`\n📋 Found ${documents.length} matching documents in database`)

    if (documents.length === 0) {
      console.log('❌ No matching documents found. Available document titles might be different.')

      // Show some example document titles to help debug
      const { data: sampleDocs } = await supabase
        .from('documents')
        .select('title')
        .limit(10)

      if (sampleDocs && sampleDocs.length > 0) {
        console.log('\n📝 Sample document titles in database:')
        sampleDocs.forEach(doc => console.log(`   - ${doc.title}`))
      }
      return
    }

    // Show found documents
    console.log('\n📝 Documents to reingest:')
    documents.forEach((doc, i) => {
      console.log(`   ${i + 1}. ${doc.title} (Author: ${doc.author || 'Unknown'})`)
    })

    // Import the ingest function
    console.log('\n📦 Loading ingest function...')
    const processDocumentVectors = await importIngestFunction()

    console.log('🚀 Starting reingest process...\n')

    let successCount = 0
    let failCount = 0

    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i]
      const docTitle = doc.title

      console.log(`\n📝 [${i + 1}/${documents.length}] Processing: ${docTitle}`)

      try {
        // Clean up any existing chunks and failed jobs first
        console.log('   🧹 Cleaning up existing data...')

        // Delete existing chunks
        await supabase
          .from('chunks')
          .delete()
          .eq('document_id', doc.id)

        // Delete any existing ingest jobs
        await supabase
          .from('ingest_jobs')
          .delete()
          .eq('document_id', doc.id)

        // No status column to reset, just proceed

        console.log('   🔄 Starting reingest...')

        // Use a dummy userId for the script
        const result = await processDocumentVectors(doc.id, 'reingest-script')

        if (result.success) {
          console.log(`   ✅ Success: ${result.chunksCreated || 'unknown'} chunks created`)
          successCount++
        } else {
          console.log(`   ❌ Failed: ${result.error || 'Unknown error'}`)
          failCount++
        }

        // Add delay between documents
        if (i < documents.length - 1) {
          console.log('   ⏳ Waiting 15 seconds before next document...')
          await new Promise(resolve => setTimeout(resolve, 15000))
        }

      } catch (error) {
        console.log(`   ❌ Error processing "${docTitle}": ${error.message}`)
        failCount++

        // No status column to update

        // Continue with next document
        if (i < documents.length - 1) {
          console.log('   ⏳ Waiting 10 seconds before next document...')
          await new Promise(resolve => setTimeout(resolve, 10000))
        }
      }
    }

    console.log('\n🎉 Reingest Summary:')
    console.log(`✅ Successfully processed: ${successCount}`)
    console.log(`❌ Failed to process: ${failCount}`)
    console.log(`📊 Success rate: ${Math.round((successCount / (successCount + failCount)) * 100)}%`)

    if (successCount > 0) {
      console.log('\n📝 Successfully processed documents should now be searchable!')
      console.log('   You can test this in the chat interface.')
    }

  } catch (error) {
    console.error('❌ Script error:', error)
    throw error
  }
}

console.log('🚀 Starting direct document reingest script...')

reingestFailedDocuments()
  .then(() => {
    console.log('\n✅ Reingest script completed!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Reingest script failed:', error)
    process.exit(1)
  })