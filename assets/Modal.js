const q = (sel) => document.querySelector(sel);

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

function thumbPathFromMediaPath(mediaPath) {
  try {
    const noExt = String(mediaPath).replace(/\.[^.]+$/i, "");
    return `thumbs/${noExt}.jpg`;
  } catch (_) {
    return "";
  }
}

// ===============================
// 影片縮圖：抓第一幀（不走 canvas，避免 CORS）
// ===============================
function __primeThumbVideoFrame(v) {
  if (!v || v.dataset.__primed === "1") return;
  v.dataset.__primed = "1";

  // 找一個適合當縮圖的時間點
  const seekToThumbTime = () => {
    try {
      const dur = Number.isFinite(v.duration) ? v.duration : 0;
      let t = 0.05;
      if (dur && dur > 0.2) {
        t = Math.min(0.2, dur / 2);
        t = Math.max(0.05, Math.min(t, dur - 0.05));
      }
      v.currentTime = t;
    } catch (_) { /* ignore */ }
  };

  // 真的跑一次「靜音播放 → 暫停」來逼 Safari 解碼畫面
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

  // 保險：metadata 很快就好了 / 我們太晚掛 listener 的情況
  setTimeout(() => {
    try {
      if (v.readyState < 2) return;
      if (v.currentTime === 0) seekToThumbTime();
      ensurePaint();
    } catch (_) { }
  }, 200);
}

function __lockDialogScroll() {
  try { if (typeof lockScroll === "function") lockScroll(); } catch { }
}

function __unlockDialogScroll() {
  try { if (typeof unlockScroll === "function") unlockScroll(); } catch { }
}

// ===============================
// 品種資料與「品種/毛色」連動邏輯
// ===============================
const BREEDS = {
  貓: {
    品種貓: [
      "美國短毛貓", "英國短毛貓", "藍貓", "暹羅貓", "波斯貓", "布偶貓", "緬因貓", "曼赤肯", "金漸層曼赤肯", "小步舞曲貓"
    ],
    米克斯: [
      "橘貓", "橘白貓", "黑貓", "賓士貓", "虎斑貓", "白底虎斑貓", "三花貓", "玳瑁貓", "白貓"
    ],
  },
  狗: {
    品種犬: [
      "博美", "貴賓", "梗犬", "吉娃娃", "臘腸犬", "馬爾濟斯", "柯基", "柴犬", "狐狸犬", "哈士奇", "高山犬", "黃金獵犬", "藍斑位元犬", "邊境牧羊犬"
    ],
    米克斯: [
      "黑色", "白色", "黑白色", "黃色", "黑黃色", "白黃色", "米色", "棕色", "黑棕色", "虎斑", "花花"
    ],
  },
};

// 產生帶浮水印的 Blob（細字、無外框、疏一點）
function __drawWatermarkPattern(g, W, H, text) {
  const ANG = -33 * Math.PI / 180;   // 斜角
  const FS = Math.round(Math.max(W, H) * 0.03);  // 字高 ≈ 長邊 3%
  const OP = 0.25;                                  // 透明度
  const STEP_X = Math.max(Math.round(FS * 12), 360); // 同斜線間距（倍數越大越疏）
  const STEP_Y = Math.max(Math.round(FS * 8), 260);  // 斜線與斜線間距

  const diag = Math.hypot(W, H);

  g.save();
  g.translate(W / 2, H / 2);
  g.rotate(ANG);
  g.font = `600 ${FS}px "Noto Sans TC","Microsoft JhengHei",sans-serif`;
  g.textBaseline = "middle";
  g.fillStyle = `rgba(255,255,255,${OP})`;

  for (let x = -diag; x <= diag; x += STEP_X) {
    for (let y = -diag; y <= diag; y += STEP_Y) {
      g.fillText(text, x, y);
    }
  }
  g.restore();
}

async function addWatermarkToFile(file, { text = "台中簡媽媽狗園" } = {}) {
  const type = (file && file.type) || "";
  if (type.startsWith("video/")) {
    return await addWatermarkToVideo(file, { text });
  }

  const url = URL.createObjectURL(file);
  try {
    // 讀圖 & 畫原圖
    const img = await new Promise((res, rej) => {
      const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = url;
    });
    const W = img.naturalWidth, H = img.naturalHeight;
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const g = c.getContext("2d");
    g.drawImage(img, 0, 0, W, H);

    __drawWatermarkPattern(g, W, H, text);

    const out = await new Promise(r => c.toBlob(r, "image/jpeg", 0.85));
    return new File([out], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" });
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function addWatermarkToVideo(file, { text = "台中簡媽媽狗園" } = {}) {
  const testCanvas = document.createElement("canvas");
  if (!testCanvas.captureStream || typeof MediaRecorder === "undefined") {
    throw new Error("目前瀏覽器不支援影片浮水印（缺少 MediaRecorder 或 captureStream）");
  }

  const src = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.src = src;
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = "anonymous";
    video.preload = "auto";

    await new Promise((res, rej) => {
      video.onloadedmetadata = () => res();
      video.onerror = (e) => rej(e || new Error("載入影片失敗"));
    });

    const W = video.videoWidth || 1280;
    const H = video.videoHeight || 720;

    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;

    // 盡量降低卡頓/掉幀（瀏覽器支援就吃到）
    const g = canvas.getContext("2d", { alpha: false, desynchronized: true });

    // ✅ 固定輸出 fps：關鍵
    const FPS = 30;
    const stream = canvas.captureStream(FPS);

    // 音軌：能加就加（不影響畫面穩定）
    try {
      if (video.captureStream) {
        const vStream = video.captureStream();
        vStream.getAudioTracks().forEach((track) => stream.addTrack(track));
      }
    } catch (_) { }

    // MediaRecorder：維持你原本的 webm vp9/vp8 選擇策略
    const chunks = [];
    const canUseVP9 = MediaRecorder.isTypeSupported("video/webm;codecs=vp9");
    const canUseVP8 = MediaRecorder.isTypeSupported("video/webm;codecs=vp8");
    const mime = canUseVP9 ? "video/webm;codecs=vp9" : (canUseVP8 ? "video/webm;codecs=vp8" : "video/webm");

    const recorder = new MediaRecorder(stream, { mimeType: mime });
    recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };
    const finished = new Promise((resolve) => { recorder.onstop = () => resolve(); });

    // 可選：給 timeslice 讓資料穩定吐出（避免某些環境最後才吐一大包）
    recorder.start(1000);

    // -----------------------------
    // ✅ 關鍵：把「畫圖節奏」鎖定在固定 FPS
    // -----------------------------
    let hasNewFrame = true;   // 先讓第一張一定會畫
    let drawing = false;

    function drawFrame() {
      // 你若想“即使沒新影格也畫”，就不要用 hasNewFrame gate
      // 但這裡採「有新影格才更新畫面，沒新影格就維持上一張」以降低不必要的重畫負擔
      if (!hasNewFrame) return;
      hasNewFrame = false;

      g.clearRect(0, 0, W, H);
      g.drawImage(video, 0, 0, W, H);
      __drawWatermarkPattern(g, W, H, text);
    }

    // RVFC：只負責告訴我們「有新影格可以拿」
    const useRVFC = typeof video.requestVideoFrameCallback === "function";
    let rvfcId = null;

    function startFrameNotifier() {
      if (!useRVFC) return;
      const cb = () => {
        if (video.paused || video.ended) return;
        hasNewFrame = true;
        rvfcId = video.requestVideoFrameCallback(cb);
      };
      rvfcId = video.requestVideoFrameCallback(cb);
    }

    // 固定節奏繪製：時間戳會跟著 captureStream(FPS) 穩定
    const intervalMs = Math.round(1000 / FPS);
    const timer = setInterval(() => {
      if (video.ended) return;
      if (video.paused) return;
      drawFrame();
    }, intervalMs);

    // 播放
    startFrameNotifier();
    await video.play();

    // 等播完
    await new Promise((res) => { video.onended = () => res(); });

    // 收尾：再畫最後一張（避免尾端缺幀）
    try {
      hasNewFrame = true;
      drawFrame();
    } catch (_) { }

    clearInterval(timer);
    try { if (useRVFC && rvfcId != null) { /* 沒有 cancel API，忽略即可 */ } } catch (_) { }

    recorder.stop();
    await finished;

    const blob = new Blob(chunks, { type: mime });
    const name = (file.name || "video").replace(/\.[^.]+$/, ".webm");
    return new File([blob], name, { type: mime });
  } finally {
    URL.revokeObjectURL(src);
  }
}

// ===============================
// 預覽縮圖：避免大圖解碼造成卡頓（支援手機）
// ===============================
const PREVIEW_EMPTY_GIF = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";
const PREVIEW_MAX = 720;       // 預覽縮圖長邊上限
const PREVIEW_QUALITY = 0.82;  // JPEG 品質（0~1）

// File → 縮圖 objectURL（避免每次重畫都重新解碼）
const __thumbUrlCache = new Map();
const __thumbPromiseCache = new Map();

// 同時跑 2 張縮圖（更快，但不會像全並發那麼容易卡）
const __THUMB_CONCURRENCY = 2;
let __thumbActive = 0;
const __thumbJobQueue = [];

function __runThumbQueue() {
  while (__thumbActive < __THUMB_CONCURRENCY && __thumbJobQueue.length) {
    const job = __thumbJobQueue.shift();
    __thumbActive++;

    __makePreviewThumbURL(job.file)
      .then(job.resolve, job.reject)
      .finally(() => {
        __thumbActive--;
        __runThumbQueue();
      });
  }
}

function revokePreviewThumb(file) {
  const u = __thumbUrlCache.get(file);
  if (u) {
    URL.revokeObjectURL(u);
    __thumbUrlCache.delete(file);
  }
  __thumbPromiseCache.delete(file);
}

async function __decodeToBitmap(file) {
  const type = (file && file.type) || "";
  const isVideo = type.startsWith("video/");
  const isImage = type.startsWith("image/");
  // 影片：抓一張影格當縮圖（iOS 需要用 loadedmetadata + seek / RVFC 才容易出現畫面）
  if (isVideo) {
    const vUrl = URL.createObjectURL(file);
    try {
      const v = document.createElement("video");
      v.preload = "metadata";
      v.src = vUrl;
      v.muted = true;
      v.playsInline = true;
      v.setAttribute("playsinline", "");
      v.setAttribute("webkit-playsinline", "");
      v.disablePictureInPicture = true;

      // iOS Safari 有時不會觸發 loadeddata（不播放就不解碼畫面），所以用 loadedmetadata + seek 逼出第一張影格
      await new Promise((res, rej) => {
        v.onloadedmetadata = () => res();
        v.onerror = (e) => rej(e || new Error("載入影片失敗"));
      });

      // 目標抓取時間：盡量靠前，但不要是 0（iOS 有時 seek 到 0 會拿不到 frame）
      let t = 0.05;
      try {
        if (Number.isFinite(v.duration) && v.duration > 0.2) {
          t = Math.min(0.2, v.duration / 2);
          t = Math.max(0.05, Math.min(t, v.duration - 0.05));
        }
      } catch (_) { /* ignore */ }

      // 先嘗試 seek
      try {
        v.currentTime = t;
        await new Promise((res) => {
          const done = () => { v.removeEventListener("seeked", done); res(); };
          v.addEventListener("seeked", done);
        });
      } catch (_) {
        // 有些檔案/瀏覽器不給 seek，就用 0.01 退回
        try {
          v.currentTime = 0.01;
          await new Promise((res) => {
            const done = () => { v.removeEventListener("seeked", done); res(); };
            v.addEventListener("seeked", done);
          });
        } catch (_) { /* ignore */ }
      }

      // 等待畫面真正解碼（RVFC 最可靠）
      if (typeof v.requestVideoFrameCallback === "function") {
        await new Promise((res) => v.requestVideoFrameCallback(() => res()));
      } else {
        // readyState >= 2 才有 current frame data
        if (v.readyState < 2) {
          await Promise.race([
            new Promise((res) => { v.onloadeddata = () => res(); }),
            new Promise((res) => setTimeout(res, 150))
          ]);
        }
        await new Promise((res) => setTimeout(res, 30));
      }

      // iOS 有時仍然黑畫面：試著「靜音播放一下再暫停」逼出 frame
      try {
        await v.play();
        v.pause();
      } catch (_) { /* ignore */ }

      const w = v.videoWidth || 640;
      const h = v.videoHeight || 360;
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const g = c.getContext("2d");
      g.drawImage(v, 0, 0, w, h);
      return c;
    } finally {
      URL.revokeObjectURL(vUrl);
    }
  }


  // 圖片：優先用 createImageBitmap（非阻塞解碼）
  if (window.createImageBitmap && isImage) {
    try { return await createImageBitmap(file); } catch (_) { /* fallback */ }
  }

  if (!isImage) {
    throw new Error("不支援的檔案類型");
  }

  // fallback：用 <img> 解碼（比較可能卡，但至少可用）
  const raw = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = rej;
      im.src = raw;
    });
    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const g = c.getContext("2d");
    g.drawImage(img, 0, 0);
    return await createImageBitmap(c);
  } finally {
    URL.revokeObjectURL(raw);
  }
}
async function __makePreviewThumbURL(file) {
  const bmp = await __decodeToBitmap(file);
  const W = bmp.width, H = bmp.height;
  const scale = Math.min(1, PREVIEW_MAX / Math.max(W, H));
  const w = Math.max(1, Math.round(W * scale));
  const h = Math.max(1, Math.round(H * scale));

  // 讓 UI 先喘口氣（避免「圖片顯示瞬間卡住」）
  await new Promise((r) => requestAnimationFrame(r));

  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d", { alpha: false, desynchronized: true });
  g.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();

  const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", PREVIEW_QUALITY));
  return URL.createObjectURL(blob);
}

