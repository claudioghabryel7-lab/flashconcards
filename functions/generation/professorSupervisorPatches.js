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
  const packMatch = id.match(/_p([A-Za-z0-9_-]{1,80})$/)
  const qWithSuffix = id.match(/_q(\d+)_/)
  const qAtEnd = id.match(/_q(\d+)$/)
  const eHash = id.match(/_e([a-z0-9]+)/i)
  const iIndex = id.match(/_i(\d+)/)
  return {
    packFromId: packMatch?.[1] || '',
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
  const parsed = parseQuestaoContentId(contentId)

  const tryPack = async (packId) => {
    if (!packId) return null
    const snap = await db.doc(`courses/${courseId}/questoesTopico/${packId}`).get()
    if (!snap.exists) return null
    const data = snap.data() || {}
    const questoes = data.questoes || data.questions || []
    const idx = resolveQuestaoIndex(questoes, contentId, {}, packId)
    if (idx < 0) return null
    return { packSnap: snap, packId, questoes, idx, questao: questoes[idx] }
  }

  if (parsed.packFromId) {
    const hit = await tryPack(parsed.packFromId)
    if (hit) return hit
  }

  if (topicKey) {
    const sanitized = sanitizeTopicKeyForFirestore(topicKey)
    for (const packId of [
      `${sanitized}_nivel_1`,
      `${sanitized}_nivel_2`,
      `${sanitized}_nivel_3`,
      sanitized,
    ]) {
      const hit = await tryPack(packId)
      if (hit) return hit
    }
  }

  const packsSnap = await db.collection(`courses/${courseId}/questoesTopico`).limit(60).get()
  for (const packDoc of packsSnap.docs) {
    const data = packDoc.data() || {}
    const questoes = data.questoes || data.questions || []
    const idx = resolveQuestaoIndex(questoes, contentId, {}, packDoc.id)
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
  return null
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

    if (normalizedTarget === 'material' && (payload?.topicKey || fix.refId)) {
      const collection = 'conteudosCompletos'
      const docId = sanitizeTopicKeyForFirestore(payload.topicKey || fix.refId)
      const field = normalizeMaterialField(fix.field)
      const before = await readDocFields(courseId, collection, docId, [
        field,
        'materia',
        'resumo',
        'conteudo',
      ])
      if (!before) continue
      let finalField = field
      if (
        field === 'materia' &&
        before.materia == null &&
        (before.resumo != null || before.conteudo != null)
      ) {
        finalField = before.resumo != null ? 'resumo' : 'conteudo'
      }
      const afterVal = fix.newText
      if (textsEqual(before[finalField], afterVal)) continue
      await db.doc(docPath(courseId, collection, docId)).set(
        { [finalField]: afterVal, supervisorReviewed: true, updatedAt: ts },
        { merge: true },
      )
      patches.push({
        collection,
        docId,
        before: { [finalField]: before[finalField] },
        after: { [finalField]: afterVal },
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
  } else {
    const field = mapped.field
    const value = field === 'correta' ? normalizeCorretaValue(fix.newText) : fix.newText
    if (textsEqual(previous[field], value)) return false
    beforePatch = { [field]: previous[field] }
    next[field] = value
    afterPatch = { [field]: value }
    if (field === 'correta' && Object.prototype.hasOwnProperty.call(next, 'gabarito')) {
      delete next.gabarito
    }
    if (field === 'gabaritoComentado' && Object.prototype.hasOwnProperty.call(next, 'comentario')) {
      delete next.comentario
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
}
