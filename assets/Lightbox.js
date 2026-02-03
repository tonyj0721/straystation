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

// ---- Lightbox：自製影片控制列（仿 iPhone 相簿，不會自動隱藏） ----
const lbControls = document.getElementById("lbControls");
const lbPlayBtn = document.getElementById("lbPlay");
const lbSeek = document.getElementById("lbSeek");
const lbMuteBtn = document.getElementById("lbMute");

const __LB_PLAY_PNG = './images/icons/play.png';
const __LB_PAUSE_PNG = './images/icons/pause.png';
const __LB_VOL_PNG = './images/icons/volume.png';
const __LB_MUTE_PNG = './images/icons/mute.png';

// Create <img> icons once (use PNG instead of SVG)
const __lbPlayImg = document.createElement('img');
__lbPlayImg.className = 'lb-controls-icon';
__lbPlayImg.alt = '';
__lbPlayImg.decoding = 'async';
__lbPlayImg.loading = 'eager';
__lbPlayImg.draggable = false;

const __lbMuteImg = document.createElement('img');
__lbMuteImg.className = 'lb-controls-icon';
__lbMuteImg.alt = '';
__lbMuteImg.decoding = 'async';
__lbMuteImg.loading = 'eager';
__lbMuteImg.draggable = false;

// Ensure buttons contain the <img>
if (lbPlayBtn && !lbPlayBtn.querySelector('img')) lbPlayBtn.appendChild(__lbPlayImg);
if (lbMuteBtn && !lbMuteBtn.querySelector('img')) lbMuteBtn.appendChild(__lbMuteImg);


// ---- iPhone 相簿拖曳進度條：展開控制列 + 顯示時間、隱藏縮圖/關閉鍵 ----
let lbScrubTimes = document.getElementById('lbScrubTimes');
let lbTimeCur = document.getElementById('lbTimeCur');
let lbTimeDur = document.getElementById('lbTimeDur');

function __lbEnsureTimeLabels() {
  if (!lbControls) return;
  const bar = lbControls.querySelector('.lb-controls-bar');
  if (!bar) return;

  lbScrubTimes = document.getElementById('lbScrubTimes');
  lbTimeCur = document.getElementById('lbTimeCur');
  lbTimeDur = document.getElementById('lbTimeDur');

  if (lbScrubTimes && lbTimeCur && lbTimeDur) return;

  lbScrubTimes = document.createElement('div');
  lbScrubTimes.id = 'lbScrubTimes';
  lbScrubTimes.className = 'lb-scrub-times';
  lbTimeCur = document.createElement('span');
  lbTimeCur.id = 'lbTimeCur';
  lbTimeCur.textContent = '00:00.00';
  lbTimeDur = document.createElement('span');
  lbTimeDur.id = 'lbTimeDur';
  lbTimeDur.textContent = '00:00';
  lbScrubTimes.appendChild(lbTimeCur);
  lbScrubTimes.appendChild(lbTimeDur);

  // 放在 range 前面（拖曳時會顯示）
  const seekEl = document.getElementById('lbSeek');
  if (seekEl && seekEl.parentNode === bar) {
    bar.insertBefore(lbScrubTimes, seekEl);
  } else {
    bar.insertBefore(lbScrubTimes, bar.firstChild);
  }
}

function __lbPad2(n) { n = Math.floor(Math.max(0, n)); return (n < 10 ? '0' : '') + n; }

function __lbFmtTime(sec, withCentis) {
  const s = Math.max(0, Number(sec) || 0);
  const m = Math.floor(s / 60);
  const ss = s - (m * 60);
  if (!withCentis) {
    return `${__lbPad2(m)}:${__lbPad2(Math.floor(ss))}`;
  }
  const whole = Math.floor(ss);
  const centis = Math.floor((ss - whole) * 100 + 1e-9);
  return `${__lbPad2(m)}:${__lbPad2(whole)}.${__lbPad2(centis)}`;
}

function __lbUpdateTimeLabels(currentSec, durationSec, scrubbing) {
  __lbEnsureTimeLabels();
  if (!lbTimeCur || !lbTimeDur) return;
  lbTimeCur.textContent = __lbFmtTime(currentSec, !!scrubbing);
  lbTimeDur.textContent = __lbFmtTime(durationSec, false);
}

function __lbSetScrubUI(on) {
  if (!lb) return;
  lb.classList.toggle('lb-scrubbing', !!on);
}


