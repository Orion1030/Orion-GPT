const { parseTextResume } = require('../controllers/resume.controller');

describe('parseTextResume controller', () => {
  const OLD_ENV = process.env;
  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV, OPENAI_API_KEY: 'test-key' };
    // mock global fetch to return a chat completion with JSON body
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                profile: { fullName: 'Jane Doe', title: 'Engineer', contactInfo: { email: null } },
                summary: 'Experienced engineer.',
                skills: ['JS', 'Node'],
                meta: { confidence: 0.9, missingFields: [] }
              })
            }
          }
        ]
      })
    });
  });

  afterEach(() => {
    process.env = OLD_ENV;
    jest.resetAllMocks();
  });

  it('parses text and returns structured JSON', async () => {
    // mock ProfileModel.find to return empty array
    jest.doMock('../dbModels', () => ({ ProfileModel: { find: jest.fn().mockResolvedValue([]) } }));
    const controller = require('../controllers/resume.controller');
    const req = { body: { text: 'Some resume text' }, user: { _id: 'u1' } };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    await controller.parseTextResume(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalled();
    const payload = res.json.mock.calls[0][0];
    expect(payload.success).toBe(true);
    expect(payload.data).toBeDefined();
    expect(payload.data.parsed.profile.fullName).toBe('Jane Doe');
  });

  it('maps payload to model including experiences and skills', () => {
    const controller = require('../controllers/resume.controller');
    const payload = {
      name: 'Test Resume',
      profileId: 'p1',
      experiences: [
        { title: 'Engineer', companyName: 'Acme', descriptions: ['Did stuff'], startDate: '2020-01-01', endDate: '2021-01-01' }
      ],
      skills: [
        { title: 'Skills', items: ['JS', 'Node'] }
      ]
    };
    const out = controller._mapPayloadToModel(payload, 'user1');
    expect(out.userId).toBe('user1');
    expect(out.name).toBe('Test Resume');
    expect(Array.isArray(out.experiences)).toBe(true);
    expect(Array.isArray(out.skills)).toBe(true);
    expect(out.experiences[0].title).toBe('Engineer');
    expect(out.skills[0].items).toContain('JS');
  });

  it('maps partial update payload to $set keys only when present', () => {
    const controller = require('../controllers/resume.controller');
    expect(controller._mapUpdatePayloadToSet({ name: 'Only name' })).toEqual({ name: 'Only name' });
    expect(controller._mapUpdatePayloadToSet({ summary: 'Hi' })).toEqual({ summary: 'Hi' });
    const minimal = controller._mapUpdatePayloadToSet({});
    expect(Object.keys(minimal).length).toBe(0);
  });
});

