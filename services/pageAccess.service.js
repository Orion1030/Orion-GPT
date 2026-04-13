const { PageAccessModel } = require("../dbModels");
const {
  getPageAccessKeys,
  getPageNameByKey,
  getDefaultAllowedRoles,
  normalizeAllowedRoles,
  toRoleLabel,
} = require("../utils/pageAccess");

async function ensureRuleForPage(pageKey) {
  const pageName = getPageNameByKey(pageKey);
  const defaultAllowedRoles = getDefaultAllowedRoles(pageKey);

  return PageAccessModel.findOneAndUpdate(
    { pageKey },
    {
      $setOnInsert: {
        pageKey,
        pageName,
        allowedRoles: defaultAllowedRoles,
      },
    },
    { upsert: true, returnDocument: "after" }
  );
}

function toPageAccessDto(rule, pageKey) {
  const normalizedKey = String(pageKey || rule?.pageKey || "");
  const allowedRoles = normalizeAllowedRoles(
    rule?.allowedRoles,
    { includeAdmin: true }
  );

  return {
    pageKey: normalizedKey,
    pageName: getPageNameByKey(normalizedKey),
    allowedRoles,
    allowedRoleLabels: allowedRoles.map(toRoleLabel),
    updatedAt: rule?.updatedAt || null,
  };
}

async function listPageAccessRules() {
  const pageKeys = getPageAccessKeys();

  await Promise.all(
    pageKeys.map((pageKey) => {
      const pageName = getPageNameByKey(pageKey);
      const defaultAllowedRoles = getDefaultAllowedRoles(pageKey);
      return PageAccessModel.updateOne(
        { pageKey },
        {
          $setOnInsert: {
            pageKey,
            pageName,
            allowedRoles: defaultAllowedRoles,
          },
        },
        { upsert: true }
      );
    })
  );

  const docs = await PageAccessModel.find({
    pageKey: { $in: pageKeys },
  })
    .select("pageKey pageName allowedRoles updatedAt")
    .lean();

  const byPageKey = new Map(docs.map((doc) => [String(doc.pageKey), doc]));
  return pageKeys.map((pageKey) => toPageAccessDto(byPageKey.get(pageKey), pageKey));
}

async function updatePageAccessRule(pageKey, allowedRoles, updatedBy = null) {
  const normalizedRoles = normalizeAllowedRoles(allowedRoles, {
    includeAdmin: true,
  });

  const updated = await PageAccessModel.findOneAndUpdate(
    { pageKey },
    {
      $set: {
        pageName: getPageNameByKey(pageKey),
        allowedRoles: normalizedRoles,
        updatedBy: updatedBy || null,
      },
      $setOnInsert: {
        pageKey,
      },
    },
    { upsert: true, returnDocument: "after" }
  );

  return toPageAccessDto(updated, pageKey);
}

async function getAllowedRolesForPage(pageKey) {
  const rule = await ensureRuleForPage(pageKey);
  return normalizeAllowedRoles(rule?.allowedRoles, { includeAdmin: true });
}

module.exports = {
  listPageAccessRules,
  updatePageAccessRule,
  getAllowedRolesForPage,
};
