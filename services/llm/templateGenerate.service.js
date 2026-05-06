const { tryGetChatReply } = require("./chatResponder.service");
const {
  DEFAULT_CONFIG,
  renderTemplate,
} = require("../../utils/templateRenderer");

const TEMPLATE_GENERATE_MAX_TOKENS = parseInt(
  process.env.LLM_TEMPLATE_GENERATE_MAX_TOKENS || "7000",
  10,
);

const MAX_PROMPT_LENGTH = 4000;
const MAX_TEMPLATE_CONTEXT_LENGTH = 60000;

const SAMPLE_RENDER_DATA = {
  fullName: "Alexander Mitchell",
  title: "Senior Software Engineer",
  email: "alex.mitchell@email.com",
  phone: "+1 (415) 555-0192",
  linkedin: "linkedin.com/in/alexmitchell",
  github: "github.com/alexmitchell",
  website: "alexmitchell.dev",
  address: "San Francisco, CA",
  summary:
    "<p>Results-driven Senior Software Engineer with 7+ years of experience designing and delivering scalable applications.</p>",
  experiences: [
    {
      roleTitle: "Senior Software Engineer",
      companyName: "Google",
      startDate: "Mar 2022",
      endDate: "Present",
      location: "Mountain View, CA",
      description:
        "<li>Architected and led development of distributed microservices serving millions of users.</li><li>Mentored engineers through code reviews and technical design discussions.</li>",
    },
  ],
  education: [
    {
      degreeLevel: "Bachelor of Science",
      major: "Computer Science",
      universityName: "Stanford University",
      startDate: "Sep 2014",
      endDate: "Jun 2018",
    },
  ],
  skills: ["JavaScript", "TypeScript", "React", "Node.js", "AWS"],
  skillGroups: [
    {
      title: "Programming Languages",
      items: ["JavaScript", "TypeScript", "Python"],
    },
    {
      title: "Frameworks",
      items: ["React", "Node.js", "Express"],
    },
  ],
};

const SAMPLE_COVER_LETTER_RENDER_DATA = {
  ...SAMPLE_RENDER_DATA,
  recipient: "Hiring Manager",
  companyName: "Acme Cloud",
  jobTitle: "Senior Software Engineer",
  opening:
    "I am excited to apply for the Senior Software Engineer role because it matches my background in scalable product engineering and cloud-native delivery.",
  bodyParagraphs: [
    "In my recent roles, I have led backend platform work, improved delivery practices, and partnered closely with product teams to ship reliable customer-facing systems.",
    "I would bring a practical engineering style, strong ownership, and clear communication to help your team build dependable software at scale.",
  ],
  closing:
    "Thank you for your time. I would welcome the chance to discuss how my experience can support your engineering goals.",
  signature: "Alexander Mitchell",
};

