const $ = (sel) => document.querySelector(sel);

// ---- Modal + Lightbox 共用狀態 ----
const dlg = document.getElementById('petDialog');
const lb = document.getElementById("lightbox");
const lbImg = document.getElementById("lbImg");
const lbPrev = document.getElementById("lbPrev");
const lbNext = document.getElementById("lbNext");
const lbClose = document.getElementById("lbClose");

let lbImages = [];
let lbIndex = 0;

// ===============================
// 背景捲動鎖定（iOS/Android/桌機通用）
// - body fixed 方式：避免 iOS 仍會「穿透/回彈」滑動背景
// - idempotent：重複 lock/unlock 不會卡死
// ===============================
let __scrollLocked = false;
let __scrollY = 0;
let __savedScrollStyle = null;

function lockScroll() {
  if (__scrollLocked) return;
  __scrollLocked = true;

  __scrollY = window.scrollY || document.documentElement.scrollTop || 0;
  __savedScrollStyle = {
    htmlOverflow: document.documentElement.style.overflow,
    bodyOverflow: document.body.style.overflow,
    bodyPosition: document.body.style.position,
    bodyTop: document.body.style.top,
    bodyLeft: document.body.style.left,
    bodyRight: document.body.style.right,
    bodyWidth: document.body.style.width,
  };

  document.documentElement.style.overflow = "hidden";
  document.body.style.overflow = "hidden";

  document.body.style.position = "fixed";
  document.body.style.top = `-${__scrollY}px`;
  document.body.style.left = "0";
  document.body.style.right = "0";
  document.body.style.width = "100%";
}

function unlockScroll() {
  if (!__scrollLocked) return;
  __scrollLocked = false;

  if (__savedScrollStyle) {
    document.documentElement.style.overflow = __savedScrollStyle.htmlOverflow;
    document.body.style.overflow = __savedScrollStyle.bodyOverflow;
    document.body.style.position = __savedScrollStyle.bodyPosition;
    document.body.style.top = __savedScrollStyle.bodyTop;
    document.body.style.left = __savedScrollStyle.bodyLeft;
    document.body.style.right = __savedScrollStyle.bodyRight;
    document.body.style.width = __savedScrollStyle.bodyWidth;
  }
  __savedScrollStyle = null;

  // 回到鎖定前的位置
  window.scrollTo(0, __scrollY);
}

// ===============================
// Dialog 關閉（X / ESC / 點 backdrop）
// ===============================
$('#dlgClose')?.addEventListener('click', () => {
  try { dlg.close(); } catch {}
  unlockScroll();
  try { history.replaceState(null, '', location.pathname); } catch {}
  window.currentPetId = null;
});

// 防止使用者按 ESC 或點 backdrop 關掉時，背景卡死
dlg?.addEventListener('close', () => {
  // 若 Lightbox 正開著（我們是從 dialog 切到 lightbox），不要解鎖背景/清 state
  const lightboxOpen = lb && !lb.classList.contains("hidden") && lb.classList.contains("flex");
  if (lightboxOpen) return;

  window.currentPetId = null;
  try { history.replaceState(null, '', location.pathname); } catch {}
  unlockScroll();
});

// ===============================
// Lightbox 開關
// ===============================
function openLightbox(images, index = 0) {
  lbImages = images || [];
  lbIndex = Math.max(0, Math.min(index, lbImages.length - 1));
  if (!lbImages.length) return;

  lbImg.src = lbImages[lbIndex];

  // 建立縮圖列
  const lbThumbsInner = document.getElementById("lbThumbsInner");
  if (lbThumbsInner) lbThumbsInner.innerHTML = "";

  lbImages.forEach((url, i) => {
    const t = document.createElement("img");
    t.src = url;
    t.className = i === lbIndex ? "active" : "";

    t.addEventListener("click", () => {
      lbIndex = i;
      lbImg.src = lbImages[lbIndex];
      lbThumbsInner?.querySelectorAll("img")?.forEach(el => el.classList.remove("active"));
      t.classList.add("active");
    });

    lbThumbsInner?.appendChild(t);
  });

  // 確保背景鎖住
  lockScroll();

  // 先顯示 Lightbox（避免 dlg 的 close handler 誤判而 unlock）
  lb.classList.remove("hidden");
  lb.classList.add("flex");

  // 關掉 dialog（移除 backdrop）
  if (dlg?.open) dlg.close();
}

function closeLightbox() {
  // 隱藏 Lightbox
  lb.classList.add("hidden");
  lb.classList.remove("flex");

  // 回到 Modal（背景仍然鎖住）
  try { dlg.showModal(); } catch {}

  // Modal 顯示時也要鎖背景（如果剛好沒鎖到）
  lockScroll();
}

// 🔥 左右切換
function lbShow(delta) {
  if (!lbImages.length) return;
  lbIndex = (lbIndex + delta + lbImages.length) % lbImages.length;
  lbImg.src = lbImages[lbIndex];

  const lbThumbsInner = document.getElementById("lbThumbsInner");
  lbThumbsInner?.querySelectorAll("img")?.forEach((el, i) => {
    el.classList.toggle("active", i === lbIndex);
  });
}

lbPrev?.addEventListener('click', (e) => {
  e.stopPropagation();
  lbShow(-1);
});

lbNext?.addEventListener('click', (e) => {
  e.stopPropagation();
  lbShow(1);
});

lbClose?.addEventListener("click", (e) => {
  e.stopPropagation();
  closeLightbox();
});

// 點背景關閉
lb?.addEventListener("click", () => closeLightbox());

// 讓其他檔案可用
window.openLightbox = openLightbox;
window.closeLightbox = closeLightbox;
window.lbShow = lbShow;
