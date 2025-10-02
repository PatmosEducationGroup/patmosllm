#!/usr/bin/env node

/**
 * ============================================================
 * POPULATE DOWNLOAD URLS SCRIPT
 * ============================================================
 * Updates Supabase database with GitHub raw URLs for downloads
 *
 * WORKFLOW:
 * 1. Read file-mapping.json from prepare-github-files.js
 * 2. Generate GitHub raw URLs for each document
 * 3. Verify URLs are accessible (HEAD request)
 * 4. Update database: resource_url + download_enabled = true
 *
 * USAGE:
 *   # Set environment variables first:
 *   export GITHUB_USERNAME=your-username
 *   export GITHUB_REPO=patmosllm-documents
 *   export GITHUB_BRANCH=main  # Optional, defaults to 'main'
 *
 *   node scripts/populate-download-urls.js --dry-run      # Preview
 *   node scripts/populate-download-urls.js --verify-urls  # Test URLs only
 *   node scripts/populate-download-urls.js                # Execute
 *
 * PREREQUISITES:
 * - Phase 1 (cleanup-titles.js) completed
 * - Phase 2a (prepare-github-files.js) completed
 * - Files uploaded to public GitHub repository
 *
 * Created: October 1, 2025
 * See: DOCUMENT-CLEANUP-AND-DOWNLOAD-PLAN.md
 * ============================================================
 */

import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load environment variables from .env.local
dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

// ============================================================
// CONFIGURATION
// ============================================================

const MAPPING_FILE = path.join(__dirname, '..', 'github-files', 'file-mapping.json')
const DELAY_BETWEEN_UPDATES = 100 // 100ms
const URL_VERIFY_TIMEOUT = 10000 // 10 seconds

// GitHub configuration from environment
const GITHUB_USERNAME = process.env.GITHUB_USERNAME
const GITHUB_REPO = process.env.GITHUB_REPO || 'patmosllm-documents'
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main'

// Parse command line arguments
const args = process.argv.slice(2)
const isDryRun = args.includes('--dry-run')
const isVerifyOnly = args.includes('--verify-urls')

// ============================================================
// VALIDATE CONFIGURATION
// ============================================================

if (!GITHUB_USERNAME) {
  console.error('❌ Error: GITHUB_USERNAME environment variable not set')
  console.error('   Usage: GITHUB_USERNAME=your-username node scripts/populate-download-urls.js')
  process.exit(1)
}

// ============================================================
// INITIALIZE SUPABASE CLIENT
// ============================================================

console.log('🔧 Initializing Supabase client...')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// ============================================================
// URL GENERATION & VERIFICATION
// ============================================================

function generateGitHubUrl(filename) {
  // GitHub raw URL format: https://raw.githubusercontent.com/USERNAME/REPO/BRANCH/FILENAME
  return `https://raw.githubusercontent.com/${GITHUB_USERNAME}/${GITHUB_REPO}/${GITHUB_BRANCH}/${encodeURIComponent(filename)}`
}

async function verifyUrl(url) {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), URL_VERIFY_TIMEOUT)

    const response = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal
    })

    clearTimeout(timeoutId)

    if (response.ok) {
      return { success: true, status: response.status }
    } else {
      return { success: false, status: response.status, error: `HTTP ${response.status}` }
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      return { success: false, error: 'Request timeout' }
    }
    return { success: false, error: error.message }
  }
}

// ============================================================
// DATABASE UPDATE
// ============================================================

