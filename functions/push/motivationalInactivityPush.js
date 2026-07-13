const admin = require('firebase-admin')

const INACTIVITY_MS = 24 * 60 * 60 * 1000
const MIN_GAP_BETWEEN_PUSH_MS = 20 * 60 * 60 * 1000
const BATCH_USERS = 400

function getDb() {
  return admin.firestore()
}

function toMillis(ts) {
  if (!ts) return 0
  if (typeof ts.toMillis === 'function') return ts.toMillis()
  if (ts._seconds) return ts._seconds * 1000
  if (typeof ts === 'number') return ts
  return 0
}

function firstName(displayName, email) {
  const raw = String(displayName || '').trim() || String(email || '').split('@')[0] || 'concurseiro'
  return raw.split(/\s+/)[0]
}

function daysInactive(lastMs, now) {
  if (!lastMs) return 2
  return Math.max(1, Math.floor((now - lastMs) / (24 * 60 * 60 * 1000)))
}

function buildMotivationalMessage(user, days) {
  const name = firstName(user.displayName || user.name, user.email)
  const courseHint = user.selectedCourseName || user.courseName || ''
  const phrases = [
    {
      title: `${name}, bora retomar?`,
      body: `Já faz ${days} dia${days > 1 ? 's' : ''} sem estudar. Um bloco curto de flashcards muda o jogo.`,
      link: '/flashcards',
    },
    {
      title: `${name}, sua aprovação não pausa`,
      body: courseHint
        ? `O curso ${courseHint} te espera. Revise 10 cards agora.`
        : `Revise 10 cards agora — consistência vence intensidade.`,
      link: '/edital-verticalizado',
    },
    {
      title: `Saudades do seu ritmo, ${name}`,
      body: `Que tal 15 minutos de revisão? Seu futuro eu agradece.`,
      link: '/vespera-de-prova',
    },
    {
      title: `${name}, o edital não espera`,
      body: `Você ficou ${days} dia${days > 1 ? 's' : ''} offline. Abra o Guia Mentorado e avance um tópico.`,
      link: '/guia-mentorado',
    },
    {
      title: `Lembrete personalizado pra você`,
      body: `${name}, um pouco todo dia vale mais que uma maratona. Vamos estudar?`,
      link: '/dashboard',
    },
  ]

  let hash = 0
  const key = `${user.uid || ''}:${days}:${Math.floor(Date.now() / 86400000)}`
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) >>> 0
  return phrases[hash % phrases.length]
}

async function resolveLastSeenMs(db, uid, userData) {
  const fromUser = toMillis(userData.lastAccessAt || userData.lastSeen)
  try {
    const presence = await db.doc(`presence/${uid}`).get()
    if (presence.exists) {
      const p = presence.data() || {}
      const fromPresence = toMillis(p.lastSeen || p.updatedAt)
      return Math.max(fromUser, fromPresence)
    }
  } catch {
    /* ignore */
  }
  return fromUser
}

async function pruneInvalidTokens(db, uid, tokens, responses) {
  const invalid = []
  responses.forEach((r, i) => {
    if (r.success) return
    const code = r.error?.code || ''
    if (
      code.includes('registration-token-not-registered') ||
      code.includes('invalid-registration-token') ||
      code.includes('invalid-argument')
    ) {
      invalid.push(tokens[i])
    }
  })
  if (!invalid.length) return
  const remaining = tokens.filter((t) => !invalid.includes(t))
  await db.doc(`users/${uid}`).set(
    {
      fcmTokens: remaining,
      pushEnabled: remaining.length > 0,
      fcmTokenUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  )
}

/**
 * Envia push motivacional para usuários com push ativo e inativos há 24h+.
 */
async function runMotivationalInactivityPush() {
  const db = getDb()
  const now = Date.now()
  let sent = 0
  let skipped = 0
  let errors = 0

  let lastDoc = null
  let hasMore = true

  while (hasMore) {
    let q = db.collection('users').where('pushEnabled', '==', true).limit(BATCH_USERS)
    if (lastDoc) q = q.startAfter(lastDoc)
    const snap = await q.get()
    if (snap.empty) break
    lastDoc = snap.docs[snap.docs.length - 1]
    hasMore = snap.size === BATCH_USERS

    for (const docSnap of snap.docs) {
      const uid = docSnap.id
      const data = docSnap.data() || {}
      if (data.role === 'admin') {
        skipped += 1
        continue
      }

      const tokens = Array.isArray(data.fcmTokens)
        ? [...new Set(data.fcmTokens.filter((t) => typeof t === 'string' && t.length > 20))]
        : []
      if (!tokens.length) {
        skipped += 1
        continue
      }

      const lastPush = toMillis(data.lastMotivationalPushAt)
      if (lastPush && now - lastPush < MIN_GAP_BETWEEN_PUSH_MS) {
        skipped += 1
        continue
      }

      const lastSeen = await resolveLastSeenMs(db, uid, data)
      if (lastSeen && now - lastSeen < INACTIVITY_MS) {
        skipped += 1
        continue
      }

      const days = daysInactive(lastSeen, now)
      const msg = buildMotivationalMessage({ ...data, uid }, days)

      try {
        const response = await admin.messaging().sendEachForMulticast({
          tokens,
          notification: {
            title: msg.title,
            body: msg.body,
          },
          data: {
            title: msg.title,
            body: msg.body,
            link: msg.link,
            type: 'motivation_push',
            tag: `motivation-${uid}`,
          },
          webpush: {
            fcmOptions: {
              link: msg.link,
            },
            notification: {
              title: msg.title,
              body: msg.body,
              icon: '/favicon-192x192.png',
            },
          },
        })

        sent += response.successCount || 0
        if (response.failureCount) {
          await pruneInvalidTokens(db, uid, tokens, response.responses || [])
        }

        await db.doc(`users/${uid}`).set(
          {
            lastMotivationalPushAt: admin.firestore.FieldValue.serverTimestamp(),
            lastMotivationalPushDays: days,
          },
          { merge: true },
        )

        await db.collection(`users/${uid}/notifications`).add({
          type: 'motivation_push',
          tone: 'motivation',
          title: msg.title,
          message: msg.body,
          linkPath: msg.link,
          read: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        })
      } catch (err) {
        errors += 1
        console.warn('[motivationalPush]', uid, err?.message || err)
      }
    }
  }

  return { sent, skipped, errors }
}

module.exports = {
  runMotivationalInactivityPush,
  buildMotivationalMessage,
}
