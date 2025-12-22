const q = (sel) => document.querySelector(sel);


// ===============================
// 縮圖排序（iPhone 不卡）：Pointer Events + 直接移動 DOM（拖曳時不重畫、不重新解碼）
// ===============================
function makeKey(prefix = "k") {
  try {
    return `${prefix}_${crypto.randomUUID()}`;
  } catch {
    return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
}

function safeRevokeObjectURL(u) {
  try { if (u) URL.revokeObjectURL(u); } catch { }
}

function enablePointerSort(container, getItems, setItems) {
  if (!container || container.dataset.sortBound) return;
  container.dataset.sortBound = "1";

  let dragEl = null;
  let pid = null;

  // sx/sy 用來判斷是否超過「拖曳門檻」
  let sx = 0, sy = 0;

  // lastX/lastY + tx/ty 用「累積位移」避免 reorder 後跳很遠（iOS Safari 常見）
  let lastX = 0, lastY = 0;
  let tx = 0, ty = 0;

  let moved = false;
  const TH = 6; // tap vs drag 門檻（px）

  function finish() {
    if (!dragEl) return;
    try { dragEl.releasePointerCapture(pid); } catch { }

    dragEl.classList.remove("ring-2", "ring-blue-400", "z-10");
    dragEl.style.transform = "";
    dragEl.style.pointerEvents = "";
    dragEl.style.willChange = "";

    if (moved) {
      const keys = Array.from(container.querySelectorAll(".sortable-item"))
        .map((el) => el.dataset.key);

      const map = new Map(getItems().map((it) => [it.key, it]));
      const next = keys.map((k) => map.get(k)).filter(Boolean);
      setItems(next);
    }

    dragEl = null;
    pid = null;
    moved = false;
    tx = ty = 0;
  }

  container.addEventListener("pointerdown", (e) => {
    const item = e.target.closest?.(".sortable-item");
    if (!item || item.parentElement !== container) return;
    if (e.target.closest?.("button")) return;

    dragEl = item;
    pid = e.pointerId;

    sx = e.clientX;
    sy = e.clientY;
    lastX = sx;
    lastY = sy;
    tx = 0;
    ty = 0;
    moved = false;

    dragEl.setPointerCapture(pid);
    dragEl.style.willChange = "transform";
    dragEl.classList.add("ring-2", "ring-blue-400", "z-10");
    e.preventDefault();
  }, { passive: false });

  container.addEventListener("pointermove", (e) => {
    if (!dragEl || e.pointerId !== pid) return;

    const dx0 = e.clientX - sx;
    const dy0 = e.clientY - sy;

    if (!moved) {
      if (Math.hypot(dx0, dy0) < TH) return;

      moved = true;
      // 讓 elementFromPoint 能抓到「下面那格」，不會永遠抓到自己
      dragEl.style.pointerEvents = "none";

      // 第一次進入拖曳：直接把目前位移當作 tx/ty
      tx = dx0;
      ty = dy0;
      lastX = e.clientX;
      lastY = e.clientY;
      e.preventDefault();
    } else {
      // 後續：用累積位移避免 reorder 後的基準點改變造成瞬移
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      tx += dx;
      ty += dy;
      lastX = e.clientX;
      lastY = e.clientY;
      e.preventDefault();
    }

    dragEl.style.transform = `translate(${tx}px, ${ty}px)`;

    const el = document.elementFromPoint(e.clientX, e.clientY);
    const over = el?.closest?.(".sortable-item");
    if (!over || over === dragEl || over.parentElement !== container) return;

    const r = over.getBoundingClientRect();
    const before =
      (e.clientY < r.top + r.height / 2) ||
      (e.clientY >= r.top && e.clientY <= r.bottom && e.clientX < r.left + r.width / 2);

    // reorder 會讓 dragEl 的「基準位置」改變，導致畫面瞬移
    // 先記錄 reorder 前後的 rect，補回差值，讓拖曳手感連續
    const rectBefore = dragEl.getBoundingClientRect();
    if (before) container.insertBefore(dragEl, over);
    else container.insertBefore(dragEl, over.nextSibling);
    const rectAfter = dragEl.getBoundingClientRect();

    tx += (rectBefore.left - rectAfter.left);
    ty += (rectBefore.top - rectAfter.top);
    dragEl.style.transform = `translate(${tx}px, ${ty}px)`;
  }, { passive: false });

  container.addEventListener("pointerup", finish);
  container.addEventListener("pointercancel", finish);
}

// 讓拖曳中的縮圖視覺更明確（不影響效能）
(() => {
  if (!document.getElementById("sortablePreviewFix")) {
    const s = document.createElement("style");
    s.id = "sortablePreviewFix";
    s.textContent = `.sortable-item{touch-action:none;}
.sortable-item img{user-select:none;-webkit-user-drag:none;}
.sortable-item.is-dragging{opacity:.75;}`;
    document.head.appendChild(s);
  }
})();


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
async function addWatermarkToFile(file, { text = "台中簡媽媽狗園" } = {}) {
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

    // === 細字無外框樣式（可調參數） ===
    const ANG = -33 * Math.PI / 180;   // 斜角
    const FS = Math.round(Math.max(W, H) * 0.03);  // 字高 ≈ 長邊 6%
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
    // 想更柔和可打開下一行：
    // g.globalCompositeOperation = "overlay"; // 或 "soft-light"

    // 只填色，不描邊（不要 strokeText/lineWidth/strokeStyle）
    for (let x = -diag; x <= diag; x += STEP_X) {
      for (let y = -diag; y <= diag; y += STEP_Y) {
        g.fillText(text, x, y);
      }
    }
    g.restore();

    const out = await new Promise(r => c.toBlob(r, "image/jpeg", 0.85));
    return new File([out], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" });
  } finally {
    URL.revokeObjectURL(url);
  }
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
  const dlgBg = document.getElementById("dlgBg");
  const dlgThumbs = document.getElementById("dlgThumbs");

  const imgs = Array.isArray(p.images) && p.images.length > 0
    ? p.images
    : (p.image ? [p.image] : []);

  let currentIndex = 0;

  dlgImg.src = imgs[currentIndex] || "";
  if (dlgBg) dlgBg.src = dlgImg.src;
  dlgImg.onclick = () => openLightbox(imgs, currentIndex);

  dlgThumbs.innerHTML = "";
  imgs.forEach((url, i) => {
    const thumb = document.createElement("img");
    thumb.src = url;
    thumb.className = "dlg-thumb" + (i === 0 ? " active" : "");

    thumb.addEventListener("click", () => {
      currentIndex = i;

      dlgImg.src = url;
      if (dlgBg) dlgBg.src = url;

      dlgThumbs.querySelectorAll(".dlg-thumb")
        .forEach(el => el.classList.remove("active"));
      thumb.classList.add("active");
    });

    dlgThumbs.appendChild(thumb);
  });


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
  document.getElementById("editGender").value = p.gender;
  document.getElementById("editDesc").value = p.desc;

  setEditSpecies(p.species || '貓');
  syncEditBreedSelectors();

  if (p.breedType) {
    document.getElementById("editBreedType").value = p.breedType;
    buildEditBreedOptions();
    updateEditBreedLabel();

    if (p.breed) {
      document.getElementById("editBreed").disabled = false;
      document.getElementById("editBreed").value = p.breed;
    }
  }

  renderEditImages(imgs);

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
    lockScroll();
    dlg.showModal();
  }
}

