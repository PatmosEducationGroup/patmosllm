/**
 * ErrorBoundary Component Tests
 *
 * Tests the React Error Boundary implementation to ensure:
 * - Errors are caught and logged correctly
 * - Fallback UI is displayed on error
 * - Reset functionality works as expected
 * - Custom fallback props are respected
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ErrorBoundary, ChatErrorBoundary, AdminErrorBoundary } from '@/components/ErrorBoundary'
import * as logger from '@/lib/logger'

// Mock the logger module
vi.mock('@/lib/logger', () => ({
  logError: vi.fn(),
}))

// Component that throws an error
function ThrowError({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('Test error')
  }
  return <div>No error</div>
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Suppress console errors in test output
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={false} />
      </ErrorBoundary>
    )

    expect(screen.getByText('No error')).toBeInTheDocument()
  })

  it('displays fallback UI when an error is caught', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    )

    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
  })

  it('logs error to monitoring service', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    )

    expect(logger.logError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        component: 'ErrorBoundary',
        operation: 'react_component_error',
        phase: 'render',
        severity: 'critical',
      })
    )
  })

  it('renders custom fallback when provided', () => {
    const customFallback = <div>Custom error message</div>

    render(
      <ErrorBoundary fallback={customFallback}>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    )

    expect(screen.getByText('Custom error message')).toBeInTheDocument()
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument()
  })

  it('displays Try Again button in fallback UI', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    )

    expect(screen.getByText('Try Again')).toBeInTheDocument()
  })

  it('displays Go to Home button in fallback UI', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    )

    expect(screen.getByText('Go to Home')).toBeInTheDocument()
  })
})

describe('ChatErrorBoundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('renders chat-specific fallback UI on error', () => {
    render(
      <ChatErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ChatErrorBoundary>
    )

    expect(screen.getByText('Chat Error')).toBeInTheDocument()
    expect(screen.getByText(/couldn't load the chat interface/i)).toBeInTheDocument()
  })

  it('renders children when there is no error', () => {
    render(
      <ChatErrorBoundary>
        <ThrowError shouldThrow={false} />
      </ChatErrorBoundary>
    )

    expect(screen.getByText('No error')).toBeInTheDocument()
  })
})

describe('AdminErrorBoundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('renders admin-specific fallback UI on error', () => {
    render(
      <AdminErrorBoundary>
        <ThrowError shouldThrow={true} />
      </AdminErrorBoundary>
    )

    expect(screen.getByText('Admin Panel Error')).toBeInTheDocument()
    expect(screen.getByText(/couldn't load the admin dashboard/i)).toBeInTheDocument()
  })

  it('renders children when there is no error', () => {
    render(
      <AdminErrorBoundary>
        <ThrowError shouldThrow={false} />
      </AdminErrorBoundary>
    )

    expect(screen.getByText('No error')).toBeInTheDocument()
  })
})
