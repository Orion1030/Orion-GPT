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


process.on("uncaughtException", (error, source) => {
  console.log("[UncaughtException]", error, source);
});

module.exports = app;
