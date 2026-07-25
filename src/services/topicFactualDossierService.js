/**
 * Dossiê factual único por tópico — Firestore + localStorage.
 * 1 pesquisa (ou Gemini Search) por tópico; material/questões/flashcards reutilizam.
 */

import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase/config'
import { normalizeTopicKeyForStorage } from '../utils/topicKeyFirestore'
import { modoIaCacheKey } from './googleAiWebDossierService'

const TTL_MS = 7 * 24 * 60 * 60 * 1000
const MIN_DOSSIER_CHARS = 120
/** A partir daqui dá para gerar lotes sem grounding por chamada */
export const RICH_DOSSIER_CHARS = 400

const memoryCache = new Map()
const inFlight = new Map()

function dossierDocId(meta = {}) {
  const topic = normalizeTopicKeyForStorage(meta.topicKey || meta.topicoNome || '')
  const disc = String(meta.disciplina || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
  const base = `${disc}__${topic || 'topic'}`.slice(0, 700)
  return base || modoIaCacheKey(meta).replace(/[^a-z0-9_-]/gi, '').slice(0, 100)
}

function isFresh(createdAtMs) {
  return Number(createdAtMs || 0) > 0 && Date.now() - Number(createdAtMs) < TTL_MS
}

function memKey(meta = {}) {
  return `${meta.courseId || 'x'}|${dossierDocId(meta)}`
}

/**
 * Lê dossiê do Firestore (compartilhado entre admins/abas).
 */
export async function readFirestoreTopicDossier(meta = {}) {
  const courseId = meta.courseId
  if (!courseId) return null
  const id = dossierDocId(meta)
  try {
    const snap = await getDoc(doc(db, 'courses', courseId, 'aiDossiers', id))
    if (!snap.exists()) return null
    const data = snap.data() || {}
    const text = String(data.text || '').trim()
    const createdAtMs =
      data.createdAtMs ||
      (data.createdAt?.toMillis ? data.createdAt.toMillis() : 0) ||
      0
    if (text.length < MIN_DOSSIER_CHARS || !isFresh(createdAtMs)) return null
    return { text, source: data.source || 'firestore', cached: true, createdAtMs }
  } catch (err) {
    console.warn('[aiDossier] read Firestore:', err?.message || err)
    return null
  }
}

/**
 * Persiste dossiê no Firestore (admin).
 */
export async function writeFirestoreTopicDossier(meta = {}, text = '', source = 'gemini_search') {
  const courseId = meta.courseId
  const clean = String(text || '').trim()
  if (!courseId || clean.length < MIN_DOSSIER_CHARS) return false
  const id = dossierDocId(meta)
  try {
    await setDoc(
      doc(db, 'courses', courseId, 'aiDossiers', id),
      {
        text: clean.slice(0, 48000),
        source,
        topicKey: meta.topicKey || meta.topicoNome || '',
        disciplina: meta.disciplina || '',
        banca: meta.banca || '',
        cargo: meta.cargo || '',
        createdAtMs: Date.now(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    )
    memoryCache.set(memKey(meta), { text: clean, source, cached: true, createdAtMs: Date.now() })
    return true
  } catch (err) {
    console.warn('[aiDossier] write Firestore:', err?.message || err)
    return false
  }
}

/**
 * Obtém ou cria dossiê (Firestore → memória → fluxo existente Modo IA / Search).
 * Deduplica chamadas paralelas do mesmo tópico.
 */
export async function getOrCreateTopicFactualDossier(meta = {}, options = {}) {
  const key = memKey(meta)
  if (!options.forceFresh) {
    const mem = memoryCache.get(key)
    if (mem?.text && isFresh(mem.createdAtMs)) return { ...mem, cached: true }

    const fromFs = await readFirestoreTopicDossier(meta)
    if (fromFs?.text) {
      memoryCache.set(key, fromFs)
      return fromFs
    }
  }

  if (inFlight.has(key)) return inFlight.get(key)

  const promise = (async () => {
    const { getGoogleAiTopicDossierOptional } = await import('./googleAiBrowserVerifier')
    const result = await getGoogleAiTopicDossierOptional(meta, {
      forceFresh: options.forceFresh,
      onStatus: options.onStatus,
      skipFirestore: true, // evita loop: optional chama este serviço
    })
    const text = String(result?.text || '').trim()
    if (text.length >= MIN_DOSSIER_CHARS) {
      await writeFirestoreTopicDossier(meta, text, result?.source || 'generated')
      const packed = {
        text,
        source: result?.source || 'generated',
        cached: Boolean(result?.cached),
        createdAtMs: Date.now(),
      }
      memoryCache.set(key, packed)
      return packed
    }
    return { text: '', source: null, cached: false, skipped: true }
  })()

  inFlight.set(key, promise)
  try {
    return await promise
  } finally {
    inFlight.delete(key)
  }
}

export function hasRichDossier(dossier) {
  return String(dossier?.text || '').trim().length >= RICH_DOSSIER_CHARS
}

/**
 * Opções de geração baratas quando o dossiê já cobre os fatos.
 * Qualidade: fatos vêm do dossiê; Search só se dossiê fraco.
 */
export function aiOptionsWithDossier(baseOptions = {}, dossier = null) {
  const rich = hasRichDossier(dossier)
  return {
    ...baseOptions,
    useRAG: false,
    // Com dossiê rico: sem grounding por chamada (economia grande em lotes)
    useGoogleSearch: rich ? false : baseOptions.useGoogleSearch !== false,
    _dossierAttached: rich,
  }
}
