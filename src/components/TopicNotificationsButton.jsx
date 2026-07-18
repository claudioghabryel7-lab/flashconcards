'use client'

import { useState, useRef, useEffect, memo } from 'react'
import Link from 'next/link'
import { Bell } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useTopicNotifications } from '@/hooks/useTopicNotifications'
import { useFlagCorrectionNotifications } from '@/hooks/useFlagCorrectionNotifications'
import { useMotivationalNotification } from '@/hooks/useMotivationalNotification'
import { useCommunityFeedNotifications } from '@/hooks/useCommunityFeedNotifications'
import { buildFlagCorrectionLink } from '@/utils/flagCorrectionLinks'
import { buildTopicContentLink } from '@/utils/topicContentLinks'
import {
  createUnreadSoundWatcher,
  unlockNotificationAudio,
  playNotificationSound,
} from '@/utils/notificationSound'
import dayjs from 'dayjs'

const TopicNotificationsButton = memo(() => {
  const { user, profile } = useAuth()
  const courseId = profile?.selectedCourseId || 'alego-default'
  const { notifications, unreadCount, markAllRead, markRead, clearAll } =
    useTopicNotifications(user?.uid, courseId)
  const {
    notifications: flagNotifs,
    unreadCount: flagUnread,
    markRead: markFlagRead,
    markAllRead: markAllFlagsRead,
    clearAll: clearFlags,
  } = useFlagCorrectionNotifications(user?.uid)
  const {
    notification: motivation,
    unreadCount: motivationUnread,
    markRead: markMotivationRead,
  } = useMotivationalNotification(user?.uid)
  const {
    notifications: communityNotifs,
    unreadCount: communityUnread,
    markAllRead: markCommunityRead,
  } = useCommunityFeedNotifications(user?.uid)

  const correctionNotifs = flagNotifs.filter(
    (n) => !n.type || n.type === 'flag_corrected',
  )
  const pushMotivationNotifs = flagNotifs.filter(
    (n) => n.type === 'motivation' || n.type === 'motivation_push',
  )

  const [open, setOpen] = useState(false)
  const panelRef = useRef(null)
  const soundWatcherRef = useRef(null)

  const totalUnread = unreadCount + flagUnread + motivationUnread + communityUnread

  useEffect(() => {
    if (!soundWatcherRef.current) {
      soundWatcherRef.current = createUnreadSoundWatcher({ kind: 'default' })
    }
    soundWatcherRef.current(totalUnread)
  }, [totalUnread])

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
          unlockNotificationAudio()
          setOpen((v) => !v)
          if (!open) {
            if (unreadCount > 0) markAllRead()
            if (flagUnread > 0) markAllFlagsRead()
            if (motivationUnread > 0) markMotivationRead()
            if (communityUnread > 0) markCommunityRead()
          }
        }}
        className="relative flex h-10 w-10 items-center justify-center rounded-full border border-cp-border text-cp-muted transition hover:border-cp-accent/30 hover:bg-cp-surface hover:text-cp-text"
        aria-label="Notificações"
        aria-expanded={open}
      >
        <Bell className="h-4 w-4" />
        {totalUnread > 0 && (
          <span
            className={`absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold ${
              flagUnread > 0
                ? 'bg-emerald-500 text-white'
                : 'bg-cp-accent text-cp-bg'
            }`}
          >
            {totalUnread > 9 ? '9+' : totalUnread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-[80] mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-cp-border bg-cp-bg shadow-2xl">
          {motivation ? (
            <div className="border-b border-cp-border bg-amber-500/10 px-4 py-3">
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                {motivation.title}
              </p>
              <p className="mt-1 text-xs text-cp-muted">{motivation.message}</p>
            </div>
          ) : null}

          {pushMotivationNotifs.length > 0 && (
            <>
              <div className="border-b border-cp-border bg-amber-500/5 px-4 py-2">
                <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">
                  Lembretes motivacionais
                </p>
              </div>
              <div className="max-h-36 overflow-y-auto">
                {pushMotivationNotifs.map((n) => (
                  <Link
                    key={n.id}
                    href={n.linkPath || '/dashboard'}
                    onClick={() => {
                      markFlagRead(n.id)
                      setOpen(false)
                    }}
                    className={`block border-b border-cp-border/50 px-4 py-3 transition-colors hover:bg-amber-500/5 ${
                      !n.read ? 'bg-amber-500/10' : ''
                    }`}
                  >
                    <p className="text-sm font-medium text-cp-text">{n.title}</p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-cp-muted">{n.message}</p>
                    <p className="mt-1 text-[10px] text-cp-muted">
                      {dayjs(n.createdAt).format('DD/MM HH:mm')}
                    </p>
                  </Link>
                ))}
              </div>
            </>
          )}

          {correctionNotifs.length > 0 && (
            <>
              <div className="flex items-center justify-between border-b border-cp-border bg-emerald-500/10 px-4 py-3">
                <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                  Correções
                </p>
                <button
                  type="button"
                  onClick={clearFlags}
                  className="text-xs text-cp-muted hover:text-cp-text"
                >
                  Limpar
                </button>
              </div>
              <div className="max-h-40 overflow-y-auto">
                {correctionNotifs.map((n) => {
                  const href = buildFlagCorrectionLink(n)
                  const aiApplied = Number(n.appliedCorrections) > 0
                  return (
                    <Link
                      key={n.id}
                      href={href}
                      onClick={() => {
                        markFlagRead(n.id)
                        setOpen(false)
                      }}
                      className={`block w-full border-b border-cp-border/50 px-4 py-3 text-left transition-colors hover:bg-emerald-500/5 ${
                        !n.read ? 'bg-emerald-500/10' : ''
                      }`}
                    >
                      <p className="text-sm font-medium leading-snug text-emerald-800 dark:text-emerald-200">
                        {n.title || 'Sinalização corrigida'}
                      </p>
                      <p className="mt-0.5 line-clamp-3 text-xs text-cp-muted">{n.message}</p>
                      {aiApplied && (
                        <p className="mt-1 text-[10px] font-medium text-emerald-700">
                          {n.appliedCorrections} correção(ões) aplicada(s) automaticamente
                        </p>
                      )}
                      <p className="mt-1 text-[10px] font-medium text-emerald-600">
                        Abrir conteúdo →
                      </p>
                      <p className="mt-0.5 text-[10px] text-emerald-600/80">
                        {dayjs(n.createdAt).format('DD/MM HH:mm')}
                      </p>
                    </Link>
                  )
                })}
              </div>
            </>
          )}

          {communityNotifs.length > 0 && (
            <>
              <div className="border-b border-cp-border px-4 py-3">
                <p className="text-sm font-semibold text-cp-text">Comunidade</p>
                <p className="text-[10px] text-cp-muted">Publicações de quem você segue</p>
              </div>
              <div className="max-h-36 overflow-y-auto">
                {communityNotifs.map((n) => (
                  <Link
                    key={n.id}
                    href={n.linkPath}
                    onClick={() => setOpen(false)}
                    className={`block border-b border-cp-border/50 px-4 py-3 transition-colors hover:bg-cp-surface ${
                      !n.read ? 'bg-cp-accent/5' : ''
                    }`}
                  >
                    <p className="text-sm font-medium text-cp-text">{n.title}</p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-cp-muted">{n.message}</p>
                  </Link>
                ))}
              </div>
            </>
          )}

          <div className="flex items-center justify-between border-b border-cp-border px-4 py-3">
            <p className="text-sm font-semibold text-cp-text">Conteúdos liberados</p>
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
                {flagNotifs.length === 0 && communityNotifs.length === 0
                  ? 'Nenhuma novidade por enquanto.'
                  : 'Nenhum tópico liberado recente.'}
              </p>
            ) : (
              notifications.map((n) => {
                const href =
                  buildTopicContentLink({
                    courseId: n.courseId,
                    topicKey: n.topicKey,
                    contentType: n.contentType,
                    disciplinaNome: n.disciplinaNome,
                    topicoNome: n.topicoNome,
                    linkPath: n.linkPath,
                  }) || '/edital-verticalizado'
                return (
                <Link
                  key={n.id}
                  href={href}
                  onClick={() => {
                    markRead(n.id)
                    setOpen(false)
                    if (n.contentType === 'vespera') {
                      playNotificationSound({ kind: 'success' })
                    }
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
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
})

TopicNotificationsButton.displayName = 'TopicNotificationsButton'

export default TopicNotificationsButton
