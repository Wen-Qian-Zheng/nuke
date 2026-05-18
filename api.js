async function req(path, opts = {}) {
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

async function reqForm(path, formData) {
  const res = await fetch(path, {
    method: "POST",
    credentials: "include",
    body: formData,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

export async function getCurrentUser() {
  return req("/api/auth/me");
}

export async function signUp(email, password, username) {
  return req("/api/auth/register", {
    method: "POST",
    body: { email, password, username },
  });
}

export async function signIn(email, password) {
  return req("/api/auth/login", { method: "POST", body: { email, password } });
}

export async function signOut() {
  return req("/api/auth/logout", { method: "POST" });
}

export async function updateDisplayName(username) {
  return req("/api/auth/me", { method: "PATCH", body: { username } });
}

export async function deleteMyAccount() {
  return req("/api/auth/me", { method: "DELETE" });
}

export async function uploadPfp(file) {
  const form = new FormData();
  form.append("pfp", file);
  return reqForm("/api/auth/me/pfp", form);
}

export async function deletePfp() {
  return req("/api/auth/me/pfp", { method: "DELETE" });
}

export async function resetByUsername(username, email, password) {
  return req("/api/auth/reset-by-username", {
    method: "POST",
    body: { username, email, password },
  });
}

export async function saveScore({ score, wordsused, maxcombo }) {
  return req("/api/scores", {
    method: "POST",
    body: { score, wordsused, maxcombo },
  });
}

export async function getLeaderboard(limit = 15, sortBy = "score", page = 1) {
  return req(
    `/api/scores/leaderboard?sort=${sortBy}&limit=${limit}&page=${page}`,
  );
}

export async function getMyGames(since = null, page = 1, limit = 200) {
  let url = `/api/scores/mine?page=${page}&limit=${limit}`;
  if (since) url += `&since=${since}`;
  return req(url);
}

export async function logTrigramPlay({
  trigram,
  solved,
  wordlength,
  timetaken,
}) {
  return req("/api/scores/trigram", {
    method: "POST",
    body: { trigram, solved, wordlength, timetaken },
  });
}

export async function getMyTrigramPlays(since = null) {
  return req(
    since
      ? `/api/scores/trigram/mine?since=${since}`
      : "/api/scores/trigram/mine",
  );
}
