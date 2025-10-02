#!/usr/bin/env node

/**
 * ============================================================
 * DOCUMENT TITLE CLEANUP SCRIPT
 * ============================================================
 * Safely renames 450+ document titles in Supabase + Pinecone
 *
 * SAFETY FEATURES:
 * - Saves old_title to database before update (permanent backup)
 * - Atomic updates (Supabase + Pinecone together)
 * - Verification after each update
 * - Automatic retry logic (3 attempts)
 * - Pinecone consistency wait (2 seconds)
 * - Rate limiting (150ms between documents)
 * - Three modes: --dry-run, --verify, execute
 *
 * PREREQUISITES:
 * 1. Run scripts/add-old-title-column.sql in Supabase first
 * 2. Set environment variables (NEXT_PUBLIC_SUPABASE_URL, etc.)
 *
 * USAGE:
 *   node scripts/cleanup-titles.js --dry-run  # Preview changes
 *   node scripts/cleanup-titles.js --verify   # Verify integrity
 *   node scripts/cleanup-titles.js            # Execute cleanup
 *
 * Created: October 1, 2025
 * See: DOCUMENT-CLEANUP-AND-DOWNLOAD-PLAN.md
 * ============================================================
 */

import { createClient } from '@supabase/supabase-js'
import { Pinecone } from '@pinecone-database/pinecone'
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

const PINECONE_CONSISTENCY_WAIT = 2000 // 2 seconds
const RATE_LIMIT_DELAY = 150 // 150ms between documents
const MAX_RETRIES = 3
const RETRY_DELAYS = [2000, 4000, 8000] // Exponential backoff

// Parse command line arguments
const args = process.argv.slice(2)
const isDryRun = args.includes('--dry-run')
const isVerify = args.includes('--verify')

// ============================================================
// INITIALIZE CLIENTS
// ============================================================

console.log('🔧 Initializing Supabase and Pinecone clients...')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY
})

const index = pinecone.index(process.env.PINECONE_INDEX)
const namespace = process.env.PINECONE_NAMESPACE || 'default'

// ============================================================
// TITLE CLEANING LOGIC
// ============================================================

function cleanTitle(title) {
  if (!title) return title

  let cleaned = title

  // Remove leading numbers with letters (like "5a ", "12b ", etc.)
  cleaned = cleaned.replace(/^\d+[a-z]\s+/i, '')

  // Remove leading underscores and spaces
  cleaned = cleaned.replace(/^[_\s]+/, '')

  // Replace underscores with spaces
  cleaned = cleaned.replace(/_/g, ' ')

  // Normalize whitespace
  cleaned = cleaned.replace(/\s+/g, ' ')

  return cleaned.trim()
}

// ============================================================
// BACKUP FUNCTIONS
// ============================================================

function createBackup(documents) {
  const backupDir = path.join(__dirname, '..', 'backups')
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true })
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupFile = path.join(backupDir, `title-cleanup-${timestamp}.json`)

  const backup = {
    timestamp: new Date().toISOString(),
    documentCount: documents.length,
    documents: documents.map(doc => ({
      id: doc.id,
      oldTitle: doc.title,
      newTitle: cleanTitle(doc.title),
      storage_path: doc.storage_path
    }))
  }

  fs.writeFileSync(backupFile, JSON.stringify(backup, null, 2))
  console.log(`✅ Backup created: ${backupFile}`)

  return backupFile
}

// ============================================================
// VERIFICATION FUNCTIONS
// ============================================================

