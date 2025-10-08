/**
 * ErrorBoundary Component
 *
 * React Error Boundary for graceful error handling in the UI.
 *
 * Features:
 * - Catches errors in React component tree
 * - Integrates with existing logging infrastructure (@/lib/logger)
 * - Provides user-friendly fallback UI
 * - "Try again" functionality to reset error state
 * - Optional custom fallback prop for component-specific error UIs
 * - Automatic error reporting to Sentry (via logError)
 *
 * Usage:
 * ```tsx
 * // Basic usage with default fallback UI
 * <ErrorBoundary>
 *   <YourComponent />
 * </ErrorBoundary>
 *
 * // With custom fallback UI
 * <ErrorBoundary
 *   fallback={
 *     <div>Custom error message</div>
 *   }
 * >
 *   <YourComponent />
 * </ErrorBoundary>
 * ```
 *
 * Note: Error Boundaries must be class components as per React requirements.
 * They cannot be function components with hooks.
 */

'use client'

import React from 'react'
import { logError } from '@/lib/logger'
import { AlertCircle, RefreshCw, Home } from 'lucide-react'

interface ErrorBoundaryProps {
  children: React.ReactNode
  fallback?: React.ReactNode
  onReset?: () => void
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
  errorInfo: React.ErrorInfo | null
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    }
  }

  /**
   * Update state so the next render will show the fallback UI
   */
  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error
    }
  }

  /**
   * Log error details to monitoring service (Sentry via logError)
   */
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log to Sentry and structured logging
    logError(error, {
      component: 'ErrorBoundary',
      componentStack: errorInfo.componentStack,
      operation: 'react_component_error',
      phase: 'render',
      severity: 'critical',
      errorContext: 'React component tree error caught by Error Boundary'
    })

    // Store error info in state for debugging
    this.setState({
      errorInfo
    })
  }

  /**
   * Reset error state and allow retry
   */
  handleReset = () => {
    // Call custom reset handler if provided
    if (this.props.onReset) {
      this.props.onReset()
    }

    // Reset error state
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    })
  }

  /**
   * Navigate to home page
   */
  handleGoHome = () => {
    window.location.href = '/'
  }

  render() {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback
      }

      // Default fallback UI
      return (
        <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50 flex items-center justify-center p-4">
          <div className="max-w-2xl w-full bg-white rounded-2xl shadow-2xl border border-red-100 overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-red-500 to-orange-500 px-8 py-6">
              <div className="flex items-center gap-4 text-white">
                <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
                  <AlertCircle className="w-8 h-8" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold">Something went wrong</h1>
                  <p className="text-white/90 text-sm mt-1">
                    We encountered an unexpected error
                  </p>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="px-8 py-6">
              <p className="text-gray-700 mb-6">
                We&apos;re sorry for the inconvenience. The error has been automatically reported to our team,
                and we&apos;re working to fix it. Please try one of the options below:
              </p>

              {/* Error details (only in development) */}
              {process.env.NODE_ENV === 'development' && this.state.error && (
                <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <h3 className="font-semibold text-gray-800 mb-2 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-500" />
                    Error Details (Development Only)
                  </h3>
                  <pre className="text-xs text-gray-600 overflow-x-auto whitespace-pre-wrap break-words">
                    {this.state.error.message}
                  </pre>
                  {this.state.error.stack && (
                    <details className="mt-3">
                      <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700 font-medium">
                        Stack Trace
                      </summary>
                      <pre className="text-xs text-gray-500 mt-2 overflow-x-auto whitespace-pre-wrap break-words">
                        {this.state.error.stack}
                      </pre>
                    </details>
                  )}
                </div>
              )}

              {/* Action buttons */}
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={this.handleReset}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-primary-500 to-primary-600 text-white font-medium rounded-xl hover:from-primary-600 hover:to-primary-700 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105 cursor-pointer border-none"
                >
                  <RefreshCw className="w-5 h-5" />
                  Try Again
                </button>

                <button
                  onClick={this.handleGoHome}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-3 bg-white text-gray-700 font-medium rounded-xl border-2 border-gray-300 hover:border-gray-400 hover:bg-gray-50 transition-all duration-200 cursor-pointer"
                >
                  <Home className="w-5 h-5" />
                  Go to Home
                </button>
              </div>

              {/* Support info */}
              <div className="mt-6 pt-6 border-t border-gray-200">
                <p className="text-sm text-gray-600">
                  If this problem persists, please contact support at{' '}
                  <a
                    href="mailto:patmoseducationgroup@gmail.com"
                    className="text-primary-600 hover:text-primary-700 font-medium underline"
                  >
                    patmoseducationgroup@gmail.com
                  </a>
                </p>
              </div>
            </div>
          </div>
        </div>
      )
    }

    // No error, render children normally
    return this.props.children
  }
}

/**
 * ErrorBoundary with preset for chat interface
 */
export function ChatErrorBoundary({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary
      fallback={
        <div className="min-h-screen bg-white flex items-center justify-center p-4">
          <div className="max-w-md w-full text-center">
            <div className="mb-6">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-8 h-8 text-red-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Chat Error</h2>
              <p className="text-gray-600">
                We couldn&apos;t load the chat interface. Please refresh the page to try again.
              </p>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-primary-500 to-primary-600 text-white font-medium rounded-xl hover:from-primary-600 hover:to-primary-700 transition-all duration-200 shadow-lg cursor-pointer border-none"
            >
              <RefreshCw className="w-5 h-5" />
              Refresh Page
            </button>
          </div>
        </div>
      }
    >
      {children}
    </ErrorBoundary>
  )
}

/**
 * ErrorBoundary with preset for admin interface
 */
export function AdminErrorBoundary({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
          <div className="max-w-md w-full text-center">
            <div className="mb-6">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-8 h-8 text-red-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Admin Panel Error</h2>
              <p className="text-gray-600">
                We couldn&apos;t load the admin dashboard. Please try refreshing the page.
              </p>
            </div>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => window.location.reload()}
                className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-primary-500 to-primary-600 text-white font-medium rounded-xl hover:from-primary-600 hover:to-primary-700 transition-all duration-200 shadow-lg cursor-pointer border-none"
              >
                <RefreshCw className="w-5 h-5" />
                Refresh Page
              </button>
              <button
                onClick={() => window.location.href = '/'}
                className="inline-flex items-center gap-2 px-6 py-3 bg-white text-gray-700 font-medium rounded-xl border-2 border-gray-300 hover:border-gray-400 hover:bg-gray-50 transition-all duration-200 cursor-pointer"
              >
                <Home className="w-5 h-5" />
                Back to Home
              </button>
            </div>
          </div>
        </div>
      }
    >
      {children}
    </ErrorBoundary>
  )
}
