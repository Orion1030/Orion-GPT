/**
 * Backend template renderer. The portable subset of this module has been
 * extracted to packages/resume-renderer (@jobsy/resume-renderer) for use
 * in both the frontend and backend. This file retains the full server-side
 * implementation including sanitize-html, CSS variables, and Puppeteer output.
 *
 * Migration: Once pnpm workspaces are fully wired, import portable helpers from
 * '@jobsy/resume-renderer' instead of duplicating them here.
 */
const sanitizeHtml = require('sanitize-html');
const ejs = require('ejs');
const { profileExperienceToResumeExperience } = require('./experienceAdapter');
const { convertLegacyTemplateToEjs } = require('./templateSyntaxMigration');

const RESUME_RICH_SUMMARY = {
    allowedTags: ['b', 'i', 'em', 'strong', 'u', 'a', 'br', 'p', 'ul', 'ol', 'li'],
    allowedAttributes: { a: ['href', 'target', 'rel'] },
};

const RESUME_RICH_LI = {
    allowedTags: ['b', 'i', 'em', 'strong', 'u', 'a', 'br'],
    allowedAttributes: { a: ['href', 'target', 'rel'] },
};

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

const FALLBACK_TEMPLATE = convertLegacyTemplateToEjs(`<!DOCTYPE html>
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
  .skill-groups { display: grid; gap: 5px; }
  .skill-group { display: grid; grid-template-columns: 120px 1fr; gap: 8px; align-items: start; }
  .skill-group-title { font-weight: 700; color: #111827; }
  .skill-items { color: #374151; font-size: calc(var(--font-size) - 0.5pt); }
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
    <div class="skill-groups">
      {{#each skillGroups}}
      <div class="skill-group">
        <div class="skill-group-title">{{title}}</div>
        <div class="skill-items"><%= (skillGroup.items || []).filter(Boolean).join(", ") %></div>
      </div>
      {{/each}}
    </div>
  </section>
  {{/section}}
</div>
</body></html>`);

const EJS_RENDER_OPTIONS = {
    async: false,
    cache: false,
    compileDebug: false,
};

const DISALLOWED_EJS_IDENTIFIER_RE = /<%[\s\S]*?\b(?:require|process|global|globalThis|Function|eval|module|exports|__dirname|__filename)\b[\s\S]*?%>/;

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
        return d.toLocaleDateString('en-US', {
            month: 'short',
            year: 'numeric',
            timeZone: 'UTC',
        });
    } catch {
        return date;
    }
}

function sanitizeSummaryForTemplate(s) {
    if (!s) return '';
    const t = String(s).trim();
    if (!/<[a-z]/i.test(t)) {
        return escapeHtml(t).replace(/\n/g, '<br>');
    }
    return sanitizeHtml(t, RESUME_RICH_SUMMARY);
}

function descriptionPointToLi(p) {
    const s = String(p).trim();
    if (!s) return '';
    if (/[<>]/.test(s)) {
        return `<li>${sanitizeHtml(s, RESUME_RICH_LI)}</li>`;
    }
    return `<li>${escapeHtml(s)}</li>`;
}

function parseSkillsList(content) {
    if (!content || !content.trim()) return [];
    return content
        .split('\n')
        .map(line => line.replace(/^[\s\-*•]+/, '').replace(/^\*\*.*?\*\*\s*/, '').trim())
        .filter(Boolean);
}

function pushSkillGroup(target, byTitle, title, items) {
    const cleanTitle = String(title || '').trim() || 'Skills';
    const cleanItems = (Array.isArray(items) ? items : [])
        .map(item => String(item || '').trim())
        .filter(Boolean);
    if (!cleanItems.length) return;

    const key = cleanTitle.toLowerCase();
    const existingIndex = byTitle.get(key);
    if (existingIndex == null) {
        byTitle.set(key, target.length);
        target.push({ title: cleanTitle, items: [...new Set(cleanItems)] });
        return;
    }

    const existing = target[existingIndex];
    for (const item of cleanItems) {
        if (!existing.items.includes(item)) existing.items.push(item);
    }
}

