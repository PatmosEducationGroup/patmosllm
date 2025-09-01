import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase'
import * as cheerio from 'cheerio'
import puppeteer from 'puppeteer'
import robotsParser from 'robots-parser'
import { URL } from 'url'

// Helper function to check if URL belongs to same domain
function isSameDomain(originalUrl: string, linkUrl: string, allowSubdomains = true): boolean {
  try {
    const originalDomain = new URL(originalUrl).hostname
    const linkDomain = new URL(linkUrl).hostname
    
    if (allowSubdomains) {
      // Allow subdomains: blog.example.com and example.com are considered same
      const originalRoot = originalDomain.split('.').slice(-2).join('.')
      const linkRoot = linkDomain.split('.').slice(-2).join('.')
      return originalRoot === linkRoot
    } else {
      // Strict domain matching
      return originalDomain === linkDomain
    }
  } catch {
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
    
    return robots.isAllowed(url, 'Heaven.Earth Web Scraper') || robots.isAllowed(url, '*')
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
    
    // Launch browser
    browser = await puppeteer.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    })
    
    const page = await browser.newPage()
    await page.setUserAgent('Mozilla/5.0 (compatible; Heaven.Earth Web Scraper)')
    
    // Navigate to page with timeout
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 })
    
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

// Find all links on a page
async function findLinksOnPage(url: string): Promise<string[]> {
  let browser = null
  
  try {
    browser = await puppeteer.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    })
    
    const page = await browser.newPage()
    await page.setUserAgent('Mozilla/5.0 (compatible; Heaven.Earth Web Scraper)')
    
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 })
    
    // Extract all links
    const links = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll('a[href]'))
      return anchors.map(anchor => (anchor as HTMLAnchorElement).href).filter(href => href)
    })
    
    // Filter to same domain and clean
    const filteredLinks = links
      .filter(link => {
        try {
          new URL(link) // Validate URL
          return isSameDomain(url, link, true)
        } catch {
          return false
        }
      })
      .filter((link, index, arr) => arr.indexOf(link) === index) // Remove duplicates
    
    return filteredLinks
    
  } catch (error) {
    console.error('Error finding links:', error)
    return []
  } finally {
    if (browser) {
      await browser.close()
    }
  }
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

    if (!user || !['ADMIN', 'CONTRIBUTOR'].includes(user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Parse request body FIRST
    const body = await request.json()
    const { action, url, urls } = body

    console.log('Scraping request:', { action, url, urls })

    // Validate required fields
    if (!action) {
      return NextResponse.json({ error: 'Action is required' }, { status: 400 })
    }

    if (action === 'discover') {
      if (!url) {
        return NextResponse.json({ error: 'URL is required for discover action' }, { status: 400 })
      }
      
      // Validate URL format
      try {
        new URL(url)
      } catch {
        return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 })
      }

      // Just find all links on the domain for preview
      const links = await findLinksOnPage(url)
      const allLinks = new Set([url, ...links])
      
      // Limit to reasonable number for preview
      const limitedLinks = Array.from(allLinks).slice(0, 50)
      
      return NextResponse.json({
        success: true,
        links: limitedLinks,
        totalFound: allLinks.size
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