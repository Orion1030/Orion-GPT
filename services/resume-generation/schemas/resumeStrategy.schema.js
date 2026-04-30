const ResumeStrategySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['targetTitle', 'summaryFocus', 'skillPriorities', 'experiencePlan', 'notes'],
  properties: {
    targetTitle: { type: 'string' },
    summaryFocus: {
      type: 'array',
      items: { type: 'string' },
    },
    skillPriorities: {
      type: 'array',
      items: { type: 'string' },
    },
    experiencePlan: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['companyName', 'roleTitle', 'emphasis'],
        properties: {
          companyName: { type: 'string' },
          roleTitle: { type: 'string' },
          startDate: { type: 'string' },
          endDate: { type: 'string' },
          emphasis: {
            type: 'array',
            items: { type: 'string' },
          },
          keepEvidence: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      },
    },
    notes: {
      type: 'array',
      items: { type: 'string' },
    },
  },
}

module.exports = {
  ResumeStrategySchema,
}
