-- Migration: Add phone number and consent fields to waitlist_signups
-- Created: 2025-10-22
-- Description: Adds phone, email_consent, and sms_consent fields

-- Add new columns
ALTER TABLE public.waitlist_signups
ADD COLUMN IF NOT EXISTS phone TEXT,
ADD COLUMN IF NOT EXISTS email_consent BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS sms_consent BOOLEAN NOT NULL DEFAULT false;

-- Add phone number validation (optional field, but must be valid if provided)
ALTER TABLE public.waitlist_signups
ADD CONSTRAINT valid_phone CHECK (
  phone IS NULL OR
  phone ~ '^[\+]?[(]?[0-9]{1,4}[)]?[-\s\.]?[(]?[0-9]{1,4}[)]?[-\s\.]?[0-9]{1,9}$'
);

-- Add constraint: email_consent must be true for new signups
-- (This is enforced at application level, but adding comment for clarity)
COMMENT ON COLUMN public.waitlist_signups.phone IS 'Optional phone number for SMS notifications';
COMMENT ON COLUMN public.waitlist_signups.email_consent IS 'User consent to receive emails (required to submit form)';
COMMENT ON COLUMN public.waitlist_signups.sms_consent IS 'User consent to receive SMS messages (optional)';
