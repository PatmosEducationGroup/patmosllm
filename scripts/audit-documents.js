const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function auditDocuments() {
  console.log('🔍 Starting document audit...\n')

  try {
    // Get all documents
    const { data: documents, error: docsError } = await supabase
      .from('documents')
      .select('*')
      .order('created_at', { ascending: false })

    if (docsError) {
      console.error('Error fetching documents:', docsError)
      return
    }

    console.log(`📊 Total documents in database: ${documents.length}\n`)

    // Get all chunks grouped by document
    const { data: chunks, error: chunksError } = await supabase
      .from('chunks')
      .select('document_id, id, chunk_index')

    if (chunksError) {
      console.error('Error fetching chunks:', chunksError)
      return
    }

    // Group chunks by document_id
    const chunksByDocument = {}
    chunks.forEach(chunk => {
      if (!chunksByDocument[chunk.document_id]) {
        chunksByDocument[chunk.document_id] = []
      }
      chunksByDocument[chunk.document_id].push(chunk)
    })

    // Analyze documents
    const issues = {
      noChunks: [],
      fewChunks: [],
      missingMetadata: [],
      successful: []
    }

    documents.forEach(doc => {
      const docChunks = chunksByDocument[doc.id] || []

      if (docChunks.length === 0) {
        issues.noChunks.push({
          id: doc.id,
          title: doc.title,
          mime_type: doc.mime_type,
          file_size: doc.file_size,
          created_at: doc.created_at
        })
      } else if (docChunks.length < 3 && doc.file_size > 10000) {
        // Documents larger than 10KB with fewer than 3 chunks might be problematic
        issues.fewChunks.push({
          id: doc.id,
          title: doc.title,
          chunk_count: docChunks.length,
          file_size: doc.file_size,
          mime_type: doc.mime_type
        })
      } else if (!doc.word_count && doc.mime_type?.includes('text')) {
        issues.missingMetadata.push({
          id: doc.id,
          title: doc.title,
          mime_type: doc.mime_type,
          chunk_count: docChunks.length
        })
      } else {
        issues.successful.push({
          id: doc.id,
          title: doc.title,
          chunk_count: docChunks.length,
          word_count: doc.word_count
        })
      }
    })

    // Print report
    console.log('=' .repeat(80))
    console.log('📋 AUDIT REPORT')
    console.log('='.repeat(80))
    console.log()

    console.log(`✅ Successfully ingested: ${issues.successful.length}/${documents.length} (${(issues.successful.length/documents.length*100).toFixed(1)}%)`)
    console.log(`❌ Documents with NO chunks: ${issues.noChunks.length}`)
    console.log(`⚠️  Documents with suspiciously FEW chunks: ${issues.fewChunks.length}`)
    console.log(`⚠️  Documents with missing metadata: ${issues.missingMetadata.length}`)
    console.log()

    if (issues.noChunks.length > 0) {
      console.log('=' .repeat(80))
      console.log('❌ DOCUMENTS WITH NO CHUNKS (BROKEN)')
      console.log('='.repeat(80))
      issues.noChunks.forEach((doc, idx) => {
        console.log(`\n${idx + 1}. ${doc.title}`)
        console.log(`   ID: ${doc.id}`)
        console.log(`   Type: ${doc.mime_type || 'unknown'}`)
        console.log(`   Size: ${(doc.file_size / 1024).toFixed(2)} KB`)
        console.log(`   Created: ${new Date(doc.created_at).toLocaleString()}`)
      })
      console.log()
    }

    if (issues.fewChunks.length > 0) {
      console.log('=' .repeat(80))
      console.log('⚠️  DOCUMENTS WITH SUSPICIOUSLY FEW CHUNKS')
      console.log('='.repeat(80))
      issues.fewChunks.slice(0, 20).forEach((doc, idx) => {
        console.log(`\n${idx + 1}. ${doc.title}`)
        console.log(`   ID: ${doc.id}`)
        console.log(`   Chunks: ${doc.chunk_count}`)
        console.log(`   Size: ${(doc.file_size / 1024).toFixed(2)} KB`)
        console.log(`   Type: ${doc.mime_type}`)
      })
      if (issues.fewChunks.length > 20) {
        console.log(`\n... and ${issues.fewChunks.length - 20} more`)
      }
      console.log()
    }

    if (issues.missingMetadata.length > 0) {
      console.log('=' .repeat(80))
      console.log('⚠️  DOCUMENTS WITH MISSING METADATA')
      console.log('='.repeat(80))
      issues.missingMetadata.slice(0, 20).forEach((doc, idx) => {
        console.log(`\n${idx + 1}. ${doc.title}`)
        console.log(`   ID: ${doc.id}`)
        console.log(`   Chunks: ${doc.chunk_count}`)
        console.log(`   Type: ${doc.mime_type}`)
      })
      if (issues.missingMetadata.length > 20) {
        console.log(`\n... and ${issues.missingMetadata.length - 20} more`)
      }
      console.log()
    }

    // Summary statistics
    console.log('=' .repeat(80))
    console.log('📊 CHUNK STATISTICS')
    console.log('='.repeat(80))
    const totalChunks = Object.values(chunksByDocument).reduce((sum, chunks) => sum + chunks.length, 0)
    const avgChunksPerDoc = (totalChunks / documents.length).toFixed(2)
    const docsWithChunks = documents.length - issues.noChunks.length
    console.log(`Total chunks in database: ${totalChunks}`)
    console.log(`Average chunks per document: ${avgChunksPerDoc}`)
    console.log(`Documents with chunks: ${docsWithChunks}/${documents.length}`)
    console.log()

    // File type breakdown
    console.log('=' .repeat(80))
    console.log('📁 FILE TYPE BREAKDOWN')
    console.log('='.repeat(80))
    const mimeTypes = {}
    documents.forEach(doc => {
      const mime = doc.mime_type || 'unknown'
      mimeTypes[mime] = (mimeTypes[mime] || 0) + 1
    })
    Object.entries(mimeTypes)
      .sort((a, b) => b[1] - a[1])
      .forEach(([mime, count]) => {
        console.log(`${mime}: ${count} documents`)
      })
    console.log()

    console.log('=' .repeat(80))
    console.log('✅ Audit complete!')
    console.log('='.repeat(80))

  } catch (error) {
    console.error('Error during audit:', error)
  }
}

auditDocuments()