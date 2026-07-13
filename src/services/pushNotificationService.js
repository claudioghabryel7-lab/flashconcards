import { getApp } from 'firebase/app'
import { getMessaging, getToken, isSupported, onMessage } from 'firebase/messaging'
import { arrayRemove, arrayUnion, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import { db, initFirebase } from '@/firebase/config'
import { ENV, readEnv } from '@/lib/env.js'

const MAX_TOKENS = 8

export function getVapidKey() {
  return (
    readEnv('VITE_FIREBASE_VAPID_KEY') ||
    readEnv('NEXT_PUBLIC_FIREBASE_VAPID_KEY') ||
    ENV.VITE_FIREBASE_VAPID_KEY ||
    ''
  ).trim()
}

export async function isPushSupported() {
  if (typeof window === 'undefined') return false
  try {
    return Boolean(await isSupported())
  } catch {
    return false
  }
}

export function getNotificationPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  return Notification.permission
}

async function getMessagingInstance() {
  initFirebase()
  const ok = await isPushSupported()
  if (!ok) return null
  try {
    return getMessaging(getApp())
  } catch {
    return null
  }
}

async function ensureMessagingSw() {
  if (!('serviceWorker' in navigator)) return null
  const existing = await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js')
  if (existing) return existing
  return navigator.serviceWorker.register('/firebase-messaging-sw.js')
}

/**
 * Pede permissão, obtém token FCM e salva em users/{uid}.
 */
export async function enablePushNotifications(userId) {
  if (!userId) throw new Error('Usuário não autenticado')
  if (!('Notification' in window)) throw new Error('Notificações não suportadas neste navegador')

  const vapidKey = getVapidKey()
  if (!vapidKey) {
    throw new Error(
      'Chave VAPID não configurada. Adicione VITE_FIREBASE_VAPID_KEY no .env (Firebase Console → Cloud Messaging → Web Push certificates).',
    )
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    return { ok: false, permission, token: null }
  }

  const messaging = await getMessagingInstance()
  if (!messaging) throw new Error('Firebase Messaging indisponível neste dispositivo')

  const registration = await ensureMessagingSw()
  const token = await getToken(messaging, {
    vapidKey,
    serviceWorkerRegistration: registration || undefined,
  })

  if (!token) throw new Error('Não foi possível obter o token de push')

  await saveFcmToken(userId, token)
  return { ok: true, permission: 'granted', token }
}

export async function saveFcmToken(userId, token) {
  if (!db || !userId || !token) return
  const ref = doc(db, 'users', userId)
  await setDoc(
    ref,
    {
      pushEnabled: true,
      fcmTokens: arrayUnion(token),
      fcmTokenUpdatedAt: serverTimestamp(),
      lastAccessAt: serverTimestamp(),
    },
    { merge: true },
  )

  // Limita quantidade de tokens (evita array infinito em muitos dispositivos)
  try {
    const { getDoc } = await import('firebase/firestore')
    const snap = await getDoc(ref)
    const tokens = Array.isArray(snap.data()?.fcmTokens) ? snap.data().fcmTokens : []
    if (tokens.length > MAX_TOKENS) {
      const keep = tokens.slice(-MAX_TOKENS)
      await updateDoc(ref, { fcmTokens: keep })
    }
  } catch {
    /* ignore */
  }
}

export async function disablePushNotifications(userId, token) {
  if (!db || !userId) return
  const payload = {
    pushEnabled: false,
    fcmTokenUpdatedAt: serverTimestamp(),
  }
  if (token) payload.fcmTokens = arrayRemove(token)
  await setDoc(doc(db, 'users', userId), payload, { merge: true })
}

/** Notificação em primeiro plano (app aberto). */
export async function listenForegroundPush(onPayload) {
  const messaging = await getMessagingInstance()
  if (!messaging) return () => {}
  return onMessage(messaging, (payload) => {
    try {
      onPayload?.(payload)
    } catch {
      /* ignore */
    }
  })
}

export async function syncPushTokenIfGranted(userId) {
  if (!userId) return null
  if (getNotificationPermission() !== 'granted') return null
  if (!getVapidKey()) return null
  try {
    const messaging = await getMessagingInstance()
    if (!messaging) return null
    const registration = await ensureMessagingSw()
    const token = await getToken(messaging, {
      vapidKey: getVapidKey(),
      serviceWorkerRegistration: registration || undefined,
    })
    if (token) await saveFcmToken(userId, token)
    return token
  } catch {
    return null
  }
}
