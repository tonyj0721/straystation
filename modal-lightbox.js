// modal-lightbox.js
(function (global) {
  function createModalLightbox(options) {
    options = options || {};

    const dlg = document.getElementById(options.dialogId || 'petDialog');
    const dlgImg = document.getElementById(options.dlgImgId || 'dlgImg');
    const dlgBg = document.getElementById(options.dlgBgId || 'dlgBg');
    const dlgThumbs = document.getElementById(options.dlgThumbsId || 'dlgThumbs');
    const dlgClose = document.getElementById(options.dlgCloseId || 'dlgClose');

    const lb = document.getElementById(options.lightboxId || 'lightbox');
    const lbImg = document.getElementById(options.lbImgId || 'lbImg');
    const lbPrev = document.getElementById(options.lbPrevId || 'lbPrev');
    const lbNext = document.getElementById(options.lbNextId || 'lbNext');
    const lbThumbsInner = document.getElementById(options.lbThumbsInnerId || 'lbThumbsInner');
    const lbBackdrop = document.getElementById(options.lbBackdropId || 'lbBackdrop'); // cats 沒這個，admin 有

    let lbImages = [];
    let lbIndex = 0;
    let dlgWasOpenForLb = false;

    // --- 主圖 + modal 縮圖 ---

    function setMainImage(index) {
      if (!lbImages.length) return;
      lbIndex = index;
      const src = lbImages[index];

      if (dlgImg) dlgImg.src = src;
      if (dlgBg) dlgBg.src = src;

      if (dlgThumbs) {
        dlgThumbs.querySelectorAll('.dlg-thumb').forEach((el, i) => {
          el.classList.toggle('active', i === index);
        });
      }
    }

    function buildThumbs(images) {
      lbImages = (images || []).slice();

      if (!dlgThumbs) return;
      dlgThumbs.innerHTML = '';

      lbImages.forEach((url, i) => {
        const img = document.createElement('img');
        img.src = url;
        img.alt = '縮圖';
        img.className = 'dlg-thumb' + (i === 0 ? ' active' : '');
        img.addEventListener('click', () => {
          setMainImage(i);
        });
        dlgThumbs.appendChild(img);
      });

      if (lbImages.length) {
        setMainImage(0);
      } else {
        if (dlgImg) dlgImg.src = '';
        if (dlgBg) dlgBg.src = '';
      }
    }

    // --- Lightbox 縮圖列 ---

    function buildLbThumbs() {
      if (!lbThumbsInner) return;
      lbThumbsInner.innerHTML = '';

      lbImages.forEach((url, i) => {
        const t = document.createElement('img');
        t.src = url;
        if (i === lbIndex) t.classList.add('active');
        t.addEventListener('click', (e) => {
          e.stopPropagation();
          showInLightbox(i);
        });
        lbThumbsInner.appendChild(t);
      });
    }

    function showInLightbox(index) {
      if (!lbImages.length) return;
      lbIndex = (index + lbImages.length) % lbImages.length;
      if (lbImg) lbImg.src = lbImages[lbIndex];
      buildLbThumbs();
    }

    // --- 開關 Lightbox ---

    function openLightbox(startIndex) {
      if (!lb || !lbImages.length) return;

      dlgWasOpenForLb = !!(dlg && dlg.open);
      if (dlg && dlg.open) dlg.close();

      lb.classList.remove('hidden');
      lb.classList.add('flex');

      const idx = typeof startIndex === 'number' ? startIndex : lbIndex;
      showInLightbox(idx);
    }

    function closeLightbox() {
      if (!lb) return;

      lb.classList.add('hidden');
      lb.classList.remove('flex');

      if (dlgWasOpenForLb && dlg && typeof dlg.showModal === 'function') {
        dlg.showModal();
      }
      dlgWasOpenForLb = false;
    }

    // --- 綁定事件 ---

    if (dlgClose && dlg) {
      dlgClose.addEventListener('click', () => {
        dlg.close();
      });
    }

    if (dlgImg && lb) {
      dlgImg.addEventListener('click', () => {
        openLightbox(lbIndex);
      });
    }

    if (lbPrev) {
      lbPrev.addEventListener('click', (e) => {
        e.stopPropagation();
        showInLightbox(lbIndex - 1);
      });
    }

    if (lbNext) {
      lbNext.addEventListener('click', (e) => {
        e.stopPropagation();
        showInLightbox(lbIndex + 1);
      });
    }

    if (lbBackdrop) {
      lbBackdrop.addEventListener('click', closeLightbox);
    }

    if (lb) {
      lb.addEventListener('click', (e) => {
        const clickOnImage = e.target === lbImg;
        const clickOnArrow = e.target === lbPrev || e.target === lbNext;
        const clickOnThumbs = lbThumbsInner && lbThumbsInner.contains(e.target);

        // 點到最外層容器，或點到黑底空白區，就關閉
        if (e.target === lb) {
          closeLightbox();
        } else if (!clickOnImage && !clickOnArrow && !clickOnThumbs) {
          closeLightbox();
        }
      });
    }

    // 鍵盤：Esc / 左右鍵
    window.addEventListener('keydown', (e) => {
      if (!lb || lb.classList.contains('hidden')) return;
      if (e.key === 'Escape') {
        closeLightbox();
      } else if (e.key === 'ArrowLeft') {
        showInLightbox(lbIndex - 1);
      } else if (e.key === 'ArrowRight') {
        showInLightbox(lbIndex + 1);
      }
    });

    // 手勢左右滑
    if (lb) {
      let touchX = null;
      lb.addEventListener(
        'touchstart',
        (e) => {
          if (!e.touches.length) return;
          touchX = e.touches[0].clientX;
        },
        { passive: true }
      );
      lb.addEventListener(
        'touchend',
        (e) => {
          if (touchX == null) return;
          const dx = e.changedTouches[0].clientX - touchX;
          if (Math.abs(dx) > 50) {
            if (dx < 0) showInLightbox(lbIndex + 1);
            else showInLightbox(lbIndex - 1);
          }
          touchX = null;
        },
        { passive: true }
      );
    }

    // --- 對外 API ---

    return {
      /**
       * 設定這次 modal 要用的圖片陣列，同時建立縮圖＋主圖
       * @param {string[]} images
       */
      setImages(images) {
        buildThumbs(images || []);
      },
      /**
       * 從指定 index 開啟 lightbox（通常用不到，預設點主圖就會開）
       */
      openLightboxFrom(index) {
        openLightbox(typeof index === 'number' ? index : 0);
      },
      /**
       * 取得目前索引
       */
      getCurrentIndex() {
        return lbIndex;
      },
      /**
       * 取得目前圖片清單
       */
      getImages() {
        return lbImages.slice();
      }
    };
  }

  global.ModalLightbox = { create: createModalLightbox };
})(window);
