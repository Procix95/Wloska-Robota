// Włoska Robota – prosty service worker: strona zawsze próbuje najpierw pobrać świeżą wersję z sieci,
// a gdy zasięg jest słaby lub go nie ma, pokazuje ostatnią zapamiętaną. Firebase, Google i inne zewnętrzne adresy
// nigdy nie są przechwytywane (logowanie i dane zawsze idą prosto do serwera).
const CACHE = "wr-v2";

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["/logo-mark.webp", "/logo-badge.webp", "/icon-512.png"])).catch(() => {}));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req);
  const net = fetch(req).then((res) => { if (res && res.ok) cache.put(req, res.clone()); return res; });
  net.catch(() => {});
  try {
    return await Promise.race([net, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), cached ? 4000 : 25000))]);
  } catch (_) {
    return cached || (await cache.match("/")) || net;
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req);
  const net = fetch(req).then((res) => { if (res && res.ok) cache.put(req, res.clone()); return res; }).catch(() => cached);
  return cached || net;
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname === "/sw.js") return;
  if (req.mode === "navigate") { e.respondWith(networkFirst(req)); return; }
  if (/\.(png|jpe?g|ico|svg|webp|woff2?)$/i.test(url.pathname)) e.respondWith(cacheFirst(req));
});
