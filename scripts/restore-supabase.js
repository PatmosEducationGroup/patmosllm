// restore-supabase.js - Restore Supabase database from backup
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

// Initialize Supabase admin client
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function restoreSupabase(backupFilePath, options = {}) {
  const {
    confirmRestore = false,
    tablesToRestore = null, // null means all tables
    clearExistingData = false
  } = options

  try {
    console.log(`🔄 Starting Supabase database restore...`)
    console.log(`📂 Backup file: ${backupFilePath}`)
    console.log(`🌐 Target database: ${process.env.NEXT_PUBLIC_SUPABASE_URL}`)
    
    // Read backup file
    if (!fs.existsSync(backupFilePath)) {
      throw new Error(`Backup file not found: ${backupFilePath}`)
    }

    console.log('📖 Reading backup file...')
    const backupData = JSON.parse(fs.readFileSync(backupFilePath, 'utf8'))

    console.log(`📊 Backup metadata:`)
    console.log(`   Original database: ${backupData.metadata.database_url}`)
    console.log(`   Timestamp: ${backupData.metadata.timestamp}`)
    console.log(`   Total records: ${backupData.metadata.total_records}`)
    console.log(`   Tables available: ${Object.keys(backupData.tables).length}`)

    // Determine which tables to restore
    const availableTables = Object.keys(backupData.tables)
    const tablesToProcess = tablesToRestore ? 
      tablesToRestore.filter(table => availableTables.includes(table)) : 
      availableTables

    console.log(`\n🎯 Tables to restore: ${tablesToProcess.join(', ')}`)

    if (!confirmRestore) {
      console.log('\n⚠️  SAFETY CHECK REQUIRED:')
      console.log('   This will modify your database. To proceed, run with confirmRestore: true')
      console.log('   Example: restoreSupabase(backupFile, { confirmRestore: true })')
      return {
        success: false,
        message: 'Restore cancelled - confirmation required'
      }
    }

    let totalRestored = 0
    const restoreResults = []

    // Restore each table
    for (const tableName of tablesToProcess) {
      console.log(`\n📦 Restoring table: ${tableName}`)
      const tableData = backupData.tables[tableName]
      
      if (!tableData || tableData.length === 0) {
        console.log(`   ⏭️  Skipping ${tableName} - no data to restore`)
        restoreResults.push({
          table: tableName,
          records_restored: 0,
          status: 'skipped',
          message: 'No data in backup'
        })
        continue
      }

      try {
        // Clear existing data if requested
        if (clearExistingData) {
          console.log(`   🗑️  Clearing existing data from ${tableName}...`)
          const { error: deleteError } = await supabaseAdmin
            .from(tableName)
            .delete()
            .neq('id', '') // This will match all records

          if (deleteError) {
            console.log(`   ⚠️  Warning: Could not clear ${tableName}: ${deleteError.message}`)
          }
        }

        // Insert data in batches
        const batchSize = 100 // Smaller batches for inserts
        const totalRecords = tableData.length
        const totalBatches = Math.ceil(totalRecords / batchSize)
        let recordsRestored = 0

        console.log(`   📊 Restoring ${totalRecords} records in ${totalBatches} batches`)

        for (let i = 0; i < totalRecords; i += batchSize) {
          const batch = tableData.slice(i, i + batchSize)
          const batchNumber = Math.floor(i / batchSize) + 1

          console.log(`   📦 Processing batch ${batchNumber}/${totalBatches} (${batch.length} records)`)

          try {
            const { error: insertError } = await supabaseAdmin
              .from(tableName)
              .insert(batch)

            if (insertError) {
              console.error(`   ❌ Batch ${batchNumber} failed:`, insertError.message)
              
              // Try individual inserts for this batch
              console.log(`   🔄 Attempting individual inserts for batch ${batchNumber}...`)
              let individualSuccesses = 0
              
              for (const record of batch) {
                try {
                  const { error: singleError } = await supabaseAdmin
                    .from(tableName)
                    .insert([record])

                  if (!singleError) {
                    individualSuccesses++
                    recordsRestored++
                  }
                } catch (singleErr) {
                  // Skip individual record that fails
                }
              }
              
              console.log(`   ✅ Individual inserts: ${individualSuccesses}/${batch.length} succeeded`)
            } else {
              recordsRestored += batch.length
              console.log(`   ✅ Batch ${batchNumber} completed`)
            }
          } catch (batchError) {
            console.error(`   ❌ Batch ${batchNumber} failed with error:`, batchError.message)
          }

          // Small delay between batches
          if (batchNumber < totalBatches) {
            await new Promise(resolve => setTimeout(resolve, 200))
          }
        }

        totalRestored += recordsRestored
        restoreResults.push({
          table: tableName,
          records_restored: recordsRestored,
          records_available: totalRecords,
          status: recordsRestored === totalRecords ? 'complete' : 'partial'
        })

        console.log(`   ✅ ${tableName}: ${recordsRestored}/${totalRecords} records restored`)

      } catch (tableError) {
        console.error(`   ❌ Failed to restore ${tableName}:`, tableError.message)
        restoreResults.push({
          table: tableName,
          records_restored: 0,
          status: 'failed',
          error: tableError.message
        })
      }
    }

    console.log(`\n🎉 Database restore completed!`)
    console.log(`📊 Total records restored: ${totalRestored}`)
    console.log(`📋 Tables processed: ${restoreResults.length}`)

    // Show summary
    console.log('\n📊 Restore Summary by Table:')
    restoreResults.forEach(result => {
      const status = result.status === 'complete' ? '✅' : 
                     result.status === 'partial' ? '⚠️' : 
                     result.status === 'skipped' ? '⏭️' : '❌'
      const info = result.status === 'failed' ? `Error: ${result.error}` :
                   result.status === 'skipped' ? result.message :
                   `${result.records_restored}${result.records_available ? `/${result.records_available}` : ''} records`
      console.log(`   ${status} ${result.table}: ${info}`)
    })

    return {
      success: true,
      totalRecordsRestored: totalRestored,
      tablesProcessed: restoreResults.length,
      results: restoreResults
    }

  } catch (error) {
    console.error('❌ Database restore failed:', error)
    throw error
  }
}

