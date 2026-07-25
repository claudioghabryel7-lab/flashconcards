import { readEnv, isDevEnv } from '@/lib/env.js'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '../firebase/config'
import { formatTopicoAsModulo } from '../utils/editalVerticalizadoLoader'
import { generateAiJson, hasGeminiApiKeys } from '../utils/geminiApi'
import {
  AI_TEXT_FORMAT_RULES,
  sanitizeQuestaoAlternativas,
  sanitizeQuestaoText,
} from '../utils/aiTextFormatting'
import {
  buildExamFidelityBlock,
  buildQuestaoJsonSchemaSnippet,
  buildTipoProvaInstructions,
  formatTipoProvaLabel,
  isCertoErradoTipo,
  normalizeExamContext,
} from '../utils/examFidelityContext'
import { filterValidQuestoes } from '../utils/questoesQuality'
import {
  getOrCreateTopicFactualDossier,
  hasRichDossier,
} from './topicFactualDossierService'
import { appendGoogleAiDossier } from './googleAiBrowserVerifier'

/**
 * Busca questões já salvas para um tópico (compartilhadas entre usuários do curso).
 */
export async function fetchQuestoesForTopico(courseId, disciplina, modulo, topicKey) {
  const resolvedId = courseId || 'alego-default'
  const questoesRef = collection(db, 'courses', resolvedId, 'questoes')
  const snapshot = await getDocs(questoesRef)

  return snapshot.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((questao) => {
      const decodedTopicKey = topicKey ? decodeURIComponent(topicKey) : null
      const decodedQuestaoTopicKey = questao.topicKey ? decodeURIComponent(questao.topicKey) : null

      if (decodedTopicKey && decodedQuestaoTopicKey === decodedTopicKey) return true
      return questao.disciplina === disciplina && questao.modulo === modulo
    })
}

/**
 * Gera e salva questões para um único tópico (uma vez — reutilizado por todos os alunos).
 */
