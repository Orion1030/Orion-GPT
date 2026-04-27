const { RoleLevels } = require("./constants");

const PAGE_ACCESS_KEYS = {
  DASHBOARD: "dashboard",
  AICHAT: "aiChat",
  APPLICATIONS: "applications",
  PROFILES: "profiles",
  RESUMES: "resumes",
  TEMPLATES: "templates",
  WHITELIST: "whitelist",
  BLACKLIST: "blacklist",
  REPORTS: "reports",
  ACCOUNT: "account",
};

const PAGE_ACCESS_META = {
  [PAGE_ACCESS_KEYS.DASHBOARD]: { pageName: "Dashboard" },
  [PAGE_ACCESS_KEYS.AICHAT]: { pageName: "AI Chat" },
  [PAGE_ACCESS_KEYS.APPLICATIONS]: { pageName: "Applications" },
  [PAGE_ACCESS_KEYS.PROFILES]: { pageName: "Profiles" },
  [PAGE_ACCESS_KEYS.RESUMES]: { pageName: "Resumes" },
  [PAGE_ACCESS_KEYS.TEMPLATES]: { pageName: "Templates" },
  [PAGE_ACCESS_KEYS.WHITELIST]: { pageName: "Whitelist" },
  [PAGE_ACCESS_KEYS.BLACKLIST]: { pageName: "Blacklist" },
  [PAGE_ACCESS_KEYS.REPORTS]: { pageName: "Team Reports" },
  [PAGE_ACCESS_KEYS.ACCOUNT]: { pageName: "Account" },
};

const PAGE_ACCESS_ORDER = [
  PAGE_ACCESS_KEYS.DASHBOARD,
  PAGE_ACCESS_KEYS.AICHAT,
  PAGE_ACCESS_KEYS.APPLICATIONS,
  PAGE_ACCESS_KEYS.PROFILES,
  PAGE_ACCESS_KEYS.RESUMES,
  PAGE_ACCESS_KEYS.TEMPLATES,
  PAGE_ACCESS_KEYS.WHITELIST,
  PAGE_ACCESS_KEYS.BLACKLIST,
  PAGE_ACCESS_KEYS.REPORTS,
  PAGE_ACCESS_KEYS.ACCOUNT,
];

const PAGE_ACCESS_DEFAULTS = {
  [PAGE_ACCESS_KEYS.DASHBOARD]: [RoleLevels.SUPER_ADMIN, RoleLevels.ADMIN, RoleLevels.Manager, RoleLevels.User, RoleLevels.GUEST],
  [PAGE_ACCESS_KEYS.AICHAT]: [RoleLevels.SUPER_ADMIN, RoleLevels.ADMIN, RoleLevels.Manager, RoleLevels.User, RoleLevels.GUEST],
  [PAGE_ACCESS_KEYS.APPLICATIONS]: [RoleLevels.SUPER_ADMIN, RoleLevels.ADMIN, RoleLevels.Manager, RoleLevels.User, RoleLevels.GUEST],
  [PAGE_ACCESS_KEYS.PROFILES]: [RoleLevels.SUPER_ADMIN, RoleLevels.ADMIN, RoleLevels.Manager, RoleLevels.User, RoleLevels.GUEST],
  [PAGE_ACCESS_KEYS.RESUMES]: [RoleLevels.SUPER_ADMIN, RoleLevels.ADMIN, RoleLevels.Manager, RoleLevels.User, RoleLevels.GUEST],
  [PAGE_ACCESS_KEYS.TEMPLATES]: [RoleLevels.SUPER_ADMIN, RoleLevels.ADMIN, RoleLevels.Manager, RoleLevels.User, RoleLevels.GUEST],
  [PAGE_ACCESS_KEYS.WHITELIST]: [RoleLevels.SUPER_ADMIN, RoleLevels.ADMIN],
  [PAGE_ACCESS_KEYS.BLACKLIST]: [RoleLevels.SUPER_ADMIN, RoleLevels.ADMIN],
  [PAGE_ACCESS_KEYS.REPORTS]: [RoleLevels.SUPER_ADMIN, RoleLevels.ADMIN],
  [PAGE_ACCESS_KEYS.ACCOUNT]: [RoleLevels.SUPER_ADMIN, RoleLevels.ADMIN, RoleLevels.Manager, RoleLevels.User, RoleLevels.GUEST],
};

const MANAGEABLE_ROLES = [RoleLevels.SUPER_ADMIN, RoleLevels.ADMIN, RoleLevels.Manager, RoleLevels.User, RoleLevels.GUEST];

function getPageAccessKeys() {
  return [...PAGE_ACCESS_ORDER];
}

function isValidPageAccessKey(pageKey) {
  return PAGE_ACCESS_ORDER.includes(String(pageKey || ""));
}

function getPageNameByKey(pageKey) {
  const normalized = String(pageKey || "");
  return PAGE_ACCESS_META[normalized]?.pageName || normalized;
}

function getDefaultAllowedRoles(pageKey) {
  const normalized = String(pageKey || "");
  return [...(PAGE_ACCESS_DEFAULTS[normalized] || [RoleLevels.SUPER_ADMIN, RoleLevels.ADMIN])];
}

function normalizeAllowedRoles(allowedRoles, options = {}) {
  const includeAdmin = options.includeAdmin !== false;
  const input = Array.isArray(allowedRoles) ? allowedRoles : [];

  const normalized = new Set();
  for (const role of input) {
    const parsed = Number(role);
    if (!Number.isFinite(parsed)) continue;
    if (!MANAGEABLE_ROLES.includes(parsed)) continue;
    normalized.add(parsed);
  }

  if (includeAdmin) {
    normalized.add(RoleLevels.SUPER_ADMIN);
    normalized.add(RoleLevels.ADMIN);
  }

  const ordered = MANAGEABLE_ROLES.filter((role) => normalized.has(role));
  return ordered;
}

function toRoleLabel(role) {
  const normalized = Number(role);
  if (normalized === RoleLevels.SUPER_ADMIN) return "Super Admin";
  if (normalized === RoleLevels.ADMIN) return "Admin";
  if (normalized === RoleLevels.Manager) return "Manager";
  if (normalized === RoleLevels.User) return "User";
  return "Guest";
}

module.exports = {
  PAGE_ACCESS_KEYS,
  PAGE_ACCESS_DEFAULTS,
  MANAGEABLE_ROLES,
  getPageAccessKeys,
  isValidPageAccessKey,
  getPageNameByKey,
  getDefaultAllowedRoles,
  normalizeAllowedRoles,
  toRoleLabel,
};