function ensurePreviewThumbURL(file) {
  if (__thumbUrlCache.has(file)) return Promise.resolve(__thumbUrlCache.get(file));
  if (__thumbPromiseCache.has(file)) return __thumbPromiseCache.get(file);

  const p = new Promise((resolve, reject) => {
    __thumbJobQueue.push({ file, resolve, reject });
    __runThumbQueue();
  })
    .then((url) => {
      __thumbUrlCache.set(file, url);
      __thumbPromiseCache.delete(file);
      return url;
    })
    .catch((err) => {
      __thumbPromiseCache.delete(file);
      throw err;
    });

  __thumbPromiseCache.set(file, p);
  return p;
}

// ===============================
// 小工具：按鈕上的「…」跳動
// ===============================
function startDots(span, base) {
  let i = 0;
  span.textContent = base;
  const t = setInterval(() => {
    i = (i + 1) % 4;
    span.textContent = base + ".".repeat(i);
  }, 350);
  return () => clearInterval(t); // 回傳停止函式
}

// ===============================
// 小工具：百分比進度條（貓咪在上方）
//  - 會把同一排的其他按鈕暫時隱藏、兩格合併成一格
//  - update(pct): 0~100
// ===============================
function startProgressBar(btn, opts = {}) {
  const imgSrc = opts.imgSrc || "images/奔跑貓咪.png";
  const height = opts.height || 74;

  const original = {
    html: btn.innerHTML,
    text: btn.textContent,
    disabled: btn.disabled,
    ariaBusy: btn.getAttribute("aria-busy"),
    className: btn.className,
    style: btn.getAttribute("style"),
  };

  const wrap = btn.parentElement;
  const siblingStates = [];
  const wrapClass = wrap ? wrap.className : null;

  // 同排其他按鈕先藏起來，並把 grid-cols-2 改成 1 格
  if (wrap) {
    const kids = Array.from(wrap.children || []);
    kids.forEach((el) => {
      if (el === btn) return;
      siblingStates.push({ el, wasHidden: el.classList.contains("hidden") });
      el.classList.add("hidden");
    });
    if (wrap.classList.contains("grid") && wrap.classList.contains("grid-cols-2")) {
      wrap.classList.remove("grid-cols-2");
      wrap.classList.add("grid-cols-1");
    }
  }

  btn.disabled = true;
  btn.setAttribute("aria-busy", "true");
  btn.style.overflow = "visible";
  btn.style.paddingTop = "10px";
  btn.style.paddingBottom = "10px";

  // 建 UI
  const host = document.createElement("div");
  host.className = "w-full relative flex items-center justify-center";
  host.style.height = height + "px";

  const barWrap = document.createElement("div");
  barWrap.style.position = "absolute";
  barWrap.style.left = "14px";
  barWrap.style.right = "14px";
  barWrap.style.bottom = "26px";
  barWrap.style.height = "14px";
  barWrap.style.background = "rgba(255,255,255,0.22)";
  barWrap.style.borderRadius = "9999px";
  barWrap.style.overflow = "hidden";

  const fill = document.createElement("div");
  fill.style.height = "100%";
  fill.style.width = "0%";
  fill.style.borderRadius = "9999px";
  fill.style.background = "linear-gradient(90deg, #f59e0b 0%, #fcd34d 45%, #86efac 100%)";
  barWrap.appendChild(fill);

  const cat = document.createElement("img");
  cat.src = imgSrc;
  cat.alt = "";
  cat.decoding = "async";
  cat.style.position = "absolute";
  cat.style.bottom = "22px"; // 在進度條上方
  cat.style.left = "0%";
  cat.style.transform = "translateX(-50%)";
  cat.style.height = "68px";
  cat.style.pointerEvents = "none";

  const label = document.createElement("div");
  label.style.position = "absolute";
  label.style.left = "0";
  label.style.right = "0";
  label.style.bottom = "-4px";
  label.style.fontSize = "12px";
  label.style.fontWeight = "600";
  label.style.color = "#fff";
  label.style.textAlign = "center";
  label.textContent = "Loading...0%";

  host.appendChild(barWrap);
  host.appendChild(cat);
  host.appendChild(label);

  btn.innerHTML = "";
  btn.appendChild(host);

  function clampPct(p) {
    const n = Number(p);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(100, Math.round(n)));
  }

  function update(pct) {
    const p = clampPct(pct);
    fill.style.width = p + "%";
    cat.style.left = `calc(${p}% )`;
    label.textContent = `Loading...${p}%`;
  }

  function stop(arg = null) {
    // arg 可以是字串（直接當 finalText），或 { restore, text, keepDisabled }
    const opts = (arg && typeof arg === "object" && !Array.isArray(arg)) ? arg : { text: arg };
    const restore = (opts.restore !== false); // 預設 true
    const finalText = (typeof opts.text === "string") ? opts.text : null;
    const keepDisabled = (typeof opts.keepDisabled === "boolean") ? opts.keepDisabled : null;

    if (restore) {
      // 恢復同排按鈕與格數
      if (wrap && wrapClass != null) wrap.className = wrapClass;
      for (const s of siblingStates) {
        if (!s.el) continue;
        if (!s.wasHidden) s.el.classList.remove("hidden");
      }

      btn.innerHTML = original.html;
      btn.className = original.className;
      if (original.style == null) btn.removeAttribute("style");
      else btn.setAttribute("style", original.style);

      if (original.ariaBusy == null) btn.removeAttribute("aria-busy");
      else btn.setAttribute("aria-busy", original.ariaBusy);
    }

    // disabled 狀態：可指定 keepDisabled，不指定則回到原狀態
    btn.disabled = (keepDisabled == null) ? original.disabled : keepDisabled;

    if (finalText != null) btn.textContent = finalText;
  }

  return { update, stop };
}

