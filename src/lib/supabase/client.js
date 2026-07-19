import { createClient } from '@supabase/supabase-js'

import { getSupabaseAnonKey, getSupabaseUrl, isSupabaseConfigured } from './config.js'

let readClient = null
let writeClient = null
let firebaseTokenGetter = null

export function setFirebaseTokenGetter(fn) {
  firebaseTokenGetter = fn
  writeClient = null
}

export async function getFirebaseIdToken() {
  if (!firebaseTokenGetter) return null
  try {
    return await firebaseTokenGetter()
  } catch {
    return null
  }
}

/** Leituras: sempre anon key (RLS permite select público). */
export function getSupabaseClient() {
  if (!isSupabaseConfigured()) return null

  if (!readClient) {
    readClient = createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    })
  }

  return readClient
}

/** Escritas: Firebase ID token (requer third-party auth no Supabase). */
export function getSupabaseAuthClient() {
  if (!isSupabaseConfigured()) return null

  if (!writeClient) {
    writeClient = createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      accessToken: async () => {
        if (!firebaseTokenGetter) return null
        try {
          return await firebaseTokenGetter()
        } catch {
          return null
        }
      },
    })
  }

  return writeClient
}

export async function getBackendAuthToken(firebaseAuth) {
  const user = firebaseAuth?.currentUser
  if (user) return user.getIdToken()
  return null
}

export function resetSupabaseClient() {
  readClient = null
  writeClient = null
}
