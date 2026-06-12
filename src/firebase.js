// src/firebase.js
import { initializeApp } from "firebase/app";
import { getFirestore, collection } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyCiXngRlbIKtXI26XWZBFjzUnmMHFIs6IE",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "mystic-lucky-draw.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "mystic-lucky-draw",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "mystic-lucky-draw.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "633487416451",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:633487416451:web:b9abf051d93000cb760fb6"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

// Convenient collection references
export const selectionsCol = collection(db, "selections");
export const logsCol = collection(db, "logs");
export const archivesCol = collection(db, "round_archives");
