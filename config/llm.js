module.exports = {
  CHAT_MODEL:     process.env.LLM_CHAT_MODEL     || 'gpt-4o-mini',
  GENERATE_MODEL: process.env.LLM_GENERATE_MODEL || 'gpt-4o',
  REFINE_MODEL:   process.env.LLM_REFINE_MODEL   || 'gpt-4o',
  PARSE_MODEL:    process.env.LLM_PARSE_MODEL    || 'gpt-4.1',
  JD_MODEL:       process.env.LLM_JD_MODEL       || 'gpt-4o-mini',
};
