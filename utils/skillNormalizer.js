/**
 * Skill ontology normalizer: lowercase, trim, and map common variants
 * so JD and resume skills align for better ATS matching.
 */
const SKILL_ALIASES = {
  js: 'JavaScript',
  javascript: 'JavaScript',
  ts: 'TypeScript',
  typescript: 'TypeScript',
  node: 'Node.js',
  'node.js': 'Node.js',
  'nodejs': 'Node.js',
  reactjs: 'React',
  'react.js': 'React',
  py: 'Python',
  ml: 'Machine Learning',
  'machine learning': 'Machine Learning',
  ai: 'Artificial Intelligence',
  'artificial intelligence': 'Artificial Intelligence',
  aws: 'AWS',
  gcp: 'Google Cloud',
  'google cloud': 'Google Cloud',
  k8s: 'Kubernetes',
  kubernetes: 'Kubernetes',
  db: 'Database',
  sql: 'SQL',
  nosql: 'NoSQL',
  api: 'API',
  rest: 'REST API',
  'rest api': 'REST API',
  graphql: 'GraphQL',
  ci: 'CI/CD',
  'ci/cd': 'CI/CD',
  devops: 'DevOps',
  ui: 'UI',
  ux: 'UX',
  html5: 'HTML5',
  css3: 'CSS3',
  scss: 'SCSS',
  sass: 'Sass',
  git: 'Git',
};

function normalizeSkill(skill) {
  if (!skill || typeof skill !== 'string') return '';
  const key = skill.trim().toLowerCase();
  if (!key) return '';
  return SKILL_ALIASES[key] || skill.trim();
}

function normalizeSkills(skills) {
  if (!Array.isArray(skills)) return [];
  const seen = new Set();
  return skills
    .map((s) => normalizeSkill(s))
    .filter(Boolean)
    .filter((s) => {
      const k = s.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}

module.exports = {
  normalizeSkill,
  normalizeSkills,
};
