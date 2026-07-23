import { readEnv, isDevEnv } from '@/lib/env.js'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { collection, doc, getDoc, getDocs, query, where, limit, setDoc, serverTimestamp, orderBy, deleteDoc } from 'firebase/firestore'
import { ArrowLeftIcon, FireIcon, CheckCircleIcon, XCircleIcon, TrashIcon, QuestionMarkCircleIcon, ChartBarIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import ShareItemButton from '../components/share/ShareItemButton'
import { FEED_POST_TYPES } from '../services/trilhaFeedService'
import ReactMarkdown from 'react-markdown'
import { db } from '../firebase/config'
import { useDarkMode } from '../hooks/useDarkMode.jsx'
import { useAuth } from '../hooks/useAuth'
import { useTopicCourseAccess } from '../hooks/useTopicCourseAccess'
import { formatAiErrorForUser } from '../utils/geminiApi'
import {
  buildQuestoesExamHeader,
  generateQuestoesInBatches,
} from '../utils/questoesGeneration'
import { appendVisualMediaAppendix } from '../utils/stemVisualContent'
import {
  createGenerationJob,
  updateGenerationJob,
  GENERATION_JOB_STATUS,
} from '../services/generationJobService'
import { incrementQuestoesStats } from '../utils/questoesStats'
import { isContentAvailable, toggleContentStatus, CONTENT_STATUS } from '../utils/contentStatus'
import ContentPublishButton from '../components/ContentPublishButton'
import ProfessorFlagNoteBanner, {
  scrollToFocusedContent,
} from '../components/content/ProfessorFlagNoteBanner'
import SmartTeacherPlayer from '../components/teacher/SmartTeacherPlayer'
import { useSmartTeacherQuestoes } from '../hooks/useSmartTeacherQuestoes'
import {
  findQuestaoIndexInList,
  parseNivelFromContentId,
} from '../utils/flagCorrectionLinks'
import {
  QuestoesLoading,
  QuestoesHeader,
  NivelSelector,
  QuestoesProgressBar,
  QuestaoEnunciadoCard,
  QuestaoAlternativas,
  QuestaoExplicacao,
  ResultadoDesempenho,
  resolveQuestaoExplicacao,
  resolveQuestaoGabarito,
} from '../components/QuestoesPraticaCP'
import { buildQuestaoContentId, buildLegacyQuestaoContentId } from '../utils/contentCommentIds'
import CommentComposer from '../components/content/CommentComposer'
import { sanitizeCommentForStorage } from '../utils/commentFormatUtils'

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
  const [topicoPublishStatus, setTopicoPublishStatus] = useState(CONTENT_STATUS.UNAVAILABLE)
  const desempenhoNivelInicial = useRef(false)
  const focusQuestaoApplied = useRef(false)

  const focusContentId = searchParams.get('focusContentId') || ''
  const focusNivelParam = Number(searchParams.get('nivel') || 0)
  const focusNivelFromId = parseNivelFromContentId(focusContentId)
  const focusNivel =
    (focusNivelParam >= 1 && focusNivelParam <= 10 ? focusNivelParam : null) ||
    focusNivelFromId ||
    null

  // Deep-link: fixa o nível antes de carregar o pack
  useEffect(() => {
    if (!focusNivel) return
    setNivelAtual(focusNivel)
    focusQuestaoApplied.current = false
  }, [focusNivel, focusContentId])

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
      const explicacao = resolveQuestaoExplicacao(questao).toLowerCase()
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

  const resolvedCourseId = useMemo(
    () => courseId || profile?.selectedCourseId || 'alego-default',
    [courseId, profile?.selectedCourseId]
  )
  const { canAccess: hasTopicAccess } = useTopicCourseAccess(resolvedCourseId, topicKey, profile)
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

        const topicoStatusRef = doc(db, 'courses', resolvedCourseId, 'topicoStatus', sanitizedKey)
        const topicoStatusDoc = await getDoc(topicoStatusRef)
        if (topicoStatusDoc.exists()) {
          setTopicoPublishStatus(topicoStatusDoc.data().status || CONTENT_STATUS.UNAVAILABLE)
        } else {
          setTopicoPublishStatus(CONTENT_STATUS.UNAVAILABLE)
        }

        if (user && !desempenhoNivelInicial.current) {
          // Deep-link da notificação: prioriza o nível do contentId
          if (focusNivel && focusNivel >= 1 && focusNivel <= 10) {
            setNivelAtual(focusNivel)
          } else {
            const desempenhoRef = doc(db, 'users', user.uid, 'desempenhoTopico', sanitizedKey)
            const desempenhoDoc = await getDoc(desempenhoRef)
            if (desempenhoDoc.exists()) {
              setNivelAtual(desempenhoDoc.data().nivel || 1)
            }
          }
          desempenhoNivelInicial.current = true
        }

        const niveisDisponiveis = []
        for (let i = 1; i <= 10; i++) {
          try {
            const nivelDocRef = doc(db, 'courses', resolvedCourseId, 'questoesTopico', `${sanitizedKey}_nivel_${i}`)
            const nivelDoc = await getDoc(nivelDocRef)
            if (nivelDoc.exists()) niveisDisponiveis.push(i)
          } catch {
            /* nível não publicado ou sem permissão */
          }
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
  }, [resolvedTopicKey, resolvedCourseId, user, focusNivel])

  // Deep-link: posiciona a questão corrigida após carregar o pack do nível
  useEffect(() => {
    if (!focusContentId || !questoesArray.length) return
    if (focusQuestaoApplied.current) return
    const idx = findQuestaoIndexInList(questoesArray, focusContentId)
    if (idx < 0) return
    setCurrentQuestionIndex(idx)
    focusQuestaoApplied.current = true
    const t = setTimeout(() => {
      scrollToFocusedContent(focusContentId)
    }, 450)
    return () => clearTimeout(t)
  }, [questoesArray, focusContentId, nivelAtual])

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
          const msg = err.message || String(err)
          if (msg.includes('Missing or insufficient permissions')) {
            setQuestoes(null)
            setError('')
          } else {
            setError('Erro ao carregar questões. Tente novamente.')
          }
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
    if (profile?.role !== 'admin') {
      setError('Apenas administradores podem gerar questões.')
      return false
    }
    const apiKey = readEnv('VITE_GEMINI_API_KEY')
    if (!apiKey) {
      setError('API Key não configurada.')
      return
    }

    let jobId = null
    try {
      setGenerating(true)
      setProgress(5)
      setError('')

      if (user?.uid) {
        jobId = await createGenerationJob({
          userId: user.uid,
          courseId: resolvedCourseId,
          jobType: 'questoes_topico',
          topicKey: resolvedTopicKey,
          metadata: { nivel: nivelAtual },
        })
        await updateGenerationJob(user.uid, jobId, {
          status: GENERATION_JOB_STATUS.RUNNING,
          message: `Gerando questões (nível ${nivelAtual})…`,
        })
      }

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

      // Determinar tipo de prova pela banca (CESPE/CEBRASPE = C/E; demais = A–E)
      const cargo = courseData.cargo || courseData.competition || concursoName || ''
      const examHeader = buildQuestoesExamHeader({
        banca,
        cargo,
        concursoName: concursoName || courseData.competition || courseName,
        courseName: courseName || courseData.name,
        competition: courseData.competition,
        nivel: courseData.nivel || courseData.escolaridade,
        area: courseData.area,
      })
      const { exam, tipoProva, tipoLabel, fidelityBlock, formatInstructions, schemaSnippet } =
        examHeader

      const buildBatchPrompt = ({ batchNumber, batches, count }) =>
        appendVisualMediaAppendix(
          `${fidelityBlock}
Você é um especialista em criar questões de concurso público para ESTE cargo e banca.

CONTEXTO:
- CURSO: ${courseName || 'Curso Preparatório'}
- CARGO: ${exam.cargo || 'NÃO DEFINIDO'}
- BANCA EXAMINADORA: ${exam.banca || 'NÃO DEFINIDA'}
- TIPO DE PROVA DA BANCA: ${tipoLabel}
- DISCIPLINA: ${contextoDisciplina?.disciplina || effectiveTopicNome || resolvedTopicKey}
- TÓPICO: ${effectiveTopicNome || resolvedTopicKey}
- NÍVEL DE PRÁTICA: ${nivelAtual} (1 básico → 10 avançado)
- LOTE: ${batchNumber}/${batches} — gere EXATAMENTE ${count} questões neste lote

EDITAL BASE (trecho relevante):
${editalText.substring(0, 6000)}${editalText.length > 6000 ? '\n\n[texto truncado...]' : ''}

${formatInstructions}

INSTRUÇÕES DE DIFICULDADE:
- Nível ${nivelAtual}: ${nivelAtual === 1 ? 'Questões básicas e diretas' : nivelAtual <= 3 ? 'Fácil a médio' : nivelAtual <= 6 ? 'Médio, com análise' : nivelAtual <= 8 ? 'Avançado' : 'Especialista'}
- Adapte ao cargo ${exam.cargo || 'do edital'} e ao estilo da banca ${exam.banca || 'indicada'}

TAREFA:
Gere EXATAMENTE ${count} questões no formato ${tipoLabel} para o tópico "${effectiveTopicNome || resolvedTopicKey}".
Varie os assuntos internos do tópico. Não repita enunciados.

Cada questão deve ter:
- Enunciado claro
${
  tipoProva === 'Certo/Errado'
    ? '- Gabarito C ou E (sem alternativas A–E)'
    : '- 5 alternativas A–E e gabarito com uma letra A–E'
}
- Explicação detalhada

ESTRUTURA DO JSON:
{
  "disciplina": "${contextoDisciplina?.disciplina || effectiveTopicNome || resolvedTopicKey}",
  "banca": "${exam.banca || 'NÃO DEFINIDA'}",
  "cargo": "${exam.cargo || 'NÃO DEFINIDO'}",
  "curso": "${courseName || 'Curso Preparatório'}",
  "topico": "${effectiveTopicNome || resolvedTopicKey}",
  "tipoProva": "${tipoLabel}",
  "nivel": ${nivelAtual},
  "questoes": [
    {
      "numero": 1,
      "assunto": "assunto específico do tópico",
      "probabilidade": 95,
      ${schemaSnippet}
    }
  ]
}

REGRAS:
- Fidelidade 100% à banca ${exam.banca || 'indicada'} e ao cargo ${exam.cargo || 'do edital'}
- Formato ${tipoLabel} — sem misturar com outro formato
- DATA ATUAL: ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
- Não invente leis/artigos; use apenas normas vigentes
- Retorne APENAS JSON válido`,
          contextoDisciplina?.disciplina || effectiveTopicNome || resolvedTopicKey,
          effectiveTopicNome || resolvedTopicKey,
          'questoes',
        )

      setProgress((prev) => Math.min(prev + 10, 40))
      console.log('🤖 [Questões Tópico] Gerando em lotes no formato', tipoLabel)
      const batchResult = await generateQuestoesInBatches({
        buildBatchPrompt,
        total: 50,
        batchSize: 10,
        examCtx: exam,
        aiOptions: {
          courseId: resolvedCourseId,
          isLegalContent: true,
          useRAG: false,
          trustedGeneration: true,
          useGoogleSearch: true,
          verifyContent: false,
        },
        onBatchProgress: async ({ batchNumber, batches, generated, total }) => {
          const pct = 40 + Math.round((generated / total) * 45)
          setProgress(Math.min(pct, 85))
          if (user?.uid && jobId) {
            await updateGenerationJob(user.uid, jobId, {
              status: GENERATION_JOB_STATUS.RUNNING,
              progress: pct,
              message: `Gerando questões lote ${batchNumber}/${batches} (${tipoLabel})…`,
            }).catch(() => {})
          }
        },
      })
      console.log(
        '✅ [Questões Tópico] Válidas:',
        batchResult.questoes.length,
        batchResult.dropped ? `(descartadas ${batchResult.dropped})` : '',
      )

      const questoesValidas = batchResult.questoes
      const parsed = {
        disciplina: contextoDisciplina?.disciplina || effectiveTopicNome || resolvedTopicKey,
        banca: exam.banca || 'NÃO DEFINIDA',
        cargo: exam.cargo || 'NÃO DEFINIDO',
        curso: courseName || 'Curso Preparatório',
        topico: effectiveTopicNome || resolvedTopicKey,
        tipoProva: tipoLabel,
        nivel: nivelAtual,
        dataGeracao: new Date().toLocaleDateString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
        questoes: questoesValidas,
      }

      const payload = {
        ...parsed,
        questoes: questoesValidas,
        topico: parsed.topico || effectiveTopicNome || resolvedTopicKey,
        nivel: nivelAtual,
        status:
          topicoPublishStatus === CONTENT_STATUS.AVAILABLE
            ? CONTENT_STATUS.AVAILABLE
            : CONTENT_STATUS.UNAVAILABLE,
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
      if (user?.uid && jobId) {
        await updateGenerationJob(user.uid, jobId, {
          status: GENERATION_JOB_STATUS.DONE,
          progress: 100,
          message: 'Questões geradas com sucesso.',
        })
      }
      return true
    } catch (err) {
      console.error('Erro ao gerar questões:', err)
      const message = err instanceof Error ? err.message : String(err)
      setError(message || 'Erro ao gerar questões.')
      if (user?.uid && jobId) {
        await updateGenerationJob(user.uid, jobId, {
          status: GENERATION_JOB_STATUS.ERROR,
          message,
        }).catch(() => {})
      }
      return false
    } finally {
      setGenerating(false)
      setLoading(false)
      setTimeout(() => setProgress(0), 800)
    }
  }

  const handleAnswer = (answer) => {
    if (!canPractice) return
    if (showResult) return
    
    setSelectedAnswer(answer)
    setShowResult(true)
    
    const currentQuestion = questoesArray[currentQuestionIndex]
    const isCorrect = answer === resolveQuestaoGabarito(currentQuestion)
    
    setAnswers([...answers, {
      questionIndex: currentQuestionIndex,
      selectedAnswer: answer,
      correctAnswer: resolveQuestaoGabarito(currentQuestion),
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

  const teacherGoNext = useCallback(() => {
    setCurrentQuestionIndex((i) => {
      const len = questoesParaExibir.length
      if (i < len - 1) {
        setSelectedAnswer(null)
        setShowResult(false)
        return i + 1
      }
      // última questão — desempenho no próximo tick
      setTimeout(() => {
        try {
          calcularDesempenho()
        } catch {
          /* ignore */
        }
      }, 0)
      return i
    })
  }, [questoesParaExibir.length])

  const teacherQuestoes = useSmartTeacherQuestoes({
    questoes: questoesParaExibir,
    currentIndex: currentQuestionIndex,
    tipoProva,
    selectedAnswer,
    showResult,
    onGoNext: teacherGoNext,
    deckTitle: effectiveTopicNome || resolvedTopicKey || '',
  })

  const handleNextQuestionBtn = () => {
    teacherQuestoes.stop()
    handleNextQuestion()
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
      courseId: resolvedCourseId,
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
    setNovoGabarito(resolveQuestaoGabarito(questaoAtual))
    setNovaExplicacao(resolveQuestaoExplicacao(questaoAtual))
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
      const explicacaoFormatada = sanitizeCommentForStorage(novaExplicacao)
      questoesAtualizadas[currentQuestionIndex] = {
        ...questaoAtual,
        respostaCorreta: novoGabarito,
        correta: novoGabarito,
        explicacao: explicacaoFormatada,
        gabaritoComentado: explicacaoFormatada,
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

  const canPractice =
    isAdmin ||
    (hasTopicAccess &&
      isContentAvailable(topicoPublishStatus, false) &&
      questoes &&
      isContentAvailable(questoes.status, false))

  const handleSkipQuestion = () => {
    if (!canPractice || showResult) return
    teacherQuestoes.stop()
    setSelectedAnswer(null)
    setShowResult(true)
  }

  const renderBloqueioAluno = () => (
    <div className="cp-card p-5 text-center sm:p-10">
      <QuestionMarkCircleIcon className="h-10 w-10 text-amber-600 dark:text-amber-400 mx-auto mb-3" />
      <p className="font-medium text-cp-text">Questões em preparação</p>
      <p className="mt-2 text-sm text-cp-muted">
        O administrador ainda não liberou as questões preditivas deste tópico.
      </p>
      <Link to="/edital-verticalizado" className="cp-btn-ghost mt-6 inline-flex justify-center">
        <ArrowLeftIcon className="h-4 w-4" />
        Voltar ao edital
      </Link>
    </div>
  )

  if (loading) {
    return <QuestoesLoading />
  }

  if (!questoes && error) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <Link to="/edital-verticalizado" className="inline-flex items-center gap-2 text-sm text-cp-muted hover:text-cp-accent transition">
          <ArrowLeftIcon className="h-4 w-4" />
          Voltar ao edital
        </Link>
        <div className="cp-card space-y-4 p-5 text-center sm:p-10">
          <QuestionMarkCircleIcon className="h-12 w-12 text-cp-muted mx-auto" />
          <h1 className="cp-headline text-xl">Questões não disponíveis</h1>
          <p className="text-sm text-cp-muted">{error}</p>
          {isAdmin && (
            <button type="button" onClick={handleGenerateQuestoes} disabled={generating} className="cp-btn-primary w-full justify-center">
              <FireIcon className="h-5 w-5" />
              {generating ? 'Gerando questões…' : 'Gerar questões'}
            </button>
          )}
        </div>
      </div>
    )
  }

  if (!isAdmin && !carregandoNivel && !canPractice && !desempenho) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <Link to="/edital-verticalizado" className="inline-flex items-center gap-2 text-sm text-cp-muted hover:text-cp-accent transition">
          <ArrowLeftIcon className="h-4 w-4" />
          Voltar ao edital
        </Link>
        <QuestoesHeader
          badge="Questões preditivas"
          title={effectiveTopicNome || resolvedTopicKey}
          subtitle={<>Nível <span className="font-mono text-cp-accent">{nivelAtual}</span>/10</>}
        />
        {renderBloqueioAluno()}
      </div>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <ProfessorFlagNoteBanner />
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


      <div className="cp-card p-4 sm:p-8">
          {carregandoNivel ? (
            <div className="py-12 text-center">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-cp-accent border-t-transparent" />
              <p className="mt-3 text-sm text-cp-muted">Carregando nível {nivelAtual}…</p>
            </div>
          ) : !desempenho ? (
            <div className="space-y-6">
              {!questoes ? (
                isAdmin ? (
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
                  renderBloqueioAluno()
                )
              ) : !canPractice ? (
                renderBloqueioAluno()
              ) : (
                <div className="space-y-6">
                  {/* Status do conteúdo para usuários */}
                  {profile?.role !== 'admin' && questoes && (
                    <div className="flex items-center gap-2">
                      <span className={`cp-badge ${canPractice ? 'cp-badge-accent' : ''}`}>
                        {canPractice ? 'Disponível' : 'Conteúdo pendente'}
                      </span>
                    </div>
                  )}

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
                              <button type="button" onClick={handleShareQuestao} className="cp-btn-ghost !p-2" title="Link de compartilhamento">
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
                          <ContentPublishButton
                            status={questoes?.status}
                            onToggle={handleToggleStatus}
                            hint="Use Liberar no edital para publicar tudo de uma vez."
                          />
                          <button type="button" onClick={handleDeleteQuestoes} disabled={deleting} className="cp-btn-ghost !text-xs !text-red-400">
                            <TrashIcon className="h-4 w-4" />
                            {deleting ? 'Apagando…' : 'Apagar'}
                          </button>
                        </div>
                      )}

                      {questoesParaExibir.length > 0 && (
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <div className="flex-1">
                            <QuestoesProgressBar
                              current={currentQuestionIndex}
                              total={questoesParaExibir.length}
                              extraLabel={termoBusca ? ` (${questoesArray.length} total)` : ''}
                            />
                          </div>
                          {questoesParaExibir[currentQuestionIndex] && (
                            <div className="flex shrink-0 items-center gap-1">
                              <button
                                type="button"
                                onClick={handlePesquisarGoogle}
                                className="noji-tool-btn"
                                title="Pesquisar no Google"
                              >
                                <MagnifyingGlassIcon className="h-4 w-4" />
                              </button>
                              <ShareItemButton
                                type="questao"
                                postType={FEED_POST_TYPES.QUESTOES}
                                materia={courseName || tipoProva}
                                assunto={effectiveTopicNome || resolvedTopicKey}
                                courseId={resolvedCourseId}
                                topicKey={resolvedTopicKey}
                                itemIndex={currentQuestionIndex}
                                questao={questoesParaExibir[currentQuestionIndex]}
                                shareUrl={`/questoes-topic/${resolvedCourseId}/${encodeURIComponent(resolvedTopicKey)}${effectiveTopicNome ? `?nome=${encodeURIComponent(effectiveTopicNome)}` : ''}`}
                                className="cp-btn-ghost !text-[10px] !py-1 shrink-0"
                                label="Compartilhar"
                              />
                            </div>
                          )}
                        </div>
                      )}

                      {questoesParaExibir[currentQuestionIndex] && (() => {
                        const questaoAtual = questoesParaExibir[currentQuestionIndex]
                        const enunciadoAtual = String(questaoAtual?.enunciado || '').trim()
                        const questaoIndexNoDeck = questoesArray.findIndex((q) => {
                          if (!q) return false
                          if (q === questaoAtual) return true
                          if (q.id && questaoAtual?.id && q.id === questaoAtual.id) return true
                          const en = String(q.enunciado || '').trim()
                          return en && enunciadoAtual && en === enunciadoAtual
                        })
                        const questionIndex =
                          questaoIndexNoDeck >= 0 ? questaoIndexNoDeck : currentQuestionIndex
                        const questaoContentId = buildQuestaoContentId({
                          topicKey: resolvedTopicKey,
                          nivel: nivelAtual,
                          questao: questaoAtual,
                          questionIndex,
                          packId: questoes?.id,
                        })
                        const legacyQuestaoContentId = buildLegacyQuestaoContentId({
                          topicKey: resolvedTopicKey,
                          nivel: nivelAtual,
                          questionIndex,
                          sanitizeTopicKey: sanitizeTopicKeyForFirestore,
                        })

                        return (
                        <div className="space-y-5">
                          {!modoAdminNavegacao && (
                            <SmartTeacherPlayer
                              supported={teacherQuestoes.supported}
                              status={teacherQuestoes.status}
                              phase={teacherQuestoes.phase}
                              thinkRemaining={teacherQuestoes.thinkRemaining}
                              settings={teacherQuestoes.settings}
                              updateSettings={teacherQuestoes.updateSettings}
                              selectedVoice={teacherQuestoes.selectedVoice}
                              availableVoices={teacherQuestoes.availableVoices}
                              error={teacherQuestoes.error}
                              onPlay={teacherQuestoes.play}
                              onPause={teacherQuestoes.pause}
                              onStop={teacherQuestoes.stop}
                            />
                          )}
                          <QuestaoEnunciadoCard
                            assunto={questaoAtual.assunto}
                            probabilidade={questaoAtual.probabilidade}
                            enunciado={questaoAtual.enunciado}
                            questionNumber={currentQuestionIndex + 1}
                            courseId={resolvedCourseId}
                            topicKey={resolvedTopicKey}
                            contentId={questaoContentId}
                            alternateContentIds={
                              legacyQuestaoContentId !== questaoContentId
                                ? [legacyQuestaoContentId]
                                : []
                            }
                            ilustracao={questaoAtual.ilustracao}
                            textoBase={questaoAtual.textoBase}
                          />

                          {!showResult && !modoAdminNavegacao ? (
                            <div className="space-y-3">
                              <QuestaoAlternativas
                                tipoProva={tipoProva}
                                questao={questoesParaExibir[currentQuestionIndex]}
                                showResult={showResult}
                                modoAdminNavegacao={modoAdminNavegacao}
                                selectedAnswer={selectedAnswer}
                                onAnswer={handleAnswer}
                              />
                              <button
                                type="button"
                                onClick={handleSkipQuestion}
                                className="cp-btn-ghost w-full justify-center !text-sm"
                              >
                                Pular e ver explicação →
                              </button>
                            </div>
                          ) : (
                            <>
                              <QuestaoAlternativas
                                tipoProva={tipoProva}
                                questao={questoesParaExibir[currentQuestionIndex]}
                                showResult
                                modoAdminNavegacao={modoAdminNavegacao}
                                selectedAnswer={selectedAnswer}
                                onAnswer={handleAnswer}
                              />
                              <QuestaoExplicacao
                                explicacao={resolveQuestaoExplicacao(questoesParaExibir[currentQuestionIndex])}
                                editSlot={
                                  editandoQuestao ? (
                                    <div className="mb-4 space-y-3">
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
                                        <CommentComposer
                                          value={novaExplicacao}
                                          onChange={setNovaExplicacao}
                                          placeholder="Explicação formatada (negrito, grifar, fórmulas)…"
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
                                    <button type="button" onClick={handleIniciarEdicao} className="mb-3 text-xs text-cp-accent hover:underline">
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
                                  <button type="button" onClick={handleNextQuestionBtn} className="cp-btn-primary flex-1 justify-center">
                                    {currentQuestionIndex < questoesParaExibir.length - 1 ? 'Próxima →' : 'Ver resultado'}
                                  </button>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                        )
                      })()}
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
                  <p className="text-sm text-emerald-700 dark:text-emerald-400">
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
                            hist.aproveitamento >= 70 ? 'text-emerald-700 dark:text-emerald-400' :
                            hist.aproveitamento >= 50 ? 'text-amber-700 dark:text-amber-400' :
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
                  <h4 className="font-mono text-[10px] uppercase text-amber-700 dark:text-amber-400 mb-3">Precisa revisar</h4>
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
