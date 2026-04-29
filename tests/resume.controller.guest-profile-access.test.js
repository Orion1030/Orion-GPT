describe('resume.controller guest assigned profile access', () => {
  const buildRes = () => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  })

  const invoke = async (handler, req, res) => {
    handler(req, res, jest.fn())
    await new Promise((resolve) => setImmediate(resolve))
  }

  const buildSelectLean = (result) => ({
    select: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue(result),
    }),
  })

  const buildPopulateTriple = (result) => {
    const thirdPopulate = jest.fn().mockResolvedValue(result)
    const secondPopulate = jest.fn().mockReturnValue({ populate: thirdPopulate })
    const firstPopulate = jest.fn().mockReturnValue({ populate: secondPopulate })
    return { populate: firstPopulate }
  }

  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
  })

  it('allows a guest to create a resume using an assigned profile', async () => {
    const savedResume = {
      _id: 'resume-1',
      save: jest.fn().mockResolvedValue(undefined),
    }

    const ResumeModel = jest.fn().mockImplementation((payload) => ({
      ...payload,
      ...savedResume,
      save: savedResume.save,
    }))
    ResumeModel.findById = jest
      .fn()
      .mockReturnValue(buildPopulateTriple({ _id: 'resume-1', name: 'Guest Resume' }))

    const ProfileModel = {
      findOne: jest.fn().mockReturnValue(
        buildSelectLean({
          _id: 'profile-1',
          userId: 'owner-1',
          careerHistory: [],
          stackId: null,
        })
      ),
    }

    const UserModel = {
      findOne: jest.fn().mockReturnValue(
        buildSelectLean({
          _id: 'guest-1',
          assignedProfileIds: ['profile-1'],
        })
      ),
    }

    jest.doMock('../dbModels', () => ({
      ResumeModel,
      ProfileModel,
      ApplicationModel: {},
      UserModel,
    }))
    jest.doMock('../services/resumeEmbedding.service', () => ({
      queueResumeEmbeddingRefresh: jest.fn(),
    }))
    jest.doMock('../services/applicationHistory.service', () => ({
      appendApplicationHistory: jest.fn(),
    }))

    const controller = require('../controllers/resume.controller')
    const req = {
      user: { _id: 'guest-1', role: 0 },
      body: {
        name: 'Guest Resume',
        profileId: 'profile-1',
      },
    }
    const res = buildRes()

    await invoke(controller.createResume, req, res)

    expect(ProfileModel.findOne).toHaveBeenCalledWith({
      $and: [
        {
          $or: [{ userId: 'guest-1' }, { _id: { $in: ['profile-1'] } }],
        },
        { _id: 'profile-1' },
      ],
    })
    expect(ResumeModel).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'guest-1',
        profileId: 'profile-1',
      })
    )
    expect(savedResume.save).toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(201)
  })
})
