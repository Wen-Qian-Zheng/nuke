const router = require("express").Router();
const Score = require("./Score");
const TrigramPlay = require("./TrigramPlay");
const { requireAdmin } = require("./authMiddleware");

router.get("/scores", requireAdmin, async (req, res) => {
  try {
    const sortBy = ["score", "wordsused", "maxcombo", "createdAt"].includes(
      req.query.sort,
    )
      ? req.query.sort
      : "score";
    const limit = Math.min(parseInt(req.query.limit) || 20, 200);
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const skip = (page - 1) * limit;
    const total = await Score.countDocuments();
    const rows = await Score.find()
      .sort({ [sortBy]: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
    const User = require("./User");
    const userIds = [...new Set(rows.map((r) => r.userId).filter(Boolean))];
    const users = await User.find(
      { _id: { $in: userIds } },
      "_id pfpUrl",
    ).lean();
    const pfpMap = {};
    for (const u of users) pfpMap[String(u._id)] = u.pfpUrl || null;
    res.json({
      data: rows.map((r) => ({
        ...r,
        id: r._id,
        createdAt: r.createdAt,
        pfpUrl: pfpMap[String(r.userId)] || null,
      })),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function validateScoreFields({ score, wordsused, maxcombo }) {
  if (wordsused != null && maxcombo != null && wordsused < maxcombo)
    return `Words (${wordsused}) can't be less than combo (${maxcombo}) lol.`;
  if (score != null && wordsused != null && score < 100 * wordsused)
    return `Score (${score}) needs to be >= 100x words (${100 * wordsused}).`;
  return null;
}

router.post("/scores", requireAdmin, async (req, res) => {
  try {
    const { username, score, wordsused, maxcombo } = req.body;
    const validationError = validateScoreFields({ score, wordsused, maxcombo });
    if (validationError)
      return res.status(400).json({ error: validationError });
    const User = require("./User");
    const match = await User.findOne({ username }).lean();
    const userId = match ? match._id : null;
    const doc = await Score.create({
      userId,
      username,
      score,
      wordsused,
      maxcombo,
    });
    res.json({ ...doc.toObject(), id: doc._id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/scores/:id", requireAdmin, async (req, res) => {
  try {
    const { username, score, wordsused, maxcombo } = req.body;
    const validationError = validateScoreFields({ score, wordsused, maxcombo });
    if (validationError)
      return res.status(400).json({ error: validationError });
    const doc = await Score.findByIdAndUpdate(
      req.params.id,
      { username, score, wordsused, maxcombo },
      { new: true },
    );
    if (!doc) return res.status(404).json({ error: "Can't find that anywhere!" });
    res.json({ ...doc.toObject(), id: doc._id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/scores/:id", requireAdmin, async (req, res) => {
  try {
    await Score.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/scores", requireAdmin, async (req, res) => {
  try {
    const { ids } = req.body;
    await Score.deleteMany({ _id: { $in: ids } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/trigram-plays", requireAdmin, async (req, res) => {
  try {
    const rows = await TrigramPlay.find().sort({ createdAt: -1 }).lean();
    res.json(
      rows.map((r) => ({
        ...r,
        id: r._id,
        userId: r.userId,
        createdAt: r.createdAt,
      })),
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/trigram-plays/:id", requireAdmin, async (req, res) => {
  try {
    await TrigramPlay.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/trigram-plays", requireAdmin, async (req, res) => {
  try {
    const { ids } = req.body;
    await TrigramPlay.deleteMany({ _id: { $in: ids } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
