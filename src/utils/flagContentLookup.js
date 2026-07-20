/**
 * Resolve docs Firestore a partir de flags da Moderação.
 * Espelha a lógica de functions/generation/professorSupervisor* (cliente).
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  where,
} from 'firebase/firestore'
import { db } from '../firebase/config'

export function sanitizeTopicKeyForFirestore(topicKey = '') {
  if (!topicKey) return ''

  let decoded = topicKey
  try {
    decoded = decodeURIComponent(topicKey)
  } catch {
    decoded = topicKey
  }

  let sanitized = decoded
    .replace(/::/g, '_DOUBLECOLON_')
    .replace(/\//g, '_SLASH_')
    .replace(/\\/g, '_BACKSLASH_')
    .trim()

  if (sanitized.length > 400) sanitized = sanitized.substring(0, 400)

  if (!sanitized || sanitized.trim() === '') {
    const hash = topicKey.split('').reduce((acc, char) => {
      return (acc << 5) - acc + char.charCodeAt(0)
    }, 0)
    return `topic_${Math.abs(hash).toString(36)}`
  }

  return sanitized
}

export function sanitizeDisciplinaKey(nome = '') {
  return (nome || '').replace(/[^a-zA-Z0-9]/g, '_').substring(0, 100)
}

export function normalizeFlashcardDocId(refId) {
  const raw = String(refId || '').trim()
  if (!raw) return ''
  const fcMatch = raw.match(/_fc_(.+)$/)
  if (fcMatch) {
    const rest = fcMatch[1]
    // Formato sem doc id: ..._i0_h{hash} — não é ID do Firestore
    if (/_i\d+_h[a-z0-9]+$/i.test(rest)) return ''
    return rest
  }
  return raw
}

function stripHtmlLite(html = '') {
  return String(html)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function simpleHash(text = '') {
  let h = 0
  const s = String(text)
  for (let i = 0; i < s.length; i += 1) {
    h = (h << 5) - h + s.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h).toString(36)
}

function parseQuestaoContentId(contentId = '') {
  const id = String(contentId || '')
  // Preferir _pack_ (novo); legado _p só após _e… ou _i…
  const packMatch =
    id.match(/_pack_([a-zA-Z0-9_-]+)$/) ||
    id.match(/(?:_e[a-z0-9]+|_i\d+)_p([a-zA-Z0-9_-]+)$/i)
  const packFromId = packMatch?.[1] || ''
  const nivelMatch = id.match(/_n(\d+)(?:_|$)/)
  const qWithSuffix = id.match(/_q(\d+)_/)
  const qAtEnd = id.match(/_q(\d+)$/)
  const eHash = id.match(/_e([a-z0-9]+)/i)
  const iIndex = id.match(/_i(\d+)/)
  return {
    packFromId,
    nivel: nivelMatch ? Number(nivelMatch[1]) : null,
    qNumero: qWithSuffix ? Number(qWithSuffix[1]) : null,
    qIndexLegacy: !qWithSuffix && qAtEnd ? Number(qAtEnd[1]) : null,
    eHash: eHash?.[1] || '',
    iIndex: iIndex ? Number(iIndex[1]) : null,
  }
}

function resolveQuestaoIndex(questoes, contentId, preview = '') {
  if (!Array.isArray(questoes) || !questoes.length) return -1
  const parsed = parseQuestaoContentId(contentId)
  const id = String(contentId || '')

  // 1) Hash do enunciado — identidade estável (não depende da ordem do array)
  if (parsed.eHash) {
    const byHash = questoes.findIndex((q) => {
      const enunciado = String(q?.enunciado || '').slice(0, 240)
      return enunciado && simpleHash(enunciado) === parsed.eHash
    })
    if (byHash >= 0) return byHash
  }

  // 2) Preview do texto sinalizado
  const previewNorm = stripHtmlLite(preview).slice(0, 120).toLowerCase()
  if (previewNorm.length >= 16) {
    const byPreview = questoes.findIndex((q) => {
      const hay = stripHtmlLite(q?.enunciado || '').toLowerCase()
      if (!hay) return false
      return hay.includes(previewNorm) || previewNorm.includes(hay.slice(0, 100))
    })
    if (byPreview >= 0) return byPreview
  }

  // 3) Campo "numero" da questão (NÃO usar como índice do array)
  if (parsed.qNumero != null) {
    const byNumero = questoes.findIndex(
      (q) => Number(q?.numero) === parsed.qNumero || Number(q?.number) === parsed.qNumero,
    )
    if (byNumero >= 0) return byNumero
  }

  // 4) Índice explícito do builder: _i0, _i12
  if (parsed.iIndex != null && questoes[parsed.iIndex]) return parsed.iIndex

  // 5) Formato ResolverQuestoes `${packId}_${index}` — só se NÃO for ID canônico _nX_qY_
  const isCanonical = /_n\d+_q\d+_/.test(id)
  if (!isCanonical) {
    const trailingIdx = id.match(/_(\d+)$/)
    if (trailingIdx) {
      const idx = Number(trailingIdx[1])
      if (Number.isFinite(idx) && questoes[idx]) return idx
    }
  }

  // 6) Legacy index
  if (parsed.qIndexLegacy != null && questoes[parsed.qIndexLegacy]) {
    return parsed.qIndexLegacy
  }

  return -1
}

async function loadFlashcardDoc(courseId, contentId, preview = '') {
  const cardId = normalizeFlashcardDocId(contentId)
  const candidates = [...new Set([cardId, String(contentId || '').trim()].filter(Boolean))]

  for (const id of candidates) {
    const ref = doc(db, 'courses', courseId, 'flashcards', id)
    const snap = await getDoc(ref)
    if (snap.exists()) {
      return { ref, id: snap.id, data: snap.data() }
    }
  }

  for (const cand of candidates) {
    try {
      const q = query(
        collection(db, 'courses', courseId, 'flashcards'),
        where('id', '==', cand),
        limit(1),
      )
      const snap = await getDocs(q)
      if (!snap.empty) {
        const d = snap.docs[0]
        return { ref: d.ref, id: d.id, data: d.data() }
      }
    } catch {
      /* índice/permission — ignora */
    }
  }

  // Fallback: hash da pergunta no contentId (_h{hash}) ou preview
  const hashFromId = String(contentId || '').match(/_h([a-z0-9]+)$/i)?.[1] || ''
  const previewNorm = stripHtmlLite(preview).slice(0, 120).toLowerCase()
  if (hashFromId || previewNorm.length >= 12) {
    try {
      const snap = await getDocs(query(collection(db, 'courses', courseId, 'flashcards'), limit(200)))
      for (const d of snap.docs) {
        const data = d.data() || {}
        const pergunta = String(data.pergunta || data.frente || '')
        if (hashFromId && pergunta && simpleHash(pergunta.slice(0, 240)) === hashFromId) {
          return { ref: d.ref, id: d.id, data }
        }
        if (previewNorm.length >= 12) {
          const hay = stripHtmlLite(pergunta).toLowerCase()
          if (hay.includes(previewNorm) || previewNorm.includes(hay.slice(0, 100))) {
            return { ref: d.ref, id: d.id, data }
          }
        }
      }
    } catch {
      /* ignore */
    }
  }

  return null
}

