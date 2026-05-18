import {
  getCurrentUser,
  signUp,
  signIn,
  signOut,
  updateDisplayName,
  deleteMyAccount,
  uploadPfp,
  deletePfp,
  resetByUsername,
  saveScore,
  getLeaderboard,
  getMyGames,
  logTrigramPlay,
  getMyTrigramPlays,
} from "./api.js";

const turnSeconds = 7;
const startingLives = 3;
const minUnusedWords = 300;
const alphabet = "abcdefghijklmnopqrstuvwxyz";

const app = document.getElementById("app");
const trigramIndex = new Map();
let state = null;
let currentUser = null;

const lbPageSize = 10;
let lbRows = null;
let lbTab = null;
const lbTabs = [
  { key: "score", label: "Top Score", col: "score" },
  { key: "wordsused", label: "Most Words", col: "wordsused" },
  { key: "maxcombo", label: "Best Combo", col: "maxcombo" },
];

const wordsReady = fetch("/words.txt")
  .then((r) => r.text())
  .then((text) => {
    for (const w of text.split("\n")) {
      const word = w.trim().toLowerCase();
      if (!/^[a-z]+$/.test(word)) continue;
      const seen = new Set();
      for (let i = 0; i <= word.length - 3; i++) {
        const tri = word.slice(i, i + 3);
        if (seen.has(tri)) continue;
        seen.add(tri);
        if (!trigramIndex.has(tri)) trigramIndex.set(tri, new Set());
        trigramIndex.get(tri).add(word);
      }
    }
  });

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function makeButton(cls, text, handler) {
  const btn = document.createElement("button");
  btn.className = cls;
  btn.textContent = text;
  if (handler) btn.onclick = handler;
  return btn;
}

function renderScreen(className, html) {
  app.innerHTML = "";
  const el = document.createElement("div");
  el.className = className;
  el.innerHTML = html;
  app.appendChild(el);
  return el;
}

function makeCardScreen(title, backFn, tabs, activeKey, tabDataAttr, onTab) {
  const screen = document.createElement("div");
  const card = document.createElement("div");
  card.className = "lb-card";

  const header = document.createElement("div");
  header.className = "lb-header";
  const h2 = document.createElement("h2");
  h2.textContent = title;
  header.append(h2, makeButton("btn-link", "← Back", backFn));

  const tabBar = document.createElement("div");
  tabBar.className = "lb-tabs";
  for (const tab of tabs) {
    const btn = makeButton(
      `lb-tab${tab.key === activeKey ? " lb-tab-active" : ""}`,
      tab.label,
      () => onTab(tab.key),
    );
    btn.dataset[tabDataAttr] = tab.key;
    tabBar.appendChild(btn);
  }

  const body = document.createElement("div");
  body.innerHTML = '<div class="lb-loading">Loading...</div>';

  card.append(header, tabBar, body);
  screen.appendChild(card);
  return { screen, body };
}

async function initAuth() {
  try {
    const user = await getCurrentUser();
    currentUser = user
      ? {
          id: user.id,
          email: user.email,
          username: user.username,
          isAdmin: user.isAdmin,
          pfpUrl: user.pfpUrl || null,
        }
      : null;
  } catch {
    currentUser = null;
  }
}

function avatarHTML(pfpUrl, size = 40, cls = "") {
  if (pfpUrl) {
    return `<img class="pfp-avatar ${cls}" src="${pfpUrl}?t=${Date.now()}" alt="Profile picture" width="${size}" height="${size}" style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;" />`;
  }
  return `<div class="pfp-avatar pfp-placeholder ${cls}" style="width:${size}px;height:${size}px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:${Math.round(size * 0.45)}px;font-weight:700;"></div>`;
}

async function handleLogout() {
  await signOut();
  currentUser = null;
  renderHome();
}

function randomTrigram() {
  return (
    alphabet[Math.floor(Math.random() * 26)] +
    alphabet[Math.floor(Math.random() * 26)] +
    alphabet[Math.floor(Math.random() * 26)]
  );
}

function getUnusedWords(words, usedWords) {
  let count = 0;
  for (const w of words) if (!usedWords.has(w)) count++;
  return count;
}

async function pickTrigram(usedWords) {
  await wordsReady;
  while (true) {
    const trigram = randomTrigram();
    const words = trigramIndex.get(trigram);
    if (words && getUnusedWords(words, usedWords) >= minUnusedWords)
      return trigram;
  }
}

function validateWord(word, trigram, usedWords) {
  if (!word.includes(trigram))
    return { ok: false, reason: `Must contain "${trigram.toUpperCase()}"` };
  if (word.length < 5) return { ok: false, reason: "Too short!" };
  if (usedWords.has(word)) return { ok: false, reason: "Already used that one!" };
  if (!trigramIndex.get(trigram)?.has(word))
    return { ok: false, reason: "That's not a real word!" };
  return { ok: true };
}

function getTrigramWords(trigram, exclude = null) {
  const words = trigramIndex.get(trigram);
  if (!words) return null;
  const valid = exclude ? [...words].filter((w) => w !== exclude) : [...words];
  return valid.length ? valid[Math.floor(Math.random() * valid.length)] : null;
}

