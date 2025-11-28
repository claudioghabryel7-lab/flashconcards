import { initializeApp } from 'firebase/app'
import { getFirestore, doc, setDoc, serverTimestamp } from 'firebase/firestore'
import CryptoJS from 'crypto-js'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || process.env.VITE_FIREBASE_APP_ID,
}

const app = initializeApp(firebaseConfig)
const db = getFirestore(app)

const hashPassword = (password) => {
  return CryptoJS.SHA256(password).toString()
}

const addUser = async () => {
  const email = 'claudioghabryel.cg@gmail.com'
  const password = 'Gabriel@123'
  const emailLower = email.toLowerCase().trim()
  
  const passwordHash = hashPassword(password)
  
  const userRef = doc(db, 'users', emailLower)
  
  await setDoc(userRef, {
    email: emailLower,
    displayName: 'Claudio Ghabryel',
    passwordHash,
    role: 'admin',
    favorites: [],
    createdAt: serverTimestamp(),
  })
  
  console.log('✅ Usuário criado com sucesso!')
  console.log('Email:', emailLower)
  console.log('Senha:', password)
  console.log('Tipo: Admin')
}

addUser().catch(console.error)








