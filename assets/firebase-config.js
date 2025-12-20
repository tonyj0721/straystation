// assets/firebase-config.js
window.firebaseConfig = {
  apiKey: "AIzaSyCT9U9WETVOFb1rfIkjjjBVteS65Q-Xg1A",
  authDomain: "straystation.firebaseapp.com",
  projectId: "straystation",
  storageBucket: "straystation.firebasestorage.app",
  messagingSenderId: "611366379195",
  appId: "1:611366379195:web:ef5a632e88d8bba1d6139e",
};

// 允許登入管理後台的 Google 帳號白名單
window.firebaseAdminWhitelist = {
  // 精準 email 白名單（建議填真實帳號）
  emails: [
    "tonyj0721@gmail.com",
    "bbb@gmail.com",
    "ccc@gmail.com",
    "ddd@gmail.com",
    "eee@gmail.com",
    "fff@gmail.com",
  ],

  // 如果你有自家網域 (Google Workspace) 也可以直接整個網域開放
  // 沒有的話就留空陣列就好
  domains: [
    // "yourorg.com",
  ],
};