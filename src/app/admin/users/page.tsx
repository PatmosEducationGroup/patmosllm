'use client'

import { useState, useEffect } from 'react'
import { useAuth, useUser } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import AdminNavbar from '@/components/AdminNavbar'
import { 
  Users, 
  Mail, 
  Shield, 
  Trash2, 
  UserCheck, 
  UserX, 
  AlertCircle,
  RefreshCw,
  Clock,
  FileText,
  MessageSquare,
  Eye,
  Activity
} from 'lucide-react'

interface User {
  id: string
  email: string
  name?: string
  role: string
  createdAt: string
  isActive: boolean
  invitedBy: string
}

interface UserData {
  id: string
  role: string
  email: string
  name?: string
}

interface TimelineEvent {
  id: string
  type: 'account_created' | 'document_upload' | 'chat_session' | 'question'
  title: string
  description: string
  timestamp: string
  metadata: User[]
}

interface UserTimeline {
  user: {
    id: string
    email: string
    name: string
    created_at: string
  }
  timeline: TimelineEvent[]
  stats: {
    totalEvents: number
    documentsUploaded: number
    chatSessions: number
    questionsAsked: number
    engagementScore: number
    lastActivity: string | null
  }
}

export default function AdminUsersPage() {
  const { isLoaded, userId, getToken } = useAuth()
  const { user: clerkUser } = useUser()
  const router = useRouter()
  const [users, setUsers] = useState<User[]>([])
  const [currentUser, setCurrentUser] = useState<UserData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [inviting, setInviting] = useState(false)
  const [showInviteForm, setShowInviteForm] = useState(false)
  const [updatingRole, setUpdatingRole] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [accessDenied, setAccessDenied] = useState(false)

  // Form state
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [inviteRole, setInviteRole] = useState('USER')

  // Timeline modal state
  const [timelineUser, setTimelineUser] = useState<User | null>(null)
  const [userTimeline, setUserTimeline] = useState<UserTimeline | null>(null)
  const [loadingTimeline, setLoadingTimeline] = useState(false)

  // Check authentication and permissions
  useEffect(() => {
    if (isLoaded && !userId) {
      router.push('/sign-in')
    } else if (isLoaded && userId) {
      fetchUserData()
    }
  }, [isLoaded, userId, router])

  const fetchUserData = async () => {
    try {
      const token = await getToken()
      
      const userResponse = await fetch('/api/auth', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      
      if (userResponse.status === 404) {
        setAccessDenied(true)
        setError('Access denied: Your account has not been properly set up.')
        setLoading(false)
        return
      }
      
      const userData = await userResponse.json()
      
      if (!userData.success) {
        setAccessDenied(true)
        setError('Access denied: Unable to verify your permissions.')
        setLoading(false)
        return
      }
      
      setCurrentUser(userData.user)
      
      if (userData.user.role !== 'ADMIN') {
        setAccessDenied(true)
        setError('Access denied: You need admin permissions to manage users.')
        setLoading(false)
        return
      }
      
      loadUsers()
      
    } catch (err) {
      console.error('Error fetching user data:', err)
      setAccessDenied(true)
      setError('Access denied: Unable to verify your permissions.')
      setLoading(false)
    }
  }

  const loadUsers = async () => {
    try {
      const response = await fetch('/api/admin/invite')
      const data = await response.json()
      
      if (data.success) {
        setUsers(data.users)
      } else {
        setError(data.error)
      }
    } catch (err) {
      setError('Failed to load users')
    } finally {
      setLoading(false)
    }
  }

  const fetchUserTimeline = async (userId: string) => {
    try {
      setLoadingTimeline(true)
      const token = await getToken()
      
      const response = await fetch(`/api/admin/users/${userId}/timeline`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          setUserTimeline(data)
        } else {
          setError(data.error || 'Failed to fetch timeline')
        }
      } else {
        setError('Failed to fetch user timeline')
      }
    } catch (err) {
      console.error('Error fetching user timeline:', err)
      setError('Failed to load user timeline')
    } finally {
      setLoadingTimeline(false)
    }
  }

  const openTimeline = (user: User) => {
    setTimelineUser(user)
    fetchUserTimeline(user.id)
  }

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'account_created': return <UserCheck className="h-4 w-4 text-green-500" />
      case 'document_upload': return <FileText className="h-4 w-4 text-blue-500" />
      case 'chat_session': return <MessageSquare className="h-4 w-4 text-purple-500" />
      case 'question': return <Clock className="h-4 w-4 text-orange-500" />
      default: return <Activity className="h-4 w-4 text-gray-500" />
    }
  }

  const formatFileSize = (bytes: number) => {
    if (!bytes) return '0 Bytes'
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i]
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
        setUsers(users.filter(user => user.id !== userId))
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
        setInviteEmail('')
        setInviteName('')
        setInviteRole('USER')
        setShowInviteForm(false)
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

  if (accessDenied) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '2rem' }}>
        <h1 style={{ fontSize: '1.875rem', fontWeight: 'bold', color: '#dc2626', marginBottom: '1rem' }}>
          Access Denied
        </h1>
        <p style={{ color: '#6b7280', textAlign: 'center', marginBottom: '2rem', maxWidth: '500px' }}>
          {error}
        </p>
        <button
          onClick={() => router.push('/')}
          style={{
            backgroundColor: '#2563eb',
            color: 'white',
            padding: '0.75rem 1.5rem',
            border: 'none',
            borderRadius: '0.375rem',
            cursor: 'pointer',
            fontSize: '0.875rem',
            fontWeight: '500'
          }}
        >
          Go to Chat
        </button>
      </div>
    )
  }

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>Loading...</div>
  }

  return (
    <div>
      <AdminNavbar />
      
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '1.5rem' }}>
        <div style={{ marginBottom: '2rem' }}>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 'bold', color: '#111827', marginBottom: '0.5rem' }}>
            User Management
          </h1>
          <p style={{ color: '#6b7280' }}>
            Manage user invitations and permissions
            {currentUser && (
              <span style={{ marginLeft: '1rem', fontSize: '0.875rem', color: '#2563eb' }}>
                Logged in as {currentUser.role}: {currentUser.email}
              </span>
            )}
          </p>
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
              style={{
                backgroundColor: showInviteForm ? '#dc2626' : '#2563eb',
                color: 'white',
                padding: '0.5rem 1rem',
                border: 'none',
                borderRadius: '0.375rem',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: '500'
              }}
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
                    placeholder="user@example.com"
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      fontSize: '0.875rem'
                    }}
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
                    placeholder="Full Name"
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.375rem',
                      fontSize: '0.875rem'
                    }}
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
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                    fontSize: '0.875rem'
                  }}
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
                  style={{
                    backgroundColor: inviting || !inviteEmail.trim() ? '#9ca3af' : '#2563eb',
                    color: 'white',
                    padding: '0.75rem 1.5rem',
                    border: 'none',
                    borderRadius: '0.375rem',
                    cursor: inviting || !inviteEmail.trim() ? 'not-allowed' : 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: '500'
                  }}
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

          {users.length === 0 ? (
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <button
                            onClick={() => openTimeline(user)}
                            style={{
                              padding: '0.25rem 0.75rem',
                              fontSize: '0.75rem',
                              fontWeight: '500',
                              color: '#7c3aed',
                              backgroundColor: 'transparent',
                              border: '1px solid #7c3aed',
                              borderRadius: '0.375rem',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.25rem'
                            }}
                            title="View Timeline"
                          >
                            <Activity size={14} />
                            Timeline
                          </button>

                          {currentUser && user.id !== currentUser.id && (
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
                                cursor: deleting === user.id ? 'not-allowed' : 'pointer'
                              }}
                            >
                              {deleting === user.id 
                                ? 'Deleting...' 
                                : user.isActive 
                                  ? 'Delete' 
                                  : 'Retract'
                              }
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Timeline Modal */}
        {timelineUser && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
            padding: '1rem'
          }}>
            <div style={{
              backgroundColor: 'white',
              borderRadius: '0.5rem',
              padding: '2rem',
              maxWidth: '64rem',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                <div>
                  <h3 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#111827', marginBottom: '0.5rem' }}>
                    Activity Timeline: {timelineUser.name || timelineUser.email}
                  </h3>
                  {userTimeline && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', fontSize: '0.875rem', color: '#6b7280' }}>
                      <span>Engagement Score: <span style={{ fontWeight: '600', color: '#7c3aed' }}>{userTimeline.stats.engagementScore}/100</span></span>
                      <span>{userTimeline.stats.totalEvents} events</span>
                      <span>{userTimeline.stats.questionsAsked} questions</span>
                      <span>{userTimeline.stats.documentsUploaded} documents</span>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => {
                    setTimelineUser(null)
                    setUserTimeline(null)
                  }}
                  style={{
                    color: '#6b7280',
                    backgroundColor: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '1.5rem',
                    padding: '0.5rem'
                  }}
                >
                  ×
                </button>
              </div>

              {loadingTimeline ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3rem' }}>
                  <RefreshCw size={32} style={{ animation: 'spin 1s linear infinite', color: '#6b7280' }} />
                  <span style={{ marginLeft: '0.5rem', color: '#6b7280' }}>Loading timeline...</span>
                </div>
              ) : userTimeline ? (
                <div style={{ position: 'relative' }}>
                  {userTimeline.timeline.map((event, index) => (
                    <div key={event.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', paddingBottom: '1rem', position: 'relative' }}>
                      {index < userTimeline.timeline.length - 1 && (
                        <div style={{
                          position: 'absolute',
                          left: '1rem',
                          top: '2rem',
                          width: '1px',
                          height: '100%',
                          backgroundColor: '#e5e7eb'
                        }}></div>
                      )}
                      
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '2rem',
                        height: '2rem',
                        backgroundColor: 'white',
                        border: '2px solid #e5e7eb',
                        borderRadius: '50%',
                        position: 'relative',
                        zIndex: 1
                      }}>
                        {getEventIcon(event.type)}
                      </div>
                      
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <p style={{ fontSize: '0.875rem', fontWeight: '600', color: '#111827' }}>{event.title}</p>
                          <p style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                            {formatDate(event.timestamp)}
                          </p>
                        </div>
                        
                        <div style={{ marginTop: '0.25rem' }}>
                          <p style={{ fontSize: '0.875rem', color: '#6b7280', lineHeight: '1.4' }}>
                            {event.description.length > 100 ? `${event.description.substring(0, 100)}...` : event.description}
                          </p>
                          
                          {event.type === 'document_upload' && event.metadata && (
                            <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#9ca3af', display: 'flex', gap: '1rem' }}>
                              <span>Size: {formatFileSize(event.metadata.size)}</span>
                              <span>Type: {event.metadata.type}</span>
                            </div>
                          )}
                          
                          {event.type === 'chat_session' && event.metadata && (
                            <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#9ca3af' }}>
                              Duration: {event.metadata.duration} minutes
                            </div>
                          )}
                          
                          {event.type === 'question' && event.metadata?.sources && (
                            <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#9ca3af' }}>
                              Referenced {event.metadata.sources.length} document(s)
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '2rem' }}>
                  <p style={{ color: '#6b7280' }}>No timeline data available</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}