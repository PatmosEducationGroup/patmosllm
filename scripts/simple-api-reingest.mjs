// Simple API-based reingest using curl to bypass auth issues
import { createClient } from '@supabase/supabase-js'
import { execSync } from 'child_process'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function reingestFailedDocuments() {
  try {
    console.log('🔄 Starting API-based reingest of failed documents...\n')

    // Target documents
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

    console.log(`\n📋 Found ${documents.length} matching documents`)

    if (documents.length === 0) {
      console.log('❌ No matching documents found')
      return
    }

    // Show found documents
    console.log('\n📝 Documents to reingest:')
    documents.forEach((doc, i) => {
      console.log(`   ${i + 1}. ${doc.title} (Author: ${doc.author || 'Unknown'})`)
    })

    console.log('\n🚀 Starting manual reingest process...')
    console.log('Note: Since we cannot easily bypass auth, we will:')
    console.log('1. Clean up existing chunks and failed jobs')
    console.log('2. Show you the document IDs to manually reingest via admin panel')

    let successCount = 0

    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i]
      const docTitle = doc.title

      console.log(`\n📝 [${i + 1}/${documents.length}] Cleaning up: ${docTitle}`)

      try {
        // Clean up any existing chunks and failed jobs
        console.log('   🧹 Deleting existing chunks...')
        const { error: chunksError } = await supabase
          .from('chunks')
          .delete()
          .eq('document_id', doc.id)

        if (chunksError) {
          console.log(`   ⚠️  Chunks deletion warning: ${chunksError.message}`)
        } else {
          console.log('   ✅ Chunks deleted')
        }

        console.log('   🧹 Deleting failed ingest jobs...')
        const { error: jobsError } = await supabase
          .from('ingest_jobs')
          .delete()
          .eq('document_id', doc.id)

        if (jobsError) {
          console.log(`   ⚠️  Jobs deletion warning: ${jobsError.message}`)
        } else {
          console.log('   ✅ Failed jobs deleted')
        }

        console.log(`   📋 Document ID: ${doc.id}`)
        successCount++

      } catch (error) {
        console.log(`   ❌ Error cleaning up "${docTitle}": ${error.message}`)
      }
    }

    console.log('\n🎉 Cleanup Summary:')
    console.log(`✅ Documents cleaned: ${successCount}`)

    console.log('\n📝 Next Steps:')
    console.log('To complete the reingest, you can either:')
    console.log('\n1. Use the admin panel:')
    console.log('   - Go to http://localhost:3000/admin')
    console.log('   - Navigate to the Documents section')
    console.log('   - Find each document and click "Reingest"')

    console.log('\n2. Use curl commands (if you have a valid session token):')
    documents.forEach(doc => {
      console.log(`   curl -X POST http://localhost:3000/api/ingest \\`)
      console.log(`        -H "Content-Type: application/json" \\`)
      console.log(`        -d '{"documentId": "${doc.id}"}' \\`)
      console.log(`        -H "Authorization: Bearer YOUR_TOKEN"`)
      console.log('')
    })

    console.log('3. Or manually run processDocumentVectors for each document ID shown above')

  } catch (error) {
    console.error('❌ Script error:', error)
    throw error
  }
}

console.log('🚀 Starting document cleanup and preparation script...')

reingestFailedDocuments()
  .then(() => {
    console.log('\n✅ Cleanup script completed!')
    console.log('Ready for manual reingest via admin panel or API calls.')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Cleanup script failed:', error)
    process.exit(1)
  })