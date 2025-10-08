'use client'

import { ErrorBoundary } from '@/components/ErrorBoundary'
import { useState } from 'react'

/**
 * Test component that throws an error when button is clicked
 */
function ErrorThrowingComponent({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('Test error: This is an intentional error to test the ErrorBoundary!')
  }

  return (
    <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
      <p className="text-green-800">✅ Component rendered successfully!</p>
    </div>
  )
}

/**
 * Test page for ErrorBoundary component
 * Visit /test-error-boundary to test the error boundary
 */
export default function TestErrorBoundaryPage() {
  const [throwError, setThrowError] = useState(false)

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-8 mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            Error Boundary Test Page
          </h1>
          <p className="text-gray-600 mb-6">
            This page is for testing the ErrorBoundary component. Click the button below to trigger an error and see how the ErrorBoundary catches it.
          </p>

          <div className="space-y-4">
            <div className="flex gap-4">
              <button
                onClick={() => setThrowError(true)}
                className="px-6 py-3 bg-red-500 text-white font-medium rounded-lg hover:bg-red-600 transition-colors"
              >
                Trigger Error
              </button>
              <button
                onClick={() => setThrowError(false)}
                className="px-6 py-3 bg-green-500 text-white font-medium rounded-lg hover:bg-green-600 transition-colors"
              >
                Reset
              </button>
            </div>

            <div className="mt-6">
              <h2 className="text-xl font-semibold text-gray-800 mb-3">Test Component:</h2>
              <ErrorBoundary>
                <ErrorThrowingComponent shouldThrow={throwError} />
              </ErrorBoundary>
            </div>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h2 className="text-xl font-semibold text-blue-900 mb-3">Expected Behavior:</h2>
          <ul className="space-y-2 text-blue-800">
            <li className="flex items-start gap-2">
              <span className="font-bold">1.</span>
              <span>Click &quot;Trigger Error&quot; to make the component throw an error</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-bold">2.</span>
              <span>The ErrorBoundary should catch the error and display a fallback UI</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-bold">3.</span>
              <span>The error should be logged to the console (check browser DevTools)</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-bold">4.</span>
              <span>In development mode, you should see the error message and stack trace</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-bold">5.</span>
              <span>Click &quot;Try Again&quot; in the error UI to reset the error state</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  )
}
