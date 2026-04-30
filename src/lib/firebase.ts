// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDR32A5W0ZlL10ZYHEj0lBao0RMt3d6FME",
  authDomain: "flashconcards-b52d0.firebaseapp.com",
  projectId: "flashconcards-b52d0",
  storageBucket: "flashconcards-b52d0.firebasestorage.app",
  messagingSenderId: "549794745448",
  appId: "1:549794745448:web:b0755d2d04ec183ac27fdd",
  measurementId: "G-DWZ2P0JCMY"
};

// Initialize Firebase
let app: any;
let analytics: any;
let auth: any;
let db: any;
let googleProvider: any;

// Initialize Firebase only on client side
if (typeof window !== 'undefined') {
  app = initializeApp(firebaseConfig);
  analytics = getAnalytics(app);
  auth = getAuth(app);
  db = getFirestore(app);
  googleProvider = new GoogleAuthProvider();
}

export { app, analytics, auth, db, googleProvider };
