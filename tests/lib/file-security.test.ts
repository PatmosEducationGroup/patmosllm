import { describe, it, expect } from 'vitest';
import {
  validateFileSignature,
  validateFileSize,
  validateFileName,
  scanForMaliciousContent
} from '@/lib/file-security';

describe('File Security', () => {
  describe('validateFileSignature', () => {
    it('should validate PDF signature', () => {
      const pdfBuffer = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-
      const result = validateFileSignature(pdfBuffer, 'application/pdf');
      expect(result).toBe(true);
    });

    it('should reject invalid PDF signature', () => {
      const invalidBuffer = Buffer.from([0x00, 0x00, 0x00, 0x00]);
      const result = validateFileSignature(invalidBuffer, 'application/pdf');
      expect(result).toBe(false);
    });

    it('should validate MS Office signature', () => {
      const officeBuffer = Buffer.from([0xd0, 0xcf, 0x11, 0xe0]);
      const result = validateFileSignature(officeBuffer, 'application/msword');
      expect(result).toBe(true);
    });

    it('should allow text files without signature', () => {
      const textBuffer = Buffer.from('Hello world');
      const result = validateFileSignature(textBuffer, 'text/plain');
      expect(result).toBe(true);
    });

    it('should allow markdown files without signature', () => {
      const mdBuffer = Buffer.from('# Markdown');
      const result = validateFileSignature(mdBuffer, 'text/markdown');
      expect(result).toBe(true);
    });
  });

  describe('validateFileSize', () => {
    it('should allow files within size limit', () => {
      const size = 10 * 1024 * 1024; // 10MB
      const result = validateFileSize(size);
      expect(result).toBe(true);
    });

    it('should reject files exceeding default 50MB limit', () => {
      const size = 51 * 1024 * 1024; // 51MB
      const result = validateFileSize(size);
      expect(result).toBe(false);
    });

    it('should accept files at exact limit', () => {
      const size = 50 * 1024 * 1024; // 50MB exactly
      const result = validateFileSize(size);
      expect(result).toBe(true);
    });

    it('should respect custom size limit', () => {
      const size = 15 * 1024 * 1024; // 15MB
      const customLimit = 10 * 1024 * 1024; // 10MB limit
      const result = validateFileSize(size, customLimit);
      expect(result).toBe(false);
    });
  });

  describe('validateFileName', () => {
    it('should remove dangerous characters', () => {
      const dangerous = 'file<>:"/\\|?*.txt';
      const result = validateFileName(dangerous);
      expect(result).not.toContain('<');
      expect(result).not.toContain('>');
      expect(result).not.toContain(':');
      expect(result).not.toContain('"');
      expect(result).not.toContain('/');
      expect(result).not.toContain('\\');
      expect(result).not.toContain('|');
      expect(result).not.toContain('?');
      expect(result).not.toContain('*');
    });

    it('should prevent directory traversal', () => {
      const traversal = '../../../etc/passwd';
      const result = validateFileName(traversal);
      expect(result).not.toContain('..');
    });

    it('should limit filename length to 255 characters', () => {
      const longName = 'a'.repeat(300) + '.txt';
      const result = validateFileName(longName);
      expect(result.length).toBe(255);
    });

    it('should allow safe filenames', () => {
      const safe = 'document-2024_final.pdf';
      const result = validateFileName(safe);
      expect(result).toBe(safe);
    });
  });

  describe('scanForMaliciousContent', () => {
    it('should detect script tags', () => {
      const malicious = Buffer.from('<script>alert("xss")</script>');
      const result = scanForMaliciousContent(malicious);
      expect(result).toBe(false);
    });

    it('should detect javascript: protocol', () => {
      const malicious = Buffer.from('<a href="javascript:alert(1)">Click</a>');
      const result = scanForMaliciousContent(malicious);
      expect(result).toBe(false);
    });

    it('should detect vbscript: protocol', () => {
      const malicious = Buffer.from('vbscript:msgbox("xss")');
      const result = scanForMaliciousContent(malicious);
      expect(result).toBe(false);
    });

    it('should detect event handlers', () => {
      const malicious = Buffer.from('<img onerror="alert(1)">');
      const result = scanForMaliciousContent(malicious);
      expect(result).toBe(false);
    });

    it('should detect PHP tags', () => {
      const malicious = Buffer.from('<?php system($_GET["cmd"]); ?>');
      const result = scanForMaliciousContent(malicious);
      expect(result).toBe(false);
    });

    it('should detect ASP tags', () => {
      const malicious = Buffer.from('<% Response.Write("xss") %>');
      const result = scanForMaliciousContent(malicious);
      expect(result).toBe(false);
    });

    it('should allow safe content', () => {
      const safe = Buffer.from('This is a normal document with safe content.');
      const result = scanForMaliciousContent(safe);
      expect(result).toBe(true);
    });
  });
});
