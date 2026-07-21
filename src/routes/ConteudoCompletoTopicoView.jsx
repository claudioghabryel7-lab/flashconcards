import { readEnv, isDevEnv } from '@/lib/env.js'
import { useEffect, useMemo, useState } from 'react'
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
  isMaterialContentComplete,
} from '../utils/contentDepthRules'
import { filterValidQuestoes } from '../utils/questoesQuality'
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
import jsPDF from 'jspdf'

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
          setConteudo(foundDoc)
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
            setConteudo(matchedFromNumero)
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
            setConteudo(matchedFromMateria)
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
    if (!conteudo) return

    try {
      const pdf = new jsPDF('p', 'mm', 'a4')
      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()
      const margin = 20
      const maxWidth = pageWidth - (margin * 2)
      let yPosition = margin

      // Função para adicionar texto com quebra de linha
      const addText = (text, x, y, maxWidth, fontSize = 12, isBold = false, color = '#000000') => {
        pdf.setFontSize(fontSize)
        if (isBold) pdf.setFont('helvetica', 'bold')
        else pdf.setFont('helvetica', 'normal')
        
        // Converter cor hex para RGB
        const r = parseInt(color.slice(1, 3), 16)
        const g = parseInt(color.slice(3, 5), 16)
        const b = parseInt(color.slice(5, 7), 16)
        pdf.setTextColor(r, g, b)
        
        const lines = pdf.splitTextToSize(text, maxWidth)
        lines.forEach((line, index) => {
          if (y + (index * (fontSize * 0.5)) > pageHeight - margin) {
            pdf.addPage()
            y = margin
          }
          pdf.text(line, x, y + (index * (fontSize * 0.5)))
        })
        return y + (lines.length * (fontSize * 0.5))
      }

      // Cabeçalho com gradiente (simulado com cor sólida)
      pdf.setFillColor(255, 140, 0)
      pdf.rect(margin, yPosition, maxWidth, 25, 'F')
      pdf.setTextColor(255, 255, 255)
      pdf.setFontSize(20)
      pdf.setFont('helvetica', 'bold')
      pdf.text('ConCursos 2.5', pageWidth / 2, yPosition + 10, { align: 'center' })
      pdf.setFontSize(12)
      pdf.setFont('helvetica', 'normal')
      pdf.text('Material de Apoio', pageWidth / 2, yPosition + 18, { align: 'center' })
      yPosition += 35

      // Título
      if (conteudo.titulo) {
        yPosition = addText(conteudo.titulo, margin, yPosition, maxWidth, 18, true, '#000000')
        yPosition += 10
      }

      // Subtítulo
      if (conteudo.subtitulo) {
        yPosition = addText(conteudo.subtitulo, margin, yPosition, maxWidth, 12, false, '#71717a')
        yPosition += 15
      }

      // Matéria
      if (conteudo.materia) {
        pdf.setFillColor(244, 244, 245)
        pdf.rect(margin, yPosition, maxWidth, 15, 'F')
        yPosition = addText(`Matéria: ${conteudo.materia}`, margin + 5, yPosition + 10, maxWidth - 10, 12, true, '#000000')
        yPosition += 20
      }

      // Raio-X de Probabilidade
      if (conteudo.raioXProbabilidade) {
        pdf.setFillColor(255, 200, 100)
        pdf.rect(margin, yPosition, maxWidth, 20, 'F')
        yPosition = addText('🔥 Raio-X de Probabilidade', margin + 5, yPosition + 12, maxWidth - 10, 14, true, '#000000')
        yPosition += 25

        if (conteudo.raioXProbabilidade.topicosQuentes) {
          yPosition = addText('Top Assuntos Quentes:', margin + 5, yPosition, maxWidth - 10, 12, true, '#000000')
          yPosition += 5
          conteudo.raioXProbabilidade.topicosQuentes.forEach((assunto) => {
            yPosition = addText(`• ${assunto}`, margin + 10, yPosition, maxWidth - 15, 11, false, '#000000')
          })
          yPosition += 5
        }

        if (conteudo.raioXProbabilidade.padraoBanca) {
          yPosition = addText(`Padrão da Banca: ${conteudo.raioXProbabilidade.padraoBanca}`, margin + 5, yPosition, maxWidth - 10, 12, false, '#000000')
          yPosition += 10
        }
      }

      // Revisão Turbo
      if (conteudo.revisaoTurbo) {
        pdf.setFillColor(100, 150, 255)
        pdf.rect(margin, yPosition, maxWidth, 20, 'F')
        yPosition = addText('⚡ Revisão Turbo', margin + 5, yPosition + 12, maxWidth - 10, 14, true, '#FFFFFF')
        yPosition += 25

        if (conteudo.revisaoTurbo.resumos && Array.isArray(conteudo.revisaoTurbo.resumos)) {
          yPosition = addText('Resumos:', margin + 5, yPosition, maxWidth - 10, 12, true, '#FFFFFF')
          yPosition += 5
          conteudo.revisaoTurbo.resumos.forEach((resumo, idx) => {
            yPosition = addText(`${idx + 1}. ${resumo}`, margin + 10, yPosition, maxWidth - 15, 11, false, '#FFFFFF')
          })
          yPosition += 10
        }

        if (conteudo.revisaoTurbo.pegadinhas && Array.isArray(conteudo.revisaoTurbo.pegadinhas)) {
          pdf.setFillColor(255, 220, 220)
          pdf.rect(margin, yPosition, maxWidth, 15, 'F')
          yPosition = addText('⚠️ Cuidado, Caçapa!', margin + 5, yPosition + 10, maxWidth - 10, 12, true, '#DC2626')
          yPosition += 20
          conteudo.revisaoTurbo.pegadinhas.forEach((pegadinha, idx) => {
            const titulo = typeof pegadinha === 'string' ? pegadinha : (pegadinha.titulo || pegadinha)
            const conteudoPegadinha = typeof pegadinha === 'object' ? pegadinha.conteudo : ''
            yPosition = addText(`${idx + 1}. ${titulo}`, margin + 10, yPosition, maxWidth - 15, 11, true, '#DC2626')
            if (conteudoPegadinha) {
              yPosition = addText(conteudoPegadinha, margin + 15, yPosition, maxWidth - 20, 10, false, '#991B1B')
            }
          })
          yPosition += 10
        }
      }

      // Questões Preditivas
      if (conteudo.questoesPreditivas && Array.isArray(conteudo.questoesPreditivas)) {
        pdf.setFillColor(100, 200, 100)
        pdf.rect(margin, yPosition, maxWidth, 20, 'F')
        yPosition = addText('📚 Questões Preditivas', margin + 5, yPosition + 12, maxWidth - 10, 14, true, '#FFFFFF')
        yPosition += 25

        conteudo.questoesPreditivas.forEach((questao, idx) => {
          pdf.setFillColor(244, 244, 245)
          pdf.rect(margin, yPosition, maxWidth, 10, 'F')
          yPosition = addText(`Questão ${idx + 1} de ${conteudo.questoesPreditivas.length}`, margin + 5, yPosition + 7, maxWidth - 10, 12, true, '#000000')
          yPosition += 15
          yPosition = addText(questao.enunciado, margin + 5, yPosition, maxWidth - 10, 11, false, '#000000')
          yPosition += 10

          if (questao.alternativas) {
            Object.entries(questao.alternativas).forEach(([letra, alt]) => {
              const isCorrect = letra === questao.correta
              yPosition = addText(`${letra}) ${alt}`, margin + 10, yPosition, maxWidth - 15, 10, isCorrect, isCorrect ? '#16A34A' : '#71717A')
            })
            yPosition += 10
          }

          if (questao.gabaritoComentado) {
            pdf.setFillColor(220, 230, 255)
            pdf.rect(margin, yPosition, maxWidth, 10, 'F')
            yPosition = addText('💡 Gabarito Comentado:', margin + 5, yPosition + 7, maxWidth - 10, 11, true, '#2563EB')
            yPosition += 15
            yPosition = addText(questao.gabaritoComentado, margin + 5, yPosition, maxWidth - 10, 10, false, '#1E40AF')
            yPosition += 15
          }
        })
      }

      // Conteúdo original
      if (conteudo.content) {
        pdf.setFillColor(228, 228, 231)
        pdf.rect(margin, yPosition, maxWidth, 15, 'F')
        yPosition = addText('📖 Conteúdo Completo', margin + 5, yPosition + 10, maxWidth - 10, 14, true, '#000000')
        yPosition += 20
        
        // Remover tags HTML do conteúdo
        const tempDiv = document.createElement('div')
        tempDiv.innerHTML = conteudo.content
        const textContent = tempDiv.textContent || tempDiv.innerText || ''
        yPosition = addText(textContent, margin + 5, yPosition, maxWidth - 10, 11, false, '#000000')
        yPosition += 15
      }

      // Seções
      if (conteudo.secoes && Array.isArray(conteudo.secoes)) {
        pdf.setFillColor(228, 228, 231)
        pdf.rect(margin, yPosition, maxWidth, 15, 'F')
        yPosition = addText('Seções do Conteúdo', margin + 5, yPosition + 10, maxWidth - 10, 14, true, '#000000')
        yPosition += 20

        conteudo.secoes.forEach((secao, idx) => {
          yPosition = addText(`${idx + 1}. ${secao.titulo || 'Seção ' + (idx + 1)}`, margin + 5, yPosition, maxWidth - 10, 13, true, '#000000')
          yPosition += 5
          if (secao.conteudo) {
            yPosition = addText(secao.conteudo, margin + 5, yPosition, maxWidth - 10, 11, false, '#000000')
            yPosition += 5
          }
          if (secao.itens && Array.isArray(secao.itens)) {
            secao.itens.forEach((item) => {
              yPosition = addText(`• ${item}`, margin + 10, yPosition, maxWidth - 15, 10, false, '#000000')
            })
            yPosition += 10
          }
        })
      }

      // Rodapé
      pdf.setDrawColor(212, 212, 216)
      pdf.line(margin, pageHeight - 30, pageWidth - margin, pageHeight - 30)
      pdf.setTextColor(113, 113, 122)
      pdf.setFontSize(9)
      pdf.text(`Gerado em ${new Date().toLocaleDateString('pt-BR')} | ConCursos 2.5`, pageWidth / 2, pageHeight - 20, { align: 'center' })

      // Salvar PDF
      const fileName = `${conteudo.materia || 'material'}-${conteudo.titulo || 'topico'}.pdf`.replace(/[^a-zA-Z0-9\-_.]/g, '_')
      pdf.save(fileName)
    } catch (error) {
      console.error('Erro ao gerar PDF:', error)
      alert('Erro ao gerar PDF. Tente novamente.')
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

1. RAIO-X: 6–10 top assuntos quentes + padrão da banca ${exam.banca || 'indicada'} para o cargo ${exam.cargo || 'do edital'}
2. REVISÃO TURBO: UM resumo completo para CADA assunto quente (sem pular)
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
    "topicosQuentes": ["assunto 1", "assunto 2"],
    "padraoBanca": "como a ${exam.banca} cobra este tópico para ${exam.cargo}"
  },
  "revisaoTurbo": [
    { "titulo": "Título do resumo", "conteudo": "HTML completo do resumo" }
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
- Questões no formato ${tipoLabel} apenas
- Retorne APENAS JSON válido e COMPLETO
- DATA ATUAL: ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}`

      setProgress((prev) => Math.min(prev + 15, 70))
      const parsed = await generateAiJson(prompt, {
        courseId: resolvedCourseId,
        isLegalContent: true,
        useRAG: false,
        trustedGeneration: true,
        useGoogleSearch: true,
        verifyContent: true,
        maxContinues: 3,
        generationConfig: { maxOutputTokens: 32000, temperature: 0.15 },
      })

      const completeness = isMaterialContentComplete(parsed)
      if (!completeness.ok) {
        throw new Error(completeness.reason || 'Material incompleto/cortado. Gere novamente.')
      }

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
      setConteudo({ id: sanitizedKey, ...payload })
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
        <div className="mb-8 pb-6 border-b border-cp-border">
          <p className="font-mono text-[10px] uppercase tracking-wider text-cp-muted mb-1">Material de apoio</p>
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <h1 className="cp-headline break-words text-xl sm:text-3xl">
                {conteudo.materia || conteudo.titulo || resolvedTopicKey}
              </h1>
              {conteudo.subtitulo && (
                <p className="mt-2 text-sm text-cp-muted italic">{replaceConcursoWithCourse(conteudo.subtitulo)}</p>
              )}
            </div>

            <div className="flex flex-wrap gap-2 items-center">
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
              <button type="button" onClick={handleDownloadPDF} className="cp-btn-ghost !text-xs">
                <DocumentArrowDownIcon className="w-4 h-4" />
                PDF
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
          </div>
          {isAdmin && regenMessage && (
            <p className="mt-3 text-xs text-cp-muted">{regenMessage}</p>
          )}
        </div>

        <div className="max-w-none">
            {courseName && (
            <div className="mb-6 cp-card !border-cp-accent/30 p-4">
              <p className="text-sm text-cp-text">
                Material elaborado para <span className="text-cp-accent font-medium">{courseName}</span>.
              </p>
          </div>
          )}

          {editingContent && isAdmin && editDraft ? (
            <SimpleMaterialEditor
              draft={editDraft}
              onChange={setEditDraft}
              onSave={handleSaveContent}
              onCancel={handleCancelEdit}
              saving={savingEdit}
            />
          ) : (
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
                            {Object.entries(questao.alternativas).map(([letra, alt]) => (
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
          )}
        </div>
      </div>
    </div>
  )
}

export default ConteudoCompletoTopicoView

