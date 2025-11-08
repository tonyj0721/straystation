// assets/js/app.js (module)
import { db, collection, query, where, orderBy, limit, getDocs } from './firebase.js';
import { UI } from './ui.js';

async function fetchPets(type, max=5){
  // 只用 createdAt desc，避免觸發複合索引
  const q = query(collection(db,'pets'), where('type','==',type), orderBy('createdAt','desc'), limit(max));
  const snap = await getDocs(q);
  return snap.docs.map(d=>({id:d.id, ...d.data()}));
}

async function loadHome(){
  const [cats, dogs] = await Promise.all([fetchPets('貓',5), fetchPets('狗',5)]);
  const hc = document.getElementById('homeCats');
  const hd = document.getElementById('homeDogs');
  if(hc){ hc.innerHTML=''; cats.forEach(p=> hc.appendChild(UI.card(p,()=>UI.openModal(p)))); }
  if(hd){ hd.innerHTML=''; dogs.forEach(p=> hd.appendChild(UI.card(p,()=>UI.openModal(p)))); }
  // 點 backdrop 關閉
  window.addEventListener('click', e=>{ if(e.target.id==='animalModalBackdrop') UI.closeModal(); });
}

async function loadList(){
  // 取最近 50 筆，交給前端篩選（避免索引）
  const q = query(collection(db,'pets'), orderBy('createdAt','desc'), limit(50));
  const snap = await getDocs(q);
  const arr = snap.docs.map(d=>({id:d.id, ...d.data()}));
  document.dispatchEvent(new CustomEvent('petsLoaded', {detail:arr}));
}

if(document.getElementById('homeCats') || document.getElementById('homeDogs')) loadHome();
if(document.getElementById('listCats') || document.getElementById('listDogs')) loadList();
