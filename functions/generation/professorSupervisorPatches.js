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
  if (!fields.length) return { ...data }
  const out = {}
  fields.forEach((f) => {
    out[f] = data[f]
  })
  return out
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

    if (fix.target === 'flashcard' && fix.refId) {
      const collection = 'flashcards'
      const docId = fix.refId
      const field = fix.field === 'frente' ? 'frente' : 'verso'
      const before = await readDocFields(courseId, collection, docId, [
        'frente',
        'verso',
        'resposta',
        'pergunta',
      ])
      if (!before) continue

      const after = {
        ...before,
        [field]: fix.newText,
        ...(field === 'verso' ? { resposta: fix.newText } : {}),
        ...(field === 'frente' ? { pergunta: fix.newText } : {}),
        supervisorReviewed: true,
        updatedAt: ts,
      }

      await db.doc(docPath(courseId, collection, docId)).set(after, { merge: true })
      patches.push({ collection, docId, before, after: { [field]: fix.newText } })
      applied += 1
    }

    if (fix.target === 'material' && payload?.topicKey) {
      const collection = 'conteudosCompletos'
      const docId = sanitizeTopicKeyForFirestore(payload.topicKey)
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
    }

    if (fix.target === 'questao' && fix.refId) {
      const collection = 'questoesTopico'
      const docId = fix.refId
      const field = fix.field || 'enunciado'
      const before = await readDocFields(courseId, collection, docId, [field, 'comentario', 'gabarito'])
      if (!before) continue
      await db.doc(docPath(courseId, collection, docId)).set(
        { [field]: fix.newText, supervisorReviewed: true, updatedAt: ts },
        { merge: true },
      )
      patches.push({
        collection,
        docId,
        before: { [field]: before[field] },
        after: { [field]: fix.newText },
      })
      applied += 1
    }

    if (fix.target === 'redacao') {
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
    }

    if (fix.target === 'vespera' && fix.refId != null) {
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
