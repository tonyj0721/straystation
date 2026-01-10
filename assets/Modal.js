const q = (sel) => document.querySelector(sel);

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
// 統一入口：圖片 / 影片皆可
// 統一入口：圖片 / 影片
// 圖片：真的燒進浮水印
// 影片：暫時不在前端做浮水印，直接用原始檔案（避免播放異常）
// 若未來改成後端 ffmpeg 處理，可以在這裡改成呼叫後端產生有浮水印的新影片。
async function addWatermarkToFile(file, opts = {}) {
  if (!file || !file.type) return file;

  // 影片：直接回傳原始檔案
  if (file.type.startsWith("video/")) {
    return file;
  }

  // 其他一律當作圖片處理
  return await addWatermarkToImage(file, opts);
}

// 共用：依寬高建立一層對角線浮水印
function __createWatermarkLayer(width, height, text = "台中簡媽媽狗園") {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  const g = c.getContext("2d");

  // === 細字無外框樣式（可調參數） ===
  const ANG = -33 * Math.PI / 180;   // 斜角
  const FS = Math.round(Math.max(width, height) * 0.03);  // 字高 ≈ 長邊 3%
  const OP = 0.25;                                  // 透明度
  const STEP_X = Math.max(Math.round(FS * 12), 360); // 同斜線間距（倍數越大越疏）
  const STEP_Y = Math.max(Math.round(FS * 8), 260);  // 斜線與斜線間距

  const diag = Math.hypot(width, height);

  g.save();
  g.translate(width / 2, height / 2);
  g.rotate(ANG);
  g.font = `600 ${FS}px "Noto Sans TC","Microsoft JhengHei",sans-serif`;
  g.textBaseline = "middle";
  g.fillStyle = `rgba(255,255,255,${OP})`;
  // 想更柔和可打開下一行：
  // g.globalCompositeOperation = "overlay"; // 或 "soft-light"

  for (let x = -diag; x <= diag; x += STEP_X) {
    for (let y = -diag; y <= diag; y += STEP_Y) {
      g.fillText(text, x, y);
    }
  }
  g.restore();
  return c;
}

// 圖片：產生帶浮水印的 Blob（直接改寫原圖內容）
async function addWatermarkToImage(file, { text = "台中簡媽媽狗園" } = {}) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => {
      const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = url;
    });
    const W = img.naturalWidth, H = img.naturalHeight;
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const g = c.getContext("2d");
    g.drawImage(img, 0, 0, W, H);

    const wmLayer = __createWatermarkLayer(W, H, text);
    g.drawImage(wmLayer, 0, 0, W, H);

    const out = await new Promise(r => c.toBlob(r, "image/jpeg", 0.85));
    return new File([out], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" });
  } finally {
    URL.revokeObjectURL(url);
  }
}

// 影片：用 <canvas> 燒入浮水印，重新編碼成 WebM
// 注意：處理時間會接近影片實際長度，較長的影片會花比較久