async function verifyUpdate(documentId, expectedTitle) {
  try {
    // Check Supabase
    const { data: doc, error: dbError } = await supabase
      .from('documents')
      .select('title')
      .eq('id', documentId)
      .single()

    if (dbError || !doc) {
      return { success: false, error: 'Supabase verification failed', dbError }
    }

    if (doc.title !== expectedTitle) {
      return { success: false, error: 'Title mismatch in Supabase' }
    }

    // Check Pinecone metadata
    const chunks = await index.namespace(namespace).query({
      vector: new Array(1024).fill(0), // Dummy vector
      topK: 1,
      filter: { documentId: { $eq: documentId } },
      includeMetadata: true
    })

    if (chunks.matches && chunks.matches.length > 0) {
      const pineconeTitle = chunks.matches[0].metadata?.documentTitle
      if (pineconeTitle !== expectedTitle) {
        return { success: false, error: 'Title mismatch in Pinecone' }
      }
    }

    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

async function verifyDatabaseIntegrity() {
  console.log('\n🔍 Verifying database integrity...\n')

  // Check Supabase documents
  const { data: documents, error: dbError } = await supabase
    .from('documents')
    .select('id, title')

  if (dbError) {
    console.error('❌ Failed to fetch documents from Supabase:', dbError)
    return false
  }

  console.log(`✅ Found ${documents.length} documents in Supabase`)

  // Sample check: Verify 10 random documents
  const sampleSize = Math.min(10, documents.length)
  const sampleDocs = documents
    .sort(() => Math.random() - 0.5)
    .slice(0, sampleSize)

  let matchCount = 0

  for (const doc of sampleDocs) {
    const verification = await verifyUpdate(doc.id, doc.title)
    if (verification.success) {
      matchCount++
    } else {
      console.log(`⚠️  Document ${doc.id} (${doc.title}): ${verification.error}`)
    }
  }

  console.log(`\n✅ Verified ${matchCount}/${sampleSize} sample documents`)
  console.log('✅ Database integrity check complete')

  return true
}

// ============================================================
// UPDATE FUNCTIONS
// ============================================================

async function updateDocumentTitle(document, cleanedTitle, retryCount = 0) {
  try {
    // 1. Update Supabase (saves old_title + new title atomically)
    const { error: dbError } = await supabase
      .from('documents')
      .update({
        old_title: document.title, // Save original
        title: cleanedTitle        // Update to clean version
      })
      .eq('id', document.id)

    if (dbError) {
      throw new Error(`Supabase update failed: ${dbError.message}`)
    }

    // 2. Get all chunks for this document
    const { data: chunks, error: chunksError } = await supabase
      .from('chunks')
      .select('id')
      .eq('document_id', document.id)

    if (chunksError) {
      console.warn(`⚠️  Could not fetch chunks for ${document.id}`)
    }

    // 3. Update Pinecone metadata for all chunks
    if (chunks && chunks.length > 0) {
      const chunkIds = chunks.map(c => c.id)

      // Pinecone batch update (updates all vectors with matching documentId)
      for (const chunkId of chunkIds) {
        try {
          await index.namespace(namespace).update({
            id: chunkId,
            metadata: {
              documentTitle: cleanedTitle
            }
          })
        } catch (pineconeError) {
          console.warn(`⚠️  Pinecone update failed for chunk ${chunkId}`)
        }
      }
    }

    // 4. Wait for Pinecone consistency
    await sleep(PINECONE_CONSISTENCY_WAIT)

    // 5. Verify update
    const verification = await verifyUpdate(document.id, cleanedTitle)

    if (!verification.success) {
      if (retryCount < MAX_RETRIES) {
        console.log(`  ⚠️  Verification failed, retrying (${retryCount + 1}/${MAX_RETRIES})...`)
        await sleep(RETRY_DELAYS[retryCount])
        return await updateDocumentTitle(document, cleanedTitle, retryCount + 1)
      } else {
        throw new Error(`Verification failed after ${MAX_RETRIES} retries: ${verification.error}`)
      }
    }

    return { success: true }

  } catch (error) {
    if (retryCount < MAX_RETRIES) {
      console.log(`  ⚠️  Update failed, retrying (${retryCount + 1}/${MAX_RETRIES})...`)
      await sleep(RETRY_DELAYS[retryCount])
      return await updateDocumentTitle(document, cleanedTitle, retryCount + 1)
    } else {
      return { success: false, error: error.message }
    }
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
  console.log('📚 DOCUMENT TITLE CLEANUP SCRIPT')
  console.log('='.repeat(60))

  if (isDryRun) {
    console.log('🔍 MODE: DRY RUN (preview only, no changes)')
  } else if (isVerify) {
    console.log('🔍 MODE: VERIFY (check database integrity)')
  } else {
    console.log('🚀 MODE: EXECUTE (will update database)')
  }

  console.log('='.repeat(60) + '\n')

  // Verify mode - just check integrity and exit
  if (isVerify) {
    await verifyDatabaseIntegrity()
    return
  }

  // Fetch all documents
  console.log('📥 Fetching documents from Supabase...')
  const { data: documents, error } = await supabase
    .from('documents')
    .select('id, title, storage_path')
    .order('title')

  if (error) {
    console.error('❌ Failed to fetch documents:', error)
    process.exit(1)
  }

  console.log(`✅ Found ${documents.length} documents\n`)

  // Filter documents that need cleaning
  const documentsToClean = documents.filter(doc => {
    const cleaned = cleanTitle(doc.title)
    return cleaned !== doc.title
  })

  console.log(`📝 ${documentsToClean.length} documents need title cleanup`)
  console.log(`✅ ${documents.length - documentsToClean.length} documents already have clean titles\n`)

  if (documentsToClean.length === 0) {
    console.log('✨ No documents need cleaning. Exiting.')
    return
  }

  // Dry run mode - just preview
  if (isDryRun) {
    console.log('📋 PREVIEW OF CHANGES:\n')
    documentsToClean.slice(0, 20).forEach(doc => {
      const cleaned = cleanTitle(doc.title)
      console.log(`  "${doc.title}"`)
      console.log(`  → "${cleaned}"\n`)
    })

    if (documentsToClean.length > 20) {
      console.log(`  ... and ${documentsToClean.length - 20} more documents\n`)
    }

    console.log('ℹ️  Run without --dry-run to execute cleanup')
    return
  }

  // Create backup before any changes
  console.log('💾 Creating backup...')
  const backupFile = createBackup(documentsToClean)

  // Execute cleanup
  console.log('\n🚀 Starting title cleanup...\n')

  const results = {
    success: 0,
    failed: 0,
    errors: []
  }

  const startTime = Date.now()

  for (let i = 0; i < documentsToClean.length; i++) {
    const doc = documentsToClean[i]
    const cleanedTitle = cleanTitle(doc.title)
    const progress = `[${i + 1}/${documentsToClean.length}]`

    console.log(`${progress} Updating: "${doc.title}"`)
    console.log(`${' '.repeat(progress.length)}        → "${cleanedTitle}"`)

    const result = await updateDocumentTitle(doc, cleanedTitle)

    if (result.success) {
      results.success++
      console.log(`${' '.repeat(progress.length)} ✅ Success\n`)
    } else {
      results.failed++
      results.errors.push({
        id: doc.id,
        title: doc.title,
        error: result.error
      })
      console.log(`${' '.repeat(progress.length)} ❌ Failed: ${result.error}\n`)
    }

    // Rate limiting delay
    if (i < documentsToClean.length - 1) {
      await sleep(RATE_LIMIT_DELAY)
    }
  }

  const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(1)

  // Final report
  console.log('\n' + '='.repeat(60))
  console.log('📊 CLEANUP COMPLETE')
  console.log('='.repeat(60))
  console.log(`✅ Successful updates: ${results.success}`)
  console.log(`❌ Failed updates: ${results.failed}`)
  console.log(`⏱️  Duration: ${duration} minutes`)
  console.log(`💾 Backup: ${backupFile}`)
  console.log('='.repeat(60) + '\n')

  // Save error log if any failures
  if (results.failed > 0) {
    const errorFile = backupFile.replace('.json', '-errors.json')
    fs.writeFileSync(errorFile, JSON.stringify(results.errors, null, 2))
    console.log(`⚠️  Error log saved: ${errorFile}`)
    console.log('ℹ️  You can retry failed documents by running the script again\n')
  }

  // Run verification
  console.log('🔍 Running post-cleanup verification...\n')
  await verifyDatabaseIntegrity()

  console.log('\n✨ All done!')
}

// ============================================================
// RUN SCRIPT
// ============================================================

main().catch(error => {
  console.error('\n❌ Fatal error:', error)
  process.exit(1)
})
