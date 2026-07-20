import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore'
import { db } from '../firebase/config'
import {
  getRedacaoWeekKey,
  isNotaMil,
  MAX_REDACOES_POR_SEMANA,
} from '../utils/redacaoWeek'

export { getRedacaoWeekKey, MAX_REDACOES_POR_SEMANA, isNotaMil }

function weeklyDocId(courseId, weekKey) {
  return `${courseId}__${weekKey}`
}

/**
 * Conta redações válidas do aluno na semana (por curso).
 */
export async function countWeeklyRedacoes(userId, courseId, weekKey = getRedacaoWeekKey()) {
  if (!db || !userId || !courseId) return 0
  const snap = await getDoc(doc(db, 'users', userId, 'redacaoWeekly', weeklyDocId(courseId, weekKey)))
  if (!snap.exists()) return 0
  return Number(snap.data()?.count) || 0
}

export async function getWeeklyRedacaoQuota(userId, courseId) {
  const weekKey = getRedacaoWeekKey()
  const used = await countWeeklyRedacoes(userId, courseId, weekKey)
  return {
    weekKey,
    used,
    max: MAX_REDACOES_POR_SEMANA,
    remaining: Math.max(0, MAX_REDACOES_POR_SEMANA - used),
    canSubmit: used < MAX_REDACOES_POR_SEMANA,
  }
}

/**
 * Persiste redação corrigida + atualiza resumo do curso.
 */
export async function saveStudentRedacao(userId, payload) {
  if (!db || !userId) throw new Error('Usuário não autenticado.')
  const courseId = payload.courseId
  if (!courseId) throw new Error('Curso ausente.')

  const weekKey = payload.weekKey || getRedacaoWeekKey()
  const quota = await getWeeklyRedacaoQuota(userId, courseId)
  if (!quota.canSubmit) {
    const err = new Error(
      `Limite semanal atingido (${MAX_REDACOES_POR_SEMANA} redações por semana). Volte na próxima segunda.`,
    )
    err.code = 'redacao_weekly_limit'
    throw err
  }

  const nota = Math.max(0, Math.min(1000, Number(payload.nota) || 0))
  const docRef = await addDoc(collection(db, 'users', userId, 'redacoes'), {
    courseId,
    weekKey,
    tema: String(payload.tema || '').trim(),
    texto: String(payload.texto || ''),
    nota,
    criterios: payload.criterios || {},
    feedback: String(payload.feedback || ''),
    dicas: Array.isArray(payload.dicas) ? payload.dicas : [],
    redacaoModelo: String(payload.redacaoModelo || ''),
    wordCount: Number(payload.wordCount) || 0,
    isNota1000: isNotaMil(nota),
    createdAt: serverTimestamp(),
    analyzedAt: payload.analyzedAt || new Date().toISOString(),
  })

  const weekRef = doc(db, 'users', userId, 'redacaoWeekly', weeklyDocId(courseId, weekKey))
  const weekSnap = await getDoc(weekRef)
  const prevCount = weekSnap.exists() ? Number(weekSnap.data()?.count) || 0 : 0
  await setDoc(
    weekRef,
    {
      courseId,
      weekKey,
      count: prevCount + 1,
      lastRedacaoId: docRef.id,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )

  await refreshRedacaoSummary(userId, courseId)
  await clearRedacaoPendingNotification(userId, courseId, weekKey)

  return { id: docRef.id, weekKey, nota }
}

async function refreshRedacaoSummary(userId, courseId) {
  const q = query(
    collection(db, 'users', userId, 'redacoes'),
    where('courseId', '==', courseId),
    orderBy('createdAt', 'desc'),
    limit(100),
  )
  let snap
  try {
    snap = await getDocs(q)
  } catch {
    // Índice composto pode não existir — fallback sem orderBy
    snap = await getDocs(
      query(collection(db, 'users', userId, 'redacoes'), where('courseId', '==', courseId), limit(100)),
    )
  }

  const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
  const notas = rows.map((r) => Number(r.nota) || 0)
  const perfect = rows.filter((r) => r.isNota1000 || isNotaMil(r.nota))
  const avg = notas.length ? Math.round(notas.reduce((a, b) => a + b, 0) / notas.length) : 0
  const best = notas.length ? Math.max(...notas) : 0

  const critKeys = ['dominio', 'compreensao', 'argumentacao', 'estrutura', 'conhecimento']
  const criteriosAvg = {}
  critKeys.forEach((key) => {
    const vals = rows
      .map((r) => Number(r.criterios?.[key]))
      .filter((n) => Number.isFinite(n))
    criteriosAvg[key] = vals.length
      ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
      : 0
  })

  // Evolução: primeira → última (por data)
  const chronological = [...rows].sort(
    (a, b) => (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0),
  )
  const firstNota = chronological.length ? Number(chronological[0].nota) || 0 : null
  const lastNota = chronological.length
    ? Number(chronological[chronological.length - 1].nota) || 0
    : null

  await setDoc(
    doc(db, 'users', userId, 'redacaoSummary', courseId),
    {
      courseId,
      total: rows.length,
      averageNota: avg,
      bestNota: best,
      nota1000Count: perfect.length,
      lastNota: notas[0] ?? null,
      firstNota,
      improvement: firstNota != null && lastNota != null ? lastNota - firstNota : null,
      criteriosAvg,
      lastTema: rows[0]?.tema || '',
      lastAt: rows[0]?.createdAt || serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )
}

export async function listStudentRedacoes(userId, courseId, { max = 40 } = {}) {
  if (!db || !userId || !courseId) return []
  try {
    const q = query(
      collection(db, 'users', userId, 'redacoes'),
      where('courseId', '==', courseId),
      orderBy('createdAt', 'desc'),
      limit(max),
    )
    const snap = await getDocs(q)
    return snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
      createdAtMs: d.data().createdAt?.toMillis?.() || 0,
    }))
  } catch {
    const snap = await getDocs(
      query(collection(db, 'users', userId, 'redacoes'), where('courseId', '==', courseId), limit(max)),
    )
    return snap.docs
      .map((d) => ({
        id: d.id,
        ...d.data(),
        createdAtMs: d.data().createdAt?.toMillis?.() || 0,
      }))
      .sort((a, b) => b.createdAtMs - a.createdAtMs)
  }
}

