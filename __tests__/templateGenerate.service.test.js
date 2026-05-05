describe("templateGenerate.service", () => {
  const validTemplate = `<!DOCTYPE html>
<html><head><style>
  .resume { font-family: var(--font-family); color: #111827; }
  h1 { color: var(--accent); font-size: calc(var(--font-size) + 8pt); }
</style></head><body>
<div class="resume">
  <h1><%= fullName %></h1>
  <% if (showSection("summary")) { %><!--section:summary-->
  <section><h2><%= sectionLabel("summary", "Summary") %></h2><div><%- summary %></div></section>
  <!--/section:summary--><% } %>
  <% if (showSection("experience")) { %><!--section:experience-->
  <section>
    <% (experiences || []).forEach((experience) => { %>
    <div><strong><%= experience.roleTitle %></strong><ul><%- experience.description %></ul></div>
    <% }) %>
  </section>
  <!--/section:experience--><% } %>
  <% if (showSection("skills")) { %><!--section:skills-->
  <section>
    <% const visibleSkillGroups = (skillGroups || []).filter((skillGroup) => skillGroup && (skillGroup.items || []).filter(Boolean).length); %>
    <% const visibleSkills = (skills || []).filter(Boolean); %>
    <% if (visibleSkillGroups.length) { %>
      <% visibleSkillGroups.forEach((skillGroup) => { %>
      <div><span><%= skillGroup.title %>:</span> <%= (skillGroup.items || []).filter(Boolean).join(", ") %></div>
      <% }) %>
    <% } else if (visibleSkills.length) { %>
      <div><%= visibleSkills.join(", ") %></div>
    <% } %>
  </section>
  <!--/section:skills--><% } %>
</div>
</body></html>`;

  beforeEach(() => {
    jest.resetModules();
  });

  test("normalizes and renders a valid generated EJS template", () => {
    const { normalizeGeneratedTemplate } = require("../services/llm/templateGenerate.service");

    const result = normalizeGeneratedTemplate({
      name: "Executive",
      description: "Clean executive resume",
      layoutMode: "single",
      data: validTemplate,
    });

    expect(result).toEqual(
      expect.objectContaining({
        name: "Executive",
        description: "Clean executive resume",
        layoutMode: "single",
        templateEngine: "ejs",
        migrationStatus: "ready",
      }),
    );
    expect(result.data).toContain("<%= fullName %>");
  });

  test("rejects dangerous generated HTML", () => {
    const { normalizeGeneratedTemplate } = require("../services/llm/templateGenerate.service");

    expect(() =>
      normalizeGeneratedTemplate({
        data: validTemplate.replace("</body>", "<script>alert(1)</script></body>"),
      }),
    ).toThrow("script tags");
  });

  test("rejects legacy custom template syntax", () => {
    const { normalizeGeneratedTemplate } = require("../services/llm/templateGenerate.service");

    expect(() =>
      normalizeGeneratedTemplate({
        data: validTemplate.replace("<%= fullName %>", "{{fullName}}"),
      }),
    ).toThrow("legacy");
  });

  test("rejects invalid EJS", () => {
    const { normalizeGeneratedTemplate } = require("../services/llm/templateGenerate.service");

    expect(() =>
      normalizeGeneratedTemplate({
        data: validTemplate.replace("<%= fullName %>", "<%= fullName "),
      }),
    ).toThrow();
  });

  test("generates a template through the AI chat runtime", async () => {
    const tryGetChatReply = jest.fn().mockResolvedValue({
      result: {
        reply: JSON.stringify({
          name: "AI Classic",
          description: "Generated template",
          layoutMode: "single",
          data: validTemplate,
        }),
      },
      error: null,
    });
    const resolveFeatureAiRuntimeConfig = jest.fn().mockResolvedValue({
      useCustom: false,
      feature: "ai_chat",
    });

    jest.doMock("../services/llm/chatResponder.service", () => ({
      tryGetChatReply,
    }));
    jest.doMock("../services/adminConfiguration.service", () => ({
      AI_RUNTIME_FEATURES: { AI_CHAT: "ai_chat" },
      resolveFeatureAiRuntimeConfig,
    }));

    const { generateTemplateWithAi } = require("../services/llm/templateGenerate.service");
    const result = await generateTemplateWithAi({
      prompt: "Make it more executive",
      currentTemplateHtml: validTemplate,
      currentName: "Classic",
      currentDescription: "Starter",
      layoutMode: "single",
      targetUserId: "user-1",
    });

    expect(resolveFeatureAiRuntimeConfig).toHaveBeenCalledWith({
      targetUserId: "user-1",
      feature: "ai_chat",
    });
    expect(tryGetChatReply).toHaveBeenCalledWith(
      expect.objectContaining({
        temperature: 0.2,
        runtimeConfig: expect.objectContaining({ useCustom: false }),
      }),
    );
    expect(result.name).toBe("AI Classic");
    expect(result.data).toContain("<%= fullName %>");
  });
});
