#!/usr/bin/env node
/**
 * Migration: convert resume templates from the legacy {{...}} syntax to EJS.
 *
 * Usage:
 *   node scripts/migrations/migrate-templates-to-ejs.js --dry-run
 *   node scripts/migrations/migrate-templates-to-ejs.js --commit
 */
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });

const { getBuiltInSeedTemplates } = require('../../utils/builtInTemplates');
const {
  convertLegacyTemplateToEjs,
  hasLegacyTemplateSyntax,
} = require('../../utils/templateSyntaxMigration');

const MONGO_URI =
  process.env.MONGO_URI ||
  process.env.MONGODB_URI ||
  process.env.DB_URI ||
  'mongodb://localhost:27017/jobsy';

const argv = process.argv.slice(2);
const commit = argv.includes('--commit');
const dryRun = !commit || argv.includes('--dry-run');

function redactMongoUri(uri) {
  try {
    const parsed = new URL(uri);
    if (parsed.username || parsed.password) {
      parsed.username = '****';
      parsed.password = '****';
    }
    return parsed.toString();
  } catch {
    return '[redacted-uri]';
  }
}

function conversionSucceeded(converted) {
  return !hasLegacyTemplateSyntax(converted);
}

async function upsertBuiltIns(templatesCollection) {
  const seeds = getBuiltInSeedTemplates();
  let inserted = 0;
  let updated = 0;

  for (const seed of seeds) {
    const existing = await templatesCollection.findOne(
      { name: seed.name, isBuiltIn: true },
      { projection: { _id: 1 } },
    );

    if (dryRun) {
      if (existing) updated += 1;
      else inserted += 1;
      console.log(`[migrate-templates-to-ejs] built-in ${existing ? 'update' : 'insert'} name=${seed.name}`);
      continue;
    }

    const result = await templatesCollection.updateOne(
      { name: seed.name, isBuiltIn: true },
      {
        $set: {
          ...seed,
          isBuiltIn: true,
          userId: null,
          templateEngine: 'ejs',
          migrationStatus: 'ready',
          updatedAt: new Date(),
        },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true },
    );
    inserted += result.upsertedCount || 0;
    updated += existing ? 1 : 0;
  }

  return { inserted, updated };
}

async function convertUserTemplates(templatesCollection) {
  const cursor = templatesCollection.find({ isBuiltIn: { $ne: true } });
  let convertedCount = 0;
  let readyCount = 0;
  let reviewCount = 0;

  while (await cursor.hasNext()) {
    const template = await cursor.next();
    const data = String(template.data || '');

    if (!hasLegacyTemplateSyntax(data)) {
      readyCount += 1;
      if (!dryRun && template.templateEngine !== 'ejs') {
        await templatesCollection.updateOne(
          { _id: template._id },
          {
            $set: {
              templateEngine: 'ejs',
              migrationStatus: 'ready',
              updatedAt: new Date(),
            },
          },
        );
      }
      continue;
    }

    const converted = convertLegacyTemplateToEjs(data);
    if (!conversionSucceeded(converted)) {
      reviewCount += 1;
      const reviewNote = '[EJS migration] Needs admin review; automatic conversion could not resolve all legacy tags.';
      console.log(`[migrate-templates-to-ejs] review template=${template._id} name=${template.name}`);
      if (!dryRun) {
        const currentNote = String(template.note || '');
        await templatesCollection.updateOne(
          { _id: template._id },
          {
            $set: {
              templateEngine: 'legacy',
              migrationStatus: 'needs_admin_review',
              note: currentNote.includes(reviewNote) ? currentNote : `${currentNote}\n${reviewNote}`.trim(),
              updatedAt: new Date(),
            },
          },
        );
      }
      continue;
    }

    convertedCount += 1;
    console.log(`[migrate-templates-to-ejs] convert template=${template._id} name=${template.name}`);
    if (!dryRun) {
      await templatesCollection.updateOne(
        { _id: template._id },
        {
          $set: {
            data: converted,
            templateEngine: 'ejs',
            migrationStatus: 'converted',
            updatedAt: new Date(),
          },
        },
      );
    }
  }

  return { converted: convertedCount, ready: readyCount, needsReview: reviewCount };
}

async function main() {
  console.log(`[migrate-templates-to-ejs] connect=${redactMongoUri(MONGO_URI)} mode=${dryRun ? 'dry-run' : 'commit'}`);
  await mongoose.connect(MONGO_URI);

  const templatesCollection = mongoose.connection.db.collection('templates');
  const builtIns = await upsertBuiltIns(templatesCollection);
  const userTemplates = await convertUserTemplates(templatesCollection);

  console.log(
    `[migrate-templates-to-ejs] done builtInInserted=${builtIns.inserted} builtInUpdated=${builtIns.updated} converted=${userTemplates.converted} ready=${userTemplates.ready} needsReview=${userTemplates.needsReview}`,
  );
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error('[migrate-templates-to-ejs] failed', error);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore disconnect errors
  }
  process.exit(1);
});