function openModal(box) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.appendChild(box);
  overlay.onclick = (e) => {
    if (e.target === overlay) overlay.remove();
  };
  document.body.appendChild(overlay);
  return overlay;
}

function showRenameModal() {
  const box = document.createElement("div");
  box.className = "modal-box";
  box.innerHTML = `
    <h2>Edit Profile</h2>
    <div class="pfp-upload-area" id="pfp-upload-area" title="Click to change profile picture">
      ${avatarHTML(currentUser.pfpUrl, 80, "pfp-large")}
      <div class="pfp-upload-hint">Change photo</div>
      <input type="file" id="pfp-file-input" accept="image/jpeg,image/png,image/gif,image/webp" style="display:none" />
    </div>
    <p class="pfp-status" id="pfp-status"></p>
    ${currentUser.pfpUrl ? `<button class="btn-link pfp-remove-btn" id="pfp-remove">Remove photo</button>` : ""}
    <h3 class="modal-section-label">Display name</h3>
    <input class="modal-input" id="rename-input" type="text" maxlength="32" placeholder="New name..." />
    <p class="modal-error" id="rename-error"></p>
    <div class="modal-btns">
      <button class="modal-btn-cancel" id="rename-cancel">Cancel</button>
      <button class="modal-btn-confirm" id="rename-save">Save</button>
    </div>
    <button class="btn-delete-account" id="rename-delete">Delete account &amp; all data</button>
  `;
  const overlay = openModal(box);
  const input = box.querySelector("#rename-input");
  const errorEl = box.querySelector("#rename-error");
  const saveBtn = box.querySelector("#rename-save");
  const pfpArea = box.querySelector("#pfp-upload-area");
  const fileInput = box.querySelector("#pfp-file-input");
  const pfpStatus = box.querySelector("#pfp-status");

  input.value = currentUser.username;
  setTimeout(() => {
    input.focus();
    input.select();
  }, 50);

  box.querySelector("#rename-cancel").onclick = () => overlay.remove();
  box.querySelector("#rename-delete").onclick = () => {
    overlay.remove();
    showDeleteConfirm(1);
  };

  pfpArea.onclick = () => fileInput.click();

  fileInput.onchange = async () => {
    const file = fileInput.files[0];
    if (!file) return;
    pfpStatus.textContent = "Uploading...";
    pfpStatus.style.color = "";
    try {
      const user = await uploadPfp(file);
      currentUser.pfpUrl = user.pfpUrl;
      const avatarEl = pfpArea.querySelector(".pfp-avatar");
      const newAvatar = document.createElement("div");
      newAvatar.innerHTML = avatarHTML(currentUser.pfpUrl, 80, "pfp-large");
      avatarEl.replaceWith(newAvatar.firstElementChild);
      lbRows = null;
      lbTab = null;
      pfpStatus.textContent = "Photo updated! It looks fire! 🔥🔥🔥";
      pfpStatus.style.color = "#849E65";
      if (!box.querySelector("#pfp-remove")) {
        const removeBtn = document.createElement("button");
        removeBtn.className = "btn-link pfp-remove-btn";
        removeBtn.id = "pfp-remove";
        removeBtn.textContent = "Remove photo";
        pfpArea.after(removeBtn);
        removeBtn.onclick = handleRemovePfp;
      }
      renderHome();
    } catch (err) {
      pfpStatus.textContent = err.message || "Upload failed.";
      pfpStatus.style.color = "var(--clr-error, #e53e3e)";
    }
  };

  const handleRemovePfp = async () => {
    pfpStatus.textContent = "Removing...";
    pfpStatus.style.color = "";
    try {
      await deletePfp();
      currentUser.pfpUrl = null;
      const avatarEl = pfpArea.querySelector(".pfp-avatar");
      const newAvatar = document.createElement("div");
      newAvatar.innerHTML = avatarHTML(null, 80, "pfp-large");
      avatarEl.replaceWith(newAvatar.firstElementChild);
      lbRows = null;
      lbTab = null;
      pfpStatus.textContent = "Photo gone!";
      box.querySelector("#pfp-remove")?.remove();
      renderHome();
    } catch (err) {
      pfpStatus.textContent = err.message || "Couldn't remove photo.";
      pfpStatus.style.color = "var(--clr-error, #e53e3e)";
    }
  };

  box.querySelector("#pfp-remove")?.addEventListener("click", handleRemovePfp);

  const doSave = async () => {
    const name = input.value.trim();
    if (!name) {
      errorEl.textContent = "Name can't be empty!";
      return;
    }
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving...";
    try {
      await updateDisplayName(name);
      currentUser.username = name;
      overlay.remove();
      renderHome();
    } catch (err) {
      errorEl.textContent = err.message || "Couldn't update name.";
      saveBtn.disabled = false;
      saveBtn.textContent = "Save";
    }
  };

  saveBtn.onclick = doSave;
  input.onkeydown = (e) => {
    if (e.key === "Enter") doSave();
  };
}

