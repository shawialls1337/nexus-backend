const mongoose = require("mongoose");

const licenseSchema = new mongoose.Schema({
  key: String,
  status: { type: String, default: "active" },
  hwid: { type: String, default: "" },
  username: { type: String, default: "Kullanıcı" },
  plan: { type: String, default: "standard" },
  expiresAt: { type: Date, default: null }
});

module.exports = mongoose.model("License", licenseSchema);