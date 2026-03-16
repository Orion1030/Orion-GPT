require("dotenv").config();

// Diagnostic: log whether JWT_SECRET reaches the container (check Railway logs after deploy)
const jwtSecret = process.env.JWT_SECRET;
const hasJwtSecret = jwtSecret && String(jwtSecret).trim();
console.log("[startup] JWT_SECRET present:", !!jwtSecret, "non-empty:", !!hasJwtSecret);
if (!hasJwtSecret) {
  const envKeys = Object.keys(process.env).filter((k) => !/KEY|SECRET|PASSWORD|TOKEN|URI/i.test(k) || k === "JWT_SECRET");
  console.warn("[startup] Missing JWT_SECRET. Sample env keys:", envKeys.slice(0, 20).join(", "));
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
