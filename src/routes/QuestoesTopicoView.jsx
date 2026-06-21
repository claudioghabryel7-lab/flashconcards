import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { collection, doc, getDoc, getDocs, query, where, limit, setDoc, serverTimestamp, orderBy, deleteDoc } from 'firebase/firestore'
import { ArrowLeftIcon, FireIcon, CheckCircleIcon, XCircleIcon, TrashIcon, QuestionMarkCircleIcon } from '@heroicons/react/24/outline'
import { db } from '../firebase/config'
import { useDarkMode } from '../hooks/useDarkMode.jsx'
import { useAuth } from '../hooks/useAuth'
import { callGeminiWithRetry, extractGeneratedText } from '../utils/geminiApi'

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
    const loadQuestoes = async () => {
      if (!resolvedTopicKey || !resolvedCourseId) {
        setError('Questões não encontradas')
        setLoading(false)
        return
      }

      const trimmedKey = resolvedTopicKey.trim()
      if (!trimmedKey || trimmedKey === '') {
        setError('Tópico inválido: identificação do tópico está vazia')
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        setError('')

        // Tentar encontrar documento usando função que sanitiza a chave
        const foundDoc = await findDocumentByTopicKey(resolvedCourseId, trimmedKey)
        if (foundDoc) {
          setQuestoes(foundDoc)
          setLoading(false)
          return
        }

        setError('Chame o professor Flash, ele vai te mostrar o caminho. Aguarde até ele te entregar as questões e não feche a página.')
        setLoading(false)
      } catch (err) {
        console.error('Não se preocupe, chame o professor Flash novamente e dará certo.', err)
        const errorMessage = err.message || String(err)
        
        if (errorMessage.includes('Invalid document reference') || errorMessage.includes('even number of segments')) {
          setError('Erro: Tópico inválido. Por favor, verifique se o tópico possui identificação válida.')
        } else if (errorMessage.includes('Missing or insufficient permissions')) {
          setError('Erro de permissão. Por favor, verifique se você está autenticado e tente novamente.')
        } else {
          setError('Erro ao carregar questões. Tente novamente.')
        }
        setLoading(false)
      }
    }

    loadQuestoes()
  }, [resolvedTopicKey, resolvedCourseId])

  const handleGenerateQuestoes = async () => {
    if (!resolvedCourseId || !resolvedTopicKey) return false
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY
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

EDITAL BASE (trecho relevante para este tópico):
${editalText.substring(0, 8000)}${editalText.length > 8000 ? '\n\n[texto truncado...]' : ''}

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
      console.log('🤖 [Véspera de Prova] Iniciando geração com IA...')
      const response = await callGeminiWithRetry(prompt, {
        maxRetries: 3,
        baseDelay: 2000,
        models: ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'],
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
        updatedAt: serverTimestamp(),
        generatedAt: serverTimestamp(),
      }

      const sanitizedKey = sanitizeTopicKeyForFirestore(resolvedTopicKey)
      
      await setDoc(doc(db, 'courses', resolvedCourseId, 'questoesTopico', sanitizedKey), payload, {
        merge: true,
      })
      setQuestoes({ id: sanitizedKey, ...payload })
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
    
    const currentQuestion = questoes?.questoes[currentQuestionIndex]
    const isCorrect = answer === currentQuestion?.respostaCorreta
    
    setAnswers([...answers, {
      questionIndex: currentQuestionIndex,
      selectedAnswer: answer,
      correctAnswer: currentQuestion?.respostaCorreta,
      isCorrect,
      assunto: currentQuestion?.assunto,
      probabilidade: currentQuestion?.probabilidade
    }])
  }

  const handleNextQuestion = () => {
    if (currentQuestionIndex < (questoes?.questoes?.length - 1)) {
      setCurrentQuestionIndex(currentQuestionIndex + 1)
      setSelectedAnswer(null)
      setShowResult(false)
    } else {
      calcularDesempenho()
    }
  }

  const calcularDesempenho = () => {
    const totalQuestoes = answers.length
    const acertos = answers.filter(a => a.isCorrect).length
    const aproveitamento = Math.round((acertos / totalQuestoes) * 100)
    
    const precisaRevisar = answers
      .filter(a => !a.isCorrect && a.probabilidade >= 70)
      .map(a => a.assunto)
    
    const desempenhoData = {
      totalQuestoes,
      acertos,
      erros: totalQuestoes - acertos,
      aproveitamento,
      precisaRevisar,
      respostas: answers,
      topicKey: resolvedTopicKey,
      updatedAt: serverTimestamp()
    }
    
    setDesempenho(desempenhoData)
    
    if (user) {
      const desempenhoRef = doc(db, 'users', user.uid, 'desempenhoTopico', sanitizeTopicKeyForFirestore(resolvedTopicKey))
      setDoc(desempenhoRef, desempenhoData, { merge: true })
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
      const questoesRef = doc(db, 'courses', resolvedCourseId, 'questoesTopico', sanitizedKey)
      await deleteDoc(questoesRef)

      setQuestoes(null)
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
}

export default QuestoesTopicoView
