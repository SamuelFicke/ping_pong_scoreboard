"use strict";
// The phone-remote page (same file in both apps). Opened from the QR code on the
// scoreboard as remote.html#<code>; connects to the board over WebRTC (PeerJS),
// sends button presses, and shows the board's live score.
(() => {
  const APP = document.documentElement.dataset.app;   // "jpx" | "pong"
  const code = location.hash.slice(1).toLowerCase().replace(/[^a-z0-9]/g, "");
  const $ = (id) => document.getElementById(id);
  const statusEl = $("status");

  let peer = null;
  let conn = null;
  let retry = null;
  let board = null; // last state from the scoreboard

  function setStatus(text, ok) {
    statusEl.textContent = text;
    statusEl.className = ok ? "ok" : "";
    document.body.classList.toggle("connected", !!ok);
  }

  if (!code) {
    setStatus("No scoreboard code. Scan the QR code on the scoreboard (remote button).");
    return;
  }

  function scheduleRetry(ms = 3000) {
    clearTimeout(retry);
    retry = setTimeout(connect, ms);
  }

  function connect() {
    clearTimeout(retry);
    if (typeof Peer === "undefined") { setStatus("Couldn't load. Check your internet."); return; }
    if (!navigator.onLine) { setStatus("No internet. Waiting…"); scheduleRetry(); return; }
    if (!peer || peer.destroyed) {
      peer = new Peer({ debug: 0 });
      peer.on("open", openConn);
      peer.on("disconnected", () => { if (!peer.destroyed) peer.reconnect(); });
      peer.on("error", (err) => {
        if (err.type === "peer-unavailable") {
          setStatus("Scoreboard not found. Is it open with the remote turned on? Retrying…");
        } else {
          setStatus("Connection problem. Retrying…");
          try { peer.destroy(); } catch (_) {}
          peer = null;
        }
        scheduleRetry(4000);
      });
      setStatus("Connecting…");
    } else if (peer.open) {
      openConn();
    }
  }

  function openConn() {
    if (conn && conn.open) return;
    setStatus("Connecting to the scoreboard…");
    conn = peer.connect(`sficke-scoreboard-${APP}-${code}`, { reliable: true });
    conn.on("open", () => setStatus("Connected", true));
    conn.on("data", (m) => { if (m && m.state) { board = m.state; render(); } });
    conn.on("close", () => { setStatus("Disconnected. Reconnecting…"); conn = null; scheduleRetry(1500); });
    conn.on("error", () => { conn = null; scheduleRetry(); });
  }

  function send(cmd) {
    if (conn && conn.open) conn.send({ cmd });
    else { setStatus("Not connected. Reconnecting…"); connect(); }
  }

  // ---------------- rendering ----------------
  function render() {
    if (!board) return;
    document.title = `${board.title} remote`;
    $("app-title").textContent = `${board.title} remote`;
    $("away-score").textContent = board.away;
    $("home-score").textContent = board.home;
    $("away").classList.toggle("serving", board.serve === "away" && !board.gameOver);
    $("home").classList.toggle("serving", board.serve === "home" && !board.gameOver);

    const armed = board.pending !== null;
    let note = "";
    if (board.busy) note = armed && !board.pendingIsWin ? "drink timer running…" : "game over!";
    else if (board.pendingIsWin) note = `winner chug: ${board.pending} s`;
    else if (armed) note = `${board.pending.toFixed(1)} s timer armed`;
    else if (board.gameOver) note = "game over!";
    $("note").textContent = note;

    // Big action button: start the armed timer, or a new game after a win (ping pong).
    const go = $("go");
    go.hidden = board.busy || !(armed || board.gameOver);
    go.textContent = armed ? (board.pendingIsWin ? "START CHUG" : "GO") : "NEW GAME";

    document.querySelectorAll("button[data-cmd^='add'], button[data-cmd^='sub']").forEach((b) => {
      b.disabled = board.busy || armed;
    });
    $("serve").disabled = board.busy || armed;

    const timers = $("timers");
    timers.hidden = !board.timers.length;
    if (timers.childElementCount !== board.timers.length) {
      timers.innerHTML = board.timers.map((t) => `<button data-cmd="timer:${t}">${t.toFixed(1)}</button>`).join("");
    }
    timers.querySelectorAll("button").forEach((b) => {
      const t = Number(b.dataset.cmd.split(":")[1]);
      b.classList.toggle("active", armed && !board.pendingIsWin && board.pending === t);
      b.disabled = board.busy || board.pendingIsWin;
    });
    $("reset").disabled = board.busy;
  }

  // ---------------- input ----------------
  document.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b || b.disabled) return;
    if (b.id === "reset") {
      if (confirm("Reset the score to 0-0?")) send("reset");
      return;
    }
    if (b.dataset.cmd) send(b.dataset.cmd);
  });
  $("go").addEventListener("click", () => send("go"));
  document.addEventListener("gesturestart", (e) => e.preventDefault());
  document.addEventListener("dblclick", (e) => e.preventDefault());

  // Keep this screen awake while it's being used as a remote.
  async function keepAwake() {
    try {
      if ("wakeLock" in navigator && document.visibilityState === "visible") await navigator.wakeLock.request("screen");
    } catch (_) {}
  }
  keepAwake();

  // Phones drop connections when the screen locks; reconnect when it's back.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    keepAwake();
    if (!conn || !conn.open) connect();
  });
  window.addEventListener("online", () => { if (!conn || !conn.open) connect(); });

  connect();
})();
