const admin = require('firebase-admin')
const { getTodayKeyInSaoPaulo } = require('./guiaMentoradoShared')

function getDb() {
  return admin.firestore()
}

/** Libera a próxima matéria da Véspera (1 por dia) após conteúdos do mentorado. */
async function releaseNextVesperaDisciplina(courseId) {
  const db = getDb()
  const materialRef = db.doc(`courses/${courseId}/vesperaDeProva/material`)
  const materialSnap = await materialRef.get()
  if (!materialSnap.exists) return { released: false, reason: 'no_material' }

  const materialData = materialSnap.data() || {}
  const disciplinas = Array.isArray(materialData.material) ? materialData.material : []
  if (!disciplinas.length) return { released: false, reason: 'empty_material' }

  const releaseRef = db.doc(`courses/${courseId}/vesperaDeProva/releaseState`)
  const releaseSnap = await releaseRef.get()
  const releaseState = releaseSnap.exists ? releaseSnap.data() : {}
  const releasedIndices = Array.isArray(releaseState.releasedIndices)
    ? [...releaseState.releasedIndices]
    : []

  if (releasedIndices.length >= disciplinas.length) {
    return { released: false, reason: 'all_released', total: disciplinas.length }
  }

  const nextIndex = releasedIndices.length
  if (releasedIndices.includes(nextIndex)) {
    return { released: false, reason: 'already_released', index: nextIndex }
  }

  releasedIndices.push(nextIndex)
  const disciplina = disciplinas[nextIndex]
  const ts = admin.firestore.FieldValue.serverTimestamp()
  const todayKey = getTodayKeyInSaoPaulo()

  await releaseRef.set(
    {
      releasedIndices,
      lastReleasedIndex: nextIndex,
      lastReleasedDisciplina: disciplina?.disciplina || '',
      lastReleasedAt: ts,
      lastReleasedDay: todayKey,
      updatedAt: ts,
    },
    { merge: true },
  )

  await db.doc(`courses/${courseId}/vesperaNotifications/${todayKey}_${nextIndex}`).set(
    {
      courseId,
      disciplina: disciplina?.disciplina || '',
      disciplinaIndex: nextIndex,
      label: `Revisão liberada: ${disciplina?.disciplina || 'Matéria'}`,
      linkPath: '/vespera-de-prova',
      contentType: 'vespera',
      status: 'new',
      createdAt: ts,
    },
    { merge: true },
  )

  return {
    released: true,
    index: nextIndex,
    disciplina: disciplina?.disciplina || '',
    total: disciplinas.length,
  }
}

module.exports = {
  releaseNextVesperaDisciplina,
}
