# 2026-04-13 Admin Access Controls (Backend)

## Summary
- Added shared access utilities for role checks and user-scope filtering.
- Updated auth token creation to include `role` in signin and refresh flows.
- Restricted application routes to admin role and made controller queries scope-aware for admin target-user access.
- Added admin-aware scoping to profile and resume controllers, including ownership checks for profile-targeted operations.
- Introduced user-owned template behavior with permission checks for create/update/delete/clear flows.
- Updated realtime application room join checks so admin can join by application id without owner restriction.

## Files changed
- `controllers/application.controller.js`: admin scope support, target `userId` resolution, and actor/owner history fixes.
- `controllers/auth.controller.js`: includes `role` in JWT payload on signin/refresh.
- `controllers/profile.controller.js`: role-aware profile query/mutation scope.
- `controllers/resume.controller.js`: role-aware resume scope, admin target-user validation, and history actor/user alignment.
- `controllers/template.controller.js`: ownership-aware template reads/writes and permission enforcement.
- `dbModels/Template.Model.js`: added `userId` field/index for template ownership.
- `realtime/socketServer.js`: admin-bypass owner filter for application room membership checks.
- `routes/application.route.js`: route access narrowed to admin only.
- `routes/template.route.js`: restricted template seed and clear routes to admin.
- `tests/resume.import.controller.test.js`: adjusted mock/profile expectation after controller behavior change.
- `utils/access.js`: new shared helpers (`isAdminUser`, `buildUserScopeFilter`).

## Validation done
- Reviewed current staged backend diff for all listed files.
- No backend test suite was run as part of this documentation update.

## Notes / follow-ups
- Expected behavior change: only admins can access application API routes under `routes/application.route.js`.
- Template data now depends on `userId` ownership and `isBuiltIn` status, so existing clients should pass target user context only when intended.
