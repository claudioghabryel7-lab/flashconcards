const admin = require('firebase-admin')
const { sanitizeTopicKeyForFirestore, normalizeTopicKeyForStorage } = require('./topicKeyUtils')

const MIN_FLASHCARDS = 30

function getDb() {
  return admin.firestore()
}

function scriptCheckTopicContent({ flashcards = [], material, questoes }) {
  const issues = []

  if (flashcards.length < MIN_FLASHCARDS) {
    issues.push({
      type: 'structure',
      detail: `Apenas ${flashcards.length} flashcards (mínimo ${MIN_FLASHCARDS})`,
      target: 'flashcards',
    })
  }

  for (const card of flashcards.slice(0, 15)) {
    const verso = String(card.verso || card.resposta || '').trim()
    if (verso.length < 40) {
      issues.push({
        type: 'weak',
        detail: `Flashcard com resposta curta: "${(card.frente || '').slice(0, 60)}…"`,
        target: 'flashcards',
        refId: card.id,
      })
      break
    }
  }

  if (!material) {
    issues.push({ type: 'incomplete', detail: 'Material do tópico ausente', target: 'material' })
  } else {
    const body = JSON.stringify(material)
    if (body.length < 800) {
      issues.push({ type: 'weak', detail: 'Material muito curto', target: 'material' })
    }
  }

  const questoesList = questoes?.questoes || questoes?.questions || []
  if (!questoesList.length) {
    issues.push({ type: 'incomplete', detail: 'Questões do tópico ausentes', target: 'questoes' })
  }

  return {
    needsReview: issues.length > 0,
    issues,
    severity: issues.some((i) => i.type === 'incomplete' || i.type === 'structure') ? 'high' : 'low',
  }
}

async function loadTopicBundle(courseId, topicKey, disciplina, modulo) {
  const db = getDb()
  const normalized = normalizeTopicKeyForStorage(topicKey)
  const sanitized = sanitizeTopicKeyForFirestore(topicKey)

  const flashcardsSnap = await db.collection(`courses/${courseId}/flashcards`).get()
  const flashcards = flashcardsSnap.docs
    .filter((d) => {
      const data = d.data()
      return (
        normalizeTopicKeyForStorage(data.topicKey) === normalized ||
        (data.materia === disciplina && data.modulo === modulo)
      )
    })
    .map((d) => ({ id: d.id, ...d.data() }))

  const materialSnap = await db.doc(`courses/${courseId}/conteudosCompletos/${sanitized}`).get()
  const material = materialSnap.exists ? materialSnap.data() : null

  const questoesSnap = await db.doc(`courses/${courseId}/questoesTopico/${sanitized}_nivel_1`).get()
  const questoes = questoesSnap.exists ? questoesSnap.data() : null

  return { flashcards, material, questoes }
}

function scriptCheckVespera(materialDoc) {
  const issues = []
  const items = materialDoc?.material || []
  if (!items.length) {
    issues.push({ type: 'incomplete', detail: 'Véspera de prova sem disciplinas', target: 'vespera' })
    return { needsReview: true, issues, severity: 'high' }
  }

  for (const entry of items) {
    const resumos = entry?.revisaoTurbo?.resumos || []
    if (!resumos.length) {
      issues.push({
        type: 'incomplete',
        detail: `Disciplina "${entry.disciplina}" sem resumos`,
        target: 'vespera',
      })
    }
  }

  return {
    needsReview: issues.length > 0,
    issues,
    severity: issues.length ? 'medium' : 'low',
  }
}

function scriptCheckRedacao(config) {
  const issues = []
  if (!config?.tema?.trim()) {
    issues.push({ type: 'incomplete', detail: 'Tema da redação vazio', target: 'redacao' })
  } else if (config.tema.trim().length < 20) {
    issues.push({ type: 'weak', detail: 'Tema da redação muito curto', target: 'redacao' })
  }
  return { needsReview: issues.length > 0, issues, severity: 'low' }
}

function scriptCheckTopicStep(bundle, step) {
  const full = scriptCheckTopicContent(bundle)
  if (step === 'flashcards') {
    const issues = full.issues.filter((i) => i.target === 'flashcards')
    return {
      needsReview: issues.length > 0 || (bundle.flashcards || []).length < 40,
      issues,
      severity: issues.some((i) => i.type === 'incomplete' || i.type === 'structure') ? 'high' : 'low',
    }
  }
  if (step === 'material') {
    const issues = full.issues.filter((i) => i.target === 'material')
    return {
      needsReview: issues.length > 0 || !bundle.material,
      issues,
      severity: !bundle.material ? 'high' : 'low',
    }
  }
  if (step === 'questoes') {
    const issues = full.issues.filter((i) => i.target === 'questoes')
    const questoesList = bundle.questoes?.questoes || bundle.questoes?.questions || []
    return {
      needsReview: issues.length > 0 || !questoesList.length,
      issues,
      severity: !questoesList.length ? 'high' : 'low',
    }
  }
  return full
}

module.exports = {
  scriptCheckTopicContent,
  scriptCheckTopicStep,
  loadTopicBundle,
  scriptCheckVespera,
  scriptCheckRedacao,
}
