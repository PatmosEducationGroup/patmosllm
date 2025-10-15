'use client'

/**
 * Settings Layout
 * Provides consistent navigation across all settings pages
 */

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  Menu,
  X,
  User,
  BarChart3,
  Download,
  Cookie,
  FileText,
  Trash2,
  Shield,
  ArrowLeft,
  Home,
  Mail
} from 'lucide-react'

interface SettingsLayoutProps {
  children: React.ReactNode
}

export default function SettingsLayout({ children }: SettingsLayoutProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const navigationItems = [
    { name: 'Settings Home', href: '/settings', icon: Home, isHome: true },
    { name: 'Profile', href: '/settings/profile', icon: User },
    { name: 'Email Preferences', href: '/settings/email-preferences', icon: Mail },
    { name: 'Stats', href: '/settings/stats', icon: BarChart3 },
    { name: 'Data Request', href: '/settings/data-request', icon: Download },
    { name: 'Cookies Management', href: '/settings/cookies', icon: Cookie },
    { name: 'Privacy Policy', href: '/privacy', icon: Shield },
    { name: 'Terms of Use', href: '/terms', icon: FileText },
    { name: 'Delete Account', href: '/settings/delete-account', icon: Trash2 }
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-200">
      {/* Multiply Tools Header */}
      <div className="bg-white border-b border-neutral-200 px-4 sm:px-6 lg:px-8 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-400 to-primary-500 flex items-center justify-center text-white font-bold text-lg shadow-lg">
              MT
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Multiply Tools</h1>
              <p className="text-xs text-gray-600">Interact. Learn. Multiply.</p>
            </div>
          </div>
          <button
            onClick={() => router.push('/chat')}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-neutral-700 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Back to Chat</span>
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex gap-8">
          {/* Mobile Menu Button */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="lg:hidden fixed bottom-6 right-6 z-50 w-14 h-14 bg-gradient-to-br from-primary-400 to-primary-600 text-white rounded-full shadow-2xl flex items-center justify-center border-none cursor-pointer hover:scale-110 transition-transform duration-200"
            aria-label="Toggle settings menu"
          >
            {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
          </button>

          {/* Sidebar Navigation */}
          <div
            className={`${
              sidebarOpen ? 'fixed inset-0 bg-black/50 z-40 lg:relative lg:bg-transparent' : 'hidden lg:block'
            } lg:w-64 flex-shrink-0`}
            onClick={() => setSidebarOpen(false)}
          >
            <nav
              className={`${
                sidebarOpen ? 'fixed left-0 top-0 h-full w-80 transform translate-x-0' : 'lg:sticky lg:top-8'
              } bg-white rounded-xl shadow-lg p-6 lg:transform-none transition-transform duration-300 ease-out z-50`}
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-lg font-bold text-gray-900 mb-6">Settings</h2>
              <ul className="space-y-2">
                {navigationItems.map((item) => {
                  const Icon = item.icon
                  const isActive = pathname === item.href
                  const isExternal = item.href.startsWith('/privacy') || item.href.startsWith('/terms')

                  return (
                    <li key={item.name} className={item.isHome ? 'pb-2 mb-2 border-b border-gray-200' : ''}>
                      <Link
                        href={item.href}
                        className={`flex items-center gap-3 px-4 py-3 rounded-lg font-medium text-sm transition-all duration-200 no-underline ${
                          isActive
                            ? 'bg-primary-400/10 text-primary-600 border border-primary-400/30'
                            : 'text-neutral-700 hover:bg-neutral-50 border border-transparent'
                        } ${
                          item.name === 'Delete Account' ? 'text-red-600 hover:bg-red-50' : ''
                        }`}
                        onClick={() => setSidebarOpen(false)}
                      >
                        <Icon className="w-5 h-5" />
                        <span>{item.name}</span>
                        {isExternal && (
                          <svg className="w-3 h-3 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        )}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </nav>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 min-w-0">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
