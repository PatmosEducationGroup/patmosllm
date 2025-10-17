'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw, UserPlus, Users, Gift } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { logError } from '@/lib/logger'

interface UserQuota {
  user_id: string
  email: string
  name: string | null
  role: string
  total_invites_granted: number
  invites_used: number
  invites_remaining: number
}

interface UserData {
  id: string
  role: string
  email: string
}

export default function InvitationQuotasPage() {
  const router = useRouter()
  const [quotas, setQuotas] = useState<UserQuota[]>([])
  const [currentUser, setCurrentUser] = useState<UserData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [accessDenied, setAccessDenied] = useState(false)

  // Grant to specific user
  const [selectedUserId, setSelectedUserId] = useState('')
  const [grantAmount, setGrantAmount] = useState(5)
  const [granting, setGranting] = useState(false)

  // Grant to all users
  const [grantAllAmount, setGrantAllAmount] = useState(5)
  const [grantAllRole, setGrantAllRole] = useState<string>('all')
  const [grantingAll, setGrantingAll] = useState(false)

  // Set quota (for disable/unlimited)
  const [setQuotaRole, setSetQuotaRole] = useState<string>('all')
  const [setQuotaValue, setSetQuotaValue] = useState(0)
  const [settingQuota, setSettingQuota] = useState(false)

  useEffect(() => {
    fetchUserData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchUserData = async () => {
    try {
      const userResponse = await fetch('/api/auth')

      if (userResponse.status === 401) {
        router.push('/login')
        return
      }

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

      if (!['ADMIN', 'SUPER_ADMIN'].includes(userData.user.role)) {
        setAccessDenied(true)
        setError('Access denied: You need admin permissions to manage quotas.')
        setLoading(false)
        return
      }

      loadQuotas()
    } catch (err) {
      logError(err instanceof Error ? err : new Error('Failed to fetch user data'), {
        operation: 'fetch_user_data',
        severity: 'critical'
      })
      setAccessDenied(true)
      setError('Access denied: Unable to verify your permissions.')
      setLoading(false)
    }
  }

  const loadQuotas = async () => {
    try {
      const response = await fetch('/api/admin/invitation-quotas')
      const data = await response.json()

      if (data.quotas) {
        setQuotas(data.quotas)
      } else {
        setError(data.error || 'Failed to load quotas')
      }
    } catch (err) {
      logError(err instanceof Error ? err : new Error('Failed to load quotas'), {
        operation: 'load_quotas',
        severity: 'high'
      })
      setError('Failed to load invitation quotas')
    } finally {
      setLoading(false)
    }
  }

  const handleGrantToUser = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedUserId || grantAmount <= 0) return

    setGranting(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch('/api/admin/invitation-quotas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'grant-to-user',
          userId: selectedUserId,
          addInvites: grantAmount
        })
      })

      const data = await response.json()

      if (data.success) {
        setSuccess(`Granted ${grantAmount} invitations successfully!`)
        setSelectedUserId('')
        setGrantAmount(5)
        await loadQuotas()
      } else {
        setError(data.error || 'Failed to grant invitations')
      }
    } catch (err) {
      logError(err instanceof Error ? err : new Error('Failed to grant invitations'), {
        operation: 'grant_to_user',
        severity: 'high'
      })
      setError('Failed to grant invitations')
    } finally {
      setGranting(false)
    }
  }

  const handleGrantToAll = async (e: React.FormEvent) => {
    e.preventDefault()
    if (grantAllAmount <= 0) return

    if (!confirm(`Grant ${grantAllAmount} invitations to ${grantAllRole === 'all' ? 'ALL USERS' : `all ${grantAllRole}s`}?`)) {
      return
    }

    setGrantingAll(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch('/api/admin/invitation-quotas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'grant-to-all',
          addInvites: grantAllAmount,
          onlyRole: grantAllRole === 'all' ? null : grantAllRole
        })
      })

      const data = await response.json()

      if (data.success) {
        setSuccess(`Granted ${grantAllAmount} invitations to ${data.users_updated} users!`)
        setGrantAllAmount(5)
        setGrantAllRole('all')
        await loadQuotas()
      } else {
        setError(data.error || 'Failed to grant invitations')
      }
    } catch (err) {
      logError(err instanceof Error ? err : new Error('Failed to grant invitations to all'), {
        operation: 'grant_to_all',
        severity: 'high'
      })
      setError('Failed to grant invitations to all users')
    } finally {
      setGrantingAll(false)
    }
  }

  const handleSetQuota = async (e: React.FormEvent) => {
    e.preventDefault()

    let confirmMessage = ''
    if (setQuotaValue === 0) {
      confirmMessage = `DISABLE invitations (set to 0) for ${setQuotaRole === 'all' ? 'ALL USERS' : `all ${setQuotaRole}s`}?`
    } else if (setQuotaValue >= 999999999) {
      confirmMessage = `Enable UNLIMITED invitations for ${setQuotaRole === 'all' ? 'ALL USERS' : `all ${setQuotaRole}s`}?`
    } else {
      confirmMessage = `Set quota to exactly ${setQuotaValue} for ${setQuotaRole === 'all' ? 'ALL USERS' : `all ${setQuotaRole}s`}?`
    }

    if (!confirm(confirmMessage)) {
      return
    }

    setSettingQuota(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch('/api/admin/invitation-quotas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'set-quota-for-all',
          setTotal: setQuotaValue,
          onlyRole: setQuotaRole === 'all' ? null : setQuotaRole
        })
      })

      const data = await response.json()

      if (data.success) {
        setSuccess(`${data.message} (${data.users_updated} users updated)`)
        setSetQuotaValue(0)
        setSetQuotaRole('all')
        await loadQuotas()
      } else {
        setError(data.error || 'Failed to set quota')
      }
    } catch (err) {
      logError(err instanceof Error ? err : new Error('Failed to set quota for all'), {
        operation: 'set_quota_for_all',
        severity: 'high'
      })
      setError('Failed to set quota for all users')
    } finally {
      setSettingQuota(false)
    }
  }

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'SUPER_ADMIN':
        return { bg: '#f0fdf4', color: '#059669' }
      case 'ADMIN':
        return { bg: '#fef2f2', color: '#dc2626' }
      case 'CONTRIBUTOR':
        return { bg: '#f0f9ff', color: '#0891b2' }
      default:
        return { bg: '#eff6ff', color: '#2563eb' }
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
        <RefreshCw className="animate-spin" />
      </div>
    )
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

  return (
    <div>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        <div style={{ marginBottom: '2rem' }}>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 'bold', color: '#111827', marginBottom: '0.5rem' }}>
            Invitation Quota Management
          </h1>
          <p style={{ color: '#6b7280' }}>
            Manage invitation quotas for all users
            {currentUser && (
              <span style={{ marginLeft: '1rem', fontSize: '0.875rem', color: '#2563eb' }}>
                Logged in as {currentUser.role}: {currentUser.email}
              </span>
            )}
          </p>
        </div>

        {/* Error/Success Messages */}
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

        {success && (
          <div style={{
            marginBottom: '1.5rem',
            padding: '1rem',
            backgroundColor: '#f0fdf4',
            border: '1px solid #86efac',
            color: '#16a34a',
            borderRadius: '0.375rem'
          }}>
            {success}
          </div>
        )}

        {/* Grant to Specific User */}
        <div style={{
          marginBottom: '2rem',
          padding: '1.5rem',
          backgroundColor: 'white',
          borderRadius: '0.5rem',
          border: '1px solid #e5e7eb'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <UserPlus size={20} className="text-blue-600" />
            <h2 style={{ fontSize: '1.25rem', fontWeight: '600' }}>Grant to Specific User</h2>
          </div>

          <form onSubmit={handleGrantToUser} style={{ display: 'flex', gap: '1rem', alignItems: 'end' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.5rem' }}>
                Select User
              </label>
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  fontSize: '0.875rem'
                }}
              >
                <option value="">Choose a user...</option>
                {quotas.map((quota) => (
                  <option key={quota.user_id} value={quota.user_id}>
                    {quota.name || quota.email} ({quota.role}) - {quota.invites_remaining} remaining
                  </option>
                ))}
              </select>
            </div>

            <div style={{ width: '150px' }}>
              <Input
                label="Invitations to Add"
                type="number"
                value={grantAmount}
                onChange={(e) => setGrantAmount(Number(e.target.value))}
                min={1}
                required
                size="sm"
              />
            </div>

            <Button
              type="submit"
              disabled={granting || !selectedUserId}
              style={{ marginBottom: '0.25rem' }}
            >
              {granting ? 'Granting...' : 'Grant'}
            </Button>
          </form>
        </div>

        {/* Grant to All Users */}
        <div style={{
          marginBottom: '2rem',
          padding: '1.5rem',
          backgroundColor: 'white',
          borderRadius: '0.5rem',
          border: '1px solid #e5e7eb'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <Users size={20} className="text-purple-600" />
            <h2 style={{ fontSize: '1.25rem', fontWeight: '600' }}>Grant to All Users</h2>
          </div>

          <form onSubmit={handleGrantToAll} style={{ display: 'flex', gap: '1rem', alignItems: 'end' }}>
            <div style={{ width: '200px' }}>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.5rem' }}>
                Filter by Role
              </label>
              <select
                value={grantAllRole}
                onChange={(e) => setGrantAllRole(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  fontSize: '0.875rem'
                }}
              >
                <option value="all">All Users</option>
                <option value="USER">Only USERs</option>
                <option value="CONTRIBUTOR">Only CONTRIBUTORs</option>
                <option value="ADMIN">Only ADMINs</option>
              </select>
            </div>

            <div style={{ width: '150px' }}>
              <Input
                label="Invitations to Add"
                type="number"
                value={grantAllAmount}
                onChange={(e) => setGrantAllAmount(Number(e.target.value))}
                min={1}
                required
                size="sm"
              />
            </div>

            <Button
              type="submit"
              disabled={grantingAll}
              variant="outline"
              style={{ marginBottom: '0.25rem' }}
            >
              {grantingAll ? 'Granting...' : 'Grant to All'}
            </Button>
          </form>

          <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.5rem' }}>
            💡 Use this to ADD invitations to existing quotas
          </p>
        </div>

        {/* Set Quota (Disable/Unlimited) */}
        <div style={{
          marginBottom: '2rem',
          padding: '1.5rem',
          backgroundColor: 'white',
          borderRadius: '0.5rem',
          border: '1px solid #e5e7eb'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <Gift size={20} className="text-red-600" />
            <h2 style={{ fontSize: '1.25rem', fontWeight: '600' }}>Set Exact Quota (Disable/Unlimited)</h2>
          </div>

          <form onSubmit={handleSetQuota} style={{ display: 'flex', gap: '1rem', alignItems: 'end' }}>
            <div style={{ width: '200px' }}>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.5rem' }}>
                Filter by Role
              </label>
              <select
                value={setQuotaRole}
                onChange={(e) => setSetQuotaRole(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  fontSize: '0.875rem'
                }}
              >
                <option value="all">All Users</option>
                <option value="USER">Only USERs</option>
                <option value="CONTRIBUTOR">Only CONTRIBUTORs</option>
                <option value="ADMIN">Only ADMINs</option>
              </select>
            </div>

            <div style={{ width: '200px' }}>
              <Input
                label="Set Total To"
                type="number"
                value={setQuotaValue}
                onChange={(e) => setSetQuotaValue(Number(e.target.value))}
                min={0}
                required
                size="sm"
              />
            </div>

            <Button
              type="submit"
              disabled={settingQuota}
              style={{ marginBottom: '0.25rem', backgroundColor: '#7c3aed', borderColor: '#7c3aed' }}
            >
              {settingQuota ? 'Setting...' : 'Set Quota'}
            </Button>
          </form>

          <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.5rem' }}>
            ⚠️ Use this to SET exact quota values (replaces current values). 0 = disable, 999999999 = unlimited
          </p>
        </div>

        {/* Quotas Table */}
        <div style={{ backgroundColor: 'white', borderRadius: '0.5rem', border: '1px solid #e5e7eb' }}>
          <div style={{ padding: '1.5rem', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Gift size={20} className="text-primary-600" />
              <h3 style={{ fontSize: '1.25rem', fontWeight: '600' }}>All User Quotas ({quotas.length})</h3>
            </div>
            <button
              onClick={loadQuotas}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.5rem 1rem',
                backgroundColor: 'transparent',
                border: '1px solid #e5e7eb',
                borderRadius: '0.375rem',
                cursor: 'pointer',
                fontSize: '0.875rem',
                color: '#6b7280'
              }}
            >
              <RefreshCw size={14} />
              Refresh
            </button>
          </div>

          {quotas.length === 0 ? (
            <div style={{ padding: '1.5rem', textAlign: 'center', color: '#6b7280' }}>
              No quotas found
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
                    <th style={{ padding: '0.75rem 1.5rem', textAlign: 'center', fontSize: '0.75rem', fontWeight: '500', color: '#6b7280', textTransform: 'uppercase' }}>
                      Total Granted
                    </th>
                    <th style={{ padding: '0.75rem 1.5rem', textAlign: 'center', fontSize: '0.75rem', fontWeight: '500', color: '#6b7280', textTransform: 'uppercase' }}>
                      Used
                    </th>
                    <th style={{ padding: '0.75rem 1.5rem', textAlign: 'center', fontSize: '0.75rem', fontWeight: '500', color: '#6b7280', textTransform: 'uppercase' }}>
                      Remaining
                    </th>
                    <th style={{ padding: '0.75rem 1.5rem', textAlign: 'center', fontSize: '0.75rem', fontWeight: '500', color: '#6b7280', textTransform: 'uppercase' }}>
                      Usage %
                    </th>
                  </tr>
                </thead>
                <tbody style={{ backgroundColor: 'white' }}>
                  {quotas.map((quota) => (
                    <tr key={quota.user_id} style={{ borderTop: '1px solid #e5e7eb' }}>
                      <td style={{ padding: '1rem 1.5rem' }}>
                        <div>
                          <div style={{ fontSize: '0.875rem', fontWeight: '500', color: '#111827' }}>
                            {quota.name || 'No name'}
                          </div>
                          <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                            {quota.email}
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '1rem 1.5rem' }}>
                        <span style={{
                          display: 'inline-flex',
                          padding: '0.25rem 0.5rem',
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          borderRadius: '9999px',
                          backgroundColor: getRoleColor(quota.role).bg,
                          color: getRoleColor(quota.role).color
                        }}>
                          {quota.role}
                        </span>
                      </td>
                      <td style={{ padding: '1rem 1.5rem', textAlign: 'center', fontSize: '0.875rem', color: '#6b7280' }}>
                        {quota.total_invites_granted}
                      </td>
                      <td style={{ padding: '1rem 1.5rem', textAlign: 'center', fontSize: '0.875rem', color: '#6b7280' }}>
                        {quota.invites_used}
                      </td>
                      <td style={{ padding: '1rem 1.5rem', textAlign: 'center' }}>
                        <span style={{
                          fontSize: '0.875rem',
                          fontWeight: '600',
                          color: quota.invites_remaining === 0 ? '#dc2626' : '#16a34a'
                        }}>
                          {quota.invites_remaining}
                        </span>
                      </td>
                      <td style={{ padding: '1rem 1.5rem', textAlign: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                          <div style={{
                            width: '60px',
                            height: '6px',
                            backgroundColor: '#e5e7eb',
                            borderRadius: '9999px',
                            overflow: 'hidden'
                          }}>
                            <div style={{
                              width: `${(quota.invites_used / quota.total_invites_granted) * 100}%`,
                              height: '100%',
                              backgroundColor: quota.invites_remaining === 0 ? '#dc2626' : '#2563eb',
                              transition: 'width 0.3s'
                            }} />
                          </div>
                          <span style={{ fontSize: '0.75rem', color: '#6b7280', minWidth: '35px' }}>
                            {Math.round((quota.invites_used / quota.total_invites_granted) * 100)}%
                          </span>
                        </div>
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
