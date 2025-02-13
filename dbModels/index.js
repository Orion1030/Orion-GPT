require("dotenv").config();
const mongoose = require("mongoose");
const { MONGO_URI } = process.env;

const options = {
  // useNewUrlParser: true,
  // useUnifiedTopology: true,
  // useCreateIndex: true,
  // useFindAndModify: false
};

const UserModel = require("./User.Model");
const RequestModel = require("./Request.Model");
const PromptModel = require("./Prompt.Model");

// Create connection to mongodb
const DBConnection = mongoose.createConnection(MONGO_URI, options);

// Bind models for App
const UserModelForApp = DBConnection.model("User", UserModel.schema);
const RequestModelForApp = DBConnection.model("Request", RequestModel.schema);
const PromptModelForApp = DBConnection.model("Prompt", PromptModel.schema);

module.exports = {
  DBConnection,
  UserModel: UserModelForApp,
  RequestModel: RequestModelForApp,
  PromptModel: PromptModelForApp,
};
