
const mongoose = require("mongoose");

// Normalize deprecated mongoose options: convert { new: true/false } to returnDocument to silence warnings
mongoose.plugin((schema) => {
  const handler = function () {
    const opts = (typeof this.getOptions === 'function' ? this.getOptions() : this.options) || {};
    if (Object.prototype.hasOwnProperty.call(opts, "new")) {
      opts.returnDocument = opts.new ? "after" : "before";
      delete opts.new;
      this.setOptions(opts);
    }
  };
  schema.pre("findOneAndUpdate", handler);
  schema.pre("findOneAndReplace", handler);
});

// Determine MongoDB URI from environment with sensible fallbacks
const uri =
  process.env.MONGO_URI ||
  process.env.DB_URI ||
  "mongodb://localhost:27017/jobsy";

if (!uri || typeof uri !== "string") {
  throw new Error("Missing or invalid MongoDB URI. Set MONGO_URI env var.");
}

const options = {
  // keep options here if you need to enable them later
};

const UserModel = require("./User.Model");
const PromptModel = require("./Prompt.Model");
const PromptAuditModel = require("./PromptAudit.Model");
const ProfileModel = require("./Profile.Model");
const ApplicationModel = require("./Application.Model");
const ApplicationEventModel = require("./ApplicationEvent.Model");
const BlacklistModel = require("./BlackList.Model");
const WhitelistModel = require("./WhiteList.Model");
const ResumeModel = require("./Resume.Model");
const TemplateModel = require("./Template.Model");
const StackModel = require("./Stack.Model");
const TeamModel = require("./Team.Model");
const AdminConfigurationModel = require("./AdminConfiguration.Model");
const AiProviderCatalogModel = require("./AiProviderCatalog.Model");
const ResumeGenerationRunModel = require("./ResumeGenerationRun.Model");
const ChatSessionModel = require("./ChatSession.Model");
const ChatMessageModel = require("./ChatMessage.Model");
const AiChatFocusLinkModel = require("./AiChatFocusLink.Model");
const JobDescriptionModel = require("./JobDescription.Model");
const JobModel = require("./Job.Model");
const PageAccessModel = require("./PageAccess.Model");
const NotificationModel = require("./Notification.Model");

// Create connection to mongodb
const DBConnection = mongoose.createConnection(uri, options);

// Bind models for App
const UserModelForApp = DBConnection.model("User", UserModel.schema);
const PromptModelForApp = DBConnection.model("Prompt", PromptModel.schema);
const PromptAuditModelForApp = DBConnection.model("PromptAudit", PromptAuditModel.schema);
const ProfileModelForApp = DBConnection.model("Profile", ProfileModel.schema);
const ApplicationModelForApp = DBConnection.model("Application", ApplicationModel.schema);
const ApplicationEventModelForApp = DBConnection.model("ApplicationEvent", ApplicationEventModel.schema);
const BlacklistModelForApp = DBConnection.model("Blacklist", BlacklistModel.schema);
const WhitelistModelForApp = DBConnection.model("Whitelist", WhitelistModel.schema);
const ResumeModelForApp = DBConnection.model("Resume", ResumeModel.schema);
const TemplateModelForApp = DBConnection.model("Template", TemplateModel.schema);
const StackModelForApp = DBConnection.model("Stack", StackModel.schema);
const TeamModelForApp = DBConnection.model("Team", TeamModel.schema);
const AdminConfigurationModelForApp = DBConnection.model("AdminConfiguration", AdminConfigurationModel.schema);
const AiProviderCatalogModelForApp = DBConnection.model("AiProviderCatalog", AiProviderCatalogModel.schema);
const ResumeGenerationRunModelForApp = DBConnection.model("ResumeGenerationRun", ResumeGenerationRunModel.schema);
const ChatSessionModelForApp = DBConnection.model("ChatSession", ChatSessionModel.schema);
const ChatMessageModelForApp = DBConnection.model("ChatMessage", ChatMessageModel.schema);
const AiChatFocusLinkModelForApp = DBConnection.model("AiChatFocusLink", AiChatFocusLinkModel.schema);
const JobDescriptionModelForApp = DBConnection.model("JobDescription", JobDescriptionModel.schema);
const JobModelForApp = DBConnection.model("Job", JobModel.schema);
const PageAccessModelForApp = DBConnection.model("PageAccess", PageAccessModel.schema);
const NotificationModelForApp = DBConnection.model("Notification", NotificationModel.schema);

module.exports = {
  MONGO_URI: uri,
  DBConnection,
  UserModel: UserModelForApp,
  PromptModel: PromptModelForApp,
  PromptAuditModel: PromptAuditModelForApp,
  ProfileModel: ProfileModelForApp,
  ApplicationModel: ApplicationModelForApp,
  ApplicationEventModel: ApplicationEventModelForApp,
  BlacklistModel: BlacklistModelForApp,
  WhitelistModel: WhitelistModelForApp,
  ResumeModel: ResumeModelForApp,
  TemplateModel: TemplateModelForApp,
  StackModel: StackModelForApp,
  TeamModel: TeamModelForApp,
  AdminConfigurationModel: AdminConfigurationModelForApp,
  AiProviderCatalogModel: AiProviderCatalogModelForApp,
  ResumeGenerationRunModel: ResumeGenerationRunModelForApp,
  ChatSessionModel: ChatSessionModelForApp,
  ChatMessageModel: ChatMessageModelForApp,
  AiChatFocusLinkModel: AiChatFocusLinkModelForApp,
  JobDescriptionModel: JobDescriptionModelForApp,
  JobModel: JobModelForApp,
  PageAccessModel: PageAccessModelForApp,
  NotificationModel: NotificationModelForApp,
};
