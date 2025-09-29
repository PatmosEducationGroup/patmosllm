const cheerio = require('cheerio');

async function testLinkExtraction() {
  try {
    console.log('Testing PeopleClusterList.aspx link extraction...');

    // Import fetch dynamically
    const fetch = (await import('node-fetch')).default;

    const response = await fetch('https://peoplegroups.org/PeopleClusterList.aspx');
    const html = await response.text();
    const $ = cheerio.load(html);

    // Extract all links
    const allLinks = [];
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      if (href) {
        try {
          const absoluteUrl = new URL(href, 'https://peoplegroups.org/').toString();
          allLinks.push(absoluteUrl);
        } catch (e) {
          // Skip invalid URLs
        }
      }
    });

    console.log('Total links found:', allLinks.length);
    console.log('First 10 links:');
    allLinks.slice(0, 10).forEach((link, i) => console.log(`  ${i+1}. ${link}`));

    // Check for duplicates
    const uniqueLinks = [...new Set(allLinks)];
    console.log('\\nUnique links:', uniqueLinks.length);
    console.log('Duplicates removed:', allLinks.length - uniqueLinks.length);

    // Check same-domain filter
    const sameDomainLinks = uniqueLinks.filter(link => {
      try {
        const url = new URL(link);
        return url.hostname === 'peoplegroups.org';
      } catch {
        return false;
      }
    });
    console.log('Same domain links:', sameDomainLinks.length);

    // Show a sample of unique same-domain links
    console.log('\\nSample unique same-domain links:');
    sameDomainLinks.slice(0, 20).forEach((link, i) => console.log(`  ${i+1}. ${link}`));

  } catch (error) {
    console.error('Error:', error.message);
  }
}

testLinkExtraction();