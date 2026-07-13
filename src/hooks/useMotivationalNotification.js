import { useCallback, useEffect, useState } from 'react'
import dayjs from 'dayjs'

const STORAGE_KEY = (uid) => `cp_motivational_notif_${uid}`

const PHRASES = [
  'Cada card revisado é um passo a mais na aprovação. Continue!',
  'Consistência vence intensidade. Estude um pouco todos os dias.',
  'Você não precisa ser perfeito — só precisa não parar.',
  'A véspera da prova se constrói com as revisões de hoje.',
  'Foque no próximo tópico. Um de cada vez.',
  'Erros no flashcard hoje viram acertos na prova.',
  'Disciplina silenciosa: abrir o app e estudar, mesmo sem vontade.',
  'Seu futuro eu agradece o esforço de agora.',
  'Revise o que já viu. Retenção é o segredo do concurseiro.',
  'Pequenos blocos diários constroem grandes resultados.',
]

function todayKey() {
  return dayjs().format('YYYY-MM-DD')
}

function loadState(uid) {
  if (!uid || typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY(uid))
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function saveState(uid, state) {
  if (!uid || typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY(uid), JSON.stringify(state))
  } catch {
    /* ignore */
  }
}

function pickPhrase(day) {
  let hash = 0
  for (let i = 0; i < day.length; i += 1) hash = (hash * 31 + day.charCodeAt(i)) >>> 0
  return PHRASES[hash % PHRASES.length]
}

/**
 * Uma frase motivacional por dia no sino de notificações (client-side).
 */
export function useMotivationalNotification(userId) {
  const [notification, setNotification] = useState(null)

  useEffect(() => {
    if (!userId) {
      setNotification(null)
      return
    }
    const day = todayKey()
    const prev = loadState(userId)
    if (prev?.day === day && prev.item) {
      setNotification(prev.item)
      return
    }
    const item = {
      id: `motivation:${day}`,
      type: 'motivation',
      title: 'Motivação do dia',
      message: pickPhrase(day),
      linkPath: '/edital-verticalizado',
      createdAt: Date.now(),
      read: false,
    }
    saveState(userId, { day, item })
    setNotification(item)
  }, [userId])

  const markRead = useCallback(() => {
    if (!userId || !notification) return
    const next = { ...notification, read: true }
    setNotification(next)
    const prev = loadState(userId) || {}
    saveState(userId, { ...prev, day: todayKey(), item: next })
  }, [userId, notification])

  const unreadCount = notification && !notification.read ? 1 : 0

  return {
    notification,
    unreadCount,
    markRead,
    notifications: notification ? [notification] : [],
  }
}