let __lbScrubbing = false;
let __lbWasPlaying = false;

function __lbSetIcons() {
  if (!lbVideo || lbVideo.classList.contains("hidden")) return;
  if (lbPlayBtn) __lbPlayImg.src = (lbVideo.paused ? __LB_PLAY_PNG : __LB_PAUSE_PNG);
  const muted = !!lbVideo.muted || (Number(lbVideo.volume) === 0);
  if (lbMuteBtn) __lbMuteImg.src = (muted ? __LB_MUTE_PNG : __LB_VOL_PNG);
}

function __lbSyncSeek() {
  if (!lbVideo || lbVideo.classList.contains("hidden") || !lbSeek) return;
  const dur = Number(lbVideo.duration);
  const cur = Number(lbVideo.currentTime);
  if (!Number.isFinite(dur) || dur <= 0) {
    lbSeek.value = "0";
    try { lbSeek.style.setProperty("--lbSeekPct", "0%"); } catch (_) { }
    return;
}
  if (__lbScrubbing) return;
  const v = Math.max(0, Math.min(1000, Math.round((cur / dur) * 1000)));
  lbSeek.value = String(v);
  // 兩段色進度條（已播放 / 未播放）
  try { lbSeek.style.setProperty('--lbSeekPct', `${(v / 1000) * 100}%`); } catch (_) { }

}

function __lbSyncControls() {
  __lbSetIcons();
  __lbSyncSeek();
  // 同步時間（拖曳中顯示小數）
  if (lbVideo && !lbVideo.classList.contains("hidden")) {
    const dur = Number(lbVideo.duration);
    if (Number.isFinite(dur) && dur > 0) {
      const cur = Number(lbVideo.currentTime);
      __lbUpdateTimeLabels(cur, dur, __lbScrubbing);
    }
  }
}

function __lbTogglePlay() {
  if (!lbVideo || lbVideo.classList.contains("hidden")) return;
  if (lbVideo.paused) {
    try { lbVideo.play().catch(() => { }); } catch (_) { }
  } else {
    try { lbVideo.pause(); } catch (_) { }
  }
}

function __lbToggleMute() {
  if (!lbVideo || lbVideo.classList.contains("hidden")) return;
  const willMute = !(lbVideo.muted || Number(lbVideo.volume) === 0);
  lbVideo.muted = willMute;
  if (!willMute && Number(lbVideo.volume) === 0) lbVideo.volume = 1;
  __lbSetIcons();
}

function __lbSeekToRatio(r) {
  if (!lbVideo || lbVideo.classList.contains("hidden")) return;
  const dur = Number(lbVideo.duration);
  if (!Number.isFinite(dur) || dur <= 0) return;
  const t = Math.max(0, Math.min(dur, dur * r));
  try { lbVideo.currentTime = t; } catch (_) { }
}

function __lbScrubStart() {
  if (!lbVideo || lbVideo.classList.contains("hidden")) return;
  __lbEnsureTimeLabels();
  __lbScrubbing = true;
  __lbWasPlaying = !lbVideo.paused;
  try { lbVideo.pause(); } catch (_) { }
  // 進入拖曳模式：展開 UI、顯示時間、隱藏縮圖列/關閉鍵
  __lbSetScrubUI(true);

  const dur = Number(lbVideo.duration);
  const cur = Number(lbVideo.currentTime);
  if (Number.isFinite(dur) && dur > 0) {
    __lbUpdateTimeLabels(cur, dur, true);
  }
}


function __lbScrubEnd() {
  if (!lbVideo || lbVideo.classList.contains("hidden")) return;
  __lbScrubbing = false;

  // 離開拖曳模式：恢復 UI
  __lbSetScrubUI(false);

  if (__lbWasPlaying) {
    try { lbVideo.play().catch(() => { }); } catch (_) { }
  }
  __lbWasPlaying = false;

  // 結束時同步一次時間/圖示/進度
  try {
    const dur = Number(lbVideo.duration);
    const cur = Number(lbVideo.currentTime);
    if (Number.isFinite(dur) && dur > 0) __lbUpdateTimeLabels(cur, dur, false);
  } catch (_) { }
  __lbSyncControls();
}


// 綁定事件（只做一次）
lbPlayBtn?.addEventListener("click", (e) => { e.stopPropagation(); __lbTogglePlay(); });
lbMuteBtn?.addEventListener("click", (e) => { e.stopPropagation(); __lbToggleMute(); });

