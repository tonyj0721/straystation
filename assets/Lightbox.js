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
let __dlgClosingForLightbox = false;
// 用來記住原本 scroll 狀態（支援巢狀 lock，避免 unlock 過頭）
// 注意：用「body position: fixed」才能在 iOS 也完全鎖住背景
let __scrollLockCount = 0;
let __scrollLockState = null;

function lockScroll() {
  __scrollLockCount += 1;
  if (__scrollLockCount > 1) return;

  const html = document.documentElement;
  const body = document.body;

  const scrollY = window.scrollY || html.scrollTop || body.scrollTop || 0;
  const scrollbarGap = Math.max(0, window.innerWidth - html.clientWidth);

  __scrollLockState = {
    scrollY,
    htmlOverflow: html.style.overflow,
    bodyOverflow: body.style.overflow,
    bodyPosition: body.style.position,
    bodyTop: body.style.top,
    bodyLeft: body.style.left,
    bodyRight: body.style.right,
    bodyWidth: body.style.width,
    bodyPaddingRight: body.style.paddingRight,
  };

  // 避免鎖住後版面左右跳動（捲軸消失的寬度補回去）
  if (scrollbarGap) {
    body.style.paddingRight = `${scrollbarGap}px`;
  }

  html.style.overflow = "hidden";
  body.style.overflow = "hidden";
  body.style.position = "fixed";
  body.style.top = `-${scrollY}px`;
  body.style.left = "0";
  body.style.right = "0";
  body.style.width = "100%";
}

function unlockScroll() {
  if (__scrollLockCount <= 0) {
    __scrollLockCount = 0;
    return;
  }

  __scrollLockCount -= 1;
  if (__scrollLockCount > 0) return;

  const html = document.documentElement;
  const body = document.body;
  const st = __scrollLockState;

  // 後援：萬一 state 不見了，也至少把 overflow 還回去
  if (!st) {
    html.style.overflow = "";
    body.style.overflow = "";
    body.style.position = "";
    body.style.top = "";
    body.style.left = "";
    body.style.right = "";
    body.style.width = "";
    body.style.paddingRight = "";
    return;
  }

  html.style.overflow = st.htmlOverflow || "";
  body.style.overflow = st.bodyOverflow || "";
  body.style.position = st.bodyPosition || "";
  body.style.top = st.bodyTop || "";
  body.style.left = st.bodyLeft || "";
  body.style.right = st.bodyRight || "";
  body.style.width = st.bodyWidth || "";
  body.style.paddingRight = st.bodyPaddingRight || "";

  __scrollLockState = null;
  window.scrollTo(0, st.scrollY || 0);
}
// 鎖住 / 恢復背景捲動
$('#dlgClose')?.addEventListener('click', () => {
  dlg.close();
  history.replaceState(null, '', location.pathname);
  window.currentPetId = null;
});

// 防止使用者按 ESC 或點 backdrop 關掉時，背景卡死
dlg.addEventListener('close', () => {
  // dialog 關閉：先把 dialog 那一層的 scroll lock 解掉
  unlockScroll();

  // 若是為了開啟 Lightbox 而關掉 dialog，就不要清 currentPetId / URL
  if (__dlgClosingForLightbox) return;

  // Lightbox 開著也不要清（保險）
  if (lb.classList.contains("flex")) return;

  window.currentPetId = null;
  history.replaceState(null, '', location.pathname);
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

  // ❶ 開啟 Lightbox：需要額外鎖一次（避免 dialog close 時把鎖全解掉）
  lockScroll();

  // ❷ 關掉 dialog（移除 backdrop）；close 事件會把 dialog 那一層 lock 解掉
  __dlgClosingForLightbox = true;
  if (dlg.open) dlg.close();
  requestAnimationFrame(() => { __dlgClosingForLightbox = false; });

  // ❸ 顯示 Lightbox
  lb.classList.remove("hidden");
  lb.classList.add("flex");
}

// 🔥 關閉 Lightbox：恢復背景 + 回到 dialog
function closeLightbox() {
  // 先把 dialog 那一層鎖回來（讓後面 unlock 只解掉 lightbox 那一層）
  lockScroll();

  // 隱藏 Lightbox
  lb.classList.add("hidden");
  lb.classList.remove("flex");

  // 回到 Dialog
  if (!dlg.open) dlg.showModal();

  // 解掉 lightbox 那一層鎖（留下 dialog 的鎖）
  unlockScroll();
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