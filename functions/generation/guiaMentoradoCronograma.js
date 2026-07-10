const admin = require('firebase-admin')
const { generateAiJson } = require('./geminiServer')
const {
  buildMentoradoCronogramaPrompt,
  getTodayKeyInSaoPaulo,
  resolvePlanningEndDate,
  isUsingDefaultPlanningWindow,
  parseDateKey,
} = require('./guiaMentoradoShared')
const { loadEditalVerticalizado } = require('./guiaMentoradoEdital')
const { startDayAutomation } = require('./guiaMentoradoDaily')

function getDb() {
  return admin.firestore()
}

function monthKeyFromDateKey(dateKey) {
  return String(dateKey).slice(0, 7)
}

function parseCronogramaJson(generatedText) {
  let jsonMatch = generatedText.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    const mdMatch = generatedText.match(/```json\s*([\s\S]*?)\s*```/)
    if (mdMatch) jsonMatch = [mdMatch[1]]
  }
  if (!jsonMatch) {
    throw new Error('Não foi possível extrair JSON da resposta da IA.')
  }

  let jsonText = jsonMatch[0]
  try {
    return JSON.parse(jsonText)
  } catch (parseError) {
    const openBraces = (jsonText.match(/\{/g) || []).length
    const closeBraces = (jsonText.match(/\}/g) || []).length
    const openBrackets = (jsonText.match(/\[/g) || []).length
    const closeBrackets = (jsonText.match(/\]/g) || []).length

    let completedJson = jsonText
    for (let i = 0; i < openBraces - closeBraces; i += 1) completedJson += '}'
    for (let i = 0; i < openBrackets - closeBrackets; i += 1) completedJson += ']'
    completedJson = completedJson.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']')

    try {
      return JSON.parse(completedJson)
    } catch {
      const cleanedJson = jsonText
        .replace(/[\n\r]/g, '')
        .replace(/\s+/g, ' ')
        .replace(/,\s*}/g, '}')
        .replace(/,\s*]/g, ']')
      return JSON.parse(cleanedJson)
    }
  }
}

async function saveCronogramaMonths(courseId, cronogramaEntries, config) {
  const db = getDb()
  const ts = admin.firestore.FieldValue.serverTimestamp()
  const monthsToSave = new Set()

  cronogramaEntries.forEach((dia) => {
    if (dia.data) monthsToSave.add(monthKeyFromDateKey(dia.data))
  })

  for (const monthKey of monthsToSave) {
    const cronogramaData = {
      month: monthKey,
      generatedAt: ts,
      config,
      generatedBy: 'ai',
      days: {},
    }

    cronogramaEntries.forEach((dia) => {
      if (!dia.data || monthKeyFromDateKey(dia.data) !== monthKey) return
      cronogramaData.days[dia.data] = {
        type: dia.tipo,
        fase: dia.fase,
        materias: dia.materias || [],
        tafExercicio: dia.taf_exercicio || '',
        descricao: dia.descricao || '',
        completed: false,
        contentGenerated: false,
      }
    })

    await db.doc(`courses/${courseId}/cronograma/${monthKey}`).set(cronogramaData)
  }

  return monthsToSave.size
}

async function processGuiaMentoradoCronograma(userId, jobId, courseId, serverPayload, updateJob) {
  const config = serverPayload?.config || {}
  const autoGerarConteudo = Boolean(config.autoGerarConteudo)

  await updateJob(userId, jobId, { progress: 5, message: 'Carregando edital verticalizado…' })

  const editalVerticalizado = await loadEditalVerticalizado(courseId)
  if (!editalVerticalizado?.disciplinas?.length) {
    throw new Error('Edital verticalizado não encontrado para gerar o cronograma.')
  }

  const todayKey = getTodayKeyInSaoPaulo()
  const planningEndKey = resolvePlanningEndDate(config)
  const usingDefaultWindow = isUsingDefaultPlanningWindow(config)
  const daysUntilProva = Math.round(
    (parseDateKey(planningEndKey) - parseDateKey(todayKey)) / (24 * 60 * 60 * 1000),
  )

  if (daysUntilProva <= 0) {
    throw new Error('O período de planejamento deve ser no futuro.')
  }

  const editalSummary = editalVerticalizado.disciplinas.map((d) => ({
    nome: d.nome,
    topicos:
      d.topicos?.map((t) => ({
        numero: t.numero,
        nome: t.nome,
      })) || [],
  }))

  const prompt = buildMentoradoCronogramaPrompt({
    todayKey,
    planningEndKey,
    config,
    editalSummary,
    usingDefaultWindow,
  })

  await updateJob(userId, jobId, { progress: 15, message: 'Gerando cronograma com IA na nuvem…' })

  const cronogramaIA = await generateAiJson(prompt, {
    generationConfig: { temperature: 0.35, maxOutputTokens: 65536 },
  })

  if (!cronogramaIA.cronograma || !Array.isArray(cronogramaIA.cronograma)) {
    throw new Error('Estrutura de JSON inválida: não contém array "cronograma"')
  }

  cronogramaIA.cronograma.forEach((dia, idx) => {
    if (!dia.data || !dia.tipo) {
      throw new Error(`Dia ${idx} inválido: falta "data" ou "tipo"`)
    }
    if (!Array.isArray(dia.materias)) dia.materias = []
  })

  await updateJob(userId, jobId, { progress: 75, message: 'Salvando cronograma…' })

  const monthsCount = await saveCronogramaMonths(courseId, cronogramaIA.cronograma, config)

  const db = getDb()
  await db.doc(`courses/${courseId}/config/guiaMentorado`).set(
    {
      ...config,
      automationUserId: userId,
      cronogramaGeradoEm: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  )

  let dayAutomation = null
  if (autoGerarConteudo) {
    await updateJob(userId, jobId, {
      progress: 88,
      message: `Cronograma salvo. Iniciando geração do dia ${todayKey}…`,
    })
    dayAutomation = await startDayAutomation(courseId, todayKey, userId, {
      metadata: { triggeredBy: 'cronograma' },
    })
    if (!dayAutomation.started && dayAutomation.reason) {
      await updateJob(userId, jobId, {
        message: `Cronograma salvo. Automação: ${dayAutomation.reason}`,
      })
    }
  }

  return {
    monthsCount,
    totalDays: cronogramaIA.cronograma.length,
    dayAutomation,
    autoGerarConteudo,
  }
}

module.exports = {
  processGuiaMentoradoCronograma,
  parseCronogramaJson,
  saveCronogramaMonths,
}
