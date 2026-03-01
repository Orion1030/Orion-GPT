require("dotenv").config();
const asyncErrorHandler = require("../middlewares/asyncErrorHandler");
const { ResumeModel } = require("../dbModels");
const { sendJsonResult } = require("../utils");
const { sendPdfResume, sendHtmlResume, sendDocResume, sendPdfFromHtml, sendDocFromHtml } = require("../utils/resumeUtils");
const fetch = global.fetch;
const { ProfileModel } = require("../dbModels");
function mapPayloadToModel(payload, userId) {
  const profileId = payload.profile?.id ?? payload.profileId;
  const templateId = payload.template?.id ?? payload.templateId;
  const stackId = payload.stack?.id ?? payload.stackId;
  return {
    userId: userId,
    name: payload.name || 'Untitled Resume',
    profileId: profileId || null,
    stackId: stackId || null,
    templateId: templateId || null,
    note: payload.note ?? '',
    summary: payload.summary ?? '',
    // Accept structured experiences/skills if provided
    experiences: Array.isArray(payload.experiences) ? payload.experiences : undefined,
    skills: Array.isArray(payload.skills) ? payload.skills : undefined,
    pageFrameConfig: payload.pageFrameConfig ?? null,
  };
}

exports.createResume = asyncErrorHandler(async (req, res, next) => {
  const { user } = req;
  const payload = req.body.resume ?? req.body;
  const data = mapPayloadToModel(payload, user._id);

  if (!data.profileId) {
    return sendJsonResult(res, false, null, "A profile must be selected to create a resume", 400);
  }

  const newResume = new ResumeModel(data);
  await newResume.save();
  const populated = await ResumeModel.findById(newResume._id)
    .populate('profileId')
    .populate('templateId')
    .populate('stackId');
  return sendJsonResult(res, true, populated, "Resume created successfully", 201);
});
exports.getResume = asyncErrorHandler(async (req, res, next) => {
  const { user } = req;
  const { resumeId } = req.params;
  const resume = await ResumeModel.findById(resumeId);
  if (!resume) {
    return sendJsonResult(res, false, null, "Resume not found", 404);
  }
  return sendJsonResult(res, true, resume);
});

exports.updateResume = asyncErrorHandler(async (req, res, next) => {
  const { user } = req;
  const { resumeId } = req.params;
  const payload = req.body.resume ?? req.body;
  const data = mapPayloadToModel(payload, user._id);
  delete data.userId;

  if (!data.profileId) {
    return sendJsonResult(res, false, null, "A profile must be selected for the resume", 400);
  }

  const updatedResume = await ResumeModel.findOneAndUpdate(
    { userId: user._id, _id: resumeId },
    { $set: data },
    { new: true },
  )
    .populate('profileId')
    .populate('templateId')
    .populate('stackId');
  if (!updatedResume) {
    return sendJsonResult(res, false, null, "Resume not found", 404);
  }
  return sendJsonResult(res, true, updatedResume);
});

exports.deleteResume = asyncErrorHandler(async (req, res, next) => {
  const { user } = req;
  const { resumeId } = req.params;
  const deletedResume = await ResumeModel.findOneAndDelete({ _id: resumeId, userId: user._id });
  if (!deletedResume) {
    return sendJsonResult(res, false, null, "Resume not found", 404);
  }
  return sendJsonResult(res, true, null, "Resume deleted successfully");
});

// TODO: parse the uploaded file to the resumeData object
// This is a placeholder for the actual file parsing logic
// You can use libraries like pdf-parse, docx-parser, etc. to extract text from the file
// For simplicity, we'll just use the file name as the note
// exports.uploadResume = asyncErrorHandler(async (req, res, next) => {
//   const { user } = req;
//   const { note } = req.body;
//   if (!req.file) {
//     return sendJsonResult(res, false, null, "No file uploaded", 400);
//   }
//   const resumeData = {
//     userId: user._id,
//     note,
//   };

//   const newResume = new ResumeModel(resumeData);
//   await newResume.save();
//   return sendJsonResult(res, true, newResume, "Resume uploaded successfully", 201);
// });

exports.clearResume = asyncErrorHandler(async (req, res, next) => {
  const { user } = req;
  await ResumeModel.deleteMany({ userId: user._id });
  return sendJsonResult(res, true, null, "Resumes cleared successfully");
});

