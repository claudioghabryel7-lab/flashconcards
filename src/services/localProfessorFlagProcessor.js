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
  const field = String(corr.field || 'verso').toLowerCase()
  const originalPergunta = String(content.data?.pergunta || content.data?.frente || '')
  const originalResposta = String(content.data?.resposta || content.data?.verso || '')
  const patch = {}

  if (field === 'frente') {
    patch.pergunta = corr.newText.replace(/^FRENTE:\n?/i, '').trim()
    patch.frente = patch.pergunta
  } else if (field === 'verso') {
    patch.resposta = corr.newText.replace(/^VERSO:\n?/i, '').trim()
    patch.verso = patch.resposta
  } else {
    // ambos — só se o modelo devolver FRENTE/VERSO claramente
    const parts = String(corr.newText).split(/\n+VERSO:\n+/i)
    if (parts.length >= 2) {
      patch.pergunta = parts[0].replace(/^FRENTE:\n?/i, '').trim()
      patch.resposta = parts[1].trim()
      patch.frente = patch.pergunta
      patch.verso = patch.resposta
    } else {
      // sem delimitador: assume só verso (não reescreve a frente)
      patch.resposta = corr.newText.replace(/^VERSO:\n?/i, '').trim()
      patch.verso = patch.resposta
    }
  }

  // Guarda: se a frente mudou demais sem o relato pedir reescrita total, mantém a original
  if (patch.pergunta != null && originalPergunta) {
    const sim = textSimilarity(originalPergunta, patch.pergunta)
    if (sim < 0.35 && field !== 'frente') {
      delete patch.pergunta
      delete patch.frente
    }
  }
  if (patch.resposta != null && originalResposta) {
    const sim = textSimilarity(originalResposta, patch.resposta)
    // verso pode mudar mais (correção factual), mas zero overlap = outro card
    if (sim < 0.08 && patch.resposta.length > 40 && originalResposta.length > 40) {
      return 0
    }
  }

  if (!Object.keys(patch).length) return 0
  await updateDoc(content.ref, { ...patch, updatedAt: serverTimestamp() })
  return 1
}

function textSimilarity(a = '', b = '') {
  const na = String(a)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
  const nb = String(b)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
  if (!na || !nb) return 0
  if (na === nb) return 1
  const shorter = na.length <= nb.length ? na : nb
  const longer = na.length > nb.length ? na : nb
  if (longer.includes(shorter.slice(0, Math.min(80, shorter.length)))) return 0.6
  let shared = 0
  const tokens = new Set(shorter.split(' ').filter((t) => t.length > 3))
  tokens.forEach((t) => {
    if (longer.includes(t)) shared += 1
  })
  return tokens.size ? shared / tokens.size : 0
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
  const originalEnunciado = String(next.enunciado || '')

  // Preferir só gabarito/explicação; enunciado só se similaridade alta (correção pontual)
  if (pack.enunciado != null) {
    const sim = textSimilarity(originalEnunciado, String(pack.enunciado))
    if (sim >= 0.45 || !originalEnunciado) {
      next.enunciado = pack.enunciado
    }
  }
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

  const changed =
    next.enunciado !== questoes[idx].enunciado ||
    next.respostaCorreta !== questoes[idx].respostaCorreta ||
    next.gabaritoComentado !== questoes[idx].gabaritoComentado ||
    JSON.stringify(next.alternativas) !== JSON.stringify(questoes[idx].alternativas)
  if (!changed) return 0

  questoes[idx] = next
  await updateDoc(content.ref, { questoes, updatedAt: serverTimestamp() })
  return 1
}

