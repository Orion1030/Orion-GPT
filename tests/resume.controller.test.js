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
});

