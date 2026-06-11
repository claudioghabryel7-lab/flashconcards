import {
  collection,
  doc,
  getDoc,
  getDocs,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '../firebase/config'
import {
  normalizeFlashcard,
  cardMatchesModule,
  formatTopicoAsModulo,
} from '../utils/editalVerticalizadoLoader'
import { callGeminiWithRetry, extractJsonFromResponse } from '../utils/geminiApi'

/**
 * Busca flashcards já salvos para um tópico (compartilhados entre usuários do curso).
 */
export async function fetchFlashcardsForTopico(courseId, disciplina, modulo, topicKey) {
  const resolvedId = courseId || 'alego-default'
  const flashcardsRef = collection(db, 'courses', resolvedId, 'flashcards')
  const snapshot = await getDocs(flashcardsRef)

  return snapshot.docs
    .map((d) => normalizeFlashcard({ id: d.id, ...d.data() }))
    .filter((card) => {
      if (topicKey && card.topicKey === topicKey) return true
      return cardMatchesModule(card, disciplina, modulo)
    })
}

/**
 * Gera e salva flashcards para um único tópico (uma vez — reutilizado por todos os alunos).
 */
export async function generateAndSaveFlashcardsForTopico({
  courseId,
  disciplina,
  topicoNome,
  topicoNumero,
  topicKey,
  moduloLabel,
  courseName,
  editalText = '',
}) {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY
  if (!apiKey) {
    throw new Error('VITE_GEMINI_API_KEY não configurada')
  }

  // Carregar dados do curso para obter a banca examinadora
  const resolvedId = courseId || 'alego-default'
  const courseRef = doc(db, 'courses', resolvedId)
  const courseDoc = await getDoc(courseRef)
  const courseData = courseDoc.exists() ? courseDoc.data() : {}
  const banca = courseData.banca || ''

  const modulo = moduloLabel || formatTopicoAsModulo({ numero: topicoNumero, nome: topicoNome })

  const prompt = `Gere flashcards educacionais para ESTE tópico específico de concurso público.

CURSO/CONCURSO: ${courseName || 'Concurso público'}
DISCIPLINA: ${disciplina}
TÓPICO: ${topicoNumero ? `${topicoNumero} - ` : ''}${topicoNome}

🚨🚨🚨 BANCA EXAMINADORA - OBRIGATÓRIO 🚨🚨🚨
BANCA DEFINIDA: ${banca || 'NÃO DEFINIDA'}
- ADAPTE TODO O CONTEÚDO ao estilo da banca "${banca || 'NÃO DEFINIDA'}"
- Se a banca for INSTITUTO AOCP: foco em artigos de lei na íntegra, questões de múltipla escolha diretas, interpretação literal
- Se a banca for FGV: foco em interpretação de texto, questões contextualizadas, análise crítica
- Se a banca for CESPE/CEBRASPE: foco em assertivas C/E, interpretação constitucional
- Se a banca for FCC: foco em legislação atualizada, questões de múltipla escolha, interpretação direta
- Se a banca for VUNESP: foco em interpretação de texto, questões contextualizadas, análise crítica
- SEJA FIEL À BANCA DEFINIDA ACIMA

${editalText ? `CONTEXTO DO EDITAL:\n${editalText.substring(0, 12000)}\n\n` : ''}

INSTRUÇÕES:
- Gere NO MÍNIMO 50 flashcards e ATÉ 150 flashcards para cobrir completamente este tópico específico
- O MÍNIMO OBRIGATÓRIO é 50 flashcards - não gere menos que isso
- Se o tópico for extenso, gere o necessário flashcards para cobertura completa
- Perguntas objetivas; respostas claras e completas
- Conteúdo específico para o concurso — nada genérico, LETRA de lei
- Não invente nada, seja literal e fiel a matéria com fontes firmes
- Mantenha sempre atualizado o conteúdo estamos em 2026
- Não delire nem presuma, crie as coisas e o material da forma correta de acordo com fontes e materiais confiáveis
- Se for direito gere os flashcards de acordo com a lei sem inventar nada, seja fiel a lei 
- Não invente nada, seja direto nos flashcards e com conteúdo fiel
- Linguagem formal, nível concurso público
- 🚨 BANCA EXAMINADORA: Use EXCLUSIVAMENTE o estilo da banca "${banca || 'NÃO DEFINIDA'}"

FORMATO JSON (apenas JSON válido):
{
  "flashcards": [
    {
      "frente": "pergunta",
      "verso": "resposta detalhada",
      "dificuldade": "médio"
    }
  ]
}`

  const response = await callGeminiWithRetry(prompt, {
    maxRetries: 3,
    baseDelay: 2000,
    models: ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'],
    generationConfig: { temperature: 0.7, maxOutputTokens: 32000 },
  })

  const parsed = await extractJsonFromResponse(response)

  const items = parsed.flashcards || []
  if (!items.length) {
    throw new Error('Nenhum flashcard gerado pela IA')
  }

  console.log(`✅ ${items.length} flashcards gerados para o tópico "${topicKey}"`)

  const batch = writeBatch(db)
  const flashcardsRef = collection(db, 'courses', resolvedId, 'flashcards')
  const saved = []

  items.forEach((item, index) => {
    const docRef = doc(flashcardsRef)
    const payload = {
      disciplina,
      materia: disciplina,
      topico: topicoNome,
      topicoNumero: topicoNumero || '',
      modulo,
      topicKey: topicKey || '',
      frente: item.frente || item.pergunta || '',
      verso: item.verso || item.resposta || '',
      pergunta: item.frente || item.pergunta || '',
      resposta: item.verso || item.resposta || '',
      dificuldade: item.dificuldade || 'médio',
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
  return saved.map((c) => normalizeFlashcard(c))
}
