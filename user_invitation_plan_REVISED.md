# Gmail-Style User Invitation System - REVISED IMPLEMENTATION PLAN

## ✅ COMPLETED: Supabase-Only Foundation (October 2024)

**Status**: Admin invitation route successfully converted to 100% Supabase Auth

### What's Been Completed:
1. ✅ **Removed all Clerk logic** from `/api/admin/invite` route
2. ✅ **Updated email system** - removed `clerkTicket` parameter from `sendInvitationEmail()`
3. ✅ **Updated user status detection** - uses `auth_user_id` instead of `clerk_id`
4. ✅ **End-to-end tested** - invitation created → email received → account created → login successful
5. ✅ **Database schema updated** - new users created without `clerk_id` fields

**Result**: The invitation system now creates pure Supabase Auth users with no Clerk dependencies.

---

## 🎯 Executive Summary

This plan implements a **quota-based user invitation system** that integrates with the existing (now Supabase-only) invitation infrastructure while adding self-service quota management for users.

### Key Decisions

1. ✅ **~~Force Clerk Migration First~~**: **COMPLETED** - Admin invite route is now 100% Supabase Auth
2. **Reuse Existing Infrastructure**: Leverage existing `/api/admin/invite` endpoints and `users.invitation_token` system
3. **Add Quota Layer**: New quota tables track user invitation limits
4. ✅ **Supabase Auth Only**: **COMPLETED** - New invitations only work with Supabase Auth (Clerk removed)
5. **User Self-Service**: New `/settings/invitations` page for users to manage their own invitations

---

## 🚀 Phase 1: Force Clerk Migration (OPTIONAL - For Existing Clerk Users)

**NOTE**: This phase is OPTIONAL because:
- ✅ The admin invitation system is already 100% Supabase Auth
- ✅ New user invitations work without any Clerk dependencies
- You can implement the quota system immediately without forcing migration

However, if you want to force remaining Clerk users to migrate before implementing quotas:

### Step 1.1: Make Migration Modal Non-Dismissible

**File**: `/src/app/migrate-password/page.tsx`

**Changes Required**:
1. Remove any close/dismiss buttons
2. Prevent ESC key from closing
3. Block navigation away from page until migration complete
4. Add prominent messaging: "You must migrate to continue using Multiply Tools"

**Modified Component**:
```typescript
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function MigratePasswordPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // CRITICAL: Block all navigation attempts
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = 'You must migrate your account to continue using Multiply Tools'
      return 'You must migrate your account to continue using Multiply Tools'
    }

    // Block browser back button
    const handlePopState = () => {
      router.push('/migrate-password')
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    window.addEventListener('popstate', handlePopState)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      window.removeEventListener('popstate', handlePopState)
    }
  }, [router])

  // Block ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
      }
    }

    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [])

  const handleMigration = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    setLoading(true)

    try {
      // Call migration API
      const response = await fetch('/api/auth/complete-migration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      })

      const data = await response.json()

      if (data.success) {
        // Migration complete - sign in with Supabase
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password
        })

        if (signInError) {
          setError('Migration succeeded but sign-in failed. Please try logging in manually.')
        } else {
          // Success - redirect to chat
          router.push('/chat')
        }
      } else {
        setError(data.error || 'Migration failed')
      }
    } catch (err) {
      setError('Migration failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-200 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Non-dismissible warning banner */}
        <div className="mb-4 bg-yellow-100 border-2 border-yellow-500 rounded-xl p-4">
          <p className="text-sm font-bold text-yellow-900">
            ⚠️ MIGRATION REQUIRED
          </p>
          <p className="text-xs text-yellow-800 mt-1">
            You must complete this migration to continue using Multiply Tools. This page cannot be closed.
          </p>
        </div>

        <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-2xl p-8 border border-neutral-200/40">
          <div className="text-center mb-6">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-400 to-primary-500 flex items-center justify-center text-white text-2xl font-bold mb-4 mx-auto shadow-2xl">
              MT
            </div>
            <h1 className="text-2xl font-bold text-neutral-800 mb-2">
              Complete Your Migration
            </h1>
            <p className="text-neutral-600">
              Set a new password for your Multiply Tools account
            </p>
          </div>

          <form onSubmit={handleMigration} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                Your Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2 border border-neutral-200/60 rounded-xl focus:border-primary-400 focus:ring-2 focus:ring-primary-200"
                placeholder="your@email.com"
                required
                disabled={loading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                New Password (min 8 characters)
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2 border border-neutral-200/60 rounded-xl focus:border-primary-400 focus:ring-2 focus:ring-primary-200"
                placeholder="••••••••"
                required
                minLength={8}
                disabled={loading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                Confirm Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-2 border border-neutral-200/60 rounded-xl focus:border-primary-400 focus:ring-2 focus:ring-primary-200"
                placeholder="••••••••"
                required
                minLength={8}
                disabled={loading}
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white font-medium py-3 rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Migrating...' : 'Complete Migration & Continue'}
            </button>

            <p className="text-xs text-neutral-500 text-center mt-4">
              After migration, you'll use this password to sign in instead of your previous authentication method.
            </p>
          </form>
        </div>
      </div>
    </div>
  )
}
```

