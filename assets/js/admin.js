// assets/js/admin.js (module)
import {
  db, auth, provider, signInWithPopup, signOut, onAuthStateChanged,
  collection, doc, addDoc, setDoc, getDocs, getDoc, updateDoc, deleteDoc, serverTimestamp, query, orderBy,
  storage, ref, uploadBytes, getDownloadURL
} from './firebase.js';

const ADMINS = new Set(["tonyj0721@gmail.com","cookiech0926@gmail.com"]);
const qs = (s,p=document)=>p.querySelector(s);
const qsa = (s,p=document)=>[...p.querySelectorAll(s)];

const state = { user:null, list:[] };

function guard(){
  if(!state.user || !ADMINS.has(state.user.email)) throw new Error('no-permission');
}
function setAuthUI(){
  const as = qs('#authState');
  const lb = qs('#loginBtn'), lo = qs('#logoutBtn');
  if(state.user){
    as.textContent = `已登入：${state.user.email}`;
    lb.style.display='none'; lo.style.display='';
  }else{
    as.textContent = '尚未登入';
    lb.style.display=''; lo.style.display='none';
  }
}
function bindAuth(){
  qs('#loginBtn').onclick = async ()=>{
    try{ await signInWithPopup(auth, provider); }catch(e){ alert('登入失敗'); }
  };
  qs('#logoutBtn').onclick = ()=>signOut(auth);
  onAuthStateChanged(auth, u=>{ state.user=u; setAuthUI(); renderTable(); });
}

function buildBreedSelects(){
  const main = qs('#breedMain'), sub = qs('#breedSub'), type = qs('#type');
  const map = {
    貓:{'品種貓':['美短','英短','藍貓','暹羅貓','波斯貓','布偶貓','曼赤肯'],'米克斯':['橘貓','黑貓','虎斑貓','白底虎斑貓','三花貓','玳瑁貓','白貓']},
    狗:{'品種犬':['博美','貴賓','吉娃娃','馬爾濟斯','柯基','柴犬','哈士奇','高山犬','黃金獵犬'],'米克斯':['黑色','白色','黃色','棕色','虎斑','花花']}
  };
  const fillMain=()=>{
    main.innerHTML='';
    Object.keys(map[type.value]).forEach(k=> main.innerHTML+=`<option>${k}</option>`);
    fillSub();
  };
  const fillSub=()=>{
    sub.innerHTML='';
    (map[type.value][main.value]||[]).forEach(k=> sub.innerHTML+=`<option>${k}</option>`);
  };
  type.addEventListener('change', fillMain);
  main.addEventListener('change', fillSub);
  fillMain();
}

async function uploadImages(petId, files){
  const urls=[];
  for(let i=0;i<Math.min(files.length,6);i++){
    const f = files[i];
    const r = ref(storage, `pets/${petId}/${Date.now()}-${i}-${f.name}`);
    await uploadBytes(r, f);
    urls.push(await getDownloadURL(r));
  }
  return urls;
}

async function savePet(e){
  e.preventDefault();
  try{
    guard();
    const id = qs('#petId').value.trim();
    const payload = {
      name: qs('#name').value.trim(),
      type: qs('#type').value,
      breedMain: qs('#breedMain').value,
      breedSub: qs('#breedSub').value,
      age: qs('#age').value.trim(),
      gender: qs('#gender').value,
      desc: qs('#desc').value.trim(),
      available: true,
    };
    if(!id){
      // 新增
      const refDoc = await addDoc(collection(db,'pets'), {...payload, createdAt: serverTimestamp(), imageUrls:[]});
      const imgs = qs('#images').files;
      let urls = [];
      if(imgs.length) urls = await uploadImages(refDoc.id, imgs);
      await updateDoc(refDoc, { imageUrls: urls });
      resetForm();
    }else{
      // 編輯
      await updateDoc(doc(db,'pets',id), payload);
      const imgs = qs('#images').files;
      if(imgs.length){
        const urls = await uploadImages(id, imgs);
        await updateDoc(doc(db,'pets',id), { imageUrls: urls });
      }
      resetForm();
    }
    await reload();
  }catch(err){
    if(err.message==='no-permission') alert('你不是管理員，無權操作。');
    else alert('儲存失敗：'+err.message);
  }
}
function resetForm(){
  qs('#petForm').reset(); qs('#petId').value='';
}

