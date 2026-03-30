// Central place for curated JD constants (source-of-truth for normalization + matching)
module.exports = {
  languages: [
    'python', 'java', 'go', 'r', 'js/ts', 'c/c++', 'rust', 'ruby', 'php', 'swift', 'kotlin', 'c#', 'others',
  ],
  frameworks: [
    'react', 'angular', 'vue', 'spring', 'django', 'flask', 'asp.net core', 'laravel', 'flutter', 'react-native',
    'rails', 'express', 'next.js', 'nuxt', 'others',
  ],
  cloudPlatforms: ['aws', 'gcp', 'azure', 'digitalocean', 'ibm cloud', 'heroku', 'others'],
  databases: ['postgres', 'mysql', 'mongodb', 'redis', 'elasticsearch', 'sqlite', 'cassandra', 'dynamodb', 'others'],
  toolsDevOps: [
    'docker', 'kubernetes', 'terraform', 'github actions', 'gitlab ci', 'jenkins', 'circleci', 'ansible', 'prometheus',
    'grafana', 'others',
  ],
  techDomains: [
    'software', 'mobile', 'cloud', 'devops', 'data', 'ai', 'ml', 'data-science', 'data-engineering',
    'security', 'embedded/iot', 'gaming', 'others',
  ],
  industryDomains: [
    'fintech', 'healthtech', 'edtech', 'ecommerce', 'adtech', 'logistics', 'gaming', 'saas',
    'cybersecurity', 'automotive', 'telecom', 'energy', 'others',
  ],
  employmentTypes: ['full-time', 'part-time', 'contract', 'freelance', 'internship'],
  workModelTypes: ['remote', 'hybrid', 'onsite'],
};
