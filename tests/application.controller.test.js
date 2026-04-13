describe('application.controller', () => {
  const buildRes = () => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  })
  const invoke = async (handler, req, res) => {
    handler(req, res, jest.fn())
    await new Promise((resolve) => setImmediate(resolve))
  }

  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
  })

  it('returns 400 when jdContext is missing on apply', async () => {
    const appendApplicationHistory = jest.fn()

    jest.doMock('../dbModels', () => ({
      ApplicationModel: jest.fn(),
      ApplicationEventModel: { deleteMany: jest.fn() },
      ChatSessionModel: jest.fn(),
      JobModel: jest.fn(),
      ProfileModel: { findOne: jest.fn() },
      ResumeModel: { findOne: jest.fn() },
    }))
    jest.doMock('../services/applicationHistory.service', () => ({
      appendApplicationHistory,
      listApplicationHistory: jest.fn(),
    }))
    jest.doMock('../services/applicationRealtime.service', () => ({
      buildApplicationEventEnvelope: jest.fn(),
      subscribeApplicationEvents: jest.fn(),
    }))

    const controller = require('../controllers/application.controller')
    const req = {
      user: { _id: 'user-1' },
      body: {},
      headers: {},
    }
    const res = buildRes()

    await invoke(controller.applyForApplication, req, res)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(appendApplicationHistory).not.toHaveBeenCalled()
  })

  it('returns 404 when manualProfileId is invalid on apply', async () => {
    const appendApplicationHistory = jest.fn()

    const ProfileModel = {
      findOne: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(null),
        }),
      }),
    }

    jest.doMock('../dbModels', () => ({
      ApplicationModel: jest.fn(),
      ApplicationEventModel: { deleteMany: jest.fn() },
      ChatSessionModel: jest.fn(),
      JobModel: jest.fn(),
      ProfileModel,
      ResumeModel: { findOne: jest.fn() },
    }))
    jest.doMock('../services/applicationHistory.service', () => ({
      appendApplicationHistory,
      listApplicationHistory: jest.fn(),
    }))
    jest.doMock('../services/applicationRealtime.service', () => ({
      buildApplicationEventEnvelope: jest.fn(),
      subscribeApplicationEvents: jest.fn(),
    }))

    const controller = require('../controllers/application.controller')
    const req = {
      user: { _id: 'user-1' },
      body: {
        jdContext: 'Backend engineer role',
        profileSelectionMode: 'manual',
        manualProfileId: 'missing-profile',
      },
      headers: {},
    }
    const res = buildRes()

    await invoke(controller.applyForApplication, req, res)

    expect(ProfileModel.findOne).toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(404)
    expect(appendApplicationHistory).not.toHaveBeenCalled()
  })

  it('ignores admin userId override on apply and scopes manual profile lookup to authenticated user', async () => {
    const appendApplicationHistory = jest.fn()

    const ProfileModel = {
      findOne: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(null),
        }),
      }),
    }

    jest.doMock('../dbModels', () => ({
      ApplicationModel: jest.fn(),
      ApplicationEventModel: { deleteMany: jest.fn() },
      ChatSessionModel: jest.fn(),
      JobModel: jest.fn(),
      ProfileModel,
      ResumeModel: { findOne: jest.fn() },
    }))
    jest.doMock('../services/applicationHistory.service', () => ({
      appendApplicationHistory,
      listApplicationHistory: jest.fn(),
    }))
    jest.doMock('../services/applicationRealtime.service', () => ({
      buildApplicationEventEnvelope: jest.fn(),
      subscribeApplicationEvents: jest.fn(),
    }))

    const controller = require('../controllers/application.controller')
    const req = {
      user: { _id: 'admin-1', role: 1 },
      query: { userId: 'user-2' },
      body: {
        userId: 'user-2',
        jdContext: 'Platform engineer role',
        profileSelectionMode: 'manual',
        manualProfileId: 'profile-x',
      },
      headers: {},
    }
    const res = buildRes()

    await invoke(controller.applyForApplication, req, res)

    expect(ProfileModel.findOne).toHaveBeenCalledWith({
      _id: 'profile-x',
      userId: 'admin-1',
    })
    expect(res.status).toHaveBeenCalledWith(404)
    expect(appendApplicationHistory).not.toHaveBeenCalled()
  })

  it('creates application + job and returns apply payload', async () => {
    const appendApplicationHistory = jest.fn().mockResolvedValue(null)
    const buildApplicationEventEnvelope = jest.fn().mockReturnValue({ type: 'application.created' })

    const applicationSave = jest.fn().mockResolvedValue(undefined)
    const jobSave = jest.fn().mockResolvedValue(undefined)
    const ApplicationModel = jest.fn().mockImplementation((doc) => ({
      ...doc,
      _id: 'app-123',
      save: applicationSave,
    }))
    const JobModel = jest.fn().mockImplementation((doc) => ({
      ...doc,
      _id: 'job-456',
      save: jobSave,
    }))
    ApplicationModel.findOneAndUpdate = jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: 'app-123',
        userId: 'user-1',
        companyName: '',
        jobTitle: '',
        applicationStatus: 'in_progress',
        generationStatus: 'queued',
        pipeline: { currentStep: 'created', progress: 0, jobId: 'job-456' },
        version: 2,
      }),
    })

    jest.doMock('../dbModels', () => ({
      ApplicationModel,
      ApplicationEventModel: { deleteMany: jest.fn() },
      ChatSessionModel: jest.fn(),
      JobModel,
      ProfileModel: { findOne: jest.fn() },
      ResumeModel: { findOne: jest.fn() },
    }))
    jest.doMock('../services/applicationHistory.service', () => ({
      appendApplicationHistory,
      listApplicationHistory: jest.fn(),
    }))
    jest.doMock('../services/applicationRealtime.service', () => ({
      buildApplicationEventEnvelope,
      subscribeApplicationEvents: jest.fn(),
    }))

    const controller = require('../controllers/application.controller')
    const req = {
      user: { _id: 'user-1' },
      body: {
        jdContext: 'Senior backend engineer with node and aws',
        resumeReferenceMode: 'use_top_match_resume',
        profileSelectionMode: 'auto',
        manualProfileId: null,
      },
      headers: {},
    }
    const res = buildRes()

    await invoke(controller.applyForApplication, req, res)

    expect(applicationSave).toHaveBeenCalled()
    expect(jobSave).toHaveBeenCalled()
    expect(appendApplicationHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'created',
        source: 'api',
      })
    )
    expect(buildApplicationEventEnvelope).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(201)
    const body = res.json.mock.calls[0][0]
    expect(body.success).toBe(true)
    expect(body.data.applicationId).toBe('app-123')
    expect(body.data.jobId).toBe('job-456')
  })

  it('writes status and field history on patch', async () => {
    const appendApplicationHistory = jest.fn().mockResolvedValue(null)
    const buildApplicationEventEnvelope = jest.fn().mockReturnValue({ type: 'application.updated' })

    const ApplicationModel = {
      findOne: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: 'app-1',
          userId: 'user-1',
          resumeName: 'Old Resume',
          companyName: 'Old Co',
          jobTitle: 'Old Role',
          applicationStatus: 'in_progress',
          jdMeta: { salary: {} },
        }),
      }),
      findOneAndUpdate: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: 'app-1',
          userId: 'user-1',
          resumeName: 'New Resume',
          companyName: 'New Co',
          jobTitle: 'Old Role',
          applicationStatus: 'applied',
          status: 'Applied',
          version: 8,
          pipeline: { currentStep: 'completed', progress: 100 },
        }),
      }),
    }

    jest.doMock('../dbModels', () => ({
      ApplicationModel,
      ApplicationEventModel: { deleteMany: jest.fn() },
      ChatSessionModel: jest.fn(),
      JobModel: jest.fn(),
      ProfileModel: { findOne: jest.fn() },
      ResumeModel: { findOne: jest.fn() },
    }))
    jest.doMock('../services/applicationHistory.service', () => ({
      appendApplicationHistory,
      listApplicationHistory: jest.fn(),
    }))
    jest.doMock('../services/applicationRealtime.service', () => ({
      buildApplicationEventEnvelope,
      subscribeApplicationEvents: jest.fn(),
    }))

    const controller = require('../controllers/application.controller')
    const req = {
      user: { _id: 'user-1' },
      params: { applicationId: 'app-1' },
      body: {
        resumeName: 'New Resume',
        companyName: 'New Co',
        applicationStatus: 'applied',
      },
      headers: { 'x-request-id': 'req-patch-1' },
    }
    const res = buildRes()

    await invoke(controller.patchApplication, req, res)

    expect(ApplicationModel.findOne).toHaveBeenCalled()
    expect(ApplicationModel.findOneAndUpdate).toHaveBeenCalled()
    expect(appendApplicationHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'field_updated',
        payload: expect.objectContaining({ field: 'resumeName' }),
      })
    )
    expect(appendApplicationHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'status_updated',
        payload: expect.objectContaining({ field: 'applicationStatus' }),
      })
    )
    expect(buildApplicationEventEnvelope).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(200)
  })

  it('returns existing chat session and logs chat_opened', async () => {
    const appendApplicationHistory = jest.fn().mockResolvedValue(null)

    const ApplicationModel = {
      findOne: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: 'app-1',
          userId: 'user-1',
          chatSessionId: 'chat-9',
        }),
      }),
      findOneAndUpdate: jest.fn(),
    }
    const ChatSessionModel = {
      findOne: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({ _id: 'chat-9' }),
        }),
      }),
    }

    jest.doMock('../dbModels', () => ({
      ApplicationModel,
      ApplicationEventModel: { deleteMany: jest.fn() },
      ChatSessionModel,
      JobModel: jest.fn(),
      ProfileModel: { findOne: jest.fn() },
      ResumeModel: { findOne: jest.fn() },
    }))
    jest.doMock('../services/applicationHistory.service', () => ({
      appendApplicationHistory,
      listApplicationHistory: jest.fn(),
    }))
    jest.doMock('../services/applicationRealtime.service', () => ({
      buildApplicationEventEnvelope: jest.fn(),
      subscribeApplicationEvents: jest.fn(),
    }))

    const controller = require('../controllers/application.controller')
    const req = {
      user: { _id: 'user-1' },
      params: { applicationId: 'app-1' },
      headers: {},
    }
    const res = buildRes()

    await invoke(controller.resolveApplicationChat, req, res)

    expect(appendApplicationHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'chat_opened',
        payload: expect.objectContaining({ chatSessionId: 'chat-9', isNew: false }),
      })
    )
    expect(res.status).toHaveBeenCalledWith(200)
    const body = res.json.mock.calls[0][0]
    expect(body.success).toBe(true)
    expect(body.data.chatSessionId).toBe('chat-9')
    expect(body.data.isNew).toBe(false)
  })

  it('returns 404 when history is not available for the application', async () => {
    const appendApplicationHistory = jest.fn()
    const listApplicationHistory = jest.fn().mockResolvedValue(null)

    jest.doMock('../dbModels', () => ({
      ApplicationModel: jest.fn(),
      ApplicationEventModel: { deleteMany: jest.fn() },
      ChatSessionModel: jest.fn(),
      JobModel: jest.fn(),
      ProfileModel: { findOne: jest.fn() },
      ResumeModel: { findOne: jest.fn() },
    }))
    jest.doMock('../services/applicationHistory.service', () => ({
      appendApplicationHistory,
      listApplicationHistory,
    }))
    jest.doMock('../services/applicationRealtime.service', () => ({
      buildApplicationEventEnvelope: jest.fn(),
      subscribeApplicationEvents: jest.fn(),
    }))

    const controller = require('../controllers/application.controller')
    const req = {
      user: { _id: 'user-1' },
      params: { applicationId: 'app-missing' },
      query: { page: '1', pageSize: '50' },
      headers: {},
    }
    const res = buildRes()

    await invoke(controller.getApplicationHistory, req, res)

    expect(listApplicationHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationId: 'app-missing',
        userId: 'user-1',
      })
    )
    expect(res.status).toHaveBeenCalledWith(404)
  })

  it('normalizes legacy pipeline history event types to canonical names', async () => {
    const appendApplicationHistory = jest.fn()
    const listApplicationHistory = jest.fn().mockResolvedValue({
      items: [
        {
          _id: 'evt-1',
          applicationId: 'app-1',
          userId: 'user-1',
          eventType: 'pipeline_step',
          payload: { step: 'resume_saved' },
          createdAt: '2026-04-10T00:00:00.000Z',
        },
      ],
      page: 1,
      pageSize: 50,
      total: 1,
    })

    jest.doMock('../dbModels', () => ({
      ApplicationModel: jest.fn(),
      ApplicationEventModel: { deleteMany: jest.fn() },
      ChatSessionModel: jest.fn(),
      JobModel: jest.fn(),
      ProfileModel: { findOne: jest.fn() },
      ResumeModel: { findOne: jest.fn() },
    }))
    jest.doMock('../services/applicationHistory.service', () => ({
      appendApplicationHistory,
      listApplicationHistory,
    }))
    jest.doMock('../services/applicationRealtime.service', () => ({
      buildApplicationEventEnvelope: jest.fn(),
      subscribeApplicationEvents: jest.fn(),
    }))

    const controller = require('../controllers/application.controller')
    const req = {
      user: { _id: 'user-1' },
      params: { applicationId: 'app-1' },
      query: {},
      headers: {},
    }
    const res = buildRes()

    await invoke(controller.getApplicationHistory, req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    const body = res.json.mock.calls[0][0]
    expect(body.success).toBe(true)
    expect(body.data.items[0].eventType).toBe('application.pipeline_step')
  })

  it('streams SSE envelopes for authorized applications', async () => {
    const unsubscribe = jest.fn()
    const buildApplicationEventEnvelope = jest.fn().mockImplementation((payload) => ({
      eventId: 'evt-1',
      timestamp: '2026-04-09T00:00:00.000Z',
      ...payload,
    }))
    const subscribeApplicationEvents = jest.fn().mockReturnValue(unsubscribe)

    const ApplicationModel = {
      findOne: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: 'app-1',
          userId: 'user-1',
          applicationStatus: 'in_progress',
          generationStatus: 'running',
          pipeline: { currentStep: 'profile_selected', progress: 45 },
          version: 7,
        }),
      }),
    }

    jest.doMock('../dbModels', () => ({
      ApplicationModel,
      ApplicationEventModel: { deleteMany: jest.fn() },
      ChatSessionModel: jest.fn(),
      JobModel: jest.fn(),
      ProfileModel: { findOne: jest.fn() },
      ResumeModel: { findOne: jest.fn() },
    }))
    jest.doMock('../services/applicationHistory.service', () => ({
      appendApplicationHistory: jest.fn(),
      listApplicationHistory: jest.fn(),
    }))
    jest.doMock('../services/applicationRealtime.service', () => ({
      buildApplicationEventEnvelope,
      subscribeApplicationEvents,
    }))

    const controller = require('../controllers/application.controller')
    const closeHandlers = {}
    const req = {
      user: { _id: 'user-1' },
      params: { applicationId: 'app-1' },
      on: jest.fn((event, handler) => {
        closeHandlers[event] = handler
      }),
    }
    const res = {
      setHeader: jest.fn(),
      flushHeaders: jest.fn(),
      write: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    }

    await controller.streamApplicationEvents(req, res)

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream')
    expect(res.flushHeaders).toHaveBeenCalled()
    expect(buildApplicationEventEnvelope).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'application.updated',
        applicationId: 'app-1',
      })
    )
    expect(res.write).toHaveBeenCalledWith(expect.stringContaining('"applicationId":"app-1"'))
    expect(subscribeApplicationEvents).toHaveBeenCalledWith('app-1', res)

    expect(typeof closeHandlers.close).toBe('function')
    closeHandlers.close()
    expect(unsubscribe).toHaveBeenCalled()
  })

  it('listApplications returns all records for admin when no userId filter is provided', async () => {
    const lean = jest.fn().mockResolvedValue([
      {
        _id: 'app-1',
        userId: 'user-a',
        applicationStatus: 'in_progress',
        generationStatus: 'queued',
      },
    ])
    const limit = jest.fn().mockReturnValue({ lean })
    const skip = jest.fn().mockReturnValue({ limit })
    const sort = jest.fn().mockReturnValue({ skip })
    const ApplicationModel = {
      find: jest.fn().mockReturnValue({ sort }),
      countDocuments: jest.fn().mockResolvedValue(1),
    }

    jest.doMock('../dbModels', () => ({
      ApplicationModel,
      ApplicationEventModel: { deleteMany: jest.fn() },
      ChatSessionModel: jest.fn(),
      JobModel: jest.fn(),
      ProfileModel: { findOne: jest.fn() },
      ResumeModel: { findOne: jest.fn() },
    }))
    jest.doMock('../services/applicationHistory.service', () => ({
      appendApplicationHistory: jest.fn(),
      listApplicationHistory: jest.fn(),
    }))
    jest.doMock('../services/applicationRealtime.service', () => ({
      buildApplicationEventEnvelope: jest.fn(),
      subscribeApplicationEvents: jest.fn(),
    }))

    const controller = require('../controllers/application.controller')
    const req = {
      user: { _id: 'admin-1', role: 1 },
      query: {},
    }
    const res = buildRes()

    await invoke(controller.listApplications, req, res)

    expect(ApplicationModel.find).toHaveBeenCalledWith({})
    expect(ApplicationModel.countDocuments).toHaveBeenCalledWith({})
    expect(res.status).toHaveBeenCalledWith(200)
  })

  it('listApplications scopes to target user for admin when userId is provided', async () => {
    const lean = jest.fn().mockResolvedValue([])
    const limit = jest.fn().mockReturnValue({ lean })
    const skip = jest.fn().mockReturnValue({ limit })
    const sort = jest.fn().mockReturnValue({ skip })
    const ApplicationModel = {
      find: jest.fn().mockReturnValue({ sort }),
      countDocuments: jest.fn().mockResolvedValue(0),
    }

    jest.doMock('../dbModels', () => ({
      ApplicationModel,
      ApplicationEventModel: { deleteMany: jest.fn() },
      ChatSessionModel: jest.fn(),
      JobModel: jest.fn(),
      ProfileModel: { findOne: jest.fn() },
      ResumeModel: { findOne: jest.fn() },
    }))
    jest.doMock('../services/applicationHistory.service', () => ({
      appendApplicationHistory: jest.fn(),
      listApplicationHistory: jest.fn(),
    }))
    jest.doMock('../services/applicationRealtime.service', () => ({
      buildApplicationEventEnvelope: jest.fn(),
      subscribeApplicationEvents: jest.fn(),
    }))

    const controller = require('../controllers/application.controller')
    const req = {
      user: { _id: 'admin-1', role: 1 },
      query: { userId: 'user-123' },
    }
    const res = buildRes()

    await invoke(controller.listApplications, req, res)

    expect(ApplicationModel.find).toHaveBeenCalledWith({ userId: 'user-123' })
    expect(ApplicationModel.countDocuments).toHaveBeenCalledWith({ userId: 'user-123' })
    expect(res.status).toHaveBeenCalledWith(200)
  })

  it('listApplications scopes to authenticated user for non-admin role', async () => {
    const lean = jest.fn().mockResolvedValue([])
    const limit = jest.fn().mockReturnValue({ lean })
    const skip = jest.fn().mockReturnValue({ limit })
    const sort = jest.fn().mockReturnValue({ skip })
    const ApplicationModel = {
      find: jest.fn().mockReturnValue({ sort }),
      countDocuments: jest.fn().mockResolvedValue(0),
    }

    jest.doMock('../dbModels', () => ({
      ApplicationModel,
      ApplicationEventModel: { deleteMany: jest.fn() },
      ChatSessionModel: jest.fn(),
      JobModel: jest.fn(),
      ProfileModel: { findOne: jest.fn() },
      ResumeModel: { findOne: jest.fn() },
    }))
    jest.doMock('../services/applicationHistory.service', () => ({
      appendApplicationHistory: jest.fn(),
      listApplicationHistory: jest.fn(),
    }))
    jest.doMock('../services/applicationRealtime.service', () => ({
      buildApplicationEventEnvelope: jest.fn(),
      subscribeApplicationEvents: jest.fn(),
    }))

    const controller = require('../controllers/application.controller')
    const req = {
      user: { _id: 'user-1', role: 3 },
      query: { userId: 'another-user' },
    }
    const res = buildRes()

    await invoke(controller.listApplications, req, res)

    expect(ApplicationModel.find).toHaveBeenCalledWith({ userId: 'user-1' })
    expect(ApplicationModel.countDocuments).toHaveBeenCalledWith({ userId: 'user-1' })
    expect(res.status).toHaveBeenCalledWith(200)
  })
})
