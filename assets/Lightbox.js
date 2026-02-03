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

// iPhone 相簿風格：自訂影片控制列（固定顯示，不自動隱藏）
const lbControls = document.getElementById("lbControls");
const lbCtlPlay = document.getElementById("lbCtlPlay");
const lbCtlSeek = document.getElementById("lbCtlSeek");
const lbCtlMute = document.getElementById("lbCtlMute");

const __LB_SVG_PLAY  = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"></path></svg>';
const __LB_SVG_PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h4v14H6zm8 0h4v14h-4z"></path></svg>';
const __LB_SVG_VOL   = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10v4h4l5 4V6L7 10H3z"></path></svg>';
const __LB_SVG_MUTE  = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10v4h4l5 4V6L7 10H3z"></path><path d="M16 9l5 5m0-5l-5 5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"></path></svg>';

/**
 * ✅ PNG 圖示支援（像 iPhone 相簿）
 * 你可以：
 * 1) 在 HTML button 上加 data-icon-play / data-icon-pause / data-icon-vol / data-icon-mute
 * 2) 或在全域設 window.LB_LIGHTBOX_ICONS = { play:'...', pause:'...', volume:'...', mute:'...' }
 *
 * 如果沒有提供 PNG，會自動回退到 SVG。
 */
let __lbIcons = null;

function __lbGetIcons() {
  if (__lbIcons) return __lbIcons;
  const g = (window && window.LB_LIGHTBOX_ICONS) ? window.LB_LIGHTBOX_ICONS : {};
  __lbIcons = {
    play:   (lbCtlPlay?.dataset?.iconPlay  || g.play   || "").trim(),
    pause:  (lbCtlPlay?.dataset?.iconPause || g.pause  || "").trim(),
    volume: (lbCtlMute?.dataset?.iconVol   || g.volume || "").trim(),
    mute:   (lbCtlMute?.dataset?.iconMute  || g.mute   || "").trim(),
  };
  return __lbIcons;
}

function __lbSetBtnIcon(btn, url, fallbackSvg) {
  if (!btn) return;
  if (url) {
    btn.innerHTML = `<img src="${url}" alt="" aria-hidden="true" draggable="false">`;
  } else {
    btn.innerHTML = fallbackSvg;
  }
}

// iPhone 相簿：拖曳進度時顯示時間（不顯示進度球）
let __lbControlsBar = null;
let __lbScrubRow = null;
let __lbScrubCur = null;
let __lbScrubDur = null;

// 這兩個高度要和 shared.css 的 --lbCtlH 對齊
const __LB_CTLH_IDLE = "44px";
const __LB_CTLH_SCRUB = "84px";

function __lbGetControlsBar() {
  if (__lbControlsBar) return __lbControlsBar;
  __lbControlsBar = lbControls?.querySelector?.(".lb-controls-bar") || null;
  return __lbControlsBar;
}

function __lbFormatTimeMMSS(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (hh > 0) return `${hh}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

// 短影片（<60s）拖曳時顯示到百分之一秒：00:04.30（像 iPhone 相簿）
function __lbFormatTimeScrub(sec, dur) {
  const d = Number(dur) || 0;
  const v = Math.max(0, Number(sec) || 0);

  // 長影片拖曳時不顯示小數，避免太長
  if (!(d > 0 && d < 60)) return __lbFormatTimeMMSS(v);

  const whole = Math.floor(v);
  const hund = Math.floor((v - whole) * 100 + 1e-6);
  const mm = Math.floor(whole / 60);
  const ss = whole % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}.${String(hund).padStart(2, "0")}`;
}

function __lbEnsureScrubRow() {
  if (__lbScrubRow) return __lbScrubRow;
  const bar = __lbGetControlsBar();
  if (!bar) return null;

  const row = document.createElement("div");
  row.className = "lb-scrub-times hidden";
  row.setAttribute("aria-hidden", "true");

  const left = document.createElement("span");
  left.className = "lb-scrub-cur";
  left.textContent = "00:00";

  const right = document.createElement("span");
  right.className = "lb-scrub-dur";
  right.textContent = "00:00";

  row.appendChild(left);
  row.appendChild(right);

  // 放在 bar 最前面：scrub 模式時會顯示
  bar.insertBefore(row, bar.firstChild);

  __lbScrubRow = row;
  __lbScrubCur = left;
  __lbScrubDur = right;
  return row;
}

function __lbUpdateScrubTimes() {
  if (!lbCtlSeek || !lbVideo) return;
  __lbEnsureScrubRow();
  const dur = Number.isFinite(lbVideo.duration) ? lbVideo.duration : 0;
  const cur = parseFloat(lbCtlSeek.value || "0");

  if (__lbScrubCur) __lbScrubCur.textContent = __lbFormatTimeScrub(cur, dur);
  if (__lbScrubDur) __lbScrubDur.textContent = __lbFormatTimeMMSS(dur);
}

