'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { UserButton } from '@clerk/nextjs'

export default function AdminNavbar() {
  const pathname = usePathname()

  const navItems = [
    { href: '/', label: 'Chat', icon: '💬' },
    { href: '/admin', label: 'Documents', icon: '📚' },
    { href: '/admin/users', label: 'Users', icon: '👥' }
  ]

  const isActive = (href: string) => {
    if (href === '/admin') {
      return pathname === '/admin'
    }
    return pathname.startsWith(href)
  }

  return (
    <nav style={{ 
      backgroundColor: 'white', 
      borderBottom: '1px solid #e5e7eb', 
      padding: '1rem 0' 
    }}>
      <div style={{ 
        maxWidth: '1200px', 
        margin: '0 auto', 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        padding: '0 1.5rem'
      }}>
        {/* Left side - Logo/Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
          <Link 
            href="/" 
            style={{ 
              fontSize: '1.25rem', 
              fontWeight: '700', 
              color: '#2563eb', 
              textDecoration: 'none' 
            }}
          >
            Heaven.Earth Knowledge Base
          </Link>
          
          {/* Navigation Links */}
          <div style={{ display: 'flex', gap: '1rem' }}>
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.5rem 1rem',
                  borderRadius: '0.375rem',
                  textDecoration: 'none',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  transition: 'all 0.2s',
                  backgroundColor: isActive(item.href) ? '#eff6ff' : 'transparent',
                  color: isActive(item.href) ? '#2563eb' : '#6b7280'
                }}
              >
                <span>{item.icon}</span>
                {item.label}
              </Link>
            ))}
          </div>
        </div>

        {/* Right side - User menu */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
            Admin Panel
          </div>
          <UserButton 
            afterSignOutUrl="/"
            appearance={{
              elements: {
                avatarBox: 'h-8 w-8'
              }
            }}
          />
        </div>
      </div>
    </nav>
  )
}