describe("resumeAI.extractResumeText controller", () => {
  let extractResumeText;
  let formidableMock;
  let readFileMock;
  let unlinkMock;
  let pdfParserGetTextMock;
  let pdfParserDestroyMock;
  let PDFParseMock;

  const makeResponse = () => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  });

  async function invokeController(controller, req, res) {
    controller(req, res, jest.fn());
    await new Promise((resolve) => setImmediate(resolve));
  }

  beforeEach(() => {
    jest.resetModules();

    formidableMock = jest.fn();
    readFileMock = jest.fn();
    unlinkMock = jest.fn().mockResolvedValue(undefined);
    pdfParserGetTextMock = jest.fn();
    pdfParserDestroyMock = jest.fn().mockResolvedValue(undefined);
    PDFParseMock = jest.fn().mockImplementation(() => ({
      getText: pdfParserGetTextMock,
      destroy: pdfParserDestroyMock,
    }));

    jest.doMock("formidable", () => ({
      formidable: formidableMock,
    }));
    jest.doMock("fs/promises", () => ({
      readFile: readFileMock,
      unlink: unlinkMock,
    }));
    jest.doMock("pdf-parse", () => ({
      PDFParse: PDFParseMock,
    }));

    jest.doMock("../dbModels", () => ({
      JobDescriptionModel: { findOne: jest.fn() },
      ResumeModel: { findOne: jest.fn() },
      ProfileModel: {
        find: jest.fn(),
        findOne: jest.fn(),
      },
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

    ({ extractResumeText } = require("../controllers/resumeAI.controller"));
  });

  it("extracts plain text from a text-based PDF upload", async () => {
    formidableMock.mockReturnValue({
      parse: (_req, callback) =>
        callback(null, {}, {
          file: {
            filepath: "C:\\temp\\resume.pdf",
            originalFilename: "resume.pdf",
            mimetype: "application/pdf",
          },
        }),
    });
    readFileMock.mockResolvedValue(Buffer.from("%PDF-sample"));
    pdfParserGetTextMock.mockResolvedValue({
      text: "Jane Doe\nSenior Data Engineer",
      total: 2,
    });

    const req = { user: { _id: "user-1" } };
    const res = makeResponse();

    await invokeController(extractResumeText, req, res);

    expect(readFileMock).toHaveBeenCalledWith("C:\\temp\\resume.pdf");
    expect(unlinkMock).toHaveBeenCalledWith("C:\\temp\\resume.pdf");
    expect(PDFParseMock).toHaveBeenCalledWith({
      data: Buffer.from("%PDF-sample"),
    });
    expect(pdfParserDestroyMock).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          fileName: "resume.pdf",
          pageCount: 2,
          text: "Jane Doe\nSenior Data Engineer",
        }),
      })
    );
  });

  it("returns a friendly error when the PDF has no selectable text", async () => {
    formidableMock.mockReturnValue({
      parse: (_req, callback) =>
        callback(null, {}, {
          file: {
            filepath: "C:\\temp\\scan.pdf",
            originalFilename: "scan.pdf",
            mimetype: "application/pdf",
          },
        }),
    });
    readFileMock.mockResolvedValue(Buffer.from("%PDF-empty"));
    pdfParserGetTextMock.mockResolvedValue({
      text: "   ",
      total: 1,
    });

    const req = { user: { _id: "user-2" } };
    const res = makeResponse();

    await invokeController(extractResumeText, req, res);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(pdfParserDestroyMock).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: expect.stringContaining("No selectable text"),
      })
    );
  });
});
