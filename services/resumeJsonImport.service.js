const RESUME_JSON_IMPORT_SCHEMA = {
  type: "object",
  additionalProperties: true,
  properties: {
    name: { type: "string", description: "Resume name or candidate name." },
    summary: { type: "string" },
    experiences: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: true,
        properties: {
          title: { type: "string" },
          companyName: { type: "string" },
          companyLocation: { type: "string" },
          summary: { type: "string" },
          descriptions: { type: "array", items: { type: "string" } },
          startDate: { type: "string" },
          endDate: { type: "string" },
        },
      },
    },
    skills: {
      oneOf: [
        { type: "array", items: { type: "string" } },
        {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              items: { type: "array", items: { type: "string" } },
            },
          },
        },
      ],
    },
    education: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: true,
        properties: {
          degreeLevel: { type: "string" },
          universityName: { type: "string" },
          major: { type: "string" },
          startDate: { type: "string" },
          endDate: { type: "string" },
        },
      },
    },
    profile: {
      type: "object",
      additionalProperties: true,
      properties: {
        fullName: { type: "string" },
        title: { type: "string" },
        mainStack: { type: "string" },
        link: { type: "string" },
        contactInfo: { type: "object" },
        careerHistory: { type: "array" },
        educations: { type: "array" },
      },
    },
  },
};

const KNOWN_TOP_LEVEL_KEYS = new Set([
  "candidate",
  "contactInfo",
  "education",
  "educations",
  "email",
  "experience",
  "experiences",
  "fullName",
  "linkedin",
  "link",
  "name",
  "phone",
  "profile",
  "professionalSummary",
  "skills",
  "summary",
  "workExperience",
]);

const SILENT_IGNORED_TOP_LEVEL_KEYS = new Set([
  "_id",
  "builtInTemplateId",
  "cloudPrimary",
  "cloudSecondary",
  "createdAt",
  "deletedAt",
  "deletedBy",
  "embedding",
  "id",
  "isDeleted",
  "note",
  "pageFrameConfig",
  "profileId",
  "source",
  "stackId",
  "templateId",
  "updatedAt",
  "userId",
]);

