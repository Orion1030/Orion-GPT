const MONTH_NAME_TO_NUMBER = {
  jan: "01",
  january: "01",
  feb: "02",
  february: "02",
  mar: "03",
  march: "03",
  apr: "04",
  april: "04",
  may: "05",
  jun: "06",
  june: "06",
  jul: "07",
  july: "07",
  aug: "08",
  august: "08",
  sep: "09",
  sept: "09",
  september: "09",
  oct: "10",
  october: "10",
  nov: "11",
  november: "11",
  dec: "12",
  december: "12",
};

const MONTH_TOKEN_SOURCE =
  "(?:jan(?:uary)?\\.?|feb(?:ruary)?\\.?|mar(?:ch)?\\.?|apr(?:il)?\\.?|may\\.?|jun(?:e)?\\.?|jul(?:y)?\\.?|aug(?:ust)?\\.?|sep(?:t(?:ember)?)?\\.?|oct(?:ober)?\\.?|nov(?:ember)?\\.?|dec(?:ember)?\\.?)";
const YEAR_SOURCE = "(?:19|20)\\d{2}";
const YEAR_MONTH_SOURCE = `${YEAR_SOURCE}[/-](?:0?[1-9]|1[0-2])`;
const YEAR_MONTH_DAY_SOURCE =
  `${YEAR_SOURCE}[/-](?:0?[1-9]|1[0-2])[/-](?:0?[1-9]|[12]\\d|3[01])`;
const MONTH_YEAR_SOURCE = `(?:0?[1-9]|1[0-2])[/-]${YEAR_SOURCE}`;
const MONTH_DAY_YEAR_SOURCE =
  `(?:0?[1-9]|1[0-2])[/-](?:0?[1-9]|[12]\\d|3[01])[/-]${YEAR_SOURCE}`;
const MONTH_NAME_YEAR_SOURCE = `${MONTH_TOKEN_SOURCE}\\s+${YEAR_SOURCE}`;
const MONTH_NAME_DAY_YEAR_SOURCE =
  `${MONTH_TOKEN_SOURCE}\\s+\\d{1,2},?\\s+${YEAR_SOURCE}`;
const OPEN_ENDED_DATE_SOURCE = "(?:present|current|ongoing|now)";
const DATE_VALUE_SOURCE = [
  MONTH_NAME_DAY_YEAR_SOURCE,
  MONTH_NAME_YEAR_SOURCE,
  MONTH_DAY_YEAR_SOURCE,
  YEAR_MONTH_DAY_SOURCE,
  MONTH_YEAR_SOURCE,
  YEAR_MONTH_SOURCE,
  OPEN_ENDED_DATE_SOURCE,
  YEAR_SOURCE,
].join("|");

const NORMALIZED_IMPORTED_DATE_PATTERN =
  /^(Present|\d{4}|\d{4}-(0[1-9]|1[0-2])|\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01]))$/i;
const OPEN_ENDED_DATE_PATTERN = /^(present|current|ongoing|now)$/i;
const MONTH_NAME_DAY_YEAR_PATTERN = new RegExp(
  `^(${MONTH_TOKEN_SOURCE})\\s+(\\d{1,2}),?\\s+(${YEAR_SOURCE})$`,
  "i"
);
const MONTH_NAME_YEAR_PATTERN = new RegExp(
  `^(${MONTH_TOKEN_SOURCE})\\s+(${YEAR_SOURCE})$`,
  "i"
);
const DATE_TOKEN_PATTERN = new RegExp(`\\b(?:${DATE_VALUE_SOURCE})\\b`, "gi");
const DATE_RANGE_SEPARATOR_SOURCE = "(?:-|-|—|to)";
const DATE_RANGE_TAIL_PATTERNS = [
  new RegExp(
    String.raw`\s*\|\s*(?:${DATE_VALUE_SOURCE})\s*${DATE_RANGE_SEPARATOR_SOURCE}\s*(?:${DATE_VALUE_SOURCE})\s*$`,
    "i"
  ),
  new RegExp(
    String.raw`\s*\(\s*(?:${DATE_VALUE_SOURCE})\s*${DATE_RANGE_SEPARATOR_SOURCE}\s*(?:${DATE_VALUE_SOURCE})\s*\)\s*$`,
    "i"
  ),
  new RegExp(
    String.raw`\s*\[\s*(?:${DATE_VALUE_SOURCE})\s*${DATE_RANGE_SEPARATOR_SOURCE}\s*(?:${DATE_VALUE_SOURCE})\s*\]\s*$`,
    "i"
  ),
  new RegExp(
    String.raw`\s+(?:${DATE_VALUE_SOURCE})\s*${DATE_RANGE_SEPARATOR_SOURCE}\s*(?:${DATE_VALUE_SOURCE})\s*$`,
    "i"
  ),
];

