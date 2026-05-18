const mongoose = require("mongoose");

const trigramPlaySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    trigram: { type: String, required: true },
    solved: { type: Boolean, required: true },
    wordlength: { type: Number, default: null },
    timetaken: { type: Number, default: null },
  },
  { timestamps: true },
);

module.exports = mongoose.model("TrigramPlay", trigramPlaySchema);
