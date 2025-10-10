# PatmosLLM - Active TODO List

## 🔴 Critical Issues

### Phase 3 Migration - In Progress
- [ ] **Complete Phase 3 manual testing**
  - ✅ Login/Logout - Working
  - ✅ Chat - Working
  - ✅ Document Upload - Working
  - ✅ Document Download - Working
  - ✅ Invite User - Working
  - ✅ Delete Document - Working (backend)
  - ⏳ Web Scraping - Needs testing
- [ ] **Complete Phase 4: Cutover Preparation** (testing, monitoring)
- [ ] **Complete Phase 5: Feature Flag Flip** (prefer Supabase)
- [ ] **Complete Phase 6: Enforcement** (migrations 005-006)
- [ ] **Complete Phase 7: Cleanup** (migration 007)

## 🟡 High Priority

### UX Issues
- [ ] **Delete Document Modal - Auto-close on success**
  - **Issue**: Modal doesn't auto-close after successful deletion (returns 200)
  - **Location**: Admin documents page - delete confirmation modal
  - **Impact**: User must manually close modal even though deletion succeeded
  - **Fix**: Frontend needs to detect 200 response and auto-close modal + refresh document list
  - **Files**: Likely in `/src/app/admin/page.tsx` around the delete handler

## 🟢 Medium Priority

_None currently_

## 🔵 Low Priority / Nice to Have

_None currently_

---

## ✅ Recently Completed (Last 7 Days)

- ✅ Fixed invite user endpoint (`clerk_user_id` NOT NULL constraint) - 2025-10-09
- ✅ Fixed delete document (admin override for library assets) - 2025-10-09
- ✅ Updated API routes to use `getCurrentUser()` dual-read pattern - 2025-10-09
- ✅ Implemented Phase 3: Dual-read authentication (Supabase + Clerk) - 2025-10-09
- ✅ Completed Phase 2: Database migrations (001-004) - 2025-10-09
- ✅ Completed Phase 1: Planning and backup - 2025-10-09

---

**Last Updated**: 2025-10-09
