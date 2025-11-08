
import { app, auth, provider, db, storage } from './firebase.js';
import { signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { collection, addDoc, serverTimestamp, getDocs, orderBy, query, doc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-storage.js";

const admins = ["tonyj0721@gmail.com", "cookiech0926@gmail.com"];
const el = (id)=>document.getElementById(id);
const breeds = {
  "貓": { main:["品種貓","米克斯"], sub:{ "品種貓":["美短","英短","藍貓","暹羅貓","波斯貓","布偶貓","曼赤肯"], "米克斯":["橘貓","黑貓","虎斑貓","白底虎斑貓","三花貓","玳瑁貓","白貓"] } },
  "狗": { main:["品種犬","米克斯"], sub:{ "品種犬":["博美","貴賓","吉娃娃","馬爾濟斯","柯基","柴犬","哈士奇","高山犬","黃金獵犬"], "米克斯":["黑色","白色","黃色","棕色","虎斑","花花"] } }
};
function fillMain(){ const t=el('fType').value; const m=el('fBreedMain'); const s=el('fBreedSub'); m.innerHTML='<option value="">請選擇</option>'; s.innerHTML='<option value="">請先選主品種</option>'; if(!t) return; breeds[t].main.forEach(v=>{ const o=document.createElement('option'); o.value=v; o.textContent=v; m.appendChild(o); }); }
function fillSub(){ const t=el('fType').value; const m=el('fBreedMain').value; const s=el('fBreedSub'); s.innerHTML='<option value="">請選擇</option>'; if(!t||!m) return; breeds[t].sub[m].forEach(v=>{ const o=document.createElement('option'); o.value=v; o.textContent=v; s.appendChild(o); }); }
el('fType')?.addEventListener('change', fillMain); el('fBreedMain')?.addEventListener('change', fillSub);

el('loginBtn')?.addEventListener('click', ()=> signInWithPopup(auth, provider));
el('loginBtn2')?.addEventListener('click', ()=> signInWithPopup(auth, provider));
el('logoutBtn')?.addEventListener('click', ()=> signOut(auth));

onAuthStateChanged(auth, async(u)=>{
  const gate=el('loginGate'), area=el('adminArea'), who=el('who');
  if(u && admins.includes(u.email)){ who.textContent=`已登入：${u.email}`; gate.style.display='none'; area.style.display='block'; await loadList(); }
  else{ who.textContent=''; gate.style.display='block'; area.style.display='none'; if(u && !admins.includes(u.email)) await signOut(auth); }
});

el('submitBtn')?.addEventListener('click', async()=>{
  const name=el('fName').value.trim(); const type=el('fType').value; const bm=el('fBreedMain').value; const bs=el('fBreedSub').value; const age=el('fAge').value.trim(); const gender=el('fGender').value; const desc=el('fDesc').value.trim(); const files=Array.from(el('fImages').files||[]).slice(0,6);
  if(!name||!type||!bm||!gender){ el('formMsg').textContent='請至少填：名字、類別、主品種、性別。'; return; }
  el('submitBtn').disabled=true; el('formMsg').textContent='上傳中…';
  try{
    const docRef = await addDoc(collection(db,'pets'), { name, type, breedMain: bm, breedSub: bs, age, gender, desc, imageUrls: [], available:true, createdAt: serverTimestamp() });
    const urls=[];
    for(const f of files){ const path = `pets/${docRef.id}/${Date.now()}_${f.name}`; const r = ref(storage, path); await uploadBytes(r,f); urls.push(await getDownloadURL(r)); }
    if(urls.length) await updateDoc(docRef, { imageUrls: urls });
    el('formMsg').textContent='新增完成！'; ['fName','fType','fBreedMain','fBreedSub','fAge','fGender','fDesc'].forEach(i=>el(i).value=''); el('fImages').value=''; fillMain(); await loadList();
  }catch(e){ alert('新增失敗：'+e.message); } finally{ el('submitBtn').disabled=false; }
});

async function loadList(){
  const body=el('listBody'); const hint=el('emptyHint'); body.innerHTML='';
  const snap = await getDocs(query(collection(db,'pets'), orderBy('createdAt','desc')));
  if(snap.empty){ hint.style.display='block'; return; } hint.style.display='none';
  snap.forEach(d=>{
    const v=d.data(); const tr=document.createElement('tr'); const breed=(v.breedMain==='米克斯'&&v.breedSub)?`米克斯/${v.breedSub}`:(v.breedSub||v.breedMain||''); tr.innerHTML=`<td data-label="名字">${v.name||''}</td><td data-label="類別">${v.type||''}</td><td data-label="品種">${breed}</td><td data-label="狀態">${v.available===false?'<span class="badge">已領養</span>':'—'}</td>`; tr.style.cursor='pointer'; tr.onclick=()=> openModal(d.id, v); body.appendChild(tr);
  });
}

let currentId=null, currentData=null;
function openModal(id, data){
  currentId=id; currentData=data;
  document.getElementById('modalTitle').textContent=data.name||'';
  document.getElementById('modalType').textContent=data.type||'';
  document.getElementById('modalBreed').textContent=(data.breedMain==='米克斯'&&data.breedSub)?`米克斯/${data.breedSub}`:(data.breedSub||data.breedMain||'');
  document.getElementById('modalAgeGender').textContent=`${data.age||''}${data.gender?'・'+data.gender:''}`;
  document.getElementById('modalDesc').textContent=data.desc||'';
  const hero=document.getElementById('modalHero'); const thumbs=document.getElementById('modalThumbs'); const imgs=Array.isArray(data.imageUrls)?data.imageUrls:[];
  hero.src=imgs[0]||'assets/img/placeholder.jpg'; thumbs.innerHTML='';
  imgs.forEach((u,i)=>{ const im=document.createElement('img'); im.src=u; if(i===0) im.classList.add('active'); im.onclick=()=>{ hero.src=u; [...thumbs.children].forEach(x=>x.classList.remove('active')); im.classList.add('active'); }; thumbs.appendChild(im); });
  document.querySelector('.modal-backdrop').classList.add('active');
  document.body.style.overflow='hidden';
}
function closeModal(){ document.querySelector('.modal-backdrop').classList.remove('active'); document.body.style.overflow=''; currentId=null; currentData=null; }
document.getElementById('closeBtn')?.addEventListener('click', closeModal);
document.querySelector('.modal-backdrop')?.addEventListener('click', (e)=>{ if(e.target.classList.contains('modal-backdrop')) closeModal(); });

document.getElementById('adoptedBtn')?.addEventListener('click', async()=>{
  if(!currentId) return; await updateDoc(doc(collection(db,'pets'), currentId), { available:false }); alert('已標記為已領養'); closeModal(); loadList();
});
document.getElementById('deleteBtn')?.addEventListener('click', async()=>{
  if(!currentId) return; if(!confirm('刪除此動物？（圖片請至 Storage 手動清理）')) return; await deleteDoc(doc(collection(db,'pets'), currentId)); alert('已刪除'); closeModal(); loadList();
});
document.getElementById('editBtn')?.addEventListener('click', ()=>{
  if(!currentData) return;
  document.getElementById('fName').value=currentData.name||'';
  document.getElementById('fType').value=currentData.type||''; fillMain();
  document.getElementById('fBreedMain').value=currentData.breedMain||''; fillSub();
  document.getElementById('fBreedSub').value=currentData.breedSub||'';
  document.getElementById('fAge').value=currentData.age||'';
  document.getElementById('fGender').value=currentData.gender||'';
  document.getElementById('fDesc').value=currentData.desc||'';
  closeModal(); window.scrollTo({top:0,behavior:'smooth'});
});
