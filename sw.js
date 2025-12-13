const CACHE = "jm-pwa-v1";
const PRECACHE = [
  "./",
  "./index.html",
  "./cats.html",
  "./dogs.html",
  "./about.html",
  "./home.html",
  "./adopt.html",
  "./assets/tailwind.css",
  "./assets/shared.css",
  "./images/dogpaw-32.png",
  "./images/dogpaw-180.png",
  "./images/dogpaw-192.png",
  "./images/dogpaw-512.png"
];

// 安裝：預先快取（離線可開）
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)));
  self.skipWaiting();
});

// 啟用：清舊快取
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// 取用：頁面用 Network-first（沒網路再回 cache），靜態檔用 Cache-first
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // 只管同源
  if (url.origin !== location.origin) return;

  // 導航（多頁站最重要）
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      }).catch(() => caches.match(req).then((r) => r || caches.match("/index.html")))
    );
    return;
  }

  // 其他資源：cache-first
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy));
      return res;
    }))
  );
});
