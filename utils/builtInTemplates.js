function sectionBlock(sectionId, label, inner) {
    return `
    {{#section ${sectionId}}}
    <section class="section section-${sectionId}">
      <h2>{{label:${sectionId}:${label}}}</h2>
      ${inner}
    </section>
    {{/section}}`;
}

const SEED_TEMPLATES = [
    {
        name: 'Classic',
        description: 'Traditional single-column, clean lines, serif-friendly',
        layoutMode: 'single',
        isBuiltIn: true,
        data: `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 100%; background: #fff; }
  .resume {
    font-family: var(--font-family);
    font-size: var(--font-size);
    line-height: var(--line-height);
    color: #1f2937;
    max-width: 800px;
    margin: 0 auto;
    padding: 0;
  }
  .section { margin-bottom: 14px; }
  .section h2 {
    font-size: calc(var(--font-size) + 2pt);
    margin-bottom: 6px;
    padding-bottom: 3px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .description ul { padding-left: 16px; margin-top: 3px; }
  .description li { margin-bottom: 2px; font-size: var(--font-size); line-height: var(--line-height); }
  .header { text-align: center; margin-bottom: 12px; border-bottom: 2px solid var(--accent); padding-bottom: 10px; }
  .header h1 { font-size: calc(var(--font-size) + 8pt); color: #111827; margin-bottom: 2px; }
  .header .title { font-size: calc(var(--font-size) + 1pt); color: #4b5563; margin-bottom: 6px; }
  .contact-info { display: flex; justify-content: center; flex-wrap: wrap; gap: 12px; font-size: calc(var(--font-size) - 0.5pt); color: #6b7280; }
  .contact-info span { white-space: nowrap; }
  .section h2 { color: var(--accent); border-bottom: 1px solid var(--accent); }
  .summary { color: #374151; }
  .exp-item { margin-bottom: 10px; }
  .exp-header { display: flex; justify-content: space-between; align-items: baseline; flex-wrap: wrap; }
  .exp-header h3 { font-size: calc(var(--font-size) + 0.5pt); color: #111827; }
  .exp-company { color: var(--accent); font-weight: 600; }
  .exp-date { color: #6b7280; font-size: calc(var(--font-size) - 0.5pt); }
  .description { color: #374151; }
  .edu-item { margin-bottom: 6px; }
  .edu-item h3 { font-size: var(--font-size); }
  .edu-meta { color: #6b7280; font-size: calc(var(--font-size) - 0.5pt); }
  .skills-list { display: flex; flex-wrap: wrap; gap: 6px; }
  .skill-tag { background: #f3f4f6; color: #374151; padding: 2px 8px; border-radius: 3px; font-size: calc(var(--font-size) - 0.5pt); border: 1px solid #e5e7eb; }
</style></head><body>
<div class="resume">
  <header class="header">
    <h1>{{fullName}}</h1>
    <div class="title">{{title}}</div>
    <div class="contact-info">
      <span>{{email}}</span>
      <span>{{phone}}</span>
      <span>{{linkedin}}</span>
      <span>{{address}}</span>
    </div>
  </header>
  ${sectionBlock('summary', 'Professional Summary', '<div class="summary">{{summary}}</div>')}
  ${sectionBlock('experience', 'Experience', `
    {{#each experiences}}
    <div class="exp-item">
      <div class="exp-header">
        <h3>{{roleTitle}}</h3>
        <span class="exp-date">{{startDate}} – {{endDate}}</span>
      </div>
      <div class="exp-company">{{companyName}}</div>
      <div class="description"><ul>{{description}}</ul></div>
    </div>
    {{/each}}`)}
  ${sectionBlock('education', 'Education', `
    {{#each education}}
    <div class="edu-item">
      <h3>{{degreeLevel}} in {{major}}</h3>
      <div class="edu-meta">{{universityName}} | {{startDate}} – {{endDate}}</div>
    </div>
    {{/each}}`)}
  ${sectionBlock('skills', 'Skills', `
    <div class="skills-list">
      {{#each skills}}<span class="skill-tag">{{this}}</span>{{/each}}
    </div>`)}
</div>
</body></html>`,
    },
    {
        name: 'Modern',
        description: 'Bold accent header, clean sans-serif, contemporary feel',
        layoutMode: 'single',
        isBuiltIn: true,
        data: `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 100%; background: #fff; }
  .resume {
    font-family: var(--font-family);
    font-size: var(--font-size);
    line-height: var(--line-height);
    color: #1f2937;
    max-width: 800px;
    margin: 0 auto;
    padding: 0;
  }
  .section { margin-bottom: 14px; }
  .section h2 {
    font-size: calc(var(--font-size) + 2pt);
    margin-bottom: 6px;
    padding-bottom: 3px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--accent);
    border-bottom: 2px solid var(--accent);
    font-weight: 700;
  }
  .description ul { padding-left: 16px; margin-top: 3px; }
  .description li { margin-bottom: 2px; font-size: var(--font-size); line-height: var(--line-height); }
  .header { background: var(--accent); color: white; padding: 24px 28px; margin-bottom: 0; }
  .header h1 { font-size: calc(var(--font-size) + 10pt); font-weight: 300; margin-bottom: 2px; }
  .header .title { font-size: calc(var(--font-size) + 1pt); opacity: 0.9; margin-bottom: 8px; }
  .contact-info { display: flex; flex-wrap: wrap; gap: 14px; font-size: calc(var(--font-size) - 0.5pt); opacity: 0.85; }
  .content { padding: 0; }
  .summary { color: #4b5563; }
  .exp-item { margin-bottom: 10px; padding-left: 12px; border-left: 3px solid var(--accent); }
  .exp-item h3 { font-size: calc(var(--font-size) + 0.5pt); color: #111827; }
  .exp-company { color: var(--accent); font-weight: 600; }
  .exp-date { color: #9ca3af; font-size: calc(var(--font-size) - 1pt); }
  .description { color: #374151; }
  .edu-item { margin-bottom: 6px; padding-left: 12px; border-left: 3px solid var(--accent); }
  .edu-item h3 { font-size: var(--font-size); }
  .edu-meta { color: #6b7280; font-size: calc(var(--font-size) - 0.5pt); }
  .skills-list { display: flex; flex-wrap: wrap; gap: 6px; }
  .skill-tag { background: var(--accent); color: white; padding: 3px 10px; border-radius: 12px; font-size: calc(var(--font-size) - 1pt); }
</style></head><body>
<div class="resume">
  <header class="header">
    <h1>{{fullName}}</h1>
    <div class="title">{{title}}</div>
    <div class="contact-info">
      <span>{{email}}</span>
      <span>{{phone}}</span>
      <span>{{linkedin}}</span>
      <span>{{address}}</span>
    </div>
  </header>
  <div class="content">
  ${sectionBlock('summary', 'Professional Summary', '<div class="summary">{{summary}}</div>')}
  ${sectionBlock('experience', 'Experience', `
    {{#each experiences}}
    <div class="exp-item">
      <h3>{{roleTitle}}</h3>
      <div class="exp-company">{{companyName}}</div>
      <div class="exp-date">{{startDate}} – {{endDate}}</div>
      <div class="description"><ul>{{description}}</ul></div>
    </div>
    {{/each}}`)}
  ${sectionBlock('education', 'Education', `
    {{#each education}}
    <div class="edu-item">
      <h3>{{degreeLevel}} in {{major}}</h3>
      <div class="edu-meta">{{universityName}} | {{startDate}} – {{endDate}}</div>
    </div>
    {{/each}}`)}
  ${sectionBlock('skills', 'Skills', `
    <div class="skills-list">
      {{#each skills}}<span class="skill-tag">{{this}}</span>{{/each}}
    </div>`)}
  </div>
</div>
</body></html>`,
    },
    {
        name: 'Minimal',
        description: 'Ultra-clean, no color blocks, maximum content density',
        layoutMode: 'single',
        isBuiltIn: true,
        data: `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 100%; background: #fff; }
  .resume {
    font-family: var(--font-family);
    font-size: var(--font-size);
    line-height: var(--line-height);
    color: #1f2937;
    max-width: 800px;
    margin: 0 auto;
    padding: 0;
  }
  .section { margin-bottom: 14px; }
  .section h2 {
    font-size: calc(var(--font-size) + 2pt);
    margin-bottom: 6px;
    padding-bottom: 3px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .description ul { padding-left: 16px; margin-top: 3px; }
  .description li { margin-bottom: 2px; font-size: var(--font-size); line-height: var(--line-height); }
  .header { margin-bottom: 10px; }
  .header h1 { font-size: calc(var(--font-size) + 8pt); color: #111827; font-weight: 700; }
  .header .title { color: #6b7280; font-size: calc(var(--font-size) + 0.5pt); margin-bottom: 4px; }
  .contact-info { display: flex; flex-wrap: wrap; gap: 10px; font-size: calc(var(--font-size) - 1pt); color: #6b7280; }
  .contact-info span::after { content: "·"; margin-left: 10px; color: #d1d5db; }
  .contact-info span:last-child::after { content: ""; margin: 0; }
  .divider { border: none; border-top: 1px solid #e5e7eb; margin: 8px 0; }
  .section h2 { color: #111827; border-bottom: none; font-size: calc(var(--font-size) + 1pt); font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px; }
  .summary { color: #4b5563; }
  .exp-item { margin-bottom: 10px; }
  .exp-row { display: flex; justify-content: space-between; align-items: baseline; }
  .exp-item h3 { font-size: var(--font-size); font-weight: 700; color: #111827; }
  .exp-company { font-weight: 600; color: #374151; }
  .exp-date { color: #9ca3af; font-size: calc(var(--font-size) - 1pt); white-space: nowrap; }
  .description { color: #4b5563; }
  .edu-item { margin-bottom: 4px; }
  .edu-row { display: flex; justify-content: space-between; align-items: baseline; }
  .edu-item h3 { font-size: var(--font-size); font-weight: 600; }
  .edu-meta { color: #6b7280; font-size: calc(var(--font-size) - 0.5pt); }
  .skills-list { display: flex; flex-wrap: wrap; gap: 4px 12px; color: #374151; font-size: var(--font-size); }
</style></head><body>
<div class="resume">
  <header class="header">
    <h1>{{fullName}}</h1>
    <div class="title">{{title}}</div>
    <div class="contact-info">
      <span>{{email}}</span>
      <span>{{phone}}</span>
      <span>{{linkedin}}</span>
      <span>{{address}}</span>
    </div>
  </header>
  <hr class="divider"/>
  ${sectionBlock('summary', 'Summary', '<div class="summary">{{summary}}</div>')}
  ${sectionBlock('experience', 'Experience', `
    {{#each experiences}}
    <div class="exp-item">
      <div class="exp-row">
        <div><h3>{{roleTitle}}</h3><span class="exp-company">{{companyName}}</span></div>
        <span class="exp-date">{{startDate}} – {{endDate}}</span>
      </div>
      <div class="description"><ul>{{description}}</ul></div>
    </div>
    {{/each}}`)}
  ${sectionBlock('education', 'Education', `
    {{#each education}}
    <div class="edu-item">
      <div class="edu-row">
        <h3>{{degreeLevel}} in {{major}}, {{universityName}}</h3>
        <span class="edu-meta">{{startDate}} – {{endDate}}</span>
      </div>
    </div>
    {{/each}}`)}
  ${sectionBlock('skills', 'Skills', `
    <div class="skills-list">
      {{#each skills}}<span>{{this}}</span>{{/each}}
    </div>`)}
</div>
</body></html>`,
    },
    {
        name: 'Compact',
        description: 'Maximum information density, ideal for experienced professionals',
        layoutMode: 'single',
        isBuiltIn: true,
        data: `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 100%; background: #fff; }
  .resume {
    font-family: var(--font-family);
    font-size: calc(var(--font-size) - 0.5pt);
    line-height: var(--line-height);
    color: #1f2937;
    max-width: 800px;
    margin: 0 auto;
    padding: 0;
  }
  .section { margin-bottom: 8px; }
  .section h2 {
    color: var(--accent);
    font-size: calc(var(--font-size) + 0.5pt);
    border-bottom: 1px solid #e5e7eb;
    margin-bottom: 4px;
    padding-bottom: 2px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .description ul { padding-left: 14px; margin-top: 3px; }
  .description li { margin-bottom: 1px; font-size: calc(var(--font-size) - 0.5pt); }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; padding-bottom: 6px; border-bottom: 2px solid var(--accent); }
  .header-left h1 { font-size: calc(var(--font-size) + 6pt); color: #111827; line-height: 1.1; }
  .header-left .title { color: var(--accent); font-weight: 600; font-size: calc(var(--font-size) + 0.5pt); }
  .header-right { text-align: right; font-size: calc(var(--font-size) - 1pt); color: #6b7280; line-height: 1.5; }
  .summary { color: #4b5563; font-size: calc(var(--font-size) - 0.5pt); }
  .exp-item { margin-bottom: 6px; }
  .exp-top { display: flex; justify-content: space-between; align-items: baseline; }
  .exp-item h3 { font-size: var(--font-size); font-weight: 700; }
  .exp-company { font-weight: 600; color: var(--accent); }
  .exp-date { color: #9ca3af; font-size: calc(var(--font-size) - 1pt); }
  .description { color: #4b5563; }
  .edu-row { display: flex; justify-content: space-between; margin-bottom: 2px; }
  .edu-row h3 { font-size: calc(var(--font-size) - 0.5pt); font-weight: 600; }
  .edu-meta { color: #6b7280; font-size: calc(var(--font-size) - 1pt); }
  .skills-inline { color: #374151; font-size: calc(var(--font-size) - 0.5pt); }
</style></head><body>
<div class="resume">
  <header class="header">
    <div class="header-left">
      <h1>{{fullName}}</h1>
      <div class="title">{{title}}</div>
    </div>
    <div class="header-right">
      <div>{{email}}</div>
      <div>{{phone}}</div>
      <div>{{linkedin}}</div>
      <div>{{address}}</div>
    </div>
  </header>
  ${sectionBlock('summary', 'Summary', '<div class="summary">{{summary}}</div>')}
  ${sectionBlock('experience', 'Experience', `
    {{#each experiences}}
    <div class="exp-item">
      <div class="exp-top">
        <div><h3>{{roleTitle}}</h3><span class="exp-company">{{companyName}}</span></div>
        <span class="exp-date">{{startDate}} – {{endDate}}</span>
      </div>
      <div class="description"><ul>{{description}}</ul></div>
    </div>
    {{/each}}`)}
  ${sectionBlock('education', 'Education', `
    {{#each education}}
    <div class="edu-row">
      <h3>{{degreeLevel}} in {{major}} — {{universityName}}</h3>
      <span class="edu-meta">{{startDate}} – {{endDate}}</span>
    </div>
    {{/each}}`)}
  ${sectionBlock('skills', 'Technical Skills', `
    <div class="skills-inline">
      {{#each skills}}<span>{{this}}</span>{{/each}}
    </div>`)}
</div>
</body></html>`,
    },
    {
        name: 'Hybrid',
        description: 'Two-column sidebar for contact & skills, main column for experience',
        layoutMode: 'hybrid',
        isBuiltIn: true,
        data: `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 100%; background: #fff; }
  .resume {
    font-family: var(--font-family);
    font-size: var(--font-size);
    line-height: var(--line-height);
    color: #1f2937;
    max-width: 800px;
    margin: 0 auto;
    padding: 0;
  }
  .section { margin-bottom: 14px; }
  .section h2 {
    font-size: calc(var(--font-size) + 0.5pt);
    margin-bottom: 6px;
    padding-bottom: 3px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .description ul { padding-left: 16px; margin-top: 3px; }
  .description li { margin-bottom: 2px; font-size: var(--font-size); line-height: var(--line-height); }
  .header { text-align: center; padding-bottom: 10px; margin-bottom: 10px; border-bottom: 2px solid var(--accent); }
  .header h1 { font-size: calc(var(--font-size) + 8pt); color: #111827; }
  .header .title { color: var(--accent); font-size: calc(var(--font-size) + 1pt); font-weight: 600; }
  .two-col { display: flex; gap: 20px; }
  .sidebar { width: 30%; flex-shrink: 0; }
  .main { flex: 1; }
  .sidebar .section h2 { font-size: calc(var(--font-size) + 0.5pt); color: var(--accent); border-bottom: 1px solid var(--accent); }
  .contact-list { list-style: none; font-size: calc(var(--font-size) - 0.5pt); color: #4b5563; }
  .contact-list li { margin-bottom: 4px; word-break: break-all; }
  .main .section h2 { color: var(--accent); border-bottom: 2px solid var(--accent); }
  .summary { color: #4b5563; }
  .exp-item { margin-bottom: 10px; }
  .exp-item h3 { font-size: calc(var(--font-size) + 0.5pt); color: #111827; }
  .exp-company { color: var(--accent); font-weight: 600; }
  .exp-date { color: #9ca3af; font-size: calc(var(--font-size) - 1pt); }
  .description { color: #374151; }
  .edu-item { margin-bottom: 4px; }
  .edu-item h3 { font-size: var(--font-size); font-weight: 600; }
  .edu-meta { color: #6b7280; font-size: calc(var(--font-size) - 0.5pt); }
  .skill-list { list-style: none; }
  .skill-list li { font-size: calc(var(--font-size) - 0.5pt); color: #374151; padding: 2px 0; border-bottom: 1px solid #f3f4f6; }
</style></head><body>
<div class="resume">
  <header class="header">
    <h1>{{fullName}}</h1>
    <div class="title">{{title}}</div>
  </header>
  <div class="two-col">
    <aside class="sidebar">
      <section class="section">
        <h2>Contact</h2>
        <ul class="contact-list">
          <li>{{email}}</li>
          <li>{{phone}}</li>
          <li>{{linkedin}}</li>
          <li>{{address}}</li>
        </ul>
      </section>
      ${sectionBlock('education', 'Education', `
        {{#each education}}
        <div class="edu-item">
          <h3>{{degreeLevel}}</h3>
          <div class="edu-meta">{{major}}</div>
          <div class="edu-meta">{{universityName}}</div>
          <div class="edu-meta">{{startDate}} – {{endDate}}</div>
        </div>
        {{/each}}`)}
      ${sectionBlock('skills', 'Skills', `
        <ul class="skill-list">
          {{#each skills}}<li>{{this}}</li>{{/each}}
        </ul>`)}
    </aside>
    <div class="main">
      ${sectionBlock('summary', 'Professional Summary', '<div class="summary">{{summary}}</div>')}
      ${sectionBlock('experience', 'Experience', `
        {{#each experiences}}
        <div class="exp-item">
          <h3>{{roleTitle}}</h3>
          <div class="exp-company">{{companyName}}</div>
          <div class="exp-date">{{startDate}} – {{endDate}}</div>
          <div class="description"><ul>{{description}}</ul></div>
        </div>
        {{/each}}`)}
    </div>
  </div>
</div>
</body></html>`,
    },
];

function getBuiltInSeedTemplates() {
    return SEED_TEMPLATES;
}

module.exports = { getBuiltInSeedTemplates };
