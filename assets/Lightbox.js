// assets/Lightbox.js
// 共用：Modal dialog + Lightbox
// 目標：
// 1) Lightbox 手機可左右滑切換
// 2) Lightbox / Modal 開啟時背景不會滑動（iOS/Android/桌機）
// 3) lockScroll/unlockScroll 支援巢狀呼叫（避免卡死或提前解鎖）

const $ = (sel) => document.querySelector(sel);

// ---- Modal + Lightbox 共用元素 ----
const dlg = document.getElementById("petDialog");
const dlgCloseBtn = document.getElementById("dlgClose");

const lb = document.getElementById("lightbox");
const lbWrap = document.getElementById("lbWrap");
const lbImg = document.getElementById("lbImg");
const lbPrev = document.getElementById("lbPrev");
const lbNext = document.getElementById("lbNext");
const lbClose = document.getElementById("lbClose");
const lbThumbsInner = document.getElementById("lbThumbsInner");

// ---- Lightbox 狀態 ----
let lbImages = [];
let lbIndex = 0;
let __returnToDialog = false;

// ==============================
// ✅ 背景捲動鎖定（巢狀 / iOS 友善）
// ==============================
const __scrollLock = {
  locks: new Set(),
  scrollY: 0,
  htmlOverflow: "",
  bodyOverflow: "",
  bodyPosition: "",
  bodyTop: "",
  bodyLeft: "",
  bodyRight: "",
  bodyWidth: "",
  __scrollHandlerInstalled: false,
  __fixingScroll: false,
};

// iOS Safari：點螢幕頂端會觸發「捲到頁首」
// 若 Lightbox 開著時讓 window 開始捲動，背景會在慣性捲動期間「短暫可滑」。
// 這個 guard 會在鎖定期間把 window 的 scrollY 強制保持在 0。
function __installScrollGuard() {
  if (__scrollLock.__scrollHandlerInstalled) return;
  __scrollLock.__scrollHandlerInstalled = true;

  window.addEventListener(
    "scroll",
    () => {
      if (__scrollLock.locks.size === 0) return;
      if (__scrollLock.__fixingScroll) return;
      // 鎖定期間固定保持在 0，避免 iOS status-bar tap 觸發 scroll-to-top 動畫。
      if (window.scrollY !== 0) {
        __scrollLock.__fixingScroll = true;
        window.scrollTo(0, 0);
        // 下一個 frame 再放開，避免遞迴
        requestAnimationFrame(() => {
          __scrollLock.__fixingScroll = false;
        });
      }
    },
    { passive: true }
  );
}

function __ensureWindowAtTopWhileLocked() {
  // 在 body fixed 後把 window 捲動歸零，讓「點頂端捲到頁首」不會有作用。
  try {
    if (window.scrollY !== 0) window.scrollTo(0, 0);
  } catch (_) {}
}

