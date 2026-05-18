const mongoose = require("mongoose");

let connected = false;

async function connectDB() {
  if (connected) return;
  await mongoose.connect(process.env.MONGODB_URI);
  connected = true;
  console.log("DB connected, let's go!");
}

module.exports = connectDB;