const BLOCKED_TEMPLATE_PATTERNS = [
  { pattern: /<script\b/i, message: "Generated template cannot include script tags" },
  { pattern: /\bon\w+\s*=/i, message: "Generated template cannot include inline event handlers" },
  { pattern: /javascript\s*:/i, message: "Generated template cannot include javascript: URLs" },
  { pattern: /\b(?:require|process|global|globalThis|Function|eval|module|exports|__dirname|__filename)\b/i, message: "Generated template uses a blocked JavaScript identifier" },
  { pattern: /\bimport\s*\(/i, message: "Generated template cannot use dynamic imports" },
  { pattern: /\{\{[\s\S]*?\}\}/, message: "Generated template still contains legacy {{...}} syntax" },
];

function sanitizeString(value, maxLength = 1000) {
  return String(value || "").trim().slice(0, maxLength);
}

function stripMarkdownFence(text) {
  const trimmed = String(text || "").trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

function extractJsonObject(text) {
  const stripped = stripMarkdownFence(text);
  try {
    return JSON.parse(stripped);
  } catch {
    const start = stripped.indexOf("{");
    const end = stripped.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(stripped.slice(start, end + 1));
    }
    throw new Error("AI response was not valid JSON");
  }
}

function validateGeneratedHtml(html, templateType = "resume") {
  const templateHtml = String(html || "");
  if (!templateHtml.trim()) {
    throw new Error("AI response did not include template HTML");
  }
  if (!/<html[\s>]/i.test(templateHtml) || !/<body[\s>]/i.test(templateHtml) || !/<style[\s>]/i.test(templateHtml)) {
    throw new Error("Generated template must include complete HTML, body, and style tags");
  }
  if (!/<%[\s\S]*?%>/.test(templateHtml)) {
    throw new Error("Generated template must use EJS tags");
  }

  for (const item of BLOCKED_TEMPLATE_PATTERNS) {
    if (item.pattern.test(templateHtml)) {
      throw new Error(item.message);
    }
  }

  renderTemplate(
    templateHtml,
    templateType === "cover_letter" ? SAMPLE_COVER_LETTER_RENDER_DATA : SAMPLE_RENDER_DATA,
    DEFAULT_CONFIG
  );
}

function normalizeGeneratedTemplate(raw, fallback = {}) {
  const name = sanitizeString(raw?.name, 120) || sanitizeString(fallback.currentName, 120) || "AI Generated Template";
  const description =
    sanitizeString(raw?.description, 300) ||
    sanitizeString(fallback.currentDescription, 300) ||
    "Generated with AI assistance.";
  const requestedLayoutMode = sanitizeString(raw?.layoutMode || fallback.layoutMode, 20).toLowerCase();
  const layoutMode = requestedLayoutMode === "hybrid" ? "hybrid" : "single";
  const templateType = fallback.templateType === "cover_letter" ? "cover_letter" : "resume";
  const data = String(raw?.data || "").trim();

  validateGeneratedHtml(data, templateType);
  return {
    name,
    description,
    templateType,
    layoutMode,
    data,
    templateEngine: "ejs",
    migrationStatus: "ready",
  };
}

function buildSystemPrompt(templateType = "resume") {
  if (templateType === "cover_letter") {
    return [
      "You generate admin-authored cover letter templates for Jobsy.",
      "Return ONLY a JSON object with keys: name, description, layoutMode, data.",
      "data must be a complete HTML document with inline CSS and EJS template syntax.",
      "Use only these locals: fullName, title, email, phone, linkedin, github, website, address, recipient, companyName, jobTitle, opening, bodyParagraphs, closing, signature.",
      "Use escaped EJS output for plain text, for example <%= fullName %>.",
      "Loop body paragraphs with (bodyParagraphs || []).forEach((paragraph) => { ... }).",
      "Never use legacy {{...}} syntax.",
      "Never include script tags, inline event handlers, require, process, global, eval, Function, imports, module, or exports.",
      "Use CSS variables var(--font-family), var(--font-size), var(--line-height), and var(--accent).",
      "Use the root class .resume so Jobsy can paginate the letter.",
      "Do not include markdown fences, explanation, comments outside the HTML, or extra JSON keys.",
    ].join("\n");
  }
  return [
    "You generate admin-authored resume templates for Jobsy.",
    "Return ONLY a JSON object with keys: name, description, layoutMode, data.",
    "data must be a complete HTML document with inline CSS and EJS template syntax.",
    "Use only these locals: fullName, title, email, phone, linkedin, github, website, address, summary, experiences, education, skills, skillGroups.",
    "Use helpers only as explicitly provided: showSection(sectionId), sectionLabel(sectionId, defaultLabel), safeHtml(value).",
    "Use escaped EJS output for plain text, for example <%= fullName %>.",
    "Use unescaped EJS output only for already-sanitized rich HTML: <%- summary %> and <%- experience.description %>.",
    "Experience items must loop with (experiences || []).forEach((experience) => { ... }).",
    "Education items must loop with (education || []).forEach((educationItem) => { ... }).",
    "Skills must prefer grouped skillGroups and fall back to flat skills when no skill groups exist.",
    "Skill items should be readable in HTML, PDF, DOCX, and downloaded HTML.",
    "Wrap resume sections with showSection checks and section comments like <!--section:summary--> and <!--/section:summary-->.",
    "Never use legacy {{...}} syntax.",
    "Never include script tags, inline event handlers, require, process, global, eval, Function, imports, module, or exports.",
    "Use CSS variables var(--font-family), var(--font-size), var(--line-height), and var(--accent).",
    "Do not include markdown fences, explanation, comments outside the HTML, or extra JSON keys.",
  ].join("\n");
}

function buildUserPrompt({
  prompt,
  currentTemplateHtml,
  currentName,
  currentDescription,
  layoutMode,
  templateType = "resume",
}) {
  const baseHtml = sanitizeString(currentTemplateHtml, MAX_TEMPLATE_CONTEXT_LENGTH);
  return [
    `Admin request: ${sanitizeString(prompt, MAX_PROMPT_LENGTH)}`,
    `Current template name: ${sanitizeString(currentName, 120) || "Untitled Template"}`,
    `Current description: ${sanitizeString(currentDescription, 300) || "No description"}`,
    `Template type: ${templateType === "cover_letter" ? "cover_letter" : "resume"}`,
    `Current layoutMode: ${layoutMode === "hybrid" ? "hybrid" : "single"}`,
    "Use this current template as the base and modify it according to the request:",
    baseHtml,
  ].join("\n\n");
}

async function generateTemplateWithAi({
  prompt,
  currentTemplateHtml,
  currentName,
  currentDescription,
  layoutMode,
  templateType = "resume",
  targetUserId,
}) {
  const cleanPrompt = sanitizeString(prompt, MAX_PROMPT_LENGTH);
  const cleanTemplate = sanitizeString(currentTemplateHtml, MAX_TEMPLATE_CONTEXT_LENGTH);
  if (!cleanPrompt) {
    throw new Error("Prompt is required");
  }
  if (!cleanTemplate) {
    throw new Error("Current template HTML is required");
  }

  const { result, error } = await tryGetChatReply({
    messages: [
      { role: "system", content: buildSystemPrompt(templateType === "cover_letter" ? "cover_letter" : "resume") },
      {
        role: "user",
        content: buildUserPrompt({
          prompt: cleanPrompt,
          currentTemplateHtml: cleanTemplate,
          currentName,
          currentDescription,
          layoutMode,
          templateType,
        }),
      },
    ],
    temperature: 0.2,
    max_tokens: TEMPLATE_GENERATE_MAX_TOKENS,
  });

  if (error || !result?.reply) {
    throw new Error(error?.message || "Template generation failed");
  }

  const parsed = extractJsonObject(result.reply);
  return normalizeGeneratedTemplate(parsed, {
    currentName,
    currentDescription,
    layoutMode,
    templateType,
  });
}

async function tryGenerateTemplateWithAi(input) {
  try {
    const template = await generateTemplateWithAi(input);
    return { result: { template }, error: null };
  } catch (error) {
    return {
      result: null,
      error: {
        message: error?.message || "Template generation failed",
        statusCode: error?.statusCode || 502,
      },
    };
  }
}

module.exports = {
  MAX_PROMPT_LENGTH,
  MAX_TEMPLATE_CONTEXT_LENGTH,
  SAMPLE_RENDER_DATA,
  SAMPLE_COVER_LETTER_RENDER_DATA,
  buildSystemPrompt,
  buildUserPrompt,
  extractJsonObject,
  generateTemplateWithAi,
  normalizeGeneratedTemplate,
  tryGenerateTemplateWithAi,
  validateGeneratedHtml,
};
