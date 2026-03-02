# DOCX Export Roadmap

Problem:
- The current server-side DOC export returns HTML wrapped with `application/msword`. This is simple but Word may not honor modern CSS, resulting in layout/style differences from the preview.

Goal:
- Produce a high-fidelity .docx export that closely matches the browser preview.

Options:
- Use `docx` (https://www.npmjs.com/package/docx) to programmatically build DOCX from structured data. Pros: produces real .docx files; Cons: requires mapping HTML/CSS to docx primitives.
- Use `docxtemplater` with pre-made .docx templates populated from JSON. Pros: good for template-based documents; Cons: requires building template files and mapping.
- Convert HTML -> DOCX using `mammoth` (HTML-to-docx). Pros: existing converters; Cons: may not support advanced CSS/flex layouts.

Recommendation:
- Short-term: keep HTML->.doc fallback for Word users and document limitations.
- Mid-term: implement `docx`-based generator that consumes the same render data used by templates (buildRenderData) and maps key sections (header, experience, education, skills) to docx blocks.

Implementation steps:
1. Extract structured render data used for HTML rendering (already available in `utils/resumeUtils.buildRenderData`). Export this function for reuse by a docx generator.
2. Prototype a `docx` generator that builds a simple resume layout (header, sections, lists).
3. Iterate styles and map common CSS concepts (font sizes, bold, lists) to docx formatting.
4. Add an endpoint `/api/resume/download/:id?fileType=docx` and return `application/vnd.openxmlformats-officedocument.wordprocessingml.document`.

Notes:
- True pixel-perfect fidelity between HTML/CSS and DOCX is generally infeasible; prioritize content structure and readable formatting.

