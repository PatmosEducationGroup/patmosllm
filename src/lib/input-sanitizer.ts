// lib/input-sanitizer.ts
import DOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';

// Create a DOM environment for server-side sanitization
const window = new JSDOM('').window;
const purify = DOMPurify(window);

/**
 * Sanitize a string input by removing HTML tags and malicious scripts
 *
 * @param input - The string to sanitize
 * @returns Sanitized string with no HTML tags, limited to 10,000 characters
 */
export function sanitizeInput(input: unknown): string {
  if (typeof input !== 'string') {
    return String(input);
  }

  // Remove any HTML tags and malicious scripts
  const sanitized = purify.sanitize(input, {
    ALLOWED_TAGS: [], // No HTML tags allowed
    ALLOWED_ATTR: [] // No attributes allowed
  });

  // Additional cleaning
  return sanitized
    .trim()
    .replace(/\s+/g, ' ') // Replace multiple spaces with single space
    .slice(0, 10000); // Limit length to prevent extremely long inputs
}

/**
 * Recursively sanitize all string values in an object
 *
 * @param obj - The object to sanitize
 * @returns New object with all string values sanitized
 */
export function sanitizeObject<T>(obj: T): T {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      sanitized[key] = sanitizeInput(value);
    } else if (typeof value === 'object') {
      sanitized[key] = sanitizeObject(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized as T;
}
