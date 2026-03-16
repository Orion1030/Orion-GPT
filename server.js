require("dotenv").config();
if (!process.env.JWT_SECRET || !String(process.env.JWT_SECRET).trim()) {
  throw new Error("JWT_SECRET must be set and non-empty in the environment (e.g. in Railway Variables).");
}
const { Environments } = require("./utils/constants");
const serverless = require("serverless-http");
const { DBConnection, UserModel } = require("./dbModels");

DBConnection.on("connected", async () => {
  console.log("Connected to appDB");
});

const app = require("./app");
const PORT = process.env.PORT || 5050;
const env = process.env.NODE_ENV || "development";
app.listen(PORT, () => {
  console.log(
    `Server is running${env === Environments.LOCAL ? " on port ${PORT}" : ""}`,
  );
});

// Start job runner and register agents
try {
  const jobRunner = require('./workers/jobRunner');
  // Register handlers
  try { jobRunner.registerHandler('parse_jd', require('./agents/jdParser')) } catch (e) { console.warn('Could not register jdParser', e) }
  try { jobRunner.registerHandler('find_top_resumes', require('./agents/atsScorer')) } catch (e) { console.warn('Could not register atsScorer', e) }
  try { jobRunner.registerHandler('generate_resume', require('./agents/resumeGenerator')) } catch (e) { console.warn('Could not register resumeGenerator', e) }
  jobRunner.start();
} catch (e) {
  console.warn('Job runner not started', e);
}
module.exports.handler = serverless(app);
