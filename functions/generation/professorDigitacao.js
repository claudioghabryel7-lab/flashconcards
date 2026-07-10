const admin = require('firebase-admin')
const { sanitizeTopicKeyForFirestore } = require('./topicKeyUtils')

const SKIP_KEYS = new Set([
  'id',
  'status',
  'topicKey',
  'updatedAt',
  'createdAt',
  'supervisorReviewed',
  'digitacaoReviewed',
])

function getDb() {
  return admin.firestore()
}

function fixMultipleSpaces(text) {
  return text.replace(/[^\S\n]+/g, ' ').replace(/ \n/g, '\n').replace(/\n /g, '\n')
}

function fixPunctuationSpacing(text) {
  return text
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/([,.;:!?])(?=[A-Za-záàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ])/g, '$1 ')
}

function fixBrokenWords(text) {
  return text.replace(
    /\b([a-záàâãéêíóôõúç]{4,})\s+([a-záàâãéêíóôõúç]{1,4})\b/gi,
    (match, part1, part2) => {
      const merged = `${part1}${part2}`
      if (merged.length < 6 || merged.length > 32) return match
      if (part2.length >= 3) return merged
      if (/[bcdfghjklmnpqrstvwxyz]$/i.test(part1)) return merged
      return match
    },
  )
}

function fixHyphenTypos(text) {
  return text
    .replace(/\b([a-záàâãéêíóôõúç]{3,})-\s+([a-záàâãéêíóôõúç]{2,})\b/gi, '$1$2')
    .replace(/\b([a-záàâãéêíóôõúç]{2,})\s+-\s*([a-záàâãéêíóôõúç]{2,})\b/gi, '$1$2')
    .replace(/([a-záàâãéêíóôõúç])-\s+([a-záàâãéêíóôõúç])/gi, '$1$2')
    .replace(/\s+-\s+/g, ' ')
}

function fixIncompleteFragments(text) {
  return text.replace(/\b([a-záàâãéêíóôõúç]{1,2})\.\s+(?=[a-záàâãéêíóôõúç]{3,})/gi, '')
}

function fixTextTypos(text) {
  if (!text || typeof text !== 'string' || text.length < 4) return text
  let out = text
  out = fixHyphenTypos(out)
  out = fixBrokenWords(out)
  out = fixIncompleteFragments(out)
  out = fixPunctuationSpacing(out)
  out = fixMultipleSpaces(out)
  return out
}

function collectTextFields(value, path = '') {
  const fields = []
  if (typeof value === 'string') {
    if (value.trim().length >= 4) fields.push({ path, value })
    return fields
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      fields.push(...collectTextFields(item, path ? `${path}.${index}` : String(index)))
    })
    return fields
  }
  if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, nested]) => {
      if (SKIP_KEYS.has(key)) return
      fields.push(...collectTextFields(nested, path ? `${path}.${key}` : key))
    })
  }
  return fields
}

function scanMaterialTypos(material = {}) {
  const fields = collectTextFields(material)
  const fixes = []

  for (const field of fields) {
    const fixed = fixTextTypos(field.value)
    if (fixed !== field.value) {
      fixes.push({
        path: field.path,
        before: field.value,
        after: fixed,
        reason: 'Correção de digitação (script)',
      })
    }
  }

  return fixes
}

function buildDigitacaoVerdict(fixes = []) {
  return {
    issues: fixes.map((f) => ({
      type: 'typo',
      detail: `${f.path}: ajuste de digitação`,
      target: 'material',
    })),
    corrections: fixes.map((f) => ({
      target: 'material',
      field: f.path,
      newText: f.after,
      confidence: 1,
    })),
    confidence: 1,
    needsAdminReview: true,
    summary:
      fixes.length > 0
        ? `Professor de digitação — ${fixes.length} campo(s) corrigido(s) (script, sem IA).`
        : 'Material sem erros de digitação detectados.',
  }
}

async function applyDigitacaoFixes(courseId, topicKey, fixes = []) {
  const db = getDb()
  const docId = sanitizeTopicKeyForFirestore(topicKey)
  const ref = db.doc(`courses/${courseId}/conteudosCompletos/${docId}`)
  const snap = await ref.get()
  if (!snap.exists) return { applied: 0, patches: [], diffSummary: [] }

  const ts = admin.firestore.FieldValue.serverTimestamp()
  const updates = { digitacaoReviewed: true, updatedAt: ts }
  const patches = []

  for (const fix of fixes) {
    updates[fix.path] = fix.after
    patches.push({
      collection: 'conteudosCompletos',
      docId,
      fieldPath: fix.path,
      before: { [fix.path]: fix.before },
      after: { [fix.path]: fix.after },
    })
  }

  if (!fixes.length) return { applied: 0, patches: [], diffSummary: [] }

  await ref.set(updates, { merge: true })

  const diffSummary = fixes.map((f) => ({
    label: 'material',
    field: f.path,
    before: f.before.slice(0, 600),
    after: f.after.slice(0, 600),
    docId,
    collection: 'conteudosCompletos',
  }))

  return { applied: fixes.length, patches, diffSummary }
}

module.exports = {
  fixTextTypos,
  scanMaterialTypos,
  buildDigitacaoVerdict,
  applyDigitacaoFixes,
}