function __lbEnterScrub() {
  const bar = __lbGetControlsBar();
  if (!bar) return;
  __lbEnsureScrubRow();
  bar.classList.add("is-scrubbing");
  __lbScrubRow?.classList.remove("hidden");
  // 讓控制列變高（像 iPhone 相簿），並同步保留舞台空間避免蓋到主內容
  try { lb?.style?.setProperty("--lbCtlH", __LB_CTLH_SCRUB); } catch (_) { }
  __lbUpdateScrubTimes();
}

function __lbExitScrub() {
  const bar = __lbGetControlsBar();
  if (!bar) return;
  bar.classList.remove("is-scrubbing");
  __lbScrubRow?.classList.add("hidden");
  try { lb?.style?.setProperty("--lbCtlH", __LB_CTLH_IDLE); } catch (_) { }
}

let __lbSeeking = false;

function __lbIsVideoMode() {
  return !!(lbVideo && !lbVideo.classList.contains("hidden") && lbVideo.src);
}

function __lbUpdateControls(force = false) {
  if (!lbControls) return;

  // 只在影片時顯示控制列
  if (!__lbIsVideoMode()) {
    lbControls.classList.add("hidden");
    __lbExitScrub();
    return;
  }
  lbControls.classList.remove("hidden");

  if (!lbVideo) return;

  // Play / Pause icon (支援 PNG)
  const icons = __lbGetIcons();
  if (lbCtlPlay) {
    if (icons.play && icons.pause) {
      __lbSetBtnIcon(lbCtlPlay, lbVideo.paused ? icons.play : icons.pause, lbVideo.paused ? __LB_SVG_PLAY : __LB_SVG_PAUSE);
    } else {
      lbCtlPlay.innerHTML = lbVideo.paused ? __LB_SVG_PLAY : __LB_SVG_PAUSE;
    }
  }

  // Volume / Mute icon (支援 PNG)
  if (lbCtlMute) {
    if (icons.volume && icons.mute) {
      __lbSetBtnIcon(lbCtlMute, lbVideo.muted ? icons.mute : icons.volume, lbVideo.muted ? __LB_SVG_MUTE : __LB_SVG_VOL);
    } else {
      lbCtlMute.innerHTML = lbVideo.muted ? __LB_SVG_MUTE : __LB_SVG_VOL;
    }
  }

  // Seek bar
  if (lbCtlSeek) {
    const dur = Number.isFinite(lbVideo.duration) ? lbVideo.duration : 0;
    if (dur > 0) lbCtlSeek.max = String(dur);
    if (!__lbSeeking || force) {
      const t = Number.isFinite(lbVideo.currentTime) ? lbVideo.currentTime : 0;
      lbCtlSeek.value = String(t);
    }

    // ✅ 已播放/未播放顏色分段（像 iPhone 相簿）
    // 透過 CSS 變數控制 track 的 linear-gradient
    try {
      const cur = parseFloat(lbCtlSeek.value || "0");
      const pct = (dur > 0 && Number.isFinite(cur)) ? (cur / dur) * 100 : 0;
      lbCtlSeek.style.setProperty("--lbSeekPct", `${Math.max(0, Math.min(100, pct)).toFixed(3)}%`);
    } catch (_) { }
  }

  // 拖拉時讓秒數泡泡跟著更新
  __lbUpdateScrubTimes();
}

