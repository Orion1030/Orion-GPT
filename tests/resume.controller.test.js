jest.mock('../dbModels', () => ({
  ResumeModel: {},
  ProfileModel: {},
  ApplicationModel: {},
  ApplicationEventModel: {},
}));

jest.mock('../services/resumeEmbedding.service', () => ({
  queueResumeEmbeddingRefresh: jest.fn(),
}));

jest.mock('../services/applicationHistory.service', () => ({
  appendApplicationHistory: jest.fn(),
}));

describe('resume controller payload mapping', () => {
  it('maps payload to model including experiences and skills', () => {
    const controller = require('../controllers/resume.controller');
    const payload = {
      name: 'Test Resume',
      profileId: 'p1',
      experiences: [
        {
          title: 'Engineer',
          companyName: 'Acme',
          summary: 'Legacy summary',
          bullets: ['Did stuff'],
          startDate: '2020-01-01',
          endDate: '2021-01-01'
        }
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
    expect(out.experiences[0].bullets).toEqual(expect.arrayContaining(['Legacy summary', 'Did stuff']));
    expect(out.experiences[0].summary).toBeUndefined();
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

