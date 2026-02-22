const RoleLevels = {
  ADMIN: 1,
  Manager: 2,
  User: 3,
  GUEST: 0,
};

const RequestTypes = {
  FORGETPWD: 1,
  CONTACT: 2,
  SIGNUP: 0
};

const Environments = {
  PROD: "production",
  DEV: "development",
  LOCAL: "local",
};
const StatusCodes = {
  SUCCESS: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500,
  ACTIVE: 1,
  INACTIVE: 0,
};
module.exports = { RoleLevels, RequestTypes, Environments, StatusCodes };
