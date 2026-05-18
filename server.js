const express = require("express");
const cookieParser = require("cookie-parser");
const path = require("path");
const connectDB = require("./db");

const app = express();
const port = 5000;

app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname)));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.use("/api/auth", require("./authRoutes"));
app.use("/api/auth", require("./passwordresetRoutes"));
app.use("/api/scores", require("./scoresRoutes"));
app.use("/api/admin", require("./adminRoutes"));

connectDB()
  .then(() => {
    app.listen(port, "0.0.0.0", () =>
      console.log(`Word Bomb is live on port ${port}!`),
    );
  })
  .catch((err) => {
    console.error("DB refused to connect:", err.message);
    process.exit(1);
  });