### Step 1.2: Verify Middleware Enforces Migration

**File**: `/src/middleware.ts` (lines 148-154)

The middleware already redirects unmigrated Clerk users to `/migrate-password`:

```typescript
// If user is NOT migrated, force them to migrate-password page
if (migrationStatus && !migrationStatus.migrated) {
  // Allow access to migrate-password page itself
  if (!req.nextUrl.pathname.startsWith('/migrate-password')) {
    return NextResponse.redirect(new URL('/migrate-password', req.url))
  }
}
```

**No changes needed** - this is perfect!

### Step 1.3: Update Migration Complete API

**File**: `/src/app/api/auth/complete-migration/route.ts`

Ensure this endpoint:
1. Validates email + password
2. Calls Supabase Auth to set password
3. Marks user as migrated in `user_migration` table
4. Returns success response

---

## 📊 Phase 2: Database Schema (Quota Tables Only)

We'll add **quota management tables** that integrate with the existing invitation system.

### Table 1: `user_invitation_quotas`

```sql
CREATE TABLE user_invitation_quotas (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  auth_user_id UUID,  -- Nullable for migration period
  total_invites_granted INTEGER NOT NULL DEFAULT 3,
  invites_used INTEGER NOT NULL DEFAULT 0,
  invites_remaining INTEGER GENERATED ALWAYS AS (
    GREATEST(total_invites_granted - invites_used, 0)
  ) STORED,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraint: At least one auth identifier must exist
  CONSTRAINT check_auth_identifier CHECK (
    auth_user_id IS NOT NULL OR EXISTS (
      SELECT 1 FROM users WHERE id = user_id AND clerk_id IS NOT NULL
    )
  )
);

CREATE INDEX idx_user_invitation_quotas_user_id ON user_invitation_quotas(user_id);
CREATE INDEX idx_user_invitation_quotas_auth_user_id ON user_invitation_quotas(auth_user_id);
```

### Table 2: `user_sent_invitations_log`

Links to existing `users.invitation_token` system:

```sql
CREATE TABLE user_sent_invitations_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender_auth_user_id UUID,  -- Nullable during migration
  invited_user_id UUID REFERENCES users(id) ON DELETE SET NULL,  -- Link to created user
  invitee_email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending, accepted, expired, revoked
  sent_by_admin BOOLEAN NOT NULL DEFAULT false,  -- Admin invites don't count against quota
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  accepted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT check_status CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  CONSTRAINT check_email_format CHECK (position('@' IN invitee_email) > 1)
);

CREATE INDEX idx_user_sent_invitations_sender ON user_sent_invitations_log(sender_user_id);
CREATE INDEX idx_user_sent_invitations_invited ON user_sent_invitations_log(invited_user_id);
CREATE INDEX idx_user_sent_invitations_email ON user_sent_invitations_log(invitee_email);
CREATE INDEX idx_user_sent_invitations_status ON user_sent_invitations_log(status);
```

### Trigger: Auto-create Quota on User Signup

```sql
CREATE OR REPLACE FUNCTION create_user_quota_on_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO user_invitation_quotas (user_id, auth_user_id)
  VALUES (NEW.id, NEW.auth_user_id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_create_quota_on_signup
  AFTER INSERT ON users
  FOR EACH ROW
  EXECUTE FUNCTION create_user_quota_on_signup();
```

### Backfill: Create Quotas for Existing Users

```sql
INSERT INTO user_invitation_quotas (user_id, auth_user_id)
SELECT id, auth_user_id
FROM users
WHERE deleted_at IS NULL
ON CONFLICT (user_id) DO NOTHING;
```

---

## 🔧 Phase 3: API Integration (Reuse Existing + Add Quota Layer)