function showDeleteConfirm(stage = 1) {
  const stages = [
    {
      title: "Delete account?",
      msg: "This will permanently delete your account and <strong>all</strong> your game data. This cannot be undone.",
      btn: "Continue",
    },
    {
      title: "Are you really sure?",
      msg: "Every score, stat, and trigram play you have ever recorded will be <strong>wiped forever</strong>.",
      btn: "Yes, I'm sure",
    },
    {
      title: "Your account data will be cooked.",
      msg: "Your account will be deleted <strong>immediately</strong>. There is no recovery, no support ticket (this ain't discord), no way back.",
      btn: "Delete my account",
    },
  ];

  const { title, msg, btn } = stages[stage - 1];
  const isLast = stage === 3;

  const box = document.createElement("div");
  box.className = "modal-box";
  box.innerHTML = `
    <h2 class="modal-title-danger">${title}</h2>
    <p class="modal-msg">${msg}</p>
    <div class="modal-btns">
      <button class="modal-btn-cancel" id="del-cancel">Cancel</button>
      <button class="modal-btn-danger" id="del-confirm" disabled>${btn} (3s)</button>
    </div>
  `;
  const overlay = openModal(box);
  const confirmBtn = box.querySelector("#del-confirm");
  box.querySelector("#del-cancel").onclick = () => overlay.remove();

  let secs = 3;
  const iv = setInterval(() => {
    secs--;
    if (secs <= 0) {
      clearInterval(iv);
      confirmBtn.disabled = false;
      confirmBtn.textContent = btn;
    } else {
      confirmBtn.textContent = `${btn} (${secs}s)`;
    }
  }, 1000);

  confirmBtn.onclick = () => {
    overlay.remove();
    if (isLast) doDeleteAccount();
    else showDeleteConfirm(stage + 1);
  };
}

async function doDeleteAccount() {
  const box = document.createElement("div");
  box.className = "modal-box";
  box.innerHTML = `<p class="modal-msg" style="text-align:center;padding:8px 0">Deleting...</p>`;
  const overlay = openModal(box);
  try {
    await deleteMyAccount();
    overlay.remove();
    currentUser = null;
    renderHome();
  } catch (err) {
    box.innerHTML = `
      <h2>Uh oh</h2>
      <p class="modal-msg">${escapeHtml(err.message || "Something broke!")}</p>
      <div class="modal-btns">
        <button class="modal-btn-cancel" id="err-close">Close</button>
      </div>`;
    box.querySelector("#err-close").onclick = () => overlay.remove();
  }
}

function renderHome() {
  app.innerHTML = "";
  const home = document.createElement("div");
  home.className = "home";

  const h1 = document.createElement("h1");
  h1.textContent = "Word Bomb";

  const tagline = document.createElement("p");
  tagline.className = "tagline";

  const actions = document.createElement("div");
  actions.className = "home-actions";

  if (currentUser) {
    tagline.textContent = "Three letters. Seven seconds. Survive 3 mistakes.";

    const greeting = document.createElement("div");
    greeting.className = "user-greeting";
    greeting.innerHTML = `
      <span>Welcome back, <button class="user-name-btn">${escapeHtml(currentUser.username)}</button></span>
      <button class="user-pfp-btn" title="Edit profile">
        ${avatarHTML(currentUser.pfpUrl, 24)}
      </button>
    `;
    greeting.querySelector(".user-pfp-btn").onclick = showRenameModal;
    greeting.querySelector(".user-name-btn").onclick = showRenameModal;

    const playBtn = makeButton("play", "Play", startGame);
    const lbBtn = makeButton("btn-secondary", "Leaderboard", () =>
      renderLeaderboard(),
    );
    const statsBtn = makeButton("btn-secondary", "My Stats", () =>
      renderStats(),
    );
    const logoutBtn = makeButton("btn-link", "Log out", handleLogout);

    [playBtn, lbBtn, statsBtn, logoutBtn].forEach((b) => (b.disabled = true));
    wordsReady.then(() => {
      [playBtn, lbBtn, statsBtn, logoutBtn].forEach(
        (b) => (b.disabled = false),
      );
    });

    actions.append(playBtn, lbBtn, statsBtn, logoutBtn);
    home.append(h1, tagline, greeting, actions);
  } else {
    tagline.textContent = "Three letters. Seven seconds. Three lives.";

    const loginBtn = makeButton("play", "Login / Sign Up", () =>
      renderAuth("login"),
    );
    const guestBtn = makeButton("btn-secondary", "Play as Guest", startGame);
    const lbBtn2 = makeButton("btn-secondary", "Leaderboard", () =>
      renderLeaderboard(),
    );

    [loginBtn, guestBtn, lbBtn2].forEach((b) => (b.disabled = true));
    wordsReady.then(() => {
      [loginBtn, guestBtn, lbBtn2].forEach((b) => (b.disabled = false));
    });

    actions.append(loginBtn, guestBtn, lbBtn2);
    home.append(h1, tagline, actions);
  }

  app.appendChild(home);
}

