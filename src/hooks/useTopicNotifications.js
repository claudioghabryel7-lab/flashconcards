import { useEffect, useState, useCallback, useRef } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase/config'
import { CONTENT_STATUS } from '../utils/contentStatus'
import { buildTopicoPublishMapFromSnapshot } from '../services/topicoPublishService'
import { sanitizeTopicKeyForFirestore } from '../utils/topicKeyFirestore'

const STORAGE_KEY = (uid, courseId) => `topicNotifs_${uid}_${courseId}`

function loadStored(uid, courseId) {
  if (!uid || !courseId || typeof window === 'undefined') {
    return { acknowledgedKeys: {}, items: [] }
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY(uid, courseId))
    if (raw) return JSON.parse(raw)
    // Migração do formato antigo (global por usuário)
    const legacy = localStorage.getItem(`topicNotifs_${uid}`)
    if (legacy) {
      const parsed = JSON.parse(legacy)
      const items = (parsed.items || []).filter((n) => n.courseId === courseId)
      const acknowledgedKeys = {}
      items.forEach((n) => {
        if (n.topicKey) acknowledgedKeys[n.topicKey] = true
      })
      return { acknowledgedKeys, items }
    }
    return { acknowledgedKeys: {}, items: [] }
  } catch {
    return { acknowledgedKeys: {}, items: [] }
  }
}

function saveStored(uid, courseId, data) {
  if (!uid || !courseId || typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY(uid, courseId), JSON.stringify(data))
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

function notificationId(courseId, topicKey) {
  const key = sanitizeTopicKeyForFirestore(topicKey) || topicKey
  return `${courseId}:${key}`
}

function toMillis(ts) {
  if (!ts) return Date.now()
  if (typeof ts.toMillis === 'function') return ts.toMillis()
  if (ts.seconds) return ts.seconds * 1000
  if (typeof ts === 'number') return ts
  return Date.now()
}

function buildMetaIndex(snapshot) {
  const metaByKey = {}
  snapshot.docs.forEach((d) => {
    const data = d.data()
    if (data.topicKey) metaByKey[data.topicKey] = data
    metaByKey[d.id] = data
  })
  return metaByKey
}

function collectAvailableTopics(map, metaByKey) {
  const topics = []
  const seen = new Set()

  Object.entries(map).forEach(([key, status]) => {
    if (status !== CONTENT_STATUS.AVAILABLE) return
    const meta = metaByKey[key] || {}
    const topicKey = meta.topicKey || key
    if (seen.has(topicKey)) return
    seen.add(topicKey)
    topics.push({ topicKey, meta })
  })

  return topics
}

function buildNotification(courseId, topicKey, meta) {
  return {
    id: notificationId(courseId, topicKey),
    courseId,
    topicKey,
    label: decodeTopicLabel(topicKey, meta.disciplinaNome),
    createdAt: toMillis(meta.updatedAt),
    read: false,
  }
}

const MAX_ITEMS = 200

/**
 * Escuta liberações de tópicos (topicoStatus) por curso.
 * Na primeira carga, inclui retroativamente todos os tópicos já liberados
 * que o aluno ainda não tinha registrado.
 */
export function useTopicNotifications(userId, courseId) {
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const prevMapRef = useRef({})
  const initializedRef = useRef(false)

  const persist = useCallback(
    (data) => {
      if (!userId || !courseId) return
      saveStored(userId, courseId, data)
      setNotifications(data.items)
      setUnreadCount(data.items.filter((n) => !n.read).length)
    },
    [userId, courseId],
  )

  useEffect(() => {
    if (!userId || !courseId) {
      setNotifications([])
      setUnreadCount(0)
      initializedRef.current = false
      prevMapRef.current = {}
      return () => {}
    }

    const resolvedId = courseId || 'alego-default'
    const stored = loadStored(userId, resolvedId)
    setNotifications(stored.items)
    setUnreadCount(stored.items.filter((n) => !n.read).length)

    const unsub = onSnapshot(
      collection(db, 'courses', resolvedId, 'topicoStatus'),
      (snapshot) => {
        const map = buildTopicoPublishMapFromSnapshot(snapshot)
        const metaByKey = buildMetaIndex(snapshot)
        const storedNow = loadStored(userId, resolvedId)
        let { acknowledgedKeys, items } = storedNow
        const existingIds = new Set(items.map((n) => n.id))
        const newItems = []

        const addTopic = (topicKey, meta) => {
          if (acknowledgedKeys[topicKey]) return
          const notif = buildNotification(resolvedId, topicKey, meta)
          if (existingIds.has(notif.id)) {
            acknowledgedKeys = { ...acknowledgedKeys, [topicKey]: true }
            return
          }
          newItems.push(notif)
          acknowledgedKeys = { ...acknowledgedKeys, [topicKey]: true }
          existingIds.add(notif.id)
        }

        if (!initializedRef.current) {
          // Retroativo: todos os tópicos já liberados neste curso
          collectAvailableTopics(map, metaByKey).forEach(({ topicKey, meta }) => {
            addTopic(topicKey, meta)
          })
          initializedRef.current = true
          prevMapRef.current = { ...map }
        } else {
          // Tempo real: só liberações novas desde a última snapshot
          const prev = prevMapRef.current
          collectAvailableTopics(map, metaByKey).forEach(({ topicKey, meta }) => {
            const wasAvailable =
              prev[topicKey] === CONTENT_STATUS.AVAILABLE ||
              prev[sanitizeTopicKeyForFirestore(topicKey)] === CONTENT_STATUS.AVAILABLE
            if (wasAvailable) return
            addTopic(topicKey, meta)
          })
          prevMapRef.current = { ...map }
        }

        if (newItems.length > 0) {
          const merged = [...newItems, ...items]
            .sort((a, b) => b.createdAt - a.createdAt)
            .slice(0, MAX_ITEMS)
          persist({ acknowledgedKeys, items: merged })
        } else if (Object.keys(acknowledgedKeys).length !== Object.keys(storedNow.acknowledgedKeys).length) {
          persist({ acknowledgedKeys, items })
        }
      },
      (err) => console.error('Erro nas notificações de tópicos:', err),
    )

    return () => {
      unsub()
      initializedRef.current = false
      prevMapRef.current = {}
    }
  }, [userId, courseId, persist])

  const markAllRead = useCallback(() => {
    const stored = loadStored(userId, courseId)
    const updated = stored.items.map((n) => ({ ...n, read: true }))
    persist({ ...stored, items: updated })
  }, [userId, courseId, persist])

  const markRead = useCallback(
    (id) => {
      const stored = loadStored(userId, courseId)
      const updated = stored.items.map((n) => (n.id === id ? { ...n, read: true } : n))
      persist({ ...stored, items: updated })
    },
    [userId, courseId, persist],
  )

  const clearAll = useCallback(() => {
    const stored = loadStored(userId, courseId)
    persist({ ...stored, items: [] })
  }, [userId, courseId, persist])

  return { notifications, unreadCount, markAllRead, markRead, clearAll }
}
