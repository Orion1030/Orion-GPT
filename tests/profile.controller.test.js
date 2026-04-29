describe("profile.controller getProfiles scope", () => {
  const buildRes = () => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  });

  const invoke = async (handler, req, res) => {
    handler(req, res, jest.fn());
    await new Promise((resolve) => setImmediate(resolve));
  };

  function buildSelectLean(result) {
    return {
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(result),
      }),
    };
  }

  function buildProfileModelFindMock() {
    const sort = jest.fn().mockResolvedValue([]);
    const find = jest.fn().mockReturnValue({ sort });
    return { find, sort };
  }

  function mockDbModels({
    find,
    findOne = jest.fn(),
    guestAccessResult = null,
  }) {
    const UserModel = {
      findOne: jest.fn().mockReturnValue(buildSelectLean(guestAccessResult)),
      updateMany: jest.fn(),
    };

    jest.doMock("../dbModels", () => ({
      ProfileModel: { find, findOne },
      TemplateModel: { findOne: jest.fn() },
      StackModel: { findOne: jest.fn() },
      UserModel,
    }));

    return { UserModel };
  }

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it("scopes non-admin users to their own profiles", async () => {
    const { find, sort } = buildProfileModelFindMock();
    mockDbModels({ find });

    const controller = require("../controllers/profile.controller");
    const req = {
      user: { _id: "user-1", role: 3 },
      query: { includeOtherUsers: "true" },
    };
    const res = buildRes();

    await invoke(controller.getProfiles, req, res);

    expect(find).toHaveBeenCalledWith({ userId: "user-1" });
    expect(sort).toHaveBeenCalledWith({ updatedAt: -1 });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("scopes admin users to their own profiles by default", async () => {
    const { find, sort } = buildProfileModelFindMock();
    mockDbModels({ find });

    const controller = require("../controllers/profile.controller");
    const req = {
      user: { _id: "admin-1", role: 1 },
      query: {},
    };
    const res = buildRes();

    await invoke(controller.getProfiles, req, res);

    expect(find).toHaveBeenCalledWith({ userId: "admin-1" });
    expect(sort).toHaveBeenCalledWith({ updatedAt: -1 });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("allows admin users to include all profiles when includeOtherUsers=true", async () => {
    const { find, sort } = buildProfileModelFindMock();
    mockDbModels({ find });

    const controller = require("../controllers/profile.controller");
    const req = {
      user: { _id: "admin-1", role: 1 },
      query: { includeOtherUsers: "true" },
    };
    const res = buildRes();

    await invoke(controller.getProfiles, req, res);

    expect(find).toHaveBeenCalledWith({});
    expect(sort).toHaveBeenCalledWith({ updatedAt: -1 });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("uses explicit userId filter for admin users even when includeOtherUsers=true", async () => {
    const { find, sort } = buildProfileModelFindMock();
    const { UserModel } = mockDbModels({ find, guestAccessResult: null });

    const controller = require("../controllers/profile.controller");
    const req = {
      user: { _id: "admin-1", role: 1 },
      query: { userId: "user-2", includeOtherUsers: "true" },
    };
    const res = buildRes();

    await invoke(controller.getProfiles, req, res);

    expect(UserModel.findOne).toHaveBeenCalledWith({ _id: "user-2", role: 0 });
    expect(find).toHaveBeenCalledWith({ userId: "user-2" });
    expect(sort).toHaveBeenCalledWith({ updatedAt: -1 });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("filters to active profiles when activeOnly=true for non-admin users", async () => {
    const { find, sort } = buildProfileModelFindMock();
    mockDbModels({ find });

    const controller = require("../controllers/profile.controller");
    const req = {
      user: { _id: "user-1", role: 3 },
      query: { activeOnly: "true" },
    };
    const res = buildRes();

    await invoke(controller.getProfiles, req, res);

    expect(find).toHaveBeenCalledWith({ $and: [{ userId: "user-1" }, { status: 1 }] });
    expect(sort).toHaveBeenCalledWith({ updatedAt: -1 });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("filters to active profiles when admin includeOtherUsers=true and activeOnly=true", async () => {
    const { find, sort } = buildProfileModelFindMock();
    mockDbModels({ find });

    const controller = require("../controllers/profile.controller");
    const req = {
      user: { _id: "admin-1", role: 1 },
      query: { includeOtherUsers: "true", activeOnly: "true" },
    };
    const res = buildRes();

    await invoke(controller.getProfiles, req, res);

    expect(find).toHaveBeenCalledWith({ status: 1 });
    expect(sort).toHaveBeenCalledWith({ updatedAt: -1 });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("includes assigned profiles when the requester is a guest", async () => {
    const { find, sort } = buildProfileModelFindMock();
    mockDbModels({
      find,
      guestAccessResult: {
        _id: "guest-1",
        assignedProfileIds: ["profile-9"],
      },
    });

    const controller = require("../controllers/profile.controller");
    const req = {
      user: { _id: "guest-1", role: 0 },
      query: {},
    };
    const res = buildRes();

    await invoke(controller.getProfiles, req, res);

    expect(find).toHaveBeenCalledWith({
      $or: [{ userId: "guest-1" }, { _id: { $in: ["profile-9"] } }],
    });
    expect(sort).toHaveBeenCalledWith({ updatedAt: -1 });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("rejects guest updates to assigned profiles", async () => {
    const findOne = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockReturnValueOnce(buildSelectLean({ _id: "profile-9" }));
    mockDbModels({
      find: jest.fn(),
      findOne,
      guestAccessResult: {
        _id: "guest-1",
        assignedProfileIds: ["profile-9"],
      },
    });

    const controller = require("../controllers/profile.controller");
    const req = {
      user: { _id: "guest-1", role: 0 },
      params: { profileId: "profile-9" },
      body: {},
    };
    const res = buildRes();

    await invoke(controller.updateProfile, req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: "Assigned profiles are read-only for guests",
      })
    );
  });
});
