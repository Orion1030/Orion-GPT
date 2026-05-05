describe("resumeAI.parseTextResume controller", () => {
  let parseTextResume;
  let profileFindMock;
  let tryParseResumeTextWithLLMMock;

  function buildLeanQuery(result) {
    return {
      lean: jest.fn().mockResolvedValue(result),
    };
  }

  const makeResponse = () => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  });

  async function invokeController(req, res) {
    parseTextResume(req, res, jest.fn());
    await new Promise((resolve) => setImmediate(resolve));
  }

  beforeEach(() => {
    jest.resetModules();

    profileFindMock = jest.fn();
    tryParseResumeTextWithLLMMock = jest.fn();

    jest.doMock("../dbModels", () => ({
      JobDescriptionModel: { findOne: jest.fn() },
      ResumeModel: { findOne: jest.fn() },
      ProfileModel: {
        find: profileFindMock,
        findOne: jest.fn(),
      },
    }));

    jest.doMock("../utils/resumeGeneration", () => ({
      tryGenerateResumeJsonFromJD: jest.fn(),
    }));
    jest.doMock("../services/llm/resumeRefine.service", () => ({
      tryRefineResumeWithFeedback: jest.fn(),
    }));
    jest.doMock("../utils/parseResume", () => ({
      tryParseResumeTextWithLLM: tryParseResumeTextWithLLMMock,
    }));
    jest.doMock("../services/jdImport.service", () => ({
      resolveJdContext: jest.fn(),
      tryParseAndPersistJobDescription: jest.fn(),
      tryFindTopResumesForJobDescription: jest.fn(),
      tryFindTopProfilesForJobDescription: jest.fn(),
      toPublicParsedJD: jest.fn(),
    }));

    ({ parseTextResume } = require("../controllers/resumeAI.controller"));
  });

  it("anchors parsed experience periods to the best-matched profile career history", async () => {
    tryParseResumeTextWithLLMMock.mockResolvedValue({
      result: {
        parsed: {
          name: "Jane Doe",
          summary: "Imported summary",
          experiences: [
            {
              title: "Engineer",
              companyName: "Acme",
              summary: "Imported experience summary",
              descriptions: ["Imported bullet"],
              startDate: "2023-06-01",
              endDate: "2024-10-01",
            },
          ],
          skills: [],
          education: [],
        },
      },
      error: null,
    });

    profileFindMock.mockReturnValue(
      buildLeanQuery([
        {
          _id: "profile-1",
          fullName: "Jane Doe",
          careerHistory: [
            {
              companyName: "Acme",
              roleTitle: "Engineer",
              startDate: "2023-01-01",
              endDate: "2024-01-01",
              companySummary: "Profile summary",
              keyPoints: ["Profile bullet"],
            },
          ],
        },
      ])
    );

    const req = {
      user: { _id: "user-1" },
      body: { text: "resume text payload" },
    };
    const res = makeResponse();

    await invokeController(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload.success).toBe(true);
    expect(payload.data.bestMatch.profileId).toBe("profile-1");
    expect(payload.data.parsed.experiences).toHaveLength(1);
    expect(payload.data.parsed.experiences[0].startDate).toBe("2023-01-01");
    expect(payload.data.parsed.experiences[0].endDate).toBe("2024-01-01");
    expect(payload.data.parsed.experiences[0].descriptions).toEqual(
      expect.arrayContaining(["Imported bullet"])
    );
  });

  it("normalizes mixed imported date styles before returning parsed resume data", async () => {
    tryParseResumeTextWithLLMMock.mockResolvedValue({
      result: {
        parsed: {
          name: "Jordan Example",
          summary: "Imported summary",
          experiences: [
            {
              title: "Senior Data Platform Engineer | Aug 2025 - Present",
              companyName: "Axos Bank",
              descriptions: ["Built data platforms"],
              startDate: "",
              endDate: "",
            },
            {
              title: "Senior Data Engineer",
              companyName: "Restaurant365",
              descriptions: ["Modernized ETL"],
              startDate: "01/2025",
              endDate: "07/2025",
            },
          ],
          skills: [],
          education: [
            {
              degreeLevel: "Bachelor of Science",
              universityName: "The University of Texas at Austin | 2013-2017",
              major: "Computer Science",
              startDate: "",
              endDate: "",
            },
          ],
        },
      },
      error: null,
    });

    profileFindMock.mockReturnValue(buildLeanQuery([]));

    const req = {
      user: { _id: "user-2" },
      body: { text: "resume text payload" },
    };
    const res = makeResponse();

    await invokeController(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload.success).toBe(true);
    expect(payload.data.bestMatch).toBeNull();
    expect(payload.data.parsed.experiences[0]).toEqual(
      expect.objectContaining({
        title: "Senior Data Platform Engineer",
        startDate: "2025-08",
        endDate: "Present",
      })
    );
    expect(payload.data.parsed.experiences[1]).toEqual(
      expect.objectContaining({
        startDate: "2025-01",
        endDate: "2025-07",
      })
    );
    expect(payload.data.parsed.education[0]).toEqual(
      expect.objectContaining({
        universityName: "The University of Texas at Austin",
        startDate: "2013",
        endDate: "2017",
      })
    );
    expect(payload.data.createNewProfileSuggested).toBe(true);
  });

  it("parses resume JSON directly without calling the LLM parser", async () => {
    profileFindMock.mockReturnValue(buildLeanQuery([]));

    const req = {
      user: { _id: "user-json" },
      body: {
        text: JSON.stringify({
          name: "Direct JSON Resume",
          summary: "Imported from structured JSON.",
          experiences: [
            {
              roleTitle: "Platform Engineer",
              company: "SchemaCo",
              bullets: ["Built reliable services"],
              start: "2022-01",
              end: "Present",
            },
          ],
          skills: ["Node.js", "MongoDB"],
          education: [
            {
              degree: "BS",
              school: "State University",
              field: "Computer Science",
            },
          ],
          unexpectedField: "ignored",
        }),
      },
    };
    const res = makeResponse();

    await invokeController(req, res);

    expect(tryParseResumeTextWithLLMMock).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload.success).toBe(true);
    expect(payload.data.parseSource).toBe("json");
    expect(payload.data.parsed).toEqual(
      expect.objectContaining({
        name: "Direct JSON Resume",
        summary: "Imported from structured JSON.",
      })
    );
    expect(payload.data.parsed.experiences[0]).toEqual(
      expect.objectContaining({
        title: "Platform Engineer",
        companyName: "SchemaCo",
        descriptions: ["Built reliable services"],
        startDate: "2022-01",
        endDate: "Present",
      })
    );
    expect(payload.data.parsed.skills).toEqual([
      { title: "Skills", items: ["Node.js", "MongoDB"] },
    ]);
    expect(payload.data.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("unexpectedField"),
      ])
    );
  });

  it("returns a schema error for malformed JSON instead of falling back to LLM", async () => {
    const req = {
      user: { _id: "user-json" },
      body: { text: '{ "name": "Broken Resume", "experiences": [' },
    };
    const res = makeResponse();

    await invokeController(req, res);

    expect(tryParseResumeTextWithLLMMock).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    const payload = res.json.mock.calls[0][0];
    expect(payload.success).toBe(false);
    expect(payload.message).toMatch(/Invalid JSON/);
    expect(payload.data.schema).toBeTruthy();
  });
});