export async function getRedacaoSummary(userId, courseId) {
  if (!db || !userId || !courseId) return null
  const snap = await getDoc(doc(db, 'users', userId, 'redacaoSummary', courseId))
  return snap.exists() ? { id: snap.id, ...snap.data() } : null
}

/**
 * Garante notificação de redação pendente da semana (aluno).
 */
export async function ensureRedacaoPendingNotification(userId, courseId, { tema } = {}) {
  if (!db || !userId || !courseId) return null
  const weekKey = getRedacaoWeekKey()
  const quota = await getWeeklyRedacaoQuota(userId, courseId)
  if (!quota.canSubmit || quota.used > 0) {
    await clearRedacaoPendingNotification(userId, courseId, weekKey)
    return null
  }

  const notifId = `redacao_pending_${courseId}_${weekKey}`
  const ref = doc(db, 'users', userId, 'notifications', notifId)
  const existing = await getDoc(ref)
  if (existing.exists() && existing.data()?.read === false) return notifId

  await setDoc(
    ref,
    {
      type: 'redacao_weekly_pending',
      tone: 'amber',
      title: 'Redação da semana pendente',
      message: tema
        ? `Você ainda não enviou a redação desta semana. Tema: ${String(tema).slice(0, 140)}`
        : 'Há um tema de redação disponível. Envie sua redação da semana no Treino de Redação.',
      courseId,
      weekKey,
      linkPath: '/treino-redacao',
      href: '/treino-redacao',
      read: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )
  return notifId
}

export async function clearRedacaoPendingNotification(userId, courseId, weekKey = getRedacaoWeekKey()) {
  if (!db || !userId || !courseId) return
  const notifId = `redacao_pending_${courseId}_${weekKey}`
  try {
    await setDoc(
      doc(db, 'users', userId, 'notifications', notifId),
      { read: true, clearedAt: serverTimestamp() },
      { merge: true },
    )
  } catch {
    /* ignore */
  }
}

/**
 * Admin/Professor: notifica alunos do curso sobre novo tema.
 */
export async function notifyCourseStudentsNewRedacaoTheme(courseId, tema) {
  if (!db || !courseId) return 0
  const weekKey = getRedacaoWeekKey()
  const usersSnap = await getDocs(collection(db, 'users'))
  let n = 0
  for (const userDoc of usersSnap.docs) {
    const data = userDoc.data() || {}
    if (data.role === 'admin' || data.deleted) continue
    if (String(data.selectedCourseId || '') !== String(courseId)) continue
    const uid = userDoc.id
    const notifId = `redacao_pending_${courseId}_${weekKey}`
    try {
      await setDoc(
        doc(db, 'users', uid, 'notifications', notifId),
        {
          type: 'redacao_weekly_pending',
          tone: 'amber',
          title: 'Novo tema de redação da semana',
          message: `Tema da semana: ${String(tema || '').slice(0, 160)}. Envie sua redação (limite: ${MAX_REDACOES_POR_SEMANA}/semana).`,
          courseId,
          weekKey,
          linkPath: '/treino-redacao',
          href: '/treino-redacao',
          read: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      )
      n += 1
    } catch (err) {
      console.warn('[redacao] notify student', uid, err?.message)
    }
  }
  return n
}
