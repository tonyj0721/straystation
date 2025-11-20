/* ==========================================================
   modal-lightbox.js
   前台 (cats.html/dogs.html) + 後台 (admin.html) 共用模組
   100% 以 cats.html 的 lightbox 行為為準
   ========================================================== */
(function (global) {

  function createModalLightbox(opts = {}) {

    /* ---- 取得 DOM ---- */
    const dlg = document.getElementById("petDialog");
    const dlgImg = document.getElementById("dlgImg");
    const dlgBg = document.getElementById("dlgBg");
    const dlgThumbs = document.getElementById("dlgThumbs");
    const dlgClose = document.getElementById("dlgClose");

    const lb = document.getElementById("lightbox");
    const lbImg = document.getElementById("lbImg");
    const lbPrev = document.getElementById("lbPrev");
    const lbNext = document.getElementById("lbNext");
    const lbThumbsInner = document.getElementById("lbThumbsInner");
    const lbBackdrop = document.getElementById("lbBackdrop");

    /* ---- 狀態 ---- */
    let images = [];
    let index = 0;
    let fromDialog = false;

    /* ==========================================================
       建立縮圖（對話框用）
       ========================================================== */
    function buildDlgThumbs() {
      dlgThumbs.innerHTML = "";

      images.forEach((url, i) => {
        const im = document.createElement("img");
        im.src = url;
        im.className = "dlg-thumb" + (i === 0 ? " active" : "");

        im.addEventListener("click", () => {
          index = i;
          updateMainImage();
        });

        dlgThumbs.appendChild(im);
      });
    }

    /* ==========================================================
       更新主圖（對話框用）
       ========================================================== */
    function updateMainImage() {
      if (!images.length) return;

      dlgImg.src = images[index];
      dlgBg.src = images[index];

      dlgThumbs.querySelectorAll(".dlg-thumb").forEach((el, i) => {
        el.classList.toggle("active", i === index);
      });
    }

    /* ==========================================================
       Lightbox：縮圖列
       ========================================================== */
    function buildLbThumbs() {
      lbThumbsInner.innerHTML = "";

      images.forEach((url, i) => {
        const t = document.createElement("img");
        t.src = url;
        if (i === index) t.classList.add("active");
        t.addEventListener("click", (e) => {
          e.stopPropagation();
          index = i;
          updateLbImage();
        });
        lbThumbsInner.appendChild(t);
      });
    }

    /* ==========================================================
       Lightbox：更新大圖
       ========================================================== */
    function updateLbImage() {
      lbImg.src = images[index];
      buildLbThumbs();
    }

    /* ==========================================================
       Lightbox：cats.html 的核心函式 —— lbShow(delta)
       ========================================================== */
    function lbShow(delta) {
      if (!images.length) return;
      index = (index + delta + images.length) % images.length;
      updateLbImage();
    }

    /* ==========================================================
       開啟 Lightbox
       ========================================================== */
    function openLightbox(startIndex = 0) {
      if (!images.length) return;

      fromDialog = dlg.open;

      if (dlg.open) dlg.close();

      index = startIndex;
      updateLbImage();

      lb.classList.remove("hidden");
      lb.classList.add("flex");
    }

    /* ==========================================================
       關閉 Lightbox
       ========================================================== */
    function closeLightbox() {
      lb.classList.add("hidden");
      lb.classList.remove("flex");

      if (fromDialog) dlg.showModal();
      fromDialog = false;
    }

    /* ==========================================================
       綁定事件（cats.html 行為）
       ========================================================== */
    if (dlgClose) dlgClose.addEventListener("click", () => dlg.close());

    if (dlgImg) dlgImg.addEventListener("click", () => openLightbox(index));

    if (lbPrev) lbPrev.addEventListener("click", (e) => {
      e.stopPropagation();
      lbShow(-1);
    });

    if (lbNext) lbNext.addEventListener("click", (e) => {
      e.stopPropagation();
      lbShow(1);
    });

    if (lbBackdrop) lbBackdrop.addEventListener("click", () => closeLightbox());

    /* ---- 背景任意點擊關閉（cats.html 行為） ---- */
    lb.addEventListener("click", (e) => {
      const imgClick = e.target === lbImg;
      const arrow = e.target === lbPrev || e.target === lbNext;
      const thumbs = lbThumbsInner.contains(e.target);

      if (!imgClick && !arrow && !thumbs) closeLightbox();
    });

    /* ---- 鍵盤 ---- */
    window.addEventListener("keydown", (e) => {
      if (lb.classList.contains("hidden")) return;
      if (e.key === "Escape") closeLightbox();
      if (e.key === "ArrowLeft") lbShow(-1);
      if (e.key === "ArrowRight") lbShow(1);
    });

    /* ---- 手勢滑動 ---- */
    let touchStartX = 0;
    lb.addEventListener("touchstart", (e) => {
      touchStartX = e.changedTouches[0].clientX;
    });

    lb.addEventListener("touchend", (e) => {
      const dx = e.changedTouches[0].clientX - touchStartX;
      if (Math.abs(dx) > 50) {
        if (dx < 0) lbShow(1);
        else lbShow(-1);
      }
    });

    /* ==========================================================
       對外 API
       ========================================================== */
    return {
      /**
       * 設定圖片，並建立縮圖
       */
      setImages(arr) {
        images = arr || [];
        index = 0;
        buildDlgThumbs();
        updateMainImage();
      },

      /**
       * 打開 Lightbox（從主圖點擊觸發時用不到）
       */
      openLightbox(index = 0) {
        openLightbox(index);
      }
    };
  }

  global.ModalLightbox = { create: createModalLightbox };

})(window);
