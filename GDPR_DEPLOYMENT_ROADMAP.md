# GDPR Compliance - Incremental Deployment Roadmap

**Strategy**: Deploy in small, testable chunks. Each deployment is independent and can be verified before moving to the next.

---

## PHASE 1: Legal Pages Only (DEPLOY FIRST - NO FUNCTIONALITY CHANGES)

**What**: Add Privacy Policy + Terms of Service pages (static pages, no user impact)
**Time**: 30 minutes
**Risk**: Very Low (just adding new pages)

### Files to Create/Modify:
- ✅ `/app/privacy/page.tsx` - Privacy Policy (DONE)
- `/app/terms/page.tsx` - Terms of Service
- Test: Visit `/privacy` and `/terms` - verify pages load and look good

### Deploy & Verify:
```bash
npm run build
npm run lint
# If clean, commit and push:
git add src/app/privacy src/app/terms
git commit -m "Add Privacy Policy and Terms of Service pages"
git push
```

**Verification**:
- [ ] Visit https://multiplytools.app/privacy - page loads
- [ ] Visit https://multiplytools.app/terms - page loads
- [ ] Read through both pages - no typos
- [ ] Mobile responsive - check on phone

---

## PHASE 2: Footer Component (DEPLOY SECOND - LOW RISK)

**What**: Add footer with links to Privacy/Terms
**Time**: 15 minutes
**Risk**: Low (visual addition only, no functionality)

### Files to Create/Modify:
- `/components/Footer.tsx` - New footer component
- `/app/page.tsx` - Add footer to landing page
- `/app/chat/page.tsx` - Add footer to chat page

### Deploy & Verify:
```bash
npm run build
npm run lint
git add src/components/Footer.tsx src/app/page.tsx src/app/chat/page.tsx
git commit -m "Add footer with legal links to landing and chat pages"
git push
```

**Verification**:
- [ ] Footer appears on landing page
- [ ] Footer appears on chat page
- [ ] Privacy Policy link works
- [ ] Terms of Service link works
- [ ] Mobile responsive - footer looks good on phone

---

## PHASE 3: Quick Security Headers (DEPLOY THIRD - LOW RISK)

