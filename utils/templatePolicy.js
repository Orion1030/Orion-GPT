const { isAdminUser } = require('./access');

const EJS_TAG_RE = /<%[\s\S]*?%>/;

function containsEjsTags(value) {
  return EJS_TAG_RE.test(String(value || ''));
}

function validateTemplateWrite({ data }, user) {
  if (!isAdminUser(user) && containsEjsTags(data)) {
    return {
      ok: false,
      statusCode: 403,
      message: 'Only Admin can save EJS templates',
    };
  }

  return { ok: true };
}

module.exports = {
  containsEjsTags,
  validateTemplateWrite,
};
