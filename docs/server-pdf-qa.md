# Server-side PDF QA Checklist

How to run (local):
1. Start backend: from `Orion-GPT` run `node ./bin/www` or `npm start` (ensure Puppeteer installs Chromium).
2. Start frontend: start dev server for Frontend.
3. Open the app, create or pick 3 resumes: simple, image/font-heavy, long multi-page.

Test cases:
- Case A: Simple template — generate server-side PDF via \"Download PDF\" (server). Verify file downloads and opens in Acrobat/Preview.
- Case B: Complex template (images, custom fonts) — verify server PDF retains images and fonts (fonts may require embedding or available in Chromium).
- Case C: Long resume (multiple pages) — verify pagination matches preview (page breaks, margins).

Checks to perform per file:
- File opens in at least one PDF viewer (Acrobat, Preview).
- File size reported by viewer roughly matches server log `pdfBuffer.length`.
- Visual inspection: header, sections, fonts, spacing match Preview modal.
- If mismatch: capture screenshots of preview and generated PDF for diff.

Diagnostics:
- Backend logs: [sendPdfFromHtml] incoming html length, generated pdfBuffer.length.
- Frontend logs: [downloadResume] response headers and blob size.
- If PDF is corrupted (cannot open): compare pdfBuffer.length with downloaded file size; ensure Content-Length matches.

Notes:
- If payloads exceed size limit, increase `app.use(bodyParser.json({ limit: '2mb' }))` in `app.js`.
- If fonts don't render, ensure fonts are available to Chromium or use webfonts with absolute URLs accessible by server.

