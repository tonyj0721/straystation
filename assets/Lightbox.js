const $ = (sel) => document.querySelector(sel);

history.scrollRestoration = "manual";
window.scrollTo(0, 0);

// ---- Modal + Lightbox 共用狀態 ----
const dlg = document.getElementById('petDialog');
const lb = document.getElementById("lightbox");
const lbImg = document.getElementById("lbImg");
const lbVideo = document.getElementById("lbVideo");
const lbWm = document.getElementById("lbWm");
const lbPrev = document.getElementById("lbPrev");
const lbNext = document.getElementById("lbNext");
const lbClose = document.getElementById("lbClose");

let lbMedia = [];
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

// 🔥 開啟 Lightbox：關掉 dialog + 維持背景鎖定
function openLightbox(items, index = 0) {
// 標準化：接受 string[] 或 {type,url}[]
lbMedia = (items || []).map(it => (typeof it === "string" ? { type: "image", url: it } : it));
lbIndex = Math.max(0, Math.min(index, lbMedia.length - 1));
lbReturnToDialog = !!(dlg && dlg.open);

function showCurrent() {
  const cur = lbMedia[lbIndex];
  const isVideo = cur && cur.type === "video";
  if (isVideo) {
    if (lbImg) { lbImg.classList.add("hidden"); lbImg.src = ""; }
    if (lbVideo) { lbVideo.classList.remove("hidden"); lbVideo.src = cur.url; }
    if (lbWm) lbWm.classList.remove("hidden");
  } else {
    if (lbVideo) { try { lbVideo.pause(); } catch {} lbVideo.classList.add("hidden"); lbVideo.src = ""; }
    if (lbImg) { lbImg.classList.remove("hidden"); lbImg.src = cur ? cur.url : ""; }
    if (lbWm) lbWm.classList.add("hidden");
  }
}

// 建立縮圖列
const lbThumbsInner = document.getElementById("lbThumbsInner");
if (lbThumbsInner) {
  lbThumbsInner.innerHTML = "";
  lbMedia.forEach((m, i) => {
    let t;
    if (m.type === "video") {
      t = document.createElement("div");
      t.textContent = "🎬";
      t.className = i === lbIndex ? "active" : "";
      t.style.width = "48px";
      t.style.height = "48px";
      t.style.display = "flex";
      t.style.alignItems = "center";
      t.style.justifyContent = "center";
      t.style.background = "rgba(255,255,255,0.08)";
      t.style.borderRadius = "8px";
      t.style.color = "#fff";
      t.style.fontSize = "20px";
    } else {
      t = document.createElement("img");
      t.src = m.url;
      t.className = i === lbIndex ? "active" : "";
    }
    t.addEventListener("click", () => {
      lbIndex = i;
      showCurrent();
      if (lbThumbsInner) {
        Array.from(lbThumbsInner.children).forEach((el, idx) => el.classList.toggle("active", idx === lbIndex));
      }
    });
    lbThumbsInner.appendChild(t);
  });
}

// 顯示 Lightbox（先顯示，讓 dlg.close() 的 close handler 知道是要切到 Lightbox）
if (lb) { try { lbVideo?.pause?.(); } catch {} if (lbVideo) lbVideo.src = "";
  lb.classList.remove("hidden");
  lb.classList.add("flex");
}

// 關掉 Modal（移除 backdrop）
if (dlg?.open) dlg.close();

// 初次顯示當前
showCurrent();


// 🔥 關閉 Lightbox：回到 dialog 或直接解鎖
function closeLightbox() {
  if (lb) { try { lbVideo?.pause?.(); } catch {} if (lbVideo) lbVideo.src = "";
    lb.classList.add("hidden");
    lb.classList.remove("flex");
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
  if (!lbMedia.length) return;
  lbIndex = (lbIndex + delta + lbMedia.length) % lbMedia.length;
  try { lbVideo?.pause?.(); } catch {}
  const cur = lbMedia[lbIndex];
  if (cur?.type === "video") {
    if (lbImg) { lbImg.classList.add("hidden"); lbImg.src = ""; }
    if (lbVideo) { lbVideo.classList.remove("hidden"); lbVideo.src = cur.url; }
    if (lbWm) lbWm.classList.remove("hidden");
  } else {
    if (lbVideo) { lbVideo.classList.add("hidden"); lbVideo.src = ""; }
    if (lbImg) { lbImg.classList.remove("hidden"); lbImg.src = cur ? cur.url : ""; }
    if (lbWm) lbWm.classList.add("hidden");
  }
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