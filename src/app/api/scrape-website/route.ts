import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase'
import * as cheerio from 'cheerio'
import puppeteer from 'puppeteer'
import robotsParser from 'robots-parser'
import { URL } from 'url'

// Enhanced helper function to check if URL belongs to same domain
function isSameDomain(originalUrl: string, linkUrl: string, allowSubdomains = true): boolean {
  try {
    const originalParsed = new URL(originalUrl)
    const linkParsed = new URL(linkUrl)
    
    const originalDomain = originalParsed.hostname.toLowerCase()
    const linkDomain = linkParsed.hostname.toLowerCase()
    
    // Handle exact matches first
    if (originalDomain === linkDomain) {
      return true
    }
    
    if (allowSubdomains) {
      // Enhanced subdomain handling for complex cases
      const originalParts = originalDomain.split('.')
      const linkParts = linkDomain.split('.')
      
      // Handle cases like www.example.com vs example.com
      if (originalParts.length >= 2 && linkParts.length >= 2) {
        const originalRoot = originalParts.slice(-2).join('.')
        const linkRoot = linkParts.slice(-2).join('.')
        
        // Allow common subdomain patterns
        if (originalRoot === linkRoot) {
          // Skip common non-content subdomains
          const excludeSubdomains = ['mail', 'ftp', 'smtp', 'pop', 'imap', 'admin', 'cpanel', 'webmail']
          const linkSubdomain = linkParts.length > 2 ? linkParts.slice(0, -2).join('.') : ''
          
          if (excludeSubdomains.includes(linkSubdomain)) {
            return false
          }
          
          return true
        }
      }
    }
    
    return false
  } catch (error) {
    console.error('Domain comparison error:', error)
    return false
  }
}

// Intelligent URL filtering to skip non-content pages
function isContentUrl(url: string): boolean {
  try {
    const urlObj = new URL(url)
    const pathname = urlObj.pathname.toLowerCase()
    const search = urlObj.search.toLowerCase()
    
    // Skip common non-content path patterns
    const skipPatterns = [
      // Authentication & User Management
      '/login', '/logout', '/signin', '/signup', '/register', '/auth',
      '/account', '/profile', '/settings', '/preferences', '/dashboard',
      
      // Administrative & System
      '/admin', '/wp-admin', '/administrator', '/cpanel', '/webmail',
      '/api/', '/rest/', '/graphql', '/webhook', '/callback',
      
      // Commerce & Actions
      '/cart', '/checkout', '/payment', '/subscribe', '/unsubscribe',
      '/download', '/upload', '/submit', '/form', '/search',
      
      // Social & Interactive
      '/share', '/like', '/comment', '/vote', '/rate', '/review',
      '/contact', '/feedback', '/support', '/help/contact',
      
      // Technical & Meta
      '/robots.txt', '/sitemap', '/favicon', '/manifest',
      '/rss', '/feed', '/xml', '/json', '/ping', '/status',
      
      // Media & Assets (additional)
      '/images/', '/img/', '/assets/', '/static/', '/media/',
      '/css/', '/js/', '/fonts/', '/icons/',
      
      // Archive & Category pages that are often duplicative
      '/tag/', '/tags/', '/category/', '/archive/', '/date/',
      
      // Print & Alternative versions
      '/print', '/pdf', '/amp', '/mobile',
      
      // Language & Location redirects
      '/redirect', '/goto', '/link', '/click'
    ]
    
    // Check if URL matches any skip patterns
    if (skipPatterns.some(pattern => pathname.includes(pattern))) {
      return false
    }
    
    // Skip URLs with problematic query parameters
    const skipParams = [
      'utm_', 'fbclid', 'gclid', 'ref=', 'source=', 'campaign=',
      'print=', 'share=', 'download=', 'export=', 'format=pdf',
      'action=', 'do=', 'task=', 'method=', 'mode=search'
    ]
    
    if (skipParams.some(param => search.includes(param))) {
      return false
    }
    
    // Skip URLs with too many path segments (often pagination or deep navigation)
    const pathSegments = pathname.split('/').filter(segment => segment.length > 0)
    if (pathSegments.length > 6) {
      return false
    }
    
    // Skip URLs that look like file downloads
    const fileExtensions = [
      '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
      '.zip', '.rar', '.tar', '.gz', '.7z',
      '.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp',
      '.mp3', '.mp4', '.avi', '.mov', '.wmv',
      '.exe', '.dmg', '.pkg', '.deb', '.rpm'
    ]
    
    if (fileExtensions.some(ext => pathname.endsWith(ext))) {
      return false
    }
    
    // Skip URLs that are likely pagination or sorting
    if (/\/page\/\d+|\/p\d+|\/\d+$|sort=|order=|limit=|offset=/.test(pathname + search)) {
      return false
    }
    
    return true
  } catch (error) {
    // If URL parsing fails, skip it
    return false
  }
}

