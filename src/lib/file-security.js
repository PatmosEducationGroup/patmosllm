// lib/file-security.js

// File signatures (magic numbers) for validation
const FILE_SIGNATURES = {
  'application/pdf': [0x25, 0x50, 0x44, 0x46], // %PDF
  'application/msword': [0xD0, 0xCF, 0x11, 0xE0], // MS Office
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [0x50, 0x4B, 0x03, 0x04], // ZIP-based (DOCX)
  'text/plain': null, // No specific signature for text files
  'text/markdown': null, // No specific signature for markdown
};

export function validateFileSignature(buffer, mimeType) {
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

export function validateFileSize(size, maxSize = 50 * 1024 * 1024) { // 50MB default
  return size <= maxSize;
}

export function validateFileName(filename) {
  // Remove dangerous characters and patterns
  const dangerous = /[<>:"/\\|?*\x00-\x1f]/g;
  const cleaned = filename.replace(dangerous, '_');
  
  // Prevent directory traversal
  const safe = cleaned.replace(/\.\./g, '_');
  
  // Limit length
  return safe.slice(0, 255);
}

export function scanForMaliciousContent(buffer) {
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