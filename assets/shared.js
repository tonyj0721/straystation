const $ = (sel) => document.querySelector(sel);

history.scrollRestoration = "manual";
window.scrollTo(0, 0);

// ---- Modal + Lightbox 共用狀態 ----
const dlg = document.getElementById('petDialog');
const lb = document.getElementById("lightbox");
const lbImg = document.getElementById("lbImg");
const lbPrev = document.getElementById("lbPrev");
const lbNext = document.getElementById("lbNext");

let lbImages = [];
let lbIndex = 0;
// 用來記住原本 scroll 狀態
let oldHtmlOverflow = "";
let oldBodyOverflow = "";

function lockScroll() {
  oldHtmlOverflow = document.documentElement.style.overflow;
  oldBodyOverflow = document.body.style.overflow;
  document.documentElement.style.overflow = "hidden";
  document.body.style.overflow = "hidden";
}

function unlockScroll() {
  document.documentElement.style.overflow = oldHtmlOverflow;
  document.body.style.overflow = oldBodyOverflow;
}

// 鎖住 / 恢復背景捲動
$('#dlgClose').addEventListener('click', () => {
  dlg.close();
  unlockScroll();
  history.replaceState(null, '', location.pathname);
  currentPetId = null;
});

// 防止使用者按 ESC 或點 backdrop 關掉時，背景卡死
dlg.addEventListener('close', () => {
  // 若是因 Lightbox 開啟而關掉 dialog → 不要清除 currentPetId
  if (!lb.classList.contains("flex")) {
    currentPetId = null;
    history.replaceState(null, '', location.pathname);
  }
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
  dlg.showModal();

  // Modal 需要背景固定 → 再鎖一次
  lockScroll();
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

// ======= Theme & Nav（原樣保留） =======
$('#navToggle').addEventListener('click', () => {
  const el = $('#mobileNav');
  el.classList.toggle('hidden');
});

// 點選連結後自動關閉
document.querySelectorAll('#mobileNav a').forEach(a => {
  a.addEventListener('click', () => {
    document.getElementById('mobileNav').classList.add('hidden');
  });
});

const y = document.getElementById('year');
if (y) y.textContent = new Date().getFullYear();