**What**: Add COOP/COEP headers + IP truncation
**Time**: 20 minutes
**Risk**: Low (security improvements, shouldn't break anything)

### Files to Modify:
- `/src/middleware.ts` - Add COOP/COEP headers (2 lines)
- `/src/lib/get-identifier.ts` - Add IP truncation function

### Deploy & Verify:
```bash
npm run build
npm run lint
git add src/middleware.ts src/lib/get-identifier.ts
git commit -m "Add security headers (COOP/COEP) and IP truncation"
git push
```

**Verification**:
- [ ] Check headers in browser DevTools (Network tab)
- [ ] Verify `Cross-Origin-Opener-Policy: same-origin` present
- [ ] Verify `Cross-Origin-Embedder-Policy: require-corp` present
- [ ] App still works normally (no CORS errors)

---

## PHASE 4: Sentry Chat Filtering (DEPLOY FOURTH - LOW RISK)

**What**: Exclude /chat routes from Sentry session replay
**Time**: 10 minutes
**Risk**: Low (just filtering, not breaking Sentry)

### Files to Modify:
- `/src/instrumentation-client.ts` - Add `beforeSend` hook

### Deploy & Verify:
```bash
npm run build
npm run lint
git add src/instrumentation-client.ts
git commit -m "Exclude chat routes from Sentry session replay for privacy"
git push
```

**Verification**:
- [ ] Sentry still capturing errors on non-chat pages
- [ ] No Sentry errors in console
- [ ] Chat functionality works normally

---

## PHASE 5: Database Migration (DEPLOY FIFTH - MEDIUM RISK)

**What**: Add consent tracking columns to users table
**Time**: 30 minutes
**Risk**: Medium (database changes, but non-breaking - columns are nullable)

### Files to Create:
- `/scripts/add-consent-columns.sql` - SQL migration script

### SQL to Run (via Supabase SQL Editor):
```sql
-- Add consent tracking columns (all nullable for backward compatibility)
ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted_version VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS privacy_policy_accepted_version VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS privacy_policy_accepted_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS cookie_consent VARCHAR(20); -- 'all' | 'essential'
ALTER TABLE users ADD COLUMN IF NOT EXISTS cookie_consent_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS age_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS age_verified_at TIMESTAMPTZ;

-- Verify columns added
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'users'
AND column_name IN (
  'terms_accepted_version',
  'terms_accepted_at',
  'privacy_policy_accepted_version',
  'privacy_policy_accepted_at',
  'cookie_consent',
  'cookie_consent_at',
  'age_verified',
  'age_verified_at'
);
```

### Deploy & Verify:
```bash
# No code changes, just document the migration
git add scripts/add-consent-columns.sql
git commit -m "Add database migration for consent tracking columns"
git push
```

**Verification**:
- [ ] Run SQL in Supabase SQL Editor
- [ ] Verify columns added (run SELECT query above)
- [ ] Existing users unaffected (columns are nullable)
- [ ] App still works (no errors about missing columns)

---

## PHASE 6: Cookie Consent Banner (DEPLOY SIXTH - HIGHER RISK)

**What**: Add cookie consent banner to landing page
**Time**: 2-3 hours
**Risk**: Medium-High (affects user experience, localStorage interaction)

### Files to Create:
- `/components/CookieConsentBanner.tsx` - Banner component
- Modify `/app/layout.tsx` - Add banner

### Deploy & Verify:
```bash
npm run build
npm run lint
git add src/components/CookieConsentBanner.tsx src/app/layout.tsx
git commit -m "Add cookie consent banner to landing page"
git push
```

**Verification**:
- [ ] Banner appears on first visit
- [ ] "Accept All" button works
- [ ] "Essential Only" button works
- [ ] Choice persists in localStorage
- [ ] Banner doesn't appear after choice made
- [ ] Sentry/Analytics deferred if "Essential Only" selected
- [ ] Mobile responsive

---

## PHASE 7: Invitation Acceptance Page (DEPLOY SEVENTH - COMPLEX)

**What**: Create consent capture page for invitation acceptance
**Time**: 6-8 hours (includes testing invitation flow)
**Risk**: High (changes invitation flow, auth integration)

### Files to Create/Modify:
- `/app/invite/[token]/accept/page.tsx` - New acceptance page
- Modify `/app/invite/[token]/page.tsx` - Redirect to acceptance
- Backend logic to store consent

### Deploy & Verify:
```bash
npm run build
npm run lint
git add src/app/invite
git commit -m "Add invitation acceptance page with consent capture"
git push
```

**Verification**:
- [ ] Admin sends invitation
- [ ] User clicks invitation link
- [ ] Sees acceptance page (not direct Clerk signup)
- [ ] Age checkbox required
- [ ] Terms/Privacy checkbox required
- [ ] Cookie preference required
- [ ] Consent stored in database after acceptance
- [ ] Redirects to Supabase signup (not Clerk)
- [ ] User can log in after setup

---

## PHASE 8: Privacy Settings Portal (DEPLOY EIGHTH - COMPLEX)

**What**: Create /settings/privacy page for data export, deletion, opt-out
**Time**: 8-12 hours (includes API routes and cron jobs)
**Risk**: High (data deletion functionality, email integration)

### Files to Create:
- `/app/settings/privacy/page.tsx` - Privacy settings UI
- `/app/api/privacy/export/route.ts` - Export API
- `/app/api/privacy/delete/route.ts` - Deletion API
- `/app/api/privacy/cancel-deletion/route.ts` - Cancel deletion API
- `/app/api/cron/delete-expired-users/route.ts` - Automated deletion cron

### Deploy & Verify:
```bash
npm run build
npm run lint
git add src/app/settings src/app/api/privacy src/app/api/cron
git commit -m "Add privacy settings portal with export/delete functionality"
git push
```

**Verification**:
- [ ] Visit `/settings/privacy`
- [ ] "Export My Data" button creates export request
- [ ] Receive export email with download link
- [ ] Download link works (JSON file)
- [ ] "Delete My Account" button sets deleted_at
- [ ] Receive deletion confirmation email
- [ ] Can cancel deletion by logging in
- [ ] Analytics opt-out works (stops Sentry/Vercel)
- [ ] Cron job runs (manually trigger to test)

---

## PHASE 9: Documentation & Polish (DEPLOY LAST)

**What**: Update CLAUDE.md, add data retention policy doc
**Time**: 2 hours
**Risk**: Very Low (documentation only)

### Files to Create/Modify:
- `/docs/data-retention-policy.md` - Retention policy
- `/CLAUDE.md` - Update with GDPR section
- `/src/lib/openai.ts` - Add training policy comment

### Deploy & Verify:
```bash
git add docs/data-retention-policy.md CLAUDE.md src/lib/openai.ts
git commit -m "Update documentation with GDPR compliance details"
git push
```

**Verification**:
- [ ] Read through docs - no errors
- [ ] Team aware of new policies
- [ ] Legal review complete (if applicable)

---

## CURRENT STATUS

**Completed**:
- ✅ Phase 1 (partial): Privacy Policy page created
- ⏸️ Phase 1 (remaining): Terms of Service page

**Next Steps**:
1. Finish Phase 1 (create Terms of Service page)
2. Test both pages locally
3. Deploy Phase 1
4. Verify Phase 1 in production
5. Move to Phase 2 (Footer)

---

## ROLLBACK PLAN (If Something Breaks)

### For Each Phase:

**If Phase 1-4 breaks**: Just revert the commit
```bash
git revert HEAD
git push
```

**If Phase 5 breaks** (database migration):
```sql
-- Drop columns if needed (safe because they're nullable)
ALTER TABLE users DROP COLUMN IF EXISTS terms_accepted_version;
ALTER TABLE users DROP COLUMN IF EXISTS terms_accepted_at;
-- ... etc
```

**If Phase 6-8 breaks**:
1. Check error logs in Vercel/Sentry
2. Revert commit: `git revert HEAD && git push`
3. Fix issue locally
4. Redeploy

---

## ESTIMATED TOTAL TIME

**Implementation**: 20-30 hours across 2-3 weeks (incremental)
**Testing**: 2-4 hours per phase
**Total**: ~30-40 hours

**By deploying incrementally, we can:**
- Catch bugs early (before they compound)
- Verify each piece works in production
- Roll back individual phases if needed
- Maintain confidence in the system
- Get user feedback early (on cookie banner UX, etc.)

---

## NEXT IMMEDIATE ACTION

**Right now**: Finish Phase 1 by creating Terms of Service page, then test and deploy.

**Command**:
```bash
# After creating terms page:
npm run dev
# Visit http://localhost:3000/privacy and /terms
# Verify they look good
npm run build
# If build succeeds:
git add src/app/privacy src/app/terms
git commit -m "feat: Add Privacy Policy and Terms of Service pages (Phase 1/9)"
git push
# Deploy to Vercel, verify in production
```
