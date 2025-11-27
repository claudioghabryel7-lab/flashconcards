import { initializeApp } from 'firebase/app'
import { getFirestore, doc, setDoc, serverTimestamp } from 'firebase/firestore'
import CryptoJS from 'crypto-js'
import { readFileSync } from 'fs'

// Lê o .env
const envContent = readFileSync('.env', 'utf-8')
const envVars = {}
envContent.split('\n').forEach(line => {
  const [key, ...valueParts] = line.split('=')
  if (key && valueParts.length > 0) {
    envVars[key.trim()] = valueParts.join('=').trim()
  }
})

const firebaseConfig = {
  apiKey: envVars.VITE_FIREBASE_API_KEY,
  authDomain: envVars.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: envVars.VITE_FIREBASE_PROJECT_ID,
  storageBucket: envVars.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: envVars.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: envVars.VITE_FIREBASE_APP_ID,
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
  process.exit(0)
}

addUser().catch((err) => {
  console.error('❌ Erro ao criar usuário:', err)
  process.exit(1)
})


