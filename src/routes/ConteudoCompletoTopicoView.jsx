import { readEnv, isDevEnv } from '@/lib/env.js'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { collection, doc, getDoc, getDocs, query, where, limit, setDoc, serverTimestamp, orderBy } from 'firebase/firestore'
import { ArrowLeftIcon, PencilIcon, FireIcon, LightBulbIcon, ExclamationTriangleIcon, BookOpenIcon, ChevronDownIcon, ChevronUpIcon, CheckIcon, DocumentArrowDownIcon, ArrowPathIcon } from '@heroicons/react/24/outline'
import { db } from '../firebase/config'
import { useDarkMode } from '../hooks/useDarkMode.jsx'
import { useAuth } from '../hooks/useAuth'
import { generateAiJson, formatAiErrorForUser } from '../utils/geminiApi'
import {
  buildExamFidelityBlock,
  buildQuestaoJsonSchemaSnippet,
  buildTipoProvaInstructions,
  formatTipoProvaLabel,
  normalizeExamContext,
} from '../utils/examFidelityContext'
import {
  getConteudoCompletoDepthInstructions,
  ensureMaterialContentComplete,
  normalizeMaterialStructure,
  CONTEUDO_COMPLETO_DEPTH,
} from '../utils/contentDepthRules'
import { filterValidQuestoes } from '../utils/questoesQuality'
import { mapOrderedAlternativas } from '../utils/questaoAlternativas'
import {
  createGenerationJob,
  updateGenerationJob,
  GENERATION_JOB_STATUS,
} from '../services/generationJobService'
import { isContentAvailable, CONTENT_STATUS } from '../utils/contentStatus'
import SimpleMaterialEditor from '../components/SimpleMaterialEditor'
import { useTopicCourseAccess } from '../hooks/useTopicCourseAccess'
import ShareToFeedButton from '../components/feed/ShareToFeedButton'
import { FEED_POST_TYPES } from '../services/trilhaFeedService'
import ContentFeedbackActions from '../components/content/ContentFeedbackActions'
import ProfessorFlagNoteBanner from '../components/content/ProfessorFlagNoteBanner'
import { buildMaterialContentId } from '../utils/contentCommentIds'
import { stripHtml } from '../utils/htmlTextHelpers'
import ReactMarkdown from 'react-markdown'
import { downloadMaterialPdfFromElement } from '../utils/materialPdfExport'
import AudioReader from '../components/AudioReader'
import { buildMaterialSpeechScript } from '../utils/materialSpeechText'

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
// Remove/substitui caracteres que podem ser interpretados como separadores de caminho
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
  // :: -> _DOUBLECOLON_ (mais curto e ainda único)
  // / -> _SLASH_
  // \ -> _BACKSLASH_
  // Manter outros caracteres especiais que são seguros (parênteses, números, etc)
  let sanitized = decoded
    .replace(/::/g, '_DOUBLECOLON_')
    .replace(/\//g, '_SLASH_')
    .replace(/\\/g, '_BACKSLASH_')
    .trim()
  
  // Limitar tamanho (Firestore tem limite de 1500 bytes para IDs, mas IDs muito longos são problemáticos)
  // Manter até 400 caracteres para deixar margem de segurança
  if (sanitized.length > 400) {
    sanitized = sanitized.substring(0, 400)
  }
  
  // Se após sanitização ficar vazio ou contiver apenas caracteres inválidos, criar um hash simples
  if (!sanitized || sanitized.trim() === '') {
    // Criar um hash simples baseado no topicKey original
    const hash = topicKey.split('').reduce((acc, char) => {
      return ((acc << 5) - acc) + char.charCodeAt(0)
    }, 0)
    return 'topic_' + Math.abs(hash).toString(36)
  }
  
  return sanitized
}

// Função reversa para buscar documentos: tenta encontrar por topicKey sanitizado ou original
const findDocumentByTopicKey = async (courseId, topicKey) => {
  const tryRead = async (docId) => {
    const ref = doc(db, 'courses', courseId, 'conteudosCompletos', docId)
    try {
      const snap = await getDoc(ref)
      if (snap.exists()) {
        return { id: snap.id, ...snap.data() }
      }
    } catch (e) {
      if (e?.code === 'permission-denied') {
        return { locked: true }
      }
    }
    return null
  }

  const sanitizedKey = sanitizeTopicKeyForFirestore(topicKey)
  const fromSanitized = await tryRead(sanitizedKey)
  if (fromSanitized) return fromSanitized

  if (!topicKey.includes('::') && !topicKey.includes('/') && !topicKey.includes('\\')) {
    return tryRead(topicKey)
  }

  return null
}

