jest.mock('../services/llm/openaiClient', () => ({
  chatCompletions: jest.fn(),
}));

const { chatCompletions } = require('../services/llm/openaiClient');
const {
  generateResumeFromJD,
  _buildResumeGenerationInput,
  _buildMergedCareerHistoryForPrompt,
  _enforceExperienceBullets,
} = require('../services/llm/resumeGenerate.service');

const jd = { title: 'Data Engineer', company: 'Acme', context: 'Build pipelines' };
const profile = { fullName: 'Jane Doe', title: 'Engineer', mainStack: 'Data', careerHistory: [], educations: [] };

describe('generateResumeFromJD', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns parsed resume when chat schema succeeds', async () => {
    chatCompletions.mockResolvedValue({
      choices: [
        {
          message: {
            content: [{ type: 'text', text: JSON.stringify({ name: 'Fallback', summary: '', experiences: [], skills: [], education: [] }) }],
          },
        },
      ],
    });
    const res = await generateResumeFromJD({ jd, profile, baseResume: null });
    expect(res.name).toBe('Fallback');
    expect(chatCompletions).toHaveBeenCalled();
  });

  it('returns fallback resume when all providers fail', async () => {
    chatCompletions.mockRejectedValue(new Error('chat down'));
    const res = await generateResumeFromJD({ jd, profile, baseResume: null });
    expect(res.name).toContain('Data Engineer');
    expect(Array.isArray(res.skills)).toBe(true);
    expect(res.skills[0]).toBeDefined();
    expect(Array.isArray(res.skills[0].items)).toBe(true);
  });
});

