import { useEffect, useState, useCallback, useRef } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase/config'
import { CONTENT_STATUS } from '../utils/contentStatus'
import { buildTopicoPublishMapFromSnapshot } from '../services/topicoPublishService'

const STORAGE_KEY = (uid) => `topicNotifs_${uid}`

function loadStored(uid) {
  if (!uid || typeof window === 'undefined') return { seen: {}, items: [] }
  try {
    const raw = localStorage.getItem(STORAGE_KEY(uid))
    return raw ? JSON.parse(raw) : { seen: {}, items: [] }
  } catch {
    return { seen: {}, items: [] }
  }
}

function saveStored(uid, data) {
  if (!uid || typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY(uid), JSON.stringify(data))
  } catch {
    /* ignore quota */
  }
}

function decodeTopicLabel(topicKey, disciplinaNome) {
  let nome = ''
  try {
    const decoded = decodeURIComponent(topicKey || '')
    const parts = decoded.split(' :: ')
    nome = parts.length > 1 ? parts.slice(1).join(' :: ') : decoded
  } catch {
    nome = topicKey || 'Novo tópico'
  }
  if (disciplinaNome) return `${disciplinaNome} — ${nome}`
  return nome || 'Novo tópico liberado'
}

/**
 * Escuta liberações de tópicos (topicoStatus) e mantém notificações locais.
 */
export function useTopicNotifications(userId, courseId) {
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const initializedRef = useRef(false)
  const prevMapRef = useRef({})

  const persist = useCallback(
    (items) => {
      const stored = loadStored(userId)
      const next = { ...stored, items }
      saveStored(userId, next)
      setNotifications(items)
      setUnreadCount(items.filter((n) => !n.read).length)
    },
    [userId]
  )

  useEffect(() => {
    if (!userId || !courseId) {
      setNotifications([])
      setUnreadCount(0)
      initializedRef.current = false
      prevMapRef.current = {}
      return () => {}
    }

    const stored = loadStored(userId)
    setNotifications(stored.items || [])
    setUnreadCount((stored.items || []).filter((n) => !n.read).length)

    const resolvedId = courseId || 'alego-default'
    const unsub = onSnapshot(
      collection(db, 'courses', resolvedId, 'topicoStatus'),
      (snapshot) => {
        const map = buildTopicoPublishMapFromSnapshot(snapshot)
        const metaByKey = {}
        snapshot.docs.forEach((d) => {
          const data = d.data()
          if (data.topicKey) metaByKey[data.topicKey] = data
          metaByKey[d.id] = data
        })

        if (!initializedRef.current) {
          initializedRef.current = true
          prevMapRef.current = { ...map }
          return
        }

        const prev = prevMapRef.current
        const newItems = []

        Object.entries(map).forEach(([key, status]) => {
          if (status !== CONTENT_STATUS.AVAILABLE) return
          if (prev[key] === CONTENT_STATUS.AVAILABLE) return

          const meta = metaByKey[key] || {}
          const id = `${resolvedId}:${key}:${Date.now()}`
          newItems.push({
            id,
            courseId: resolvedId,
            topicKey: meta.topicKey || key,
            label: decodeTopicLabel(meta.topicKey || key, meta.disciplinaNome),
            createdAt: Date.now(),
            read: false,
          })
        })

        prevMapRef.current = { ...map }

        if (newItems.length > 0) {
          const storedNow = loadStored(userId)
          const merged = [...newItems, ...(storedNow.items || [])].slice(0, 50)
          persist(merged)
        }
      },
      (err) => console.error('Erro nas notificações de tópicos:', err)
    )

    return () => {
      unsub()
      initializedRef.current = false
    }
  }, [userId, courseId, persist])

  const markAllRead = useCallback(() => {
    const stored = loadStored(userId)
    const updated = (stored.items || []).map((n) => ({ ...n, read: true }))
    persist(updated)
  }, [userId, persist])

  const markRead = useCallback(
    (id) => {
      const stored = loadStored(userId)
      const updated = (stored.items || []).map((n) =>
        n.id === id ? { ...n, read: true } : n
      )
      persist(updated)
    },
    [userId, persist]
  )

  const clearAll = useCallback(() => {
    persist([])
  }, [persist])

  return { notifications, unreadCount, markAllRead, markRead, clearAll }
}