// Extrai partes estruturadas da chave do tópico.
// Suporta tanto o formato antigo ("1", "Lei de Drogas ...")
// quanto o formato novo ("1 :: Lei de Drogas ...").
const parseTopicKey = (rawKey = '') => {
  const key = normalizeKey(rawKey)
  if (!key) return { numero: '', nome: '', raw: '' }

  const [numeroPart, ...rest] = key.split('::')
  if (rest.length === 0) {
    // Formato antigo: pode ser só número ou só nome
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

const ConteudoCompletoTopicoView = () => {
  const { courseId, topicKey } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { darkMode } = useDarkMode()
  const { user, profile, isAdmin } = useAuth()
  const [conteudo, setConteudo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [courseName, setCourseName] = useState('')
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState(0)
  const [regenMessage, setRegenMessage] = useState('')
  const [editingContent, setEditingContent] = useState(false)
  const [editDraft, setEditDraft] = useState(null)
  const [savingEdit, setSavingEdit] = useState(false)
  const [downloadingPdf, setDownloadingPdf] = useState(false)
  const pdfCaptureRef = useRef(null)

  // Função para registrar matéria estudada no calendário
  const registrarMateriaEstudada = async (materia) => {
    if (!user || !profile?.selectedCourseId) return
    
    try {
      const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD
      const courseKey = profile.selectedCourseId || 'alego'
      const progressDoc = doc(db, 'progress', `${user.uid}_${courseKey}_${today}`)
      
      // Verificar se já existe registro para hoje
      const existing = await getDoc(progressDoc)
      
      if (existing.exists()) {
        // Atualizar registro existente para adicionar matéria
        await setDoc(progressDoc, {
          ...existing.data(),
          materia: materia, // Adicionar/atualizar matéria
          lastUpdated: new Date().toTimeString(),
        }, { merge: true })
      } else {
        // Criar novo registro
        await setDoc(progressDoc, {
          uid: user.uid,
          date: today,
          hours: 0.1, // Mínimo para aparecer no calendário
          courseId: profile.selectedCourseId || null,
          materia: materia, // Adicionar matéria estudada
          lastUpdated: new Date().toTimeString(),
        })
      }
      
      console.log('✅ Matéria registrada no calendário:', materia)
    } catch (error) {
      console.error('Erro ao registrar matéria estudada:', error)
    }
  }

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

  // Substituir referências ao concurso pelo nome do curso
  const replaceConcursoWithCourse = (text) => {
    if (!text || !courseName) return text
    return text
      .replace(/Legislação Especial para o Concurso da [^<)]+/gi, `Legislação Especial para o ${courseName}`)
      .replace(/Câmara Municipal de [^<)]+/gi, courseName)
      .replace(/Concurso da Câmara Municipal de [^<)]+/gi, courseName)
      .replace(/Concurso público da [^<)]+/gi, courseName)
      .replace(/concurso público da [^<)]+/gi, courseName)
      .replace(/\s*\(Cargos?\s+\d+[^)]*\)/gi, '')
      .replace(/\s*\([^)]*Policial[^)]*\)/gi, '')
      .replace(/para os cargos [^<)]+/gi, `para o ${courseName}`)
      .replace(/para o cargo [^<)]+/gi, `para o ${courseName}`)
      .replace(/\s*-\s*[A-Z]{2}\s*/gi, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
  }

  useEffect(() => {
    const loadConteudo = async () => {
      if (!resolvedTopicKey || !resolvedCourseId) {
        setError('Conteúdo não encontrado')
        setLoading(false)
        return
      }

      // Validar que o topicKey não está vazio após decode
      const trimmedKey = resolvedTopicKey.trim()
      if (!trimmedKey || trimmedKey === '') {
        setError('Tópico inválido: identificação do tópico está vazia')
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        setError('')

        // 1) Tentar doc com ID = topicKey (forma mais segura e específica)
        // Validar que todos os segmentos estão presentes antes de criar a referência
        if (!resolvedCourseId || !trimmedKey) {
          throw new Error('Referência de documento inválida: faltam parâmetros necessários')
        }
        
        // Tentar encontrar documento usando função que sanitiza a chave
        const foundDoc = await findDocumentByTopicKey(resolvedCourseId, trimmedKey)
        if (foundDoc?.locked) {
          setConteudo({ status: CONTENT_STATUS.UNAVAILABLE, materia: effectiveTopicNome || trimmedKey })
          setLoading(false)
          return
        }
        if (foundDoc) {
          setConteudo(normalizeMaterialStructure(foundDoc))
          setLoading(false)
          return
        }

        // 2) Buscar por número do tópico (considerando possíveis duplicidades)
        const conteudosRef = collection(db, 'courses', resolvedCourseId, 'conteudosCompletos')

        const buildQuery = (...extra) =>
          isAdmin
            ? query(conteudosRef, ...extra)
            : query(conteudosRef, where('status', '==', CONTENT_STATUS.AVAILABLE), ...extra)

        const tryMatchFromSnapshot = (snap) => {
          if (snap.empty) return null

          // Se não tivermos nome alvo, volta o primeiro mesmo
          if (!effectiveTopicNome) {
            const docSnap = snap.docs[0]
            return { id: docSnap.id, ...docSnap.data() }
          }

          // Caso tenhamos o nome do tópico, tentamos achar o doc mais parecido
          const target = effectiveTopicNome.toLowerCase()

          // 1) Match exato em materia ou titulo
          const exact = snap.docs.find((d) => {
            const data = d.data() || {}
            const materia = (data.materia || '').toString().toLowerCase()
            const titulo = (data.titulo || '').toString().toLowerCase()
            return materia === target || titulo === target
          })
          if (exact) return { id: exact.id, ...exact.data() }

          // 2) Contém o texto do tópico
          const contains = snap.docs.find((d) => {
            const data = d.data() || {}
            const materia = (data.materia || '').toString().toLowerCase()
            const titulo = (data.titulo || '').toString().toLowerCase()
            return materia.includes(target) || titulo.includes(target)
          })
          if (contains) return { id: contains.id, ...contains.data() }

          // 3) Fallback: primeiro doc mesmo
          const first = snap.docs[0]
          return { id: first.id, ...first.data() }
        }

        if (topicNumeroFromKey) {
          const qNumero = buildQuery(where('numero', '==', topicNumeroFromKey), limit(10))
          const numeroSnap = await getDocs(qNumero)
          const matchedFromNumero = tryMatchFromSnapshot(numeroSnap)
          if (matchedFromNumero) {
            setConteudo(normalizeMaterialStructure(matchedFromNumero))
            setLoading(false)
            return
          }
        }

        // 3) Buscar por nome/matéria se tivermos essa informação
        if (effectiveTopicNome) {
          const qMateria = buildQuery(where('materia', '==', effectiveTopicNome), limit(10))
          const materiaSnap = await getDocs(qMateria)
          const matchedFromMateria = tryMatchFromSnapshot(materiaSnap)
          if (matchedFromMateria) {
            setConteudo(normalizeMaterialStructure(matchedFromMateria))
            setLoading(false)
            return
          }
        }

        setError('Chame o professor Flash, ele vai te mostrar o caminho. Aguarde até ele te entregar o conteúdo e não feche a página.')
        setLoading(false)
      } catch (err) {
        console.error('Não se preocupe, chame o professor Flash novamente e dará certo.', err)
        const errorMessage = err.message || String(err)
        
        // Tratar erros específicos do Firestore
        if (errorMessage.includes('Invalid document reference') || errorMessage.includes('even number of segments')) {
          setError('Erro: Tópico inválido. Por favor, verifique se o tópico possui identificação válida.')
        } else if (errorMessage.includes('Missing or insufficient permissions')) {
          setError('Erro de permissão. Por favor, verifique se você está autenticado e tente novamente.')
        } else {
          setError('Erro ao carregar conteúdo. Tente novamente.')
        }
        setLoading(false)
      }
    }

    loadConteudo()
  }, [resolvedTopicKey, resolvedCourseId, isAdmin, effectiveTopicNome, topicNumeroFromKey])

  // Registrar automaticamente a matéria estudada quando o conteúdo for carregado
  useEffect(() => {
    if (conteudo && conteudo.materia && !loading) {
      // Registrar a matéria no calendário com um pequeno delay para garantir que o componente esteja montado
      const timer = setTimeout(() => {
        registrarMateriaEstudada(conteudo.materia)
      }, 2000) // 2 segundos após carregar

      return () => clearTimeout(timer)
    }
  }, [conteudo, loading])

  /** Regenera o material sempre, sem validação prévia (somente admin). */
  const handleRegenerateContent = async () => {
    if (!isAdmin) return
    if (!resolvedCourseId || !resolvedTopicKey) return
    if (generating || editingContent) return

    setRegenMessage('Regenerando material…')
    const success = await handleGenerateContent()
    if (success) {
      setRegenMessage('Material regenerado com sucesso.')
    } else {
      setRegenMessage('Não foi possível regenerar o material. Tente novamente.')
    }
  }

  const handleDownloadPDF = async () => {
    if (!conteudo || downloadingPdf) return
    setDownloadingPdf(true)
    try {
      const el = pdfCaptureRef.current
      if (!el) throw new Error('Área do material não encontrada para exportar')
      await downloadMaterialPdfFromElement(el, {
        fileNameParts: [conteudo.materia, conteudo.titulo || resolvedTopicKey || 'topico'],
      })
    } catch (error) {
      console.error('Erro ao gerar PDF:', error)
      alert('Erro ao gerar PDF. Tente novamente.')
    } finally {
      setDownloadingPdf(false)
    }
  }

  const handleGenerateContent = async () => {
    if (!resolvedCourseId || !resolvedTopicKey) return false
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
          jobType: 'conteudo_completo',
          topicKey: resolvedTopicKey,
        })
        await updateGenerationJob(user.uid, jobId, {
          status: GENERATION_JOB_STATUS.RUNNING,
          message: 'Gerando conteúdo completo…',
        })
      }

      // Carregar edital e prompt unificado para contexto
      const editalRef = doc(db, 'courses', resolvedCourseId, 'prompts', 'edital')
      console.log('🔍 [ConteudoCompleto] Buscando edital em:', editalRef.path)
      console.log('📋 [ConteudoCompleto] courseId usado:', resolvedCourseId)
      const editalDoc = await getDoc(editalRef)
      console.log('📄 [ConteudoCompleto] Edital existe?', editalDoc.exists())
      const editalData = editalDoc.exists() ? editalDoc.data() : {}
      console.log('📊 [ConteudoCompleto] Dados do edital:', editalData)
      const editalText = (editalData.pdfText || editalData.prompt || '').toString()
      console.log('📝 [ConteudoCompleto] Tamanho do editalText:', editalText.length)

      // Carregar dados do curso para banca + cargo
      const courseRef = doc(db, 'courses', resolvedCourseId)
      const courseDoc = await getDoc(courseRef)
      const courseData = courseDoc.exists() ? courseDoc.data() : {}
      const banca = courseData.banca || ''
      const cargo = courseData.cargo || courseData.competition || ''

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
            partesSnapshot.forEach((docSnap) => {
              const parteData = docSnap.data()
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
      const concursoName = unifiedData.concursoName || courseData.competition || ''
      setProgress(25)

      let contextoDisciplina = null
      if (editalVerticalizado) {
        contextoDisciplina = extractContextFromEdital(editalVerticalizado, resolvedTopicKey)
        if (contextoDisciplina) {
          contextoDisciplina.curso = courseName || concursoName || 'Curso Preparatório'
        }
      }

      const exam = normalizeExamContext({
        banca,
        cargo,
        concursoName: concursoName || courseData.competition || courseName,
        courseName: courseName || courseData.name,
        competition: courseData.competition,
        nivel: courseData.nivel || courseData.escolaridade,
        area: courseData.area,
      })
      const tipoLabel = formatTipoProvaLabel(exam.tipoProva)
      const fidelityBlock = buildExamFidelityBlock(exam)
      const formatInstructions = buildTipoProvaInstructions(exam.tipoProva)
      const schemaSnippet = buildQuestaoJsonSchemaSnippet(exam.tipoProva, {
        includeExplicacao: false,
      })
      const depth = getConteudoCompletoDepthInstructions({
        banca: exam.banca,
        concursoName: exam.concursoName,
        courseName: exam.courseName,
        cargo: exam.cargo,
      })

      const prompt = `${fidelityBlock}
Você é um especialista em criar conteúdo técnico completo e ESPECÍFICO para concursos públicos.

CONTEXTO:
- CURSO: ${courseName || 'Curso Preparatório'}
- CONCURSO: ${exam.concursoName || 'NÃO DEFINIDO'}
- CARGO: ${exam.cargo || 'NÃO DEFINIDO'}
- BANCA: ${exam.banca || 'NÃO DEFINIDA'}
- TIPO DE PROVA: ${tipoLabel}
${contextoDisciplina ? `- DISCIPLINA: ${contextoDisciplina.disciplina}` : ''}
- TÓPICO: ${effectiveTopicNome || resolvedTopicKey}

EDITAL BASE (trecho relevante):
${editalText.substring(0, 8000)}${editalText.length > 8000 ? '\n\n[texto truncado...]' : ''}

${depth}

${formatInstructions}

REGRAS CRÍTICAS:
1. FOCO 100% no tópico "${effectiveTopicNome || resolvedTopicKey}"${contextoDisciplina ? ` da disciplina "${contextoDisciplina.disciplina}"` : ''}
2. Conteúdo específico para o CARGO ${exam.cargo || 'do edital'} e estilo da BANCA ${exam.banca || 'indicada'}
3. NÃO use o nome do curso como se fosse o cargo
4. Não invente leis/artigos; use apenas normas vigentes
5. NÃO corte o JSON — complete TODAS as seções (raio-X, revisão turbo, pegadinhas, questões)

TAREFA:
Gere material de "Véspera de Prova" completo para o tópico "${effectiveTopicNome || resolvedTopicKey}".

1. RAIO-X: exatamente ${CONTEUDO_COMPLETO_DEPTH.MIN_TOPICOS_QUENTES} top assuntos quentes + padrão da banca ${exam.banca || 'indicada'} (DETALHADO) para o cargo ${exam.cargo || 'do edital'}
2. REVISÃO TURBO: EXATAMENTE ${CONTEUDO_COMPLETO_DEPTH.MIN_TOPICOS_QUENTES} resumos PROFUNDOS (não genéricos), cada um com as 6 seções: Conceito, Base normativa, Distinções/exceções, Na prática da banca, Margens de dúvida, Dica
3. PEGADINHAS: 3–5 armadilhas típicas da banca
4. QUESTÕES PREDITIVAS: no formato ${tipoLabel} (gabarito comentado)

FORMATO JSON:
{
  "validacaoArtigo": "artigo/lei/jurisprudência base",
  "titulo": "Título do conteúdo",
  "materia": "${effectiveTopicNome || resolvedTopicKey}",
  "subtitulo": "Revisão estratégica — ${exam.cargo || exam.concursoName}",
  "numero": "${resolvedTopicKey}",
  "banca": "${exam.banca}",
  "cargo": "${exam.cargo}",
  "concurso": "${exam.concursoName}",
  "tipoProva": "${tipoLabel}",
  "raioXProbabilidade": {
    "topicosQuentes": ["assunto 1", "assunto 2", "assunto 3", "assunto 4", "assunto 5", "assunto 6"],
    "padraoBanca": "<h4>Como a banca cobra</h4><p>explicação detalhada da ${exam.banca} para ${exam.cargo}</p><h4>O que mais cai</h4><ul><li>...</li></ul><h4>Pegadinhas recorrentes</h4><ul><li>...</li></ul><h4>Exemplo típico</h4><p>...</p>"
  },
  "revisaoTurbo": [
    { "titulo": "assunto 1", "conteudo": "<h4>Conceito central</h4><p>...</p><h4>Base normativa</h4><p>...</p><h4>Distinções e exceções</h4><ul><li>...</li></ul><h4>Na prática da banca</h4><p>...</p><h4>Margens de dúvida</h4><ul><li><b>Dúvida:</b> ... <b>Resposta:</b> ...</li></ul><h4>Dica de memorização</h4><p>...</p>" },
    { "titulo": "assunto 2", "conteudo": "..." },
    { "titulo": "assunto 3", "conteudo": "..." },
    { "titulo": "assunto 4", "conteudo": "..." },
    { "titulo": "assunto 5", "conteudo": "..." },
    { "titulo": "assunto 6", "conteudo": "..." }
  ],
  "pegadinhas": [
    { "titulo": "Cuidado meu querido aluno!", "conteudo": "pegadinha da banca" }
  ],
  "questoesPreditivas": [
    {
      ${schemaSnippet},
      "gabaritoComentado": "explicação detalhada"
    }
  ]
}

REGRAS FINAIS:
- Fidelidade 100% à banca + cargo
- padraoBanca NÃO pode ser genérico/curto — explique de verdade como a ${exam.banca} cobra
- Cada resumo DEVE ter: conceito, base normativa, distinções, prática da banca, margens de dúvida (Dúvida→Resposta) e dica
- PROIBIDO deixar margem de dúvida aberta; feche com regra + exceção
- Questões no formato ${tipoLabel} apenas
- revisaoTurbo OBRIGATORIAMENTE com ${CONTEUDO_COMPLETO_DEPTH.MIN_TOPICOS_QUENTES} itens
- Retorne APENAS JSON válido e COMPLETO
- DATA ATUAL: ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}`

      setProgress((prev) => Math.min(prev + 15, 70))
      const { getOrCreateTopicFactualDossier, hasRichDossier } = await import(
        '../services/topicFactualDossierService'
      )
      const { appendGoogleAiDossier } = await import('../services/googleAiBrowserVerifier')
      const dossier = await getOrCreateTopicFactualDossier({
        courseId: resolvedCourseId,
        topicKey: resolvedTopicKey,
        topicoNome: effectiveTopicNome || resolvedTopicKey,
        disciplina: exam.disciplina || '',
        banca: exam.banca,
        cargo: exam.cargo,
        concursoName: exam.concursoName,
      })
      const richDossier = hasRichDossier(dossier)
      const promptWithDossier = appendGoogleAiDossier(prompt, dossier?.text)

      const genOpts = {
        courseId: resolvedCourseId,
        isLegalContent: true,
        useRAG: false,
        trustedGeneration: true,
        // Material: SEMPRE Search (1x) + dossiê — qualidade igual ao início
        useGoogleSearch: true,
        // Verify jurídico sem 2º grounding (geminiApi: verifyWithSearch=false se já grounded)
        verifyContent: true,
        thinkingLevel: 'low',
        purpose: 'material',
        maxContinues: 4,
        generationConfig: { maxOutputTokens: 32000, temperature: 0.15 },
      }
      let parsed = await generateAiJson(promptWithDossier, genOpts)
      parsed = await ensureMaterialContentComplete(parsed, {
        generateAiJson,
        // Aprofundamento sem Search extra
        generateOptions: { ...genOpts, useGoogleSearch: false, purpose: 'material_deepen' },
        context: {
          topico: effectiveTopicNome || resolvedTopicKey,
          banca: exam.banca,
          cargo: exam.cargo,
          concurso: exam.concursoName,
        },
        maxRepairs: 2,
      })

      try {
        const pred = parsed?.questoesPreditivas
        if (Array.isArray(pred) && pred.length) {
          const { ok } = filterValidQuestoes(pred, {
            tipoProva: exam.tipoProva,
            banca: exam.banca,
            minKeep: 0,
          })
          parsed.questoesPreditivas = ok
        }
      } catch (sanitizeErr) {
        console.warn('[ConteudoCompleto] sanitizar questões:', sanitizeErr?.message || sanitizeErr)
      }

      setProgress(75)
      const payload = {
        ...parsed,
        materia: parsed.materia || parsed.titulo || resolvedTopicKey,
        numero: parsed.numero || resolvedTopicKey,
        banca: exam.banca,
        cargo: exam.cargo,
        concurso: exam.concursoName,
        tipoProva: tipoLabel,
        topicKey: resolvedTopicKey,
        status: CONTENT_STATUS.UNAVAILABLE,
        updatedAt: serverTimestamp(),
        generatedAt: serverTimestamp(),
      }

      // Sanitizar o topicKey para usar como ID de documento no Firestore
      const sanitizedKey = sanitizeTopicKeyForFirestore(resolvedTopicKey)

      await setDoc(doc(db, 'courses', resolvedCourseId, 'conteudosCompletos', sanitizedKey), payload, {
        merge: true,
      })
      setConteudo(normalizeMaterialStructure({ id: sanitizedKey, ...payload }))
      setError('')
      setProgress(100)
      if (user?.uid && jobId) {
        await updateGenerationJob(user.uid, jobId, {
          status: GENERATION_JOB_STATUS.DONE,
          progress: 100,
          message: 'Conteúdo gerado com sucesso.',
        })
      }
      return true
    } catch (err) {
      console.error('Erro ao gerar conteúdo:', err)
      const message = err instanceof Error ? err.message : String(err)
      setError(message || 'Erro ao gerar conteúdo.')
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

  const handleEditContent = () => {
    const { updatedAt, generatedAt, id, ...rest } = conteudo
    setEditDraft({
      ...rest,
      contentPlain: stripHtml(rest.content || ''),
      padraoBancaPlain: stripHtml(rest.raioXProbabilidade?.padraoBanca || ''),
    })
    setEditingContent(true)
  }

  const handleSaveContent = async (payload) => {
    try {
      setSavingEdit(true)
      const sanitizedKey = sanitizeTopicKeyForFirestore(resolvedTopicKey)
      const contentRef = doc(db, 'courses', resolvedCourseId, 'conteudosCompletos', sanitizedKey)

      await setDoc(contentRef, {
        ...payload,
        topicKey: resolvedTopicKey,
        updatedAt: serverTimestamp(),
      }, { merge: true })

      setConteudo({ ...conteudo, ...payload })
      setEditingContent(false)
      setEditDraft(null)
    } catch (error) {
      console.error('Erro ao salvar conteúdo:', error)
      alert('Erro ao salvar conteúdo. Tente novamente.')
    } finally {
      setSavingEdit(false)
    }
  }

  const handleCancelEdit = () => {
    setEditingContent(false)
    setEditDraft(null)
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center space-y-4 w-full max-w-md px-6">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-alego-600 border-t-transparent"></div>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Carregando conteúdo completo...
          </p>
          {generating && (
            <>
              <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-2 bg-alego-600 dark:bg-alego-400 transition-all duration-300"
                  style={{ width: `${Math.max(progress, 10)}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                A IA está gerando o conteúdo deste tópico. Não feche nem atualize a página até concluir.
              </p>
            </>
          )}
        </div>
      </div>
    )
  }

  if (error || !conteudo) {
    return (
      <div className="max-w-4xl mx-auto p-4">
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-8 text-center space-y-4">
          <h2 className="text-2xl font-bold text-red-600 dark:text-red-400">
            {error || 'Conteúdo não encontrado'}
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Tópico: <span className="font-semibold">{resolvedTopicKey}</span>
          </p>
          {generating && (
            <div className="space-y-3">
              <div className="w-full max-w-md mx-auto h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-2 bg-alego-600 dark:bg-alego-400 transition-all duration-300"
                  style={{ width: `${Math.max(progress, 15)}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Gerando conteúdo específico deste tópico. Isso pode levar alguns instantes, não feche a página.
              </p>
            </div>
          )}
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                type="button"
                onClick={handleGenerateContent}
                disabled={generating}
                className="inline-flex items-center gap-2 px-4 py-2 bg-alego-600 text-white rounded-lg hover:bg-alego-700 transition disabled:opacity-60"
              >
                {generating ? (
                  <>
                    <span className="inline-block h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Gerando conteúdo...
                  </>
                ) : (
                  <>
                    <span role="img" aria-label="raio">⚡</span>
                    Chamar o professor!
                  </>
                )}
              </button>
            <Link
              to="/conteudo-completo"
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-white rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 transition"
            >
              <ArrowLeftIcon className="w-5 h-5" />
              Biblioteca de Conteúdos
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (!isAdmin && !hasTopicAccess) {
    return (
      <div className="max-w-lg mx-auto p-8">
        <div className="cp-card p-10 text-center">
          <p className="text-4xl mb-3">🔒</p>
          <p className="font-medium text-cp-text">Acesso não disponível</p>
          <p className="mt-2 text-sm text-cp-muted">
            Este tópico não está no seu preview gratuito ou ainda não foi liberado pelo administrador.
          </p>
          <Link to="/edital-verticalizado" className="cp-btn-ghost mt-6 inline-flex">
            Voltar ao edital
          </Link>
        </div>
      </div>
    )
  }

  if (!isContentAvailable(conteudo?.status, isAdmin)) {
    return (
      <div className="max-w-lg mx-auto p-8">
        <div className="cp-card p-10 text-center">
          <p className="text-4xl mb-3">🔒</p>
          <p className="font-medium text-cp-text">Conteúdo em preparação</p>
          <p className="mt-2 text-sm text-cp-muted">
            O administrador ainda não liberou o material de apoio deste tópico.
          </p>
          <Link to="/edital-verticalizado" className="cp-btn-ghost mt-6 inline-flex">
            Voltar ao edital
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-3 sm:space-y-6 sm:p-6">
      <ProfessorFlagNoteBanner />
      <Link to="/edital-verticalizado" className="inline-flex items-center gap-2 text-sm text-cp-muted hover:text-cp-accent transition">
        <ArrowLeftIcon className="w-5 h-5" />
        Voltar ao edital
      </Link>

      <div
        className="cp-card p-4 sm:p-8"
        data-content-id={buildMaterialContentId({
          courseId: resolvedCourseId,
          topicKey: resolvedTopicKey,
        })}
      >
        <div className="mb-4 flex flex-wrap items-center justify-end gap-2" data-pdf-hide>
              {(hasTopicAccess || isAdmin) && conteudo && resolvedCourseId && (
                <ContentFeedbackActions
                  courseId={resolvedCourseId}
                  contentType="material"
                  contentId={buildMaterialContentId({
                    courseId: resolvedCourseId,
                    topicKey: resolvedTopicKey,
                  })}
                  topicKey={resolvedTopicKey}
                  preview={stripHtml(String(conteudo.content || conteudo.titulo || '')).slice(0, 240)}
                  materia={conteudo.materia || conteudo.titulo || 'Material'}
                  assunto={effectiveTopicNome || resolvedTopicKey}
                  contextLabel="este material"
                  variant="inline"
                />
              )}
              <button
                type="button"
                onClick={handleDownloadPDF}
                disabled={downloadingPdf || !conteudo || editingContent}
                className="cp-btn-ghost !text-xs disabled:opacity-50"
              >
                <DocumentArrowDownIcon className="w-4 h-4" />
                {downloadingPdf ? 'Gerando…' : 'PDF'}
              </button>
              {(hasTopicAccess || isAdmin) && conteudo && (
                <ShareToFeedButton
                  postType={FEED_POST_TYPES.MATERIAL}
                  materia={conteudo.materia || conteudo.titulo || 'Material'}
                  assunto={effectiveTopicNome || resolvedTopicKey}
                  courseId={resolvedCourseId}
                  topicKey={resolvedTopicKey}
                  shareUrl={`/conteudo-completo/topic/${resolvedCourseId}/${encodeURIComponent(resolvedTopicKey)}${effectiveTopicNome ? `?nome=${encodeURIComponent(effectiveTopicNome)}` : ''}`}
                />
              )}
              {isAdmin && (
                <button
                  type="button"
                  onClick={handleEditContent}
                  disabled={editingContent}
                  className="cp-btn-ghost !text-xs"
                >
                  <PencilIcon className="w-4 h-4" />
                  {editingContent ? 'Editando…' : 'Editar'}
                </button>
              )}
              {isAdmin && (
                <button
                  type="button"
                  onClick={handleRegenerateContent}
                  disabled={generating || editingContent}
                  className="cp-btn-ghost !text-xs"
                  title="Regenerar este material do zero"
                >
                  <ArrowPathIcon className={`w-4 h-4 ${generating ? 'animate-spin' : ''}`} />
                  {generating ? 'Regenerando…' : 'Regenerar'}
                </button>
              )}
        </div>
        {isAdmin && regenMessage && (
          <p className="mb-3 text-xs text-cp-muted" data-pdf-hide>{regenMessage}</p>
        )}

        <div ref={pdfCaptureRef} className={`max-w-none rounded-xl bg-white p-1 text-slate-900 sm:p-2 ${editingContent ? 'hidden' : ''}`}>
            <div className="mb-6 border-b border-slate-200 pb-4">
              <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-slate-500">Material de apoio</p>
              <h1 className="break-words text-xl font-semibold text-slate-900 sm:text-3xl">
                {conteudo.materia || conteudo.titulo || resolvedTopicKey}
              </h1>
              {conteudo.subtitulo && (
                <p className="mt-2 text-sm italic text-slate-600">{replaceConcursoWithCourse(conteudo.subtitulo)}</p>
              )}
            </div>
            {courseName && (
            <div className="mb-6 rounded-xl border border-orange-200 bg-orange-50 p-4">
              <p className="text-sm text-slate-800">
                Material elaborado para <span className="font-medium text-orange-700">{courseName}</span>.
              </p>
          </div>
          )}

            <>
              {/* Raio-X de Probabilidade */}
              {conteudo.raioXProbabilidade && (
                <div className="mb-5 rounded-xl bg-gradient-to-r from-orange-50 to-amber-50 p-4 dark:from-orange-900/20 dark:to-amber-900/20 sm:mb-8 sm:p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <FireIcon className="h-6 w-6 text-orange-600" />
                    <h4 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                      Raio-X de Probabilidade
                    </h4>
                  </div>
                  
                  <div className="space-y-4">
                    {conteudo.raioXProbabilidade.topicosQuentes && (
                      <div>
                        <h5 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                          🔥 Top Assuntos Quentes:
                        </h5>
                        <ul className="space-y-1">
                          {conteudo.raioXProbabilidade.topicosQuentes.map((assunto, aIdx) => (
                            <li key={aIdx} className="text-sm text-slate-600 dark:text-slate-400 flex items-center gap-2">
                              <span className="text-orange-600 font-bold">{aIdx + 1}.</span>
                              {assunto}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    
                    {conteudo.raioXProbabilidade.padraoBanca && (
                      <div>
                        <h5 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                          📊 O Padrão da Banca:
                        </h5>
                        <div 
                          className="text-sm text-slate-600 dark:text-slate-400"
                          dangerouslySetInnerHTML={{ __html: replaceConcursoWithCourse(conteudo.raioXProbabilidade.padraoBanca) }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}
              
              {/* Revisão Turbo */}
              {conteudo.revisaoTurbo && Array.isArray(conteudo.revisaoTurbo) && conteudo.revisaoTurbo.length > 0 && (
                <div className="mb-5 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 p-4 dark:from-blue-900/20 dark:to-indigo-900/20 sm:mb-8 sm:p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <LightBulbIcon className="h-6 w-6 text-blue-600" />
                    <h4 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                      Revisão Turbo
                    </h4>
                  </div>
                  
                  <div className="space-y-4">
                    {conteudo.revisaoTurbo.map((resumo, rIdx) => (
                      <div key={rIdx} className="text-sm text-slate-600 dark:text-slate-400">
                        <h5 className="font-semibold text-slate-700 dark:text-slate-300 mb-2">
                          {resumo.titulo}
                        </h5>
                        <div 
                          className="ia-content-enhanced text-sm text-slate-600 dark:text-slate-400"
                          dangerouslySetInnerHTML={{ __html: replaceConcursoWithCourse(resumo.conteudo) }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Pegadinhas */}
              {conteudo.pegadinhas && Array.isArray(conteudo.pegadinhas) && conteudo.pegadinhas.length > 0 && (
                <div className="mb-5 rounded-xl bg-red-50 p-4 dark:bg-red-900/20 sm:mb-8 sm:p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <ExclamationTriangleIcon className="h-6 w-6 text-red-600" />
                    <h4 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                      Cuidado, Caçapa!
                    </h4>
                  </div>
                  
                  <div className="space-y-4">
                    {conteudo.pegadinhas.map((pegadinha, pIdx) => (
                      <div key={pIdx} className="text-sm text-red-600 dark:text-red-400">
                        <h5 className="font-semibold mb-2">
                          {pegadinha.titulo}
                        </h5>
                        <div 
                          className="ia-content-enhanced text-sm text-red-600 dark:text-red-400"
                          dangerouslySetInnerHTML={{ __html: replaceConcursoWithCourse(pegadinha.conteudo) }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Questões Preditivas */}
              {conteudo.questoesPreditivas && Array.isArray(conteudo.questoesPreditivas) && conteudo.questoesPreditivas.length > 0 && (
                <div className="mb-8">
                  <div className="flex items-center gap-2 mb-4">
                    <BookOpenIcon className="h-6 w-6 text-alego-600" />
                    <h4 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                      Questões Preditivas
                    </h4>
                  </div>
                  
                  <div className="space-y-6">
                    {conteudo.questoesPreditivas.map((questao, qIdx) => (
                      <div
                        key={qIdx}
                        className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-6"
                      >
                        <div className="mb-4">
                          <span className="text-xs font-semibold text-alego-600 mb-2 block">
                            Aposta {qIdx + 1} de {conteudo.questoesPreditivas.length}
                          </span>
                          <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-line">
                            {questao.enunciado}
                          </p>
                        </div>
                        
                        {questao.alternativas && (
                          <div className="space-y-2 mb-4">
                            {mapOrderedAlternativas(questao.alternativas).map(([letra, alt]) => (
                              <div
                                key={letra}
                                className={`p-3 rounded-lg text-sm ${
                                  letra === questao.correta
                                    ? 'bg-green-100 dark:bg-green-900/30 border-2 border-green-500 text-green-800 dark:text-green-300'
                                    : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300'
                                }`}
                              >
                                {letra}) {alt}
                              </div>
                            ))}
                          </div>
                        )}
                        
                        {questao.gabaritoComentado && (
                          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                            <h5 className="text-sm font-semibold text-blue-700 dark:text-blue-400 mb-2">
                              💡 Gabarito Comentado:
                            </h5>
                            <div 
                              className="text-sm text-blue-600 dark:text-blue-300 ia-content-enhanced"
                              dangerouslySetInnerHTML={{ __html: replaceConcursoWithCourse(questao.gabaritoComentado) }}
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Conteúdo original (para compatibilidade) */}
              {conteudo.content && (
                <div className="mb-8">
                  <div 
                    className="ia-content-enhanced"
                    dangerouslySetInnerHTML={{ __html: replaceConcursoWithCourse(conteudo.content) }}
                  />
                </div>
              )}

              {conteudo.secoes && Array.isArray(conteudo.secoes) && conteudo.secoes.length > 0 && (
                <div className="space-y-8 mt-8">
                  {conteudo.secoes.map((secao, index) => (
                    <div
                      key={index}
                      className="border-l-4 border-alego-500 pl-6 py-3 bg-slate-50 dark:bg-slate-900/50 rounded-r-lg"
                    >
                      <h3 className="mb-3 text-lg font-semibold text-alego-600 dark:text-alego-400 sm:text-2xl">
                        {secao.titulo || `Seção ${index + 1}`}
                        {secao.tipo && (
                          <span className="ml-3 text-sm bg-alego-100 dark:bg-alego-900 text-alego-700 dark:text-alego-300 px-3 py-1 rounded-full">
                            {secao.tipo}
                          </span>
                        )}
                      </h3>
                      {secao.conteudo && (
                        <div 
                          className="ia-content-enhanced"
                          dangerouslySetInnerHTML={{ __html: replaceConcursoWithCourse(secao.conteudo) }}
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
        </div>

        {editingContent && isAdmin && editDraft && (
          <SimpleMaterialEditor
            draft={editDraft}
            onChange={setEditDraft}
            onSave={handleSaveContent}
            onCancel={handleCancelEdit}
            saving={savingEdit}
          />
        )}

        {!editingContent && conteudo && (
          <div className="mt-4" data-pdf-hide>
            <AudioReader
              title={conteudo.materia || conteudo.titulo || effectiveTopicNome || 'Material de apoio'}
              text={buildMaterialSpeechScript(conteudo, { courseName })}
              className="w-full"
            />
          </div>
        )}
      </div>
    </div>
  )
}

export default ConteudoCompletoTopicoView

