// Check database schema
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function checkSchema() {
  // Get sample documents to see what columns exist
  const { data: documents, error } = await supabase
    .from('documents')
    .select('*')
    .limit(3)

  if (error) {
    console.error('Error:', error)
    return
  }

  console.log('Documents table sample:')
  console.log(JSON.stringify(documents, null, 2))

  // Also check ingest_jobs
  const { data: jobs, error: jobError } = await supabase
    .from('ingest_jobs')
    .select('*')
    .limit(3)

  if (jobError) {
    console.error('Ingest jobs error:', jobError)
    return
  }

  console.log('\nIngest jobs table sample:')
  console.log(JSON.stringify(jobs, null, 2))
}

checkSchema()