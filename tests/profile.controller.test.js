describe("profile.controller getProfiles scope", () => {
  const buildRes = () => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  });

  const invoke = async (handler, req, res) => {
    handler(req, res, jest.fn());
    await new Promise((resolve) => setImmediate(resolve));
  };

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  function buildProfileModelFindMock() {
    const sort = jest.fn().mockResolvedValue([]);
    const find = jest.fn().mockReturnValue({ sort });
    return { find, sort };
  }

  it("scopes non-admin users to their own profiles", async () => {
    const { find, sort } = buildProfileModelFindMock();
    jest.doMock("../dbModels", () => ({
      ProfileModel: { find, findOne: jest.fn() },
    }));

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
    jest.doMock("../dbModels", () => ({
      ProfileModel: { find, findOne: jest.fn() },
    }));

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
    jest.doMock("../dbModels", () => ({
      ProfileModel: { find, findOne: jest.fn() },
    }));

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
    jest.doMock("../dbModels", () => ({
      ProfileModel: { find, findOne: jest.fn() },
    }));

    const controller = require("../controllers/profile.controller");
    const req = {
      user: { _id: "admin-1", role: 1 },
      query: { userId: "user-2", includeOtherUsers: "true" },
    };
    const res = buildRes();

    await invoke(controller.getProfiles, req, res);

    expect(find).toHaveBeenCalledWith({ userId: "user-2" });
    expect(sort).toHaveBeenCalledWith({ updatedAt: -1 });
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