function stripJsonFences(text) {
  const trimmed = String(text || "").trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

function looksLikeJsonText(text) {
  const stripped = stripJsonFences(text);
  return /^[\[{]/.test(stripped);
}

function formatJsonParseMessage(error, text) {
  const message = error?.message || "Invalid JSON";
  const match = message.match(/position\s+(\d+)/i);
  if (!match) return `Invalid JSON: ${message}`;

  const position = Number(match[1]);
  if (!Number.isFinite(position) || position < 0) return `Invalid JSON: ${message}`;

  const before = String(text || "").slice(0, position);
  const line = before.split(/\r?\n/).length;
  const column = before.length - before.lastIndexOf("\n");
  return `Invalid JSON at line ${line}, column ${column}: ${message}`;
}

function isEmptyishString(value) {
  return /^(n\/a|na|none|null|undefined|unknown|not specified|-+)$/i.test(
    String(value || "").trim()
  );
}

function toCleanString(value) {
  if (value == null) return "";
  if (typeof value === "object") return "";
  const text = String(value).trim();
  return isEmptyishString(text) ? "" : text;
}

function pickString(source, keys) {
  if (!source || typeof source !== "object") return "";
  for (const key of keys) {
    const text = toCleanString(source[key]);
    if (text) return text;
  }
  return "";
}

function toStringList(value) {
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => toStringList(item))
      .map((item) => toCleanString(item))
      .filter(Boolean);
  }

  if (value && typeof value === "object") {
    if (Array.isArray(value.items)) return toStringList(value.items);
    if (Array.isArray(value.descriptions)) return toStringList(value.descriptions);
    if (Array.isArray(value.keyPoints)) return toStringList(value.keyPoints);
    return [];
  }

  const text = toCleanString(value);
  if (!text) return [];
  return text
    .split(/\r?\n|[•]/)
    .map((line) => line.replace(/^[\s\-*]+/, "").trim())
    .filter(Boolean);
}

function hasAnyValue(object) {
  if (!object || typeof object !== "object") return false;
  return Object.values(object).some((value) => {
    if (Array.isArray(value)) return value.length > 0;
    if (value && typeof value === "object") return hasAnyValue(value);
    return Boolean(toCleanString(value));
  });
}

function normalizeExperience(item) {
  if (typeof item === "string") {
    return {
      title: toCleanString(item),
      companyName: "",
      companyLocation: "",
      summary: "",
      descriptions: [],
      startDate: "",
      endDate: "",
    };
  }
  if (!item || typeof item !== "object") return null;

  const experience = {
    title: pickString(item, ["title", "roleTitle", "position", "jobTitle"]),
    companyName: pickString(item, ["companyName", "company", "employer"]),
    companyLocation: pickString(item, ["companyLocation", "location"]),
    summary: pickString(item, ["summary", "companySummary", "overview"]),
    descriptions: toStringList(
      item.descriptions ||
        item.bullets ||
        item.highlights ||
        item.keyPoints ||
        item.responsibilities
    ),
    startDate: pickString(item, ["startDate", "start", "from"]),
    endDate: pickString(item, ["endDate", "end", "to"]),
  };
  return hasAnyValue(experience) ? experience : null;
}

function normalizeExperiences(value) {
  const source = Array.isArray(value) ? value : value ? [value] : [];
  return source.map(normalizeExperience).filter(Boolean);
}

function normalizeEducationItem(item) {
  if (typeof item === "string") {
    return {
      degreeLevel: "",
      universityName: toCleanString(item),
      major: "",
      startDate: "",
      endDate: "",
    };
  }
  if (!item || typeof item !== "object") return null;

  const education = {
    degreeLevel: pickString(item, ["degreeLevel", "degree", "credential"]),
    universityName: pickString(item, [
      "universityName",
      "university",
      "school",
      "institution",
    ]),
    major: pickString(item, ["major", "field", "fieldOfStudy"]),
    startDate: pickString(item, ["startDate", "start", "from"]),
    endDate: pickString(item, ["endDate", "end", "to", "graduationDate"]),
  };
  return hasAnyValue(education) ? education : null;
}

function normalizeEducation(value) {
  const source = Array.isArray(value) ? value : value ? [value] : [];
  return source.map(normalizeEducationItem).filter(Boolean);
}

function normalizeSkills(value) {
  if (!value) return [];

  if (typeof value === "string") {
    const items = value
      .split(/,|\r?\n|[•]/)
      .map((item) => toCleanString(item))
      .filter(Boolean);
    return items.length ? [{ title: "Skills", items }] : [];
  }

  if (Array.isArray(value)) {
    const groups = [];
    const flat = [];
    value.forEach((item) => {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        const items = toStringList(item.items || item.skills || item.values);
        const title = pickString(item, ["title", "name", "category"]) || "Skills";
        if (items.length) groups.push({ title, items });
        return;
      }
      flat.push(...toStringList(item));
    });
    if (flat.length) groups.push({ title: "Skills", items: flat });
    return groups;
  }

  if (typeof value === "object") {
    return Object.entries(value)
      .map(([title, items]) => ({
        title: toCleanString(title) || "Skills",
        items: toStringList(items),
      }))
      .filter((group) => group.items.length > 0);
  }

  return [];
}

function normalizeContactInfo(...sources) {
  const contactInfo = {};
  for (const source of sources) {
    if (!source || typeof source !== "object") continue;
    const nested =
      source.contactInfo && typeof source.contactInfo === "object"
        ? source.contactInfo
        : {};
    contactInfo.email ||= pickString(source, ["email"]) || pickString(nested, ["email"]);
    contactInfo.phone ||= pickString(source, ["phone"]) || pickString(nested, ["phone"]);
    contactInfo.address ||=
      pickString(source, ["address"]) || pickString(nested, ["address"]);
    contactInfo.linkedin ||=
      pickString(source, ["linkedin"]) || pickString(nested, ["linkedin"]);
    contactInfo.website ||=
      pickString(source, ["website"]) || pickString(nested, ["website"]);
  }
  return contactInfo;
}

function normalizeProfile(source, candidate) {
  const profileSource =
    source?.profile && typeof source.profile === "object" ? source.profile : {};
  const candidateSource = candidate && typeof candidate === "object" ? candidate : {};
  const contactInfo = normalizeContactInfo(source, profileSource, candidateSource);
  const careerHistory = normalizeExperiences(
    profileSource.careerHistory || candidateSource.careerHistory
  ).map((experience) => ({
    companyName: experience.companyName,
    roleTitle: experience.title,
    startDate: experience.startDate,
    endDate: experience.endDate,
    companySummary: experience.summary,
    keyPoints: experience.descriptions,
  }));
  const educations = normalizeEducation(
    profileSource.educations ||
      profileSource.education ||
      candidateSource.educations ||
      candidateSource.education
  );

  const profile = {
    fullName:
      pickString(profileSource, ["fullName", "name"]) ||
      pickString(candidateSource, ["fullName", "name"]) ||
      pickString(source, ["fullName"]),
    title:
      pickString(profileSource, ["title"]) ||
      pickString(candidateSource, ["title"]),
    mainStack:
      pickString(profileSource, ["mainStack"]) ||
      pickString(candidateSource, ["mainStack"]),
    link:
      pickString(profileSource, ["link", "website", "linkedin"]) ||
      pickString(candidateSource, ["link", "website", "linkedin"]),
    contactInfo,
    careerHistory,
    educations,
  };

  return hasAnyValue(profile) ? profile : null;
}