function renderAuth(mode = "login") {
  const isSignup = mode === "signup";
  const el = renderScreen(
    "auth-screen",
    `
    <div class="auth-card">
      <h2 class="auth-title">${isSignup ? "Create Account" : "Welcome Back"}</h2>
      <p class="auth-subtitle">${isSignup ? "Sign up to save your scores" : "Login to track your scores"}</p>
      <div class="auth-tabs">
        <button class="auth-tab ${!isSignup ? "active" : ""}" id="loginTab">Login</button>
        <button class="auth-tab ${isSignup ? "active" : ""}" id="signupTab">Sign Up</button>
      </div>
      <form class="auth-form" id="authForm" novalidate>
        ${
          isSignup
            ? `<div class="field-group">
          <label for="usernameField">Username</label>
          <input id="usernameField" type="text" placeholder="YourName" autocomplete="username" required />
        </div>`
            : ""
        }
        <div class="field-group">
          <label for="emailField">Email</label>
          <input id="emailField" type="email" placeholder="you@example.com" autocomplete="email" required />
        </div>
        <div class="field-group">
          <label for="passField">Password</label>
          <input id="passField" type="password" placeholder="••••••••" autocomplete="${isSignup ? "new-password" : "current-password"}" required />
        </div>
        <p class="auth-error" id="authError" hidden></p>
        <button type="submit" class="play auth-submit" id="submitBtn">
          ${isSignup ? "Create Account" : "Login"}
        </button>
        ${!isSignup ? `<button type="button" class="btn-link forgot-link" id="forgotBtn">Forgot password?</button>` : ""}
      </form>
      <button class="btn-link auth-back" id="backBtn">← Back to Home</button>
    </div>
  `,
  );

  const loginTab = el.querySelector("#loginTab");
  const signupTab = el.querySelector("#signupTab");
  const backBtn = el.querySelector("#backBtn");
  const form = el.querySelector("#authForm");
  const errorEl = el.querySelector("#authError");
  const submitBtn = el.querySelector("#submitBtn");
  const emailField = el.querySelector("#emailField");
  const passField = el.querySelector("#passField");
  const usernameField = el.querySelector("#usernameField");

  loginTab.onclick = () => renderAuth("login");
  signupTab.onclick = () => renderAuth("signup");
  backBtn.onclick = renderHome;

  if (!isSignup) {
    el.querySelector("#forgotBtn").onclick = renderForgotPassword;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = emailField.value.trim();
    const password = passField.value;
    const username = usernameField?.value.trim();

    errorEl.hidden = true;
    submitBtn.disabled = true;
    submitBtn.textContent = isSignup ? "Creating..." : "Logging in...";

    try {
      const user = isSignup
        ? await signUp(email, password, username || email.split("@")[0])
        : await signIn(email, password);
      currentUser = {
        id: user.id,
        email: user.email,
        username: user.username,
        isAdmin: user.isAdmin,
        pfpUrl: user.pfpUrl || null,
      };
      renderHome();
    } catch (err) {
      errorEl.textContent =
        err.message || "Something broke, please try again.";
      errorEl.hidden = false;
      submitBtn.disabled = false;
      submitBtn.textContent = isSignup ? "Create Account" : "Login";
    }
  });
}

function renderForgotPassword() {
  const el = renderScreen(
    "forgot-screen",
    `<div class="auth-card">
      <h2 class="auth-title">Reset Password</h2>
      <p class="auth-subtitle">Forgot your password? No worries!</p>
      <form class="auth-form" id="forgotForm" novalidate>
        <div class="field-group">
          <label for="resetUsername">Username</label>
          <input id="resetUsername" type="text" placeholder="YourUsername" autocomplete="username" required />
        </div>
        <div class="field-group">
          <label for="resetEmail">Email</label>
          <input id="resetEmail" type="email" placeholder="you@example.com" autocomplete="email" required />
        </div>
        <div class="field-group">
          <label for="resetPass">New Password</label>
          <input id="resetPass" type="password" placeholder="••••••••" autocomplete="new-password" required />
        </div>
        <div class="field-group">
          <label for="resetConfirm">Confirm Password</label>
          <input id="resetConfirm" type="password" placeholder="••••••••" autocomplete="new-password" required />
        </div>
        <p class="auth-error" id="forgotError" hidden></p>
        <button type="submit" class="play auth-submit" id="forgotSubmit">Reset Password</button>
      </form>
      <p class="auth-success" id="forgotSuccess" hidden></p>
      <button class="btn-link auth-back" id="backBtn">← Back to Login</button>
    </div>`,
  );

  el.querySelector("#backBtn").onclick = () => renderAuth("login");

  el.querySelector("#forgotForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = el.querySelector("#resetUsername").value.trim();
    const email = el.querySelector("#resetEmail").value.trim();
    const password = el.querySelector("#resetPass").value;
    const confirm = el.querySelector("#resetConfirm").value;
    const errorEl = el.querySelector("#forgotError");
    const successEl = el.querySelector("#forgotSuccess");
    const submitBtn = el.querySelector("#forgotSubmit");

    errorEl.hidden = true;
    successEl.hidden = true;

    if (password !== confirm) {
      errorEl.textContent = "Passwords don't match!";
      errorEl.hidden = false;
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Saving...";

    try {
      const data = await resetByUsername(username, email, password);
      const card = el.querySelector(".auth-card");
      card.innerHTML = `
        <h2 class="auth-title">Password Reset</h2>
        <p class="auth-success" style="display:block">${data.message}</p>
        <button class="btn-link auth-back" id="doneBack">← Back to Login</button>
      `;
      card.querySelector("#doneBack").onclick = () => renderAuth("login");
    } catch (err) {
      errorEl.textContent = err.message || "Something broke.";
      errorEl.hidden = false;
      submitBtn.disabled = false;
      submitBtn.textContent = "Reset Password";
    }
  });
}

