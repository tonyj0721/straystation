
window.Auth = {
  signedIn: false,
  FB_PAGE: "yourpageusername",
  isSignedIn(){ return this.signedIn; },
  init(){
    const btn = document.getElementById('googleSignInBtn');
    if(btn){ btn.addEventListener('click', ()=> this.signIn()); }
  },
  async signIn(){
    this.signedIn = true;
    const el = document.getElementById('loginStatus');
    if(el){ el.textContent = '已登入'; el.classList.add('new'); }
    alert("已以示意方式登入（正式環境請串接 Google Identity Services）。");
  }
};
window.addEventListener('DOMContentLoaded', ()=> Auth.init());
