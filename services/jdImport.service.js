const crypto = require("crypto");
const {
  normalizeParsedJD,
  parseJobDescriptionWithLLM,
  getJobDescriptionEmbedding,
} = require("../utils/jdParsing");
const { findTopResumesCore } = require("./findTopResumes");
const { findTopProfilesCore } = require("./findTopProfiles");
const { JobDescriptionModel } = require("../dbModels");

const JD_NEAR_DUPLICATE_THRESHOLD = (() => {
  const raw = Number(process.env.JD_NEAR_DUPLICATE_THRESHOLD || "0.95");
  if (!Number.isFinite(raw)) return 0.9;
  return Math.max(0, Math.min(1, raw));
})();
const JD_NEAR_DUPLICATE_MAX_SCAN = (() => {
  const raw = Number.parseInt(process.env.JD_NEAR_DUPLICATE_MAX_SCAN || "200", 10);
  if (!Number.isFinite(raw) || raw <= 0) return 200;
  return Math.min(raw, 2000);
})();
const JD_NEAR_DUPLICATE_MIN_TOKENS = (() => {
  const raw = Number.parseInt(process.env.JD_NEAR_DUPLICATE_MIN_TOKENS || "25", 10);
  if (!Number.isFinite(raw) || raw <= 0) return 25;
  return Math.min(raw, 200);
})();
const COMMON_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "to",
  "with",
  "you",
  "your",
]);

function resolveJdContext(payload) {
  const { context, text } = payload || {};
  return typeof context === "string" ? context : text;
}

function normalizeHashText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeHashList(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const values = [];
  for (const item of list) {
    const normalized = normalizeHashText(item);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    values.push(normalized);
  }
  return values.sort();
}

function buildNormalizedIdentity(normalized) {
  const safe = normalized && typeof normalized === "object" ? normalized : {};
  return {
    title: normalizeHashText(safe.title || "Job"),
    company: normalizeHashText(safe.company || ""),
    skills: normalizeHashList(safe.skills),
    requirements: normalizeHashList(safe.requirements),
    responsibilities: normalizeHashList(safe.responsibilities),
    niceToHave: normalizeHashList(safe.niceToHave),
  };
}

function buildNormalizedJdHash(normalized) {
  const identity = buildNormalizedIdentity(normalized);
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(identity))
    .digest("hex");
}

