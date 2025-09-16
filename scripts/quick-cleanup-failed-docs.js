// Quick cleanup script to remove failed documents for manual re-upload
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function cleanupFailedDocuments() {
  try {
    console.log('🧹 Starting cleanup of failed documents...\n')
    
    // Get documents that failed due to Voyage content length limits
    const { data: failedJobs, error } = await supabase
      .from('ingest_jobs')
      .select(`
        id,
        document_id,
        error_message,
        documents (
          id,
          title,
          author
        )
      `)
      .eq('status', 'failed')
      .like('error_message', '%message length too large%')
    
    if (error) {
      throw new Error(`Failed to fetch failed jobs: ${error.message}`)
    }
    
    console.log(`📋 Found ${failedJobs.length} failed documents to clean up`)
    
    if (failedJobs.length === 0) {
      console.log('✅ No failed documents to clean up!')
      return
    }
    
    for (let i = 0; i < failedJobs.length; i++) {
      const job = failedJobs[i]
      const document = job.documents
      
      console.log(`\n🗑️  [${i + 1}/${failedJobs.length}] Cleaning up: ${document.title}`)
      
      try {
        // Delete the failed ingest job
        const { error: jobDeleteError } = await supabase
          .from('ingest_jobs')
          .delete()
          .eq('id', job.id)
        
        if (jobDeleteError) {
          throw new Error(`Failed to delete job: ${jobDeleteError.message}`)
        }
        
        // Delete any chunks that might exist
        const { error: chunksDeleteError } = await supabase
          .from('chunks')
          .delete()
          .eq('document_id', document.id)
        
        if (chunksDeleteError) {
          console.log(`   ⚠️  Warning: Could not delete chunks: ${chunksDeleteError.message}`)
        }
        
        // Delete the document record
        const { error: docDeleteError } = await supabase
          .from('documents')
          .delete()
          .eq('id', document.id)
        
        if (docDeleteError) {
          throw new Error(`Failed to delete document: ${docDeleteError.message}`)
        }
        
        console.log(`   ✅ Successfully cleaned up: ${document.title}`)
        
      } catch (cleanupError) {
        console.error(`   ❌ Failed to clean up "${document.title}":`, cleanupError.message)
      }
    }
    
    console.log('\n🎉 Cleanup completed!')
    console.log('\n📝 Next steps:')
    console.log('1. Go to the admin panel')
    console.log('2. Re-upload these documents using the file upload interface')
    console.log('3. The new system will automatically use Vercel Blob for large files')
    console.log('4. Documents >50MB will be processed seamlessly')

  } catch (error) {
    console.error('❌ Cleanup script error:', error)
  }
}

cleanupFailedDocuments()