require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const path = require("path");

const License = require("./models/License");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

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

app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

app.get("/api/test-db", async (req, res) => {
  try {
    const state = mongoose.connection.readyState;

    return res.json({
      success: true,
      mongoState: state,
      mongoUriExists: !!process.env.MONGO_URI,
      adminPasswordExists: !!process.env.ADMIN_PASSWORD
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "DB test hatası",
      error: error.message
    });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { licenseKey, hwid } = req.body;

    if (!licenseKey || !hwid) {
      return res.status(400).json({
        success: false,
        message: "Key veya cihaz bilgisi eksik."
      });
    }

    const foundKey = await License.findOne({ key: licenseKey.trim() });

    if (!foundKey) {
      return res.json({
        success: false,
        message: "Geçersiz key."
      });
    }

    if (foundKey.status === "banned") {
      return res.json({
        success: false,
        message: "Bu key yasaklanmış."
      });
    }

    if (foundKey.status === "expired") {
      return res.json({
        success: false,
        message: "Bu key süresi dolmuş."
      });
    }

    if (foundKey.expiresAt && new Date() > new Date(foundKey.expiresAt)) {
      foundKey.status = "expired";
      await foundKey.save();

      return res.json({
        success: false,
        message: "Bu key süresi dolmuş."
      });
    }

    if (!foundKey.hwid) {
      foundKey.hwid = hwid.trim();
    } else if (foundKey.hwid !== hwid.trim()) {
      return res.json({
        success: false,
        message: "Bu key başka cihaza bağlı."
      });
    }

    foundKey.lastLoginAt = new Date();
    await foundKey.save();

    return res.json({
      success: true,
      message: "Giriş başarılı.",
      username: foundKey.username,
      plan: foundKey.plan
    });
  } catch (error) {
    console.error("Login hatası:", error);
    return res.status(500).json({
      success: false,
      message: "Sunucu hatası."
    });
  }
});

app.post("/api/admin/create-key", async (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({
        success: false,
        message: "Yetkisiz işlem."
      });
    }

    const { key, username, plan, days } = req.body;

    if (!key || !key.trim()) {
      return res.status(400).json({
        success: false,
        message: "Key gerekli."
      });
    }

    const cleanKey = key.trim();

    const existing = await License.findOne({ key: cleanKey });
    if (existing) {
      return res.json({
        success: false,
        message: "Bu key zaten var."
      });
    }

    let expiresAt = null;
    if (days && Number(days) > 0) {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + Number(days));
    }

    const newKey = new License({
      key: cleanKey,
      username: username?.trim() || "Kullanıcı",
      plan: plan || "standard",
      expiresAt
    });

    await newKey.save();

    return res.json({
      success: true,
      message: "Key oluşturuldu.",
      data: newKey
    });
  } catch (error) {
    console.error("Create key hatası:", error);
    return res.status(500).json({
      success: false,
      message: "Sunucu hatası.",
      error: error.message
    });
  }
});

app.post("/api/admin/delete-key", async (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({
        success: false,
        message: "Yetkisiz işlem."
      });
    }

    const { key } = req.body;

    if (!key || !key.trim()) {
      return res.status(400).json({
        success: false,
        message: "Key gerekli."
      });
    }

    const deleted = await License.findOneAndDelete({ key: key.trim() });

    if (!deleted) {
      return res.json({
        success: false,
        message: "Key bulunamadı."
      });
    }

    return res.json({
      success: true,
      message: "Key silindi."
    });
  } catch (error) {
    console.error("Delete key hatası:", error);
    return res.status(500).json({
      success: false,
      message: "Sunucu hatası.",
      error: error.message
    });
  }
});

app.post("/api/admin/ban-key", async (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({
        success: false,
        message: "Yetkisiz işlem."
      });
    }

    const { key } = req.body;

    if (!key || !key.trim()) {
      return res.status(400).json({
        success: false,
        message: "Key gerekli."
      });
    }

    const found = await License.findOne({ key: key.trim() });

    if (!found) {
      return res.json({
        success: false,
        message: "Key bulunamadı."
      });
    }

    found.status = "banned";
    await found.save();

    return res.json({
      success: true,
      message: "Key banlandı."
    });
  } catch (error) {
    console.error("Ban key hatası:", error);
    return res.status(500).json({
      success: false,
      message: "Sunucu hatası.",
      error: error.message
    });
  }
});

app.post("/api/admin/extend-key", async (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({
        success: false,
        message: "Yetkisiz işlem."
      });
    }

    const { key, days } = req.body;

    if (!key || !key.trim()) {
      return res.status(400).json({
        success: false,
        message: "Key gerekli."
      });
    }

    const found = await License.findOne({ key: key.trim() });

    if (!found) {
      return res.json({
        success: false,
        message: "Key bulunamadı."
      });
    }

    const addDays = Number(days || 0);
    if (addDays <= 0) {
      return res.json({
        success: false,
        message: "Geçerli gün gir."
      });
    }

    let baseDate =
      found.expiresAt && new Date(found.expiresAt) > new Date()
        ? new Date(found.expiresAt)
        : new Date();

    baseDate.setDate(baseDate.getDate() + addDays);

    found.expiresAt = baseDate;
    found.status = "active";
    await found.save();

    return res.json({
      success: true,
      message: "Key süresi uzatıldı.",
      expiresAt: found.expiresAt
    });
  } catch (error) {
    console.error("Extend key hatası:", error);
    return res.status(500).json({
      success: false,
      message: "Sunucu hatası.",
      error: error.message
    });
  }
});

app.post("/api/admin/reset-hwid", async (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({
        success: false,
        message: "Yetkisiz işlem."
      });
    }

    const { key } = req.body;

    if (!key || !key.trim()) {
      return res.status(400).json({
        success: false,
        message: "Key gerekli."
      });
    }

    const found = await License.findOne({ key: key.trim() });

    if (!found) {
      return res.json({
        success: false,
        message: "Key bulunamadı."
      });
    }

    found.hwid = "";
    await found.save();

    return res.json({
      success: true,
      message: "HWID sıfırlandı."
    });
  } catch (error) {
    console.error("Reset HWID hatası:", error);
    return res.status(500).json({
      success: false,
      message: "Sunucu hatası.",
      error: error.message
    });
  }
});

app.get("/api/admin/list-keys", async (req, res) => {
  try {
    const adminPassword = req.query.adminPassword;

    if (adminPassword !== process.env.ADMIN_PASSWORD) {
      return res.status(403).json({
        success: false,
        message: "Yetkisiz işlem."
      });
    }

    const keys = await License.find().sort({ createdAt: -1 });

    return res.json({
      success: true,
      data: keys
    });
  } catch (error) {
    console.error("List keys hatası:", error);
    return res.status(500).json({
      success: false,
      message: "Sunucu hatası.",
      error: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log("Server çalışıyor: " + PORT);
});