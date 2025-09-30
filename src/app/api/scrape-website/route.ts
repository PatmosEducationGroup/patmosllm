import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase'
import * as cheerio from 'cheerio'
import puppeteer, { Browser } from 'puppeteer'
import robotsParser from 'robots-parser'
import { URL } from 'url'

// Browser pool for efficient Puppeteer reuse
class BrowserPool {
  private browsers: Browser[] = []
  private maxBrowsers = 3
  private currentIndex = 0

  async getBrowser(): Promise<Browser> {
    if (this.browsers.length < this.maxBrowsers) {
      const browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          '--ignore-certificate-errors',
          '--ignore-ssl-errors',
          '--ignore-certificate-errors-spki-list'
        ]
      })
      this.browsers.push(browser)
      console.log(`Created browser instance ${this.browsers.length}/${this.maxBrowsers}`)
      return browser
    }

    // Round-robin reuse
    this.currentIndex = (this.currentIndex + 1) % this.browsers.length
    return this.browsers[this.currentIndex]
  }

  async closeAll() {
    console.log(`Closing ${this.browsers.length} browser instances`)
    await Promise.all(this.browsers.map(b => b.close()))
    this.browsers = []
  }
}

const browserPool = new BrowserPool()

// Request deduplication
const pendingRequests = new Map<string, Promise<unknown>>()
async function deduplicatedFetch<T>(url: string, fetcher: () => Promise<T>): Promise<T> {
  if (pendingRequests.has(url)) {
    return pendingRequests.get(url) as Promise<T>
  }

  const promise = fetcher().finally(() => {
    pendingRequests.delete(url)
  })

  pendingRequests.set(url, promise)
  return promise
}

// Sitemap caching
const sitemapCache = new Map<string, { urls: string[], timestamp: number }>()
const _SITEMAP_CACHE_TTL = 3600000 // 1 hour

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
    return false
  }
}

// Intelligent URL filtering to skip non-content pages
// Minimal URL filtering - allow almost everything on the same domain
function isContentUrl(url: string): boolean {
  try {
    const urlObj = new URL(url)
    const pathname = urlObj.pathname.toLowerCase()
    const search = urlObj.search.toLowerCase()

    // Only skip obvious non-content files and system endpoints
    const skipPatterns = [
      // System/Technical files only
      '/robots.txt', '/sitemap.xml', '/favicon.ico', '/manifest.json',

      // Cloudflare and CDN endpoints
      '/cdn-cgi/', // Cloudflare email protection, cache, etc.

      // Media assets only (not content pages about media)
      '/css/', '/js/', '/fonts/', '/images/', '/img/', '/assets/', '/static/'
    ]

    // Check if URL matches any skip patterns (must be exact matches or start with folder)
    if (skipPatterns.some(pattern => pathname === pattern || pathname.startsWith(pattern))) {
      return false
    }

    // Skip URLs with obvious non-content query parameters only
    const skipParams = [
      'utm_', 'fbclid', 'gclid', 'print=1', 'format=pdf'
    ]

    if (skipParams.some(param => search.includes(param))) {
      return false
    }

    // Skip URLs that look like direct file downloads only
    const fileExtensions = [
      '.css', '.js', '.xml', '.json', '.txt',
      '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
      '.zip', '.rar', '.tar', '.gz', '.7z',
      '.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.ico',
      '.mp3', '.mp4', '.avi', '.mov', '.wmv',
      '.exe', '.dmg', '.pkg', '.deb', '.rpm'
    ]

    if (fileExtensions.some(ext => pathname.endsWith(ext))) {
      return false
    }

    // Allow everything else - including:
    // - admin pages, search, contact, login pages (may have content links)
    // - numbered pages (like /12345.aspx for people groups)
    // - category/tag pages (may contain links to actual content)
    // - any other HTML/ASPX/PHP pages
    console.log(`✓ Allowing URL: ${url}`)
    return true
  } catch (error) {
    return false
  }
}

