
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
const ProfileModel = require("./Profile.Model");
const ApplicationModel = require("./Application.Model");
const BlacklistModel = require("./Blacklist.Model");
const WhitelistModel = require("./Whitelist.Model");
const ResumeModel = require("./Resume.Model");
const TemplateModel = require("./Template.Model");
const StackModel = require("./Stack.Model");

// Create connection to mongodb
const DBConnection = mongoose.createConnection(MONGO_URI, options);

// Bind models for App
const UserModelForApp = DBConnection.model("User", UserModel.schema);
const RequestModelForApp = DBConnection.model("Request", RequestModel.schema);
const PromptModelForApp = DBConnection.model("Prompt", PromptModel.schema);
const ProfileModelForApp = DBConnection.model("Profile", ProfileModel.schema);
const ApplicationModelForApp = DBConnection.model("Application", ApplicationModel.schema);
const BlacklistModelForApp = DBConnection.model("Blacklist", BlacklistModel.schema);
const WhitelistModelForApp = DBConnection.model("Whitelist", WhitelistModel.schema);
const ResumeModelForApp = DBConnection.model("Resume", ResumeModel.schema);
const TemplateModelForApp = DBConnection.model("Template", TemplateModel.schema);
const StackModelForApp = DBConnection.model("Stack", StackModel.schema);

module.exports = {
  DBConnection,
  UserModel: UserModelForApp,
  RequestModel: RequestModelForApp,
  PromptModel: PromptModelForApp,
  ProfileModel: ProfileModelForApp,
  ApplicationModel: ApplicationModelForApp,
  BlacklistModel: BlacklistModelForApp,
  WhitelistModel: WhitelistModelForApp,
  ResumeModel: ResumeModelForApp,
  TemplateModel: TemplateModelForApp,
  StackModel: StackModelForApp,
};
