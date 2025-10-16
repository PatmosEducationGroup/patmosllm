-- Check deletion status for test user
SELECT
  id,
  email,
  deleted_at,
  CASE
    WHEN deleted_at IS NULL THEN 'Active'
    WHEN deleted_at > NOW() THEN 'Scheduled for deletion'
    ELSE 'Should be deleted'
  END as status,
  CASE
    WHEN deleted_at IS NOT NULL THEN
      EXTRACT(day FROM (deleted_at - NOW())) || ' days until deletion'
    ELSE 'N/A'
  END as days_remaining
FROM users
WHERE email LIKE '%deletetest%'
ORDER BY created_at DESC;
