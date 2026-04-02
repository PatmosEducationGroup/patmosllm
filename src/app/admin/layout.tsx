'use client'

/**
 * Admin Layout
 * Provides top navigation bar across all admin pages
 */

import { useState, useEffect, useRef, Suspense } from 'react'
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
  FileText,
  Globe,
  LogOut,
  User,
  ChevronDown
} from 'lucide-react'

interface AdminLayoutProps {
  children: React.ReactNode
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [userRole, setUserRole] = useState<string>('USER')
  const [loggingOut, setLoggingOut] = useState(false)
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const handleLogout = async () => {
    if (loggingOut) return

    setLoggingOut(true)
    try {
      const response = await fetch('/api/auth/signout', {
        method: 'POST'
      })

      if (response.ok) {
        router.push('/')
      }
    } catch (_error) {
      router.push('/')
    } finally {
      setLoggingOut(false)
    }
  }

  useEffect(() => {
    const fetchUserRole = async () => {
      try {
        const response = await fetch('/api/auth', {
          headers: { 'Content-Type': 'application/json' }
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

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpenDropdown(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false)
    setOpenDropdown(null)
  }, [pathname])

  // Group nav items: standalone items and dropdown groups
  const contentItems = [
    { name: 'Upload Documents', href: '/admin/upload-documents', icon: Upload, roles: ['CONTRIBUTOR', 'ADMIN', 'SUPER_ADMIN'] },
    { name: 'Document Library', href: '/admin/uploaded-documents', icon: FileText, roles: ['CONTRIBUTOR', 'ADMIN', 'SUPER_ADMIN'] },
    { name: 'Scrape Webpages', href: '/admin/scrape-webpages', icon: Globe, roles: ['CONTRIBUTOR', 'ADMIN', 'SUPER_ADMIN'] },
    { name: 'Webpage Library', href: '/admin/scraped-webpages', icon: Globe, roles: ['CONTRIBUTOR', 'ADMIN', 'SUPER_ADMIN'] },
  ].filter(item => item.roles.includes(userRole))

  const adminItems = [
    { name: 'Users', href: '/admin/users', icon: Users, roles: ['ADMIN', 'SUPER_ADMIN'] },
    { name: 'Invitations', href: '/admin/invitation-quotas', icon: Gift, roles: ['ADMIN', 'SUPER_ADMIN'] },
    { name: 'System Health', href: '/admin/system-health', icon: Activity, roles: ['ADMIN', 'SUPER_ADMIN'] },
    { name: 'Doc Analytics', href: '/admin/document-analytics', icon: TrendingUp, roles: ['ADMIN', 'SUPER_ADMIN'] },
    { name: 'Question Quality', href: '/admin/question-quality', icon: AlertCircle, roles: ['SUPER_ADMIN'] },
    { name: 'Onboarding', href: '/admin/onboarding', icon: Rocket, roles: ['ADMIN', 'SUPER_ADMIN'] },
  ].filter(item => item.roles.includes(userRole))

  const isActive = (href: string) => {
    if (href === '/admin') return pathname === '/admin'
    return pathname.startsWith(href)
  }

  const isGroupActive = (items: { href: string }[]) => items.some(item => isActive(item.href))

  const NavLink = ({ href, icon: Icon, name, onClick }: { href: string; icon: typeof Home; name: string; onClick?: () => void }) => (
    <Link
      href={href}
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 no-underline whitespace-nowrap ${
        isActive(href)
          ? 'bg-primary-400/15 text-primary-600'
          : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
      }`}
    >
      <Icon className="w-4 h-4 flex-shrink-0" />
      <span>{name}</span>
    </Link>
  )

  const DropdownMenu = ({ label, items, groupKey }: { label: string; items: typeof contentItems; groupKey: string }) => {
    if (items.length === 0) return null
    const isOpen = openDropdown === groupKey
    const groupActive = isGroupActive(items)

    return (
      <div className="relative">
        <button
          onClick={() => setOpenDropdown(isOpen ? null : groupKey)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 border-none cursor-pointer whitespace-nowrap ${
            groupActive
              ? 'bg-primary-400/15 text-primary-600'
              : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 bg-transparent'
          }`}
        >
          <span>{label}</span>
          <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`} />
        </button>
        {isOpen && (
          <div className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-xl border border-neutral-200 py-1 min-w-[200px] z-50">
            {items.map((item) => {
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpenDropdown(null)}
                  className={`flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors no-underline ${
                    isActive(item.href)
                      ? 'bg-primary-400/10 text-primary-600 font-medium'
                      : 'text-neutral-700 hover:bg-neutral-50'
                  }`}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <span>{item.name}</span>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-200">
      {/* Top Header Bar */}
      <div className="bg-white border-b border-neutral-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Top row: brand + actions */}
          <div className="flex items-center justify-between h-16">
            <Link href="/admin" className="flex items-center gap-3 no-underline hover:opacity-80 transition-opacity">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary-400 to-primary-500 flex items-center justify-center text-white font-bold text-sm shadow-lg">
                MT
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-900 leading-tight">Multiply Tools</h1>
                <p className="text-[11px] text-gray-500 leading-tight">Admin Panel</p>
              </div>
            </Link>

            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push('/chat')}
                className="hidden sm:flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-neutral-600 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50 transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Chat
              </button>
              <Link
                href="/settings"
                className="w-9 h-9 rounded-lg bg-gradient-to-br from-gray-500 to-gray-600 flex items-center justify-center text-white shadow-md hover:shadow-lg transition-shadow"
              >
                <User className="w-4 h-4" />
              </Link>
              {/* Mobile menu toggle */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="lg:hidden p-2 rounded-lg text-neutral-600 hover:bg-neutral-100 border-none cursor-pointer bg-transparent"
                aria-label="Toggle menu"
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {/* Desktop nav row */}
          <div className="hidden lg:flex items-center gap-1 pb-2 -mb-px" ref={dropdownRef}>
            <NavLink href="/admin" icon={Home} name="Dashboard" />
            <DropdownMenu label="Content" items={contentItems} groupKey="content" />
            {adminItems.length > 0 && (
              <DropdownMenu label="Administration" items={adminItems} groupKey="admin" />
            )}
            <div className="flex-1" />
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 transition-all duration-150 border-none cursor-pointer bg-transparent disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <LogOut className="w-4 h-4" />
              <span>{loggingOut ? 'Logging out...' : 'Logout'}</span>
            </button>
          </div>
        </div>

        {/* Mobile nav menu */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-neutral-200 bg-white px-4 py-3 space-y-1 max-h-[70vh] overflow-y-auto">
            <NavLink href="/admin" icon={Home} name="Dashboard" onClick={() => setMobileMenuOpen(false)} />

            {contentItems.length > 0 && (
              <>
                <div className="text-xs font-semibold text-neutral-400 uppercase tracking-wider px-3 pt-3 pb-1">Content</div>
                {contentItems.map(item => (
                  <NavLink key={item.href} href={item.href} icon={item.icon} name={item.name} onClick={() => setMobileMenuOpen(false)} />
                ))}
              </>
            )}

            {adminItems.length > 0 && (
              <>
                <div className="text-xs font-semibold text-neutral-400 uppercase tracking-wider px-3 pt-3 pb-1">Administration</div>
                {adminItems.map(item => (
                  <NavLink key={item.href} href={item.href} icon={item.icon} name={item.name} onClick={() => setMobileMenuOpen(false)} />
                ))}
              </>
            )}

            <div className="border-t border-neutral-200 pt-2 mt-2 space-y-1">
              <NavLink href="/chat" icon={MessageCircle} name="Back to Chat" onClick={() => setMobileMenuOpen(false)} />
              <button
                onClick={() => { setMobileMenuOpen(false); handleLogout() }}
                disabled={loggingOut}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-neutral-600 hover:bg-neutral-100 transition-all border-none cursor-pointer bg-transparent disabled:opacity-50"
              >
                <LogOut className="w-4 h-4" />
                <span>{loggingOut ? 'Logging out...' : 'Logout'}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Suspense fallback={<div>Loading...</div>}>
          {children}
        </Suspense>
      </div>
    </div>
  )
}
