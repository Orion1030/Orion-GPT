const LEGACY_TOKEN_RE = /\{\{[#/]?(?:each|section)|\{\{label:|\{\{[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)?\}\}/;

function hasLegacyTemplateSyntax(templateHtml) {
    return LEGACY_TOKEN_RE.test(String(templateHtml || ''));
}

function escapeJsString(value) {
    return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
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

function replaceSimpleTokens(block, variableName, rawFields = new Set()) {
    return block.replace(/\{\{([A-Za-z0-9_]+)\}\}/g, (_match, field) => {
        if (rawFields.has(field)) return `<%- ${variableName}.${field} %>`;
        return `<%= ${variableName}.${field} %>`;
    });
}

function convertSkillGroups(templateHtml) {
    return replaceEachBlock(templateHtml, 'skillGroups', (groupBlock) => {
        let converted = replaceEachBlock(groupBlock, 'items', (itemBlock) => {
            const itemHtml = itemBlock
                .replace(/\{\{this\}\}/g, '<%= item %>')
                .replace(/\{\{title\}\}/g, '<%= skillGroup.title %>');
            return `<% (skillGroup.items || []).forEach((item) => { %>${itemHtml}<% }) %>`;
        });
        converted = converted.replace(/\{\{title\}\}/g, '<%= skillGroup.title %>');
        return `<% (skillGroups || []).forEach((skillGroup) => { %>${converted}<% }) %>`;
    });
}

function convertFlatSkills(templateHtml) {
    return replaceEachBlock(templateHtml, 'skills', (skillBlock) => {
        const converted = skillBlock.replace(/\{\{this\}\}/g, '<%= skill %>');
        return `<% (skills || []).forEach((skill) => { %>${converted}<% }) %>`;
    });
}

function convertExperiences(templateHtml) {
    return replaceEachBlock(templateHtml, 'experiences', (expBlock) => {
        const converted = replaceSimpleTokens(expBlock, 'experience', new Set(['description']));
        return `<% (experiences || []).forEach((experience) => { %>${converted}<% }) %>`;
    });
}

function convertEducation(templateHtml) {
    return replaceEachBlock(templateHtml, 'education', (eduBlock) => {
        const converted = replaceSimpleTokens(eduBlock, 'educationItem');
        return `<% (education || []).forEach((educationItem) => { %>${converted}<% }) %>`;
    });
}

function convertSections(templateHtml) {
    return templateHtml.replace(
        /\{\{#section\s+([A-Za-z0-9_]+)\s*\}\}([\s\S]*?)\{\{\/section\}\}/g,
        (_match, sectionId, content) =>
            `<% if (showSection("${escapeJsString(sectionId)}")) { %><!--section:${sectionId}-->${content}<!--/section:${sectionId}--><% } %>`,
    );
}

function convertLegacyTemplateToEjs(templateHtml) {
    let html = String(templateHtml || '');
    html = convertSections(html);
    html = convertSkillGroups(html);
    html = convertFlatSkills(html);
    html = convertExperiences(html);
    html = convertEducation(html);

    html = html.replace(
        /\{\{label:([A-Za-z0-9_]+):([^}]*)\}\}/g,
        (_match, sectionId, defaultLabel) =>
            `<%= sectionLabel("${escapeJsString(sectionId)}", "${escapeJsString(defaultLabel)}") %>`,
    );

    html = html.replace(/\{\{summary\}\}/g, '<%- summary %>');
    html = html.replace(/\{\{description\}\}/g, '<%- description %>');

    const scalarFields = [
        'fullName',
        'title',
        'email',
        'phone',
        'linkedin',
        'github',
        'website',
        'address',
    ];
    for (const field of scalarFields) {
        html = html.replace(new RegExp(`\\{\\{${field}\\}\\}`, 'g'), `<%= ${field} %>`);
    }

    return html;
}

module.exports = {
    hasLegacyTemplateSyntax,
    convertLegacyTemplateToEjs,
};
