module.exports = {
  name: 'Cover Letter - Modern',
  templateType: 'cover_letter',
  description: 'Modern cover letter with a strong left rule and compact contact header',
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
    color: #111827;
    max-width: 800px;
    margin: 0 auto;
    padding: 0;
  }
  .topline { display: grid; grid-template-columns: 1fr auto; gap: 16px; align-items: start; margin-bottom: 30px; }
  .topline h1 { font-size: calc(var(--font-size) + 9pt); letter-spacing: 0; color: #111827; }
  .topline .title { color: var(--accent); font-weight: 700; margin-top: 2px; }
  .contact { text-align: right; color: #6b7280; font-size: calc(var(--font-size) - 0.5pt); display: grid; gap: 2px; }
  .target { border-left: 4px solid var(--accent); padding: 8px 0 8px 14px; margin-bottom: 22px; color: #374151; }
  .target strong { display: block; color: #111827; font-size: calc(var(--font-size) + 1pt); }
  .letter-body { display: grid; gap: 14px; }
  .letter-body p { margin: 0; }
  .signature { padding-top: 6px; white-space: pre-line; color: #111827; }
</style></head><body>
<div class="resume">
  <header class="topline">
    <div>
      <h1><%= fullName %></h1>
      <div class="title"><%= title %></div>
    </div>
    <div class="contact">
      <% [email, phone, linkedin, address].filter(Boolean).forEach((item) => { %>
        <span><%= item %></span>
      <% }) %>
    </div>
  </header>

  <section class="target">
    <strong><%= jobTitle || "Target Role" %></strong>
    <span><%= companyName || "Target Company" %></span>
  </section>

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
