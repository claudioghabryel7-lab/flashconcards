import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

// Validar se as variáveis estão configuradas
const hasValidConfig = firebaseConfig.apiKey && 
  firebaseConfig.apiKey !== 'undefined' &&
  firebaseConfig.projectId &&
  firebaseConfig.projectId !== 'undefined'

// Variável para rastrear se houve erro na inicialização
export let firebaseInitialized = false
export let firebaseError = null

if (!hasValidConfig) {
  const missingVars = []
  if (!firebaseConfig.apiKey || firebaseConfig.apiKey === 'undefined') missingVars.push('VITE_FIREBASE_API_KEY')
  if (!firebaseConfig.projectId || firebaseConfig.projectId === 'undefined') missingVars.push('VITE_FIREBASE_PROJECT_ID')
  
  firebaseError = new Error(`Variáveis do Firebase não configuradas: ${missingVars.join(', ')}. Crie um arquivo .env na raiz do projeto com as variáveis do Firebase. Veja o README.md para instruções.`)
  console.error('❌ ERRO:', firebaseError.message)
}

// Log da configuração apenas em desenvolvimento
// Removido para limpar o console

let app = null
let auth = null
let db = null
let storage = null

try {
  if (hasValidConfig) {
    app = initializeApp(firebaseConfig)
    auth = getAuth(app)
    db = getFirestore(app)
    storage = getStorage(app)
    firebaseInitialized = true
  } else {
    console.warn('⚠️ Firebase não inicializado devido à configuração inválida')
  }
} catch (error) {
  firebaseError = error
  console.error('❌ Erro ao inicializar Firebase:', error)
  console.error('⚠️ Verifique se todas as variáveis VITE_FIREBASE_* estão configuradas no arquivo .env')
  // Não re-lança o erro para evitar tela branca
  // O erro será tratado nos componentes que usam Firebase
}

// Exportar valores ou null se não inicializado
export { auth, db, storage }

// Verificar se o Firestore está configurado corretamente (apenas em dev)
// Removido para limpar o console

export default app

