/**
 * Registra uso de tokens/custo da API Gemini no Firestore para o painel admin.
 */
import {
  addDoc,
  collection,
  doc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore'
import { auth, db } from '../firebase/config'
import { estimateGeminiUsd, todayKey } from '../utils/geminiPricing'

/**
 * Extrai usageMetadata da resposta Gemini (REST ou SDK).
 */
export function extractUsageMetadata(response) {
  return (
    response?.usageMetadata ||
    response?.usage_metadata ||
    response?.response?.usageMetadata ||
    null
  )
}

/**
 * Grava um evento de uso (fire-and-forget; não bloqueia a geração).
 */
export async function trackGeminiUsage({
  response,
  model,
  purpose = 'generate',
  courseId = null,
  provider = 'gemini',
} = {}) {
  try {
    if (!db) return null
    const usage = extractUsageMetadata(response)
    if (!usage) return null

    const stats = estimateGeminiUsd(usage, model)
    if (!stats.totalTokens && !stats.promptTokens && !stats.outputTokens) return null

    const user = auth?.currentUser || null
    const dayKey = todayKey()
    const payload = {
      provider,
      model: String(model || 'unknown'),
      purpose: String(purpose || 'generate').slice(0, 80),
      courseId: courseId || null,
      userId: user?.uid || null,
      userEmail: user?.email || null,
      promptTokens: stats.promptTokens,
      candidatesTokens: stats.candidatesTokens,
      thoughtsTokens: stats.thoughtsTokens,
      outputTokens: stats.outputTokens,
      totalTokens: stats.totalTokens,
      estimatedUsd: stats.estimatedUsd,
      dayKey,
      createdAt: serverTimestamp(),
      createdAtMs: Date.now(),
    }

    await addDoc(collection(db, 'aiUsageEvents'), payload)

    // Agregado diário (rápido no admin) — só contadores flat (increment aninhado é frágil)
    const dailyRef = doc(db, 'aiUsageDaily', dayKey)
    await setDoc(
      dailyRef,
      {
        dayKey,
        calls: increment(1),
        promptTokens: increment(stats.promptTokens),
        outputTokens: increment(stats.outputTokens),
        totalTokens: increment(stats.totalTokens),
        estimatedUsd: increment(stats.estimatedUsd),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    )

    return payload
  } catch (err) {
    // Nunca derruba a geração por falha de telemetria
    console.warn('[aiUsageTracker]', err?.message || err)
    return null
  }
}

/**
 * Carrega eventos recentes (admin).
 */
export async function fetchAiUsageEvents({ days = 30, max = 500 } = {}) {
  const since = Date.now() - days * 24 * 60 * 60 * 1000
  const q = query(
    collection(db, 'aiUsageEvents'),
    where('createdAtMs', '>=', since),
    orderBy('createdAtMs', 'desc'),
    limit(max),
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

/**
 * Carrega agregados diários (admin).
 */
export async function fetchAiUsageDaily({ days = 30 } = {}) {
  const keys = []
  const now = new Date()
  for (let i = 0; i < days; i += 1) {
    const d = new Date(now)
    d.setDate(now.getDate() - i)
    keys.push(todayKey(d))
  }

  // Firestore 'in' max 30
  const chunk = keys.slice(0, 30)
  const q = query(collection(db, 'aiUsageDaily'), where('dayKey', 'in', chunk))
  const snap = await getDocs(q)
  const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
  rows.sort((a, b) => String(b.dayKey).localeCompare(String(a.dayKey)))
  return rows
}

export function aggregateUsageRows(events = []) {
  const byPurpose = {}
  const byModel = {}
  let promptTokens = 0
  let outputTokens = 0
  let totalTokens = 0
  let estimatedUsd = 0
  let calls = 0

  for (const e of events) {
    calls += 1
    promptTokens += Number(e.promptTokens) || 0
    outputTokens += Number(e.outputTokens) || 0
    totalTokens += Number(e.totalTokens) || 0
    estimatedUsd += Number(e.estimatedUsd) || 0

    const purpose = e.purpose || 'generate'
    if (!byPurpose[purpose]) {
      byPurpose[purpose] = { calls: 0, totalTokens: 0, estimatedUsd: 0 }
    }
    byPurpose[purpose].calls += 1
    byPurpose[purpose].totalTokens += Number(e.totalTokens) || 0
    byPurpose[purpose].estimatedUsd += Number(e.estimatedUsd) || 0

    const model = e.model || 'unknown'
    if (!byModel[model]) {
      byModel[model] = { calls: 0, totalTokens: 0, estimatedUsd: 0 }
    }
    byModel[model].calls += 1
    byModel[model].totalTokens += Number(e.totalTokens) || 0
    byModel[model].estimatedUsd += Number(e.estimatedUsd) || 0
  }

  return {
    calls,
    promptTokens,
    outputTokens,
    totalTokens,
    estimatedUsd,
    byPurpose,
    byModel,
  }
}
