// === Firebase 初始化 ===
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getFirestore, collection, query, where, orderBy, limit, getDocs } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

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

// === Firestore 抓資料 ===
async function getLatestAnimals(type) {
  const q = query(
    collection(db, "pets"),
    where("type", "==", type),
    orderBy("createdAt", "desc"),
    limit(5)
  );
  const snapshot = await getDocs(q);
  const animals = [];
  snapshot.forEach(doc => {
    animals.push({ id: doc.id, ...doc.data() });
  });
  return animals;
}

// === 卡片模板 ===
function renderAnimalCard(animal) {
  const imgSrc =
    animal.imageUrls && animal.imageUrls.length > 0
      ? animal.imageUrls[0]
      : "assets/default.jpg";

  const breedText =
    animal.breedMain === "米克斯"
      ? `${animal.breedMain}/${animal.breedSub}`
      : animal.breedSub || animal.breedMain;

  return `
    <div class="card">
      <img src="${imgSrc}" alt="${animal.name}" class="card-img" style="width:100%;height:200px;object-fit:cover;border-radius:10px;">
      <div class="card-body">
        <h3>${animal.name}</h3>
        <p>${breedText || ""}</p>
        <p>${animal.age || ""}・${animal.gender || ""}</p>
        <button onclick="location.href='adopt.html?id=${animal.id}'" class="btn">我要領養</button>
      </div>
    </div>
  `;
}

// === 渲染到頁面 ===
async function renderHomePage() {
  try {
    const catsContainer = document.getElementById("homeCats");
    const dogsContainer = document.getElementById("homeDogs");
    if (!catsContainer || !dogsContainer) return;

    const [cats, dogs] = await Promise.all([
      getLatestAnimals("貓"),
      getLatestAnimals("狗")
    ]);

    catsContainer.innerHTML = cats.length
      ? cats.map(renderAnimalCard).join("")
      : "<p>目前沒有貓咪資料 🐱</p>";

    dogsContainer.innerHTML = dogs.length
      ? dogs.map(renderAnimalCard).join("")
      : "<p>目前沒有狗狗資料 🐶</p>";
  } catch (error) {
    console.error("載入動物資料失敗：", error);
  }
}

// === 手機排版支援 ===
window.addEventListener("DOMContentLoaded", () => {
  renderHomePage();
});