// Optimized content extraction with single-pass cleanup
function extractMainContent(html: string, url: string): { content: string; title: string } {
  const $ = cheerio.load(html, {
    normalizeWhitespace: true,
    decodeEntities: true
  })

  // Single-pass removal of unwanted elements
  const unwantedSelectors = 'script, style, nav, header, footer, aside, iframe, .nav, .menu, .sidebar, .advertisement, .ads, .social, .comments, [class*="nav"], [class*="menu"], [class*="sidebar"], [class*="ad"], [class*="social"], [class*="comment"], [id*="nav"], [id*="menu"], [id*="sidebar"], [id*="ad"], [id*="social"], [id*="comment"]'
  $(unwantedSelectors).remove()
  
  // Prioritized content selectors for faster extraction (expanded for ASP.NET)
  let content = ''
  const mainSelectors = [
    'article[role="main"]',
    'main article',
    '[role="main"]',
    'article',
    'main',
    '.post-content',
    '.article-content',
    '.entry-content',
    '.content',
    '#content', // Common ASP.NET pattern
    '#main',
    '#main-content',
    '.container',
    '.page-content',
    'article'
  ]
  
  // Try selectors and exit early when substantial content is found
  for (const selector of mainSelectors) {
    const element = $(selector).first()
    if (element.length > 0) {
      content = element.text()
      if (content.length > 200) break // Found substantial content
    }
  }

  // Fallback to body if no main content found
  if (!content || content.length < 200) {
    content = $('body').text()
  }

  // Efficient whitespace normalization
  content = content.replace(/\s+/g, ' ').trim()

  // Extract title efficiently
  const title = $('title').text().trim() || $('h1').first().text().trim() || new URL(url).hostname
  
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
  } catch (error) {
    return true // If error checking robots.txt, assume allowed
  }
}

// Optimized main scraping function using hybrid approach
async function scrapePage(url: string): Promise<{ success: boolean; content?: string; title?: string; error?: string }> {
  try {
    // Check robots.txt
    const robotsAllowed = await checkRobotsTxt(url)
    if (!robotsAllowed) {
      return { success: false, error: 'Blocked by robots.txt' }
    }

    // Use hybrid scraping approach
    const result = await scrapePageWithFallback(url, url)

    // Lower threshold for ASP.NET pages which may have less text
    const minContentLength = url.includes('.aspx') ? 50 : 100
    if (!result.content || result.content.length < minContentLength) {
      return { success: false, error: `Insufficient content found (${result.content?.length || 0} chars)` }
    }

    return {
      success: true,
      content: result.content,
      title: result.title
    }

  } catch (error) {
    return {
      success: false,
      error: 'Scraping failed'
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
  } catch (error) {
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
  } catch (error) {
    return []
  }
}

// Lightweight HTTP + Cheerio scraping function
async function scrapePageLightweight(url: string, baseUrl: string): Promise<{ title: string; content: string; links: string[] } | null> {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000) // 10s timeout for HTTP (ASP.NET sites)

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Heaven.Earth Web Scraper',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'DNT': '1',
        'Connection': 'keep-alive'
      },
      signal: controller.signal,
      redirect: 'follow'
    })

    clearTimeout(timeoutId)

    console.log(`    HTTP Response: ${response.status} ${response.statusText}`)

    if (!response.ok || response.status >= 400) {
      return null
    }

    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('text/html')) {
      console.log(`    ⚠ Wrong content-type: ${contentType}`)
      return null
    }

    const html = await response.text()
    const $ = cheerio.load(html)

    // Remove unwanted elements
    $('script, style, nav, header, footer, aside, .sidebar, .navigation, .menu, .ads, .advertisement').remove()

    // Extract title
    const title = $('title').text().trim() || $('h1').first().text().trim() || 'Untitled'

    // Extract main content with prioritized selectors (expanded for ASP.NET)
    let content = ''
    const contentSelectors = [
      'main',
      '[role="main"]',
      '.main-content',
      '.content',
      '#content', // Common ASP.NET pattern
      '#main',
      '#main-content',
      '.entry-content',
      '.post-content',
      'article',
      '.article',
      '.container',
      '.page-content',
      'body'
    ]

    for (const selector of contentSelectors) {
      const element = $(selector)
      if (element.length > 0) {
        content = element.text().trim()
        if (content.length > 100) break // Lower threshold for ASP.NET pages
      }
    }

    // Extract links
    const links: string[] = []
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href')
      if (href) {
        const absoluteUrl = new URL(href, baseUrl).toString()
        if (isSameDomain(baseUrl, absoluteUrl, true) && isContentUrl(absoluteUrl)) {
          links.push(absoluteUrl)
        }
      }
    })

    // Validate content quality (lower threshold for ASP.NET)
    const minLength = url.includes('.aspx') ? 50 : 100
    if (content.length < minLength || title.length < 3) {
      console.log(`    ⚠ Validation failed: content=${content.length}/${minLength} chars, title="${title.substring(0, 50)}" (${title.length} chars)`)
      return null // Content too short, likely failed
    }

    console.log(`    ✓ Validation passed: content=${content.length} chars, title="${title.substring(0, 50)}"`)

    return {
      title: title.substring(0, 500),
      content: content.substring(0, 50000),
      links: [...new Set(links)] // Remove duplicates
    }
  } catch (error) {
    return null // Lightweight method failed
  }
}

