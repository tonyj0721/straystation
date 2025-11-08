// assets/js/ui.js (module)
export const UI = {
  toggleMenu(){ document.getElementById('mobileMenu')?.classList.toggle('open'); },

  // 建卡片
  card(p, onClick){
    const el = document.createElement('div');
    el.className='card';
    const first = (p.imageUrls && p.imageUrls.length)? p.imageUrls[0] : 'assets/img/placeholder.jpg';
    const breed = p.breedMain === '米克斯' && p.breedSub ? `米克斯/${p.breedSub}` : (p.breedSub || p.breedMain || '');
    el.innerHTML = `
      <div class="img">${first?`<img src="${first}" alt="">`:'無照片'}</div>
      <div class="name">${p.name||'—'}</div>
      <div class="meta">${p.type||''}・${breed||''}</div>
      <div class="meta">${p.age||''}・${p.gender||''}</div>
      <div class="actions"><a class="btn" href="adopt.html?id=${p.id}">我要領養</a></div>`;
    el.addEventListener('click', e=>{
      // 點「我要領養」按鈕不要打開 modal
      if(e.target.closest('a.btn')) return;
      onClick?.();
    });
    return el;
  },

  // 開關 Modal（共用）
  openModal(p){
    const bd = document.getElementById('animalModalBackdrop');
    const hero = document.getElementById('modalHero');
    const thumbs = document.getElementById('modalThumbs');
    const name = document.getElementById('modalName');
    const meta = document.getElementById('modalMeta');
    const desc = document.getElementById('modalDesc');
    const actions = document.getElementById('modalActions');

    const pics = (p.imageUrls && p.imageUrls.length? p.imageUrls : ['assets/img/placeholder.jpg']);
    hero.src = pics[0];
    thumbs.innerHTML = '';
    pics.forEach((u,i)=>{
      const im = document.createElement('img'); im.src=u; if(i===0) im.classList.add('active');
      im.onclick=()=>{hero.src=u; [...thumbs.children].forEach(c=>c.classList.remove('active')); im.classList.add('active');};
      thumbs.appendChild(im);
    });
    name.textContent = p.name || '—';
    const breed = p.breedMain==='米克斯'&&p.breedSub?`米克斯/${p.breedSub}`:(p.breedSub||p.breedMain||'');
    meta.textContent = `${p.type||''}・${breed||''}・${p.age||''}・${p.gender||''}${p.available===false?'（已領養）':''}`;
    desc.textContent = p.desc || '';
    actions.innerHTML = `<a class="btn primary" href="adopt.html?id=${p.id}">我要領養</a>`;
    bd.classList.add('show');
  },
  closeModal(){ document.getElementById('animalModalBackdrop')?.classList.remove('show'); },

  // 列表頁初始化（Cats / Dogs）
  initListPage(which){
    window.addEventListener('click', e=>{ if(e.target.id==='animalModalBackdrop') UI.closeModal(); });
    // 次品種選單
    const subMap = which==='貓'
      ? { '品種貓':['美短','英短','藍貓','暹羅貓','波斯貓','布偶貓','曼赤肯'], '米克斯':['橘貓','黑貓','虎斑貓','白底虎斑貓','三花貓','玳瑁貓','白貓'] }
      : { '品種犬':['博美','貴賓','吉娃娃','馬爾濟斯','柯基','柴犬','哈士奇','高山犬','黃金獵犬'], '米克斯':['黑色','白色','黃色','棕色','虎斑','花花'] };

    const fMain = document.getElementById('fMain');
    const fSub  = document.getElementById('fSub');
    const fillSub=()=>{
      fSub.innerHTML='<option value="">次品種（全部）</option>';
      const arr = subMap[fMain.value]||[];
      arr.forEach(s=>fSub.innerHTML+=`<option>${s}</option>`);
    };
    fMain.addEventListener('change', fillSub); fillSub();

    // 交給 app.js 去載資料並套用篩選（用全域事件）
    document.addEventListener('petsLoaded', (ev)=>{
      const data = ev.detail || [];
      const out = data.filter(p=>{
        if(p.type!==which) return false;
        if(fMain.value && p.breedMain!==fMain.value) return false;
        if(fSub.value && p.breedSub!==fSub.value) return false;
        if(document.getElementById('fGender').value && p.gender!==document.getElementById('fGender').value) return false;
        const rage = document.getElementById('fAge').value;
        if(rage){
          const ageNum = (()=>{const m=/(\d+)\s*個?月/.exec(p.age||''); if(m) return (+m[1])/12; const y=/(\d+)\s*歲/.exec(p.age||''); if(y) return +y[1]; return NaN;})();
          if(!isNaN(ageNum)){
            if(rage==='<=1' && !(ageNum<=1)) return false;
            if(rage==='1-5' && !(ageNum>=1 && ageNum<5)) return false;
            if(rage==='5-10'&& !(ageNum>=5 && ageNum<10)) return false;
            if(rage==='>=10'&& !(ageNum>=10)) return false;
          }
        }
        return true;
      });
      const host = document.getElementById(which==='貓'?'listCats':'listDogs'); host.innerHTML='';
      out.forEach(p=> host.appendChild(UI.card(p,()=>UI.openModal(p))));
    });

  }
};
window.UI = UI; // 給非 module 的行為呼叫（例如 onclick）
