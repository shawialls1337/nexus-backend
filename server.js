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

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB bağlandı."))
  .catch((err) => console.error("MongoDB hatası:", err.message));

app.get("/", (req, res) => {
  res.send("Backend çalışıyor");
});

app.listen(PORT, () => {
  console.log("Server çalışıyor: " + PORT);
});