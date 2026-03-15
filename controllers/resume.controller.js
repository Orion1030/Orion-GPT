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
    // Cloud indexing fields
    cloudPrimary: payload.cloudPrimary ?? (payload.cloudPrimary === '' ? '' : undefined),
    cloudSecondary: Array.isArray(payload.cloudSecondary) ? payload.cloudSecondary : undefined,
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

  // Delegate parsing to shared util to keep parsing logic in one place
  let parsed = null;
  try {
    const { parseResumeTextWithLLM } = require('../utils/parseResume');
    parsed = await parseResumeTextWithLLM(text);
    if (!parsed) {
      return sendJsonResult(res, false, null, "Failed to parse resume text", 502);
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

  // Strict matching logic:
  // - same experiences count
  // - same companies of experiences (company name normalized, start year, end year)
  const yearOf = (d) => {
    if (!d) return "";
    try {
      const dt = new Date(d);
      if (!isNaN(dt.getTime())) return dt.getUTCFullYear().toString();
    } catch { }
    const m = String(d).match(/(\d{4})/);
    const yearString = m ? m[1] : String(d || "").trim();
    return yearString.toLowerCase() === "present" ? new Date().getFullYear().toString() : yearString;
  };

  const normalizeCompany = (s) => normalizeName(String(s || ""));

  const parsedExps = Array.isArray(parsed.profile?.experiences) ? parsed.profile.experiences : [];
  const parsedKeys = new Set(parsedExps.map((e) => `${normalizeCompany(e.companyName)}|${yearOf(e.startDate)}|${yearOf(e.endDate)}`));

  const strictMatches = [];
  for (const p of profiles) {
    const pExps = Array.isArray(p.experiences) ? p.experiences : [];
    if (pExps.length !== parsedExps.length) continue;
    const pKeys = new Set(pExps.map((e) => `${normalizeCompany(e.companyName)}|${yearOf(e.startDate)}|${yearOf(e.endDate)}`));
    if (pKeys.size !== parsedKeys.size) continue;
    let allPresent = true;
    for (const k of parsedKeys) {
      if (!pKeys.has(k)) { allPresent = false; break; }
    }
    if (allPresent) strictMatches.push(p);
  }

  // If no strict matches, suggest creating a new profile only.
  if (!strictMatches.length) {
    return sendJsonResult(res, true, { parsed, bestMatch: null, matches: [], createNewProfileSuggested: true });
  }

  // If we have strict matches, check for exact identity via email or fullName
  const incomingEmail = (parsed.profile?.contactInfo?.email || "").trim().toLowerCase();
  const incomingName = (parsed.profile?.fullName || "").trim().toLowerCase();
  let best = { score: 0, profileId: null, profileSnapshot: null };
  for (const m of strictMatches) {
    let score = 0;
    try {
      if (incomingEmail && m.contactInfo && (m.contactInfo.email || "").trim().toLowerCase() === incomingEmail) {
        score = 1.0;
      }
    } catch (e) { }
    if (!score && incomingName && (m.fullName || "").trim().toLowerCase() === incomingName) {
      score = 0.95;
    }
    if (score > best.score) best = { score, profileId: m._id, profileSnapshot: m };
  }

  // Return parsed data, array of strict matches, and optionally a bestMatch (if email/name matched)
  return sendJsonResult(res, true, { parsed, bestMatch: best.profileId ? best : null, matches: strictMatches, createNewProfileSuggested: false });
});

// Expose helper for tests
exports._mapPayloadToModel = mapPayloadToModel;