export async function generateAndSaveQuestoesForTopico({
  courseId,
  disciplina,
  topicoNome,
  topicoNumero,
  topicKey,
  moduloLabel,
  courseName,
  editalText = '',
}) {
  if (!hasGeminiApiKeys()) {
    throw new Error('Nenhuma API key Gemini configurada (VITE_GEMINI_API_KEY)')
  }

  const resolvedId = courseId || 'alego-default'
  const courseRef = doc(db, 'courses', resolvedId)
  const courseDoc = await getDoc(courseRef)
  const courseData = courseDoc.exists() ? courseDoc.data() : {}

  const exam = normalizeExamContext({
    banca: courseData.banca || '',
    cargo: courseData.cargo || courseData.competition || '',
    concursoName: courseData.competition || courseName || '',
    courseName: courseName || courseData.name || '',
    competition: courseData.competition,
    nivel: courseData.nivel || courseData.escolaridade,
    area: courseData.area,
  })
  const tipoLabel = formatTipoProvaLabel(exam.tipoProva)
  const fidelityBlock = buildExamFidelityBlock(exam)
  const formatInstructions = buildTipoProvaInstructions(exam.tipoProva)
  const schemaSnippet = buildQuestaoJsonSchemaSnippet(exam.tipoProva)
  const modulo = moduloLabel || formatTopicoAsModulo({ numero: topicoNumero, nome: topicoNome })

  // 1 dossiê por tópico (Firestore) — lotes reutilizam sem grounding por chamada
  const dossier = await getOrCreateTopicFactualDossier({
    courseId: resolvedId,
    topicKey,
    topicoNome,
    disciplina,
    banca: exam.banca,
    cargo: exam.cargo,
    concursoName: exam.concursoName,
  })
  const richDossier = hasRichDossier(dossier)
  console.log(
    richDossier
      ? `[questoes] dossiê rico (${dossier.text.length} chars) — lotes sem Search`
      : '[questoes] dossiê fraco/ausente — lotes com Search',
  )

  const isQuotaErr = (err) => {
    const msg = String(err?.message || err || '').toLowerCase()
    const code = String(err?.code || '').toLowerCase()
    return (
      code.includes('quota') ||
      msg.includes('quota') ||
      msg.includes('429') ||
      msg.includes('resource_exhausted') ||
      msg.includes('rate limit')
    )
  }

  const generateBatch = async (batchNumber, totalBatches) => {
    const basePrompt = `${fidelityBlock}
Gere questões preditivas de "Véspera de Prova" para ESTE tópico específico.

CURSO/CONCURSO: ${exam.concursoName || courseName || 'Concurso público'}
CARGO: ${exam.cargo || 'NÃO DEFINIDO'}
BANCA: ${exam.banca || 'NÃO DEFINIDA'}
TIPO DE PROVA: ${tipoLabel}
DISCIPLINA: ${disciplina}
TÓPICO: ${topicoNumero ? `${topicoNumero} - ` : ''}${topicoNome}
LOTE: ${batchNumber} de ${totalBatches} (gere EXATAMENTE 5 questões neste lote)

DATA ATUAL: ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}

${formatInstructions}

${editalText ? `CONTEXTO DO EDITAL:\n${editalText.substring(0, 10000)}\n\n` : ''}

REGRAS:
- Fidelidade 100% à banca ${exam.banca || 'indicada'} e ao cargo ${exam.cargo || 'do edital'}
- Formato ${tipoLabel} — sem misturar com outro formato
- Não invente leis/artigos
- Use o DOSSIÊ FACTUAL como fonte de verdade quando presente
- ${AI_TEXT_FORMAT_RULES}

FORMATO JSON (apenas JSON válido):
{
  "questoes": [
    {
      "analiseJuridicaPrevia": "artigo/lei/jurisprudência base",
      ${schemaSnippet},
      "comentario": "explicação detalhada"
    }
  ]
}`
    const prompt = appendGoogleAiDossier(basePrompt, dossier?.text)

    const MAX_BATCH_ATTEMPTS = 3
    let lastErr = null
    for (let attempt = 1; attempt <= MAX_BATCH_ATTEMPTS; attempt += 1) {
      try {
        const parsed = await generateAiJson(
          attempt === 1
            ? prompt
            : `${prompt}

═══ RETENTATIVA ${attempt}/${MAX_BATCH_ATTEMPTS} ═══
A tentativa anterior falhou ou veio vazia/inválida. Gere de novo EXATAMENTE 5 questões válidas neste lote.`,
          {
            courseId,
            trustedGeneration: true,
            // Dossiê rico → sem Search por lote; senão Search (qualidade)
            useGoogleSearch: !richDossier,
            useRAG: false,
            thinkingLevel: 'low',
            maxContinues: 2,
            generationConfig: {
              maxOutputTokens: 16000,
              temperature: attempt === 1 ? 0.2 : 0.15,
            },
          },
        )

        const { ok } = filterValidQuestoes(parsed.questoes || [], {
          tipoProva: exam.tipoProva,
          banca: exam.banca,
          minKeep: 1,
        })

        if (ok.length >= 1) {
          console.log(`✅ Lote ${batchNumber}: ${ok.length} questões válidas (${tipoLabel})`)
          return ok
        }

        lastErr = new Error(`Lote ${batchNumber} sem questões válidas`)
        lastErr.code = 'questoes_invalid'
        if (attempt < MAX_BATCH_ATTEMPTS) {
          console.warn(`⚠️ Lote ${batchNumber} vazio — retentando (${attempt + 1}/${MAX_BATCH_ATTEMPTS})…`)
          await new Promise((r) => setTimeout(r, 1500 * attempt))
          continue
        }
      } catch (err) {
        lastErr = err
        if (isQuotaErr(err)) throw err // cota: não queima de novo neste lote
        if (attempt < MAX_BATCH_ATTEMPTS) {
          console.warn(
            `⚠️ Lote ${batchNumber} erro (“${err?.message || err}”) — retentando (${attempt + 1}/${MAX_BATCH_ATTEMPTS})…`,
          )
          await new Promise((r) => setTimeout(r, 2000 * attempt))
          continue
        }
      }
    }
    throw lastErr || new Error(`Lote ${batchNumber} falhou após ${MAX_BATCH_ATTEMPTS} tentativas`)
  }

  const totalBatches = 10
  // Concorrência 2 (evita pico de cota; grounding e qualidade intactos)
  const CONCURRENCY = 2
  console.log(`🚀 Gerando ${totalBatches} lotes (${tipoLabel}), concorrência ${CONCURRENCY}...`)
  const allBatches = []
  for (let start = 1; start <= totalBatches; start += CONCURRENCY) {
    const slice = []
    for (let i = start; i < start + CONCURRENCY && i <= totalBatches; i += 1) {
      slice.push(generateBatch(i, totalBatches))
    }
    allBatches.push(...(await Promise.all(slice)))
  }
  const allQuestoes = allBatches.flat()
  console.log(`✅ Total de ${allQuestoes.length} questões para o tópico "${topicKey}"`)

  const batch = writeBatch(db)
  const questoesRef = collection(db, 'courses', resolvedId, 'questoes')
  const saved = []

  allQuestoes.forEach((item, index) => {
    const docRef = doc(questoesRef)
    const isCE = isCertoErradoTipo(exam.tipoProva)
    const payload = {
      disciplina: disciplina || '',
      topico: topicoNome || '',
      topicoNumero: topicoNumero || '',
      modulo: modulo || '',
      topicKey: topicKey || '',
      enunciado: sanitizeQuestaoText(item.enunciado || ''),
      alternativas: isCE ? [] : sanitizeQuestaoAlternativas(item.alternativas || []),
      gabarito: item.gabarito || item.correta || item.respostaCorreta || '',
      comentario: sanitizeQuestaoText(item.comentario || item.explicacao || ''),
      analiseJuridicaPrevia: sanitizeQuestaoText(item.analiseJuridicaPrevia || ''),
      banca: exam.banca,
      cargo: exam.cargo,
      tipoProva: tipoLabel,
      courseId: resolvedId,
      shared: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      order: index,
    }
    batch.set(docRef, payload)
    saved.push({ id: docRef.id, ...payload })
  })

  await batch.commit()
  return saved
}
