describe("resumeAI.getLastUsedJd controller", () => {
  let getLastUsedJd;
  let findOneMock;

  beforeEach(() => {
    jest.resetModules();
    findOneMock = jest.fn();

    jest.doMock("../dbModels", () => ({
      JobDescriptionModel: { findOne: findOneMock },
      ResumeModel: {},
      ProfileModel: {},
    }));

    jest.doMock("../utils/resumeGeneration", () => ({
      tryGenerateResumeJsonFromJD: jest.fn(),
      tryGenerateApplicationMaterialsJsonFromJD: jest.fn(),
    }));
    jest.doMock("../services/llm/resumeRefine.service", () => ({
      tryRefineResumeWithFeedback: jest.fn(),
    }));
    jest.doMock("../utils/parseResume", () => ({
      tryParseResumeTextWithLLM: jest.fn(),
    }));
    jest.doMock("../services/jdImport.service", () => ({
      resolveJdContext: jest.fn(),
      tryParseAndPersistJobDescription: jest.fn(),
      tryFindTopResumesForJobDescription: jest.fn(),
      tryFindTopProfilesForJobDescription: jest.fn(),
      toPublicParsedJD: jest.fn(),
    }));

    ({ getLastUsedJd } = require("../controllers/resumeAI.controller"));
  });

  const makeResponse = () => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  });

  it("returns null payload when no prior JD exists", async () => {
    const leanMock = jest.fn().mockResolvedValue(null);
    const selectMock = jest.fn().mockReturnValue({ lean: leanMock });
    const sortMock = jest.fn().mockReturnValue({ select: selectMock });
    findOneMock.mockReturnValue({ sort: sortMock });

    const req = { user: { _id: "user-1" } };
    const res = makeResponse();

    await getLastUsedJd(req, res, jest.fn());

    expect(findOneMock).toHaveBeenCalledWith({
      userId: "user-1",
      context: /\S/,
    });
    expect(sortMock).toHaveBeenCalledWith({ updatedAt: -1, createdAt: -1 });
    expect(selectMock).toHaveBeenCalledWith("_id context title company updatedAt createdAt");
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { lastUsedJd: null },
      message: null,
      showNotification: false,
    });
  });

  it("returns the latest JD context payload when available", async () => {
    const updatedAt = "2026-04-08T19:45:00.000Z";
    const createdAt = "2026-04-08T19:00:00.000Z";
    const leanMock = jest.fn().mockResolvedValue({
      _id: { toString: () => "jd-123" },
      context: "Senior Node.js engineer role...",
      title: "Senior Backend Engineer",
      company: "Acme Corp",
      updatedAt,
      createdAt,
    });
    const selectMock = jest.fn().mockReturnValue({ lean: leanMock });
    const sortMock = jest.fn().mockReturnValue({ select: selectMock });
    findOneMock.mockReturnValue({ sort: sortMock });

    const req = { user: { _id: "user-2" } };
    const res = makeResponse();

    await getLastUsedJd(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        lastUsedJd: {
          jdId: "jd-123",
          context: "Senior Node.js engineer role...",
          title: "Senior Backend Engineer",
          company: "Acme Corp",
          updatedAt,
        },
      },
      message: null,
      showNotification: false,
    });
  });
});
