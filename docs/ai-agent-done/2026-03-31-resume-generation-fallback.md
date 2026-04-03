## What changed
- `generateResumeFromJD` now falls back to Chat Completions JSON-schema if the Responses API fails or returns no JSON.
- More resilient parsing of structured JSON from both endpoints; errors bubble so caller can surface clear failures instead of silent empty resumes.

## Files
- `services/llm/resumeGenerate.service.js`: responses→chat fallback, shared JSON extraction, stricter error handling.
- `tests/resumeGenerate.service.test.js`: coverage for success, fallback, and double-failure cases.

## Tests
- `npm test -- resumeGenerate.service.test.js resume.softdelete.test.js`
