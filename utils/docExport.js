const { buildResumeHtml, getConfig, getMargins } = require('./templateRenderer');
const HTMLtoDOCX = require('html-to-docx');
const puppeteer = require('puppeteer');

function buildExperienceBreakGuardStyles() {
    return `
  .section > h2{
    break-after: avoid-page;
    page-break-after: avoid;
  }
  .section > h2 + *{
    break-before: avoid-page;
    page-break-before: avoid;
  }
  .edu-item{
    break-inside: avoid-page;
    page-break-inside: avoid;
    -webkit-column-break-inside: avoid;
  }
  .section-education > h2 + .edu-item{
    break-before: avoid-page;
    page-break-before: avoid;
  }
  .section-skills > h2 + .skills-list,
  .section-skills > h2 + .skill-list,
  .section-skills > h2 + .skill-groups,
  .section-skills > h2 + .skills-inline{
    break-before: avoid-page;
    page-break-before: avoid;
  }
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

    const openTagMatch = html.match(/<([a-zA-Z][\w:-]*)\b[^>]*class=(?:'|")[^'"]*\bresume\b[^'"]*(?:'|")[^>]*>/i);
    const styleMatches = html.match(/<style[^>]*>[\s\S]*?<\/style>/gi) || [];
    const styles = styleMatches.join('\n');

    if (openTagMatch && typeof openTagMatch.index === 'number') {
        const start = openTagMatch.index;
        const tagName = openTagMatch[1];
        const tagRegex = new RegExp(`<\\/?${tagName}\\b`, 'gi');
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

const DOCX_SUPPORTED_INLINE_PROPS = [
    'color',
    'background-color',
    'text-align',
    'font-weight',
    'font-family',
    'font-size',
    'line-height',
    'margin-left',
    'margin-right',
    'vertical-align',
    'display',
    'width',
    'height',
    'min-width',
    'max-width',
    'border',
    'border-top',
    'border-left',
    'border-bottom',
    'border-right',
    'border-collapse',
    'column-span',
];

const DOCX_TEXT_STYLE_PROPS = [
    'color',
    'font-family',
    'font-size',
    'font-weight',
    'line-height',
    'text-align',
    'vertical-align',
];

async function inlineDocxSupportedStyles(html) {
    if (!html || typeof html !== 'string') return html;

    let browser = null;
    try {
        browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        });
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'domcontentloaded' });

        const inlined = await page.evaluate((styleProps, textStyleProps) => {
            const isTransparent = (value) => {
                const v = String(value || '').trim().toLowerCase();
                return v === 'transparent' || v === 'rgba(0, 0, 0, 0)' || v === 'rgba(0,0,0,0)';
            };

            const isZeroBorder = (value) => {
                const v = String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
                if (!v || v === 'none' || v === '0') return true;
                return /^0(?:px|pt|cm|mm|in|pc|em|rem)?(?:\s+none)?(?:\s+rgb\([^)]+\)|\s+rgba\([^)]+\)|\s+#[0-9a-f]+)?$/.test(v);
            };

            const normalizeValue = (prop, rawValue) => {
                let value = String(rawValue || '').trim();
                if (!value) return '';

                if (prop === 'text-align') {
                    if (value === 'start') value = 'left';
                    if (value === 'end') value = 'right';
                    if (!['left', 'right', 'center', 'justify'].includes(value)) return '';
                }

                if (prop === 'font-weight') {
                    const numeric = Number.parseInt(value, 10);
                    const isBold = Number.isFinite(numeric) ? numeric >= 600 : /bold/i.test(value);
                    return isBold ? 'bold' : '';
                }

                if (prop === 'line-height' && value === 'normal') return '';
                if ((prop === 'background-color' || prop === 'color') && isTransparent(value)) return '';

                if (
                    (prop === 'width' || prop === 'height' || prop === 'min-width' || prop === 'max-width') &&
                    (value === 'auto' || value === 'none')
                ) {
                    return '';
                }

                if ((prop === 'border' || prop.startsWith('border-')) && isZeroBorder(value)) return '';
                if (prop === 'border-collapse' && value !== 'collapse') return '';
                if (prop === 'column-span' && (value === 'none' || value === '1')) return '';

                return value;
            };

            const all = Array.from(document.querySelectorAll('*'));
            for (const el of all) {
                const computed = window.getComputedStyle(el);
                const styleChunks = [];

                for (const prop of styleProps) {
                    const normalized = normalizeValue(prop, computed.getPropertyValue(prop));
                    if (!normalized) continue;
                    styleChunks.push(`${prop}: ${normalized}`);
                }

                if (!styleChunks.length) continue;

                const existing = String(el.getAttribute('style') || '').trim();
                if (existing) {
                    const trimmed = existing.replace(/;+\s*$/, '');
                    el.setAttribute('style', `${trimmed}; ${styleChunks.join('; ')};`);
                } else {
                    el.setAttribute('style', `${styleChunks.join('; ')};`);
                }
            }

            const textStyleFromComputed = (target) => {
                const computed = window.getComputedStyle(target);
                const chunks = [];
                for (const prop of textStyleProps) {
                    const normalized = normalizeValue(prop, computed.getPropertyValue(prop));
                    if (!normalized) continue;
                    chunks.push(`${prop}: ${normalized}`);
                }
                return chunks.join('; ');
            };

            for (const el of all) {
                const tag = String(el.tagName || '').toLowerCase();
                if (tag === 'script' || tag === 'style' || tag === 'noscript') continue;

                const textStyle = textStyleFromComputed(el);
                if (!textStyle) continue;

                const childNodes = Array.from(el.childNodes || []);
                for (const node of childNodes) {
                    if (!node || node.nodeType !== Node.TEXT_NODE) continue;
                    const text = String(node.textContent || '');
                    if (!text.trim()) continue;

                    const span = document.createElement('span');
                    span.setAttribute('style', `${textStyle};`);
                    span.textContent = text;
                    el.replaceChild(span, node);
                }
            }

            const parseRgb = (value) => {
                const v = String(value || '').trim().toLowerCase();
                if (!v) return null;

                const rgb = v.match(/^rgba?\(([^)]+)\)$/i);
                if (rgb) {
                    const parts = rgb[1].split(',').map((p) => p.trim());
                    if (parts.length < 3) return null;
                    const r = Number(parts[0]);
                    const g = Number(parts[1]);
                    const b = Number(parts[2]);
                    const a = parts.length >= 4 ? Number(parts[3]) : 1;
                    if (![r, g, b, a].every(Number.isFinite)) return null;
                    return { r, g, b, a };
                }

                const hex = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
                if (hex) {
                    const raw = hex[1];
                    if (raw.length === 3) {
                        return {
                            r: Number.parseInt(raw[0] + raw[0], 16),
                            g: Number.parseInt(raw[1] + raw[1], 16),
                            b: Number.parseInt(raw[2] + raw[2], 16),
                            a: 1,
                        };
                    }
                    return {
                        r: Number.parseInt(raw.slice(0, 2), 16),
                        g: Number.parseInt(raw.slice(2, 4), 16),
                        b: Number.parseInt(raw.slice(4, 6), 16),
                        a: 1,
                    };
                }

                return null;
            };

            const isTransparentColor = (value) => {
                const parsed = parseRgb(value);
                if (parsed) return parsed.a <= 0.01;
                const v = String(value || '').trim().toLowerCase();
                return !v || v === 'transparent' || v === 'rgba(0, 0, 0, 0)' || v === 'rgba(0,0,0,0)';
            };

            const luminance = (value) => {
                const parsed = parseRgb(value);
                if (!parsed) return null;
                return (0.2126 * parsed.r + 0.7152 * parsed.g + 0.0722 * parsed.b) / 255;
            };

            const isLightColor = (value) => {
                const l = luminance(value);
                return l != null && l >= 0.75;
            };

            const isDarkColor = (value) => {
                const l = luminance(value);
                return l != null && l <= 0.35;
            };

            const appendInlineStyles = (el, declarations) => {
                if (!declarations || !declarations.length) return;
                const existing = String(el.getAttribute('style') || '').trim().replace(/;+\s*$/, '');
                const next = existing
                    ? `${existing}; ${declarations.join('; ')};`
                    : `${declarations.join('; ')};`;
                el.setAttribute('style', next);
            };

            const nearestSolidBackground = (start) => {
                let cursor = start;
                while (cursor) {
                    const bg = window.getComputedStyle(cursor).backgroundColor;
                    if (!isTransparentColor(bg)) return bg;
                    cursor = cursor.parentElement;
                }
                return '';
            };

            const normalizeBackgroundContrastForDocx = () => {
                const nodes = Array.from(document.querySelectorAll('*'));
                for (const el of nodes) {
                    const hasDirectText = Array.from(el.childNodes || [])
                        .some((node) => node && node.nodeType === Node.TEXT_NODE && String(node.textContent || '').trim().length > 0);
                    if (!hasDirectText) continue;

                    const computed = window.getComputedStyle(el);
                    const fg = computed.color;
                    if (!isLightColor(fg)) continue;

                    const ownBg = computed.backgroundColor;
                    if (!isTransparentColor(ownBg)) continue;

                    const ancestorBg = nearestSolidBackground(el.parentElement);
                    if (ancestorBg && isDarkColor(ancestorBg)) {
                        const existing = String(el.getAttribute('style') || '');
                        const add = [];
                        if (!/\bbackground(?:-color)?\s*:/i.test(existing)) {
                            add.push(`background-color: ${ancestorBg}`);
                        }
                        if (!/\bpadding-left\s*:/i.test(existing)) add.push('padding-left: 1px');
                        if (!/\bpadding-right\s*:/i.test(existing)) add.push('padding-right: 1px');
                        if (add.length) appendInlineStyles(el, add);
                        continue;
                    }

                    appendInlineStyles(el, ['color: #111827']);
                }
            };

            const normalizeHeaderTitle = () => {
                const titleNodes = Array.from(document.querySelectorAll('.header .title, .resume-header .role'));
                for (const node of titleNodes) {
                    if (!node || String(node.tagName || '').toLowerCase() === 'p') continue;
                    const p = document.createElement('p');
                    const style = node.getAttribute('style');
                    if (style) p.setAttribute('style', style);
                    p.innerHTML = node.innerHTML;
                    node.replaceWith(p);
                }
            };

            const normalizeContactRows = () => {
                const rows = Array.from(document.querySelectorAll('.contact-info, .header-detail'));
                for (const row of rows) {
                    const elementChildren = Array.from(row.children || []);
                    const textItems = elementChildren
                        .filter((child) => child && child.nodeType === Node.ELEMENT_NODE)
                        .map((child) => {
                            const text = String(child.textContent || '').replace(/\s+/g, ' ').trim();
                            if (!text) return null;
                            return { text, style: child.getAttribute('style') || '' };
                        })
                        .filter(Boolean);

                    if (!textItems.length) continue;

                    const p = document.createElement('p');
                    const rowStyle = row.getAttribute('style');
                    if (rowStyle) p.setAttribute('style', rowStyle);

                    for (let i = 0; i < textItems.length; i++) {
                        const item = textItems[i];
                        const span = document.createElement('span');
                        if (item.style) span.setAttribute('style', item.style);
                        span.textContent = item.text;
                        p.appendChild(span);

                        if (i < textItems.length - 1) {
                            const sep = document.createElement('span');
                            sep.textContent = ' | ';
                            p.appendChild(sep);
                        }
                    }

                    row.replaceWith(p);
                }
            };

            const normalizeSkillsForDocx = () => {
                const groupedSkillNodes = Array.from(document.querySelectorAll('.skill-group'));
                for (const group of groupedSkillNodes) {
                    if (!group || !group.isConnected) continue;
                    const title = String(group.querySelector('.skill-group-title')?.textContent || '').replace(/\s+/g, ' ').trim();
                    const itemNodes = Array.from(group.querySelectorAll('.skill-items > *, .skill-list > li'));
                    const items = itemNodes
                        .map((node) => String(node.textContent || '').replace(/\s+/g, ' ').trim())
                        .filter(Boolean);
                    if (!title && !items.length) continue;

                    const p = document.createElement('p');
                    p.setAttribute('style', 'margin: 0 0 3px 0;');

                    if (title) {
                        const strong = document.createElement('strong');
                        strong.textContent = `${title}: `;
                        p.appendChild(strong);
                    }

                    const span = document.createElement('span');
                    span.textContent = items.join(', ');
                    p.appendChild(span);
                    group.replaceWith(p);
                }

                const candidates = Array.from(
                    document.querySelectorAll(
                        ".skills-list, .skill-list, .skill-tags, .skills-tags, [class*='skills-list'], [class*='skill-list'], [class*='skill-tag']",
                    ),
                );

                const parseDelimitedSkills = (text) => String(text || '')
                    .split(/[\n|•·;]+/g)
                    .map((s) => s.replace(/\s+/g, ' ').trim())
                    .filter(Boolean);

                for (const container of candidates) {
                    if (!container || !container.isConnected) continue;

                    const tag = String(container.tagName || '').toLowerCase();
                    if (tag === 'ul' || tag === 'ol') continue;

                    const className = String(container.className || '').toLowerCase();
                    const isSingleSkillTagNode = className.includes('skill-tag')
                        && !className.includes('skills-list')
                        && !className.includes('skill-list')
                        && !className.includes('skills-tags')
                        && !className.includes('skill-tags')
                        && (!container.children || container.children.length === 0);
                    if (isSingleSkillTagNode) continue;

                    const directItems = Array.from(container.children || [])
                        .map((child) => String(child.textContent || '').replace(/\s+/g, ' ').trim())
                        .filter(Boolean);

                    let skills = directItems;
                    if (!skills.length) {
                        skills = parseDelimitedSkills(container.textContent || '');
                    }

                    if (!skills.length) continue;

                    const list = document.createElement('ul');
                    list.setAttribute('style', 'margin: 0; padding-left: 18px;');

                    const containerTextStyle = textStyleFromComputed(container);
                    for (const skill of skills) {
                        const li = document.createElement('li');
                        li.setAttribute('style', 'margin: 0 0 2px 0;');

                        const span = document.createElement('span');
                        if (containerTextStyle) span.setAttribute('style', `${containerTextStyle};`);
                        span.textContent = skill;

                        li.appendChild(span);
                        list.appendChild(li);
                    }

                    container.replaceWith(list);
                }
            };

            normalizeHeaderTitle();
            normalizeContactRows();
            normalizeSkillsForDocx();
            normalizeBackgroundContrastForDocx();

            document.querySelectorAll('script').forEach((node) => node.remove());
            return `<!DOCTYPE html>${document.documentElement.outerHTML}`;
        }, DOCX_SUPPORTED_INLINE_PROPS, DOCX_TEXT_STYLE_PROPS);

        return typeof inlined === 'string' && inlined.trim() ? inlined : html;
    } catch (error) {
        console.warn('[inlineDocxSupportedStyles] failed, using non-inlined html', error);
        return html;
    } finally {
        if (browser) {
            try {
                await browser.close();
            } catch (closeError) {
                console.warn('[inlineDocxSupportedStyles] browser close failed', closeError);
            }
        }
    }
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
    // Even if client says pre-inlined, keep a backend safety pass when light text exists.
    // This protects against stale frontend builds/caches where white-on-transparent text can disappear.
    const hasLightTextRisk = /(?:color\s*:\s*(?:white|#fff\b|#ffffff\b|rgb\(\s*255\s*,\s*255\s*,\s*255\s*\)|rgba\(\s*255\s*,\s*255\s*,\s*255\s*,))/i
        .test(prepared.docHtml);
    const shouldInlineOnBackend = !options.preInlined || hasLightTextRisk;
    const docHtmlForExport = shouldInlineOnBackend
        ? await inlineDocxSupportedStyles(prepared.docHtml)
        : prepared.docHtml;
    return sendDocxBuffer(docHtmlForExport, prepared.vars, prepared.margin, prepared.fullName, filename, res);
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
    const inlinedDocHtml = await inlineDocxSupportedStyles(prepared.docHtml);
    return sendDocxBuffer(inlinedDocHtml, prepared.vars, prepared.margin, prepared.fullName, filename, res);
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
    inlineDocxSupportedStyles,
    sendDocFromHtml,
    sendDocResume,
};
