describe("resume.controller createResume import alignment", () => {
  let createResume;
  let ResumeModelMock;
  let ProfileFindOneMock;
  let ResumeFindByIdMock;
  let queueResumeEmbeddingRefreshMock;

  const makeResponse = () => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  });

  function mockPopulateQuery(value) {
    const level3 = {
      populate: jest.fn().mockResolvedValue(value),
    };
    const level2 = {
      populate: jest.fn().mockReturnValue(level3),
    };
    const level1 = {
      populate: jest.fn().mockReturnValue(level2),
    };
    return level1;
  }

  function mockProfileLeanQuery(value) {
    const lean = jest.fn().mockResolvedValue(value);
    const select = jest.fn().mockReturnValue({ lean });
    return { select, lean };
  }

  async function invokeController(controller, req, res) {
    controller(req, res, jest.fn());
    await new Promise((resolve) => setImmediate(resolve));
  }

  beforeEach(() => {
    jest.resetModules();

    ResumeFindByIdMock = jest.fn();
    ProfileFindOneMock = jest.fn();
    queueResumeEmbeddingRefreshMock = jest.fn();

    ResumeModelMock = jest.fn(function ResumeModel(data) {
      this._id = "resume-1";
      Object.assign(this, data);
      this.save = jest.fn().mockResolvedValue(undefined);
    });
    ResumeModelMock.findById = ResumeFindByIdMock;

    jest.doMock("../dbModels", () => ({
      ResumeModel: ResumeModelMock,
      ProfileModel: {
        findOne: ProfileFindOneMock,
      },
    }));

    jest.doMock("../utils/resumeUtils", () => ({
      sendPdfResume: jest.fn(),
      sendHtmlResume: jest.fn(),
      sendDocResume: jest.fn(),
      sendPdfFromHtml: jest.fn(),
      sendDocFromHtml: jest.fn(),
      injectHtmlDownloadMetadata: jest.fn((html) => html),
      getConfig: jest.fn(() => ({})),
      getMargins: jest.fn(() => ({})),
    }));

    jest.doMock("../services/resumeEmbedding.service", () => ({
      queueResumeEmbeddingRefresh: queueResumeEmbeddingRefreshMock,
    }));

    ({ createResume } = require("../controllers/resume.controller"));
  });

  it("anchors imported experience dates to selected profile career history", async () => {
    const profileQuery = mockProfileLeanQuery({
      _id: "profile-1",
      careerHistory: [
        {
          companyName: "Acme",
          roleTitle: "Engineer",
          startDate: "2023-01-01",
          endDate: "2024-01-01",
          companySummary: "Profile summary",
          keyPoints: "<ul><li>Profile bullet</li></ul>",
        },
      ],
    });
    ProfileFindOneMock.mockReturnValue({ select: profileQuery.select });

    ResumeFindByIdMock.mockReturnValue(
      mockPopulateQuery({
        _id: "resume-1",
        name: "Imported Resume",
      })
    );

    const req = {
      user: { _id: "user-1" },
      body: {
        id: "new-Resume-id",
        source: "import",
        name: "Imported Resume",
        profile: { id: "profile-1" },
        summary: "Summary",
        experiences: [
          {
            title: "Engineer",
            companyName: "Acme",
            startDate: "2023-06-01",
            endDate: "Present",
            bullets: ["Imported bullet"],
          },
        ],
        skills: [],
        education: [],
      },
    };
    const res = makeResponse();

    await invokeController(createResume, req, res);

    const savedPayload = ResumeModelMock.mock.calls[0][0];
    expect(savedPayload.experiences).toHaveLength(1);
    expect(savedPayload.experiences[0].startDate).toBe("2023-01-01");
    expect(savedPayload.experiences[0].endDate).toBe("2024-01-01");
    expect(savedPayload.experiences[0].bullets).toEqual(["Imported bullet"]);

    expect(queueResumeEmbeddingRefreshMock).toHaveBeenCalledWith("resume-1", { maxAttempts: 3 });
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("keeps non-import create payload experience dates unchanged", async () => {
    const profileQuery = mockProfileLeanQuery({
      _id: "profile-2",
      careerHistory: [],
    });
    ProfileFindOneMock.mockReturnValue({ select: profileQuery.select });

    ResumeFindByIdMock.mockReturnValue(
      mockPopulateQuery({
        _id: "resume-1",
        name: "Manual Resume",
      })
    );

    const req = {
      user: { _id: "user-2" },
      body: {
        id: "new-Resume-id",
        name: "Manual Resume",
        profile: { id: "profile-2" },
        summary: "Summary",
        experiences: [
          {
            title: "Engineer",
            companyName: "Acme",
            startDate: "2023-06-01",
            endDate: "Present",
            bullets: ["Manual bullet"],
          },
        ],
        skills: [],
        education: [],
      },
    };
    const res = makeResponse();

    await invokeController(createResume, req, res);

    const savedPayload = ResumeModelMock.mock.calls[0][0];
    expect(savedPayload.experiences).toHaveLength(1);
    expect(savedPayload.experiences[0].startDate).toBe("2023-06-01");
    expect(savedPayload.experiences[0].endDate).toBe("Present");
    expect(ProfileFindOneMock).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("returns 404 when import profile is not found", async () => {
    const profileQuery = mockProfileLeanQuery(null);
    ProfileFindOneMock.mockReturnValue({ select: profileQuery.select });

    const req = {
      user: { _id: "user-3" },
      body: {
        id: "new-Resume-id",
        source: "import",
        name: "Imported Resume",
        profile: { id: "profile-missing" },
        experiences: [],
      },
    };
    const res = makeResponse();

    await invokeController(createResume, req, res);

    expect(ResumeModelMock).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: "Profile not found",
      })
    );
  });
});
