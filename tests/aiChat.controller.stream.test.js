const savedMessages = []
const storedMessages = []
const mockTokenPayloads = []
const mockContextTokenPayloads = []
let mockReadTurnPayload = null
let mockSession = null

jest.mock('../middlewares/asyncErrorHandler', () => (fn) => fn)

jest.mock('../dbModels', () => {
  function buildQuery(value) {
    return {
      select: jest.fn(() => buildQuery(value)),
      populate: jest.fn(() => buildQuery(value)),
      lean: jest.fn(async () => value),
      then(resolve, reject) {
        return Promise.resolve(value).then(resolve, reject)
      },
      catch(reject) {
        return Promise.resolve(value).catch(reject)
      },
    }
  }

  function matchesFilter(message, filter = {}) {
    return Object.entries(filter).every(([key, value]) => {
      if (key === 'createdAt' && value?.$gt) {
        return new Date(message.createdAt) > new Date(value.$gt)
      }
      return String(message[key]) === String(value)
    })
  }

  function ChatMessageModel(doc = {}) {
    Object.assign(this, doc)
    this._id = doc.role === 'assistant' ? 'assistant-message-1' : 'user-message-1'
    this.createdAt = new Date()
    this.save = jest.fn(async () => {
      savedMessages.push({ ...this })
      storedMessages.push({
        _id: this._id,
        sessionId: this.sessionId,
        role: this.role,
        content: this.content,
        turnId: this.turnId || null,
        createdAt: this.createdAt,
        structuredAssistantPayload: this.structuredAssistantPayload || null,
      })
    })
  }

  ChatMessageModel.find = jest.fn(() => ({
    sort: jest.fn(() => ({
      lean: jest.fn(async () => storedMessages),
    })),
  }))
  ChatMessageModel.findOne = jest.fn((filter = {}) => ({
    lean: jest.fn(async () => storedMessages.find((message) => matchesFilter(message, filter)) || null),
  }))
  ChatMessageModel.updateOne = jest.fn(async (filter = {}, update = {}, options = {}) => {
    if (options.upsert && update.$setOnInsert) {
      const existing = storedMessages.find((message) => matchesFilter(message, filter))
      if (existing) {
        return { acknowledged: true, matchedCount: 1, modifiedCount: 0, upsertedCount: 0 }
      }
      const doc = {
        _id: `${update.$setOnInsert.role}-message-${storedMessages.length + 1}`,
        ...update.$setOnInsert,
        createdAt: new Date(),
      }
      storedMessages.push(doc)
      savedMessages.push({ ...doc })
      return {
        acknowledged: true,
        matchedCount: 0,
        modifiedCount: 0,
        upsertedCount: 1,
        upsertedId: doc._id,
      }
    }
    const existing = storedMessages.find((message) => matchesFilter(message, filter))
    if (existing && update.$set) {
      Object.assign(existing, update.$set)
    }
    return { acknowledged: true, matchedCount: existing ? 1 : 0, modifiedCount: existing ? 1 : 0 }
  })
  ChatMessageModel.deleteMany = jest.fn(async (filter = {}) => {
    const before = storedMessages.length
    for (let index = storedMessages.length - 1; index >= 0; index -= 1) {
      if (matchesFilter(storedMessages[index], filter)) {
        storedMessages.splice(index, 1)
      }
    }
    return { acknowledged: true, deletedCount: before - storedMessages.length }
  })

  const ChatSessionModel = {
    findOne: jest.fn(() => buildQuery(mockSession)),
    updateOne: jest.fn(async () => ({})),
    findOneAndUpdate: jest.fn((_filter, update = {}) => {
      if (mockSession && update.$set) {
        mockSession = { ...mockSession, ...update.$set }
      }
      return buildQuery(mockSession)
    }),
    deleteOne: jest.fn(async () => ({ deletedCount: mockSession ? 1 : 0 })),
  }

  return {
    ApplicationModel: { findOne: jest.fn() },
    ChatSessionModel,
    ChatMessageModel,
    ProfileModel: { findOne: jest.fn() },
    JobDescriptionModel: { findOne: jest.fn() },
    ResumeModel: { findOne: jest.fn() },
  }
})

