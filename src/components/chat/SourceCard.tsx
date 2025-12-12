'use client'

import { ShoppingCart, Download, User } from 'lucide-react'
import { ensureHttps, formatFileSize } from '@/lib/chatUtils'
import type { Source } from '@/types/chat'

interface SourceCardProps {
  source: Source
  index: number
  onContactClick: (info: { person: string; email: string; documentTitle: string }) => void
  onDownloadClick: (documentId: string, title: string) => void
}

export function SourceCard({
  source,
  index,
  onContactClick,
  onDownloadClick
}: SourceCardProps) {
  return (
    <div
      className="bg-neutral-50/80 rounded-xl p-4 border border-neutral-200/40 transition-all duration-200 animate-slide-up hover:shadow-lg"
      style={{ animationDelay: `${index * 0.1}s` }}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <h4 className="font-semibold text-neutral-800 text-sm m-0">
            {source.title}
          </h4>
          {source.author && (
            <p className="text-xs text-neutral-600 mt-1 m-0">
              by {source.author}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {source.amazon_url && (
          <a
            href={ensureHttps(source.amazon_url)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-3 text-xs font-medium rounded-lg no-underline transition-all duration-200 bg-gradient-to-r from-primary-400/20 to-primary-400/10 text-primary-600 border border-primary-400/30 hover:scale-105 min-h-[44px]"
          >
            <ShoppingCart className="w-3 h-3" />
            Buy Online
          </a>
        )}

        {source.has_file && source.download_enabled && (
          <button
            onClick={() => onDownloadClick(source.document_id, source.title)}
            className="inline-flex items-center gap-2 px-4 py-3 text-xs font-medium rounded-lg transition-all duration-200 bg-gradient-to-r from-secondary-400/20 to-secondary-400/10 text-secondary-600 border border-secondary-400/30 hover:scale-105 min-h-[44px] cursor-pointer"
          >
            <Download className="w-3 h-3" />
            Download{source.file_size ? ` (${formatFileSize(source.file_size)})` : ''}
          </button>
        )}

        {source.contact_person && source.contact_email && (
          <button
            onClick={() => {
              onContactClick({
                person: source.contact_person!,
                email: source.contact_email!,
                documentTitle: source.title
              })
            }}
            className="inline-flex items-center gap-2 px-4 py-3 text-xs font-medium text-neutral-600 bg-white rounded-lg border border-slate-300 cursor-pointer transition-all duration-200 hover:text-neutral-800 hover:border-slate-400 hover:scale-105 min-h-[44px]"
          >
            <User className="w-3 h-3" />
            Contact {source.contact_person}
          </button>
        )}
      </div>
    </div>
  )
}
