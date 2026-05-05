describe('openaiClient responsesCreate', () => {
  const originalFetch = global.fetch;
  const originalApiKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    jest.resetModules();
    process.env.OPENAI_API_KEY = 'test-openai-key';
    global.fetch = jest.fn();
  });

  afterEach(() => {
    if (originalFetch === undefined) {
      delete global.fetch;
    } else {
      global.fetch = originalFetch;
    }
    if (originalApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalApiKey;
    }
  });

  it('does not send temperature to responses API unless explicitly provided', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          id: 'resp_123',
          usage: { total_tokens: 12, input_tokens: 7, output_tokens: 5 },
          output: [],
        }),
    });

    const { responsesCreate } = require('../services/llm/openaiClient');

    await responsesCreate({
      model: 'gpt-5.2',
      input: [{ role: 'user', content: 'hello' }],
      max_output_tokens: 100,
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [, options] = global.fetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.temperature).toBeUndefined();
  });

  it('retries without temperature when the model rejects it', async () => {
    global.fetch
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: async () =>
          JSON.stringify({
            error: {
              message: "Unsupported parameter: 'temperature' is not supported with this model.",
              type: 'invalid_request_error',
              param: 'temperature',
              code: null,
            },
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            id: 'resp_456',
            usage: { total_tokens: 9, input_tokens: 4, output_tokens: 5 },
            output: [],
          }),
      });

    const { responsesCreate } = require('../services/llm/openaiClient');

    const result = await responsesCreate({
      model: 'gpt-5.2',
      input: [{ role: 'user', content: 'hello' }],
      temperature: 0,
      max_output_tokens: 100,
    });

    expect(result.id).toBe('resp_456');
    expect(global.fetch).toHaveBeenCalledTimes(2);

    const firstBody = JSON.parse(global.fetch.mock.calls[0][1].body);
    const secondBody = JSON.parse(global.fetch.mock.calls[1][1].body);

    expect(firstBody.temperature).toBe(0);
    expect(secondBody.temperature).toBeUndefined();
  });
});
