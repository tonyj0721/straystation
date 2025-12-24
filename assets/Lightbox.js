const $ = (sel) => document.querySelector(sel);

history.scrollRestoration = "manual";
window.scrollTo(0, 0);

// ---- Modal + Lightbox 共用狀態 ----
const dlg = document.getElementById('petDialog');
const lb = document.getElementById("lightbox");
const lbImg = document.getElementById("lbImg");
const lbPrev = document.getElementById("lbPrev");
const lbNext = document.getElementById("lbNext");
const lbClose = document.getElementById("lbClose");

let lbImages = [];
let lbIndex = 0;
// 這個專案裡，背景捲動鎖定/解鎖的「單一真相」在 Modal.js：__lockDialogScroll / __unlockDialogScroll。
// Lightbox 只要呼叫它們，避免和 Modal.js 的 __pageScrollLock 互相覆寫導致「關閉後不能滑動」。
function lockScroll() {
  if (typeof window.__lockDialogScroll === "function") {
    window.__lockDialogScroll();
    return;
  }
  // fallback（若沒載入 Modal.js）
  document.documentElement.style.overflow = "hidden";
  document.body.style.overflow = "hidden";
}

function unlockScroll() {
  if (typeof window.__unlockDialogScroll === "function") {
    window.__unlockDialogScroll();
    return;
  }
  // fallback（若沒載入 Modal.js）
  document.documentElement.style.overflow = "";
  document.body.style.overflow = "";
}

// 鎖住 / 恢復背景捲動
$('#dlgClose').addEventListener('click', () => {
  dlg.close();
  // 由 dialog 的 close/cancel 事件統一解鎖（Modal.js 也有綁定），這裡多呼叫一次也安全
  unlockScroll();
  history.replaceState(null, '', location.pathname);
  window.currentPetId = null;
});

// 防止使用者按 ESC 或點 backdrop 關掉時，背景卡死
dlg.addEventListener('close', () => {
  // 若是因 Lightbox 開啟而關掉 dialog → 不要清除 currentPetId
  if (!lb.classList.contains("flex")) {
    window.currentPetId = null;
    history.replaceState(null, '', location.pathname);
  }
  // 保險：避免某些瀏覽器/情境 close 事件沒被 Modal.js 綁到
  unlockScroll();
});

// 🔥 開啟 Lightbox：完全關掉 dialog + 鎖定背景
function openLightbox(images, index = 0) {
  lbImages = images;
  lbIndex = index;

  lbImg.src = lbImages[lbIndex];

  // 建立縮圖列
  const lbThumbsInner = document.getElementById("lbThumbsInner");
  lbThumbsInner.innerHTML = "";

  lbImages.forEach((url, i) => {
    const t = document.createElement("img");
    t.src = url;
    t.className = i === lbIndex ? "active" : "";

    t.addEventListener("click", () => {
      lbIndex = i;
      lbImg.src = lbImages[lbIndex];
      lbThumbsInner.querySelectorAll("img").forEach(el => el.classList.remove("active"));
      t.classList.add("active");
    });

    lbThumbsInner.appendChild(t);
  });

  // ❶ 正確：關掉 Modal（移除 backdrop）
  if (dlg.open) dlg.close();

  // ❷ 正確：解除背景鎖定（避免 Lightbox 卡死）
  unlockScroll();

  // ❸ 顯示 Lightbox
  lb.classList.remove("hidden");
  lb.classList.add("flex");
}

// 🔥 關閉 Lightbox：恢復背景 + 回到 dialog
function closeLightbox() {
  // 隱藏 Lightbox
  lb.classList.add("hidden");
  lb.classList.remove("flex");

  // 回到 Modal
  lockScroll();
  dlg.showModal();
}

// 🔥 左右切換
function lbShow(delta) {
  if (!lbImages.length) return;
  lbIndex = (lbIndex + delta + lbImages.length) % lbImages.length;
  lbImg.src = lbImages[lbIndex];

  const lbThumbsInner = document.getElementById("lbThumbsInner");
  lbThumbsInner.querySelectorAll("img").forEach((el, i) => {
    el.classList.toggle("active", i === lbIndex);
  });
}

lbPrev.addEventListener('click', (e) => {
  e.stopPropagation();
  lbShow(-1);
});

lbNext.addEventListener('click', (e) => {
  e.stopPropagation();
  lbShow(1);
});

lbClose.addEventListener('click', (e) => {
  e.stopPropagation();
  closeLightbox();
});

// 🔥 點黑幕關閉
lb.addEventListener("click", (e) => {
  if (e.target === lb) closeLightbox();
});

// 🔥 ESC 關閉
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !lb.classList.contains("hidden")) {
    closeLightbox();
  }
});

// 🔥 手機滑動切換
let touchStartX = 0;
lb.addEventListener("touchstart", (e) => {
  touchStartX = e.touches[0].clientX;
}, { passive: true });

lb.addEventListener("touchend", (e) => {
  const diff = e.changedTouches[0].clientX - touchStartX;
  if (diff > 50) lbShow(-1);
  if (diff < -50) lbShow(1);
}, { passive: true });

// 🔥 完全阻止背景滑動（桌機 + 手機都有效）
lb.addEventListener("wheel", (e) => {
  e.preventDefault();
  e.stopPropagation();
}, { passive: false });

lb.addEventListener("touchmove", (e) => {
  e.preventDefault();
  e.stopPropagation();
}, { passive: false });

const y = document.getElementById('year');
if (y) y.textContent = new Date().getFullYear();