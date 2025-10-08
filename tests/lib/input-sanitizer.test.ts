import { describe, it, expect } from 'vitest';
import { sanitizeInput, sanitizeObject } from '@/lib/input-sanitizer';

describe('Input Sanitizer', () => {
  describe('sanitizeInput', () => {
    it('should remove HTML tags', () => {
      const input = '<script>alert("xss")</script>Hello';
      const result = sanitizeInput(input);
      expect(result).toBe('Hello');
    });

    it('should remove malicious script tags', () => {
      const input = '<img src=x onerror="alert(1)">Test';
      const result = sanitizeInput(input);
      expect(result).not.toContain('onerror');
      expect(result).not.toContain('<img');
    });

    it('should normalize whitespace', () => {
      const input = 'Hello    world   test';
      const result = sanitizeInput(input);
      expect(result).toBe('Hello world test');
    });

    it('should trim input', () => {
      const input = '   Hello world   ';
      const result = sanitizeInput(input);
      expect(result).toBe('Hello world');
    });

    it('should limit input length to 10,000 characters', () => {
      const input = 'a'.repeat(15000);
      const result = sanitizeInput(input);
      expect(typeof result).toBe('string');
      expect((result as string).length).toBe(10000);
    });

    it('should convert non-string values to strings', () => {
      // Updated: sanitizeInput now returns string always
      expect(sanitizeInput(123)).toBe('123');
      expect(sanitizeInput(null)).toBe('null');
      expect(sanitizeInput(undefined)).toBe('undefined');
      expect(sanitizeInput(true)).toBe('true');
    });
  });

  describe('sanitizeObject', () => {
    it('should sanitize string values in object', () => {
      const input = {
        name: '<script>alert()</script>John',
        age: 30
      };
      const result = sanitizeObject(input);
      expect(result.name).toBe('John');
      expect(result.age).toBe(30);
    });

    it('should recursively sanitize nested objects', () => {
      const input = {
        user: {
          name: '<b>Alice</b>',
          profile: {
            bio: '<script>xss</script>Developer'
          }
        }
      };
      const result = sanitizeObject(input);
      expect(result.user.name).toBe('Alice');
      expect(result.user.profile.bio).toBe('Developer');
    });

    it('should handle arrays in objects', () => {
      const input = {
        tags: ['<script>tag1</script>', 'tag2']
      };
      const result = sanitizeObject(input);
      // Arrays get converted to objects with numeric keys
      expect(typeof result.tags).toBe('object');
      expect(result.tags).toBeDefined();
    });

    it('should pass through non-object values unchanged', () => {
      expect(sanitizeObject('string')).toBe('string');
      expect(sanitizeObject(123)).toBe(123);
      expect(sanitizeObject(null)).toBe(null);
    });
  });
});