__lbEnsureTimeLabels();

lbSeek?.addEventListener("input", (e) => {
  const v = Number(e.target?.value || 0);
  // 先更新條的顏色（避免拖曳時延遲）
  try { lbSeek.style.setProperty("--lbSeekPct", `${(v / 1000) * 100}%`); } catch (_) { }
  __lbSeekToRatio(v / 1000);
  // 拖曳時顯示「目前時間」(含小數)
  if (__lbScrubbing && lbVideo && !lbVideo.classList.contains('hidden')) {
    const dur = Number(lbVideo.duration);
    if (Number.isFinite(dur) && dur > 0) {
      const t = (v / 1000) * dur;
      __lbUpdateTimeLabels(t, dur, true);
    }
  }
});

if ("PointerEvent" in window) {
  lbSeek?.addEventListener("pointerdown", __lbScrubStart);
  lbSeek?.addEventListener("pointerup", __lbScrubEnd);
  lbSeek?.addEventListener("pointercancel", __lbScrubEnd);
} else {
  lbSeek?.addEventListener("touchstart", __lbScrubStart, { passive: true });
  lbSeek?.addEventListener("touchend", __lbScrubEnd, { passive: true });
  lbSeek?.addEventListener("mousedown", __lbScrubStart);
  lbSeek?.addEventListener("mouseup", __lbScrubEnd);
}

lbVideo?.addEventListener("loadedmetadata", () => {
  __lbSyncControls();
  try {
    const dur = Number(lbVideo.duration);
    const cur = Number(lbVideo.currentTime);
    if (Number.isFinite(dur) && dur > 0) __lbUpdateTimeLabels(cur, dur, false);
  } catch (_) { }
});
lbVideo?.addEventListener("timeupdate", __lbSyncControls);
lbVideo?.addEventListener("play", __lbSyncControls);
lbVideo?.addEventListener("pause", __lbSyncControls);
lbVideo?.addEventListener("volumechange", __lbSyncControls);
lbVideo?.addEventListener("ended", __lbSyncControls);
lbVideo?.addEventListener("click", (e) => { e.stopPropagation(); __lbTogglePlay(); });

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
    if (lb) lb.classList.remove("lb-video-ui");
    return;
  }

  const url = lbImages[lbIndex] || "";
  const isVid = isVideoUrl(url);

  // 根據是否為影片切換 class
  if (lbWrap) {
    lbWrap.classList.toggle("lb-video-mode", !!isVid);   // ← 新增
  }
  if (lb) {
    lb.classList.toggle("lb-video-ui", !!isVid);
    if (!isVid) lb.classList.remove("lb-scrubbing");
  }

  if (lbImg && lbVideo) {
    if (isVid) {
      lbImg.classList.add("hidden");
      lbVideo.classList.remove("hidden");
      lbVideo.src = url;
      lbVideo.playsInline = true;
      lbVideo.controls = false;
      try { lbVideo.removeAttribute("controls"); } catch (_) { }
      lbVideo.setAttribute("playsinline", "");
      lbVideo.setAttribute("webkit-playsinline", "");
      lbVideo.disablePictureInPicture = true;
      __lbSyncControls();
      try { lbVideo.play().catch(() => { }); } catch (_) { }
    } else {
      try { lbVideo.pause && lbVideo.pause(); } catch (_) { }
      lbVideo.classList.add("hidden");
      if (lb) lb.classList.remove("lb-video-ui");
      lbImg.classList.remove("hidden");
      lbImg.src = url;
    }
  } else if (lbImg) {
    lbImg.src = url;
  }

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

  if (lb) {
    lb.classList.remove("lb-video-ui");
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
    // 影片時：控制列 + 縮圖列 這一段不要左右滑（留給拖曳進度／點縮圖）
    let cutoff = h * 0.8;
    try {
      const rCtrl = document.getElementById("lbControls")?.getBoundingClientRect();
      const rThumb = document.getElementById("lbThumbs")?.getBoundingClientRect();
      const topCtrl = (rCtrl && Number.isFinite(rCtrl.top)) ? rCtrl.top : cutoff;
      const topThumb = (rThumb && Number.isFinite(rThumb.top)) ? rThumb.top : cutoff;
      cutoff = Math.min(topCtrl, topThumb, cutoff);
    } catch (_) { }
    isSwipeZone = touchStartY < cutoff;
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