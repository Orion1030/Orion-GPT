const SelectedEvidenceSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['selectedRoles', 'selectedSkills', 'gaps'],
  properties: {
    selectedRoles: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['companyName', 'roleTitle', 'relevanceReason', 'evidenceLines'],
        properties: {
          companyName: { type: 'string' },
          roleTitle: { type: 'string' },
          startDate: { type: 'string' },
          endDate: { type: 'string' },
          relevanceReason: { type: 'string' },
          evidenceLines: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      },
    },
    selectedSkills: {
      type: 'array',
      items: { type: 'string' },
    },
    gaps: {
      type: 'array',
      items: { type: 'string' },
    },
  },
}

module.exports = {
  SelectedEvidenceSchema,
}
