require("dotenv").config();
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
module.exports.handler = serverless(app);
