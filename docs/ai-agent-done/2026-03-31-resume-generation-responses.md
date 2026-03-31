# Resume generation moved to Responses API (o-series)

## What changed
- Added `responsesCreate` helper to call `/v1/responses` with strict JSON schema output.
- Switched resume generation to use the Responses API with `o4-mini` by default.
- Removed legacy `function_call` handling and now parse the structured text payload directly.

## Files touched
- `services/llm/openaiClient.js`
- `services/llm/resumeGenerate.service.js`
- `config/llm.js`

## Notes
- Override the model with `LLM_GENERATE_MODEL` if needed.
- Responses output parsing falls back to `output_text` if content blocks are absent.