function toText(value) {
  if (value == null) return "";
  return String(value).trim();
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function toFlexibleDateSortValue(value, bound) {
  const normalized = normalizeImportedDateValue(value);
  if (!normalized) return null;
  if (OPEN_ENDED_DATE_PATTERN.test(normalized)) {
    return Date.UTC(9999, 11, 31);
  }

  const parts = normalized.split("-");
  const year = Number(parts[0]);
  if (Number.isNaN(year)) return null;

  if (parts.length === 1) {
    const month = bound === "start" ? 1 : 12;
    const day = bound === "start" ? 1 : 31;
    return Date.UTC(year, month - 1, day);
  }

  const month = Number(parts[1]);
  if (Number.isNaN(month) || month < 1 || month > 12) return null;

  if (parts.length === 2) {
    const day = bound === "start" ? 1 : getDaysInMonth(year, month);
    return Date.UTC(year, month - 1, day);
  }

  const day = Number(parts[2]);
  if (Number.isNaN(day) || day < 1 || day > getDaysInMonth(year, month)) {
    return null;
  }
  return Date.UTC(year, month - 1, day);
}

function normalizeMonthKey(raw) {
  return String(raw || "").toLowerCase().replace(/\./g, "");
}

function buildNormalizedDate(year, month, day) {
  const normalizedYear = Number(year);
  if (Number.isNaN(normalizedYear)) return "";

  if (!month) return String(normalizedYear);

  const normalizedMonth = Number(month);
  if (
    Number.isNaN(normalizedMonth) ||
    normalizedMonth < 1 ||
    normalizedMonth > 12
  ) {
    return "";
  }

  if (!day) {
    return `${normalizedYear}-${pad(normalizedMonth)}`;
  }

  const normalizedDay = Number(day);
  if (Number.isNaN(normalizedDay) || normalizedDay < 1) return "";
  if (normalizedDay > getDaysInMonth(normalizedYear, normalizedMonth)) {
    return "";
  }

  return `${normalizedYear}-${pad(normalizedMonth)}-${pad(normalizedDay)}`;
}

function normalizeDetectedDateToken(value) {
  const raw = toText(value)
    .replace(/[()[\]]/g, " ")
    .replace(/\s+/g, " ");
  if (!raw) return "";

  if (OPEN_ENDED_DATE_PATTERN.test(raw)) return "Present";
  if (NORMALIZED_IMPORTED_DATE_PATTERN.test(raw)) {
    return /^present$/i.test(raw) ? "Present" : raw;
  }

  const monthDayYearMatch = raw.match(MONTH_NAME_DAY_YEAR_PATTERN);
  if (monthDayYearMatch) {
    const month = MONTH_NAME_TO_NUMBER[normalizeMonthKey(monthDayYearMatch[1])];
    return month
      ? buildNormalizedDate(monthDayYearMatch[3], month, monthDayYearMatch[2])
      : "";
  }

  const monthYearMatch = raw.match(MONTH_NAME_YEAR_PATTERN);
  if (monthYearMatch) {
    const month = MONTH_NAME_TO_NUMBER[normalizeMonthKey(monthYearMatch[1])];
    return month ? buildNormalizedDate(monthYearMatch[2], month) : "";
  }

  let numericMatch = raw.match(
    new RegExp(`^(${YEAR_SOURCE})[./-](\\d{1,2})[./-](\\d{1,2})$`)
  );
  if (numericMatch) {
    return buildNormalizedDate(
      numericMatch[1],
      numericMatch[2],
      numericMatch[3]
    );
  }

  numericMatch = raw.match(
    new RegExp(`^(\\d{1,2})[./-](\\d{1,2})[./-](${YEAR_SOURCE})$`)
  );
  if (numericMatch) {
    return buildNormalizedDate(
      numericMatch[3],
      numericMatch[1],
      numericMatch[2]
    );
  }

  numericMatch = raw.match(new RegExp(`^(${YEAR_SOURCE})[./-](\\d{1,2})$`));
  if (numericMatch) {
    return buildNormalizedDate(numericMatch[1], numericMatch[2]);
  }

  numericMatch = raw.match(new RegExp(`^(\\d{1,2})[./-](${YEAR_SOURCE})$`));
  if (numericMatch) {
    return buildNormalizedDate(numericMatch[2], numericMatch[1]);
  }

  numericMatch = raw.match(new RegExp(`^(${YEAR_SOURCE})$`));
  if (numericMatch) {
    return buildNormalizedDate(numericMatch[1]);
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime()) && new RegExp(YEAR_SOURCE).test(raw)) {
    return buildNormalizedDate(
      parsed.getUTCFullYear(),
      parsed.getUTCMonth() + 1,
      parsed.getUTCDate()
    );
  }

  return "";
}

