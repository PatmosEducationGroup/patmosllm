// Simple retry script for failed document migrations
import { createClient } from '@supabase/supabase-js'
// We'll need to make direct calls to the function since importing TS is complex
// Instead, let's manually trigger via the API endpoint
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function retryFailedMigrations() {
  try {
    console.log('🔄 Retrying failed document migrations...\n')
    
    // Get all failed documents (excluding the 2 that are too large for Voyage)
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
      .order('created_at', { ascending: true })
    
    if (error) {
      throw new Error(`Failed to fetch failed jobs: ${error.message}`)
    }
    
    console.log(`📋 Found ${failedJobs.length} failed documents`)
    
    // Filter out documents that are too large for Voyage API
    const retryableJobs = failedJobs.filter(job => 
      !job.error_message?.includes('message length too large')
    )
    
    const tooLargeJobs = failedJobs.filter(job => 
      job.error_message?.includes('message length too large')
    )
    
    console.log(`✅ Retryable documents: ${retryableJobs.length}`)
    console.log(`⚠️  Too large for Voyage API: ${tooLargeJobs.length}`)
    
    if (tooLargeJobs.length > 0) {
      console.log('\n⚠️  Documents too large for Voyage API (skipping):')
      tooLargeJobs.forEach(job => {
        console.log(`   - ${job.documents?.title}`)
      })
    }
    
    console.log('\n🔄 Starting retries...')
    
    // Retry each document using the direct function
    let successCount = 0
    let failCount = 0
    
    for (let i = 0; i < retryableJobs.length; i++) {
      const job = retryableJobs[i]
      const docTitle = job.documents?.title || 'Unknown'
      
      console.log(`\n📝 [${i + 1}/${retryableJobs.length}] Retrying: ${docTitle}`)
      
      try {
        // Delete the failed job first
        console.log(`   🗑️  Deleting failed job...`)
        await supabase
          .from('ingest_jobs')
          .delete()
          .eq('id', job.id)
        
        // Use a dummy user ID for processing (the function needs it but doesn't use it for much)
        const dummyUserId = 'migration-script'
        
        console.log(`   🔄 Processing document vectors...`)
        const result = await processDocumentVectors(job.document_id, dummyUserId)
        
        if (result.success) {
          console.log(`   ✅ Successfully processed: ${result.chunksCreated} chunks created`)
          successCount++
        } else {
          console.log(`   ❌ Processing failed: ${result.error || 'Unknown error'}`)
          failCount++
        }
        
        // Add delay between documents to avoid overwhelming the system
        if (i < retryableJobs.length - 1) {
          console.log('   ⏳ Waiting 10 seconds before next document...')
          await new Promise(resolve => setTimeout(resolve, 10000))
        }
        
      } catch (error) {
        console.log(`   ❌ Error processing "${docTitle}": ${error.message}`)
        failCount++
        
        // Continue with next document even if this one fails
        if (i < retryableJobs.length - 1) {
          console.log('   ⏳ Waiting 5 seconds before next document...')
          await new Promise(resolve => setTimeout(resolve, 5000))
        }
      }
    }
    
    console.log('\n🎉 Migration Retry Summary:')
    console.log(`✅ Successfully processed: ${successCount}`)
    console.log(`❌ Failed to process: ${failCount}`)
    console.log(`⚠️  Skipped (too large): ${tooLargeJobs.length}`)
    
    if (successCount > 0) {
      console.log('\n📝 Note: Successfully processed documents should now be available in the Voyage index.')
      console.log('   Check the admin panel to verify completion status.')
      console.log('   All successful documents should now be searchable in chat.')
    }
    
    if (failCount > 0) {
      console.log('\n⚠️  Some documents failed to process. Check the logs above for details.')
    }
    
  } catch (error) {
    console.error('❌ Script error:', error)
  }
}

console.log('Starting migration retry script...')
retryFailedMigrations()
  .then(() => {
    console.log('\n✅ Migration retry script completed.')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Migration retry script failed:', error)
    process.exit(1)
  })