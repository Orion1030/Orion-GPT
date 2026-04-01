const { sendJsonResult } = require('../utils')

// Helper to build an Express-like response spy
function createRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  }
}

describe('Resume soft delete + filters', () => {
  const OLD_ENV = process.env

  afterEach(() => {
    jest.resetModules()
    process.env = { ...OLD_ENV }
    jest.clearAllMocks()
  })

  it('bulk delete marks resumes as deleted', async () => {
    const updateMany = jest.fn().mockResolvedValue({ matchedCount: 2, modifiedCount: 2 })
    jest.doMock('../dbModels', () => ({
      ResumeModel: { updateMany },
    }))

    const controller = require('../controllers/resume.controller')
    const req = { body: { ids: ['r1', 'r2'] }, user: { _id: 'u1' } }
    const res = createRes()

    await controller.deleteResumes(req, res, jest.fn())

    expect(updateMany).toHaveBeenCalledWith(
      { userId: 'u1', _id: { $in: ['r1', 'r2'] } },
      expect.objectContaining({ $set: expect.objectContaining({ isDeleted: true }) })
    )
    const payload = res.json.mock.calls[0][0]
    expect(payload.success).toBe(true)
    expect(payload.data.matchedCount).toBe(2)
  })

  it('bulk delete without ids falls back to delete all for user', async () => {
    const updateMany = jest.fn().mockResolvedValue({ matchedCount: 3, modifiedCount: 3 })
    jest.doMock('../dbModels', () => ({
      ResumeModel: { updateMany },
    }))

    const controller = require('../controllers/resume.controller')
    const req = { body: {}, user: { _id: 'u1' } }
    const res = createRes()

    await controller.deleteResumes(req, res, jest.fn())

    expect(updateMany).toHaveBeenCalledWith(
      { userId: 'u1' },
      expect.objectContaining({ $set: expect.objectContaining({ isDeleted: true }) })
    )
    const payload = res.json.mock.calls[0][0]
    expect(payload.success).toBe(true)
    expect(payload.data.modifiedCount).toBe(3)
  })

  it('getAllResumes filters out soft-deleted resumes', async () => {
    const sort = jest.fn().mockResolvedValue([{ _id: 'r1' }])
    const populate = jest.fn().mockReturnThis()
    const find = jest.fn().mockReturnValue({ populate, sort })

    jest.doMock('../dbModels', () => ({
      ResumeModel: { find },
    }))

    const controller = require('../controllers/resume.controller')
    const req = { user: { _id: 'u1' } }
    const res = createRes()

    await controller.getAllResumes(req, res, jest.fn())

    expect(find).toHaveBeenCalledWith({ userId: 'u1', isDeleted: { $ne: true } })
    const payload = res.json.mock.calls[0][0]
    expect(payload.success).toBe(true)
    expect(Array.isArray(payload.data)).toBe(true)
  })

  it('single delete sets soft-delete flags', async () => {
    const updateOne = jest.fn().mockResolvedValue({ matchedCount: 1, modifiedCount: 1 })
    jest.doMock('../dbModels', () => ({
      ResumeModel: { updateOne },
    }))

    const controller = require('../controllers/resume.controller')
    const req = { params: { resumeId: 'r1' }, user: { _id: 'u1' } }
    const res = createRes()

    await controller.deleteResume(req, res, jest.fn())

    expect(updateOne).toHaveBeenCalledWith(
      { _id: 'r1', userId: 'u1' },
      expect.objectContaining({ $set: expect.objectContaining({ isDeleted: true }) })
    )
    const payload = res.json.mock.calls[0][0]
    expect(payload.success).toBe(true)
  })
})
