/**
 * Corrige 1 sinalização da Moderação na aba do admin (Gemini + Firestore client).
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  limit,
} from 'firebase/firestore'
import { db } from '../firebase/config'
import { generateAiJson } from '../utils/geminiApi'
import { loadFlaggedContentForLocal } from '../utils/flagContentLookup'
import { resolveContentFlag } from './contentFeedbackService'

async function loadContentBlock(courseId, flag) {
  return loadFlaggedContentForLocal(courseId, flag)
}

async function applyFlashcardPatch(content, verdict) {
  const corr = (verdict.corrections || []).find(
    (c) =>
      !c.target ||
      c.target === 'flashcard' ||
      c.field === 'frente' ||
      c.field === 'verso' ||
      c.field === 'ambos',
  )
  if (!corr?.newText) return 0
  const field = String(corr.field || 'ambos').toLowerCase()
  const patch = {}
  if (field === 'frente' || field === 'ambos') {
    const parts = String(corr.newText).split(/\n+VERSO:\n+/i)
    if (field === 'frente') {
      patch.pergunta = corr.newText.replace(/^FRENTE:\n?/i, '').trim()
      patch.frente = patch.pergunta
    } else if (parts.length >= 2) {
      patch.pergunta = parts[0].replace(/^FRENTE:\n?/i, '').trim()
      patch.resposta = parts[1].trim()
      patch.frente = patch.pergunta
      patch.verso = patch.resposta
    } else {
      patch.pergunta = corr.newText
      patch.frente = patch.pergunta
    }
  }
  if (field === 'verso') {
    patch.resposta = corr.newText.replace(/^VERSO:\n?/i, '').trim()
    patch.verso = patch.resposta
  }
  if (!Object.keys(patch).length) return 0
  await updateDoc(content.ref, { ...patch, updatedAt: serverTimestamp() })
  return 1
}

async function applyQuestaoPatch(content, verdict) {
  const corr = (verdict.corrections || []).find(
    (c) => !c.target || c.target === 'questao' || c.field === 'aligned',
  )
  if (!corr?.newText || content.meta?.idx == null) return 0

  let pack = {}
  try {
    pack = JSON.parse(corr.newText)
  } catch {
    return 0
  }
  if (!pack || typeof pack !== 'object') return 0

  const questoes = Array.isArray(content.meta.questoes) ? [...content.meta.questoes] : []
  const idx = content.meta.idx
  if (!questoes[idx]) return 0

  const next = { ...questoes[idx] }
  if (pack.enunciado != null) next.enunciado = pack.enunciado
  if (pack.alternativas && typeof pack.alternativas === 'object') {
    next.alternativas = { ...(next.alternativas || {}), ...pack.alternativas }
  }
  const correta = pack.correta ?? pack.respostaCorreta ?? pack.gabarito
  if (correta != null) {
    next.correta = correta
    next.respostaCorreta = correta
    next.gabarito = correta
  }
  const expl = pack.gabaritoComentado ?? pack.explicacao ?? pack.comentario
  if (expl != null) {
    next.gabaritoComentado = expl
    next.explicacao = expl
  }

  questoes[idx] = next
  await updateDoc(content.ref, { questoes, updatedAt: serverTimestamp() })
  return 1
}

/**
 * Processa um item professor_supervisor (flag) no cliente.
 */
