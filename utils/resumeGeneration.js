const fetch = global.fetch || require("node-fetch");

function sanitizeStr(s) {
  if (s == null) return "";
  return String(s)
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .trim()
    .slice(0, 10000);
}

// Build resume JSON matching Resume model: name, summary, experiences[], skills[]
function normalizeResumeJson(raw) {
  const name = sanitizeStr(raw?.name) || "Generated Resume";
  const summary = sanitizeStr(raw?.summary) || "";
  const experiences = Array.isArray(raw?.experiences)
    ? raw.experiences.slice(0, 20).map((e) => ({
        title: sanitizeStr(e?.title ?? e?.roleTitle) || "",
        companyName: sanitizeStr(e?.companyName) || "",
        companyLocation: sanitizeStr(e?.companyLocation) || "",
        summary: sanitizeStr(e?.summary) || "",
        descriptions: Array.isArray(e?.descriptions)
          ? e.descriptions.map(sanitizeStr).filter(Boolean)
          : [],
        startDate: sanitizeStr(e?.startDate) || "",
        endDate: sanitizeStr(e?.endDate) || "",
      }))
    : [];

  const skills = Array.isArray(raw?.skills)
    ? raw.skills.slice(0, 10).map((s) => ({
        title: sanitizeStr(s?.title) || "Skills",
        items: Array.isArray(s?.items)
          ? s.items.map(sanitizeStr).filter(Boolean).slice(0, 50)
          : [],
      }))
    : [];

  return { name, summary, experiences, skills, pageFrameConfig: null };
}

async function generateResumeJsonFromJD({ jd, profile, baseResume, openaiKey }) {
  if (!openaiKey) throw new Error("LLM not configured");
  if (!jd || !profile) throw new Error("JD or profile not found");

  const jdContext = `Job Title: ${jd.title}\nCompany: ${jd.company || "N/A"}\nRequired Skills: ${(jd.skills || []).join(
    ", "
  )}\nRequirements: ${(jd.requirements || []).slice(0, 5).join("\n")}\nKey Responsibilities: ${(jd.responsibilities || []).slice(
    0,
    5
  ).join("\n")}`;

  const profileContext = `Candidate: ${profile.fullName}\nTitle: ${profile.title}\nExperiences: ${(profile.experiences || [])
    .map(
      (e) =>
        `${e.roleTitle} at ${e.companyName}: ${(e.keyPoints || []).slice(0, 2).join("; ")}`
    )
    .join("\n")}`;

  const baseContext = baseResume
    ? `\nBase resume to adapt (use same JSON shape): ${JSON.stringify({
        summary: baseResume.summary,
        experiences: baseResume.experiences?.slice(0, 3),
        skills: baseResume.skills,
      })}`
    : "";

  const systemPrompt = `You are a resume writing expert. Generate a resume as a single JSON object matching this exact shape (no other text):
{
  "name": "string (resume title)",
  "summary": "string (professional summary)",
  "experiences": [
    {
      "title": "string (job title)",
      "companyName": "string",
      "companyLocation": "string (optional)",
      "summary": "string (optional)",
      "descriptions": ["string", "..."],
      "startDate": "string (e.g. 2020)",
      "endDate": "string (e.g. 2023 or Present)"
    }
  ],
  "skills": [
    { "title": "string (e.g. Skills)", "items": ["string", "..."] }
  ]
}
Use strong action verbs and quantify achievements. Tailor content to the job description. Reply with ONLY valid JSON.`;

  const userPrompt = `Job Description:\n${jdContext}\n\nCandidate Profile:\n${profileContext}${baseContext}\n\nGenerate the resume as one JSON object (no markdown, no code fence).`;

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.2,
      max_tokens: 2000,
    }),
  });

  const body = await resp.json();
  const raw = body?.choices?.[0]?.message?.content || "";
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return normalizeResumeJson(JSON.parse(jsonMatch[0]));
    } catch {
      return normalizeResumeJson({
        name: "Generated Resume",
        summary: raw.slice(0, 500),
        experiences: [],
        skills: [],
      });
    }
  }

  return normalizeResumeJson({
    name: "Generated Resume",
    summary: raw.slice(0, 500),
    experiences: [],
    skills: [],
  });
}

module.exports = {
  sanitizeStr,
  normalizeResumeJson,
  generateResumeJsonFromJD,
};

