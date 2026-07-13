const admin = require('firebase-admin')
const { sanitizeTopicKeyForFirestore } = require('./topicKeyUtils')

function getDb() {
  return admin.firestore()
}

function docPath(courseId, collection, docId) {
  return `courses/${courseId}/${collection}/${docId}`
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

function normalizeFlashcardDocId(refId) {
  const raw = String(refId || '').trim()
  if (!raw) return ''
  const fcMatch = raw.match(/_fc_(.+)$/)
  if (fcMatch) return fcMatch[1]
  return raw
}

/**
 * Aplica correções e retorna patches para rollback.
 * patch: { collection, docId, before: {}, after: {} }
 */
async function applyCorrectionsWithSnapshot(courseId, itemType, payload, corrections = []) {
  const db = getDb()
  const ts = admin.firestore.FieldValue.serverTimestamp()
  const patches = []
  let applied = 0

  for (const fix of corrections) {
    if (!fix.newText && fix.newText !== '') continue
    const target = String(fix.target || '')
      .toLowerCase()
      .replace(/s$/, '') // flashcards -> flashcard, questoes -> questoe (oops)
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
      const field =
        fix.field === 'frente' || fix.field === 'pergunta'
          ? 'frente'
          : fix.field === 'verso' || fix.field === 'resposta'
            ? 'verso'
            : 'verso'
      let before = await readDocFields(courseId, collection, docId, [
        'frente',
        'verso',
        'resposta',
        'pergunta',
      ])
      // fallback: tenta contentId da flag
      if (!before && preferredId && preferredId !== docId) {
        before = await readDocFields(courseId, collection, preferredId, [
          'frente',
          'verso',
          'resposta',
          'pergunta',
        ])
      }
      if (!before) continue
      const finalDocId = before.__docId || docId

      const after = {
        frente: before.frente,
        verso: before.verso,
        pergunta: before.pergunta,
        resposta: before.resposta,
        [field]: fix.newText,
        ...(field === 'verso' ? { resposta: fix.newText } : {}),
        ...(field === 'frente' ? { pergunta: fix.newText } : {}),
        supervisorReviewed: true,
        updatedAt: ts,
      }

      await db.doc(docPath(courseId, collection, finalDocId)).set(after, { merge: true })
      patches.push({ collection, docId: finalDocId, before, after: { [field]: fix.newText } })
      applied += 1
      continue
    }

    if (normalizedTarget === 'material' && (payload?.topicKey || fix.refId)) {
      const collection = 'conteudosCompletos'
      const docId = sanitizeTopicKeyForFirestore(payload.topicKey || fix.refId)
      const field = fix.field || 'resumo'
      const before = await readDocFields(courseId, collection, docId, [field])
      if (!before) continue
      const afterVal = fix.newText
      await db.doc(docPath(courseId, collection, docId)).set(
        { [field]: afterVal, supervisorReviewed: true, updatedAt: ts },
        { merge: true },
      )
      patches.push({
        collection,
        docId,
        before: { [field]: before[field] },
        after: { [field]: afterVal },
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
  const field = fix.field || 'enunciado'
  const contentId = String(payload?.contentId || fix.refId || '')
  const topicKey = payload?.topicKey

  // Conteúdo em array dentro de packs questoesTopico
  let packsQuery = db.collection(`courses/${courseId}/questoesTopico`)
  if (topicKey) {
    const sanitized = sanitizeTopicKeyForFirestore(topicKey)
    const preferred = [
      `${sanitized}_nivel_1`,
      sanitized,
    ]
    for (const packId of preferred) {
      const snap = await db.doc(`courses/${courseId}/questoesTopico/${packId}`).get()
      if (!snap.exists) continue
      const ok = await tryPatchQuestaoInPack(snap, contentId, fix, field, ts, patches)
      if (ok) return true
    }
  }

  // Busca ampla por contentId / refId
  const packsSnap = await packsQuery.limit(40).get()
  for (const packDoc of packsSnap.docs) {
    const ok = await tryPatchQuestaoInPack(packDoc, contentId, fix, field, ts, patches)
    if (ok) return true
  }

  // Legado: documento flat com o campo
  const flatId = String(fix.refId || '').trim()
  if (flatId) {
    const before = await readDocFields(courseId, 'questoesTopico', flatId, [
      field,
      'comentario',
      'gabarito',
      'enunciado',
    ])
    if (before) {
      await db.doc(docPath(courseId, 'questoesTopico', flatId)).set(
        { [field]: fix.newText, supervisorReviewed: true, updatedAt: ts },
        { merge: true },
      )
      patches.push({
        collection: 'questoesTopico',
        docId: flatId,
        before: { [field]: before[field] },
        after: { [field]: fix.newText },
      })
      return true
    }
  }
  return false
}

async function tryPatchQuestaoInPack(packSnap, contentId, fix, field, ts, patches) {
  if (!packSnap?.exists) return false
  const data = packSnap.data() || {}
  const questoes = [...(data.questoes || data.questions || [])]
  if (!questoes.length) return false

  const packId = packSnap.id
  let idx = -1

  const qMatch = String(contentId || '').match(/_q(\d+)$/)
  if (qMatch) {
    const candidate = Number(qMatch[1])
    if (questoes[candidate]) idx = candidate
  }
  if (idx < 0 && fix.refId != null && /^\d+$/.test(String(fix.refId))) {
    const candidate = Number(fix.refId)
    if (questoes[candidate]) idx = candidate
  }
  if (idx < 0) {
    idx = questoes.findIndex((_, i) => {
      const id = `${packId}_q${i}`
      return contentId === id || String(contentId).includes(id) || String(fix.refId) === id
    })
  }
  if (idx < 0) return false

  const beforeVal = questoes[idx][field]
  questoes[idx] = { ...questoes[idx], [field]: fix.newText }
  const payload = {
    questoes,
    supervisorReviewed: true,
    updatedAt: ts,
  }
  if (data.questions) payload.questions = questoes
  await packSnap.ref.set(payload, { merge: true })
  patches.push({
    collection: 'questoesTopico',
    docId: packId,
    questaoIndex: idx,
    before: { [field]: beforeVal },
    after: { [field]: fix.newText },
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

    const { collection, docId, before } = patch
    if (!collection || !docId || !before) continue
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
}
