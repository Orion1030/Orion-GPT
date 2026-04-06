const { buildResumeHtml, getConfig, getMargins } = require('./templateRenderer');
const HTMLtoDOCX = require('html-to-docx');

function buildExperienceBreakGuardStyles() {
    return `
  .exp-item{
    break-inside: auto;
    page-break-inside: auto;
  }
  .exp-item .exp-header,
  .exp-item .exp-company,
  .exp-item h3{
    break-after: avoid-page;
    page-break-after: avoid;
  }
  .exp-item ul > li:first-child,
  .exp-item ol > li:first-child{
    break-before: avoid-page;
    page-break-before: avoid;
  }
`;
}

function toTwipFromPx(px) {
    return Math.max(0, Math.round(Number(px || 0) * 15));
}

function pickPrimaryFontFamily(vars) {
    const raw = String(vars['font-family'] || vars.fontFamily || 'Arial').trim();
    const first = raw.split(',')[0] || 'Arial';
    return first.replace(/['"]/g, '').trim() || 'Arial';
}

function parseFontSizePt(vars) {
    const raw = vars['font-size'] || vars.fontSize || '10pt';
    const n = parseFloat(String(raw).replace(/pt|px|em|rem/gi, ''));
    return Number.isFinite(n) ? n : 10;
}

function buildDocxOptions(vars, margin, fullName) {
    const title = String(fullName || '').trim() || 'Resume';
    return {
        orientation: 'portrait',
        pageSize: { width: '8.5in', height: '11in' },
        margins: {
            top: toTwipFromPx(margin?.top ?? 54),
            right: toTwipFromPx(margin?.right ?? 54),
            bottom: toTwipFromPx(margin?.bottom ?? 54),
            left: toTwipFromPx(margin?.left ?? 54),
            header: 720,
            footer: 720,
            gutter: 0,
        },
        title,
        creator: title,
        lastModifiedBy: title,
        font: pickPrimaryFontFamily(vars),
        fontSize: `${parseFontSizePt(vars)}pt`,
        decodeUnicode: true,
        lang: 'en-US',
    };
}

function escapeHtmlAttr(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function extractHeadAndBody(html) {
    const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const head = headMatch ? headMatch[1] : '';
    const body = bodyMatch ? bodyMatch[1] : (headMatch ? html.replace(headMatch[0], '') : html);
    return { head, body };
}

function extractCombinedCssFromHead(headHtml) {
    const styleMatches = String(headHtml || '').match(/<style[^>]*>[\s\S]*?<\/style>/gi) || [];
    if (!styleMatches.length) return '';
    return styleMatches
        .map((styleTag) => styleTag
            .replace(/<style[^>]*>/i, '')
            .replace(/<\/style>/i, ''))
        .join('\n');
}

/**
 * If client sends paged-preview HTML (with runtime wrapper script),
 * extract the original .resume markup so DOCX export keeps styles
 * without preview-frame artifacts.
 */
function sanitizePagedPreviewHtmlForDoc(html) {
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
        let match = tagRegex.exec(html);
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
                return `<!DOCTYPE html><html><head><meta charset="utf-8">${styles}</head><body>${resumeHtml}</body></html>`;
            }
        }
    }

    const cleaned = html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<div[^>]*style=["'][^"']*width:\s*816px;[^"']*height:\s*1056px;[^"']*background:\s*white;[^"']*["'][\s\S]*?<\/div>/gi, '')
        .replace(/<div[^>]*id=["']?thumb-clip["']?[^>]*>[\s\S]*?<\/div>/gi, '');

    return hasPagingMarkers ? cleaned : html;
}

function parseCssVars(cssText) {
    const vars = {};
    const rootMatch = cssText.match(/:root\s*\{([\s\S]*?)\}/i);
    if (!rootMatch) return vars;
    const body = rootMatch[1];
    const lines = body.split(/;+/);
    for (const line of lines) {
        const m = line.match(/--([a-zA-Z0-9-_]+)\s*:\s*([^;]+)/);
        if (m) vars[m[1]] = m[2].trim();
    }
    return vars;
}

function replaceCssVarsInText(text, vars) {
    return text.replace(/var\(--([a-zA-Z0-9-_]+)\)/g, (m, name) => {
        if (Object.prototype.hasOwnProperty.call(vars, name)) return vars[name];
        return m;
    });
}

function resolveCalcFontSize(text, vars) {
    const raw = vars['font-size'] || vars.fontSize || '10pt';
    const num = parseFloat(String(raw).replace(/pt|px|em|rem/gi, '')) || 10;
    return text
        .replace(/calc\s*\(\s*var\s*\(\s*--font-size\s*\)\s*\+\s*([\d.]+)\s*pt\s*\)/gi, (_m, add) => `${(num + parseFloat(add)).toFixed(2)}pt`)
        .replace(/calc\s*\(\s*var\s*\(\s*--font-size\s*\)\s*-\s*([\d.]+)\s*pt\s*\)/gi, (_m, sub) => `${(num - parseFloat(sub)).toFixed(2)}pt`);
}

function buildDocBaseStyles(vars) {
    const fontFamily = vars['font-family'] || vars.fontFamily || 'Arial, sans-serif';
    const fontSize = vars['font-size'] || vars.fontSize || '10pt';
    const lineHeight = vars['line-height'] || vars.lineHeight || '1.4';
    return `
  html, body {
    margin: 0;
    padding: 0;
    background: #fff;
  }
  body {
    font-family: ${fontFamily};
    font-size: ${fontSize};
    line-height: ${lineHeight};
    color: #1f2937;
  }
`;
}

function marginFromVars(vars) {
    const px = (key) => {
        const v = vars[key] || vars[key.replace(/-/g, '')];
        if (!v) return 54;
        const n = parseFloat(String(v).replace(/px|pt|em|rem|cm/gi, ''));
        return Number.isFinite(n) ? n : 54;
    };
    return {
        top: px('margin-top'),
        right: px('margin-right'),
        bottom: px('margin-bottom'),
        left: px('margin-left'),
    };
}

function injectInlineResumeStyles(bodyHtml, _vars, _margin) {
    const resumeOpenTagRegex = /<div\b[^>]*class=(["'])[^"']*\bresume\b[^"']*\1[^>]*>/i;
    if (resumeOpenTagRegex.test(bodyHtml)) {
        return bodyHtml;
    }
    return `<div class="resume">${bodyHtml}</div>`;
}

function buildDocxHtml(html, options = {}) {
    const fullName = String(options.fullName || '').trim();
    const parts = extractHeadAndBody(html);
    const combinedStyles = extractCombinedCssFromHead(parts.head);
    const vars = parseCssVars(combinedStyles);
    const margin = options.margin || marginFromVars(vars);

    // Keep original template CSS and add flattened CSS as fallback for var()/calc().
    const originalStyles = combinedStyles;
    let flattenedStyles = replaceCssVarsInText(combinedStyles, vars);
    flattenedStyles = resolveCalcFontSize(flattenedStyles, vars);

    let flattenedBody = replaceCssVarsInText(parts.body, vars);
    flattenedBody = injectInlineResumeStyles(flattenedBody, vars, margin);

    const baseStyles = buildDocBaseStyles(vars);
    const breakGuardStyles = buildExperienceBreakGuardStyles();
    const headMetadata = fullName
        ? `<title>${escapeHtmlAttr(fullName)}</title><meta name="author" content="${escapeHtmlAttr(fullName)}" />`
        : '';

    const docHtml = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    ${headMetadata}
    <style>
      ${baseStyles}
      ${originalStyles}
      ${flattenedStyles}
      ${breakGuardStyles}
    </style>
  </head>
  <body>
    ${flattenedBody}
  </body>
</html>`;

    return { docHtml, vars, margin, fullName };
}

async function sendDocxBuffer(docHtml, vars, margin, fullName, filename, res) {
    const options = buildDocxOptions(vars, margin, fullName);
    const out = await HTMLtoDOCX(docHtml, null, options, null);
    const docxBuffer = Buffer.isBuffer(out) ? out : Buffer.from(out);

    res.set({
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${filename}.docx"`,
        'Content-Length': docxBuffer.length,
    });
    return res.end(docxBuffer);
}

