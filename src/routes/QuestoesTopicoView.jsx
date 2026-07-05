import { readEnv, isDevEnv } from '@/lib/env.js'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { collection, doc, getDoc, getDocs, query, where, limit, setDoc, serverTimestamp, orderBy, deleteDoc } from 'firebase/firestore'
import { ArrowLeftIcon, FireIcon, CheckCircleIcon, XCircleIcon, TrashIcon, QuestionMarkCircleIcon, ChartBarIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import ReactMarkdown from 'react-markdown'
import { db } from '../firebase/config'
import { useDarkMode } from '../hooks/useDarkMode.jsx'
import { useAuth } from '../hooks/useAuth'
import { callGeminiWithRetry, extractGeneratedText } from '../utils/geminiApi'
import { incrementQuestoesStats } from '../utils/questoesStats'
import { isContentAvailable, toggleContentStatus } from '../utils/contentStatus'
import ContentPublishButton from '../components/ContentPublishButton'
import {
  QuestoesLoading,
  QuestoesHeader,
  NivelSelector,
  QuestoesProgressBar,
  QuestaoEnunciadoCard,
  QuestaoAlternativas,
  QuestaoExplicacao,
  ResultadoDesempenho,
} from '../components/QuestoesPraticaCP'

// Função para gerar chave estável do tópico (mesma do EditalVerticalizado)
const makeTopicKey = (topico) => {
  if (!topico) return ''
  const numero = (topico.numero || '').toString().trim()
  const nome = (topico.nome || '').toString().trim()

  if (!numero && !nome) return ''
  if (!numero || !nome) {
    const base = numero || nome
    return encodeURIComponent(base)
  }

  const combined = `${numero} :: ${nome}`
  return encodeURIComponent(combined)
}

// Função para extrair contexto hierárquico do edital
const extractContextFromEdital = (editalData, topicoKey) => {
  if (!editalData?.disciplinas || !topicoKey) return null
  
  // Buscar em todas as disciplinas pelo tópico
  for (const disciplina of editalData.disciplinas) {
    if (!disciplina.topicos) continue
    
    const topico = disciplina.topicos.find(t => {
      const topicKey = makeTopicKey(t)
      return topicKey === topicoKey || 
             t.nome === topicoKey || 
             t.numero === topicoKey
    })
    
    if (topico) {
      return {
        disciplina: disciplina.nome || 'Disciplina não identificada',
        topico: topico.nome || topico.numero || 'Tópico não identificado',
        topicoNumero: topico.numero || '',
        curso: '' // Será preenchido depois
      }
    }
  }
  
  return null
}

const normalizeKey = (text = '') => {
  return decodeURIComponent(text || '').trim()
}

// Sanitiza o topicKey para ser usado como ID de documento no Firestore
const sanitizeTopicKeyForFirestore = (topicKey = '') => {
  if (!topicKey) return ''
  
  // Decodificar primeiro se estiver codificado
  let decoded = topicKey
  try {
    decoded = decodeURIComponent(topicKey)
  } catch (e) {
    decoded = topicKey
  }
  
  // Substituir apenas caracteres problemáticos que o Firestore interpreta como separadores
  let sanitized = decoded
    .replace(/::/g, '_DOUBLECOLON_')
    .replace(/\//g, '_SLASH_')
    .replace(/\\/g, '_BACKSLASH_')
    .trim()
  
  // Limitar tamanho
  if (sanitized.length > 400) {
    sanitized = sanitized.substring(0, 400)
  }
  
  // Se após sanitização ficar vazio, criar um hash simples
  if (!sanitized || sanitized.trim() === '') {
    const hash = topicKey.split('').reduce((acc, char) => {
      return ((acc << 5) - acc) + char.charCodeAt(0)
    }, 0)
    return 'topic_' + Math.abs(hash).toString(36)
  }
  
  return sanitized
}

// Função reversa para buscar documentos: tenta encontrar por topicKey sanitizado ou original
const findDocumentByTopicKey = async (courseId, topicKey) => {
  // Tentar com a chave sanitizada primeiro
  const sanitizedKey = sanitizeTopicKeyForFirestore(topicKey)
  try {
    const sanitizedRef = doc(db, 'courses', courseId, 'questoesTopico', sanitizedKey)
    const sanitizedDoc = await getDoc(sanitizedRef)
    if (sanitizedDoc.exists()) {
      return { id: sanitizedDoc.id, ...sanitizedDoc.data() }
    }
  } catch (e) {
    // Ignorar erro se a chave sanitizada for inválida
  }
  
  // Tentar com a chave original (para compatibilidade com documentos antigos)
  if (!topicKey.includes('::') && !topicKey.includes('/') && !topicKey.includes('\\')) {
    try {
      const originalRef = doc(db, 'courses', courseId, 'questoesTopico', topicKey)
      const originalDoc = await getDoc(originalRef)
      if (originalDoc.exists()) {
        return { id: originalDoc.id, ...originalDoc.data() }
      }
    } catch (e) {
      // Ignorar erro se a chave original for inválida
    }
  }
  
  return null
}

// Extrai partes estruturadas da chave do tópico
const parseTopicKey = (rawKey = '') => {
  const key = normalizeKey(rawKey)
  if (!key) return { numero: '', nome: '', raw: '' }

  const [numeroPart, ...rest] = key.split('::')
  if (rest.length === 0) {
    const trimmed = numeroPart.trim()
    const isNumericLike = /^\d+(\.\d+)*$/.test(trimmed)
    return {
      numero: isNumericLike ? trimmed : '',
      nome: isNumericLike ? '' : trimmed,
      raw: trimmed,
    }
  }

  const numero = numeroPart.trim()
  const nome = rest.join('::').trim()
  return { numero, nome, raw: key }
}

const QuestoesTopicoView = () => {
  const { courseId, topicKey } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { darkMode } = useDarkMode()
  const { user, profile } = useAuth()
  const [questoes, setQuestoes] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [courseName, setCourseName] = useState('')
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState(0)
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [selectedAnswer, setSelectedAnswer] = useState(null)
  const [showResult, setShowResult] = useState(false)
  const [answers, setAnswers] = useState([])
  const [desempenho, setDesempenho] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [nivelAtual, setNivelAtual] = useState(1)
  const [niveisDisponiveis, setNiveisDisponiveis] = useState([])
  const [mostrarSeletorNiveis, setMostrarSeletorNiveis] = useState(false)
  const [historicoNiveis, setHistoricoNiveis] = useState([])
  const [editandoQuestao, setEditandoQuestao] = useState(false)
  const [novoGabarito, setNovoGabarito] = useState('')
  const [novaExplicacao, setNovaExplicacao] = useState('')
  const [salvandoEdicao, setSalvandoEdicao] = useState(false)
  const [modoAdminNavegacao, setModoAdminNavegacao] = useState(false)
  const [termoBusca, setTermoBusca] = useState('')
  const [carregandoNivel, setCarregandoNivel] = useState(false)
  const desempenhoNivelInicial = useRef(false)

  const todosNiveis = useMemo(() => Array.from({ length: 10 }, (_, i) => i + 1), [])

  // Verificar se as questões têm a estrutura nova ou antiga
  const questoesArray = useMemo(() => {
    if (!questoes) return []
    // Estrutura nova: questoes.questoes
    if (questoes.questoes && Array.isArray(questoes.questoes)) {
      return questoes.questoes
    }
    // Estrutura antiga: questoes.questoesPreditivas
    if (questoes.questoesPreditivas && Array.isArray(questoes.questoesPreditivas)) {
      return questoes.questoesPreditivas
    }
    return []
  }, [questoes])

  // Questões filtradas por busca
  const questoesFiltradas = useMemo(() => {
    if (!termoBusca) return questoesArray
    const termo = termoBusca.toLowerCase()
    return questoesArray.filter((questao) => {
      const enunciado = (questao.enunciado || '').toLowerCase()
      const assunto = (questao.assunto || '').toLowerCase()
      const explicacao = (questao.explicacao || questao.gabaritoComentado || '').toLowerCase()
      return enunciado.includes(termo) || assunto.includes(termo) || explicacao.includes(termo)
    })
  }, [questoesArray, termoBusca])

  // Índice da questão atual nas questões filtradas
  const questoesParaExibir = modoAdminNavegacao && termoBusca ? questoesFiltradas : questoesArray
  const indiceQuestaoAtual = modoAdminNavegacao && termoBusca 
    ? questoesArray.indexOf(questoesParaExibir[currentQuestionIndex]) 
    : currentQuestionIndex

  const tipoProva = useMemo(() => {
    if (!questoes) return 'Múltipla Escolha'
    return questoes.tipoProva || 'Múltipla Escolha'
  }, [questoes])

  const resolvedCourseId = useMemo(() => courseId || 'alego-default', [courseId])
  const resolvedTopicKey = useMemo(() => normalizeKey(topicKey), [topicKey])
  const { numero: topicNumeroFromKey, nome: topicNomeFromKey } = useMemo(
    () => parseTopicKey(topicKey),
    [topicKey]
  )
  const topicNomeFromQuery = useMemo(
    () => normalizeKey(searchParams.get('nome') || ''),
    [searchParams]
  )

  const effectiveTopicNome = topicNomeFromQuery || topicNomeFromKey

  // Carregar nome do curso
  useEffect(() => {
    const loadCourseName = async () => {
      try {
        const courseDoc = await getDoc(doc(db, 'courses', resolvedCourseId))
        if (courseDoc.exists()) {
          const data = courseDoc.data()
          setCourseName(data.name || data.competition || 'Curso Preparatório')
        } else {
          setCourseName('Curso Preparatório')
        }
      } catch (err) {
        console.error('Erro ao carregar nome do curso:', err)
        setCourseName('Curso Preparatório')
      }
    }

    if (resolvedCourseId && db) {
      loadCourseName()
    }
  }, [resolvedCourseId])

  useEffect(() => {
    const loadMeta = async () => {
      if (!resolvedTopicKey || !resolvedCourseId) {
        setError('Questões não encontradas')
        setLoading(false)
        return
      }

      const trimmedKey = resolvedTopicKey.trim()
      if (!trimmedKey) {
        setError('Tópico inválido: identificação do tópico está vazia')
        setLoading(false)
        return
      }

      try {
        const sanitizedKey = sanitizeTopicKeyForFirestore(trimmedKey)

        if (user && !desempenhoNivelInicial.current) {
          const desempenhoRef = doc(db, 'users', user.uid, 'desempenhoTopico', sanitizedKey)
          const desempenhoDoc = await getDoc(desempenhoRef)
          if (desempenhoDoc.exists()) {
            setNivelAtual(desempenhoDoc.data().nivel || 1)
          }
          desempenhoNivelInicial.current = true
        }

        const niveisDisponiveis = []
        for (let i = 1; i <= 10; i++) {
          const nivelDocRef = doc(db, 'courses', resolvedCourseId, 'questoesTopico', `${sanitizedKey}_nivel_${i}`)
          const nivelDoc = await getDoc(nivelDocRef)
          if (nivelDoc.exists()) niveisDisponiveis.push(i)
        }
        setNiveisDisponiveis(niveisDisponiveis)

        if (user) {
          const historico = []
          for (let i = 1; i <= 10; i++) {
            const desempenhoNivelRef = doc(db, 'users', user.uid, 'desempenhoTopico', `${sanitizedKey}_nivel_${i}`)
            const desempenhoNivelDoc = await getDoc(desempenhoNivelRef)
            if (desempenhoNivelDoc.exists()) {
              historico.push({ nivel: i, ...desempenhoNivelDoc.data() })
            }
          }
          setHistoricoNiveis(historico)
        }
      } catch (err) {
        console.error('Erro ao carregar metadados do tópico:', err)
      }
    }

    loadMeta()
  }, [resolvedTopicKey, resolvedCourseId, user])

  useEffect(() => {
    if (!resolvedTopicKey || !resolvedCourseId) {
      setLoading(false)
      return
    }

    const trimmedKey = resolvedTopicKey.trim()
    if (!trimmedKey) {
      setLoading(false)
      return
    }

    let cancelled = false

    const loadQuestoesNivel = async () => {
      setCarregandoNivel(true)
      setQuestoes(null)
      setError('')
      setCurrentQuestionIndex(0)
      setSelectedAnswer(null)
      setShowResult(false)
      setAnswers([])

      try {
        const sanitizedKey = sanitizeTopicKeyForFirestore(trimmedKey)
        const docId = `${sanitizedKey}_nivel_${nivelAtual}`
        const questoesRef = doc(db, 'courses', resolvedCourseId, 'questoesTopico', docId)
        const questoesDoc = await getDoc(questoesRef)

        if (cancelled) return

        if (questoesDoc.exists()) {
          setQuestoes({ id: questoesDoc.id, ...questoesDoc.data() })
        } else if (nivelAtual === 1) {
          const foundDoc = await findDocumentByTopicKey(resolvedCourseId, trimmedKey)
          if (!cancelled && foundDoc) setQuestoes(foundDoc)
        }
      } catch (err) {
        console.error('Erro ao carregar questões do nível:', err)
        if (!cancelled) {
          setError('Erro ao carregar questões. Tente novamente.')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
          setCarregandoNivel(false)
        }
      }
    }

    loadQuestoesNivel()
    return () => {
      cancelled = true
    }
  }, [resolvedTopicKey, resolvedCourseId, nivelAtual])

  const handleGenerateQuestoes = async () => {
    if (!resolvedCourseId || !resolvedTopicKey) return false
    const apiKey = readEnv('VITE_GEMINI_API_KEY')
    if (!apiKey) {
      setError('API Key não configurada.')
      return
    }

    try {
      setGenerating(true)
      setProgress(5)
      setError('')

      // Carregar edital e prompt unificado para contexto
      const editalRef = doc(db, 'courses', resolvedCourseId, 'prompts', 'edital')
      console.log('🔍 Buscando edital em:', editalRef.path)
      console.log('📋 courseId usado:', resolvedCourseId)
      const editalDoc = await getDoc(editalRef)
      console.log('📄 Edital existe?', editalDoc.exists())
      const editalData = editalDoc.exists() ? editalDoc.data() : {}
      console.log('📊 Dados do edital:', editalData)
      const editalText = (editalData.pdfText || editalData.prompt || '').toString()
      console.log('📝 Tamanho do editalText:', editalText.length)

      // Carregar dados do curso para obter a banca examinadora
      const courseRef = doc(db, 'courses', resolvedCourseId)
      const courseDoc = await getDoc(courseRef)
      const courseData = courseDoc.exists() ? courseDoc.data() : {}
      const banca = courseData.banca || ''

      // Carregar edital verticalizado para extrair contexto da disciplina
      let editalVerticalizado = null
      try {
        const editalVerticalRef = doc(db, 'courses', resolvedCourseId, 'editalVerticalizado', 'principal')
        const editalVerticalDoc = await getDoc(editalVerticalRef)
        if (editalVerticalDoc.exists()) {
          const data = editalVerticalDoc.data()

          if (data.temPartes && data.totalPartes > 1) {
            const partesRef = collection(db, 'courses', resolvedCourseId, 'editalVerticalizado', 'principal', 'partes')
            const partesSnapshot = await getDocs(query(partesRef, orderBy('parte')))

            const todasDisciplinas = [...(data.disciplinas || [])]
            partesSnapshot.forEach((doc) => {
              const parteData = doc.data()
              if (parteData.disciplinas && Array.isArray(parteData.disciplinas)) {
                todasDisciplinas.push(...parteData.disciplinas)
              }
            })

            editalVerticalizado = {
              ...data,
              disciplinas: todasDisciplinas,
            }
          } else {
            editalVerticalizado = data
          }
        }
      } catch (err) {
        console.warn('Erro ao carregar edital verticalizado para contexto:', err)
      }

      if (!editalText || editalText.trim().length === 0) {
        throw new Error('Edital não encontrado para este curso. Gere o edital primeiro.')
      }

      const unifiedRef = doc(db, 'courses', resolvedCourseId, 'prompts', 'unified')
      const unifiedDoc = await getDoc(unifiedRef)
      const unifiedData = unifiedDoc.exists() ? unifiedDoc.data() : {}
      const concursoName = unifiedData.concursoName || ''
      setProgress(25)

      // Extrair contexto hierárquico do edital
      let contextoDisciplina = null
      if (editalVerticalizado) {
        contextoDisciplina = extractContextFromEdital(editalVerticalizado, resolvedTopicKey)
        if (contextoDisciplina) {
          contextoDisciplina.curso = courseName || concursoName || 'Curso Preparatório'
        }
      }

      // Determinar tipo de prova baseado na banca
      const bancasCertoErrado = ['CESPE', 'CEBRASPE', 'FCC', 'VUNESP', 'FGV', 'IBFC', 'AOCP', 'CONSULPAM', 'FUNRIO', 'NUCEPE', 'QUADRIX', 'IDECAN']
      const tipoProva = bancasCertoErrado.some(b => banca.toUpperCase().includes(b)) ? 'Certo/Errado' : 'Múltipla Escolha'

      const prompt = `Você é um especialista em criar questões de concurso público baseadas em análise de incidência para um tópico específico.

CONTEXTO:
- CURSO: ${courseName || 'Curso Preparatório'}
- CARGO: ${courseData.cargo || courseData.competition || 'NÃO DEFINIDO'}
- BANCA EXAMINADORA: ${banca || 'NÃO DEFINIDA'}
- TIPO DE PROVA: ${tipoProva}
- DISCIPLINA: ${contextoDisciplina?.disciplina || effectiveTopicNome || resolvedTopicKey}
- TÓPICO: ${effectiveTopicNome || resolvedTopicKey}
- NÍVEL DE PRÁTICA: ${nivelAtual} (de 1 a 10, onde 1 é básico e 10 é avançado)

EDITAL BASE (trecho relevante para este tópico):
${editalText.substring(0, 8000)}${editalText.length > 8000 ? '\n\n[texto truncado...]' : ''}

INSTRUÇÕES SOBRE DIFICULDADE POR NÍVEL:
- Nível ${nivelAtual}: ${nivelAtual === 1 ? 'Questões básicas e diretas, foco em conceitos fundamentais' : nivelAtual <= 3 ? 'Questões de nível fácil a médio, com aplicação de conceitos básicos' : nivelAtual <= 6 ? 'Questões de nível médio, exigindo análise e interpretação' : nivelAtual <= 8 ? 'Questões de nível avançado, com casos complexos e detalhados' : 'Questões de nível especialista, com nuances jurídicas profundas e casos excepcionais'}
- Aumente progressivamente a dificuldade conforme o nível
- Nos níveis mais altos, inclua casos práticos, jurisprudência recente e questões de concursos anteriores

TAREFA:
Gere EXATAMENTE 50 questões de ${tipoProva} para o tópico "${effectiveTopicNome || resolvedTopicKey}".

INSTRUÇÕES CRÍTICAS - DISTRIBUIÇÃO DE QUESTÕES:
- Identifique os principais assuntos dentro deste tópico
- Distribua as questões entre os assuntos identificados
- Gere questões variadas cobrindo diferentes aspectos do tópico
- Gere EXATAMENTE 50 questões (nem mais, nem menos)

INSTRUÇÕES SOBRE TIPO DE PROVA:
${tipoProva === 'Certo/Errado' ? `
- Use formato Certo/Errado (C ou E)
- Cada questão deve ter um enunciado que pode ser Certo ou Errado
- Resposta deve ser "C" (Certo) ou "E" (Errado)
- Explicação deve detalhar POR QUE é certo ou errado
` : `
- Use formato Múltipla Escolha (A, B, C, D, E)
- Cada questão deve ter 5 alternativas
- Resposta deve ser uma das letras (A, B, C, D, E)
- Explicação deve detalhar a resposta correta
`}

INSTRUÇÕES GERAIS:
1. Use o estilo da banca ${banca || 'NÃO DEFINIDA'}
2. Cada questão deve ter:
   - Enunciado claro e direto
   ${tipoProva === 'Certo/Errado' ? `
   - Alternativa correta: "C" (Certo) ou "E" (Errado)
   ` : `
   - 5 alternativas (A, B, C, D, E)
   - Alternativa correta indicada
   `}
   - Explicação detalhada da resposta
3. Adapte o nível de dificuldade ao cargo ${courseData.cargo || courseData.competition || 'NÃO DEFINIDO'}
4. Gere EXATAMENTE 50 questões (nem mais, nem menos)
5. Para cada questão, identifique o assunto específico dentro do tópico
6. Atribua uma probabilidade de incidência (80-100% para assuntos centrais, 50-70% para assuntos importantes, 10-40% para assuntos secundários)

ESTRUTURA DO JSON:
{
  "disciplina": "${contextoDisciplina?.disciplina || effectiveTopicNome || resolvedTopicKey}",
  "banca": "${banca || 'NÃO DEFINIDA'}",
  "cargo": "${courseData.cargo || courseData.competition || 'NÃO DEFINIDO'}",
  "curso": "${courseName || 'Curso Preparatório'}",
  "topico": "${effectiveTopicNome || resolvedTopicKey}",
  "tipoProva": "${tipoProva}",
  "nivel": ${nivelAtual},
  "dataGeracao": "${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}",
  "questoes": [
    {
      "numero": 1,
      "assunto": "nome do assunto específico dentro do tópico",
      "probabilidade": 95,
      "enunciado": "texto da questão",
      ${tipoProva === 'Certo/Errado' ? `
      "respostaCorreta": "C",
      ` : `
      "alternativas": {
        "A": "texto da alternativa A",
        "B": "texto da alternativa B",
        "C": "texto da alternativa C",
        "D": "texto da alternativa D",
        "E": "texto da alternativa E"
      },
      "respostaCorreta": "A",
      `}
      "explicacao": "explicação detalhada da resposta correta"
    }
  ]
}

🚨 INSTRUÇÃO CRÍTICA - CONTEÚDO ATUALIZADO:
VOCÊ ESTÁ GERANDO CONTEÚDO AGORA, NA DATA ATUAL: ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
- PENSE: "Vou gerar agora de acordo com atualizações verídicas da data atual (${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })})"
- USE APENAS INFORMAÇÕES ATUALIZADAS E VIGENTES ATÉ ESTA DATA
- VERIFIQUE SE HOUVE ALTERAÇÕES RECENTES NAS LEIS, DECRETOS OU NORMAS
- NÃO USE INFORMAÇÕES DESATUALIZADAS OU REVOGADAS
- CITE SEMPRE A DATA DE ATUALIZAÇÃO QUANDO NECESSÁRIO

📅 CRONOLOGIA TEMPORAL OBRIGATÓRIA:
- Para CADA lei, decreto ou norma mencionada nas questões, você DEVE traçar uma cronologia desde sua criação até a data atual
- Exemplo: "Lei X, criada em 01/01/2000, alterada em 15/03/2010 pela Lei Y, modificada em 20/06/2015 pelo Decreto Z, atualizada em 10/02/2020 pela Medida Provisória W, vigente até ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}"
- Liste TODAS as alterações relevantes: leis, decretos, medidas provisórias, emendas constitucionais, súmulas, jurisprudências
- Sempre indique a data de cada alteração e o instrumento que a causou
- Se a lei foi revogada, indique a data de revogação e o instrumento que a revogou
- Mantenha as questões atualizadas considerando TODAS as alterações até a data atual

🚨 TRAVAS DE SEGURANÇA E FIDELIDADE JURÍDICA ABSOLUTA:

1. PROIBIÇÃO DE ALUCINAÇÃO LEGISLATIVA:
- Você está terminantemente proibido de inventar, supor ou estimar números de leis, decretos ou datas. Se não houver registro histórico exato e pacificado no ordenamento jurídico brasileiro de uma alteração, você NÃO deve mencioná-la.
- Nenhuma alteração futura hipotética deve ser criada. Toda e qualquer norma citada deve ter como lastro o portal do Planalto (Legislação Federal) ou os repositórios oficiais do STF/STJ.

2. FILTRO DE CONSTITUCIONALIDADE E RECEPÇÃO (CF/88):
- Para cada artigo ou código anterior a 1988 (como o CPP de 1941 ou o CP de 1940), você DEVE verificar se o dispositivo foi RECECIONADO ou NÃO pela Constituição Federal de 1988.
- É terminantemente proibido indicar como aplicável ou vigente um dispositivo legal que os Tribunais Superiores (STF/STJ) já declararam como não-recepcionado ou inconstitucional (Ex: Incomunicabilidade do preso do Art. 21 do CPP, prisão por dívida de depositário infiel, etc.). Você deve apontar o dispositivo e declarar imediatamente a sua ineficácia jurídica atual por incompatibilidade constitucional.

3. ALINHAMENTO OBRIGATÓRIO DE JURISPRUDÊNCIA PACIFICADA (STF/STJ):
- Toda análise legal deve confrontar a "letra fria da lei" com o entendimento atualizado das Súmulas Vinculantes, Súmulas do STF/STJ e os julgamentos de repercussão geral ou controle concentrado (ADIs, ADC, ADPFs).
- Se a eficácia de um artigo foi alterada, suspensa ou modelada por decisão definitiva do STF (como ocorreu no arquivamento do Art. 28 do CPP e no Juiz das Garantias), o texto DEVE refletir o procedimento determinado pelo Tribunal, e não a redação literal suspensa ou defasada que consta no código.

[TRAVA JURÍDICA CRÍTICA]: O modelo deve validar obrigatoriamente as inovações legislativas mais recentes (incluindo leis de 2025 e 2026), aplicando seus reflexos automáticos nos códigos e legislações pertinentes.

🧠 CHAIN OF THOUGHT COM AUTO-REFUTAÇÃO EMBUTIDA - OBRIGATÓRIO

[PROCESSO DE PENSAMENTO INTERNO - NÃO EXIBA ISSO NA SAÍDA FINAL]
Para cada questão que você criar, você DEVE seguir OBRIGATORIAMENTE este processo de pensamento interno ANTES de gerar o conteúdo:

1. FAÇA UM RASCUNHO MENTAL dos pontos principais da lei/norma solicitada
2. QUESTIONE-SE RIGOROSAMENTE: "Estou inventando algum número de lei para os anos de 2025/2026? Estou inventando algum artigo que não existe no código/norma?"
3. SE PERCEBER QUE ESTÁ PRESTES A CITAR UM NÚMERO DE LEI FICTÍCIO para conceitos reais, PARE, REMOVA o número inventado e cite apenas o conceito doutrinário/jurisprudencial correto ou mencione que está em debate/reforma legislativa real, SEM INVENTAR DADOS
4. GARANTA QUE NÃO OMITIU alterações reais e históricas importantes
5. VERIFIQUE: "Esta lei/artigo foi recepcionado pela CF/88? Foi declarado inconstitucional pelo STF?"
6. VERIFIQUE: "A jurisprudência citada está atualizada? Houve alguma decisão recente do STF/STJ que alterou o entendimento?"
7. AUDITE-SE: "Todas as datas e números de leis citados são historicamente exatos e verificáveis?"

SÓ DEPOIS DE CONCLUIR ESTE PROCESSO DE VERIFICAÇÃO INTERNA, PROSSIGA PARA A GERAÇÃO DA QUESTÃO.

[DIRETRIZES DE SAÍDA - O QUE EXIBIR]
Gere questões de múltipla escolha com:
- Enunciados específicos e técnicos
- Alternativas plausíveis e bem elaboradas
- Gabarito comentado fundamentado estritamente na lei real vigente
- Se você não tiver certeza absoluta de um número de lei recente, cite o conceito técnico sem inventar o número do decreto
🔍 VERIFICAÇÃO DE FONTES - OBRIGATÓRIO:
- Para CADA lei, decreto ou norma jurídica mencionada, VERIFIQUE a atualidade usando as ferramentas disponíveis
- Para CADA jurisprudência citada, VERIFIQUE se está vigente e atualizada
- Use as ferramentas de Function Calling para buscar em APIs oficiais (Senado, Datajud/CNJ)
- Sempre busque de fontes confiáveis: TJ,STF,LEI(E SUAS ATUALIZAÇÕES, NÃO PEGUE NADA ANTIGO OU DESATUALIZADO), GRAN CURSOS, QCONCURSOS, CONTEÚDOS JURÍDICOS, SITES DO PLANALTO, ENTENDIMENTOS ETC EM MATÉRIAS DE DIREITO... O FOCO É SEMPRE SER ATUALIZADO!
 Atualizações até o ano de agora ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })} até o exato momento
Sempre verifique atualizações de acordo com a data hora em ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })} , nunca dê conteúdo desatualizado... sempre atualizado. Verifique a veracidade da fonte em useGoogleSearch.
DATA ATUAL: ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
IMPORTANTE: Use apenas informações atualizadas até esta data. Verifique se há leis, decretos ou regulamentos recentes que possam afetar o conteúdo.

REGRAS IMPORTANTES:
- Adapte o estilo ao da banca ${banca || 'NÃO DEFINIDA'}
- Seja específico e técnico nas questões
- Para disciplinas jurídicas: cite leis, artigos e jurisprudência
- Para disciplinas não jurídicas: foque em conceitos e aplicações práticas
- DATA ATUAL: ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
- Use apenas informações atualizadas até esta data
- GERE EXATAMENTE 50 QUESTÕES

⚠️ REGRAS CRÍTICAS PARA JSON VÁLIDO:
- NÃO use aspas duplas (") dentro das strings de alternativas ou enunciados. Use aspas simples (')
- NÃO use quebras de linha (\n) dentro das strings. Use espaço normal
- NÃO use caracteres especiais que possam quebrar o JSON (como \, /, etc)
- O JSON deve ser 100% válido e parseável

Retorne APENAS o JSON válido, sem texto adicional.`

      setProgress((prev) => Math.min(prev + 15, 70))
      console.log('🤖 [Questões Tópico] Iniciando geração com IA...')
      const response = await callGeminiWithRetry(prompt, {
        models: ['gemini-2.5-flash', 'gemini-2.5-pro'],
        generationConfig: { temperature: 0.7, maxOutputTokens: 32000 },
        useGoogleSearch: true,
      })

      const aiText = extractGeneratedText(response)
      console.log('📝 [Questões Tópico] Tamanho da resposta da IA:', aiText.length)
      setProgress(75)

      let jsonText = aiText
      if (jsonText.startsWith('```json')) {
        jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/```\n?/g, '').trim()
      }
      const jsonMatch = jsonText.match(/\{[\s\S]*\}/)
      if (jsonMatch) jsonText = jsonMatch[0]

      let parsed = null
      try {
        parsed = JSON.parse(jsonText)
        console.log('✅ [Questões Tópico] JSON parseado com sucesso')
        console.log('📊 [Questões Tópico] Número de questões geradas:', parsed.questoes?.length || 0)
      } catch (parseError) {
        console.error('Erro ao fazer parse do JSON:', parseError.message)
        console.error('JSON extraído:', jsonText)
        
        let fixedJson = jsonText
          .replace(/,\s*}/g, '}')
          .replace(/,\s*]/g, ']')
          .replace(/\n\s*\}/g, '}')
          .replace(/\n\s*\]/g, ']')
        
        try {
          parsed = JSON.parse(fixedJson)
          console.log('JSON corrigido com sucesso')
        } catch (fixError) {
          throw new Error(`JSON inválido mesmo após correção: ${fixError.message}`)
        }
      }

      const payload = {
        ...parsed,
        topico: parsed.topico || effectiveTopicNome || resolvedTopicKey,
        nivel: nivelAtual,
        status: 'indisponivel',
        updatedAt: serverTimestamp(),
        generatedAt: serverTimestamp(),
      }

      const sanitizedKey = sanitizeTopicKeyForFirestore(resolvedTopicKey)
      
      const docId = `${sanitizedKey}_nivel_${nivelAtual}`

      try {
        await setDoc(doc(db, 'courses', resolvedCourseId, 'questoesTopico', docId), payload, {
          merge: true,
        })
      } catch (saveError) {
        console.error('Erro ao salvar questões:', saveError)
        if (saveError.message?.includes('Missing or insufficient permissions')) {
          throw new Error('Erro de permissão ao salvar questões. Verifique as regras do Firebase.')
        }
        throw saveError
      }

      setQuestoes({ id: docId, ...payload })
      setNiveisDisponiveis((prev) =>
        prev.includes(nivelAtual) ? prev : [...prev, nivelAtual].sort((a, b) => a - b)
      )
      setError('')
      setProgress(100)
      return true
    } catch (err) {
      console.error('Erro ao gerar questões:', err)
      const message = err instanceof Error ? err.message : String(err)
      setError(message || 'Erro ao gerar questões.')
      return false
    } finally {
      setGenerating(false)
      setLoading(false)
      setTimeout(() => setProgress(0), 800)
    }
  }

  const handleAnswer = (answer) => {
    if (showResult) return
    
    setSelectedAnswer(answer)
    setShowResult(true)
    
    const currentQuestion = questoesArray[currentQuestionIndex]
    const isCorrect = answer === (currentQuestion?.respostaCorreta || currentQuestion?.correta)
    
    setAnswers([...answers, {
      questionIndex: currentQuestionIndex,
      selectedAnswer: answer,
      correctAnswer: currentQuestion?.respostaCorreta || currentQuestion?.correta,
      isCorrect,
      assunto: currentQuestion?.assunto || '',
      probabilidade: currentQuestion?.probabilidade || 0
    }])
  }

  const handleNextQuestion = () => {
    if (currentQuestionIndex < (questoesArray.length - 1)) {
      setCurrentQuestionIndex(currentQuestionIndex + 1)
      setSelectedAnswer(null)
      setShowResult(false)
    } else {
      calcularDesempenho()
    }
  }

  const calcularDesempenho = async () => {
    const totalQuestoes = answers.length
    const acertos = answers.filter(a => a.isCorrect).length
    const erros = totalQuestoes - acertos
    const aproveitamento = totalQuestoes > 0 ? Math.round((acertos / totalQuestoes) * 100) : 0
    
    const precisaRevisar = answers
      .filter(a => !a.isCorrect && a.probabilidade >= 70)
      .map(a => a.assunto)
    
    const totalQuestoesDisponiveis = questoesArray.length
    const completouNivel = totalQuestoes >= totalQuestoesDisponiveis
    const proximoNivel = completouNivel && nivelAtual < 10 ? nivelAtual + 1 : nivelAtual

    let disciplina = effectiveTopicNome || 'Geral'
    try {
      const editalVerticalRef = doc(db, 'courses', resolvedCourseId, 'editalVerticalizado', 'principal')
      const edSnap = await getDoc(editalVerticalRef)
      if (edSnap.exists()) {
        const ctx = extractContextFromEdital(edSnap.data(), resolvedTopicKey)
        if (ctx?.disciplina) disciplina = ctx.disciplina
      }
    } catch (_) {
      /* mantém fallback */
    }
    
    const desempenhoData = {
      totalQuestoes,
      acertos,
      erros,
      aproveitamento,
      precisaRevisar,
      respostas: answers,
      topicKey: resolvedTopicKey,
      disciplina,
      nivel: nivelAtual,
      completouNivel,
      proximoNivel,
      updatedAt: serverTimestamp()
    }
    
    setDesempenho(desempenhoData)
    
    if (user) {
      const sanitizedKey = sanitizeTopicKeyForFirestore(resolvedTopicKey)
      
      const desempenhoRef = doc(db, 'users', user.uid, 'desempenhoTopico', sanitizedKey)
      setDoc(desempenhoRef, desempenhoData, { merge: true })
      
      const desempenhoNivelRef = doc(db, 'users', user.uid, 'desempenhoTopico', `${sanitizedKey}_nivel_${nivelAtual}`)
      setDoc(desempenhoNivelRef, desempenhoData, { merge: true })

      if (totalQuestoes > 0) {
        await incrementQuestoesStats(user.uid, resolvedCourseId, disciplina, acertos, erros)
      }
    }
  }

  const handleRestart = () => {
    setCurrentQuestionIndex(0)
    setSelectedAnswer(null)
    setShowResult(false)
    setAnswers([])
    setDesempenho(null)
  }

  const handleDeleteQuestoes = async () => {
    if (!resolvedCourseId || !resolvedTopicKey) return

    if (!window.confirm('Tem certeza que deseja apagar as questões geradas deste tópico?')) {
      return
    }

    try {
      setDeleting(true)
      
      const sanitizedKey = sanitizeTopicKeyForFirestore(resolvedTopicKey)
      
      // Apagar todos os níveis
      for (let i = 1; i <= 10; i++) {
        const questoesRef = doc(db, 'courses', resolvedCourseId, 'questoesTopico', `${sanitizedKey}_nivel_${i}`)
        await deleteDoc(questoesRef)
      }

      setQuestoes(null)
      setNivelAtual(1)
      setCurrentQuestionIndex(0)
      setSelectedAnswer(null)
      setShowResult(false)
      setAnswers([])
      setDesempenho(null)
    } catch (error) {
      console.error('Erro ao apagar questões:', error)
      setError(`Erro ao apagar: ${error.message || 'Erro desconhecido'}`)
    } finally {
      setDeleting(false)
    }
  }

  const handleAvancarNivel = () => {
    if (desempenho?.completouNivel && desempenho?.proximoNivel > nivelAtual) {
      setNivelAtual(desempenho.proximoNivel)
      setQuestoes(null)
      setDesempenho(null)
      setCurrentQuestionIndex(0)
      setSelectedAnswer(null)
      setShowResult(false)
      setAnswers([])
    }
  }

  const handleMudarNivel = (novoNivel) => {
    if (novoNivel === nivelAtual) return
    setNivelAtual(novoNivel)
    setQuestoes(null)
    setError('')
    setDesempenho(null)
    setCurrentQuestionIndex(0)
    setSelectedAnswer(null)
    setShowResult(false)
    setAnswers([])
    setMostrarSeletorNiveis(false)
  }

  const handleIniciarEdicao = () => {
    const questaoAtual = questoesArray[currentQuestionIndex]
    setNovoGabarito(questaoAtual.respostaCorreta || questaoAtual.correta || '')
    setNovaExplicacao(questaoAtual.explicacao || questaoAtual.gabaritoComentado || '')
    setEditandoQuestao(true)
  }

  const handleSalvarEdicao = async () => {
    if (!questoes || !questoes.id) return
    
    // Verificar se é admin
    if (profile?.role !== 'admin') {
      alert('Apenas administradores podem editar questões')
      return
    }
    
    try {
      setSalvandoEdicao(true)
      
      const questaoAtual = questoesArray[currentQuestionIndex]
      const questoesAtualizadas = [...questoesArray]
      questoesAtualizadas[currentQuestionIndex] = {
        ...questaoAtual,
        respostaCorreta: novoGabarito,
        correta: novoGabarito,
        explicacao: novaExplicacao,
        gabaritoComentado: novaExplicacao
      }
      
      const sanitizedKey = sanitizeTopicKeyForFirestore(resolvedTopicKey)
      const docId = `${sanitizedKey}_nivel_${nivelAtual}`
      
      await setDoc(doc(db, 'courses', resolvedCourseId, 'questoesTopico', docId), {
        ...questoes,
        questoes: questoesAtualizadas
      }, { merge: true })
      
      setQuestoes({
        ...questoes,
        questoes: questoesAtualizadas
      })
      
      setEditandoQuestao(false)
    } catch (error) {
      console.error('Erro ao salvar edição:', error)
      alert('Erro ao salvar edição: ' + error.message)
    } finally {
      setSalvandoEdicao(false)
    }
  }

  const handleCancelarEdicao = () => {
    setEditandoQuestao(false)
    setNovoGabarito('')
    setNovaExplicacao('')
  }

  const handleToggleModoAdmin = () => {
    setModoAdminNavegacao(!modoAdminNavegacao)
    // Resetar estado quando mudar de modo
    setShowResult(modoAdminNavegacao ? false : true)
    setSelectedAnswer(null)
  }

  const handlePesquisarGoogle = () => {
    const questaoAtual = questoesParaExibir[currentQuestionIndex]
    if (!questaoAtual) return
    const searchQuery = encodeURIComponent(`${questaoAtual.enunciado} ${questaoAtual.assunto || ''}`)
    window.open(`https://www.google.com/search?q=${searchQuery}`, '_blank')
  }

  const handleToggleStatus = async () => {
    if (!questoes || !questoes.id) return
    
    try {
      const novoStatus = toggleContentStatus(questoes.status)
      const sanitizedKey = sanitizeTopicKeyForFirestore(resolvedTopicKey)
      const docId = `${sanitizedKey}_nivel_${nivelAtual}`
      
      await setDoc(doc(db, 'courses', resolvedCourseId, 'questoesTopico', docId), {
        ...questoes,
        status: novoStatus,
        updatedAt: serverTimestamp(),
      }, { merge: true })
      
      setQuestoes({
        ...questoes,
        status: novoStatus,
      })
    } catch (error) {
      console.error('Erro ao alterar status:', error)
      alert('Erro ao alterar status: ' + error.message)
    }
  }

  const handleShareQuestao = async () => {
    // Verificar se é admin
    if (profile?.role !== 'admin') {
      alert('Apenas administradores podem compartilhar questões')
      return
    }
    
    if (!questoes || !questoes.questoes || questoes.questoes.length === 0) {
      alert('Não há questões para compartilhar')
      return
    }
    
    try {
      const sharedQuestaoRef = doc(collection(db, 'sharedQuestoes'))
      const questaoId = sharedQuestaoRef.id
      
      await setDoc(sharedQuestaoRef, {
        id: questaoId,
        questoes: questoes.questoes,
        tipoProva: tipoProva,
        topico: effectiveTopicNome || resolvedTopicKey,
        courseId: resolvedCourseId,
        nivel: nivelAtual,
        totalQuestoes: questoes.questoes.length,
        sharedBy: profile?.email || 'admin',
        sharedAt: serverTimestamp(),
        status: 'ativo',
      })
      
      const shareUrl = `${window.location.origin}/share-questao/${questaoId}`
      
      // Copiar para clipboard
      await navigator.clipboard.writeText(shareUrl)
      alert(`Link copiado para a área de transferência!\n\n${questoes.questoes.length} questões compartilhadas.`)
    } catch (error) {
      console.error('Erro ao compartilhar questões:', error)
      alert('Erro ao compartilhar questões: ' + error.message)
    }
  }

  const handlePreviousQuestion = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1)
      setShowResult(modoAdminNavegacao)
      setSelectedAnswer(null)
    }
  }

  const isAdmin = profile?.role === 'admin'

  if (loading) {
    return <QuestoesLoading />
  }

  if (!questoes && error) {
    return (
      <div className="space-y-6">
        <Link to="/edital-verticalizado" className="inline-flex items-center gap-2 text-sm text-cp-muted hover:text-cp-accent transition">
          <ArrowLeftIcon className="h-4 w-4" />
          Voltar ao edital
        </Link>
        <div className="cp-card p-10 text-center space-y-4">
          <QuestionMarkCircleIcon className="h-12 w-12 text-cp-muted mx-auto" />
          <h1 className="cp-headline text-xl">Questões não disponíveis</h1>
          <p className="text-sm text-cp-muted">{error}</p>
          <button type="button" onClick={handleGenerateQuestoes} disabled={generating} className="cp-btn-primary w-full justify-center">
            <FireIcon className="h-5 w-5" />
            {generating ? 'Gerando questões…' : 'Gerar questões'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {courseName && (
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-cp-muted">{courseName}</p>
      )}

      <Link to="/edital-verticalizado" className="inline-flex items-center gap-2 text-sm text-cp-muted hover:text-cp-accent transition">
        <ArrowLeftIcon className="h-4 w-4" />
        Voltar ao edital
      </Link>

      <QuestoesHeader
        badge="Questões preditivas"
        title={effectiveTopicNome || resolvedTopicKey}
        subtitle={
          <>
            Nível <span className="font-mono text-cp-accent">{nivelAtual}</span>/10
            <button type="button" onClick={() => setMostrarSeletorNiveis(!mostrarSeletorNiveis)} className="ml-2 text-cp-accent hover:underline text-xs">
              (escolher nível{niveisDisponiveis.length > 0 ? ` · ${niveisDisponiveis.length} gerados` : ''})
            </button>
          </>
        }
      />

      {mostrarSeletorNiveis && (
        <NivelSelector
          niveis={todosNiveis}
          niveisComConteudo={niveisDisponiveis}
          nivelAtual={nivelAtual}
          onSelect={handleMudarNivel}
        />
      )}

      <div className="cp-card p-6 sm:p-8">
          {carregandoNivel ? (
            <div className="py-12 text-center">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-cp-accent border-t-transparent" />
              <p className="mt-3 text-sm text-cp-muted">Carregando nível {nivelAtual}…</p>
            </div>
          ) : !desempenho ? (
            <div className="space-y-6">
              {!questoes ? (
                <div className="space-y-6">
                  {/* Informações sobre a geração */}
                  <div className="cp-card !border-cp-accent/20 p-5 space-y-4">
                    <p className="font-mono text-[10px] uppercase text-cp-muted">Geração — nível {nivelAtual}</p>
                    <ul className="text-sm text-cp-muted space-y-1">
                      <li>• Questões específicas deste tópico</li>
                      <li>• 50 questões no estilo da banca</li>
                      <li>• Dificuldade progressiva por nível</li>
                    </ul>
                    <button type="button" onClick={handleGenerateQuestoes} disabled={generating} className="cp-btn-primary w-full justify-center">
                      <FireIcon className="h-5 w-5" />
                      {generating ? 'Gerando questões…' : 'Gerar questões'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Status do conteúdo para usuários */}
                  {profile?.role !== 'admin' && questoes && (
                    <div className="flex items-center gap-2">
                      <span className={`cp-badge ${questoes.status === 'disponivel' ? 'cp-badge-accent' : ''}`}>
                        {questoes.status === 'disponivel' ? 'Disponível' : 'Conteúdo pendente'}
                      </span>
                    </div>
                  )}

                  {/* Bloqueio de acesso para conteúdo indisponível */}
                  {!isAdmin && questoes && !isContentAvailable(questoes.status, isAdmin) ? (
                    <div className="cp-card p-8 text-center">
                      <QuestionMarkCircleIcon className="h-10 w-10 text-amber-400 mx-auto mb-3" />
                      <p className="font-medium text-cp-text">Questões em preparação</p>
                      <p className="mt-2 text-sm text-cp-muted">O administrador ainda não liberou este nível.</p>
                    </div>
                  ) : (
                    <>
                      {/* Botão de excluir para admin */}
                      {isAdmin && (
                        <div className="flex justify-between items-center gap-2 flex-wrap mb-4">
                          <button type="button" onClick={handleToggleModoAdmin} className={`cp-btn-ghost !text-xs ${modoAdminNavegacao ? '!border-cp-accent/40 !text-cp-accent' : ''}`}>
                            {modoAdminNavegacao ? 'Modo prática' : 'Modo navegação'}
                          </button>
                          {modoAdminNavegacao && (
                            <div className="flex items-center gap-2 flex-wrap">
                              <div className="relative">
                                <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-cp-muted" />
                                <input
                                  type="text"
                                  value={termoBusca}
                                  onChange={(e) => setTermoBusca(e.target.value)}
                                  placeholder="Buscar questões…"
                                  className="pl-9 pr-4 py-2 text-sm rounded-lg border border-cp-border bg-cp-bg/60 text-cp-text w-64"
                                />
                              </div>
                              <button type="button" onClick={handleShareQuestao} className="cp-btn-ghost !p-2" title="Compartilhar questão">
                                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                                </svg>
                              </button>
                              <button type="button" onClick={handlePesquisarGoogle} className="cp-btn-ghost !p-2" title="Pesquisar no Google">
                                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                              </button>
                              <select
                                value={nivelAtual}
                                onChange={(e) => handleMudarNivel(parseInt(e.target.value))}
                                className="rounded-lg border border-cp-border bg-cp-bg/60 px-3 py-2 text-sm text-cp-text"
                              >
                                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                                  <option key={n} value={n}>Nível {n}</option>
                                ))}
                              </select>
                              <button type="button" onClick={handleGenerateQuestoes} disabled={generating} className="cp-btn-primary !text-xs">
                                <FireIcon className="h-4 w-4" />
                                {generating ? 'Gerando…' : 'Gerar nível'}
                              </button>
                            </div>
                          )}
                          <ContentPublishButton status={questoes?.status} onToggle={handleToggleStatus} />
                          <button type="button" onClick={handleDeleteQuestoes} disabled={deleting} className="cp-btn-ghost !text-xs !text-red-400">
                            <TrashIcon className="h-4 w-4" />
                            {deleting ? 'Apagando…' : 'Apagar'}
                          </button>
                        </div>
                      )}

                      {questoesParaExibir.length > 0 && (
                        <QuestoesProgressBar
                          current={currentQuestionIndex}
                          total={questoesParaExibir.length}
                          extraLabel={termoBusca ? ` (${questoesArray.length} total)` : ''}
                        />
                      )}

                      {questoesParaExibir[currentQuestionIndex] && (
                        <div className="space-y-4">
                          <QuestaoEnunciadoCard
                            assunto={questoesParaExibir[currentQuestionIndex].assunto}
                            probabilidade={questoesParaExibir[currentQuestionIndex].probabilidade}
                            enunciado={questoesParaExibir[currentQuestionIndex].enunciado}
                          />

                          {!showResult && !modoAdminNavegacao ? (
                            <QuestaoAlternativas
                              tipoProva={tipoProva}
                              questao={questoesParaExibir[currentQuestionIndex]}
                              showResult={showResult}
                              modoAdminNavegacao={modoAdminNavegacao}
                              onAnswer={handleAnswer}
                            />
                          ) : (
                            <>
                              <QuestaoAlternativas
                                tipoProva={tipoProva}
                                questao={questoesParaExibir[currentQuestionIndex]}
                                showResult
                                modoAdminNavegacao={modoAdminNavegacao}
                                onAnswer={handleAnswer}
                              />
                              <QuestaoExplicacao
                                explicacao={
                                  questoesParaExibir[currentQuestionIndex].explicacao ||
                                  questoesParaExibir[currentQuestionIndex].gabaritoComentado
                                }
                                editSlot={
                                  editandoQuestao ? (
                                    <div className="space-y-3">
                                      <div>
                                        <label className="block text-xs font-medium text-cp-muted mb-1">Gabarito</label>
                                        <input
                                          type="text"
                                          value={novoGabarito}
                                          onChange={(e) => setNovoGabarito(e.target.value)}
                                          className="w-full rounded-lg border border-cp-border bg-cp-bg/60 px-3 py-2 text-sm text-cp-text"
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-xs font-medium text-cp-muted mb-1">Explicação</label>
                                        <textarea
                                          value={novaExplicacao}
                                          onChange={(e) => setNovaExplicacao(e.target.value)}
                                          rows={4}
                                          className="w-full rounded-lg border border-cp-border bg-cp-bg/60 px-3 py-2 text-sm text-cp-text resize-y"
                                        />
                                      </div>
                                      <div className="flex gap-2">
                                        <button type="button" onClick={handleSalvarEdicao} disabled={salvandoEdicao} className="cp-btn-primary !text-xs">
                                          {salvandoEdicao ? 'Salvando…' : 'Salvar'}
                                        </button>
                                        <button type="button" onClick={handleCancelarEdicao} className="cp-btn-ghost !text-xs">
                                          Cancelar
                                        </button>
                                      </div>
                                    </div>
                                  ) : isAdmin && !editandoQuestao ? (
                                    <button type="button" onClick={handleIniciarEdicao} className="text-xs text-cp-accent hover:underline mb-2">
                                      Editar explicação
                                    </button>
                                  ) : null
                                }
                              />
                              {(showResult || modoAdminNavegacao) && (
                                <div className="flex gap-3">
                                  {currentQuestionIndex > 0 && (
                                    <button type="button" onClick={handlePreviousQuestion} className="cp-btn-ghost flex-1 justify-center">
                                      ← Anterior
                                    </button>
                                  )}
                                  <button type="button" onClick={handleNextQuestion} className="cp-btn-primary flex-1 justify-center">
                                    {currentQuestionIndex < questoesParaExibir.length - 1 ? 'Próxima →' : 'Ver resultado'}
                                  </button>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              <ResultadoDesempenho desempenho={desempenho} />

              <div className="rounded-xl border border-cp-border/60 bg-cp-bg/40 p-4 space-y-2">
                <h4 className="font-mono text-[10px] uppercase text-cp-muted">Progresso de níveis</h4>
                <p className="text-sm text-cp-muted">
                  Nível atual: <span className="font-mono text-cp-accent">{desempenho.nivel}</span>/10
                </p>
                {desempenho.completouNivel && desempenho.proximoNivel > desempenho.nivel && (
                  <p className="text-sm text-emerald-400">
                    Você completou este nível. Pode avançar para o nível {desempenho.proximoNivel}.
                  </p>
                )}
              </div>

              {historicoNiveis.length > 0 && (
                <div className="rounded-xl border border-cp-border/60 bg-cp-bg/40 p-4">
                  <h4 className="font-mono text-[10px] uppercase text-cp-muted mb-3">Histórico por nível</h4>
                  <div className="space-y-2">
                    {historicoNiveis.map((hist) => (
                      <div key={hist.nivel} className="flex items-center justify-between text-sm">
                        <span className="text-cp-muted">Nível {hist.nivel}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-cp-muted">{hist.acertos}/{hist.totalQuestoes} acertos</span>
                          <span className={`font-mono ${
                            hist.aproveitamento >= 70 ? 'text-emerald-400' :
                            hist.aproveitamento >= 50 ? 'text-amber-400' :
                            'text-red-400'
                          }`}>
                            {hist.aproveitamento}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {desempenho.precisaRevisar?.length > 0 && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
                  <h4 className="font-mono text-[10px] uppercase text-amber-400 mb-3">Precisa revisar</h4>
                  <ul className="list-disc list-inside space-y-1">
                    {desempenho.precisaRevisar.map((assunto, idx) => (
                      <li key={idx} className="text-sm text-cp-muted">{assunto}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="pt-2 space-y-3">
                {desempenho.completouNivel && desempenho.proximoNivel > desempenho.nivel && (
                  <button type="button" onClick={handleAvancarNivel} className="cp-btn-primary w-full justify-center">
                    <ChartBarIcon className="h-5 w-5" />
                    Gerar mais 50 questões (nível {desempenho.proximoNivel})
                  </button>
                )}

                <button type="button" onClick={handleRestart} className="cp-btn-primary w-full justify-center">
                  <FireIcon className="h-5 w-5" />
                  Praticar novamente
                </button>

                {isAdmin && (
                  <button type="button" onClick={handleDeleteQuestoes} disabled={deleting} className="cp-btn-ghost w-full justify-center !text-red-400">
                    <TrashIcon className="h-5 w-5" />
                    {deleting ? 'Apagando…' : 'Apagar questões'}
                  </button>
                )}

                <Link to="/edital-verticalizado" className="cp-btn-ghost w-full justify-center">
                  <ArrowLeftIcon className="h-5 w-5" />
                  Voltar ao edital verticalizado
                </Link>
              </div>
            </div>
          )}
        </div>
    </div>
  )
}

export default QuestoesTopicoView
