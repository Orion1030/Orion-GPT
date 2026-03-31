module.exports = {
  CHAT_MODEL:     process.env.LLM_CHAT_MODEL     || 'gpt-4o-mini',
  // Use a reasoning model by default for resume generation to maximize factual alignment and schema compliance.
  GENERATE_MODEL: process.env.LLM_GENERATE_MODEL || 'o4-mini',
  GENERATE_MAX_TOKENS: parseInt(process.env.LLM_GENERATE_MAX_TOKENS || '3000', 10),
  REFINE_MODEL:   process.env.LLM_REFINE_MODEL   || 'gpt-4o',
  PARSE_MODEL:    process.env.LLM_PARSE_MODEL    || 'gpt-4.1',
  JD_MODEL:       process.env.LLM_JD_MODEL       || 'gpt-4o-mini',
};
