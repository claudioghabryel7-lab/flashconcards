const admin = require('firebase-admin')
const { generateAiJsonWithJobHeartbeat } = require('./generationJobResume')
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

function normalizeDateKey(raw) {
  if (!raw) return null
  const s = String(raw).trim()

  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (iso) {
    return `${iso[1]}-${String(iso[2]).padStart(2, '0')}-${String(iso[3]).padStart(2, '0')}`
  }

  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (br) {
    return `${br[3]}-${String(br[2]).padStart(2, '0')}-${String(br[1]).padStart(2, '0')}`
  }

  return null
}

function enumerateDateKeys(startKey, endKey) {
  const keys = []
  const cur = parseDateKey(startKey)
  const end = parseDateKey(endKey)
  const msDay = 24 * 60 * 60 * 1000

  while (cur.getTime() <= end.getTime()) {
    const y = cur.getFullYear()
    const m = String(cur.getMonth() + 1).padStart(2, '0')
    const d = String(cur.getDate()).padStart(2, '0')
    keys.push(`${y}-${m}-${d}`)
    cur.setTime(cur.getTime() + msDay)
  }

  return keys
}

function flattenEditalTopics(editalVerticalizado) {
  const topics = []
  for (const disciplina of editalVerticalizado?.disciplinas || []) {
    for (const topico of disciplina.topicos || []) {
      topics.push({
        disciplina: disciplina.nome,
        topico: topico.nome || String(topico.numero || 'Tópico'),
      })
    }
  }
  return topics
}

function topicKey(materia = {}) {
  return `${String(materia.disciplina || '').trim()}|||${String(materia.topico || '').trim()}`
}

function resolveFaseForDayIndex(index, totalDays) {
  const retaFinalStart = Math.max(0, totalDays - 7)
  if (index >= retaFinalStart) return 'reta_final'
  if (index < totalDays * 0.45) return 'fundamentacao'
  if (index < totalDays * 0.8) return 'aprofundamento'
  return 'revisao'
}

function resolveTipoForDayIndex(index, totalDays, config = {}) {
  const retaFinalStart = Math.max(0, totalDays - 7)
  if (index >= retaFinalStart) {
    return index === totalDays - 1 ? 'simulado' : 'revisao'
  }
  if (config.hasTAF && config.tafExercicios?.length && index % 7 === 6) {
    return 'taf'
  }
  if (config.hasRedacao && index % 10 === 9) {
    return 'redacao'
  }
  return 'estudo'
}

function pickMateriasForDay(topics, startIndex, count = 3) {
  if (!topics.length || count <= 0) return []
  const materias = []
  for (let i = 0; i < count; i += 1) {
    materias.push(topics[(startIndex + i) % topics.length])
  }
  return materias
}

/**
 * Garante uma entrada por dia no intervalo e preenche lacunas que a IA omitiu.
 */
function normalizeAndCompleteCronograma({
  cronogramaEntries = [],
  startKey,
  endKey,
  editalVerticalizado,
  config = {},
}) {
  const expectedKeys = enumerateDateKeys(startKey, endKey)
  const expectedSet = new Set(expectedKeys)
  const byDate = new Map()

  cronogramaEntries.forEach((dia) => {
    const key = normalizeDateKey(dia.data)
    if (!key || !expectedSet.has(key) || byDate.has(key)) return
    byDate.set(key, {
      ...dia,
      data: key,
      materias: Array.isArray(dia.materias) ? dia.materias : [],
    })
  })

  const allTopics = flattenEditalTopics(editalVerticalizado)
  const assignedTopicKeys = new Set()
  byDate.forEach((dia) => {
    ;(dia.materias || []).forEach((m) => assignedTopicKeys.add(topicKey(m)))
  })

  const remainingTopics = allTopics.filter((t) => !assignedTopicKeys.has(topicKey(t)))
  const fillTopics = remainingTopics.length ? remainingTopics : allTopics
  let fillTopicIndex = 0
  let filledCount = 0

  const completed = expectedKeys.map((dateKey, index) => {
    if (byDate.has(dateKey)) {
      return byDate.get(dateKey)
    }

    filledCount += 1
    const fase = resolveFaseForDayIndex(index, expectedKeys.length)
    const tipo = resolveTipoForDayIndex(index, expectedKeys.length, config)
    const isRetaFinal = fase === 'reta_final'
    const materias =
      tipo === 'estudo' && !isRetaFinal
        ? pickMateriasForDay(fillTopics, fillTopicIndex, 3)
        : []

    if (materias.length) {
      fillTopicIndex += materias.length
    }

    return {
      data: dateKey,
      tipo,
      fase,
      materias,
      taf_exercicio:
        tipo === 'taf' && config.tafExercicios?.length
          ? config.tafExercicios[Math.floor(index / 7) % config.tafExercicios.length]
          : '',
      descricao: 'Dia completado automaticamente para manter o cronograma contínuo.',
      autoFilled: true,
    }
  })

  return {
    cronograma: completed,
    expectedDays: expectedKeys.length,
    aiDays: byDate.size,
    filledDays: filledCount,
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

  const cronogramaIA = await generateAiJsonWithJobHeartbeat(
    userId,
    jobId,
    prompt,
    {
      generationConfig: { temperature: 0.35, maxOutputTokens: 65536 },
    },
    'Gerando cronograma com IA na nuvem…',
  )

  if (!cronogramaIA.cronograma || !Array.isArray(cronogramaIA.cronograma)) {
    throw new Error('Estrutura de JSON inválida: não contém array "cronograma"')
  }

  cronogramaIA.cronograma.forEach((dia) => {
    if (!Array.isArray(dia.materias)) dia.materias = []
  })

  const normalized = normalizeAndCompleteCronograma({
    cronogramaEntries: cronogramaIA.cronograma,
    startKey: todayKey,
    endKey: planningEndKey,
    editalVerticalizado,
    config,
  })

  if (normalized.filledDays > 0) {
    await updateJob(userId, jobId, {
      message: `IA retornou ${normalized.aiDays}/${normalized.expectedDays} dias. Preenchendo ${normalized.filledDays} dia(s) faltante(s)…`,
    })
  }

  normalized.cronograma.forEach((dia, idx) => {
    if (!dia.data || !dia.tipo) {
      throw new Error(`Dia ${idx} inválido após normalização: falta "data" ou "tipo"`)
    }
  })

  await updateJob(userId, jobId, { progress: 75, message: 'Salvando cronograma…' })

  const monthsCount = await saveCronogramaMonths(courseId, normalized.cronograma, config)

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
    totalDays: normalized.cronograma.length,
    expectedDays: normalized.expectedDays,
    filledDays: normalized.filledDays,
    dayAutomation,
    autoGerarConteudo,
  }
}

module.exports = {
  processGuiaMentoradoCronograma,
  parseCronogramaJson,
  saveCronogramaMonths,
  normalizeAndCompleteCronograma,
  enumerateDateKeys,
  normalizeDateKey,
}
