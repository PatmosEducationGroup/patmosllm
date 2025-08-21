'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import AdminNavbar from '@/components/AdminNavbar'

interface User {
  id: string
  email: string
  name?: string
  role: string
  createdAt: string
  isActive: boolean
  invitedBy: string
}

export default function AdminUsersPage() {
  const { isLoaded, userId } = useAuth()
  const router = useRouter()
  const [users, setUsers] = useState<User[]>([])
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [inviting, setInviting] = useState(false)
  const [showInviteForm, setShowInviteForm] = useState(false)
  const [updatingRole, setUpdatingRole] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  // Form state
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [inviteRole, setInviteRole] = useState('USER')

  // Redirect if not authenticated
  useEffect(() => {
    if (isLoaded && !userId) {
      router.push('/sign-in')
    }
  }, [isLoaded, userId, router])

  // Load users on mount
  useEffect(() => {
    if (userId) {
      loadUsers()
    }
  }, [userId])

  const loadUsers = async () => {
    try {
      const response = await fetch('/api/admin/invite')
      const data = await response.json()
      
      if (data.success) {
        setUsers(data.users)
        // Find current user to prevent self-role changes
        const current = data.users.find((user: User) => user.email === 'emichaelray@gmail.com') // Replace with dynamic lookup if needed
        setCurrentUser(current || null)
      } else {
        setError(data.error)
      }
    } catch (err) {
      setError('Failed to load users')
    } finally {
      setLoading(false)
    }
  }

  const handleRoleChange = async (userId: string, newRole: string) => {
    setUpdatingRole(userId)
    setError(null)

    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ role: newRole })
      })

      const data = await response.json()

      if (data.success) {
        // Update the user in the local state
        setUsers(users.map(user => 
          user.id === userId ? { ...user, role: newRole } : user
        ))
      } else {
        setError(data.error)
      }
    } catch (err) {
      setError('Failed to update user role')
    } finally {
      setUpdatingRole(null)
    }
  }

  const handleDeleteUser = async (userId: string, userEmail: string, isActive: boolean) => {
    const confirmMessage = isActive 
      ? `Are you sure you want to delete user ${userEmail}? This will permanently remove their account and all associated data.`
      : `Are you sure you want to retract the invitation for ${userEmail}?`
    
    if (!confirm(confirmMessage)) {
      return
    }

    setDeleting(userId)
    setError(null)

    try {
      const response = await fetch('/api/admin/invite', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ userId })
      })

      const data = await response.json()

      if (data.success) {
        // Remove the user from the local state
        setUsers(users.filter(user => user.id !== userId))
        
        // Show success message
        const actionText = isActive ? 'deleted' : 'retracted'
        alert(`Successfully ${actionText} ${userEmail}`)
      } else {
        setError(data.error)
      }
    } catch (err) {
      setError('Failed to delete user')
    } finally {
      setDeleting(null)
    }
  }

  const handleInviteUser = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inviteEmail.trim()) return

    setInviting(true)
    setError(null)

    try {
      const response = await fetch('/api/admin/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: inviteEmail.trim(),
          name: inviteName.trim() || undefined,
          role: inviteRole
        })
      })

      const data = await response.json()

      if (data.success) {
        // Reset form
        setInviteEmail('')
        setInviteName('')
        setInviteRole('USER')
        setShowInviteForm(false)
        
        // Reload users list
        await loadUsers()
      } else {
        setError(data.error)
      }
    } catch (err) {
      setError('Failed to invite user')
    } finally {
      setInviting(false)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'ADMIN':
        return { bg: '#fef2f2', color: '#dc2626' }
      case 'CONTRIBUTOR':
        return { bg: '#f0f9ff', color: '#0891b2' }
      default:
        return { bg: '#eff6ff', color: '#2563eb' }
    }
  }

  if (!isLoaded || !userId) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>Loading...</div>
  }

  return (
    <div>
      <AdminNavbar />
      
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '1.5rem' }}>
        {/* Header */}
        <div style={{ marginBottom: '2rem' }}>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 'bold', color: '#111827', marginBottom: '0.5rem' }}>
            User Management
          </h1>
          <p style={{ color: '#6b7280' }}>Manage user invitations and permissions</p>
        </div>

        {error && (
          <div style={{ 
            marginBottom: '1.5rem', 
            padding: '1rem', 
            backgroundColor: '#fef2f2', 
            border: '1px solid #fecaca', 
            color: '#dc2626', 
            borderRadius: '0.375rem' 
          }}>
            {error}
          </div>
        )}

        {/* Invite User Section */}
        <div style={{ 
          marginBottom: '2rem', 
          padding: '1.5rem', 
          backgroundColor: 'white', 
          borderRadius: '0.5rem', 
          border: '1px solid #e5e7eb' 
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: '600' }}>Invite New User</h2>
            <button
              onClick={() => setShowInviteForm(!showInviteForm)}
              className="btn btn-primary"
              style={{ fontSize: '0.875rem' }}
            >
              {showInviteForm ? 'Cancel' : 'Invite User'}
            </button>
          </div>

          {showInviteForm && (
            <form onSubmit={handleInviteUser} style={{ display: 'grid', gap: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>
                    Email Address *
                  </label>
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    required
                    className="input"
                    placeholder="user@example.com"
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>
                    Name (Optional)
                  </label>
                  <input
                    type="text"
                    value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                    className="input"
                    placeholder="Full Name"
                  />
                </div>
              </div>
              
              <div style={{ maxWidth: '200px' }}>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>
                  Role
                </label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="input"
                >
                  <option value="USER">User (Chat only)</option>
                  <option value="CONTRIBUTOR">Contributor (Chat + Upload)</option>
                  <option value="ADMIN">Admin (Full access)</option>
                </select>
              </div>

              <div>
                <button
                  type="submit"
                  disabled={inviting || !inviteEmail.trim()}
                  className="btn btn-primary"
                >
                  {inviting ? 'Sending Invitation...' : 'Invite User'}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Users List */}
        <div style={{ backgroundColor: 'white', borderRadius: '0.5rem', border: '1px solid #e5e7eb' }}>
          <div style={{ padding: '1.5rem', borderBottom: '1px solid #e5e7eb' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: '600' }}>
              All Users ({users.length})
            </h2>
          </div>

          {loading ? (
            <div style={{ padding: '1.5rem', textAlign: 'center' }}>Loading users...</div>
          ) : users.length === 0 ? (
            <div style={{ padding: '1.5rem', textAlign: 'center', color: '#6b7280' }}>
              No users found
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%' }}>
                <thead style={{ backgroundColor: '#f9fafb' }}>
                  <tr>
                    <th style={{ padding: '0.75rem 1.5rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: '500', color: '#6b7280', textTransform: 'uppercase' }}>
                      User
                    </th>
                    <th style={{ padding: '0.75rem 1.5rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: '500', color: '#6b7280', textTransform: 'uppercase' }}>
                      Role
                    </th>
                    <th style={{ padding: '0.75rem 1.5rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: '500', color: '#6b7280', textTransform: 'uppercase' }}>
                      Status
                    </th>
                    <th style={{ padding: '0.75rem 1.5rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: '500', color: '#6b7280', textTransform: 'uppercase' }}>
                      Invited By
                    </th>
                    <th style={{ padding: '0.75rem 1.5rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: '500', color: '#6b7280', textTransform: 'uppercase' }}>
                      Created
                    </th>
                    <th style={{ padding: '0.75rem 1.5rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: '500', color: '#6b7280', textTransform: 'uppercase' }}>
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody style={{ backgroundColor: 'white' }}>
                  {users.map((user) => (
                    <tr key={user.id} style={{ borderTop: '1px solid #e5e7eb' }}>
                      <td style={{ padding: '1rem 1.5rem' }}>
                        <div>
                          <div style={{ fontSize: '0.875rem', fontWeight: '500', color: '#111827' }}>
                            {user.name || 'No name'}
                          </div>
                          <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                            {user.email}
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '1rem 1.5rem' }}>
                        {currentUser && user.id === currentUser.id ? (
                          // Current user cannot change their own role
                          <span style={{ 
                            display: 'inline-flex', 
                            padding: '0.25rem 0.5rem', 
                            fontSize: '0.75rem', 
                            fontWeight: '600', 
                            borderRadius: '9999px',
                            backgroundColor: getRoleColor(user.role).bg,
                            color: getRoleColor(user.role).color
                          }}>
                            {user.role} (You)
                          </span>
                        ) : (
                          // Other users can have their roles changed
                          <select
                            value={user.role}
                            onChange={(e) => handleRoleChange(user.id, e.target.value)}
                            disabled={updatingRole === user.id}
                            style={{
                              padding: '0.25rem 0.5rem',
                              fontSize: '0.75rem',
                              fontWeight: '600',
                              borderRadius: '0.375rem',
                              border: '1px solid #d1d5db',
                              backgroundColor: updatingRole === user.id ? '#f3f4f6' : 'white',
                              color: '#374151',
                              cursor: updatingRole === user.id ? 'not-allowed' : 'pointer'
                            }}
                          >
                            <option value="USER">USER</option>
                            <option value="CONTRIBUTOR">CONTRIBUTOR</option>
                            <option value="ADMIN">ADMIN</option>
                          </select>
                        )}
                        {updatingRole === user.id && (
                          <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                            Updating...
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '1rem 1.5rem' }}>
                        <span style={{ 
                          display: 'inline-flex', 
                          padding: '0.25rem 0.5rem', 
                          fontSize: '0.75rem', 
                          fontWeight: '600', 
                          borderRadius: '9999px',
                          backgroundColor: user.isActive ? '#f0fdf4' : '#fffbeb',
                          color: user.isActive ? '#16a34a' : '#d97706'
                        }}>
                          {user.isActive ? 'Active' : 'Pending'}
                        </span>
                      </td>
                      <td style={{ padding: '1rem 1.5rem', fontSize: '0.875rem', color: '#6b7280' }}>
                        {user.invitedBy}
                      </td>
                      <td style={{ padding: '1rem 1.5rem', fontSize: '0.875rem', color: '#6b7280' }}>
                        {formatDate(user.createdAt)}
                      </td>
                      <td style={{ padding: '1rem 1.5rem' }}>
                        {/* Don't allow deleting yourself */}
                        {currentUser && user.id === currentUser.id ? (
                          <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                            Cannot delete yourself
                          </span>
                        ) : (
                          <button
                            onClick={() => handleDeleteUser(user.id, user.email, user.isActive)}
                            disabled={deleting === user.id}
                            style={{
                              padding: '0.25rem 0.75rem',
                              fontSize: '0.75rem',
                              fontWeight: '500',
                              color: deleting === user.id ? '#9ca3af' : '#dc2626',
                              backgroundColor: 'transparent',
                              border: '1px solid',
                              borderColor: deleting === user.id ? '#d1d5db' : '#dc2626',
                              borderRadius: '0.375rem',
                              cursor: deleting === user.id ? 'not-allowed' : 'pointer',
                              transition: 'all 0.2s'
                            }}
                            onMouseEnter={(e) => {
                              if (deleting !== user.id) {
                                e.currentTarget.style.backgroundColor = '#fef2f2'
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (deleting !== user.id) {
                                e.currentTarget.style.backgroundColor = 'transparent'
                              }
                            }}
                          >
                            {deleting === user.id 
                              ? 'Deleting...' 
                              : user.isActive 
                                ? 'Delete User' 
                                : 'Retract Invite'
                            }
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}