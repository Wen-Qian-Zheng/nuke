const mongoose = require("mongoose");

const scoreSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    username: { type: String, required: true },
    score: { type: Number, required: true },
    wordsused: { type: Number, required: true },
    maxcombo: { type: Number, required: true },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Score", scoreSchema);