describe('resume generation prompt careerHistory merge', () => {
  it('merges profile and selected resume items by normalized employment key', () => {
    const merged = _buildMergedCareerHistoryForPrompt(
      [
        {
          companyName: 'Acme Inc',
          roleTitle: 'Senior Data Engineer',
          startDate: '2022-01-01',
          endDate: '2023-12-31',
          companySummary: 'Enterprise data platform modernization.',
          keyPoints: '<ul><li>Scaled core ingestion APIs</li></ul>',
        },
      ],
      [
        {
          companyName: ' acme   inc ',
          title: 'Senior Data Engineer',
          startDate: new Date('2022-01-01'),
          endDate: '2023-12-31',
          summary: 'Owned distributed data services.',
          descriptions: ['Reduced ingestion latency by 42%.'],
        },
      ]
    );

    expect(merged).toHaveLength(1);
    expect(merged[0].companyName).toBe('Acme Inc');
    expect(merged[0].roleTitle).toBe('Senior Data Engineer');
    expect(merged[0].sources).toEqual({ profile: true, resume: true });
    expect(merged[0].companyContext).toEqual(
      expect.objectContaining({
        companySummary: expect.stringContaining('Enterprise data platform'),
        keyPoints: expect.arrayContaining(['Scaled core ingestion APIs']),
      })
    );
    expect(merged[0].candidateExperience).toEqual(
      expect.objectContaining({
        summary: expect.stringContaining('Owned distributed data services'),
        descriptions: expect.arrayContaining(['Reduced ingestion latency by 42%.']),
      })
    );
  });

  it('merges punctuation variants of company names into a single employment heading', () => {
    const merged = _buildMergedCareerHistoryForPrompt(
      [
        {
          companyName: 'Amazon, Inc.',
          roleTitle: 'Engineer',
          startDate: '2020-01-01',
          endDate: '2021-01-01',
          companySummary: 'Profile context summary.',
          keyPoints: ['Profile point'],
        },
      ],
      [
        {
          companyName: 'Amazon Inc',
          title: 'Engineer',
          startDate: '2020-01-01',
          endDate: '2021-01-01',
          summary: 'Resume summary.',
          descriptions: ['Resume point'],
        },
      ]
    );

    expect(merged).toHaveLength(1);
    expect(merged[0].sources).toEqual({ profile: true, resume: true });
    expect(merged[0].companyContext).toBeDefined();
    expect(merged[0].candidateExperience).toBeDefined();
  });

  it('merges concrete and open-ended date variants into a single employment heading', () => {
    const merged = _buildMergedCareerHistoryForPrompt(
      [
        {
          companyName: 'Axos Bank',
          roleTitle: 'Senior Engineer',
          startDate: '2025-08-01',
          endDate: '2026-03-02',
          companySummary: 'Profile-side company context.',
          keyPoints: ['Led core data migration'],
        },
      ],
      [
        {
          companyName: 'Axos Bank',
          title: 'Senior Engineer',
          startDate: '2025-08-01',
          endDate: 'Present',
          summary: 'Resume-side candidate experience.',
          descriptions: ['Delivered production launch milestones'],
        },
      ]
    );

    expect(merged).toHaveLength(1);
    expect(merged[0].sources).toEqual({ profile: true, resume: true });
    expect(merged[0].endDate).toBe('2026-03-02');
    expect(merged[0].companyContext).toBeDefined();
    expect(merged[0].candidateExperience).toBeDefined();
  });

  it('dedupes duplicate role records and merges conflict content blocks', () => {
    const merged = _buildMergedCareerHistoryForPrompt(
      [
        {
          companyName: 'Globex',
          roleTitle: 'Data Engineer',
          startDate: '2020-01-01',
          endDate: '2021-01-01',
          companySummary: 'Data transformation.',
          keyPoints: ['Built shared ETL templates'],
        },
        {
          companyName: 'globex',
          roleTitle: 'Data Engineer',
          startDate: '2020-01-01',
          endDate: '2021-01-01',
          companySummary: 'Data transformation across core product teams and reporting systems.',
          keyPoints: ['Built shared ETL templates', 'Improved data quality controls'],
        },
      ],
      [
        {
          companyName: 'Globex',
          title: 'Data Engineer',
          startDate: '2020-01-01',
          endDate: '2021-01-01',
          summary: 'Built ELT jobs.',
          descriptions: ['Built ELT jobs in Airflow', 'Owned incident response'],
        },
        {
          companyName: 'Globex',
          title: 'Data Engineer',
          startDate: '2020-01-01',
          endDate: '2021-01-01',
          summary: 'Built ELT jobs and productionized orchestration.',
          descriptions: ['Built ELT jobs in Airflow', 'Improved observability'],
        },
      ]
    );

    expect(merged).toHaveLength(1);
    expect(merged[0].companyContext.companySummary).toBe(
      'Data transformation across core product teams and reporting systems.'
    );
    expect(merged[0].companyContext.keyPoints).toEqual(
      expect.arrayContaining(['Built shared ETL templates', 'Improved data quality controls'])
    );
    expect(merged[0].candidateExperience.summary).toBe('Built ELT jobs and productionized orchestration.');
    expect(merged[0].candidateExperience.descriptions).toEqual(
      expect.arrayContaining(['Built ELT jobs in Airflow', 'Owned incident response', 'Improved observability'])
    );
    expect(new Set(merged[0].candidateExperience.descriptions).size).toBe(
      merged[0].candidateExperience.descriptions.length
    );
  });

  it('from-scratch input includes no selected-resume candidate blocks', () => {
    const llmInput = _buildResumeGenerationInput({
      jd,
      profile: {
        ...profile,
        careerHistory: [
          {
            companyName: 'Acme',
            roleTitle: 'Engineer',
            startDate: '2024-01-01',
            endDate: '2025-01-01',
            companySummary: 'Core platform development.',
            keyPoints: ['Shipped production APIs'],
          },
        ],
      },
      baseResume: null,
    });

    expect(llmInput.selectedResume).toBeUndefined();
    expect(Array.isArray(llmInput.careerHistory)).toBe(true);
    expect(llmInput.careerHistory).toHaveLength(1);
    expect(llmInput.careerHistory[0].sources).toEqual({ profile: true, resume: false });
    expect(llmInput.careerHistory[0].candidateExperience).toBeUndefined();
  });

  it('limits merged career history while preserving representation from both sources', () => {
    const profileEntries = Array.from({ length: 12 }, (_, idx) => ({
      companyName: `ProfileCo ${idx}`,
      roleTitle: 'Engineer',
      startDate: `2020-01-${String((idx % 28) + 1).padStart(2, '0')}`,
      endDate: `2020-12-${String((idx % 28) + 1).padStart(2, '0')}`,
      companySummary: `Profile summary ${idx}`,
      keyPoints: [`Profile key point ${idx}`],
    }));
    const resumeEntries = Array.from({ length: 12 }, (_, idx) => ({
      companyName: `ResumeCo ${idx}`,
      title: 'Engineer',
      startDate: `2021-01-${String((idx % 28) + 1).padStart(2, '0')}`,
      endDate: `2021-12-${String((idx % 28) + 1).padStart(2, '0')}`,
      summary: `Resume summary ${idx}`,
      descriptions: [`Resume bullet ${idx}`],
    }));

    const merged = _buildMergedCareerHistoryForPrompt(profileEntries, resumeEntries);
    const profileCount = merged.filter((entry) => entry.sources.profile).length;
    const resumeCount = merged.filter((entry) => entry.sources.resume).length;

    expect(merged).toHaveLength(16);
    expect(profileCount).toBeGreaterThan(0);
    expect(resumeCount).toBeGreaterThan(0);
  });

  it('does not create one-sided entries when profile/resume have same keys in different order', () => {
    const profileEntries = Array.from({ length: 13 }, (_, idx) => ({
      companyName: `Company ${idx}`,
      roleTitle: `Engineer ${idx}`,
      startDate: `2020-01-${String((idx % 28) + 1).padStart(2, '0')}`,
      endDate: `2021-01-${String((idx % 28) + 1).padStart(2, '0')}`,
      companySummary: `Profile summary ${idx}`,
      keyPoints: [`Profile point ${idx}`],
    }));
    const resumeEntries = [...profileEntries]
      .reverse()
      .map((entry) => ({
        companyName: entry.companyName,
        title: entry.roleTitle,
        startDate: entry.startDate,
        endDate: entry.endDate,
        summary: `Resume summary ${entry.companyName}`,
        descriptions: [`Resume point ${entry.companyName}`],
      }));

    const merged = _buildMergedCareerHistoryForPrompt(profileEntries, resumeEntries);
    const oneSided = merged.filter((entry) => !entry.sources.profile || !entry.sources.resume);

    expect(merged.length).toBeGreaterThan(0);
    expect(oneSided).toHaveLength(0);
  });
});

describe('experience evidence scoping', () => {
  it('prefers same-period evidence before broad company fallback', () => {
    const enriched = _enforceExperienceBullets(
      {
        experiences: [
          {
            title: 'Engineer',
            companyName: 'Acme',
            startDate: '2022-01-01',
            endDate: '2022-12-31',
            summary: '',
            descriptions: [],
          },
        ],
      },
      {
        careerHistory: [
          {
            companyName: 'Acme',
            roleTitle: 'Engineer',
            startDate: '2020-01-01',
            endDate: '2020-12-31',
            companySummary: 'Legacy monolith maintenance and patching.',
            keyPoints: ['Maintained legacy monolith services'],
          },
          {
            companyName: 'Acme',
            roleTitle: 'Engineer',
            startDate: '2022-01-01',
            endDate: '2022-12-31',
            companySummary: 'Platform modernization and migration.',
            keyPoints: ['Built event-driven microservices architecture'],
          },
        ],
      },
      null
    );

    const lines = (enriched.experiences[0].descriptions || []).join(' ').toLowerCase();
    expect(lines).toContain('event-driven microservices architecture');
    expect(lines).not.toContain('legacy monolith');
  });
});
