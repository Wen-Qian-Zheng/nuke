async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

let lbData = [];
let lbPagination = null;
let tpData = [];
let editingRow = null;

async function checkAccess() {
  const user = await api("/api/auth/me").catch(() => null);

  if (!user) {
    showAuthScreen();
    return false;
  }
  if (!user.isAdmin) {
    showDenied(user.email);
    return false;
  }

  document.getElementById("auth-screen").style.display = "none";
  document.getElementById("denied-screen").style.display = "none";
  document.getElementById("admin-content").style.display = "block";
  const userInfo = document.getElementById("user-info");
  const pfpHtml = user.pfpUrl
    ? `<img src="${user.pfpUrl}?t=${Date.now()}" style="width:28px;height:28px;border-radius:50%;object-fit:cover;display:block;" alt="" />`
    : `<span style="width:28px;height:28px;border-radius:50%;background:#8B9E62;display:block;"></span>`;
  userInfo.innerHTML = `${pfpHtml}<span style="font-size:0.82rem;color:#94a3b8">${esc(user.username)}</span>`;
  return true;
}

function showAuthScreen() {
  document.getElementById("auth-screen").style.display = "flex";
  document.getElementById("denied-screen").style.display = "none";
  document.getElementById("admin-content").style.display = "none";
}

function showDenied(email) {
  document.getElementById("auth-screen").style.display = "none";
  document.getElementById("admin-content").style.display = "none";
  const d = document.getElementById("denied-screen");
  d.style.display = "flex";
  d.querySelector(".denied-email").textContent = email;
}

window.adminLogin = async () => {
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  const err = document.getElementById("login-error");
  err.textContent = "";
  try {
    await api("/api/auth/login", { method: "POST", body: { email, password } });
    init();
  } catch (e) {
    err.textContent = e.message;
  }
};

window.adminSignOut = async () => {
  await api("/api/auth/logout", { method: "POST" }).catch(() => {});
  showAuthScreen();
};

window.switchTab = (tab) => {
  document.querySelectorAll(".tab").forEach((t, i) => {
    t.classList.toggle("active", ["leaderboard", "trigramplays"][i] === tab);
  });
  document
    .querySelectorAll(".panel")
    .forEach((p) => p.classList.remove("active"));
  document.getElementById(`panel-${tab}`).classList.add("active");
};

window.loadLeaderboard = async (page = 1) => {
  const sort = document.getElementById("lb-sort").value;
  document.getElementById("lb-status").textContent = "Loading…";
  try {
    const result = await api(`/api/admin/scores?sort=${sort}&page=${page}&limit=20`);
    lbData = result.data ?? result;
    lbPagination = result.pagination ?? null;
    renderLeaderboard();
  } catch (e) {
    document.getElementById("lb-status").textContent = "Oops: " + e.message;
  }
};

window.renderLeaderboard = () => {
  const q = document.getElementById("lb-search").value.toLowerCase();
  const rows = lbData.filter(
    (r) => !q || r.username?.toLowerCase().includes(q),
  );
  const total = lbPagination?.total ?? rows.length;
  const currentPage = lbPagination?.page ?? 1;
  const totalPages = lbPagination?.totalPages ?? 1;
  document.getElementById("lb-status").textContent =
    `${total} total - page ${currentPage} of ${totalPages}`;
  const tbody = document.getElementById("lb-tbody");
  if (!rows.length) {
    tbody.innerHTML =
      '<tr><td colspan="8" class="empty">Nothing here, it\'s empty!</td></tr>';
    return;
  }
  tbody.innerHTML = rows
    .map(
      (r) => `
    <tr>
      <td><input type="checkbox" class="row-check lb-check" data-id="${r.id || r._id}" /></td>
      <td>${r.pfpUrl ? `<img class="admin-pfp" src="${r.pfpUrl}?t=${Date.now()}" alt="" />` : `<span class="admin-pfp-placeholder"></span>`}</td>
      <td>${esc(r.username)}</td>
      <td>${r.score ?? "-"}</td>
      <td>${r.wordsUsed ?? "-"}</td>
      <td>${r.maxCombo ?? "-"}</td>
      <td>${r.createdAt ? new Date(r.createdAt).toLocaleString() : "-"}</td>
      <td>
        <button class="btn btn-sm btn-primary" onclick="openEditModal('${r.id || r._id}')">Edit</button>
        <button class="btn btn-sm btn-danger"  onclick="deleteSingle('leaderboard','${r.id || r._id}')">Delete</button>
      </td>
    </tr>`,
    )
    .join("");

  const pagerEl = document.getElementById("lb-pager");
  if (pagerEl) {
    pagerEl.innerHTML = totalPages > 1
      ? `<button class="btn btn-sm" ${currentPage <= 1 ? "disabled" : ""} onclick="loadLeaderboard(${currentPage - 1})">← Prev</button>
         <span style="margin:0 8px">${currentPage} / ${totalPages}</span>
         <button class="btn btn-sm" ${currentPage >= totalPages ? "disabled" : ""} onclick="loadLeaderboard(${currentPage + 1})">Next →</button>`
      : "";
  }
};

window.loadTrigramPlays = async () => {
  document.getElementById("tp-status").textContent = "Loading…";
  try {
    tpData = await api("/api/admin/trigram-plays");
    renderTrigramPlays();
  } catch (e) {
    document.getElementById("tp-status").textContent = "Oops: " + e.message;
  }
};

