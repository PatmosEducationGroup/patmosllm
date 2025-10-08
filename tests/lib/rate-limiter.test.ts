import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRateLimit } from '@/lib/rate-limiter';

describe('Rate Limiter', () => {
  beforeEach(() => {
    // Reset environment variables for each test
    vi.unstubAllEnvs();
  });

  describe('createRateLimit', () => {
    it('should allow requests within rate limit', () => {
      const rateLimit = createRateLimit({ windowMs: 60000, max: 3 });

      const result1 = rateLimit('test-user');
      const result2 = rateLimit('test-user');
      const result3 = rateLimit('test-user');

      expect(result1.success).toBe(true);
      expect(result1.remaining).toBe(2);
      expect(result2.success).toBe(true);
      expect(result2.remaining).toBe(1);
      expect(result3.success).toBe(true);
      expect(result3.remaining).toBe(0);
    });

    it('should block requests exceeding rate limit', () => {
      const rateLimit = createRateLimit({ windowMs: 60000, max: 2 });

      rateLimit('test-user');
      rateLimit('test-user');
      const result = rateLimit('test-user');

      expect(result.success).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.message).toBeDefined();
      expect(result.resetTime).toBeDefined();
    });

    it('should track different identifiers separately', () => {
      const rateLimit = createRateLimit({ windowMs: 60000, max: 2 });

      const user1Result1 = rateLimit('user-1');
      const user1Result2 = rateLimit('user-1');
      const user2Result1 = rateLimit('user-2');

      expect(user1Result1.success).toBe(true);
      expect(user1Result2.success).toBe(true);
      expect(user2Result1.success).toBe(true);
      expect(user2Result1.remaining).toBe(1); // user-2 is separate
    });

    it('should respect exempt users from options', () => {
      const rateLimit = createRateLimit({
        windowMs: 60000,
        max: 1,
        exemptUsers: ['admin-user']
      });

      // Regular user gets limited
      rateLimit('regular-user');
      const regularResult = rateLimit('regular-user');
      expect(regularResult.success).toBe(false);

      // Admin user never gets limited
      const adminResult1 = rateLimit('admin-user');
      const adminResult2 = rateLimit('admin-user');
      const adminResult3 = rateLimit('admin-user');

      expect(adminResult1.success).toBe(true);
      expect(adminResult2.success).toBe(true);
      expect(adminResult3.success).toBe(true);
    });

    it('should load exempt users from RATE_LIMIT_EXEMPT_USERS env var', () => {
      vi.stubEnv('RATE_LIMIT_EXEMPT_USERS', 'env-admin-1,env-admin-2');

      const rateLimit = createRateLimit({ windowMs: 60000, max: 1 });

      // Regular user gets limited
      rateLimit('regular-user');
      const regularResult = rateLimit('regular-user');
      expect(regularResult.success).toBe(false);

      // Env exempt users never get limited
      const envAdmin1Result = rateLimit('env-admin-1');
      const envAdmin2Result = rateLimit('env-admin-2');

      expect(envAdmin1Result.success).toBe(true);
      expect(envAdmin2Result.success).toBe(true);
    });

    it('should merge exempt users from options and env var', () => {
      vi.stubEnv('RATE_LIMIT_EXEMPT_USERS', 'env-admin');

      const rateLimit = createRateLimit({
        windowMs: 60000,
        max: 1,
        exemptUsers: ['option-admin']
      });

      rateLimit('regular-user');
      const regularResult = rateLimit('regular-user');
      expect(regularResult.success).toBe(false);

      const optionAdminResult = rateLimit('option-admin');
      const envAdminResult = rateLimit('env-admin');

      expect(optionAdminResult.success).toBe(true);
      expect(envAdminResult.success).toBe(true);
    });

    it('should use custom message when provided', () => {
      const customMessage = 'Custom rate limit message';
      const rateLimit = createRateLimit({
        windowMs: 60000,
        max: 1,
        message: customMessage
      });

      rateLimit('test-user');
      const result = rateLimit('test-user');

      expect(result.message).toBe(customMessage);
    });

    it('should provide resetTime in ISO format', () => {
      const rateLimit = createRateLimit({ windowMs: 60000, max: 1 });

      rateLimit('test-user');
      const result = rateLimit('test-user');

      expect(result.resetTime).toBeDefined();
      expect(() => new Date(result.resetTime!)).not.toThrow();

      const resetDate = new Date(result.resetTime!);
      expect(resetDate.getTime()).toBeGreaterThan(Date.now());
    });
  });
});
