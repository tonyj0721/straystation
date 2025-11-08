
import { db } from './firebase.js';
import { UI } from './ui.js';
import { collection, query, where, orderBy, limit, getDocs } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

async function getLatest(type, n=5){
  const q = query(collection(db,'pets'), where('type','==', type), orderBy('createdAt','desc'), limit(n));
  const snap = await getDocs(q);
  return snap.docs.map(d=>({id:d.id, ...d.data()}));
}

async function renderHome(){
  const catsWrap = document.getElementById('homeCats');
  const dogsWrap = document.getElementById('homeDogs');
  if(!catsWrap || !dogsWrap) return;
  try{
    const [cats, dogs] = await Promise.all([getLatest('貓',5), getLatest('狗',5)]);
    catsWrap.innerHTML = cats.map(UI.card).join('') || '<div class="helper">目前沒有貓咪資料</div>';
    dogsWrap.innerHTML = dogs.map(UI.card).join('') || '<div class="helper">目前沒有狗狗資料</div>';
    attachCardClicks(catsWrap, cats); attachCardClicks(dogsWrap, dogs);
  }catch(e){
    catsWrap.innerHTML = dogsWrap.innerHTML = `<div class="helper">載入失敗：${e.message}</div>`;
    console.error(e);
  }
}

function attachCardClicks(container, list){
  container.querySelectorAll('.card').forEach(card=>{
    const id = card.getAttribute('data-id');
    const data = list.find(x=>x.id===id);
    card.onclick = ()=> UI.openModal(data);
  });
}

async function renderList(type){
  const wrap = document.getElementById('listWrap');
  if(!wrap) return;
  const breedMainSel = document.getElementById('fBreedMain');
  const breedSubSel = document.getElementById('fBreedSub');
  const genderSel = document.getElementById('fGender');
  const ageSel = document.getElementById('fAgeRange');
  const run = async()=>{
    const base = await getLatest(type, 50);
    let list = base;
    const bm = breedMainSel.value, bs = breedSubSel.value, g = genderSel.value, ar = ageSel.value;
    if(bm) list = list.filter(x=>x.breedMain===bm);
    if(bs) list = list.filter(x=>x.breedSub===bs);
    if(g) list = list.filter(x=>x.gender===g);
    if(ar){
      const sset = {
        'lt1': ['月','不到1歲'],
        '1to5': ['1歲','2歲','3歲','4歲','5歲'],
        '5to10': ['6歲','7歲','8歲','9歲','10歲'],
        'gt10': ['10歲','11歲','12歲','13歲','14歲','15歲']
      };
      list = list.filter(x=>{
        const s = String(x.age||'');
        return sset[ar].some(k=>s.includes(k));
      });
    }
    wrap.innerHTML = list.map(UI.card).join('') || '<div class="helper">沒有符合條件的資料</div>';
    attachCardClicks(wrap, list);
  };
  [breedMainSel, breedSubSel, genderSel, ageSel].forEach(el=> el && el.addEventListener('change', run));
  await run();
}

window.addEventListener('DOMContentLoaded', ()=>{
  if(document.getElementById('homeCats')) renderHome();
  if(document.body.dataset.page==='cats') renderList('貓');
  if(document.body.dataset.page==='dogs') renderList('狗');
  document.getElementById('closeModal')?.addEventListener('click', UI.closeModal);
  document.getElementById('animalModalBackdrop')?.addEventListener('click', (e)=>{ if(e.target.id==='animalModalBackdrop') UI.closeModal(); });
});
