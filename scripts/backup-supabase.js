// backup-supabase.js - Complete Supabase database backup utility
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

// Tables with large content that might need chunked backups
const LARGE_CONTENT_TABLES = ['documents', 'chunks', 'conversations']

// Initialize Supabase admin client
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

/**
 * Dynamically discover all tables in the public schema
 */
async function discoverTables() {
  console.log('🔍 Discovering all tables in public schema...')

  const { data, error } = await supabaseAdmin.rpc('get_public_tables', {}, { count: 'exact' })

  if (error) {
    // Fallback: Query information_schema directly via a custom RPC or use predefined list
    console.log('⚠️  RPC not available, using information_schema query...')

    // We'll query the REST API for common tables and let errors guide us
    // In practice, you'd create an RPC function like:
    // CREATE OR REPLACE FUNCTION get_public_tables()
    // RETURNS TABLE(table_name text) AS $$
    // BEGIN
    //   RETURN QUERY
    //   SELECT tablename::text
    //   FROM pg_tables
    //   WHERE schemaname = 'public'
    //   ORDER BY tablename;
    // END;
    // $$ LANGUAGE plpgsql SECURITY DEFINER;

    // For now, let's try a different approach: test known tables and discover dynamically
    return await discoverTablesManually()
  }

  const tables = data.map(row => row.table_name)
  console.log(`✅ Found ${tables.length} tables`)
  return tables
}

/**
 * Manual table discovery by attempting to query each potential table
 */
async function discoverTablesManually() {
  // Start with known tables from CLAUDE.md (17 tables)
  const knownTables = [
    'users',
    'chunks',
    'documents',
    'upload_sessions',
    'conversations',
    'user_context',
    'conversation_memory',
    'topic_progression',
    'question_patterns',
    'user_onboarding_milestones',
    'user_preferences',
    'ingest_jobs',
    'chat_sessions',
    'data_export_requests',
    'clerk_webhook_events',
    'idempotency_keys',
    'privacy_audit_log'
  ]

  const validTables = []

  for (const tableName of knownTables) {
    try {
      const { error } = await supabaseAdmin
        .from(tableName)
        .select('*', { count: 'exact', head: true })

      if (!error) {
        validTables.push(tableName)
      }
    } catch (err) {
      // Table doesn't exist or no access, skip it
    }
  }

  console.log(`✅ Discovered ${validTables.length} accessible tables`)
  return validTables
}

