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
- Gere EXATAMENTE 10-15 flashcards de alta qualidade APENAS sobre este tópico (MÍNIMO OBRIGATÓRIO DE 30 FLASHCARDS NO TOTAL)
- NÃO gere menos de 30 flashcards no total. Se necessário, gere mais flashcards para atingir o mínimo.
- Perguntas objetivas; respostas claras e completas
- Conteúdo específico para o concurso — nada genérico
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

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 32000 },
      }),
    }
  )

  const data = await response.json()
  if (!response.ok) {
    throw new Error(data.error?.message || 'Erro na API da IA')
  }

  const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
  const start = generatedText.indexOf('{')
  const end = generatedText.lastIndexOf('}')
  if (start === -1 || end === -1) {
    throw new Error('Resposta da IA sem JSON válido')
  }

  let parsed
  try {
    parsed = JSON.parse(generatedText.substring(start, end + 1))
  } catch {
    const { default: jsonrepair } = await import('jsonrepair')
    parsed = JSON.parse(jsonrepair(generatedText.substring(start, end + 1)))
  }

  const items = parsed.flashcards || []
  if (!items.length) {
    throw new Error('Nenhum flashcard gerado pela IA')
  }

  const resolvedId = courseId || 'alego-default'
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
