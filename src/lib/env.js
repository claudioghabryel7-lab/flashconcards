/**
 * Variáveis de ambiente com referências estáticas (Next.js só injeta process.env.X assim).
 */
export const ENV = {
  VITE_FIREBASE_API_KEY: process.env.VITE_FIREBASE_API_KEY,
  VITE_FIREBASE_AUTH_DOMAIN: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  VITE_FIREBASE_PROJECT_ID: process.env.VITE_FIREBASE_PROJECT_ID,
  VITE_FIREBASE_STORAGE_BUCKET: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  VITE_FIREBASE_MESSAGING_SENDER_ID: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  VITE_FIREBASE_APP_ID: process.env.VITE_FIREBASE_APP_ID,
  VITE_GEMINI_API_KEY: process.env.VITE_GEMINI_API_KEY,
  VITE_GEMINI_API_KEY_1: process.env.VITE_GEMINI_API_KEY_1,
  VITE_GEMINI_API_KEY_2: process.env.VITE_GEMINI_API_KEY_2,
  VITE_GEMINI_API_KEY_3: process.env.VITE_GEMINI_API_KEY_3,
  VITE_GEMINI_API_KEY_4: process.env.VITE_GEMINI_API_KEY_4,
  VITE_GEMINI_API_KEY_5: process.env.VITE_GEMINI_API_KEY_5,
  VITE_GEMINI_API_KEY_6: process.env.VITE_GEMINI_API_KEY_6,
  VITE_GEMINI_API_KEY_7: process.env.VITE_GEMINI_API_KEY_7,
  VITE_GOOGLE_AI_API_KEY: process.env.VITE_GOOGLE_AI_API_KEY,
  VITE_GROQ_API_KEY: process.env.VITE_GROQ_API_KEY,
  VITE_GEMINI_MODEL: process.env.VITE_GEMINI_MODEL,
  DEV: process.env.NODE_ENV !== 'production',
  PROD: process.env.NODE_ENV === 'production',
  MODE: process.env.NODE_ENV || 'development',
}

/** @param {keyof typeof ENV | string} key */
export function readEnv(key) {
  return ENV[key] || undefined
}

export function isDevEnv() {
  return ENV.DEV
}

/** Compatível com código que usa import.meta.env */
export const importMetaEnv = ENV
