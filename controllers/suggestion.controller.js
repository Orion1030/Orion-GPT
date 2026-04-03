const asyncErrorHandler = require("../middlewares/asyncErrorHandler");
const { UserModel } = require("../dbModels");
const { sendJsonResult } = require("../utils");
const { APP_URL } = process.env;

// TODO: Implement a suggestion controller to handle user suggestions