// Clean and extract main content from HTML
function extractMainContent(html: string, url: string): { content: string; title: string } {
  const $ = cheerio.load(html)
  
  // Remove unwanted elements
  $('script, style, nav, header, footer, aside, .nav, .menu, .sidebar, .advertisement, .ads, .social, .comments, .comment').remove()
  $('[class*="nav"], [class*="menu"], [class*="sidebar"], [class*="ad"], [class*="social"], [class*="comment"]').remove()
  $('[id*="nav"], [id*="menu"], [id*="sidebar"], [id*="ad"], [id*="social"], [id*="comment"]').remove()
  
  // Try to find main content areas (common patterns)
  let content = ''
  const mainSelectors = [
    'main',
    '[role="main"]',
    '.main-content',
    '.content',
    '.post-content',
    '.article-content',
    '.entry-content',
    'article',
    '.page-content'
  ]
  
  for (const selector of mainSelectors) {
    const mainContent = $(selector)
    if (mainContent.length > 0) {
      content = mainContent.text().trim()
      break
    }
  }
  
  // Fallback to body if no main content found
  if (!content) {
    content = $('body').text().trim()
  }
  
  // Clean up content
  content = content
    .replace(/\s+/g, ' ')  // Normalize whitespace
    .replace(/\n\s*\n/g, '\n\n')  // Clean line breaks
    .trim()
  
  // Extract title
  const title = $('title').text().trim() || $('h1').first().text().trim() || url
  
  return { content, title }
}

// Check robots.txt compliance
async function checkRobotsTxt(url: string): Promise<boolean> {
  try {
    const urlObj = new URL(url)
    const robotsUrl = `${urlObj.protocol}//${urlObj.host}/robots.txt`
    
    const response = await fetch(robotsUrl, { 
      headers: { 'User-Agent': 'Heaven.Earth Web Scraper' } 
    })
    
    if (!response.ok) return true // If no robots.txt, assume allowed
    
    const robotsText = await response.text()
    const robots = robotsParser(robotsUrl, robotsText)
    
    return robots.isAllowed(url, 'Heaven.Earth Web Scraper') !== false && robots.isAllowed(url, '*') !== false
  } catch {
    return true // If error checking robots.txt, assume allowed
  }
}

// Main scraping function
async function scrapePage(url: string): Promise<{ success: boolean; content?: string; title?: string; error?: string }> {
  let browser = null
  
  try {
    // Check robots.txt
    const robotsAllowed = await checkRobotsTxt(url)
    if (!robotsAllowed) {
      return { success: false, error: 'Blocked by robots.txt' }
    }
    
    // Launch browser with SSL bypass for problematic sites
    browser = await puppeteer.launch({ 
      headless: true,
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        '--ignore-certificate-errors',
        '--ignore-ssl-errors',
        '--ignore-certificate-errors-spki-list'
      ]
    })
    
    const page = await browser.newPage()
    await page.setUserAgent('Mozilla/5.0 (compatible; Heaven.Earth Web Scraper)')
    
    // Bypass CSP issues
    await page.setBypassCSP(true)
    
    // Navigate to page with improved timeout and fallback strategy
    try {
      await page.goto(url, { waitUntil: 'networkidle0', timeout: 20000 })
    } catch (error) {
      // Fallback: try with domcontentloaded if networkidle0 times out
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 })
      } catch (fallbackError) {
        // Final fallback: try with load event
        try {
          await page.goto(url, { waitUntil: 'load', timeout: 8000 })
        } catch (finalError) {
          throw new Error(`Failed to load page after multiple attempts: ${finalError instanceof Error ? finalError.message : 'Unknown error'}`)
        }
      }
    }
    
    // Get page content
    const html = await page.content()
    const { content, title } = extractMainContent(html, url)
    
    if (!content || content.length < 100) {
      return { success: false, error: 'Insufficient content found' }
    }
    
    return { success: true, content, title }
    
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Scraping failed' 
    }
  } finally {
    if (browser) {
      await browser.close()
    }
  }
}

