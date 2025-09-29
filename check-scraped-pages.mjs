import { supabaseAdmin } from './src/lib/supabase.js';

async function checkScrapedPages() {
  try {
    const { data, error } = await supabaseAdmin
      .from('documents')
      .select('id, title, source_url, created_at')
      .eq('source_type', 'web_scraped')
      .ilike('source_url', '%peoplegroups.org%')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error:', error);
      return;
    }

    console.log('🌐 Scraped pages from peoplegroups.org:');
    console.log('=======================================');
    console.log(`Total pages scraped: ${data.length}`);

    if (data.length > 0) {
      console.log('\n📅 Recent scraped pages:');
      data.slice(0, 10).forEach((doc, i) => {
        console.log(`${i + 1}. ${doc.title}`);
        console.log(`   URL: ${doc.source_url}`);
        console.log(`   Date: ${new Date(doc.created_at).toLocaleString()}`);
        console.log();
      });

      console.log('\n📊 Scraping timeline:');
      const oldest = data[data.length - 1];
      const newest = data[0];
      console.log(`First scraped: ${new Date(oldest.created_at).toLocaleString()}`);
      console.log(`Last scraped: ${new Date(newest.created_at).toLocaleString()}`);
    }

    // Check for any ongoing scrape processes
    const { data: processes, error: processError } = await supabaseAdmin
      .from('ingest_jobs')
      .select('*')
      .eq('status', 'processing')
      .order('created_at', { ascending: false })
      .limit(5);

    if (!processError && processes.length > 0) {
      console.log('\n🔄 Active scraping processes:');
      processes.forEach((job, i) => {
        console.log(`${i + 1}. Job ID: ${job.id}`);
        console.log(`   Status: ${job.status}`);
        console.log(`   Started: ${new Date(job.created_at).toLocaleString()}`);
        console.log();
      });
    } else {
      console.log('\n✅ No active scraping processes found');
    }

  } catch (error) {
    console.error('Script error:', error);
  }
}

checkScrapedPages();