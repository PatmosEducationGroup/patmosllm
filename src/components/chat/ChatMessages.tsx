'use client'

import { useRef, useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { Clock, Globe, Download, Zap, Shield } from 'lucide-react'
import { formatFileSize } from '@/lib/chatUtils'
import { SourceCard } from './SourceCard'
import type { Source, DocumentDownload } from '@/types/chat'

// =================================================================
// LOCAL MESSAGE INTERFACE (matches page.tsx structure)
// =================================================================
interface Message {
  id: string
  type: 'user' | 'assistant'
  content: string
  sources?: Source[]
  timestamp: Date
  isStreaming?: boolean
  document?: DocumentDownload
}

interface ChatMessagesProps {
  messages: Message[]
  loading: boolean
  isStreaming: boolean
  error: string | null
  onContactClick: (info: { person: string; email: string; documentTitle: string }) => void
  onDownloadClick: (documentId: string, title: string) => void
}

export function ChatMessages({
  messages,
  loading,
  isStreaming,
  error,
  onContactClick,
  onDownloadClick
}: ChatMessagesProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [expandedSources, setExpandedSources] = useState<Set<string>>(new Set())

  // Auto-scroll when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const toggleSourcesExpansion = (messageId: string) => {
    setExpandedSources(prev => {
      const newSet = new Set(prev)
      if (newSet.has(messageId)) {
        newSet.delete(messageId)
      } else {
        newSet.add(messageId)
      }
      return newSet
    })
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4 md:py-6">
      <div className="max-w-4xl mx-auto flex flex-col gap-4 md:gap-6">
        {/* Welcome Screen */}
        {messages.length === 0 && !loading && (
          <div className="text-center py-20">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-400 to-primary-500 flex items-center justify-center text-white text-2xl font-bold mb-6 mx-auto animate-pulse shadow-2xl">
              MT
            </div>
            <h3 className="text-xl font-semibold text-neutral-800 mb-4">
              Welcome to Multiply Tools (Beta)!
            </h3>
            <div className="text-neutral-600 text-base max-w-2xl mx-auto space-y-3">
              <p>You&apos;re using an early version of our AI-powered library for church, prayer, and missions.</p>

              <div>
                <p className="font-semibold text-neutral-700 mb-2">Coming Soon:</p>
                <ul className="space-y-1 text-left inline-block">
                  <li>Privacy Policy & clear data guidelines</li>
                  <li>Mentor contact info for most documents</li>
                  <li>Invite-a-friend feature for early access users</li>
                  <li>More resources added weekly</li>
                  <li>Better mobile experience & offline access</li>
                  <li>Ability to edit your account</li>
                </ul>
              </div>

              <p className="text-sm">Since we&apos;re still in beta, you may notice a few bugs or missing features. Please share your feedback — it&apos;s what helps us make Multiply Tools the best possible library for missions and prayer.</p>
            </div>
          </div>
        )}

        {/* Chat Messages */}
        {messages.map((message, index) => (
          <div
            key={message.id}
            className={`flex w-full animate-slide-up ${
              message.type === 'user' ? 'justify-end' : 'justify-start'
            }`}
            style={{ animationDelay: `${index * 0.1}s` }}
          >
            <div className={`${
              message.type === 'user' ? 'max-w-2xl' : 'w-full'
            }`}>
              <div
                className={`rounded-2xl p-4 md:p-6 shadow-lg ${
                  message.type === 'user'
                    ? 'bg-gradient-to-br from-primary-400 to-primary-500 text-white'
                    : 'bg-white border border-neutral-200 text-neutral-900'
                }`}
              >
                {/* Message Content */}
                {message.type === 'assistant' ? (
                  <div>
                    <ReactMarkdown
                      components={{
                        p: ({children}) => <div className="mb-3 text-neutral-700">{children}</div>,
                        strong: ({children}) => <strong className="font-semibold text-neutral-800">{children}</strong>,
                        ul: ({children}) => <ul className="list-disc pl-6 mb-3 flex flex-col gap-1">{children}</ul>,
                        ol: ({children}) => <ol className="list-decimal pl-6 mb-3 flex flex-col gap-1">{children}</ol>,
                        li: ({children}) => <li className="text-neutral-700">{children}</li>,
                        h1: ({children}) => <h1 className="text-xl font-semibold text-neutral-800 mb-3">{children}</h1>,
                        h2: ({children}) => <h2 className="text-lg font-semibold text-neutral-800 mb-3">{children}</h2>,
                        h3: ({children}) => <h3 className="text-base font-semibold text-neutral-800 mb-2">{children}</h3>,
                        code: ({children}) => <code className="bg-neutral-100 px-2 py-0.5 rounded text-sm font-mono text-neutral-800">{children}</code>
                      }}
                    >
                      {message.content}
                    </ReactMarkdown>

                    {/* Streaming Cursor */}
                    {message.isStreaming && (
                      <span className="inline-block w-0.5 h-5 ml-1 bg-primary-400 animate-pulse" />
                    )}

                    {/* Document Download */}
                    {message.document && !message.isStreaming && (
                      <div className="mt-4 p-4 bg-gradient-to-r from-primary-50 to-primary-100 border border-primary-200 rounded-xl">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="p-3 bg-white rounded-lg shadow-sm">
                              <Download className="w-5 h-5 text-primary-600" />
                            </div>
                            <div>
                              <div className="font-semibold text-neutral-800 text-sm">
                                {message.document.format.toUpperCase()} Document Ready
                              </div>
                              <div className="text-xs text-neutral-600 mt-0.5">
                                {formatFileSize(message.document.size)} • Expires in 5 minutes
                              </div>
                            </div>
                          </div>
                          <a
                            href={message.document.downloadUrl}
                            download
                            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors no-underline"
                          >
                            <Download className="w-4 h-4" />
                            Download
                          </a>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="whitespace-pre-wrap text-white/95">
                    {message.content}
                  </div>
                )}

                {/* Source Citations */}
                {message.sources && message.sources.length > 0 && !message.isStreaming && !message.document && (
                  <div className="mt-6 pt-4 border-t border-neutral-200/30">
                    <div className="text-sm font-semibold text-neutral-700 mb-3 flex items-center gap-2">
                      <Globe className="w-4 h-4" />
                      Sources ({message.sources.length}):
                    </div>
                    <div className="flex flex-col gap-3">
                      {(expandedSources.has(message.id)
                        ? message.sources
                        : message.sources.slice(0, 3)
                      ).map((source, i) => (
                        <SourceCard
                          key={i}
                          source={source}
                          index={i}
                          onContactClick={onContactClick}
                          onDownloadClick={onDownloadClick}
                        />
                      ))}
                    </div>

                    {/* Show More/Less Button */}
                    {message.sources.length > 3 && (
                      <button
                        onClick={() => toggleSourcesExpansion(message.id)}
                        className="mt-3 w-full py-2 px-4 text-sm font-medium text-primary-600 bg-primary-50 hover:bg-primary-100 rounded-lg transition-colors duration-200 flex items-center justify-center gap-2"
                      >
                        {expandedSources.has(message.id) ? (
                          <>
                            Show less
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                            </svg>
                          </>
                        ) : (
                          <>
                            Show {message.sources.length - 3} more source{message.sources.length - 3 !== 1 ? 's' : ''}
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                )}

                {/* Message Timestamp */}
                <div className={`text-xs mt-3 flex items-center gap-1 ${
                  message.type === 'user' ? 'text-white/70' : 'text-neutral-400'
                }`}>
                  <Clock className="w-3 h-3" />
                  {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          </div>
        ))}

        {/* Loading Animation */}
        {isStreaming && (
          <div className="flex w-full">
            <div className="w-full max-w-4xl">
              <div className="w-full flex justify-start">
                <div className="max-w-3xl bg-white border border-neutral-200 rounded-2xl p-6 shadow-lg">
                  <div className="flex items-center gap-3">
                    <div className="flex gap-1">
                      {[0, 1, 2].map(i => (
                        <div
                          key={i}
                          className="w-2 h-2 rounded-full bg-primary-400 animate-bounce"
                          style={{ animationDelay: `${i * 0.2}s` }}
                        ></div>
                      ))}
                    </div>
                    <span className="text-sm text-neutral-700 flex items-center gap-2 animate-pulse">
                      <Zap className="w-4 h-4" />
                      AI is thinking...
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="flex w-full">
            <div className="w-full max-w-4xl mx-auto">
              <div className="w-full flex justify-start">
                <div className="max-w-3xl bg-red-50 border border-red-200 text-red-600 p-6 rounded-xl text-center shadow-lg">
                  <div className="flex items-center justify-center gap-2">
                    <Shield className="w-5 h-5" />
                    {error}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>
    </div>
  )
}
