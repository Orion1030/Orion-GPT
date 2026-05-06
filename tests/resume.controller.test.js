jest.mock('../middlewares/asyncErrorHandler', () => (fn) => fn);

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

jest.mock('../utils/resumeUtils', () => ({
  sendPdfResume: jest.fn(async (_resume, res) => res.end(Buffer.from('%PDF-resume'))),
  sendPdfCoverLetter: jest.fn(async (_resume, res) => res.end(Buffer.from('%PDF-cover-letter'))),
  sendHtmlResume: jest.fn((_resume, res) => res.send('<html>resume</html>')),
  sendHtmlCoverLetter: jest.fn((_resume, res) => res.send('<html>cover letter</html>')),
  sendDocResume: jest.fn(async (_resume, res) => res.end(Buffer.from('resume-docx'))),
  sendDocCoverLetter: jest.fn(async (_resume, res) => res.end(Buffer.from('cover-letter-docx'))),
  sendPdfFromHtml: jest.fn(async (_html, res) => res.end(Buffer.from('%PDF-html'))),
  sendDocFromHtml: jest.fn(async (_html, res) => res.end(Buffer.from('html-docx'))),
  injectHtmlDownloadMetadata: jest.fn((html) => html),
  buildContentDisposition: jest.fn((name, extension) => `attachment; filename="${name || 'download'}.${extension || 'bin'}"`),
  getConfig: jest.fn(() => ({ marginPreset: 'standard' })),
  getMargins: jest.fn(() => ({ top: 54, right: 54, bottom: 54, left: 54 })),
}));

function mockFindOneResume(resume) {
  const { ResumeModel } = require('../dbModels');
  const query = {
    populate: jest.fn(() => query),
    then: (resolve, reject) => Promise.resolve(resume).then(resolve, reject),
    catch: (reject) => Promise.resolve(resume).catch(reject),
  };
  ResumeModel.findOne = jest.fn(() => query);
  return query;
}

function createMockResponse() {
  return {
    set: jest.fn(),
    end: jest.fn(),
    send: jest.fn(),
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
}

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

describe('resume controller cover letter downloads', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('routes cover-letter PDF downloads to the cover-letter PDF exporter', async () => {
    const controller = require('../controllers/resume.controller');
    const resumeUtils = require('../utils/resumeUtils');
    const resume = {
      _id: 'resume1',
      userId: 'user1',
      coverLetter: {
        title: 'Cover Letter',
        bodyParagraphs: ['Relevant experience.'],
      },
    };
    mockFindOneResume(resume);
    const res = createMockResponse();

    await controller.downloadResume({
      params: { resumeId: 'resume1' },
      query: { fileType: 'pdf', documentType: 'coverLetter' },
      user: { _id: 'user1' },
    }, res);

    expect(resumeUtils.sendPdfCoverLetter).toHaveBeenCalledWith(resume, res);
    expect(resumeUtils.sendPdfResume).not.toHaveBeenCalled();
  });

  it('routes cover-letter DOCX downloads to the cover-letter DOCX exporter', async () => {
    const controller = require('../controllers/resume.controller');
    const resumeUtils = require('../utils/resumeUtils');
    const resume = {
      _id: 'resume1',
      userId: 'user1',
      coverLetter: {
        title: 'Cover Letter',
        bodyParagraphs: ['Relevant experience.'],
      },
    };
    mockFindOneResume(resume);
    const res = createMockResponse();

    await controller.downloadResume({
      params: { resumeId: 'resume1' },
      query: { fileType: 'docx', documentType: 'coverLetter' },
      user: { _id: 'user1' },
    }, res);

    expect(resumeUtils.sendDocCoverLetter).toHaveBeenCalledWith(resume, res);
    expect(resumeUtils.sendDocResume).not.toHaveBeenCalled();
  });
});

