const fs = require('fs');
const path = require('path');
const { buildResumeHtml, getConfig, getMargins } = require('./templateRenderer');
const { runInBrowser } = require('./browserPool');

/**
 * Sanitize HTML produced by the in-app paged preview so Puppeteer does not
 * render the preview page frames/gaps. Extracts the original .resume element
 * and rebuilds a clean print-ready HTML document.
 */
function sanitizePagedPreviewHtml(html, margin) {
    if (!html || typeof html !== 'string') return html;

    const hasPagingMarkers = /document\.body\.appendChild\(v\)|GAP=24|wrapWithPagedPreview|display:flex;flex-direction:column;align-items:center;gap:/.test(html);

    const openTagMatch = html.match(/<div\b[^>]*class=(?:'|")[^'"]*\bresume\b[^'"]*(?:'|")[^>]*>/i);
    const styleMatches = html.match(/<style[^>]*>[\s\S]*?<\/style>/gi) || [];
    const styles = styleMatches.join('\n');

    if (openTagMatch && typeof openTagMatch.index === 'number') {
        const start = openTagMatch.index;
        const tagRegex = /<\/?div\b/gi;
        tagRegex.lastIndex = start;
        let depth = 0;
        let match;
        match = tagRegex.exec(html);
        if (match) {
            depth = 1;
            let endPos = -1;
            while ((match = tagRegex.exec(html)) !== null) {
                const idx = match.index;
                const isClose = html[idx + 1] === '/';
                isClose ? depth-- : depth++;
                if (depth === 0) {
                    const closeTagEnd = html.indexOf('>', idx);
                    endPos = closeTagEnd >= 0 ? closeTagEnd + 1 : idx;
                    break;
                }
            }
            if (endPos > start) {
                const resumeHtml = html.slice(start, endPos);
                const toCm = (px) => (px / 96 * 2.54).toFixed(2);
                const pageStyle = `<style>html,body{margin:0;padding:0;} body{background:#fff;} @page{margin:${toCm(margin.top)}cm ${toCm(margin.right)}cm ${toCm(margin.bottom)}cm ${toCm(margin.left)}cm;}</style>`;
                return `<!DOCTYPE html><html><head><meta charset="utf-8">${styles}\n${pageStyle}</head><body>${resumeHtml}</body></html>`;
            }
        }
    }

    const cleaned = html
        .replace(/<script>[\s\S]*?wrapWithPagedPreview[\s\S]*?<\/script>/i, '')
        .replace(/<script>[\s\S]*?document\.body\.appendChild\(v\);[\s\S]*?<\/script>/i, '')
        .replace(/<div[^>]*style=["'][^"']*width:\s*816px;[^"']*height:\s*1056px;[^"']*background:\s*white;[^"']*["'][\s\S]*?<\/div>/gi, '')
        .replace(/<div[^>]*id=["']?thumb-clip["']?[^>]*>[\s\S]*?<\/div>/gi, '');

    return hasPagingMarkers ? cleaned : html;
}

async function renderPdf(page, html, marginPx) {
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.emulateMediaType('screen');
    const pdfRaw = await page.pdf({
        format: 'Letter',
        printBackground: true,
        margin: {
            top: marginPx(0),
            right: marginPx(1),
            bottom: marginPx(2),
            left: marginPx(3),
        },
    });
    return Buffer.isBuffer(pdfRaw) ? pdfRaw : Buffer.from(pdfRaw);
}

async function sendPdfResume(resume, res) {
    const html = buildResumeHtml(resume);
    const config = getConfig(resume);
    const m = getMargins(config);
    const px = (val) => `${val}px`;
    const margins = [m.top, m.right, m.bottom, m.left];

    const pdfBuffer = await runInBrowser(async (page) => {
        await page.setContent(html, { waitUntil: 'networkidle0' });
        await page.emulateMediaType('screen');
        const pdfRaw = await page.pdf({
            format: 'Letter',
            printBackground: true,
            margin: { top: px(m.top), right: px(m.right), bottom: px(m.bottom), left: px(m.left) },
        });
        return Buffer.isBuffer(pdfRaw) ? pdfRaw : Buffer.from(pdfRaw);
    });

    res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${(resume.name || 'resume').replace(/"/g, '')}.pdf"`,
        'Content-Length': pdfBuffer.length,
    });
    res.end(pdfBuffer);
}

async function sendPdfFromHtml(html, res, options = {}) {
    const filename = (options.name || 'resume').replace(/"/g, '');
    const margin = options.margin || { top: 54, right: 54, bottom: 54, left: 54 };

    try {
        html = sanitizePagedPreviewHtml(html, margin);
    } catch (e) {
        console.warn('[sendPdfFromHtml] sanitizePagedPreviewHtml failed, continuing with original html', e);
    }

    const pdfBuffer = await runInBrowser(async (page) => {
        await page.setContent(html, { waitUntil: 'networkidle0' });
        await page.emulateMediaType('screen');
        const pdfRaw = await page.pdf({
            format: 'Letter',
            printBackground: true,
            margin: {
                top: `${margin.top}px`,
                right: `${margin.right}px`,
                bottom: `${margin.bottom}px`,
                left: `${margin.left}px`,
            },
        });
        return Buffer.isBuffer(pdfRaw) ? pdfRaw : Buffer.from(pdfRaw);
    });

    if (process.env.NODE_ENV !== 'production') {
        const sig = pdfBuffer.slice(0, 5).toString('utf8');
        if (!sig.startsWith('%PDF')) {
            const dbgDir = path.resolve(__dirname, '..', 'tmp');
            try { fs.mkdirSync(dbgDir, { recursive: true }); } catch (_) { }
            try { fs.writeFileSync(path.join(dbgDir, `${filename}_debug.pdf`), pdfBuffer); } catch (_) { }
        }
    }

    res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}.pdf"`,
        'Content-Length': pdfBuffer.length,
    });
    res.end(pdfBuffer);
}

module.exports = { sendPdfResume, sendPdfFromHtml, sanitizePagedPreviewHtml };