### Strategy: Wrap Existing Invitation APIs

Instead of creating entirely new endpoints, we'll:
1. Keep existing `/api/admin/invite` for admin use (unlimited)
2. Create NEW `/api/user/invitations/*` for user self-service (quota-limited)
3. Both use the same underlying invitation system

### API 1: `GET /api/user/invitations/quota`

Returns current user's quota status.

```typescript
// File: /src/app/api/user/invitations/quota/route.ts
import { getCurrentUser } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { NextResponse } from 'next/server'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Admins get unlimited quota
  if (['ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
    return NextResponse.json({
      total_invites_granted: 999999,
      invites_used: 0,
      invites_remaining: 999999,
      is_admin: true
    })
  }

  // Regular users - fetch from quota table
  const { data: quota, error } = await supabaseAdmin
    .from('user_invitation_quotas')
    .select('total_invites_granted, invites_used, invites_remaining')
    .eq('user_id', user.id)
    .single()

  if (error || !quota) {
    // No quota found - create default
    await supabaseAdmin
      .from('user_invitation_quotas')
      .insert({ user_id: user.id, auth_user_id: user.auth_user_id })
      .select()
      .single()

    return NextResponse.json({
      total_invites_granted: 3,
      invites_used: 0,
      invites_remaining: 3,
      is_admin: false
    })
  }

  return NextResponse.json({
    ...quota,
    is_admin: false
  })
}
```

### API 2: `POST /api/user/invitations/send`

Sends invitation with quota check.

```typescript
// File: /src/app/api/user/invitations/send/route.ts
import { getCurrentUser } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { sendInvitationEmail } from '@/lib/email'  // Reuse existing function!
import { NextResponse } from 'next/server'

// In-memory rate limiting (TODO: Migrate to Upstash Redis)
const invitationRateLimit = new Map<string, number[]>()
const RATE_LIMIT_WINDOW = 60 * 60 * 1000 // 1 hour
const RATE_LIMIT_MAX = 10

export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { email } = await req.json()

  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
  }

  const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(user.role)

  // Rate limiting (skip for admins)
  if (!isAdmin) {
    const now = Date.now()
    const userKey = user.id
    const timestamps = invitationRateLimit.get(userKey) || []
    const recentTimestamps = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW)

    if (recentTimestamps.length >= RATE_LIMIT_MAX) {
      const oldestTimestamp = recentTimestamps[0]
      const resetIn = Math.ceil((RATE_LIMIT_WINDOW - (now - oldestTimestamp)) / 1000)
      return NextResponse.json({
        error: `Rate limit exceeded. Try again in ${Math.ceil(resetIn / 60)} minutes.`,
        resetIn
      }, { status: 429 })
    }

    recentTimestamps.push(now)
    invitationRateLimit.set(userKey, recentTimestamps)
  }

  // Quota check (skip for admins)
  if (!isAdmin) {
    const { data: quota } = await supabaseAdmin
      .from('user_invitation_quotas')
      .select('invites_remaining')
      .eq('user_id', user.id)
      .single()

    if (!quota || quota.invites_remaining <= 0) {
      return NextResponse.json({
        error: 'No invitations remaining. Contact an admin for more invites.',
        quota_remaining: quota?.invites_remaining || 0
      }, { status: 403 })
    }
  }

  // REUSE EXISTING INVITATION SYSTEM
  // Call existing admin invite API internally
  try {
    const inviteResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/admin/invite`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Request': 'true',  // Mark as internal
        'X-Sender-User-Id': user.id    // Pass sender for quota tracking
      },
      body: JSON.stringify({
        email,
        role: 'USER',
        sendEmail: true
      })
    })

    const inviteData = await inviteResponse.json()

    if (!inviteData.success) {
      return NextResponse.json({ error: inviteData.error }, { status: 400 })
    }

    // Log invitation to tracking table (unless sent by admin)
    await supabaseAdmin
      .from('user_sent_invitations_log')
      .insert({
        sender_user_id: user.id,
        sender_auth_user_id: user.auth_user_id,
        invitee_email: email.toLowerCase(),
        sent_by_admin: isAdmin
      })

    // Increment quota usage (unless sent by admin)
    if (!isAdmin) {
      await supabaseAdmin
        .from('user_invitation_quotas')
        .update({ invites_used: supabaseAdmin.raw('invites_used + 1') })
        .eq('user_id', user.id)
    }

    return NextResponse.json({
      success: true,
      invitation: {
        email: email.toLowerCase(),
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      }
    })
  } catch (error) {
    console.error('Invitation send error:', error)
    return NextResponse.json({ error: 'Failed to send invitation' }, { status: 500 })
  }
}
```

### API 3: `GET /api/user/invitations`

Lists user's sent invitations.

```typescript
// File: /src/app/api/user/invitations/route.ts
import { getCurrentUser } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { NextResponse } from 'next/server'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Auto-expire invitations before returning
  await expireInvitations()

  // Fetch user's sent invitations
  const { data: invitations, error } = await supabaseAdmin
    .from('user_sent_invitations_log')
    .select('*')
    .eq('sender_user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch invitations' }, { status: 500 })
  }

  return NextResponse.json({
    invitations: invitations || []
  })
}

