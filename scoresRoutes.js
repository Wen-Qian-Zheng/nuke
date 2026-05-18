const router = require("express").Router();
const Score = require("./Score");
const TrigramPlay = require("./TrigramPlay");
const { requireAuth } = require("./authMiddleware");

router.post("/", requireAuth, async (req, res) => {
  try {
    const { score, wordsused, maxcombo } = req.body;
    const doc = await Score.create({
      userId: req.user.id,
      username: req.user.username,
      score,
      wordsused,
      maxcombo,
    });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/leaderboard", async (req, res) => {
  try {
    const sortBy = ["score", "wordsused", "maxcombo"].includes(req.query.sort)
      ? req.query.sort
      : "score";
    const limit = Math.min(parseInt(req.query.limit) || 15, 200);
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
        username: r.username,
        score: r.score,
        wordsused: r.wordsused,
        maxcombo: r.maxcombo,
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

router.get("/mine", requireAuth, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 200);
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const skip = (page - 1) * limit;
    const filter = { userId: req.user.id };
    if (req.query.since)
      filter.createdAt = { $gte: new Date(req.query.since) };
    const total = await Score.countDocuments(filter);
    const rows = await Score.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
    res.json({
      data: rows.map((r) => ({
        score: r.score,
        wordsused: r.wordsused,
        maxcombo: r.maxcombo,
        createdAt: r.createdAt,
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

router.post("/trigram", requireAuth, async (req, res) => {
  try {
    const { trigram, solved, wordlength, timetaken } = req.body;
    const doc = await TrigramPlay.create({
      userId: req.user.id,
      trigram,
      solved,
      wordlength: wordlength ?? null,
      timetaken: timetaken ?? null,
    });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/trigram/mine", requireAuth, async (req, res) => {
  try {
    let q = TrigramPlay.find({ userId: req.user.id });
    if (req.query.since)
      q = q.where("createdAt").gte(new Date(req.query.since));
    const rows = await q.lean();
    res.json(
      rows.map((r) => ({
        trigram: r.trigram,
        solved: r.solved,
        wordlength: r.wordlength,
        timetaken: r.timetaken,
        createdAt: r.createdAt,
      })),
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
