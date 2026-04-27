// Force dotenv to stay silent even if loaded multiple times by dependencies
process.env.DOTENV_CONFIG_QUIET = 'true';
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

const localEnvPath = path.join(__dirname, ".env.local");
const defaultEnvPath = path.join(__dirname, ".env");

if (fs.existsSync(defaultEnvPath)) {
  dotenv.config({ path: defaultEnvPath, quiet: true });
}
if (fs.existsSync(localEnvPath)) {
  dotenv.config({ path: localEnvPath, quiet: true, override: true });
}

// Diagnostic: log whether JWT_SECRET reaches the container (check Railway logs after deploy)
const jwtSecret = process.env.JWT_SECRET;
const hasJwtSecret = jwtSecret && String(jwtSecret).trim();

if (!hasJwtSecret) {
  const envKeys = Object.keys(process.env).filter((k) => !/KEY|SECRET|PASSWORD|TOKEN|URI/i.test(k) || k === "JWT_SECRET");
  console.warn("[startup] Missing JWT_SECRET. Sample env keys:", envKeys.slice(0, 20).join(", "));
}

const { Environments } = require("./utils/constants");
const serverless = require("serverless-http");
const http = require('http')
const { DBConnection, UserModel } = require("./dbModels");
const { initSocketServer } = require('./realtime/socketServer')
const { startNotificationChangeStream } = require('./services/notificationStream.service')

DBConnection.on("connected", async () => {
  console.log("Connected to appDB");
  startNotificationChangeStream()
});
DBConnection.on("error", (error) => {
  console.error("MongoDB connection error:", error?.message || error);
});

const app = require("./app");
const HOST = process.env.HOST || "0.0.0.0";
const PORT = process.env.PORT || 5050;
const env = process.env.NODE_ENV || "development";
const httpServer = http.createServer(app)
initSocketServer(httpServer)
httpServer.listen(PORT, HOST, () => {
  console.log(
    `Server is running${env === Environments.LOCAL ? ` on ${HOST}:${PORT}` : ''}`,
  );
});

// Start job runner and register agents
try {
  const jobRunner = require('./workers/jobRunner');
  // Register handlers
  try { jobRunner.registerHandler('parse_jd', require('./agents/jdParser')) } catch (e) { console.warn('Could not register jdParser', e) }
  try { jobRunner.registerHandler('find_top_resumes', require('./agents/atsScorer')) } catch (e) { console.warn('Could not register atsScorer', e) }
  try { jobRunner.registerHandler('generate_resume', require('./agents/resumeGenerator')) } catch (e) { console.warn('Could not register resumeGenerator', e) }
  try { jobRunner.registerHandler('generate_application_resume', require('./agents/applicationResumeGenerator')) } catch (e) { console.warn('Could not register applicationResumeGenerator', e) }
  jobRunner.start();
} catch (e) {
  console.warn('Job runner not started', e);
}
module.exports.handler = serverless(app);
