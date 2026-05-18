const router = require("express").Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("cloudinary").v2;
const User = require("./User");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const cookieOpts = {
  httpOnly: true,
  sameSite: "lax",
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

const pfpStorage = new CloudinaryStorage({
  cloudinary,
  params: (req) => ({
    public_id: String(req.userId),
    overwrite: true,
    allowed_formats: ["jpg", "jpeg", "png", "gif", "webp"],
    transformation: [
      { width: 256, height: 256, crop: "fill", gravity: "face" },
    ],
  }),
});

const pfpUpload = multer({
  storage: pfpStorage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Images only! (jpeg, png, gif, webp)"));
  },
});

function makeToken(user) {
  return jwt.sign(
    {
      id: user._id,
      email: user.email,
      username: user.username,
      isAdmin: user.isAdmin,
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" },
  );
}

function safeUser(user) {
  return {
    id: user._id,
    email: user.email,
    username: user.username,
    isAdmin: user.isAdmin,
    pfpUrl: user.pfpUrl || null,
  };
}

function authMiddleware(req, res, next) {
  const token = req.cookies?.token;
  if (!token) return res.status(401).json({ error: "Who are you? Log in first!" });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = payload.id;
    next();
  } catch {
    res.status(401).json({ error: "Who are you? Log in first!" });
  }
}

router.post("/register", async (req, res) => {
  try {
    const { email, password, username } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: "Need both email AND password, come on!" });
    const exists = await User.findOne({ email });
    if (exists) return res.status(400).json({ error: "That email's already taken, snooze you lose!" });
    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({
      email,
      password: hashed,
      username: username || email.split("@")[0],
    });
    res.cookie("token", makeToken(user), cookieOpts);
    res.json(safeUser(user));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user)
      return res.status(401).json({ error: "Wrong email or password, try again!" });
    const ok = await bcrypt.compare(password, user.password);
    if (!ok)
      return res.status(401).json({ error: "Wrong email or password, try again!" });
    res.cookie("token", makeToken(user), cookieOpts);
    res.json(safeUser(user));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/logout", (req, res) => {
  res.clearCookie("token");
  res.json({ ok: true });
});

router.get("/me", async (req, res) => {
  const token = req.cookies?.token;
  if (!token) return res.json(null);
  try {
    const { id } = require("jsonwebtoken").verify(
      token,
      process.env.JWT_SECRET,
    );
    const user = await User.findById(id).lean();
    if (!user) return res.json(null);
    const fresh = safeUser(user);
    res.cookie("token", makeToken(user), cookieOpts);
    res.json(fresh);
  } catch {
    res.json(null);
  }
});

router.patch("/me", async (req, res) => {
  const token = req.cookies?.token;
  if (!token) return res.status(401).json({ error: "Who are you? Log in first!" });
  try {
    const { id } = require("jsonwebtoken").verify(
      token,
      process.env.JWT_SECRET,
    );
    const { username } = req.body;
    if (!username?.trim())
      return res.status(400).json({ error: "You need a username, duh!" });
    const trimmed = username.trim();
    const user = await User.findByIdAndUpdate(
      id,
      { username: trimmed },
      { new: true },
    );
    const Score = require("./Score");
    await Score.updateMany({ userId: id }, { username: trimmed });
    res.cookie("token", makeToken(user), cookieOpts);
    res.json(safeUser(user));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/me/pfp", authMiddleware, (req, res, next) => {
  pfpUpload.single("pfp")(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: "You forgot to attach a file?" });
    try {
      const pfpUrl = req.file.path;
      const user = await User.findByIdAndUpdate(
        req.userId,
        { pfpUrl },
        { new: true },
      );
      res.cookie("token", makeToken(user), cookieOpts);
      res.json(safeUser(user));
    } catch (err2) {
      res.status(500).json({ error: err2.message });
    }
  });
});

router.delete("/me/pfp", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (user?.pfpUrl) {
      try {
        await cloudinary.uploader.destroy(String(req.userId));
      } catch (_) {}
    }
    const updated = await User.findByIdAndUpdate(
      req.userId,
      { pfpUrl: null },
      { new: true },
    );
    res.cookie("token", makeToken(updated), cookieOpts);
    res.json(safeUser(updated));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/me", async (req, res) => {
  const token = req.cookies?.token;
  if (!token) return res.status(401).json({ error: "Who are you? Log in first!" });
  try {
    const { id, isAdmin } = require("jsonwebtoken").verify(
      token,
      process.env.JWT_SECRET,
    );
    if (isAdmin)
      return res
        .status(403)
        .json({ error: "Can't delete admin accounts, silly!" });
    const Score = require("./Score");
    const TrigramPlay = require("./TrigramPlay");
    await Score.deleteMany({ userId: id });
    await TrigramPlay.deleteMany({ userId: id });
    const user = await User.findById(id);
    if (user?.pfpUrl) {
      try {
        await cloudinary.uploader.destroy(String(id));
      } catch (_) {}
    }
    await User.findByIdAndDelete(id);
    res.clearCookie("token");
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
