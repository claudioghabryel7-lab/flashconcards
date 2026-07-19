import { ENV, readEnv } from '../env.js'

/** Projeto Supabase vinculado (ytnsyjbzhvehcqwlgxdy). */
export const SUPABASE_PROJECT_REF = 'ytnsyjbzhvehcqwlgxdy'

export function getSupabaseUrl() {
  return (
    readEnv('VITE_SUPABASE_URL') ||
    readEnv('NEXT_PUBLIC_SUPABASE_URL') ||
    `https://${SUPABASE_PROJECT_REF}.supabase.co`
  )
}

export function getSupabaseAnonKey() {
  return readEnv('VITE_SUPABASE_ANON_KEY') || readEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY')
}

export function isSupabaseConfigured() {
  return Boolean(getSupabaseUrl() && getSupabaseAnonKey())
}

/** Quando true, o app usa Supabase (DB + funções) em vez de Firestore/Firebase Functions. */
export function useSupabaseBackend() {
  const flag = readEnv('VITE_USE_SUPABASE') || readEnv('NEXT_PUBLIC_USE_SUPABASE')
  if (flag === 'true' || flag === '1') return isSupabaseConfigured()
  return false
}

export function getSupabaseFunctionsBaseUrl() {
  const custom = readEnv('VITE_SUPABASE_FUNCTIONS_URL') || readEnv('NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL')
  if (custom) return custom.replace(/\/$/, '')
  return `${getSupabaseUrl()}/functions/v1`
}

export const SUPABASE_ENV = {
  url: getSupabaseUrl(),
  anonKey: getSupabaseAnonKey(),
  useSupabase: useSupabaseBackend(),
  functionsBaseUrl: getSupabaseFunctionsBaseUrl(),
  projectRef: SUPABASE_PROJECT_REF,
  DEV: ENV.DEV,
}
