import { readEnv, isDevEnv } from '@/lib/env.js'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { collection, doc, getDoc, getDocs, query, where, limit, setDoc, serverTimestamp, orderBy } from 'firebase/firestore'
import { ArrowLeftIcon, PencilIcon, FireIcon, LightBulbIcon, ExclamationTriangleIcon, BookOpenIcon, ChevronDownIcon, ChevronUpIcon, CheckIcon, DocumentArrowDownIcon } from '@heroicons/react/24/outline'
import { db } from '../firebase/config'
import { useDarkMode } from '../hooks/useDarkMode.jsx'
import { useAuth } from '../hooks/useAuth'
import { generateAiJson, hasGeminiApiKeys } from '../utils/geminiApi'
import { startBackgroundGeneration } from '../services/aiGenerationRunner'
import { buildConteudoCompletoPayload } from '../utils/serverGenerationPayload'
import { fetchTopicoPublishStatus } from '../services/topicoPublishService'
import { isContentAvailable, CONTENT_STATUS } from '../utils/contentStatus'
import SimpleMaterialEditor from '../components/SimpleMaterialEditor'
import { useTopicCourseAccess } from '../hooks/useTopicCourseAccess'
import ShareToFeedButton from '../components/feed/ShareToFeedButton'
import ContentFeedbackActions from '../components/content/ContentFeedbackActions'
import MaterialStructuredView from '../components/content/MaterialStructuredView'
import { buildMateriaContentId } from '../utils/contentCommentIds'
import { FEED_POST_TYPES } from '../services/trilhaFeedService'
import { stripHtml } from '../utils/htmlTextHelpers'
import { downloadMaterialPdf } from '../utils/materialPdfExport'
import {
  hydrateConteudoCompletoMaterial,
  resolveMaterialPdfFilename,
} from '../utils/materialFormatting'
import { getConteudoCompletoDepthInstructions, CONTEUDO_COMPLETO_DEPTH } from '../utils/contentDepthRules'
import { AI_TEXT_FORMAT_RULES, AI_MATERIAL_FORMAT_RULES } from '../utils/aiTextFormatting'
import ReactMarkdown from 'react-markdown'

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
  const [downloadingPdf, setDownloadingPdf] = useState(false)
  const materialExportRef = useRef(null)
  const [progress, setProgress] = useState(0)
  const [validating, setValidating] = useState(false)
  const [validationMessage, setValidationMessage] = useState('')
  const [editingContent, setEditingContent] = useState(false)
  const [editDraft, setEditDraft] = useState(null)
  const [savingEdit, setSavingEdit] = useState(false)

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
          setConteudo(hydrateConteudoCompletoMaterial(foundDoc, trimmedKey))
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
            setConteudo(hydrateConteudoCompletoMaterial(matchedFromNumero, trimmedKey))
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
            setConteudo(hydrateConteudoCompletoMaterial(matchedFromMateria, trimmedKey))
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

  const handleValidateTopic = async () => {
    if (!resolvedCourseId || !resolvedTopicKey || !conteudo) return

    if (!hasGeminiApiKeys()) {
      setError('Nenhuma API Key Gemini configurada.')
      return
    }

    try {
      setValidating(true)
      setValidationMessage('')

      const resumoConteudo = [
        conteudo.materia || '',
        conteudo.titulo || '',
        conteudo.subtitulo || '',
        (conteudo.content || '').toString().replace(/<[^>]+>/g, ' ').slice(0, 1500),
      ]
        .join('\n')
        .trim()

      const validatorPrompt = `Você é um avaliador de aderência de conteúdo a tópicos de edital.

TÓPICO-ALVO DO EDITAL:
- chave bruta: "${resolvedTopicKey}"
- número (se houver): "${topicNumeroFromKey || ''}"
- nome (se houver): "${effectiveTopicNome || ''}"

CONTEÚDO GERADO (resumo):
${resumoConteudo || '[vazio]'}

TAREFA:
Verifique se o conteúdo acima realmente corresponde ao tópico do edital informado.

REGRAS:
- Considere que o conteúdo está "correto" se a MAIOR PARTE dele tratar diretamente do tópico.
- Marque como "incorreto" se o conteúdo falar de outra lei, outro assunto principal ou da matéria inteira de forma genérica.

RESPOSTA APENAS EM JSON VÁLIDO, no formato exato:
{
  "match": true|false,
  "reason": "explicação curta em português",
  "action": "keep" ou "regenerate"
}

ONDE:
- "match" deve ser false quando o conteúdo não estiver alinhado ao tópico.
- "action" deve ser "keep" quando estiver adequado e "regenerate" quando estiver inadequado.`

      const parsed = await generateAiJson(validatorPrompt, { courseId: resolvedCourseId })
      const match = !!parsed.match
      const action = parsed.action === 'regenerate' ? 'regenerate' : 'keep'
      const reason = parsed.reason || ''

      if (match && action === 'keep') {
        setValidationMessage(
          reason
            ? `A IA analisou e entendeu que o conteúdo está coerente com este tópico: ${reason}`
            : 'A IA analisou e entendeu que o conteúdo está coerente com este tópico.'
        )
        return
      }

      // Conteúdo considerado inadequado para o tópico → regenerar
      const success = await handleGenerateContent()
      if (success) {
        setValidationMessage(
          reason
            ? `A IA detectou que o conteúdo não condizia bem com o tópico e gerou um novo material: ${reason}`
            : 'A IA detectou que o conteúdo não condizia bem com o tópico e gerou um novo material.'
        )
      } else {
        setValidationMessage('A IA indicou que o conteúdo não está adequado, mas houve erro ao tentar regenerar.')
      }
    } catch (err) {
      console.error('Erro ao validar tópico/conteúdo:', err)
      setValidationMessage('Não foi possível validar automaticamente este conteúdo agora. Tente novamente mais tarde.')
    } finally {
      setValidating(false)
    }
  }

  const handleDownloadPDF = async () => {
    if (!conteudo) return

    setDownloadingPdf(true)
    try {
      const normalized = hydrateConteudoCompletoMaterial(conteudo, resolvedTopicKey)
      const fileName = resolveMaterialPdfFilename(normalized, resolvedTopicKey)
      await downloadMaterialPdf(normalized, fileName, {
        courseName,
        preferStructuredHtml: true,
      })
    } catch (error) {
      console.error('Erro ao gerar PDF:', error)
      alert('Erro ao gerar PDF. Tente novamente.')
    } finally {
      setDownloadingPdf(false)
    }
  }

  const handleGenerateContent = async () => {
    if (!isAdmin) {
      setError('Apenas administradores podem gerar conteúdo na nuvem.')
      return false
    }
    if (!resolvedCourseId || !resolvedTopicKey) return false
    if (!user?.uid && !hasGeminiApiKeys()) {
      setError('Nenhuma API Key Gemini configurada.')
      return
    }

    try {
      setGenerating(true)
      setProgress(5)
      setError('')

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

          // Verificar se o edital está dividido em partes
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

      const prompt = `Você é um especialista em criar conteúdo técnico completo e ESPECÍFICO para cursos preparatórios de concursos públicos.

CONTEXTO (não cite estes nomes no texto final):
${banca ? `BANCA: ${banca}\n` : ''}${concursoName ? `CONCURSO: ${concursoName}\n` : ''}CURSO: ${
        courseName || 'Curso Preparatório'
      }
      
${contextoDisciplina ? `DISCIPLINA ESPECÍFICA: ${contextoDisciplina.disciplina}\n` : ''}TÓPICO ESPECÍFICO DO EDITAL (USE APENAS ESTE TÓPICO, NÃO MISTURE COM OUTROS): ${resolvedTopicKey}
NOME DO TÓPICO: ${effectiveTopicNome || resolvedTopicKey}

EDITAL BASE (trecho relevante para este tópico):
${editalText.substring(0, 8000)}${editalText.length > 8000 ? '\n\n[texto truncado...]' : ''}

⚠️⚠️⚠️ REGRAS CRÍTICAS - EVITE CONTEÚDO GENÉRICO ⚠️⚠️⚠️
1. FOCO 100% ESPECÍFICO: Crie conteúdo APENAS para o tópico "${effectiveTopicNome || resolvedTopicKey}"${contextoDisciplina ? ` DENTRO DA DISCIPLINA "${contextoDisciplina.disciplina}"` : ''}
2. NÃO CRIE conteúdo genérico sobre toda a matéria (ex: se tópico é "Conceitos" em "Direito Constitucional", não fale de todo Direito Constitucional)
3. SEJA ESPECÍFICO: Use artigos, leis, números, jurisprudência relacionados a ESTE tópico ${contextoDisciplina ? `nesta disciplina` : ''}
4. EVITE ASSUNTOS DIFERENTES: Não mencione outros tópicos do edital
5. CONTEÚDO TÉCNICO: Use linguagem formal, citations, artigos de lei
6. PROFUNDIDADE ADEQUADA: Nível técnico para concurso público, não básico
7. EXEMPLOS PRÁTICOS: Inclua exemplos concretos e aplicáveis

🚨🚨🚨 BANCA EXAMINADORA - OBRIGATÓRIO 🚨🚨🚨
BANCA DEFINIDA: ${banca || 'NÃO DEFINIDA'}
- ADAPTE TODO O CONTEÚDO ao estilo da banca "${banca || 'NÃO DEFINIDA'}"
- Se a banca for INSTITUTO AOCP: foco em artigos de lei na íntegra, questões de múltipla escolha diretas, interpretação literal
- Se a banca for FGV: foco em interpretação de texto, questões contextualizadas, análise crítica
- Se a banca for CESPE/CEBRASPE: foco em assertivas C/E, interpretação constitucional
- Se a banca for FCC: foco em legislação atualizada, questões de múltipla escolha, interpretação direta
- Se a banca for VUNESP: foco em interpretação de texto, questões contextualizadas, análise crítica
- SEJA FIEL À BANCA DEFINIDA ACIMA.

EXEMPLOS DO QUE EVITAR (ERRADO):
❌ Se tópico é "Conceitos" em "Direito Constitucional": 
   "O Direito Constitucional é o ramo do direito que estuda as constituições..."

🧠 CHAIN OF THOUGHT COM AUTO-REFUTAÇÃO EMBUTIDA - OBRIGATÓRIO

[PROCESSO DE PENSAMENTO INTERNO - NÃO EXIBA ISSO NA SAÍDA FINAL]
Para o tópico solicitado, você DEVE seguir OBRIGATORIAMENTE este processo de pensamento interno ANTES de gerar qualquer conteúdo visível para o usuário:

1. FAÇA UM RASCUNHO MENTAL dos pontos principais da lei/norma solicitada
2. QUESTIONE-SE RIGOROSAMENTE: "Estou inventando algum número de lei para os anos de 2025/2026? Estou inventando algum artigo que não existe no código/norma?"
3. SE PERCEBER QUE ESTÁ PRESTES A CITAR UM NÚMERO DE LEI FICTÍCIO para conceitos reais, PARE, REMOVA o número inventado e cite apenas o conceito doutrinário/jurisprudencial correto ou mencione que está em debate/reforma legislativa real, SEM INVENTAR DADOS
4. GARANTA QUE NÃO OMITIU alterações reais e históricas importantes (como Pacote Anticrime, Lei Henry Borel, etc., se aplicável)
5. VERIFIQUE: "Esta lei/artigo foi recepcionado pela CF/88? Foi declarado inconstitucional pelo STF?"
6. VERIFIQUE: "A jurisprudência citada está atualizada? Houve alguma decisão recente do STF/STJ que alterou o entendimento?"
7. AUDITE-SE: "Todas as datas e números de leis citados são historicamente exatos e verificáveis?"

SÓ DEPOIS DE CONCLUIR ESTE PROCESSO DE VERIFICAÇÃO INTERNA, PROSSIGA PARA A GERAÇÃO DO CONTEÚDO FINAL.

[DIRETRIZES DE SAÍDA - O QUE EXIBIR]
Gere o conteúdo estruturado com:
- Raio-X de Probabilidade (Foco na banca ${banca || 'NÃO DEFINIDA'}) — entre ${CONTEUDO_COMPLETO_DEPTH.MIN_TOPICOS_QUENTES} e ${CONTEUDO_COMPLETO_DEPTH.MAX_TOPICOS_QUENTES} assuntos quentes
- Revisão Turbo (Cronologia real e precisa, sem alucinações de numeração) — um resumo equilibrado para cada assunto quente (${CONTEUDO_COMPLETO_DEPTH.MIN_PALAVRAS_POR_RESUMO}–${CONTEUDO_COMPLETO_DEPTH.MAX_PALAVRAS_POR_RESUMO} palavras cada)
- Cuidado, Caçapa! (Pegadinhas reais da banca) — 3 a 5 itens objetivos
- ${CONTEUDO_COMPLETO_DEPTH.MIN_QUESTOES} Questões Preditivas inéditas com gabarito comentado fundamentado e objetivo

${getConteudoCompletoDepthInstructions({ banca, concursoName, courseName: courseName || concursoName })}

Seja cirúrgico, técnico e focado na literalidade e jurisprudência pacificada. Se você não tiver certeza absoluta de um número de lei recente, cite o conceito técnico sem inventar o número do decreto.

INSTRUÇÕES:
Gere um material de revisão de "Véspera de Prova" para o tópico "${effectiveTopicNome || resolvedTopicKey}"${contextoDisciplina ? ` da disciplina "${contextoDisciplina.disciplina}"` : ''}.

🔍 VERIFICAÇÃO DE FONTES - OBRIGATÓRIO:
- Para CADA lei, decreto ou norma jurídica mencionada, VERIFIQUE a atualidade usando as ferramentas disponíveis
- Para CADA jurisprudência citada, VERIFIQUE se está vigente e atualizada
- Use as ferramentas de Function Calling para buscar em APIs oficiais (Senado, Datajud/CNJ)
- Sempre busque de fontes confiáveis: TJ,STF,LEI(E SUAS ATUALIZAÇÕES, NÃO PEGUE NADA ANTIGO OU DESATUALIZADO), GRAN CURSOS, QCONCURSOS, CONTEÚDOS JURÍDICOS, SITES DO PLANALTO, ENTENDIMENTOS ETC EM MATÉRIAS DE DIREITO... O FOCO É SEMPRE SER ATUALIZADO!
 Atualizações até o ano de agora ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })} até o exato momento
Sempre verifique atualizações de acordo com a data hora em ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })} , nunca dê conteúdo desatualizado... sempre atualizado. Verifique a veracidade da fonte em useGoogleSearch.
DATA ATUAL: ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
IMPORTANTE: Use apenas informações atualizadas até esta data. Verifique se há leis, decretos ou regulamentos recentes que possam afetar o conteúdo.

🚨 PROIBIÇÃO ABSOLUTA DE ALUCINAÇÃO DE LEIS: É expressamente proibido inventar, supor ou criar números de leis, decretos ou emendas (especialmente com o ano corrente de 2026). Toda e qualquer lei citada deve ser um fato histórico real e amplamente consolidado. Na dúvida sobre o número exato da alteração, cite apenas o artigo principal da lei base (ex: 'conforme o Artigo 19 da Lei nº 11.340/2006') em vez de inventar uma lei modificadora.

**MODO HACKER DOS CONCURSOS**

1. ****RAIO-X DE PROBABILIDADE**:
   - Top Assuntos Quentes: Gere entre ${CONTEUDO_COMPLETO_DEPTH.MIN_TOPICOS_QUENTES} e ${CONTEUDO_COMPLETO_DEPTH.MAX_TOPICOS_QUENTES} tópicos com maior probabilidade de cair NO CONCURSO ${concursoName || 'mencionado'}
   - O Padrão da Banca: Como a banca ${banca || 'NÃO DEFINIDA'} costuma cobrar esta disciplina especificamente no concurso.

2. **REVISÃO TURBO**:
   - 🚨 OBRIGATÓRIO: Gere UM RESUMO para CADA UM dos "Top Assuntos Quentes" listados no Raio-X de Probabilidade
   - Se houver ${CONTEUDO_COMPLETO_DEPTH.MIN_TOPICOS_QUENTES} top assuntos quentes, gere ${CONTEUDO_COMPLETO_DEPTH.MIN_TOPICOS_QUENTES} resumos (um para cada)
   - Cada resumo deve corresponder EXATAMENTE a um dos top assuntos quentes listados
   - NÃO PULE nenhum top assunto quente - todos devem ter seu resumo
   - Cada resumo deve:
     * Explicar o conceito de forma clara e didática (completo no essencial, sem encher linguiça)
     * Ter entre ${CONTEUDO_COMPLETO_DEPTH.MIN_PALAVRAS_POR_RESUMO} e ${CONTEUDO_COMPLETO_DEPTH.MAX_PALAVRAS_POR_RESUMO} palavras
     * Citar exemplos práticos do concurso ${concursoName || 'mencionado'}
     * Ser específico para o cargo de ${courseName || 'mencionado'}
     * Incluir dicas de memorização (nada genérico e vazio/vago)
     * Formate em HTML organizado: <h4> subtítulos, vários <p>, <b> em termos-chave, <mark> para grifar artigos/prazos, <ul><li> em listas

3. **CUIDADO, CAÇAPA! (PEGADINHAS)** — seção separada da Revisão Turbo:
   - Gere 3 a 5 pegadinhas ("Cuidado meu querido aluno!"):
     * Erros comuns que a banca ${banca || 'NÃO DEFINIDA'} costuma cobrar
     * Detalhes que passam despercebidos
     * Armadilhas específicas do concurso ${concursoName || 'mencionado'}
     * HTML com parágrafos <p>, <b> no erro comum e <mark> na pegadinha exata
     * Cada pegadinha com ${CONTEUDO_COMPLETO_DEPTH.MIN_PALAVRAS_PEGADINHA}–${CONTEUDO_COMPLETO_DEPTH.MAX_PALAVRAS_PEGADINHA} palavras

4. **QUESTÕES PREDITIVAS**:
   - Gere EXATAMENTE ${CONTEUDO_COMPLETO_DEPTH.MIN_QUESTOES} questões para este tópico
   - No estilo da banca ${banca || 'NÃO DEFINIDA'} (A, B, C, D, E ou Certo/Errado)
   - Contextualizadas com o concurso ${concursoName || 'mencionado'} e cargo ${courseName || 'mencionado'}
   - Gabarito Comentado: explique o porquê das outras estarem erradas, com <p> separados e <b>/<mark> nos pontos-chave
   - Seja fundamentado e objetivo nas explicações (sem dissertação longa)

🚨 INSTRUÇÃO CRÍTICA - CONTEÚDO ATUALIZADO:
VOCÊ ESTÁ GERANDO CONTEÚDO AGORA, NA DATA ATUAL: ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
- PENSE: "Vou gerar agora de acordo com atualizações verídicas da data atual (${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })})"
- USE APENAS INFORMAÇÕES ATUALIZADAS E VIGENTES ATÉ ESTA DATA
- VERIFIQUE SE HOUVE ALTERAÇÕES RECENTES NAS LEIS, DECRETOS OU NORMAS
- NÃO USE INFORMAÇÕES DESATUALIZADAS OU REVOGADAS
- CITE SEMPRE A DATA DE ATUALIZAÇÃO QUANDO NECESSÁRIO

📅 ATUALIDADE DAS NORMAS (SEM CRONOLOGIA LONGA):
- Cite a lei/artigo vigente e, se houver alteração relevante recente, mencione-a em 1 frase
- NÃO faça histórico completo de cada norma (criação + todas as alterações) — isso deixa o material excessivo
- Foque no que a banca cobra hoje; indique só mudanças que realmente alteram a cobrança em prova
- Se a lei foi revogada, diga isso de forma breve e objetiva

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

FORMATO JSON:
{
  "validacaoArtigo": "Artigo, lei ou jurisprudência específica citada (texto literal com fonte)",
  "titulo": "Título específico do conteúdo - OBRIGATÓRIO: Inclua data e hora atual no formato (DD/MM/AAAA HH:MM) no final do título. Exemplo: 'Inquérito Policial (26/06/2026 14:30)'",
  "materia": "${effectiveTopicNome || resolvedTopicKey}",
  "subtitulo": "Subtítulo específico opcional",
  "numero": "${resolvedTopicKey}",
  "raioXProbabilidade": {
    "topicosQuentes": ["assunto 1", "assunto 2", "assunto 3"],
    "padraoBanca": "descrição do padrão"
  },
  "revisaoTurbo": [
    {
      "titulo": "Título do resumo",
      "conteudo": "resumo detalhado 1"
    }
  ],
  "pegadinhas": [
    {
      "titulo": "Cuidado meu querido aluno!",
      "conteudo": "pegadinha 1"
    }
  ],
  "questoesPreditivas": [
    {
      "enunciado": "texto da questão",
      "alternativas": {
        "A": "Alternativa A",
        "B": "Alternativa B",
        "C": "Alternativa C",
        "D": "Alternativa D",
        "E": "Alternativa E"
      },
      "correta": "A",
      "gabaritoComentado": "explicação detalhada"
    }
  ]
}

REGRAS:
- Use tom focado e direto
- Seja ESPECÍFICO do concurso ${concursoName || 'mencionado'} e cargo ${courseName || 'mencionado'}
- Cite o nome do concurso e cargo nos resumos e questões
- Preencha "validacaoArtigo" PRIMEIRO com o artigo/lei/jurisprudência literal antes de escrever o conteúdo
- Retorne APENAS o JSON válido, sem texto adicional
- ${AI_MATERIAL_FORMAT_RULES}
- ${AI_TEXT_FORMAT_RULES}`

      setProgress((prev) => Math.min(prev + 15, 70))
      const initialStatus = await fetchTopicoPublishStatus(resolvedCourseId, resolvedTopicKey)
      const sanitizedKey = sanitizeTopicKeyForFirestore(resolvedTopicKey)

      if (user?.uid) {
        setProgress(75)
        setError('')
        const { promise } = await startBackgroundGeneration({
          userId: user.uid,
          courseId: resolvedCourseId,
          jobType: 'conteudo_completo',
          topicKey: resolvedTopicKey,
          runOnServer: true,
          serverPayload: buildConteudoCompletoPayload({
            prompt,
            courseId: resolvedCourseId,
            topicKey: resolvedTopicKey,
            status: initialStatus,
          }),
        })

        await promise
        const foundDoc = await findDocumentByTopicKey(resolvedCourseId, resolvedTopicKey)
        if (foundDoc && !foundDoc.locked) {
          setConteudo(hydrateConteudoCompletoMaterial(foundDoc, resolvedTopicKey))
        }
        setProgress(100)
        return true
      }

      const parsed = await generateAiJson(prompt, {
        courseId: resolvedCourseId,
        trustedGeneration: true,
        isLegalContent: true,
        useRAG: true,
        useGoogleSearch: true,
      })
      setProgress(75)
      const payload = hydrateConteudoCompletoMaterial(
        {
          ...parsed,
          topicKey: resolvedTopicKey,
          status: initialStatus,
        },
        resolvedTopicKey,
      )
      payload.updatedAt = serverTimestamp()
      payload.generatedAt = serverTimestamp()

      await setDoc(doc(db, 'courses', resolvedCourseId, 'conteudosCompletos', sanitizedKey), payload, {
        merge: true,
      })
      setConteudo(hydrateConteudoCompletoMaterial({ id: sanitizedKey, ...payload }, resolvedTopicKey))
      setError('')
      setProgress(100)
      return true
    } catch (err) {
      console.error('Erro ao gerar conteúdo:', err)
      const message = err instanceof Error ? err.message : String(err)
      setError(message || 'Erro ao gerar conteúdo.')
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
            {isAdmin && (
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
            )}
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
    <div className="space-y-6 max-w-5xl mx-auto p-4 sm:p-6">
      <Link to="/edital-verticalizado" className="inline-flex items-center gap-2 text-sm text-cp-muted hover:text-cp-accent transition">
        <ArrowLeftIcon className="w-5 h-5" />
        Voltar ao edital
      </Link>

      <div className="cp-study-practice-card cp-card overflow-visible p-4 sm:p-6 lg:p-8">
        <div className="mb-8 pb-6 border-b border-cp-border">
          <p className="font-mono text-[10px] uppercase tracking-wider text-cp-muted mb-1">Material de apoio</p>
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <h1 className="cp-headline text-2xl sm:text-3xl break-words">
                {conteudo.materia || conteudo.titulo || resolvedTopicKey}
              </h1>
              {conteudo.subtitulo && (
                <p className="mt-2 text-sm text-cp-muted italic">{replaceConcursoWithCourse(conteudo.subtitulo)}</p>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleDownloadPDF}
                disabled={downloadingPdf || editingContent}
                className="cp-btn-ghost !text-xs"
              >
                <DocumentArrowDownIcon className="w-4 h-4" />
                {downloadingPdf ? 'Gerando PDF…' : 'PDF'}
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
              {conteudo && resolvedCourseId && resolvedTopicKey && (
                <ContentFeedbackActions
                  courseId={resolvedCourseId}
                  contentType="materia"
                  contentId={buildMateriaContentId({
                    courseId: resolvedCourseId,
                    topicKey: resolvedTopicKey,
                    kind: 'completo',
                  })}
                  topicKey={resolvedTopicKey}
                  preview={stripHtml(
                    conteudo.revisaoTurbo?.[0]?.conteudo ||
                      conteudo.secoes?.[0]?.conteudo ||
                      conteudo.content ||
                      conteudo.materia ||
                      conteudo.titulo ||
                      '',
                  ).slice(0, 280)}
                  materia={conteudo.materia || conteudo.titulo || ''}
                  assunto={effectiveTopicNome || resolvedTopicKey}
                  contextLabel="este material"
                  variant="inline"
                />
              )}
            </div>
          </div>
          {validationMessage && (
            <p className="mt-3 text-xs text-cp-muted">{validationMessage}</p>
          )}
        </div>

        <div
          ref={materialExportRef}
          id="material-pdf-export"
          className="max-w-none material-pdf-export"
        >
          <div className="mb-6 border-b border-slate-200 pb-4">
            <p className="text-xs font-mono uppercase tracking-wider text-slate-500">Material de apoio</p>
            <h2 className="mt-1 text-2xl font-bold text-slate-900">
              {conteudo.materia || conteudo.titulo || resolvedTopicKey}
            </h2>
            {conteudo.subtitulo && (
              <p className="mt-2 text-sm italic text-slate-600">
                {replaceConcursoWithCourse(conteudo.subtitulo)}
              </p>
            )}
            {courseName && (
              <p className="mt-2 text-sm text-slate-700">
                Material elaborado para <strong>{courseName}</strong>.
              </p>
            )}
          </div>

          {editingContent && isAdmin && editDraft ? (
            <SimpleMaterialEditor
              draft={editDraft}
              onChange={setEditDraft}
              onSave={handleSaveContent}
              onCancel={handleCancelEdit}
              saving={savingEdit}
            />
          ) : (
            <MaterialStructuredView
              material={conteudo}
              transformHtml={replaceConcursoWithCourse}
            />
          )}
        </div>
      </div>
    </div>
  )
}

export default ConteudoCompletoTopicoView

