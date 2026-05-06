/**
 * Unified JSON schema for LLM resume operations
 * Used by both parsing and generation services
 */

const resumeSchema = {
  type: "object",
  properties: {
    name: { type: "string" },
    summary: { type: "string" },
    experiences: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          companyName: { type: "string" },
          companyLocation: { type: "string" },
          bullets: { type: "array", items: { type: "string" } },
          startDate: { type: "string" },
          endDate: { type: "string" },
        },
        required: ["title", "companyName", "bullets", "startDate", "endDate"],
      },
    },
    skills: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          items: { type: "array", items: { type: "string" } },
        },
        required: ["title", "items"],
      },
    },
    education: {
      type: "array",
      items: {
        type: "object",
        properties: {
          degreeLevel: { type: "string" },
          universityName: { type: "string" },
          major: { type: "string" },
          startDate: { type: "string" },
          endDate: { type: "string" },
        },
        required: ["degreeLevel", "universityName", "startDate", "endDate"],
      },
    },
  },
  required: ["name", "summary", "experiences", "skills", "education"],
};

const coverLetterSchema = {
  type: "object",
  properties: {
    title: { type: "string" },
    recipient: { type: "string" },
    companyName: { type: "string" },
    jobTitle: { type: "string" },
    opening: { type: "string" },
    bodyParagraphs: {
      type: "array",
      items: { type: "string" },
    },
    closing: { type: "string" },
    signature: { type: "string" },
  },
  required: [
    "title",
    "recipient",
    "companyName",
    "jobTitle",
    "opening",
    "bodyParagraphs",
    "closing",
    "signature",
  ],
};

const applicationMaterialsSchema = {
  type: "object",
  properties: {
    resume: resumeSchema,
    coverLetter: coverLetterSchema,
  },
  required: ["resume", "coverLetter"],
};

module.exports = {
  resumeSchema,
  coverLetterSchema,
  applicationMaterialsSchema,
  // Aliases for backward compatibility
  resumeOutputSchema: resumeSchema,
  resumeParseSchema: resumeSchema,
};
