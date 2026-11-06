"use strict";

// ---------------- config ----------------
const WINNING_SCORE = 11;
const MAX_SCORE = 99;

const SOUNDS = {
  easports: "audio/EASports.wav",
  nice: "audio/nice.wav",
};

// ---------------- state ----------------
const state = {
  home: 0,
  away: 0,
  serve: "away",        // who is serving: "away" | "home"
  firstServer: "away",  // who served first this game
  busy: false,          // winner blinking: ignore input
  gameOver: false,      // game won; next tap starts a new game
};

const $ = (id) => document.getElementById(id);
const el = {
  board: $("board"),
  home: $("home-score"),
  away: $("away-score"),
  serve: $("serve"),
  hint: $("hint"),
  splash: $("splash"),
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const other = (team) => (team === "home" ? "away" : "home");

// ---------------- audio ----------------
// Web Audio with pre-decoded buffers gives instant, reliable playback on iOS.
const AudioCtx = window.AudioContext || window.webkitAudioContext;
const audioCtx = AudioCtx ? new AudioCtx() : null;
const buffers = {};

// Play through the silent switch (Safari 16.4+).
if (navigator.audioSession) {
  try { navigator.audioSession.type = "playback"; } catch (_) {}
}

async function loadSounds() {
  if (!audioCtx) return;
  await Promise.all(Object.entries(SOUNDS).map(async ([name, url]) => {
    try {
      const data = await (await fetch(url)).arrayBuffer();
      buffers[name] = await new Promise((res, rej) =>
        audioCtx.decodeAudioData(data, res, rej));
    } catch (e) {
      console.warn("could not load", url, e);
    }
  }));
}
const soundsLoaded = loadSounds();

// iOS can suspend or "interrupt" the audio context at any time (idle, calls,
// switching apps). Resume it on every touch, and play a silent buffer the first
// time so the context is unlocked inside a real user gesture.
let unlocked = false;
function unlockAudio() {
  if (!audioCtx) return;
  if (audioCtx.state !== "running") audioCtx.resume().catch(() => {});
  if (!unlocked) {
    const src = audioCtx.createBufferSource();
    src.buffer = audioCtx.createBuffer(1, 1, 22050);
    src.connect(audioCtx.destination);
    src.start(0);
    unlocked = true;
  }
}
["pointerdown", "touchstart", "touchend", "click"].forEach((type) =>
  document.addEventListener(type, unlockAudio, { capture: true, passive: true }));

async function play(name) {
  const buf = buffers[name];
  if (!audioCtx || !buf) return;
  if (audioCtx.state !== "running") {
    try {
      await Promise.race([audioCtx.resume(), sleep(300)]);
    } catch (_) {}
  }
  return new Promise((resolve) => {
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    src.connect(audioCtx.destination);
    src.onended = resolve;
    src.start();
    setTimeout(resolve, buf.duration * 1000 + 500);
  });
}

// ---------------- screen wake lock ----------------
async function keepAwake() {
  try {
    if ("wakeLock" in navigator && document.visibilityState === "visible") {
      await navigator.wakeLock.request("screen");
    }
  } catch (_) {}
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    keepAwake();
    if (audioCtx && audioCtx.state !== "running") audioCtx.resume();
  }
});

// ---------------- rendering ----------------
function render() {
  el.home.textContent = state.home;
  el.away.textContent = state.away;
  el.serve.textContent = state.serve === "home" ? "  ->" : "<-  ";
  el.serve.style.display = state.gameOver ? "none" : "";
  el.hint.style.display = state.gameOver && !state.busy ? "block" : "none";
}

// ---------------- game logic ----------------
const toggleServe = () => { state.serve = other(state.serve); };
// Serve switches every 2 points, then every point from 10-10.
const serveChangesAt = (total) => total % 2 === 0 || total > 20;

function addPoint(team) {
  if (state[team] >= MAX_SCORE) return;
  if (state.home === 0 && state.away === 0) state.firstServer = state.serve;
  state[team] += 1;
  if (serveChangesAt(state.home + state.away)) toggleServe();
  afterScoreChange();
}

function removePoint(team) {
  if (state[team] <= 0) return;
  if (serveChangesAt(state.home + state.away)) toggleServe();
  state[team] -= 1;
  state.gameOver = false; // lets you take back a mistaken winning point
  afterScoreChange();
}

async function afterScoreChange() {
  render();
  const { home, away } = state;

  if ((home === 9 && away === 6) || (home === 6 && away === 9)) play("nice");

  if ((home >= WINNING_SCORE || away >= WINNING_SCORE) && Math.abs(home - away) > 1) {
    state.gameOver = true;
    state.busy = true;
    render();
    await sleep(250);
    await blink(home > away ? el.home : el.away, 5);
    state.busy = false;
    render();
  }
}

async function blink(scoreEl, times) {
  for (let i = 0; i < times; i++) {
    scoreEl.style.visibility = "hidden";
    await sleep(250);
    scoreEl.style.visibility = "visible";
    await sleep(250);
  }
}

// Players alternate who serves first each game.
function newGame() {
  Object.assign(state, {
    home: 0, away: 0, gameOver: false, serve: other(state.firstServer),
  });
  render();
}

// ---------------- input ----------------
const SWIPE_PX = 40;
const LONG_PRESS_MS = 550;

// Tap = +1, swipe down or long-press = -1.
function bindTeamZone(zone) {
  const team = zone.dataset.team;
  let start = null;
  let pressTimer = null;

  zone.addEventListener("pointerdown", (e) => {
    start = { x: e.clientX, y: e.clientY, handled: false };
    clearTimeout(pressTimer);
    pressTimer = setTimeout(() => {
      if (!start || state.busy) return;
      start.handled = true;
      removePoint(team);
    }, LONG_PRESS_MS);
  });

  zone.addEventListener("pointerup", (e) => {
    clearTimeout(pressTimer);
    if (!start || start.handled) { start = null; return; }
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    start = null;
    if (state.busy) return;
    if (dy > SWIPE_PX && Math.abs(dy) > Math.abs(dx)) removePoint(team);
    else if (Math.abs(dx) < SWIPE_PX && Math.abs(dy) < SWIPE_PX) {
      if (state.gameOver) newGame(); else addPoint(team);
    }
  });

  zone.addEventListener("pointercancel", () => { clearTimeout(pressTimer); start = null; });
}
bindTeamZone($("away-zone"));
bindTeamZone($("home-zone"));

// Tap center = switch serve (or start a new game once someone has won).
$("center-zone").addEventListener("click", () => {
  if (state.busy) return;
  if (state.gameOver) { newGame(); return; }
  toggleServe();
  render();
});
$("title").addEventListener("click", () => {
  if (!state.busy && state.gameOver) newGame();
});

$("reset").addEventListener("click", () => {
  if (state.busy) return;
  if (!confirm("Reset the score to 0-0?")) return;
  Object.assign(state, { home: 0, away: 0, gameOver: false, serve: state.firstServer });
  render();
});

// Keep iOS from zooming / scrolling on double taps and pinches.
document.addEventListener("gesturestart", (e) => e.preventDefault());
document.addEventListener("dblclick", (e) => e.preventDefault());

// ---------------- splash ----------------
el.splash.addEventListener("click", async () => {
  if (el.splash.classList.contains("started")) return;
  el.splash.classList.add("started");
  keepAwake();
  await soundsLoaded;
  await sleep(250);
  play("easports");
  await sleep(3750);
  el.splash.classList.add("hidden");
});

render();

// ---------------- offline support ----------------
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
