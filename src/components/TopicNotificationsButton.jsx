import { useState, useRef, useEffect, memo } from 'react'
import { Link } from 'react-router-dom'
import { BellIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { useAuth } from '../hooks/useAuth'
import { useTopicNotifications } from '../hooks/useTopicNotifications'
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
        className="relative p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-background-card transition-colors"
        aria-label="Notificações de tópicos liberados"
      >
        <BellIcon className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-orange px-1 text-[10px] font-bold text-background-primary">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-border-primary bg-background-card shadow-xl z-[60] overflow-hidden">
          <div className="flex items-center justify-between border-b border-border-primary px-4 py-3">
            <p className="text-sm font-semibold text-text-primary">Tópicos liberados</p>
            {notifications.length > 0 && (
              <button
                type="button"
                onClick={clearAll}
                className="text-xs text-text-muted hover:text-text-secondary"
              >
                Limpar
              </button>
            )}
          </div>

          <div className="max-h-72 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-text-muted">
                Nenhuma novidade por enquanto.
              </p>
            ) : (
              notifications.map((n) => (
                <Link
                  key={n.id}
                  to="/edital-verticalizado"
                  onClick={() => {
                    markRead(n.id)
                    setOpen(false)
                  }}
                  className={`block border-b border-border-primary/50 px-4 py-3 hover:bg-background-card-hover transition-colors ${
                    !n.read ? 'bg-accent-orange/5' : ''
                  }`}
                >
                  <p className="text-sm font-medium text-text-primary leading-snug">
                    {n.label}
                  </p>
                  <p className="mt-1 text-xs text-text-muted">
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
