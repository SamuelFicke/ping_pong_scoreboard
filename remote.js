"use strict";
// Remote control for the scoreboard (same file in both apps).
//  1. A Bluetooth number pad (or any keyboard) paired to the phone: keys below.
//  2. Other phones as remotes: the "remote" button shows a QR code that opens
//     remote.html, which connects straight to this phone over WebRTC (PeerJS).
// Needs app.js to define window.board = { app, title, command(cmd), snapshot() }.
(() => {
  const B = window.board;
  const $ = (id) => document.getElementById(id);
  const hasTimers = B.snapshot().timers.length > 0;

  // ---------------- 1. number pad ----------------
  // Same keys as the original PC version (7/1, 9/3, 8, "=", "+", "2"), plus 4/5/6 for
  // the timers because many Bluetooth number pads have no "=" key.
  const KEYS = {
    "7": "add:away", "1": "sub:away", "9": "add:home", "3": "sub:home", "8": "serve",
    "Enter": "go", "0": "go",
    "4": "timer:1", "5": "timer:1.5", "6": "timer:2", "=": "timer:1", "+": "timer:1.5", "2": "timer:2",
  };
  // Read number-pad keys by position so they work with Num Lock off too.
  function keyName(e) {
    if (e.code && e.code.startsWith("Numpad")) {
      const k = e.code.slice(6);
      return { Add: "+", Equal: "=", Enter: "Enter", Subtract: "-", Multiply: "*", Divide: "/", Decimal: "." }[k] ?? k;
    }
    return e.key;
  }
  document.addEventListener("keydown", (e) => {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    const splash = $("splash");
    if (splash && !splash.classList.contains("started")) { splash.click(); e.preventDefault(); return; }
    if (!overlay.hidden && (e.key === "Escape" || e.key === "Enter")) { closeOverlay(); e.preventDefault(); return; }
    const cmd = KEYS[keyName(e)];
    if (!cmd) return;
    e.preventDefault();
    B.command(cmd);
  });

  // ---------------- 2. phone remotes ----------------
  const ON_KEY = `${B.app}-remote-on`;
  const CODE_KEY = `${B.app}-remote-code`;
  const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // no look-alikes (l/1, o/0, i)

  // A random code, kept on this phone so a saved remote link keeps working.
  function code() {
    let c = localStorage.getItem(CODE_KEY);
    if (!c) {
      c = Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => ALPHABET[b % ALPHABET.length]).join("");
      localStorage.setItem(CODE_KEY, c);
    }
    return c;
  }
  const peerId = () => `sficke-scoreboard-${B.app}-${code()}`;
  const remoteUrl = () => new URL(`remote.html#${code()}`, location.href).href;

  let peer = null;
  let retry = null;
  let status = "off"; // off | connecting | ready | offline
  const conns = new Set();

  function setStatus(s) { status = s; updateOverlay(); }

  function start() {
    clearTimeout(retry);
    if (peer || typeof Peer === "undefined") return;
    setStatus("connecting");
    peer = new Peer(peerId(), { debug: 0 });
    peer.on("open", () => setStatus("ready"));
    peer.on("connection", (c) => {
      c.on("open", () => { conns.add(c); sendState(c); updateOverlay(); });
      c.on("data", (m) => { if (m && typeof m.cmd === "string") B.command(m.cmd); });
      const gone = () => { conns.delete(c); updateOverlay(); };
      c.on("close", gone);
      c.on("error", gone);
    });
    // Lost the signaling server (Wi-Fi blip, phone slept): open remotes keep working,
    // but new ones can't join until we reconnect.
    peer.on("disconnected", () => {
      if (!peer || peer.destroyed) return;
      setStatus("connecting");
      setTimeout(() => { if (peer && !peer.destroyed && peer.disconnected) peer.reconnect(); }, 2000);
    });
    peer.on("error", (err) => {
      if (err.type === "peer-unavailable") return; // not used by the board
      // e.g. "unavailable-id" right after a reload (the old session is still registered),
      // or no internet. Start over in a few seconds.
      restart(navigator.onLine ? "connecting" : "offline");
    });
  }
  function restart(s) {
    if (peer) { try { peer.destroy(); } catch (_) {} }
    peer = null;
    conns.clear();
    setStatus(s);
    clearTimeout(retry);
    retry = setTimeout(start, 5000);
  }
  function stop() {
    clearTimeout(retry);
    if (peer) { try { peer.destroy(); } catch (_) {} }
    peer = null;
    conns.clear();
    setStatus("off");
  }

  function sendState(c) {
    try { if (c.open) c.send({ state: B.snapshot() }); } catch (_) {}
  }
  window.onBoardChange = () => conns.forEach(sendState);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible" || localStorage.getItem(ON_KEY) !== "1") return;
    if (!peer) start();
    else if (peer.disconnected && !peer.destroyed) peer.reconnect();
  });
  window.addEventListener("online", () => {
    if (localStorage.getItem(ON_KEY) === "1" && (!peer || peer.disconnected)) restart("connecting");
  });

  // ---------------- QR screen ----------------
  const overlay = document.createElement("div");
  overlay.id = "remote-overlay";
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="remote-card">
      <div class="remote-qr" id="remote-qr"></div>
      <div class="remote-info">
        <div class="remote-title">Phone remote</div>
        <div>Scan with a phone camera to control the score.</div>
        <div class="remote-code" id="remote-code"></div>
        <div class="remote-status" id="remote-status"></div>
        <div class="remote-keys">
          <b>Number pad:</b> 7 / 1 = away +1 / −1 · 9 / 3 = home +1 / −1 · 8 = switch serve
          ${hasTimers ? "· 4 / 5 / 6 = 1.0 / 1.5 / 2.0 timer · Enter or 0 = start timer"
                      : "· Enter or 0 = new game after a win"}
        </div>
        <div class="remote-buttons">
          <button id="remote-close">done</button>
          <button id="remote-off">turn off</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  function updateOverlay() {
    const btn = $("remote");
    if (btn) btn.classList.toggle("active", conns.size > 0);
    if (overlay.hidden) return;
    const n = conns.size;
    $("remote-status").textContent = {
      off: "Off",
      connecting: "Connecting…",
      offline: "No internet: phone remotes need Wi-Fi or cell data",
      ready: n ? `${n} remote${n > 1 ? "s" : ""} connected` : "Ready: waiting for a remote",
    }[status];
    $("remote-status").className = "remote-status " + (status === "ready" ? "ok" : "");
  }

  function openOverlay() {
    localStorage.setItem(ON_KEY, "1");
    start();
    const url = remoteUrl();
    if (typeof qrcode !== "undefined") {
      const qr = qrcode(0, "M");
      qr.addData(url);
      qr.make();
      $("remote-qr").innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
    } else {
      $("remote-qr").textContent = "QR unavailable";
    }
    $("remote-code").textContent = url.replace(/^https?:\/\//, "");
    overlay.hidden = false;
    updateOverlay();
  }
  function closeOverlay() { overlay.hidden = true; }

  $("remote").addEventListener("click", () => { if (!B.snapshot().busy) openOverlay(); });
  $("remote-close").addEventListener("click", closeOverlay);
  $("remote-off").addEventListener("click", () => {
    localStorage.removeItem(ON_KEY);
    stop();
    closeOverlay();
  });

  if (localStorage.getItem(ON_KEY) === "1") start();
})();
