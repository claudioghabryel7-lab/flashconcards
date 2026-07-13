const admin = require('firebase-admin')
const { generateAiJsonWithJobHeartbeat } = require('./generationJobResume')

function getDb() {
  return admin.firestore()
}

function splitEditalIntoChunks(editalText) {
  const tamanhoEdital = editalText.length
  let numPartes = 3
  if (tamanhoEdital > 100000) numPartes = Math.ceil(tamanhoEdital / 50000)
  else if (tamanhoEdital > 50000) numPartes = 5
  else if (tamanhoEdital > 20000) numPartes = 4

  const chunkSize = Math.ceil(tamanhoEdital / numPartes)
  const overlapSize = 500
  const chunks = []

  for (let i = 0; i < editalText.length; i += chunkSize) {
    let inicio = i
    let fim = Math.min(i + chunkSize, editalText.length)
    if (i > 0) inicio = Math.max(0, i - overlapSize)
    if (fim < editalText.length) fim = Math.min(editalText.length, fim + overlapSize)

    chunks.push({
      texto: editalText.substring(inicio, fim),
      parte: Math.floor(i / chunkSize) + 1,
      totalPartes: Math.ceil(editalText.length / chunkSize),
    })
  }

  return chunks
}

function buildVerticalizadoPrompt(chunk, editalText, chunks) {
  return `Você é um especialista em organizar editais de concursos públicos em formato TABULAR VERTICALIZADO para estudos.

Analise o seguinte texto do edital e organize-o em DISCIPLINAS com seus tópicos hierárquicos.

${chunks.length > 1 ? `⚠️ PARTE ${chunk.parte} de ${chunk.totalPartes} do edital (${editalText.length} caracteres total).\n` : ''}
Texto do edital${chunks.length > 1 ? ` (PARTE ${chunk.parte}/${chunk.totalPartes})` : ''}:
${chunk.texto}

Extraia TODAS as disciplinas e tópicos desta parte. Retorne APENAS JSON válido:

{
  "titulo": "EDITAL VERTICALIZADO",
  "descricao": "",
  "disciplinas": [
    {
      "nome": "NOME DA DISCIPLINA",
      "totalQuestoes": null,
      "topicos": [
        { "numero": "1.1", "nome": "Tópico", "nivel": 0, "flashcards": false, "questoes": false, "dia": false, "revisoes": false }
      ]
    }
  ]
}`
}

function mergeDisciplinas(existing, incoming) {
  const map = new Map()
  existing.forEach((d) => map.set((d.nome || '').toUpperCase(), { ...d, topicos: [...(d.topicos || [])] }))

  incoming.forEach((d) => {
    const key = (d.nome || '').toUpperCase()
    if (!key) return
    if (!map.has(key)) {
      map.set(key, { ...d, topicos: [...(d.topicos || [])] })
      return
    }
    const prev = map.get(key)
    const topicosMap = new Map()
    ;(prev.topicos || []).forEach((t) => {
      const tk = `${t.numero || ''}::${t.nome || ''}`
      topicosMap.set(tk, t)
    })
    ;(d.topicos || []).forEach((t) => {
      const tk = `${t.numero || ''}::${t.nome || ''}`
      if (!topicosMap.has(tk)) topicosMap.set(tk, t)
    })
    prev.topicos = [...topicosMap.values()]
    map.set(key, prev)
  })

  return [...map.values()]
}

async function updateJob(userId, jobId, patch) {
  await getDb()
    .doc(`users/${userId}/generationJobs/${jobId}`)
    .update({
      ...patch,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    })
}

async function processAdminEditalVerticalizado(userId, jobId, courseId, serverPayload) {
  const editalText = serverPayload?.editalText || ''
  if (!editalText.trim()) throw new Error('Texto do edital ausente.')

  const db = getDb()
  const resolvedId = courseId || 'alego-default'

  await updateJob(userId, jobId, { progress: 5, message: 'Limpando edital antigo…' })

  const editalRef = db.doc(`courses/${resolvedId}/editalVerticalizado/principal`)
  await editalRef.delete().catch(() => {})

  const partesRef = db.collection(`courses/${resolvedId}/editalVerticalizado/principal/partes`)
  const partesSnap = await partesRef.get()
  if (!partesSnap.empty) {
    const batch = db.batch()
    partesSnap.docs.forEach((d) => batch.delete(d.ref))
    await batch.commit()
  }

  const chunks = splitEditalIntoChunks(editalText)
  let todasDisciplinas = []
  let tituloComum = 'EDITAL VERTICALIZADO'

  for (let i = 0; i < chunks.length; i += 1) {
    const chunk = chunks[i]
    await updateJob(userId, jobId, {
      progress: 10 + Math.round((i / chunks.length) * 55),
      message: `Processando parte ${chunk.parte}/${chunk.totalPartes}…`,
    })

    const prompt = buildVerticalizadoPrompt(chunk, editalText, chunks)
    const parsed = await generateAiJsonWithJobHeartbeat(
      userId,
      jobId,
      prompt,
      {
        generationConfig: { temperature: 0.3, maxOutputTokens: 32000 },
      },
      `Processando parte ${chunk.parte}/${chunk.totalPartes}…`,
    )

    if (parsed?.titulo) tituloComum = parsed.titulo
    if (Array.isArray(parsed?.disciplinas)) {
      todasDisciplinas = mergeDisciplinas(todasDisciplinas, parsed.disciplinas)
    }
  }

  if (!todasDisciplinas.length) {
    throw new Error('Nenhuma disciplina extraída do edital.')
  }

  await updateJob(userId, jobId, { progress: 72, message: 'Salvando edital verticalizado…' })

  const editalOrganizado = {
    titulo: tituloComum,
    descricao: '',
    disciplinas: todasDisciplinas,
    temPartes: false,
    totalPartes: 1,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  }

  await editalRef.set(editalOrganizado, { merge: true })

  await updateJob(userId, jobId, { progress: 85, message: 'Gerando prompt unificado…' })

  const unifiedPrompt = `Analise o edital e retorne JSON com: banca, concursoName, cargo, courseName, tipoProva.
EDITAL:
${editalText.substring(0, 80000)}

Retorne APENAS JSON: {"banca":"","concursoName":"","cargo":"","courseName":"","tipoProva":"ABCD"}`

  let unifiedData = { banca: '', concursoName: '', cargo: '', courseName: '', tipoProva: 'ABCD' }
  try {
    unifiedData = await generateAiJsonWithJobHeartbeat(
      userId,
      jobId,
      unifiedPrompt,
      {
        generationConfig: { temperature: 0.2, maxOutputTokens: 4096 },
      },
      'Gerando prompt unificado…',
    )
  } catch {
    // mantém defaults
  }

  await db.doc(`courses/${resolvedId}/prompts/unified`).set(
    { ...unifiedData, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
    { merge: true },
  )

  await db.doc(`courses/${resolvedId}/prompts/edital`).set(
    {
      pdfText: editalText,
      prompt: `Edital processado no servidor em ${new Date().toISOString()}`,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  )

  await db.doc(`courses/${resolvedId}`).set(
    {
      banca: unifiedData.banca || '',
      competition: unifiedData.concursoName || '',
    },
    { merge: true },
  )

  return {
    resultRef: { collection: 'editalVerticalizado', docId: 'principal' },
    disciplinasCount: todasDisciplinas.length,
  }
}

module.exports = { processAdminEditalVerticalizado }
