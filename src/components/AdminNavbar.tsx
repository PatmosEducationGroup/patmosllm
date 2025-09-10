'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { UserButton } from '@clerk/nextjs'
import { 
  MessageCircle, 
  BookOpen, 
  Users, 
  Activity, 
  TrendingUp, 
  Rocket,
  Bell,
  Settings
} from 'lucide-react'

export default function AdminNavbar() {
  const pathname = usePathname()

  const navItems = [
    { href: '/', label: 'Chat', icon: MessageCircle },
    { href: '/admin', label: 'Documents', icon: BookOpen },
    { href: '/admin/users', label: 'Users', icon: Users },
    { href: '/admin/system-health', label: 'System Health', icon: Activity },
    { href: '/admin/document-analytics', label: 'Document Analytics', icon: TrendingUp },
    { href: '/admin/onboarding', label: 'Onboarding', icon: Rocket }
  ]

  const isActive = (href: string) => {
    if (href === '/admin') {
      return pathname === '/admin'
    }
    return pathname.startsWith(href)
  }

  return (
    <nav style={{
      background: 'rgba(255, 255, 255, 0.8)',
      backdropFilter: 'blur(12px)',
      borderBottom: '1px solid rgba(226, 232, 240, 0.4)',
      padding: '16px 0',
      position: 'sticky',
      top: 0,
      zIndex: 50
    }}>
      <div style={{
        maxWidth: '1280px',
        margin: '0 auto',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '0 24px'
      }}>
        {/* Left side - Logo/Brand and Navigation */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
          {/* Brand */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #82b3db 0%, #5a9bd4 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontWeight: 'bold',
                fontSize: '16px',
                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.25)',
                cursor: 'pointer',
                transition: 'transform 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
              onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
            >
              H.E
            </div>
            <div>
              <Link
                href="/"
                style={{
                  fontSize: '18px',
                  fontWeight: '700',
                  color: '#1e293b',
                  textDecoration: 'none',
                  transition: 'color 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.color = '#82b3db'}
                onMouseLeave={(e) => e.currentTarget.style.color = '#1e293b'}
              >
                Heaven.Earth
              </Link>
              <div style={{ fontSize: '12px', color: '#64748b', fontWeight: '500' }}>
                Admin Panel
              </div>
            </div>
          </div>

          {/* Navigation Links */}
          <div style={{ display: 'flex', gap: '8px' }}>
            {navItems.map((item, index) => {
              const Icon = item.icon
              const active = isActive(item.href)
              
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 16px',
                    borderRadius: '12px',
                    textDecoration: 'none',
                    fontSize: '14px',
                    fontWeight: '500',
                    transition: 'all 0.2s',
                    background: active 
                      ? 'linear-gradient(135deg, #82b3db 0%, #5a9bd4 100%)' 
                      : 'transparent',
                    color: active ? 'white' : '#64748b',
                    boxShadow: active ? '0 4px 12px rgba(130, 179, 219, 0.3)' : 'none',
                    transform: active ? 'translateY(-1px)' : 'translateY(0)'
                  }}
                  onMouseEnter={(e) => {
                    if (!active) {
                      e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.6)'
                      e.currentTarget.style.color = '#1e293b'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!active) {
                      e.currentTarget.style.backgroundColor = 'transparent'
                      e.currentTarget.style.color = '#64748b'
                    }
                  }}
                >
                  <Icon size={18} />
                  {item.label}
                </Link>
              )
            })}
          </div>
        </div>

        {/* Right side - Actions and User menu */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {/* Action Buttons */}
          <button
            style={{
              position: 'relative',
              padding: '8px',
              color: '#64748b',
              backgroundColor: 'transparent',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.6)'
              e.currentTarget.style.color = '#1e293b'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent'
              e.currentTarget.style.color = '#64748b'
            }}
          >
            <Bell size={20} />
            <div
              style={{
                position: 'absolute',
                top: '6px',
                right: '6px',
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: '#9ecd55',
                border: '2px solid white'
              }}
            />
          </button>

          <button
            style={{
              padding: '8px',
              color: '#64748b',
              backgroundColor: 'transparent',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.6)'
              e.currentTarget.style.color = '#1e293b'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent'
              e.currentTarget.style.color = '#64748b'
            }}
          >
            <Settings size={20} />
          </button>

          {/* Divider */}
          <div style={{
            width: '1px',
            height: '32px',
            backgroundColor: 'rgba(226, 232, 240, 0.6)'
          }} />

          {/* User Info and Avatar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ 
                fontSize: '14px', 
                fontWeight: '500', 
                color: '#1e293b' 
              }}>
                Admin Panel
              </div>
              <div style={{ 
                fontSize: '12px', 
                color: '#64748b',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}>
                <div
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    backgroundColor: '#9ecd55',
                    animation: 'pulse 2s infinite'
                  }}
                />
                Online
              </div>
            </div>
            <UserButton
              afterSignOutUrl="/"
              appearance={{
                elements: {
                  avatarBox: 'w-10 h-10 rounded-lg shadow-md hover:shadow-lg transition-shadow duration-200'
                }
              }}
            />
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }
      `}</style>
    </nav>
  )
}