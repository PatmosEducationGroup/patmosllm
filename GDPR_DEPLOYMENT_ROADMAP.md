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

## PHASE 7: Supabase Invite-Only Migration (DEPLOY SEVENTH - COMPLEX)

**What**: Migrate from Clerk invitations to Supabase Auth invite-only system with GDPR consent capture
**Time**: 18-25 hours (development: 10-14h, testing: 6-8h, deployment: 2-3h)
**Risk**: High (replaces entire invitation system, auth migration dependency)

### Context & Architecture

**Current System (Clerk-based)**:
- Admin creates invitation → generates Clerk invitation + `clerk_ticket`
- User signs up via Clerk's `<SignUp>` component with restricted mode
- Invitation linked to Clerk account after signup
- **Problem**: Can't capture consent during Clerk signup (no control over UI)

**New System (Supabase-based)**:
- Admin creates invitation → creates `auth.users` shell with admin API
- User accepts invitation → sets password + captures consent checkboxes
- Password updated via `admin.updateUserById()` → user can login immediately
- **Benefit**: Full control over consent capture UI, invite-only mode enforced

**Key Validation**: This pattern is **already proven in production**:
- Webhook handler creates Supabase users with `admin.createUser()` (line 124 in `webhooks/clerk/route.ts`)
- Prepopulation script created 15 users using this exact pattern
- Migration flow uses `admin.updateUserById()` to set passwords (line 97 in `auth-migration.ts`)
- Login via `signInWithPassword()` works immediately after password update

---

### PRE-FLIGHT CHECKLIST (CRITICAL - Do First)

#### 1. Execute Security SQL Script (15 minutes)
**File**: `scripts/fix-supabase-linter-warnings.sql`
**Action**: Run in Supabase SQL Editor
**Why**: Fixes 18 functions with SQL injection risk, enables RLS policies
**Status**: 🚨 **BLOCKING** - Must complete before implementation

#### 2. Verify Supabase Auth Settings (5 minutes)
**In Supabase Dashboard → Authentication → Settings**:
- [ ] "Enable email signups" = **OFF** (blocks public signups)
- [ ] "Enable email login" = **ON** (allows invited users to login)
- [ ] Confirm admin API bypasses signup restrictions

#### 3. Test Admin API in Development (15 minutes)
```typescript
// Verify this works with "email signups disabled"
const { data } = await supabaseAdmin.auth.admin.createUser({
  email: 'test@example.com',
  email_confirm: true,  // Bypass verification
  password: 'TestPass123!',
  user_metadata: { invitation_pending: true }
})

// Then try immediate login
const { data: session } = await supabase.auth.signInWithPassword({
  email: 'test@example.com',
  password: 'TestPass123!'
})
// ✅ Should work even with signups disabled
```

---

### PHASE 7A: Database Schema (1 hour)

**Add consent tracking for invitations**:
```sql
-- Add to existing users table
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS invitation_accepted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS invitation_consent_captured BOOLEAN DEFAULT FALSE;

-- consent_events table already exists from Phase 5
-- Will reuse for invitation acceptance logging
```

---

### PHASE 7B: Invitation Acceptance API (6-8 hours)

#### Create `/src/app/api/invite/[token]/accept/route.ts`

**Flow**:
1. Validate invitation token (check expiration, uniqueness)
2. Verify all consent checkboxes are checked
3. Check if `auth.users` entry exists for this email:
   - **If NO**: Create with `admin.createUser()` (new pattern)
   - **If YES**: Update password with `admin.updateUserById()` (existing pattern)
4. Update `public.users`:
   - Link `auth_user_id`
   - Clear `invitation_token` and `invitation_expires_at`
   - Set `invitation_accepted_at`, `invitation_consent_captured`
5. Log consent to `privacy_audit_log` and `consent_events`
6. Auto-login user with `signInWithPassword()`
7. Return success → redirect to app