async function reload(){
  const q = query(collection(db,'pets'), orderBy('createdAt','desc'));
  const snap = await getDocs(q);
  state.list = snap.docs.map(d=>({id:d.id, ...d.data()}));
  renderTable();
}

function renderTable(){
  const tb = qs('#petsTable tbody'); tb.innerHTML='';
  state.list.forEach(p=>{
    const tr = document.createElement('tr');
    const breed = p.breedMain==='米克斯'&&p.breedSub?`米克斯/${p.breedSub}`:(p.breedSub||p.breedMain||'');
    tr.innerHTML = `<td>${p.name||''}</td><td>${p.type||''}</td><td>${breed}</td><td>${p.available===false?'已領養':'—'}</td>`;
    tr.addEventListener('click', ()=>openModalForAdmin(p));
    tb.appendChild(tr);
  });
}

function fillForm(p){
  qs('#petId').value=p.id;
  qs('#name').value=p.name||'';
  qs('#type').value=p.type||'貓';
  const event = new Event('change'); qs('#type').dispatchEvent(event);
  qs('#breedMain').value=p.breedMain||qs('#breedMain').value;
  qs('#breedMain').dispatchEvent(new Event('change'));
  qs('#breedSub').value=p.breedSub||qs('#breedSub').value;
  qs('#age').value=p.age||'';
  qs('#gender').value=p.gender||'男生';
  qs('#desc').value=p.desc||'';
  window.scrollTo({top:0,behavior:'smooth'});
}

function openModalForAdmin(p){
  // 填入並開啟共用 Modal
  const bd = document.getElementById('animalModalBackdrop');
  const hero = document.getElementById('modalHero');
  const thumbs = document.getElementById('modalThumbs');
  const name = document.getElementById('modalName');
  const meta = document.getElementById('modalMeta');
  const desc = document.getElementById('modalDesc');
  const editBtn = document.getElementById('modalEditBtn');
  const delBtn = document.getElementById('modalDeleteBtn');
  const adoptBtn = document.getElementById('adoptedBtn');

  const pics = (p.imageUrls && p.imageUrls.length)? p.imageUrls : ['assets/img/placeholder.jpg'];
  hero.src = pics[0]; thumbs.innerHTML='';
  pics.forEach((u,i)=>{ const im=document.createElement('img'); im.src=u; if(i===0) im.classList.add('active'); im.onclick=()=>{hero.src=u; [...thumbs.children].forEach(c=>c.classList.remove('active')); im.classList.add('active');}; thumbs.appendChild(im);});
  name.textContent = p.name||'—';
  const breed = p.breedMain==='米克斯'&&p.breedSub?`米克斯/${p.breedSub}`:(p.breedSub||p.breedMain||'');
  meta.textContent = `${p.type||''}・${breed||''}・${p.age||''}・${p.gender||''}${p.available===false?'（已領養）':''}`;
  desc.textContent = p.desc||'';

  editBtn.onclick = ()=>{ fillForm(p); bd.classList.remove('show'); };
  delBtn.onclick = async ()=>{
    if(!confirm('確定刪除？')) return;
    try{ guard(); await deleteDoc(doc(db,'pets',p.id)); await reload(); bd.classList.remove('show'); }catch(e){ alert('刪除失敗'); }
  };
  adoptBtn.onclick = async ()=>{
    try{ guard(); await updateDoc(doc(db,'pets',p.id), {available: !(p.available!==false)}); await reload(); bd.classList.remove('show'); }catch(e){ alert('更新失敗'); }
  };

  bd.classList.add('show');
}

function bindModalClose(){
  window.addEventListener('click', e=>{ if(e.target.id==='animalModalBackdrop') document.getElementById('animalModalBackdrop').classList.remove('show'); });
}

function init(){
  bindAuth();
  buildBreedSelects();
  qs('#petForm').addEventListener('submit', savePet);
  qs('#resetBtn').addEventListener('click', resetForm);
  bindModalClose();
  reload();
}
window.UI = { closeModal(){ document.getElementById('animalModalBackdrop').classList.remove('show'); } };
init();
