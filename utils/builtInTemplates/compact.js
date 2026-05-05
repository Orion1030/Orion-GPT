module.exports = {
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
  .skills-inline { display: grid; gap: 3px; color: #374151; font-size: calc(var(--font-size) - 0.5pt); }
  .skill-group { display: grid; grid-template-columns: 112px 1fr; gap: 8px; }
  .skill-group-title { font-weight: 700; color: #111827; }
  .skill-items { color: #374151; }
</style></head><body>
<div class="resume">
  <header class="header">
    <div class="header-left">
      <h1><%= fullName %></h1>
      <div class="title"><%= title %></div>
    </div>
    <div class="header-right">
      <div><%= email %></div>
      <div><%= phone %></div>
      <div><%= linkedin %></div>
      <div><%= address %></div>
    </div>
  </header>

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
      <div class="exp-top">
        <div><h3><%= experience.roleTitle %></h3><span class="exp-company"><%= experience.companyName %></span></div>
        <span class="exp-date"><%= experience.startDate %> - <%= experience.endDate %></span>
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
    <div class="edu-row">
      <h3><%= educationItem.degreeLevel %> in <%= educationItem.major %> — <%= educationItem.universityName %></h3>
      <span class="edu-meta"><%= educationItem.startDate %> - <%= educationItem.endDate %></span>
    </div>
    <% }) %>
  </section>
  <!--/section:education--><% } %>

  <% if (showSection("skills")) { %><!--section:skills-->
  <section class="section section-skills">
    <h2><%= sectionLabel("skills", "Technical Skills") %></h2>

    <div class="skills-inline">
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
