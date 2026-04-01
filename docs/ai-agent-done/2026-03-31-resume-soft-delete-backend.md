## What changed
- Added soft-delete fields to resumes (`isDeleted`, `deletedAt`, `deletedBy`) to preserve history instead of removing records.
- All resume reads now filter out deleted items; downloads and updates return 404 on deleted records.
- Single delete (`DELETE /api/resume/:resumeId`) and bulk delete (`DELETE /api/resume` with `{ ids }`) now mark resumes deleted instead of hard delete; empty `ids` soft-deletes all resumes for the user.
- Resume matching, embedding refresh, template migration, and agent-based generation ignore deleted resumes.

## Files
- `dbModels/Resume.Model.js`: schema fields for soft delete.
- `controllers/resume.controller.js`: bulk delete handler, soft-delete logic, filters.
- `routes/resume.route.js`: bulk delete route wiring.
- `controllers/resumeAI.controller.js`, `agents/resumeGenerator.js`, `services/resumeEmbedding.service.js`, `services/findTopResumes.js`, `controllers/template.controller.js`: respect `isDeleted`.

## API contract
- `DELETE /api/resume` body `{ ids: string[] }` → soft-delete listed ids; if `ids` empty/omitted, soft-delete all user resumes.
- `DELETE /api/resume/:resumeId` → soft-delete one resume.
- `GET /api/resume` and `GET /api/resume/:id` exclude deleted records by default.

## Tests
- Added `tests/resume.softdelete.test.js` covering bulk delete, delete-all fallback, filtering, and single delete flags.
- Ran: `npm test -- resume.softdelete.test.js` (pass).
