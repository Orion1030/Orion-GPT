describe("resumeAI.generateResumeFromJD controller", () => {
  let generateResumeFromJD;
  let jobFindOneMock;
  let profileFindOneMock;
  let resumeFindOneMock;
  let tryGenerateApplicationMaterialsJsonFromJDMock;

  const makeResponse = () => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  });

  function mockLeanQuery(value) {
    return { lean: jest.fn().mockResolvedValue(value) };
  }

  function mockPopulateLeanQuery(value) {
    const lean = jest.fn().mockResolvedValue(value);
    const populate = jest.fn().mockReturnValue({ lean });
    return { populate, lean };
  }

  async function invokeController(req, res) {
    generateResumeFromJD(req, res, jest.fn());
    await new Promise((resolve) => setImmediate(resolve));
  }

  beforeEach(() => {
    jest.resetModules();
    jobFindOneMock = jest.fn();
    profileFindOneMock = jest.fn();
    resumeFindOneMock = jest.fn();
    tryGenerateApplicationMaterialsJsonFromJDMock = jest.fn();

    jest.doMock("../dbModels", () => ({
      JobDescriptionModel: { findOne: jobFindOneMock },
      ResumeModel: { findOne: resumeFindOneMock },
      ProfileModel: { findOne: profileFindOneMock },
    }));

    jest.doMock("../utils/resumeGeneration", () => ({
      tryGenerateApplicationMaterialsJsonFromJD: tryGenerateApplicationMaterialsJsonFromJDMock,
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

    ({ generateResumeFromJD } = require("../controllers/resumeAI.controller"));
  });

  it("uses scratch mode when baseResumeId is omitted", async () => {
    jobFindOneMock.mockReturnValue(mockLeanQuery({ _id: "jd-1", title: "Data Engineer", context: "JD context" }));
    profileFindOneMock.mockReturnValue(mockLeanQuery({ _id: "profile-1", fullName: "Jane Doe", careerHistory: [] }));
    tryGenerateApplicationMaterialsJsonFromJDMock.mockResolvedValue({
      result: {
        resume: { name: "Generated", summary: "", experiences: [], skills: [], education: [] },
        coverLetter: { title: "Generated Cover Letter", bodyParagraphs: ["Relevant experience."] },
      },
      error: null,
    });

    const req = { user: { _id: "user-1" }, body: { jdId: "jd-1", profileId: "profile-1" } };
    const res = makeResponse();

    await invokeController(req, res);

    expect(resumeFindOneMock).not.toHaveBeenCalled();
    expect(tryGenerateApplicationMaterialsJsonFromJDMock).toHaveBeenCalledWith(
      expect.objectContaining({
        baseResume: null,
      })
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          resume: expect.objectContaining({ name: "Generated" }),
          coverLetter: expect.objectContaining({ title: "Generated Cover Letter" }),
        }),
      })
    );
  });

  it("uses selected resume when baseResumeId is provided and profile matches", async () => {
    jobFindOneMock.mockReturnValue(mockLeanQuery({ _id: "jd-2", title: "Backend Engineer", context: "JD context" }));
    profileFindOneMock.mockReturnValue(mockLeanQuery({
      _id: "profile-2",
      fullName: "John Doe",
      careerHistory: [
        {
          companyName: "Acme",
          roleTitle: "Engineer",
          startDate: "2023-01-01",
          endDate: "2024-01-01",
        },
      ],
    }));
    const selectedResume = {
      _id: "resume-1",
      profileId: { _id: "profile-2" },
      experiences: [
        {
          companyName: "Acme",
          title: "Engineer",
          startDate: "2023-01-01",
          endDate: "2024-01-01",
        },
      ],
    };
    const resumeQuery = mockPopulateLeanQuery(selectedResume);
    resumeFindOneMock.mockReturnValue({ populate: resumeQuery.populate });
    tryGenerateApplicationMaterialsJsonFromJDMock.mockResolvedValue({
      result: {
        resume: { name: "Generated", summary: "", experiences: [], skills: [], education: [] },
        coverLetter: { title: "Generated Cover Letter", bodyParagraphs: ["Relevant experience."] },
      },
      error: null,
    });

    const req = {
      user: { _id: "user-2" },
      body: { jdId: "jd-2", profileId: "profile-2", baseResumeId: "resume-1" },
    };
    const res = makeResponse();

    await invokeController(req, res);

    expect(resumeFindOneMock).toHaveBeenCalledWith({
      _id: "resume-1",
      userId: "user-2",
      isDeleted: { $ne: true },
    });
    expect(tryGenerateApplicationMaterialsJsonFromJDMock).toHaveBeenCalledWith(
      expect.objectContaining({
        baseResume: selectedResume,
      })
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("treats open-ended endDate variants as equivalent for matching", async () => {
    jobFindOneMock.mockReturnValue(mockLeanQuery({ _id: "jd-2b", title: "Backend Engineer", context: "JD context" }));
    profileFindOneMock.mockReturnValue(mockLeanQuery({
      _id: "profile-2b",
      fullName: "Open End",
      careerHistory: [
        {
          companyName: "Acme",
          roleTitle: "Engineer",
          startDate: "2023-01-01",
          endDate: "",
        },
      ],
    }));
    const selectedResume = {
      _id: "resume-2b",
      profileId: { _id: "profile-2b" },
      experiences: [
        {
          companyName: "Acme",
          title: "Engineer",
          startDate: "2023-01-01",
          endDate: "Present",
        },
      ],
    };
    const resumeQuery = mockPopulateLeanQuery(selectedResume);
    resumeFindOneMock.mockReturnValue({ populate: resumeQuery.populate });
    tryGenerateApplicationMaterialsJsonFromJDMock.mockResolvedValue({
      result: {
        resume: { name: "Generated", summary: "", experiences: [], skills: [], education: [] },
        coverLetter: { title: "Generated Cover Letter", bodyParagraphs: ["Relevant experience."] },
      },
      error: null,
    });

    const req = {
      user: { _id: "user-2b" },
      body: { jdId: "jd-2b", profileId: "profile-2b", baseResumeId: "resume-2b" },
    };
    const res = makeResponse();

    await invokeController(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(tryGenerateApplicationMaterialsJsonFromJDMock).toHaveBeenCalled();
  });

  it("treats concrete profile endDate and open-ended resume endDate as equivalent for matching", async () => {
    jobFindOneMock.mockReturnValue(mockLeanQuery({ _id: "jd-2c", title: "Backend Engineer", context: "JD context" }));
    profileFindOneMock.mockReturnValue(mockLeanQuery({
      _id: "profile-2c",
      fullName: "Open End",
      careerHistory: [
        {
          companyName: "Axos Bank",
          roleTitle: "Senior Engineer",
          startDate: "2025-08-01",
          endDate: "2026-03-02",
        },
      ],
    }));
    const selectedResume = {
      _id: "resume-2c",
      profileId: { _id: "profile-2c" },
      experiences: [
        {
          companyName: "Axos Bank",
          title: "Senior Engineer",
          startDate: "2025-08-01",
          endDate: "Present",
        },
      ],
    };
    const resumeQuery = mockPopulateLeanQuery(selectedResume);
    resumeFindOneMock.mockReturnValue({ populate: resumeQuery.populate });
    tryGenerateApplicationMaterialsJsonFromJDMock.mockResolvedValue({
      result: {
        resume: { name: "Generated", summary: "", experiences: [], skills: [], education: [] },
        coverLetter: { title: "Generated Cover Letter", bodyParagraphs: ["Relevant experience."] },
      },
      error: null,
    });

    const req = {
      user: { _id: "user-2c" },
      body: { jdId: "jd-2c", profileId: "profile-2c", baseResumeId: "resume-2c" },
    };
    const res = makeResponse();

    await invokeController(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(tryGenerateApplicationMaterialsJsonFromJDMock).toHaveBeenCalled();
  });

  it("rejects selected resume from another profile", async () => {
    jobFindOneMock.mockReturnValue(mockLeanQuery({ _id: "jd-3", title: "ML Engineer", context: "JD context" }));
    profileFindOneMock.mockReturnValue(mockLeanQuery({ _id: "profile-3", fullName: "Taylor Doe", careerHistory: [] }));
    const mismatchedResume = { _id: "resume-2", profileId: { _id: "profile-other" }, experiences: [] };
    const resumeQuery = mockPopulateLeanQuery(mismatchedResume);
    resumeFindOneMock.mockReturnValue({ populate: resumeQuery.populate });

    const req = {
      user: { _id: "user-3" },
      body: { jdId: "jd-3", profileId: "profile-3", baseResumeId: "resume-2" },
    };
    const res = makeResponse();

    await invokeController(req, res);

    expect(tryGenerateApplicationMaterialsJsonFromJDMock).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: "Selected resume does not belong to the selected profile",
      })
    );
  });

  it("covers scratch vs selected-resume flows at controller boundary", async () => {
    const jdDoc = { _id: "jd-4", title: "Platform Engineer", context: "JD context" };
    const profileDoc = {
      _id: "profile-4",
      fullName: "Alex Doe",
      careerHistory: [
        {
          companyName: "Globex",
          roleTitle: "Platform Engineer",
          startDate: "2022-01-01",
          endDate: "2023-01-01",
        },
      ],
    };
    jobFindOneMock.mockReturnValue(mockLeanQuery(jdDoc));
    profileFindOneMock.mockReturnValue(mockLeanQuery(profileDoc));
    tryGenerateApplicationMaterialsJsonFromJDMock.mockResolvedValue({
      result: {
        resume: { name: "Generated", summary: "", experiences: [], skills: [], education: [] },
        coverLetter: { title: "Generated Cover Letter", bodyParagraphs: ["Relevant experience."] },
      },
      error: null,
    });

    const scratchRes = makeResponse();
    await invokeController(
      { user: { _id: "user-4" }, body: { jdId: "jd-4", profileId: "profile-4" } },
      scratchRes
    );

    const selectedResume = {
      _id: "resume-4",
      profileId: { _id: "profile-4" },
      experiences: [
        {
          companyName: "Globex",
          title: "Platform Engineer",
          startDate: "2022-01-01",
          endDate: "2023-01-01",
        },
      ],
    };
    const selectedQuery = mockPopulateLeanQuery(selectedResume);
    resumeFindOneMock.mockReturnValue({ populate: selectedQuery.populate });

    const selectedRes = makeResponse();
    await invokeController(
      { user: { _id: "user-4" }, body: { jdId: "jd-4", profileId: "profile-4", baseResumeId: "resume-4" } },
      selectedRes
    );

    expect(tryGenerateApplicationMaterialsJsonFromJDMock.mock.calls[0][0].baseResume).toBeNull();
    expect(tryGenerateApplicationMaterialsJsonFromJDMock.mock.calls[1][0].baseResume).toEqual(selectedResume);
    expect(scratchRes.status).toHaveBeenCalledWith(200);
    expect(selectedRes.status).toHaveBeenCalledWith(200);
  });

  it("rejects selected resume when experience count differs from profile career history", async () => {
    jobFindOneMock.mockReturnValue(mockLeanQuery({ _id: "jd-5", title: "Data Engineer", context: "JD context" }));
    profileFindOneMock.mockReturnValue(mockLeanQuery({
      _id: "profile-5",
      fullName: "Sam Doe",
      careerHistory: [
        { companyName: "A", roleTitle: "Engineer", startDate: "2020-01-01", endDate: "2021-01-01" },
        { companyName: "B", roleTitle: "Engineer", startDate: "2021-02-01", endDate: "2022-01-01" },
      ],
    }));
    const selectedResume = {
      _id: "resume-5",
      profileId: { _id: "profile-5" },
      experiences: [
        { companyName: "A", title: "Engineer", startDate: "2020-01-01", endDate: "2021-01-01" },
      ],
    };
    const selectedQuery = mockPopulateLeanQuery(selectedResume);
    resumeFindOneMock.mockReturnValue({ populate: selectedQuery.populate });

    const res = makeResponse();
    await invokeController(
      { user: { _id: "user-5" }, body: { jdId: "jd-5", profileId: "profile-5", baseResumeId: "resume-5" } },
      res
    );

    expect(tryGenerateApplicationMaterialsJsonFromJDMock).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message:
          "Selected resume experiences must match the selected profile career history (company, role, start date, end date).",
      })
    );
  });

  it("rejects selected resume when employment keys differ even with same length", async () => {
    jobFindOneMock.mockReturnValue(mockLeanQuery({ _id: "jd-6", title: "Data Engineer", context: "JD context" }));
    profileFindOneMock.mockReturnValue(mockLeanQuery({
      _id: "profile-6",
      fullName: "Casey Doe",
      careerHistory: [
        { companyName: "Acme", roleTitle: "Engineer", startDate: "2020-01-01", endDate: "2021-01-01" },
      ],
    }));
    const selectedResume = {
      _id: "resume-6",
      profileId: { _id: "profile-6" },
      experiences: [
        { companyName: "Globex", title: "Engineer", startDate: "2020-01-01", endDate: "2021-01-01" },
      ],
    };
    const selectedQuery = mockPopulateLeanQuery(selectedResume);
    resumeFindOneMock.mockReturnValue({ populate: selectedQuery.populate });

    const res = makeResponse();
    await invokeController(
      { user: { _id: "user-6" }, body: { jdId: "jd-6", profileId: "profile-6", baseResumeId: "resume-6" } },
      res
    );

    expect(tryGenerateApplicationMaterialsJsonFromJDMock).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