// Helper function to parse individual sitemap file
async function parseSitemapFile(sitemapUrl: string, baseUrl: string): Promise<string[]> {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 8000)
    
    const response = await fetch(sitemapUrl, { 
      headers: { 'User-Agent': 'Heaven.Earth Web Scraper' },
      signal: controller.signal
    })
    
    clearTimeout(timeoutId)
    
    if (!response.ok) return []
    
    const xml = await response.text()
    const urls: string[] = []
    const urlMatches = xml.match(/<loc>([^<]+)<\/loc>/g)
    
    if (urlMatches) {
      for (const match of urlMatches) {
        const url = match.replace(/<\/?loc>/g, '').trim()
        if (isSameDomain(baseUrl, url, true) && isContentUrl(url)) {
          urls.push(url)
        }
      }
    }
    
    return urls
  } catch (e) {
    return []
  }
}

// Helper function to extract sitemap URLs from robots.txt
async function parseRobotsForSitemaps(baseUrl: string): Promise<string[]> {
  try {
    const origin = new URL(baseUrl).origin
    const robotsUrl = `${origin}/robots.txt`
    
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 8000)
    
    const response = await fetch(robotsUrl, { 
      headers: { 'User-Agent': 'Heaven.Earth Web Scraper' },
      signal: controller.signal
    })
    
    clearTimeout(timeoutId)
    
    if (!response.ok) return []
    
    const robotsText = await response.text()
    const sitemapUrls: string[] = []
    
    // Parse robots.txt for Sitemap: declarations
    const lines = robotsText.split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed.toLowerCase().startsWith('sitemap:')) {
        const sitemapUrl = trimmed.substring(8).trim()
        if (sitemapUrl && (sitemapUrl.startsWith('http://') || sitemapUrl.startsWith('https://'))) {
          sitemapUrls.push(sitemapUrl)
        }
      }
    }
    
    console.log(`Found ${sitemapUrls.length} sitemap references in robots.txt`)
    return sitemapUrls
  } catch (e) {
    return []
  }
}

// Enhanced sitemap parsing with comprehensive sitemap discovery
async function parseSitemap(baseUrl: string): Promise<string[]> {
  try {
    const origin = new URL(baseUrl).origin
    
    // Step 1: Check robots.txt for sitemap references
    const robotsSitemaps = await parseRobotsForSitemaps(baseUrl)
    
    // Step 2: Comprehensive list of common sitemap locations
    const sitemapUrls = [
      ...robotsSitemaps, // Add robots.txt sitemaps first
      `${origin}/sitemap.xml`,
      `${origin}/sitemap_index.xml`,
      `${origin}/sitemap/sitemap.xml`,
      `${origin}/sitemaps/sitemap.xml`,
      `${origin}/sitemap-index.xml`,
      `${origin}/page-sitemap.xml`,
      `${origin}/sitemap-pages.xml`,
      `${origin}/sitemap-posts.xml`,
      `${origin}/post-sitemap.xml`,
      `${origin}/wp-sitemap.xml`,
      `${origin}/sitemap1.xml`,
      `${origin}/xml-sitemap.xml`,
      `${origin}/rss-sitemap.xml`
    ]
    
    // Remove duplicates while preserving order (robots.txt first)
    const uniqueSitemapUrls = Array.from(new Set(sitemapUrls))
    
    const allUrls = new Set<string>()
    
    let foundSitemaps = 0
    
    for (const sitemapUrl of uniqueSitemapUrls) {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 8000)
        
        const response = await fetch(sitemapUrl, { 
          headers: { 'User-Agent': 'Heaven.Earth Web Scraper' },
          signal: controller.signal
        })
        
        clearTimeout(timeoutId)
        
        if (response.ok) {
          foundSitemaps++
          const xml = await response.text()
          
          // Parse both regular URLs and sitemap index files
          const urlMatches = xml.match(/<loc>([^<]+)<\/loc>/g)
          if (urlMatches) {
            let urlsFound = 0
            for (const match of urlMatches) {
              const url = match.replace(/<\/?loc>/g, '').trim()
              
              // If this is a sitemap index, recursively fetch child sitemaps
              if (url.includes('sitemap') && url.endsWith('.xml') && url !== sitemapUrl) {
                try {
                  const childUrls = await parseSitemapFile(url, baseUrl)
                  childUrls.forEach(childUrl => allUrls.add(childUrl))
                } catch (e) {
                  // Continue if child sitemap fails
                }
              } else if (isSameDomain(baseUrl, url, true) && isContentUrl(url)) {
                allUrls.add(url)
                urlsFound++
              }
            }
            console.log(`Found ${urlsFound} URLs in sitemap: ${sitemapUrl}`)
          }
        }
      } catch (e) {
        // Continue to next sitemap URL
        continue
      }
    }
    
    const result = Array.from(allUrls)
    console.log(`Total sitemap discovery: ${foundSitemaps} sitemaps processed, ${result.length} unique URLs found`)
    return result
  } catch (error) {
    console.error('Error parsing sitemap:', error)
    return []
  }
}

