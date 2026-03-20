const bodyParser = require("body-parser");
const express = require("express");
const morgan = require("morgan");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const session = require("express-session");
require("dotenv").config();
// import routes
const authRoutes = require("./routes/auth.route");
const userRoutes = require("./routes/user.route");
const adminRoutes = require("./routes/admin.route");
const promptRoutes = require("./routes/prompt.route");
const staticRoutes = require("./routes/static.route");
const profileRoutes = require("./routes/profile.route");
const templateRoutes = require("./routes/template.route");
const resumeRoutes = require("./routes/resume.route");
const chatRoutes = require("./routes/chat.route");
const messageRoutes = require("./routes/message.route");
const agentRoutes = require("./routes/agent.route");
const applicationRoutes = require("./routes/application.route");
const whitelistRoutes = require("./routes/whitelist.route");
const blacklistRoutes = require("./routes/blacklist.route");
const reportingRoutes = require("./routes/reporting.route");

// app
const app = express();

// CORS configuration
const corsOptions = {
  origin: (origin, callback) => callback(null, true),
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  credentials: true,
};

app.use(
  session({
    resave: false,
    saveUninitialized: true,
    secret: "Orion-1030",
  }),
);

app.set("view engine", "ejs");

// middlewares
app.use(morgan("dev"));

// Increase JSON body size to allow sending rendered HTML for server-side PDF generation
app.use(bodyParser.json({ limit: '2mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '2mb' }));
app.use(cookieParser());
app.use(cors(corsOptions));

// routes middleware
app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);
app.use("/api/prompt", promptRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/static", staticRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/template", templateRoutes);
app.use("/api/resume", resumeRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/agent", agentRoutes);
app.use("/api/applications", applicationRoutes);
app.use("/api/whitelist", whitelistRoutes);
app.use("/api/blacklist", blacklistRoutes);
app.use("/api/reporting", reportingRoutes);


// Health & readiness endpoints
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

app.get('/ready', async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const dbState = mongoose.connection.readyState;
    if (dbState !== 1) {
      return res.status(503).json({ status: 'not_ready', db: 'disconnected' });
    }
    res.json({ status: 'ready', db: 'connected' });
  } catch (err) {
    res.status(503).json({ status: 'error', message: err.message });
  }
});

process.on("uncaughtException", (error, source) => {
  console.log("[UncaughtException]", error, source);
});

module.exports = app;
