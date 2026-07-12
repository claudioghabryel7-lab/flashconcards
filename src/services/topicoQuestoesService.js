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
  if (!hasGeminiApiKeys()) {
    throw new Error('Nenhuma API key Gemini configurada (VITE_GEMINI_API_KEY ou backups)')
  }

  // Carregar dados do curso para obter a banca examinadora
  const resolvedId = courseId || 'alego-default'
  const courseRef = doc(db, 'courses', resolvedId)
  const courseDoc = await getDoc(courseRef)
  const courseData = courseDoc.exists() ? courseDoc.data() : {}
  const banca = courseData.banca || ''

  const modulo = moduloLabel || formatTopicoAsModulo({ numero: topicoNumero, nome: topicoNome })

  // Função para gerar um lote de questões
  const generateBatch = async (batchNumber, totalBatches) => {
    const prompt = `Gere questões preditivas de "Véspera de Prova" para ESTE tópico específico de concurso público.

CURSO/CONCURSO: ${courseName || 'Concurso público'}
DISCIPLINA: ${disciplina}
TÓPICO: ${topicoNumero ? `${topicoNumero} - ` : ''}${topicoNome}
LOTE: ${batchNumber} de ${totalBatches} (gere 5 questões diferentes para este lote)

DATA ATUAL: ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
IMPORTANTE: Use apenas informações atualizadas até esta data. Verifique se há leis, decretos ou regulamentos recentes que possam afetar o conteúdo.

🔍 VERIFICAÇÃO DE FONTES - OBRIGATÓRIO:
- Para CADA lei, decreto ou norma jurídica mencionada nas questões, VERIFIQUE a atualidade usando Google Search
- Para CADA jurisprudência citada, VERIFIQUE se está vigente e atualizada
- Sempre busque de fontes confiáveis: TJ,STF,LEI(E SUAS ATUALIZAÇÕES, NÃO PEGUE NADA ANTIGO OU DESATUALIZADO), GRAN CURSOS, QCONCURSOS, CONTEÚDOS JURÍDICOS, SITES DO PLANALTO, ENTENDIMENTOS ETC EM MATÉRIAS DE DIREITO... O FOCO É SEMPRE SER ATUALIZADO!

🚨 PROIBIÇÃO ABSOLUTA DE ALUCINAÇÃO DE LEIS: É expressamente proibido inventar, supor ou criar números de leis, decretos ou emendas (especialmente com o ano corrente de 2026). Toda e qualquer lei citada deve ser um fato histórico real e amplamente consolidado. Na dúvida sobre o número exato da alteração, cite apenas o artigo principal da lei base (ex: 'conforme o Artigo 19 da Lei nº 11.340/2006') em vez de inventar uma lei modificadora.

🚨🚨🚨 BANCA EXAMINADORA - OBRIGATÓRIO 🚨🚨🚨
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
   - Gere EXATAMENTE 5 questões para este lote
   - No estilo da banca ${banca || 'NÃO DEFINIDA'} (A, B, C, D, E ou Certo/Errado)
   - Contextualizadas com o concurso ${courseName || 'Concurso público'}
   - Gabarito Comentado: explique o porquê das outras estarem erradas
   - Use texto limpo sem markdown (apenas tags HTML simples como <b> e <i> se necessário)
   - Seja detalhado e completo nas explicações

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
      "analiseJuridicaPrevia": "Artigo, lei ou jurisprudência específica citada (texto literal com fonte)",
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
- Preencha "analiseJuridicaPrevia" PRIMEIRO com o artigo/lei/jurisprudência literal antes de escrever o enunciado
- Retorne APENAS o JSON válido, sem texto adicional
- ${AI_TEXT_FORMAT_RULES}
- Separe parágrafos no enunciado e no comentário com linha em branco`

    const parsed = await generateAiJson(prompt, { courseId })
    const items = parsed.questoes || []
    
    if (!items.length) {
      throw new Error('Nenhuma questão gerada pela IA no lote ' + batchNumber)
    }

    console.log(`✅ Lote ${batchNumber}: ${items.length} questões geradas`)
    return items
  }

  // Gerar 10 lotes paralelos de 5 questões cada (total 50 questões)
  const totalBatches = 10
  const batchPromises = []
  
  for (let i = 1; i <= totalBatches; i++) {
    batchPromises.push(generateBatch(i, totalBatches))
  }

  console.log(`🚀 Gerando ${totalBatches} lotes paralelos de questões...`)
  const allBatches = await Promise.all(batchPromises)
  
  // Combinar todos os lotes em um único array
  const allQuestoes = allBatches.flat()
  console.log(`✅ Total de ${allQuestoes.length} questões geradas para o tópico "${topicKey}"`)

  const batch = writeBatch(db)
  const questoesRef = collection(db, 'courses', resolvedId, 'questoes')
  const saved = []

  allQuestoes.forEach((item, index) => {
    const docRef = doc(questoesRef)
    const payload = {
      disciplina: disciplina || '',
      topico: topicoNome || '',
      topicoNumero: topicoNumero || '',
      modulo: modulo || '',
      topicKey: topicKey || '',
      enunciado: sanitizeQuestaoText(item.enunciado || ''),
      alternativas: sanitizeQuestaoAlternativas(item.alternativas || []),
      gabarito: item.gabarito || '',
      comentario: sanitizeQuestaoText(item.comentario || ''),
      analiseJuridicaPrevia: sanitizeQuestaoText(item.analiseJuridicaPrevia || ''),
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
