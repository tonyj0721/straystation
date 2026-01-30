const $ = (sel) => document.querySelector(sel);

function isVideoUrl(url) {
  if (!url) return false;
  const u = String(url).split("?", 1)[0];
  return /\.(mp4|webm|ogg|mov|m4v)$/i.test(u);
}

function storagePathFromDownloadUrl(url) {
  try {
    const p = String(url).split("/o/")[1].split("?")[0];
    return decodeURIComponent(p);
  } catch (_) {
    return "";
  }
}

// Lightbox 縮圖播放 icon（避免與 Modal.js 的 __PLAY_SVG 命名衝突）
const __THUMB_PLAY_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"></path></svg>';

// 新增：播放 / 暫停圖示
const PLAY_ICON = `<svg class="w-12 h-12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
const PAUSE_ICON = `<svg class="w-12 h-12" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>`;

// 影片縮圖：抓第一幀（不走 canvas，避免 CORS）
function __primeThumbVideoFrameLightbox(v) {
  if (!v || v.dataset.__primed === "1") return;
  v.dataset.__primed = "1";

  const seekToThumbTime = () => {
    try {
      const dur = Number.isFinite(v.duration) ? v.duration : 0;
      let t = 0.05;
      if (dur && dur > 0.2) {
        t = Math.min(0.2, dur / 2);
        t = Math.max(0.05, Math.min(t, dur - 0.05));
      }
      v.currentTime = t;
    } catch (_) { }
  };

  const ensurePaint = () => {
    if (v.dataset.__painted === "1") return;
    v.dataset.__painted = "1";

    try {
      const p = v.play();
      if (p && typeof p.then === "function") {
        p.then(() => {
          if (typeof v.requestVideoFrameCallback === "function") {
            v.requestVideoFrameCallback(() => {
              try { v.pause(); } catch (_) { }
            });
          } else {
            setTimeout(() => {
              try { v.pause(); } catch (_) { }
            }, 60);
          }
        }).catch(() => {
          try { v.pause(); } catch (_) { }
        });
      }
    } catch (_) {
      try { v.pause(); } catch (_) { }
    }
  };

  v.addEventListener("loadedmetadata", () => {
    seekToThumbTime();
    ensurePaint();
  }, { once: true });

  v.addEventListener("seeked", () => {
    ensurePaint();
  }, { once: true });

  setTimeout(() => {
    try {
      if (v.readyState < 2) return;
      if (v.currentTime === 0) seekToThumbTime();
      ensurePaint();
    } catch (_) { }
  }, 200);
}

history.scrollRestoration = "manual";
window.scrollTo(0, 0);

// ---- Modal + Lightbox 共用狀態 ----
const dlg = document.getElementById('petDialog');
const lb = document.getElementById("lightbox");
const lbImg = document.getElementById("lbImg");
const lbVideo = document.getElementById("lbVideo");
const lbPrev = document.getElementById("lbPrev");
const lbNext = document.getElementById("lbNext");
const lbClose = document.getElementById("lbClose");
const lbWrap = document.getElementById("lbWrap");   // ← 新增

let lbImages = [];
let lbIndex = 0;
let lbReturnToDialog = false;

function renderLightboxMedia() {
  if (!lbImages.length) {
    if (lbImg) lbImg.src = "";
    if (lbVideo) {
      try { lbVideo.pause(); } catch (_) { }
      lbVideo.src = "";
      lbVideo.classList.add("hidden");
    }
    if (lbWrap) lbWrap.classList.remove("lb-video-mode");
    return;
  }

  const url = lbImages[lbIndex] || "";
  const isVid = isVideoUrl(url);

  if (lbWrap) {
    lbWrap.classList.toggle("lb-video-mode", !!isVid);
  }

  let controls = lbWrap.querySelector('.lb-custom-controls');

  if (isVid) {
    lbImg.classList.add("hidden");
    lbVideo.classList.remove("hidden");
    lbVideo.src = url;
    lbVideo.playsInline = true;
    lbVideo.controls = false;  // 移除原生控制列
    lbVideo.load();
    lbVideo.play().catch(() => { });

    // 建立自訂控制列（只建立一次）
    if (!controls) {
      controls = document.createElement("div");
      controls.className = "lb-custom-controls absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-6 flex items-center gap-6 text-white pointer-events-auto opacity-0 transition-opacity duration-300";

      // 播放按鈕
      const playBtn = document.createElement("button");
      playBtn.className = "focus:outline-none";
      playBtn.innerHTML = PLAY_ICON;
      controls.appendChild(playBtn);

      // 進度條容器
      const progressContainer = document.createElement("div");
      progressContainer.className = "flex-1 h-2 bg-white/30 rounded-full overflow-hidden cursor-pointer";
      const progressFilled = document.createElement("div");
      progressFilled.className = "h-full bg-white transition-all duration-100";
      progressFilled.style.width = "0%";
      progressContainer.appendChild(progressFilled);
      controls.appendChild(progressContainer);

      // 時間顯示
      const timeDisplay = document.createElement("span");
      timeDisplay.className = "text-lg font-medium tabular-nums";
      timeDisplay.textContent = "0:00 / 0:00";
      controls.appendChild(timeDisplay);

      lbWrap.appendChild(controls);

      // 事件綁定
      const togglePlay = () => {
        if (lbVideo.paused) lbVideo.play();
        else lbVideo.pause();
      };

      const updatePlayIcon = () => {
        playBtn.innerHTML = lbVideo.paused ? PLAY_ICON : PAUSE_ICON;
      };

      const updateProgress = () => {
        const percent = lbVideo.duration ? (lbVideo.currentTime / lbVideo.duration) * 100 : 0;
        progressFilled.style.width = percent + "%";
      };

      const formatTime = (sec) => {
        if (!isFinite(sec)) return "0:00";
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return `${m}:${s.toString().padStart(2, "0")}`;
      };

      const updateTime = () => {
        timeDisplay.textContent = `${formatTime(lbVideo.currentTime)} / ${formatTime(lbVideo.duration)}`;
      };

      playBtn.onclick = togglePlay;
      lbVideo.onclick = togglePlay;
      progressContainer.onclick = (e) => {
        const rect = progressContainer.getBoundingClientRect();
        const pos = (e.clientX - rect.left) / rect.width;
        lbVideo.currentTime = lbVideo.duration * Math.max(0, Math.min(1, pos));
      };

      lbVideo.addEventListener("play", updatePlayIcon);
      lbVideo.addEventListener("pause", updatePlayIcon);
      lbVideo.addEventListener("ended", updatePlayIcon);
      lbVideo.addEventListener("timeupdate", updateProgress);
      lbVideo.addEventListener("timeupdate", updateTime);
      lbVideo.addEventListener("loadedmetadata", updateTime);
      lbVideo.addEventListener("durationchange", updateTime);

      // 自動隱藏控制列
      let hideTimeout;
      const showControls = () => {
        controls.classList.remove("opacity-0");
        clearTimeout(hideTimeout);
        hideTimeout = setTimeout(() => controls.classList.add("opacity-0"), 3000);
      };
      lbWrap.addEventListener("mousemove", showControls);
      lbWrap.addEventListener("touchstart", showControls, { passive: true });
      lbVideo.addEventListener("click", showControls);

      // 初始顯示
      showControls();
      updatePlayIcon();
      updateTime();
      updateProgress();
    } else {
      // 已存在控制列，僅更新 src 並播放
      lbVideo.load();
      lbVideo.play().catch(() => { });
      controls.classList.remove("opacity-0");
    }
  } else {
    // 圖片模式
    try { lbVideo.pause(); } catch (_) { }
    lbVideo.src = "";
    lbVideo.classList.add("hidden");
    lbImg.classList.remove("hidden");
    lbImg.src = url;

    // 隱藏控制列
    if (controls) controls.classList.add("opacity-0");
  }

  // 更新縮圖 active 狀態
  const lbThumbsInner = document.getElementById("lbThumbsInner");
  if (lbThumbsInner) {
    Array.from(lbThumbsInner.children).forEach((el, i) => {
      el.classList.toggle("active", i === lbIndex);
    });
  }
}

function isCurrentLightboxVideo() {
  if (!lbImages.length) return false;
  const url = lbImages[lbIndex] || "";
  return isVideoUrl(url);
}

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
  const switchingToLB = !!(lb && lb.classList.contains("flex"));
  const v = document.getElementById("dlgVideo");

  // ✅ 切到 Lightbox：只暫停，不清 src（回來才不用點縮圖重設）
  if (switchingToLB) {
    try { v?.pause(); } catch (_) { }
    return;
  }

  // ✅ 真正關掉 dialog：才清 src / load，釋放資源
  if (v) {
    try { v.pause(); } catch (_) { }
    v.removeAttribute("src");
    try { v.load && v.load(); } catch (_) { }
  }

  window.currentPetId = null;
  window.currentPetThumbByPath = null;
  history.replaceState(null, '', location.pathname);
  unlockScroll();
});

// 🔥 開啟 Lightbox：關掉 dialog + 維持背景鎖定

function openLightbox(images, index = 0) {
  lbImages = images || [];
  lbIndex = Math.max(0, Math.min(index, lbImages.length - 1));
  lbReturnToDialog = !!(dlg && dlg.open);

  // 建立縮圖列
  const lbThumbsInner = document.getElementById("lbThumbsInner");
  if (lbThumbsInner) {
    lbThumbsInner.innerHTML = "";
    lbImages.forEach((url, i) => {
      const isVid = isVideoUrl(url);
      const wrapper = document.createElement("div");
      wrapper.className = "lb-thumb" + (i === lbIndex ? " active" : "");

      if (isVid) {
        const map = (window.currentPetThumbByPath || {});
        const videoPath = storagePathFromDownloadUrl(url);
        const videoThumb = (videoPath && map) ? (map[videoPath] || "") : "";

        if (videoThumb) {
          const img = document.createElement("img");
          img.src = videoThumb;
          wrapper.appendChild(img);
        } else {
          const v = document.createElement("video");
          v.className = "thumb-video";
          v.preload = "metadata";
          v.muted = true;
          v.playsInline = true;
          v.setAttribute("playsinline", "");
          v.setAttribute("webkit-playsinline", "");
          v.controls = false;
          v.disablePictureInPicture = true;
          v.src = url;
          __primeThumbVideoFrameLightbox(v);
          wrapper.appendChild(v);
        }

        const badge = document.createElement("div");
        badge.className = "video-badge";
        badge.innerHTML = `<div class="video-badge-inner">${__THUMB_PLAY_SVG}</div>`;
        wrapper.appendChild(badge);
      } else {
        const img = document.createElement("img");
        img.src = url;
        wrapper.appendChild(img);
      }

      wrapper.addEventListener("click", () => {
        lbIndex = i;
        renderLightboxMedia();
      });

      lbThumbsInner.appendChild(wrapper);
    });
  }

  // 一開始顯示當前項目
  renderLightboxMedia();

  // 顯示 Lightbox（先顯示，讓 dlg.close() 的 close handler 知道是要切到 Lightbox）
  if (lb) {
    lb.classList.remove("hidden");
    lb.classList.add("flex");
  }

  // 關掉 Modal（移除 backdrop）
  if (dlg?.open) dlg.close();

  // 鎖背景（避免底層頁面被捲動）
  lockScroll();
}
// 🔥 關閉 Lightbox：回到 dialog 或直接解鎖
function closeLightbox() {
  // 關閉前一定要把影片停掉
  if (lbVideo) {
    try { lbVideo.pause(); } catch (_) { }
    lbVideo.removeAttribute("src");
    try { lbVideo.load(); } catch (_) { }
  }
  const controls = lbWrap.querySelector('.lb-custom-controls');
  if (controls) controls.remove();

  if (lb) {
    lb.classList.add("hidden");
    lb.classList.remove("flex");
  }

  if (lbReturnToDialog && dlg) {
    dlg.showModal();
  }

  // Lightbox 自己佔用過一次 lockScroll，這裡對應解一次
  unlockScroll();
  lbReturnToDialog = false;
}

// 🔥 左右切換
function lbShow(delta) {
  if (!lbImages.length) return;
  lbIndex = (lbIndex + delta + lbImages.length) % lbImages.length;
  renderLightboxMedia();
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

// 🔥 手機滑動切換（上面 80% 可以左右滑，最下面 20% 給影片進度條用）
let touchStartX = 0;
let touchStartY = 0;     // 起手的 Y 位置
let isSwipeZone = true;  // 這次觸控是不是在「可以滑動」的區域
let __lastSwipeAt = 0;

lb?.addEventListener("touchstart", (e) => {
  const t = e.touches[0];
  touchStartX = t.clientX;
  touchStartY = t.clientY;

  const h = window.innerHeight || document.documentElement.clientHeight || 0;

  if (isCurrentLightboxVideo()) {
    // 影片時：上面 80% 可以左右滑，下面 20% 留給進度條
    isSwipeZone = touchStartY < h * 0.8;
  } else {
    // 圖片時：整個畫面都可以左右滑
    isSwipeZone = true;
  }
}, { passive: true });

lb?.addEventListener("touchend", (e) => {
  // 如果這次觸控是在「下面那一塊」，直接讓影片自己處理（拉進度條等）
  if (!isSwipeZone) return;

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
  // 在下面 20% 那一塊，就不要吃掉事件，讓影片進度條可以拖
  if (!isSwipeZone) return;

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