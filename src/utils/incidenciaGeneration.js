/**
 * Geração de revisão de incidência em lotes (evita JSON cortado por MAX_TOKENS).
 * Checkpoint parcial por lote — pause/reload retoma sem regastar API.
 */
import { generateAiJson } from './geminiApi'
import {
  buildIncidenciaAutomationPrompt,
  buildIncidenciaBatchPrompt,
  buildIncidenciaResumoPrompt,
} from './contentAutomationPrompts'

export const INCIDENCIA_TOPICS_PER_BATCH = 3
export const INCIDENCIA_MAX_OUTPUT_TOKENS = 32000
export const INCIDENCIA_MIN_REVISAO_CHARS = 80

export function sanitizeDisciplinaDocId(name = '') {
  return String(name || '')
    .replace(/[^a-zA-Z0-9]/g, '_')
    .substring(0, 100)
}

function normalizeTopicos(topicos = []) {
  return (topicos || [])
    .map((t) => {
      if (typeof t === 'string') return { numero: '', nome: t }
      return {
        numero: String(t?.numero || '').trim(),
        nome: String(t?.nome || t?.topico || '').trim(),
      }
    })
    .filter((t) => t.nome)
}

function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

function assuntoHasUsableRevisao(assunto) {
  return String(assunto?.revisao || '').trim().length >= INCIDENCIA_MIN_REVISAO_CHARS
}

/**
 * Conteúdo completo o bastante para publicar (não aceita só 1 item genérico).
 */
export function isIncidenciaContentComplete(data = {}, expectedTopicCount = 0) {
  const analise = Array.isArray(data.analisePorTopico) ? data.analisePorTopico : []
  if (!analise.length) return false

  const expected = Math.max(1, Number(expectedTopicCount) || analise.length)
  const minTopics = Math.max(1, Math.ceil(expected * 0.8))
  if (analise.length < minTopics) return false

  let topicsWithRevisao = 0
  for (const topico of analise) {
    const assuntos = Array.isArray(topico?.assuntos) ? topico.assuntos : []
    if (assuntos.some(assuntoHasUsableRevisao)) topicsWithRevisao += 1
  }
  return topicsWithRevisao >= Math.ceil(analise.length * 0.75)
}

/** Critério frouxo legado — preferir isIncidenciaContentComplete. */
export function hasUsableIncidenciaPartial(data = {}) {
  return (
    (Array.isArray(data.analisePorTopico) && data.analisePorTopico.length > 0) ||
    (Array.isArray(data.topAssuntosGerais) && data.topAssuntosGerais.length > 0)
  )
}

function mergeAnalise(chunks = []) {
  const map = new Map()
  for (const block of chunks) {
    const list = Array.isArray(block?.analisePorTopico)
      ? block.analisePorTopico
      : Array.isArray(block)
        ? block
        : []
    for (const item of list) {
      const key = `${String(item?.topicoNumero || '').trim()}::${String(item?.topicoNome || '').trim()}`.toLowerCase()
      if (!key || key === '::') continue
      const existing = map.get(key)
      if (!existing) {
        map.set(key, {
          topicoNumero: item.topicoNumero || '',
          topicoNome: item.topicoNome || '',
          assuntos: Array.isArray(item.assuntos) ? item.assuntos : [],
        })
        continue
      }
      const mergedAssuntos = [...(existing.assuntos || [])]
      for (const a of item.assuntos || []) {
        const aKey = String(a?.assunto || '')
          .toLowerCase()
          .trim()
        if (!aKey) continue
        if (!mergedAssuntos.some((x) => String(x?.assunto || '').toLowerCase().trim() === aKey)) {
          mergedAssuntos.push(a)
        }
      }
      existing.assuntos = mergedAssuntos
    }
  }
  return Array.from(map.values())
}

/**
 * Gera revisão de incidência completa por disciplina, em lotes de tópicos.
 */
