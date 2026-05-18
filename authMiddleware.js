const jwt = require("jsonwebtoken");

function requireAuth(req, res, next) {
  const token = req.cookies?.token;
  if (!token) return res.status(401).json({ error: "Who are you? Log in first!" });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Session's dead, log back in!" });
  }
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (!req.user.isAdmin)
      return res.status(403).json({ error: "Nice try, admins only back here!" });
    next();
  });
}

module.exports = { requireAuth, requireAdmin };
