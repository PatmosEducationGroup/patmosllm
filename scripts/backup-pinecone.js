// backup-pinecone.js - Complete Pinecone index backup utility
import { Pinecone } from '@pinecone-database/pinecone'
import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const pc = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY
})

const indexName = process.env.PINECONE_INDEX || 'patmosllm-voyage'
const namespace = process.env.PINECONE_NAMESPACE || 'default'

async function backupPinecone() {
  try {
    console.log(`🗄️  Starting Pinecone backup for index: ${indexName}`)
    console.log(`📂 Namespace: ${namespace}`)
    
    const index = pc.index(indexName)
    
    // Get index stats first
    console.log('📊 Getting index statistics...')
    const stats = await index.describeIndexStats()
    console.log(`📈 Total vectors in index: ${stats.totalRecordCount}`)
    console.log(`📐 Vector dimension: ${stats.dimension}`)
    
    const namespacesInfo = stats.namespaces || {}
    const namespaceStats = namespacesInfo[namespace]
    const expectedVectorCount = namespaceStats?.recordCount || stats.totalRecordCount
    
    console.log(`🎯 Vectors in namespace '${namespace}': ${expectedVectorCount}`)
    
    // Fetch all vectors in batches
    console.log('📥 Fetching all vectors...')
    let allVectors = []
    let fetchedCount = 0
    const batchSize = 1000
    
    // Use multiple dummy queries to fetch all vectors
    // Since we can't list all IDs, we'll use broad queries
    
    console.log('🔍 Starting vector retrieval...')
    
    const queryResponse = await index.namespace(namespace).query({
      vector: new Array(1024).fill(0), // dummy vector for Voyage-3-large (1024 dimensions)
      topK: 10000, // Maximum allowed by Pinecone
      includeMetadata: true,
      includeValues: true
    })
    
    allVectors = queryResponse.matches || []
    fetchedCount = allVectors.length
    
    console.log(`✅ Retrieved ${fetchedCount} vectors`)
    
    if (fetchedCount < expectedVectorCount) {
      console.log(`⚠️  Warning: Retrieved ${fetchedCount} vectors but expected ${expectedVectorCount}`)
      console.log('   This might be due to Pinecone query limitations. Consider using multiple queries.')
    }
    
    // Create backup directory if it doesn't exist
    const backupDir = './backups'
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true })
    }
    
    // Prepare backup data
    const backup = {
      metadata: {
        timestamp: new Date().toISOString(),
        indexName: indexName,
        namespace: namespace,
        dimension: stats.dimension,
        totalVectorsInIndex: stats.totalRecordCount,
        vectorsBackedUp: fetchedCount,
        backupVersion: '1.0'
      },
      vectors: allVectors.map(vector => ({
        id: vector.id,
        values: vector.values,
        metadata: vector.metadata
      }))
    }
    
    // Create filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filename = `pinecone-backup-${indexName}-${namespace}-${timestamp}.json`
    const filepath = path.join(backupDir, filename)
    
    // Write backup to file
    console.log('💾 Writing backup to file...')
    fs.writeFileSync(filepath, JSON.stringify(backup, null, 2))
    
    // Calculate file size
    const stats_file = fs.statSync(filepath)
    const fileSizeMB = (stats_file.size / (1024 * 1024)).toFixed(2)
    
    console.log(`\n🎉 Backup completed successfully!`)
    console.log(`📁 File: ${filepath}`)
    console.log(`📊 Vectors backed up: ${backup.vectors.length}`)
    console.log(`💿 File size: ${fileSizeMB} MB`)
    console.log(`🕐 Timestamp: ${backup.metadata.timestamp}`)
    
    // Create a summary file
    const summaryFilename = `backup-summary-${timestamp}.txt`
    const summaryPath = path.join(backupDir, summaryFilename)
    const summary = `
Pinecone Backup Summary
======================
Date: ${backup.metadata.timestamp}
Index: ${backup.metadata.indexName}
Namespace: ${backup.metadata.namespace}
Dimension: ${backup.metadata.dimension}
Total vectors in index: ${backup.metadata.totalVectorsInIndex}
Vectors backed up: ${backup.metadata.vectorsBackedUp}
Backup file: ${filename}
File size: ${fileSizeMB} MB

Backup Status: ${backup.metadata.vectorsBackedUp === backup.metadata.totalVectorsInIndex ? 'COMPLETE' : 'PARTIAL'}
${backup.metadata.vectorsBackedUp < backup.metadata.totalVectorsInIndex ? 
  'Warning: Not all vectors were retrieved due to Pinecone query limitations.' : ''}
`
    
    fs.writeFileSync(summaryPath, summary)
    console.log(`📋 Summary written to: ${summaryPath}`)
    
    return {
      success: true,
      backupFile: filepath,
      vectorCount: backup.vectors.length,
      fileSize: fileSizeMB
    }
    
  } catch (error) {
    console.error('❌ Backup failed:', error)
    throw error
  }
}

// Run the backup
if (import.meta.url === `file://${process.argv[1]}`) {
  backupPinecone()
    .then(result => {
      console.log('\n✅ Backup process completed successfully!')
      process.exit(0)
    })
    .catch(error => {
      console.error('\n❌ Backup process failed:', error)
      process.exit(1)
    })
}

export { backupPinecone }