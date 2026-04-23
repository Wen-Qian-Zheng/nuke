const turnSeconds = 7;
const startingLives = 3;
const minUnusedWords = 500;
const bots = [
  { id: "b1", name: "Bot 1" },
];
const me = { id: "me", name: "You", isMe: true }; // defines self
const letters = "abcdefghijklmnopqrstuvwxyz"; // all lowercase for trigram generation

const app = document.getElementById("app"); // gets the dom element where the ui stuff would be rendered

try { localStorage.removeItem("wb_words_v1"); } catch (e) {} // finds the list of words i typed and removes everything from it so i can type the words again

const trigramCache = new Map(); // creates cache for api responses per trigram and it clears when it gers refreshed

function looksLikeRealWord(word) {
  const vowels = "aeiouy"; // due to the amount of acronyms present in this API there had to be a parameter
  const vowelCount = word.split("").filter(c => vowels.includes(c)).length; // in which acronyms are somehow filtered out
// there had to be a better way around this but ill look into that later
  if (vowelCount === 0) return false; // according to mainstream lexicography english has no ordinary vocabularies without vowels

  const ratio = vowelCount / word.length; 
  if (ratio < 0.2) return false; // holy fucking shit this is unbalanced as fuck fix later

  if (/[bcdfghjklmnpqrstvwxyz]{4,}/.test(word)) return false; // consonants min 4 per word | fix later when it needs to be balanced

  return true;
}

async function fetchWordsForTrigram(trigram) { //returns cached words if available | asks api for words with trigram
  if (trigramCache.has(trigram)) return trigramCache.get(trigram);
  const url = `https://api.datamuse.com/words?sp=*${trigram}*&max=1000`; // ref api search
  const res = await fetch(url);
  if (!res.ok) throw new Error("oh shucks it failed D:");
  const data = await res.json(); 
  const words = data
    .map(d => (d.word || "").toLowerCase()) 
    .filter(w => /^[a-z]+$/.test(w) && w.length >= 5 && w.includes(trigram)); // for word char > 5 = valid words | to exclude possible acronyms that shouldnt work normally
  trigramCache.set(trigram, words); // maps everything to lowercase and filtres to only alphabetic and greater than 5 letters with the trigram
  return words;
}

function randomTrigram() { // rand assignment
  return (
    letters[Math.floor(Math.random() * 26)] +
    letters[Math.floor(Math.random() * 26)] +
    letters[Math.floor(Math.random() * 26)] // returns a string of three random letters from the alphabet | yes its brute force
  );
}

async function pickTrigram(usedWords) { 
  while (true) {
    const tri = randomTrigram(); // generates a random trigram
    let words; 
    try {
      words = await fetchWordsForTrigram(tri);
    } catch (e) {
      continue; // if fetch fail retries
    }
    const unused = words.filter(w => !usedWords.has(w)); // filters to unused words 
    if (unused.length >= minUnusedWords) return tri; // detector sys >500 words for now might change later cuz its too hard ):
  }
}

async function findBotWord(trigram, usedWords) { 
  let words;
  try {
    words = await fetchWordsForTrigram(trigram); 
  } catch (e) {
    return null; // error catch
  }
  const candidates = words.filter(w => !usedWords.has(w) && looksLikeRealWord(w) && w.length >= 5); // parameter filters w/ unused
  if (!candidates.length) return null; // if none bot stops
  return candidates[Math.floor(Math.random() * candidates.length)]; // selects random candidate
}

function checkWord(word, trigram, usedWords) {
  if (!looksLikeRealWord(word)) { return { ok: false, reason: "haha thats not in the dictionary" }; } 
  if (!word || word.length < 5) return { ok: false, reason: "more than 5 letters please and tbanks" };
  if (!/^[a-z]+$/.test(word)) return { ok: false, reason: "i dont think thats in the common english lexicon matey" };
  if (!word.includes(trigram)) return { ok: false, reason: `hey it must have "${trigram.toUpperCase()}"` };
  if (usedWords.has(word)) return { ok: false, reason: "dumbass its used" };
  return { ok: true };
}

function renderHome() {
  app.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "home";
  wrap.innerHTML = `
    <h1>bomb</h1>
    <p class="tagline">oaky so like basically you find words that has those three letters tgt<br/>there are bots ofc cuz idk how to set up servers so youll never win</p>
    <div class="rules">
      <h3>How to play</h3>
      <ul>
        <li>type a real 5+ letter word that contains the three consecutive letters shown anywhere (the api lwk sucks bear with it)</li>
        <li>wordbomb.io copy but bad | dictionary laws insp by last letter (mmii)</li>
        <li>fat creds to jeferson zheng he helped out a ton</li>
      </ul>
    </div>
    <button class="play">tickle me with words or smth</button>
  `;
  app.appendChild(wrap); // menu appearance and detects click 
  wrap.querySelector("button.play").addEventListener("click", () => startGame());
}