// Command line interface
async function main() {
  const args = process.argv.slice(2)
  
  if (args.length < 1) {
    console.log(`
Usage: node scripts/restore-supabase.js <backup-file> [options]

Options:
  --confirm     Confirm the restore operation (required for safety)
  --clear       Clear existing data before restore
  --tables      Comma-separated list of specific tables to restore

Examples:
  node scripts/restore-supabase.js backups/supabase-backup-*.json --confirm
  node scripts/restore-supabase.js backups/supabase-backup-*.json --confirm --clear
  node scripts/restore-supabase.js backups/supabase-backup-*.json --confirm --tables users,documents
    `)
    process.exit(1)
  }

  const backupFile = args[0]
  const confirmRestore = args.includes('--confirm')
  const clearExistingData = args.includes('--clear')
  
  let tablesToRestore = null
  const tablesIndex = args.indexOf('--tables')
  if (tablesIndex !== -1 && args[tablesIndex + 1]) {
    tablesToRestore = args[tablesIndex + 1].split(',').map(t => t.trim())
  }

  try {
    const result = await restoreSupabase(backupFile, {
      confirmRestore,
      clearExistingData,
      tablesToRestore
    })

    if (result.success) {
      console.log('\n✅ Database restore process completed successfully!')
      console.log(`📊 Final stats: ${result.totalRecordsRestored} records restored across ${result.tablesProcessed} tables`)
    } else {
      console.log(`\n⚠️  ${result.message}`)
    }
    
    process.exit(0)
  } catch (error) {
    console.error('\n❌ Database restore process failed:', error)
    process.exit(1)
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}

export { restoreSupabase }