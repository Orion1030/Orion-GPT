#!/usr/bin/env node
/**
 * Migration script: convert legacy Resume.content -> structured `experiences` and `skills`.
 *
 * Usage:
 *   node migrate-resume-content.js --dry-run
 *   node migrate-resume-content.js --commit
 *
 * Reads resumes, populates `experiences` from linked profile (if missing),
 * and converts `content.skillsContent` into `skills: [{ title, items }]`.
 */
const mongoose = require('mongoose');
require('dotenv').config();

const MONGO = process.env.MONGO_URI || process.env.MONGO || 'mongodb://localhost:27017/jobsy';
const dryRun = process.argv.includes('--dry-run') || !process.argv.includes('--commit');
const commit = process.argv.includes('--commit');

function keyPointsToDescriptions(value) {
  if (Array.isArray(value)) {
    return value.map((v) => String(v || '').trim()).filter(Boolean);
  }
  if (typeof value !== 'string') return [];

  const raw = value.trim();
  if (!raw) return [];

  const htmlListItems = [...raw.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)]
    .map((match) => String(match[1] || '').trim())
    .filter(Boolean);
  if (htmlListItems.length) return htmlListItems;

  const lines = raw
    .replace(/<br\s*\/?>/gi, '\n')
    .split(/\r?\n/)
    .map((line) => line.replace(/^[\s\-*•]+/, '').trim())
    .filter(Boolean);
  if (lines.length) return lines;

  return [raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()].filter(Boolean);
}

async function main() {
  console.log(`[migrate-resume-content] connecting to ${MONGO} (dryRun=${dryRun}, commit=${commit})`);
  await mongoose.connect(MONGO, { useNewUrlParser: true, useUnifiedTopology: true });
  const Resume = require('../dbModels/Resume.Model');
  const Profile = require('../dbModels/Profile.Model') || null;

  const resumes = await Resume.find().lean();
  console.log(`[migrate-resume-content] found ${resumes.length} resumes`);

  let changed = 0;
  for (const r of resumes) {
    const updates = {};
    // Populate experiences if missing or empty
    if ((!Array.isArray(r.experiences) || r.experiences.length === 0) && r.profileId) {
      try {
        const profile = await Resume.populate(r, { path: 'profileId' }).then(doc => doc.profileId);
        const prof = profile || {};
        const profExps = Array.isArray(prof.careerHistory) ? prof.careerHistory : [];
        if (profExps.length) {
          updates.experiences = profExps.map((exp) => ({
            title: exp.roleTitle || exp.title || '',
            companyName: exp.companyName || '',
            companyLocation: '',
            summary: exp.companySummary || '',
            descriptions: keyPointsToDescriptions(exp.keyPoints),
            startDate: exp.startDate || '',
            endDate: exp.endDate || '',
          }));
        }
      } catch (e) {
        console.warn('[migrate-resume-content] failed to populate profile for resume', r._id, e.message || e);
      }
    }

    // Convert skillsContent -> skills
    const content = r.content || {};
    const sc = content.skillsContent || '';
    if ((!Array.isArray(r.skills) || r.skills.length === 0) && typeof sc === 'string' && sc.trim()) {
      const items = sc.split('\n').map(s => s.replace(/^[\\s\\-\\*•]+/, '').trim()).filter(Boolean);
      if (items.length) updates.skills = [{ title: 'Skills', items }];
    }

    if (Object.keys(updates).length > 0) {
      changed++;
      console.log(`[migrate-resume-content] resume ${r._id} -> updates:`, Object.keys(updates));
      if (commit) {
        try {
          await Resume.updateOne({ _id: r._id }, { $set: updates });
        } catch (e) {
          console.error(`[migrate-resume-content] failed to update ${r._id}:`, e.message || e);
        }
      }
    }
  }

  console.log(`[migrate-resume-content] processed ${resumes.length} resumes, ${changed} would be/ were updated.`);
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('[migrate-resume-content] error:', err);
  process.exit(2);
});