function unwrapResumeJsonPayload(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  if (raw.resume && typeof raw.resume === "object" && !Array.isArray(raw.resume)) {
    return raw.resume;
  }
  if (raw.parsed && typeof raw.parsed === "object" && !Array.isArray(raw.parsed)) {
    return raw.parsed;
  }
  if (
    raw.data &&
    typeof raw.data === "object" &&
    !Array.isArray(raw.data) &&
    raw.data.resume &&
    typeof raw.data.resume === "object"
  ) {
    return raw.data.resume;
  }
  return raw;
}

function getIgnoredTopLevelFields(source) {
  if (!source || typeof source !== "object" || Array.isArray(source)) return [];
  return Object.keys(source).filter(
    (key) =>
      !KNOWN_TOP_LEVEL_KEYS.has(key) && !SILENT_IGNORED_TOP_LEVEL_KEYS.has(key)
  );
}

function buildIgnoredFieldsWarning(fields) {
  if (!fields.length) return null;
  const visible = fields.slice(0, 8).join(", ");
  const suffix = fields.length > 8 ? `, and ${fields.length - 8} more` : "";
  return `Ignored unsupported JSON fields: ${visible}${suffix}.`;
}

function normalizeResumeJsonObject(source) {
  const candidate =
    source?.candidate && typeof source.candidate === "object" ? source.candidate : null;
  const profile = normalizeProfile(source, candidate);
  const experiences = normalizeExperiences(
    source.experiences || source.experience || source.workExperience
  );
  const education = normalizeEducation(source.education || source.educations);
  const skills = normalizeSkills(source.skills);
  const parsed = {
    name:
      pickString(source, ["name", "fullName"]) ||
      pickString(candidate, ["name", "fullName"]) ||
      profile?.fullName ||
      "Parsed Resume",
    summary: pickString(source, ["summary", "professionalSummary"]),
    experiences,
    skills,
    education,
  };

  if (profile) parsed.profile = profile;

  const recognized =
    Boolean(parsed.name && parsed.name !== "Parsed Resume") ||
    Boolean(parsed.summary) ||
    experiences.length > 0 ||
    skills.length > 0 ||
    education.length > 0 ||
    Boolean(profile);
  const ignoredFields = getIgnoredTopLevelFields(source);
  const warnings = [buildIgnoredFieldsWarning(ignoredFields)].filter(Boolean);

  return { parsed, warnings, recognized };
}

function parseResumeJsonText(text) {
  const normalizedText = stripJsonFences(text);
  if (!looksLikeJsonText(normalizedText)) {
    return { result: null, error: null, isJson: false };
  }

  let raw;
  try {
    raw = JSON.parse(normalizedText);
  } catch (error) {
    return {
      result: null,
      error: {
        message: formatJsonParseMessage(error, normalizedText),
        statusCode: 400,
        schema: RESUME_JSON_IMPORT_SCHEMA,
      },
      isJson: true,
    };
  }

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      result: null,
      error: {
        message: "Resume JSON must be a single object.",
        statusCode: 400,
        schema: RESUME_JSON_IMPORT_SCHEMA,
      },
      isJson: true,
    };
  }

  const source = unwrapResumeJsonPayload(raw);
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return {
      result: null,
      error: {
        message: "Resume JSON must contain a resume object.",
        statusCode: 400,
        schema: RESUME_JSON_IMPORT_SCHEMA,
      },
      isJson: true,
    };
  }

  const normalized = normalizeResumeJsonObject(source);
  if (!normalized.recognized) {
    return {
      result: null,
      error: {
        message: "JSON does not match the supported resume import schema.",
        statusCode: 422,
        schema: RESUME_JSON_IMPORT_SCHEMA,
      },
      isJson: true,
    };
  }

  return {
    result: {
      parsed: normalized.parsed,
      warnings: normalized.warnings,
      schema: RESUME_JSON_IMPORT_SCHEMA,
      source: "json",
    },
    error: null,
    isJson: true,
  };
}

module.exports = {
  RESUME_JSON_IMPORT_SCHEMA,
  looksLikeJsonText,
  parseResumeJsonText,
};
