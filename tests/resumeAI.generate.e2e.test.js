const express = require("express");
const supertest = require("supertest");

describe("POST /api/resume/generate-resume (route e2e)", () => {
  let request;
  let jobFindOneMock;
  let profileFindOneMock;
  let resumeFindOneMock;
  let tryGenerateResumeJsonFromJDMock;

  function mockLeanQuery(value) {
    return { lean: jest.fn().mockResolvedValue(value) };
  }

  function mockPopulateLeanQuery(value) {
    const lean = jest.fn().mockResolvedValue(value);
    const populate = jest.fn().mockReturnValue({ lean });
    return { populate, lean };
  }

  beforeEach(() => {
    jest.resetModules();

    jobFindOneMock = jest.fn();
    profileFindOneMock = jest.fn();
    resumeFindOneMock = jest.fn();
    tryGenerateResumeJsonFromJDMock = jest.fn();

    jest.doMock("../middlewares/auth.middleware", () => ({
      isAuthenticatedUser: (req, _res, next) => {
        req.user = { _id: "user-e2e", role: "1" };
        next();
      },
      permit: () => (_req, _res, next) => next(),
    }));

    jest.doMock("../middlewares/requireNoRunningJob", () => ({
      requireNoRunningJob: (_req, _res, next) => next(),
      requireNoRunningJobOfType: () => (_req, _res, next) => next(),
    }));

    jest.doMock("../middlewares/validate", () => ({
      validate: (_req, _res, next) => next(),
    }));

    jest.doMock("../validators/resume.validator", () => ({
      createResumeRules: [],
      generateResumeRules: [],
      refineResumeRules: [],
      jdParsingRules: [],
      parseJdRules: [],
      matchResumesRules: [],
    }));

    jest.doMock("../dbModels", () => ({
      JobDescriptionModel: { findOne: jobFindOneMock },
      ResumeModel: { findOne: resumeFindOneMock },
      ProfileModel: { findOne: profileFindOneMock },
    }));

    jest.doMock("../utils/resumeGeneration", () => ({
      tryGenerateResumeJsonFromJD: tryGenerateResumeJsonFromJDMock,
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

    const resumeRoute = require("../routes/resume.route");
    const app = express();
    app.use(express.json());
    app.use("/api/resume", resumeRoute);
    request = supertest(app);
  });

  it("supports from-scratch generation without auto-loading a base resume", async () => {
    jobFindOneMock.mockReturnValue(mockLeanQuery({ _id: "jd-1", title: "Data Engineer", context: "JD context" }));
    profileFindOneMock.mockReturnValue(
      mockLeanQuery({ _id: "profile-1", fullName: "Jane Doe", careerHistory: [] })
    );
    tryGenerateResumeJsonFromJDMock.mockResolvedValue({
      result: { resume: { name: "Generated", summary: "", experiences: [], skills: [], education: [] } },
      error: null,
    });

    const res = await request.post("/api/resume/generate-resume").send({
      jdId: "jd-1",
      profileId: "profile-1",
    });

    expect(res.status).toBe(200);
    expect(res.body?.success).toBe(true);
    expect(resumeFindOneMock).not.toHaveBeenCalled();
  });

  it("supports selected-resume generation when profile employment keys match", async () => {
    jobFindOneMock.mockReturnValue(mockLeanQuery({ _id: "jd-2", title: "Backend Engineer", context: "JD context" }));
    profileFindOneMock.mockReturnValue(
      mockLeanQuery({
        _id: "profile-2",
        fullName: "John Doe",
        careerHistory: [
          { companyName: "Acme", roleTitle: "Engineer", startDate: "2023-01-01", endDate: "2024-01-01" },
        ],
      })
    );
    const selectedResume = {
      _id: "resume-2",
      profileId: { _id: "profile-2" },
      experiences: [{ companyName: "Acme", title: "Engineer", startDate: "2023-01-01", endDate: "2024-01-01" }],
    };
    const selectedQuery = mockPopulateLeanQuery(selectedResume);
    resumeFindOneMock.mockReturnValue({ populate: selectedQuery.populate });
    tryGenerateResumeJsonFromJDMock.mockResolvedValue({
      result: { resume: { name: "Generated", summary: "", experiences: [], skills: [], education: [] } },
      error: null,
    });

    const res = await request.post("/api/resume/generate-resume").send({
      jdId: "jd-2",
      profileId: "profile-2",
      baseResumeId: "resume-2",
    });

    expect(res.status).toBe(200);
    expect(res.body?.success).toBe(true);
  });

  it("supports selected-resume generation when only endDate differs as concrete vs open", async () => {
    jobFindOneMock.mockReturnValue(mockLeanQuery({ _id: "jd-2b", title: "Backend Engineer", context: "JD context" }));
    profileFindOneMock.mockReturnValue(
      mockLeanQuery({
        _id: "profile-2b",
        fullName: "John Doe",
        careerHistory: [
          { companyName: "Axos Bank", roleTitle: "Senior Engineer", startDate: "2025-08-01", endDate: "2026-03-02" },
        ],
      })
    );
    const selectedResume = {
      _id: "resume-2b",
      profileId: { _id: "profile-2b" },
      experiences: [{ companyName: "Axos Bank", title: "Senior Engineer", startDate: "2025-08-01", endDate: "Present" }],
    };
    const selectedQuery = mockPopulateLeanQuery(selectedResume);
    resumeFindOneMock.mockReturnValue({ populate: selectedQuery.populate });
    tryGenerateResumeJsonFromJDMock.mockResolvedValue({
      result: { resume: { name: "Generated", summary: "", experiences: [], skills: [], education: [] } },
      error: null,
    });

    const res = await request.post("/api/resume/generate-resume").send({
      jdId: "jd-2b",
      profileId: "profile-2b",
      baseResumeId: "resume-2b",
    });

    expect(res.status).toBe(200);
    expect(res.body?.success).toBe(true);
  });

  it("rejects selected resume when profile and resume employments do not match", async () => {
    jobFindOneMock.mockReturnValue(mockLeanQuery({ _id: "jd-3", title: "ML Engineer", context: "JD context" }));
    profileFindOneMock.mockReturnValue(
      mockLeanQuery({
        _id: "profile-3",
        fullName: "Taylor Doe",
        careerHistory: [
          { companyName: "Acme", roleTitle: "Engineer", startDate: "2020-01-01", endDate: "2021-01-01" },
        ],
      })
    );
    const mismatchResume = {
      _id: "resume-3",
      profileId: { _id: "profile-3" },
      experiences: [{ companyName: "Globex", title: "Engineer", startDate: "2020-01-01", endDate: "2021-01-01" }],
    };
    const selectedQuery = mockPopulateLeanQuery(mismatchResume);
    resumeFindOneMock.mockReturnValue({ populate: selectedQuery.populate });

    const res = await request.post("/api/resume/generate-resume").send({
      jdId: "jd-3",
      profileId: "profile-3",
      baseResumeId: "resume-3",
    });

    expect(res.status).toBe(400);
    expect(res.body?.success).toBe(false);
    expect(String(res.body?.message || "")).toContain("must match the selected profile career history");
    expect(tryGenerateResumeJsonFromJDMock).not.toHaveBeenCalled();
  });
});
