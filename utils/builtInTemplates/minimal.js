module.exports = {
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
  .skill-groups { display: grid; gap: 4px; color: #374151; font-size: var(--font-size); }
  .skill-group { display: grid; grid-template-columns: 118px 1fr; gap: 8px; }
  .skill-group-title { font-weight: 700; color: #111827; }
  .skill-items { color: #374151; }
</style></head><body>
<div class="resume">
  <header class="header">
    <h1><%= fullName %></h1>
    <div class="title"><%= title %></div>
    <div class="contact-info">
      <span><%= email %></span>
      <span><%= phone %></span>
      <span><%= linkedin %></span>
      <span><%= address %></span>
    </div>
  </header>
  <hr class="divider"/>

  <% if (showSection("summary")) { %><!--section:summary-->
  <section class="section section-summary">
    <h2><%= sectionLabel("summary", "Summary") %></h2>
    <div class="summary"><%- summary %></div>
  </section>
  <!--/section:summary--><% } %>

  <% if (showSection("experience")) { %><!--section:experience-->
  <section class="section section-experience">
    <h2><%= sectionLabel("experience", "Experience") %></h2>

    <% (experiences || []).forEach((experience) => { %>
    <div class="exp-item">
      <div class="exp-row">
        <div><h3><%= experience.roleTitle %></h3><span class="exp-company"><%= experience.companyName %></span></div>
        <span class="exp-date"><%= experience.startDate %> – <%= experience.endDate %></span>
      </div>
      <div class="description"><ul><%- experience.description %></ul></div>
    </div>
    <% }) %>
  </section>
  <!--/section:experience--><% } %>

  <% if (showSection("education")) { %><!--section:education-->
  <section class="section section-education">
    <h2><%= sectionLabel("education", "Education") %></h2>

    <% (education || []).forEach((educationItem) => { %>
    <div class="edu-item">
      <div class="edu-row">
        <h3><%= educationItem.degreeLevel %> in <%= educationItem.major %>, <%= educationItem.universityName %></h3>
        <span class="edu-meta"><%= educationItem.startDate %> – <%= educationItem.endDate %></span>
      </div>
    </div>
    <% }) %>
  </section>
  <!--/section:education--><% } %>

  <% if (showSection("skills")) { %><!--section:skills-->
  <section class="section section-skills">
    <h2><%= sectionLabel("skills", "Skills") %></h2>

    <div class="skill-groups">
      <% const visibleSkillGroups = (skillGroups || []).filter((skillGroup) => skillGroup && (skillGroup.items || []).filter(Boolean).length); %>
      <% const visibleSkills = (skills || []).filter(Boolean); %>
      <% if (visibleSkillGroups.length) { %>
      <% visibleSkillGroups.forEach((skillGroup) => { %>
      <div class="skill-group">
        <div class="skill-group-title"><%= skillGroup.title %>:</div>
        <div class="skill-items"><%= (skillGroup.items || []).filter(Boolean).join(", ") %></div>
      </div>
      <% }) %>
      <% } else if (visibleSkills.length) { %>
      <div class="skill-items"><%= visibleSkills.join(", ") %></div>
      <% } %>
    </div>
  </section>
  <!--/section:skills--><% } %>
</div>
</body></html>`,
    };
