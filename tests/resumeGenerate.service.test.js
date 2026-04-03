jest.mock('../services/llm/openaiClient', () => ({
  chatCompletions: jest.fn(),
}));

const { chatCompletions } = require('../services/llm/openaiClient');
const { generateResumeFromJD } = require('../services/llm/resumeGenerate.service');

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
