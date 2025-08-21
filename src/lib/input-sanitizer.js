// lib/input-sanitizer.js
import DOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';

// Create a DOM environment for server-side sanitization
const window = new JSDOM('').window;
const purify = DOMPurify(window);

export function sanitizeInput(input) {
  if (typeof input !== 'string') {
    return input;
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

export function sanitizeObject(obj) {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }
  
  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      sanitized[key] = sanitizeInput(value);
    } else if (typeof value === 'object') {
      sanitized[key] = sanitizeObject(value);
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
}