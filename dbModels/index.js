
const mongoose = require("mongoose");

// Determine MongoDB URI from environment with sensible fallbacks
const uri =
  process.env.MONGO_URI ||
  process.env.MONGODB_URI ||
  process.env.DB_URI ||
  "mongodb://localhost:27017/jobsy";

if (!uri || typeof uri !== "string") {
  throw new Error("Missing or invalid MongoDB URI. Set MONGO_URI env var.");
}

const options = {
  // keep options here if you need to enable them later
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
const ChatSessionModel = require("./ChatSession.Model");
const ChatMessageModel = require("./ChatMessage.Model");
const JobDescriptionModel = require("./JobDescription.Model");

// Create connection to mongodb
const DBConnection = mongoose.createConnection(uri, options);

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
const ChatSessionModelForApp = DBConnection.model("ChatSession", ChatSessionModel.schema);
const ChatMessageModelForApp = DBConnection.model("ChatMessage", ChatMessageModel.schema);
const JobDescriptionModelForApp = DBConnection.model("JobDescription", JobDescriptionModel.schema);

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
  ChatSessionModel: ChatSessionModelForApp,
  ChatMessageModel: ChatMessageModelForApp,
  JobDescriptionModel: JobDescriptionModelForApp,
};
