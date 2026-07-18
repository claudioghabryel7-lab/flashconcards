import { useEffect, useState, useCallback, useRef } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase/config'
import { CONTENT_STATUS } from '../utils/contentStatus'
import { buildTopicoPublishMapFromSnapshot } from '../services/topicoPublishService'
import { sanitizeTopicKeyForFirestore } from '../utils/topicKeyFirestore'
import { buildTopicContentLink, parseTopicKeyParts } from '../utils/topicContentLinks'

const STORAGE_KEY = (uid, courseId) => `topicNotifs_${uid}_${courseId}`

function loadStored(uid, courseId) {
  if (!uid || !courseId || typeof window === 'undefined') {
    return { acknowledgedKeys: {}, items: [], clearedAt: 0 }
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY(uid, courseId))
    if (raw) {
      const parsed = JSON.parse(raw)
      return {
        acknowledgedKeys: parsed.acknowledgedKeys || {},
        items: parsed.items || [],
        clearedAt: parsed.clearedAt || 0,
      }
    }
    // Migração do formato antigo (global por usuário)
    const legacy = localStorage.getItem(`topicNotifs_${uid}`)
    if (legacy) {
      const parsed = JSON.parse(legacy)
      const items = (parsed.items || []).filter((n) => n.courseId === courseId)
      const acknowledgedKeys = { ...(parsed.acknowledgedKeys || {}) }
      items.forEach((n) => {
        if (n.topicKey && n.contentType) {
          acknowledgedKeys[`${n.topicKey}:${n.contentType}`] = true
        } else if (n.topicKey) {
          acknowledgedKeys[n.topicKey] = true
        }
      })
      return { acknowledgedKeys, items, clearedAt: parsed.clearedAt || 0 }
    }
    return { acknowledgedKeys: {}, items: [], clearedAt: 0 }
  } catch {
    return { acknowledgedKeys: {}, items: [], clearedAt: 0 }
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

function buildNotification(courseId, topicKey, meta, contentType = 'topico') {
  const { nome: topicoNome } = parseTopicKeyParts(topicKey)
  const labels = {
    flashcards: 'Flashcards liberados',
    material: 'Material liberado',
    questoes: 'Questões liberadas',
    topico: 'Novo tópico liberado',
    vespera: 'Revisão liberada',
  }
  const baseLabel = decodeTopicLabel(topicKey, meta.disciplinaNome)

  const resolvedType = contentType === 'topico' ? 'flashcards' : contentType

  return {
    id: `${notificationId(courseId, topicKey)}:${contentType}`,
    courseId,
    topicKey,
    contentType,
    disciplinaNome: meta.disciplinaNome || '',
    topicoNome: topicoNome || meta.topicoNome || '',
    linkPath: buildTopicContentLink({
      courseId,
      topicKey,
      contentType: resolvedType,
      disciplinaNome: meta.disciplinaNome || '',
      topicoNome: topicoNome || meta.topicoNome || '',
    }),
    label:
      contentType === 'topico'
        ? baseLabel
        : `${labels[contentType] || 'Conteúdo liberado'} — ${baseLabel}`,
    createdAt: toMillis(meta.updatedAt),
    read: false,
  }
}

function notificationTypesFromMeta(meta = {}) {
  const assets = meta.releasedAssets || {}
  const hasExplicit = assets.flashcards || assets.material || assets.questoes
  if (!hasExplicit) {
    return ['flashcards', 'material', 'questoes']
  }
  const types = []
  if (assets.flashcards) types.push('flashcards')
  if (assets.material) types.push('material')
  if (assets.questoes) types.push('questoes')
  return types.length ? types : ['topico']
}

function assetsSignature(meta = {}) {
  const assets = meta.releasedAssets || {}
  const hasExplicit = assets.flashcards || assets.material || assets.questoes
  if (!hasExplicit) return 'all'
  return ['flashcards', 'material', 'questoes']
    .filter((k) => assets[k])
    .join(',')
}

function buildVesperaNotification(courseId, data, docId) {
  return {
    id: `vespera:${courseId}:${docId}`,
    courseId,
    topicKey: `vespera:${data.disciplinaIndex ?? docId}`,
    contentType: 'vespera',
    linkPath: '/vespera-de-prova',
    label: data.label || `Revisão liberada: ${data.disciplina || 'Matéria'}`,
    createdAt: toMillis(data.createdAt),
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
  const prevAssetsRef = useRef({})
  const initializedRef = useRef(false)
  const vesperaInitRef = useRef(false)
  const prevVesperaIdsRef = useRef(new Set())

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
      prevAssetsRef.current = {}
      vesperaInitRef.current = false
      prevVesperaIdsRef.current = new Set()
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
        let { acknowledgedKeys, items, clearedAt = 0 } = storedNow
        const existingIds = new Set(items.map((n) => n.id))
        const newItems = []

        const addTopic = (topicKey, meta, { forceRetro = false } = {}) => {
          const types = notificationTypesFromMeta(meta)
          const sig = assetsSignature(meta)
          const prevSig = prevAssetsRef.current[topicKey]
          const releasedAt = toMillis(meta.updatedAt || meta.releasedAt)
          // Após "Limpar", não recria itens antigos
          if (clearedAt && releasedAt && releasedAt <= clearedAt) {
            types.forEach((contentType) => {
              acknowledgedKeys = { ...acknowledgedKeys, [`${topicKey}:${contentType}`]: true }
            })
            prevAssetsRef.current[topicKey] = sig
            return
          }
          const isNewRelease = forceRetro || !prevSig || prevSig !== sig

          types.forEach((contentType) => {
            if (!isNewRelease && prevSig?.includes(contentType)) return
            if (acknowledgedKeys[`${topicKey}:${contentType}`]) return
            const notif = buildNotification(resolvedId, topicKey, meta, contentType)
            if (existingIds.has(notif.id)) {
              acknowledgedKeys = { ...acknowledgedKeys, [`${topicKey}:${contentType}`]: true }
              return
            }
            newItems.push(notif)
            acknowledgedKeys = { ...acknowledgedKeys, [`${topicKey}:${contentType}`]: true }
            existingIds.add(notif.id)
          })

          prevAssetsRef.current[topicKey] = sig
        }

        if (!initializedRef.current) {
          collectAvailableTopics(map, metaByKey).forEach(({ topicKey, meta }) => {
            addTopic(topicKey, meta, { forceRetro: true })
          })
          initializedRef.current = true
          prevMapRef.current = { ...map }
        } else {
          const prev = prevMapRef.current
          collectAvailableTopics(map, metaByKey).forEach(({ topicKey, meta }) => {
            const wasAvailable =
              prev[topicKey] === CONTENT_STATUS.AVAILABLE ||
              prev[sanitizeTopicKeyForFirestore(topicKey)] === CONTENT_STATUS.AVAILABLE
            if (!wasAvailable) {
              addTopic(topicKey, meta)
              return
            }
            const prevSig = prevAssetsRef.current[topicKey]
            const sig = assetsSignature(meta)
            if (prevSig !== sig) addTopic(topicKey, meta)
          })
          prevMapRef.current = { ...map }
        }

        if (newItems.length > 0) {
          const merged = [...newItems, ...items]
            .sort((a, b) => b.createdAt - a.createdAt)
            .slice(0, MAX_ITEMS)
          persist({ acknowledgedKeys, items: merged, clearedAt })
        } else if (Object.keys(acknowledgedKeys).length !== Object.keys(storedNow.acknowledgedKeys || {}).length) {
          persist({ acknowledgedKeys, items, clearedAt })
        }
      },
      (err) => console.error('Erro nas notificações de tópicos:', err),
    )

    return () => {
      unsub()
      initializedRef.current = false
      prevMapRef.current = {}
      prevAssetsRef.current = {}
    }
  }, [userId, courseId, persist])

  useEffect(() => {
    if (!userId || !courseId) return () => {}

    const resolvedId = courseId || 'alego-default'

    const unsub = onSnapshot(
      collection(db, 'courses', resolvedId, 'vesperaNotifications'),
      (snapshot) => {
        const storedNow = loadStored(userId, resolvedId)
        let { acknowledgedKeys, items, clearedAt = 0 } = storedNow
        const existingIds = new Set(items.map((n) => n.id))
        const newItems = []
        const currentIds = new Set()

        snapshot.docs.forEach((d) => {
          currentIds.add(d.id)
          const data = d.data()
          if (data.status === 'dismissed') return

          const ackKey = `vespera:${d.id}`
          const createdAt = toMillis(data.createdAt)
          if (clearedAt && createdAt && createdAt <= clearedAt) {
            acknowledgedKeys = { ...acknowledgedKeys, [ackKey]: true }
            return
          }

          const isNew = !vesperaInitRef.current || !prevVesperaIdsRef.current.has(d.id)

          if (!isNew) return
          if (acknowledgedKeys[ackKey]) return

          const notif = buildVesperaNotification(resolvedId, data, d.id)
          if (existingIds.has(notif.id)) {
            acknowledgedKeys = { ...acknowledgedKeys, [ackKey]: true }
            return
          }
          newItems.push(notif)
          acknowledgedKeys = { ...acknowledgedKeys, [ackKey]: true }
          existingIds.add(notif.id)
        })

        prevVesperaIdsRef.current = currentIds
        vesperaInitRef.current = true

        if (newItems.length > 0) {
          const merged = [...newItems, ...items]
            .sort((a, b) => b.createdAt - a.createdAt)
            .slice(0, MAX_ITEMS)
          persist({ acknowledgedKeys, items: merged, clearedAt })
        } else if (Object.keys(acknowledgedKeys).length !== Object.keys(storedNow.acknowledgedKeys || {}).length) {
          persist({ acknowledgedKeys, items, clearedAt })
        }
      },
      (err) => console.error('Erro nas notificações de véspera:', err),
    )

    return () => {
      unsub()
      vesperaInitRef.current = false
      prevVesperaIdsRef.current = new Set()
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
    const acknowledgedKeys = { ...stored.acknowledgedKeys }
    stored.items.forEach((n) => {
      if (n.topicKey && n.contentType) {
        acknowledgedKeys[`${n.topicKey}:${n.contentType}`] = true
      }
      if (n.contentType === 'vespera' && n.id?.startsWith('vespera:')) {
        const parts = n.id.split(':')
        if (parts[2]) acknowledgedKeys[`vespera:${parts[2]}`] = true
      }
    })
    // Impede que o snapshot recoloque o histórico antigo
    persist({
      acknowledgedKeys,
      items: [],
      clearedAt: Date.now(),
    })
  }, [userId, courseId, persist])

  return { notifications, unreadCount, markAllRead, markRead, clearAll }
}
