import { useCallback, useEffect, useState } from 'react'
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  writeBatch,
  limit,
} from 'firebase/firestore'
import { db } from '../firebase/config'

/**
 * Notificações de sinalização corrigida (sino verde).
 */
export function useFlagCorrectionNotifications(userId) {
  const [notifications, setNotifications] = useState([])

  useEffect(() => {
    if (!userId || !db) {
      setNotifications([])
      return undefined
    }

    const q = query(
      collection(db, 'users', userId, 'notifications'),
      orderBy('createdAt', 'desc'),
      limit(40),
    )

    return onSnapshot(
      q,
      (snap) => {
        setNotifications(
          snap.docs
            .map((d) => ({
              id: d.id,
              ...d.data(),
              createdAt: d.data().createdAt?.toMillis?.() || Date.now(),
            }))
            .filter((n) => {
              const t = n.type
              return (
                !t ||
                t === 'flag_corrected' ||
                t === 'motivation' ||
                t === 'motivation_push'
              )
            }),
        )
      },
      (err) => {
        console.warn('[flag notifications]', err?.message || err)
        setNotifications([])
      },
    )
  }, [userId])

  const unreadCount = notifications.filter((n) => !n.read).length

  const markRead = useCallback(
    async (id) => {
      if (!userId || !id) return
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
      try {
        await updateDoc(doc(db, 'users', userId, 'notifications', id), { read: true })
      } catch (err) {
        console.warn(err)
      }
    },
    [userId],
  )

  const markAllRead = useCallback(async () => {
    if (!userId) return
    const unread = notifications.filter((n) => !n.read)
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    try {
      const batch = writeBatch(db)
      unread.forEach((n) => {
        batch.update(doc(db, 'users', userId, 'notifications', n.id), { read: true })
      })
      if (unread.length) await batch.commit()
    } catch (err) {
      console.warn(err)
    }
  }, [userId, notifications])

  const clearAll = useCallback(async () => {
    if (!userId) return
    const rows = [...notifications]
    setNotifications([])
    try {
      const batch = writeBatch(db)
      rows.forEach((n) => batch.delete(doc(db, 'users', userId, 'notifications', n.id)))
      if (rows.length) await batch.commit()
    } catch (err) {
      console.warn(err)
    }
  }, [userId, notifications])

  return { notifications, unreadCount, markRead, markAllRead, clearAll }
}
