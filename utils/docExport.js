const { buildResumeHtml, getConfig, getMargins } = require('./templateRenderer');

function buildExperienceBreakGuardStyles() {
    return `
  .exp-item{
    break-inside: auto;
    page-break-inside: auto;
    -webkit-column-break-inside: auto;
    mso-keep-together: no;
  }
  .exp-item .exp-header,
  .exp-item .exp-company,
  .exp-item h3{
    break-after: avoid-page;
    page-break-after: avoid;
    mso-keep-with-next: yes;
  }
  .exp-item ul > li:first-child,
  .exp-item ol > li:first-child{
    break-before: avoid-page;
    page-break-before: avoid;
    mso-keep-with-previous: yes;
  }
`;
}

const WORD_PRINT_VIEW_XML = `<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]-->`;

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
 * extract the original .resume markup so DOC export keeps styles
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
    const raw = vars['font-size'] || vars['fontSize'] || '10pt';
    const num = parseFloat(String(raw).replace(/pt|px|em|rem/gi, '')) || 10;
    return text
        .replace(/calc\s*\(\s*var\s*\(\s*--font-size\s*\)\s*\+\s*([\d.]+)\s*pt\s*\)/gi, (_, a) => `${(num + parseFloat(a)).toFixed(2)}pt`)
        .replace(/calc\s*\(\s*var\s*\(\s*--font-size\s*\)\s*-\s*([\d.]+)\s*pt\s*\)/gi, (_, a) => `${(num - parseFloat(a)).toFixed(2)}pt`);
}