// 用 nameLower / name 檢查是否重複；exceptId 表示忽略自己（編輯時用）
async function isNameTaken(name, exceptId = null) {
  const kw = (name || "").trim().toLowerCase();
  if (!kw) return false;

  // 1) 以 nameLower 精準查，取最多 2 筆，避免只有自己時誤判為無重複
  let snap = await getDocs(query(
    collection(db, "pets"),
    where("nameLower", "==", kw),
    fbLimit(2)
  ));
  if (!snap.empty && snap.docs.some((d) => d.id !== exceptId)) return true;

  // 2) 舊資料沒 nameLower，再用 name 精準查一次，同樣取 2 筆
  snap = await getDocs(query(
    collection(db, "pets"),
    where("name", "==", name),
    fbLimit(2)
  ));
  if (!snap.empty && snap.docs.some((d) => d.id !== exceptId)) return true;

  return false;
}

// ===============================
// 詳情 Dialog：開啟/渲染/編輯模式
// ===============================
let currentDocId = null;
let currentDoc = null;

// 開啟 + 渲染 + 編輯預填，全部合併在這一支
async function openDialog(id) {
  // 1. 先拿資料：先從 pets 找，沒有就去 Firestore 抓一次
  let p = pets.find((x) => x.id === id);
  if (!p) {
    try {
      const snap = await getDoc(doc(db, "pets", id));
      if (!snap.exists()) {
        await swalInDialog({ icon: "error", title: "找不到這筆資料" });
        return;
      }
      p = { id: snap.id, ...snap.data() };
    } catch (e) {
      await swalInDialog({ icon: "error", title: "讀取資料失敗", text: String(e) });
      return;
    }
  }

  // 2. 共用狀態 + URL
  currentDoc = p;
  currentDocId = p.id;
  window.currentPetId = p.id;
  window.currentPetThumbByPath = p.thumbByPath || {};
  history.replaceState(null, '', `?pet=${encodeURIComponent(p.id)}`);

  // 3. 健康標籤（第二排）
  const isNeutered = !!p.neutered;
  const isVaccinated = !!p.vaccinated;
  document.getElementById('dlgTagNeutered').textContent = isNeutered
    ? '已結紮' : '未結紮';

  document.getElementById('dlgTagVaccinated').textContent = isVaccinated
    ? '已注射預防針' : '未注射預防針';

  // 4. 圖片 + Lightbox（搭配 shared.js）

  const dlgImg = document.getElementById("dlgImg");
  const dlgVideo = document.getElementById("dlgVideo");
  const dlgBg = document.getElementById("dlgBg");
  const dlgThumbs = document.getElementById("dlgThumbs");
  const dlgHint = document.getElementById("dlgHint");
  const dlgStageWrap = document.getElementById("dlgStageWrap");

  const media = Array.isArray(p.images) && p.images.length > 0
    ? p.images
    : (p.image ? [p.image] : []);

  let currentIndex = 0;

  function showDialogMedia(index) {
    if (!media.length) {
      if (dlgImg) {
        dlgImg.src = "";
        dlgImg.classList.add("hidden");
      }

      if (dlgVideo) {
        try { dlgVideo.pause(); } catch (_) { }
        dlgVideo.src = "";
        dlgVideo.classList.add("hidden");
      }

      if (dlgThumbs) dlgThumbs.innerHTML = "";

      if (dlgHint) dlgHint.textContent = "";

      if (dlgStageWrap) dlgStageWrap.classList.remove("dlg-video-mode");

      return;
    }

    currentIndex = Math.max(0, Math.min(index, media.length - 1));
    const url = media[currentIndex];
    const isVid = isVideoUrl(url);

    if (dlgStageWrap) dlgStageWrap.classList.toggle("dlg-video-mode", isVid);

    if (dlgHint) {
      dlgHint.textContent = isVid
        ? "雙擊主圖可放大"
        : "點主圖可放大";

      // 影片：加 mt-2；圖片：移除 mt-2
      dlgHint.classList.toggle("mt-2", isVid);
      // （可選）確保圖片時沒有 mt-2 殘留
      if (!isVid) dlgHint.classList.remove("mt-2");
    }

    if (dlgImg && dlgVideo) {
      if (isVid) {
        dlgImg.classList.add("hidden");
        dlgVideo.classList.remove("hidden");
        dlgVideo.src = url;
        dlgVideo.playsInline = true;
        dlgVideo.controls = true;
        try { dlgVideo.play().catch(() => { }); } catch (_) { }
      } else {
        try {
          dlgVideo.pause && dlgVideo.pause();
        } catch (_) { }
        dlgVideo.classList.add("hidden");
        dlgImg.classList.remove("hidden");
        dlgImg.src = url;
      }
    } else if (dlgImg) {
      dlgImg.src = url;
    }

    if (dlgBg) {
      let bgSrc = "";

      if (!isVid) {
        // 主圖是照片：直接用當前這張照片做背景
        bgSrc = url;
      } else {
        // 主圖是影片：優先用「這支影片自己的縮圖」
        try {
          const videoPath = storagePathFromDownloadUrl(url);
          const thumbMap = (p.thumbByPath) || {};
          const videoThumb = videoPath ? (thumbMap[videoPath] || "") : "";

          if (videoThumb) {
            bgSrc = videoThumb;
          } else {
            // 沒有縮圖時，再退而求其次：用第一張照片當背景
            const firstImage = media.find(u => !isVideoUrl(u));
            bgSrc = firstImage || "";
          }
        } catch (_) {
          // 萬一解析 path 出錯，就跟上面一樣退回用第一張照片
          const firstImage = media.find(u => !isVideoUrl(u));
          bgSrc = firstImage || "";
        }
      }

      // 只有真的有圖才塞 src，避免誤把影片網址塞進 <img> 變成破圖
      dlgBg.src = bgSrc;
    }

    if (dlgThumbs) {
      dlgThumbs.querySelectorAll(".dlg-thumb").forEach((el, i) => {
        el.classList.toggle("active", i === currentIndex);
      });
    }
  }

  if (dlgImg) {
    dlgImg.onclick = () => openLightbox(media, currentIndex);
  }

  if (dlgVideo) {
    // 影片：改成「點兩下」主圖才進 Lightbox，單擊留給播放/暫停用
    let __dlgVideoLastTap = 0;
    dlgVideo.onclick = (ev) => {
      const now = Date.now();
      if (now - __dlgVideoLastTap < 320) {
        ev.preventDefault();
        ev.stopPropagation();
        openLightbox(media, currentIndex);
      }
      __dlgVideoLastTap = now;
    };
  }

  dlgThumbs.innerHTML = "";
  media.forEach((url, i) => {
    const isVid = isVideoUrl(url);
    const wrapper = document.createElement("div");
    wrapper.className = "dlg-thumb" + (i === 0 ? " active" : "");

    if (isVid) {
      const videoPath = storagePathFromDownloadUrl(url);
      const videoThumb = (p.thumbByPath && videoPath) ? (p.thumbByPath[videoPath] || "") : "";

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

        // 後端縮圖還沒產出時才 fallback 用影片抓第一幀
        __primeThumbVideoFrame(v);

        wrapper.appendChild(v);
      }

      // 覆蓋播放 icon（圖 4 的樣式）
      const badge = document.createElement("div");
      badge.className = "video-badge";
      badge.innerHTML = `<div class="video-badge-inner">${__PLAY_SVG}</div>`;
      wrapper.appendChild(badge);
    } else {
      const img = document.createElement("img");
      img.src = url;
      wrapper.appendChild(img);
    }

    wrapper.addEventListener("click", () => {
      showDialogMedia(i);
    });

    dlgThumbs.appendChild(wrapper);
  });

  showDialogMedia(currentIndex);

  // 5. 顯示用文字
  document.getElementById('dlgName').textContent = p.name;
  document.getElementById('dlgDesc').textContent = p.desc;
  document.getElementById('dlgTagBreed').textContent = p.breed;
  document.getElementById('dlgTagAge').textContent = p.age;
  document.getElementById('dlgTagGender').textContent = p.gender;

  // 6. 編輯區預填
  document.getElementById("editNeutered").checked = !!p.neutered;
  document.getElementById("editVaccinated").checked = !!p.vaccinated;
  document.getElementById("editName").value = p.name;
  document.getElementById("editAge").value = p.age;

  // ✅ 新增：預填後立刻跑一次「重複檢查」讓圖1也會直接顯示
  requestAnimationFrame(() => {
    document
      .getElementById("editName")
      ?.dispatchEvent(new Event("input", { bubbles: true }));
  });

  const gSel = document.getElementById("editGender");
  const g = String(p.gender || "").trim();
  gSel.value = (g === "男生" || g === "女生") ? g : "";  // 其他(含性別不詳)一律回到「請選擇」

  document.getElementById("editDesc").value = p.desc;

  setEditSpecies(p.species || '貓');
  syncEditBreedSelectors();

  if (p.breedType || p.breed) {
    let breedType = String(p.breedType || "").trim();
    let breedValue = String(p.breed || "").trim();

    // 把「品種不詳」視為沒選
    if (breedValue === "品種不詳") breedValue = "";

    // 舊資料：breedType 沒存，但 breed 是 "米克斯/xxx" 或 "米克斯"
    if (!breedType && /^米克斯(\/|$)/.test(breedValue)) {
      breedType = "米克斯";
    }

    // 米克斯：右側只放毛色，所以去掉前綴
    if (breedType === "米克斯") {
      breedValue = breedValue.replace(/^米克斯\/?/, "");
    }

    const btSel = document.getElementById("editBreedType");
    const bSel = document.getElementById("editBreed");

    if (!breedType) {
      // 沒選左邊：右邊保持 disabled +「請先選擇品種」
      btSel.value = "";
      resetEditBreedRight();       // 會塞入「請先選擇品種」並 disabled :contentReference[oaicite:8]{index=8}
      updateEditBreedLabel();
    } else {
      btSel.value = breedType;
      buildEditBreedOptions();     // 右邊會變成可選 + 第一個 option「請選擇」:contentReference[oaicite:9]{index=9}
      updateEditBreedLabel();

      // breedValue 不在選項裡就回到 placeholder，避免顯示空白
      const has = Array.from(bSel.options).some(o => o.value === breedValue);
      bSel.value = has ? breedValue : "";
    }
  }

  renderEditImages(media);

  // 7. 模式 / 按鈕 / 已送養相關
  setEditMode(false);      // 一開始都是「瀏覽模式」
  bindDialogActions();     // 綁定「編輯 / 刪除 / 已送養」等按鈕

  const isAdopted = p.status === "adopted";
  const btnAdopted = document.getElementById("btnAdopted");
  const btnUnadopt = document.getElementById("btnUnadopt");

  btnAdopted.classList.toggle("hidden", isAdopted);
  btnUnadopt.classList.toggle("hidden", !isAdopted);
  btnUnadopt.onclick = onUnadopt;

  document.getElementById("adoptedUpload").classList.add("hidden");

  // 8. 打開 Dialog（shared.js 裡的 dlg / lockScroll）
  if (!dlg.open) {
    __lockDialogScroll();
    dlg.showModal();
  }
}

