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
import { callGeminiWithRetry, extractJsonFromResponse } from '../utils/geminiApi'
import { prepareGeminiTools } from './geminiFunctionCalling.js'

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
      // Decodificar o topicKey se necessário
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

  const prompt = `Gere questões preditivas de "Véspera de Prova" para ESTE tópico específico de concurso público.

CURSO/CONCURSO: ${courseName || 'Concurso público'}
DISCIPLINA: ${disciplina}
TÓPICO: ${topicoNumero ? `${topicoNumero} - ` : ''}${topicoNome}

DATA ATUAL: ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
IMPORTANTE: Use apenas informações atualizadas até esta data. Verifique se há leis, decretos ou regulamentos recentes que possam afetar o conteúdo.

� VERIFICAÇÃO DE FONTES - OBRIGATÓRIO:
- Para CADA lei, decreto ou norma jurídica mencionada nas questões, VERIFIQUE a atualidade usando as ferramentas disponíveis
- Para CADA jurisprudência citada, VERIFIQUE se está vigente e atualizada
- Use as ferramentas de Function Calling para buscar em APIs oficiais (Senado, Datajud/CNJ)
- Sempre busque de fontes confiáveis: TJ,STF,LEI(E SUAS ATUALIZAÇÕES, NÃO PEGUE NADA ANTIGO OU DESATUALIZADO), GRAN CURSOS, QCONCURSOS, CONTEÚDOS JURÍDICOS, SITES DO PLANALTO, ENTENDIMENTOS ETC EM MATÉRIAS DE DIREITO... O FOCO É SEMPRE SER ATUALIZADO!

��🚨🚨 BANCA EXAMINADORA - OBRIGATÓRIO 🚨🚨🚨
BANCA DEFINIDA: ${banca || 'NÃO DEFINIDA'}
- ADAPTE TODAS AS QUESTÕES ao estilo da banca "${banca || 'NÃO DEFINIDA'}"
- Se a banca for INSTITUTO AOCP: questões de múltipla escolha diretas (A, B, C, D, E), interpretação literal
- Se a banca for FGV: questões contextualizadas, análise crítica, interpretação de texto
- Se a banca for CESPE/CEBRASPE: assertivas C/E (Certo/Errado), interpretação constitucional
- Se a banca for FCC: questões de múltipla escolha (A, B, C, D, E), legislação atualizada
- Se a banca for VUNESP: questões contextualizadas, análise crítica, interpretação de texto
- SEJA FIEL À BANCA DEFINIDA ACIMA

${editalText ? `CONTEXTO DO EDITAL:\n${editalText.substring(0, 12000)}\n\n` : ''}

**MODO HACKER DOS CONCURSOS**

1. **RAIO-X DE PROBABILIDADE**:
   - Top Assuntos Quentes: Gere questões focadas nos tópicos com maior probabilidade de cair NO CONCURSO ${courseName || 'Concurso público'}
   - O Padrão da Banca: Como a banca ${banca || 'NÃO DEFINIDA'} costuma cobrar este tópico especificamente no concurso

2. **QUESTÕES PREDITIVAS**:
   - Gere EXATAMENTE 50 questões para este tópico
   - No estilo da banca ${banca || 'NÃO DEFINIDA'} (A, B, C, D, E ou Certo/Errado)
   - Contextualizadas com o concurso ${courseName || 'Concurso público'}
   - Gabarito Comentado: explique o porquê das outras estarem erradas
   - **USE FORMATAÇÃO RICA no gabarito**: Use **negrito** para resposta correta, *itálico* para explicações, e formatação visual para destacar pontos importantes
   - **NÃO ECONOMIZE TEXTO**: Seja detalhado e completo nas explicações, mas não excessivamente extenso

3. **CONTEÚDO ESPECÍFICO**:
   - Conteúdo específico para o concurso — nada genérico, LETRA de lei
   - Não invente nada, seja literal e fiel a matéria com fontes firmes
   - Se for direito gere as questões de acordo com a lei sem inventar nada, seja fiel a lei
   - Não invente nada, seja direto nas questões e com conteúdo fiel.
   - Linguagem formal, nível concurso público
   - 🚨 BANCA EXAMINADORA: Use EXCLUSIVAMENTE o estilo da banca "${banca || 'NÃO DEFINIDA'}"

FORMATO JSON (apenas JSON válido):
{
  "questoes": [
    {
      "enunciado": "texto da questão",
      "alternativas": ["A", "B", "C", "D", "E"],
      "gabarito": "A",
      "comentario": "explicação detalhada"
    }
  ]
}

REGRAS:
- Seja ESPECÍFICO do concurso ${courseName || 'Concurso público'}
- Cite o nome do concurso nas questões
- Retorne APENAS o JSON válido, sem texto adicional
- NÃO use caracteres de markdown (como **, *, •, __, ~~, \` etc.) nos textos`

  const tools = prepareGeminiTools()
  const response = await callGeminiWithRetry(prompt, {
    maxRetries: 3,
    baseDelay: 2000,
    models: ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'],
    generationConfig: { temperature: 0.7, maxOutputTokens: 32000 },
    useGoogleSearch: true,
    useFunctionCalling: true,
    tools: tools,
  })

  const parsed = await extractJsonFromResponse(response)

  const items = parsed.questoes || []
  if (!items.length) {
    throw new Error('Nenhuma questão gerada pela IA')
  }

  console.log(`✅ ${items.length} questões geradas para o tópico "${topicKey}"`)

  const batch = writeBatch(db)
  const questoesRef = collection(db, 'courses', resolvedId, 'questoes')
  const saved = []

  items.forEach((item, index) => {
    const docRef = doc(questoesRef)
    const payload = {
      disciplina: disciplina || '',
      topico: topicoNome || '',
      topicoNumero: topicoNumero || '',
      modulo: modulo || '',
      topicKey: topicKey || '',
      enunciado: item.enunciado || '',
      alternativas: item.alternativas || [],
      gabarito: item.gabarito || '',
      comentario: item.comentario || '',
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