function lockScroll(key = "dialog") {
  if (__scrollLock.locks.has(key)) return;

  if (__scrollLock.locks.size === 0) {
    __scrollLock.scrollY = window.scrollY || window.pageYOffset || 0;

    __scrollLock.htmlOverflow = document.documentElement.style.overflow;
    __scrollLock.bodyOverflow = document.body.style.overflow;
    __scrollLock.bodyPosition = document.body.style.position;
    __scrollLock.bodyTop = document.body.style.top;
    __scrollLock.bodyLeft = document.body.style.left;
    __scrollLock.bodyRight = document.body.style.right;
    __scrollLock.bodyWidth = document.body.style.width;

    // iOS/Android 通用鎖定（body fixed）
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${__scrollLock.scrollY}px`;
    document.body.style.left = "0";
    document.body.style.right = "0";
    document.body.style.width = "100%";

    __installScrollGuard();
    // 重要：將 window 位置歸零，避免 iOS 的 status bar tap 造成 window 開始捲動
    // （body fixed + top 負值會保持視覺位置不變）
    __ensureWindowAtTopWhileLocked();
  }

  __scrollLock.locks.add(key);
}

function unlockScroll(key = "dialog") {
  if (!__scrollLock.locks.has(key)) return;
  __scrollLock.locks.delete(key);

  if (__scrollLock.locks.size === 0) {
    document.documentElement.style.overflow = __scrollLock.htmlOverflow;
    document.body.style.overflow = __scrollLock.bodyOverflow;
    document.body.style.position = __scrollLock.bodyPosition;
    document.body.style.top = __scrollLock.bodyTop;
    document.body.style.left = __scrollLock.bodyLeft;
    document.body.style.right = __scrollLock.bodyRight;
    document.body.style.width = __scrollLock.bodyWidth;

    // 先確保 window 在頂端（鎖定期間我們會維持在 0），再把真實捲動位置還原
    __ensureWindowAtTopWhileLocked();
    window.scrollTo(0, __scrollLock.scrollY);
  }
}

// 讓其他檔案可用（Modal.js 會呼叫）
window.lockScroll = lockScroll;
window.unlockScroll = unlockScroll;

// ==============================
// ✅ Dialog 關閉按鈕（集中在這裡）
// ==============================
dlgCloseBtn?.addEventListener("click", () => {
  if (dlg?.open) dlg.close();
});

// ==============================
// ✅ Dialog close：解鎖背景（但 Lightbox 開啟導致的關閉要略過）
// ==============================
let __closingDialogForLightbox = false;
function __isLightboxOpen() {
  return lb && !lb.classList.contains("hidden") && lb.classList.contains("flex");
}

dlg?.addEventListener("close", () => {
  if (__closingDialogForLightbox) return;

  // 若不是在開 Lightbox 過程被關掉，才清 currentPetId
  if (!__isLightboxOpen()) {
    window.currentPetId = null;
    try {
      history.replaceState(null, "", location.pathname);
    } catch (_) {}
  }

  unlockScroll("dialog");
});

dlg?.addEventListener("cancel", () => {
  // ESC 關閉 dialog
  unlockScroll("dialog");
});

// ==============================
// ✅ Lightbox 開 / 關
// ==============================
function renderLbThumbs() {
  if (!lbThumbsInner) return;
  lbThumbsInner.innerHTML = "";

  lbImages.forEach((url, i) => {
    const t = document.createElement("img");
    t.src = url;
    t.className = i === lbIndex ? "active" : "";
    t.style.webkitTouchCallout = "none";
    t.draggable = false;

    t.addEventListener("click", (ev) => {
      ev.stopPropagation();
      lbIndex = i;
      lbImg.src = lbImages[lbIndex];
      lbThumbsInner.querySelectorAll("img").forEach((el, j) => {
        el.classList.toggle("active", j === lbIndex);
      });
    });

    lbThumbsInner.appendChild(t);
  });
}

// 外部會呼叫（Modal.js）
window.openLightbox = function openLightbox(images, index = 0) {
  if (!lb || !lbImg) return;

  lbImages = Array.isArray(images) ? images.slice() : [];
  lbIndex = Math.max(0, Math.min(index, lbImages.length - 1));

  if (!lbImages.length) return;

  // Lightbox 自己也要鎖背景
  lockScroll("lightbox");

  // 關閉 dialog（移除其 backdrop），但不要解鎖背景
  __returnToDialog = !!dlg?.open;
  if (dlg?.open) {
    __closingDialogForLightbox = true;
    try {
      dlg.close();
    } finally {
      __closingDialogForLightbox = false;
    }
    // dialog 已經關了 → 把 dialog 的鎖拿掉（背景仍由 lightbox 鎖著）
    unlockScroll("dialog");
  }

  lbImg.src = lbImages[lbIndex];
  lbImg.draggable = false;
  lbImg.style.webkitUserDrag = "none";
  lbImg.style.webkitTouchCallout = "none";
  lbImg.style.touchAction = "none"; // 讓水平 swipe 不會被瀏覽器當成捲動

  renderLbThumbs();

  lb.classList.remove("hidden");
  lb.classList.add("flex");
};

function closeLightbox() {
  if (!lb) return;

  lb.classList.add("hidden");
  lb.classList.remove("flex");

  // 關 Lightbox → 解鎖 Lightbox 的鎖
  unlockScroll("lightbox");

  // 回到 dialog（只有原本是從 dialog 進來才回去）
  if (__returnToDialog && dlg && !dlg.open) {
    lockScroll("dialog");
    try {
      dlg.showModal();
      __returnToDialog = false;
    } catch (_) {
      // 若 dialog 不支援 showModal，忽略
    }
  }
}
window.closeLightbox = closeLightbox;

// ==============================
// ✅ 左右切換
// ==============================
function lbShow(delta) {
  if (!lbImages.length) return;
  lbIndex = (lbIndex + delta + lbImages.length) % lbImages.length;
  lbImg.src = lbImages[lbIndex];

  if (lbThumbsInner) {
    lbThumbsInner.querySelectorAll("img").forEach((el, i) => {
      el.classList.toggle("active", i === lbIndex);
    });
  }
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

// 點黑幕關閉
lb?.addEventListener("click", (e) => {
  if (e.target === lb) closeLightbox();
});

// ESC 關閉（只針對 Lightbox）
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && __isLightboxOpen()) closeLightbox();
  if (!__isLightboxOpen()) return;
  if (e.key === "ArrowLeft") lbShow(-1);
  if (e.key === "ArrowRight") lbShow(1);
});

// ==============================
// ✅ 手機左右滑（PointerEvents + Touch fallback）
// ==============================
const SWIPE_THRESHOLD = 55;
let __swStartX = 0;
let __swStartY = 0;
let __swPointerId = null;

function __isOnButton(target) {
  return !!target?.closest?.("button");
}

function __swipeEnd(clientX, clientY) {
  const dx = clientX - __swStartX;
  const dy = clientY - __swStartY;

  // 主要是水平才算 swipe
  if (Math.abs(dx) < SWIPE_THRESHOLD) return;
  if (Math.abs(dx) < Math.abs(dy)) return;

  if (dx > 0) lbShow(-1);
  else lbShow(1);
}

lbWrap?.addEventListener(
  "pointerdown",
  (e) => {
    if (!__isLightboxOpen()) return;
    if (__isOnButton(e.target)) return;

    __swPointerId = e.pointerId;
    __swStartX = e.clientX;
    __swStartY = e.clientY;

    try {
      lbWrap.setPointerCapture(e.pointerId);
    } catch (_) {}
  },
  { passive: true }
);

lbWrap?.addEventListener(
  "pointermove",
  (e) => {
    if (!__isLightboxOpen()) return;
    if (__swPointerId !== e.pointerId) return;

    const dx = e.clientX - __swStartX;
    const dy = e.clientY - __swStartY;

    // 水平移動時阻止瀏覽器處理（避免帶動頁面/彈性滑動）
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 8) {
      e.preventDefault();
    }
  },
  { passive: false }
);

lbWrap?.addEventListener(
  "pointerup",
  (e) => {
    if (!__isLightboxOpen()) return;
    if (__swPointerId !== e.pointerId) return;
    __swipeEnd(e.clientX, e.clientY);
    __swPointerId = null;
  },
  { passive: true }
);

lbWrap?.addEventListener(
  "pointercancel",
  () => {
    __swPointerId = null;
  },
  { passive: true }
);

// Touch fallback（較舊瀏覽器）
lbWrap?.addEventListener(
  "touchstart",
  (e) => {
    if (!__isLightboxOpen()) return;
    if (!e.touches?.length) return;
    __swStartX = e.touches[0].clientX;
    __swStartY = e.touches[0].clientY;
  },
  { passive: true }
);

lbWrap?.addEventListener(
  "touchend",
  (e) => {
    if (!__isLightboxOpen()) return;
    const t = e.changedTouches?.[0];
    if (!t) return;
    __swipeEnd(t.clientX, t.clientY);
  },
  { passive: true }
);

// 防止長按出現選單（不影響 swipe）
lbWrap?.addEventListener("contextmenu", (e) => e.preventDefault());

const y = document.getElementById("year");
if (y) y.textContent = new Date().getFullYear();
