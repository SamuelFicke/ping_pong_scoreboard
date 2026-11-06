// Caches everything so the scoreboard works offline once installed.
// Bump VERSION whenever you change any file so phones pick up the update.
// Other apps share the samuelficke.github.io origin (and its cache storage),
// so only ever delete caches with this app's PREFIX.
const PREFIX = "ping-pong-";
const VERSION = PREFIX + "v3";
const FILES = [
  "./",
  "index.html",
  "style.css",
  "app.js",
  "manifest.webmanifest",
  "fonts/harryp.ttf",
  "fonts/seven-segment.ttf",
  "images/ea_sports.jpg",
  "images/apple-touch-icon.png",
  "images/icon-192.png",
  "images/icon-512.png",
  "audio/EASports.wav",
  "audio/nice.wav",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) =>
    c.addAll(FILES.map((f) => new Request(f, { cache: "reload" })))));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys
        .filter((k) => k.startsWith(PREFIX) && k !== VERSION)
        .map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

// Network first so the newest version loads whenever you're online; the cache
// is only used offline.
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request, { cache: "no-cache" })
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { cacheName: VERSION }))
  );
});