function pagerHTML(page, total) {
  if (total <= 1) return "";
  return `<div class="pager">
    <button class="pager-btn" data-dir="-1" ${page <= 1 ? "disabled" : ""}>← Prev</button>
    <span class="pager-info">${page} / ${total}</span>
    <button class="pager-btn" data-dir="1"  ${page >= total ? "disabled" : ""}>Next →</button>
  </div>`;
}

function lbRowHTML(r, rank, activeTab, medals) {
  const isMe = currentUser?.username === r.username;
  const avatar = r.pfpUrl
    ? `<img class="lb-pfp" src="${r.pfpUrl}?t=${Date.now()}" alt="" />`
    : `<div class="lb-pfp lb-pfp-placeholder"></div>`;
  return `<div class="lb-row${isMe ? " lb-me" : ""}">
    <span class="lb-rank">${medals[rank] ?? rank + 1}</span>
    <span class="lb-name">${avatar}${escapeHtml(r.username)}</span>
    <span class="lb-score ${activeTab === "score" ? "lb-col-active" : ""}">${r.score.toLocaleString()}</span>
    <span class="lb-words ${activeTab === "wordsused" ? "lb-col-active" : ""}">${r.wordsused}</span>
    <span class="lb-combo ${activeTab === "maxcombo" ? "lb-col-active" : ""}">x${r.maxcombo}</span>
  </div>`;
}

async function renderLeaderboard(activeTab = "score", page = 1) {
  const { screen, body } = makeCardScreen(
    "Leaderboard",
    renderHome,
    lbTabs,
    activeTab,
    "tab",
    (key) => {
      lbRows = null;
      lbTab = null;
      renderLeaderboard(key, 1);
    },
  );
  screen.className = "leaderboard-screen";
  app.innerHTML = "";
  app.appendChild(screen);

  const tab = lbTabs.find((t) => t.key === activeTab);
  try {
    const result = await getLeaderboard(lbPageSize, tab.col, page);
    const rows = result.data ?? [];
    const { totalPages = 1, page: currentPage = 1 } = result.pagination ?? {};

    if (!rows.length) {
      body.innerHTML = `<p class="lb-empty">No scores yet, be the first!</p>`;
      return;
    }

    const offset = (currentPage - 1) * lbPageSize;
    const medals = ["🥇", "🥈", "🥉"];

    body.innerHTML = `
      <div class="lb-table">
        <div class="lb-row lb-head">
          <span>#</span><span>Player</span>
          <span class="${activeTab === "score" ? "lb-col-active" : ""}">Score</span>
          <span class="${activeTab === "wordsused" ? "lb-col-active" : ""}">Words</span>
          <span class="${activeTab === "maxcombo" ? "lb-col-active" : ""}">Best Combo</span>
        </div>
        ${rows
          .map((r, i) => lbRowHTML(r, offset + i, activeTab, medals))
          .join("")}
      </div>
      ${pagerHTML(currentPage, totalPages)}
    `;
    body.querySelectorAll(".pager-btn").forEach((btn) => {
      btn.onclick = () =>
        renderLeaderboard(activeTab, currentPage + parseInt(btn.dataset.dir));
    });
  } catch {
    body.innerHTML = `<p class="lb-empty">No scores yet, be the first!</p>`;
  }
}

const trigramPageSize = 10;

const statsPeriods = [
  { key: "alltime", label: "All Time", since: null },
  {
    key: "monthly",
    label: "Monthly",
    since: () => new Date(Date.now() - 30 * 864e5).toISOString(),
  },
  {
    key: "weekly",
    label: "Weekly",
    since: () => new Date(Date.now() - 7 * 864e5).toISOString(),
  },
  {
    key: "daily",
    label: "Daily",
    since: () => new Date(Date.now() - 864e5).toISOString(),
  },
];