function buildSkillGroups(skills) {
    if (!Array.isArray(skills)) return [];

    const groups = [];
    const byTitle = new Map();

    for (const section of skills) {
        if (typeof section === 'string') {
            pushSkillGroup(groups, byTitle, 'Skills', [section]);
            continue;
        }
        if (!section || typeof section !== 'object') continue;

        const sectionTitle = String(section.title || '').trim() || 'Skills';
        const rawItems = Array.isArray(section.items) ? section.items : [];
        const flatItems = [];

        for (const item of rawItems) {
            if (item && typeof item === 'object' && !Array.isArray(item)) {
                const nestedItems = Array.isArray(item.items) ? item.items : [];
                pushSkillGroup(groups, byTitle, item.title || sectionTitle, nestedItems);
                continue;
            }
            flatItems.push(item);
        }

        pushSkillGroup(groups, byTitle, sectionTitle, flatItems);
    }

    return groups;
}

function flattenSkillGroups(skillGroups) {
    const out = [];
    for (const group of skillGroups || []) {
        for (const item of group.items || []) {
            if (!out.includes(item)) out.push(item);
        }
    }
    return out;
}

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
        /<!--section:(\w+)-->([\s\S]*?)<!--\/section:\1-->/g,
        (match, sectionId) => hidden.has(sectionId) ? '' : match,
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

function showSectionForConfig(config, sectionId) {
    const hidden = new Set(config.hiddenSections || []);
    return !hidden.has(sectionId);
}

function sectionLabelForConfig(config, sectionId, defaultLabel) {
    const labels = config.sectionLabels || {};
    return labels[sectionId] || defaultLabel;
}

function safeHtml(value) {
    return String(value ?? '');
}

function buildEjsLocals(data, config = DEFAULT_CONFIG) {
    return {
        fullName: data.fullName || '',
        title: data.title || '',
        email: data.email || '',
        phone: data.phone || '',
        linkedin: data.linkedin || '',
        github: data.github || '',
        website: data.website || '',
        address: data.address || '',
        summary: data.summary || '',
        experiences: Array.isArray(data.experiences) ? data.experiences : [],
        education: Array.isArray(data.education) ? data.education : [],
        skills: Array.isArray(data.skills) ? data.skills : [],
        skillGroups: Array.isArray(data.skillGroups) ? data.skillGroups : [],
        showSection: (sectionId) => showSectionForConfig(config, sectionId),
        sectionLabel: (sectionId, defaultLabel) => sectionLabelForConfig(config, sectionId, defaultLabel),
        safeHtml,
    };
}

function assertEjsTemplateIsAllowed(templateHtml) {
    if (DISALLOWED_EJS_IDENTIFIER_RE.test(String(templateHtml || ''))) {
        throw new Error('Template uses a blocked EJS identifier');
    }
}

