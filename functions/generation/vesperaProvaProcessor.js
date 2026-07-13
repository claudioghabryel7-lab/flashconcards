const admin = require('firebase-admin')
const { generateAiJsonWithJobHeartbeat, touchActiveJob } = require('./generationJobResume')

function getDb() {
  return admin.firestore()
}

/**
 * Gera material de uma disciplina da Véspera de Prova no servidor (segundo plano).
 * serverPayload: { prompt, disciplinaNome, banca, concurso }
 */
async function processVesperaProva(userId, jobId, courseId, serverPayload) {
  const prompt = serverPayload?.prompt
  const disciplinaNome = serverPayload?.disciplinaNome || 'Disciplina'
  if (!prompt) throw new Error('Prompt da véspera ausente.')
  if (!courseId) throw new Error('courseId ausente.')

  await touchActiveJob(userId, jobId, { jobType: 'vespera_prova', status: 'running' })

  const materialData = await generateAiJsonWithJobHeartbeat(
    userId,
    jobId,
    prompt,
    {
      useGoogleSearch: true,
      generationConfig: {
        temperature: 0.35,
        maxOutputTokens: 65536,
      },
    },
    'Gerando véspera de prova com IA…',
  )

  if (!materialData || typeof materialData !== 'object') {
    throw new Error('IA não retornou material válido para a véspera.')
  }

  if (!materialData.disciplina) {
    materialData.disciplina = disciplinaNome
  }

  const materialRef = getDb().doc(`courses/${courseId}/vesperaDeProva/material`)
  const snap = await materialRef.get()
  let existingMaterial = []
  if (snap.exists) {
    existingMaterial = Array.isArray(snap.data().material) ? [...snap.data().material] : []
  }

  const idx = existingMaterial.findIndex((m) => m.disciplina === materialData.disciplina)
  if (idx >= 0) existingMaterial[idx] = materialData
  else existingMaterial.push(materialData)

  await materialRef.set(
    {
      material: existingMaterial,
      banca: serverPayload.banca || snap.data()?.banca || '',
      concurso: serverPayload.concurso || snap.data()?.concurso || '',
      generatedAt: admin.firestore.FieldValue.serverTimestamp(),
      generatedBy: userId,
    },
    { merge: true },
  )

  return {
    resultRef: {
      type: 'vespera_prova',
      courseId,
      disciplina: materialData.disciplina,
    },
  }
}

module.exports = {
  processVesperaProva,
}
