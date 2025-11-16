<script>
(()=> {
  const $ = s => document.querySelector(s);

  // 可被每頁覆寫的函式（init 時注入）
  let formatBreed = p => p.breedType?.includes('米克斯') ? `米克斯${p.breed?`/${p.breed}`:''}` : (p.breed||'—');
  let formatAge   = p => p.age || '年齡不詳';
  let onAdopt     = (p)=>{};
  let onShare     = (p)=>{};
  let fullscreenOnDesktop = false; // 預設關閉（穩定）

  // —— Lightbox ——（穩定簡版）
  const lb = $('#lightbox'), lbImg = $('#lbImg'), lbClose = $('#lbClose');
  function openLightbox(images, index=0){
    const arr = Array.isArray(images) ? images : (images?[images]:[]);
    const url = arr[index] || '';
    if (!url) return;
    lbImg.src = url;                  // 先設 src 再顯示，避免黑畫面
    lb.classList.remove('hidden');

    // 桌機才可選擇嘗試全螢幕
    if (fullscreenOnDesktop && !/iP(hone|ad|od)/.test(navigator.userAgent)) {
      try{ if(document.fullscreenEnabled && !document.fullscreenElement) lb.requestFullscreen(); }catch{}
    }
  }
  function closeLightbox(){
    lb.classList.add('hidden');
    lbImg.src = '';
    if (document.fullscreenElement) document.exitFullscreen();
  }
  lbClose?.addEventListener('click', closeLightbox);
  lb?.addEventListener('click', (e)=>{ if(e.target===lb) closeLightbox(); });

  // —— Modal 主流程 ——（照 cats.html 結構）
  function open(p){
    if(!p) return;
    const dlg = $('#petDialog');
    const imgs = Array.isArray(p.images)&&p.images.length ? p.images : (p.image?[p.image]:[]);
    const img0 = imgs[0] || '';

    const dlgImg = $('#dlgImg');
    dlgImg.src = img0;
    dlgImg.onclick = () => openLightbox(imgs, 0);

    const thumbs = $('#dlgThumbs');
    thumbs.innerHTML = '';
    imgs.forEach((url,i)=>{
      const t = document.createElement('img');
      t.src = url; t.className = 'dlg-thumb'+(i===0?' active':'');
      t.onclick = ()=>{
        dlgImg.src=url;
        hero?.style.setProperty('--bg', `url("${url}")`);   // ★ 新增
        thumbs.querySelectorAll('.dlg-thumb').forEach(x=>x.classList.remove('active'));
        t.classList.add('active');
      };
      thumbs.appendChild(t);
    });

    $('#dlgName').textContent = p.name || '未命名';
    const isDog = /(狗|犬)/.test(String(p.species||''));
    const sp = $('#dlgSpeciesPill');
    sp.textContent = isDog ? '狗狗' : '貓咪';
    sp.className = `pill ${isDog ? 'pill--dog' : 'pill--cat'}`;

    $('#dlgTagBreed').textContent  = formatBreed(p);
    $('#dlgTagAge').textContent    = formatAge(p);
    $('#dlgTagGender').textContent = p.gender || '—';
    $('#dlgDesc').textContent      = p.desc || '';

    $('#dlgAdopt').onclick = ()=> onAdopt(p);
    $('#dlgShare').onclick = ()=> onShare(p);

    document.documentElement.style.overflow='hidden';
    dlg.showModal();
    $('#dlgClose').onclick = ()=>{ dlg.close(); document.documentElement.style.overflow=''; };
    dlg.addEventListener('close', ()=>{ document.documentElement.style.overflow=''; }, { once:true });
  }

  function init(opts={}){
    if (opts.formatBreed) formatBreed = opts.formatBreed;
    if (opts.formatAge)   formatAge   = opts.formatAge;
    if (opts.onAdopt)     onAdopt     = opts.onAdopt;
    if (opts.onShare)     onShare     = opts.onShare;
    if (opts.fullscreenOnDesktop!=null) fullscreenOnDesktop = !!opts.fullscreenOnDesktop;
  }

  // 對外 API
  window.SiteModal = { init, open, openLightbox, closeLightbox };
})();
</script>