exports.getAllResumes = asyncErrorHandler(async (req, res, next) => {
  const { user } = req;
  const resumes = await ResumeModel.find({ userId: user._id })
    .populate('profileId')
    .populate('templateId')
    .populate('stackId')
    .sort({ updatedAt: -1 });
  return sendJsonResult(res, true, resumes);
});
exports.downloadResume = asyncErrorHandler(async (req, res, next) => {
  const { user } = req;
  const { resumeId } = req.params;
  const { fileType } = req.query;

  const resume = await ResumeModel.findOne({ _id: resumeId, userId: user._id })
    .populate('templateId')
    .populate('profileId');
  if (!resume) {
    return sendJsonResult(res, false, null, "Resume not found", 404);
  }
  switch (fileType) {
    case 'pdf':
      return sendPdfResume(resume, res);
    case 'html':
      return sendHtmlResume(resume, res);
    case 'doc':
      return sendDocResume(resume, res);
    default:
      return sendJsonResult(res, false, null, "Invalid file type", 400);
  }
});

exports.downloadResumeFromHtml = asyncErrorHandler(async (req, res, next) => {
  const { user } = req;
  const { resumeId } = req.params;
  const { fileType, html, name } = req.body;

  // Basic auth + ownership check: ensure resume exists for this user (keeps parity with GET)
  const resume = await ResumeModel.findOne({ _id: resumeId, userId: user._id })
    .populate('templateId')
    .populate('profileId');
  if (!resume) {
    return sendJsonResult(res, false, null, "Resume not found", 404);
  }

  if (!html || typeof html !== 'string') {
    return sendJsonResult(res, false, null, "Missing html payload", 400);
  }

  switch (fileType) {
    case 'pdf':
      return sendPdfFromHtml(html, res, { name });
    case 'doc':
      return sendDocFromHtml(html, res, { name });
    case 'html':
      res.set({
        'Content-Type': 'text/html',
        'Content-Disposition': `attachment; filename="${(name || 'resume').replace(/"/g, '')}.html"`,
      });
      return res.send(html);
    default:
      return sendJsonResult(res, false, null, "Invalid file type", 400);
  }
});

