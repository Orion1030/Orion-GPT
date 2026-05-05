describe("profileImport.service parseProfileImportText", () => {
  let parseProfileImportText;
  let tryParseResumeTextWithLLMMock;
  let buildReadableProfileFilterForUserMock;
  let profileFindMock;
  let stackFindMock;

  function buildLeanQuery(result) {
    return {
      lean: jest.fn().mockResolvedValue(result),
    };
  }

  function buildSelectLeanQuery(result) {
    return {
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(result),
      }),
    };
  }

  beforeEach(() => {
    jest.resetModules();

    tryParseResumeTextWithLLMMock = jest.fn();
    buildReadableProfileFilterForUserMock = jest.fn();
    profileFindMock = jest.fn();
    stackFindMock = jest.fn();

    jest.doMock("../utils/parseResume", () => ({
      tryParseResumeTextWithLLM: tryParseResumeTextWithLLMMock,
    }));
    jest.doMock("../services/profileAccess.service", () => ({
      buildReadableProfileFilterForUser: buildReadableProfileFilterForUserMock,
    }));
    jest.doMock("../dbModels", () => ({
      ProfileModel: { find: profileFindMock },
      StackModel: { find: stackFindMock },
    }));

    ({ parseProfileImportText } = require("../services/profileImport.service"));
  });

  it("builds a profile-shaped draft, stack suggestions, and high-confidence matches", async () => {
    tryParseResumeTextWithLLMMock.mockResolvedValue({
      result: {
        parsed: {
          name: "Jane Doe",
          summary: "Senior data engineer building reliable pipelines.",
          experiences: [
            {
              title: "Senior Data Engineer",
              companyName: "Acme",
              descriptions: ["Built batch pipelines on AWS and Spark"],
              startDate: "2021-01",
              endDate: "Present",
            },
          ],
          skills: [
            {
              title: "Skills",
              items: ["Python", "AWS", "Spark", "SQL"],
            },
          ],
          education: [
            {
              degreeLevel: "BS",
              universityName: "State University",
              major: "Computer Science",
              startDate: "2015",
              endDate: "2019",
            },
          ],
        },
      },
      error: null,
    });

    buildReadableProfileFilterForUserMock.mockResolvedValue({ userId: "user-1" });
    profileFindMock.mockReturnValue(
      buildLeanQuery([
        {
          _id: "profile-1",
          fullName: "Jane Doe",
          title: "Senior Data Engineer",
          mainStack: "Data Engineering",
          contactInfo: {
            email: "jane.doe@example.com",
            linkedin: "https://linkedin.com/in/jane-doe",
          },
          careerHistory: [
            {
              companyName: "Acme",
              roleTitle: "Senior Data Engineer",
              startDate: "2021-01",
              endDate: "",
            },
          ],
        },
      ])
    );
    stackFindMock.mockReturnValue(
      buildSelectLeanQuery([
        {
          _id: "stack-1",
          title: "Data Engineering",
          primarySkills: ["Python", "SQL", "Spark"],
          SecondarySkills: ["AWS", "Airflow"],
        },
        {
          _id: "stack-2",
          title: "Frontend",
          primarySkills: ["React", "TypeScript"],
          SecondarySkills: ["CSS"],
        },
      ])
    );

    const { result, error } = await parseProfileImportText({
      actor: { _id: "user-1", role: 3 },
      text: [
        "Jane Doe",
        "Senior Data Engineer | Data Platform",
        "jane.doe@example.com",
        "linkedin.com/in/jane-doe",
        "github.com/jdoe",
        "www.janedoe.dev",
        "(312) 555-1234",
        "Chicago, IL 60601",
      ].join("\n"),
    });

    expect(error).toBeNull();
    expect(buildReadableProfileFilterForUserMock).toHaveBeenCalledWith(
      "user-1",
      {},
      { isGuest: false }
    );
    expect(result.draft).toEqual(
      expect.objectContaining({
        fullName: "Jane Doe",
        title: "Senior Data Engineer",
        stackId: "stack-1",
        mainStack: "Data Engineering",
        link: "https://linkedin.com/in/jane-doe",
        isReadyForCreate: true,
      })
    );
    expect(result.draft.titleCandidates).toEqual(
      expect.arrayContaining(["Senior Data Engineer"])
    );
    expect(result.draft.contactInfo).toEqual(
      expect.objectContaining({
        email: "jane.doe@example.com",
        phone: "(312) 555-1234",
        linkedin: "https://linkedin.com/in/jane-doe",
        github: "https://github.com/jdoe",
        website: "https://www.janedoe.dev",
        address: "Chicago, IL 60601",
      })
    );
    expect(result.draft.inferredSkills).toEqual(
      expect.arrayContaining(["python", "AWS", "Spark", "SQL"])
    );
    expect(result.draft.stackSuggestions[0]).toEqual(
      expect.objectContaining({
        stackId: "stack-1",
        title: "Data Engineering",
      })
    );
    expect(result.bestMatch).toEqual(
      expect.objectContaining({
        profileId: "profile-1",
      })
    );
    expect(result.createNewProfileSuggested).toBe(false);
  });

  it("falls back to a likely name and flags missing required profile fields", async () => {
    tryParseResumeTextWithLLMMock.mockResolvedValue({
      result: {
        parsed: {
          name: "",
          summary: "Generalist professional",
          experiences: [],
          skills: [],
          education: [],
        },
      },
      error: null,
    });

    buildReadableProfileFilterForUserMock.mockResolvedValue({ userId: "user-2" });
    profileFindMock.mockReturnValue(buildLeanQuery([]));
    stackFindMock.mockReturnValue(
      buildSelectLeanQuery([
        {
          _id: "stack-3",
          title: "Frontend",
          primarySkills: ["React", "TypeScript"],
          SecondarySkills: ["CSS"],
        },
      ])
    );

    const { result, error } = await parseProfileImportText({
      actor: { _id: "user-2", role: 3 },
      text: ["Jordan Example", "Generalist professional", "Remote"].join("\n"),
    });

    expect(error).toBeNull();
    expect(result.draft.fullName).toBe("Jordan Example");
    expect(result.draft.title).toBe("");
    expect(result.draft.titleCandidates).toEqual([]);
    expect(result.draft.stackId).toBeNull();
    expect(result.draft.contactInfo.address).toBe("Remote");
    expect(result.draft.missingRequiredFields).toEqual(
      expect.arrayContaining(["title", "stackId"])
    );
    expect(result.draft.isReadyForCreate).toBe(false);
    expect(result.draft.warnings).toEqual(
      expect.arrayContaining([
        "Contact details were not confidently detected from the resume text.",
        "No strong stack suggestion could be inferred from the imported resume.",
      ])
    );
    expect(result.bestMatch).toBeNull();
    expect(result.createNewProfileSuggested).toBe(true);
  });

  it("normalizes imported experience and education periods from mixed raw date styles", async () => {
    tryParseResumeTextWithLLMMock.mockResolvedValue({
      result: {
        parsed: {
          name: "Taylor Example",
          summary: "Data engineer",
          experiences: [
            {
              title: "Senior Data Engineer",
              companyName: "Restaurant365",
              descriptions: ["Modernized ETL"],
              startDate: "01/2025",
              endDate: "07/2025",
            },
            {
              title: "Senior Data Platform Engineer | Aug. 2025 - Present",
              companyName: "Axos Bank",
              descriptions: ["Built data pipelines"],
              startDate: "",
              endDate: "",
            },
          ],
          skills: [],
          education: [
            {
              degreeLevel: "Bachelor of Science",
              universityName:
                "The University of Texas at Austin | 09/2013 - 05/2017",
              major: "Computer Science",
              startDate: "",
              endDate: "",
            },
          ],
        },
      },
      error: null,
    });

    buildReadableProfileFilterForUserMock.mockResolvedValue({ userId: "user-3" });
    profileFindMock.mockReturnValue(buildLeanQuery([]));
    stackFindMock.mockReturnValue(buildSelectLeanQuery([]));

    const { result, error } = await parseProfileImportText({
      actor: { _id: "user-3", role: 3 },
      text: "Taylor Example\nSenior Data Engineer",
    });

    expect(error).toBeNull();
    expect(result.draft.careerHistory[0]).toEqual(
      expect.objectContaining({
        roleTitle: "Senior Data Platform Engineer",
        startDate: "2025-08",
        endDate: "Present",
      })
    );
    expect(result.draft.careerHistory[1]).toEqual(
      expect.objectContaining({
        startDate: "2025-01",
        endDate: "2025-07",
      })
    );
    expect(result.draft.educations[0]).toEqual(
      expect.objectContaining({
        universityName: "The University of Texas at Austin",
        startDate: "2013-09",
        endDate: "2017-05",
      })
    );
  });
});