function scrollDialogTop() {
  const dlg = document.getElementById("petDialog");
  requestAnimationFrame(() => {
    dlg?.scrollTo?.({ top: 0, behavior: "smooth" });
    if (dlg) dlg.scrollTop = 0; // 後援
  });
}

// 綁定 Dialog 內各種按鈕行為
function bindDialogActions() {
  const $ = (id) => document.getElementById(id);

  const btnDelete = $("btnDelete");
  if (btnDelete) btnDelete.onclick = onDelete;

  const btnEdit = $("btnEdit");
  if (btnEdit) btnEdit.onclick = () => setEditMode(true);

  const btnAdopted = $("btnAdopted");
  if (btnAdopted) btnAdopted.onclick = () => {
    // ✅ 按「已送養」時，把「編輯那排」(actionBar) 一起藏起來
    $("actionBar")?.classList.add("hidden");
    const up = $("adoptedUpload");
    up?.classList.remove("hidden");
    $("btnPickAdopted")?.focus();
    up?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  };

  const btnPickAdopted = $("btnPickAdopted");
  if (btnPickAdopted) btnPickAdopted.onclick = () => $("adoptedFiles")?.click();

  const btnConfirmAdopted = $("btnConfirmAdopted");
  if (btnConfirmAdopted) btnConfirmAdopted.onclick = onConfirmAdopted;

  const btnCancelAdopted = $("btnCancelAdopted");
  if (btnCancelAdopted) btnCancelAdopted.onclick = async (e) => {
    e.preventDefault();
    await openDialog(currentDocId);   // 一定要 await，等內容重畫完
    resetAdoptedSelection();
    scrollDialogTop();
  };

  const btnSave = $("btnSave");
  if (btnSave) btnSave.onclick = saveEdit;

  const btnCancel = $("btnCancel");
  if (btnCancel) btnCancel.onclick = async (e) => {
    // 取消編輯：回到瀏覽模式內容 + 回頂端
    e.preventDefault();
    await openDialog(currentDocId);   // 一定要 await，等內容重畫完
    resetAdoptedSelection();
    scrollDialogTop();
  };
}

// 刪除目前這筆
async function onDelete() {
  const wasOpen = dlg.open;
  if (wasOpen) dlg.close();

  const ok = await Swal.fire({
    icon: "warning",
    title: "確定刪除此筆動物資料？",
    showCancelButton: true,
    confirmButtonText: "確定",
    cancelButtonText: "取消",
  });
  if (!ok.isConfirmed) {
    if (wasOpen) { __lockDialogScroll(); dlg.showModal(); }
    return;
  }

  try {
    // 刪掉這筆的所有圖片與合照資料夾
    await deleteAllUnder(`pets/${currentDocId}`);
    await deleteAllUnder(`adopted/${currentDocId}`);
    await deleteAllUnder(`thumbs/pets/${currentDocId}`);
    // 最後刪 Firestore 文件
    await deleteDoc(doc(db, "pets", currentDocId));
    await loadPets();
    await Swal.fire({ icon: "success", title: "刪除成功", showConfirmButton: false, timer: 1500, });
  } catch (err) {
    await Swal.fire({ icon: "error", title: "刪除失敗", text: err.message });
    if (wasOpen) { __lockDialogScroll(); dlg.showModal(); }
  }
}

// 切換編輯模式
function setEditMode(on) {
  const isLogin = !!window.__isLogin;
  // 沒登入：不允許進入編輯模式
  if (!isLogin) on = false;

  document.getElementById("editArea").classList.toggle("hidden", !on);
  document.getElementById("actionBar").classList.toggle("hidden", on || !isLogin); // ← 關鍵
  document.getElementById("editActionBar").classList.toggle("hidden", !on || !isLogin);
  if (on) document.getElementById("adoptedUpload").classList.add("hidden");
}

