const mockCreatedDocs = []
const mockUpdates = []
let mockFindOneResult = null

jest.mock('../utils', () => ({
  getJwtSecret: jest.fn(() => 'test-jwt-secret'),
}))

jest.mock('../dbModels', () => ({
  AiChatFocusLinkModel: {
    create: jest.fn(async (doc) => {
      const created = { _id: 'focus-link-1', ...doc }
      mockCreatedDocs.push(created)
      return created
    }),
    findOne: jest.fn(() => ({
      lean: jest.fn(async () => mockFindOneResult),
    })),
    updateOne: jest.fn(async (filter, update) => {
      mockUpdates.push({ filter, update })
      return { acknowledged: true, modifiedCount: 1 }
    }),
    updateMany: jest.fn(async () => ({ acknowledged: true, modifiedCount: 1 })),
  },
}))

describe('aiChatFocusLink.service', () => {
  beforeEach(() => {
    mockCreatedDocs.length = 0
    mockUpdates.length = 0
    mockFindOneResult = null
    jest.clearAllMocks()
    jest.spyOn(Date, 'now').mockReturnValue(1700000000000)
    process.env.AI_CHAT_FOCUS_IDLE_TTL_MS = '600000'
    process.env.AI_CHAT_FOCUS_ABSOLUTE_TTL_MS = '86400000'
  })

  afterEach(() => {
    jest.restoreAllMocks()
    delete process.env.AI_CHAT_FOCUS_IDLE_TTL_MS
    delete process.env.AI_CHAT_FOCUS_ABSOLUTE_TTL_MS
  })

  it('creates a paired focus link without storing raw route or token values', async () => {
    const { createFocusLink, hashPair, hashRouteKey, hashToken } = require('../services/aiChatFocusLink.service')

    const link = await createFocusLink({
      sessionId: '64f000000000000000000001',
      sessionUserId: '64f000000000000000000002',
      createdByUserId: '64f000000000000000000003',
    })

    expect(link.path).toBe(`/aiChat/focus/${link.routeKey}/${link.token}`)
    expect(mockCreatedDocs).toHaveLength(1)
    expect(mockCreatedDocs[0]).toEqual(
      expect.objectContaining({
        routeKeyHash: hashRouteKey(link.routeKey),
        tokenHash: hashToken(link.token),
        pairHash: hashPair(link.routeKey, link.token),
      })
    )
    expect(mockCreatedDocs[0].routeKeyHash).not.toBe(link.routeKey)
    expect(mockCreatedDocs[0].tokenHash).not.toBe(link.token)
  })

  it('validates only the matching route-token pair and extends the sliding expiry', async () => {
    const { validateFocusLink, hashPair, hashRouteKey, hashToken } = require('../services/aiChatFocusLink.service')
    const routeKey = 'route-key'
    const token = 'secret-token'
    mockFindOneResult = {
      _id: 'focus-link-1',
      sessionId: '64f000000000000000000001',
      sessionUserId: '64f000000000000000000002',
      createdByUserId: '64f000000000000000000003',
      expiresAt: new Date(Date.now() + 600000),
      absoluteExpiresAt: new Date(Date.now() + 86400000),
      lastUsedAt: new Date(Date.now()),
      useCount: 2,
    }

    const result = await validateFocusLink(routeKey, token)
    const { AiChatFocusLinkModel } = require('../dbModels')

    expect(AiChatFocusLinkModel.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        routeKeyHash: hashRouteKey(routeKey),
        tokenHash: hashToken(token),
        pairHash: hashPair(routeKey, token),
        revokedAt: null,
      })
    )
    expect(result).toEqual(
      expect.objectContaining({
        id: 'focus-link-1',
        sessionId: '64f000000000000000000001',
        useCount: 3,
      })
    )
    expect(mockUpdates[0].update).toEqual(
      expect.objectContaining({
        $set: expect.objectContaining({
          expiresAt: new Date(Date.now() + 600000),
          lastUsedAt: new Date(Date.now()),
        }),
        $inc: { useCount: 1 },
      })
    )
  })
})
