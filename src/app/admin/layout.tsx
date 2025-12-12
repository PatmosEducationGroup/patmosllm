'use client'

/**
 * Admin Layout
 * Provides consistent sidebar navigation across all admin pages
 */

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  Menu,
  X,
  MessageCircle,
  Users,
  Activity,
  TrendingUp,
  Rocket,
  AlertCircle,
  Gift,
  ArrowLeft,
  Home,
  Upload,
  LogOut,
  User
} from 'lucide-react'

interface AdminLayoutProps {
  children: React.ReactNode
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [userRole, setUserRole] = useState<string>('USER')
  const [loggingOut, setLoggingOut] = useState(false)

  const handleLogout = async () => {
    if (loggingOut) return

    setLoggingOut(true)
    try {
      const response = await fetch('/api/auth/signout', {
        method: 'POST'
      })

      if (response.ok) {
        // Redirect to home page
        router.push('/')
      }
    } catch (_error) {
      // Silently fail and redirect anyway
      router.push('/')
    } finally {
      setLoggingOut(false)
    }
  }

  useEffect(() => {
    // Fetch user role from API
    const fetchUserRole = async () => {
      try {
        const response = await fetch('/api/auth', {
          headers: {
            'Content-Type': 'application/json'
          }
        })

        if (response.ok) {
          const data = await response.json()
          if (data.success && data.user?.role) {
            setUserRole(data.user.role)
          }
        }
      } catch (_error) {
        // Silently fail and keep default USER role
      }
    }

    fetchUserRole()
  }, [])

  const allNavItems = [
    { name: 'Admin Home', href: '/admin', icon: Home, roles: ['CONTRIBUTOR', 'ADMIN', 'SUPER_ADMIN'], isHome: true },
    { name: 'Upload Documents', href: '/admin/upload-documents', icon: Upload, roles: ['CONTRIBUTOR', 'ADMIN', 'SUPER_ADMIN'] },
    { name: 'Users', href: '/admin/users', icon: Users, roles: ['ADMIN', 'SUPER_ADMIN'] },
    { name: 'Invitations', href: '/admin/invitation-quotas', icon: Gift, roles: ['ADMIN', 'SUPER_ADMIN'] },
    { name: 'System Health', href: '/admin/system-health', icon: Activity, roles: ['ADMIN', 'SUPER_ADMIN'] },
    { name: 'Document Analytics', href: '/admin/document-analytics', icon: TrendingUp, roles: ['ADMIN', 'SUPER_ADMIN'] },
    { name: 'Question Quality', href: '/admin/question-quality', icon: AlertCircle, roles: ['SUPER_ADMIN'] },
    { name: 'Onboarding', href: '/admin/onboarding', icon: Rocket, roles: ['ADMIN', 'SUPER_ADMIN'] }
  ]

  // Filter navigation items based on user role
  const navigationItems = allNavItems.filter(item => item.roles.includes(userRole))

  const isActive = (href: string) => {
    if (href === '/admin') {
      return pathname === '/admin'
    }
    return pathname.startsWith(href)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-200">
      {/* Multiply Tools Header */}
      <div className="bg-white border-b border-neutral-200 px-4 sm:px-6 lg:px-8 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link href="/chat" className="flex items-center gap-3 no-underline hover:opacity-80 transition-opacity">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-400 to-primary-500 flex items-center justify-center text-white font-bold text-lg shadow-lg">
              MT
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Multiply Tools</h1>
              <p className="text-xs text-gray-600">Admin Panel</p>
            </div>
          </Link>
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/chat')}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-neutral-700 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Back to Chat</span>
            </button>
            <Link
              href="/settings"
              className="w-10 h-10 rounded-lg bg-gradient-to-br from-gray-500 to-gray-600 flex items-center justify-center text-white shadow-md hover:shadow-lg transition-shadow duration-200"
            >
              <User className="w-5 h-5" />
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex gap-8">
          {/* Mobile Menu Button */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="lg:hidden fixed bottom-6 right-6 z-50 w-14 h-14 bg-gradient-to-br from-primary-400 to-primary-600 text-white rounded-full shadow-2xl flex items-center justify-center border-none cursor-pointer hover:scale-110 transition-transform duration-200"
            aria-label="Toggle admin menu"
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
              <h2 className="text-lg font-bold text-gray-900 mb-6">Admin Panel</h2>
              <ul className="space-y-2">
                {navigationItems.map((item) => {
                  const Icon = item.icon
                  const active = isActive(item.href)

                  return (
                    <li key={item.name} className={item.isHome ? 'pb-2 mb-2 border-b border-gray-200' : ''}>
                      <Link
                        href={item.href}
                        className={`flex items-center gap-3 px-4 py-3 rounded-lg font-medium text-sm transition-all duration-200 no-underline ${
                          active
                            ? 'bg-primary-400/10 text-primary-600 border border-primary-400/30'
                            : 'text-neutral-700 hover:bg-neutral-50 border border-transparent'
                        }`}
                        onClick={() => setSidebarOpen(false)}
                      >
                        <Icon className="w-5 h-5" />
                        <span>{item.name}</span>
                      </Link>
                    </li>
                  )
                })}
              </ul>

              {/* Back to Chat Link */}
              <div className="mt-6 pt-6 border-t border-gray-200">
                <Link
                  href="/chat"
                  className="flex items-center gap-3 px-4 py-3 rounded-lg font-medium text-sm transition-all duration-200 no-underline text-neutral-700 hover:bg-neutral-50 border border-transparent"
                  onClick={() => setSidebarOpen(false)}
                >
                  <MessageCircle className="w-5 h-5" />
                  <span>Back to Chat</span>
                </Link>

                {/* Logout Button */}
                <button
                  onClick={() => {
                    setSidebarOpen(false)
                    handleLogout()
                  }}
                  disabled={loggingOut}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium text-sm transition-all duration-200 border border-transparent text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed mt-2"
                >
                  <LogOut className="w-5 h-5" />
                  <span>{loggingOut ? 'Logging out...' : 'Logout'}</span>
                </button>
              </div>
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
