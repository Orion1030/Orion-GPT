const puppeteer = require('puppeteer');

const DEFAULT_TEMPLATE = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; background: #fff; }
  .resume { max-width: 800px; margin: 0 auto; }
  .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 40px 30px; text-align: center; }
  .header h1 { font-size: 2.5em; margin-bottom: 10px; font-weight: 300; }
  .header .title { font-size: 1.3em; margin-bottom: 20px; opacity: 0.9; }
  .contact-info { display: flex; justify-content: center; flex-wrap: wrap; gap: 20px; font-size: 0.9em; }
  .content { padding: 30px; }
  .section { margin-bottom: 30px; }
  .section h2 { color: #667eea; font-size: 1.4em; margin-bottom: 15px; padding-bottom: 5px; border-bottom: 2px solid #667eea; }
  .summary { font-size: 1.05em; line-height: 1.7; color: #555; }
  .experience-item, .education-item { margin-bottom: 20px; padding-left: 20px; border-left: 3px solid #667eea; }
  .experience-item h3, .education-item h3 { color: #333; font-size: 1.2em; margin-bottom: 5px; }
  .company, .university { color: #667eea; font-weight: 600; margin-bottom: 5px; }
  .date-location { color: #888; font-size: 0.9em; margin-bottom: 10px; }
  .description ul { list-style-type: disc; padding-left: 18px; margin-top: 4px; }
  .description li { margin-bottom: 3px; line-height: 1.5; font-size: 0.95em; }
  .skills-list { display: flex; flex-wrap: wrap; gap: 10px; }
  .skill-tag { background: #667eea; color: white; padding: 5px 12px; border-radius: 20px; font-size: 0.9em; }
</style></head><body>
<div class="resume">
  <header class="header">
    <h1>{{fullName}}</h1>
    <div class="title">{{title}}</div>
    <div class="contact-info">
      <span>{{email}}</span><span>{{phone}}</span><span>{{linkedin}}</span><span>{{address}}</span>
    </div>
  </header>
  <div class="content">
    <section class="section"><h2>Professional Summary</h2><div class="summary">{{summary}}</div></section>
    <section class="section"><h2>Experience</h2>
      {{#each experiences}}
      <div class="experience-item">
        <h3>{{roleTitle}}</h3>
        <div class="company">{{companyName}}</div>
        <div class="date-location">{{startDate}} - {{endDate}}</div>
        <div class="description"><ul>{{description}}</ul></div>
      </div>
      {{/each}}
    </section>
    <section class="section"><h2>Education</h2>
      {{#each education}}
      <div class="education-item">
        <h3>{{degreeLevel}} in {{major}}</h3>
        <div class="university">{{universityName}}</div>
        <div class="date-location">{{startDate}} - {{endDate}}</div>
      </div>
      {{/each}}
    </section>
    <section class="section"><h2>Skills</h2>
      <div class="skills-list">{{#each skills}}<span class="skill-tag">{{this}}</span>{{/each}}</div>
    </section>
  </div>
</div>
</body></html>`;

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

/**
 * Builds render data from a populated resume document.
 * Expects resume.profileId to be populated (Profile doc) and resume.content to hold experienceStrings/skillsContent.
 */
function buildRenderData(resume) {
    const profile = resume.profileId && typeof resume.profileId === 'object' ? resume.profileId : {};
    const contactInfo = profile.contactInfo || {};
    const content = resume.content || {};
    const experienceStrings = content.experienceStrings || {};
    const skillsContent = content.skillsContent || '';

    const experiences = (profile.experiences || []).map(exp => {
        const key = `${exp.roleTitle}@${exp.companyName}`;
        const points = experienceStrings[key] || exp.keyPoints || [];
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

/**
 * Renders a Mustache-like HTML template with the given data object.
 * Supports: {{field}}, {{#each items}}...{{/each}}, {{this}}.
 */
function renderTemplate(templateHtml, data) {
    let html = templateHtml;

    html = html.replace(/\{\{fullName\}\}/g, data.fullName);
    html = html.replace(/\{\{title\}\}/g, data.title);
    html = html.replace(/\{\{email\}\}/g, data.email);
    html = html.replace(/\{\{phone\}\}/g, data.phone);
    html = html.replace(/\{\{linkedin\}\}/g, data.linkedin);
    html = html.replace(/\{\{address\}\}/g, data.address);
    html = html.replace(/\{\{summary\}\}/g, data.summary);

    // {{#each experiences}} ... {{/each}}
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

    // {{#each education}} ... {{/each}}
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

    // {{#each skills}} ... {{/each}}
    const skillMatch = html.match(/\{\{#each skills\}\}([\s\S]*?)\{\{\/each\}\}/);
    if (skillMatch) {
        const block = skillMatch[1];
        const rendered = data.skills.map(skill => block.replace(/\{\{this\}\}/g, escapeHtml(skill))).join('');
        html = html.replace(/\{\{#each skills\}\}[\s\S]*?\{\{\/each\}\}/g, rendered);
    }

    return html;
}

/**
 * Builds the full rendered HTML from a resume with populated templateId and profileId.
 */
function buildResumeHtml(resume) {
    const template = resume.templateId && typeof resume.templateId === 'object'
        ? resume.templateId
        : null;
    const templateHtml = template?.data || DEFAULT_TEMPLATE;
    const data = buildRenderData(resume);
    return renderTemplate(templateHtml, data);
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

    let browser;
    try {
        browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0' });
        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '0', right: '0', bottom: '0', left: '0' },
        });
        await browser.close();
        browser = null;

        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${(resume.name || 'resume').replace(/"/g, '')}.pdf"`,
            'Content-Length': pdfBuffer.length,
        });
        res.send(pdfBuffer);
    } catch (err) {
        if (browser) await browser.close().catch(() => {});
        throw err;
    }
}

function sendDocResume(resume, res) {
    const bodyHtml = buildResumeHtml(resume);
    const docContent = `<html xmlns:o='urn:schemas-microsoft-com:office:office'
        xmlns:w='urn:schemas-microsoft-com:office:word'
        xmlns='http://www.w3.org/TR/REC-html40'>
    <head><meta charset="utf-8">
    <!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]-->
    </head><body>${bodyHtml}</body></html>`;
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
};
