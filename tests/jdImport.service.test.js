describe("jdImport.service same-JD policy", () => {
  let service;
  let parseJobDescriptionWithLLMMock;
  let normalizeParsedJDMock;
  let getJobDescriptionEmbeddingMock;
  let findOneMock;
  let findMock;
  let updateOneMock;
  let saveMock;
  let JobDescriptionModelMock;

  const normalized = {
    title: "Senior Backend Engineer",
    company: "Acme",
    skills: ["Node.js", "AWS"],
    requirements: ["5+ years backend"],
    responsibilities: ["Build APIs"],
    niceToHave: ["Kubernetes"],
  };

  function makeFindOneChain(doc) {
    return {
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(doc),
      }),
    };
  }

  function makeFindChain(docs) {
    return {
      sort: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue(docs),
          }),
        }),
      }),
    };
  }

  beforeEach(() => {
    jest.resetModules();
    parseJobDescriptionWithLLMMock = jest.fn();
    normalizeParsedJDMock = jest.fn();
    getJobDescriptionEmbeddingMock = jest.fn();
    findOneMock = jest.fn();
    findMock = jest.fn();
    updateOneMock = jest.fn().mockResolvedValue({ acknowledged: true });
    saveMock = jest.fn().mockResolvedValue(undefined);

    JobDescriptionModelMock = jest.fn().mockImplementation(function (doc) {
      Object.assign(this, doc);
      this._id = "new-jd-id";
      this.save = saveMock;
    });
    JobDescriptionModelMock.findOne = findOneMock;
    JobDescriptionModelMock.find = findMock;
    JobDescriptionModelMock.updateOne = updateOneMock;

    jest.doMock("../utils/jdParsing", () => ({
      parseJobDescriptionWithLLM: parseJobDescriptionWithLLMMock,
      normalizeParsedJD: normalizeParsedJDMock,
      getJobDescriptionEmbedding: getJobDescriptionEmbeddingMock,
    }));
    jest.doMock("../services/findTopResumes", () => ({
      findTopResumesCore: jest.fn(),
    }));
    jest.doMock("../services/findTopProfiles", () => ({
      findTopProfilesCore: jest.fn(),
    }));
    jest.doMock("../dbModels", () => ({
      JobDescriptionModel: JobDescriptionModelMock,
    }));

    service = require("../services/jdImport.service");
  });

  it("skips LLM and reuses existing JD when exact context hash matches", async () => {
    const existing = {
      _id: { toString: () => "jd-existing-hash" },
      title: "Senior Backend Engineer",
      company: "Acme",
      skills: ["Node.js", "AWS"],
      requirements: ["5+ years backend"],
      responsibilities: ["Build APIs"],
      niceToHave: ["Kubernetes"],
      context: "Existing context",
    };
    findOneMock.mockReturnValueOnce(makeFindOneChain(existing));

    const { result, error } = await service.tryParseAndPersistJobDescription({
      userId: "user-1",
      jdContext: "Existing context",
    });

    expect(error).toBeNull();
    expect(result).toEqual({
      jdId: "jd-existing-hash",
      parsed: {
        title: existing.title,
        company: existing.company,
        skills: existing.skills,
        requirements: existing.requirements,
        responsibilities: existing.responsibilities,
        niceToHave: existing.niceToHave,
      },
    });
    expect(parseJobDescriptionWithLLMMock).not.toHaveBeenCalled();
    expect(getJobDescriptionEmbeddingMock).not.toHaveBeenCalled();
    expect(findMock).not.toHaveBeenCalled();
    expect(updateOneMock).toHaveBeenCalledWith(
      { _id: expect.objectContaining({ toString: expect.any(Function) }) },
      {
        $set: expect.objectContaining({
          context: "Existing context",
          contextHash: expect.any(String),
        }),
      }
    );
  });

  it("skips LLM and reuses near-duplicate JD by similarity threshold", async () => {
    findOneMock.mockReturnValueOnce(makeFindOneChain(null));
    findMock.mockReturnValueOnce(
      makeFindChain([
        {
          _id: { toString: () => "jd-near-dup" },
          title: "Senior Backend Engineer",
          company: "Acme",
          skills: ["Node.js", "AWS", "Kubernetes"],
          requirements: ["5+ years backend", "Microservices"],
          responsibilities: ["Build APIs"],
          niceToHave: ["CI/CD"],
          context:
            "Senior backend engineer at Acme building platform APIs and microservices. Need Node.js AWS Kubernetes CI CD distributed systems observability monitoring testing docker terraform and secure release process with mentorship and architecture ownership.",
        },
      ])
    );

    const incoming =
      "Senior Backend Engineer at Acme building platform APIs and microservices. Need Node.js AWS Kubernetes CI CD distributed systems observability monitoring testing docker terraform and secure release process with mentorship and architecture ownership.";

    const { result, error } = await service.tryParseAndPersistJobDescription({
      userId: "user-2",
      jdContext: incoming,
    });

    expect(error).toBeNull();
    expect(result).toEqual({
      jdId: "jd-near-dup",
      parsed: {
        title: "Senior Backend Engineer",
        company: "Acme",
        skills: ["Node.js", "AWS", "Kubernetes"],
        requirements: ["5+ years backend", "Microservices"],
        responsibilities: ["Build APIs"],
        niceToHave: ["CI/CD"],
      },
    });
    expect(parseJobDescriptionWithLLMMock).not.toHaveBeenCalled();
    expect(getJobDescriptionEmbeddingMock).not.toHaveBeenCalled();
    expect(updateOneMock).toHaveBeenCalledTimes(1);
  });

  it("reuses existing JD after parse when normalized hash matches", async () => {
    parseJobDescriptionWithLLMMock.mockResolvedValue({ some: "raw" });
    normalizeParsedJDMock.mockReturnValue(normalized);

    findOneMock
      .mockReturnValueOnce(makeFindOneChain(null))
      .mockReturnValueOnce(
        makeFindOneChain({
          _id: { toString: () => "jd-existing-normalized" },
        })
      );
    findMock.mockReturnValueOnce(makeFindChain([]));

    const { result, error } = await service.tryParseAndPersistJobDescription({
      userId: "user-3",
      jdContext: "Brand new text requiring parse",
    });

    expect(error).toBeNull();
    expect(result).toEqual({
      jdId: "jd-existing-normalized",
      parsed: normalized,
    });
    expect(parseJobDescriptionWithLLMMock).toHaveBeenCalledTimes(1);
    expect(findOneMock).toHaveBeenCalledWith({
      userId: "user-3",
      normalizedHash: expect.any(String),
    });
    expect(getJobDescriptionEmbeddingMock).not.toHaveBeenCalled();
    expect(JobDescriptionModelMock).not.toHaveBeenCalled();
  });

  it("reuses legacy exact-field match when normalized hash is missing", async () => {
    parseJobDescriptionWithLLMMock.mockResolvedValue({ some: "raw" });
    normalizeParsedJDMock.mockReturnValue(normalized);

    findOneMock
      .mockReturnValueOnce(makeFindOneChain(null))
      .mockReturnValueOnce(makeFindOneChain(null))
      .mockReturnValueOnce(
        makeFindOneChain({
          _id: { toString: () => "jd-existing-legacy" },
        })
      );
    findMock.mockReturnValueOnce(makeFindChain([]));

    const { result, error } = await service.tryParseAndPersistJobDescription({
      userId: "user-legacy",
      jdContext: "Legacy duplicate that needs parse before reuse",
    });

    expect(error).toBeNull();
    expect(result).toEqual({
      jdId: "jd-existing-legacy",
      parsed: normalized,
    });
    expect(parseJobDescriptionWithLLMMock).toHaveBeenCalledTimes(1);
    expect(findOneMock.mock.calls[2][0]).toEqual({
      userId: "user-legacy",
      title: normalized.title,
      company: normalized.company,
      skills: normalized.skills,
      niceToHave: normalized.niceToHave,
      requirements: normalized.requirements,
      responsibilities: normalized.responsibilities,
    });
    expect(getJobDescriptionEmbeddingMock).not.toHaveBeenCalled();
    expect(JobDescriptionModelMock).not.toHaveBeenCalled();
  });

  it("creates a new JD when no duplicate exists and stores both hashes", async () => {
    parseJobDescriptionWithLLMMock.mockResolvedValue({ some: "raw" });
    normalizeParsedJDMock.mockReturnValue(normalized);
    getJobDescriptionEmbeddingMock.mockResolvedValue([0.1, 0.2, 0.3]);

    findOneMock
      .mockReturnValueOnce(makeFindOneChain(null))
      .mockReturnValueOnce(makeFindOneChain(null))
      .mockReturnValueOnce(makeFindOneChain(null));
    findMock.mockReturnValueOnce(makeFindChain([]));

    const { result, error } = await service.tryParseAndPersistJobDescription({
      userId: "user-4",
      jdContext: "Net-new JD text",
    });

    expect(error).toBeNull();
    expect(result).toEqual({
      jdId: "new-jd-id",
      parsed: normalized,
    });
    expect(JobDescriptionModelMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-4",
        context: "Net-new JD text",
        contextHash: expect.any(String),
        normalizedHash: expect.any(String),
      })
    );
    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(getJobDescriptionEmbeddingMock).toHaveBeenCalledTimes(1);
  });

  it("persistParsedJobDescription reuses existing JD", async () => {
    normalizeParsedJDMock.mockReturnValue(normalized);
    findOneMock.mockReturnValueOnce(
      makeFindOneChain({ _id: { toString: () => "jd-existing-parser" } })
    );

    const out = await service.persistParsedJobDescription({
      userId: "user-5",
      normalized,
      context: "parser context",
    });

    expect(out).toEqual({ jdId: "jd-existing-parser" });
    expect(updateOneMock).toHaveBeenCalledWith(
      { _id: expect.objectContaining({ toString: expect.any(Function) }) },
      {
        $set: expect.objectContaining({
          context: "parser context",
          contextHash: expect.any(String),
          normalizedHash: expect.any(String),
        }),
      }
    );
    expect(getJobDescriptionEmbeddingMock).not.toHaveBeenCalled();
    expect(JobDescriptionModelMock).not.toHaveBeenCalled();
  });
});