// ===============================
// 編輯模式：更新資料與圖片同步（增/刪/保留）
// ===============================
async function saveEdit() {
  const btn = document.getElementById("btnSave");
  const dlg = document.getElementById("petDialog");

  // 蒐集欄位
  const name = (document.getElementById("editName").value || "").trim() || "未取名";

  const rawBreedType = document.getElementById("editBreedType").value || "";
  const rawBreed = document.getElementById("editBreed").value || "";
  let breed = "";
  if (!rawBreedType) {
    breed = "品種不詳";
  } else if (rawBreedType === "米克斯") {
    breed = rawBreed ? `米克斯/${rawBreed}` : "米克斯";
  } else {
    breed = rawBreed || "品種不詳";
  }

  const age = (document.getElementById("editAge").value || "").trim() || "年齡不詳";
  const gender = document.getElementById("editGender").value || "性別不詳";
  const desc = (document.getElementById("editDesc").value || "").trim() || "無備註";

  const newData = {
    species: getEditSpecies(),
    name,
    nameLower: name.toLowerCase(),
    breedType: rawBreedType,
    breed,
    age,
    gender,
    desc,
    neutered: document.getElementById("editNeutered").checked,
    vaccinated: document.getElementById("editVaccinated").checked,
  };

  // ① 送出前：名字重複 → 先詢問是否仍要更新（此時不要啟動「上傳中」）
  const newName = newData.name;
  if (newName && newName !== "未取名") {
    const taken = await isNameTaken(newName, currentDocId);
    if (taken) {
      const { isConfirmed } = await swalInDialog({
        icon: "warning",
        title: `「${newName}」已存在`,
        text: "確定繼續更新？",
        showCancelButton: true,
        confirmButtonText: "確定",
        cancelButtonText: "取消",
      });
      if (!isConfirmed) {
        // 使用者取消 → 直接結束，按鈕維持可按、文字維持「更新」
        return;
      }
    }
    // 同步小寫欄位，避免之後搜尋不到
    newData.nameLower = newName.toLowerCase();
  }

  // ② 確認後才開始「上傳中…」與鎖定按鈕
  btn.disabled = true;
  const prog = startProgressBar(btn, { imgSrc: "images/奔跑貓咪.png" });
  prog.update(0);

  try {
    // 依照「目前畫面順序」組出最終 images：url 直接保留；file 依序上傳後插回同位置
    const { items, removeUrls } = editImagesState;
    const newUrls = [];

    // 進度條：只計算本次要上傳的檔案（kind === 'file'）
    const __filesForProgress = (items || []).filter((it) => it && it.kind === "file" && it.file);
    const __progressTotalBytes = __filesForProgress.reduce((s, it) => s + (it.file?.size || 0), 0) || 1;
    let __progressUploadedBytes = 0;

    // 依序處理（保持順序）
    for (const it of items) {
      if (it.kind === "url") {
        newUrls.push(it.url);
        continue;
      }

      if (it.kind === "file") {
        const f = it.file;
        const wmBlob = await addWatermarkToFile(f);       // ← 新增：先加浮水印
        const type = wmBlob.type || '';
        let ext = 'bin';
        if (type.startsWith('image/')) {
          ext = type === 'image/png' ? 'png' : 'jpg';
        } else if (type.startsWith('video/')) {
          if (type.includes('webm')) ext = 'webm';
          else if (type.includes('ogg')) ext = 'ogg';
          else if (type.includes('mp4') || type.includes('mpeg')) ext = 'mp4';
          else ext = 'mp4';
        }
        const base = f.name.replace(/\.[^.]+$/, '');
        const path = `pets/${currentDocId}/${Date.now()}_${base}.${ext}`;
        const r = sRef(storage, path);
        await new Promise((resolve, reject) => {
          const task = uploadBytesResumable(r, wmBlob, { contentType: wmBlob.type || 'application/octet-stream' });
          task.on("state_changed",
            (snap) => {
              const base = __progressUploadedBytes || 0;
              const now = base + (snap?.bytesTransferred || 0);
              const pct = (__progressTotalBytes > 0) ? (now / __progressTotalBytes) * 100 : 0;
              prog.update(pct);
            },
            (err) => reject(err),
            async () => {
              try {
                // 完成一檔：累加已完成 bytes
                __progressUploadedBytes = (__progressUploadedBytes || 0) + (task.snapshot?.totalBytes || wmBlob?.size || 0);
                prog.update((__progressTotalBytes > 0) ? (__progressUploadedBytes / __progressTotalBytes) * 100 : 100);
                resolve();
              } catch (e) {
                reject(e);
              }
            }
          );
        });
        newUrls.push(await getDownloadURL(r));
      }
    }

    // 刪除被移除的舊圖（忽略刪失敗）
    // 同步刪掉後端產生的縮圖：thumbs/<原路徑去副檔名>.jpg
    // 並清理 Firestore 的 thumbByPath 對應 key（避免越積越多）
    const __thumbFieldDeletes = {};
    for (const url of (removeUrls || [])) {
      try {
        const enc = String(url).split("/o/")[1].split("?")[0];
        const mediaPath = decodeURIComponent(enc);

        // 1) 刪原檔
        await deleteObject(sRef(storage, mediaPath));

        // 2) 若是影片：刪縮圖 + 刪欄位 key
        if (isVideoUrl(url)) {
          const tPath = thumbPathFromMediaPath(mediaPath);
          if (tPath) {
            try { await deleteObject(sRef(storage, tPath)); } catch (_) { /* ignore */ }
          }
          __thumbFieldDeletes[`thumbByPath.${mediaPath}`] = deleteField();
        }
      } catch (e) {
        // 靜默忽略
      }
    }

    newData.images = newUrls;
    const __updatePayload = { ...newData, ...__thumbFieldDeletes };

    // ③ 寫回 Firestore
    await updateDoc(doc(db, "pets", currentDocId), __updatePayload);

    // ⑤ UI 收尾（無論彈窗狀態，成功提示一下）
    prog.update(100);
    prog.stop({ text: "處理中...", keepDisabled: true });
    btn.disabled = true;
    btn.textContent = "處理中...";

    const wasOpen = dlg.open;
    if (wasOpen) dlg.close();

    const reloadPromise = loadPets();

    await Swal.fire({
      icon: "success",
      title: "已更新",
      showConfirmButton: false,
      timer: 1500,
      returnFocus: false,
    });
    try {
      await reloadPromise;
    } catch (e) {
      console.error("loadPets error:", e);
    }

    currentDoc = { ...currentDoc, ...newData };

    if (wasOpen) { __lockDialogScroll(); dlg.showModal(); }
    setEditMode(false);
    await openDialog(currentDocId);

  } catch (err) {
    // 失敗也要確保 UI 復原
    await swalInDialog({
      icon: "error",
      title: "更新失敗",
      text: err.message
    });
  } finally {
    // 無論成功/失敗都把進度條收回，恢復按鈕與排版
    try { prog.stop({ restore: true, text: "更新", keepDisabled: false }); } catch (_) { }
    btn.disabled = false;
    btn.textContent = "更新";
  }
}

function getEditSpecies() {
  return document.querySelector('input[name="editSpecies"]:checked')?.value || '貓';
}

function setEditSpecies(v) {
  const t = v === '狗' ? '狗' : '貓';
  const el = document.querySelector(`input[name="editSpecies"][value="${t}"]`);
  if (el) el.checked = true;
}

// ===============================
// 編輯模式：品種連動（右側）
// ===============================
const editBreedTypeSel = q("#editBreedType");
const editBreedSel = q("#editBreed");
const editBreedLabel = q("#editBreedLabel");

function updateEditBreedLabel() {
  const t = editBreedTypeSel.value;
  editBreedLabel.textContent = !t ? "品種/毛色" : t === "米克斯" ? "毛色" : "品種";
}

function resetEditBreedRight() {
  editBreedSel.disabled = true;
  editBreedSel.innerHTML = '<option value="">請先選擇品種</option>';
}

function syncEditBreedSelectors() {
  const isCat = getEditSpecies() === '貓';
  editBreedTypeSel.innerHTML = isCat
    ? '<option value="">請選擇</option><option value="品種貓">品種貓</option><option value="米克斯">米克斯</option>'
    : '<option value="">請選擇</option><option value="品種犬">品種犬</option><option value="米克斯">米克斯</option>';
  resetEditBreedRight();
  updateEditBreedLabel();
}

function buildEditBreedOptions() {
  const list = (BREEDS[getEditSpecies()] || {})[editBreedTypeSel.value] || [];
  if (!editBreedTypeSel.value) { resetEditBreedRight(); return; }
  editBreedSel.disabled = false;
  editBreedSel.innerHTML = ['<option value="">請選擇</option>']
    .concat(list.map(b => `<option value="${b}">${b}</option>`)).join('');
}

document.querySelectorAll('input[name="editSpecies"]').forEach(el => {
  el.addEventListener('change', syncEditBreedSelectors);
});

editBreedTypeSel.addEventListener("change", () => {
  buildEditBreedOptions();
  updateEditBreedLabel();
});

// ===============================
// 編輯模式：圖片管理（預覽 + 增刪）- 不卡頓版（縮圖/手機拖曳排序）
// ===============================
const editFiles = q("#editFiles");
const btnPickEdit = q("#btnPickEdit");
const editPreview = q("#editPreview");
if (editPreview) {
  editPreview.style.touchAction = "none";
  editPreview.addEventListener("contextmenu", (e) => e.preventDefault());
}
const editCount = q("#editCount");

const MAX_EDIT_FILES = 5;

// 影片按鈕 icon（play / pause）
const __PLAY_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"></path></svg>';
const __PAUSE_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h4v14H6zM14 5h4v14h-4z"></path></svg>';

async function __safePlayVideo(v) {
  try {
    await v.play();
    return;
  } catch (_) { }
  // iOS / 部分瀏覽器可能需要先靜音才允許播放（至少先讓預覽能播）
  try {
    v.muted = true;
    await v.play();
  } catch (e) {
    console.warn('video play failed:', e);
  }
}

// File(video) → objectURL（給 <video> 播放用；刪除/關閉編輯時釋放）
const __editVideoObjUrlCache = new Map();
function getEditVideoObjURL(file) {
  if (__editVideoObjUrlCache.has(file)) return __editVideoObjUrlCache.get(file);
  const u = URL.createObjectURL(file);
  __editVideoObjUrlCache.set(file, u);
  return u;
}
function revokeEditVideoObjURL(file) {
  const u = __editVideoObjUrlCache.get(file);
  if (u) {
    try { URL.revokeObjectURL(u); } catch (_) { }
    __editVideoObjUrlCache.delete(file);
  }
}

// 狀態：依「目前畫面順序」維護（url=舊圖、file=新圖）
let editImagesState = { items: [], removeUrls: [] };

btnPickEdit?.addEventListener("click", () => editFiles?.click());

// 初始化編輯圖片列表（把舊的檔案縮圖快取清掉，避免記憶體累積）
function renderEditImages(urls) {
  for (const it of editImagesState.items) {
    if (it?.kind === "file" && it.file) {
      revokePreviewThumb(it.file);
      revokeEditVideoObjURL(it.file);
    }
  }
  editImagesState.items = (urls || []).map((u) => ({ kind: "url", url: u }));
  editImagesState.removeUrls = [];
  paintEditPreview();
}

// 依狀態重新畫縮圖
const __editTileMap = new Map(); // key -> tile element（保留 DOM，避免換順序閃爍）

function __editKey(it) {
  return it.kind === "url" ? `url:${it.url}` : it.file;
}