export async function generateIncidenciaCompleta({
  disciplinaNome,
  topicos = [],
  banca = '',
  cargo = '',
  concursoName = '',
  courseName = 'Curso Preparatório',
  nivelCurso = '',
  editalText = '',
  courseId = null,
  generateFn = generateAiJson,
  onProgress = async () => {},
  aiOptions = {},
  existingAnalise = [],
  startBatch = 1,
  jobId = null,
  waitControl = null,
  onBatchSaved = null,
}) {
  const lista = normalizeTopicos(topicos)
  const baseOpts = {
    courseId,
    useRAG: true,
    isLegalContent: true,
    maxContinues: 5,
    generationConfig: {
      maxOutputTokens: INCIDENCIA_MAX_OUTPUT_TOKENS,
      temperature: 0.3,
      ...(aiOptions.generationConfig || {}),
    },
    ...aiOptions,
  }
  const examFields = {
    banca,
    cargo,
    concursoName: concursoName || courseName,
    courseName,
    nivelCurso,
  }

  // Retomada parcial: pula chamada única
  const hasPartial = Array.isArray(existingAnalise) && existingAnalise.length > 0

  // Disciplina pequena: tenta 1 chamada; se cortar, cai nos lotes
  if (!hasPartial && lista.length > 0 && lista.length <= INCIDENCIA_TOPICS_PER_BATCH) {
    if (typeof waitControl === 'function') await waitControl(jobId)
    await onProgress(40, `Gerando incidência: ${disciplinaNome}`)
    try {
      const prompt = buildIncidenciaAutomationPrompt({
        disciplinaNome,
        topicos: lista,
        editalText,
        ...examFields,
      })
      const parsed = await generateFn(prompt, baseOpts)
      if (isIncidenciaContentComplete(parsed, lista.length)) {
        const result = {
          disciplina: disciplinaNome,
          banca: parsed.banca || banca || 'NÃO DEFINIDA',
          cargo: parsed.cargo || cargo || 'NÃO DEFINIDO',
          curso: parsed.curso || courseName,
          analisePorTopico: parsed.analisePorTopico || [],
          topAssuntosGerais: parsed.topAssuntosGerais || [],
          dicasEstudo: parsed.dicasEstudo || [],
        }
        if (typeof onBatchSaved === 'function') {
          await onBatchSaved({ partial: result, batchesCompleted: 1, complete: true })
        }
        return result
      }
      await onProgress(45, `Incidência incompleta — gerando em lotes…`)
    } catch (err) {
      console.warn('[incidencia] chamada única falhou, usando lotes:', err?.message || err)
    }
  }

  const batches = chunk(lista.length ? lista : [{ numero: '', nome: disciplinaNome }], INCIDENCIA_TOPICS_PER_BATCH)
  const partials = hasPartial ? [{ analisePorTopico: existingAnalise }] : []
  const fromBatch = Math.max(1, Number(startBatch) || 1)

  for (let i = fromBatch - 1; i < batches.length; i += 1) {
    if (typeof waitControl === 'function') await waitControl(jobId)

    const batch = batches[i]
    const pct = 25 + Math.round(((i + 1) / batches.length) * 55)
    await onProgress(pct, `Incidência ${disciplinaNome}: lote ${i + 1}/${batches.length}`)

    const prompt = buildIncidenciaBatchPrompt({
      disciplinaNome,
      topicos: batch,
      editalText,
      batchIndex: i + 1,
      batchTotal: batches.length,
      ...examFields,
    })

    let parsed = await generateFn(prompt, baseOpts)
    const okCount = (parsed?.analisePorTopico || []).filter((t) =>
      (t.assuntos || []).some(assuntoHasUsableRevisao),
    ).length
    if (okCount < Math.ceil(batch.length * 0.5)) {
      await onProgress(pct, `Lote ${i + 1} incompleto — regenerando…`)
      parsed = await generateFn(
        `${prompt}\n\nATENÇÃO: a resposta anterior veio CURTA/CORTADA. Reescreva COMPLETO com revisão longa (≥120 palavras) por assunto.`,
        { ...baseOpts, generationConfig: { ...baseOpts.generationConfig, temperature: 0.25 } },
      )
    }
    partials.push(parsed)

    const mergedSoFar = mergeAnalise(partials)
    if (typeof onBatchSaved === 'function') {
      await onBatchSaved({
        partial: {
          disciplina: disciplinaNome,
          banca: banca || 'NÃO DEFINIDA',
          cargo: cargo || 'NÃO DEFINIDO',
          curso: courseName,
          analisePorTopico: mergedSoFar,
          topAssuntosGerais: [],
          dicasEstudo: [],
        },
        batchesCompleted: i + 1,
        complete: false,
      })
    }
  }

  const analisePorTopico = mergeAnalise(partials)

  if (typeof waitControl === 'function') await waitControl(jobId)
  await onProgress(88, `Resumo geral de incidência: ${disciplinaNome}`)
  let topAssuntosGerais = []
  let dicasEstudo = []
  try {
    const resumo = await generateFn(
      buildIncidenciaResumoPrompt({
        disciplinaNome,
        analisePorTopico,
        ...examFields,
      }),
      {
        ...baseOpts,
        useRAG: false,
        generationConfig: { maxOutputTokens: 8192, temperature: 0.3 },
      },
    )
    topAssuntosGerais = Array.isArray(resumo?.topAssuntosGerais) ? resumo.topAssuntosGerais : []
    dicasEstudo = Array.isArray(resumo?.dicasEstudo) ? resumo.dicasEstudo : []
  } catch (err) {
    console.warn('[incidencia] resumo geral falhou, seguindo sem ele:', err?.message || err)
  }

  const result = {
    disciplina: disciplinaNome,
    banca: banca || 'NÃO DEFINIDA',
    cargo: cargo || 'NÃO DEFINIDO',
    curso: courseName,
    analisePorTopico,
    topAssuntosGerais,
    dicasEstudo,
  }

  if (!isIncidenciaContentComplete(result, lista.length || 1)) {
    const err = new Error(
      `Revisão de incidência incompleta para "${disciplinaNome}" (${analisePorTopico.length}/${lista.length || 1} tópicos com conteúdo).`,
    )
    err.code = 'incidencia_incomplete'
    throw err
  }

  if (typeof onBatchSaved === 'function') {
    await onBatchSaved({
      partial: result,
      batchesCompleted: batches.length,
      complete: true,
    })
  }

  return result
}