// Find all links on a page with enhanced filtering
async function findLinksOnPage(url: string): Promise<string[]> {
  let browser = null
  
  try {
    browser = await puppeteer.launch({ 
      headless: true,
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        '--ignore-certificate-errors',
        '--ignore-ssl-errors',
        '--ignore-certificate-errors-spki-list'
      ]
    })
    
    const page = await browser.newPage()
    await page.setUserAgent('Mozilla/5.0 (compatible; Heaven.Earth Web Scraper)')
    
    // Bypass CSP issues
    await page.setBypassCSP(true)
    
    // Optimized timeout for bulk discovery - prioritize speed over completeness
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 6000 })
    } catch (error) {
      // Single fallback for bulk discovery
      try {
        await page.goto(url, { waitUntil: 'load', timeout: 4000 })
      } catch (fallbackError) {
        throw new Error(`Failed to load page for link discovery: ${fallbackError instanceof Error ? fallbackError.message : 'Unknown error'}`)
      }
    }
    
    // Extract all links with additional context
    const links = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll('a[href]'))
      return anchors
        .map(anchor => {
          const href = (anchor as HTMLAnchorElement).href
          const text = anchor.textContent?.trim() || ''
          return { href, text }
        })
        .filter(link => link.href && link.href !== '#' && !link.href.startsWith('javascript:'))
        .map(link => link.href)
    })
    
    // Enhanced filtering with intelligent content detection
    const filteredLinks = links
      .filter(link => {
        try {
          // Basic domain and content filtering
          return isSameDomain(url, link, true) && isContentUrl(link)
        } catch {
          return false
        }
      })
      .filter(link => !link.includes('#')) // Remove anchors
      .filter((link, index, arr) => arr.indexOf(link) === index) // Remove duplicates
    
    return filteredLinks
    
  } catch (error) {
    console.error('Error finding links on page:', url, error)
    return []
  } finally {
    if (browser) {
      await browser.close()
    }
  }
}

// Simple in-memory checkpoint system for progress tracking
interface DiscoveryCheckpoint {
  baseUrl: string
  discovered: string[]
  visited: string[]
  queue: { url: string, depth: number }[]
  startTime: number
  lastSaveTime: number
  progress: {
    totalFound: number
    timeElapsed: number
    avgPagesPerSecond: number
  }
}

// In-memory checkpoint storage (could be extended to use Redis/database for persistence)
const checkpointStorage = new Map<string, DiscoveryCheckpoint>()

// Save checkpoint progress
function saveCheckpoint(checkpointId: string, checkpoint: DiscoveryCheckpoint): void {
  checkpoint.lastSaveTime = Date.now()
  checkpointStorage.set(checkpointId, checkpoint)
  console.log(`Checkpoint saved: ${checkpoint.discovered.length} pages discovered, ${checkpoint.queue.length} in queue`)
}

// Load checkpoint if exists
function loadCheckpoint(checkpointId: string): DiscoveryCheckpoint | null {
  return checkpointStorage.get(checkpointId) || null
}

// Generate checkpoint ID from base URL
function generateCheckpointId(baseUrl: string): string {
  return `discovery_${Buffer.from(baseUrl).toString('base64').replace(/[/+=]/g, '')}`
}

