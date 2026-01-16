const $ = (sel) => document.querySelector(sel);

history.scrollRestoration = "manual";
window.scrollTo(0, 0);

// ---- Modal + Lightbox 共用狀態 ----
const dlg = document.getElementById('petDialog');
const lb = document.getElementById("lightbox");
const lbImg = document.getElementById("lbImg");

// 讓 Lightbox 支援影片：如果 HTML 沒有 lbVideo，就動態補上（避免你一定要改 HTML）
let lbVideo = document.getElementById("lbVideo");
if (!lbVideo && lbImg && lbImg.parentElement) {
  lbVideo = document.createElement("video");
  lbVideo.id = "lbVideo";
  lbVideo.className = lbImg.className;
  lbVideo.controls = true;
  lbVideo.playsInline = true;
  lbVideo.preload = "metadata";
  lbVideo.style.display = "none";
  lbImg.insertAdjacentElement("afterend", lbVideo);
}

const lbPrev = document.getElementById("lbPrev");
const lbNext = document.getElementById("lbNext");
const lbClose = document.getElementById("lbClose");

let lbImages = [];
let lbIndex = 0;
let lbReturnToDialog = false;

// 用來記住原本 scroll 狀態（iOS 點螢幕頂端也不會把背景捲動）
let __lockDepth = 0;
let __savedScrollY = 0;
let __oldHtmlOverflow = "";
let __oldBodyOverflow = "";
let __oldBodyPosition = "";
let __oldBodyTop = "";
let __oldBodyLeft = "";
let __oldBodyRight = "";
let __oldBodyWidth = "";

function lockScroll() {
  __lockDepth++;
  if (__lockDepth > 1) return;

  __savedScrollY = window.scrollY || window.pageYOffset || 0;
  __oldHtmlOverflow = document.documentElement.style.overflow;
  __oldBodyOverflow = document.body.style.overflow;
  __oldBodyPosition = document.body.style.position;
  __oldBodyTop = document.body.style.top;
  __oldBodyLeft = document.body.style.left;
  __oldBodyRight = document.body.style.right;
  __oldBodyWidth = document.body.style.width;

  document.documentElement.style.overflow = "hidden";
  document.body.style.overflow = "hidden";
  // iOS Safari：用 fixed 才能真正擋住「點螢幕頂端捲到頁首」
  document.body.style.position = "fixed";
  document.body.style.top = `-${__savedScrollY}px`;
  document.body.style.left = "0";
  document.body.style.right = "0";
  document.body.style.width = "100%";
}

function unlockScroll() {
  if (__lockDepth <= 0) return;
  __lockDepth--;
  if (__lockDepth > 0) return;

  document.documentElement.style.overflow = __oldHtmlOverflow;
  document.body.style.overflow = __oldBodyOverflow;
  document.body.style.position = __oldBodyPosition;
  document.body.style.top = __oldBodyTop;
  document.body.style.left = __oldBodyLeft;
  document.body.style.right = __oldBodyRight;
  document.body.style.width = __oldBodyWidth;
  window.scrollTo(0, __savedScrollY);
}

// 鎖住 / 恢復背景捲動（交給 dialog 的 close 事件統一解鎖，避免 unlock 兩次）
$('#dlgClose')?.addEventListener('click', () => {
  dlg?.close();
});

// 防止使用者按 ESC 或點 backdrop 關掉時，背景卡死
dlg?.addEventListener('close', () => {
  // 如果是切到 Lightbox 才關掉 dialog：不要清 currentPetId、不要解鎖
  if (lb && lb.classList.contains("flex")) return;

  window.currentPetId = null;
  history.replaceState(null, '', location.pathname);
  unlockScroll();
});

function __isVideoUrl(url) {
  try {
    const s = String(url || "");
    // Firebase Storage 下載連結會把路徑放在 /o/<encodedPath>?...
    const path = s.includes("/o/")
      ? decodeURIComponent(s.split("/o/")[1].split("?")[0])
      : s;
    return /\.(mp4|mov|m4v|webm)$/i.test(path);
  } catch {
    return /\.(mp4|mov|m4v|webm)$/i.test(String(url || ""));
  }
}

