'use client'

import Link from 'next/link'
import {
  MessageCircle,
  Plus,
  Trash2,
  Search,
  User,
  Settings,
  Shield,
  LogOut,
  X
} from 'lucide-react'
import { DonationBannerBadge } from '@/components/DonationBannerBadge'
import { formatSessionDate } from '@/lib/chatUtils'
import type { ChatSession } from '@/types/chat'

interface ChatSidebarProps {
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
  sessions: ChatSession[]
  currentSessionId: string | null
  loadingSessions: boolean
  showUserDropdown: boolean
  setShowUserDropdown: (show: boolean) => void
  canAdmin: boolean
  onNewChat: () => void
  onLoadSession: (sessionId: string) => void
  onDeleteSession: (sessionId: string) => void
  onSignOut: () => void
  onFeedbackClick: () => void
}

export function ChatSidebar({
  sidebarOpen,
  setSidebarOpen,
  sessions,
  currentSessionId,
  loadingSessions,
  showUserDropdown,
  setShowUserDropdown,
  canAdmin,
  onNewChat,
  onLoadSession,
  onDeleteSession,
  onSignOut,
  onFeedbackClick
}: ChatSidebarProps) {
  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-30 md:hidden transition-all duration-300 ease-out"
          onClick={() => setSidebarOpen(false)}
          onTouchStart={() => setSidebarOpen(false)}
          aria-label="Close sidebar"
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              setSidebarOpen(false)
            }
          }}
        />
      )}

      {/* Sidebar */}
      <div
        className={`bg-white border-r border-neutral-200 transition-all duration-300 ease-out flex flex-col overflow-hidden shadow-2xl md:shadow-none ${
          sidebarOpen
            ? 'w-[280px] max-w-[80vw] fixed inset-y-0 left-0 z-40 md:static md:w-64 md:max-w-none transform translate-x-0'
            : 'w-0 md:w-0 fixed inset-y-0 left-0 z-40 md:static transform -translate-x-full md:translate-x-0'
        }`}
        onTouchStart={(e) => {
          const startX = e.touches[0].clientX
          const handleTouchMove = (moveEvent: TouchEvent) => {
            const currentX = moveEvent.touches[0].clientX
            const diff = currentX - startX

            // Close sidebar if swiped left by more than 100px
            if (diff < -100 && sidebarOpen) {
              setSidebarOpen(false)
              document.removeEventListener('touchmove', handleTouchMove)
              document.removeEventListener('touchend', handleTouchEnd)
            }
          }

          const handleTouchEnd = () => {
            document.removeEventListener('touchmove', handleTouchMove)
            document.removeEventListener('touchend', handleTouchEnd)
          }

          document.addEventListener('touchmove', handleTouchMove, { passive: true })
          document.addEventListener('touchend', handleTouchEnd, { passive: true })
        }}
      >
        <div className={`transition-opacity duration-300 flex flex-col h-full ${sidebarOpen ? 'opacity-100' : 'opacity-0'}`}>
          {/* Mobile Header with Close Button */}
          <div className="md:hidden flex items-center justify-between p-4 border-b border-neutral-200">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-400 to-primary-500 flex items-center justify-center text-white font-bold text-sm">
                MT
              </div>
              <span className="font-semibold text-neutral-800">Conversations</span>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="min-w-[44px] min-h-[44px] p-2 rounded-xl bg-neutral-100 border border-neutral-200 text-neutral-700 cursor-pointer transition-all duration-200 hover:bg-neutral-200 flex items-center justify-center"
              aria-label="Close sidebar"
            >
              <X size={24} />
            </button>
          </div>

          {/* New Chat Button */}
          <div className="p-4 border-b border-neutral-200">
            <button
              onClick={onNewChat}
              className="w-full bg-gradient-to-r from-primary-400 to-primary-600 text-white px-4 py-3 rounded-xl font-medium flex items-center gap-3 shadow-lg border-none cursor-pointer transition-all duration-200 hover:shadow-xl hover:scale-105"
            >
              <Plus size={20} />
              New Conversation
            </button>
          </div>

          {/* Search Bar */}
          <div className="p-4 border-b border-neutral-200">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
              <input
                type="text"
                placeholder="Search conversations..."
                className="w-full bg-neutral-50 text-neutral-900 pl-10 pr-4 py-2 rounded-lg border border-neutral-300 outline-none transition-colors duration-200 text-sm focus:border-primary-400 focus:ring-2 focus:ring-primary-400/20"
              />
            </div>
          </div>

          {/* Sessions List */}
          <div className="flex-1 overflow-y-auto p-2">
            {loadingSessions ? (
              <div className="p-4 text-neutral-600 text-center">
                <div className="w-6 h-6 border-2 border-slate-400 border-t-transparent rounded-full mx-auto mb-2 animate-spin"></div>
                Loading conversations...
              </div>
            ) : sessions.length === 0 ? (
              <div className="p-4 text-neutral-600 text-center">
                <MessageCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                No conversations yet
              </div>
            ) : (
              sessions.map((session, index) => (
                <div
                  key={session.id}
                  className={`group p-4 rounded-xl mb-2 cursor-pointer transition-all duration-200 animate-slide-up border ${
                    session.id === currentSessionId
                      ? 'bg-primary-400/10 border-primary-400/30'
                      : 'bg-transparent border-transparent hover:bg-neutral-50'
                  }`}
                  style={{ animationDelay: `${index * 100}ms` }}
                  onClick={() => onLoadSession(session.id)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-neutral-900 font-medium text-sm mb-1 overflow-hidden text-ellipsis whitespace-nowrap transition-colors duration-200 hover:text-primary-400">
                        {session.title}
                      </h3>
                      <p className="text-neutral-600 text-xs my-2">
                        {formatSessionDate(session.updatedAt)} • {session.messageCount} messages
                      </p>
                      <div className="flex items-center gap-2">
                        <MessageCircle className="w-3 h-3 text-neutral-600" />
                        <span className="text-xs text-neutral-600">{session.messageCount}</span>
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onDeleteSession(session.id)
                      }}
                      className="opacity-0 group-hover:opacity-100 md:opacity-100 text-neutral-400 bg-transparent border-none cursor-pointer min-w-[44px] min-h-[44px] p-2 flex items-center justify-center transition-all duration-200 hover:text-red-500 hover:bg-red-50 rounded-lg"
                      aria-label={`Delete conversation: ${session.title}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Sidebar Footer */}
          <div className="px-4 py-4 md:py-6 border-t border-neutral-200">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-400 to-primary-500 flex items-center justify-center text-white font-bold text-sm">
                  MT
                </div>
                <div>
                  <div className="text-sm font-medium text-neutral-900">Multiply Tools</div>
                  <div className="text-xs text-neutral-600">Interact. Learn. Multiply.</div>
                </div>
              </div>
              <div className="relative">
                <button
                  onClick={() => setShowUserDropdown(!showUserDropdown)}
                  className="w-8 h-8 rounded-lg bg-gradient-to-br from-secondary-400 to-secondary-500 flex items-center justify-center text-white font-bold text-sm cursor-pointer transition-all duration-200 hover:shadow-lg hover:scale-105 border-none"
                  aria-label="User menu"
                >
                  <User className="w-4 h-4" />
                </button>
                {showUserDropdown && (
                  <div className="absolute bottom-full right-0 mb-2 w-48 bg-white rounded-lg shadow-xl border border-neutral-200 py-2 z-50">
                    <Link
                      href="/settings"
                      className="w-full px-4 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50 flex items-center gap-2 cursor-pointer transition-colors duration-200 no-underline"
                    >
                      <Settings className="w-4 h-4" />
                      Settings
                    </Link>
                    {canAdmin && (
                      <Link
                        href="/admin"
                        className="w-full px-4 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50 flex items-center gap-2 cursor-pointer transition-colors duration-200 no-underline"
                      >
                        <Shield className="w-4 h-4" />
                        Admin
                      </Link>
                    )}
                    <button
                      onClick={onSignOut}
                      className="w-full px-4 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50 flex items-center gap-2 cursor-pointer bg-transparent border-none transition-colors duration-200"
                    >
                      <LogOut className="w-4 h-4" />
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Donation Badge */}
            <div className="mb-3">
              <DonationBannerBadge />
            </div>

            <button
              onClick={onFeedbackClick}
              className="w-full bg-gradient-to-r from-primary-400 to-primary-600 text-white px-2 py-1.5 rounded-lg text-xs font-medium border-none cursor-pointer transition-all duration-200 hover:shadow-lg hover:scale-105 min-h-[32px]"
            >
              Feedback
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
