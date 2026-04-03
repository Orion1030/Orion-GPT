#!/usr/bin/env node
/**
 * One-time migration: convert legacy Profile.careerHistory[].keyPoints arrays
 * into canonical rich-text strings (<ul><li>...</li></ul>).
 *
 * Usage:
 *   node migrate-profile-keypoints.js --dry-run
 *   node migrate-profile-keypoints.js --commit
 *   node migrate-profile-keypoints.js --commit --limit=100
 *   node migrate-profile-keypoints.js --dry-run --user-id=<mongodb-object-id>
 */
const mongoose = require("mongoose");
require("dotenv").config();

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
const sampleLimit = sampleArg
  ? Math.max(0, Number(sampleArg.split("=")[1]) || 0)
  : 15;

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

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function toCanonicalKeyPoints(value) {
  if (!Array.isArray(value)) return { nextValue: value, changed: false };
  const lines = value.map((item) => String(item || "").trim()).filter(Boolean);
  if (!lines.length) return { nextValue: "", changed: true };

  const listItems = lines.map((line) =>
    /<[a-z][\s\S]*>/i.test(line)
      ? `<li>${line}</li>`
      : `<li>${escapeHtml(line)}</li>`
  );
  return { nextValue: `<ul>${listItems.join("")}</ul>`, changed: true };
}

function parseUserId(value) {
  if (!value) return null;
  const raw = value.split("=")[1];
  if (!raw) return null;
  if (!mongoose.Types.ObjectId.isValid(raw)) {
    throw new Error(`Invalid --user-id value: ${raw}`);
  }
  return new mongoose.Types.ObjectId(raw);
}

async function main() {
  const userIdFilter = parseUserId(userIdArg);
  console.log(
    `[migrate-profile-keypoints] connect=${redactMongoUri(MONGO)} mode=${
      dryRun ? "dry-run" : "commit"
    } limit=${limit || "none"} userId=${userIdFilter || "all"}`
  );

  await mongoose.connect(MONGO);

  const profiles = mongoose.connection.collection("profiles");
  const filter = {
    careerHistory: { $elemMatch: { keyPoints: { $type: "array" } } },
  };
  if (userIdFilter) filter.userId = userIdFilter;

  let scannedDocs = 0;
  let docsWithChanges = 0;
  let updatedDocs = 0;
  let convertedExperiences = 0;
  const sampleProfileIds = [];

  let cursor = profiles.find(filter, { projection: { careerHistory: 1 } });
  if (limit > 0) cursor = cursor.limit(limit);

  for await (const doc of cursor) {
    scannedDocs += 1;
    const currentHistory = Array.isArray(doc.careerHistory) ? doc.careerHistory : [];
    let docChanged = false;

    const nextHistory = currentHistory.map((entry) => {
      const { nextValue, changed } = toCanonicalKeyPoints(entry?.keyPoints);
      if (!changed) return entry;
      convertedExperiences += 1;
      docChanged = true;
      return { ...entry, keyPoints: nextValue };
    });

    if (!docChanged) continue;
    docsWithChanges += 1;
    if (sampleProfileIds.length < sampleLimit) {
      sampleProfileIds.push(String(doc._id));
    }

    if (!dryRun) {
      const result = await profiles.updateOne(
        { _id: doc._id },
        { $set: { careerHistory: nextHistory } }
      );
      if (result.modifiedCount > 0) updatedDocs += 1;
    }
  }

  console.log("[migrate-profile-keypoints] summary");
  console.log(`  scannedDocs: ${scannedDocs}`);
  console.log(`  docsWithChanges: ${docsWithChanges}`);
  console.log(`  convertedExperiences: ${convertedExperiences}`);
  console.log(`  updatedDocs: ${dryRun ? 0 : updatedDocs}`);
  if (sampleProfileIds.length > 0) {
    console.log(`  sampleProfileIds: ${sampleProfileIds.join(", ")}`);
  }

  await mongoose.disconnect();
}

main()
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error("[migrate-profile-keypoints] error:", err?.message || err);
    try {
      await mongoose.disconnect();
    } catch {
      // ignore disconnect failures on exit path
    }
    process.exit(2);
  });
