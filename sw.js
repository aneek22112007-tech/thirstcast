/* ThirstCast shell. Network-first, then the saved copy. Tiles are stored only after a real request. */
const SHELL = "thirstcast-shell-v1";
const RUNTIME = "thirstcast-runtime-v1";
const TILES = "thirstcast-tiles-v1";
const DAY_MS = 86400000;
let lastOffline = null;

const SHELL_URLS = [
  "index.html",
  "app.html",
  "methods.html",
  "favicon.svg",
  "manifest.webmanifest",
  "config.js",
  "api.js",
  "styles/tokens.css",
  "styles/components.css",
  "styles/app.css",
  "styles/landing.css",
  "styles/methods.css",
  "js/i18n.js",
  "js/format.js",
  "js/stats.js",
  "js/charts.js",
  "js/pwa.js",
  "js/dashboard.js",
  "js/landing.js",
  "js/methods.js",
  "i18n/en.json",
  "i18n/hi.json",
  "vendor/leaflet/leaflet.css",
  "vendor/leaflet/leaflet.js",
  "vendor/leaflet/images/marker-icon.png",
  "vendor/leaflet/images/marker-icon-2x.png",
  "vendor/leaflet/images/marker-shadow.png",
  "vendor/leaflet/images/layers.png",
  "vendor/leaflet/images/layers-2x.png",
  "vendor/marked/marked.min.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL).then((cache) => cache.addAll(SHELL_URLS)).then(() => self.skipWaiting()));
});
/* The worker does not claim the open page. Claiming aborts fetches that page already started. */

function isTile(url) {
  return url.hostname.endsWith("tile.openstreetmap.org");
}

function isLiveApi(url) {
  if (url.origin === self.location.origin) return false;
  return /\/districts$|\/thirstwave\/|\/replay\/|\/ask$/.test(url.pathname);
}

async function notify(at) {
  lastOffline = at || "";
  const pages = await self.clients.matchAll({ includeUncontrolled: true, type: "window" });
  await Promise.all(pages.map((client) => client.postMessage({ type: "offline", at: lastOffline })));
}

async function putStamped(cache, request, response) {
  const headers = new Headers(response.headers);
  headers.set("x-cached-at", new Date().toISOString());
  const stamped = new Response(await response.blob(), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
  await cache.put(request, stamped);
}

async function networkFirst(cacheName, request, maxAge) {
  const cache = await caches.open(cacheName);
  try {
    const fresh = await fetch(request);
    if (fresh.ok) await putStamped(cache, request, fresh.clone());
    return fresh;
  } catch (err) {
    const cached = await cache.match(request);
    if (!cached) throw err;
    const at = cached.headers.get("x-cached-at") || "";
    if (maxAge && at && Date.now() - Date.parse(at) > maxAge) throw err;
    await notify(at);
    return cached;
  }
}

async function tiles(request) {
  const cache = await caches.open(TILES);
  const hit = await cache.match(request);
  if (hit) return hit;
  const fresh = await fetch(request);
  if (fresh.ok) await cache.put(request, fresh.clone());
  return fresh;
}

async function newestStamp() {
  let newest = lastOffline || "";
  for (const name of [RUNTIME, SHELL]) {
    const cache = await caches.open(name);
    const keys = await cache.keys();
    for (const key of keys) {
      const saved = await cache.match(key);
      const at = saved && saved.headers.get("x-cached-at");
      if (at && at > newest) newest = at;
    }
  }
  return newest;
}

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "status" && event.ports && event.ports[0]) {
    const port = event.ports[0];
    event.waitUntil(newestStamp().then((savedAt) => {
      port.postMessage({ offline: lastOffline, savedAt });
    }));
    return;
  }
  if (!event.data || event.data.type !== "warm") return;
  const urls = Array.isArray(event.data.urls) ? event.data.urls : [];
  event.waitUntil((async () => {
    const cache = await caches.open(RUNTIME);
    await Promise.all(urls.map(async (url) => {
      let parsed;
      try { parsed = new URL(url); } catch (e) { return; }
      if (parsed.origin !== self.location.origin || isTile(parsed)) return;
      if (parsed.pathname.endsWith("/sw.js")) return;
      try {
        const res = await fetch(parsed.href);
        if (res.ok) await putStamped(cache, parsed.href, res);
      } catch (e) { /* leave the previous copy */ }
    }));
    if (event.ports && event.ports[0]) event.ports[0].postMessage({ ok: true });
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.pathname.endsWith("/sw.js")) return;
  if (isTile(url)) {
    event.respondWith(tiles(request));
    return;
  }
  if (isLiveApi(url)) {
    event.respondWith(networkFirst(RUNTIME, request, DAY_MS));
    return;
  }
  if (url.origin !== self.location.origin) return;
  const cacheName = url.pathname.includes("/data/") || url.pathname.includes("/mock/") ? RUNTIME : SHELL;
  event.respondWith(networkFirst(cacheName, request));
});
