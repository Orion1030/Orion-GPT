const express = require("express");
const { checkNormal } = require("../controllers/static.controller");

const router = express.Router();
router.route("/normal").get(checkNormal);

module.exports = router;
