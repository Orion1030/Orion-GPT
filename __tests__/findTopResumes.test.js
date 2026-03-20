/**
 * Unit tests for findTopResumes scoring logic.
 * Tests pure scoring computations without DB calls.
 */

// --- Pure helpers extracted for testability ---

function quantifiedImpactScore(text) {
  const matches = text.match(/\d+[%x×]?|\d+\.\d+|\$\d+/gi);
  return Math.min(100, (matches ? matches.length : 0) * 5);
}

function recencyScore(experiences, currentYear = new Date().getFullYear()) {
  if (!experiences || experiences.length === 0) return 50;
  let best = 0;
  experiences.forEach((e) => {
    const end = e.endDate || e.startDate || '';
    const year = parseInt(String(end).slice(0, 4), 10);
    if (!isNaN(year)) best = Math.max(best, year);
  });
  if (best === 0) return 50;
  const yearsAgo = currentYear - best;
  return Math.max(0, Math.min(100, 100 - yearsAgo * 10));
}

function computeAtsBase(skillMatch, keywordMatch) {
  return Math.min(100, skillMatch * 0.5 + keywordMatch * 0.5 + 20);
}

// --- Tests ---

describe('quantifiedImpactScore', () => {
  test('returns 0 for empty text', () => {
    expect(quantifiedImpactScore('')).toBe(0);
  });

  test('counts numbers / percentages / dollar values', () => {
    const text = 'Increased revenue by 30%, saved $50,000, improved 2.5x speed, 10 team members';
    const score = quantifiedImpactScore(text);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  test('caps at 100', () => {
    // 21+ numbers would exceed cap
    const text = Array.from({ length: 30 }, (_, i) => `${i + 1}%`).join(' ');
    expect(quantifiedImpactScore(text)).toBe(100);
  });
});

describe('recencyScore', () => {
  const CURRENT_YEAR = 2026;

  test('returns 50 for empty experience array', () => {
    expect(recencyScore([], CURRENT_YEAR)).toBe(50);
    expect(recencyScore(null, CURRENT_YEAR)).toBe(50);
  });

  test('returns 100 for current year experience', () => {
    expect(recencyScore([{ endDate: '2026-01-01' }], CURRENT_YEAR)).toBe(100);
  });

  test('decreases by 10 per year old', () => {
    expect(recencyScore([{ endDate: '2024-01-01' }], CURRENT_YEAR)).toBe(80);
    expect(recencyScore([{ endDate: '2021-01-01' }], CURRENT_YEAR)).toBe(50);
  });

  test('clamps to 0 for very old experience', () => {
    expect(recencyScore([{ endDate: '2000-01-01' }], CURRENT_YEAR)).toBe(0);
  });

  test('uses latest experience among multiple', () => {
    const exps = [
      { endDate: '2015-01-01' },
      { endDate: '2024-01-01' },
      { endDate: '2020-01-01' },
    ];
    expect(recencyScore(exps, CURRENT_YEAR)).toBe(80);
  });

  test('falls back to startDate when endDate missing', () => {
    expect(recencyScore([{ startDate: '2025-01-01' }], CURRENT_YEAR)).toBe(90);
  });
});

describe('computeAtsBase', () => {
  test('adds 20 base score', () => {
    expect(computeAtsBase(0, 0)).toBe(20);
  });

  test('perfect skill and keyword match gives 100 score before cap', () => {
    expect(computeAtsBase(100, 100)).toBe(100);
  });

  test('caps at 100', () => {
    expect(computeAtsBase(100, 100)).toBeLessThanOrEqual(100);
  });

  test('partial match returns proportional score', () => {
    const score = computeAtsBase(50, 50);
    expect(score).toBe(70);
  });
});
