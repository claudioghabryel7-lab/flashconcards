import { useEffect, useMemo, useState } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase/config'

const CHUNK_SIZE = 10
const authorCache = new Map()

export function invalidateCommunityAuthorCache(userId) {
  if (userId) authorCache.delete(userId)
  else authorCache.clear()
}

async function fetchAuthor(uid) {
  if (authorCache.has(uid)) return authorCache.get(uid)

  try {
    const snap = await getDoc(doc(db, 'users', uid))
    if (!snap.exists() || snap.data()?.deleted === true) {
      authorCache.set(uid, null)
      return null
    }
    const data = snap.data()
    const row = {
      displayName: data.displayName || data.email?.split('@')[0] || 'Aluno',
      photoBase64: data.photoBase64 || null,
    }
    authorCache.set(uid, row)
    return row
  } catch {
    authorCache.set(uid, null)
    return null
  }
}

async function fetchAuthors(ids) {
  const unique = [...new Set(ids.filter(Boolean))]
  const result = {}

  for (let i = 0; i < unique.length; i += CHUNK_SIZE) {
    const chunk = unique.slice(i, i + CHUNK_SIZE)
    const rows = await Promise.all(chunk.map(async (uid) => [uid, await fetchAuthor(uid)]))
    rows.forEach(([uid, row]) => {
      result[uid] = row
    })
  }

  return result
}

export function useCommunityAuthors(authorIds) {
  const key = useMemo(
    () => [...new Set((authorIds || []).filter(Boolean))].sort().join(','),
    [authorIds],
  )
  const [authorsMap, setAuthorsMap] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const ids = key ? key.split(',') : []
    if (!ids.length) {
      setAuthorsMap({})
      setLoading(false)
      return () => {}
    }

    let cancelled = false
    setLoading(true)
    fetchAuthors(ids).then((map) => {
      if (!cancelled) {
        setAuthorsMap(map)
        setLoading(false)
      }
    })

    return () => {
      cancelled = true
    }
  }, [key])

  return { authorsMap, loading }
}

export function resolveCommunityAuthor(authorId, authorsMap, fallback = {}) {
  if (authorId in authorsMap) {
    const live = authorsMap[authorId]
    if (!live) return null
    return {
      displayName: live.displayName,
      photoBase64: live.photoBase64,
    }
  }

  return {
    displayName: fallback.authorName || fallback.displayName || fallback.userName || 'Aluno',
    photoBase64: fallback.authorPhotoBase64 || fallback.photoBase64 || fallback.userPhotoBase64 || null,
  }
}

export function isAuthorVisible(authorId, authorsMap) {
  if (!authorId) return false
  if (!(authorId in authorsMap)) return true
  return authorsMap[authorId] !== null
}