// Enhanced hybrid scraping with multiple fallback strategies
async function scrapePageWithFallback(url: string, baseUrl: string): Promise<{ title: string; content: string; links: string[] }> {
  console.log(`\n🔍 Starting scrape for: ${url}`)

  // Strategy 1: Try lightweight HTTP + Cheerio first
  console.log(`  → Strategy 1: Lightweight HTTP + Cheerio`)
  const lightweightResult = await scrapePageLightweight(url, baseUrl)
  if (lightweightResult) {
    console.log(`  ✓ SUCCESS: Lightweight scrape (${lightweightResult.content.length} chars, ${lightweightResult.links.length} links)`)
    return lightweightResult
  }
  console.log(`  ✗ FAILED: Lightweight method`)

  // Strategy 2: Try Puppeteer with domcontentloaded (fast)
  console.log(`  → Strategy 2: Puppeteer (domcontentloaded, 10s timeout)`)
  try {
    const fastResult = await scrapePageWithPuppeteer(url, baseUrl, 'domcontentloaded', 10000)
    if (fastResult) {
      console.log(`  ✓ SUCCESS: Puppeteer fast (${fastResult.content.length} chars, ${fastResult.links.length} links)`)
      return fastResult
    }
    console.log(`  ✗ FAILED: Puppeteer fast returned null`)
  } catch (error) {
  }

  // Strategy 3: Try Puppeteer with networkidle0 (slower but more complete)
  console.log(`  → Strategy 3: Puppeteer (networkidle0, 20s timeout)`)
  try {
    const completeResult = await scrapePageWithPuppeteer(url, baseUrl, 'networkidle0', 20000)
    if (completeResult) {
      console.log(`  ✓ SUCCESS: Puppeteer complete (${completeResult.content.length} chars, ${completeResult.links.length} links)`)
      return completeResult
    }
    console.log(`  ✗ FAILED: Puppeteer complete returned null`)
  } catch (error) {
  }

  // Strategy 4: Last resort - return minimal data with more context
  console.warn(`⚠ All scraping strategies failed for ${url}, returning minimal data`)
  return {
    title: `Page at ${new URL(url).pathname}`,
    content: 'Content could not be extracted from this page. The page may require authentication, use anti-bot protection, or have an unusual structure.',
    links: [] // Empty links array - this page won't contribute new URLs
  }
}