function buildDocPageAndBodyStyles(vars, marginPx) {
    const m = marginPx || { top: 54, right: 54, bottom: 54, left: 54 };
    const toCm = (px) => (Number(px) / 96 * 2.54).toFixed(2);
    const fontFamily = vars['font-family'] || vars['fontFamily'] || 'Arial, sans-serif';
    const fontSize = vars['font-size'] || vars['fontSize'] || '10pt';
    const lineHeight = vars['line-height'] || vars['lineHeight'] || '1.4';
    return `
  @page {
    size: letter;
    margin: ${toCm(m.top)}cm ${toCm(m.right)}cm ${toCm(m.bottom)}cm ${toCm(m.left)}cm;
  }
  body {
    margin: 0;
    padding: 0;
    font-family: ${fontFamily};
    font-size: ${fontSize};
    line-height: ${lineHeight};
    color: #1f2937;
    background: #fff;
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

function injectInlineResumeStyles(bodyHtml, vars, margin) {
    const fontFamily = vars['font-family'] || vars['fontFamily'] || '';
    const fontSize = vars['font-size'] || vars['fontSize'] || '';
    const lineHeight = vars['line-height'] || vars['lineHeight'] || '';
    const PW = 816;
    const ML = margin?.left || 54;
    const MR = margin?.right || 54;
    const CW = PW - ML - MR;

    const inlineParts = [];
    if (fontFamily) inlineParts.push(`font-family: ${fontFamily};`);
    if (fontSize) inlineParts.push(`font-size: ${fontSize};`);
    if (lineHeight) inlineParts.push(`line-height: ${lineHeight};`);
    inlineParts.push(`max-width: ${CW}px;`);
    inlineParts.push('margin: 0 auto;');
    inlineParts.push('box-sizing: border-box;');
    const inline = inlineParts.join(' ');

    const resumeOpenTagRegex = /<div\b([^>]*)class=(?:'|")[^'"]*\bresume\b[^'"]*(?:'|")([^>]*)>/i;
    if (resumeOpenTagRegex.test(bodyHtml)) {
        return bodyHtml.replace(resumeOpenTagRegex, (m, g1, g2) => {
            if (/style\s*=/.test(g1 + g2)) {
                return m.replace(/style=(["'])(.*?)\1/, (mm, q, val) => `style=${q}${val} ${inline}${q}`);
            }
            return `<div ${g1}class="resume"${g2} style="${inline}">`;
        });
    }
    return `<div class="resume" style="${inline}">${bodyHtml}</div>`;
}

function sendDocFromHtml(html, res, options = {}) {
    const filename = (options.name || 'resume').replace(/"/g, '');
    const fullName = String(options.fullName || '').trim();

    try {
        html = sanitizePagedPreviewHtmlForDoc(html);
    } catch (e) {
        console.warn('[sendDocFromHtml] sanitizePagedPreviewHtmlForDoc failed, continuing with original html', e);
    }

    const parts = extractHeadAndBody(html);
    const combinedStyles = extractCombinedCssFromHead(parts.head);
    const vars = parseCssVars(combinedStyles);
    const margin = options.margin || marginFromVars(vars);

    let flattenedStyles = replaceCssVarsInText(combinedStyles, vars);
    flattenedStyles = resolveCalcFontSize(flattenedStyles, vars);
    const pageAndBodyStyles = buildDocPageAndBodyStyles(vars, margin);
    const breakGuardStyles = buildExperienceBreakGuardStyles();

    let flattenedBody = replaceCssVarsInText(parts.body, vars);
    flattenedBody = injectInlineResumeStyles(flattenedBody, vars, margin);

    const docContent = `<!DOCTYPE html>
<html xmlns:o='urn:schemas-microsoft-com:office:office'
        xmlns:w='urn:schemas-microsoft-com:office:word'
        xmlns='http://www.w3.org/TR/REC-html40'>
  <head>
    <meta charset="utf-8" />
    ${fullName ? `<title>${escapeHtmlAttr(fullName)}</title><meta name="author" content="${escapeHtmlAttr(fullName)}" />` : ''}
    ${WORD_PRINT_VIEW_XML}
    <style>
      ${pageAndBodyStyles}
      ${flattenedStyles}
      ${breakGuardStyles}
    </style>
  </head>
  <body>
    ${flattenedBody}
  </body>
</html>`;

    res.set({
        'Content-Type': 'application/msword',
        'Content-Disposition': `attachment; filename="${filename}.doc"`,
    });
    res.send(docContent);
}

function sendDocResume(resume, res) {
    const bodyHtml = buildResumeHtml(resume);
    const fullName = resume?.profileId && typeof resume.profileId === 'object'
        ? String(resume.profileId.fullName || '').trim()
        : '';
    const config = getConfig(resume);
    const m = getMargins(config);

    const parts = extractHeadAndBody(bodyHtml);
    const combinedStyles = extractCombinedCssFromHead(parts.head);
    const vars = parseCssVars(combinedStyles);

    let flattenedStyles = replaceCssVarsInText(combinedStyles, vars);
    flattenedStyles = resolveCalcFontSize(flattenedStyles, vars);
    const pageAndBodyStyles = buildDocPageAndBodyStyles(vars, m);
    const breakGuardStyles = buildExperienceBreakGuardStyles();

    let flattenedBody = replaceCssVarsInText(parts.body, vars);
    flattenedBody = injectInlineResumeStyles(flattenedBody, vars, m);

    const docContent = `<!DOCTYPE html>
<html xmlns:o='urn:schemas-microsoft-com:office:office'
        xmlns:w='urn:schemas-microsoft-com:office:word'
        xmlns='http://www.w3.org/TR/REC-html40'>
  <head>
    <meta charset="utf-8">
    ${fullName ? `<title>${escapeHtmlAttr(fullName)}</title><meta name="author" content="${escapeHtmlAttr(fullName)}" />` : ''}
    ${WORD_PRINT_VIEW_XML}
    <style>
      ${pageAndBodyStyles}
      ${flattenedStyles}
      ${breakGuardStyles}
    </style>
  </head>
  <body>
    ${flattenedBody}
  </body>
</html>`;

    res.set({
        'Content-Type': 'application/msword',
        'Content-Disposition': `attachment; filename="${(resume.name || 'resume').replace(/"/g, '')}.doc"`,
    });
    res.send(docContent);
}

module.exports = {
    sanitizePagedPreviewHtmlForDoc,
    extractHeadAndBody,
    extractCombinedCssFromHead,
    parseCssVars,
    replaceCssVarsInText,
    resolveCalcFontSize,
    buildDocPageAndBodyStyles,
    buildExperienceBreakGuardStyles,
    marginFromVars,
    injectInlineResumeStyles,
    sendDocFromHtml,
    sendDocResume,
};
