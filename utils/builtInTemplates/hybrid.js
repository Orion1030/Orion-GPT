module.exports = {
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
  .skill-groups { display: grid; gap: 8px; }
  .skill-group-title { color: #111827; font-weight: 700; font-size: calc(var(--font-size) - 0.5pt); margin-bottom: 2px; }
  .skill-list { list-style: none; }
  .skill-list li { font-size: calc(var(--font-size) - 0.5pt); color: #374151; padding: 2px 0; border-bottom: 1px solid #f3f4f6; }
</style></head><body>
<div class="resume">
  <header class="header">
    <h1><%= fullName %></h1>
    <div class="title"><%= title %></div>
  </header>
  <div class="two-col">
    <aside class="sidebar">
      <section class="section">
        <h2>Contact</h2>
        <ul class="contact-list">
          <li><%= email %></li>
          <li><%= phone %></li>
          <li><%= linkedin %></li>
          <li><%= address %></li>
        </ul>
      </section>

      <% if (showSection("education")) { %><!--section:education-->
      <section class="section section-education">
        <h2><%= sectionLabel("education", "Education") %></h2>

        <% (education || []).forEach((educationItem) => { %>
        <div class="edu-item">
          <h3><%= educationItem.degreeLevel %></h3>
          <div class="edu-meta"><%= educationItem.major %></div>
          <div class="edu-meta"><%= educationItem.universityName %></div>
          <div class="edu-meta"><%= educationItem.startDate %> - <%= educationItem.endDate %></div>
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
            <div class="skill-list"><%= (skillGroup.items || []).filter(Boolean).join(", ") %></div>
          </div>
          <% }) %>
          <% } else if (visibleSkills.length) { %>
          <div class="skill-list"><%= visibleSkills.join(", ") %></div>
          <% } %>
        </div>
      </section>
      <!--/section:skills--><% } %>
    </aside>
    <div class="main">
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
          <div class="exp-date"><%= experience.startDate %> - <%= experience.endDate %></div>
          <div class="description"><ul><%- experience.description %></ul></div>
        </div>
        <% }) %>
      </section>
      <!--/section:experience--><% } %>
    </div>
  </div>
</div>
</body></html>`,
    };
