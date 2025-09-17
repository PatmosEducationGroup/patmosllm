// backup-pinecone-large.js - Enhanced backup for large indexes (>10K vectors)
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

async function backupPineconeLarge() {
  try {
    console.log(`🗄️  Starting enhanced Pinecone backup for index: ${indexName}`)
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
    
    if (expectedVectorCount > 10000) {
      console.log(`⚠️  Large index detected (${expectedVectorCount} vectors > 10K limit)`)
      console.log(`🔄 Using multi-query strategy to fetch all vectors...`)
    }
    
    let allVectors = []
    let fetchedCount = 0
    const maxPerQuery = 10000
    
    // Strategy 1: Try to get as many as possible with a single query
    console.log('🔍 Phase 1: Primary query...')
    const primaryQuery = await index.namespace(namespace).query({
      vector: new Array(1024).fill(0), // dummy vector for Voyage-3-large
      topK: maxPerQuery,
      includeMetadata: true,
      includeValues: true
    })
    
    allVectors = primaryQuery.matches || []
    fetchedCount = allVectors.length
    console.log(`✅ Phase 1 complete: ${fetchedCount} vectors retrieved`)
    
    // Strategy 2: If we have more vectors, use multiple targeted queries
    if (expectedVectorCount > fetchedCount && fetchedCount === maxPerQuery) {
      console.log(`🔄 Phase 2: Additional queries needed...`)
      
      // Get list of already fetched IDs to avoid duplicates
      const fetchedIds = new Set(allVectors.map(v => v.id))
      
      // Use different dummy vectors to try to get different results
      const dummyVectors = [
        new Array(1024).fill(0.1),
        new Array(1024).fill(0.5),
        new Array(1024).fill(-0.1),
        new Array(1024).fill(1.0),
        // Create some random vectors
        Array.from({length: 1024}, () => Math.random() - 0.5),
        Array.from({length: 1024}, () => Math.random() * 2 - 1),
      ]
      
      for (let i = 0; i < dummyVectors.length && fetchedCount < expectedVectorCount; i++) {
        console.log(`   🔍 Additional query ${i + 1}/${dummyVectors.length}...`)
        
        const additionalQuery = await index.namespace(namespace).query({
          vector: dummyVectors[i],
          topK: maxPerQuery,
          includeMetadata: true,
          includeValues: true
        })
        
        const newVectors = (additionalQuery.matches || []).filter(v => !fetchedIds.has(v.id))
        
        if (newVectors.length > 0) {
          allVectors.push(...newVectors)
          newVectors.forEach(v => fetchedIds.add(v.id))
          fetchedCount = allVectors.length
          console.log(`     ✅ Found ${newVectors.length} new vectors (total: ${fetchedCount})`)
        } else {
          console.log(`     ➡️  No new vectors found`)
        }
        
        // Small delay between queries
        await new Promise(resolve => setTimeout(resolve, 500))
      }
    }
    
    // Strategy 3: If still missing vectors, try filtering by metadata
    if (expectedVectorCount > fetchedCount) {
      console.log(`🔄 Phase 3: Metadata-based queries...`)
      
      // Try filtering by document IDs if we can identify patterns
      const fetchedIds = new Set(allVectors.map(v => v.id))
      
      // Get unique document IDs from existing vectors
      const documentIds = [...new Set(allVectors.map(v => v.metadata?.documentId).filter(Boolean))]
      
      console.log(`   📄 Found ${documentIds.length} unique document IDs in fetched data`)
      
      for (const docId of documentIds) {
        if (fetchedCount >= expectedVectorCount) break
        
        console.log(`   🔍 Querying document: ${docId}...`)
        
        try {
          const docQuery = await index.namespace(namespace).query({
            vector: new Array(1024).fill(0),
            topK: maxPerQuery,
            filter: { documentId: { $eq: docId } },
            includeMetadata: true,
            includeValues: true
          })
          
          const newVectors = (docQuery.matches || []).filter(v => !fetchedIds.has(v.id))
          
          if (newVectors.length > 0) {
            allVectors.push(...newVectors)
            newVectors.forEach(v => fetchedIds.add(v.id))
            fetchedCount = allVectors.length
            console.log(`     ✅ Found ${newVectors.length} new vectors (total: ${fetchedCount})`)
          }
        } catch (error) {
          console.log(`     ⚠️  Query failed for ${docId}: ${error.message}`)
        }
        
        await new Promise(resolve => setTimeout(resolve, 200))
      }
    }
    
    console.log(`\n📊 Final Results:`)
    console.log(`   Expected: ${expectedVectorCount} vectors`)
    console.log(`   Retrieved: ${fetchedCount} vectors`)
    console.log(`   Coverage: ${((fetchedCount / expectedVectorCount) * 100).toFixed(1)}%`)
    
    if (fetchedCount < expectedVectorCount) {
      console.log(`\n⚠️  Warning: Could not retrieve all vectors due to Pinecone limitations`)
      console.log(`   Missing: ${expectedVectorCount - fetchedCount} vectors`)
      console.log(`   This is a known limitation when backing up large Pinecone indexes`)
    }
    
    // Create backup directory
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
        expectedVectorsInNamespace: expectedVectorCount,
        vectorsBackedUp: fetchedCount,
        coveragePercentage: ((fetchedCount / expectedVectorCount) * 100).toFixed(1),
        backupVersion: '2.0-large',
        backupStrategy: 'multi-query'
      },
      vectors: allVectors.map(vector => ({
        id: vector.id,
        values: vector.values,
        metadata: vector.metadata
      }))
    }
    
    // Create filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filename = `pinecone-backup-large-${indexName}-${namespace}-${timestamp}.json`
    const filepath = path.join(backupDir, filename)
    
    // Write backup to file
    console.log('💾 Writing backup to file...')
    fs.writeFileSync(filepath, JSON.stringify(backup, null, 2))
    
    // Calculate file size
    const stats_file = fs.statSync(filepath)
    const fileSizeMB = (stats_file.size / (1024 * 1024)).toFixed(2)
    
    console.log(`\n🎉 Backup completed!`)
    console.log(`📁 File: ${filepath}`)
    console.log(`📊 Vectors backed up: ${backup.vectors.length}`)
    console.log(`📈 Coverage: ${backup.metadata.coveragePercentage}%`)
    console.log(`💿 File size: ${fileSizeMB} MB`)
    console.log(`🕐 Timestamp: ${backup.metadata.timestamp}`)
    
    // Create summary
    const summaryFilename = `backup-large-summary-${timestamp}.txt`
    const summaryPath = path.join(backupDir, summaryFilename)
    const summary = `
Enhanced Pinecone Backup Summary
===============================
Date: ${backup.metadata.timestamp}
Index: ${backup.metadata.indexName}
Namespace: ${backup.metadata.namespace}
Dimension: ${backup.metadata.dimension}
Total vectors in index: ${backup.metadata.totalVectorsInIndex}
Expected vectors in namespace: ${backup.metadata.expectedVectorsInNamespace}
Vectors backed up: ${backup.metadata.vectorsBackedUp}
Coverage: ${backup.metadata.coveragePercentage}%
Backup file: ${filename}
File size: ${fileSizeMB} MB
Strategy: ${backup.metadata.backupStrategy}

Status: ${fetchedCount === expectedVectorCount ? 'COMPLETE' : 'PARTIAL'}
${fetchedCount < expectedVectorCount ? 
  `Missing ${expectedVectorCount - fetchedCount} vectors due to Pinecone query limitations.` : ''}

Note: This backup used multiple query strategies to maximize vector retrieval.
For indexes >10K vectors, some vectors may be unreachable due to Pinecone API limitations.
`
    
    fs.writeFileSync(summaryPath, summary)
    console.log(`📋 Summary written to: ${summaryPath}`)
    
    return {
      success: true,
      backupFile: filepath,
      vectorCount: backup.vectors.length,
      expectedCount: expectedVectorCount,
      coverage: parseFloat(backup.metadata.coveragePercentage),
      fileSize: fileSizeMB
    }
    
  } catch (error) {
    console.error('❌ Backup failed:', error)
    throw error
  }
}

// Run the backup
if (import.meta.url === `file://${process.argv[1]}`) {
  backupPineconeLarge()
    .then(result => {
      console.log('\n✅ Enhanced backup process completed!')
      if (result.coverage < 100) {
        console.log(`⚠️  Note: ${result.coverage}% coverage due to Pinecone limitations`)
      }
      process.exit(0)
    })
    .catch(error => {
      console.error('\n❌ Enhanced backup process failed:', error)
      process.exit(1)
    })
}

export { backupPineconeLarge }