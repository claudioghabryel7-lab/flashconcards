'use client'

import { useState, useRef, useEffect, memo } from 'react'
import Link from 'next/link'
import { Bell } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useTopicNotifications } from '@/hooks/useTopicNotifications'
import dayjs from 'dayjs'

const TopicNotificationsButton = memo(() => {
  const { user, profile } = useAuth()
  const courseId = profile?.selectedCourseId || 'alego-default'
  const { notifications, unreadCount, markAllRead, markRead, clearAll } =
    useTopicNotifications(user?.uid, courseId)
  const [open, setOpen] = useState(false)
  const panelRef = useRef(null)

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

  if (!user) return null

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v)
          if (!open && unreadCount > 0) markAllRead()
        }}
        className="relative flex h-10 w-10 items-center justify-center rounded-full border border-cp-border text-cp-muted transition hover:border-cp-accent/30 hover:bg-cp-surface hover:text-cp-text"
        aria-label="Notificações de tópicos liberados"
        aria-expanded={open}
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-cp-accent px-1 text-[10px] font-bold text-cp-bg">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-[80] mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-cp-border bg-cp-bg shadow-2xl">
          <div className="flex items-center justify-between border-b border-cp-border px-4 py-3">
            <p className="text-sm font-semibold text-cp-text">Tópicos liberados</p>
            {notifications.length > 0 && (
              <button
                type="button"
                onClick={clearAll}
                className="text-xs text-cp-muted hover:text-cp-text"
              >
                Limpar
              </button>
            )}
          </div>

          <div className="max-h-72 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-cp-muted">
                Nenhuma novidade por enquanto.
              </p>
            ) : (
              notifications.map((n) => (
                <Link
                  key={n.id}
                  href="/edital-verticalizado"
                  onClick={() => {
                    markRead(n.id)
                    setOpen(false)
                  }}
                  className={`block border-b border-cp-border/50 px-4 py-3 transition-colors hover:bg-cp-surface ${
                    !n.read ? 'bg-cp-accent/5' : ''
                  }`}
                >
                  <p className="text-sm font-medium leading-snug text-cp-text">{n.label}</p>
                  <p className="mt-1 text-xs text-cp-muted">
                    Liberado {dayjs(n.createdAt).format('DD/MM HH:mm')}
                  </p>
                </Link>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
})

TopicNotificationsButton.displayName = 'TopicNotificationsButton'

export default TopicNotificationsButton
