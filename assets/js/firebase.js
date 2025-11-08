
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-storage.js";

export const firebaseConfig = {
  apiKey: "AIzaSyAoqT5ynGi7KlrCF7UZ0TrD4lbRR8T8lT0",
  authDomain: "straystation.firebaseapp.com",
  projectId: "straystation",
  storageBucket: "straystation.appspot.com",
  messagingSenderId: "611366379195",
  appId: "1:611366379195:web:ef5a632e88d8bba1d6139e",
  measurementId: "G-YBC0MQBC2F"
};
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();
export const db = getFirestore(app);
export const storage = getStorage(app);
