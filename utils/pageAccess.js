const { RoleLevels } = require("./constants");

const PAGE_ACCESS_KEYS = {
  DASHBOARD: "dashboard",
  CHAT: "chat",
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
  [PAGE_ACCESS_KEYS.CHAT]: { pageName: "Chat" },
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
  PAGE_ACCESS_KEYS.CHAT,
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
  [PAGE_ACCESS_KEYS.DASHBOARD]: [RoleLevels.ADMIN, RoleLevels.Manager, RoleLevels.User],
  [PAGE_ACCESS_KEYS.CHAT]: [RoleLevels.ADMIN, RoleLevels.Manager, RoleLevels.User],
  [PAGE_ACCESS_KEYS.APPLICATIONS]: [RoleLevels.ADMIN, RoleLevels.Manager, RoleLevels.User],
  [PAGE_ACCESS_KEYS.PROFILES]: [RoleLevels.ADMIN, RoleLevels.Manager, RoleLevels.User],
  [PAGE_ACCESS_KEYS.RESUMES]: [RoleLevels.ADMIN, RoleLevels.Manager, RoleLevels.User],
  [PAGE_ACCESS_KEYS.TEMPLATES]: [RoleLevels.ADMIN, RoleLevels.Manager, RoleLevels.User],
  [PAGE_ACCESS_KEYS.WHITELIST]: [RoleLevels.ADMIN],
  [PAGE_ACCESS_KEYS.BLACKLIST]: [RoleLevels.ADMIN],
  [PAGE_ACCESS_KEYS.REPORTS]: [RoleLevels.ADMIN],
  [PAGE_ACCESS_KEYS.ACCOUNT]: [RoleLevels.ADMIN, RoleLevels.Manager, RoleLevels.User],
};

const MANAGEABLE_ROLES = [RoleLevels.ADMIN, RoleLevels.Manager, RoleLevels.User];

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
  return [...(PAGE_ACCESS_DEFAULTS[normalized] || [RoleLevels.ADMIN])];
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
    normalized.add(RoleLevels.ADMIN);
  }

  const ordered = MANAGEABLE_ROLES.filter((role) => normalized.has(role));
  return ordered;
}

function toRoleLabel(role) {
  const normalized = Number(role);
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
