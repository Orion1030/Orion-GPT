const { RoleLevels } = require("../utils/constants");

describe("template.controller generateTemplateWithAi", () => {
  let generateTemplateWithAi;
  let tryGenerateTemplateWithAiMock;

  const makeResponse = () => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  });

  async function invoke(req, res) {
    generateTemplateWithAi(req, res, jest.fn());
    await new Promise((resolve) => setImmediate(resolve));
  }

  beforeEach(() => {
    jest.resetModules();
    tryGenerateTemplateWithAiMock = jest.fn();

    jest.doMock("../dbModels", () => ({
      TemplateModel: {},
    }));
    jest.doMock("../utils/builtInTemplates", () => ({
      getBuiltInSeedTemplates: jest.fn(() => []),
    }));
    jest.doMock("../utils/templatePolicy", () => ({
      validateTemplateWrite: jest.fn(() => ({ ok: true })),
    }));
    jest.doMock("../services/llm/templateGenerate.service", () => ({
      MAX_PROMPT_LENGTH: 4000,
      MAX_TEMPLATE_CONTEXT_LENGTH: 60000,
      tryGenerateTemplateWithAi: tryGenerateTemplateWithAiMock,
    }));

    ({ generateTemplateWithAi } = require("../controllers/template.controller"));
  });

  test("rejects non-admin users", async () => {
    const res = makeResponse();

    await invoke(
      {
        user: { _id: "user-1", role: RoleLevels.User },
        body: {
          prompt: "Create a modern template",
          currentTemplateHtml: "<html><body><%= fullName %></body></html>",
        },
      },
      res,
    );

    expect(tryGenerateTemplateWithAiMock).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: "Only Admin can generate EJS templates",
      }),
    );
  });

  test("rejects a missing prompt", async () => {
    const res = makeResponse();

    await invoke(
      {
        user: { _id: "admin-1", role: RoleLevels.ADMIN },
        body: {
          prompt: "  ",
          currentTemplateHtml: "<html><body><%= fullName %></body></html>",
        },
      },
      res,
    );

    expect(tryGenerateTemplateWithAiMock).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: "Prompt is required",
      }),
    );
  });

  test("returns the generated template for admins", async () => {
    const generated = {
      name: "AI Template",
      description: "Generated",
      layoutMode: "single",
      data: "<html><body><%= fullName %></body></html>",
      templateEngine: "ejs",
      migrationStatus: "ready",
    };
    tryGenerateTemplateWithAiMock.mockResolvedValue({
      result: { template: generated },
      error: null,
    });
    const res = makeResponse();

    await invoke(
      {
        user: { _id: "admin-1", role: RoleLevels.ADMIN },
        body: {
          prompt: "Create a modern template",
          currentTemplateHtml: "<html><body><%= fullName %></body></html>",
          currentName: "Classic",
          currentDescription: "Starter",
          layoutMode: "single",
        },
      },
      res,
    );

    expect(tryGenerateTemplateWithAiMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "Create a modern template",
        targetUserId: "admin-1",
      }),
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: generated,
      }),
    );
  });

  test("surfaces AI validation errors", async () => {
    tryGenerateTemplateWithAiMock.mockResolvedValue({
      result: null,
      error: {
        message: "Generated template still contains legacy {{...}} syntax",
        statusCode: 502,
      },
    });
    const res = makeResponse();

    await invoke(
      {
        user: { _id: "admin-1", role: RoleLevels.ADMIN },
        body: {
          prompt: "Create a modern template",
          currentTemplateHtml: "<html><body><%= fullName %></body></html>",
        },
      },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: "Generated template still contains legacy {{...}} syntax",
      }),
    );
  });
});