async function sendDocFromHtml(html, res, options = {}) {
    const filename = (options.name || 'resume').replace(/"/g, '');

    let safeHtml = html;
    try {
        safeHtml = sanitizePagedPreviewHtmlForDoc(html);
    } catch (error) {
        console.warn('[sendDocFromHtml] sanitizePagedPreviewHtmlForDoc failed, using original html', error);
    }

    const prepared = buildDocxHtml(safeHtml, options);
    return sendDocxBuffer(prepared.docHtml, prepared.vars, prepared.margin, prepared.fullName, filename, res);
}

async function sendDocResume(resume, res) {
    const html = buildResumeHtml(resume);
    const fullName = resume?.profileId && typeof resume.profileId === 'object'
        ? String(resume.profileId.fullName || '').trim()
        : '';
    const config = getConfig(resume);
    const margin = getMargins(config);
    const filename = (resume.name || 'resume').replace(/"/g, '');

    const prepared = buildDocxHtml(html, { fullName, margin });
    return sendDocxBuffer(prepared.docHtml, prepared.vars, prepared.margin, prepared.fullName, filename, res);
}

module.exports = {
    sanitizePagedPreviewHtmlForDoc,
    extractHeadAndBody,
    extractCombinedCssFromHead,
    parseCssVars,
    replaceCssVarsInText,
    resolveCalcFontSize,
    parseFontSizePt,
    buildDocBaseStyles,
    buildExperienceBreakGuardStyles,
    buildDocxOptions,
    marginFromVars,
    injectInlineResumeStyles,
    buildDocxHtml,
    sendDocFromHtml,
    sendDocResume,
};