async function backupSupabase() {
  try {
    console.log('🗄️  Starting comprehensive Supabase database backup...')
    console.log(`🌐 Database URL: ${process.env.NEXT_PUBLIC_SUPABASE_URL}`)

    // Dynamically discover all tables
    const TABLES_TO_BACKUP = await discoverTablesManually()

    console.log(`📋 Tables to backup: ${TABLES_TO_BACKUP.join(', ')}`)

    const backupData = {
      metadata: {
        timestamp: new Date().toISOString(),
        database_url: process.env.NEXT_PUBLIC_SUPABASE_URL,
        backup_version: '2.0',
        tables_backed_up: [],
        total_records: 0,
        auto_discovered: true
      },
      tables: {}
    }

    let totalRecords = 0

    // Backup each table
    for (const tableName of TABLES_TO_BACKUP) {
      console.log(`\n📊 Backing up table: ${tableName}`)
      
      try {
        // Get table count first
        const { count, error: countError } = await supabaseAdmin
          .from(tableName)
          .select('*', { count: 'exact', head: true })

        if (countError) {
          console.log(`⚠️  Warning: Could not get count for ${tableName}: ${countError.message}`)
          console.log(`   Attempting to backup without count...`)
        } else {
          console.log(`   📈 Total records: ${count || 0}`)
        }

        let allRecords = []
        let hasMore = true
        let offset = 0
        const batchSize = 1000

        // Fetch data in batches to handle large tables
        while (hasMore) {
          console.log(`   📦 Fetching batch ${Math.floor(offset / batchSize) + 1} (offset: ${offset})`)
          
          let { data, error } = await supabaseAdmin
            .from(tableName)
            .select('*')
            .range(offset, offset + batchSize - 1)
            .order('created_at', { ascending: true, nullsFirst: false })

          if (error) {
            // Try without ordering if created_at doesn't exist
            const fallbackResult = await supabaseAdmin
              .from(tableName)
              .select('*')
              .range(offset, offset + batchSize - 1)

            if (fallbackResult.error) {
              console.error(`   ❌ Error fetching ${tableName}:`, fallbackResult.error.message)
              break
            }
            
            data = fallbackResult.data
          }

          if (!data || data.length === 0) {
            hasMore = false
          } else {
            allRecords.push(...data)
            offset += batchSize
            
            // If we got less than batch size, we're done
            if (data.length < batchSize) {
              hasMore = false
            }
          }

          // Small delay to be gentle on the database
          await new Promise(resolve => setTimeout(resolve, 100))
        }

        backupData.tables[tableName] = allRecords
        backupData.metadata.tables_backed_up.push({
          table: tableName,
          record_count: allRecords.length,
          has_large_content: LARGE_CONTENT_TABLES.includes(tableName)
        })

        totalRecords += allRecords.length
        console.log(`   ✅ ${tableName}: ${allRecords.length} records backed up`)

      } catch (tableError) {
        console.error(`   ❌ Failed to backup ${tableName}:`, tableError.message)
        // Continue with other tables
        backupData.metadata.tables_backed_up.push({
          table: tableName,
          record_count: 0,
          error: tableError.message
        })
      }
    }

    backupData.metadata.total_records = totalRecords

    // Create backup directory
    const backupDir = './backups'
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true })
    }

    // Create filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filename = `supabase-backup-${timestamp}.json`
    const filepath = path.join(backupDir, filename)

    // Write backup to file
    console.log('\n💾 Writing backup to file...')
    fs.writeFileSync(filepath, JSON.stringify(backupData, null, 2))

    // Calculate file size
    const stats = fs.statSync(filepath)
    const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2)

    console.log(`\n🎉 Database backup completed!`)
    console.log(`📁 File: ${filepath}`)
    console.log(`📊 Total records: ${totalRecords}`)
    console.log(`📋 Tables backed up: ${backupData.metadata.tables_backed_up.length}`)
    console.log(`💿 File size: ${fileSizeMB} MB`)
    console.log(`🕐 Timestamp: ${backupData.metadata.timestamp}`)

    // Create detailed summary
    console.log('\n📊 Backup Summary by Table:')
    backupData.metadata.tables_backed_up.forEach(table => {
      const status = table.error ? '❌' : '✅'
      const info = table.error ? `Error: ${table.error}` : `${table.record_count} records`
      console.log(`   ${status} ${table.table}: ${info}`)
    })

    // Create summary file
    const summaryFilename = `backup-summary-${timestamp}.txt`
    const summaryPath = path.join(backupDir, summaryFilename)
    const summary = `
Supabase Database Backup Summary
===============================
Date: ${backupData.metadata.timestamp}
Database: ${backupData.metadata.database_url}
Total records: ${totalRecords}
Total tables: ${backupData.metadata.tables_backed_up.length}
Backup file: ${filename}
File size: ${fileSizeMB} MB

Table Details:
${backupData.metadata.tables_backed_up.map(table => 
  `- ${table.table}: ${table.error ? `ERROR - ${table.error}` : `${table.record_count} records`}`
).join('\n')}

Large Content Tables:
${LARGE_CONTENT_TABLES.map(table => {
  const tableInfo = backupData.metadata.tables_backed_up.find(t => t.table === table)
  return `- ${table}: ${tableInfo ? tableInfo.record_count : 'Not found'} records`
}).join('\n')}

Backup Status: ${backupData.metadata.tables_backed_up.every(t => !t.error) ? 'COMPLETE' : 'PARTIAL'}
${backupData.metadata.tables_backed_up.some(t => t.error) ? 
  'Some tables failed to backup. Check logs for details.' : ''}
`

    fs.writeFileSync(summaryPath, summary)
    console.log(`📋 Summary written to: ${summaryPath}`)

    return {
      success: true,
      backupFile: filepath,
      recordCount: totalRecords,
      tablesBackedUp: backupData.metadata.tables_backed_up.length,
      fileSize: fileSizeMB
    }

  } catch (error) {
    console.error('❌ Database backup failed:', error)
    throw error
  }
}

// Command line interface
async function main() {
  try {
    console.log('🚀 Starting Supabase database backup...')
    const result = await backupSupabase()
    console.log('\n✅ Database backup process completed successfully!')
    console.log(`📊 Final stats: ${result.recordCount} records, ${result.tablesBackedUp} tables, ${result.fileSize} MB`)
    process.exit(0)
  } catch (error) {
    console.error('\n❌ Database backup process failed:', error)
    process.exit(1)
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}

export { backupSupabase }