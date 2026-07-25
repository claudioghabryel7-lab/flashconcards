/**
 * Cria admin no Firestore. NÃO use senhas no código — passe via env:
 *   SETUP_ADMIN_EMAIL=... SETUP_ADMIN_PASSWORD=... node add-user.mjs
 */
import { initializeApp } from 'firebase/app'
import { getFirestore, doc, setDoc, serverTimestamp } from 'firebase/firestore'
import CryptoJS from 'crypto-js'
import { readFileSync, existsSync } from 'fs'

if (existsSync('.env')) {
  const envContent = readFileSync('.env', 'utf-8')
  envContent.split('\n').forEach((line) => {
    const [key, ...valueParts] = line.split('=')
    if (key && valueParts.length > 0 && !process.env[key.trim()]) {
      process.env[key.trim()] = valueParts.join('=').trim()
    }
  })
}

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
}

const email = process.env.SETUP_ADMIN_EMAIL
const password = process.env.SETUP_ADMIN_PASSWORD

if (!email || !password) {
  console.error('Defina SETUP_ADMIN_EMAIL e SETUP_ADMIN_PASSWORD no ambiente.')
  process.exit(1)
}

const app = initializeApp(firebaseConfig)
const db = getFirestore(app)

const hashPassword = (p) => CryptoJS.SHA256(p).toString()

const addUser = async () => {
  const emailLower = email.toLowerCase().trim()
  const passwordHash = hashPassword(password)
  const userRef = doc(db, 'users', emailLower)

  await setDoc(userRef, {
    email: emailLower,
    displayName: process.env.SETUP_ADMIN_NAME || 'Admin',
    passwordHash,
    role: 'admin',
    favorites: [],
    createdAt: serverTimestamp(),
  })

  console.log('✅ Usuário criado com sucesso!')
  console.log('Email:', emailLower)
  console.log('(senha não é impressa)')
}

addUser().catch((err) => {
  console.error(err)
  process.exit(1)
})