function showHome() {
  renderHome(); // homescreen 
}

let state = null;

function startGame() {
  state = {
    players: [me, ...bots].map(p => ({ ...p, lives: startingLives })),
    turnIndex: 0, // player starts first 
    trigram: "", // initi current trigram
    usedWords: new Set(), // hold all the words that have been played
    history: [], //  empty array that will store the list of recently played words
    timer: null,
    timeLeft: turnSeconds,
    feedback: { text: "", kind: "" },
    inputLocked: false,
    over: false,  // true when only one player remains
    botTimeoutId: null,
    loadingTrigram: false,
  };
  nextTurn(true);
}

function alivePlayers() {
  return state.players.filter(p => p.lives > 0);
}

function advanceTurnIndex() {
  do {
    state.turnIndex = (state.turnIndex + 1) % state.players.length;
  } while (state.players[state.turnIndex].lives <= 0);
}

async function nextTurn(first = false) {
  if (state.timer) { clearInterval(state.timer); state.timer = null; }
  if (state.botTimeoutId) { clearTimeout(state.botTimeoutId); state.botTimeoutId = null; }

  if (!first) advanceTurnIndex();

  const alive = alivePlayers();
  if (alive.length <= 1) {
    state.over = true;
    state.winner = alive[0] || null;
    renderGame();
    return;
  }

  state.loadingTrigram = true;
  state.feedback = { text: "", kind: "" };
  state.inputLocked = true;
  renderGame();

  const tri = await pickTrigram(state.usedWords);
  state.trigram = tri;
  state.timeLeft = turnSeconds;
  state.loadingTrigram = false;
  state.inputLocked = false;
  renderGame();

  state.timer = setInterval(() => {
    state.timeLeft -= 0.1;
    if (state.timeLeft <= 0) {
      timeUp();
    } else {
      updateBomb();
    }
  }, 100);

  const current = state.players[state.turnIndex];
  if (!current.isMe) {
    scheduleBotTurn(current);
  } else {
    setTimeout(() => {
      const input = document.getElementById("wordInput");
      if (input) input.focus();
    }, 30);
  }
}

async function scheduleBotTurn(bot) {
  const word = await findBotWord(state.trigram, state.usedWords);
  if (word) {
    acceptWord(bot, word);
  } else {
    timeUp();
  }
}

function timeUp() {
  if (state.timer) { clearInterval(state.timer); state.timer = null; }
  if (state.botTimeoutId) { clearTimeout(state.botTimeoutId); state.botTimeoutId = null; }
  const current = state.players[state.turnIndex];
  current.lives -= 1;
  state.feedback = { text: `${current.isMe ? "You" : current.name} lost a life!`, kind: "bad" };
  state.inputLocked = true;
  renderGame();

  const myPlayer = state.players.find(p => p.isMe);
  if (myPlayer.lives <= 0) {
    setTimeout(() => {
      state.over = true;
      state.winner = null;
      state.playerLost = true;
      renderGame();
    }, 800);
    return;
  }
  setTimeout(() => nextTurn(), 1100);
}

async function isRealWord(word) {
  try {
    const res = await fetch(`https://api.datamuse.com/words?sp=${word}&max=1`);
    if (!res.ok) return false;
    const data = await res.json();
    return data.length > 0 && data[0].word === word;
  } catch (e) {
    return false;
  }
}

function acceptWord(player, word) {
  if (state.timer) { clearInterval(state.timer); state.timer = null; }
  if (state.botTimeoutId) { clearTimeout(state.botTimeoutId); state.botTimeoutId = null; }
  state.usedWords.add(word);
  state.history.unshift({ author: player, word });
  state.feedback = { text: `${player.isMe ? "You" : player.name}: ${word}`, kind: "good" };
  state.inputLocked = true;
  renderGame();
  setTimeout(() => nextTurn(), 600);
}

async function submitMyWord(raw) {
  if (state.inputLocked) return;

  const word = (raw || "").trim().toLowerCase();
  if (!word) return;

  const result = checkWord(word, state.trigram, state.usedWords);
  if (!result.ok) {
    setFeedback(result.reason, "bad");
    const input = document.getElementById("wordInput");
    if (input) { input.value = ""; input.focus(); }
    return;
  }

  const valid = await isRealWord(word);
  if (!valid) {
    setFeedback("Not a real word", "bad");
    const input = document.getElementById("wordInput");
    if (input) { input.value = ""; input.focus(); }
    return;
  }

  acceptWord(state.players[state.turnIndex], word);
}

