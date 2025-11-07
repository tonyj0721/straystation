
const BREEDS = {
  cat: {
    "品種貓": ["美短","英短","藍貓","暹羅貓","波斯貓","布偶貓","曼赤肯"],
    "米克斯": ["橘貓","黑貓","虎斑貓","白底虎斑貓","三花貓","玳瑁貓","白貓"]
  },
  dog: {
    "品種犬": ["博美","貴賓","吉娃娃","馬爾濟斯","柯基","柴犬","哈士奇","高山犬","黃金獵犬"],
    "米克斯": ["黑色","白色","黃色","棕色","虎斑","花花"]
  }
};

const LS_KEYS = { animals: "ll-animals", ghConfig: "ll-gh-config" };
const sleep = ms => new Promise(r=>setTimeout(r, ms));
const b64 = async (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result.split(',')[1]);
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

const GitHub = {
  getConfig(){ try { return JSON.parse(localStorage.getItem(LS_KEYS.ghConfig)); } catch(e){ return null; } },
  saveConfig(cfg){ localStorage.setItem(LS_KEYS.ghConfig, JSON.stringify(cfg)); },
  headers(){
    const cfg = this.getConfig();
    if(!cfg?.token) throw new Error("尚未設定 GitHub Token");
    return { "Authorization": `Bearer ${cfg.token}`, "Accept": "application/vnd.github+json" };
  },
  async putContent(path, message, contentB64){
    const cfg = this.getConfig();
    const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${path}`;
    let sha;
    const head = await fetch(url, { headers: this.headers() });
    if(head.status === 200){ sha = (await head.json()).sha; }
    const res = await fetch(url, {
      method: "PUT",
      headers: { ...this.headers(), "Content-Type": "application/json" },
      body: JSON.stringify({ message, content: contentB64, branch: cfg.branch || "main", sha })
    });
    if(!res.ok){ throw new Error(await res.text()); }
    return res.json();
  },
  async deleteContent(path, message){
    const cfg = this.getConfig();
    const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${path}`;
    const info = await fetch(url, { headers: this.headers() });
    if(info.status !== 200) throw new Error("檔案不存在或無法讀取: " + path);
    const j = await info.json();
    const res = await fetch(url, {
      method: "DELETE",
      headers: { ...this.headers(), "Content-Type": "application/json" },
      body: JSON.stringify({ message, sha: j.sha, branch: (cfg.branch || "main") })
    });
    if(!res.ok) throw new Error(await res.text());
    return res.json();
  },
  rawUrl(path){
    const cfg = this.getConfig();
    const branch = encodeURIComponent(cfg?.branch || "main");
    return `https://raw.githubusercontent.com/${cfg.owner}/${cfg.repo}/${branch}/${path}`;
  }
};

window.DataService = {
  getBreedsFor(type){ return BREEDS[type]; },
  saveGitHubConfig(){
    const token = document.getElementById('ghToken').value.trim();
    const owner = document.getElementById('ghOwner').value.trim();
    const repo = document.getElementById('ghRepo').value.trim();
    const branch = (document.getElementById('ghBranch').value.trim()) || "main";
    GitHub.saveConfig({ token, owner, repo, branch });
    UI.toast("已儲存 GitHub 設定");
  },
  async listAnimals(){
    const cfg = GitHub.getConfig();
    if(cfg?.token && cfg?.owner && cfg?.repo){
      try{
        const url = GitHub.rawUrl("data/index.json");
        const res = await fetch(url + `?t=${Date.now()}`);
        if(res.ok){ return (await res.json()).sort((a,b)=> (b.createdAt||'').localeCompare(a.createdAt||'')); }
      }catch(e){}
    }
    const raw = localStorage.getItem(LS_KEYS.animals) || "[]";
    return JSON.parse(raw).sort((a,b)=> (b.createdAt||'').localeCompare(a.createdAt||''));
  },
  async getAnimal(id){
    const list = await this.listAnimals();
    const a = list.find(x=>x.id===id);
    if(a) return a;
    throw new Error("找不到動物資料");
  },
  async saveListToGitHub(list){
    const contentB64 = btoa(unescape(encodeURIComponent(JSON.stringify(list, null, 2))));
    await GitHub.putContent("data/index.json", "feat: update animals index", contentB64);
  },
  async createAnimal(payload, files){
    const id = `a_${Date.now()}`;
    const createdAt = new Date().toISOString();
    let photos = [];
    const cfg = GitHub.getConfig();
    if(cfg?.token && cfg?.owner && cfg?.repo && files?.length){
      for(let f of Array.from(files).slice(0,6)){
        const content = await b64(f);
        const safeName = encodeURIComponent(f.name.replace(/\s+/g,'_'));
        const path = `images/${id}/${safeName}`;
        await GitHub.putContent(path, `feat: upload image for ${id}`, content);
        photos.push(GitHub.rawUrl(path));
        await new Promise(r=>setTimeout(r,150));
      }
    }
    const record = { id, createdAt, photos, ...payload };
    let list = await this.listAnimals();
    list.unshift(record);
    if(cfg?.token && cfg?.owner && cfg?.repo){ await this.saveListToGitHub(list); }
    else { localStorage.setItem(LS_KEYS.animals, JSON.stringify(list)); }
    return record;
  },
  async updateAnimal(id, updates){
    let list = await this.listAnimals();
    const idx = list.findIndex(x=>x.id===id);
    if(idx<0) throw new Error("不存在");
    list[idx] = { ...list[idx], ...updates };
    const cfg = GitHub.getConfig();
    if(cfg?.token && cfg?.owner && cfg?.repo){ await this.saveListToGitHub(list); }
    else { localStorage.setItem(LS_KEYS.animals, JSON.stringify(list)); }
    return list[idx];
  },
  async deleteAnimal(id){
    let list = await this.listAnimals();
    const idx = list.findIndex(x=>x.id===id);
    if(idx<0) return;
    const removed = list.splice(idx,1)[0];
    const cfg = GitHub.getConfig();
    if(cfg?.token && cfg?.owner && cfg?.repo){ await this.saveListToGitHub(list); }
    else { localStorage.setItem(LS_KEYS.animals, JSON.stringify(list)); }
    return removed;
  }
};