jest.mock('../services/aiChatTurnToken.service', () => ({
  createContextToken: jest.fn((payload) => {
    mockContextTokenPayloads.push({ ...payload, tokenType: 'ai-chat-context' })
    return 'context-token'
  }),
  createTurnToken: jest.fn((payload) => {
    mockTokenPayloads.push(payload)
    return 'prepared-token'
  }),
  readTurnToken: jest.fn(() => mockTokenPayloads[mockTokenPayloads.length - 1] || mockReadTurnPayload),
}))

jest.mock('../services/llm/chatResponder.service', () => ({
  streamChatReply: jest.fn(async function* streamChatReply() {
    yield 'Hel'
    yield 'lo'
  }),
  tryGetChatReply: jest.fn(),
}))

jest.mock('../services/profileAccess.service', () => ({
  buildReadableProfileFilterForUser: jest.fn(async (_userId, filter) => filter),
}))

function createResponse() {
  const writes = []
  return {
    writes,
    writableEnded: false,
    destroyed: false,
    status: jest.fn(function status() {
      return this
    }),
    setHeader: jest.fn(),
    flushHeaders: jest.fn(),
    write: jest.fn((chunk) => {
      writes.push(chunk)
    }),
    json: jest.fn(function json(payload) {
      this.payload = payload
      return this
    }),
    end: jest.fn(function end() {
      this.writableEnded = true
    }),
  }
}

function parseSseWrites(writes) {
  return writes
    .filter((chunk) => String(chunk).startsWith('data:'))
    .map((chunk) => JSON.parse(String(chunk).replace(/^data:\s*/, '').trim()))
}

