import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET, DELETE } from '@/app/api/admin/invite/route'
import { NextRequest } from 'next/server'

// Mock all external dependencies
vi.mock('@/lib/auth', () => ({
  getCurrentUser: vi.fn(() => Promise.resolve({
    id: 'admin-user-id',
    email: 'admin@example.com',
    name: 'Admin User',
    auth_user_id: 'admin-supabase-id',
    role: 'ADMIN',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z'
  }))
}))

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      if (table === 'users') {
        return {
          select: (...args: string[]) => {
            const query = args[0] || ''
            if (query.includes('inviter')) {
              // GET request - return users list
              return {
                is: () => ({
                  order: () => Promise.resolve({
                    data: [
                      {
                        id: 'user-1',
                        email: 'user1@example.com',
                        name: 'User 1',
                        role: 'USER',
                        created_at: '2024-01-01T00:00:00Z',
                        auth_user_id: 'supabase-user-1',
                        invited_by: 'admin-user-id',
                        invitation_token: null,
                        inviter: { email: 'admin@example.com', name: 'Admin User' }
                      },
                      {
                        id: 'user-2',
                        email: 'pending@example.com',
                        name: null,
                        role: 'CONTRIBUTOR',
                        created_at: '2024-01-02T00:00:00Z',
                        auth_user_id: null,
                        invited_by: 'admin-user-id',
                        invitation_token: 'test-token-123',
                        inviter: { email: 'admin@example.com', name: 'Admin User' }
                      }
                    ],
                    error: null
                  })
                })
              }
            }
            // POST/DELETE request - check existing user / get user details
            return {
              eq: (field: string, value: string) => ({
                single: () => {
                  if (value === 'existing@example.com') {
                    return Promise.resolve({
                      data: { id: 'existing-user-id', email: 'existing@example.com' },
                      error: null
                    })
                  }
                  if (value === 'target-user-id') {
                    return Promise.resolve({
                      data: {
                        id: 'target-user-id',
                        email: 'target@example.com',
                        auth_user_id: null,
                        role: 'USER',
                        invitation_token: 'test-token'
                      },
                      error: null
                    })
                  }
                  return Promise.resolve({ data: null, error: null })
                }
              })
            }
          },
          insert: () => ({
            select: () => ({
              single: () => Promise.resolve({
                data: {
                  id: 'new-user-id',
                  email: 'invited@example.com',
                  name: 'Invited User',
                  role: 'USER',
                  auth_user_id: null,
                  invitation_token: 'test-token-123'
                },
                error: null
              })
            })
          }),
          update: () => ({
            eq: () => Promise.resolve({ error: null })
          })
        }
      }
      return {}
    }
  }
}))

vi.mock('@/lib/email', () => ({
  sendInvitationEmail: vi.fn(() => Promise.resolve({ success: true })),
  generateInvitationToken: vi.fn(() => 'test-invitation-token-123')
}))

vi.mock('@/lib/onboardingTracker', () => ({
  trackOnboardingMilestone: vi.fn(() => Promise.resolve())
}))

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn()
  },
  loggers: {
    security: vi.fn(),
    ai: vi.fn(),
    performance: vi.fn(),
    database: vi.fn()
  },
  logError: vi.fn()
}))

