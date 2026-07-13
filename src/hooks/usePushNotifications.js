'use client'

import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { useAuth } from '@/hooks/useAuth'
import {
  enablePushNotifications,
  getNotificationPermission,
  getVapidKey,
  isPushSupported,
  listenForegroundPush,
  syncPushTokenIfGranted,
} from '@/services/pushNotificationService'
import { playNotificationSound } from '@/utils/notificationSound'

const DISMISS_KEY = (uid) => `cp_push_prompt_dismiss_${uid}`

/**
 * Gerencia permissão FCM + banner suave pedindo notificações.
 */
export function usePushNotifications() {
  const { user, isAdmin } = useAuth()
  const [supported, setSupported] = useState(false)
  const [permission, setPermission] = useState('default')
  const [showPrompt, setShowPrompt] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const ok = await isPushSupported()
      if (cancelled) return
      setSupported(ok)
      setPermission(getNotificationPermission())
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!user?.uid || !supported) {
      setShowPrompt(false)
      return
    }
    if (isAdmin) {
      setShowPrompt(false)
      return
    }
    const perm = getNotificationPermission()
    setPermission(perm)
    if (perm === 'granted') {
      setShowPrompt(false)
      syncPushTokenIfGranted(user.uid)
      return
    }
    if (perm === 'denied' || perm === 'unsupported') {
      setShowPrompt(false)
      return
    }
    if (!getVapidKey()) {
      setShowPrompt(false)
      return
    }
    try {
      if (sessionStorage.getItem(DISMISS_KEY(user.uid)) === '1') {
        setShowPrompt(false)
        return
      }
    } catch {
      /* ignore */
    }
    const t = window.setTimeout(() => setShowPrompt(true), 8000)
    return () => window.clearTimeout(t)
  }, [user?.uid, supported, isAdmin])

  useEffect(() => {
    if (!user?.uid || permission !== 'granted') return undefined
    let unsub = () => {}
    listenForegroundPush((payload) => {
      const title = payload?.notification?.title || payload?.data?.title || 'FlashConCards'
      const body = payload?.notification?.body || payload?.data?.body || ''
      playNotificationSound({ kind: 'motivation' })
      toast(`${title}${body ? `: ${body}` : ''}`, { icon: '🔔', duration: 5000 })
    }).then((fn) => {
      unsub = fn || (() => {})
    })
    return () => unsub()
  }, [user?.uid, permission])

  const enable = useCallback(async () => {
    if (!user?.uid || busy) return { ok: false }
    setBusy(true)
    try {
      const result = await enablePushNotifications(user.uid)
      setPermission(result.permission || getNotificationPermission())
      if (result.ok) {
        setShowPrompt(false)
        toast.success('Notificações ativadas! Você receberá lembretes no celular.')
      } else {
        toast.error('Permissão negada. Ative nas configurações do navegador.')
      }
      return result
    } catch (err) {
      toast.error(err?.message || 'Não foi possível ativar notificações.')
      return { ok: false, error: err }
    } finally {
      setBusy(false)
    }
  }, [user?.uid, busy])

  const dismissPrompt = useCallback(() => {
    if (user?.uid) {
      try {
        sessionStorage.setItem(DISMISS_KEY(user.uid), '1')
      } catch {
        /* ignore */
      }
    }
    setShowPrompt(false)
  }, [user?.uid])

  return {
    supported,
    permission,
    showPrompt,
    busy,
    enable,
    dismissPrompt,
    vapidConfigured: Boolean(getVapidKey()),
  }
}