// Helper function for Puppeteer scraping with configurable wait conditions
async function scrapePageWithPuppeteer(
  url: string,
  baseUrl: string,
  waitUntil: 'domcontentloaded' | 'networkidle0',
  timeout: number
): Promise<{ title: string; content: string; links: string[] } | null> {
  const browser = await browserPool.getBrowser()
  const page = await browser.newPage()

  try {
    await page.setViewport({ width: 1280, height: 720 })
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36')

    const response = await page.goto(url, {
      waitUntil,
      timeout
    })

    if (!response || response.status() >= 400) {
      const status = response?.status() || 'no response'
      console.log(`    ⚠ Puppeteer navigation failed: HTTP ${status}`)
      throw new Error(`HTTP ${status}`)
    }

    console.log(`    Puppeteer navigation successful: HTTP ${response.status()}`)

    // Wait a bit for dynamic content (less for fast mode)
    const waitTime = waitUntil === 'domcontentloaded' ? 500 : 2000
    await new Promise(resolve => setTimeout(resolve, waitTime))

    const result = await page.evaluate((baseUrl) => {
      // Remove unwanted elements
      const unwantedSelectors = ['script', 'style', 'nav', 'header', 'footer', 'aside', '.sidebar', '.navigation', '.menu', '.ads', '.advertisement']
      unwantedSelectors.forEach(selector => {
        document.querySelectorAll(selector).forEach(el => el.remove())
      })

      // Extract title
      const title = document.title.trim() ||
                   document.querySelector('h1')?.textContent?.trim() ||
                   'Untitled'

      // Extract content with prioritized selectors (expanded for ASP.NET sites)
      const contentSelectors = [
        'main', '[role="main"]', '.main-content', '.content',
        '.entry-content', '.post-content', 'article', '.article',
        '#content', '#main', '#main-content', // Common ASP.NET patterns
        '.container', '.page-content',
        'body' // Fallback
      ]
      let content = ''

      for (const selector of contentSelectors) {
        const element = document.querySelector(selector)
        if (element && element.textContent) {
          content = element.textContent.trim()
          if (content.length > 100) break // Lower threshold
        }
      }

      // Extract links more aggressively
      const links: string[] = []
      document.querySelectorAll('a[href]').forEach(link => {
        const href = link.getAttribute('href')
        if (href) {
          try {
            const absoluteUrl = new URL(href, baseUrl).toString()
            links.push(absoluteUrl)
          } catch (error) {
            // Invalid URL, skip
          }
        }
      })

      return { title, content, links }
    }, baseUrl)

    // Filter links to same domain and content URLs
    const filteredLinks = result.links
      .filter(link => {
        try {
          return isSameDomain(baseUrl, link) && isContentUrl(link)
        } catch (error) {
          return false
        }
      })
      .filter((link, index, arr) => arr.indexOf(link) === index) // Remove duplicates

    const finalResult = {
      title: result.title.substring(0, 500),
      content: result.content.substring(0, 50000),
      links: filteredLinks
    }

    return finalResult
  } finally {
    await page.close()
    // For now, close the browser directly - can optimize pooling later
    await browser.close()
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
                } catch (error) {
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
      } catch (error) {
        // Continue to next sitemap URL
        continue
      }
    }
    
    const result = Array.from(allUrls)
    console.log(`Total sitemap discovery: ${foundSitemaps} sitemaps processed, ${result.length} unique URLs found`)
    return result
  } catch (error) {
    return []
  }
}