function calcTrigramStats(plays) {
  const map = new Map();
  for (const p of plays) {
    if (!map.has(p.trigram))
      map.set(p.trigram, { total: 0, solved: 0, lengths: [], times: [] });
    const t = map.get(p.trigram);
    t.total++;
    if (p.solved) {
      t.solved++;
      if (p.wordlength) t.lengths.push(p.wordlength);
      if (p.timetaken != null) t.times.push(p.timetaken);
    }
  }
  const avg = (arr) =>
    arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
  return Array.from(map.entries())
    .map(([trigram, d]) => ({
      trigram,
      total: d.total,
      solved: d.solved,
      rate: d.total > 0 ? d.solved / d.total : 0,
      avgLength: avg(d.lengths),
      avgTime: avg(d.times),
    }))
    .sort((a, b) => a.rate - b.rate);
}

function calcStats(games) {
  if (!games.length) return null;
  const scores = games.map((g) => g.score);
  const words = games.map((g) => g.wordsused);
  const combos = games.map((g) => g.maxcombo);
  const avg = (arr) => Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
  return {
    games: games.length,
    bestScore: Math.max(...scores),
    avgScore: avg(scores),
    totalWords: words.reduce((a, b) => a + b, 0),
    bestWords: Math.max(...words),
    avgWords: avg(words),
    bestCombo: Math.max(...combos),
    avgCombo: avg(combos),
  };
}

function statCardHTML(label, value, accent = false) {
  return `<div class="stat-card${accent ? " stat-card--accent" : ""}">
    <span class="stat-label">${label}</span>
    <span class="stat-value">${value}</span>
  </div>`;
}

async function renderStats(activePeriod = "alltime") {
  const { screen, body } = makeCardScreen(
    "My Stats",
    renderHome,
    statsPeriods,
    activePeriod,
    "period",
    (key) => renderStats(key),
  );
  screen.className = "stats-screen";
  app.innerHTML = "";
  app.appendChild(screen);

  const period = statsPeriods.find((p) => p.key === activePeriod);
  const since = period.since ? period.since() : null;

  try {
    const [gamesRes, plays] = await Promise.all([
      getMyGames(since),
      getMyTrigramPlays(since),
    ]);
    const games = gamesRes.data ?? gamesRes;
    const stats = calcStats(games);
    const trigramStats = calcTrigramStats(plays);

    if (!stats) {
      body.innerHTML = `<p class="lb-empty">No games here yet, go play!</p>`;
      return;
    }

    const trigramGameWrapId = "trigramGameTableWrap";
    body.innerHTML = `
      <div class="stats-grid">
        ${statCardHTML("Games Played", stats.games)}
        ${statCardHTML("Best Score", stats.bestScore.toLocaleString(), true)}
        ${statCardHTML("Avg Score", stats.avgScore.toLocaleString())}
        ${statCardHTML("Best Combo", `x${stats.bestCombo}`, true)}
        ${statCardHTML("Avg Combo", `x${stats.avgCombo}`)}
        ${statCardHTML("Best Round (words)", stats.bestWords, true)}
        ${statCardHTML("Avg Words / Game", stats.avgWords)}
        ${statCardHTML("Total Words Typed", stats.totalWords.toLocaleString())}
      </div>
      ${
        trigramStats.length === 0
          ? `<p class="lb-empty" style="padding:20px 0 0">Not enough data yet - play more rounds!</p>`
          : `<div class="trigramGame-section"><h3 class="trigramGame-heading">Trigram Breakdown</h3><div id="${trigramGameWrapId}"></div></div>`
      }
    `;
    if (trigramStats.length > 0) {
      const trigramGameWrap = body.querySelector(`#${trigramGameWrapId}`);
      renderTgTable(trigramStats, 1, trigramGameWrap);
    }
  } catch {
    body.innerHTML = `<p class="lb-empty">Couldn't load stats, try again!</p>`;
  }
}

const measureCanvas = document.createElement("canvas").getContext("2d");
function fitFontSize(text, availPx, maxPx = 13, minPx = 8) {
  for (let size = maxPx; size >= minPx; size--) {
    measureCanvas.font = `600 ${size}px monospace`;
    if (measureCanvas.measureText(text).width <= availPx) return size;
  }
  return minPx;
}

function setChipWord(chip, word) {
  chip.textContent = word || "-";
  chip.style.fontSize = word ? fitFontSize(word, 96) + "px" : "13px";
}

function wireChip(chip, trigram) {
  chip.title = "Tap for another example";
  chip.classList.remove("loading");
  chip.onclick = () => {
    const prev = chip.textContent;
    chip.textContent = "…";
    chip.style.fontSize = "13px";
    chip.classList.add("loading");
    chip.onclick = null;
    const next = getTrigramWords(trigram, prev);
    setChipWord(chip, next || prev);
    wireChip(chip, trigram);
  };
}

function trigramGameRowHTML(t) {
  const solveRate = Math.round(t.rate * 100);
  const hard = solveRate < 50;
  const lenStr = t.avgLength != null ? t.avgLength.toFixed(1) : "-";
  const timeStr = t.avgTime != null ? t.avgTime.toFixed(2) + "s" : "-";
  return `<div class="trigramGame-row${hard ? "" : " trigramGame-success"}">
    <span class="trigramGame-badge">${escapeHtml(t.trigram)}</span>
    <span>${t.total}</span>
    <span>
      <span class="trigramGame-rate-bar">
        <span class="trigramGame-rate-fill ${hard ? "trigramGame-rate-bad" : "trigramGame-rate-good"}" style="width:${solveRate}%"></span>
      </span>
      ${solveRate}%
    </span>
    <span>${lenStr}</span>
    <span>${timeStr}</span>
    <span class="trigramGame-word-chip loading" data-trigram="${escapeHtml(t.trigram)}">…</span>
  </div>`;
}

