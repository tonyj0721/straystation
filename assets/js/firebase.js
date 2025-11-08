// assets/js/firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getFirestore, collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc, serverTimestamp, query, where, orderBy, limit } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-storage.js";

export const firebaseConfig = {
  apiKey: "AIzaSyAoqT5ynGi7KlrCF7UZ0TrD4lbRR8T8lT0",
  authDomain: "straystation.firebaseapp.com",
  projectId: "straystation",
  storageBucket: "straystation.appspot.com",
  messagingSenderId: "611366379195",
  appId: "1:611366379195:web:ef5a632e88d8bba1d6139e",
  measurementId: "G-YBC0MQBC2F"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();
export const storage = getStorage(app);

// Firestore helpers
export {
  collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc,
  serverTimestamp, query, where, orderBy, limit,
  signInWithPopup, signOut, onAuthStateChanged,
  ref, uploadBytes, getDownloadURL
};
