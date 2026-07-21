'use client'

import { useState, useRef, useEffect, memo } from 'react'
import Link from 'next/link'
import { Bell } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useTopicNotifications } from '@/hooks/useTopicNotifications'
import { useUserInboxNotifications } from '@/hooks/useUserInboxNotifications'
import { buildFlagCorrectionLink } from '@/utils/flagCorrectionLinks'
import dayjs from 'dayjs'

const TopicNotificationsButton = memo(() => {
  const { user, profile } = useAuth()
  const courseId = profile?.selectedCourseId || 'alego-default'
  const { notifications, unreadCount, markAllRead, markRead, clearAll } =
    useTopicNotifications(user?.uid, courseId)
  const {
    items: inbox,
    unreadCount: inboxUnread,
    markRead: markInboxRead,
    markAllRead: markInboxAllRead,
  } = useUserInboxNotifications(user?.uid)

  const [open, setOpen] = useState(false)
  const panelRef = useRef(null)

  const totalUnread = unreadCount + inboxUnread

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

  const flagNotifs = inbox.filter((n) => n.type === 'flag_resolved')
  const otherInbox = inbox.filter((n) => n.type !== 'flag_resolved')

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v)
          if (!open && totalUnread > 0) {
            markAllRead()
            markInboxAllRead()
          }
        }}
        className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-cp-border text-cp-muted transition hover:border-cp-accent/30 hover:bg-cp-surface hover:text-cp-text sm:h-10 sm:w-10"
        aria-label="Notificações"
        aria-expanded={open}
      >
        <Bell className="h-4 w-4 shrink-0" aria-hidden strokeWidth={2} />
        {totalUnread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-cp-accent px-1 text-[10px] font-bold text-cp-bg">
            {totalUnread > 9 ? '9+' : totalUnread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-[80] mt-2 w-[min(18rem,calc(100vw-1.5rem))] max-w-[18rem] overflow-hidden rounded-xl border border-cp-border bg-cp-bg shadow-2xl">
          <div className="flex items-center justify-between border-b border-cp-border px-4 py-3">
            <p className="text-sm font-semibold text-cp-text">Notificações</p>
            {notifications.length > 0 && (
              <button
                type="button"
                onClick={clearAll}
                className="text-xs text-cp-muted hover:text-cp-text"
              >
                Limpar tópicos
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {flagNotifs.length === 0 &&
            otherInbox.length === 0 &&
            notifications.length === 0 ? (
              <p className="px-4 py-4 text-center text-sm text-cp-muted">
                Nenhuma novidade por enquanto.
              </p>
            ) : (
              <>
                {flagNotifs.map((n) => {
                  const href = n.linkPath || n.href || buildFlagCorrectionLink(n)
                  const when = n.createdAt?.toDate?.()
                    ? dayjs(n.createdAt.toDate()).format('DD/MM HH:mm')
                    : n.createdAt
                      ? dayjs(n.createdAt).format('DD/MM HH:mm')
                      : ''
                  return (
                    <Link
                      key={`inbox-${n.id}`}
                      href={href}
                      onClick={() => {
                        markInboxRead(n.id)
                        setOpen(false)
                      }}
                      className={`block border-b border-cp-border/50 px-4 py-3 transition-colors hover:bg-cp-surface ${
                        !n.read ? 'bg-cp-accent/5' : ''
                      }`}
                    >
                      <p className="font-mono text-[10px] uppercase tracking-wider text-cp-accent">
                        {n.contentCorrected ? 'Sinalização corrigida' : 'Sinalização revisada'}
                      </p>
                      <p className="mt-0.5 text-sm font-medium leading-snug text-cp-text">
                        {n.title || 'Professor IA respondeu'}
                      </p>
                      <p className="mt-1 line-clamp-3 text-xs text-cp-muted">
                        {n.explanation || n.message}
                      </p>
                      {when ? (
                        <p className="mt-1 text-[10px] text-cp-muted">{when}</p>
                      ) : null}
                    </Link>
                  )
                })}

                {otherInbox.map((n) => (
                  <Link
                    key={`inbox-o-${n.id}`}
                    href={n.linkPath || n.href || '/dashboard'}
                    onClick={() => {
                      markInboxRead(n.id)
                      setOpen(false)
                    }}
                    className={`block border-b border-cp-border/50 px-4 py-3 transition-colors hover:bg-cp-surface ${
                      !n.read ? 'bg-cp-accent/5' : ''
                    }`}
                  >
                    <p className="text-sm font-medium leading-snug text-cp-text">
                      {n.title || 'Notificação'}
                    </p>
                    <p className="mt-1 line-clamp-2 text-xs text-cp-muted">{n.message}</p>
                  </Link>
                ))}

                {notifications.length > 0 && (
                  <div className="border-b border-cp-border bg-cp-surface/40 px-4 py-2">
                    <p className="font-mono text-[10px] uppercase tracking-wider text-cp-muted">
                      Tópicos liberados
                    </p>
                  </div>
                )}

                {notifications.map((n) => (
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
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
})

TopicNotificationsButton.displayName = 'TopicNotificationsButton'

export default TopicNotificationsButton