function __makeEditTile(it) {
  const wrap = document.createElement("div");
  wrap.className = "relative select-none overflow-hidden";
  wrap.style.touchAction = "none";
  wrap.style.setProperty("-webkit-touch-callout", "none");
  wrap.style.userSelect = "none";
  wrap.addEventListener("contextmenu", (e) => e.preventDefault());

  const isVid = it.kind === "url"
    ? isVideoUrl(it.url)
    : (((it.file && it.file.type) || "").startsWith("video/"));

  let mediaEl = null;
  let playBtn = null;

  if (isVid) {
    const v = document.createElement("video");
    v.className = "w-full aspect-square object-cover rounded-lg bg-gray-100 video-preview";
    v.preload = "metadata";
    v.playsInline = true;
    v.setAttribute("playsinline", "");
    v.setAttribute("webkit-playsinline", "");
    v.controls = false;
    v.disablePictureInPicture = true;

    if (it.kind === "url") {
      v.src = it.url;

      // 先嘗試用後端產出的縮圖（thumbByPath）
      try {
        const path = storagePathFromDownloadUrl(it.url);
        const thumbMap = window.currentPetThumbByPath || {};
        const thumbUrl = path && thumbMap[path];
        if (thumbUrl) {
          v.poster = thumbUrl;
        } else {
          // 沒有縮圖就用影片本身抓第一幀，避免黑畫面
          __primeThumbVideoFrame(v);
        }
      } catch (_) {
        __primeThumbVideoFrame(v);
      }
    } else {
      v.src = getEditVideoObjURL(it.file);

      // 先抓一幀，確保一開始就有畫面
      __primeThumbVideoFrame(v);

      // 若能產出高品質縮圖就覆蓋上去
      ensurePreviewThumbURL(it.file)
        .then((u) => { v.poster = u; })
        .catch(() => { /* 失敗就維持第一幀 */ });
    }

    const overlay = document.createElement("div");
    overlay.className = "media-play-overlay";

    playBtn = document.createElement("button");
    playBtn.type = "button";
    playBtn.className = "media-play-btn";
    playBtn.innerHTML = __PLAY_SVG;
    playBtn.setAttribute("aria-label", "播放影片");

    const syncBtn = () => {
      const playing = !v.paused && !v.ended;
      playBtn.innerHTML = playing ? __PAUSE_SVG : __PLAY_SVG;
      playBtn.setAttribute("aria-label", playing ? "暫停影片" : "播放影片");
    };

    v.addEventListener("play", syncBtn);
    v.addEventListener("pause", syncBtn);
    v.addEventListener("ended", () => {
      try { v.currentTime = 0; } catch (_) { }
      syncBtn();
    });

    playBtn.addEventListener("click", async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();

      // 同時只播一支（避免多支一起播）
      try {
        editPreview?.querySelectorAll?.("video.video-preview")?.forEach((vv) => {
          if (vv !== v) {
            try { vv.pause(); } catch (_) { }
          }
        });
      } catch (_) { }

      if (v.paused || v.ended) {
        await __safePlayVideo(v);
      } else {
        try { v.pause(); } catch (_) { }
      }
      syncBtn();
    });

    overlay.appendChild(playBtn);

    wrap.appendChild(v);
    wrap.appendChild(overlay);
    mediaEl = v;
  } else {
    const img = document.createElement("img");
    img.className = "w-full aspect-square object-cover rounded-lg bg-gray-100";
    img.alt = "預覽";
    img.decoding = "async";
    img.loading = "lazy";
    img.draggable = false;
    img.style.webkitUserDrag = "none";
    img.style.webkitTouchCallout = "none";
    img.addEventListener("contextmenu", (e) => e.preventDefault());

    if (it.kind === "url") {
      img.src = it.url;
    } else {
      img.src = PREVIEW_EMPTY_GIF;
      ensurePreviewThumbURL(it.file)
        .then((u) => { img.src = u; })
        .catch(() => {
          try {
            const raw = URL.createObjectURL(it.file);
            img.src = raw;
            setTimeout(() => URL.revokeObjectURL(raw), 2000);
          } catch { }
        });
    }

    wrap.appendChild(img);
    mediaEl = img;
  }

  const btn = document.createElement("button");
  btn.type = "button";
  // iOS Safari 可能因「文字大小 / text-size-adjust」放大 rem，導致 Tailwind w-7/h-7 變大。
  // 這裡改用固定 px 尺寸 + SVG，確保手機/桌機一致。
  btn.className = "preview-remove-btn absolute top-1 right-1 z-20 bg-black/70 text-white rounded-full flex items-center justify-center";
  btn.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M18.3 5.7a1 1 0 0 0-1.4 0L12 10.6 7.1 5.7a1 1 0 1 0-1.4 1.4L10.6 12l-4.9 4.9a1 1 0 1 0 1.4 1.4L12 13.4l4.9 4.9a1 1 0 0 0 1.4-1.4L13.4 12l4.9-4.9a1 1 0 0 0 0-1.4z" fill="currentColor"/>
    </svg>
  `;
  btn.setAttribute("aria-label", "刪除這張");
  btn.dataset.remove = "1";

  wrap.appendChild(btn);
  return wrap;
}

function __setEditIdx(tile, idx) {
  tile.dataset.idx = String(idx);
  const btn = tile.querySelector('button[data-remove]');
  if (btn) btn.dataset.idx = String(idx);
}

// 依狀態同步 DOM（不清空重畫，避免閃爍）
function paintEditPreview() {
  editCount.textContent = `已選 ${editImagesState.items.length} / ${MAX_EDIT_FILES} 張`;

  const keys = editImagesState.items.map(__editKey);

  for (const [k, el] of __editTileMap) {
    if (!keys.includes(k)) {
      // 移除 tile 時順便釋放縮圖
      if (k && typeof k === "object") {
        try { revokePreviewThumb(k); } catch { }
        try { revokeEditVideoObjURL(k); } catch { }
      }
      el.remove();
      __editTileMap.delete(k);
    }
  }

  editImagesState.items.forEach((it, i) => {
    const key = __editKey(it);
    let tile = __editTileMap.get(key);
    if (!tile) {
      tile = __makeEditTile(it);
      __editTileMap.set(key, tile);
    }
    __setEditIdx(tile, i);
    editPreview.appendChild(tile);
  });
}

// 刪除（事件代理）
editPreview?.addEventListener("click", (e) => {
  const btn = e.target.closest?.("button[data-remove][data-idx]");
  if (!btn) return;

  e.preventDefault();
  e.stopPropagation();

  const i = +btn.dataset.idx;
  const it = editImagesState.items[i];
  if (!it) return;

  if (it.kind === "url") {
    editImagesState.removeUrls.push(it.url);
  } else if (it.kind === "file") {
    revokePreviewThumb(it.file);
    revokeEditVideoObjURL(it.file);
  }

  editImagesState.items.splice(i, 1);
  paintEditPreview();
});

// 手機可用的拖曳交換（Pointer Events；「移動超過門檻」才進入拖曳；放開時與目標交換）
// - 仍保留 swap 交換排序
let editDragFrom = null;
let editDragOver = null;
let editDragEl = null;

let editPending = null; // { pointerId, startX, startY, tile }
const editDRAG_THRESHOLD = 6;

function editCancelPending() { editPending = null; }

function editBeginDrag(e, tile) {
  editDragEl = tile;
  editDragFrom = +tile.dataset.idx;
  editDragOver = editDragFrom;

  try { tile.setPointerCapture?.(e.pointerId); } catch { }
  clearEditDragUI();
  tile.classList.add("ring-2", "ring-brand-500", "opacity-80");
  // 進入拖曳後才阻止預設（避免一開始就擋住頁面/Modal 捲動）
  try { e.preventDefault(); } catch { }
}

function clearEditDragUI() {
  editPreview?.querySelectorAll?.("[data-idx]")?.forEach((el) => {
    el.classList.remove("ring-2", "ring-brand-500", "ring-brand-300", "opacity-80");
  });
}

editPreview?.addEventListener("pointerdown", (e) => {
  // 刪除鈕不拖
  if (e.target.closest?.("button")) return;

  const tile = e.target.closest?.("[data-idx]");
  if (!tile || !editPreview.contains(tile)) return;

  editCancelPending();
  editPending = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, tile };
});

editPreview?.addEventListener("pointermove", (e) => {
  // 還沒進入拖曳：移動超過門檻才開始（避免點一下就鎖住捲動/點擊）
  if (editDragFrom == null) {
    if (!editPending || editPending.pointerId !== e.pointerId) return;

    const dx = e.clientX - editPending.startX;
    const dy = e.clientY - editPending.startY;
    if (Math.hypot(dx, dy) < editDRAG_THRESHOLD) return;

    editBeginDrag(e, editPending.tile);
    editPending = null;
    return;
  }

  try { e.preventDefault(); } catch { }
  const el = document.elementFromPoint(e.clientX, e.clientY);
  const tile = el?.closest?.("[data-idx]");
  if (!tile || !editPreview.contains(tile)) return;

  const idx = +tile.dataset.idx;
  if (idx === editDragOver) return;

  editDragOver = idx;
  clearEditDragUI();
  if (editDragEl) editDragEl.classList.add("ring-2", "ring-brand-500", "opacity-80");
  tile.classList.add("ring-2", "ring-brand-300");
});

function finishEditDrag() {
  editCancelPending();
  if (editDragFrom == null) return;

  const from = editDragFrom;
  const to = editDragOver;

  clearEditDragUI();
  editDragFrom = editDragOver = null;
  editDragEl = null;

  if (to == null || to === from) return;

  const tmp = editImagesState.items[from];
  editImagesState.items[from] = editImagesState.items[to];
  editImagesState.items[to] = tmp;
  paintEditPreview();
}

editPreview?.addEventListener("pointerup", finishEditDrag);
editPreview?.addEventListener("pointercancel", finishEditDrag);

// 新增圖片（遵守上限 5）
editFiles?.addEventListener("change", () => {
  const incoming = Array.from(editFiles.files || []);
  const room = MAX_EDIT_FILES - editImagesState.items.length;

  if (editImagesState.items.length + incoming.length > MAX_EDIT_FILES) {
    swalInDialog({ icon: "warning", title: `最多 ${MAX_EDIT_FILES} 張照片` });
  }

  incoming.slice(0, Math.max(0, room)).forEach((f) => {
    editImagesState.items.push({ kind: "file", file: f });
  });

  paintEditPreview();
  editFiles.value = "";
});

// ===============================
// 送養流程：上傳合照 / 標記 / 撤回
// ===============================

// 狀態：已選擇的合照（可多次疊加）
let adoptedSelected = [];

const adoptedFilesInput = document.getElementById("adoptedFiles");
const btnPickAdopted = document.getElementById("btnPickAdopted");
const adoptedCount = document.getElementById("adoptedCount");
const adoptedPreview = document.getElementById("adoptedPreview");
if (adoptedPreview) {
  adoptedPreview.style.touchAction = "none";
  adoptedPreview.addEventListener("contextmenu", (e) => e.preventDefault());
}

// 打開檔案挑選
btnPickAdopted.onclick = () => adoptedFilesInput.click();

// 渲染縮圖（不卡頓：縮圖/快取/手機拖曳排序）
const __adoptedTileMap = new Map(); // File -> tile element（保留 DOM，避免換順序閃爍）

function __makeAdoptedTile(file) {
  const wrap = document.createElement("div");
  wrap.className = "relative  select-none";
  wrap.style.touchAction = "none";
  wrap.style.setProperty("-webkit-touch-callout", "none");
  wrap.style.userSelect = "none";
  wrap.addEventListener("contextmenu", (e) => e.preventDefault());

  const img = document.createElement("img");
  img.className = "w-full aspect-square object-cover rounded-lg bg-gray-100";
  img.alt = "預覽";
  img.decoding = "async";
  img.loading = "lazy";
  img.draggable = false;
  img.style.webkitUserDrag = "none";
  img.style.webkitTouchCallout = "none";
  img.addEventListener("contextmenu", (e) => e.preventDefault());
  img.src = PREVIEW_EMPTY_GIF;

  ensurePreviewThumbURL(file)
    .then((u) => { img.src = u; })
    .catch(() => {
      try {
        const raw = URL.createObjectURL(file);
        img.src = raw;
        setTimeout(() => URL.revokeObjectURL(raw), 2000);
      } catch { }
    });

  const btn = document.createElement("button");
  btn.type = "button";
  // iOS Safari 可能因「文字大小 / text-size-adjust」放大 rem，導致 Tailwind w-7/h-7 變大。
  // 這裡改用固定 px 尺寸 + SVG，確保手機/桌機一致。
  btn.className = "preview-remove-btn absolute top-1 right-1 z-20 bg-black/60 text-white rounded-full flex items-center justify-center";
  btn.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M18.3 5.7a1 1 0 0 0-1.4 0L12 10.6 7.1 5.7a1 1 0 1 0-1.4 1.4L10.6 12l-4.9 4.9a1 1 0 1 0 1.4 1.4L12 13.4l4.9 4.9a1 1 0 0 0 1.4-1.4L13.4 12l4.9-4.9a1 1 0 0 0 0-1.4z" fill="currentColor"/>
    </svg>
  `;
  btn.setAttribute("aria-label", "刪除這張");

  wrap.appendChild(img);
  wrap.appendChild(btn);
  return wrap;
}

