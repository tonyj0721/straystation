const CACHE = "jm-pwa-2026-01-15"; // ← 改成 v2 先把舊快取整批換掉（這次建議一定要做）

const PRECACHE = [
  "./",
  "./index.html",
  "./cats.html",
  "./dogs.html",
  "./about.html",
  "./home.html",
  "./adopt.html",
  "./manifest.webmanifest",
  "./assets/tailwind.css",
  "./assets/shared.css",
  "./assets/Modal.js",
  "./assets/Lightbox.js",
  "./assets/firebase-config.js",
  "./images/dogpaw-32.png",
  "./images/dogpaw-180.png",
  "./images/dogpaw-192.png",
  "./images/dogpaw-512.png",
  "./images/dogpaw-512-maskable.png",
  "./images/dogpaw.png",
  "./images/hero-bg.jpg",
];

// 讓 fetch 盡量拿到「最新」的 helper
function withReloadCache(req) {
  // 對同源 GET 可用 cache: "reload" 逼瀏覽器重新跟伺服器確認
  return new Request(req, { cache: "reload" });
}

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) =>
      c.addAll(PRECACHE.map((u) => new Request(u, { cache: "reload" })))
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(withReloadCache(req));
    cache.put(req, res.clone());
    return res;
  } catch (_) {
    const cached = await cache.match(req);
    return cached || caches.match("./index.html");
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req);
  if (cached) return cached;

  const res = await fetch(req);
  cache.put(req, res.clone());
  return res;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // 只處理同源
  if (url.origin !== self.location.origin) return;

  const dest = req.destination; // document/script/style/image/font/manifest...

  // 1) 所有「頁面」：network-first（確保一載入就最新）
  if (req.mode === "navigate" || dest === "document" || url.pathname.endsWith(".html")) {
    event.respondWith(networkFirst(req));
    return;
  }

  // 2) JS/CSS：network-first（你卡住的主因就在這）
  if (dest === "script" || dest === "style" || url.pathname.endsWith(".js") || url.pathname.endsWith(".css")) {
    event.respondWith(networkFirst(req));
    return;
  }

  // 3) 圖片/字型：cache-first（省流量，沒那麼需要秒更新）
  if (dest === "image" || dest === "font") {
    event.respondWith(cacheFirst(req));
    return;
  }

  // 4) 其他：保守用 network-first
  event.respondWith(networkFirst(req));
});