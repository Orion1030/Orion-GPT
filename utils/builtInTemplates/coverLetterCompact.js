module.exports = {
  name: 'Cover Letter - Compact',
  templateType: 'cover_letter',
  description: 'Dense, ATS-friendly letter layout for longer evidence-based answers',
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
  .header { display: flex; justify-content: space-between; gap: 18px; border-bottom: 1px solid #d1d5db; padding-bottom: 10px; margin-bottom: 20px; }
  .header h1 { color: #111827; font-size: calc(var(--font-size) + 7pt); }
  .header .role { color: var(--accent); font-weight: 700; }
  .contact { color: #6b7280; font-size: calc(var(--font-size) - 0.5pt); text-align: right; }
  .target { color: #374151; margin-bottom: 16px; }
  .target span { color: var(--accent); font-weight: 700; }
  .letter-body { display: grid; gap: 11px; }
  .letter-body p { margin: 0; }
  .signature { margin-top: 4px; white-space: pre-line; }
</style></head><body>
<div class="resume">
  <header class="header">
    <div>
      <h1><%= fullName %></h1>
      <div class="role"><%= title %></div>
    </div>
    <div class="contact">
      <% [email, phone, linkedin, address].filter(Boolean).forEach((item) => { %>
        <div><%= item %></div>
      <% }) %>
    </div>
  </header>

  <div class="target">
    Re: <span><%= jobTitle || "Target Role" %></span><%= companyName ? ", " + companyName : "" %>
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