function __setAdoptedIdx(tile, idx) {
  tile.dataset.idx = String(idx);
  const btn = tile.querySelector("button");
  if (btn) btn.dataset.idx = String(idx);
}

// 渲染縮圖（不清空重畫，避免閃爍）
function renderAdoptedPreviews() {
  adoptedCount.textContent = `已選 ${adoptedSelected.length} / 5 張`;

  for (const [file, el] of __adoptedTileMap) {
    if (!adoptedSelected.includes(file)) {
      try { revokePreviewThumb(file); } catch { }
      el.remove();
      __adoptedTileMap.delete(file);
    }
  }

  adoptedSelected.forEach((file, i) => {
    let tile = __adoptedTileMap.get(file);
    if (!tile) {
      tile = __makeAdoptedTile(file);
      __adoptedTileMap.set(file, tile);
    }
    __setAdoptedIdx(tile, i);
    adoptedPreview.appendChild(tile);
  });
}

// 刪除（事件代理）
adoptedPreview.addEventListener("click", (e) => {
  const btn = e.target.closest?.("button[data-idx]");
  if (!btn) return;

  e.preventDefault();
  e.stopPropagation();

  const i = +btn.dataset.idx;
  const f = adoptedSelected[i];
  if (f) revokePreviewThumb(f);

  adoptedSelected.splice(i, 1);
  renderAdoptedPreviews();
});

// 手機可用的拖曳交換（Pointer Events；「移動超過門檻」才進入拖曳；放開時與目標交換）
let adoptedDragFrom = null;
let adoptedDragOver = null;
let adoptedDragEl = null;

let adoptedPending = null; // { pointerId, startX, startY, tile }
const adoptedDRAG_THRESHOLD = 6;

function adoptedCancelPending() { adoptedPending = null; }

function adoptedBeginDrag(e, tile) {
  adoptedDragEl = tile;
  adoptedDragFrom = +tile.dataset.idx;
  adoptedDragOver = adoptedDragFrom;

  try { tile.setPointerCapture?.(e.pointerId); } catch { }
  clearAdoptedDragUI();
  tile.classList.add("ring-2", "ring-brand-500", "opacity-80");
  try { e.preventDefault(); } catch { }
}

function clearAdoptedDragUI() {
  adoptedPreview.querySelectorAll("[data-idx]").forEach((el) => {
    el.classList.remove("ring-2", "ring-brand-500", "ring-brand-300", "opacity-80");
  });
}

adoptedPreview.addEventListener("pointerdown", (e) => {
  // 刪除鈕不拖
  if (e.target.closest?.("button")) return;

  const tile = e.target.closest?.("[data-idx]");
  if (!tile || !adoptedPreview.contains(tile)) return;

  adoptedCancelPending();
  adoptedPending = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, tile };
});

adoptedPreview.addEventListener("pointermove", (e) => {
  if (adoptedDragFrom == null) {
    if (!adoptedPending || adoptedPending.pointerId !== e.pointerId) return;

    const dx = e.clientX - adoptedPending.startX;
    const dy = e.clientY - adoptedPending.startY;
    if (Math.hypot(dx, dy) < adoptedDRAG_THRESHOLD) return;

    adoptedBeginDrag(e, adoptedPending.tile);
    adoptedPending = null;
    return;
  }

  try { e.preventDefault(); } catch { }
  const el = document.elementFromPoint(e.clientX, e.clientY);
  const tile = el?.closest?.("[data-idx]");
  if (!tile || !adoptedPreview.contains(tile)) return;

  const idx = +tile.dataset.idx;
  if (idx === adoptedDragOver) return;

  adoptedDragOver = idx;
  clearAdoptedDragUI();
  if (adoptedDragEl) adoptedDragEl.classList.add("ring-2", "ring-brand-500", "opacity-80");
  tile.classList.add("ring-2", "ring-brand-300");
});

function finishAdoptedDrag() {
  adoptedCancelPending();
  if (adoptedDragFrom == null) return;

  const from = adoptedDragFrom;
  const to = adoptedDragOver;

  clearAdoptedDragUI();
  adoptedDragFrom = adoptedDragOver = null;
  adoptedDragEl = null;

  if (to == null || to === from) return;

  const tmp = adoptedSelected[from];
  adoptedSelected[from] = adoptedSelected[to];
  adoptedSelected[to] = tmp;
  renderAdoptedPreviews();
}

adoptedPreview.addEventListener("pointerup", finishAdoptedDrag);
adoptedPreview.addEventListener("pointercancel", finishAdoptedDrag);

renderAdoptedPreviews();

// 檔案變更：疊加並限制最多 5 張
adoptedFilesInput.addEventListener("change", () => {
  const incoming = Array.from(adoptedFilesInput.files || []);
  const next = adoptedSelected.concat(incoming);
  if (next.length > 5) {
    swalInDialog({ icon: "warning", title: "最多 5 張照片" });
  }
  adoptedSelected = next.slice(0, 5);
  renderAdoptedPreviews();
  adoptedFilesInput.value = ""; // 清空，允許再次選同一檔
});

// 清空（成功/取消後呼叫）
function resetAdoptedSelection() {
  adoptedSelected.forEach((f) => revokePreviewThumb(f));
  adoptedSelected = [];
  adoptedPreview.innerHTML = "";
  adoptedCount.textContent = "已選 0 / 5 張";
  adoptedFilesInput.value = "";
}