// Parse plain text resume using server-side LLM and suggest matching profile
exports.parseTextResume = asyncErrorHandler(async (req, res, next) => {
  const { user } = req;
  const { text } = req.body || {};
  if (!text || typeof text !== 'string' || !text.trim()) {
    return sendJsonResult(res, false, null, "Missing text payload", 400);
  }
  // limit size (200KB)
  if (text.length > 200 * 1024) {
    return sendJsonResult(res, false, null, "Input too large. Please trim the file.", 413);
  }

  // Build a deterministic prompt asking for strict JSON
  const systemPrompt = `You are a resume parsing assistant. Extract structured resume data as JSON with keys: profile, summary, skills, meta. The profile must include: fullName, title, contactInfo (email, phone, linkedin, address), experiences (array of { roleTitle, companyName, startDate, endDate, keyPoints }), educations (array of { universityName, degreeLevel, major, startDate, endDate }). The meta object must include confidence (0..1) and missingFields (array). Use null for unknown values. Reply ONLY with valid JSON.`;
  const userPrompt = `Parse the following resume text and return the JSON described above. Text:\n\n${text}`;

  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    return sendJsonResult(res, false, null, "LLM provider not configured", 500);
  }

  // Use OpenAI function-calling to request structured JSON output
  let parsed = null;
  try {
    const functions = [
      {
        name: "parse_resume",
        description: "Return a strict JSON object representing extracted resume sections.",
        parameters: {
          type: "object",
          properties: {
            profile: {
              type: "object",
              properties: {
                fullName: { type: ["string", "null"] },
                title: { type: ["string", "null"] },
                contactInfo: {
                  type: "object",
                  properties: {
                    email: { type: ["string", "null"] },
                    phone: { type: ["string", "null"] },
                    linkedin: { type: ["string", "null"] },
                    address: { type: ["string", "null"] },
                  },
                  additionalProperties: true,
                },
                experiences: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      roleTitle: { type: ["string", "null"] },
                      companyName: { type: ["string", "null"] },
                      startDate: { type: ["string", "null"] },
                      endDate: { type: ["string", "null"] },
                      keyPoints: { type: "array", items: { type: "string" } },
                    },
                    additionalProperties: true,
                  },
                },
                educations: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      universityName: { type: ["string", "null"] },
                      degreeLevel: { type: ["string", "null"] },
                      major: { type: ["string", "null"] },
                      startDate: { type: ["string", "null"] },
                      endDate: { type: ["string", "null"] },
                    },
                    additionalProperties: true,
                  },
                },
              },
              additionalProperties: true,
            },
            summary: { type: ["string", "null"] },
            skills: { type: "array", items: { type: "string" } },
            meta: {
              type: "object",
              properties: {
                confidence: { type: "number" },
                missingFields: { type: "array", items: { type: "string" } },
              },
              additionalProperties: true,
            },
          },
          required: ["profile"],
          additionalProperties: true,
        },
      },
    ];

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.0,
        max_tokens: 2000,
        functions,
        function_call: { name: "parse_resume" },
      }),
    });

    const body = await resp.json();
    const msg = body?.choices?.[0]?.message;
    // function-calling responses place the JSON in message.function_call.arguments
    const funcArgs = msg?.function_call?.arguments;
    if (funcArgs) {
      try {
        parsed = JSON.parse(funcArgs);
      } catch (e) {
        // If JSON parsing fails, return raw and error for debugging
        return sendJsonResult(res, false, { raw: funcArgs }, "Failed to parse function_call.arguments as JSON", 502);
      }
    } else if (msg?.content) {
      // Fallback: try to parse message content (in case function calling wasn't used)
      const content = msg.content;
      try {
        parsed = JSON.parse(content);
      } catch (e) {
        // Attempt to extract a JSON substring as a last resort
        const m = String(content).match(/\{[\s\S]*\}$/);
        if (m) {
          try {
            parsed = JSON.parse(m[0]);
          } catch (ee) {
            return sendJsonResult(res, false, { raw: content }, "Failed to parse LLM output as JSON", 502);
          }
        } else {
          return sendJsonResult(res, false, { raw: content }, "Failed to parse LLM output as JSON", 502);
        }
      }
    } else {
      return sendJsonResult(res, false, null, "LLM returned empty response", 502);
    }
  } catch (e) {
    return sendJsonResult(res, false, null, "LLM request failed", 502);
  }

  // Basic validation/coerce
  parsed = parsed || {};
  parsed.profile = parsed.profile || {};
  parsed.summary = parsed.summary || '';
  parsed.skills = Array.isArray(parsed.skills) ? parsed.skills : (parsed.skills ? String(parsed.skills).split(/,|\\n/).map(s => s.trim()).filter(Boolean) : []);
  parsed.meta = parsed.meta || { confidence: 0, missingFields: [] };

  // Profile matching: fetch user's profiles
  const profiles = await ProfileModel.find({ userId: user._id });

  function normalizeName(n) {
    return String(n || '').toLowerCase().replace(/[^a-z0-9 ]+/g, '').trim();
  }

  function tokenOverlap(a, b) {
    if (!a || !b) return 0;
    const sa = new Set((a || '').toLowerCase().split(/\\s+/).filter(Boolean));
    const sb = new Set((b || '').toLowerCase().split(/\\s+/).filter(Boolean));
    let inter = 0;
    for (const x of sa) if (sb.has(x)) inter++;
    const union = new Set([...sa, ...sb]).size || 1;
    return inter / union;
  }

  let best = { score: 0, profileId: null, profileSnapshot: null };
  for (const p of profiles) {
    let score = 0;
    // exact email match strong
    try {
      const parsedEmail = parsed.profile?.contactInfo?.email;
      if (parsedEmail && p.contactInfo && parsedEmail.toLowerCase() === (p.contactInfo.email || '').toLowerCase()) {
        score = Math.max(score, 0.95);
      }
    } catch (e) { }
    // name similarity
    const nameSim = tokenOverlap(parsed.profile?.fullName, p.fullName);
    score = Math.max(score, nameSim * 0.8);
    // experience/company overlap
    const parsedCompanies = (parsed.profile?.experiences || []).map((e) => (e.companyName || '').toLowerCase());
    const profCompanies = (p.experiences || []).map((e) => (e.companyName || '').toLowerCase());
    const companyInter = parsedCompanies.filter(c => c && profCompanies.includes(c)).length;
    const companyScore = profCompanies.length ? companyInter / profCompanies.length : 0;
    score = Math.max(score, companyScore * 0.7);

    if (score > best.score) {
      best = { score, profileId: p._id, profileSnapshot: p };
    }
  }

  const createNewProfileSuggested = !(best && best.score >= 0.7);

  return sendJsonResult(res, true, { parsed, bestMatch: best, createNewProfileSuggested });
});

// Expose helper for tests
exports._mapPayloadToModel = mapPayloadToModel;