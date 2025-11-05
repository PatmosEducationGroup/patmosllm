-- Migration: Enable RLS on invitation-related tables
-- Created: 2025-10-22
-- Description: Fixes security vulnerability by enabling RLS on user_invitation_quotas and user_sent_invitations_log

-- ============================================
-- user_invitation_quotas
-- ============================================

-- Enable RLS
ALTER TABLE public.user_invitation_quotas ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own quota
CREATE POLICY "Users can view their own invitation quota"
ON public.user_invitation_quotas
FOR SELECT
TO authenticated
USING (auth_user_id = auth.uid());

-- Policy: Admins can view all quotas
CREATE POLICY "Admins can view all invitation quotas"
ON public.user_invitation_quotas
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.users
        WHERE users.auth_user_id = auth.uid()
        AND users.role IN ('ADMIN', 'SUPER_ADMIN')
    )
);

-- Policy: Admins can update quotas
CREATE POLICY "Admins can update invitation quotas"
ON public.user_invitation_quotas
FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.users
        WHERE users.auth_user_id = auth.uid()
        AND users.role IN ('ADMIN', 'SUPER_ADMIN')
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.users
        WHERE users.auth_user_id = auth.uid()
        AND users.role IN ('ADMIN', 'SUPER_ADMIN')
    )
);

-- Policy: Admins can insert quotas (for new users)
CREATE POLICY "Admins can insert invitation quotas"
ON public.user_invitation_quotas
FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.users
        WHERE users.auth_user_id = auth.uid()
        AND users.role IN ('ADMIN', 'SUPER_ADMIN')
    )
);

-- ============================================
-- user_sent_invitations_log
-- ============================================

-- Enable RLS
ALTER TABLE public.user_sent_invitations_log ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own sent invitations
CREATE POLICY "Users can view their own sent invitations"
ON public.user_sent_invitations_log
FOR SELECT
TO authenticated
USING (sender_auth_user_id = auth.uid());

-- Policy: Users can insert their own sent invitations
CREATE POLICY "Users can insert their own sent invitations"
ON public.user_sent_invitations_log
FOR INSERT
TO authenticated
WITH CHECK (sender_auth_user_id = auth.uid());

-- Policy: Admins can view all sent invitations
CREATE POLICY "Admins can view all sent invitations"
ON public.user_sent_invitations_log
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.users
        WHERE users.auth_user_id = auth.uid()
        AND users.role IN ('ADMIN', 'SUPER_ADMIN')
    )
);

-- Policy: Admins can update sent invitations (e.g., mark as accepted)
CREATE POLICY "Admins can update sent invitations"
ON public.user_sent_invitations_log
FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.users
        WHERE users.auth_user_id = auth.uid()
        AND users.role IN ('ADMIN', 'SUPER_ADMIN')
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.users
        WHERE users.auth_user_id = auth.uid()
        AND users.role IN ('ADMIN', 'SUPER_ADMIN')
    )
);

-- Add comments
COMMENT ON POLICY "Users can view their own invitation quota" ON public.user_invitation_quotas
IS 'Allows users to view their own invitation quota';

COMMENT ON POLICY "Admins can view all invitation quotas" ON public.user_invitation_quotas
IS 'Allows admins to view all user invitation quotas';

COMMENT ON POLICY "Admins can update invitation quotas" ON public.user_invitation_quotas
IS 'Allows admins to modify user invitation quotas';

COMMENT ON POLICY "Admins can insert invitation quotas" ON public.user_invitation_quotas
IS 'Allows admins to create invitation quotas for new users';

COMMENT ON POLICY "Users can view their own sent invitations" ON public.user_sent_invitations_log
IS 'Allows users to view their own sent invitation history';

COMMENT ON POLICY "Users can insert their own sent invitations" ON public.user_sent_invitations_log
IS 'Allows users to log their sent invitations';

COMMENT ON POLICY "Admins can view all sent invitations" ON public.user_sent_invitations_log
IS 'Allows admins to view all sent invitation logs';

COMMENT ON POLICY "Admins can update sent invitations" ON public.user_sent_invitations_log
IS 'Allows admins to update invitation log status';
