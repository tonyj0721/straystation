// 除錯版 app.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js";
import { getFirestore, collection, getDocs, query, where, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAoqT5ynGi7KlrCF7UZ0TrD4lbRR8T8lT0",
  authDomain: "straystation.firebaseapp.com",
  projectId: "straystation",
  storageBucket: "straystation.appspot.com",
  messagingSenderId: "611366379195",
  appId: "1:611366379195:web:ef5a632e88d8bba1d6139e",
  measurementId: "G-YBC0MQBC2F"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function loadPets(type, containerId) {
  console.log("正在載入類型：", type);
  const container = document.getElementById(containerId);
  container.innerHTML = "🔄 載入中...";

  try {
    const petsQuery = query(
      collection(db, "pets"),
      where("type", "==", type),
      orderBy("createdAt", "desc"),
      limit(6)
    );

    const querySnapshot = await getDocs(petsQuery);

    console.log(`找到 ${querySnapshot.size} 筆 ${type} 資料`);
    container.innerHTML = "";

    if (querySnapshot.empty) {
      container.innerHTML = `<p>目前沒有${type}的送養資料。</p>`;
      return;
    }

    querySnapshot.forEach((doc) => {
      const data = doc.data();
      console.log("讀取資料：", data);

      const imageUrl = data.imageUrls && data.imageUrls.length > 0 ? data.imageUrls[0] : "assets/images/no-image.png";
      const petCard = `
        <div class="card">
          <img src="${imageUrl}" alt="${data.name}" class="pet-image" />
          <div class="card-body">
            <h3>${data.name || "未命名"}</h3>
            <p>${data.breedMain || ""}${data.breedSub ? "／" + data.breedSub : ""}</p>
            <p>${data.gender || ""}・${data.age || ""}</p>
          </div>
        </div>`;
      container.insertAdjacentHTML("beforeend", petCard);
    });
  } catch (error) {
    console.error("載入 Firestore 資料失敗：", error);
    container.innerHTML = `<p>資料載入錯誤：${error.message}</p>`;
  }
}

loadPets("貓", "homeCats");
loadPets("狗", "homeDogs");
