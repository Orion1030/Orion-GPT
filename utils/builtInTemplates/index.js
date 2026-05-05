const { convertLegacyTemplateToEjs } = require('../templateSyntaxMigration');
const classicTemplate = require('./classic');
const modernTemplate = require('./modern');
const minimalTemplate = require('./minimal');
const compactTemplate = require('./compact');
const hybridTemplate = require('./hybrid');

const SEED_TEMPLATES = [
  classicTemplate,
  modernTemplate,
  minimalTemplate,
  compactTemplate,
  hybridTemplate,
];

function getBuiltInSeedTemplates() {
  return SEED_TEMPLATES.map(template => ({
    ...template,
    data: convertLegacyTemplateToEjs(template.data),
    templateEngine: 'ejs',
    migrationStatus: 'ready',
  }));
}

module.exports = { getBuiltInSeedTemplates, SEED_TEMPLATES };
