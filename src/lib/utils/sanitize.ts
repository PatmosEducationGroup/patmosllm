/**
 * Sanitization Utilities
 *
 * Helpers to prevent XSS attacks and validate input data.
 */

/**
 * Sanitize HTML input by escaping special characters
 * Prevents XSS attacks from user-generated or external content
 *
 * @param input String to sanitize
 * @returns Sanitized string with HTML entities escaped
 */
export function sanitizeHtml(input: string): string {
  if (!input) return '';
  return input
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Sanitize and validate URL
 * Only allows http:// and https:// protocols
 *
 * @param input URL to sanitize
 * @returns Sanitized URL or empty string if invalid
 */
export function sanitizeUrl(input: string): string {
  if (!input) return '';
  try {
    const url = new URL(input);
    // Only allow http/https protocols
    if (!['http:', 'https:'].includes(url.protocol)) {
      return '';
    }
    return url.toString();
  } catch {
    return ''; // Invalid URL
  }
}