async function loadMaterialDoc(courseId, flag) {
  const type = String(flag.contentType || '').toLowerCase()

  if (type === 'incidencia') {
    const key =
      sanitizeDisciplinaKey(flag.disciplinaNome || flag.topicKey || '') ||
      String(flag.topicKey || '').replace(/^incidencia_/, '').replace(/^d/, '')
    if (!key) return null
    const ref = doc(db, 'courses', courseId, 'conteudosIncidencia', key)
    const snap = await getDoc(ref)
    if (!snap.exists()) return null
    return { ref, id: snap.id, data: snap.data(), kind: 'incidencia' }
  }

  const topicKey = flag.topicKey || ''
  const candidates = []
  if (topicKey) candidates.push(sanitizeTopicKeyForFirestore(topicKey))

  // contentId no formato course_mat_completo_<topicSanitizedForContentId>
  const contentId = String(flag.contentId || '')
  const matMatch = contentId.match(/_mat_(?:completo|incidencia)_(.+)$/)
  if (matMatch?.[1]) {
    candidates.push(matMatch[1])
    // content-id usa _DC_/_SL_; firestore usa _DOUBLECOLON_/_SLASH_
    candidates.push(
      matMatch[1]
        .replace(/_DC_/g, '_DOUBLECOLON_')
        .replace(/_SL_/g, '_SLASH_')
        .replace(/_BS_/g, '_BACKSLASH_'),
    )
  }

  for (const docId of [...new Set(candidates.filter(Boolean))]) {
    const ref = doc(db, 'courses', courseId, 'conteudosCompletos', docId)
    const snap = await getDoc(ref)
    if (snap.exists()) {
      return { ref, id: snap.id, data: snap.data(), kind: 'material' }
    }
  }

  return null
}

async function tryQuestaoPack(courseId, collectionName, packId, contentId, preview) {
  if (!packId) return null
  const ref = doc(db, 'courses', courseId, collectionName, packId)
  const snap = await getDoc(ref)
  if (!snap.exists()) return null
  const data = snap.data() || {}
  const questoes = data.questoes || data.questions || []
  const idx = resolveQuestaoIndex(questoes, contentId, preview)
  if (idx < 0) return null
  return {
    ref,
    packId,
    idx,
    questao: questoes[idx],
    questoes,
    data,
    collection: collectionName,
  }
}

