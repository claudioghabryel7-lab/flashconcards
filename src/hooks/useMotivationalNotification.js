import { useCallback, useEffect, useState } from 'react'
import dayjs from 'dayjs'
import { useAuth } from './useAuth'

const STORAGE_KEY = (uid) => `cp_motivational_notif_${uid}`

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

function firstName(profile, user) {
  const raw =
    String(profile?.displayName || profile?.name || user?.displayName || '').trim() ||
    String(user?.email || '').split('@')[0] ||
    'concurseiro'
  return raw.split(/\s+/)[0]
}

function buildPersonalizedPhrase(userId, profile, user) {
  const name = firstName(profile, user)
  const day = todayKey()
  const phrases = [
    `${name}, um bloco curto de flashcards agora vale mais que adiar.`,
    `${name}, consistência vence intensidade — revise 10 cards hoje.`,
    `${name}, a véspera da prova se constrói com as revisões de hoje.`,
    `${name}, erros no flashcard hoje viram acertos na prova.`,
    `${name}, disciplina silenciosa: abrir o app e estudar, mesmo sem vontade.`,
    `${name}, seu futuro eu agradece o esforço de agora.`,
    `${name}, foque no próximo tópico. Um de cada vez.`,
    `${name}, retenção é o segredo — revise o que já viu.`,
  ]
  let hash = 0
  const key = `${userId}:${day}`
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) >>> 0
  return phrases[hash % phrases.length]
}

/**
 * Frase motivacional individual no sino (client-side).
 * Push de inatividade (com app fechado) é feito pela Cloud Function FCM.
 */
export function useMotivationalNotification(userId) {
  const { user, profile } = useAuth()
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
      message: buildPersonalizedPhrase(userId, profile, user),
      linkPath: '/edital-verticalizado',
      createdAt: Date.now(),
      read: false,
    }
    saveState(userId, { day, item })
    setNotification(item)
  }, [userId, profile?.displayName, profile?.name, user?.displayName, user?.email])

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