function buildRenderData(resume) {
    const profile = resume.profileId && typeof resume.profileId === 'object' ? resume.profileId : {};
    const contactInfo = profile.contactInfo || {};
    const sourceExperiences = Array.isArray(resume.experiences) ? resume.experiences : [];

    const experiences = sourceExperiences.map(exp => {
        const normalized = profileExperienceToResumeExperience(exp);
        const descriptionHtml = normalized.descriptions
            .filter(p => String(p).trim())
            .map(descriptionPointToLi)
            .join('');

        return {
            roleTitle: normalized.title,
            companyName: normalized.companyName,
            startDate: formatDate(normalized.startDate),
            endDate: formatDate(normalized.endDate),
            location: normalized.companyLocation || '',
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

    const skillGroups = buildSkillGroups(resume.skills);
    const skills = flattenSkillGroups(skillGroups);

    return {
        fullName: profile.fullName || resume.name || 'Resume',
        title: profile.title || '',
        email: contactInfo.email || '',
        phone: contactInfo.phone || '',
        linkedin: contactInfo.linkedin || profile.link || '',
        github: contactInfo.github || '',
        website: contactInfo.website || '',
        address: contactInfo.address || '',
        summary: sanitizeSummaryForTemplate(resume.summary || ''),
        experiences,
        education,
        skills,
        skillGroups,
    };
}

function replaceEachBlock(html, collectionName, renderBlock) {
    const openRe = new RegExp(`\\{\\{#each\\s+${collectionName}\\s*\\}\\}`, 'g');
    let result = '';
    let cursor = 0;
    let openMatch;

    while ((openMatch = openRe.exec(html)) !== null) {
        result += html.slice(cursor, openMatch.index);
        const blockStart = openRe.lastIndex;
        const tagRe = /\{\{#each\s+([A-Za-z0-9_]+)\s*\}\}|\{\{\/each\}\}/g;
        tagRe.lastIndex = blockStart;

        let depth = 1;
        let blockEnd = -1;
        let closeEnd = -1;
        let tagMatch;

        while ((tagMatch = tagRe.exec(html)) !== null) {
            if (tagMatch[0].startsWith('{{#each')) depth += 1;
            else depth -= 1;

            if (depth === 0) {
                blockEnd = tagMatch.index;
                closeEnd = tagRe.lastIndex;
                break;
            }
        }

        if (blockEnd < 0 || closeEnd < 0) {
            result += html.slice(openMatch.index);
            return result;
        }

        result += renderBlock(html.slice(blockStart, blockEnd));
        cursor = closeEnd;
        openRe.lastIndex = closeEnd;
    }

    return result + html.slice(cursor);
}

function renderTemplate(templateHtml, data, config) {
    assertEjsTemplateIsAllowed(templateHtml);
    let html = ejs.render(
        String(templateHtml || ''),
        buildEjsLocals(data || {}, config || DEFAULT_CONFIG),
        EJS_RENDER_OPTIONS,
    );

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

function injectHtmlDownloadMetadata(html, fullName) {
    if (!html || typeof html !== 'string') return html;
    const name = String(fullName || '').trim();
    if (!name) return html;
    const safeName = escapeHtml(name);
    const tags = `<title>${safeName}</title><meta name="author" content="${safeName}">`;
    if (html.includes('</head>')) {
        let out = html.replace(/<title[^>]*>[\s\S]*?<\/title>/gi, '');
        out = out.replace(/<meta\s+name=["']author["'][^>]*>/gi, '');
        return out.replace('</head>', `${tags}</head>`);
    }
    return `<!DOCTYPE html><html><head>${tags}</head><body>${html}</body></html>`;
}

function sendHtmlResume(resume, res) {
    const fullName = resume?.profileId && typeof resume.profileId === 'object'
        ? resume.profileId.fullName || ''
        : '';
    const html = injectHtmlDownloadMetadata(buildResumeHtml(resume), fullName);
    res.set({
        'Content-Type': 'text/html',
        'Content-Disposition': `attachment; filename="${(resume.name || 'resume').replace(/"/g, '')}.html"`,
    });
    res.send(html);
}

module.exports = {
    FALLBACK_TEMPLATE,
    DEFAULT_CONFIG,
    MARGIN_PRESETS,
    escapeHtml,
    formatDate,
    sanitizeSummaryForTemplate,
    descriptionPointToLi,
    parseSkillsList,
    buildSkillGroups,
    flattenSkillGroups,
    getConfig,
    getMargins,
    cssVarsBlock,
    injectCssVars,
    applySectionConfig,
    buildEjsLocals,
    assertEjsTemplateIsAllowed,
    buildRenderData,
    renderTemplate,
    resolveTemplateHtml,
    buildResumeHtml,
    injectHtmlDownloadMetadata,
    sendHtmlResume,
};
