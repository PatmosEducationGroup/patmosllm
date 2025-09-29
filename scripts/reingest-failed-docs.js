// Reingest script for documents that failed due to token limits
// Uses the new intelligent batching system with 110K token limit
import { createClient } from '@supabase/supabase-js'
import fetch from 'node-fetch'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function reingestFailedDocuments() {
  try {
    console.log('🔄 Starting reingest of documents that failed due to token limits...\n')

    // Find documents that failed with token limit errors
    const { data: failedDocs, error } = await supabase
      .from('documents')
      .select(`
        id,
        title,
        author,
        status,
        chunks (count)
      `)
      .or('status.eq.failed,status.eq.processing')
      .order('created_at', { ascending: true })

    if (error) {
      throw new Error(`Failed to fetch documents: ${error.message}`)
    }

    // Filter for documents that likely failed due to token limits
    // (failed status with no chunks, or stuck in processing)
    const documentsToReingest = failedDocs.filter(doc =>
      (doc.status === 'failed' && (!doc.chunks || doc.chunks.length === 0)) ||
      doc.status === 'processing'
    )

    console.log(`📋 Found ${failedDocs.length} total failed/processing documents`)
    console.log(`🎯 Documents to reingest: ${documentsToReingest.length}\n`)

    if (documentsToReingest.length === 0) {
      console.log('✅ No documents need reingesting!')
      return
    }

    // Show which documents will be reingested
    console.log('📝 Documents to reingest:')
    documentsToReingest.forEach((doc, i) => {
      console.log(`   ${i + 1}. ${doc.title} (${doc.author || 'Unknown author'}) - Status: ${doc.status}`)
    })

    console.log('\n🚀 Starting reingest process...\n')

    let successCount = 0
    let failCount = 0

    for (let i = 0; i < documentsToReingest.length; i++) {
      const doc = documentsToReingest[i]
      const docTitle = doc.title || 'Unknown'

      console.log(`\n📝 [${i + 1}/${documentsToReingest.length}] Processing: ${docTitle}`)

      try {
        // First, clean up any existing chunks and failed ingest jobs
        console.log('   🧹 Cleaning up existing data...')

        // Delete existing chunks
        await supabase
          .from('chunks')
          .delete()
          .eq('document_id', doc.id)

        // Delete any failed ingest jobs
        await supabase
          .from('ingest_jobs')
          .delete()
          .eq('document_id', doc.id)

        // Reset document status to pending
        await supabase
          .from('documents')
          .update({ status: 'pending', updated_at: new Date().toISOString() })
          .eq('id', doc.id)

        console.log('   🔄 Starting reingest via API...')

        // Call the ingest API endpoint with the new batching system
        const response = await fetch('http://localhost:3000/api/ingest', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            documentId: doc.id
          })
        })

        if (!response.ok) {
          throw new Error(`API call failed: ${response.status} ${response.statusText}`)
        }

        const result = await response.json()

        if (result.success) {
          console.log(`   ✅ Successfully processed: ${result.chunksCreated || 'unknown'} chunks created`)
          successCount++
        } else {
          console.log(`   ❌ Processing failed: ${result.error || 'Unknown error'}`)
          failCount++
        }

        // Add delay between documents to avoid overwhelming the system
        if (i < documentsToReingest.length - 1) {
          console.log('   ⏳ Waiting 15 seconds before next document...')
          await new Promise(resolve => setTimeout(resolve, 15000))
        }

      } catch (error) {
        console.log(`   ❌ Error processing "${docTitle}": ${error.message}`)
        failCount++

        // Mark document as failed
        await supabase
          .from('documents')
          .update({
            status: 'failed',
            updated_at: new Date().toISOString()
          })
          .eq('id', doc.id)

        // Continue with next document even if this one fails
        if (i < documentsToReingest.length - 1) {
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
      console.log('\n📝 Note: Successfully processed documents should now be available for search.')
      console.log('   Check the admin panel to verify completion status.')
      console.log('   All successful documents should now be searchable in chat.')
    }

    if (failCount > 0) {
      console.log('\n⚠️  Some documents failed to process. This could be due to:')
      console.log('   - Documents still too large even with intelligent batching')
      console.log('   - Network/API issues during processing')
      console.log('   - Content extraction problems')
      console.log('   Check the logs above for specific error details.')
    }

  } catch (error) {
    console.error('❌ Script error:', error)
    throw error
  }
}

console.log('🚀 Starting document reingest script...')

// Skip health check since the server is running but requires auth
console.log('✅ Proceeding with reingest (server assumed running)\n')

reingestFailedDocuments()
  .then(() => {
    console.log('\n✅ Reingest script completed successfully!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Reingest script failed:', error)
    process.exit(1)
  })