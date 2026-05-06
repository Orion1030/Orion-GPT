#!/usr/bin/env node
/**
 * Migration script: normalize Resume.experiences by folding legacy experience
 * summary/descriptions/keyPoints into bullets[] and removing legacy fields.
 *
 * Usage:
 *   node scripts/migrations/migrate-resume-experience-summary-to-bullets.js --dry-run
 *   node scripts/migrations/migrate-resume-experience-summary-to-bullets.js --commit
 *   node scripts/migrations/migrate-resume-experience-summary-to-bullets.js --commit --limit=100
 *   node scripts/migrations/migrate-resume-experience-summary-to-bullets.js --commit --user-id=<mongodb-object-id>
 */
const mongoose = require("mongoose");
require("dotenv").config();

const ResumeModel = require("../../dbModels/Resume.Model");

const MONGO =
  process.env.MONGO_URI ||
  process.env.MONGODB_URI ||
  process.env.DB_URI ||
  "mongodb://localhost:27017/jobsy";

const argv = process.argv.slice(2);
const commit = argv.includes("--commit");
const dryRun = !commit || argv.includes("--dry-run");
const limitArg = argv.find((arg) => arg.startsWith("--limit="));
const userIdArg = argv.find((arg) => arg.startsWith("--user-id="));
const sampleArg = argv.find((arg) => arg.startsWith("--sample="));
const limit = limitArg ? Math.max(0, Number(limitArg.split("=")[1]) || 0) : 0;
const sampleLimit = sampleArg ? Math.max(0, Number(sampleArg.split("=")[1]) || 0) : 20;

function redactMongoUri(uri) {
  try {
    const parsed = new URL(uri);
    if (parsed.username || parsed.password) {
      parsed.username = "****";
      parsed.password = "****";
    }
    return parsed.toString();
  } catch {
    return "[redacted-uri]";
  }
}

function parseUserIdArg(value) {
  if (!value) return null;
  const raw = String(value.split("=")[1] || "").trim();
  if (!raw) return null;
  if (!mongoose.Types.ObjectId.isValid(raw)) {
    throw new Error(`Invalid --user-id value: ${raw}`);
  }
  return new mongoose.Types.ObjectId(raw);
}

function sanitizeString(value) {
  return String(value || "").trim();
}

function dedupeStrings(items) {
  const out = [];
  const seen = new Set();
  for (const item of items || []) {
    const clean = sanitizeString(item);
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out;
}

function parseLegacyBulletList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeString(item)).filter(Boolean);
  }
  if (typeof value !== "string") return [];

  const raw = value.trim();
  if (!raw) return [];

  const htmlListItems = [...raw.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)]
    .map((match) => sanitizeString(match[1]))
    .filter(Boolean);
  if (htmlListItems.length) return htmlListItems;

  const lines = raw
    .replace(/<br\s*\/?>/gi, "\n")
    .split(/\r?\n/)
    .map((line) => line.replace(/^[\s\-*•]+/, ""))
    .map((line) => sanitizeString(line.replace(/<[^>]+>/g, " ")))
    .filter(Boolean);
  if (lines.length) return lines;

  const single = sanitizeString(raw.replace(/<[^>]+>/g, " "));
  return single ? [single] : [];
}

function normalizeExperience(exp) {
  const legacySummary = sanitizeString(exp?.summary || exp?.companySummary);
  const bullets = parseLegacyBulletList(exp?.bullets);
  const descriptions = parseLegacyBulletList(exp?.descriptions);
  const keyPoints = parseLegacyBulletList(exp?.keyPoints);

  const next = {
    ...exp,
    bullets: dedupeStrings([legacySummary, ...bullets, ...descriptions, ...keyPoints]),
  };
  delete next.summary;
  delete next.companySummary;
  delete next.descriptions;
  return next;
}

function hasLegacySummaryShape(exp) {
  return Boolean(sanitizeString(exp?.summary || exp?.companySummary));
}

function hasLegacyDescriptionsShape(exp) {
  return parseLegacyBulletList(exp?.descriptions).length > 0 || Object.prototype.hasOwnProperty.call(exp || {}, "descriptions");
}

function bulletsDiffer(before, after) {
  const left = Array.isArray(before) ? before.map((v) => sanitizeString(v)).filter(Boolean) : [];
  const right = Array.isArray(after) ? after.map((v) => sanitizeString(v)).filter(Boolean) : [];
  if (left.length !== right.length) return true;
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) return true;
  }
  return false;
}

async function main() {
  const userIdFilter = parseUserIdArg(userIdArg);
  console.log(
    `[migrate-resume-exp-summary] connect=${redactMongoUri(MONGO)} mode=${dryRun ? "dry-run" : "commit"} limit=${limit || "none"} userId=${userIdFilter || "all"}`
  );

  await mongoose.connect(MONGO);

  const filter = {};
  if (userIdFilter) filter.userId = userIdFilter;

  let query = ResumeModel.find(filter).sort({ createdAt: 1 }).lean();
  if (limit > 0) query = query.limit(limit);
  const cursor = query.cursor();

  let scanned = 0;
  let changed = 0;
  let updated = 0;
  let noChange = 0;
  const sampleIds = [];

  for await (const resume of cursor) {
    scanned += 1;
    const experiences = Array.isArray(resume?.experiences) ? resume.experiences : [];
    if (!experiences.length) {
      noChange += 1;
      continue;
    }

    let resumeChanged = false;
    const nextExperiences = experiences.map((exp) => {
      const normalized = normalizeExperience(exp);
      if (hasLegacySummaryShape(exp)) resumeChanged = true;
      if (hasLegacyDescriptionsShape(exp)) resumeChanged = true;
      if (bulletsDiffer(exp?.bullets, normalized.bullets)) resumeChanged = true;
      return normalized;
    });

    if (!resumeChanged) {
      noChange += 1;
      continue;
    }

    changed += 1;
    if (sampleIds.length < sampleLimit) sampleIds.push(String(resume._id));

    if (!dryRun) {
      await ResumeModel.updateOne(
        { _id: resume._id },
        { $set: { experiences: nextExperiences } }
      );
      updated += 1;
    }
  }

  console.log("[migrate-resume-exp-summary] summary");
  console.log(`  scanned: ${scanned}`);
  console.log(`  changed: ${changed}`);
  console.log(`  updated: ${updated}`);
  console.log(`  noChange: ${noChange}`);
  if (sampleIds.length) {
    console.log(`  sampleResumeIds: ${sampleIds.join(", ")}`);
  }

  await mongoose.disconnect();
}

main()
  .then(() => process.exit(0))
  .catch(async (error) => {
    console.error("[migrate-resume-exp-summary] error:", error?.message || error);
    try {
      await mongoose.disconnect();
    } catch {
      // ignore cleanup errors
    }
    process.exit(2);
  });
