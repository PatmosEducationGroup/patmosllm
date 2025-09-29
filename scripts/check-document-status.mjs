// Check document processing status
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function checkDocumentStatus() {
  try {
    console.log('📋 Checking status of target documents...\n')

    const targetDocuments = [
      '24_14-arabic',
      'Bengali_2414_Book',
      'Chinese_2414_Book',
      'Hindi_2414_Book',
      'Urdu_2414_Book'
    ]

    // Get documents with chunk counts
    const { data: documents, error } = await supabase
      .from('documents')
      .select(`
        id,
        title,
        author,
        word_count,
        chunks (
          id,
          content
        )
      `)
      .in('title', targetDocuments)

    if (error) {
      throw new Error(`Failed to fetch documents: ${error.message}`)
    }

    console.log('📊 Document Status Report:')
    console.log('=' .repeat(80))

    documents.forEach((doc, i) => {
      const chunkCount = doc.chunks ? doc.chunks.length : 0
      const status = chunkCount > 0 ? '✅ PROCESSED' : '❌ NOT PROCESSED'

      console.log(`\n${i + 1}. ${doc.title}`)
      console.log(`   Author: ${doc.author || 'Unknown'}`)
      console.log(`   Word Count: ${doc.word_count || 'Unknown'}`)
      console.log(`   Chunks: ${chunkCount}`)
      console.log(`   Status: ${status}`)
      console.log(`   ID: ${doc.id}`)
    })

    // Check for any recent ingest jobs
    console.log('\n📋 Recent Ingest Jobs:')
    console.log('=' .repeat(50))

    const documentIds = documents.map(d => d.id)
    const { data: jobs, error: jobError } = await supabase
      .from('ingest_jobs')
      .select('*')
      .in('document_id', documentIds)
      .order('created_at', { ascending: false })

    if (jobError) {
      console.log('Error fetching jobs:', jobError.message)
    } else if (jobs.length === 0) {
      console.log('No ingest jobs found for these documents')
    } else {
      jobs.forEach(job => {
        const doc = documents.find(d => d.id === job.document_id)
        console.log(`\n- ${doc?.title || job.document_id}`)
        console.log(`  Status: ${job.status}`)
        console.log(`  Started: ${job.started_at}`)
        console.log(`  Completed: ${job.completed_at || 'Not completed'}`)
        if (job.error_message) {
          console.log(`  Error: ${job.error_message}`)
        }
      })
    }

    // Summary
    const processedCount = documents.filter(doc => doc.chunks && doc.chunks.length > 0).length
    const totalChunks = documents.reduce((sum, doc) => sum + (doc.chunks ? doc.chunks.length : 0), 0)

    console.log('\n📊 Summary:')
    console.log('=' .repeat(30))
    console.log(`Documents processed: ${processedCount}/${documents.length}`)
    console.log(`Total chunks created: ${totalChunks}`)

    if (processedCount === 0) {
      console.log('\n❌ None of the documents have been processed yet.')
      console.log('You need to trigger reingest through the admin panel or API.')
    } else if (processedCount < documents.length) {
      console.log('\n⚠️  Some documents are still missing chunks.')
      console.log('You may need to reingest the unprocessed ones.')
    } else {
      console.log('\n✅ All documents have been processed successfully!')
      console.log('You can now test them in the chat interface.')
    }

  } catch (error) {
    console.error('❌ Error:', error)
  }
}

checkDocumentStatus()