'use client'

import Link from 'next/link'

interface ChatInputProps {
  input: string
  setInput: (value: string) => void
  onSubmit: (e: React.FormEvent) => void
  loading: boolean
  isStreaming: boolean
}

export function ChatInput({
  input,
  setInput,
  onSubmit,
  loading,
  isStreaming
}: ChatInputProps) {
  return (
    <div className="bg-white border-t border-neutral-200 flex justify-center">
      <div className="w-full max-w-4xl px-4 md:px-6">
        {/* Input Section */}
        <div className="py-4 md:py-6">
          <textarea
            value={input}
            onChange={(e) => {
              setInput(e.target.value)
              // Auto-resize textarea
              const textarea = e.target as HTMLTextAreaElement
              textarea.style.height = 'auto'
              textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px'
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                onSubmit(e as unknown as React.FormEvent)
              }
            }}
            placeholder="Ask a question about the documents..."
            disabled={loading || isStreaming}
            rows={1}
            className="w-full p-4 md:p-6 bg-neutral-50 border border-neutral-300 rounded-2xl resize-none outline-none text-sm md:text-base text-neutral-900 min-h-12 md:min-h-14 max-h-50 transition-all duration-200 focus:ring-2 focus:ring-primary-400/50 focus:border-primary-400"
            style={{ overflow: 'hidden' }}
          />
        </div>

        {/* Footer Section */}
        <div className="py-3">
          <div className="flex items-center justify-center gap-4 text-xs text-neutral-500">
            <Link
              href="/privacy"
              className="hover:text-primary-600 transition-colors no-underline"
            >
              Privacy
            </Link>
            <span>•</span>
            <Link
              href="/terms"
              className="hover:text-primary-600 transition-colors no-underline"
            >
              Terms
            </Link>
            <span>•</span>
            <span>© {new Date().getFullYear()} Multiply Tools</span>
          </div>
        </div>
      </div>
    </div>
  )
}
