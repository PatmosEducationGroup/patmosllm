#!/usr/bin/env node

/**
 * ============================================================
 * GITHUB FILES PREPARATION SCRIPT
 * ============================================================
 * Downloads files from Supabase Storage and renames them to
 * match cleaned database titles for GitHub hosting
 *
 * WORKFLOW:
 * 1. Fetch all documents from database (uses cleaned titles)
 * 2. Download files from Supabase Storage
 * 3. Rename files with filesystem-safe names
 * 4. Save to ./github-files/ directory
 * 5. Create mapping JSON for next step
 *
 * USAGE:
 *   node scripts/prepare-github-files.js --dry-run  # Preview
 *   node scripts/prepare-github-files.js            # Execute
 *
 * PREREQUISITES:
 * - Phase 1 (cleanup-titles.js) must be completed first
 * - Ensure titles in database are already cleaned
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

const OUTPUT_DIR = path.join(__dirname, '..', 'github-files')
const MAPPING_FILE = path.join(OUTPUT_DIR, 'file-mapping.json')
const DELAY_BETWEEN_DOWNLOADS = 100 // 100ms

// Parse command line arguments
const args = process.argv.slice(2)
const isDryRun = args.includes('--dry-run')

// ============================================================
// INITIALIZE SUPABASE CLIENT
// ============================================================

console.log('🔧 Initializing Supabase client...')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// ============================================================
// FILENAME SANITIZATION
// ============================================================

// Map of MIME types to file extensions
const MIME_TO_EXT = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'text/plain': 'txt',
  'text/csv': 'csv',
  'text/markdown': 'md',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'application/epub+zip': 'epub',
  'application/zip': 'zip'
}

function getExtensionFromMimeType(mimeType) {
  return MIME_TO_EXT[mimeType] || 'bin'
}

function getExtensionFromPath(storagePath) {
  if (!storagePath) return null
  const ext = path.extname(storagePath).toLowerCase().replace('.', '')
  return ext || null
}

function sanitizeFilename(title, mimeType, storagePath) {
  // Get file extension
  let ext = getExtensionFromPath(storagePath)
  if (!ext && mimeType) {
    ext = getExtensionFromMimeType(mimeType)
  }
  if (!ext) {
    ext = 'pdf' // Default fallback
  }

  // Sanitize title for filesystem
  const sanitized = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')  // Replace non-alphanumeric with hyphens
    .replace(/^-+|-+$/g, '')       // Trim leading/trailing hyphens
    .substring(0, 100)             // Limit length

  return `${sanitized}.${ext}`
}

// ============================================================
// FILE DOWNLOAD FUNCTIONS
// ============================================================

async function downloadFile(storagePath) {
  try {
    const { data, error } = await supabase.storage
      .from(process.env.SUPABASE_BUCKET || 'documents')
      .download(storagePath)

    if (error) {
      throw new Error(`Download failed: ${error.message}`)
    }

    return data
  } catch (error) {
    throw new Error(`Failed to download ${storagePath}: ${error.message}`)
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
  console.log('📦 GITHUB FILES PREPARATION SCRIPT')
  console.log('='.repeat(60))

  if (isDryRun) {
    console.log('🔍 MODE: DRY RUN (preview only, no files downloaded)')
  } else {
    console.log('🚀 MODE: EXECUTE (will download and rename files)')
  }

  console.log('='.repeat(60) + '\n')

  // Create output directory
  if (!isDryRun && !fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true })
    console.log(`✅ Created directory: ${OUTPUT_DIR}\n`)
  }

  // Fetch all documents with storage paths
  console.log('📥 Fetching documents from Supabase...')
  const { data: documents, error } = await supabase
    .from('documents')
    .select('id, title, storage_path, mime_type, file_size')
    .not('storage_path', 'is', null)
    .order('title')

  if (error) {
    console.error('❌ Failed to fetch documents:', error)
    process.exit(1)
  }

  console.log(`✅ Found ${documents.length} documents with storage paths\n`)

  if (documents.length === 0) {
    console.log('⚠️  No documents found with storage paths')
    return
  }

  // Prepare mapping data
  const mapping = {
    timestamp: new Date().toISOString(),
    documentCount: documents.length,
    documents: []
  }

  const results = {
    success: 0,
    failed: 0,
    skipped: 0,
    errors: []
  }

  // Preview mode
  if (isDryRun) {
    console.log('📋 PREVIEW OF FILE RENAMING:\n')
    documents.slice(0, 20).forEach(doc => {
      const newFilename = sanitizeFilename(doc.title, doc.mime_type, doc.storage_path)
      console.log(`  "${doc.title}"`)
      console.log(`  Storage: ${doc.storage_path}`)
      console.log(`  → ${newFilename}\n`)
    })

    if (documents.length > 20) {
      console.log(`  ... and ${documents.length - 20} more documents\n`)
    }

    console.log('ℹ️  Run without --dry-run to download and rename files')
    return
  }

  // Execute download and rename
  console.log('🚀 Downloading and renaming files...\n')

  const startTime = Date.now()

  for (let i = 0; i < documents.length; i++) {
    const doc = documents[i]
    const progress = `[${i + 1}/${documents.length}]`
    const newFilename = sanitizeFilename(doc.title, doc.mime_type, doc.storage_path)
    const outputPath = path.join(OUTPUT_DIR, newFilename)

    console.log(`${progress} Processing: "${doc.title}"`)
    console.log(`${' '.repeat(progress.length)} → ${newFilename}`)

    // Check if file already exists
    if (fs.existsSync(outputPath)) {
      console.log(`${' '.repeat(progress.length)} ⏭️  Already exists, skipping\n`)
      results.skipped++

      // Add to mapping even if skipped
      mapping.documents.push({
        id: doc.id,
        title: doc.title,
        oldPath: doc.storage_path,
        newFilename: newFilename,
        mimeType: doc.mime_type,
        fileSize: doc.file_size,
        status: 'skipped'
      })

      continue
    }

    try {
      // Download file
      const fileData = await downloadFile(doc.storage_path)

      // Convert blob to buffer and write to disk
      const buffer = Buffer.from(await fileData.arrayBuffer())
      fs.writeFileSync(outputPath, buffer)

      results.success++
      console.log(`${' '.repeat(progress.length)} ✅ Downloaded (${(buffer.length / 1024).toFixed(1)} KB)\n`)

      // Add to mapping
      mapping.documents.push({
        id: doc.id,
        title: doc.title,
        oldPath: doc.storage_path,
        newFilename: newFilename,
        mimeType: doc.mime_type,
        fileSize: doc.file_size,
        status: 'success'
      })

    } catch (error) {
      results.failed++
      results.errors.push({
        id: doc.id,
        title: doc.title,
        storage_path: doc.storage_path,
        error: error.message
      })

      console.log(`${' '.repeat(progress.length)} ❌ Failed: ${error.message}\n`)

      // Add to mapping with error
      mapping.documents.push({
        id: doc.id,
        title: doc.title,
        oldPath: doc.storage_path,
        newFilename: newFilename,
        mimeType: doc.mime_type,
        fileSize: doc.file_size,
        status: 'failed',
        error: error.message
      })
    }

    // Rate limiting delay
    if (i < documents.length - 1) {
      await sleep(DELAY_BETWEEN_DOWNLOADS)
    }
  }

  const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(1)

  // Save mapping file
  fs.writeFileSync(MAPPING_FILE, JSON.stringify(mapping, null, 2))
  console.log(`💾 Mapping saved: ${MAPPING_FILE}`)

  // Save error log if any failures
  if (results.failed > 0) {
    const errorFile = path.join(OUTPUT_DIR, 'download-errors.json')
    fs.writeFileSync(errorFile, JSON.stringify(results.errors, null, 2))
    console.log(`⚠️  Error log saved: ${errorFile}`)
  }

  // Final report
  console.log('\n' + '='.repeat(60))
  console.log('📊 FILE PREPARATION COMPLETE')
  console.log('='.repeat(60))
  console.log(`✅ Successfully downloaded: ${results.success}`)
  console.log(`⏭️  Skipped (already exists): ${results.skipped}`)
  console.log(`❌ Failed downloads: ${results.failed}`)
  console.log(`⏱️  Duration: ${duration} minutes`)
  console.log(`📁 Output directory: ${OUTPUT_DIR}`)
  console.log('='.repeat(60) + '\n')

  // Next steps
  console.log('📝 NEXT STEPS:')
  console.log('1. Review files in ./github-files/ directory')
  console.log('2. Create public GitHub repository (e.g., "patmosllm-documents")')
  console.log('3. Upload all files from ./github-files/ to GitHub')
  console.log('4. Run: node scripts/populate-download-urls.js\n')

  console.log('ℹ️  For GitHub upload, you can:')
  console.log('   - Use GitHub web interface (drag & drop)')
  console.log('   - Or use git commands:')
  console.log('     cd github-files')
  console.log('     git init')
  console.log('     git add .')
  console.log('     git commit -m "Add documents"')
  console.log('     git branch -M main')
  console.log('     git remote add origin https://github.com/USERNAME/REPO.git')
  console.log('     git push -u origin main\n')

  console.log('✨ All done!')
}

// ============================================================
// RUN SCRIPT
// ============================================================

main().catch(error => {
  console.error('\n❌ Fatal error:', error)
  process.exit(1)
})
