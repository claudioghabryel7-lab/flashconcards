/**
 * Variáveis de ambiente com referências estáticas (Next.js só injeta process.env.X assim).
 * Secrets de LLM (Gemini/Groq/Search) NÃO ficam aqui — só no servidor via serverSecrets.
 */
export const ENV = {
  VITE_FIREBASE_API_KEY: process.env.VITE_FIREBASE_API_KEY,
  VITE_FIREBASE_AUTH_DOMAIN: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  VITE_FIREBASE_PROJECT_ID: process.env.VITE_FIREBASE_PROJECT_ID,
  VITE_FIREBASE_STORAGE_BUCKET: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  VITE_FIREBASE_MESSAGING_SENDER_ID: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  VITE_FIREBASE_APP_ID: process.env.VITE_FIREBASE_APP_ID,
  VITE_GEMINI_MODEL: process.env.VITE_GEMINI_MODEL,
  VITE_GEMINI_TTS_MODEL: process.env.VITE_GEMINI_TTS_MODEL,
  VITE_MERCADOPAGO_PUBLIC_KEY: process.env.VITE_MERCADOPAGO_PUBLIC_KEY,
  DEV: process.env.NODE_ENV !== 'production',
  PROD: process.env.NODE_ENV === 'production',
  MODE: process.env.NODE_ENV || 'development',
}

/** @param {keyof typeof ENV | string} key */
export function readEnv(key) {
  // Bloqueia leitura de secrets no client mesmo se alguém pedir
  const blocked =
    key === 'VITE_GEMINI_API_KEY' ||
    key === 'VITE_GROQ_API_KEY' ||
    key === 'VITE_GOOGLE_SEARCH_API_KEY' ||
    key === 'GEMINI_API_KEY' ||
    key === 'GROQ_API_KEY' ||
    key === 'GOOGLE_SEARCH_API_KEY' ||
    key === 'MERCADOPAGO_ACCESS_TOKEN' ||
    key === 'MERCADOPAGO_CLIENT_SECRET' ||
    key === 'FIREBASE_SERVICE_ACCOUNT_JSON'

  if (blocked && typeof window !== 'undefined') {
    return undefined
  }

  const fromStatic = ENV[key]
  if (fromStatic != null && String(fromStatic).trim() !== '') {
    return String(fromStatic).trim()
  }
  if (typeof process !== 'undefined' && process.env?.[key]) {
    const runtime = process.env[key]
    if (runtime != null && String(runtime).trim() !== '') {
      return String(runtime).trim()
    }
  }
  return undefined
}

export function isDevEnv() {
  return ENV.DEV
}

/** Compatível com código que usa import.meta.env */
export const importMetaEnv = ENV