window.renderTrigramPlays = () => {
  const q = document.getElementById("tp-search").value.toLowerCase();
  const f = document.getElementById("tp-filter").value;
  const rows = tpData.filter((r) => {
    if (
      q &&
      !r.trigram?.toLowerCase().includes(q) &&
      !String(r.userId || "")
        .toLowerCase()
        .includes(q)
    )
      return false;
    if (f !== "" && String(r.solved) !== f) return false;
    return true;
  });
  document.getElementById("tp-status").textContent =
    `${rows.length} row${rows.length !== 1 ? "s" : ""}`;
  const tbody = document.getElementById("tp-tbody");
  if (!rows.length) {
    tbody.innerHTML =
      '<tr><td colspan="8" class="empty">Nothing here, it\'s empty!</td></tr>';
    return;
  }
  tbody.innerHTML = rows
    .map(
      (r) => `
    <tr>
      <td><input type="checkbox" class="row-check tp-check" data-id="${r.id || r._id}" /></td>
      <td style="font-size:0.75rem;color:#64748b">${esc(String(r.userId || ""))}</td>
      <td><strong>${esc(r.trigram)}</strong></td>
      <td><span class="badge ${r.solved ? "badge-green" : "badge-red"}">${r.solved ? "Yes" : "No"}</span></td>
      <td>${r.wordlength ?? "-"}</td>
      <td>${r.timetaken != null ? Number(r.timetaken).toFixed(2) : "-"}</td>
      <td>${r.createdAt ? new Date(r.createdAt).toLocaleString() : "-"}</td>
      <td>
        <button class="btn btn-sm btn-danger" onclick="deleteSingle('trigramplays','${r.id || r._id}')">Delete</button>
      </td>
    </tr>`,
    )
    .join("");
};

window.toggleAll = (table) => {
  const master = document.getElementById(
    `${table === "leaderboard" ? "lb" : "tp"}-check-all`,
  );
  document
    .querySelectorAll(`.${table === "leaderboard" ? "lb" : "tp"}-check`)
    .forEach((cb) => (cb.checked = master.checked));
};

window.deleteSingle = async (table, id) => {
  if (!confirm("Nuke this row?")) return;
  try {
    const endpoint =
      table === "leaderboard"
        ? `/api/admin/scores/${id}`
        : `/api/admin/trigram-plays/${id}`;
    await api(endpoint, { method: "DELETE" });
    table === "leaderboard" ? loadLeaderboard() : loadTrigramPlays();
  } catch (e) {
    alert("Oops: " + e.message);
  }
};

window.deleteSelected = async (table) => {
  const cls = table === "leaderboard" ? ".lb-check" : ".tp-check";
  const ids = [...document.querySelectorAll(cls + ":checked")].map(
    (cb) => cb.dataset.id,
  );
  if (!ids.length) {
    alert("Pick something first!");
    return;
  }
  if (!confirm(`Zap ${ids.length} row(s)? No going back!`)) return;
  try {
    const endpoint =
      table === "leaderboard"
        ? "/api/admin/scores"
        : "/api/admin/trigram-plays";
    await api(endpoint, { method: "DELETE", body: { ids } });
    table === "leaderboard" ? loadLeaderboard() : loadTrigramPlays();
  } catch (e) {
    alert("Oops: " + e.message);
  }
};

const lbFields = [
  { key: "username", label: "Username", type: "text" },
  { key: "score", label: "Score", type: "number" },
  { key: "wordsused", label: "Words Used", type: "number" },
  { key: "maxcombo", label: "Max Combo", type: "number" },
];

window.openAddModal = () => {
  editingRow = null;
  document.getElementById("modal-title").textContent = "Add Row";
  document.getElementById("modal-fields").innerHTML = lbFields
    .map(
      (f) => `
    <div class="field">
      <label>${f.label}</label>
      <input id="mf-${f.key}" type="${f.type}" placeholder="${f.label}" />
    </div>`,
    )
    .join("");
  document.getElementById("modal-overlay").classList.add("open");
};

window.openEditModal = (id) => {
  editingRow = lbData.find((r) => String(r.id || r._id) === String(id));
  if (!editingRow) return;
  document.getElementById("modal-title").textContent = "Edit Row";
  document.getElementById("modal-fields").innerHTML = lbFields
    .map(
      (f) => `
    <div class="field">
      <label>${f.label}</label>
      <input id="mf-${f.key}" type="${f.type}" value="${editingRow[f.key] ?? ""}" />
    </div>`,
    )
    .join("");
  document.getElementById("modal-overlay").classList.add("open");
};

window.saveModal = async () => {
  const payload = {};
  lbFields.forEach((f) => {
    const val = document.getElementById(`mf-${f.key}`).value;
    payload[f.key] =
      f.type === "number" ? (val === "" ? null : Number(val)) : val;
  });

  const { score, wordsused, maxcombo } = payload;
  const errorEl = document.getElementById("modal-error");
  errorEl.textContent = "";
  if (wordsused != null && maxcombo != null && wordsused < maxcombo) {
    errorEl.textContent = `Words (${wordsused}) can't be less than combo (${maxcombo}) lol.`;
    return;
  }
  if (score != null && wordsused != null && score < 100 * wordsused) {
    errorEl.textContent = `Score (${score}) needs to be >= 100x words (${100 * wordsused}).`;
    return;
  }

  try {
    if (editingRow) {
      await api(`/api/admin/scores/${editingRow.id || editingRow._id}`, {
        method: "PUT",
        body: payload,
      });
    } else {
      await api("/api/admin/scores", { method: "POST", body: payload });
    }
    closeModalDirect();
    loadLeaderboard();
  } catch (e) {
    alert("Oops: " + e.message);
  }
};

window.closeModal = (e) => {
  if (e.target === document.getElementById("modal-overlay")) closeModalDirect();
};
window.closeModalDirect = () => {
  document.getElementById("modal-overlay").classList.remove("open");
  editingRow = null;
};

function esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function init() {
  const ok = await checkAccess();
  if (ok) {
    loadLeaderboard();
    loadTrigramPlays();
  }
}

init();
