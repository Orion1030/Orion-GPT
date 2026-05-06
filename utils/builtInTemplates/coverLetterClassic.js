module.exports = {
  name: 'Cover Letter - Classic',
  templateType: 'cover_letter',
  description: 'Traditional business letter with clear spacing and a concise header',
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
  .letter-header { border-bottom: 2px solid var(--accent); padding-bottom: 12px; margin-bottom: 28px; }
  .letter-header h1 { font-size: calc(var(--font-size) + 8pt); color: #111827; margin-bottom: 3px; }
  .letter-header .title { color: #4b5563; font-size: calc(var(--font-size) + 1pt); }
  .contact-line { color: #6b7280; font-size: calc(var(--font-size) - 0.5pt); margin-top: 8px; }
  .letter-meta { margin-bottom: 20px; color: #374151; }
  .letter-body { display: grid; gap: 13px; }
  .letter-body p { margin: 0; }
  .signature { margin-top: 8px; white-space: pre-line; }
  .accent { color: var(--accent); font-weight: 700; }
</style></head><body>
<div class="resume">
  <header class="letter-header">
    <h1><%= fullName %></h1>
    <div class="title"><%= title %></div>
    <div class="contact-line"><%= [email, phone, linkedin, address].filter(Boolean).join(" | ") %></div>
  </header>

  <div class="letter-meta">
    <% if (companyName || jobTitle) { %>
    <p><span class="accent"><%= jobTitle || "Target Role" %></span><%= companyName ? " at " + companyName : "" %></p>
    <% } %>
  </div>

  <main class="letter-body">
    <p>Dear <%= recipient || "Hiring Manager" %>,</p>
    <% if (opening) { %><p><%= opening %></p><% } %>
    <% (bodyParagraphs || []).forEach((paragraph) => { %>
      <p><%= paragraph %></p>
    <% }) %>
    <% if (closing) { %><p><%= closing %></p><% } %>
    <p class="signature"><%= signature || fullName %></p>
  </main>
</div>
</body></html>`,
};
