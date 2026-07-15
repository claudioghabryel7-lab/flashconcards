const admin = require('firebase-admin')
const { sanitizeTopicKeyForFirestore } = require('./topicKeyUtils')

function getDb() {
  return admin.firestore()
}

function docPath(courseId, collection, docId) {
  return `courses/${courseId}/${collection}/${docId}`
}

function textsEqual(a, b) {
  return (
    String(a || '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase() ===
    String(b || '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
  )
}

function stripHtmlLite(value = '') {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function getByPath(obj, path) {
  if (!obj || !path) return undefined
  return String(path)
    .split('.')
    .reduce((acc, key) => {
      if (acc == null) return undefined
      const idx = /^\d+$/.test(key) ? Number(key) : key
      return acc[idx]
    }, obj)
}

function setByPath(obj, path, value) {
  const parts = String(path).split('.')
  const root = Array.isArray(obj) ? [...obj] : { ...obj }
  let cursor = root
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = /^\d+$/.test(parts[i]) ? Number(parts[i]) : parts[i]
    const nextKey = parts[i + 1]
    const nextIsIndex = /^\d+$/.test(nextKey)
    const current = cursor[key]
    const clone = Array.isArray(current)
      ? [...current]
      : current && typeof current === 'object'
        ? { ...current }
        : nextIsIndex
          ? []
          : {}
    cursor[key] = clone
    cursor = clone
  }
  const last = /^\d+$/.test(parts[parts.length - 1])
    ? Number(parts[parts.length - 1])
    : parts[parts.length - 1]
  cursor[last] = value
  return root
}

async function readDocFields(courseId, collection, docId, fields = []) {
  const snap = await getDb().doc(docPath(courseId, collection, docId)).get()
  if (!snap.exists) return null
  const data = snap.data()
  if (!fields.length) return { ...data, __docId: snap.id }
  const out = { __docId: snap.id }
  fields.forEach((f) => {
    out[f] = data[f]
  })
  return out
}

async function loadFlashcardBefore(courseId, docId, preferredId = '') {
  let before = await readDocFields(courseId, 'flashcards', docId, [
    'frente',
    'verso',
    'resposta',
    'pergunta',
  ])
  if (!before && preferredId && preferredId !== docId) {
    before = await readDocFields(courseId, 'flashcards', preferredId, [
      'frente',
      'verso',
      'resposta',
      'pergunta',
    ])
  }
  if (before) return before

  const candidates = [...new Set([docId, preferredId].filter(Boolean))]
  for (const cand of candidates) {
    try {
      const byField = await getDb()
        .collection(`courses/${courseId}/flashcards`)
        .where('id', '==', cand)
        .limit(1)
        .get()
      if (!byField.empty) {
        const d = byField.docs[0]
        const data = d.data() || {}
        return {
          __docId: d.id,
          frente: data.frente,
          verso: data.verso,
          pergunta: data.pergunta,
          resposta: data.resposta,
        }
      }
    } catch (_) {
      /* ignore */
    }
  }
  return null
}

function normalizeFlashcardDocId(refId) {
  const raw = String(refId || '').trim()
  if (!raw) return ''
  const fcMatch = raw.match(/_fc_(.+)$/)
  if (fcMatch) return fcMatch[1]
  return raw
}

/** Normaliza field da IA → schema real da questão. */
function normalizeQuestaoField(rawField) {
  const f = String(rawField || '').trim()
  const compact = f.toLowerCase().replace(/[^a-z0-9]/g, '')

  if (
    ['aligned', 'completo', 'questao', 'questaocompleta', 'bloco', 'pacote'].includes(compact)
  ) {
    return { kind: 'aligned', field: 'aligned' }
  }

  if (
    ['gabarito', 'resposta', 'respostacorreta', 'correta', 'answer', 'letra']
      .map((x) => x.toLowerCase().replace(/[^a-z0-9]/g, ''))
      .includes(compact)
  ) {
    return { kind: 'scalar', field: 'correta' }
  }

  if (
    ['comentario', 'explicacao', 'gabaritocomentado', 'comentariogabarito', 'feedback'].includes(
      compact,
    )
  ) {
    return { kind: 'scalar', field: 'gabaritoComentado' }
  }

  const altMatch =
    f.match(/^(?:alternativa[_.:\s-]*|alternativas[_.:\s-]*)([A-Ea-e])$/i) ||
    f.match(/^alternativas\.([A-Ea-e])$/i)
  if (altMatch) {
    return { kind: 'alternativa', letter: altMatch[1].toUpperCase() }
  }

  if (compact === 'enunciado' || compact === 'pergunta' || compact === 'texto') {
    return { kind: 'scalar', field: 'enunciado' }
  }

  return { kind: 'scalar', field: f || 'enunciado' }
}

/**
 * Consolida várias correções da mesma questão em um pacote alinhado
 * (enunciado + gabarito + explicação).
 */
function consolidateQuestaoCorrections(corrections = []) {
  const others = []
  const byRef = new Map()

  for (const c of corrections) {
    const t = String(c.target || '')
      .toLowerCase()
      .replace(/s$/, '')
    const isQuestao =
      t === 'questao' || t === 'questoe' || t === 'question' || t === 'questoes'
    if (!isQuestao) {
      others.push(c)
      continue
    }
    const ref = String(c.refId ?? '0')
    if (!byRef.has(ref)) {
      byRef.set(ref, {
        refId: c.refId ?? ref,
        confidence: Number(c.confidence) || 0,
        fields: {},
        alignedRaw: null,
      })
    }
    const bucket = byRef.get(ref)
    bucket.confidence = Math.max(bucket.confidence, Number(c.confidence) || 0)
    const mapped = normalizeQuestaoField(c.field)
    if (mapped.kind === 'aligned') {
      bucket.alignedRaw = c.newText
      continue
    }
    if (mapped.kind === 'alternativa') {
      if (!bucket.fields.alternativas) bucket.fields.alternativas = {}
      bucket.fields.alternativas[mapped.letter] = c.newText
      continue
    }
    bucket.fields[mapped.field] = c.newText
  }

  for (const bucket of byRef.values()) {
    let pack = { ...bucket.fields }
    if (bucket.alignedRaw) {
      try {
        const parsed = JSON.parse(bucket.alignedRaw)
        if (parsed && typeof parsed === 'object') {
          pack = { ...pack, ...parsed }
          if (parsed.alternativas && typeof parsed.alternativas === 'object') {
            pack.alternativas = { ...(pack.alternativas || {}), ...parsed.alternativas }
          }
        }
      } catch {
        // se não for JSON, trata como explicação
        if (!pack.gabaritoComentado) pack.gabaritoComentado = bucket.alignedRaw
      }
    }

    const touchesGabarito =
      pack.correta != null ||
      pack.respostaCorreta != null ||
      (pack.alternativas && Object.keys(pack.alternativas).length > 0)
    const hasExpl =
      pack.gabaritoComentado != null || pack.explicacao != null || pack.comentario != null
    const incompleteAlignment = Boolean(touchesGabarito && !hasExpl)

    others.push({
      target: 'questao',
      refId: bucket.refId,
      field: 'aligned',
      newText: JSON.stringify(pack),
      confidence: bucket.confidence || 0.85,
      incompleteAlignment,
    })
  }

  return others
}

function normalizeMaterialField(rawField) {
  const f = String(rawField || '').trim()
  const compact = f.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (['resumo', 'conteudo', 'texto', 'material', 'materia', 'corpo'].includes(compact) || !f) {
    return 'materia'
  }
  return f
}

function normalizeCorretaValue(text) {
  const raw = String(text || '').trim()
  const letter = raw.match(/\b([A-Ea-e])\b/)
  if (letter) return letter[1].toUpperCase()
  if (/^[A-Ea-e]$/.test(raw)) return raw.toUpperCase()
  return raw
}

function parseQuestaoContentId(contentId = '') {
  const id = String(contentId || '')
  // pack suffix: tudo após o último _p (pode estar truncado em 40 chars)
  const packIdx = id.lastIndexOf('_p')
  const packFromId = packIdx >= 0 ? id.slice(packIdx + 2) : ''
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

function simpleHash(text = '') {
  let h = 0
  const s = String(text)
  for (let i = 0; i < s.length; i += 1) {
    h = (h << 5) - h + s.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h).toString(36)
}

function resolveQuestaoIndex(questoes, contentId, fix = {}, packId = '') {
  if (!Array.isArray(questoes) || !questoes.length) return -1

  const parsed = parseQuestaoContentId(contentId)
  const fixRef = fix.refId != null ? String(fix.refId) : ''

  if (parsed.qIndexLegacy != null && questoes[parsed.qIndexLegacy]) {
    return parsed.qIndexLegacy
  }

  if (parsed.qNumero != null) {
    const asOneBased = parsed.qNumero - 1
    if (asOneBased >= 0 && questoes[asOneBased]) return asOneBased
    if (questoes[parsed.qNumero]) return parsed.qNumero
    const byNumero = questoes.findIndex(
      (q) => Number(q?.numero) === parsed.qNumero || Number(q?.number) === parsed.qNumero,
    )
    if (byNumero >= 0) return byNumero
  }

  if (parsed.iIndex != null && questoes[parsed.iIndex]) return parsed.iIndex

  if (parsed.eHash) {
    const byHash = questoes.findIndex((q) => {
      const enunciado = String(q?.enunciado || '').slice(0, 240)
      return enunciado && simpleHash(enunciado) === parsed.eHash
    })
    if (byHash >= 0) return byHash
  }

  // Match por preview/enunciado (quando hash diverge por HTML)
  const preview = stripHtmlLite(fix.preview || '').slice(0, 100).toLowerCase()
  if (preview.length >= 20) {
    const byPreview = questoes.findIndex((q) => {
      const hay = stripHtmlLite(q?.enunciado || '').toLowerCase()
      return hay.includes(preview) || preview.includes(hay.slice(0, 100))
    })
    if (byPreview >= 0) return byPreview
  }

  if (/^\d+$/.test(fixRef)) {
    const n = Number(fixRef)
    if (questoes[n]) return n
    if (n > 0 && questoes[n - 1]) return n - 1
  }

  const byLegacyId = questoes.findIndex((_, i) => {
    const id = `${packId}_q${i}`
    return (
      contentId === id ||
      String(contentId).includes(id) ||
      fixRef === id ||
      String(contentId).endsWith(`_q${i}`)
    )
  })
  if (byLegacyId >= 0) return byLegacyId

  const byOwnId = questoes.findIndex((q) => {
    const qid = q?.id || q?.uid
    return qid && String(contentId).includes(String(qid))
  })
  if (byOwnId >= 0) return byOwnId

  return -1
}

async function findFlaggedQuestao(courseId, payload = {}) {
  const db = getDb()
  const contentId = String(payload.contentId || '')
  const topicKey = payload.topicKey
  const preview = payload.preview || ''
  const parsed = parseQuestaoContentId(contentId)
  const fixHint = { preview, refId: null }

  const tryPack = async (packId) => {
    if (!packId) return null
    const snap = await db.doc(`courses/${courseId}/questoesTopico/${packId}`).get()
    if (!snap.exists) return null
    const data = snap.data() || {}
    const questoes = data.questoes || data.questions || []
    const idx = resolveQuestaoIndex(questoes, contentId, fixHint, packId)
    if (idx < 0) return null
    return { packSnap: snap, packId, questoes, idx, questao: questoes[idx] }
  }

  // 1) topicKey + nível do contentId (caminho mais confiável)
  if (topicKey) {
    const sanitized = sanitizeTopicKeyForFirestore(topicKey)
    const niveis = parsed.nivel
      ? [parsed.nivel]
      : [1, 2, 3, 4, 5]
    for (const nivel of niveis) {
      const hit = await tryPack(`${sanitized}_nivel_${nivel}`)
      if (hit) return hit
    }
    const hitPlain = await tryPack(sanitized)
    if (hitPlain) return hitPlain
  }

  // 2) packId do suffix _p… (pode estar truncado)
  if (parsed.packFromId) {
    const hitExact = await tryPack(parsed.packFromId)
    if (hitExact) return hitExact

    const packsSnap = await db.collection(`courses/${courseId}/questoesTopico`).limit(80).get()
    for (const packDoc of packsSnap.docs) {
      const id = packDoc.id
      if (
        id === parsed.packFromId ||
        id.startsWith(parsed.packFromId) ||
        parsed.packFromId.startsWith(id.slice(0, 40))
      ) {
        const questoes = packDoc.data()?.questoes || packDoc.data()?.questions || []
        const idx = resolveQuestaoIndex(questoes, contentId, fixHint, id)
        if (idx >= 0) {
          return {
            packSnap: packDoc,
            packId: id,
            questoes,
            idx,
            questao: questoes[idx],
          }
        }
      }
    }
  }

  // 3) Varredura ampla por enunciado/preview
  const packsSnap = await db.collection(`courses/${courseId}/questoesTopico`).limit(80).get()
  for (const packDoc of packsSnap.docs) {
    const data = packDoc.data() || {}
    const questoes = data.questoes || data.questions || []
    const idx = resolveQuestaoIndex(questoes, contentId, fixHint, packDoc.id)
    if (idx >= 0) {
      return {
        packSnap: packDoc,
        packId: packDoc.id,
        questoes,
        idx,
        questao: questoes[idx],
      }
    }
  }

  // 4) Questões de incidência
  try {
    const incSnap = await db.collection(`courses/${courseId}/questoesIncidencia`).limit(40).get()
    for (const packDoc of incSnap.docs) {
      const data = packDoc.data() || {}
      const questoes = data.questoes || data.questions || []
      const idx = resolveQuestaoIndex(questoes, contentId, fixHint, packDoc.id)
      if (idx >= 0) {
        return {
          packSnap: packDoc,
          packId: packDoc.id,
          questoes,
          idx,
          questao: questoes[idx],
          collection: 'questoesIncidencia',
        }
      }
    }
  } catch (_) {
    /* ignore */
  }

  return null
}

function listMaterialEditablePaths(data = {}) {
  const paths = ['materia (título do material)']
  if (data.content) paths.push('content (HTML legado)')
  if (data.raioXProbabilidade?.padraoBanca) paths.push('raioXProbabilidade.padraoBanca')
  ;(data.revisaoTurbo || []).forEach((item, i) => {
    paths.push(`revisaoTurbo.${i}.conteudo — ${item?.titulo || `bloco ${i + 1}`}`)
  })
  ;(data.pegadinhas || []).forEach((item, i) => {
    paths.push(`pegadinhas.${i}.conteudo — ${item?.titulo || `pegadinha ${i + 1}`}`)
  })
  ;(data.secoes || []).forEach((item, i) => {
    paths.push(`secoes.${i}.conteudo — ${item?.titulo || `seção ${i + 1}`}`)
  })
  ;(data.questoesPreditivas || []).forEach((item, i) => {
    paths.push(`questoesPreditivas.${i}.enunciado`)
    paths.push(`questoesPreditivas.${i}.correta`)
    paths.push(`questoesPreditivas.${i}.gabaritoComentado`)
  })
  return paths
}

function findMaterialPathByPreview(data, preview) {
  const needle = stripHtmlLite(preview).slice(0, 120).toLowerCase()
  if (needle.length < 8) return null

  const candidates = []
  ;(data.revisaoTurbo || []).forEach((item, i) => {
    candidates.push({ path: `revisaoTurbo.${i}.conteudo`, text: item?.conteudo })
  })
  ;(data.pegadinhas || []).forEach((item, i) => {
    candidates.push({ path: `pegadinhas.${i}.conteudo`, text: item?.conteudo })
  })
  ;(data.secoes || []).forEach((item, i) => {
    candidates.push({ path: `secoes.${i}.conteudo`, text: item?.conteudo })
  })
  if (data.content) candidates.push({ path: 'content', text: data.content })
  if (data.raioXProbabilidade?.padraoBanca) {
    candidates.push({ path: 'raioXProbabilidade.padraoBanca', text: data.raioXProbabilidade.padraoBanca })
  }
  ;(data.questoesPreditivas || []).forEach((item, i) => {
    candidates.push({ path: `questoesPreditivas.${i}.enunciado`, text: item?.enunciado })
    candidates.push({
      path: `questoesPreditivas.${i}.gabaritoComentado`,
      text: item?.gabaritoComentado || item?.explicacao,
    })
  })

  for (const cand of candidates) {
    const hay = stripHtmlLite(cand.text).toLowerCase()
    if (!hay) continue
    if (hay.includes(needle) || needle.includes(hay.slice(0, 120))) return cand.path
  }
  return null
}

function normalizeMaterialFieldPath(rawField, data, preview) {
  const f = String(rawField || '').trim()
  const compact = f.toLowerCase().replace(/[^a-z0-9.]/g, '')

  // Path explícito já no schema
  if (f.includes('.')) {
    if (getByPath(data, f) !== undefined || /\.\d+\./.test(f)) return f
  }

  if (
    !f ||
    ['resumo', 'conteudo', 'texto', 'material', 'corpo', 'explicacao', 'trecho'].includes(compact)
  ) {
    return findMaterialPathByPreview(data, preview) || 'revisaoTurbo.0.conteudo'
  }

  if (compact === 'materia' || compact === 'titulo') {
    // "materia" no schema é o título — só usar se o relato for claramente sobre o título
    const previewHit = findMaterialPathByPreview(data, preview)
    if (previewHit) return previewHit
    return 'materia'
  }

  if (compact === 'padraobanca') return 'raioXProbabilidade.padraoBanca'
  if (compact === 'content') return 'content'

  return findMaterialPathByPreview(data, preview) || f
}

async function applyCorrectionsWithSnapshot(courseId, itemType, payload, corrections = []) {
  const db = getDb()
  const ts = admin.firestore.FieldValue.serverTimestamp()
  const patches = []
  let applied = 0

  for (const fix of corrections) {
    if (!fix.newText && fix.newText !== '') continue
    const target = String(fix.target || '')
      .toLowerCase()
      .replace(/s$/, '')
    const normalizedTarget =
      target === 'questoe' || target === 'questoes' || target === 'question'
        ? 'questao'
        : target === 'flashcard' || target === 'card'
          ? 'flashcard'
          : target === 'materia'
            ? 'material'
            : target

    if (normalizedTarget === 'flashcard') {
      const collection = 'flashcards'
      const preferredId =
        payload?.contentType === 'flashcard'
          ? normalizeFlashcardDocId(payload.contentId)
          : ''
      const docId = normalizeFlashcardDocId(fix.refId) || preferredId
      if (!docId) continue

      const rawField = String(fix.field || '').toLowerCase()
      const fieldsToPatch = []
      if (rawField === 'ambos' || rawField === 'both' || rawField === 'frente_verso') {
        let frente = ''
        let verso = ''
        try {
          const parsed = JSON.parse(fix.newText)
          frente = parsed.frente || parsed.pergunta || ''
          verso = parsed.verso || parsed.resposta || ''
        } catch {
          const parts = String(fix.newText).split('|||')
          frente = (parts[0] || '').trim()
          verso = (parts[1] || '').trim()
        }
        if (frente) fieldsToPatch.push({ field: 'frente', text: frente })
        if (verso) fieldsToPatch.push({ field: 'verso', text: verso })
      } else {
        const field =
          rawField === 'frente' || rawField === 'pergunta'
            ? 'frente'
            : rawField === 'verso' || rawField === 'resposta'
              ? 'verso'
              : 'verso'
        fieldsToPatch.push({ field, text: fix.newText })
      }

      let before = await loadFlashcardBefore(courseId, docId, preferredId)
      if (!before || !fieldsToPatch.length) continue
      const finalDocId = before.__docId || docId

      const after = {
        frente: before.frente ?? before.pergunta,
        verso: before.verso ?? before.resposta,
        pergunta: before.pergunta ?? before.frente,
        resposta: before.resposta ?? before.verso,
        supervisorReviewed: true,
        updatedAt: ts,
      }
      const beforePatch = {}
      const afterPatch = {}
      let changed = false
      for (const { field, text } of fieldsToPatch) {
        const current =
          field === 'frente'
            ? before.frente ?? before.pergunta
            : before.verso ?? before.resposta
        if (textsEqual(current, text)) continue
        beforePatch[field] = current
        after[field] = text
        afterPatch[field] = text
        if (field === 'verso') {
          after.resposta = text
          afterPatch.resposta = text
        }
        if (field === 'frente') {
          after.pergunta = text
          afterPatch.pergunta = text
        }
        changed = true
      }
      if (!changed) continue

      await db.doc(docPath(courseId, collection, finalDocId)).set(after, { merge: true })
      patches.push({ collection, docId: finalDocId, before: beforePatch, after: afterPatch })
      applied += 1
      continue
    }

    if (normalizedTarget === 'material' && (payload?.topicKey || fix.refId || payload?.contentId)) {
      const isIncidencia = payload.contentType === 'incidencia'
      const collection = isIncidencia ? 'conteudosIncidencia' : 'conteudosCompletos'
      let docId = ''
      if (isIncidencia) {
        const { sanitizeDisciplinaKey } = require('./topicKeyUtils')
        docId = sanitizeDisciplinaKey(payload.topicKey || '')
      } else if (payload.topicKey) {
        docId = sanitizeTopicKeyForFirestore(payload.topicKey)
      } else {
        const cid = String(payload.contentId || '')
        const m = cid.match(/_mat_(?:completo|incidencia)_(.+)$/)
        docId = sanitizeTopicKeyForFirestore(m?.[1] || fix.refId || '')
      }
      if (!docId) continue
      const snap = await db.doc(docPath(courseId, collection, docId)).get()
      if (!snap.exists) continue
      const data = snap.data() || {}

      const path = normalizeMaterialFieldPath(fix.field, data, payload.preview || '')
      if (!path) continue

      const beforeVal = getByPath(data, path)
      if (beforeVal !== undefined && textsEqual(beforeVal, fix.newText)) continue

      let patchPayload = {}
      if (path.includes('.')) {
        const rootKey = path.split('.')[0]
        const nextRoot = setByPath({ [rootKey]: data[rootKey] }, path, fix.newText)[rootKey]
        patchPayload = { [rootKey]: nextRoot }
      } else {
        patchPayload = { [path]: fix.newText }
      }

      await snap.ref.set(
        {
          ...patchPayload,
          supervisorReviewed: true,
          updatedAt: ts,
        },
        { merge: true },
      )
      patches.push({
        collection,
        docId,
        before: { [path]: beforeVal },
        after: { [path]: fix.newText },
      })
      applied += 1
      continue
    }

    if (normalizedTarget === 'questao') {
      const appliedQuestao = await applyQuestaoCorrection(courseId, payload, fix, ts, patches)
      if (appliedQuestao) applied += 1
      continue
    }

    if (normalizedTarget === 'redacao') {
      const collection = 'config'
      const docId = 'redacao'
      const before = await readDocFields(courseId, collection, docId, ['tema', 'status'])
      if (!before) continue
      await db.doc(docPath(courseId, collection, docId)).set(
        { tema: fix.newText, status: 'disponivel', supervisorReviewed: true, updatedAt: ts },
        { merge: true },
      )
      patches.push({
        collection,
        docId,
        before: { tema: before.tema, status: before.status },
        after: { tema: fix.newText },
      })
      applied += 1
      continue
    }

    if (normalizedTarget === 'vespera' && fix.refId != null) {
      const collection = 'vesperaDeProva'
      const docId = 'material'
      const snap = await db.doc(docPath(courseId, collection, docId)).get()
      if (!snap.exists) continue
      const material = [...(snap.data().material || [])]
      const idx = Number(fix.refId)
      if (!material[idx]) continue
      const beforeResumos = [...(material[idx].revisaoTurbo?.resumos || [])]
      const before = { resumo: beforeResumos[0] || '' }
      const resumos = [...beforeResumos]
      if (resumos.length) resumos[0] = fix.newText
      else resumos.push(fix.newText)
      material[idx] = {
        ...material[idx],
        revisaoTurbo: { ...material[idx].revisaoTurbo, resumos },
      }
      await snap.ref.set({ material, supervisorReviewed: true, updatedAt: ts }, { merge: true })
      patches.push({
        collection,
        docId,
        materialIndex: idx,
        before,
        after: { resumo: fix.newText },
      })
      applied += 1
    }
  }

  return { applied, patches }
}

async function applyQuestaoCorrection(courseId, payload, fix, ts, patches) {
  const db = getDb()
  const contentId = String(payload?.contentId || fix.refId || '')
  const mapped = normalizeQuestaoField(fix.field || 'enunciado')

  const found = await findFlaggedQuestao(courseId, {
    ...payload,
    contentId,
  })

  if (found) {
    return tryPatchQuestaoInPack(
      found.packSnap,
      contentId,
      fix,
      mapped,
      ts,
      patches,
      found.idx,
    )
  }

  const flatId = String(fix.refId || '').trim()
  if (flatId && mapped.kind === 'scalar') {
    const field = mapped.field
    const before = await readDocFields(courseId, 'questoesTopico', flatId, [
      field,
      'comentario',
      'gabarito',
      'gabaritoComentado',
      'correta',
      'enunciado',
    ])
    if (before) {
      const value = field === 'correta' ? normalizeCorretaValue(fix.newText) : fix.newText
      await db.doc(docPath(courseId, 'questoesTopico', flatId)).set(
        { [field]: value, supervisorReviewed: true, updatedAt: ts },
        { merge: true },
      )
      patches.push({
        collection: 'questoesTopico',
        docId: flatId,
        before: { [field]: before[field] },
        after: { [field]: value },
      })
      return true
    }
  }
  return false
}

async function tryPatchQuestaoInPack(
  packSnap,
  contentId,
  fix,
  mappedOrField,
  ts,
  patches,
  forcedIdx = null,
) {
  if (!packSnap?.exists) return false
  const data = packSnap.data() || {}
  const questoes = [...(data.questoes || data.questions || [])]
  if (!questoes.length) return false

  const packId = packSnap.id
  const mapped =
    typeof mappedOrField === 'string'
      ? normalizeQuestaoField(mappedOrField)
      : mappedOrField || normalizeQuestaoField(fix.field)

  let idx =
    forcedIdx != null && forcedIdx >= 0
      ? forcedIdx
      : resolveQuestaoIndex(questoes, contentId, fix, packId)
  if (idx < 0) return false

  const previous = { ...questoes[idx] }
  const next = { ...previous }
  let beforePatch = {}
  let afterPatch = {}

  if (mapped.kind === 'alternativa') {
    const letter = mapped.letter
    const alts = { ...(previous.alternativas || {}) }
    if (textsEqual(alts[letter], fix.newText)) return false
    beforePatch = { [`alternativas.${letter}`]: alts[letter] }
    alts[letter] = fix.newText
    next.alternativas = alts
    afterPatch = { [`alternativas.${letter}`]: fix.newText }
  } else if (mapped.kind === 'aligned') {
    let pack = {}
    try {
      pack = JSON.parse(fix.newText)
    } catch {
      return false
    }
    if (!pack || typeof pack !== 'object') return false

    // Gabarito mudou sem explicação → não aplica parcialmente
    const touchesGabarito =
      pack.correta != null ||
      pack.respostaCorreta != null ||
      (pack.alternativas && Object.keys(pack.alternativas).length > 0)
    const expl =
      pack.gabaritoComentado != null
        ? pack.gabaritoComentado
        : pack.explicacao != null
          ? pack.explicacao
          : pack.comentario
    if (touchesGabarito && (expl == null || !String(expl).trim())) {
      return false
    }
    if (fix.incompleteAlignment) return false

    let changed = false
    beforePatch = {}
    afterPatch = {}

    if (pack.enunciado != null && !textsEqual(previous.enunciado, pack.enunciado)) {
      beforePatch.enunciado = previous.enunciado
      next.enunciado = pack.enunciado
      afterPatch.enunciado = pack.enunciado
      changed = true
    }

    const corretaVal = normalizeCorretaValue(
      pack.correta != null ? pack.correta : pack.respostaCorreta,
    )
    if (pack.correta != null || pack.respostaCorreta != null) {
      const current =
        previous.respostaCorreta || previous.correta || previous.gabarito || ''
      if (!textsEqual(current, corretaVal)) {
        beforePatch.correta = current
        next.correta = corretaVal
        next.respostaCorreta = corretaVal
        next.gabarito = corretaVal
        afterPatch.correta = corretaVal
        changed = true
      }
    }

    if (expl != null && String(expl).trim()) {
      const currentExpl =
        previous.gabaritoComentado || previous.explicacao || previous.comentario || ''
      if (!textsEqual(currentExpl, expl)) {
        beforePatch.gabaritoComentado = currentExpl
        next.gabaritoComentado = expl
        next.explicacao = expl
        next.comentario = expl
        afterPatch.gabaritoComentado = expl
        changed = true
      }
    }

    if (pack.alternativas && typeof pack.alternativas === 'object') {
      const alts = { ...(previous.alternativas || {}) }
      for (const [letter, text] of Object.entries(pack.alternativas)) {
        const L = String(letter).toUpperCase()
        if (!textsEqual(alts[L], text)) {
          beforePatch[`alternativas.${L}`] = alts[L]
          alts[L] = text
          afterPatch[`alternativas.${L}`] = text
          changed = true
        }
      }
      next.alternativas = alts
    }

    if (!changed) return false
  } else {
    const field = mapped.field
    const value = field === 'correta' ? normalizeCorretaValue(fix.newText) : fix.newText
    const current =
      field === 'correta'
        ? previous.respostaCorreta || previous.correta || previous.gabarito
        : field === 'gabaritoComentado'
          ? previous.gabaritoComentado || previous.explicacao || previous.comentario
          : previous[field]
    if (textsEqual(current, value)) return false
    // Não aplicar gabarito sozinho sem explicação no mesmo fix
    if (field === 'correta') return false
    beforePatch = { [field]: current }
    next[field] = value
    afterPatch = { [field]: value }
    if (field === 'gabaritoComentado') {
      next.explicacao = value
      next.comentario = value
      afterPatch.explicacao = value
    }
  }

  questoes[idx] = next
  const payloadWrite = {
    questoes,
    supervisorReviewed: true,
    updatedAt: ts,
  }
  if (data.questions) payloadWrite.questions = questoes
  await packSnap.ref.set(payloadWrite, { merge: true })
  patches.push({
    collection: 'questoesTopico',
    docId: packId,
    questaoIndex: idx,
    before: beforePatch,
    after: afterPatch,
  })
  return true
}

async function rollbackPatches(courseId, patches = []) {
  const db = getDb()
  const ts = admin.firestore.FieldValue.serverTimestamp()

  for (const patch of patches) {
    if (patch.materialIndex != null) {
      const snap = await db.doc(docPath(courseId, 'vesperaDeProva', 'material')).get()
      if (!snap.exists) continue
      const material = [...(snap.data().material || [])]
      const idx = patch.materialIndex
      if (material[idx] && patch.before?.resumo != null) {
        const resumos = [...(material[idx].revisaoTurbo?.resumos || [])]
        if (resumos.length) resumos[0] = patch.before.resumo
        material[idx] = {
          ...material[idx],
          revisaoTurbo: { ...material[idx].revisaoTurbo, resumos },
        }
        await snap.ref.set({ material, updatedAt: ts }, { merge: true })
      }
      continue
    }

    const { collection, docId, before, questaoIndex } = patch
    if (!collection || !docId || !before) continue

    if (collection === 'questoesTopico' && questaoIndex != null) {
      const snap = await db.doc(docPath(courseId, collection, docId)).get()
      if (!snap.exists) continue
      const data = snap.data() || {}
      const questoes = [...(data.questoes || data.questions || [])]
      if (!questoes[questaoIndex]) continue
      const q = { ...questoes[questaoIndex] }
      for (const [key, val] of Object.entries(before)) {
        if (key.startsWith('alternativas.')) {
          const letter = key.split('.')[1]
          q.alternativas = { ...(q.alternativas || {}), [letter]: val }
        } else {
          q[key] = val
        }
      }
      questoes[questaoIndex] = q
      const payloadWrite = { questoes, updatedAt: ts, supervisorReviewed: false }
      if (data.questions) payloadWrite.questions = questoes
      await snap.ref.set(payloadWrite, { merge: true })
      continue
    }

    await db.doc(docPath(courseId, collection, docId)).set(
      { ...before, updatedAt: ts, supervisorReviewed: false },
      { merge: true },
    )
  }
}

function buildDiffSummary(patches = [], corrections = []) {
  return patches.map((p, i) => {
    const fix = corrections[i] || {}
    const keys = Object.keys(p.before || {})
    const field = keys[0] || fix.field || 'campo'
    return {
      label: fix.target || p.collection,
      field,
      before: p.before?.[field] ?? JSON.stringify(p.before || {}).slice(0, 500),
      after: p.after?.[field] ?? fix.newText ?? '',
      docId: p.docId,
      collection: p.collection,
    }
  })
}

module.exports = {
  applyCorrectionsWithSnapshot,
  rollbackPatches,
  buildDiffSummary,
  findFlaggedQuestao,
  normalizeQuestaoField,
  normalizeFlashcardDocId,
  resolveQuestaoIndex,
  listMaterialEditablePaths,
  findMaterialPathByPreview,
  loadFlashcardBefore,
  consolidateQuestaoCorrections,
}
