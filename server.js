require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const path = require("path");

const License = require("./models/License");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

mongoose.connect(process.env.MONGO_URI, {
  serverSelectionTimeoutMS: 10000
})
  .then(() => console.log("MongoDB bağlandı."))
  .catch((err) => console.error("MongoDB bağlantı hatası:", err));

function isAdmin(req) {
  return req.body && req.body.adminPassword === process.env.ADMIN_PASSWORD;
}

app.get("/", (req, res) => {
  res.send("Backend çalışıyor");
});

app.get("/api/health", (req, res) => {
  res.json({ success: true, message: "ok" });
});

app.get("/api/admin/list-keys", async (req, res) => {
  try {
    const adminPassword = req.query.adminPassword;

    if (adminPassword !== process.env.ADMIN_PASSWORD) {
      return res.status(403).json({ success: false, message: "Yetkisiz." });
    }

    const keys = await License.find().sort({ createdAt: -1 });

    return res.json({
      success: true,
      data: keys
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
});

app.post("/api/admin/create-key", async (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({ success: false, message: "Yetkisiz." });
    }

    const { key, username, plan, days } = req.body;

    if (!key || !key.trim()) {
      return res.status(400).json({ success: false, message: "Key gerekli." });
    }

    const exists = await License.findOne({ key: key.trim() });
    if (exists) {
      return res.status(400).json({ success: false, message: "Bu key zaten var." });
    }

    let expiresAt = null;
    if (days && Number(days) > 0) {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + Number(days));
    }

    const newLicense = new License({
      key: key.trim(),
      username: username?.trim() || "-",
      plan: plan || "standard",
      expiresAt,
      status: "active",
      hwid: ""
    });

    await newLicense.save();

    return res.json({
      success: true,
      message: "Key oluşturuldu.",
      data: newLicense
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
});

app.post("/api/admin/delete-key", async (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({ success: false, message: "Yetkisiz." });
    }

    const { key } = req.body;

    if (!key || !key.trim()) {
      return res.status(400).json({ success: false, message: "Key gerekli." });
    }

    const deleted = await License.findOneAndDelete({ key: key.trim() });

    if (!deleted) {
      return res.status(404).json({ success: false, message: "Key bulunamadı." });
    }

    return res.json({
      success: true,
      message: "Key silindi."
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
});

app.post("/api/admin/extend-key", async (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({ success: false, message: "Yetkisiz." });
    }

    const { key, days } = req.body;

    if (!key || !key.trim()) {
      return res.status(400).json({ success: false, message: "Key gerekli." });
    }

    const found = await License.findOne({ key: key.trim() });

    if (!found) {
      return res.status(404).json({ success: false, message: "Key bulunamadı." });
    }

    const addDays = Number(days);
    if (!addDays || addDays <= 0) {
      return res.status(400).json({ success: false, message: "Geçerli gün gir." });
    }

    let baseDate = new Date();
    if (found.expiresAt && new Date(found.expiresAt) > new Date()) {
      baseDate = new Date(found.expiresAt);
    }

    baseDate.setDate(baseDate.getDate() + addDays);
    found.expiresAt = baseDate;

    if (found.status !== "banned") {
      found.status = "active";
    }

    await found.save();

    return res.json({
      success: true,
      message: `Key süresi +${addDays} gün uzatıldı.`,
      expiresAt: found.expiresAt
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
});

// 🔴 HWID BAN
app.post("/api/admin/hwid-ban", async (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({ success: false, message: "Yetkisiz." });
    }

    const { key } = req.body;

    if (!key || !key.trim()) {
      return res.status(400).json({ success: false, message: "Key gerekli." });
    }

    const found = await License.findOne({ key: key.trim() });

    if (!found) {
      return res.status(404).json({ success: false, message: "Key bulunamadı." });
    }

    found.hwid = "BANNED";
    found.status = "banned";
    await found.save();

    return res.json({
      success: true,
      message: "HWID ban atıldı."
    });

  } catch (err) {
    return res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
});

// 🟢 HWID UNBAN
app.post("/api/admin/hwid-unban", async (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({ success: false, message: "Yetkisiz." });
    }

    const { key } = req.body;

    if (!key || !key.trim()) {
      return res.status(400).json({ success: false, message: "Key gerekli." });
    }

    const found = await License.findOne({ key: key.trim() });

    if (!found) {
      return res.status(404).json({ success: false, message: "Key bulunamadı." });
    }

    found.hwid = "";
    found.status =
      found.expiresAt && new Date() > new Date(found.expiresAt)
        ? "expired"
        : "active";

    await found.save();

    return res.json({
      success: true,
      message: "HWID ban kaldırıldı.",
      status: found.status
    });

  } catch (err) {
    return res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { licenseKey, hwid } = req.body;

    if (!licenseKey || !hwid) {
      return res.status(400).json({ success: false, message: "Key ve HWID gerekli." });
    }

    const found = await License.findOne({ key: licenseKey.trim() });

    if (!found) {
      return res.status(404).json({ success: false, message: "Geçersiz key." });
    }

    if (found.status === "banned" || found.hwid === "BANNED") {
      return res.json({ success: false, message: "Bu key yasaklanmış." });
    }

    if (found.expiresAt && new Date() > new Date(found.expiresAt)) {
      found.status = "expired";
      await found.save();
      return res.json({ success: false, message: "Bu keyin süresi dolmuş." });
    }

    if (!found.hwid) {
      found.hwid = hwid.trim();
      await found.save();
    } else if (found.hwid !== hwid.trim()) {
      return res.json({ success: false, message: "Bu key başka bir cihaza bağlı." });
    }

    if (found.status !== "active") {
      found.status = "active";
      await found.save();
    }

    return res.json({ success: true, message: "Giriş başarılı.", data: found });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Sunucu hatası" });
  }
});

app.use("/api", (req, res) => {
  return res.status(404).json({ success: false, message: "API endpoint bulunamadı." });
});

app.use(express.static(path.join(__dirname, "public")));

app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

app.listen(PORT, () => {
  console.log("Server çalışıyor:", PORT);
});