**Key Code Pattern (Proven Working)**:
```typescript
// This exact pattern is used in production (webhook handler)
const { data: authUser, error } = await supabaseAdmin.auth.admin.createUser({
  email: invitation.email,
  email_confirm: true,  // ✅ Admin vouching for user
  password: userPassword,
  user_metadata: {
    invitation_accepted: true,
    invited_by: invitation.invited_by,
    consent_captured: true,
    consent_timestamp: new Date().toISOString()
  }
})

// Link to public.users
await supabaseAdmin
  .from('users')
  .update({
    auth_user_id: authUser.user.id,
    invitation_token: null,
    invitation_expires_at: null,
    invitation_accepted_at: new Date().toISOString()
  })
  .eq('invitation_token', token)

// Auto-login (works immediately - proven in migration flow)
const { data: session } = await supabase.auth.signInWithPassword({
  email: invitation.email,
  password: userPassword
})
```

---

### PHASE 7C: Invitation Acceptance UI (3-4 hours)

#### Create `/src/app/invite/[token]/accept/page.tsx`

**Components**:
- Password input with strength indicator
- Confirm password input
- **3 Required Consent Checkboxes**:
  - [ ] I agree to the Terms of Service
  - [ ] I agree to the Privacy Policy
  - [ ] I consent to data processing as described in the Privacy Policy
- Submit button (disabled until all checked + passwords match)
- Error display area
- Loading state during API call

**Design**: Match existing UI (CookieConsentBanner style)

**Validation**:
- All 3 checkboxes MUST be checked (GDPR requirement - no pre-checked boxes)
- Password minimum 8 characters
- Passwords must match
- Client-side + server-side validation

---

### PHASE 7D: Update Invitation Flow (2-3 hours)

#### Modify `/src/app/invite/[token]/page.tsx`

**Current**: Renders Clerk `<SignUp />` component
**New**: Redirect to `/invite/[token]/accept` page

```typescript
// Simple redirect to acceptance page
'use client'

export default function InvitePage({ params }: { params: { token: string } }) {
  useEffect(() => {
    window.location.href = `/invite/${params.token}/accept`
  }, [params.token])

  return <div className="min-h-screen flex items-center justify-center">
    <p>Redirecting to invitation acceptance...</p>
  </div>
}
```

#### Keep `/src/app/api/invite/[token]/route.ts`
- GET endpoint for token validation already works
- No changes needed (validates expiration, returns invitation details)

---

### PHASE 7E: Update Admin Invitation Creation (Optional - Future Phase)

**Note**: This is for Phase 5+ of the Clerk → Supabase migration. For now, admin invitations can continue creating placeholder records in `public.users`. The acceptance flow will create the `auth.users` entry.

**Future Enhancement** (when Clerk is fully removed):
```typescript
// POST /api/admin/invite - Create auth.users shell immediately
const { data: authUser } = await supabaseAdmin.auth.admin.createUser({
  email,
  email_confirm: true,
  password: crypto.randomUUID() + crypto.randomUUID(), // Temporary
  user_metadata: {
    invitation_pending: true,
    invited_by: admin.id,
    invitation_token: token
  }
})

// Then link to public.users
await supabaseAdmin.from('users').insert({
  auth_user_id: authUser.user.id,
  email,
  invitation_token: token,
  // ...
})
```

---

### Testing Strategy (6-8 hours)

#### Unit Tests (`/tests/api/invite-supabase.test.ts`):
- [ ] Token validation (expired, invalid, already used)
- [ ] Consent checkbox validation (all required)
- [ ] Password validation (strength, match)
- [ ] Email normalization

#### Integration Tests:
- [ ] Complete flow: admin creates → user accepts → user logs in
- [ ] Expired invitation shows error page
- [ ] Invalid token shows 404
- [ ] Missing consent prevents submission
- [ ] Duplicate acceptance prevented
- [ ] Consent logged to `privacy_audit_log`

#### Manual Testing Checklist:
1. [ ] Admin creates invitation via `/admin` page
2. [ ] Check email received (correct link format)
3. [ ] Click invitation link → redirected to acceptance page
4. [ ] Try submitting without all checkboxes → shows error
5. [ ] Try mismatched passwords → shows error
6. [ ] Check all boxes + matching passwords → submission succeeds
7. [ ] Verify account created in `auth.users` and `public.users`
8. [ ] Verify consent logged in `privacy_audit_log`
9. [ ] User can immediately log in with new password
10. [ ] Check expired invitation (manually set expiry) → shows error

