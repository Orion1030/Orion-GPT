const { buildResumeHtml, getConfig, getMargins } = require('./templateRenderer');

function extractHeadAndBody(html) {
    const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const head = headMatch ? headMatch[1] : '';
    const body = bodyMatch ? bodyMatch[1] : (headMatch ? html.replace(headMatch[0], '') : html);
    return { head, body };
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
    const parts = extractHeadAndBody(html);
    const styleMatches = parts.head.match(/<style[^>]*>[\s\S]*?<\/style>/gi) || [];
    const combinedStyles = styleMatches.join('\n');
    const vars = parseCssVars(combinedStyles);
    const margin = options.margin || marginFromVars(vars);

    let flattenedStyles = replaceCssVarsInText(combinedStyles, vars);
    flattenedStyles = resolveCalcFontSize(flattenedStyles, vars);
    const pageAndBodyStyles = buildDocPageAndBodyStyles(vars, margin);

    let flattenedBody = replaceCssVarsInText(parts.body, vars);
    flattenedBody = injectInlineResumeStyles(flattenedBody, vars, margin);

    const docContent = `<!DOCTYPE html>
<html xmlns:o='urn:schemas-microsoft-com:office:office'
        xmlns:w='urn:schemas-microsoft-com:office:word'
        xmlns='http://www.w3.org/TR/REC-html40'>
  <head>
    <meta charset="utf-8" />
    <style>
      ${pageAndBodyStyles}
      ${flattenedStyles}
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
    const config = getConfig(resume);
    const m = getMargins(config);

    const parts = extractHeadAndBody(bodyHtml);
    const styleMatches = parts.head.match(/<style[^>]*>[\s\S]*?<\/style>/gi) || [];
    const combinedStyles = styleMatches.join('\n');
    const vars = parseCssVars(combinedStyles);

    let flattenedStyles = replaceCssVarsInText(combinedStyles, vars);
    flattenedStyles = resolveCalcFontSize(flattenedStyles, vars);
    const pageAndBodyStyles = buildDocPageAndBodyStyles(vars, m);

    let flattenedBody = replaceCssVarsInText(parts.body, vars);
    flattenedBody = injectInlineResumeStyles(flattenedBody, vars, m);

    const docContent = `<!DOCTYPE html>
<html xmlns:o='urn:schemas-microsoft-com:office:office'
        xmlns:w='urn:schemas-microsoft-com:office:word'
        xmlns='http://www.w3.org/TR/REC-html40'>
  <head>
    <meta charset="utf-8">
    <!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]-->
    <style>
      ${pageAndBodyStyles}
      ${flattenedStyles}
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
    extractHeadAndBody,
    parseCssVars,
    replaceCssVarsInText,
    resolveCalcFontSize,
    buildDocPageAndBodyStyles,
    marginFromVars,
    injectInlineResumeStyles,
    sendDocFromHtml,
    sendDocResume,
};
