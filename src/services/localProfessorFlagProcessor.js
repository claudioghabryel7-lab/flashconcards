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
import { resolveContentFlag } from './contentFeedbackService'

async function loadContentBlock(courseId, flag) {
  const type = flag.contentType
  const contentId = String(flag.contentId || '')

  if (type === 'flashcard') {
    const ref = doc(db, 'courses', courseId, 'flashcards', contentId)
    const snap = await getDoc(ref)
    if (!snap.exists()) return null
    const d = snap.data()
    return {
      kind: 'flashcard',
      ref,
      text: `FRENTE:\n${d.pergunta || d.front || ''}\n\nVERSO:\n${d.resposta || d.back || ''}`,
      data: d,
    }
  }

  if (type === 'questao' || type === 'questoes') {
    const packId = contentId.includes('_nivel_')
      ? contentId
      : flag.topicKey
        ? `${String(flag.topicKey).replace(/[^a-zA-Z0-9_-]+/g, '_')}_nivel_1`
        : contentId
    const ref = doc(db, 'courses', courseId, 'questoesTopico', packId)
    const snap = await getDoc(ref)
    if (!snap.exists()) return null
    return {
      kind: 'questao',
      ref,
      text: JSON.stringify(snap.data()?.questoes || snap.data(), null, 2).slice(0, 20000),
      data: snap.data(),
    }
  }

  // material / conteudo
  const topicKey = flag.topicKey || contentId
  const sanitized = String(topicKey)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .slice(0, 120)
  const ref = doc(db, 'courses', courseId, 'conteudosCompletos', sanitized)
  const snap = await getDoc(ref)
  if (!snap.exists()) return null
  const d = snap.data()
  const blob = JSON.stringify(d).slice(0, 20000)
  return { kind: 'material', ref, text: blob, data: d }
}

async function applyFlashcardPatch(content, verdict) {
  const corr = (verdict.corrections || []).find((c) => c.target === 'flashcard' || c.field)
  if (!corr?.newText) return 0
  const field = corr.field || 'ambos'
  const patch = {}
  if (field === 'frente' || field === 'ambos') {
    const parts = String(corr.newText).split(/\n+VERSO:\n+/i)
    if (field === 'frente') patch.pergunta = corr.newText
    else if (parts.length >= 2) {
      patch.pergunta = parts[0].replace(/^FRENTE:\n?/i, '').trim()
      patch.resposta = parts[1].trim()
    } else patch.pergunta = corr.newText
  }
  if (field === 'verso') patch.resposta = corr.newText
  if (!Object.keys(patch).length) return 0
  await updateDoc(content.ref, { ...patch, updatedAt: serverTimestamp() })
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
  "corrections": [
    { "target": "flashcard", "field": "ambos", "newText": "FRENTE:\\n...\\n\\nVERSO:\\n..." }
  ]
}

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
  if (content.kind === 'flashcard' && verdict?.reportValid !== false) {
    applied = await applyFlashcardPatch(content, verdict)
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

  // Questão/material: manda para admin se não aplicou automático simples
  await updateDoc(flagRef, {
    status: 'needs_admin',
    lastProfessorSummary:
      verdict?.summary || 'Correção complexa — aguardando revisão do admin na Moderação.',
    inReviewBy: null,
    updatedAt: serverTimestamp(),
  })
  return { needsAdmin: true, applied: 0, summary: verdict?.summary }
}

/** Busca a próxima flag aberta (qualquer curso). */
export async function fetchNextOpenFlag() {
  const coursesSnap = await getDocs(collection(db, 'courses'))
  for (const courseDoc of coursesSnap.docs) {
    if (courseDoc.data()?.active === false) continue
    const q = query(
      collection(db, 'courses', courseDoc.id, 'contentFeedback'),
      where('kind', '==', 'flag'),
      where('status', '==', 'open'),
      limit(1),
    )
    const snap = await getDocs(q)
    if (!snap.empty) {
      const d = snap.docs[0]
      return { id: d.id, courseId: courseDoc.id, ...d.data() }
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