// 關閉 Dialog
document.getElementById("dlgClose").addEventListener("click", () => {
  if (dlg.open) dlg.close();
  document.documentElement.style.overflow = oldHtmlOverflow;
});

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
    if (wasOpen) { lockScroll(); dlg.showModal(); }
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
    if (wasOpen) { lockScroll(); dlg.showModal(); }
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
    // 依照目前排序計算出最終 images：keep（既有 URL）+ add（新檔案）
    const { items, remove } = editImagesState;
    const keep = items.filter((it) => it.type === "keep").map((it) => it.url);
    const add = items.filter((it) => it.type === "add").map((it) => it.file);

    const newUrls = [...keep];

    // 上傳新增檔案
    for (const f of add) {
      const wmBlob = await addWatermarkToFile(f);       // ← 新增：先加浮水印
      const ext = wmBlob.type === 'image/png' ? 'png' : 'jpg';
      const base = f.name.replace(/\.[^.]+$/, '');
      const path = `pets/${currentDocId}/${Date.now()}_${base}.${ext}`;
      const r = sRef(storage, path);
      await uploadBytes(r, wmBlob, { contentType: wmBlob.type });
      newUrls.push(await getDownloadURL(r));
    }

    // 刪除移除的檔案（忽略刪失敗）
    for (const url of remove) {
      try {
        const path = url.split("/o/")[1].split("?")[0];
        await deleteObject(sRef(storage, decodeURIComponent(path)));
      } catch (e) {
        // 靜默忽略
      }
    }

    newData.images = newUrls;

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
    if (wasOpen) { lockScroll(); dlg.showModal(); }

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
// 編輯模式：圖片管理（預覽 + 增刪 + 拖曳排序）
// ===============================
const editFiles = q("#editFiles");
const btnPickEdit = q("#btnPickEdit");
const editPreview = q("#editPreview");
const editCount = q("#editCount");

