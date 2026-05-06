jest.mock('../services/llm/openaiClient', () => ({
  chatCompletions: jest.fn(),
  responsesCreate: jest.fn(),
}));
jest.mock('../services/llm/providerChat.client', () => ({
  chatCompletionText: jest.fn(),
}));
jest.mock('../services/promptRuntime.service', () => ({
  resolveManagedPromptContext: jest.fn(),
}));
jest.mock('../services/adminConfiguration.service', () => ({
  AI_RUNTIME_FEATURES: {
    RESUME_GENERATION: 'resume_generation',
  },
  RESUME_GENERATION_MODES: {
    LEGACY: 'legacy',
    REASONING: 'reasoning',
  },
  resolveFeatureAiRuntimeConfig: jest.fn(async () => ({
    useCustom: false,
    resumeGenerationMode: 'legacy',
    provider: null,
    model: null,
    apiKey: null,
  })),
}));

const { chatCompletions, responsesCreate } = require('../services/llm/openaiClient');
const { chatCompletionText } = require('../services/llm/providerChat.client');
const { resolveManagedPromptContext } = require('../services/promptRuntime.service');
const { resolveFeatureAiRuntimeConfig } = require('../services/adminConfiguration.service');
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
    resolveFeatureAiRuntimeConfig.mockResolvedValue({
      useCustom: false,
      resumeGenerationMode: 'legacy',
      provider: null,
      model: null,
      apiKey: null,
    });
    resolveManagedPromptContext.mockImplementation(async ({ fallbackContext }) => ({
      context: fallbackContext,
      source: 'no_prompt_configured',
      promptId: null,
      promptUpdatedAt: null,
    }));
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

  it('uses reasoning mode when configured for resume generation', async () => {
    resolveFeatureAiRuntimeConfig.mockResolvedValue({
      useCustom: false,
      resumeGenerationMode: 'reasoning',
      provider: null,
      model: null,
      apiKey: null,
    });
    responsesCreate
      .mockResolvedValueOnce({
        output: [
          {
            type: 'message',
            content: [
              {
                type: 'output_text',
                text: JSON.stringify({
                  selectedRoles: [],
                  selectedSkills: ['Python', 'SQL'],
                  gaps: [],
                }),
              },
            ],
          },
        ],
        usage: { total_tokens: 10 },
      })
      .mockResolvedValueOnce({
        output: [
          {
            type: 'message',
            content: [
              {
                type: 'output_text',
                text: JSON.stringify({
                  targetTitle: 'Data Engineer',
                  summaryFocus: ['Data platform delivery'],
                  skillPriorities: ['Python', 'SQL'],
                  experiencePlan: [],
                  notes: [],
                }),
              },
            ],
          },
        ],
        usage: { total_tokens: 10 },
      })
      .mockResolvedValueOnce({
        output: [
          {
            type: 'message',
            content: [
              {
                type: 'output_text',
                text: JSON.stringify({
                  name: 'Reasoned Resume',
                  summary: '',
                  experiences: [],
                  skills: [],
                  education: [],
                }),
              },
            ],
          },
        ],
        usage: { total_tokens: 10 },
      });

    const res = await generateResumeFromJD({ jd, profile, baseResume: null });

    expect(res.name).toBe('Reasoned Resume');
    expect(responsesCreate).toHaveBeenCalledTimes(3);
    expect(chatCompletions).not.toHaveBeenCalled();
  });

  it('falls back to legacy generation for unsupported custom reasoning providers', async () => {
    resolveFeatureAiRuntimeConfig.mockResolvedValue({
      useCustom: true,
      resumeGenerationMode: 'reasoning',
      provider: 'claude',
      model: 'claude-sonnet-4-0',
      apiKey: 'claude-key',
    });
    chatCompletionText.mockResolvedValue({
      text: JSON.stringify({
        name: 'Claude Legacy Resume',
        summary: '',
        experiences: [],
        skills: [],
        education: [],
      }),
      usage: { input_tokens: 20 },
      finishReason: 'stop',
    });

    const res = await generateResumeFromJD({ jd, profile, baseResume: null });

    expect(res.name).toBe('Claude Legacy Resume');
    expect(responsesCreate).not.toHaveBeenCalled();
    expect(chatCompletionText).toHaveBeenCalled();
  });

  it('anchors generated experience dates to profile career history dates', async () => {
    const profileWithCareer = {
      ...profile,
      careerHistory: [
        {
          companyName: 'Acme',
          roleTitle: 'Data Engineer',
          startDate: '2022-01-01',
          endDate: '2023-12-31',
          companySummary: 'Built data platform.',
          keyPoints: ['Scaled ingestion pipelines'],
        },
      ],
    };

    chatCompletions.mockResolvedValue({
      choices: [
        {
          message: {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  name: 'Generated',
                  summary: '',
                  experiences: [
                    {
                      title: 'Data Engineer',
                      companyName: 'Acme',
                      summary: 'Generated summary',
                      bullets: ['Generated bullet'],
                      startDate: '2022-07-01',
                      endDate: 'Present',
                    },
                  ],
                  skills: [],
                  education: [],
                }),
              },
            ],
          },
        },
      ],
    });

    const res = await generateResumeFromJD({ jd, profile: profileWithCareer, baseResume: null });
    expect(res.experiences).toHaveLength(1);
    expect(res.experiences[0].startDate).toBe('2022-01-01');
    expect(res.experiences[0].endDate).toBe('2023-12-31');
  });

  it('returns fallback resume when all providers fail', async () => {
    chatCompletions.mockRejectedValue(new Error('chat down'));
    const res = await generateResumeFromJD({ jd, profile, baseResume: null });
    expect(res.name).toContain('Data Engineer');
    expect(Array.isArray(res.skills)).toBe(true);
    expect(res.skills[0]).toBeDefined();
    expect(Array.isArray(res.skills[0].items)).toBe(true);
  });

  it('wraps managed prompts with locked guardrails before generation', async () => {
    resolveManagedPromptContext.mockResolvedValue({
      context: 'Prioritize backend platform leadership examples and concise impact language.',
      source: 'account_default',
      promptId: 'mock-prompt-id',
      promptUpdatedAt: '2026-04-20T00:00:00.000Z',
    });

    chatCompletions.mockResolvedValue({
      choices: [
        {
          message: {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  name: 'Guardrail Test',
                  summary: '',
                  experiences: [],
                  skills: [],
                  education: [],
                }),
              },
            ],
          },
        },
      ],
    });

    await generateResumeFromJD({ jd, profile, baseResume: null });

    const payload = chatCompletions.mock.calls[0]?.[0];
    const systemMessage = payload?.messages?.find((message) => message.role === 'system')?.content || '';
    expect(systemMessage).toContain('Locked constraints (cannot be overridden)');
    expect(systemMessage).toContain(
      'Prioritize backend platform leadership examples and concise impact language.'
    );
    expect(systemMessage).toContain('Strict schema-valid JSON output only.');
  });

  it('resolves prompt scope strictly from selected profile owner and profile ids', async () => {
    const profileWithObjectOwner = {
      ...profile,
      _id: "profile-abc",
      userId: { _id: "owner-xyz" },
    };

    chatCompletions.mockResolvedValue({
      choices: [
        {
          message: {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  name: 'Scope Test',
                  summary: '',
                  experiences: [],
                  skills: [],
                  education: [],
                }),
              },
            ],
          },
        },
      ],
    });

    await generateResumeFromJD({ jd, profile: profileWithObjectOwner, baseResume: null });

    expect(resolveManagedPromptContext).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: "owner-xyz",
        profileId: "profile-abc",
        promptName: "resume_generation",
        type: "system",
      })
    );
  });

  it('does not recurse infinitely when userId has a self-referential _id shape', async () => {
    const recursiveId = {};
    recursiveId._id = recursiveId;
    const profileWithRecursiveOwnerId = {
      ...profile,
      _id: "profile-recursive",
      userId: recursiveId,
    };

    chatCompletions.mockResolvedValue({
      choices: [
        {
          message: {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  name: 'Recursive Id Test',
                  summary: '',
                  experiences: [],
                  skills: [],
                  education: [],
                }),
              },
            ],
          },
        },
      ],
    });

    const res = await generateResumeFromJD({
      jd,
      profile: profileWithRecursiveOwnerId,
      baseResume: null,
    });

    expect(res.name).toBe('Recursive Id Test');
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
          bullets: ['Reduced ingestion latency by 42%.'],
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
        bullets: expect.arrayContaining([
          'Owned distributed data services.',
          'Reduced ingestion latency by 42%.',
        ]),
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
          bullets: ['Resume point'],
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
          bullets: ['Delivered production launch milestones'],
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
          bullets: ['Built ELT jobs in Airflow', 'Owned incident response'],
        },
        {
          companyName: 'Globex',
          title: 'Data Engineer',
          startDate: '2020-01-01',
          endDate: '2021-01-01',
          summary: 'Built ELT jobs and productionized orchestration.',
          bullets: ['Built ELT jobs in Airflow', 'Improved observability'],
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
    expect(merged[0].candidateExperience.bullets).toEqual(
      expect.arrayContaining([
        'Built ELT jobs.',
        'Built ELT jobs and productionized orchestration.',
        'Built ELT jobs in Airflow',
        'Owned incident response',
        'Improved observability',
      ])
    );
    expect(new Set(merged[0].candidateExperience.bullets).size).toBe(
      merged[0].candidateExperience.bullets.length
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
      bullets: [`Resume bullet ${idx}`],
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
        bullets: [`Resume point ${entry.companyName}`],
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
            bullets: [],
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

    const lines = (enriched.experiences[0].bullets || []).join(' ').toLowerCase();
    expect(lines).toContain('event-driven microservices architecture');
    expect(lines).not.toContain('legacy monolith');
  });
});