function __videoThumbDataUrl() {
  // 簡單 SVG 縮圖（避免影片 URL 放進 <img> 直接壞圖）
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#111827"/>
        <stop offset="1" stop-color="#374151"/>
      </linearGradient>
    </defs>
    <rect width="240" height="240" rx="24" fill="url(#g)"/>
    <circle cx="120" cy="120" r="46" fill="rgba(255,255,255,0.12)"/>
    <path d="M110 96 L110 144 L148 120 Z" fill="rgba(255,255,255,0.9)"/>
    <text x="120" y="200" text-anchor="middle" font-size="18" fill="rgba(255,255,255,0.75)" font-family="system-ui, -apple-system, Segoe UI, Roboto">影片</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function __showMedia(url) {
  const isV = __isVideoUrl(url);

  if (lbImg) {
    lbImg.style.display = isV ? "none" : "";
    if (!isV) lbImg.src = url || '';
  }

  if (lbVideo) {
    if (isV) {
      lbVideo.style.display = "";
      if (lbVideo.src !== url) {
        try { lbVideo.pause(); } catch { }
        lbVideo.src = url || '';
        try { lbVideo.load(); } catch { }
      }
    } else {
      try { lbVideo.pause(); } catch { }
      lbVideo.removeAttribute("src");
      try { lbVideo.load(); } catch { }
      lbVideo.style.display = "none";
    }
  }
}

// 🔥 開啟 Lightbox：關掉 dialog + 維持背景鎖定
function openLightbox(images, index = 0) {
  lbImages = images || [];
  lbIndex = Math.max(0, Math.min(index, lbImages.length - 1));
  lbReturnToDialog = !!(dlg && dlg.open);

  __showMedia(lbImages[lbIndex] || '');

  // 建立縮圖列
  const lbThumbsInner = document.getElementById("lbThumbsInner");
  if (lbThumbsInner) {
    lbThumbsInner.innerHTML = "";
    lbImages.forEach((url, i) => {
      const t = document.createElement("img");
      t.src = __isVideoUrl(url) ? __videoThumbDataUrl() : url;
      t.className = i === lbIndex ? "active" : "";
      t.alt = __isVideoUrl(url) ? "video" : "image";
      t.addEventListener("click", () => {
        lbIndex = i;
        __showMedia(lbImages[lbIndex] || '');
        lbThumbsInner.querySelectorAll("img").forEach(el => el.classList.remove("active"));
        t.classList.add("active");
      });
      lbThumbsInner.appendChild(t);
    });
  }

  // 顯示 Lightbox（先顯示，讓 dlg.close() 的 close handler 知道是要切到 Lightbox）
  if (lb) {
    lb.classList.remove("hidden");
    lb.classList.add("flex");
  }

  // 關掉 Modal（移除 backdrop）
  if (dlg?.open) dlg.close();

  // 確保背景鎖住（不要 unlock，避免 iOS 點頂端時背景被捲）
  if (__lockDepth === 0) lockScroll();
}

// 🔥 關閉 Lightbox：回到 dialog 或直接解鎖
function closeLightbox() {
  if (lb) {
    lb.classList.add("hidden");
    lb.classList.remove("flex");
  }

  // 關掉影片播放與釋放 src（避免背景偷播/吃流量）
  if (lbVideo) {
    try { lbVideo.pause(); } catch { }
    lbVideo.removeAttribute("src");
    try { lbVideo.load(); } catch { }
  }

  if (lbReturnToDialog && dlg) {
    dlg.showModal();
    // dialog 也需要鎖背景（但避免重複 lock）
    if (__lockDepth === 0) lockScroll();
  } else {
    unlockScroll();
  }
}

// 🔥 左右切換
function lbShow(delta) {
  if (!lbImages.length) return;
  lbIndex = (lbIndex + delta + lbImages.length) % lbImages.length;
  __showMedia(lbImages[lbIndex] || '');
  const lbThumbsInner = document.getElementById("lbThumbsInner");
  if (lbThumbsInner) {
    lbThumbsInner.querySelectorAll("img").forEach((el, i) => {
      el.classList.toggle("active", i === lbIndex);
    });
  }
}

lbPrev?.addEventListener('click', (e) => {
  e.stopPropagation();
  lbShow(-1);
});

lbNext?.addEventListener('click', (e) => {
  e.stopPropagation();
  lbShow(1);
});

lbClose?.addEventListener('click', (e) => {
  e.stopPropagation();
  closeLightbox();
});

// 🔥 點黑幕關閉
lb?.addEventListener("click", (e) => {
  if (e.target === lb) closeLightbox();
});

// 🔥 ESC 關閉
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && lb && !lb.classList.contains("hidden")) {
    closeLightbox();
  }
});

// 🔥 手機滑動切換（加去抖，避免 iOS 偶發觸發兩次而跳 2 張）
let touchStartX = 0;
let __lastSwipeAt = 0;
lb?.addEventListener("touchstart", (e) => {
  touchStartX = e.touches[0].clientX;
}, { passive: true });

lb?.addEventListener("touchend", (e) => {
  const now = Date.now();
  if (now - __lastSwipeAt < 220) return;
  const diff = e.changedTouches[0].clientX - touchStartX;
  if (diff > 50) { __lastSwipeAt = now; lbShow(-1); }
  else if (diff < -50) { __lastSwipeAt = now; lbShow(1); }
}, { passive: true });

// 🔥 完全阻止背景滑動（桌機 + 手機都有效）
lb?.addEventListener("wheel", (e) => {
  e.preventDefault();
  e.stopPropagation();
}, { passive: false });

lb?.addEventListener("touchmove", (e) => {
  e.preventDefault();
  e.stopPropagation();
}, { passive: false });

const y = document.getElementById('year');
if (y) y.textContent = new Date().getFullYear();

// export to global (Modal.js 會用到)
window.openLightbox = openLightbox;
window.closeLightbox = closeLightbox;
window.lockScroll = lockScroll;
window.unlockScroll = unlockScroll;
