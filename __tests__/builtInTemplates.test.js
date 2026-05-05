const { getBuiltInSeedTemplates } = require('../utils/builtInTemplates');

describe('built-in templates', () => {
  test('built-in templates are emitted as EJS templates', () => {
    const templates = getBuiltInSeedTemplates();

    expect(templates.length).toBeGreaterThan(0);
    for (const template of templates) {
      expect(template.templateEngine).toBe('ejs');
      expect(template.data).toContain('<%');
      expect(template.data).not.toContain('{{');
    }
  });
});
