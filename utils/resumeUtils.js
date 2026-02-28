const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const MARGIN_PRESETS = {
    compact: { top: 36, bottom: 36, left: 36, right: 36 },
    standard: { top: 54, bottom: 54, left: 54, right: 54 },
    wide: { top: 72, bottom: 72, left: 72, right: 72 },
};

const DEFAULT_CONFIG = {
    marginPreset: 'standard',
    fontFamily: 'Arial, sans-serif',
    fontSize: 10,
    lineHeight: 1.4,
    accentColor: '#2563eb',
    layoutMode: 'single',
    sectionOrder: ['summary', 'experience', 'education', 'skills'],
    sectionLabels: {
        summary: 'Professional Summary',
        experience: 'Experience',
        education: 'Education',
        skills: 'Skills',
    },
    hiddenSections: [],
};

const FALLBACK_TEMPLATE = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 100%; background: #fff; }
  .resume { font-family: var(--font-family); font-size: var(--font-size); line-height: var(--line-height); color: #1f2937; max-width: 800px; margin: 0 auto; }
  .section { margin-bottom: 14px; }
  .section h2 { font-size: calc(var(--font-size) + 2pt); margin-bottom: 6px; padding-bottom: 3px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--accent); border-bottom: 1px solid var(--accent); }
  .description ul { padding-left: 16px; margin-top: 3px; }
  .description li { margin-bottom: 2px; }
  .header { text-align: center; margin-bottom: 12px; border-bottom: 2px solid var(--accent); padding-bottom: 10px; }
  .header h1 { font-size: calc(var(--font-size) + 8pt); color: #111827; }
  .header .title { font-size: calc(var(--font-size) + 1pt); color: #4b5563; margin-bottom: 6px; }
  .contact-info { display: flex; justify-content: center; flex-wrap: wrap; gap: 12px; font-size: calc(var(--font-size) - 0.5pt); color: #6b7280; }
  .exp-item { margin-bottom: 10px; }
  .exp-header { display: flex; justify-content: space-between; align-items: baseline; }
  .exp-header h3 { font-size: calc(var(--font-size) + 0.5pt); }
  .exp-company { color: var(--accent); font-weight: 600; }
  .exp-date { color: #6b7280; font-size: calc(var(--font-size) - 0.5pt); }
  .edu-item { margin-bottom: 6px; }
  .edu-meta { color: #6b7280; font-size: calc(var(--font-size) - 0.5pt); }
  .skills-list { display: flex; flex-wrap: wrap; gap: 6px; }
  .skill-tag { background: #f3f4f6; color: #374151; padding: 2px 8px; border-radius: 3px; font-size: calc(var(--font-size) - 0.5pt); border: 1px solid #e5e7eb; }
</style></head><body>
<div class="resume">
  <header class="header">
    <h1>{{fullName}}</h1>
    <div class="title">{{title}}</div>
    <div class="contact-info">
      <span>{{email}}</span><span>{{phone}}</span><span>{{linkedin}}</span><span>{{address}}</span>
    </div>
  </header>
  {{#section summary}}
  <section class="section section-summary"><h2>{{label:summary:Professional Summary}}</h2><div class="summary">{{summary}}</div></section>
  {{/section}}
  {{#section experience}}
  <section class="section section-experience"><h2>{{label:experience:Experience}}</h2>
    {{#each experiences}}<div class="exp-item"><div class="exp-header"><h3>{{roleTitle}}</h3><span class="exp-date">{{startDate}} – {{endDate}}</span></div><div class="exp-company">{{companyName}}</div><div class="description"><ul>{{description}}</ul></div></div>{{/each}}
  </section>
  {{/section}}
  {{#section education}}
  <section class="section section-education"><h2>{{label:education:Education}}</h2>
    {{#each education}}<div class="edu-item"><h3>{{degreeLevel}} in {{major}}</h3><div class="edu-meta">{{universityName}} | {{startDate}} – {{endDate}}</div></div>{{/each}}
  </section>
  {{/section}}
  {{#section skills}}
  <section class="section section-skills"><h2>{{label:skills:Skills}}</h2>
    <div class="skills-list">{{#each skills}}<span class="skill-tag">{{this}}</span>{{/each}}</div>
  </section>
  {{/section}}
</div>
</body></html>`;

function getConfig(resume) {
    if (resume.pageFrameConfig && typeof resume.pageFrameConfig === 'object') {
        return { ...DEFAULT_CONFIG, ...resume.pageFrameConfig };
    }
    return DEFAULT_CONFIG;
}

function getMargins(config) {
    return MARGIN_PRESETS[config.marginPreset] || MARGIN_PRESETS.standard;
}

function cssVarsBlock(config) {
    const m = getMargins(config);
    return `<style>:root {
    --font-family: ${config.fontFamily};
    --font-size: ${config.fontSize}pt;
    --line-height: ${config.lineHeight};
    --accent: ${config.accentColor};
    --margin-top: ${m.top}px;
    --margin-bottom: ${m.bottom}px;
    --margin-left: ${m.left}px;
    --margin-right: ${m.right}px;
  }</style>`;
}

function injectCssVars(html, config) {
    html = html.replace(/<style>\s*:root\s*\{[^}]*\}\s*<\/style>/i, '');
    const injection = cssVarsBlock(config);
    if (html.includes('</head>')) {
        return html.replace('</head>', injection + '</head>');
    }
    return injection + html;
}

/**
 * Attempt to sanitize HTML that was generated for the in-app paged preview.
 * The preview wrapper injects a paging script and then (when executed in-browser)
 * produces stacked page frames with clipped clones of the resume content.
 * When that DOM/HTML is posted back to the server for PDF rendering the result
 * often contains the preview frames which visually duplicate margins/gaps.
 *
 * This function tries to extract the original `.resume` element and rebuild a
 * simple, print-friendly HTML document with provided print margins. If no
 * resume element can be found it will strip the paging script and return the
 * original HTML as a best-effort fallback.
 */
function sanitizePagedPreviewHtml(html, margin) {
    if (!html || typeof html !== 'string') return html;

    // Quick heuristic: if the HTML contains the paging-script marker, proceed.
    const hasPagingMarkers = /document\.body\.appendChild\(v\)|GAP=24|wrapWithPagedPreview|display:flex;flex-direction:column;align-items:center;gap:/.test(html);

    // Try to find the original resume node (element with class "resume").
    // Use a simple tag-balanced scanner to capture the full outer <div> including nested children.
    const openTagMatch = html.match(/<div\b[^>]*class=(?:'|")[^'"]*\bresume\b[^'"]*(?:'|")[^>]*>/i);
    const styleMatches = html.match(/<style[^>]*>[\s\S]*?<\/style>/gi) || [];
    const styles = styleMatches.join("\n");

    if (openTagMatch && typeof openTagMatch.index === "number") {
        const start = openTagMatch.index;
        // Scanner to find matching closing </div> for the opened .resume div
        const tagRegex = /<\/?div\b/gi;
        tagRegex.lastIndex = start;
        let depth = 0;
        let match;
        // Move to the first matched tag (the opening we already found)
        match = tagRegex.exec(html);
        if (match) {
            // Initialize depth to 1 for the opening .resume div
            depth = 1;
            let endPos = -1;
            while ((match = tagRegex.exec(html)) !== null) {
                const idx = match.index;
                const isClose = html[idx + 1] === '/';
                if (isClose) {
                    depth--;
                } else {
                    depth++;
                }
                if (depth === 0) {
                    // find the end of this closing tag '>'
                    const closeTagEnd = html.indexOf('>', idx);
                    endPos = closeTagEnd >= 0 ? closeTagEnd + 1 : idx;
                    break;
                }
            }
            if (endPos > start) {
                const resumeHtml = html.slice(start, endPos);
                // Build a clean HTML document with @page margins to let Puppeteer apply print margins
                const toCm = (px) => (px / 96 * 2.54).toFixed(2);
                const pageStyle = `<style>html,body{margin:0;padding:0;} body{background:#fff;} @page{margin:${toCm(margin.top)}cm ${toCm(margin.right)}cm ${toCm(margin.bottom)}cm ${toCm(margin.left)}cm;}</style>`;
                return `<!DOCTYPE html><html><head><meta charset="utf-8">${styles}\n${pageStyle}</head><body>${resumeHtml}</body></html>`;
            }
        }
    }

    // If no resume element, at least remove the paging script so the preview frames aren't included.
    // Remove the paging script block appended by wrapWithPagedPreview (heuristic)
    const cleaned = html.replace(/<script>[\s\S]*?wrapWithPagedPreview[\s\S]*?<\/script>/i, '')
        .replace(/<script>[\s\S]*?document\.body\.appendChild\(v\);[\s\S]*?<\/script>/i, '')
        // Remove the generated page-frame wrappers (divs with fixed width/height/background white)
        .replace(/<div[^>]*style=["'][^"']*width:\s*816px;[^"']*height:\s*1056px;[^"']*background:\s*white;[^"']*["'][\s\S]*?<\/div>/gi, '')
        .replace(/<div[^>]*id=["']?thumb-clip["']?[^>]*>[\s\S]*?<\/div>/gi, '');

    return hasPagingMarkers ? cleaned : html;
}

// Extract head and body inner HTML (best-effort). Returns { head, body } where either may be empty.
function extractHeadAndBody(html) {
    const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const head = headMatch ? headMatch[1] : '';
    const body = bodyMatch ? bodyMatch[1] : (headMatch ? html.replace(headMatch[0], '') : html);
    return { head, body };
}

// Find CSS variables declared in a :root block within CSS text.
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

// Replace occurrences of var(--name) in css/text with actual values from vars map.
function replaceCssVarsInText(text, vars) {
    return text.replace(/var\(--([a-zA-Z0-9-_]+)\)/g, (m, name) => {
        if (Object.prototype.hasOwnProperty.call(vars, name)) return vars[name];
        return m;
    });
}

// Word does not support calc(). Resolve calc(var(--font-size) + Npt) and calc(var(--font-size) - Npt).
function resolveCalcFontSize(text, vars) {
    const raw = vars['font-size'] || vars['fontSize'] || '10pt';
    const num = parseFloat(String(raw).replace(/pt|px|em|rem/gi, '')) || 10;
    return text
        .replace(/calc\s*\(\s*var\s*\(\s*--font-size\s*\)\s*\+\s*([\d.]+)\s*pt\s*\)/gi, (_, a) => `${(num + parseFloat(a)).toFixed(2)}pt`)
        .replace(/calc\s*\(\s*var\s*\(\s*--font-size\s*\)\s*-\s*([\d.]+)\s*pt\s*\)/gi, (_, a) => `${(num - parseFloat(a)).toFixed(2)}pt`);
}

// Build DOC-specific style block: @page (size + margin), body base (font, font-size, line-height), matching preview/template.
function buildDocPageAndBodyStyles(vars, marginPx) {
    const m = marginPx || { top: 54, right: 54, bottom: 54, left: 54 };
    const toCm = (px) => (Number(px) / 96 * 2.54).toFixed(2);
    const fontFamily = vars['font-family'] || vars['fontFamily'] || 'Arial, sans-serif';
    const fontSize = vars['font-size'] || vars['fontSize'] || '10pt';
    const lineHeight = vars['line-height'] || vars['lineHeight'] || '1.4';
    return `
  /* Page layout: US Letter, margins from template config (same as preview) */
  @page {
    size: letter;
    margin: ${toCm(m.top)}cm ${toCm(m.right)}cm ${toCm(m.bottom)}cm ${toCm(m.left)}cm;
  }
  /* Base typography so DOC matches preview: font, size, line-height */
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

// Parse margin values from :root vars (e.g. "54px") for when we only have HTML (sendDocFromHtml).
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

// Ensure the resume root element has inline styles matching the template vars + margins.
function injectInlineResumeStyles(bodyHtml, vars, margin) {
    const fontFamily = vars['font-family'] || vars['fontFamily'] || '';
    const fontSize = vars['font-size'] || vars['fontSize'] || '';
    const lineHeight = vars['line-height'] || vars['lineHeight'] || '';
    const accent = vars['accent'] || vars['accentColor'] || '';
    // Compute content width based on US Letter PW=816 and margins (px)
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

    // Try to inject into existing .resume element
    const resumeOpenTagRegex = /<div\b([^>]*)class=(?:'|")[^'"]*\bresume\b[^'"]*(?:'|")([^>]*)>/i;
    if (resumeOpenTagRegex.test(bodyHtml)) {
        return bodyHtml.replace(resumeOpenTagRegex, (m, g1, g2) => {
            // If there's already a style attribute, append to it
            if (/style\s*=/.test(g1 + g2)) {
                return m.replace(/style=(["'])(.*?)\1/, (mm, q, val) => {
                    return `style=${q}${val} ${inline}${q}`;
                });
            }
            return `<div ${g1}class="resume"${g2} style="${inline}">`;
        });
    }

    // Otherwise wrap body content
    return `<div class="resume" style="${inline}">${bodyHtml}</div>`;
}

function escapeHtml(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function formatDate(date) {
    if (!date) return '';
    try {
        const d = new Date(date);
        if (isNaN(d.getTime())) return date;
        return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    } catch {
        return date;
    }
}

function parseSkillsList(content) {
    if (!content || !content.trim()) return [];
    return content
        .split('\n')
        .map(line => line.replace(/^[\s\-*•]+/, '').replace(/^\*\*.*?\*\*\s*/, '').trim())
        .filter(Boolean);
}

function buildRenderData(resume) {
    const profile = resume.profileId && typeof resume.profileId === 'object' ? resume.profileId : {};
    const contactInfo = profile.contactInfo || {};
    const content = resume.content || {};
    const experienceStrings = content.experienceStrings || {};
    const skillsContent = content.skillsContent || '';

    const experiences = (profile.experiences || []).map(exp => {
        const key = `${exp.roleTitle}@${exp.companyName}`;
        const raw = experienceStrings[key];
        let points;
        if (typeof raw === 'string' && raw.trim()) {
            points = raw.split('\n')
                .map(line => line.replace(/^[\s\-*•]+/, '').trim())
                .filter(Boolean);
        } else if (Array.isArray(raw)) {
            points = raw;
        } else {
            points = exp.keyPoints || [];
        }
        const descriptionHtml = points
            .filter(p => String(p).trim())
            .map(p => `<li>${escapeHtml(p)}</li>`)
            .join('');
        return {
            roleTitle: exp.roleTitle || '',
            companyName: exp.companyName || '',
            startDate: formatDate(exp.startDate),
            endDate: formatDate(exp.endDate),
            location: '',
            description: descriptionHtml,
        };
    });

    const education = (profile.educations || []).map(edu => ({
        universityName: edu.universityName || '',
        degreeLevel: edu.degreeLevel || '',
        major: edu.major || '',
        startDate: formatDate(edu.startDate),
        endDate: formatDate(edu.endDate),
    }));

    const skills = parseSkillsList(skillsContent);

    return {
        fullName: profile.fullName || resume.name || 'Resume',
        title: profile.title || '',
        email: contactInfo.email || '',
        phone: contactInfo.phone || '',
        linkedin: profile.link || contactInfo.linkedin || '',
        address: contactInfo.address || '',
        summary: resume.summary || '',
        experiences,
        education,
        skills,
    };
}

function applySectionConfig(html, config) {
    const hidden = new Set(config.hiddenSections || []);
    const labels = config.sectionLabels || {};

    let result = html.replace(
        /\{\{#section (\w+)\}\}([\s\S]*?)\{\{\/section\}\}/g,
        (_match, sectionId, content) => {
            if (hidden.has(sectionId)) return '';
            return `<!--section:${sectionId}-->${content}<!--/section:${sectionId}-->`;
        },
    );

    result = result.replace(
        /\{\{label:(\w+):([^}]*)\}\}/g,
        (_match, sectionId, defaultLabel) => labels[sectionId] || defaultLabel,
    );

    const sectionOrder = config.sectionOrder || DEFAULT_CONFIG.sectionOrder;
    const sectionRegex = /<!--section:(\w+)-->([\s\S]*?)<!--\/section:\1-->/g;
    const sections = {};
    let match;
    while ((match = sectionRegex.exec(result)) !== null) {
        sections[match[1]] = match[2];
    }

    if (Object.keys(sections).length > 0) {
        let reordered = '';
        for (const id of sectionOrder) {
            if (sections[id]) reordered += sections[id];
        }
        for (const id of Object.keys(sections)) {
            if (!sectionOrder.includes(id)) reordered += sections[id];
        }
        result = result.replace(
            /<!--section:\w+-->[\s\S]*?<!--\/section:\w+-->/g,
            () => { const next = reordered; reordered = ''; return next; },
        );
    }

    result = result.replace(/<!--\/?section:\w+-->/g, '');
    return result;
}

function renderTemplate(templateHtml, data, config) {
    let html = templateHtml;

    html = html.replace(/\{\{fullName\}\}/g, data.fullName);
    html = html.replace(/\{\{title\}\}/g, data.title);
    html = html.replace(/\{\{email\}\}/g, data.email);
    html = html.replace(/\{\{phone\}\}/g, data.phone);
    html = html.replace(/\{\{linkedin\}\}/g, data.linkedin);
    html = html.replace(/\{\{address\}\}/g, data.address);
    html = html.replace(/\{\{summary\}\}/g, data.summary);

    const expMatch = html.match(/\{\{#each experiences\}\}([\s\S]*?)\{\{\/each\}\}/);
    if (expMatch) {
        const block = expMatch[1];
        const rendered = data.experiences.map(exp => {
            return block
                .replace(/\{\{roleTitle\}\}/g, exp.roleTitle)
                .replace(/\{\{companyName\}\}/g, exp.companyName)
                .replace(/\{\{startDate\}\}/g, exp.startDate)
                .replace(/\{\{endDate\}\}/g, exp.endDate)
                .replace(/\{\{location\}\}/g, exp.location)
                .replace(/\{\{description\}\}/g, exp.description);
        }).join('');
        html = html.replace(/\{\{#each experiences\}\}[\s\S]*?\{\{\/each\}\}/g, rendered);
    }

    const eduMatch = html.match(/\{\{#each education\}\}([\s\S]*?)\{\{\/each\}\}/);
    if (eduMatch) {
        const block = eduMatch[1];
        const rendered = data.education.map(edu => {
            return block
                .replace(/\{\{degreeLevel\}\}/g, edu.degreeLevel)
                .replace(/\{\{major\}\}/g, edu.major)
                .replace(/\{\{universityName\}\}/g, edu.universityName)
                .replace(/\{\{startDate\}\}/g, edu.startDate)
                .replace(/\{\{endDate\}\}/g, edu.endDate);
        }).join('');
        html = html.replace(/\{\{#each education\}\}[\s\S]*?\{\{\/each\}\}/g, rendered);
    }

    const skillMatch = html.match(/\{\{#each skills\}\}([\s\S]*?)\{\{\/each\}\}/);
    if (skillMatch) {
        const block = skillMatch[1];
        const rendered = data.skills.map(skill => block.replace(/\{\{this\}\}/g, escapeHtml(skill))).join('');
        html = html.replace(/\{\{#each skills\}\}[\s\S]*?\{\{\/each\}\}/g, rendered);
    }

    if (config) {
        html = applySectionConfig(html, config);
    }

    return html;
}

function resolveTemplateHtml(resume) {
    const template = resume.templateId && typeof resume.templateId === 'object'
        ? resume.templateId
        : null;
    if (template?.data) return template.data;
    return FALLBACK_TEMPLATE;
}

function buildResumeHtml(resume) {
    const config = getConfig(resume);
    let templateHtml = resolveTemplateHtml(resume);
    templateHtml = injectCssVars(templateHtml, config);
    const data = buildRenderData(resume);
    return renderTemplate(templateHtml, data, config);
}

function sendHtmlResume(resume, res) {
    const html = buildResumeHtml(resume);
    res.set({
        'Content-Type': 'text/html',
        'Content-Disposition': `attachment; filename="${(resume.name || 'resume').replace(/"/g, '')}.html"`,
    });
    res.send(html);
}

async function sendPdfResume(resume, res) {
    const html = buildResumeHtml(resume);
    const config = getConfig(resume);
    const m = getMargins(config);
    const marginPx = (val) => `${val}px`;

    let browser;
    try {
        browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0' });
        await page.emulateMediaType('screen');
        // Puppeteer >= 20 returns Uint8Array; convert to a Node Buffer so
        // Express doesn't accidentally JSON-serialise or stringify the bytes.
        const pdfRaw = await page.pdf({
            format: 'Letter',
            printBackground: true,
            margin: {
                top: marginPx(m.top),
                right: marginPx(m.right),
                bottom: marginPx(m.bottom),
                left: marginPx(m.left),
            },
        });
        const pdfBuffer = Buffer.isBuffer(pdfRaw) ? pdfRaw : Buffer.from(pdfRaw);

        // Validate PDF signature and optionally write debug file
        try {
            const sig = pdfBuffer.slice(0, 5).toString('utf8');
            console.log(`[sendPdfResume] pdf signature: ${sig}`);
            if (!sig.startsWith('%PDF')) {
                const dbgDir = path.resolve(__dirname, '..', 'tmp');
                try { fs.mkdirSync(dbgDir, { recursive: true }); } catch (e) { }
                const outPath = path.join(dbgDir, `${(resume.name || 'resume').replace(/[^a-z0-9-_]/gi, '_')}_resume_debug.pdf`);
                try { fs.writeFileSync(outPath, pdfBuffer); console.error(`[sendPdfResume] Wrote debug PDF to ${outPath}`); } catch (e) { console.error('[sendPdfResume] Failed to write debug PDF:', e); }
            }
        } catch (e) {
            console.error('[sendPdfResume] signature check error:', e);
        }
        await browser.close();
        browser = null;

        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${(resume.name || 'resume').replace(/"/g, '')}.pdf"`,
            'Content-Length': pdfBuffer.length,
        });
        res.end(pdfBuffer);
    } catch (err) {
        if (browser) await browser.close().catch(() => { });
        throw err;
    }
}

async function sendPdfFromHtml(html, res, options = {}) {
    const filename = (options.name || 'resume').replace(/"/g, '');
    const margin = options.margin || { top: 54, right: 54, bottom: 54, left: 54 };
    const marginPx = (val) => `${val}px`;

    let browser;
    try {
        // Diagnostic: log incoming HTML size
        try { console.log(`[sendPdfFromHtml] incoming html length: ${String(html?.length || 0)}`); } catch (e) { }
        // If the client sent a "paged preview" HTML (contains the preview wrapper/script),
        // try to sanitize it and extract the original resume markup so we don't double-apply
        // both the preview page gaps and the PDF print margins.
        try {
            html = sanitizePagedPreviewHtml(html, margin);
        } catch (e) {
            console.warn('[sendPdfFromHtml] sanitizePagedPreviewHtml failed, continuing with original html', e);
        }
        browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0' });
        await page.emulateMediaType('screen');
        // Puppeteer >= 20 returns Uint8Array; convert to a Node Buffer so
        // Express doesn't accidentally JSON-serialise or stringify the bytes.
        const pdfRaw = await page.pdf({
            format: 'Letter',
            printBackground: true,
            margin: {
                top: marginPx(margin.top),
                right: marginPx(margin.right),
                bottom: marginPx(margin.bottom),
                left: marginPx(margin.left),
            },
        });
        const pdfBuffer = Buffer.isBuffer(pdfRaw) ? pdfRaw : Buffer.from(pdfRaw);

        // Diagnostic: log generated PDF buffer size
        try { console.log(`[sendPdfFromHtml] generated pdfBuffer.length: ${pdfBuffer.length}`); } catch (e) { }
        // Validate PDF signature; write debug file if invalid
        try {
            const sig = pdfBuffer.slice(0, 5).toString('utf8');
            console.log(`[sendPdfFromHtml] pdf signature: ${sig}`);
            if (!sig.startsWith('%PDF')) {
                const dbgDir = path.resolve(__dirname, '..', 'tmp');
                try { fs.mkdirSync(dbgDir, { recursive: true }); } catch (e) { }
                const outPath = path.join(dbgDir, `${filename}_debug.pdf`);
                try { fs.writeFileSync(outPath, pdfBuffer); console.error(`[sendPdfFromHtml] Wrote debug PDF to ${outPath}`); } catch (e) { console.error('[sendPdfFromHtml] Failed to write debug PDF:', e); }
            }
        } catch (e) {
            console.error('[sendPdfFromHtml] signature check error:', e);
        }
        await browser.close();
        browser = null;

        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${filename}.pdf"`,
            'Content-Length': pdfBuffer.length,
        });
        res.end(pdfBuffer);
    } catch (err) {
        if (browser) await browser.close().catch(() => { });
        throw err;
    }
}

function sendDocFromHtml(html, res, options = {}) {
    const filename = (options.name || 'resume').replace(/"/g, '');
    const parts = extractHeadAndBody(html);
    const styleMatches = parts.head.match(/<style[^>]*>[\s\S]*?<\/style>/gi) || [];
    const combinedStyles = styleMatches.join("\n");
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
      /* Page layout + body typography (same as preview modal / template config) */
      ${pageAndBodyStyles}
      /* Template styles: flattened vars + resolved calc() for Word */
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
    const combinedStyles = styleMatches.join("\n");
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
    sendHtmlResume,
    sendPdfResume,
    sendDocResume,
    sendPdfFromHtml,
    sendDocFromHtml,
    injectCssVars,
    FALLBACK_TEMPLATE,
    DEFAULT_CONFIG,
    MARGIN_PRESETS,
};
