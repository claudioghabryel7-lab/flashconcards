import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from '../lib/db/firestoreShim.js'
import { getStorage } from 'firebase/storage'
import { ENV } from '../lib/env.js'
import { isSupabaseConfigured, useSupabaseBackend } from '../lib/supabase/config.js'
import { setFirebaseTokenGetter } from '../lib/supabase/client.js'

const firebaseConfig = {
  apiKey: ENV.VITE_FIREBASE_API_KEY,
  authDomain: ENV.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: ENV.VITE_FIREBASE_PROJECT_ID,
  storageBucket: ENV.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: ENV.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: ENV.VITE_FIREBASE_APP_ID,
}

const hasValidConfig =
  useSupabaseBackend()
    ? isSupabaseConfigured()
    : Boolean(firebaseConfig.apiKey) &&
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
    if (!useSupabaseBackend()) {
      app = initializeApp(firebaseConfig)
      auth = getAuth(app)
    } else {
      app = initializeApp(firebaseConfig)
      auth = getAuth(app)
      setFirebaseTokenGetter(async () => {
        const user = auth?.currentUser
        return user ? user.getIdToken() : null
      })
    }
    db = getFirestore(app)
    if (!useSupabaseBackend()) {
      storage = getStorage(app)
    } else {
      storage = getStorage(app)
    }
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
