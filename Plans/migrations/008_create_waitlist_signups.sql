-- Migration: Create waitlist_signups table for invitation-only system
-- Created: 2025-10-22
-- Description: Stores waitlist signups with name, email, and church/ministry affiliation

-- Create waitlist_signups table
CREATE TABLE IF NOT EXISTS public.waitlist_signups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    church_ministry_affiliation TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'invited', 'registered')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    invited_at TIMESTAMPTZ,
    registered_at TIMESTAMPTZ,
    notes TEXT,

    -- Constraints
    CONSTRAINT unique_email UNIQUE (email),
    CONSTRAINT valid_email CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

-- Create index on email for faster lookups
CREATE INDEX IF NOT EXISTS idx_waitlist_signups_email ON public.waitlist_signups(email);

-- Create index on status for filtering
CREATE INDEX IF NOT EXISTS idx_waitlist_signups_status ON public.waitlist_signups(status);

-- Create index on created_at for ordering
CREATE INDEX IF NOT EXISTS idx_waitlist_signups_created_at ON public.waitlist_signups(created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.waitlist_signups ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Allow public inserts (for the signup form)
CREATE POLICY "Allow public to insert waitlist signups"
ON public.waitlist_signups
FOR INSERT
TO public
WITH CHECK (true);

-- RLS Policy: Only admins can view waitlist signups
-- This requires the admin to be authenticated and have the admin role
CREATE POLICY "Allow admins to view waitlist signups"
ON public.waitlist_signups
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.users
        WHERE users.clerk_user_id = auth.uid()::text
        AND users.role IN ('ADMIN', 'SUPER_ADMIN')
    )
);

-- RLS Policy: Only admins can update waitlist signups
CREATE POLICY "Allow admins to update waitlist signups"
ON public.waitlist_signups
FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.users
        WHERE users.clerk_user_id = auth.uid()::text
        AND users.role IN ('ADMIN', 'SUPER_ADMIN')
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.users
        WHERE users.clerk_user_id = auth.uid()::text
        AND users.role IN ('ADMIN', 'SUPER_ADMIN')
    )
);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_waitlist_signups_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp;

CREATE TRIGGER trigger_update_waitlist_signups_updated_at
BEFORE UPDATE ON public.waitlist_signups
FOR EACH ROW
EXECUTE FUNCTION public.update_waitlist_signups_updated_at();

-- Add comments for documentation
COMMENT ON TABLE public.waitlist_signups IS 'Stores waitlist signups for the invitation-only system';
COMMENT ON COLUMN public.waitlist_signups.id IS 'Unique identifier for the signup';
COMMENT ON COLUMN public.waitlist_signups.name IS 'Full name of the person signing up';
COMMENT ON COLUMN public.waitlist_signups.email IS 'Email address (must be unique)';
COMMENT ON COLUMN public.waitlist_signups.church_ministry_affiliation IS 'Church or ministry organization affiliation';
COMMENT ON COLUMN public.waitlist_signups.status IS 'Signup status: pending, invited, or registered';
COMMENT ON COLUMN public.waitlist_signups.created_at IS 'Timestamp when the signup was created';
COMMENT ON COLUMN public.waitlist_signups.updated_at IS 'Timestamp when the signup was last updated';
COMMENT ON COLUMN public.waitlist_signups.invited_at IS 'Timestamp when invitation was sent';
COMMENT ON COLUMN public.waitlist_signups.registered_at IS 'Timestamp when user completed registration';
COMMENT ON COLUMN public.waitlist_signups.notes IS 'Optional admin notes about the signup';