describe('/api/admin/invite - Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_APP_URL = 'https://test.com'
  })

  describe('GET /api/admin/invite - List Users', () => {
    // The route returns 403 for both unauthenticated (null user) and non-admin users
    // because it checks: if (!user || !['ADMIN', 'SUPER_ADMIN'].includes(user.role))
    it('should return 403 if user is not authenticated', async () => {
      const { getCurrentUser } = await import('@/lib/auth')
      vi.mocked(getCurrentUser).mockResolvedValueOnce(null)

      const request = new NextRequest('http://localhost:3000/api/admin/invite')
      const response = await GET(request)

      expect(response.status).toBe(403)
      const data = await response.json()
      expect(data.error).toBe('Admin access required')
    })

    it('should return 403 if user is not an admin', async () => {
      const { getCurrentUser } = await import('@/lib/auth')
      vi.mocked(getCurrentUser).mockResolvedValueOnce({
        id: 'user-id',
        email: 'user@example.com',
        auth_user_id: 'user-supabase-id',
        role: 'CONTRIBUTOR',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      })

      const request = new NextRequest('http://localhost:3000/api/admin/invite')
      const response = await GET(request)

      expect(response.status).toBe(403)
      const data = await response.json()
      expect(data.error).toBe('Admin access required')
    })

    it('should return list of all users for admin', async () => {
      const request = new NextRequest('http://localhost:3000/api/admin/invite')
      const response = await GET(request)

      expect(response.status).toBe(200)
      const data = await response.json()

      expect(data.success).toBe(true)
      expect(data.users).toHaveLength(2)
      expect(data.total).toBe(2)
    })

    it('should mark active vs pending users correctly', async () => {
      const request = new NextRequest('http://localhost:3000/api/admin/invite')
      const response = await GET(request)

      const data = await response.json()

      // First user is active (has auth_user_id)
      expect(data.users[0].isActive).toBe(true)

      // Second user is pending (no auth_user_id, has invitation_token)
      expect(data.users[1].isActive).toBe(false)
    })

    it('should include inviter information', async () => {
      const request = new NextRequest('http://localhost:3000/api/admin/invite')
      const response = await GET(request)

      const data = await response.json()

      expect(data.users[0].invitedBy).toBe('admin@example.com')
    })
  })

  describe('DELETE /api/admin/invite - Delete User/Invitation', () => {
    // The route returns 403 for both unauthenticated (null user) and non-admin users
    // because it checks: if (!user || !['ADMIN', 'SUPER_ADMIN'].includes(user.role))
    it('should return 403 if user is not authenticated', async () => {
      const { getCurrentUser } = await import('@/lib/auth')
      vi.mocked(getCurrentUser).mockResolvedValueOnce(null)

      const request = new NextRequest('http://localhost:3000/api/admin/invite', {
        method: 'DELETE',
        body: JSON.stringify({ userId: 'target-user-id' })
      })

      const response = await DELETE(request)
      expect(response.status).toBe(403)

      const data = await response.json()
      expect(data.error).toBe('Admin access required')
    })

    it('should return 403 if user is not an admin', async () => {
      const { getCurrentUser } = await import('@/lib/auth')
      vi.mocked(getCurrentUser).mockResolvedValueOnce({
        id: 'user-id',
        email: 'user@example.com',
        auth_user_id: 'user-supabase-id',
        role: 'USER',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      })

      const request = new NextRequest('http://localhost:3000/api/admin/invite', {
        method: 'DELETE',
        body: JSON.stringify({ userId: 'target-user-id' })
      })

      const response = await DELETE(request)
      expect(response.status).toBe(403)

      const data = await response.json()
      expect(data.error).toBe('Admin access required')
    })

    it('should return 400 if userId is missing', async () => {
      const request = new NextRequest('http://localhost:3000/api/admin/invite', {
        method: 'DELETE',
        body: JSON.stringify({})
      })

      const response = await DELETE(request)
      expect(response.status).toBe(400)

      const data = await response.json()
      expect(data.error).toBe('User ID required')
    })

    it('should return 400 if trying to delete own account', async () => {
      const request = new NextRequest('http://localhost:3000/api/admin/invite', {
        method: 'DELETE',
        body: JSON.stringify({ userId: 'admin-user-id' })
      })

      const response = await DELETE(request)
      expect(response.status).toBe(400)

      const data = await response.json()
      expect(data.error).toBe('Cannot delete your own account')
    })

    it('should successfully delete/soft-delete user', async () => {
      const request = new NextRequest('http://localhost:3000/api/admin/invite', {
        method: 'DELETE',
        body: JSON.stringify({ userId: 'target-user-id' })
      })

      const response = await DELETE(request)
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.deletedUser.id).toBe('target-user-id')
    })

    // Note: Clerk invitation retraction removed - now using Supabase Auth only

    it('should log deletion for audit trail', async () => {
      const { loggers } = await import('@/lib/logger')

      const request = new NextRequest('http://localhost:3000/api/admin/invite', {
        method: 'DELETE',
        body: JSON.stringify({ userId: 'target-user-id' })
      })

      await DELETE(request)

      expect(loggers.security).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: expect.stringContaining('admin_'),
          adminUserId: 'admin-user-id',
          targetUserId: 'target-user-id'
        }),
        expect.any(String)
      )
    })
  })
})