async function expireInvitations() {
  const { data: expired } = await supabaseAdmin
    .from('user_sent_invitations_log')
    .select('id, sender_user_id, sent_by_admin')
    .eq('status', 'pending')
    .lt('expires_at', new Date().toISOString())

  if (expired && expired.length > 0) {
    // Mark as expired
    await supabaseAdmin
      .from('user_sent_invitations_log')
      .update({ status: 'expired' })
      .in('id', expired.map(e => e.id))

    // Refund quota for non-admin invitations
    for (const exp of expired) {
      if (!exp.sent_by_admin) {
        await supabaseAdmin
          .from('user_invitation_quotas')
          .update({ invites_used: supabaseAdmin.raw('GREATEST(invites_used - 1, 0)') })
          .eq('user_id', exp.sender_user_id)
      }
    }
  }
}
```

### API 4: `DELETE /api/user/invitations/revoke`

Revokes pending invitation (NO quota refund).

```typescript
// File: /src/app/api/user/invitations/revoke/route.ts
import { getCurrentUser } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { NextResponse } from 'next/server'

export async function DELETE(req: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const invitationId = searchParams.get('id')

  if (!invitationId) {
    return NextResponse.json({ error: 'Missing invitation ID' }, { status: 400 })
  }

  // Verify ownership and status
  const { data: invitation } = await supabaseAdmin
    .from('user_sent_invitations_log')
    .select('*')
    .eq('id', invitationId)
    .eq('sender_user_id', user.id)
    .eq('status', 'pending')
    .single()

  if (!invitation) {
    return NextResponse.json({ error: 'Invitation not found or already processed' }, { status: 404 })
  }

  // Revoke (NO quota refund - prevents abuse)
  await supabaseAdmin
    .from('user_sent_invitations_log')
    .update({
      status: 'revoked',
      revoked_at: new Date().toISOString()
    })
    .eq('id', invitationId)

  return NextResponse.json({
    success: true,
    message: 'Invitation revoked (quota not refunded)'
  })
}
```

---

## 🎨 Phase 4: Frontend UI

### Page 1: `/settings/invitations/page.tsx`

User-facing invitation management page.

**Features**:
- Quota display with progress bar
- Email input + "Send Invitation" button
- Table of sent invitations (status, actions)

```typescript
'use client'

import { useState, useEffect } from 'react'
import { Gift, Send, Copy, X } from 'lucide-react'

interface Invitation {
  id: string
  invitee_email: string
  status: 'pending' | 'accepted' | 'expired' | 'revoked'
  sent_at: string
  expires_at: string
  accepted_at?: string
}

