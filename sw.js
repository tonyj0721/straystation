const CACHE = "jm-pwa-2026-01-13";

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

// 接收指令：立刻啟用新版（跳過 waiting）
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// 取用：頁面 Network-first；靜態檔 stale-while-revalidate
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // 只管同源
  if (url.origin !== location.origin) return;

  // 非 GET 不碰（避免表單/登入等出問題）
  if (req.method !== "GET") return;

  // 導航（多頁站最重要）：Network-first
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          // 更新快取
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() =>
          caches.match(req).then((r) => r || caches.match("./index.html") || caches.match("/index.html"))
        )
    );
    return;
  }

  // 其他資源：stale-while-revalidate
  event.respondWith(
    caches.match(req).then((cached) => {
      const fetchAndUpdate = fetch(req)
        .then((res) => {
          // 只快取成功回應
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);

      return cached || fetchAndUpdate;
    })
  );
});