// 確認標記為已領養：上傳合照到 Storage，更新狀態與顯示頁面選項
async function onConfirmAdopted() {
  const btn = document.getElementById("btnConfirmAdopted");

  // 動態點點（沿用你檔案內的 startDots）
  btn.disabled = true;
  btn.setAttribute("aria-busy", "true");
  const prog = startProgressBar(btn, { imgSrc: "images/奔跑貓咪.png" });
  prog.update(0);

  const files = adoptedSelected.slice(0, 5);
  const urls = [];
  const __progressTotalBytes = files.reduce((s, f) => s + (f?.size || 0), 0) || 1;
  let __progressUploadedBytes = 0;

  try {
    for (const f of files) {
      const wmBlob = await addWatermarkToFile(f);       // ← 新增：先加浮水印
      const type = wmBlob.type || '';
      let ext = 'bin';
      if (type.startsWith('image/')) {
        ext = type === 'image/png' ? 'png' : 'jpg';
      } else if (type.startsWith('video/')) {
        if (type.includes('webm')) ext = 'webm';
        else if (type.includes('ogg')) ext = 'ogg';
        else if (type.includes('mp4') || type.includes('mpeg')) ext = 'mp4';
        else ext = 'mp4';
      }
      const base = f.name.replace(/\.[^.]+$/, '');
      const path = `adopted/${currentDocId}/${Date.now()}_${base}.${ext}`;
      const r = sRef(storage, path);
      await new Promise((resolve, reject) => {
        const task = uploadBytesResumable(r, wmBlob, { contentType: wmBlob.type || 'application/octet-stream' });
        task.on("state_changed",
          (snap) => {
            const base = __progressUploadedBytes || 0;
            const now = base + (snap?.bytesTransferred || 0);
            const pct = (__progressTotalBytes > 0) ? (now / __progressTotalBytes) * 100 : 0;
            prog.update(pct);
          },
          (err) => reject(err),
          () => {
            __progressUploadedBytes = (__progressUploadedBytes || 0) + (task.snapshot?.totalBytes || wmBlob?.size || 0);
            prog.update((__progressTotalBytes > 0) ? (__progressUploadedBytes / __progressTotalBytes) * 100 : 100);
            resolve();
          }
        );
      });
      urls.push(await getDownloadURL(r));
    }

    await updateDoc(doc(db, "pets", currentDocId), {
      status: "adopted",
      adoptedAt: serverTimestamp(),
      adoptedPhotos: urls,
      showOnHome: true,
      showOnCats: false,
      showOnDogs: false,
      showOnIndex: false,
    });

    prog.update(100);
    prog.stop({ text: "處理中...", keepDisabled: true });
    btn.disabled = true;
    btn.setAttribute("aria-busy", "true");
    btn.textContent = "處理中...";

    // 先關閉 modal
    const dlg = document.getElementById("petDialog");
    if (dlg?.open) dlg.close();

    const reloadPromise = loadPets();

    // 用全域 Swal（不在 dialog 裡），所以關掉 modal 也看得到
    await Swal.fire({
      icon: "success",
      title: "已標記為「已送養」",
      showConfirmButton: false,
      timer: 1500,
      returnFocus: false,
    });
    try {
      await reloadPromise;
    } catch (e) {
      console.error("loadPets error:", e);
    }

    // 清空已領養選取（保險起見，關閉時通常也會清）
    resetAdoptedSelection();
  } catch (err) {
    await swalInDialog({ icon: "error", title: "已送養標記失敗", text: err.message });
  } finally {
    // 收回進度條，恢復按鈕與排版
    try { prog.stop({ restore: true, text: "儲存領養資訊", keepDisabled: false }); } catch (_) { }
    btn.disabled = false;
    btn.removeAttribute("aria-busy");
    btn.textContent = "儲存領養資訊";
  }
}

// 退養 → 還原狀態與顯示頁面選項
async function onUnadopt() {
  const wasOpen = dlg.open;
  if (wasOpen) dlg.close();

  // 先確認是否撤回
  const { isConfirmed } = await Swal.fire({
    icon: "warning",
    title: "確定要退養嗎？",
    showCancelButton: true,
    confirmButtonText: "確定",
    cancelButtonText: "取消",
  });

  if (!isConfirmed) {
    if (wasOpen) { __lockDialogScroll(); dlg.showModal(); }
    return;
  }

  try {
    await deleteAllUnder(`adopted/${currentDocId}`); // 清掉合照
    await updateDoc(doc(db, "pets", currentDocId), {
      status: "available",
      adoptedAt: deleteField(),
      adoptedPhotos: [],
      showOnHome: false,
      showOnCats: true,
      showOnDogs: true,
      showOnIndex: true,
    });

    await loadPets();
    await Swal.fire({ icon: "success", title: "已撤回「已送養」標記", showConfirmButton: false, timer: 1500, });
  } catch (err) {
    await Swal.fire({ icon: "error", title: "撤回失敗", text: err.message });
  } finally {
    if (wasOpen) { __lockDialogScroll(); dlg.showModal(); }
    // 重新渲染讓按鈕狀態即時切換
    const p = pets.find((x) => x.id === currentDocId);
    if (p) await openDialog(p.id);
  }
}

// 讓 SweetAlert2 出現在 <dialog id="petDialog"> 裡，避免被覆蓋
function swalInDialog(opts) {
  const dlg = document.getElementById("petDialog");
  return Swal.fire({
    target: dlg || document.body, // 有 dialog 就掛在 dialog 裡
    backdrop: !!dlg,              // 掛在 dialog 時可保留 backdrop
    ...opts,
  });
}

// 保險：把 Swal 的 z-index 拉高（就算不是掛在 dialog 也不會被遮）
(() => {
  if (!document.getElementById("swalZFix")) {
    const s = document.createElement("style");
    s.id = "swalZFix";
    s.textContent = `.swal2-container{z-index:2147483647 !important;}`;
    document.head.appendChild(s);
  }
})();

// --- 關閉對話框時自動清空「已領養合照」選取 ---
// 這段會在：按右上角關閉、點 backdrop、按 Esc、程式呼叫 close()、甚至手動移除 open 屬性時，都清乾淨。
(function setupDialogCleanup() {
  const dlg = document.getElementById("petDialog");
  if (!dlg || dlg.dataset.cleanupBound) return;

  // 確保有清空函式（如果你前面已定義 resetAdoptedSelection 就不會跑這段）
  if (typeof window.resetAdoptedSelection !== "function") {
    window.resetAdoptedSelection = function () {
      try {
        window.adoptedSelected = [];
        const adoptedPreview = document.getElementById("adoptedPreview");
        if (adoptedPreview) {
          adoptedPreview.style.touchAction = "none";
          adoptedPreview.addEventListener("contextmenu", (e) => e.preventDefault());
        }
        const adoptedCount = document.getElementById("adoptedCount");
        const adoptedFilesInput = document.getElementById("adoptedFiles");
        if (adoptedPreview) adoptedPreview.innerHTML = "";
        if (adoptedCount) adoptedCount.textContent = "已選 0 / 5 張";
        if (adoptedFilesInput) adoptedFilesInput.value = "";
      } catch { }
    };
  }

  // 1) 標準：dialog 關閉事件（按 X、點遮罩、呼叫 close() 都會觸發）
  dlg.addEventListener("close", () => {
    resetAdoptedSelection();
  });

  // 2) 取消事件（按 Esc）
  dlg.addEventListener("cancel", () => {
    resetAdoptedSelection();
    // 不阻止預設，讓它照常關閉
  });

  // 3) 若你的程式是用移除 open / 切 aria-hidden 來關閉，也一併偵測
  const mo = new MutationObserver(() => {
    if (!dlg.open) {
      resetAdoptedSelection();
    }
  });
  mo.observe(dlg, { attributes: true, attributeFilter: ["open", "aria-hidden"] });

  // 4) 如果你有自訂右上角關閉鍵（#dlgClose），也補一下


  dlg.dataset.cleanupBound = "1";
})();

async function deleteAllUnder(path) {
  const folderRef = sRef(storage, path);
  const { items, prefixes } = await listAll(folderRef);
  await Promise.all(items.map((it) => deleteObject(it)));
  // 如果有子資料夾，遞迴刪除
  for (const p of prefixes) {
    await deleteAllUnder(p.fullPath);
  }
}

// === 編輯：名字即時檢查（只在重複時顯示） ===
(() => {
  const dlg = document.getElementById("petDialog");
  if (!dlg) return;

  let hint, input, _origClass = "";

  function ensureHint() {
    if (!input) return;
    if (!hint) {
      hint = document.createElement("div");
      hint.id = "editNameHint";
      // 固定高度，避免版面跳動
      hint.style.minHeight = "20px";
      hint.style.lineHeight = "20px";
      hint.style.whiteSpace = "nowrap";
      hint.style.marginTop = "4px";
      hint.style.fontSize = "0.875rem";
      hint.style.color = "#6b7280"; // gray-500
      input.insertAdjacentElement("afterend", hint);
    }
  }

  function setBad(msg) {
    if (!_origClass) _origClass = input.className;
    input.className = `${_origClass} border-red-500 focus:outline-none`;
    hint.textContent = msg || "";
    hint.style.color = "#dc2626"; // red-600
  }
  function clearState() {
    if (_origClass) input.className = _origClass;
    if (hint) { hint.textContent = ""; hint.style.color = "#6b7280"; }
  }

  // 每次 dialog 開啟後抓到當前的 #editName
  dlg.addEventListener("close", clearState);
  dlg.addEventListener("cancel", clearState);

  document.addEventListener("input", async (e) => {
    const el = e.target;
    if (el.id !== "editName") return;
    input = el; ensureHint();

    const name = (input.value || "").trim();
    if (!name) { clearState(); return; }

    // 只在「重複」時顯示紅字／紅框，其他保持靜默
    const dup = await isNameTaken(name, currentDocId);
    if (dup) setBad(`「${name}」已被使用`);
    else clearState();
  });
})();