// 狀態：items 有序（keep/url 與 add/file 混排）；remove 只存「被刪掉的既有 url」
let editImagesState = { items: [], remove: [] };

btnPickEdit.addEventListener("click", () => editFiles.click());

// 初始化編輯圖片列表
function renderEditImages(urls) {
  // 先清掉舊的新增縮圖 URL（避免 memory leak）
  try {
    editImagesState.items.forEach((it) => {
      if (it.type === "add") safeRevokeObjectURL(it.previewUrl);
    });
  } catch { }

  editImagesState.items = (urls || []).map((u) => ({
    key: makeKey("keep"),
    type: "keep",
    url: u,
  }));
  editImagesState.remove = [];
  paintEditPreview();
}

// 依狀態重新畫縮圖（只在「新增/刪除」時重畫；拖曳排序時不重畫）
function paintEditPreview() {
  const total = editImagesState.items.length;
  editCount.textContent = `已選 ${total} / 5 張`;

  editPreview.innerHTML = editImagesState.items
    .map((it) => {
      const src = it.type === "keep" ? it.url : it.previewUrl;
      return `
        <div class="relative sortable-item" data-key="${it.key}">
          <img class="w-full aspect-square object-cover rounded-lg" src="${src}" alt="預覽" draggable="false" decoding="async"/>
          <button type="button" data-delkey="${it.key}" class="absolute top-1 right-1 bg-black/70 text-white rounded-full w-7 h-7 flex items-center justify-center" aria-label="刪除這張">✕</button>
        </div>`;
    })
    .join("");
}

// 刪除（事件委派，避免 paint 之後還要重綁）
if (editPreview && !editPreview.dataset.delBound) {
  editPreview.dataset.delBound = "1";
  editPreview.addEventListener("click", (e) => {
    const btn = e.target.closest?.("button[data-delkey]");
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();

    const key = btn.dataset.delkey;
    const idx = editImagesState.items.findIndex((x) => x.key === key);
    if (idx < 0) return;

    const it = editImagesState.items[idx];
    if (it.type === "keep") {
      editImagesState.remove.push(it.url);
    } else {
      safeRevokeObjectURL(it.previewUrl);
    }

    editImagesState.items.splice(idx, 1);
    paintEditPreview();
  });
}

// 拖曳排序（只綁一次）
enablePointerSort(editPreview, () => editImagesState.items, (next) => {
  editImagesState.items = next;
});

// 新增圖片（尊守上限 5）
editFiles.addEventListener("change", () => {
  const incoming = Array.from(editFiles.files || []);
  const room = 5 - editImagesState.items.length;

  if (incoming.length > room) {
    swalInDialog({ icon: "warning", title: "最多 5 張照片" });
  }

  const picked = incoming.slice(0, Math.max(0, room)).map((f) => ({
    key: makeKey("add"),
    type: "add",
    file: f,
    previewUrl: URL.createObjectURL(f), // 只建立一次
  }));

  editImagesState.items = editImagesState.items.concat(picked);
  paintEditPreview();
  editFiles.value = "";
});

// ===============================
// 送養流程：上傳合照 / 標記 / 撤回
// ===============================

// 狀態：已選擇的合照（可多次疊加；可拖曳排序）
let adoptedSelected = []; // [{ key, file, url }]

const adoptedFilesInput = document.getElementById("adoptedFiles");
const btnPickAdopted = document.getElementById("btnPickAdopted");
const adoptedCount = document.getElementById("adoptedCount");
const adoptedPreview = document.getElementById("adoptedPreview");

// 打開檔案挑選
btnPickAdopted.onclick = () => adoptedFilesInput.click();

// 渲染縮圖（右上角刪除鈕；拖曳排序時不重畫）
function renderAdoptedPreviews() {
  adoptedCount.textContent = `已選 ${adoptedSelected.length} / 5 張`;
  adoptedPreview.innerHTML = adoptedSelected
    .map((it) => `
        <div class="relative sortable-item" data-key="${it.key}">
          <img class="w-full aspect-square object-cover rounded-lg" src="${it.url}" alt="預覽" draggable="false" decoding="async">
          <button type="button" data-delkey="${it.key}"
                  class="absolute top-1 right-1 bg-black/60 text-white rounded-full w-7 h-7 flex items-center justify-center"
                  aria-label="刪除這張">✕</button>
        </div>
      `)
    .join("");
}