function renderTgTable(trigramGame, page, container) {
  const totalPages = Math.ceil(trigramGame.length / trigramPageSize);
  page = Math.max(1, Math.min(page, totalPages));
  const pageTg = trigramGame.slice(
    (page - 1) * trigramPageSize,
    page * trigramPageSize,
  );

  container.innerHTML = `
    <div class="trigramGame-table">
      <div class="trigramGame-row trigramGame-head">
        <span>Trigram</span><span>Rounds</span><span>Success</span>
        <span>Avg Length</span><span>Avg Time</span><span>Example Word</span>
      </div>
      ${pageTg.map(trigramGameRowHTML).join("")}
    </div>
    ${pagerHTML(page, totalPages)}
  `;

  container.querySelectorAll(".pager-btn").forEach((btn) => {
    btn.onclick = () =>
      renderTgTable(trigramGame, page + parseInt(btn.dataset.dir), container);
  });
  container.querySelectorAll(".trigramGame-word-chip").forEach((chip) => {
    const word = getTrigramWords(chip.dataset.trigram);
    setChipWord(chip, word);
    if (word) wireChip(chip, chip.dataset.trigram);
    else chip.classList.remove("loading");
  });
}

function clearTimer() {
  if (state?.rafId) cancelAnimationFrame(state.rafId);
  if (state?.timeoutId) clearTimeout(state.timeoutId);
  if (state) {
    state.rafId = null;
    state.timeoutId = null;
  }
}

function startGame() {
  state = {
    trigram: "",
    usedWords: new Set(),
    timeLeft: turnSeconds,
    endsAt: 0,
    feedback: { text: "", kind: "" },
    phase: "loading",
    lives: startingLives,
    score: 0,
    combo: 0,
    maxCombo: 0,
    rafId: null,
    timeoutId: null,
    els: null,
  };
  renderGameFrame();
  nextRound();
}

async function nextRound() {
  clearTimer();
  if (state.lives <= 0) {
    state.phase = "over";
    renderGameOver();
    return;
  }

  state.phase = "loading";
  setFeedback("", "");
  updatePlayers();

  const tri = await pickTrigram(state.usedWords);
  if (state.phase !== "loading") return;

  state.trigram = tri;
  state.endsAt = performance.now() + turnSeconds * 1000;
  state.phase = "playing";
  state.timeLeft = turnSeconds;

  updateStage();
  updateBomb();
  state.rafId = requestAnimationFrame(tick);
}

function tick() {
  if (state.phase !== "playing") return;
  const remainingMs = state.endsAt - performance.now();
  state.timeLeft = Math.max(0, remainingMs / 1000);
  state.els.timer.textContent = `${state.timeLeft.toFixed(1)}s`;
  if (remainingMs <= 0) return timeUp();
  updateBomb();
  state.rafId = requestAnimationFrame(tick);
}

function timeUp() {
  if (state.phase !== "playing") return;
  clearTimer();
  state.lives -= 1;
  state.combo = 0;
  if (currentUser)
    logTrigramPlay({
      trigram: state.trigram,
      solved: false,
      wordlength: null,
      timetaken: turnSeconds,
    }).catch((err) =>
      console.error("logTrigramPlay (fail):", err?.message ?? err),
    );
  setFeedback("Too slow! -1 life 💀", "bad");
  if (state.lives <= 0) {
    state.phase = "over";
    renderGameOver();
    return;
  }
  state.phase = "cooldown";
  updatePlayers();
  setTimeout(() => nextRound(), 900);
}

function submitMyWord(raw) {
  if (state.phase !== "playing") return;
  const word = (raw || "").trim().toLowerCase();
  if (!word) return;
  const result = validateWord(word, state.trigram, state.usedWords);
  if (!result.ok) {
    state.combo = 0;
    setFeedback(result.reason, "bad");
    state.els.input.value = "";
    state.els.input.focus();
    return;
  }
  acceptWord(word);
}

function acceptWord(word) {
  clearTimer();
  state.usedWords.add(word);
  state.combo += 1;
  state.maxCombo = Math.max(state.maxCombo, state.combo);
  const extra = Math.max(0, word.length - 5);
  const score = 100 + 5 * extra * (extra + 1);
  state.score += score;
  if (currentUser)
    logTrigramPlay({
      trigram: state.trigram,
      solved: true,
      wordlength: word.length,
      timetaken: parseFloat((turnSeconds - state.timeLeft).toFixed(3)),
    }).catch((err) =>
      console.error("logTrigramPlay (solve):", err?.message ?? err),
    );
  state.phase = "cooldown";
  setFeedback(`+${score}`, "good");
  addHistoryItem(word);
  updatePlayers();
  updateStage();
  setTimeout(() => nextRound(), 500);
}