#### Production Smoke Test:
1. [ ] Create test invitation in production
2. [ ] Use temporary email service (mailinator.com)
3. [ ] Complete entire acceptance flow
4. [ ] Verify login works
5. [ ] Check Supabase dashboard for user creation
6. [ ] Delete test account

---

### Deployment Strategy

#### Week 1 (Development):
- **Day 1**: Execute security SQL, verify Supabase settings, test admin API
- **Day 2-3**: Build acceptance API (Phase 7B)
- **Day 3-4**: Build acceptance UI (Phase 7C)
- **Day 5**: Update invitation flow (Phase 7D), write tests

#### Week 2 (Testing & QA):
- **Day 1-2**: Integration testing, fix bugs
- **Day 3**: Manual testing, edge cases
- **Day 4**: Deploy to staging, full E2E test
- **Day 5**: Legal review of consent language, prepare for production

#### Week 3 (Production Rollout):
- **Day 1**: Deploy to production (Clerk flow remains as fallback)
- **Day 2-3**: Monitor for errors, test with 2-3 real invitations
- **Day 4-5**: Validate metrics, confirm 100% consent capture

---

### Rollout & Rollback

**Deploy & Verify**:
```bash
# After all testing passes
npm run build
npm run lint
git add src/app/invite src/app/api/invite scripts/
git commit -m "feat: Implement Supabase invite-only system with consent capture (Phase 7/9)"
git push
```

**Rollback Plan** (if critical issues):
1. Revert commit: `git revert HEAD && git push`
2. Existing Clerk invitation flow automatically takes over
3. Users with pending Supabase invitations can still accept (backward compatible)

---

### Success Criteria

- ✅ Admin can create invitations (existing functionality preserved)
- ✅ User receives invitation email with correct link
- ✅ User sees acceptance page with password + consent form
- ✅ All 3 consent checkboxes required (GDPR compliant)
- ✅ User account created in Supabase Auth (`auth.users`)
- ✅ User can login immediately after acceptance
- ✅ Consent logged in `privacy_audit_log` table
- ✅ 100% consent capture for new signups
- ✅ Public email signups blocked (invite-only mode)
- ✅ Zero errors in production monitoring
- ✅ Existing Clerk invitations still work (backward compatible)

---

### Verification Checklist

After deployment:
- [ ] Visit production `/admin` page → create test invitation
- [ ] Check email delivered (invitation link correct)
- [ ] Click link → redirected to acceptance page (not Clerk)
- [ ] Complete acceptance with password + all consents
- [ ] Verify account created in Supabase dashboard (auth.users)
- [ ] Log in immediately with new credentials → success
- [ ] Check `privacy_audit_log` → consent recorded
- [ ] Try creating account via public signup URL → blocked
- [ ] Check Sentry → no invitation-related errors
- [ ] Delete test account

---

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Security SQL not executed | LOW | 🚨 CRITICAL | Pre-flight checklist blocks progress |
| Admin API fails with signups disabled | VERY LOW | HIGH | Pattern proven with 15 prod users |
| Password update fails | LOW | HIGH | Pattern proven in migration flow |
| Login fails after acceptance | VERY LOW | HIGH | `signInWithPassword` tested in prod |
| Consent not captured | LOW | HIGH | Required checkboxes enforce capture |
| Invitation email not sent | MEDIUM | MEDIUM | Test with real email in staging |
| Race condition (concurrent accepts) | LOW | MEDIUM | Token uniqueness constraint prevents |

---

### Estimated Effort

- **Pre-flight checks**: 35 minutes
- **Database schema**: 1 hour
- **Acceptance API**: 6-8 hours
- **Acceptance UI**: 3-4 hours
- **Flow updates**: 2-3 hours
- **Testing**: 6-8 hours
- **Deployment & QA**: 2-3 hours
- **Total**: 18-25 hours (2.5-3 days full-time)

---

### Confidence Level: HIGH (85%)

**Why HIGH confidence**:
- ✅ Pattern proven in production (webhook creates 15+ users)
- ✅ All APIs already in use (`admin.createUser`, `updateUserById`, `signInWithPassword`)
- ✅ Supabase explicitly designed for invite-only with admin API
- ✅ No breaking changes to existing invitation system
- ✅ Backward compatible with Clerk invitations

