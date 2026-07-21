import { useEffect, useState, useCallback, useRef } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase/config'
import { CONTENT_STATUS } from '../utils/contentStatus'
import { buildTopicoPublishMapFromSnapshot } from '../services/topicoPublishService'
import {
  normalizeTopicKeyForStorage,
  sanitizeTopicKeyForFirestore,
} from '../utils/topicKeyFirestore'

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

/** Detecta label ainda com %20 / %3A (topicKey URI-encoded). */
function looksEncoded(value = '') {
  return /%[0-9A-Fa-f]{2}/.test(String(value))
}

/**
 * Converte topicKey (encoded, double-encoded ou ID sanitizado) em nome legível.
 */
export function decodeTopicLabel(topicKey, disciplinaNome, meta = {}) {
  const fromMeta =
    meta.topicoNome ||
    meta.nome ||
    meta.moduloLabel ||
    meta.modulo ||
    ''

  let raw = String(fromMeta || topicKey || '').trim()

  // ID Firestore: "4_DOUBLECOLON_Nome..."
  if (raw.includes('_DOUBLECOLON_')) {
    raw = raw
      .replace(/_DOUBLECOLON_/g, ' :: ')
      .replace(/_SLASH_/g, '/')
      .replace(/_BACKSLASH_/g, '\\')
  }

  // Decodifica até 2x (mesmo padrão de normalizeTopicKeyForStorage)
  const decoded = normalizeTopicKeyForStorage(raw) || raw

  let nome = decoded
  const parts = decoded.split(/\s*::\s*/)
  if (parts.length > 1) {
    // "4 :: Lei nº ..." → só o nome (sem número)
    nome = parts.slice(1).join(' :: ').trim() || decoded
  }

  // Se ainda parecer encoded, tenta mais uma passagem
  if (looksEncoded(nome)) {
    try {
      nome = decodeURIComponent(nome)
      const again = nome.split(/\s*::\s*/)
      if (again.length > 1) nome = again.slice(1).join(' :: ').trim() || nome
    } catch {
      /* keep */
    }
  }

  const disc = disciplinaNome || meta.disciplinaNome || meta.disciplina || ''
  if (disc && nome && !nome.toLowerCase().startsWith(String(disc).toLowerCase())) {
    return `${disc} — ${nome}`
  }
  return nome || disc || 'Novo tópico liberado'
}

function refreshNotificationLabels(items = []) {
  return items.map((n) => {
    if (!n?.topicKey && !n?.label) return n
    const nextLabel = decodeTopicLabel(n.topicKey, n.disciplinaNome, {
      topicoNome: n.topicoNome,
      moduloLabel: n.moduloLabel,
      disciplinaNome: n.disciplinaNome,
    })
    // Só reescreve se o label antigo estiver quebrado (encoded) ou vazio
    if (!n.label || looksEncoded(n.label) || n.label === n.topicKey) {
      return { ...n, label: nextLabel }
    }
    return n
  })
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
    if (data.topicKey) {
      metaByKey[data.topicKey] = data
      metaByKey[normalizeTopicKeyForStorage(data.topicKey)] = data
      metaByKey[sanitizeTopicKeyForFirestore(data.topicKey)] = data
    }
    if (data.topicKeyNormalized) {
      metaByKey[data.topicKeyNormalized] = data
    }
    metaByKey[d.id] = data
  })
  return metaByKey
}

function collectAvailableTopics(map, metaByKey) {
  const topics = []
  const seen = new Set()

  Object.entries(map).forEach(([key, status]) => {
    if (status !== CONTENT_STATUS.AVAILABLE) return
    const meta =
      metaByKey[key] ||
      metaByKey[normalizeTopicKeyForStorage(key)] ||
      metaByKey[sanitizeTopicKeyForFirestore(key)] ||
      {}
    const topicKey = meta.topicKeyNormalized || meta.topicKey || key
    const seenKey = normalizeTopicKeyForStorage(topicKey) || topicKey
    if (seen.has(seenKey)) return
    seen.add(seenKey)
    topics.push({ topicKey, meta })
  })

  return topics
}

function buildNotification(courseId, topicKey, meta = {}) {
  return {
    id: notificationId(courseId, topicKey),
    courseId,
    topicKey,
    disciplinaNome: meta.disciplinaNome || meta.disciplina || '',
    topicoNome: meta.topicoNome || meta.nome || '',
    moduloLabel: meta.moduloLabel || meta.modulo || '',
    label: decodeTopicLabel(topicKey, meta.disciplinaNome || meta.disciplina, meta),
    createdAt: toMillis(meta.updatedAt),
    read: false,
  }
}

function ackKey(topicKey) {
  return sanitizeTopicKeyForFirestore(normalizeTopicKeyForStorage(topicKey) || topicKey) || topicKey
}

