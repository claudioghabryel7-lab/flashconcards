import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { initializeFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'
import { ENV } from '../lib/env.js'

const firebaseConfig = {
  apiKey: ENV.VITE_FIREBASE_API_KEY,
  authDomain: ENV.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: ENV.VITE_FIREBASE_PROJECT_ID,
  storageBucket: ENV.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: ENV.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: ENV.VITE_FIREBASE_APP_ID,
}

const hasValidConfig =
  Boolean(firebaseConfig.apiKey) &&
  firebaseConfig.apiKey !== 'undefined' &&
  Boolean(firebaseConfig.projectId) &&
  firebaseConfig.projectId !== 'undefined'

export let firebaseInitialized = false
export let firebaseError = null

let app = null
let auth = null
let db = null
let storage = null

function initFirebase() {
  if (typeof window === 'undefined') return
  if (app || !hasValidConfig) return

  try {
    app = initializeApp(firebaseConfig)
    auth = getAuth(app)
    // Long-polling evita ERR_SSL_PROTOCOL_ERROR / WebChannel quebrado em
    // redes, proxies, antivírus e navegadores mobile (PC + Android).
    db = initializeFirestore(app, {
      experimentalForceLongPolling: true,
      experimentalAutoDetectLongPolling: false,
    })
    storage = getStorage(app)
    firebaseInitialized = true
  } catch (error) {
    firebaseError = error
    console.error('❌ Erro ao inicializar Firebase:', error)
  }
}

if (!hasValidConfig && typeof window !== 'undefined') {
  const missingVars = []
  if (!firebaseConfig.apiKey || firebaseConfig.apiKey === 'undefined') {
    missingVars.push('VITE_FIREBASE_API_KEY')
  }
  if (!firebaseConfig.projectId || firebaseConfig.projectId === 'undefined') {
    missingVars.push('VITE_FIREBASE_PROJECT_ID')
  }

  firebaseError = new Error(
    `Variáveis do Firebase não configuradas: ${missingVars.join(', ')}. Verifique o arquivo .env na raiz do projeto.`,
  )
  console.error('❌ ERRO:', firebaseError.message)
}

if (typeof window !== 'undefined') {
  initFirebase()
}

export { auth, db, storage, initFirebase }
export default app
