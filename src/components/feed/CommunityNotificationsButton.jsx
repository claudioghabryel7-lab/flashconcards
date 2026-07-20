import { useEffect, useMemo, useRef, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { Link } from 'react-router-dom'
import { Bell } from 'lucide-react'
import dayjs from 'dayjs'
import { db } from '../../firebase/config'
import { useAuth } from '../../hooks/useAuth'
import { useTopicNotifications } from '../../hooks/useTopicNotifications'
import { isFeedPostActive } from '../../utils/feedTimeUtils'

const READ_KEY = (uid) => `communityNotifsRead_${uid}`

function loadReadAt(uid) {
  try {
    const raw = localStorage.getItem(READ_KEY(uid))
    return raw ? Number(raw) : 0
  } catch {
    return 0
  }
}

function saveReadAt(uid) {
  try {
    localStorage.setItem(READ_KEY(uid), String(Date.now()))
  } catch {
    /* ignore */
  }
}

export default function CommunityNotificationsButton({ userId }) {
  const { profile } = useAuth()
  const courseId = profile?.selectedCourseId || 'alego-default'
  const { notifications: topicNotifications, unreadCount: topicUnread, markAllRead, markRead, clearAll } =
    useTopicNotifications(userId, courseId)

  const [followingIds, setFollowingIds] = useState([])
  const [posts, setPosts] = useState([])
  const [open, setOpen] = useState(false)
  const [readAt, setReadAt] = useState(() => (userId ? loadReadAt(userId) : 0))
  const panelRef = useRef(null)

  useEffect(() => {
    if (!userId || !db) return () => {}
    const q = query(collection(db, 'follows'), where('followerId', '==', userId))
    return onSnapshot(q, (snap) => {
      setFollowingIds(snap.docs.map((d) => d.data().followingId).filter(Boolean))
    })
  }, [userId])

  useEffect(() => {
    if (!db) return () => {}
    return onSnapshot(collection(db, 'trilhaFeed'), (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      rows.sort((a, b) => {
        const at = a.createdAt?.toMillis?.() || 0
        const bt = b.createdAt?.toMillis?.() || 0
        return bt - at
      })
      setPosts(rows)
    })
  }, [])

  useEffect(() => {
    if (!open) return () => {}
    const handleClick = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const feedNotifications = useMemo(() => {
    if (!followingIds.length) return []
    const set = new Set(followingIds)
    return posts
      .filter((p) => set.has(p.authorId) && isFeedPostActive(p))
      .slice(0, 15)
  }, [posts, followingIds])

  const feedUnread = useMemo(
    () =>
      feedNotifications.filter((p) => {
        const ts = p.createdAt?.toMillis?.() || 0
        return ts > readAt
      }).length,
    [feedNotifications, readAt],
  )

  const totalUnread = feedUnread + topicUnread

  const handleOpen = () => {
    const next = !open
    setOpen(next)
    if (next && userId) {
      const now = Date.now()
      setReadAt(now)
      saveReadAt(userId)
      if (topicUnread > 0) markAllRead()
    }
  }

  if (!userId) return null

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={handleOpen}
        className="relative rounded-full p-1.5 text-cp-muted transition hover:bg-cp-surface hover:text-cp-text"
        aria-label="Notificações"
        aria-expanded={open}
      >
        <Bell className="h-5 w-5" />
        {totalUnread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
            {totalUnread > 9 ? '9+' : totalUnread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-[min(20rem,calc(100%-1rem))] max-w-full overflow-hidden rounded-xl border border-cp-border bg-cp-bg shadow-xl">
          <div className="border-b border-cp-border px-3 py-2">
            <p className="text-xs font-semibold text-cp-text">Comunidade</p>
            <p className="text-[10px] text-cp-muted">Publicações de quem você segue</p>
          </div>
          <div className="max-h-40 overflow-y-auto">
            {feedNotifications.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-cp-muted">
                Nenhuma publicação recente de quem você segue.
              </p>
            ) : (
              feedNotifications.map((post) => (
                <Link
                  key={post.id}
                  to={`/comunidade/publicacao/${post.id}`}
                  onClick={() => setOpen(false)}
                  className="block border-b border-cp-border/60 px-3 py-2.5 transition hover:bg-cp-surface"
                >
                  <p className="text-xs font-semibold text-cp-text">{post.authorName || 'Aluno'}</p>
                  <p className="mt-0.5 line-clamp-2 text-[11px] text-cp-muted">
                    {post.materia || 'Estudo'}
                    {post.assunto ? ` — ${post.assunto}` : ''}
                  </p>
                </Link>
              ))
            )}
          </div>

          <div className="flex items-center justify-between border-y border-cp-border bg-cp-surface/40 px-3 py-2">
            <div>
              <p className="text-xs font-semibold text-cp-text">Tópicos liberados</p>
              <p className="text-[10px] text-cp-muted">Novidades do edital</p>
            </div>
            {topicNotifications.length > 0 && (
              <button
                type="button"
                onClick={clearAll}
                className="text-[10px] text-cp-muted hover:text-cp-text"
              >
                Limpar
              </button>
            )}
          </div>
          <div className="max-h-40 overflow-y-auto">
            {topicNotifications.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-cp-muted">Nenhuma novidade por enquanto.</p>
            ) : (
              topicNotifications.map((n) => (
                <Link
                  key={n.id}
                  to="/edital-verticalizado"
                  onClick={() => {
                    markRead(n.id)
                    setOpen(false)
                  }}
                  className={`block border-b border-cp-border/60 px-3 py-2.5 transition hover:bg-cp-surface ${
                    !n.read ? 'bg-cp-accent/5' : ''
                  }`}
                >
                  <p className="text-xs font-medium text-cp-text">{n.label}</p>
                  <p className="mt-0.5 text-[10px] text-cp-muted">
                    {dayjs(n.createdAt).format('DD/MM HH:mm')}
                  </p>
                </Link>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