async function updateDocumentUrl(documentId, url) {
  try {
    const { error } = await supabase
      .from('documents')
      .update({
        resource_url: url,
        download_enabled: true
      })
      .eq('id', documentId)

    if (error) {
      throw new Error(`Database update failed: ${error.message}`)
    }

    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ============================================================
// MAIN EXECUTION
// ============================================================

async function main() {
  console.log('\n' + '='.repeat(60))
  console.log('🔗 POPULATE DOWNLOAD URLS SCRIPT')
  console.log('='.repeat(60))

  if (isDryRun) {
    console.log('🔍 MODE: DRY RUN (preview only, no database updates)')
  } else if (isVerifyOnly) {
    console.log('🔍 MODE: VERIFY URLS (test accessibility, no database updates)')
  } else {
    console.log('🚀 MODE: EXECUTE (will update database)')
  }

  console.log('='.repeat(60))
  console.log(`📁 GitHub Repository: https://github.com/${GITHUB_USERNAME}/${GITHUB_REPO}`)
  console.log(`🌿 Branch: ${GITHUB_BRANCH}`)
  console.log('='.repeat(60) + '\n')

  // Check if mapping file exists
  if (!fs.existsSync(MAPPING_FILE)) {
    console.error('❌ Error: file-mapping.json not found')
    console.error(`   Expected location: ${MAPPING_FILE}`)
    console.error('   Run prepare-github-files.js first')
    process.exit(1)
  }

  // Load mapping file
  console.log('📥 Loading file mapping...')
  const mapping = JSON.parse(fs.readFileSync(MAPPING_FILE, 'utf-8'))
  console.log(`✅ Loaded ${mapping.documents.length} documents\n`)

  // Filter only successful documents
  const documentsToProcess = mapping.documents.filter(doc => doc.status === 'success' || doc.status === 'skipped')
  const failedDocuments = mapping.documents.filter(doc => doc.status === 'failed')

  if (failedDocuments.length > 0) {
    console.log(`⚠️  Warning: ${failedDocuments.length} documents failed in prepare-github-files.js`)
    console.log('   These will be skipped\n')
  }

  console.log(`📝 Processing ${documentsToProcess.length} documents\n`)

  const results = {
    success: 0,
    failed: 0,
    urlVerificationFailed: 0,
    errors: []
  }

  // Preview mode
  if (isDryRun) {
    console.log('📋 PREVIEW OF URLS:\n')
    documentsToProcess.slice(0, 20).forEach(doc => {
      const url = generateGitHubUrl(doc.newFilename)
      console.log(`  "${doc.title}"`)
      console.log(`  → ${url}\n`)
    })

    if (documentsToProcess.length > 20) {
      console.log(`  ... and ${documentsToProcess.length - 20} more documents\n`)
    }

    console.log('ℹ️  Run without --dry-run to update database')
    return
  }

  // Process documents
  console.log('🚀 Processing URLs...\n')

  const startTime = Date.now()

  for (let i = 0; i < documentsToProcess.length; i++) {
    const doc = documentsToProcess[i]
    const progress = `[${i + 1}/${documentsToProcess.length}]`
    const url = generateGitHubUrl(doc.newFilename)

    console.log(`${progress} Processing: "${doc.title}"`)
    console.log(`${' '.repeat(progress.length)} URL: ${url}`)

    // Verify URL is accessible
    console.log(`${' '.repeat(progress.length)} 🔍 Verifying URL...`)
    const verification = await verifyUrl(url)

    if (!verification.success) {
      results.urlVerificationFailed++
      results.errors.push({
        id: doc.id,
        title: doc.title,
        url: url,
        error: `URL verification failed: ${verification.error}`
      })

      console.log(`${' '.repeat(progress.length)} ❌ URL not accessible: ${verification.error}\n`)

      // Skip database update if URL not accessible
      continue
    }

    console.log(`${' '.repeat(progress.length)} ✅ URL verified (HTTP ${verification.status})`)

    // Update database (unless verify-only mode)
    if (!isVerifyOnly) {
      const updateResult = await updateDocumentUrl(doc.id, url)

      if (updateResult.success) {
        results.success++
        console.log(`${' '.repeat(progress.length)} ✅ Database updated\n`)
      } else {
        results.failed++
        results.errors.push({
          id: doc.id,
          title: doc.title,
          url: url,
          error: updateResult.error
        })

        console.log(`${' '.repeat(progress.length)} ❌ Database update failed: ${updateResult.error}\n`)
      }
    } else {
      results.success++
      console.log(`${' '.repeat(progress.length)} ✅ Verified (database not updated)\n`)
    }

    // Rate limiting delay
    if (i < documentsToProcess.length - 1) {
      await sleep(DELAY_BETWEEN_UPDATES)
    }
  }

  const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(1)

  // Save error log if any failures
  if (results.errors.length > 0) {
    const errorFile = path.join(__dirname, '..', 'github-files', 'url-errors.json')
    fs.writeFileSync(errorFile, JSON.stringify(results.errors, null, 2))
    console.log(`⚠️  Error log saved: ${errorFile}`)
  }

  // Final report
  console.log('\n' + '='.repeat(60))
  console.log('📊 URL POPULATION COMPLETE')
  console.log('='.repeat(60))

  if (isVerifyOnly) {
    console.log(`✅ URLs verified: ${results.success}`)
    console.log(`❌ URL verification failed: ${results.urlVerificationFailed}`)
  } else {
    console.log(`✅ Successfully updated: ${results.success}`)
    console.log(`❌ URL verification failed: ${results.urlVerificationFailed}`)
    console.log(`❌ Database update failed: ${results.failed}`)
  }

  console.log(`⏱️  Duration: ${duration} minutes`)
  console.log('='.repeat(60) + '\n')

  // Next steps
  if (isVerifyOnly) {
    console.log('ℹ️  URLs verified! Run without --verify-urls to update database\n')
  } else if (results.success > 0) {
    console.log('📝 NEXT STEPS:')
    console.log('1. Test download functionality in chat interface')
    console.log('2. Ask a question and verify download buttons appear')
    console.log('3. Click random download buttons to test\n')

    if (results.urlVerificationFailed > 0) {
      console.log('⚠️  ATTENTION:')
      console.log(`   ${results.urlVerificationFailed} URLs could not be verified`)
      console.log('   Possible causes:')
      console.log('   - Files not uploaded to GitHub yet')
      console.log('   - Repository not public')
      console.log('   - Incorrect GITHUB_USERNAME or GITHUB_REPO')
      console.log('   - Files in wrong directory on GitHub\n')
    }
  }

  console.log('✨ All done!')
}

// ============================================================
// RUN SCRIPT
// ============================================================

main().catch(error => {
  console.error('\n❌ Fatal error:', error)
  process.exit(1)
})
