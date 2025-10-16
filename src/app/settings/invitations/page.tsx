'use client'

import { useState, useEffect } from 'react'
import { Gift, Copy, XCircle, CheckCircle, Clock, Ban } from 'lucide-react'

interface Invitation {
  id: string
  invitee_email: string
  status: 'pending' | 'accepted' | 'expired' | 'revoked'
  expires_at: string
  sent_at: string
  accepted_at: string | null
}

interface Quota {
  total_invites_granted: number
  invites_used: number
  invites_remaining: number
  is_admin: boolean
}

export default function InvitationsPage() {
  const [quota, setQuota] = useState<Quota | null>(null)
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    loadQuota()
    loadInvitations()
  }, [])

  async function loadQuota() {
    try {
      const res = await fetch('/api/user/invitations/quota')
      if (res.ok) {
        const data = await res.json()
        setQuota(data)
      }
    } catch (_err) {
      console.error('Failed to load quota:', _err)
    }
  }

  async function loadInvitations() {
    try {
      const res = await fetch('/api/user/invitations')
      if (res.ok) {
        const data = await res.json()
        setInvitations(data.invitations)
      }
    } catch (_err) {
      console.error('Failed to load invitations:', _err)
    }
  }

  async function sendInvitation(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const res = await fetch('/api/user/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to send invitation')
        return
      }

      setSuccess(`Invitation sent to ${email}`)
      setEmail('')
      await loadQuota()
      await loadInvitations()
    } catch (_err) {
      setError('Failed to send invitation')
    } finally {
      setLoading(false)
    }
  }

  async function revokeInvitation(invitationId: string) {
    if (!confirm('Revoke this invitation? This will NOT refund your quota.')) {
      return
    }

    try {
      const res = await fetch(`/api/user/invitations?id=${invitationId}`, {
        method: 'DELETE'
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to revoke invitation')
        return
      }

      setSuccess('Invitation revoked')
      await loadInvitations()
    } catch (_err) {
      setError('Failed to revoke invitation')
    }
  }

  function copyInviteLink(token: string) {
    const url = `${window.location.origin}/signup?invite=${token}`
    navigator.clipboard.writeText(url)
    setSuccess('Invitation link copied to clipboard')
    setTimeout(() => setSuccess(null), 3000)
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-100 text-blue-800 text-xs font-medium">
            <Clock className="w-3 h-3" />
            Pending
          </span>
        )
      case 'accepted':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-green-100 text-green-800 text-xs font-medium">
            <CheckCircle className="w-3 h-3" />
            Accepted
          </span>
        )
      case 'expired':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-gray-100 text-gray-800 text-xs font-medium">
            <XCircle className="w-3 h-3" />
            Expired
          </span>
        )
      case 'revoked':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-red-100 text-red-800 text-xs font-medium">
            <Ban className="w-3 h-3" />
            Revoked
          </span>
        )
      default:
        return null
    }
  }

  if (!quota) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-sm text-gray-600">Loading invitations...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Invite Friends</h1>
        <p className="mt-1 text-sm text-gray-600">
          Share Multiply Tools with friends and colleagues
        </p>
      </div>

      {/* Error/Success Messages */}
      {error && (
        <div className="p-4 rounded-lg bg-red-50 border border-red-200">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {success && (
        <div className="p-4 rounded-lg bg-green-50 border border-green-200">
          <p className="text-sm text-green-800">{success}</p>
        </div>
      )}

      {/* Quota Card */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <Gift className="w-6 h-6 text-primary-600" />
          <h2 className="text-lg font-semibold text-gray-900">
            {quota.is_admin ? 'Unlimited Invitations' : 'Your Invitation Quota'}
          </h2>
        </div>

        {!quota.is_admin && (
          <>
            <div className="relative pt-1">
              <div className="flex mb-2 items-center justify-between">
                <div>
                  <span className="text-xs font-semibold inline-block text-primary-600">
                    {quota.invites_used} / {quota.total_invites_granted} used
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-xs font-semibold inline-block text-primary-600">
                    {quota.invites_remaining} remaining
                  </span>
                </div>
              </div>
              <div className="overflow-hidden h-2 mb-4 text-xs flex rounded bg-primary-200">
                <div
                  style={{
                    width: `${(quota.invites_used / quota.total_invites_granted) * 100}%`
                  }}
                  className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-primary-600"
                ></div>
              </div>
            </div>

            {quota.invites_remaining === 0 && (
              <p className="text-sm text-orange-600">
                You have used all your invitations. Contact an administrator for more.
              </p>
            )}
          </>
        )}

        {quota.is_admin && (
          <p className="text-sm text-gray-600">
            As an admin, you have unlimited invitations
          </p>
        )}
      </div>

      {/* Send Invitation Form */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Send Invitation</h3>

        <form onSubmit={sendInvitation} className="flex gap-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="friend@example.com"
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            required
            disabled={!quota.is_admin && quota.invites_remaining === 0}
          />
          <button
            type="submit"
            disabled={loading || (!quota.is_admin && quota.invites_remaining === 0)}
            className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Sending...' : 'Send Invitation'}
          </button>
        </form>
      </div>

      {/* Invitations List */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Sent Invitations</h3>
        </div>

        {invitations.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <Gift className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-600">No invitations sent yet</p>
            <p className="text-sm text-gray-500 mt-1">
              Send your first invitation to get started
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Sent
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Expires
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {invitations.map((inv) => (
                  <tr key={inv.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {inv.invitee_email}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(inv.status)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {new Date(inv.sent_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {new Date(inv.expires_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end gap-2">
                        {inv.status === 'pending' && (
                          <>
                            <button
                              onClick={() => copyInviteLink(inv.id)}
                              className="text-primary-600 hover:text-primary-900"
                              title="Copy invitation link"
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => revokeInvitation(inv.id)}
                              className="text-red-600 hover:text-red-900"
                              title="Revoke invitation"
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        {inv.status !== 'pending' && (
                          <span className="text-gray-400">—</span>
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
    </div>
  )
}
