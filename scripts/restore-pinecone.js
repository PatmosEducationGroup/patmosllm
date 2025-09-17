// restore-pinecone.js - Restore Pinecone index from backup
import { Pinecone } from '@pinecone-database/pinecone'
import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const pc = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY
})

async function restorePinecone(backupFilePath, targetIndexName, targetNamespace = 'default') {
  try {
    console.log(`🔄 Starting Pinecone restore...`)
    console.log(`📂 Backup file: ${backupFilePath}`)
    console.log(`🎯 Target index: ${targetIndexName}`)
    console.log(`📁 Target namespace: ${targetNamespace}`)
    
    // Read backup file
    if (!fs.existsSync(backupFilePath)) {
      throw new Error(`Backup file not found: ${backupFilePath}`)
    }
    
    console.log('📖 Reading backup file...')
    const backupData = JSON.parse(fs.readFileSync(backupFilePath, 'utf8'))
    
    console.log(`📊 Backup metadata:`)
    console.log(`   Original index: ${backupData.metadata.indexName}`)
    console.log(`   Original namespace: ${backupData.metadata.namespace}`)
    console.log(`   Timestamp: ${backupData.metadata.timestamp}`)
    console.log(`   Vector count: ${backupData.vectors.length}`)
    console.log(`   Dimension: ${backupData.metadata.dimension}`)
    
    // Get target index
    const index = pc.index(targetIndexName)
    
    // Verify target index exists and has correct dimensions
    console.log('🔍 Verifying target index...')
    const indexStats = await index.describeIndexStats()
    
    if (indexStats.dimension !== backupData.metadata.dimension) {
      throw new Error(
        `Dimension mismatch: backup has ${backupData.metadata.dimension} dimensions, ` +
        `target index has ${indexStats.dimension} dimensions`
      )
    }
    
    console.log('✅ Target index verified')
    
    // Restore vectors in batches
    const batchSize = 100 // Pinecone upsert limit
    const vectors = backupData.vectors
    const totalBatches = Math.ceil(vectors.length / batchSize)
    
    console.log(`🚀 Starting restore: ${vectors.length} vectors in ${totalBatches} batches`)
    
    let restoredCount = 0
    
    for (let i = 0; i < vectors.length; i += batchSize) {
      const batch = vectors.slice(i, i + batchSize)
      const batchNumber = Math.floor(i / batchSize) + 1
      
      console.log(`📦 Processing batch ${batchNumber}/${totalBatches} (${batch.length} vectors)`)
      
      // Format vectors for Pinecone upsert
      const formattedVectors = batch.map(vector => ({
        id: vector.id,
        values: vector.values,
        metadata: vector.metadata
      }))
      
      try {
        await index.namespace(targetNamespace).upsert(formattedVectors)
        restoredCount += batch.length
        console.log(`   ✅ Batch ${batchNumber} completed`)
      } catch (error) {
        console.error(`   ❌ Batch ${batchNumber} failed:`, error.message)
        throw error
      }
      
      // Small delay between batches to avoid rate limiting
      if (batchNumber < totalBatches) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    }
    
    console.log(`\n🎉 Restore completed successfully!`)
    console.log(`📊 Vectors restored: ${restoredCount}`)
    console.log(`🎯 Target index: ${targetIndexName}`)
    console.log(`📁 Target namespace: ${targetNamespace}`)
    
    // Verify restoration
    console.log('🔍 Verifying restoration...')
    const finalStats = await index.describeIndexStats()
    const namespaceStats = finalStats.namespaces?.[targetNamespace]
    
    console.log(`📈 Final vector count in namespace: ${namespaceStats?.recordCount || 'Unknown'}`)
    console.log(`📈 Total vectors in index: ${finalStats.totalRecordCount}`)
    
    return {
      success: true,
      vectorsRestored: restoredCount,
      targetIndex: targetIndexName,
      targetNamespace: targetNamespace
    }
    
  } catch (error) {
    console.error('❌ Restore failed:', error)
    throw error
  }
}

// Command line interface
async function main() {
  const args = process.argv.slice(2)
  
  if (args.length < 2) {
    console.log(`
Usage: node scripts/restore-pinecone.js <backup-file> <target-index> [target-namespace]

Examples:
  node scripts/restore-pinecone.js backups/pinecone-backup-*.json patmosllm-voyage
  node scripts/restore-pinecone.js backups/pinecone-backup-*.json patmosllm-new default
    `)
    process.exit(1)
  }
  
  const backupFile = args[0]
  const targetIndex = args[1]
  const targetNamespace = args[2] || 'default'
  
  try {
    await restorePinecone(backupFile, targetIndex, targetNamespace)
    console.log('\n✅ Restore process completed successfully!')
    process.exit(0)
  } catch (error) {
    console.error('\n❌ Restore process failed:', error)
    process.exit(1)
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}

export { restorePinecone }