async function applyMaterialPatch(content, verdict) {
  const corr = (verdict.corrections || []).find(
    (c) =>
      !c.target ||
      c.target === 'material' ||
      c.target === 'conteudo' ||
      c.field === 'content' ||
      c.field === 'titulo' ||
      c.field === 'subtitulo' ||
      c.field === 'secoes',
  )
  if (!corr?.newText) return 0

  let pack = null
  try {
    pack = JSON.parse(corr.newText)
  } catch {
    pack = null
  }

  const patch = { updatedAt: serverTimestamp(), professorCorrectedAt: serverTimestamp() }

  if (pack && typeof pack === 'object') {
    if (pack.content != null) patch.content = pack.content
    if (pack.titulo != null) patch.titulo = pack.titulo
    if (pack.subtitulo != null) patch.subtitulo = pack.subtitulo
    if (pack.materia != null) patch.materia = pack.materia
    if (Array.isArray(pack.secoes)) patch.secoes = pack.secoes
    if (pack.revisaoTurbo != null) patch.revisaoTurbo = pack.revisaoTurbo
    if (pack.pegadinhas != null) patch.pegadinhas = pack.pegadinhas
    if (pack.raioXProbabilidade != null) patch.raioXProbabilidade = pack.raioXProbabilidade
  } else {
    const field = String(corr.field || 'content').toLowerCase()
    if (field === 'titulo') patch.titulo = corr.newText
    else if (field === 'subtitulo') patch.subtitulo = corr.newText
    else patch.content = corr.newText
  }

  const keys = Object.keys(patch).filter((k) => k !== 'updatedAt' && k !== 'professorCorrectedAt')
  if (!keys.length) return 0
  await updateDoc(content.ref, patch)
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
Para questão (PATCH MÍNIMO):
{ "target": "questao", "field": "aligned", "newText": "{\\"correta\\":\\"A\\",\\"gabaritoComentado\\":\\"...\\"}" }
Inclua "enunciado" ou "alternativas" SOMENTE se o erro estiver neles — e mantenha o mesmo assunto/tese.
`
      : content.kind === 'material' || content.kind === 'incidencia'
        ? `
Para material use:
{ "target": "material", "field": "content", "newText": "{\\"content\\":\\"...html ou markdown corrigido...\\",\\"titulo\\":\\"...\\"}" }
`
        : `
Para flashcard (PATCH MÍNIMO — NÃO reescreva o card do zero):
Preferir um lado só:
{ "target": "flashcard", "field": "verso", "newText": "texto corrigido do verso" }
ou
{ "target": "flashcard", "field": "frente", "newText": "texto corrigido da frente" }
Só use field "ambos" se os DOIS lados tiverem erro factual, no formato:
FRENTE:\\n...\\n\\nVERSO:\\n...
Mantenha o MESMO tema/conceito do card original; corrija apenas o erro apontado.
`

  const verdict = await generateAiJson(
    `Você é o Professor IA. Analise a sinalização do aluno e CORRIJA SÓ O ERRO — sem mudar o teor.

TIPO: ${flag.contentType}
RELATO: ${flag.text || flag.reportText || ''}
PREVIEW (item sinalizado): ${flag.preview || ''}

CONTEÚDO ATUAL (não troque de assunto):
${content.text}

Retorne APENAS JSON:
{
  "reportValid": true,
  "summary": "resumo curto do que foi corrigido",
  "needsAdminReview": false,
  "corrections": []
}
${questaoHint}

REGRAS OBRIGATÓRIAS:
- Se o conteúdo estiver CORRETO: reportValid=false, corrections=[]
- Se ERRADO: reportValid=true + corrections com PATCH MÍNIMO (só o trecho/campo errado)
- PROIBIDO inventar outro flashcard/questão, mudar o tema, ou reescrever tudo "do zero"
- Preserve o conceito pedagógico original; corrija fato jurídico, gabarito ou redação pontual
- Se dúvida ou o erro exigir reescrita total: needsAdminReview=true, corrections=[]`,
    {
      courseId,
      trustedGeneration: true,
      isLegalContent: true,
      useGoogleSearch: true,
      thinkingLevel: 'low',
      verifyContent: false,
      // Patch mínimo — 8k era excessivo por flag
      generationConfig: { maxOutputTokens: 3000, temperature: 0.15 },
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
    } else if (content.kind === 'material' || content.kind === 'incidencia') {
      applied = await applyMaterialPatch(content, verdict)
    }
  }

  if (verdict?.reportValid === false || (applied === 0 && !(verdict?.corrections || []).length)) {
    const summary = verdict?.summary || 'Sem erro a corrigir — conteúdo mantido.'
    await resolveContentFlag(courseId, flagId, {
      contentCorrected: false,
      lastProfessorSummary: summary,
      resolvedBy: 'professor_local',
      flagSnapshot: flag,
    })
    return { applied: 0, flagResolved: true, summary }
  }

  if (applied > 0) {
    const summary = verdict?.summary || 'Conteúdo corrigido pelo Professor IA.'
    await resolveContentFlag(courseId, flagId, {
      contentCorrected: true,
      lastProfessorSummary: summary,
      resolvedBy: 'professor_local',
      flagSnapshot: { ...flag, lastProfessorSummary: summary, contentCorrected: true },
    })
    return { applied, flagResolved: true, summary }
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
        // needs_admin: só pula se o Professor pediu revisão humana explícita
        if (
          status === 'needs_admin' &&
          data.lastProfessorSummary &&
          /revisão admin|needsAdminReview|aguardando revisão do admin|dúvida|duvida grave/i.test(
            String(data.lastProfessorSummary),
          ) &&
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
