module.exports = {
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
  .skill-groups { display: grid; gap: 7px; }
  .skill-group { display: grid; grid-template-columns: 120px 1fr; gap: 10px; align-items: start; }
  .skill-group-title { color: #111827; font-weight: 700; }
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
  <div class="content">
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
      <h3><%= experience.roleTitle %></h3>
      <div class="exp-company"><%= experience.companyName %></div>
      <div class="exp-date"><%= experience.startDate %> – <%= experience.endDate %></div>
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
</div>
</body></html>`,
    };
