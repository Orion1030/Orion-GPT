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
          summary: { type: "string" },
          descriptions: { type: "array", items: { type: "string" } },
          startDate: { type: "string" },
          endDate: { type: "string" },
        },
        required: ["title", "companyName", "descriptions", "startDate", "endDate"],
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
      items: { type: "string" },
    },
  },
  required: ["name", "summary", "experiences", "skills"],
};

module.exports = {
  resumeSchema,
  // Aliases for backward compatibility
  resumeOutputSchema: resumeSchema,
  resumeParseSchema: resumeSchema,
};