describe('cover letter template rendering', () => {
  it('builds ASCII-safe content disposition headers for unicode filenames', () => {
    const { buildContentDisposition } = require('../utils/templateRenderer');

    const header = buildContentDisposition(
      'Senior Engineer - São Paulo – Platform\r\nBad:Name',
      'pdf',
      'cover-letter',
    );

    expect(header).toMatch(/^attachment; filename="/);
    expect(header).toContain("filename*=UTF-8''");
    expect(header).toMatch(/^[\x20-\x7E]+$/);
    expect(header).not.toContain('\r');
    expect(header).not.toContain('\n');
    expect(header).not.toContain(':');
  });

  it('falls back to the built-in cover-letter template when the selected template fails', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { buildCoverLetterHtml } = require('../utils/templateRenderer');

    const html = buildCoverLetterHtml({
      name: 'Test Resume',
      profileId: {
        fullName: 'Jane Doe',
        title: 'Senior Engineer',
        contactInfo: { email: 'jane@example.com' },
      },
      coverLetterTemplateId: {
        templateType: 'cover_letter',
        data: '<html><body><%= missing.value %></body></html>',
      },
      coverLetter: {
        title: 'Cover Letter',
        recipient: 'Hiring Manager',
        companyName: 'Acme',
        jobTitle: 'Senior Developer',
        opening: 'I am excited.',
        bodyParagraphs: ['I built reliable systems.'],
        closing: 'Thank you.',
        signature: 'Jane Doe',
      },
    });

    expect(html).toContain('Dear Hiring Manager');
    expect(html).toContain('I built reliable systems.');
    warnSpy.mockRestore();
  });

  it('does not duplicate a salutation stored in the opening field', () => {
    const { buildCoverLetterHtml } = require('../utils/templateRenderer');

    const html = buildCoverLetterHtml({
      name: 'Test Resume',
      profileId: {
        fullName: 'Jane Doe',
        title: 'Senior Engineer',
        contactInfo: { email: 'jane@example.com' },
      },
      coverLetter: {
        title: 'Cover Letter',
        recipient: 'Hiring Manager',
        companyName: 'Acme',
        jobTitle: 'Senior Developer',
        opening: 'Dear Hiring Manager,\n\nI am excited to apply for this role.',
        bodyParagraphs: ['I built reliable systems.'],
        closing: 'Thank you.',
        signature: 'Jane Doe',
      },
    });

    expect((html.match(/Dear Hiring Manager/g) || []).length).toBe(1);
    expect(html).toContain('I am excited to apply for this role.');
  });

  it('removes repeated salutations stored at the start of the opening field', () => {
    const { buildCoverLetterHtml } = require('../utils/templateRenderer');

    const html = buildCoverLetterHtml({
      name: 'Test Resume',
      profileId: {
        fullName: 'Jane Doe',
        title: 'Senior Engineer',
        contactInfo: { email: 'jane@example.com' },
      },
      coverLetter: {
        title: 'Cover Letter',
        recipient: 'Hiring Manager',
        companyName: 'Acme',
        jobTitle: 'Senior Developer',
        opening: 'Dear Hiring Manager,\n  Dear Hiring Manager,\n\nI am excited to apply for this role.',
        bodyParagraphs: ['I built reliable systems.'],
        closing: 'Thank you.',
        signature: 'Jane Doe',
      },
    });

    expect((html.match(/Dear Hiring Manager/g) || []).length).toBe(1);
    expect(html).toContain('I am excited to apply for this role.');
  });

  it('collapses duplicate salutation paragraphs from selected templates', () => {
    const { buildCoverLetterHtml } = require('../utils/templateRenderer');

    const html = buildCoverLetterHtml({
      name: 'Test Resume',
      profileId: {
        fullName: 'Jane Doe',
        title: 'Senior Engineer',
        contactInfo: { email: 'jane@example.com' },
      },
      coverLetterTemplateId: {
        templateType: 'cover_letter',
        data: '<html><body><main><p>Dear <%= recipient || "Hiring Manager" %>,</p><p>Dear <%= recipient || "Hiring Manager" %>,</p><p><%= opening %></p></main></body></html>',
      },
      coverLetter: {
        title: 'Cover Letter',
        recipient: 'Hiring Manager',
        companyName: 'Acme',
        jobTitle: 'Senior Developer',
        opening: 'I am excited to apply for this role.',
        bodyParagraphs: [],
        closing: 'Thank you.',
        signature: 'Jane Doe',
      },
    });

    expect((html.match(/Dear Hiring Manager/g) || []).length).toBe(1);
    expect(html).toContain('I am excited to apply for this role.');
  });

  it('collapses duplicate salutations inside one rendered paragraph', () => {
    const { buildCoverLetterHtml } = require('../utils/templateRenderer');

    const html = buildCoverLetterHtml({
      name: 'Test Resume',
      profileId: {
        fullName: 'Jane Doe',
        title: 'Senior Engineer',
        contactInfo: { email: 'jane@example.com' },
      },
      coverLetterTemplateId: {
        templateType: 'cover_letter',
        data: '<html><body><main><p>Dear <%= recipient || "Hiring Manager" %>,<br>Dear <%= recipient || "Hiring Manager" %>,</p><p><%= opening %></p></main></body></html>',
      },
      coverLetter: {
        title: 'Cover Letter',
        recipient: 'Hiring Manager',
        companyName: 'Acme',
        jobTitle: 'Senior Developer',
        opening: 'I am excited to apply for this role.',
        bodyParagraphs: [],
        closing: 'Thank you.',
        signature: 'Jane Doe',
      },
    });

    expect((html.match(/Dear Hiring Manager/g) || []).length).toBe(1);
    expect(html).toContain('I am excited to apply for this role.');
  });

  it('removes html-like repeated salutations stored in opening before docx rendering', () => {
    const { buildCoverLetterHtml } = require('../utils/templateRenderer');
    const { buildDocxHtml } = require('../utils/docExport');

    const html = buildCoverLetterHtml({
      name: 'Test Resume',
      profileId: {
        fullName: 'Jane Doe',
        title: 'Senior Engineer',
        contactInfo: { email: 'jane@example.com' },
      },
      coverLetter: {
        title: 'Cover Letter',
        recipient: 'Hiring Manager',
        companyName: 'Acme',
        jobTitle: 'Senior Developer',
        opening: '<p>Dear Hiring Manager,</p><p>Dear Hiring Manager,</p><p>I am excited to apply for this role.</p>',
        bodyParagraphs: ['I built reliable systems.'],
        closing: 'Thank you.',
        signature: 'Jane Doe',
      },
    });
    const { docHtml } = buildDocxHtml(html, { fullName: 'Jane Doe' });

    expect((docHtml.match(/Dear Hiring Manager/g) || []).length).toBe(1);
    expect(docHtml).toContain('I am excited to apply for this role.');
  });
});

