// Reset stuck processing jobs to allow manual deletion
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function resetStuckProcessing() {
  try {
    console.log('🔄 Resetting stuck processing jobs...\n')
    
    // Find all processing jobs
    const { data: processingJobs, error } = await supabase
      .from('ingest_jobs')
      .select(`
        id,
        document_id,
        status,
        documents (
          title
        )
      `)
      .eq('status', 'processing')
    
    if (error) {
      throw new Error(`Failed to fetch processing jobs: ${error.message}`)
    }
    
    console.log(`📋 Found ${processingJobs.length} stuck processing jobs`)
    
    if (processingJobs.length === 0) {
      console.log('✅ No stuck processing jobs found!')
      return
    }
    
    for (let i = 0; i < processingJobs.length; i++) {
      const job = processingJobs[i]
      const docTitle = job.documents?.title || 'Unknown'
      
      console.log(`🔄 [${i + 1}/${processingJobs.length}] Resetting: ${docTitle}`)
      
      // Update job status to failed so it can be cleaned up
      const { error: updateError } = await supabase
        .from('ingest_jobs')
        .update({
          status: 'failed',
          error_message: 'Reset from stuck processing state - ready for manual deletion',
          completed_at: new Date().toISOString()
        })
        .eq('id', job.id)
      
      if (updateError) {
        console.log(`   ❌ Failed to reset: ${updateError.message}`)
      } else {
        console.log(`   ✅ Reset successfully`)
      }
    }
    
    console.log('\n🎉 All stuck processing jobs have been reset!')
    console.log('📝 You can now delete these documents from the admin panel.')
    console.log('   They will show as "failed" status and can be safely deleted.')
    
  } catch (error) {
    console.error('❌ Script error:', error)
  }
}

resetStuckProcessing()