// Enhanced parallel page discovery with checkpoint/resume system
async function discoverAllPages(
  baseUrl: string, 
  maxDepth: number = 3, 
  maxPages: number = 50,
  resumeFromCheckpoint: boolean = false
): Promise<string[]> {
  const checkpointId = generateCheckpointId(baseUrl)
  
  let discovered = new Set<string>()
  let visited = new Set<string>()
  let queue: { url: string, depth: number }[] = [{ url: baseUrl, depth: 0 }]
  let startTime = Date.now()
  
  // Try to resume from checkpoint if requested
  if (resumeFromCheckpoint) {
    const checkpoint = loadCheckpoint(checkpointId)
    if (checkpoint) {
      discovered = new Set(checkpoint.discovered)
      visited = new Set(checkpoint.visited)
      queue = checkpoint.queue
      startTime = checkpoint.startTime
      console.log(`Resuming discovery from checkpoint: ${discovered.size} pages already found, ${queue.length} URLs in queue`)
    } else {
      console.log('No checkpoint found, starting fresh discovery')
    }
  }
  
  const maxTimeoutMs = 300000 // 5 minutes maximum discovery time
  
  console.log(`Starting parallel page discovery from: ${baseUrl} (max ${maxPages} pages, ${maxTimeoutMs/1000}s timeout)`)
  
  // If starting fresh, try to get URLs from sitemap first
  if (discovered.size === 0) {
    try {
      const sitemapUrls = await parseSitemap(baseUrl)
      sitemapUrls.forEach(url => discovered.add(url))
      console.log(`Added ${sitemapUrls.length} URLs from sitemap`)
    } catch (error) {
      console.log('No sitemap found, proceeding with crawling')
    }
  }
  
  // Parallel crawling with batches - increased for better performance
  const batchSize = 20 // Process 20 pages concurrently for faster discovery
  
  while (queue.length > 0 && discovered.size < maxPages) {
    // Check timeout
    const elapsed = Date.now() - startTime
    if (elapsed > maxTimeoutMs) {
      console.log(`Discovery timeout reached after ${elapsed/1000}s. Found ${discovered.size} pages.`)
      
      // Save checkpoint before timeout exit
      const timeoutCheckpoint: DiscoveryCheckpoint = {
        baseUrl,
        discovered: Array.from(discovered),
        visited: Array.from(visited),
        queue,
        startTime,
        lastSaveTime: Date.now(),
        progress: {
          totalFound: discovered.size,
          timeElapsed: elapsed,
          avgPagesPerSecond: discovered.size / (elapsed / 1000)
        }
      }
      saveCheckpoint(checkpointId, timeoutCheckpoint)
      break
    }
    const currentBatch: { url: string, depth: number }[] = []
    
    // Build batch of URLs to process
    while (currentBatch.length < batchSize && queue.length > 0) {
      const item = queue.shift()!
      
      // Skip if already visited or too deep
      if (!visited.has(item.url) && item.depth <= maxDepth) {
        visited.add(item.url)
        discovered.add(item.url)
        currentBatch.push(item)
      }
    }
    
    if (currentBatch.length === 0) break
    
    const elapsedBatch = (Date.now() - startTime) / 1000
    console.log(`Processing batch of ${currentBatch.length} pages (total found: ${discovered.size}, elapsed: ${elapsedBatch.toFixed(1)}s)`)
    
    // Process batch in parallel
    const batchPromises = currentBatch
      .filter(item => item.depth < maxDepth) // Only crawl if not at max depth
      .map(async (item) => {
        try {
          console.log(`Crawling: ${item.url} (depth: ${item.depth})`)
          const links = await findLinksOnPage(item.url)
          return { links, depth: item.depth }
        } catch (error) {
          console.error(`Error crawling ${item.url}:`, error)
          
          // For SSL errors, try to suggest the correct domain
          if (error instanceof Error && error.message.includes('ERR_CERT_COMMON_NAME_INVALID')) {
            console.log(`SSL certificate issue detected for ${item.url}. This might indicate the wrong domain.`)
          }
          
          return { links: [], depth: item.depth }
        }
      })
    
    // Wait for all batch results
    const batchResults = await Promise.all(batchPromises)
    
    // Add all new links to queue (content filtering already applied in findLinksOnPage)
    for (const { links, depth } of batchResults) {
      for (const link of links) {
        if (!visited.has(link) && !discovered.has(link) && discovered.size < maxPages) {
          queue.push({ url: link, depth: depth + 1 })
        }
      }
    }
    
    // Save checkpoint every 10 batches (200 pages processed)
    const batchCount = Math.floor((discovered.size) / batchSize)
    if (batchCount > 0 && batchCount % 10 === 0) {
      const currentCheckpoint: DiscoveryCheckpoint = {
        baseUrl,
        discovered: Array.from(discovered),
        visited: Array.from(visited),
        queue,
        startTime,
        lastSaveTime: Date.now(),
        progress: {
          totalFound: discovered.size,
          timeElapsed: Date.now() - startTime,
          avgPagesPerSecond: discovered.size / ((Date.now() - startTime) / 1000)
        }
      }
      saveCheckpoint(checkpointId, currentCheckpoint)
    }
    
    // Small delay between batches
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  
  const result = Array.from(discovered)
  const totalTime = (Date.now() - startTime) / 1000
  console.log(`Parallel discovery complete in ${totalTime}s. Found ${result.length} total pages (visited ${visited.size} for crawling)`)
  
  return result
}

export async function POST(request: NextRequest) {
  try {
    // Check authentication and admin permissions
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: user } = await supabaseAdmin
      .from('users')
      .select('role')
      .eq('clerk_id', userId)
      .single()

    if (!user || !['SUPER_ADMIN', 'ADMIN', 'CONTRIBUTOR'].includes(user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Parse request body FIRST
    const body = await request.json()
    const { action, url, urls, resumeFromCheckpoint = false } = body

    console.log('Scraping request:', { action, url, urls })

    // Validate required fields
    if (!action) {
      return NextResponse.json({ error: 'Action is required' }, { status: 400 })
    }

    if (action === 'discover') {
      if (!url) {
        return NextResponse.json({ error: 'URL is required for discover action' }, { status: 400 })
      }
      
      // Normalize URL format - add https:// if missing
      let normalizedUrl = url.trim()
      if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
        normalizedUrl = 'https://' + normalizedUrl
      }
      
      // Validate URL format
      try {
        new URL(normalizedUrl)
      } catch {
        return NextResponse.json({ error: 'Invalid URL format. Please use a valid domain like example.com or https://example.com' }, { status: 400 })
      }
      
      console.log(`Starting enhanced discovery for: ${normalizedUrl}`)
      
      // Use enhanced recursive discovery - no page limit, 3 levels deep
      const maxDepth = 3  // Crawl up to 3 levels deep
      const maxPages = 10000 // Very high limit (effectively no limit)
      
      const allLinks = await discoverAllPages(normalizedUrl, maxDepth, maxPages, resumeFromCheckpoint)
      
      console.log(`Discovery complete. Found ${allLinks.length} pages`)
      
      // Check if there's a saved checkpoint for additional info
      const checkpointId = `discovery_${Buffer.from(normalizedUrl).toString('base64').replace(/[/+=]/g, '')}`
      const checkpoint = checkpointStorage.get(checkpointId)
      
      return NextResponse.json({
        success: true,
        links: allLinks,
        totalFound: allLinks.length,
        discoveryMethod: allLinks.length > 10 ? 'parallel_crawl' : 'single_page',
        crawlDepth: maxDepth,
        maxPages: maxPages,
        resumedFromCheckpoint: resumeFromCheckpoint,
        checkpoint: checkpoint ? {
          hasCheckpoint: true,
          lastSaved: checkpoint.lastSaveTime,
          progress: checkpoint.progress,
          canResume: checkpoint.queue.length > 0
        } : { hasCheckpoint: false },
        performance: {
          foundPages: allLinks.length,
          maxLimit: maxPages,
          limitReached: allLinks.length >= maxPages,
          optimizedForLargeSites: true,
          checkpointSystemEnabled: true
        }
      })
    }
    
    if (action === 'scrape') {
      if (!urls || !Array.isArray(urls)) {
        return NextResponse.json({ error: 'URLs array is required for scraping' }, { status: 400 })
      }

      // Validate each URL format
      for (const targetUrl of urls) {
        try {
          new URL(targetUrl)
        } catch {
          return NextResponse.json({ error: `Invalid URL format: ${targetUrl}` }, { status: 400 })
        }
      }

      const results = []
      
      for (const targetUrl of urls) {
        console.log(`Scraping: ${targetUrl}`)
        const result = await scrapePage(targetUrl)
        results.push({
          url: targetUrl,
          ...result
        })
        
        // Add small delay between requests to be respectful
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
      
      return NextResponse.json({
        success: true,
        results
      })
    }

    return NextResponse.json({ error: 'Invalid action. Must be "discover" or "scrape"' }, { status: 400 })

  } catch (error) {
    console.error('Web scraping error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}