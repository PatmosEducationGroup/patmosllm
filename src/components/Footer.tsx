'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import FeedbackModal from './FeedbackModal'

export default function Footer() {
  const pathname = usePathname()
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false)
  const [supportModalOpen, setSupportModalOpen] = useState(false)

  // Hide footer on chat page (it has its own fixed layout)
  if (pathname === '/chat') {
    return null
  }

  const openFeedback = () => {
    setFeedbackModalOpen(true)
  }

  const openSupport = () => {
    setSupportModalOpen(true)
  }

  return (
    <>
      <footer className="bg-white border-t border-neutral-200 py-4">
        <div className="max-w-6xl mx-auto px-4 md:px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            {/* Links Section */}
            <div className="flex items-center gap-6 text-sm">
              <Link
                href="/"
                className="text-neutral-600 hover:text-primary-600 transition-colors no-underline"
              >
                Home
              </Link>
              <Link
                href="/privacy"
                className="text-neutral-600 hover:text-primary-600 transition-colors no-underline"
              >
                Privacy
              </Link>
              <Link
                href="/terms"
                className="text-neutral-600 hover:text-primary-600 transition-colors no-underline"
              >
                Terms
              </Link>
            </div>

            {/* Buttons Section */}
            <div className="flex items-center gap-3">
              <button
                onClick={openFeedback}
                className="px-4 py-2 text-sm font-medium text-primary-600 bg-primary-50 hover:bg-primary-100 rounded-lg transition-colors cursor-pointer border-none"
              >
                Feedback
              </button>
              <button
                onClick={openSupport}
                className="px-4 py-2 text-sm font-medium text-primary-600 bg-primary-50 hover:bg-primary-100 rounded-lg transition-colors cursor-pointer border-none"
              >
                Support
              </button>
            </div>
          </div>

          {/* Copyright */}
          <div className="text-center text-xs text-neutral-500 mt-4">
            © {new Date().getFullYear()} Multiply Tools. All rights reserved.
          </div>
        </div>
      </footer>

      {/* Feedback Modal */}
      <FeedbackModal
        isOpen={feedbackModalOpen}
        onClose={() => setFeedbackModalOpen(false)}
        type="feedback"
      />

      {/* Support Modal */}
      <FeedbackModal
        isOpen={supportModalOpen}
        onClose={() => setSupportModalOpen(false)}
        type="support"
      />
    </>
  )
}
