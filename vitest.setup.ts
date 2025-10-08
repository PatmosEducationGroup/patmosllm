import '@testing-library/jest-dom';
import { expect, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock environment variables for tests
process.env.RATE_LIMIT_EXEMPT_USERS = 'test-user-1,test-user-2';
process.env.CSRF_SECRET = 'test-secret-for-testing-only';
// NODE_ENV is set by vitest automatically
