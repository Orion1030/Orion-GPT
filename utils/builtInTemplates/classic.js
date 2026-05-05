module.exports = {
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
  .skill-groups { display: grid; gap: 5px; }
  .skill-group { display: grid; grid-template-columns: 120px 1fr; gap: 8px; align-items: start; }
  .skill-group-title { font-weight: 700; color: #111827; }
  .skill-items { color: #374151; font-size: calc(var(--font-size) - 0.5pt); }
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

  <% if (showSection("summary")) { %><!--section:summary-->
  <section class="section section-summary">
    <h2><%= sectionLabel("summary", "Professional Summary") %></h2>
    <div class="summary"><%- summary %></div>
  </section>
  <!--/section:summary--><% } %>

  <% if (showSection("experience")) { %><!--section:experience-->
  <section class="section section-experience">
    <h2><%= sectionLabel("experience", "Experience") %></h2>

    <% (experiences || []).forEach((experience) => { %>
    <div class="exp-item">
      <div class="exp-header">
        <h3><%= experience.roleTitle %></h3>
        <span class="exp-date"><%= experience.startDate %> – <%= experience.endDate %></span>
      </div>
      <div class="exp-company"><%= experience.companyName %></div>
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
      <h3><%= educationItem.degreeLevel %> in <%= educationItem.major %></h3>
      <div class="edu-meta"><%= educationItem.universityName %> | <%= educationItem.startDate %> – <%= educationItem.endDate %></div>
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
