import { doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase/config'

const BANCA_GUIDES = {
  aocp: `INSTITUTO AOCP: múltipla escolha (A–E), enunciados diretos, interpretação literal da lei, alternativas plausíveis e distintas.`,
  cebraspe: `CEBRASPE/CESPE: Certo ou Errado (C/E), assertivas precisas, pegadinhas em termos absolutos, foco constitucional e em detalhes do texto legal.`,
  cespe: `CESPE/CEBRASPE: Certo ou Errado (C/E), assertivas precisas, atenção a termos absolutos.`,
  fgv: `FGV: questões contextualizadas, interpretação de texto, análise crítica, enunciados longos, alternativas bem elaboradas.`,
  fcc: `FCC: múltipla escolha (A–E), legislação atualizada, cobrança objetiva de artigos de lei.`,
  vunesp: `VUNESP: contextualização, interpretação, casos práticos, enunciados médios a longos.`,
  ibfc: `IBFC: múltipla escolha ou C/E conforme edital; cobrança direta de lei e doutrina consolidada.`,
  consulplan: `CONSULPLAN: múltipla escolha objetiva, foco em literalidade legal.`,
  quadrix: `QUADRIX: múltipla escolha, questões objetivas e diretas.`,
  idecan: `IDECAN: múltipla escolha, estilo objetivo.`,
}

const AREA_DIFFICULTY_HINTS = {
  policial: 'DIFÍCIL — legislação penal/processual, jurisprudência STF/STJ, temas atuais (JG, pacotes anticrime).',
  juridica: 'EXTREMAMENTE DIFÍCIL — precisão literal de lei, súmulas, jurisprudência vinculante.',
  fiscal: 'DIFÍCIL — legislação tributária e contábil atualizada.',
  saude: 'MÉDIO a DIFÍCIL — conhecimentos específicos + legislação do SUS.',
  administrativa: 'MÉDIO — direito administrativo, licitações, CF/88.',
  tecnica: 'MÉDIO — conhecimentos específicos da área + língua portuguesa.',
  geral: 'MÉDIO — edital amplo, equilíbrio entre disciplinas.',
}

function normalizeBancaKey(banca = '') {
  return banca.toLowerCase().replace(/[^a-z0-9]/g, '')
}

export function getBancaStyleGuide(banca = '') {
  const key = normalizeBancaKey(banca)
  if (!key) return 'Banca não definida: use múltipla escolha objetiva e cite apenas legislação vigente com fonte.'
  for (const [pattern, guide] of Object.entries(BANCA_GUIDES)) {
    if (key.includes(pattern)) return guide
  }
  return `Banca "${banca}": adapte ao estilo oficial desta banca; priorize literalidade legal e alternativas bem fundamentadas.`
}

export function inferDifficultyLevel(courseData = {}) {
  const text = [
    courseData.competition,
    courseData.name,
    courseData.cargo,
    courseData.area,
    courseData.nivel,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  if (/stf|stj|mpu|magistrad|defensor|procurador/.test(text)) return AREA_DIFFICULTY_HINTS.juridica
  if (/polícia|pm|pc|pf|prf|penal|gcm|guarda/.test(text)) return AREA_DIFFICULTY_HINTS.policial
  if (/fiscal|contador|receita|tribut/.test(text)) return AREA_DIFFICULTY_HINTS.fiscal
  if (/saúde|enferm|médic|farmác/.test(text)) return AREA_DIFFICULTY_HINTS.saude
  if (/administrativ|analista|técnico judiciário/.test(text)) return AREA_DIFFICULTY_HINTS.administrativa
  if (/engenh|informática|ti\b|tecnólog/.test(text)) return AREA_DIFFICULTY_HINTS.tecnica
  return AREA_DIFFICULTY_HINTS.geral
}

export function buildCourseContextBlock(courseData = {}) {
  const banca = courseData.banca || ''
  const concurso = courseData.competition || courseData.name || 'Concurso público'
  const cargo = courseData.cargo || ''
  const hoje = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })

  return `═══ CONTEXTO DO CURSO (OBRIGATÓRIO) ═══
• Concurso/curso: ${concurso}
${cargo ? `• Cargo: ${cargo}` : ''}
• Banca examinadora: ${banca || 'NÃO DEFINIDA — peça confirmação ao admin'}
• Estilo da banca: ${getBancaStyleGuide(banca)}
• Nível de exigência: ${inferDifficultyLevel(courseData)}
• Data de referência: ${hoje} — use APENAS legislação e jurisprudência vigentes nesta data.

🚨 REGRAS JURÍDICAS (NÃO VIOLAR):
1. NUNCA cite artigo vetado, revogado ou projeto de lei como vigente.
2. NUNCA afirme suspensão de norma sem confirmar em fonte oficial (Planalto, STF, STJ).
3. Se não tiver certeza absoluta, escreva "verificar vigência" em vez de inventar.
4. Cite lei com número e ano reais (ex.: Lei nº 13.964/2019). Sem número inventado.
5. Juiz das Garantias e demais reformas: confirme status atual (vigente/suspenso/inconstitucional) antes de afirmar.
6. Adapte linguagem e formato ao estilo da banca ${banca || 'do edital'}, sem repetir o nome da banca em excesso no texto.

`
}

const contextCache = new Map()

export async function fetchCourseAiContext(courseId) {
  if (!courseId) return null
  const resolvedId = courseId === 'alego-default' ? courseId : courseId
  if (contextCache.has(resolvedId)) return contextCache.get(resolvedId)

  try {
    const snap = await getDoc(doc(db, 'courses', resolvedId))
    if (!snap.exists()) return null
    const data = { id: snap.id, ...snap.data() }

    if (!data.banca) {
      try {
        const unifiedSnap = await getDoc(doc(db, 'courses', resolvedId, 'prompts', 'unified'))
        if (unifiedSnap.exists()) {
          const unified = unifiedSnap.data()
          if (unified.banca) data.banca = unified.banca
          if (!data.competition && unified.concursoName) data.competition = unified.concursoName
        }
      } catch {
        // ignora fallback de prompts
      }
    }

    contextCache.set(resolvedId, data)
    return data
  } catch (err) {
    console.warn('fetchCourseAiContext:', err.message)
    return null
  }
}

export function buildPromptWithCourseContext(prompt, courseData) {
  if (!courseData) return prompt
  return `${buildCourseContextBlock(courseData)}${prompt}`
}