export default function InvitationsPage() {
  const [quota, setQuota] = useState({ total: 3, used: 0, remaining: 3, isAdmin: false })
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    loadQuota()
    loadInvitations()
  }, [])

  const loadQuota = async () => {
    const res = await fetch('/api/user/invitations/quota')
    const data = await res.json()
    setQuota({
      total: data.total_invites_granted,
      used: data.invites_used,
      remaining: data.invites_remaining,
      isAdmin: data.is_admin
    })
  }

  const loadInvitations = async () => {
    const res = await fetch('/api/user/invitations')
    const data = await res.json()
    setInvitations(data.invitations || [])
  }

  const handleSendInvitation = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)

    try {
      const res = await fetch('/api/user/invitations/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      })

      const data = await res.json()

      if (res.ok) {
        setSuccess(`Invitation sent to ${email}!`)
        setEmail('')
        loadQuota()
        loadInvitations()
      } else {
        setError(data.error || 'Failed to send invitation')
      }
    } catch (err) {
      setError('Failed to send invitation')
    } finally {
      setLoading(false)
    }
  }

  const handleRevoke = async (id: string) => {
    if (!confirm('Revoke this invitation? Quota will NOT be refunded.')) return

    const res = await fetch(`/api/user/invitations/revoke?id=${id}`, { method: 'DELETE' })

    if (res.ok) {
      loadInvitations()
    } else {
      alert('Failed to revoke invitation')
    }
  }

  const handleCopyLink = (email: string) => {
    // TODO: Get invitation token from backend
    navigator.clipboard.writeText(`${window.location.origin}/invite/{token}`)
    setSuccess('Invitation link copied!')
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-neutral-800 flex items-center gap-2">
          <Gift className="w-8 h-8 text-primary-500" />
          Invite Friends
        </h1>
        <p className="text-neutral-600 mt-2">
          Share Multiply Tools with friends and colleagues
        </p>
      </div>

      {/* Quota Display */}
      <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
        <h2 className="text-lg font-semibold text-neutral-800 mb-4">
          Your Invitation Quota
        </h2>

        {quota.isAdmin ? (
          <div className="bg-gradient-to-r from-purple-50 to-purple-100 border border-purple-200 rounded-lg p-4">
            <p className="text-purple-900 font-semibold">
              ♾️ Unlimited Invitations (Admin)
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-neutral-600">
                {quota.used} / {quota.total} invitations used
              </span>
              <span className="text-sm font-semibold text-primary-600">
                {quota.remaining} remaining
              </span>
            </div>

            <div className="w-full bg-neutral-200 rounded-full h-3 overflow-hidden">
              <div
                className="bg-gradient-to-r from-primary-400 to-primary-600 h-full transition-all duration-300"
                style={{ width: `${(quota.used / quota.total) * 100}%` }}
              />
            </div>

            {quota.remaining === 0 && (
              <p className="text-xs text-neutral-500 mt-2">
                Out of invitations? Contact an admin for more.
              </p>
            )}
          </>
        )}
      </div>

      {/* Send Invitation Form */}
      <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
        <h2 className="text-lg font-semibold text-neutral-800 mb-4">
          Send New Invitation
        </h2>

        <form onSubmit={handleSendInvitation} className="flex gap-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="friend@example.com"
            className="flex-1 px-4 py-2 border border-neutral-300 rounded-lg focus:border-primary-400 focus:ring-2 focus:ring-primary-200"
            required
            disabled={loading || (quota.remaining === 0 && !quota.isAdmin)}
          />
          <button
            type="submit"
            disabled={loading || (quota.remaining === 0 && !quota.isAdmin)}
            className="bg-gradient-to-r from-primary-500 to-primary-600 text-white px-6 py-2 rounded-lg font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg transition-all"
          >
            <Send className="w-4 h-4" />
            {loading ? 'Sending...' : 'Send Invitation'}
          </button>
        </form>

        {error && (
          <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {success && (
          <div className="mt-3 bg-green-50 border border-green-200 rounded-lg p-3">
            <p className="text-sm text-green-600">{success}</p>
          </div>
        )}
      </div>

      {/* Sent Invitations Table */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        <h2 className="text-lg font-semibold text-neutral-800 mb-4">
          Sent Invitations ({invitations.length})
        </h2>

        {invitations.length === 0 ? (
          <p className="text-neutral-500 text-center py-8">
            No invitations sent yet
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-neutral-200">
                  <th className="text-left py-3 px-2 text-sm font-medium text-neutral-600">Email</th>
                  <th className="text-left py-3 px-2 text-sm font-medium text-neutral-600">Status</th>
                  <th className="text-left py-3 px-2 text-sm font-medium text-neutral-600">Sent</th>
                  <th className="text-right py-3 px-2 text-sm font-medium text-neutral-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {invitations.map((inv) => (
                  <tr key={inv.id} className="border-b border-neutral-100">
                    <td className="py-3 px-2 text-sm text-neutral-800">{inv.invitee_email}</td>
                    <td className="py-3 px-2">
                      <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${
                        inv.status === 'accepted' ? 'bg-green-100 text-green-700' :
                        inv.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                        inv.status === 'expired' ? 'bg-neutral-100 text-neutral-600' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {inv.status}
                      </span>
                    </td>
                    <td className="py-3 px-2 text-sm text-neutral-600">
                      {new Date(inv.sent_at).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-2 text-right">
                      {inv.status === 'pending' && (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleCopyLink(inv.invitee_email)}
                            className="p-2 text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                            title="Copy invitation link"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleRevoke(inv.id)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Revoke invitation"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
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
  )
}
```

### Update Settings Navigation

**File**: `/src/app/settings/layout.tsx`

Add invitations link:

```typescript
import { Gift } from 'lucide-react'

const navigationItems = [
  { name: 'Settings Home', href: '/settings', icon: Home, isHome: true },
  { name: 'Donate', href: '/settings/donate', icon: Heart },
  { name: 'Profile', href: '/settings/profile', icon: User },
  { name: 'Email Preferences', href: '/settings/email-preferences', icon: Mail },
  { name: 'Invitations', href: '/settings/invitations', icon: Gift }, // ← ADD THIS
  { name: 'Stats', href: '/settings/stats', icon: BarChart3 },
  // ... rest
]
```

---

## 🔐 Security Notes

### Rate Limiting
- **Current**: In-memory Map (10/hour per user)
- **TODO**: Migrate to Upstash Redis (already installed in package.json)

### SQL Injection Prevention
- All queries use parameterized Supabase client calls
- Email validation at database level (CHECK constraint)

### GDPR Compliance
- Invitations cascade delete with user account
- Email addresses stored for legitimate service operation
- Consider adding to privacy audit log for tracking

---

## 📋 Implementation Checklist

### Phase 0: Foundation (COMPLETED ✅)
- [x] Remove Clerk logic from `/api/admin/invite` route
- [x] Update `sendInvitationEmail()` to remove `clerkTicket` parameter
- [x] Update user status detection to use `auth_user_id`
- [x] Test end-to-end invitation flow (create → email → signup → login)
- [x] Verify new users created without `clerk_id` fields

### Phase 1: Force Migration (OPTIONAL - Only if migrating existing Clerk users)
- [ ] Update `/src/app/migrate-password/page.tsx` to be non-dismissible
- [ ] Test that middleware redirects unmigrated Clerk users
- [ ] Verify migration complete API works correctly
- [ ] Communicate to users about upcoming forced migration

### Phase 2: Database
- [ ] Create `user_invitation_quotas` table
- [ ] Create `user_sent_invitations_log` table
- [ ] Create quota creation trigger
- [ ] Backfill quotas for existing users

### Phase 3: API
- [ ] Create `/api/user/invitations/quota` (GET)
- [ ] Create `/api/user/invitations/send` (POST)
- [ ] Create `/api/user/invitations` (GET)
- [ ] Create `/api/user/invitations/revoke` (DELETE)
- [x] ~~Modify `/api/admin/invite` to accept internal requests~~ **Already Supabase-only**

### Phase 4: Frontend
- [ ] Create `/settings/invitations/page.tsx`
- [ ] Update `/settings/layout.tsx` navigation
- [ ] Add invitation quota widget (optional)

### Phase 5: Testing
- [ ] Test user sends invitation (quota decrements)
- [ ] Test invitation expiration (quota refunds)
- [ ] Test invitation revocation (no refund)
- [ ] Test admin unlimited invitations
- [ ] Test rate limiting (10/hour)

---

## 🎯 Success Criteria

1. ✅ **COMPLETED**: Admin invitation system is 100% Supabase Auth (Clerk removed)
2. ✅ **COMPLETED**: Invitation flow works end-to-end (tested successfully)
3. ✅ **COMPLETED**: New users created without Clerk dependencies
4. ⏳ Users can send invitations from `/settings/invitations`
5. ⏳ Quota system properly tracks usage
6. ⏳ Expired invitations refund quota automatically
7. ⏳ Revoked invitations do NOT refund quota
8. ⏳ Admins bypass quota system entirely
9. ⏳ Rate limiting prevents abuse (10/hour - TODO: implement Upstash Redis)
10. ⏳ Integration with existing invitation infrastructure works seamlessly

---

## 🚀 Estimated Timeline

**Foundation Work**: ✅ **COMPLETED** (Clerk removal: ~2 hours)

**Remaining Implementation**:
- **Phase 1** (Force Migration): 2-3 hours (OPTIONAL - only if needed)
- **Phase 2** (Database): 1 hour
- **Phase 3** (API): 2-3 hours
- **Phase 4** (Frontend): 2-3 hours
- **Phase 5** (Testing): 1-2 hours

**Total Remaining**: 6-10 hours (or 8-13 hours if forcing migration)
