// lib/file-security.ts

// File signatures (magic numbers) for validation
const FILE_SIGNATURES: Record<string, number[] | null> = {
  'application/pdf': [0x25, 0x50, 0x44, 0x46], // %PDF
  'application/msword': [0xd0, 0xcf, 0x11, 0xe0], // MS Office
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [0x50, 0x4b, 0x03, 0x04], // ZIP-based (DOCX)
  'text/plain': null, // No specific signature for text files
  'text/markdown': null, // No specific signature for markdown
};

/**
 * Validate that a file buffer matches its declared MIME type by checking magic numbers
 *
 * @param buffer - The file buffer to validate
 * @param mimeType - The declared MIME type
 * @returns True if signature matches or no signature required
 */
export function validateFileSignature(buffer: Buffer | Uint8Array, mimeType: string): boolean {
  const signature = FILE_SIGNATURES[mimeType];

  // If no signature defined, allow it (for text files)
  if (!signature) {
    return true;
  }

  // Check if buffer starts with the expected signature
  for (let i = 0; i < signature.length; i++) {
    if (buffer[i] !== signature[i]) {
      return false;
    }
  }

  return true;
}

/**
 * Validate that a file size is within acceptable limits
 *
 * @param size - The file size in bytes
 * @param maxSize - Maximum allowed size in bytes (default: 50MB)
 * @returns True if size is within limit
 */
export function validateFileSize(size: number, maxSize: number = 50 * 1024 * 1024): boolean {
  return size <= maxSize;
}

/**
 * Sanitize a filename by removing dangerous characters and preventing directory traversal
 *
 * @param filename - The filename to sanitize
 * @returns Sanitized filename, limited to 255 characters
 */
export function validateFileName(filename: string): string {
  // Remove dangerous characters and patterns
  const dangerous = /[<>:"/\\|?*\x00-\x1f]/g;
  const cleaned = filename.replace(dangerous, '_');

  // Prevent directory traversal
  const safe = cleaned.replace(/\.\./g, '_');

  // Limit length
  return safe.slice(0, 255);
}

/**
 * Scan file content for malicious patterns (scripts, code injection attempts)
 *
 * @param buffer - The file buffer to scan
 * @returns False if suspicious patterns detected, true otherwise
 */
export function scanForMaliciousContent(buffer: Buffer | Uint8Array): boolean {
  const content = buffer.toString('utf8', 0, Math.min(buffer.length, 10000));

  // Look for suspicious patterns
  const suspiciousPatterns = [
    /<script/i,
    /javascript:/i,
    /vbscript:/i,
    /on\w+\s*=/i, // onload, onclick, etc.
    /<?php/i,
    /<%/i, // ASP tags
  ];

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(content)) {
      return false;
    }
  }

  return true;
}
