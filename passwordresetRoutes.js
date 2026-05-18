const router = require("express").Router();
const bcrypt = require("bcryptjs");
const User = require("./User");

router.post("/reset-by-username", async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password)
    return res
      .status(400)
      .json({ error: "Need username, email AND a new password for this!" });
  if (password.length < 6)
    return res
      .status(400)
      .json({ error: "Password needs to be at least 6 chars, come on!" });

  const user = await User.findOne({
    username: username.trim(),
    email: email.trim().toLowerCase(),
  });
  if (!user)
    return res.status(404).json({
      error: "No one matching that username + email combo!",
    });

  const hashed = await bcrypt.hash(password, 10);
  await User.findByIdAndUpdate(user._id, { password: hashed });
  res.json({ message: "Password changed! Go log in!" });
});

module.exports = router;
