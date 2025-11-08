
export const UI = {
  toggleMenu(){
    const m = document.getElementById('mobileMenu');
    if(!m) return;
    m.style.display = (m.style.display==='block') ? 'none' : 'block';
  },
  breedText(main, sub){
    if(!main) return '';
    if(main==='米克斯' && sub) return `米克斯/${sub}`;
    if((main==='品種貓' || main==='品種犬') && sub) return sub;
    return main;
  },
  card(animal){
    const img = (animal.imageUrls && animal.imageUrls.length) ? animal.imageUrls[0] : 'assets/img/placeholder.jpg';
    const breed = UI.breedText(animal.breedMain, animal.breedSub);
    const gender = animal.gender || '';
    const age = animal.age || '';
    return `<div class="card" data-id="${animal.id}">
      <img src="${img}" alt="${animal.name||''}">
      <div class="card-body">
        <div><span class="badge">${animal.type||''}</span></div>
        <h3 style="margin:.4rem 0">${animal.name||''}</h3>
        <div style="color:#475569">${breed||''}</div>
        <div style="color:#64748b;font-size:14px">${age}${gender?'・'+gender:''}</div>
      </div>
    </div>`;
  },
  openModal(data){
    const b = document.getElementById('animalModalBackdrop');
    const hero = document.getElementById('modalHero');
    const thumbs = document.getElementById('modalThumbs');
    document.getElementById('modalName').textContent = data.name || '';
    document.getElementById('modalMeta').innerHTML = `
      <span class="badge">${data.type||''}</span>
      <span class="badge">${UI.breedText(data.breedMain, data.breedSub)}</span>
      <span class="badge">${data.age||''}</span>
      <span class="badge">${data.gender||''}</span>`;
    document.getElementById('modalDesc').textContent = data.desc || '';
    const imgs = Array.isArray(data.imageUrls)? data.imageUrls:[];
    hero.src = imgs[0] || 'assets/img/placeholder.jpg';
    thumbs.innerHTML='';
    imgs.forEach((u,i)=>{
      const im=document.createElement('img'); im.src=u; if(i===0) im.classList.add('active');
      im.onclick=()=>{ hero.src=u; [...thumbs.children].forEach(x=>x.classList.remove('active')); im.classList.add('active');};
      thumbs.appendChild(im);
    });
    b.classList.add('active'); document.body.style.overflow='hidden';
    const adopt = document.getElementById('adoptBtn');
    if(adopt) adopt.href = `adopt.html?id=${data.id}`;
  },
  closeModal(){ document.getElementById('animalModalBackdrop').classList.remove('active'); document.body.style.overflow=''; }
};
window.UI = UI;
