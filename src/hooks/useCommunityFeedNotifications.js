import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore'
import { db } from '../firebase/config'
import { isFeedPostActive } from '../utils/feedTimeUtils'

const READ_KEY = (uid) => `communityNotifsRead_${uid}`
const POLL_MS = 60000

function loadReadAt(uid) {
  try {
    const raw = localStorage.getItem(READ_KEY(uid))
    return raw ? Number(raw) : 0
  } catch {
    return 0
  }
}

function saveReadAt(uid, ts = Date.now()) {
  try {
    localStorage.setItem(READ_KEY(uid), String(ts))
  } catch {
    /* ignore */
  }
}

async function fetchFollowingIds(userId) {
  if (!db || !userId) return []
  const q = query(collection(db, 'follows'), where('followerId', '==', userId))
  const snap = await getDocs(q)
  return snap.docs.map((d) => d.data().followingId).filter(Boolean)
}

async function fetchRecentPosts() {
  if (!db) return []
  try {
    const q = query(collection(db, 'trilhaFeed'), orderBy('createdAt', 'desc'), limit(40))
    const snap = await getDocs(q)
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
  } catch {
    const snap = await getDocs(collection(db, 'trilhaFeed'))
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    rows.sort((a, b) => {
      const at = a.createdAt?.toMillis?.() || 0
      const bt = b.createdAt?.toMillis?.() || 0
      return bt - at
    })
    return rows.slice(0, 40)
  }
}

/**
 * Publicações da comunidade (pessoas que o usuário segue).
 */
export function useCommunityFeedNotifications(userId) {
  const [followingIds, setFollowingIds] = useState([])
  const [posts, setPosts] = useState([])
  const [readAt, setReadAt] = useState(() => (userId ? loadReadAt(userId) : 0))
  const intervalRef = useRef(null)

  const refresh = useCallback(async () => {
    if (!userId) return
    const [ids, feedPosts] = await Promise.all([fetchFollowingIds(userId), fetchRecentPosts()])
    setFollowingIds(ids)
    setPosts(feedPosts)
  }, [userId])

  useEffect(() => {
    if (!userId) {
      setFollowingIds([])
      setPosts([])
      return undefined
    }
    setReadAt(loadReadAt(userId))
    refresh()
    intervalRef.current = window.setInterval(refresh, POLL_MS)
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current)
    }
  }, [userId, refresh])

  const notifications = useMemo(() => {
    if (!followingIds.length) return []
    const set = new Set(followingIds)
    return posts
      .filter((p) => set.has(p.authorId) && isFeedPostActive(p))
      .slice(0, 15)
      .map((p) => ({
        id: p.id,
        type: 'community',
        title: p.authorName || 'Aluno',
        message: [p.questionText || p.materia || 'Estudo', p.assunto].filter(Boolean).join(' — '),
        linkPath: `/comunidade/publicacao/${p.id}`,
        createdAt: p.createdAt?.toMillis?.() || 0,
        read: (p.createdAt?.toMillis?.() || 0) <= readAt,
      }))
  }, [posts, followingIds, readAt])

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications],
  )

  const markAllRead = useCallback(() => {
    if (!userId) return
    const now = Date.now()
    setReadAt(now)
    saveReadAt(userId, now)
  }, [userId])

  return { notifications, unreadCount, markAllRead, refresh }
}