function setFeedback(text, kind) {
  state.feedback = { text, kind };
  const el = document.querySelector(".feedback");
  if (el) {
    el.textContent = text;
    el.className = `feedback ${kind}`;
  }
}

function renderGame() {
  app.innerHTML = "";
  if (state.over) {
    renderGameOver();
    return;
  }
  const wrap = document.createElement("div");
  wrap.className = "game";

  const playersEl = document.createElement("div");
  playersEl.className = "players";
  state.players.forEach((p, idx) => {
    const isActive = idx === state.turnIndex && p.lives > 0;
    const isDead = p.lives <= 0;
    const div = document.createElement("div");
    div.className = `player ${isActive ? "active" : ""} ${isDead ? "dead" : ""} ${p.isMe ? "me" : ""}`;
    const hearts = Array.from({ length: startingLives }, (_, i) =>
      `<span class="heart ${i < p.lives ? "" : "lost"}">●</span>`
    ).join("");
    div.innerHTML = `<div class="name">${p.isMe ? "You" : p.name}</div><div class="lives">${hearts}</div>`;
    playersEl.appendChild(div);
  });
  wrap.appendChild(playersEl);

  const stage = document.createElement("div");
  stage.className = "stage";
  const current = state.players[state.turnIndex];
  const trigramDisplay = state.loadingTrigram ? "…" : state.trigram;
  stage.innerHTML = `
    <div class="turnLabel">Now playing — <span class="who">${current.isMe ? "You" : current.name}</span></div>
    <div class="bomb">
      <div class="ring"></div>
      <div class="ring progress" style="--p:0"></div>
      <div class="trigram">${trigramDisplay}</div>
      <div class="timer">${state.loadingTrigram ? "…" : state.timeLeft.toFixed(1) + "s"}</div>
    </div>
    <div class="inputRow">
      <input id="wordInput" type="text" autocomplete="off" autocapitalize="off" spellcheck="false"
        placeholder="${state.loadingTrigram ? "Generating letters…" : current.isMe ? `Type a word containing "${state.trigram.toUpperCase()}"` : `${current.name} is thinking…`}"
        ${current.isMe && !state.loadingTrigram ? "" : "disabled"} />
      <div class="feedback ${state.feedback.kind}">${state.feedback.text}</div>
    </div>
  `;
  wrap.appendChild(stage);

  if (state.history.length > 0) {
    const hist = document.createElement("div");
    hist.className = "history";
    hist.innerHTML = `<h4>Played words</h4><div class="items">` +
      state.history.slice(0, 40).map(h =>
        `<span class="item ${h.author.isMe ? "me" : ""}"><span class="author">${h.author.isMe ? "You" : h.author.name}</span>${h.word}</span>`
      ).join("") +
      `</div>`;
    wrap.appendChild(hist);
  }

  app.appendChild(wrap);
  updateBomb();

  if (current.isMe && !state.loadingTrigram) {
    const input = document.getElementById("wordInput");
    if (input) {
      input.focus();
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          submitMyWord(input.value);
        }
      });
    }
  }
}

function updateBomb() {
  const ring = document.querySelector(".bomb .ring.progress");
  const timer = document.querySelector(".bomb .timer");
  const bomb = document.querySelector(".bomb");
  if (!ring || !timer || !bomb) return;
  if (state.loadingTrigram) return;
  const pct = Math.max(0, (state.timeLeft / turnSeconds) * 100);
  ring.style.setProperty("--p", pct.toString());
  timer.textContent = `${Math.max(0, state.timeLeft).toFixed(1)}s`;
  if (state.timeLeft <= 2.5) bomb.classList.add("danger");
  else bomb.classList.remove("danger");
}

function renderGameOver() {
  const wrap = document.createElement("div");
  wrap.className = "gameover";
  const won = state.winner && state.winner.isMe;
  wrap.innerHTML = `
    <h2 class="${won ? "win" : "lose"}">${won ? "You cheated!" : "You lost"}</h2>
    <p>${won ? "You won? Bro, I didn't make it possible." : "GGs, as expected."}</p>
    <button class="play" id="again">Play Again</button>
    <div style="height:12px"></div>
    <button class="play" id="home" style="background:transparent; box-shadow:none; color:var(--muted); border:1px solid var(--border); padding:14px 36px; font-size:15px">Home</button>
  `;
  app.appendChild(wrap);
  document.getElementById("again").addEventListener("click", () => startGame());
  document.getElementById("home").addEventListener("click", () => showHome());
}

showHome();