async function addWatermarkToVideo(file, { text = "台中簡媽媽狗園" } = {}) {
  const src = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.src = src;
  video.muted = true;
  video.playsInline = true;
  video.crossOrigin = "anonymous";

  try {
    await new Promise((resolve, reject) => {
      video.addEventListener("loadedmetadata", () => resolve(), { once: true });
      video.addEventListener("error", () => reject(new Error("影片讀取失敗")), { once: true });
    });

    const W = video.videoWidth || 1280;
    const H = video.videoHeight || 720;

    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const g = canvas.getContext("2d");

    if (!canvas.captureStream || typeof MediaRecorder === "undefined") {
      console.warn("此瀏覽器不支援 MediaRecorder/captureStream，影片將不上浮水印原檔上傳");
      return file;
    }

    const wmLayer = __createWatermarkLayer(W, H, text);

    const canvasStream = canvas.captureStream();
    let mime = "video/webm";
    if (MediaRecorder.isTypeSupported("video/webm;codecs=vp9")) {
      mime = "video/webm;codecs=vp9";
    } else if (MediaRecorder.isTypeSupported("video/webm;codecs=vp8")) {
      mime = "video/webm;codecs=vp8";
    }

    const recorder = new MediaRecorder(canvasStream, { mimeType: mime });
    const chunks = [];

    recorder.addEventListener("dataavailable", (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    });

    const recordDone = new Promise((resolve) => {
      recorder.addEventListener("stop", () => resolve(), { once: true });
    });

    let playing = false;
    let ended = false;
    let recorderStarted = false;

    function drawFrame() {
      if (!playing || ended) return;
      try {
        g.drawImage(video, 0, 0, W, H);
        g.drawImage(wmLayer, 0, 0, W, H);
      } catch (e) {
        // 忽略單幀錯誤
      }
      requestAnimationFrame(drawFrame);
    }

    video.addEventListener("play", () => {
      playing = true;
      drawFrame();
    });

    video.addEventListener("pause", () => {
      playing = false;
    });

    video.addEventListener("ended", () => {
      ended = true;
      try { recorder.stop(); } catch (_) {}
      canvasStream.getTracks().forEach((t) => t.stop());
    }, { once: true });

    video.addEventListener("playing", () => {
      if (!recorderStarted) {
        recorderStarted = true;
        recorder.start(200);
      }
    }, { once: true });

    await video.play();
    await recordDone;

    const blob = new Blob(chunks, { type: "video/webm" });
    const outName = file.name.replace(/\.[^.]+$/, ".webm");
    return new File([blob], outName, { type: "video/webm" });
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
  if (window.createImageBitmap) {
    try { return await createImageBitmap(file); } catch (_) { /* fallback */ }
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

  const imgUrls = Array.isArray(p.images) && p.images.length > 0
    ? p.images
    : (p.image ? [p.image] : []);

  const videoUrls = Array.isArray(p.videos) ? p.videos.filter(Boolean) : [];

  const media = [];
  imgUrls.forEach((url, idx) => media.push({ type: "image", url, imgIndex: idx }));
  videoUrls.forEach((url) => media.push({ type: "video", url, imgIndex: null }));

  let currentIndex = 0;

  function showMedia(index) {
    if (!media.length) return;
    if (index < 0 || index >= media.length) index = 0;
    currentIndex = index;
    const item = media[index];

    if (item.type === "image") {
      if (dlgImg) {
        dlgImg.classList.remove("hidden");
        dlgImg.src = item.url;
      }
      if (dlgVideo) {
        try { dlgVideo.pause(); } catch (e) {}
        dlgVideo.classList.add("hidden");
      }
      if (dlgBg) dlgBg.src = item.url;
    } else {
      if (dlgVideo) {
        dlgVideo.classList.remove("hidden");
        if (dlgVideo.src !== item.url) {
          dlgVideo.src = item.url;
        }
      }
      if (dlgImg) {
        dlgImg.classList.add("hidden");
      }
      if (dlgBg && imgUrls.length > 0) {
        dlgBg.src = imgUrls[0];
      }
    }

    if (dlgThumbs) {
      dlgThumbs.querySelectorAll(".dlg-thumb")
        .forEach((el, i) => {
          el.classList.toggle("active", i === index);
        });
    }
  }

  if (dlgImg) {
    dlgImg.onclick = () => {
      const cur = media[currentIndex];
      if (!cur || cur.type !== "image") return;
      const idx = cur.imgIndex ?? 0;
      openLightbox(imgUrls, idx);
    };
  }

  if (dlgThumbs) {
    dlgThumbs.innerHTML = "";
    media.forEach((item, i) => {
      let thumb;
      if (item.type === "image") {
        thumb = document.createElement("img");
        thumb.src = item.url;
      } else {
        thumb = document.createElement("video");
        thumb.src = item.url;
        thumb.muted = true;
        thumb.playsInline = true;
      }
      thumb.className = "dlg-thumb" + (i === 0 ? " active" : "");
      thumb.addEventListener("click", () => showMedia(i));
      dlgThumbs.appendChild(thumb);
    });
  }

  if (media.length > 0) {
    showMedia(0);
  } else {
    if (dlgImg) {
      dlgImg.classList.remove("hidden");
      dlgImg.src = "";
    }
    if (dlgVideo) {
      dlgVideo.classList.add("hidden");
      dlgVideo.src = "";
    }
    if (dlgBg) dlgBg.src = "";
  }

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

  // 編集模式圖片預設：只有 images（不含 videos）
  const imgs = Array.isArray(p.images) && p.images.length > 0
    ? p.images
    : (p.image ? [p.image] : []);

  renderEditImages(imgs);

  // 重置編輯模式影片暫存
  if (typeof pendingEditVideos !== "undefined") {
    pendingEditVideos = [];
  }
  if (editVideoList) editVideoList.innerHTML = "";
  if (editVideoCount) editVideoCount.textContent = "";
  if (editVideoFiles) editVideoFiles.value = "";

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
  document.getElementById("btnDelete").onclick = onDelete;
  document.getElementById("btnEdit").onclick = () => setEditMode(true);

  document.getElementById("btnAdopted").onclick = () => {
    // ✅ 按「已送養」時，把「編輯那排」(actionBar) 一起藏起來
    document.getElementById("actionBar")?.classList.add("hidden");
    const up = document.getElementById("adoptedUpload");
    up.classList.remove("hidden");
    document.getElementById("btnPickAdopted")?.focus();
    up.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  document.getElementById("btnPickAdopted").onclick = () =>
    document.getElementById("adoptedFiles").click();

  document.getElementById("btnConfirmAdopted").onclick = onConfirmAdopted;
  document.getElementById("btnCancelAdopted").onclick = async (e) => {
    e.preventDefault();
    await openDialog(currentDocId);   // 一定要 await，等內容重畫完
    resetAdoptedSelection();
    scrollDialogTop();
  };
  document.getElementById("btnSave").onclick = saveEdit;

  // 取消編輯：回到瀏覽模式內容 + 回頂端
  document.getElementById("btnCancel").onclick = async (e) => {
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
// 編輯模式：儲存資料與圖片同步（增/刪/保留）
// ===============================
async function saveEdit() {
  const btn = document.getElementById("btnSave");
  const txt = document.getElementById("saveText");
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

  // ① 送出前：名字重複 → 先詢問是否仍要儲存（此時不要啟動「儲存中」）
  const newName = newData.name;
  if (newName && newName !== "未取名") {
    const taken = await isNameTaken(newName, currentDocId);
    if (taken) {
      const { isConfirmed } = await swalInDialog({
        icon: "warning",
        title: `「${newName}」已存在`,
        text: "確定繼續儲存？",
        showCancelButton: true,
        confirmButtonText: "確定",
        cancelButtonText: "取消",
      });
      if (!isConfirmed) {
        // 使用者取消 → 直接結束，按鈕維持可按、文字維持「儲存」
        return;
      }
    }
    // 同步小寫欄位，避免之後搜尋不到
    newData.nameLower = newName.toLowerCase();
  }

  // ② 確認後才開始「儲存中…」與鎖定按鈕
  btn.disabled = true;
  const stopDots = startDots(txt, "儲存中");

  try {
    // 依照「目前畫面順序」組出最終 images：url 直接保留；file 依序上傳後插回同位置
    const { items, removeUrls } = editImagesState;
    const newUrls = [];

    // 依序處理（保持順序）
    for (const it of items) {
      if (it.kind === "url") {
        newUrls.push(it.url);
        continue;
      }

      if (it.kind === "file") {
        const f = it.file;
        const wmBlob = await addWatermarkToFile(f);       // ← 新增：先加浮水印
        const ext = wmBlob.type === 'image/png' ? 'png' : 'jpg';
        const base = f.name.replace(/\.[^.]+$/, '');
        const path = `pets/${currentDocId}/${Date.now()}_${base}.${ext}`;
        const r = sRef(storage, path);
        await uploadBytes(r, wmBlob, { contentType: wmBlob.type });
        newUrls.push(await getDownloadURL(r));
      }
    }

    // 刪除被移除的舊圖（忽略刪失敗）
    for (const url of (removeUrls || [])) {
      try {
        const path = url.split("/o/")[1].split("?")[0];
        await deleteObject(sRef(storage, decodeURIComponent(path)));
      } catch (e) {
        // 靜默忽略
      }
    }

    newData.images = newUrls;

    // 若本次有新增影片，append 到原有 videos 陣列
    const appendVideos = [];
    if (pendingEditVideos && pendingEditVideos.length) {
      for (const f of pendingEditVideos) {
        const wmBlob = await addWatermarkToFile(f);
        const isImage = wmBlob.type && wmBlob.type.startsWith("image/");
        const ext = isImage
          ? (wmBlob.type === 'image/png' ? 'png' : 'jpg')
          : (wmBlob.type.split("/")[1] || "bin");
        const base = f.name.replace(/\.[^.]+$/, '');
        const folder = isImage ? `pets/${currentDocId}` : `pets/${currentDocId}/videos`;
        const path = `${folder}/${Date.now()}_${base}.${ext}`;
        const r = sRef(storage, path);
        await uploadBytes(r, wmBlob, { contentType: wmBlob.type });
        appendVideos.push(await getDownloadURL(r));
      }
    }
    if (appendVideos.length) {
      const existingVideos = Array.isArray(currentDoc?.videos) ? currentDoc.videos : [];
      newData.videos = existingVideos.concat(appendVideos);
    }

    // ③ 寫回 Firestore
    await updateDoc(doc(db, "pets", currentDocId), newData);

    // ④ 重載列表並同步當前物件
    await loadPets();
    currentDoc = { ...currentDoc, ...newData };

    // ⑤ UI 收尾（無論彈窗狀態，成功提示一下）
    stopDots();
    btn.disabled = false;
    txt.textContent = "儲存";

    const wasOpen = dlg.open;
    if (wasOpen) dlg.close();
    await Swal.fire({ icon: "success", title: "已儲存", showConfirmButton: false, timer: 1500 });
    if (wasOpen) { __lockDialogScroll(); dlg.showModal(); }

    setEditMode(false);
    await openDialog(currentDocId);

  } catch (err) {
    // 失敗也要確保 UI 復原
    stopDots();
    btn.disabled = false;
    txt.textContent = "儲存";
    await swalInDialog({ icon: "error", title: "更新失敗", text: err.message });
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

const editVideoFiles = q("#editVideoFiles");
const btnPickEditVideo = q("#btnPickEditVideo");
const editVideoCount = q("#editVideoCount");
const editVideoList = q("#editVideoList");
const MAX_EDIT_VIDEO_FILES = 3;

// 編輯模式下待新增的影片（只會 append，不處理刪除）
let pendingEditVideos = [];

btnPickEditVideo?.addEventListener("click", () => editVideoFiles?.click());

editVideoFiles?.addEventListener("change", () => {
  const incoming = Array.from(editVideoFiles.files || []);
  const next = (pendingEditVideos || []).concat(incoming);
  if (next.length > MAX_EDIT_VIDEO_FILES) {
    if (typeof Swal !== "undefined" && Swal?.fire) {
      Swal.fire({ icon: "warning", title: `最多 ${MAX_EDIT_VIDEO_FILES} 支影片` });
    }
  }
  pendingEditVideos = next.slice(0, MAX_EDIT_VIDEO_FILES);

  if (editVideoList) {
    editVideoList.innerHTML = "";
    pendingEditVideos.forEach((f, idx) => {
      const row = document.createElement("div");
      row.textContent = `${idx + 1}. ${f.name}`;
      editVideoList.appendChild(row);
    });
  }
  if (editVideoCount) {
    editVideoCount.textContent = `已選 ${pendingEditVideos.length} / ${MAX_EDIT_VIDEO_FILES} 支`;
  }
  editVideoFiles.value = "";
});


// 狀態：依「目前畫面順序」維護（url=舊圖、file=新圖）
let editImagesState = { items: [], removeUrls: [] };

btnPickEdit?.addEventListener("click", () => editFiles?.click());

// 初始化編輯圖片列表（把舊的檔案縮圖快取清掉，避免記憶體累積）
function renderEditImages(urls) {
  for (const it of editImagesState.items) {
    if (it?.kind === "file" && it.file) revokePreviewThumb(it.file);
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

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "absolute top-1 right-1 bg-black/70 text-white rounded-full w-7 h-7 flex items-center justify-center";
  btn.textContent = "✕";
  btn.setAttribute("aria-label", "刪除這張");

  wrap.appendChild(img);
  wrap.appendChild(btn);
  return wrap;
}

function __setEditIdx(tile, idx) {
  tile.dataset.idx = String(idx);
  const btn = tile.querySelector("button");
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
  const btn = e.target.closest?.("button[data-idx]");
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
  btn.className = "absolute top-1 right-1 bg-black/60 text-white rounded-full w-7 h-7 flex items-center justify-center";
  btn.textContent = "✕";
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
  const stopDots = startDots(btn, "儲存中");

  const files = adoptedSelected.slice(0, 5);
  const urls = [];
  try {
    for (const f of files) {
      const wmBlob = await addWatermarkToFile(f);       // ← 新增：先加浮水印
      const ext = wmBlob.type === 'image/png' ? 'png' : 'jpg';
      const base = f.name.replace(/\.[^.]+$/, '');
      const path = `adopted/${currentDocId}/${Date.now()}_${base}.${ext}`;
      const r = sRef(storage, path);
      await uploadBytes(r, wmBlob, { contentType: wmBlob.type });
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

    await loadPets();

    // 先關閉 modal
    const dlg = document.getElementById("petDialog");
    if (dlg?.open) dlg.close();

    // 用全域 Swal（不在 dialog 裡），所以關掉 modal 也看得到
    await Swal.fire({
      icon: "success",
      title: "已標記為「已送養」",
      showConfirmButton: false,
      timer: 1500,
    });

    // 清空已領養選取（保險起見，關閉時通常也會清）
    resetAdoptedSelection();
  } catch (err) {
    await swalInDialog({ icon: "error", title: "已送養標記失敗", text: err.message });
  } finally {
    stopDots();
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