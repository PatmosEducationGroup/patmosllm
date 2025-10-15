-- Verify email preferences were saved to database
-- Run this in Supabase SQL Editor

-- Check for your specific user's email preferences
SELECT
  id,
  user_id,
  auth_user_id,
  preferences,
  preferences->'emailPreferences' AS email_preferences_only,
  created_at,
  updated_at
FROM user_preferences
WHERE user_id = '8fe756a4-d5c4-4b6b-87d9-5ada1e579bff'
LIMIT 1;

-- Alternative: See all users' email preferences (formatted nicely)
SELECT
  up.user_id,
  u.email,
  up.preferences->'emailPreferences'->>'productUpdates' AS product_updates,
  up.preferences->'emailPreferences'->>'activitySummaries' AS activity_summaries,
  up.preferences->'emailPreferences'->>'tipsAndTricks' AS tips_and_tricks,
  up.preferences->'emailPreferences'->>'securityAlerts' AS security_alerts,
  up.updated_at
FROM user_preferences up
JOIN users u ON u.id = up.user_id
WHERE up.preferences->'emailPreferences' IS NOT NULL
ORDER BY up.updated_at DESC;

-- Check the privacy audit log to confirm the preference update was logged
SELECT
  action,
  metadata,
  created_at
FROM privacy_audit_log
WHERE user_id = '8fe756a4-d5c4-4b6b-87d9-5ada1e579bff'
  AND action = 'EMAIL_PREFERENCES_UPDATED'
ORDER BY created_at DESC
LIMIT 5;