function setFeedback(text, kind) {
  state.feedback = { text, kind };
  const el = state.els?.feedback;
  if (el) {
    el.textContent = text;
    el.className = `feedback ${kind}`;
  }
}

function renderGameFrame() {
  const gameScreen = renderScreen(
    "game",
    `
    <div class="players"></div>
    <div class="stage">
      <div class="turnLabel">Survival Mode</div>
      <div class="bomb">
        <div class="ring"></div>
        <div class="ring progress" style="--p:0"></div>
        <div class="trigram"></div>
        <div class="timer"></div>
      </div>
      <div class="inputRow">
        <input id="wordInput" type="text" autocomplete="off" />
        <div class="feedback"></div>
      </div>
    </div>
    <div class="history" hidden>
      <h4>Words Used</h4>
      <div class="items"></div>
    </div>
  `,
  );
  const input = gameScreen.querySelector("#wordInput");
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitMyWord(input.value);
  });
  state.els = {
    players: gameScreen.querySelector(".players"),
    trigram: gameScreen.querySelector(".bomb .trigram"),
    timer: gameScreen.querySelector(".bomb .timer"),
    ring: gameScreen.querySelector(".bomb .ring.progress"),
    bomb: gameScreen.querySelector(".bomb"),
    input,
    feedback: gameScreen.querySelector(".feedback"),
    history: gameScreen.querySelector(".history"),
    histItems: gameScreen.querySelector(".history .items"),
  };
  updatePlayers();
  updateStage();
}

function updatePlayers() {
  const el = state.els?.players;
  if (!el) return;
  el.innerHTML = `
    <div class="player me">
      <div class="name">${currentUser ? escapeHtml(currentUser.username) : "You"}</div>
      <div class="meta">
        <div class="score">Score: ${state.score}</div>
        <div class="combo">Combo: x${state.combo}</div>
      </div>
      <div class="lives">
        ${Array.from(
          { length: startingLives },
          (_, i) =>
            `<span class="heart ${i < state.lives ? "" : "lost"}">●</span>`,
        ).join("")}
      </div>
    </div>
  `;
}

function updateStage() {
  const { trigram, timer, input } = state.els;
  const loading = state.phase === "loading";
  trigram.textContent = loading ? "…" : state.trigram;
  timer.textContent = loading
    ? "…"
    : `${Math.max(0, state.timeLeft).toFixed(1)}s`;
  input.disabled = state.phase !== "playing";
  input.placeholder = loading
    ? "Loading..."
    : `Include "${state.trigram.toUpperCase()}"`;
  if (state.phase === "playing") {
    input.value = "";
    input.focus();
  }
  updateBomb();
}

function updateBomb() {
  if (state.phase !== "playing") return;
  const solveRate = Math.max(0, (state.timeLeft / turnSeconds) * 100);
  state.els.ring.style.setProperty("--p", solveRate.toString());
  state.els.bomb.classList.toggle("danger", state.timeLeft <= 2.5);
}

function addHistoryItem(word) {
  const { history, histItems } = state.els;
  history.hidden = false;
  const span = document.createElement("span");
  span.className = "item me";
  span.textContent = word;
  histItems.prepend(span);
  while (histItems.children.length > 40) histItems.lastChild.remove();
}

async function renderGameOver() {
  app.innerHTML = "";
  const screen = document.createElement("div");
  screen.className = "gameover";
  const canSave = !!currentUser;

  const statsDiv = document.createElement("div");
  statsDiv.innerHTML = `
    <h2 class="lose">Game Over</h2>
    <p><b>Score:</b> ${state.score.toLocaleString()}</p>
    <p><b>Words:</b> ${state.usedWords.size}</p>
    <p><b>Best Combo:</b> x${state.maxCombo}</p>
  `;

  const actions = document.createElement("div");
  actions.className = "gameover-actions";
  actions.append(
    makeButton("play", "Play Again", startGame),
    ...(canSave
      ? [makeButton("btn-secondary", "My Stats", () => renderStats())]
      : []),
    makeButton("btn-secondary", "Leaderboard", () => renderLeaderboard()),
    makeButton("btn-secondary", "Home", renderHome),
  );

  let statusEl = null;
  if (canSave) {
    statusEl = document.createElement("p");
    statusEl.className = "save-status";
    statusEl.textContent = "Saving score...";
    statsDiv.appendChild(statusEl);
  }

  screen.append(statsDiv, actions);
  app.appendChild(screen);

  if (canSave) {
    try {
      await saveScore({
        score: state.score,
        wordsused: state.usedWords.size,
        maxcombo: state.maxCombo,
      });
      statusEl.textContent = "Score saved! 🎉";
      statusEl.classList.add("save-ok");
    } catch (err) {
      statusEl.textContent = "Couldn't save score: " + (err?.message ?? err);
      statusEl.classList.add("save-err");
    }
  }
}

(async () => {
  await initAuth();
  renderHome();
})();
