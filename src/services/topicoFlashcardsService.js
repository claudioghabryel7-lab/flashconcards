import { readEnv, isDevEnv } from '@/lib/env.js'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
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
import { CONTENT_STATUS } from '../utils/contentStatus'

/**
 * Busca flashcards já salvos para um tópico (compartilhados entre usuários do curso).
 * Alunos: apenas status disponivel (exigido pelas regras do Firestore).
 */
export async function fetchFlashcardsForTopico(
  courseId,
  disciplina,
  modulo,
  topicKey,
  { includeUnpublished = false } = {}
) {
  const resolvedId = courseId || 'alego-default'
  const flashcardsRef = collection(db, 'courses', resolvedId, 'flashcards')

  const filterClient = (docs) =>
    docs
      .map((d) => normalizeFlashcard({ id: d.id, ...d.data() }))
      .filter((card) => {
        if (topicKey && card.topicKey === topicKey) return true
        return cardMatchesModule(card, disciplina, modulo)
      })

  if (includeUnpublished) {
    const snapshot = await getDocs(flashcardsRef)
    return filterClient(snapshot.docs)
  }

  const published = CONTENT_STATUS.AVAILABLE
  let docs = []

  if (topicKey) {
    const byTopic = await getDocs(
      query(flashcardsRef, where('status', '==', published), where('topicKey', '==', topicKey))
    )
    docs = byTopic.docs
  }

  if (docs.length === 0 && disciplina && modulo) {
    const byModule = await getDocs(
      query(
        flashcardsRef,
        where('status', '==', published),
        where('materia', '==', disciplina),
        where('modulo', '==', modulo)
      )
    )
    docs = byModule.docs
  }

  if (docs.length === 0 && disciplina) {
    const byMateria = await getDocs(
      query(flashcardsRef, where('status', '==', published), where('materia', '==', disciplina))
    )
    docs = byMateria.docs.filter((d) => filterClient([d]).length > 0)
  }

  return filterClient(docs)
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
  const apiKey = readEnv('VITE_GEMINI_API_KEY')
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

  const prompt = `Gere flashcards educacionais de "Véspera de Prova" para ESTE tópico específico de concurso público.

CURSO/CONCURSO: ${courseName || 'Concurso público'}
DISCIPLINA: ${disciplina}
TÓPICO: ${topicoNumero ? `${topicoNumero} - ` : ''}${topicoNome}

DATA ATUAL: ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
IMPORTANTE: Use apenas informações atualizadas até esta data. Verifique se há leis, decretos ou regulamentos recentes que possam afetar o conteúdo.

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

**MODO HACKER DOS CONCURSOS**

1. **RAIO-X DE PROBABILIDADE**:
   - Top Assuntos Quentes: Gere flashcards focados nos tópicos com maior probabilidade de cair NO CONCURSO ${courseName || 'Concurso público'}
   - O Padrão da Banca: Como a banca ${banca || 'NÃO DEFINIDA'} costuma cobrar este tópico especificamente no concurso

2. **REVISÃO TURBO EM FLASHCARDS**:
   - Gere EXATAMENTE 50 flashcards para este tópico específico
   - Foque APENAS nos 50 tópicos/conceitos MAIS IMPORTANTES para a banca ${banca || 'NÃO DEFINIDA'}
   - Priorize o que tem maior probabilidade de cair no concurso ${courseName || 'Concurso público'}
   - Cada flashcard deve ser:
     * Pergunta: Objetiva, direta, focada em um conceito específico IMPORTANTE
     * Resposta: Clara, completa, explicativa (NADA SUPERFICIAL, QUERO BEM COMPLETO)
     * Citar exemplos práticos do concurso ${courseName || 'Concurso público'}
     * Ser específico para o cargo
     * Incluir dicas de memorização (nada genérico e vago/vago)
   - 3-4 flashcards de "Pegadinhas":
     * Erros comuns que a banca ${banca || 'NÃO DEFINIDA'} costuma cobrar
     * Detalhes que passam despercebidos
     * Armadilhas específicas do concurso ${courseName || 'Concurso público'}

3. **CONTEÚDO ESPECÍFICO**:
   - Conteúdo específico para o concurso — nada genérico, LETRA de lei
   - Não invente nada, seja literal e fiel a matéria com fontes firmes
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
}

REGRAS:
- Seja ESPECÍFICO do concurso ${courseName || 'Concurso público'}
- Cite o nome do concurso nos flashcards
- Retorne APENAS o JSON válido, sem texto adicional
- NÃO use caracteres de markdown (como **, *, •, __, ~~, \` etc.) nos textos`

  const response = await callGeminiWithRetry(prompt, {
    models: ['gemini-2.5-flash', 'gemini-2.5-pro'],
    generationConfig: { temperature: 0.7, maxOutputTokens: 32000 },
    useGoogleSearch: true,
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
      status: 'indisponivel',
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