**Remaining 15% uncertainty**:
- Security SQL script execution required
- Integration testing in production environment
- Edge cases in consent capture validation

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

**Completed Phases**:
- ✅ **Phase 1**: Legal Pages (Privacy Policy + Terms of Service) - Deployed
  - Commit: `d0784bd` - "feat: Add Privacy Policy and Terms of Service pages (Phase 1/9)"
  - Date: October 2024

- ✅ **Phase 2**: Footer Component - Deployed
  - Commit: `974a3f2` - "feat: Complete Phase 2 GDPR compliance + config updates"
  - Date: October 2024
  - Added Footer.tsx, FeedbackModal.tsx, /api/feedback, /api/support routes

- ✅ **Phase 3**: Security Headers + IP Truncation - Deployed
  - Commit: `04693cb` - "feat: Complete Phase 3 & 4 GDPR compliance (security + privacy)"
  - Date: October 2024
  - Added COOP/COEP headers, IP truncation function (192.168.x.x)

- ✅ **Phase 4**: Sentry Chat Filtering - Deployed
  - Commit: `04693cb` - "feat: Complete Phase 3 & 4 GDPR compliance (security + privacy)"
  - Date: October 2024
  - Excluded /chat routes from Sentry session replay

- ✅ **Phase 5**: Database Migration - Deployed
  - Commit: (multiple) - "feat: Complete GDPR Phase 5 & 6"
  - Date: October 15, 2025
  - Added 8 consent tracking columns to users table
  - Created scripts/add-consent-columns.sql migration

- ✅ **Phase 6**: Cookie Consent Banner - Deployed
  - Commits: `c4063b7`, `7f175d3`, `378b4c9`, `fb046e0`
  - Date: October 15, 2025
  - Created CookieConsentBanner.tsx with modal for granular control
  - Integrated with Sentry (respects consent before tracking)
  - Fixed 400 errors by disabling session tracking without consent
  - Production tested and verified

**In Progress**:
- 🔄 **Phase 7**: Supabase Invite-Only Migration (18-25 hours) - NEXT

**Remaining Phases**:
- ⏸️ Phase 8: Privacy Settings Portal (8-12 hours)
- ⏸️ Phase 9: Documentation & Polish (2 hours)

**Next Steps**:
1. **Phase 7**: Execute security SQL script (`scripts/fix-supabase-linter-warnings.sql`)
2. Verify Supabase Auth settings (disable email signups)
3. Build invitation acceptance API + UI with consent capture
4. Test complete invitation flow: invite → accept → login
5. Move to Phase 8 (Privacy Portal)

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

**Right now**: Phase 5 - Database Migration (add consent tracking columns)

**Steps**:
1. Create migration script: `scripts/add-consent-columns.sql`
2. Open Supabase SQL Editor: https://supabase.com/dashboard
3. Run the ALTER TABLE commands (see Phase 5 section above)
4. Verify columns added with SELECT query
5. Test: Visit app, ensure no errors
6. Commit migration script:
   ```bash
   git add scripts/add-consent-columns.sql
   git commit -m "feat: Add database migration for consent tracking (Phase 5/9)"
   git push
   ```

**Time**: 30 minutes
**Risk**: Medium (database changes, but non-breaking)

---

## PROGRESS SUMMARY

**Completed**: 6/9 phases (67%)
**Time Spent**: ~6-8 hours (Phases 1-6)
**Time Remaining**: ~28-39 hours across Phases 7-9

**Phase Breakdown**:
- ✅ Phase 1-4: Legal pages, footer, security headers, Sentry filtering (2 hours)
- ✅ Phase 5: Database migration - consent tracking columns (1 hour)
- ✅ Phase 6: Cookie consent banner with Sentry integration (3-4 hours)
- ⏳ Phase 7: Supabase invite-only migration (18-25 hours) - **NEXT**
- ⏸️ Phase 8: Privacy settings portal (8-12 hours)
- ⏸️ Phase 9: Documentation & polish (2 hours)

**Next Milestone**: Complete Phase 7 (Supabase Invite-Only Migration) - Start with pre-flight security SQL script execution