async function loadQuestaoDoc(courseId, flag) {
  const contentId = String(flag.contentId || '')
  const topicKey = flag.topicKey
  const preview = flag.preview || ''
  const parsed = parseQuestaoContentId(contentId)
  const isCanonical = /_n\d+_q\d+_/.test(contentId)

  // Pack explícito no ID canônico (_p...)
  if (parsed.packFromId) {
    for (const col of ['questoesTopico', 'questoesIncidencia']) {
      const hit = await tryQuestaoPack(courseId, col, parsed.packFromId, contentId, preview)
      if (hit) return hit
    }
  }

  // Formato legado ResolverQuestoes: `${packId}_${index}` — só se NÃO for ID canônico
  if (!isCanonical) {
    const packIdxMatch = contentId.match(/^(.+)_(\d+)$/)
    if (packIdxMatch) {
      const packId = packIdxMatch[1]
      for (const col of ['questoesTopico', 'questoesIncidencia']) {
        const hit = await tryQuestaoPack(courseId, col, packId, contentId, preview)
        if (hit) return hit
      }
    }
  }

  if (topicKey) {
    const sanitized = sanitizeTopicKeyForFirestore(topicKey)
    const niveis = parsed.nivel ? [parsed.nivel] : [1, 2, 3, 4, 5]
    for (const nivel of niveis) {
      const hit = await tryQuestaoPack(
        courseId,
        'questoesTopico',
        `${sanitized}_nivel_${nivel}`,
        contentId,
        preview,
      )
      if (hit) return hit
    }
    const plain = await tryQuestaoPack(courseId, 'questoesTopico', sanitized, contentId, preview)
    if (plain) return plain
  }

  // Varredura limitada por preview/enunciado
  try {
    const packsSnap = await getDocs(
      query(collection(db, 'courses', courseId, 'questoesTopico'), limit(80)),
    )
    for (const packDoc of packsSnap.docs) {
      const id = packDoc.id
      if (
        parsed.packFromId &&
        !(
          id === parsed.packFromId ||
          id.startsWith(parsed.packFromId) ||
          parsed.packFromId.startsWith(id.slice(0, 40))
        )
      ) {
        // se tem packFromId, prioriza packs parecidos; senão varre tudo
        if (parsed.packFromId.length >= 8) continue
      }
      const data = packDoc.data() || {}
      const questoes = data.questoes || data.questions || []
      const idx = resolveQuestaoIndex(questoes, contentId, preview)
      if (idx >= 0) {
        return {
          ref: packDoc.ref,
          packId: id,
          idx,
          questao: questoes[idx],
          questoes,
          data,
          collection: 'questoesTopico',
        }
      }
    }
  } catch {
    /* ignore */
  }

  try {
    const incSnap = await getDocs(
      query(collection(db, 'courses', courseId, 'questoesIncidencia'), limit(40)),
    )
    for (const packDoc of incSnap.docs) {
      const data = packDoc.data() || {}
      const questoes = data.questoes || data.questions || []
      const idx = resolveQuestaoIndex(questoes, contentId, preview)
      if (idx >= 0) {
        return {
          ref: packDoc.ref,
          packId: packDoc.id,
          idx,
          questao: questoes[idx],
          questoes,
          data,
          collection: 'questoesIncidencia',
        }
      }
    }
  } catch {
    /* ignore */
  }

  return null
}

/**
 * Carrega o bloco de conteúdo sinalizado para o Professor local.
 * @returns {null | { kind, ref, text, data, meta? }}
 */
export async function loadFlaggedContentForLocal(courseId, flag) {
  const type = String(flag.contentType || '').toLowerCase()

  if (type === 'flashcard' || type === 'flashcards' || type === 'topico') {
    const found = await loadFlashcardDoc(courseId, flag.contentId, flag.preview || '')
    if (!found) return null
    const d = found.data || {}
    return {
      kind: 'flashcard',
      ref: found.ref,
      text: `FRENTE:\n${d.pergunta || d.frente || ''}\n\nVERSO:\n${d.resposta || d.verso || ''}`,
      data: d,
      meta: { docId: found.id },
    }
  }

  if (type === 'questao' || type === 'questoes') {
    const found = await loadQuestaoDoc(courseId, flag)
    if (!found) return null
    return {
      kind: 'questao',
      ref: found.ref,
      text: JSON.stringify(
        {
          packId: found.packId,
          indice: found.idx,
          enunciado: found.questao?.enunciado,
          alternativas: found.questao?.alternativas,
          correta:
            found.questao?.respostaCorreta ||
            found.questao?.correta ||
            found.questao?.gabarito,
          gabaritoComentado:
            found.questao?.gabaritoComentado ||
            found.questao?.explicacao ||
            found.questao?.comentario,
        },
        null,
        2,
      ).slice(0, 20000),
      data: found.data,
      meta: {
        packId: found.packId,
        idx: found.idx,
        collection: found.collection,
        questoes: found.questoes,
      },
    }
  }

  if (
    type === 'material' ||
    type === 'materia' ||
    type === 'incidencia' ||
    type === 'conteudo' ||
    !type
  ) {
    const found = await loadMaterialDoc(courseId, flag)
    if (!found) return null
    return {
      kind: found.kind === 'incidencia' ? 'incidencia' : 'material',
      ref: found.ref,
      text: JSON.stringify(found.data, null, 2).slice(0, 20000),
      data: found.data,
      meta: { docId: found.id },
    }
  }

  return null
}
