
window.UI = {
  toggleMenu(){
    document.getElementById('mobileMenu')?.classList.toggle('show');
  },
  toast(msg){ alert(msg); },
  cardHtml(a, {showManage=false}={}){
    const img = (a.photos && a.photos[0]) ? `<img src="${a.photos[0]}" alt="${a.name}">` : `<div class="thumb">無照片</div>`;
    return `
    <div class="card" onclick="window.UI.openModal('${a.id}')">
      <div class="thumb">${img}</div>
      <div class="content">
        <div class="title">${a.name}</div>
        <div class="meta">${a.type === 'cat' ? '貓' : '狗'} · ${a.breedMain}/${a.breedSub || '-'}</div>
        <div class="meta">${a.ageText || ''} · ${a.gender || ''}</div>
        <div class="actions">
          ${showManage ? '' : `<a class="btn primary" href="adopt.html?animalId=${encodeURIComponent(a.id)}">我要領養</a>`}
          ${showManage ? `<span class="badge">管理</span>` : ''}
        </div>
      </div>
    </div>`;
  },
  async openModal(id){
    const a = await window.DataService.getAnimal(id);
    const hero = document.getElementById('modalHero');
    const thumbs = document.getElementById('modalThumbs');
    const name = document.getElementById('modalName');
    const meta = document.getElementById('modalMeta');
    const desc = document.getElementById('modalDesc');
    const actions = document.getElementById('modalActions');
    const editBtn = document.getElementById('modalEditBtn');
    const delBtn = document.getElementById('modalDeleteBtn');

    name.textContent = a.name;
    meta.textContent = `${a.type === 'cat' ? '貓' : '狗'} · ${a.breedMain}/${a.breedSub || '-'} · ${a.ageText || ''} · ${a.gender || ''}`;
    desc.textContent = a.desc || '';

    const list = a.photos || [];
    hero.src = list[0] || '';
    thumbs.innerHTML = (list.map((u,i)=>`<img src="${u}" class="${i===0?'active':''}" onclick="(function(){document.getElementById('modalHero').src='${u}'; Array.from(document.querySelectorAll('#modalThumbs img')).forEach(x=>x.classList.remove('active')); this.classList.add('active');}).call(this)">`).join(''));

    actions.innerHTML = `<a class="btn primary" href="adopt.html?animalId=${encodeURIComponent(a.id)}">我要領養</a>`;

    const isAdminPage = location.pathname.endsWith('admin.html');
    editBtn.style.display = isAdminPage ? 'grid' : 'none';
    delBtn.style.display = isAdminPage ? 'grid' : 'none';
    editBtn.onclick = () => { window.App.startEdit(id); };
    delBtn.onclick = async () => {
      if(confirm('確定要刪除此動物資料？')){
        await window.DataService.deleteAnimal(id);
        UI.closeModal();
        window.location.reload();
      }
    };

    document.getElementById('animalModalBackdrop')?.classList.add('show');
  },
  closeModal(){ document.getElementById('animalModalBackdrop')?.classList.remove('show'); }
};