function extractNormalizedDateTokens(value) {
  const raw = toText(value)
    .replace(/[-—]/g, " ")
    .replace(/\s+/g, " ");
  if (!raw) return [];

  const matches = raw.match(DATE_TOKEN_PATTERN) || [];
  const normalized = matches
    .map((token) => normalizeDetectedDateToken(token))
    .filter(Boolean);

  return normalized.filter(
    (token, index) =>
      normalized.findIndex(
        (candidate) => candidate.toLowerCase() === token.toLowerCase()
      ) === index
  );
}

function normalizeImportedDateValue(value) {
  const raw = toText(value).replace(/\s+/g, " ");
  if (!raw) return "";
  const normalized = normalizeDetectedDateToken(raw);
  if (normalized) return normalized;

  const tokens = extractNormalizedDateTokens(raw);
  return tokens.length === 1 ? tokens[0] : "";
}

function normalizeImportedDateRange(startValue, endValue, contextValues = []) {
  let startDate = normalizeImportedDateValue(startValue);
  let endDate = normalizeImportedDateValue(endValue);

  const extractedTokens = [];
  for (const candidate of [startValue, endValue, ...(Array.isArray(contextValues) ? contextValues : [])]) {
    for (const token of extractNormalizedDateTokens(candidate)) {
      if (
        extractedTokens.some(
          (existing) => existing.toLowerCase() === token.toLowerCase()
        )
      ) {
        continue;
      }
      extractedTokens.push(token);
    }
  }

  if (!startDate && extractedTokens[0]) {
    startDate = extractedTokens[0];
  }

  if (!endDate) {
    endDate =
      extractedTokens.find(
        (token) => !startDate || token.toLowerCase() !== startDate.toLowerCase()
      ) || "";
  }

  return { startDate, endDate };
}

function compareFlexibleDateValuesDesc(left, right, bound = "end") {
  const leftValue = toFlexibleDateSortValue(left, bound);
  const rightValue = toFlexibleDateSortValue(right, bound);

  if (leftValue == null && rightValue == null) return 0;
  if (leftValue == null) return 1;
  if (rightValue == null) return -1;
  return rightValue - leftValue;
}

function sortCareerHistoryMostRecentFirst(items) {
  return (Array.isArray(items) ? items : [])
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      const endCompare = compareFlexibleDateValuesDesc(
        left.item?.endDate,
        right.item?.endDate,
        "end"
      );
      if (endCompare !== 0) return endCompare;

      const startCompare = compareFlexibleDateValuesDesc(
        left.item?.startDate,
        right.item?.startDate,
        "start"
      );
      if (startCompare !== 0) return startCompare;

      return left.index - right.index;
    })
    .map(({ item }) => item);
}

function stripTrailingImportedDateRange(value) {
  const raw = toText(value).replace(/\s+/g, " ");
  if (!raw) return "";

  const cleaned = DATE_RANGE_TAIL_PATTERNS.reduce(
    (current, pattern) => current.replace(pattern, ""),
    raw
  )
    .replace(/\s*(?:\||,|-|-|—)\s*$/, "")
    .trim();

  return cleaned || raw;
}

module.exports = {
  compareFlexibleDateValuesDesc,
  extractNormalizedDateTokens,
  normalizeImportedDateValue,
  normalizeImportedDateRange,
  sortCareerHistoryMostRecentFirst,
  stripTrailingImportedDateRange,
};
