const $ = (sel) => document.querySelector(sel);

history.scrollRestoration = "manual";
window.scrollTo(0, 0);

// ---- Modal + Lightbox 共用狀態 ----
const dlg = document.getElementById("petDialog");
const lb = document.getElementById("lightbox");
const lbImg = document.getElementById("lbImg");
const lbPrev = document.getElementById("lbPrev");
const lbNext = document.getElementById("lbNext");
const lbClose = document.getElementById("lbClose");

let lbImages = [];
let lbIndex = 0;

// ===============================
// 背景捲動鎖（iOS/Android/桌機皆可；支援重複 lock/unlock，不會卡死）
// ===============================
(function initScrollLock() {
  if (window.__scrollLock) return;

  const html = document.documentElement;
  const body = document.body;
  let count = 0;
  let st = null;

  function lock() {
    count += 1;
    if (count > 1) return;

    const scrollY = window.scrollY || html.scrollTop || body.scrollTop || 0;
    const gap = Math.max(0, window.innerWidth - html.clientWidth);

    st = {
      scrollY,
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      bodyPos: body.style.position,
      bodyTop: body.style.top,
      bodyLeft: body.style.left,
      bodyRight: body.style.right,
      bodyWidth: body.style.width,
      bodyPaddingRight: body.style.paddingRight,
    };

    if (gap) body.style.paddingRight = `${gap}px`;
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";

    // iOS：用 fixed body 才能真正鎖住背景
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
  }

  function unlock() {
    if (count === 0) return;
    count -= 1;
    if (count > 0) return;
    if (!st) return;

    const y = st.scrollY || 0;
    html.style.overflow = st.htmlOverflow || "";
    body.style.overflow = st.bodyOverflow || "";
    body.style.position = st.bodyPos || "";
    body.style.top = st.bodyTop || "";
    body.style.left = st.bodyLeft || "";
    body.style.right = st.bodyRight || "";
    body.style.width = st.bodyWidth || "";
    body.style.paddingRight = st.bodyPaddingRight || "";

    st = null;
    window.scrollTo(0, y);
  }

  window.__scrollLock = { lock, unlock, get count() { return count; } };
})();

function lockScroll() {
  window.__scrollLock?.lock?.();
}
function unlockScroll() {
  window.__scrollLock?.unlock?.();
}

// ===============================
// Dialog 關閉 / 解鎖（由這裡統一處理，避免 Modal.js / 其他檔案重複解鎖造成卡死）
// ===============================
$("#dlgClose")?.addEventListener("click", () => {
  dlg?.close?.();
  history.replaceState(null, "", location.pathname);
  window.currentPetId = null;
});

dlg?.addEventListener("close", () => {
  // 若是因 Lightbox 開啟而關掉 dialog → 不要清除 currentPetId，也不要解鎖背景（Lightbox 仍在）
  const lightboxOpen = lb?.classList?.contains("flex");
  if (lightboxOpen) return;

  window.currentPetId = null;
  history.replaceState(null, "", location.pathname);
  unlockScroll();
});

// ESC / 取消時也保險解鎖（某些瀏覽器會走 cancel → close）
dlg?.addEventListener("cancel", () => {
  const lightboxOpen = lb?.classList?.contains("flex");
  if (!lightboxOpen) unlockScroll();
  // 不阻止預設，讓它照常關閉
});

// ===============================
// Lightbox
// ===============================
function renderLbThumbs() {
  const lbThumbsInner = document.getElementById("lbThumbsInner");
  if (!lbThumbsInner) return;

  lbThumbsInner.innerHTML = "";
  lbImages.forEach((url, i) => {
    const t = document.createElement("img");
    t.src = url;
    t.className = i === lbIndex ? "active" : "";

    t.addEventListener("click", () => {
      lbIndex = i;
      if (lbImg) lbImg.src = lbImages[lbIndex];
      lbThumbsInner.querySelectorAll("img").forEach((el) => el.classList.remove("active"));
      t.classList.add("active");
    });

    lbThumbsInner.appendChild(t);
  });
}

// 🔥 開啟 Lightbox：顯示 Lightbox（保留背景鎖定）
function openLightbox(images, index = 0) {
  if (!lb) return;

  lbImages = Array.isArray(images) ? images : [];
  lbIndex = Math.max(0, Math.min(index, lbImages.length - 1));

  if (lbImg) lbImg.src = lbImages[lbIndex] || "";
  renderLbThumbs();

  // ❶ 先顯示 Lightbox，讓 dialog 的 close handler 知道是要開 lightbox
  lb.classList.remove("hidden");
  lb.classList.add("flex");

  // ❷ 確保背景被鎖住（若本來就鎖住，就不要再加一次）
  if (!window.__scrollLock || window.__scrollLock.count === 0) lockScroll();

  // ❸ 關掉 dialog（移除 backdrop）
  if (dlg?.open) dlg.close();
}

// 🔥 關閉 Lightbox：回到 dialog（保持背景鎖定）
function closeLightbox() {
  if (!lb) return;

  lb.classList.add("hidden");
  lb.classList.remove("flex");

  if (dlg && !dlg.open) dlg.showModal();

  // 若不小心被解鎖，補鎖一次（避免背景可滑）
  if (!window.__scrollLock || window.__scrollLock.count === 0) lockScroll();
}

// 🔥 左右切換
function lbShow(delta) {
  if (!lbImages.length) return;
  lbIndex = (lbIndex + delta + lbImages.length) % lbImages.length;
  if (lbImg) lbImg.src = lbImages[lbIndex];

  const lbThumbsInner = document.getElementById("lbThumbsInner");
  lbThumbsInner?.querySelectorAll("img")?.forEach((el, i) => {
    el.classList.toggle("active", i === lbIndex);
  });
}

lbPrev?.addEventListener("click", (e) => {
  e.stopPropagation();
  lbShow(-1);
});

lbNext?.addEventListener("click", (e) => {
  e.stopPropagation();
  lbShow(1);
});

lbClose?.addEventListener("click", (e) => {
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

// 🔥 手機滑動切換
let touchStartX = 0;
lb?.addEventListener(
  "touchstart",
  (e) => {
    touchStartX = e.touches[0].clientX;
  },
  { passive: true }
);

lb?.addEventListener(
  "touchend",
  (e) => {
    const diff = e.changedTouches[0].clientX - touchStartX;
    if (diff > 50) lbShow(-1);
    if (diff < -50) lbShow(1);
  },
  { passive: true }
);

// 🔥 完全阻止背景滑動（桌機 + 手機都有效）
lb?.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    e.stopPropagation();
  },
  { passive: false }
);

lb?.addEventListener(
  "touchmove",
  (e) => {
    e.preventDefault();
    e.stopPropagation();
  },
  { passive: false }
);

// 給 Modal.js 呼叫用（維持原本 API）
window.openLightbox = openLightbox;
window.closeLightbox = closeLightbox;
window.lockScroll = lockScroll;
window.unlockScroll = unlockScroll;

const y = document.getElementById("year");
if (y) y.textContent = new Date().getFullYear();
