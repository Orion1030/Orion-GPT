const { containsEjsTags, validateTemplateWrite } = require('../utils/templatePolicy');
const { RoleLevels } = require('../utils/constants');

describe('template policy', () => {
  test('detects EJS tags', () => {
    expect(containsEjsTags('<h1><%= fullName %></h1>')).toBe(true);
    expect(containsEjsTags('<h1>Static HTML</h1>')).toBe(false);
  });

  test('rejects non-admin saves containing EJS tags', () => {
    const result = validateTemplateWrite(
      { data: '<h1><%= fullName %></h1>' },
      { role: RoleLevels.User },
    );

    expect(result.ok).toBe(false);
    expect(result.statusCode).toBe(403);
  });

  test('allows admin saves containing EJS tags', () => {
    const result = validateTemplateWrite(
      { data: '<h1><%= fullName %></h1>' },
      { role: RoleLevels.ADMIN },
    );

    expect(result.ok).toBe(true);
  });
});
