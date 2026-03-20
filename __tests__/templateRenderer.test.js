/**
 * Unit tests for templateRenderer.js
 * High priority — pure functions with complex logic
 */
const {
  escapeHtml,
  formatDate,
  getConfig,
  getMargins,
  MARGIN_PRESETS,
  DEFAULT_CONFIG,
} = require('../utils/templateRenderer');

describe('escapeHtml', () => {
  test('escapes < > &', () => {
    expect(escapeHtml('<b>&test</b>')).toBe('&lt;b&gt;&amp;test&lt;/b&gt;');
  });

  test('escapes double quotes', () => {
    expect(escapeHtml('"hello"')).toBe('&quot;hello&quot;');
  });

  test('converts null/undefined to string', () => {
    // The implementation does String(text), so null → "null"
    expect(escapeHtml(null)).toBe('null');
    expect(escapeHtml(undefined)).toBe('undefined');
  });

  test('passes through safe strings unchanged', () => {
    expect(escapeHtml('Hello World')).toBe('Hello World');
  });

  test('passes through empty string', () => {
    expect(escapeHtml('')).toBe('');
  });
});

describe('formatDate', () => {
  test('returns empty string for null/undefined/empty', () => {
    expect(formatDate(null)).toBe('');
    expect(formatDate(undefined)).toBe('');
    expect(formatDate('')).toBe('');
  });

  test('formats a valid date string to Mon YYYY format', () => {
    // Use a mid-year date to avoid timezone edge cases at month boundaries
    const result = formatDate('2023-07-15');
    expect(result).toMatch(/Jul.+2023/i);
  });

  test('returns original string for unparseable values', () => {
    expect(formatDate('not-a-real-date-xyz')).toBe('not-a-real-date-xyz');
  });
});

describe('getConfig', () => {
  test('returns DEFAULT_CONFIG when no pageFrameConfig provided', () => {
    const config = getConfig({});
    expect(config).toEqual(DEFAULT_CONFIG);
  });

  test('merges pageFrameConfig over defaults', () => {
    const config = getConfig({ pageFrameConfig: { fontSize: 14 } });
    expect(config.fontSize).toBe(14);
    // Other defaults still present
    expect(config.fontFamily).toBeDefined();
  });
});

describe('getMargins', () => {
  test('returns standard margins for "standard" preset', () => {
    const m = getMargins({ marginPreset: 'standard' });
    expect(m).toEqual(MARGIN_PRESETS.standard);
  });

  test('returns compact margins which are smaller than standard', () => {
    const m = getMargins({ marginPreset: 'compact' });
    expect(m.top).toBeLessThan(MARGIN_PRESETS.standard.top);
  });

  test('falls back to standard for unknown preset', () => {
    const m = getMargins({ marginPreset: 'bogus' });
    expect(m).toEqual(MARGIN_PRESETS.standard);
  });
});
