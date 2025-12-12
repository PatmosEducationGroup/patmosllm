// Chat utility functions
// Extracted from page.tsx for reusability

/**
 * Ensures a URL has HTTPS protocol
 * @param url - The URL to process
 * @returns URL with https:// prefix
 */
export function ensureHttps(url: string): string {
  if (!url) return url
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url
  }
  return `https://${url}`
}

/**
 * Formats file size in bytes to human-readable format
 * @param bytes - File size in bytes
 * @returns Formatted string (e.g., "1.5 MB")
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

/**
 * Formats a date string for session display
 * @param dateString - ISO date string
 * @returns Formatted date (e.g., "Today", "Yesterday", "Mon, Jan 15")
 */
export function formatSessionDate(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffDays = Math.floor(
    (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)
  )

  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) {
    return date.toLocaleDateString('en-US', { weekday: 'long' })
  }
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric'
  })
}

/**
 * Truncates text to a maximum length with ellipsis
 * @param text - Text to truncate
 * @param maxLength - Maximum length
 * @returns Truncated text
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.substring(0, maxLength - 3) + '...'
}

/**
 * Generates a default session title from the first question
 * @param question - The user's question
 * @returns A truncated title
 */
export function generateSessionTitle(question: string): string {
  return truncateText(question, 50)
}

/**
 * Debounce function for performance optimization
 * @param func - Function to debounce
 * @param wait - Wait time in milliseconds
 * @returns Debounced function
 */
export function debounce<T extends (...args: Parameters<T>) => void>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout)
    timeout = setTimeout(() => func(...args), wait)
  }
}

// =================================================================
// Constants
// =================================================================

export const SWIPE_THRESHOLD = 80 // pixels needed to trigger swipe
export const SIDEBAR_WIDTH = 320 // pixels (w-80 = 20rem = 320px)
export const STREAM_TIMEOUT = 120000 // 2 minutes
export const EMPTY_CHUNK_LIMIT = 100 // max empty chunks before abort
