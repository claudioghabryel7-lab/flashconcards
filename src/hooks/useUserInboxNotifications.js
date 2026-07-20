'use client'

import { useCallback, useEffect, useState } from 'react'
import { collection, onSnapshot, orderBy, query, updateDoc, doc, limit } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'

/**
 * Notificações do aluno em users/{uid}/notifications (ex.: flag_resolved).
 */
export function useUserInboxNotifications(userId) {
  const [items, setItems] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    if (!userId) {
      setItems([])
      setUnreadCount(0)
      return undefined
    }

    const q = query(
      collection(db, 'users', userId, 'notifications'),
      orderBy('createdAt', 'desc'),
      limit(80),
    )

    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((n) => n.cleared !== true && n.hidden !== true)
        setItems(rows)
        setUnreadCount(rows.filter((n) => !n.read).length)
      },
      (err) => {
        // Fallback sem orderBy (índice ausente)
        if (err.code === 'failed-precondition') {
          return onSnapshot(collection(db, 'users', userId, 'notifications'), (snap) => {
            const rows = snap.docs
              .map((d) => ({ id: d.id, ...d.data() }))
              .filter((n) => n.cleared !== true && n.hidden !== true)
              .sort(
                (a, b) =>
                  (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0),
              )
              .slice(0, 80)
            setItems(rows)
            setUnreadCount(rows.filter((n) => !n.read).length)
          })
        }
        console.error('[inbox]', err)
      },
    )

    return () => unsub?.()
  }, [userId])

  const markRead = useCallback(
    async (id) => {
      if (!userId || !id) return
      await updateDoc(doc(db, 'users', userId, 'notifications', id), {
        read: true,
        readAt: new Date().toISOString(),
      }).catch(() => {})
    },
    [userId],
  )

  const markAllRead = useCallback(async () => {
    if (!userId) return
    await Promise.all(
      items
        .filter((n) => !n.read)
        .map((n) =>
          updateDoc(doc(db, 'users', userId, 'notifications', n.id), {
            read: true,
            readAt: new Date().toISOString(),
          }).catch(() => {}),
        ),
    )
  }, [userId, items])

  return { items, unreadCount, markRead, markAllRead }
}

export function useFlagInboxForCurrentUser() {
  const { user } = useAuth()
  return useUserInboxNotifications(user?.uid)
}
