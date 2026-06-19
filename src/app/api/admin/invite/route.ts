import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/auth'
import { loggers, logError } from '@/lib/logger'

// =================================================================
// NOTE: Invitation creation lives at POST /api/admin/invitations, which writes
// to the invitation_tokens table that the redemption flow actually reads. The
// old POST here wrote to users.invitation_token (never read on acceptance) and
// has been removed. This route keeps only the user-listing GET and the
// active-user DELETE that the admin UI still uses.
// =================================================================

// =================================================================
// GET - Retrieve all users for admin management
// =================================================================
export async function GET(_request: NextRequest) {
  try {
    // =================================================================
    // Get authenticated user
    // =================================================================
    const user = await getCurrentUser()
    if (!user || !['ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
      return NextResponse.json(
        { success: false, error: 'Admin access required' },
        { status: 403 }
      )
    }

    // =================================================================
    // DATA RETRIEVAL - Get all users with invitation details (exclude deleted)
    // =================================================================
    const { data: users, error } = await supabaseAdmin
      .from('users')
      .select(`
        id,
        email,
        name,
        role,
        created_at,
        auth_user_id,
        invited_by,
        invitation_token,
        inviter:invited_by(email, name)
      `)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json(
        { success: false, error: 'Failed to fetch users' },
        { status: 500 }
      )
    }

    // =================================================================
    // DATA FORMATTING - Format user data for frontend display
    // =================================================================
    const formattedUsers = users.map(user => ({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      createdAt: user.created_at,
      isActive: !!user.auth_user_id, // Active if has Supabase Auth ID (completed signup)
      isPending: !user.auth_user_id && !!user.invitation_token, // Pending if has invitation but no auth_user_id
      invitedBy: (user.inviter as { email?: string })?.email || 'System',
      invitation_token: user.invitation_token
    }))

    return NextResponse.json({
      success: true,
      users: formattedUsers,
      total: users.length
    })

  } catch (error) {
    logError(error instanceof Error ? error : new Error('Internal server error'), {
      operation: 'API admin/invite',
      phase: 'request_handling',
      severity: 'high',
      errorContext: 'Internal server error'
    })
// =================================================================
    // ERROR HANDLING - Log errors and return user-friendly message
    // =================================================================
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch users'
      },
      { status: 500 }
    )
  }
}

// =================================================================
// DELETE - Remove pending invitation or delete active user
// =================================================================
export async function DELETE(_request: NextRequest) {
  try {
    // =================================================================
    // Get authenticated user
    // =================================================================
    const user = await getCurrentUser()
    if (!user || !['ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
      return NextResponse.json(
        { success: false, error: 'Admin access required' },
        { status: 403 }
      )
    }

    // =================================================================
    // INPUT VALIDATION - Get target user ID from request
    // =================================================================
    const { userId: targetUserId } = await _request.json()

    if (!targetUserId) {
      return NextResponse.json(
        { success: false, error: 'User ID required' },
        { status: 400 }
      )
    }

    // =================================================================
    // SELF-DELETION PREVENTION - Prevent admin from deleting themselves
    // =================================================================
    if (targetUserId === user.id) {
      return NextResponse.json(
        { success: false, error: 'Cannot delete your own account' },
        { status: 400 }
      )
    }

    // =================================================================
    // USER LOOKUP - Get target user info before deletion
    // =================================================================
    const { data: targetUser, error: fetchError } = await supabaseAdmin
      .from('users')
      .select('id, email, auth_user_id, role, invitation_token')
      .eq('id', targetUserId)
      .single()

    if (fetchError || !targetUser) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      )
    }

    // =================================================================
    // USER STATUS CHECK - Determine if pending invitation vs active user
    // =================================================================
    const isPendingInvitation = !targetUser.auth_user_id && !!targetUser.invitation_token

    // =================================================================
    // SOFT DELETE - Mark user as deleted (preserves data for audit trail)
    // =================================================================
    const { error: deleteError } = await supabaseAdmin
      .from('users')
      .update({
        deleted_at: new Date().toISOString(),
        // Anonymize email for privacy while keeping record
        email: `deleted_${targetUserId}@deleted.local`
      })
      .eq('id', targetUserId)

    if (deleteError) {
      logError(deleteError, {
        operation: 'delete_user',
        adminUserId: user.id,
        adminEmail: user.email,
        targetUserId,
        targetEmail: targetUser.email
      })
      return NextResponse.json(
        { success: false, error: 'Failed to delete user' },
        { status: 500 }
      )
    }

    // =================================================================
    // LOGGING - Log admin action for audit trail
    // =================================================================
    const actionType = isPendingInvitation ? 'retracted invitation for' : 'deleted user'
    loggers.security({
      operation: isPendingInvitation ? 'admin_retract_invitation' : 'admin_delete_user',
      adminUserId: user.id,
      adminEmail: user.email,
      targetUserId,
      targetEmail: targetUser.email,
      wasPendingInvitation: isPendingInvitation
    }, `Admin ${actionType} user`)

    // =================================================================
    // SUCCESS RESPONSE - Return deletion confirmation
    // =================================================================
    return NextResponse.json({
      success: true,
      message: isPendingInvitation
        ? `Invitation for ${targetUser.email} has been retracted`
        : `User ${targetUser.email} has been deleted`,
      deletedUser: {
        email: targetUser.email,
        id: targetUser.id,
        wasPendingInvitation: isPendingInvitation
      }
    })

  } catch (error) {
    logError(error instanceof Error ? error : new Error('Internal server error'), {
      operation: 'API admin/invite',
      phase: 'request_handling',
      severity: 'high',
      errorContext: 'Internal server error'
    })
// =================================================================
    // ERROR HANDLING - Log errors and return user-friendly message
    // =================================================================
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to delete user'
      },
      { status: 500 }
    )
  }
}
