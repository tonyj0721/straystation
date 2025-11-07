
window.App = {
  PAGE: null,
  init(){
    this.PAGE = (location.pathname.split('/').pop() || 'index.html');
    this.bindNavLoginLink();
    if(this.PAGE === '' || this.PAGE === 'index.html'){ this.initHome(); }
    if(this.PAGE === 'admin.html'){ this.initAdmin(); }
    if(this.PAGE === 'cats.html'){ this.initList('cat'); }
    if(this.PAGE === 'dogs.html'){ this.initList('dog'); }
    if(this.PAGE === 'adopt.html'){ this.initAdopt(); }
  },
  bindNavLoginLink(){
    const link = document.getElementById('adminLoginLink');
    if(link){
      link.addEventListener('click', (e)=>{
        if(!location.pathname.endsWith('admin.html')) return;
        e.preventDefault();
        document.getElementById('googleSignInBtn')?.click();
      });
    }
  },
  async initHome(){
    const list = await DataService.listAnimals();
    const cats = list.filter(x=>x.type==='cat').slice(0,5);
    const dogs = list.filter(x=>x.type==='dog').slice(0,5);
    document.getElementById('homeCats').innerHTML = cats.map(a=>UI.cardHtml(a)).join('') || '<div class="helper">目前沒有貓咪資料</div>';
    document.getElementById('homeDogs').innerHTML = dogs.map(a=>UI.cardHtml(a)).join('') || '<div class="helper">目前沒有狗狗資料</div>';
  },
  async initAdmin(){
    const typeSel = document.getElementById('aType');
    const mainSel = document.getElementById('aBreedMain');
    const subSel = document.getElementById('aBreedSub');
    const dicts = {
      cat: DataService.getBreedsFor('cat'),
      dog: DataService.getBreedsFor('dog')
    };
    const fill = () => {
      const type = typeSel.value;
      const dict = dicts[type];
      mainSel.innerHTML = Object.keys(dict).map(k=>`<option value="${k}">${k}</option>`).join('');
      const first = Object.keys(dict)[0];
      subSel.innerHTML = dict[first].map(x=>`<option value="${x}">${x}</option>`).join('');
    };
    typeSel.onchange = fill; fill();
    mainSel.onchange = ()=>{
      const dict = dicts[typeSel.value];
      subSel.innerHTML = dict[mainSel.value].map(x=>`<option>${x}</option>`).join('');
    };

    const list = await DataService.listAnimals();
    const tbody = document.getElementById('adminTable');
    tbody.innerHTML = list.map(a=>`<tr onclick="UI.openModal('${a.id}')"><td>${a.name}</td><td>${a.type==='cat'?'貓':'狗'}</td><td>${a.breedMain}/${a.breedSub||'-'}</td></tr>`).join('') || '<tr><td colspan="3">尚無資料</td></tr>';
  },
  async submitAnimal(){
    if(!window.Auth.isSignedIn()){
      if(!confirm("尚未登入，仍要新增嗎？（若使用 GitHub 上傳需要權杖）")) return;
    }
    const payload = {
      name: document.getElementById('aName').value.trim(),
      type: document.getElementById('aType').value,
      breedMain: document.getElementById('aBreedMain').value,
      breedSub: document.getElementById('aBreedSub').value,
      ageText: document.getElementById('aAgeText').value.trim(),
      gender: document.getElementById('aGender').value,
      desc: document.getElementById('aDesc').value.trim()
    };
    const files = Array.from(document.getElementById('aPhotos').files || []).slice(0,6);
    await DataService.createAnimal(payload, files);
    UI.toast("已新增！"); location.reload();
  },
  startEdit(id){
    DataService.getAnimal(id).then(a=>{
      document.getElementById('aName').value = a.name;
      document.getElementById('aType').value = a.type;
      document.getElementById('aAgeText').value = a.ageText || '';
      document.getElementById('aGender').value = a.gender || '未知';
      document.getElementById('aDesc').value = a.desc || '';

      const dict = DataService.getBreedsFor(a.type);
      const mainSel = document.getElementById('aBreedMain');
      const subSel = document.getElementById('aBreedSub');
      mainSel.innerHTML = Object.keys(dict).map(k=>`<option ${k===a.breedMain?'selected':''}>${k}</option>`).join('');
      subSel.innerHTML = (dict[a.breedMain]||[]).map(x=>`<option ${x===a.breedSub?'selected':''}>${x}</option>`).join('');

      const btn = document.querySelector('.panel .btn.primary');
      btn.textContent = "儲存變更";
      btn.onclick = async ()=>{
        await DataService.updateAnimal(a.id, {
          name: document.getElementById('aName').value.trim(),
          type: document.getElementById('aType').value,
          breedMain: document.getElementById('aBreedMain').value,
          breedSub: document.getElementById('aBreedSub').value,
          ageText: document.getElementById('aAgeText').value.trim(),
          gender: document.getElementById('aGender').value,
          desc: document.getElementById('aDesc').value.trim()
        });
        UI.toast("已更新！"); location.reload();
      };
    });
  },
  async initList(type){
    const breedSel = document.getElementById('filterBreed');
    const dict = DataService.getBreedsFor(type);
    const options = ['（全部品種）'].concat(Object.entries(dict).flatMap(([main,subs])=> subs.map(sub=>`${main}/${sub}`)));
    breedSel.innerHTML = options.map((o,i)=>`<option value="${i===0?'':o}">${o}</option>`).join('');

    const render = async () => {
      const list = (await DataService.listAnimals()).filter(x=>x.type===type);
      const gender = document.getElementById('filterGender').value;
      const ageRange = document.getElementById('filterAgeRange').value;
      const breed = document.getElementById('filterBreed').value;

      const filtered = list.filter(a=>{
        let ok = true;
        if(gender) ok = ok && a.gender===gender;
        if(breed) ok = ok && (`${a.breedMain}/${a.breedSub||''}` === breed);
        if(ageRange){
          const t = a.ageText || "";
          const n = parseFloat((t.match(/[\d\.]+/)||['0'])[0]);
          if(ageRange==='1歲以下') ok = ok && (n<1);
          if(ageRange==='1~5歲') ok = ok && (n>=1 && n<=5);
          if(ageRange==='5~10歲') ok = ok && (n>5 && n<=10);
          if(ageRange==='10歲以上') ok = ok && (n>10);
        }
        return ok;
      });
      const target = document.getElementById(type==='cat'?'catsList':'dogsList');
      target.innerHTML = filtered.map(a=>UI.cardHtml(a)).join('') || '<div class="helper">目前沒有資料</div>';
    };
    document.getElementById('filterGender').onchange = render;
    document.getElementById('filterAgeRange').onchange = render;
    document.getElementById('filterBreed').onchange = render;
    render();
  },
  async initAdopt(){
    const params = new URLSearchParams(location.search);
    const id = params.get('animalId');
    let name = '';
    if(id){
      try { name = (await DataService.getAnimal(id)).name; } catch(e){}
    }
    document.getElementById('adoptTitle').textContent = `我要領養 ${name || ''}`.trim();
  },
  async submitAdopt(){
    const params = new URLSearchParams(location.search);
    const id = params.get('animalId');
    let animalName = '';
    if(id){
      try { animalName = (await DataService.getAnimal(id)).name; } catch(e){}
    }
    const lines = [
      `我要領養：${animalName}`,
      `姓名：${document.getElementById('fName').value}`,
      `年齡：${document.getElementById('fAge').value}`,
      `居住地：${document.getElementById('fLocation').value}`,
      `居住環境：${document.getElementById('fHousing').value}`,
      `職業：${document.getElementById('fJob').value}`,
      `月收入：約 ${document.getElementById('fIncome').value}`,
      `家庭成員：${document.getElementById('fMembers').value}`,
      `家庭成員總人數：${document.getElementById('fMembersCount').value}`,
      `現居住狀況：${document.getElementById('fLiving').value}`,
      `同居成員：${document.getElementById('fCohabitants').value}`,
      `飼養寵物經驗：${document.getElementById('fExperience').value}`,
      `現有寵物狀況：${document.getElementById('fCurrentPets').value}`,
      `認養動機：${document.getElementById('fMotivation').value}`,
      `飼養方式：${document.getElementById('fCare').value}`,
      `飼養花費認知：${document.getElementById('fCosts').value}`,
      `環境參考連結：${document.getElementById('fEnvLink').value}`
    ];
    const text = lines.join('\n');
    try { await navigator.clipboard.writeText(text); UI.toast("已複製表單內容，將為您開啟 Messenger。"); }
    catch(e){ UI.toast("請手動複製後續訊息。"); }
    const PAGE = window.Auth?.FB_PAGE || "yourpageusername";
    location.href = `https://m.me/${encodeURIComponent(PAGE)}`;
  }
};
window.addEventListener('DOMContentLoaded', ()=> App.init());