function isAcknowledged(acknowledgedKeys, topicKey) {
  if (!acknowledgedKeys || !topicKey) return false
  const key = ackKey(topicKey)
  return Boolean(
    acknowledgedKeys[topicKey] ||
      acknowledgedKeys[key] ||
      acknowledgedKeys[normalizeTopicKeyForStorage(topicKey)] ||
      acknowledgedKeys[sanitizeTopicKeyForFirestore(topicKey)],
  )
}

function withAck(acknowledgedKeys, topicKey) {
  const key = ackKey(topicKey)
  return {
    ...acknowledgedKeys,
    [topicKey]: true,
    [key]: true,
  }
}

function withoutAck(acknowledgedKeys, topicKey) {
  const next = { ...acknowledgedKeys }
  const variants = [
    topicKey,
    ackKey(topicKey),
    normalizeTopicKeyForStorage(topicKey),
    sanitizeTopicKeyForFirestore(topicKey),
  ]
  variants.forEach((k) => {
    if (k) delete next[k]
  })
  return next
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
  const [resyncNonce, setResyncNonce] = useState(0)
  const prevMapRef = useRef({})
  const initializedRef = useRef(false)

  const persist = useCallback(
    (data) => {
      if (!userId || !courseId) return
      const items = refreshNotificationLabels(data.items || [])
      const next = { ...data, items, acknowledgedKeys: data.acknowledgedKeys || {} }
      saveStored(userId, courseId, next)
      setNotifications(items)
      setUnreadCount(items.filter((n) => !n.read).length)
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
    const fixedItems = refreshNotificationLabels(stored.items || [])
    setNotifications(fixedItems)
    setUnreadCount(fixedItems.filter((n) => !n.read).length)
    // Persiste labels corrigidos (migração one-shot do localStorage)
    if (JSON.stringify(fixedItems) !== JSON.stringify(stored.items || [])) {
      saveStored(userId, resolvedId, { ...stored, items: fixedItems })
    }

    const unsub = onSnapshot(
      collection(db, 'courses', resolvedId, 'topicoStatus'),
      (snapshot) => {
        const map = buildTopicoPublishMapFromSnapshot(snapshot)
        const metaByKey = buildMetaIndex(snapshot)
        const storedNow = loadStored(userId, resolvedId)
        let { acknowledgedKeys, items } = storedNow
        acknowledgedKeys = { ...(acknowledgedKeys || {}) }
        items = refreshNotificationLabels(items)
        const existingIds = new Set(items.map((n) => n.id))
        const newItems = []

        // Tópico bloqueado de novo → libera acknowledge para re-notificar na próxima liberação
        Object.entries(map).forEach(([key, status]) => {
          if (status === CONTENT_STATUS.AVAILABLE) return
          if (isAcknowledged(acknowledgedKeys, key)) {
            acknowledgedKeys = withoutAck(acknowledgedKeys, key)
          }
        })

        const addTopic = (topicKey, meta) => {
          if (isAcknowledged(acknowledgedKeys, topicKey)) return
          const notif = buildNotification(resolvedId, topicKey, meta)
          if (existingIds.has(notif.id)) {
            acknowledgedKeys = withAck(acknowledgedKeys, topicKey)
            return
          }
          newItems.push(notif)
          acknowledgedKeys = withAck(acknowledgedKeys, topicKey)
          existingIds.add(notif.id)
        }

        if (!initializedRef.current) {
          collectAvailableTopics(map, metaByKey).forEach(({ topicKey, meta }) => {
            addTopic(topicKey, meta)
          })
          initializedRef.current = true
          prevMapRef.current = { ...map }
        } else {
          const prev = prevMapRef.current
          collectAvailableTopics(map, metaByKey).forEach(({ topicKey, meta }) => {
            const wasAvailable =
              prev[topicKey] === CONTENT_STATUS.AVAILABLE ||
              prev[sanitizeTopicKeyForFirestore(topicKey)] === CONTENT_STATUS.AVAILABLE ||
              prev[normalizeTopicKeyForStorage(topicKey)] === CONTENT_STATUS.AVAILABLE ||
              prev[ackKey(topicKey)] === CONTENT_STATUS.AVAILABLE
            if (wasAvailable) return
            addTopic(topicKey, meta)
          })
          prevMapRef.current = { ...map }
        }

        const labelsChanged = items.some((n, i) => n.label !== storedNow.items?.[i]?.label)
        const ackChanged =
          Object.keys(acknowledgedKeys).length !== Object.keys(storedNow.acknowledgedKeys || {}).length
        if (newItems.length > 0) {
          const merged = [...newItems, ...items]
            .sort((a, b) => b.createdAt - a.createdAt)
            .slice(0, MAX_ITEMS)
          persist({ acknowledgedKeys, items: merged })
        } else if (ackChanged || labelsChanged) {
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
  }, [userId, courseId, persist, resyncNonce])

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
    persist({ acknowledgedKeys: {}, items: [] })
    initializedRef.current = false
    prevMapRef.current = {}
    setResyncNonce((n) => n + 1)
  }, [persist])

  return { notifications, unreadCount, markAllRead, markRead, clearAll }
}