function normalizeContextText(context) {
  return String(context || "")
    .toLowerCase()
    .replace(/<[^>]*>/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildContextHash(context) {
  const normalized = normalizeContextText(context);
  if (!normalized) return "";
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

function tokenizeContext(context) {
  const normalized = normalizeContextText(context);
  if (!normalized) return [];
  return normalized
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !COMMON_STOP_WORDS.has(token));
}

function compareTokenSimilarity(aTokens, bTokens) {
  const aSet = new Set(aTokens);
  const bSet = new Set(bTokens);
  if (!aSet.size || !bSet.size) {
    return {
      score: 0,
      intersection: 0,
      jaccard: 0,
      containment: 0,
      aSize: aSet.size,
      bSize: bSet.size,
    };
  }

  let intersection = 0;
  for (const token of aSet) {
    if (bSet.has(token)) intersection += 1;
  }
  const minSize = Math.min(aSet.size, bSet.size);
  const union = aSet.size + bSet.size - intersection;
  const jaccard = union > 0 ? intersection / union : 0;
  const containment = minSize > 0 ? intersection / minSize : 0;
  const score = containment * 0.7 + jaccard * 0.3;
  return { score, intersection, jaccard, containment, aSize: aSet.size, bSize: bSet.size };
}

function toParsedFromStoredJd(doc) {
  return {
    title: doc?.title || "",
    company: doc?.company || "",
    skills: Array.isArray(doc?.skills) ? doc.skills : [],
    niceToHave: Array.isArray(doc?.niceToHave) ? doc.niceToHave : [],
    requirements: Array.isArray(doc?.requirements) ? doc.requirements : [],
    responsibilities: Array.isArray(doc?.responsibilities)
      ? doc.responsibilities
      : [],
  };
}

function toPersistenceFields({
  normalized,
  context,
  normalizedHash,
  contextHash,
}) {
  const safe = normalized && typeof normalized === "object" ? normalized : {};
  return {
    title: safe.title || "Job",
    company: safe.company || "",
    skills: Array.isArray(safe.skills) ? safe.skills : [],
    niceToHave: Array.isArray(safe.niceToHave) ? safe.niceToHave : [],
    requirements: Array.isArray(safe.requirements) ? safe.requirements : [],
    responsibilities: Array.isArray(safe.responsibilities)
      ? safe.responsibilities
      : [],
    context: context || "",
    contextHash: contextHash || "",
    normalizedHash: normalizedHash || "",
  };
}

/**
 * Same-JD policy:
 * - Reuse existing JD for the same user when normalized content hash matches.
 * - Fall back to exact legacy-field lookup (older rows without normalizedHash).
 * - On reuse, refresh stored context and normalized fields instead of creating duplicates.
 */
async function findExistingJobDescription({ userId, normalized, normalizedHash }) {
  if (normalizedHash) {
    const byHash = await JobDescriptionModel.findOne({ userId, normalizedHash })
      .sort({ updatedAt: -1, createdAt: -1 })
      .lean();
    if (byHash) return byHash;
  }

  return JobDescriptionModel.findOne({
    userId,
    title: normalized?.title || "Job",
    company: normalized?.company || "",
    skills: Array.isArray(normalized?.skills) ? normalized.skills : [],
    niceToHave: Array.isArray(normalized?.niceToHave)
      ? normalized.niceToHave
      : [],
    requirements: Array.isArray(normalized?.requirements)
      ? normalized.requirements
      : [],
    responsibilities: Array.isArray(normalized?.responsibilities)
      ? normalized.responsibilities
      : [],
  })
    .sort({ updatedAt: -1, createdAt: -1 })
    .lean();
}

async function findExistingByContextHash({ userId, contextHash }) {
  if (!contextHash) return null;
  return JobDescriptionModel.findOne({ userId, contextHash })
    .sort({ updatedAt: -1, createdAt: -1 })
    .lean();
}

async function findNearDuplicateByContext({ userId, jdContext, contextHash }) {
  if (JD_NEAR_DUPLICATE_THRESHOLD <= 0) return null;

  const incomingTokens = Array.from(new Set(tokenizeContext(jdContext)));
  if (incomingTokens.length < JD_NEAR_DUPLICATE_MIN_TOKENS) return null;

  const candidates = await JobDescriptionModel.find({
    userId,
    context: /\S/,
  })
    .sort({ updatedAt: -1, createdAt: -1 })
    .limit(JD_NEAR_DUPLICATE_MAX_SCAN)
    .select(
      "_id context title company skills requirements responsibilities niceToHave normalizedHash contextHash"
    )
    .lean();

  let bestMatch = null;
  for (const candidate of candidates || []) {
    if (!candidate?.context) continue;
    const candidateHash = candidate.contextHash || buildContextHash(candidate.context);
    if (candidateHash && contextHash && candidateHash === contextHash) {
      return candidate;
    }

    const candidateTokens = Array.from(new Set(tokenizeContext(candidate.context)));
    if (candidateTokens.length < JD_NEAR_DUPLICATE_MIN_TOKENS) continue;

    const similarity = compareTokenSimilarity(incomingTokens, candidateTokens);
    const minIntersection = Math.max(
      8,
      Math.floor(Math.min(similarity.aSize, similarity.bSize) * 0.55)
    );
    if (similarity.intersection < minIntersection) continue;
    if (similarity.score < JD_NEAR_DUPLICATE_THRESHOLD) continue;

    if (!bestMatch || similarity.score > bestMatch.score) {
      bestMatch = { score: similarity.score, doc: candidate };
    }
  }

  return bestMatch?.doc || null;
}

async function touchExistingContext({
  existingId,
  context,
  contextHash,
}) {
  const hasContext = Boolean(context && String(context).trim());
  const updates = hasContext
    ? { context: String(context), contextHash: contextHash || "" }
    : {};
  if (!Object.keys(updates).length) return;
  await JobDescriptionModel.updateOne({ _id: existingId }, { $set: updates });
}

async function touchExistingJobDescription({
  existingId,
  normalized,
  context,
  normalizedHash,
  contextHash,
}) {
  const fields = toPersistenceFields({
    normalized,
    context,
    normalizedHash,
    contextHash,
  });
  if (!context || !String(context).trim()) {
    delete fields.context;
    delete fields.contextHash;
  }
  await JobDescriptionModel.updateOne(
    { _id: existingId },
    { $set: fields }
  );
}

async function tryParseAndPersistJobDescription({ userId, jdContext }) {
  try {
    const contextHash = buildContextHash(jdContext);
    const existingByContextHash = await findExistingByContextHash({
      userId,
      contextHash,
    });
    if (existingByContextHash) {
      await touchExistingContext({
        existingId: existingByContextHash._id,
        context: jdContext,
        contextHash,
      });
      return {
        result: {
          jdId: existingByContextHash._id.toString(),
          parsed: toParsedFromStoredJd(existingByContextHash),
        },
        error: null,
      };
    }

    const nearDuplicate = await findNearDuplicateByContext({
      userId,
      jdContext,
      contextHash,
    });
    if (nearDuplicate) {
      await touchExistingContext({
        existingId: nearDuplicate._id,
        context: jdContext,
        contextHash,
      });
      return {
        result: {
          jdId: nearDuplicate._id.toString(),
          parsed: toParsedFromStoredJd(nearDuplicate),
        },
        error: null,
      };
    }

    const parsed = await parseJobDescriptionWithLLM(jdContext);
    if (!parsed) {
      return {
        result: null,
        error: { message: "Failed to parse JD", statusCode: 502 },
      };
    }

    const normalized = normalizeParsedJD(parsed);
    const normalizedHash = buildNormalizedJdHash(normalized);
    const existing = await findExistingJobDescription({
      userId,
      normalized,
      normalizedHash,
    });
    if (existing) {
      await touchExistingJobDescription({
        existingId: existing._id,
        normalized,
        context: jdContext,
        normalizedHash,
        contextHash,
      });
      return {
        result: { jdId: existing._id.toString(), parsed: normalized },
        error: null,
      };
    }

    const embedding = await getJobDescriptionEmbedding(normalized);

    const jd = new JobDescriptionModel({
      userId,
      ...toPersistenceFields({
        normalized,
        context: jdContext,
        normalizedHash,
        contextHash,
      }),
    });
    if (embedding) jd.embedding = embedding;
    await jd.save();

    return {
      result: { jdId: jd._id.toString(), parsed: normalized },
      error: null,
    };
  } catch (e) {
    return {
      result: null,
      error: { message: "LLM parse failed", statusCode: 502 },
    };
  }
}

async function tryFindTopResumesForJobDescription({ userId, jdId, profileId }) {
  try {
    const { topResumes, error } = await findTopResumesCore(userId, jdId, profileId);
    if (error) {
      return {
        result: null,
        error: { message: error, statusCode: 404 },
      };
    }
    return {
      result: { topResumes: topResumes || [] },
      error: null,
    };
  } catch (e) {
    return {
      result: null,
      error: { message: "Failed to find top resumes", statusCode: 502 },
    };
  }
}

async function tryFindTopProfilesForJobDescription({ userId, jdId }) {
  try {
    const { topProfiles, error } = await findTopProfilesCore(userId, jdId);
    if (error) {
      return { result: null, error: { message: error, statusCode: 404 } };
    }
    return { result: { topProfiles: topProfiles || [] }, error: null };
  } catch (e) {
    return { result: null, error: { message: "Failed to find top profiles", statusCode: 502 } };
  }
}

/**
 * Persist an already-parsed and normalized JD (used by the jdParser agent,
 * which handles its own LLM call and then delegates saving here).
 */
async function persistParsedJobDescription({ userId, normalized, context }) {
  const normalizedSafe = normalizeParsedJD(normalized);
  const normalizedHash = buildNormalizedJdHash(normalizedSafe);
  const contextHash = buildContextHash(context || "");

  const existing = await findExistingJobDescription({
    userId,
    normalized: normalizedSafe,
    normalizedHash,
  });
  if (existing) {
    await touchExistingJobDescription({
      existingId: existing._id,
      normalized: normalizedSafe,
      context,
      normalizedHash,
      contextHash,
    });
    return { jdId: existing._id.toString() };
  }

  const embedding = await getJobDescriptionEmbedding(normalizedSafe);

  const jd = new JobDescriptionModel({
    userId,
    ...toPersistenceFields({
      normalized: normalizedSafe,
      context: context || "",
      normalizedHash,
      contextHash,
    }),
  });
  if (embedding) jd.embedding = embedding;
  await jd.save();

  return { jdId: jd._id.toString() };
}

function toPublicParsedJD(parsed) {
  return {
    title: parsed?.title || "",
    company: parsed?.company || "",
    skills: Array.isArray(parsed?.skills) ? parsed.skills : [],
    niceToHave: Array.isArray(parsed?.niceToHave) ? parsed.niceToHave : [],
    requirements: Array.isArray(parsed?.requirements) ? parsed.requirements : [],
    responsibilities: Array.isArray(parsed?.responsibilities) ? parsed.responsibilities : [],
  };
}

module.exports = {
  resolveJdContext,
  tryParseAndPersistJobDescription,
  tryFindTopResumesForJobDescription,
  tryFindTopProfilesForJobDescription,
  persistParsedJobDescription,
  toPublicParsedJD,
  buildNormalizedJdHash,
  buildContextHash,
};
