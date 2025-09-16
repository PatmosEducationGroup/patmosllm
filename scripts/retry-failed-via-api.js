// Retry failed document migrations using the API endpoint
import { createClient } from '@supabase/supabase-js'
import fetch from 'node-fetch'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function retryFailedMigrations() {
  try {
    console.log('🔄 Retrying failed document migrations via API...\n')
    
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
    
    console.log('\n🔄 Retrying documents...')
    
    // Retry each document using the API endpoint
    let successCount = 0
    let failCount = 0
    
    for (let i = 0; i < retryableJobs.length; i++) {
      const job = retryableJobs[i]
      const docTitle = job.documents?.title || 'Unknown'
      
      console.log(`\n📝 [${i + 1}/${retryableJobs.length}] Retrying: ${docTitle}`)
      
      try {
        // Delete the failed job first
        await supabase
          .from('ingest_jobs')
          .delete()
          .eq('id', job.id)
        
        console.log(`   🗑️  Deleted failed job`)
        
        // Trigger re-ingestion via API
        console.log(`   🔄 Calling /api/ingest...`)
        
        const response = await fetch('http://localhost:3000/api/ingest', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            // Note: In production, you'd need proper authentication headers
            // For now, this assumes the API will be called from a logged-in admin context
          },
          body: JSON.stringify({
            documentId: job.document_id
          })
        })
        
        const result = await response.json()
        
        if (response.ok && result.success) {
          console.log(`   ✅ Successfully queued for processing (${result.chunksCreated || 'N/A'} chunks)`)
          successCount++
        } else {
          console.log(`   ❌ API call failed: ${result.error || 'Unknown error'}`)
          failCount++
        }
        
        // Add delay between requests to avoid overwhelming the system
        if (i < retryableJobs.length - 1) {
          console.log('   ⏳ Waiting 5 seconds before next retry...')
          await new Promise(resolve => setTimeout(resolve, 5000))
        }
        
      } catch (error) {
        console.log(`   ❌ Error retrying "${docTitle}": ${error.message}`)
        failCount++
      }
    }
    
    console.log('\n🎉 Retry Summary:')
    console.log(`✅ Successfully queued for retry: ${successCount}`)
    console.log(`❌ Failed to retry: ${failCount}`)
    console.log(`⚠️  Skipped (too large): ${tooLargeJobs.length}`)
    
    if (successCount > 0) {
      console.log('\n📝 Note: Documents have been queued for processing.')
      console.log('   Check the admin panel to monitor job progress.')
      console.log('   Processing will complete with enhanced rate limiting.')
    }
    
  } catch (error) {
    console.error('❌ Script error:', error)
  }
}

retryFailedMigrations()