describe('aiChat.controller streamMessage', () => {
  beforeEach(() => {
    savedMessages.length = 0
    storedMessages.length = 0
    mockTokenPayloads.length = 0
    mockContextTokenPayloads.length = 0
    mockSession = {
      _id: 'session-1',
      userId: 'user-1',
      title: 'New Chat',
    }
    mockReadTurnPayload = {
      turnId: 'turn-1',
      sessionId: 'session-1',
      sessionUserId: 'user-1',
      actorUserId: 'user-1',
      text: 'Hello?',
      assistantMessageId: 'stream-turn-1',
      apiMessages: [
        { role: 'system', content: 'System prompt' },
        { role: 'user', content: 'Hello?' },
      ],
    }
    jest.clearAllMocks()
  })

  it('streams assistant tokens from a prepared turn without persisting messages', async () => {
    const controller = require('../controllers/aiChat.controller')
    const listeners = {}
    const req = {
      params: { sessionId: 'session-1' },
      body: { turnToken: 'prepared-token' },
      query: {},
      user: { _id: 'user-1', role: 3 },
      on: jest.fn((event, handler) => {
        listeners[event] = handler
      }),
      removeListener: jest.fn(),
    }
    const res = createResponse()

    await controller.streamMessage(req, res)

    const events = parseSseWrites(res.writes)
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream')
    expect(events.map((event) => event.type)).toEqual([
      'ready',
      'assistant_start',
      'token',
      'token',
      'assistant_done',
      'done',
    ])
    expect(events[2].token).toBe('Hel')
    expect(events[3].token).toBe('lo')
    expect(events[4].assistantContent).toBe('Hello')
    const { streamChatReply } = require('../services/llm/chatResponder.service')
    expect(streamChatReply).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: mockReadTurnPayload.apiMessages,
        model: 'gpt-4.1',
        forceBuiltIn: true,
      })
    )
    expect(savedMessages).toHaveLength(0)
    expect(res.end).toHaveBeenCalled()
    expect(req.removeListener).toHaveBeenCalledWith('close', listeners.close)
  })

  it('starts SSE immediately and prepares the turn inside the stream request', async () => {
    const controller = require('../controllers/aiChat.controller')
    const listeners = {}
    const req = {
      params: { sessionId: 'session-1' },
      body: { content: 'Hello?' },
      query: {},
      user: { _id: 'user-1', role: 3 },
      on: jest.fn((event, handler) => {
        listeners[event] = handler
      }),
      removeListener: jest.fn(),
    }
    const res = createResponse()

    await controller.streamMessage(req, res)

    const events = parseSseWrites(res.writes)
    expect(events.map((event) => event.type)).toEqual([
      'ready',
      'assistant_start',
      'user_message',
      'turn_prepared',
      'token',
      'token',
      'assistant_done',
      'done',
    ])
    expect(events[1].message).toEqual(
      expect.objectContaining({ role: 'assistant', content: '' })
    )
    expect(events[2].message).toEqual(
      expect.objectContaining({ role: 'user', content: 'Hello?' })
    )
    expect(events[3]).toEqual(
      expect.objectContaining({ turnToken: 'prepared-token' })
    )
    expect(events[6].turnToken).toBe('prepared-token')
    const { streamChatReply } = require('../services/llm/chatResponder.service')
    expect(streamChatReply).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([{ role: 'user', content: 'Hello?' }]),
        model: 'gpt-4.1',
        forceBuiltIn: true,
      })
    )
    expect(savedMessages).toHaveLength(0)
    expect(res.end).toHaveBeenCalled()
    expect(req.removeListener).toHaveBeenCalledWith('close', listeners.close)
  })

  it('prepares a chat turn without saving chat messages', async () => {
    const controller = require('../controllers/aiChat.controller')
    const req = {
      params: { sessionId: 'session-1' },
      body: { action: 'prepare', content: 'Hello?' },
      query: {},
      user: { _id: 'user-1', role: 3 },
    }
    const res = createResponse()

    await controller.handleMessageTurn(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.payload.success).toBe(true)
    expect(res.payload.data.turnToken).toBe('prepared-token')
    expect(res.payload.data.userMessage).toEqual(
      expect.objectContaining({ role: 'user', content: 'Hello?' })
    )
    expect(mockTokenPayloads[0]).toEqual(
      expect.objectContaining({
        sessionId: 'session-1',
        sessionUserId: 'user-1',
        actorUserId: 'user-1',
        text: 'Hello?',
        model: 'gpt-4.1',
      })
    )
    expect(mockTokenPayloads[0].apiMessages.at(-1)).toEqual({
      role: 'user',
      content: 'Hello?',
    })
    expect(savedMessages).toHaveLength(0)
  })

  it('builds the cloned interview prompt from the session profile and resume', async () => {
    const controller = require('../controllers/aiChat.controller')
    const { JobDescriptionModel, ProfileModel, ResumeModel } = require('../dbModels')
    mockSession = {
      ...mockSession,
      resumeId: 'resume-1',
      jobDescriptionId: 'jd-1',
    }
    ProfileModel.findOne.mockReturnValue({
      lean: jest.fn(async () => ({
        _id: 'profile-1',
        fullName: 'Candidate',
        mainStack: 'Frontend Engineering',
        title: 'Senior UI Engineer',
      })),
    })
    ResumeModel.findOne.mockReturnValue({
      lean: jest.fn(async () => ({
        _id: 'resume-1',
        profileId: 'profile-1',
        name: 'Interview Resume',
        skills: [
          { title: 'Frontend', items: ['React.js', 'TypeScript'] },
          { title: 'Backend', items: ['Node.js'] },
        ],
        experiences: [
          {
            title: 'Lead Frontend Engineer',
            companyName: 'Acme',
            bullets: ['Built React interview flows', 'Improved page performance'],
          },
        ],
      })),
    })
    JobDescriptionModel.findOne.mockReturnValue({
      lean: jest.fn(async () => ({
        _id: 'jd-1',
        title: 'Backend Role',
        company: 'Ignored Co',
        skills: ['Java'],
        context: 'Need React and TypeScript for dashboard interview questions.',
      })),
    })
    const req = {
      params: { sessionId: 'session-1' },
      body: { action: 'prepare', content: 'What is React?' },
      query: {},
      user: { _id: 'user-1', role: 3 },
    }
    const res = createResponse()

    await controller.handleMessageTurn(req, res)

    const systemMessages = mockTokenPayloads[0].apiMessages.slice(0, 5)
    const jobDescriptionPrompt = mockTokenPayloads[0].apiMessages[5].content
    expect(systemMessages).toEqual([
      {
        content: "You are senior software engineer. You are having a technical interview with HR. Please get a point of question and give me the correct and optimized answer for these questions. If possible, include experience or solution. Tell like real person not AI naturally. Also You have to simplify all answers and have to tell the main point. Don't answer you don't have any experience with given question.",
        role: 'system',
      },
      {
        content: 'You must use verbal/spoken English not formal/written English at all! Also must use the simple statements not compound statements if it is possible! Try to choose easy-to-pronounce words.',
        role: 'system',
      },
      {
        content: 'Interview focuses on <Frontend Engineering>.',
        role: 'system',
      },
      {
        content: 'You are very familiar with React.js, TypeScript, Node.js.',
        role: 'system',
      },
      {
        content: 'Here is your some experinece: `Lead Frontend Engineer at Acme: Built React interview flows | Improved page performance.`',
        role: 'system',
      },
    ])
    expect(mockTokenPayloads[0].apiMessages[5].role).toBe('user')
    expect(jobDescriptionPrompt).toBe([
      'here is the Job description.',
      'Need React and TypeScript for dashboard interview questions.',
      'Let\'s assume that I have extensive experience with all the required skillsets across all my past companies.. Give me tailored and unique and realistic and most suitable answer, example based answers to further questions.',
    ].join('\n'))
    expect(mockTokenPayloads[0].apiMessages.at(-1)).toEqual({
      role: 'user',
      content: 'What is React?',
    })
  })

  it('commits a prepared turn through the DB endpoint', async () => {
    const controller = require('../controllers/aiChat.controller')
    const req = {
      params: { sessionId: 'session-1' },
      body: {
        action: 'commit',
        turnToken: 'prepared-token',
        assistantContent: 'Hello',
      },
      query: {},
      user: { _id: 'user-1', role: 3 },
    }
    const res = createResponse()

    await controller.handleMessageTurn(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.payload.success).toBe(true)
    expect(res.payload.data.committed).toBe(true)
    expect(savedMessages.map((message) => ({
      role: message.role,
      content: message.content,
      turnId: message.turnId,
    }))).toEqual([
      { role: 'user', content: 'Hello?', turnId: 'turn-1' },
      { role: 'assistant', content: 'Hello', turnId: 'turn-1' },
    ])
    expect(res.payload.data.messages).toEqual([
      expect.objectContaining({ role: 'user', content: 'Hello?' }),
      expect.objectContaining({ role: 'assistant', content: 'Hello' }),
    ])
    expect(res.payload.data.session).toEqual(
      expect.objectContaining({
        id: 'session-1',
        title: 'Hello?',
      })
    )
    expect(res.payload.data.contextToken).toBe('context-token')
    expect(mockContextTokenPayloads[0]).toEqual(
      expect.objectContaining({
        tokenType: 'ai-chat-context',
        sessionId: 'session-1',
        sessionUserId: 'user-1',
        actorUserId: 'user-1',
        model: 'gpt-4.1',
      })
    )
  })

  it('does not delete messages when the scoped session is not found', async () => {
    const controller = require('../controllers/aiChat.controller')
    const { ChatMessageModel, ChatSessionModel } = require('../dbModels')
    storedMessages.push({
      _id: 'message-1',
      sessionId: 'session-1',
      role: 'user',
      content: 'Should remain',
      createdAt: new Date(),
      structuredAssistantPayload: null,
    })
    mockSession = null
    const req = {
      params: { sessionId: 'session-1' },
      body: {},
      query: {},
      user: { _id: 'user-2', role: 3 },
    }
    const res = createResponse()

    await controller.deleteSession(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.payload.success).toBe(true)
    expect(ChatSessionModel.deleteOne).not.toHaveBeenCalled()
    expect(ChatMessageModel.deleteMany).not.toHaveBeenCalled()
    expect(storedMessages).toHaveLength(1)
  })

  it('deletes messages only after resolving a scoped session', async () => {
    const controller = require('../controllers/aiChat.controller')
    const { ChatMessageModel, ChatSessionModel } = require('../dbModels')
    storedMessages.push({
      _id: 'message-1',
      sessionId: 'session-1',
      role: 'user',
      content: 'Delete me',
      createdAt: new Date(),
      structuredAssistantPayload: null,
    })
    const req = {
      params: { sessionId: 'session-1' },
      body: {},
      query: {},
      user: { _id: 'user-1', role: 3 },
    }
    const res = createResponse()

    await controller.deleteSession(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.payload.success).toBe(true)
    expect(ChatSessionModel.deleteOne).toHaveBeenCalledWith({ _id: 'session-1' })
    expect(ChatMessageModel.deleteMany).toHaveBeenCalledWith({ sessionId: 'session-1' })
    expect(storedMessages).toHaveLength(0)
  })
})
