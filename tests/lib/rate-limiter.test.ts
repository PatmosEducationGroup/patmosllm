import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRateLimit } from '@/lib/rate-limiter';

describe('Rate Limiter', () => {
  beforeEach(() => {
    // Reset environment variables for each test
    vi.unstubAllEnvs();
  });

  describe('createRateLimit', () => {
    it('should allow requests within rate limit', async () => {
      const rateLimit = createRateLimit({ windowMs: 60000, max: 3 });

      const result1 = await rateLimit('test-user');
      const result2 = await rateLimit('test-user');
      const result3 = await rateLimit('test-user');

      expect(result1.success).toBe(true);
      expect(result1.remaining).toBe(2);
      expect(result2.success).toBe(true);
      expect(result2.remaining).toBe(1);
      expect(result3.success).toBe(true);
      expect(result3.remaining).toBe(0);
    });

    it('should block requests exceeding rate limit', async () => {
      const rateLimit = createRateLimit({ windowMs: 60000, max: 2 });

      await rateLimit('test-user');
      await rateLimit('test-user');
      const result = await rateLimit('test-user');

      expect(result.success).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.message).toBeDefined();
      expect(result.resetTime).toBeDefined();
    });

    it('should track different identifiers separately', async () => {
      const rateLimit = createRateLimit({ windowMs: 60000, max: 2 });

      const user1Result1 = await rateLimit('user-1');
      const user1Result2 = await rateLimit('user-1');
      const user2Result1 = await rateLimit('user-2');

      expect(user1Result1.success).toBe(true);
      expect(user1Result2.success).toBe(true);
      expect(user2Result1.success).toBe(true);
      expect(user2Result1.remaining).toBe(1); // user-2 is separate
    });

    it('should respect exempt users from options', async () => {
      const rateLimit = createRateLimit({
        windowMs: 60000,
        max: 1,
        exemptUsers: ['admin-user']
      });

      // Regular user gets limited
      await rateLimit('regular-user');
      const regularResult = await rateLimit('regular-user');
      expect(regularResult.success).toBe(false);

      // Admin user never gets limited
      const adminResult1 = await rateLimit('admin-user');
      const adminResult2 = await rateLimit('admin-user');
      const adminResult3 = await rateLimit('admin-user');

      expect(adminResult1.success).toBe(true);
      expect(adminResult2.success).toBe(true);
      expect(adminResult3.success).toBe(true);
    });

    it('should load exempt users from RATE_LIMIT_EXEMPT_USERS env var', async () => {
      vi.stubEnv('RATE_LIMIT_EXEMPT_USERS', 'env-admin-1,env-admin-2');

      const rateLimit = createRateLimit({ windowMs: 60000, max: 1 });

      // Regular user gets limited
      await rateLimit('regular-user');
      const regularResult = await rateLimit('regular-user');
      expect(regularResult.success).toBe(false);

      // Env exempt users never get limited
      const envAdmin1Result = await rateLimit('env-admin-1');
      const envAdmin2Result = await rateLimit('env-admin-2');

      expect(envAdmin1Result.success).toBe(true);
      expect(envAdmin2Result.success).toBe(true);
    });

    it('should merge exempt users from options and env var', async () => {
      vi.stubEnv('RATE_LIMIT_EXEMPT_USERS', 'env-admin');

      const rateLimit = createRateLimit({
        windowMs: 60000,
        max: 1,
        exemptUsers: ['option-admin']
      });

      await rateLimit('regular-user');
      const regularResult = await rateLimit('regular-user');
      expect(regularResult.success).toBe(false);

      const optionAdminResult = await rateLimit('option-admin');
      const envAdminResult = await rateLimit('env-admin');

      expect(optionAdminResult.success).toBe(true);
      expect(envAdminResult.success).toBe(true);
    });

    it('should use custom message when provided', async () => {
      const customMessage = 'Custom rate limit message';
      const rateLimit = createRateLimit({
        windowMs: 60000,
        max: 1,
        message: customMessage
      });

      await rateLimit('test-user');
      const result = await rateLimit('test-user');

      expect(result.message).toBe(customMessage);
    });

    it('should provide resetTime in ISO format', async () => {
      const rateLimit = createRateLimit({ windowMs: 60000, max: 1 });

      await rateLimit('test-user');
      const result = await rateLimit('test-user');

      expect(result.resetTime).toBeDefined();
      expect(() => new Date(result.resetTime!)).not.toThrow();

      const resetDate = new Date(result.resetTime!);
      expect(resetDate.getTime()).toBeGreaterThan(Date.now());
    });
  });
});