export async function processProfessorFlagLocal({
  courseId,
  payload = {},
  updateProgress = async () => {},
}) {
  const flagId = payload.flagId
  if (!courseId || !flagId) throw new Error('Flag inválida.')

  const flagRef = doc(db, 'courses', courseId, 'contentFeedback', flagId)
  const flagSnap = await getDoc(flagRef)
  if (!flagSnap.exists()) {
    return { skipped: true, reason: 'flag_missing' }
  }
  const flag = { id: flagSnap.id, ...flagSnap.data(), courseId }
  if (flag.status === 'resolved') {
    return { skipped: true, reason: 'already_resolved' }
  }

  await updateDoc(flagRef, {
    status: 'in_review',
    inReviewAt: serverTimestamp(),
    inReviewBy: 'professor_local',
  })
  await updateProgress(15, 'Carregando conteúdo sinalizado…')

  const content = await loadContentBlock(courseId, flag)
  if (!content) {
    await updateDoc(flagRef, {
      status: 'needs_admin',
      lastProfessorSummary: 'Conteúdo não encontrado para correção automática.',
      inReviewBy: null,
      updatedAt: serverTimestamp(),
    })
    return { needsAdmin: true, applied: 0 }
  }

  await updateProgress(35, 'Professor IA analisando…')
  const questaoHint =
    content.kind === 'questao'
      ? `
Para questão use:
{ "target": "questao", "field": "aligned", "newText": "{\\"correta\\":\\"A\\",\\"gabaritoComentado\\":\\"...\\",\\"enunciado\\":\\"...\\",\\"alternativas\\":{}}" }
`
      : `
Para flashcard use:
{ "target": "flashcard", "field": "ambos", "newText": "FRENTE:\\n...\\n\\nVERSO:\\n..." }
`

  const verdict = await generateAiJson(
    `Você é o Professor IA. Analise a sinalização do aluno.

TIPO: ${flag.contentType}
RELATO: ${flag.text || flag.reportText || ''}
PREVIEW: ${flag.preview || ''}

CONTEÚDO:
${content.text}

Retorne APENAS JSON:
{
  "reportValid": true,
  "summary": "resumo curto",
  "needsAdminReview": false,
  "corrections": []
}
${questaoHint}

REGRAS:
- Se o conteúdo estiver CORRETO: reportValid=false, corrections=[]
- Se ERRADO e puder corrigir: reportValid=true + corrections
- Se dúvida: needsAdminReview=true, corrections=[]`,
    {
      courseId,
      trustedGeneration: true,
      isLegalContent: true,
      generationConfig: { maxOutputTokens: 8000, temperature: 0.2 },
    },
  )

  await updateProgress(75, 'Aplicando correção…')

  if (verdict?.needsAdminReview) {
    await updateDoc(flagRef, {
      status: 'needs_admin',
      lastProfessorSummary: verdict.summary || 'Revisão admin necessária.',
      inReviewBy: null,
      updatedAt: serverTimestamp(),
    })
    return { needsAdmin: true, applied: 0, summary: verdict.summary }
  }

  let applied = 0
  if (verdict?.reportValid !== false) {
    if (content.kind === 'flashcard') {
      applied = await applyFlashcardPatch(content, verdict)
    } else if (content.kind === 'questao') {
      applied = await applyQuestaoPatch(content, verdict)
    }
  }

  if (verdict?.reportValid === false || (applied === 0 && !(verdict?.corrections || []).length)) {
    await resolveContentFlag(courseId, flagId, { contentCorrected: false })
    await updateDoc(flagRef, {
      lastProfessorSummary: verdict?.summary || 'Sem erro a corrigir.',
      lastProfessorApplied: 0,
      resolvedBy: 'professor_local',
    }).catch(() => {})
    return { applied: 0, flagResolved: true, summary: verdict?.summary }
  }

  if (applied > 0) {
    await resolveContentFlag(courseId, flagId, { contentCorrected: true })
    await updateDoc(flagRef, {
      lastProfessorSummary: verdict?.summary || 'Conteúdo corrigido.',
      lastProfessorApplied: applied,
      resolvedBy: 'professor_local',
    }).catch(() => {})
    return { applied, flagResolved: true, summary: verdict?.summary }
  }

  // Material / patch incompleto: manda para admin
  await updateDoc(flagRef, {
    status: 'needs_admin',
    lastProfessorSummary:
      verdict?.summary || 'Correção complexa — aguardando revisão do admin na Moderação.',
    inReviewBy: null,
    updatedAt: serverTimestamp(),
  })
  return { needsAdmin: true, applied: 0, summary: verdict?.summary }
}

const STALE_IN_REVIEW_MS = 12 * 60 * 1000

/** Reabre flags travadas em in_review (job morto / aba fechada). */
export async function reclaimStaleInReviewFlags() {
  const coursesSnap = await getDocs(collection(db, 'courses'))
  const now = Date.now()
  let reclaimed = 0

  for (const courseDoc of coursesSnap.docs) {
    if (courseDoc.data()?.active === false) continue
    const q = query(
      collection(db, 'courses', courseDoc.id, 'contentFeedback'),
      where('kind', '==', 'flag'),
      where('status', '==', 'in_review'),
      limit(10),
    )
    const snap = await getDocs(q)
    for (const d of snap.docs) {
      const data = d.data() || {}
      const at = data.inReviewAt?.toMillis?.() || data.inReviewAt?.seconds * 1000 || 0
      if (at && now - at < STALE_IN_REVIEW_MS) continue
      await updateDoc(d.ref, {
        status: 'open',
        inReviewBy: null,
        inReviewJobId: null,
        lastProfessorSummary: 'Reaberto automaticamente (revisão travada).',
        updatedAt: serverTimestamp(),
      }).catch(() => {})
      reclaimed += 1
    }
  }
  return reclaimed
}

/** Busca a próxima flag aberta ou que precisa de retry (qualquer curso). */
export async function fetchNextOpenFlag() {
  const coursesSnap = await getDocs(collection(db, 'courses'))
  // open primeiro; depois needs_admin (ex.: falhou "conteúdo não encontrado" com loader antigo)
  const statusOrder = ['open', 'needs_admin']

  for (const status of statusOrder) {
    for (const courseDoc of coursesSnap.docs) {
      if (courseDoc.data()?.active === false) continue
      const q = query(
        collection(db, 'courses', courseDoc.id, 'contentFeedback'),
        where('kind', '==', 'flag'),
        where('status', '==', status),
        limit(5),
      )
      const snap = await getDocs(q)
      for (const d of snap.docs) {
        const data = d.data() || {}
        // Evita loop infinito em needs_admin sem chance de auto-correção
        if (
          status === 'needs_admin' &&
          data.lastProfessorSummary &&
          !/não encontrado|nao encontrado|não carregado|travada|Reaberto/i.test(
            String(data.lastProfessorSummary),
          )
        ) {
          continue
        }
        return { id: d.id, courseId: courseDoc.id, ...data }
      }
    }
  }
  return null
}

export async function patchProfessorActivity(patch) {
  await setDoc(
    doc(db, 'config', 'professorFiscalizador'),
    {
      ...patch,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )
}
