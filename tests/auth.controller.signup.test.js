const { RoleLevels } = require('../utils/constants')

describe('auth.controller signup', () => {
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

  it('creates pending signup accounts as user role instead of guest role', async () => {
    const savedUser = {
      _id: 'user-1',
      save: jest.fn().mockResolvedValue(null),
    }

    const UserModel = jest.fn().mockImplementation((payload) => ({
      ...savedUser,
      ...payload,
      save: savedUser.save,
    }))
    UserModel.findOne = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
    UserModel.find = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([]),
      }),
    })

    const NotificationModel = {
      insertMany: jest.fn().mockResolvedValue([]),
    }

    jest.doMock('../dbModels', () => ({
      UserModel,
      ProfileModel: {},
      NotificationModel,
    }))

    const controller = require('../controllers/auth.controller')
    const req = {
      body: {
        name: 'Signup User',
        email: 'signup@example.com',
        password: 'SecurePass1!',
        confirmPassword: 'SecurePass1!',
        role: RoleLevels.GUEST,
        managedByUserId: 'super-1',
        team: 'Executive',
      },
    }
    const res = buildRes()

    await invoke(controller.signup, req, res)

    expect(UserModel).toHaveBeenCalledWith({
      name: 'Signup User',
      email: 'signup@example.com',
      password: 'SecurePass1!',
      role: RoleLevels.User,
      isActive: false,
      managedByUserId: null,
      team: '',
    })
    expect(savedUser.save).toHaveBeenCalled()
    expect(NotificationModel.insertMany).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(201)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: 'Please wait for admin approval',
      })
    )
  })
})