function __lbInitControlsOnce() {
  if (!lbVideo || !lbControls) return;
  if (lbControls.dataset.__inited === "1") return;
  lbControls.dataset.__inited = "1";

  // 初始 icon（PNG 優先，否則 SVG）
  const icons = __lbGetIcons();
  if (lbCtlPlay) {
    __lbSetBtnIcon(lbCtlPlay, icons.play, __LB_SVG_PLAY);
  }
  if (lbCtlMute) {
    __lbSetBtnIcon(lbCtlMute, icons.volume, __LB_SVG_VOL);
  }

  // 建立秒數泡泡（預設隱藏）
  __lbEnsureScrubRow();
  __lbExitScrub();

  // 按鈕互動
  lbCtlPlay?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!lbVideo) return;
    if (lbVideo.paused) {
      try { lbVideo.play(); } catch (_) { }
    } else {
      try { lbVideo.pause(); } catch (_) { }
    }
    __lbUpdateControls(true);
  });

  lbCtlMute?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!lbVideo) return;
    lbVideo.muted = !lbVideo.muted;
    __lbUpdateControls(true);
  });

  const markSeekingOn = () => {
    __lbSeeking = true;
    // 像 iPhone 相簿：按住拖曳時顯示時間列（不顯示進度球）
    __lbEnterScrub();
    // ✅ 重要：直接關掉 swipe，避免外層 touchmove 的 preventDefault 破壞 range 拖曳
    try { isSwipeZone = false; } catch (_) { }
  };

  const markSeekingOff = () => {
    __lbSeeking = false;
    __lbExitScrub();
    // 不要在這裡立刻打開 swipe：否則事件冒泡到 lightbox touchend 時會被判定成滑動切換
    // 下一次觸控會由 lightbox 的 touchstart 重新判斷區域
  };

  lbCtlSeek?.addEventListener("pointerdown", markSeekingOn, { passive: true });
  lbCtlSeek?.addEventListener("pointerup", markSeekingOff, { passive: true });
  lbCtlSeek?.addEventListener("pointercancel", markSeekingOff, { passive: true });
  lbCtlSeek?.addEventListener("touchstart", markSeekingOn, { passive: true });
  lbCtlSeek?.addEventListener("touchend", markSeekingOff, { passive: true });
  lbCtlSeek?.addEventListener("touchcancel", markSeekingOff, { passive: true });
  lbCtlSeek?.addEventListener("change", markSeekingOff, { passive: true });

  lbCtlSeek?.addEventListener("input", (e) => {
    if (!lbVideo || !lbCtlSeek) return;
    const v = parseFloat(lbCtlSeek.value || "0");
    if (Number.isFinite(v)) {
      try { lbVideo.currentTime = v; } catch (_) { }
    }
    __lbUpdateControls(true);
  }, { passive: true });

  // 影片狀態更新
  const sync = () => __lbUpdateControls(false);
  lbVideo.addEventListener("loadedmetadata", sync);
  lbVideo.addEventListener("durationchange", sync);
  lbVideo.addEventListener("timeupdate", () => {
    if (__lbSeeking) return;
    __lbUpdateControls(false);
  });
  lbVideo.addEventListener("play", sync);
  lbVideo.addEventListener("pause", sync);
  lbVideo.addEventListener("ended", sync);
  lbVideo.addEventListener("volumechange", sync);
}


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
    if (lbWrap) lbWrap.classList.remove("lb-video-mode"); // ← 新增
    if (lbControls) lbControls.classList.add("hidden");
  __lbExitScrub();
    return;
  }

  const url = lbImages[lbIndex] || "";
  const isVid = isVideoUrl(url);

  // 根據是否為影片切換 class
  if (lbWrap) {
    lbWrap.classList.toggle("lb-video-mode", !!isVid);   // ← 新增
  }

  if (lbImg && lbVideo) {
    if (isVid) {
      lbImg.classList.add("hidden");
      lbVideo.classList.remove("hidden");
      lbVideo.src = url;
      lbVideo.playsInline = true;
      // ✅ 改用自訂控制列（不會播放到一半隱藏）
      lbVideo.controls = false;
      __lbInitControlsOnce();
      __lbUpdateControls(true);
      try { lbVideo.play().catch(() => { }); } catch (_) { }
    } else {
      try { lbVideo.pause && lbVideo.pause(); } catch (_) { }
      lbVideo.classList.add("hidden");
      __lbSeeking = false;
      __lbExitScrub();
      __lbUpdateControls(true);
      lbImg.classList.remove("hidden");
      lbImg.src = url;
    }
  } else if (lbImg) {
    lbImg.src = url;
  }

  __lbUpdateControls(false);

  const lbThumbsInner = document.getElementById("lbThumbsInner");
  if (lbThumbsInner) {
    Array.prototype.forEach.call(lbThumbsInner.children, (el, i) => {
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
    try { lbVideo.load && lbVideo.load(); } catch (_) { }
  }
  if (lbControls) lbControls.classList.add("hidden");
  __lbExitScrub();

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
    // 影片時：避免滑動干擾「控制列/縮圖列」操作（拖拉進度條、點縮圖）
    const inUi = !!(e.target && e.target.closest && e.target.closest("#lbControls, #lbThumbs"));
    if (inUi) {
      isSwipeZone = false;
    } else {
      // 其他區域仍可左右滑切換
      isSwipeZone = true;
    }
  } else {
    // 圖片時：整個畫面都可以左右滑
    isSwipeZone = true;
  }
}, { passive: true });

lb?.addEventListener("touchend", (e) => {
  // 結束點在控制列/縮圖列上：一律不要做左右滑切換（避免拖曳進度條放開時誤判）
  const inUiEnd = !!(e.target && e.target.closest && e.target.closest("#lbControls, #lbThumbs"));
  if (inUiEnd) return;


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
  // 在控制列/縮圖列上就不要吃掉事件，讓拖拉進度條/點縮圖順暢
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