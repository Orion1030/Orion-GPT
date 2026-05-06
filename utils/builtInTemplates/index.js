const { convertLegacyTemplateToEjs } = require('../templateSyntaxMigration');
const classicTemplate = require('./classic');
const modernTemplate = require('./modern');
const minimalTemplate = require('./minimal');
const compactTemplate = require('./compact');
const hybridTemplate = require('./hybrid');
const coverLetterClassicTemplate = require('./coverLetterClassic');
const coverLetterModernTemplate = require('./coverLetterModern');
const coverLetterCompactTemplate = require('./coverLetterCompact');

const SEED_TEMPLATES = [
  classicTemplate,
  modernTemplate,
  minimalTemplate,
  compactTemplate,
  hybridTemplate,
  coverLetterClassicTemplate,
  coverLetterModernTemplate,
  coverLetterCompactTemplate,
];

function getBuiltInSeedTemplates() {
  return SEED_TEMPLATES.map(template => ({
    ...template,
    templateType: template.templateType || 'resume',
    data: (template.templateType || 'resume') === 'resume'
      ? convertLegacyTemplateToEjs(template.data)
      : template.data,
    templateEngine: 'ejs',
    migrationStatus: 'ready',
  }));
}

module.exports = { getBuiltInSeedTemplates, SEED_TEMPLATES };