// Optimized link discovery using hybrid scraping with better error handling
async function findLinksOnPage(url: string): Promise<string[]> {
  try {
    // Use hybrid scraping to get page content and links
    const result = await scrapePageWithFallback(url, url)

    // Enhanced filtering with intelligent content detection and debug logging
    const rawLinks = result.links.length
    const domainFilteredLinks = result.links.filter(link => {
      try {
        return isSameDomain(url, link, true)
      } catch (error) {
        return false
      }
    })

    const contentFilteredLinks = domainFilteredLinks.filter(link => {
      const isContent = isContentUrl(link)
      if (!isContent) {
        console.log(`Filtered out: ${link} (content filter)`)
      }
      return isContent
    })

    // Remove anchor fragments but keep the base URL
    const noAnchorsLinks = contentFilteredLinks.map(link => {
      const anchorIndex = link.indexOf('#')
      return anchorIndex !== -1 ? link.substring(0, anchorIndex) : link
    }).filter(link => link.length > 0) // Remove empty links
    const filteredLinks = noAnchorsLinks.filter((link, index, arr) => arr.indexOf(link) === index) // Remove duplicates

    console.log(`✓ Link discovery for ${url}: ${rawLinks} raw → ${domainFilteredLinks.length} same domain → ${contentFilteredLinks.length} content valid → ${noAnchorsLinks.length} no anchors → ${filteredLinks.length} final`)

    // Debug: Show some of the filtered out links if there's a big difference
    if (contentFilteredLinks.length > 50 && filteredLinks.length < 20) {
      console.log(`🔍 DEBUG: Large link reduction detected. Sample of ${contentFilteredLinks.length} valid links:`)
      contentFilteredLinks.slice(0, 10).forEach((link, i) => {
        console.log(`  ${i+1}. ${link}`)
      })
      console.log(`  ... and ${contentFilteredLinks.length - 10} more links`)

      console.log(`🔍 DEBUG: Final ${filteredLinks.length} unique links after deduplication:`)
      filteredLinks.forEach((link, i) => {
        console.log(`  ${i+1}. ${link}`)
      })
    }

    return filteredLinks

  } catch (error) {
    console.warn(`⚠ Failed to discover links on ${url}, continuing crawl:`, '')
    // Return empty array but don't throw - let crawling continue
    return []
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
  
  const maxTimeoutMs = 600000 // 10 minutes maximum discovery time for comprehensive discovery
  
  console.log(`Starting parallel page discovery from: ${baseUrl} (max ${maxPages} pages, ${maxTimeoutMs/1000}s timeout)`)
  
  // If starting fresh, try to get URLs from sitemap first
  if (discovered.size === 0) {
    try {
      const sitemapUrls = await parseSitemap(baseUrl)
      sitemapUrls.forEach(url => discovered.add(url))
      console.log(`Added ${sitemapUrls.length} URLs from sitemap`)
    } catch (error) {
      console.log('No sitemap found, proceeding with aggressive crawling mode')
    }

    // Always add the base URL to start crawling from
    discovered.add(baseUrl)
    queue.push({ url: baseUrl, depth: 0 })
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
    
    // Minimal delay between batches for optimal performance
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  
  const result = Array.from(discovered)
  const totalTime = (Date.now() - startTime) / 1000
  console.log(`Parallel discovery complete in ${totalTime}s. Found ${result.length} total pages (visited ${visited.size} for crawling)`)
  
  return result
}

export async function POST(_request: NextRequest) {
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
    const body = await _request.json()
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
      } catch (error) {
        return NextResponse.json({ error: 'Invalid URL format. Please use a valid domain like example.com or https://example.com' }, { status: 400 })
      }
      
      console.log(`Starting enhanced discovery for: ${normalizedUrl}`)
      
      // Use enhanced recursive discovery - no page limit, 3 levels deep
      const maxDepth = 5  // Crawl up to 5 levels deep for comprehensive discovery
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
        } catch (error) {
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

        // Minimal delay between requests for optimal performance
        await new Promise(resolve => setTimeout(resolve, 200))
      }

      return NextResponse.json({
        success: true,
        results
      })
    }

    return NextResponse.json({ error: 'Invalid action. Must be "discover" or "scrape"' }, { status: 400 })

  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error', details: '' },
      { status: 500 }
    )
  }
}