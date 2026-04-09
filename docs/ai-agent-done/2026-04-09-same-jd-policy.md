# feat(jd): implement same-JD dedupe/reuse policy

## Policy Decision

For `Orion-GPT`, we use:

- Reuse same JD record when it is an exact or near duplicate (per user).

Interpretation details:

- Match scope is user-local only.
- Stage 1 (pre-LLM): exact duplicate by normalized raw `contextHash`.
- Stage 2 (pre-LLM): near duplicate by token-similarity threshold on JD context text.
- Stage 3 (post-LLM fallback): normalized structured-content hash (`normalizedHash`) with legacy exact-field fallback.
- On reuse, refresh JD context/hash and normalized fields (touch `updatedAt`) instead of creating a duplicate row.

## Why this policy

- Prevents duplicate or near-duplicate JD records from repeated imports.
- Keeps API behavior stable (`jdId` remains reusable).
- Preserves latest pasted text for UX features like "restore last used JD".
- Minimizes expensive duplicate parse/embedding writes.

## Implementation Summary

- Added `contextHash` + `normalizedHash` to `JobDescription` schema with indexes.
- Added deterministic context hashing and structured normalized-content hashing.
- Added pre-LLM near-duplicate guard using token overlap similarity threshold.
- Added runtime knobs:
  - `JD_NEAR_DUPLICATE_THRESHOLD` (default `0.9`)
  - `JD_NEAR_DUPLICATE_MAX_SCAN` (default `200`)
  - `JD_NEAR_DUPLICATE_MIN_TOKENS` (default `25`)
- Updated both persistence paths:
  - `tryParseAndPersistJobDescription`
  - `persistParsedJobDescription`
- Both paths now:
  - find existing by context hash first (skip LLM)
  - near-duplicate similarity scan second (skip LLM)
  - then parse and check normalized hash
  - fall back to exact legacy field match
  - reuse + touch existing row, or create new if none found

## Tests

Added regression tests for duplicate import scenarios:

- `tests/jdImport.service.test.js`
  - skip LLM on exact context hash match
  - skip LLM on near-duplicate similarity match
  - reuse by normalized hash
  - reuse by legacy exact match
  - create new when no duplicate
  - parser-path reuse
