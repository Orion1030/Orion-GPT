const RoleLevels = {
  ADMIN: 1,
  MEMBER: 2,
  GUEST: 3,
};

const RequestTypes = {
  RESETPWD: 1,
  CONTACT: 2,
};

const Environments = {
  PROD: "production",
  DEV: "development",
  LOCAL: "local",
};
module.exports = { RoleLevels, RequestTypes, Environments };