// 刪除（事件委派）
if (adoptedPreview && !adoptedPreview.dataset.delBound) {
  adoptedPreview.dataset.delBound = "1";
  adoptedPreview.addEventListener("click", (e) => {
    const btn = e.target.closest?.("button[data-delkey]");
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();

    const key = btn.dataset.delkey;
    const idx = adoptedSelected.findIndex((x) => x.key === key);
    if (idx >= 0) {
      safeRevokeObjectURL(adoptedSelected[idx].url);
      adoptedSelected.splice(idx, 1);
      renderAdoptedPreviews();
    }
  });
}

// 拖曳排序（只綁一次）
enablePointerSort(adoptedPreview, () => adoptedSelected, (next) => {
  adoptedSelected = next;
  // 舊程式有用到 window.adoptedSelected，保留同步
  window.adoptedSelected = adoptedSelected;
});

renderAdoptedPreviews();

// 檔案變更：疊加並限制最多 5 張（URL 只做一次）
adoptedFilesInput.addEventListener("change", () => {
  const incoming = Array.from(adoptedFilesInput.files || []);
  const room = 5 - adoptedSelected.length;

  if (incoming.length > room) {
    swalInDialog({ icon: "warning", title: "最多 5 張照片" });
  }

  const picked = incoming.slice(0, Math.max(0, room)).map((f) => ({
    key: makeKey("adopted"),
    file: f,
    url: URL.createObjectURL(f),
  }));

  adoptedSelected = adoptedSelected.concat(picked);
  window.adoptedSelected = adoptedSelected; // 相容
  renderAdoptedPreviews();
  adoptedFilesInput.value = ""; // 清空，允許再次選同一檔
});

// 清空（成功/取消後呼叫）
function resetAdoptedSelection() {
  try {
    adoptedSelected.forEach((it) => safeRevokeObjectURL(it.url));
  } catch { }
  adoptedSelected = [];
  window.adoptedSelected = adoptedSelected; // 相容

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

  const files = adoptedSelected.map((it) => it.file).slice(0, 5);
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
    if (wasOpen) { lockScroll(); dlg.showModal(); }
    return;
  }

  try {
    await deleteAllUnder(`adopted/${currentDocId}`); // 清掉合照
    await updateDoc(doc(db, "pets", currentDocId), {
      status: "available",
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
    if (wasOpen) { lockScroll(); dlg.showModal(); }
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
  document.getElementById("dlgClose")?.addEventListener("click", () => {
    // 這裡不直接清空，交給 close 事件統一處理；若你的按鈕不是呼叫 close()，可手動加：
    // resetAdoptedSelection();
  });

  dlg.dataset.cleanupBound = "1";
})();

// === 取消：事件委派，避免動態重繪導致沒綁到 ===
/*document.addEventListener("click", (e) => {
  const cancelBtn = e.target.closest?.("#btnCancel");
  if (!cancelBtn) return;

  e.preventDefault();

  // 清空已領養選取（若專案內已有自訂版本會沿用）
  try {
    if (typeof resetAdoptedSelection === "function") resetAdoptedSelection();
    else {
      // 簡易後援：確保清乾淨
      if (window.adoptedSelected) window.adoptedSelected.length = 0;
      const adoptedPreview = document.getElementById("adoptedPreview");
      const adoptedCount = document.getElementById("adoptedCount");
      const adoptedFilesInput = document.getElementById("adoptedFiles");
      if (adoptedPreview) adoptedPreview.innerHTML = "";
      if (adoptedCount) adoptedCount.textContent = "已選 0 / 5 張";
      if (adoptedFilesInput) adoptedFilesInput.value = "";
    }
  } catch { }

  // 關閉 <dialog>
  try {
    const dlg = document.getElementById("petDialog");
    if (dlg?.open) dlg.close();
    // 若你不是用 close() 關 dialog，而是切 aria-hidden/open，也能配合這段：
    // dlg?.removeAttribute?.("open");
    // dlg?.setAttribute?.("aria-hidden", "true");
  } catch { }
});*/

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
    const dup = await isNameTaken(name, window.currentDocId || window.currentDoc?.id || null);
    if (dup) setBad(`「${name}」已被使用`);
    else clearState();
  });
})();