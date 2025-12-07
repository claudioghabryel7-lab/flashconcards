import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, arrayUnion, collection, onSnapshot, query, where, getDocs } from 'firebase/firestore'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { db } from '../firebase/config'
import { useDarkMode } from '../hooks/useDarkMode.jsx'
import ResultExport from '../components/ResultExport'
import CourseAdScreen from '../components/CourseAdScreen'
import {
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
  PlayIcon,
  PauseIcon,
  ArrowRightIcon,
  ArrowLeftIcon,
  TrophyIcon,
} from '@heroicons/react/24/outline'

// Função para gerar identificador único do visitante
const generateVisitorId = async () => {
  try {
    // Tentar obter IP via API externa
    let ip = 'unknown'
    try {
      const ipResponse = await fetch('https://api.ipify.org?format=json')
      const ipData = await ipResponse.json()
      ip = ipData.ip || 'unknown'
    } catch (err) {
      console.warn('Não foi possível obter IP:', err)
    }

    // Combinar IP + User-Agent para criar hash único
    const userAgent = navigator.userAgent || 'unknown'
    const combined = `${ip}_${userAgent}`
    
    // Criar hash simples (não é criptograficamente seguro, mas suficiente para este caso)
    let hash = 0
    for (let i = 0; i < combined.length; i++) {
      const char = combined.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32bit integer
    }
    
    return `visitor_${Math.abs(hash)}`
  } catch (error) {
    // Fallback: usar timestamp + random
    return `visitor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }
}

const SimuladoShare = () => {
  const { simuladoId } = useParams()
  const navigate = useNavigate()
  const { darkMode } = useDarkMode()
  const [loading, setLoading] = useState(true)
  const [loadingStatus, setLoadingStatus] = useState('Carregando simulado...')
  const [loadingProgress, setLoadingProgress] = useState(0)
  const [error, setError] = useState('')
  const [userEmail, setUserEmail] = useState('')
  const [emailSubmitted, setEmailSubmitted] = useState(false)
  const [visitorId, setVisitorId] = useState(null)
  const [alreadyAttempted, setAlreadyAttempted] = useState(false)
  
  // Estados do simulado
  const [simuladoData, setSimuladoData] = useState(null)
  const [questions, setQuestions] = useState([])
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [answers, setAnswers] = useState({})
  const [timeLeft, setTimeLeft] = useState(0)
  const [isRunning, setIsRunning] = useState(false)
  const [isFinished, setIsFinished] = useState(false)
  const [results, setResults] = useState(null)
  
  // Estados para redação
  const [showRedacao, setShowRedacao] = useState(false)
  const [redacaoTema, setRedacaoTema] = useState('')
  const [redacaoTexto, setRedacaoTexto] = useState('')
  const [redacaoTimeLeft, setRedacaoTimeLeft] = useState(0)
  const [redacaoIsRunning, setRedacaoIsRunning] = useState(false)
  const [redacaoNota, setRedacaoNota] = useState(null)
  const [analizingRedacao, setAnalizingRedacao] = useState(false)
  const [showAdScreen, setShowAdScreen] = useState(false)

  // Carregar simulado e verificar tentativas
  useEffect(() => {
    const loadSimulado = async () => {
      if (!simuladoId) {
        setError('ID do simulado não encontrado')
        setLoading(false)
        return
      }

      try {
        // Gerar identificador do visitante
        setLoadingStatus('Gerando identificador...')
        setLoadingProgress(10)
        const vid = await generateVisitorId()
        setVisitorId(vid)

        // Carregar simulado do Firestore
        setLoadingStatus('Carregando dados do simulado...')
        setLoadingProgress(30)
        const simuladoRef = doc(db, 'sharedSimulados', simuladoId)
        const simuladoDoc = await getDoc(simuladoRef)

        if (!simuladoDoc.exists()) {
          setError('Simulado não encontrado')
          setLoading(false)
          return
        }

        const data = simuladoDoc.data()
        
        // Verificar se já tentou
        setLoadingStatus('Verificando permissões...')
        setLoadingProgress(50)
        const attempts = data.attempts || []
        const hasAttempted = attempts.some(a => a.visitorId === vid)
        
        if (hasAttempted) {
          setAlreadyAttempted(true)
          setLoading(false)
          return
        }

        setSimuladoData(data)
        
        // Se tem questões salvas, usar essas questões
        if (data.questions && data.questions.length > 0) {
          setLoadingStatus('Carregando questões...')
          setLoadingProgress(90)
          setQuestions(data.questions)
          setLoadingProgress(100)
          setTimeLeft((data.simuladoInfo?.tempoMinutos || 240) * 60)
          setLoading(false)
        } else {
          // Se não tem questões, gerar novas questões
          setLoadingStatus('Gerando questões...')
          setLoadingProgress(50)
          await generateQuestionsForSharedSimulado(data)
        }
      } catch (err) {
        console.error('Erro ao carregar simulado:', err)
        setError('Erro ao carregar simulado. Tente novamente.')
        setLoading(false)
      }
    }

    loadSimulado()
  }, [simuladoId])

  // Timer
  useEffect(() => {
    if (!isRunning || timeLeft <= 0 || !questions.length) {
      if (timeLeft === 0 && isRunning && questions.length > 0) {
        finishSimulado()
      }
      return
    }

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          setIsRunning(false)
          if (questions.length > 0) {
            finishSimulado()
          }
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [isRunning, timeLeft, questions.length])

  // Timer para redação
  useEffect(() => {
    if (!redacaoIsRunning || redacaoTimeLeft <= 0 || !showRedacao) {
      if (redacaoTimeLeft === 0 && redacaoIsRunning && showRedacao) {
        finishRedacao()
      }
      return
    }

    const timer = setInterval(() => {
      setRedacaoTimeLeft((prev) => {
        if (prev <= 1) {
          setRedacaoIsRunning(false)
          finishRedacao()
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [redacaoIsRunning, redacaoTimeLeft, showRedacao])

  // Gerar questões para simulado compartilhado (quando não tem questões ainda)
  const generateQuestionsForSharedSimulado = async (simuladoData) => {
    setLoading(true)
    setLoadingStatus('Carregando configurações...')
    setLoadingProgress(5)
    try {
      const courseId = simuladoData.courseId || 'alego-default'
      
      // Buscar dados do curso (incluindo link de referência)
      setLoadingStatus('Carregando informações do curso...')
      setLoadingProgress(8)
      const courseRef = doc(db, 'courses', courseId)
      const courseDoc = await getDoc(courseRef)
      const courseData = courseDoc.exists() ? courseDoc.data() : null
      const referenceLink = courseData?.referenceLink || ''
      
      setLoadingStatus('Carregando edital...')
      setLoadingProgress(10)
      const editalRef = doc(db, 'courses', courseId, 'prompts', 'edital')
      const editalDoc = await getDoc(editalRef)

      let editalText = ''
      if (editalDoc.exists()) {
        const data = editalDoc.data()
        editalText = (data.prompt || '') + '\n\n' + (data.pdfText || '')
      }
      
      // Obter contexto do link de referência
      const { getLinkContextForAI } = await import('../utils/linkContent.js')
      const linkContext = referenceLink ? await getLinkContextForAI(referenceLink) : ''
      
      // Buscar flashcards do curso para usar como base
      let flashcardsContext = ''
      try {
        setLoadingStatus('Carregando flashcards do curso...')
        setLoadingProgress(12)
        const flashcardsRef = collection(db, 'flashcards')
        const flashcardsSnapshot = await getDocs(flashcardsRef)
        const allFlashcards = flashcardsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }))
        
        // Filtrar flashcards do curso
        let courseFlashcards = []
        if (courseId === 'alego-default') {
          // Para ALEGO padrão, buscar flashcards sem courseId
          courseFlashcards = allFlashcards.filter(card => 
            !card.courseId || card.courseId === '' || card.courseId === 'alego-default'
          )
        } else {
          // Para outros cursos, buscar flashcards com o courseId correspondente
          courseFlashcards = allFlashcards.filter(card => 
            card.courseId === courseId
          )
        }
        
        // Filtrar flashcards da matéria atual (se houver)
        const getFlashcardsForMateria = (materiaNome) => {
          return courseFlashcards.filter(card => {
            const cardMateria = card.materia || ''
            // Comparação flexível (case-insensitive, remove espaços)
            return cardMateria.toLowerCase().trim() === materiaNome.toLowerCase().trim() ||
                   cardMateria.toLowerCase().includes(materiaNome.toLowerCase()) ||
                   materiaNome.toLowerCase().includes(cardMateria.toLowerCase())
          })
        }
        
        // Formatar flashcards para contexto (limitar quantidade para não exceder tokens)
        const formatFlashcardsForContext = (flashcards, maxFlashcards = 50) => {
          const limited = flashcards.slice(0, maxFlashcards)
          return limited.map((card, index) => {
            const pergunta = card.pergunta || card.front || ''
            const resposta = card.resposta || card.back || ''
            return `${index + 1}. Pergunta: ${pergunta}\n   Resposta: ${resposta}`
          }).join('\n\n')
        }
        
        // Armazenar função para usar dentro do loop
        window.getFlashcardsForMateria = getFlashcardsForMateria
        window.formatFlashcardsForContext = formatFlashcardsForContext
        window.courseFlashcards = courseFlashcards
        
        if (courseFlashcards.length > 0) {
          flashcardsContext = `\n\n📚 FLASHCARDS DO CURSO (BASE PRINCIPAL PARA AS QUESTÕES):\n`
          flashcardsContext += `Total de ${courseFlashcards.length} flashcards encontrados no curso.\n`
          flashcardsContext += `IMPORTANTE: Use o conteúdo dos flashcards acima como BASE PRINCIPAL para criar as questões.\n`
          flashcardsContext += `As questões devem testar o conhecimento presente nos flashcards do curso.\n\n`
        }
      } catch (flashcardsErr) {
        console.error('Erro ao buscar flashcards:', flashcardsErr)
        // Continuar mesmo se não conseguir buscar flashcards
      }

      setLoadingStatus('Inicializando gerador de questões...')
      setLoadingProgress(15)
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY
      if (!apiKey) {
        throw new Error('VITE_GEMINI_API_KEY não configurada')
      }

      const genAI = new GoogleGenerativeAI(apiKey)
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' })

      const simuladoInfo = simuladoData.simuladoInfo
      const validMaterias = simuladoInfo.materias || []

      if (validMaterias.length === 0) {
        throw new Error('Nenhuma matéria encontrada no simulado')
      }

      const allQuestions = []
      const totalMaterias = validMaterias.length
      
      for (let i = 0; i < validMaterias.length; i++) {
        const materia = validMaterias[i]
        const progressBase = 20
        const progressPerMateria = 70 / totalMaterias
        const currentProgress = progressBase + (i * progressPerMateria)
        setLoadingProgress(Math.round(currentProgress))
        setLoadingStatus(`Gerando questões de ${materia.nome}... (${i + 1}/${totalMaterias})`)
        
        // Buscar flashcards específicos da matéria
        const materiaFlashcards = window.getFlashcardsForMateria 
          ? window.getFlashcardsForMateria(materia.nome)
          : []
        const flashcardsText = materiaFlashcards.length > 0
          ? `\n\n📚 FLASHCARDS DA MATÉRIA "${materia.nome}" (USE ESTES COMO BASE PRINCIPAL):\n${window.formatFlashcardsForContext ? window.formatFlashcardsForContext(materiaFlashcards, 30) : ''}\n\n`
          : (window.courseFlashcards && window.courseFlashcards.length > 0
              ? `\n\n📚 FLASHCARDS DO CURSO (USE COMO BASE):\n${window.formatFlashcardsForContext ? window.formatFlashcardsForContext(window.courseFlashcards.slice(0, 30), 30) : ''}\n\n`
              : '')
        
        const materiaPrompt = `Você é um especialista em criar questões de concursos públicos.

═══════════════════════════════════════════════════════════════════════════════
🚨 REGRA CRÍTICA ABSOLUTA - LEIA COM MUITA ATENÇÃO 🚨
═══════════════════════════════════════════════════════════════════════════════

CONCURSO ESPECÍFICO: ${simuladoData.courseName || 'Concurso'}
CURSO ID: ${courseId}

⚠️⚠️⚠️ PROIBIÇÃO ABSOLUTA ⚠️⚠️⚠️
- NÃO use conteúdo de OUTROS concursos
- NÃO use conhecimento genérico de concursos públicos
- NÃO invente conteúdo que não esteja nos flashcards ou edital deste curso específico
- NÃO misture informações de diferentes concursos
- NÃO use exemplos ou contextos de outros cursos
- NÃO use questões ou temas de outros concursos públicos

✅✅✅ O QUE VOCÊ DEVE FAZER ✅✅✅
- Use APENAS o conteúdo dos flashcards deste curso específico (${simuladoData.courseName || courseId})
- Use APENAS o edital deste curso específico
- Use APENAS o link de referência deste curso específico
- Crie questões ESPECÍFICAS para ${simuladoData.courseName || courseId}
- Baseie-se EXCLUSIVAMENTE no contexto fornecido abaixo
- Cada questão DEVE estar relacionada APENAS a este curso

═══════════════════════════════════════════════════════════════════════════════

${flashcardsContext}

${flashcardsText}

REGRAS CRÍTICAS PARA CRIAÇÃO DAS QUESTÕES:
1. BASEIE-SE EXCLUSIVAMENTE nos flashcards acima - APENAS flashcards do curso ${simuladoData.courseName || courseId}
2. Use o conteúdo dos flashcards como ÚNICA referência para criar questões
3. As questões devem testar APENAS o conhecimento presente nos flashcards deste curso
4. Se houver flashcards específicos da matéria "${materia.nome}", use APENAS esses como base
5. Se não houver flashcards específicos da matéria, use APENAS os flashcards gerais deste curso
6. NÃO use conhecimento de outros cursos ou concursos genéricos
7. NÃO invente conteúdo que não esteja nos flashcards ou edital acima

${linkContext}

${editalText ? `CONTEXTO DO EDITAL DO CONCURSO ${simuladoData.courseName || courseId} (USE APENAS ESTE EDITAL):\n${editalText.substring(0, 30000)}\n\n` : ''}

INSTRUÇÕES FINAIS:
- Questões devem ser ESPECÍFICAS para ${simuladoData.courseName || courseId}
- NÃO use conteúdo de outros concursos
- NÃO invente informações que não estejam nos flashcards ou edital acima
- Cada questão deve testar conhecimento presente nos flashcards deste curso

Crie ${materia.quantidadeQuestoes} questões FICTÍCIAS de múltipla escolha no estilo FGV para a matéria "${materia.nome}" do concurso ${simuladoData.courseName || courseId}.

Lembre-se: Use APENAS o contexto fornecido acima. NÃO use conhecimento de outros cursos.

REGRAS CRÍTICAS:
- Questões devem ser ESPECÍFICAS para o concurso ${simuladoData.courseName || 'mencionado'}
- Baseie-se EXCLUSIVAMENTE no edital fornecido acima
- Estilo FGV: questões objetivas, claras, com alternativas bem elaboradas
- Cada questão deve ter 5 alternativas (A, B, C, D, E)
- Apenas UMA alternativa está correta
- Questões devem ser FICTÍCIAS (não são questões reais de provas anteriores)

FORMATO DE RESPOSTA (OBRIGATÓRIO - APENAS JSON):
{
  "questoes": [
    {
      "enunciado": "Texto completo da questão",
      "alternativas": {
        "A": "Texto da alternativa A",
        "B": "Texto da alternativa B",
        "C": "Texto da alternativa C",
        "D": "Texto da alternativa D",
        "E": "Texto da alternativa E"
      },
      "correta": "A",
      "materia": "${materia.nome}"
    }
  ]
}

CRÍTICO: Retorne APENAS o JSON, sem markdown.`

        try {
          const result = await model.generateContent(materiaPrompt)
          const responseText = result.response.text().trim()

          let jsonText = responseText
          if (jsonText.includes('```json')) {
            jsonText = jsonText.split('```json')[1].split('```')[0].trim()
          } else if (jsonText.includes('```')) {
            jsonText = jsonText.split('```')[1].split('```')[0].trim()
          }

          const firstBrace = jsonText.indexOf('{')
          const lastBrace = jsonText.lastIndexOf('}')
          if (firstBrace !== -1 && lastBrace !== -1) {
            jsonText = jsonText.substring(firstBrace, lastBrace + 1)
          }

          const parsed = JSON.parse(jsonText)
          if (parsed.questoes && Array.isArray(parsed.questoes)) {
            allQuestions.push(...parsed.questoes)
          }
        } catch (err) {
          console.error(`Erro ao gerar questões de ${materia.nome}:`, err)
        }
      }

      if (allQuestions.length === 0) {
        throw new Error('Nenhuma questão foi gerada. Tente novamente.')
      }

      // Manter questões organizadas por matéria (sem embaralhar)
      setLoadingStatus('Organizando questões...')
      setLoadingProgress(90)
      setQuestions(allQuestions)
      
      // Atualizar simulado no Firestore com as questões geradas
      setLoadingStatus('Salvando questões...')
      setLoadingProgress(95)
      try {
        const simuladoRef = doc(db, 'sharedSimulados', simuladoId)
        await updateDoc(simuladoRef, {
          questions: allQuestions,
        })
      } catch (updateErr) {
        console.error('Erro ao atualizar questões no Firestore (pode ser problema de permissão):', updateErr)
        // Continuar mesmo se não conseguir atualizar (as questões já estão no estado)
      }
      
      setLoadingStatus('Finalizando...')
      setLoadingProgress(100)
      setTimeLeft((simuladoData.simuladoInfo?.tempoMinutos || 240) * 60)
    } catch (err) {
      console.error('Erro ao gerar questões:', err)
      setError('Erro ao gerar questões do simulado. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  // Capturar email e iniciar simulado
  const handleEmailSubmit = async (e) => {
    e.preventDefault()
    if (!userEmail.trim() || !userEmail.includes('@')) {
      alert('Por favor, insira um email válido.')
      return
    }

    try {
      // Salvar tentativa no simulado
      const simuladoRef = doc(db, 'sharedSimulados', simuladoId)
      await updateDoc(simuladoRef, {
        attempts: arrayUnion({
          visitorId,
          email: userEmail.trim(),
          startedAt: new Date().toISOString(),
          completed: false,
        }),
      })

      setEmailSubmitted(true)
      // Mostrar tela de publicidade antes de iniciar (se já tiver questões)
      if (questions.length > 0) {
        setShowAdScreen(true)
      }
    } catch (err) {
      console.error('Erro ao salvar email:', err)
      alert('Erro ao salvar dados. Tente novamente.')
    }
  }

  // Finalizar questões objetivas
  const finishObjectiveQuestions = async () => {
    setIsRunning(false)
    
    // Se o simulado tem redação, gerar tema
    if (simuladoData?.hasRedacao) {
      await generateRedacaoTheme()
      setRedacaoTimeLeft(3600)
      setRedacaoIsRunning(true)
      setShowRedacao(true)
    } else {
      finishSimulado()
    }
  }

  // Gerar tema de redação
  const generateRedacaoTheme = async () => {
    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY
      if (!apiKey) {
        setRedacaoTema('A importância da eficiência no serviço público')
        return
      }

      // Buscar link de referência do curso
      const courseId = simuladoData?.courseId || 'alego-default'
      const courseRef = doc(db, 'courses', courseId)
      const courseDoc = await getDoc(courseRef)
      const courseData = courseDoc.exists() ? courseDoc.data() : null
      const referenceLink = courseData?.referenceLink || ''
      
      // Obter contexto do link
      const { getLinkContextForAI } = await import('../utils/linkContent.js')
      const linkContext = referenceLink ? await getLinkContextForAI(referenceLink) : ''

      const genAI = new GoogleGenerativeAI(apiKey)
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' })

      const themePrompt = `Você é um especialista em criar temas de redação para concursos públicos.

═══════════════════════════════════════════════════════════════════════════════
🚨 REGRA CRÍTICA ABSOLUTA - LEIA COM MUITA ATENÇÃO 🚨
═══════════════════════════════════════════════════════════════════════════════

CONCURSO ESPECÍFICO: ${simuladoData?.courseName || 'Concurso'}
CURSO ID: ${courseId}

⚠️⚠️⚠️ PROIBIÇÃO ABSOLUTA ⚠️⚠️⚠️
- NÃO use temas de OUTROS concursos
- NÃO use temas genéricos de concursos públicos
- NÃO invente temas que não estejam relacionados a este curso específico
- NÃO misture informações de diferentes concursos
- NÃO use temas típicos de outros concursos

✅✅✅ O QUE VOCÊ DEVE FAZER ✅✅✅
- Crie um tema ESPECÍFICO para ${simuladoData?.courseName || courseId}
- Baseie-se EXCLUSIVAMENTE no contexto deste curso
- O tema deve estar relacionado ao concurso ${simuladoData?.courseName || courseId}

${linkContext}

INSTRUÇÕES:
- O tema deve ser ESPECÍFICO para ${simuladoData?.courseName || courseId}
- Deve estar relacionado com questões sociais, políticas ou administrativas pertinentes a este curso específico
- NÃO use temas genéricos ou de outros concursos
- O tema deve permitir uma dissertação argumentativa de 25-30 linhas
- Baseie-se APENAS no contexto deste curso

Retorne APENAS o tema da redação, sem explicações, sem aspas, sem formatação especial.
O tema deve ser claro e direto, relacionado APENAS ao concurso ${simuladoData?.courseName || courseId}.

CRÍTICO: Retorne APENAS o tema, nada mais.`

      const result = await model.generateContent(themePrompt)
      let theme = result.response.text().trim()
      theme = theme.replace(/TEMA:/gi, '').trim()
      theme = theme.replace(/"/g, '').trim()
      setRedacaoTema(theme)
    } catch (err) {
      console.error('Erro ao gerar tema:', err)
      setRedacaoTema('A importância da eficiência no serviço público')
    }
  }

  // Analisar redação
  const analyzeRedacao = async () => {
    if (!redacaoTexto.trim()) {
      finishSimulado()
      return
    }

    setAnalizingRedacao(true)

    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY
      if (!apiKey) {
        finishSimulado()
        return
      }

      const genAI = new GoogleGenerativeAI(apiKey)
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' })

      // Validar tamanho mínimo
      const wordCount = redacaoTexto.trim().split(/\s+/).length
      const charCount = redacaoTexto.trim().length
      
      if (wordCount < 50 || charCount < 200) {
        const zeroResult = {
          nota: 0,
          criterios: {
            dominio: 0,
            compreensao: 0,
            argumentacao: 0,
            estrutura: 0,
            conhecimento: 0
          },
          feedback: `A redação está muito curta (${wordCount} palavras). Uma redação deve ter no mínimo 200 palavras.`
        }
        setRedacaoNota(zeroResult)
        finishSimulado(zeroResult)
        return
      }

      const analysisPrompt = `Você é um corretor especializado em redações de concursos públicos.

IMPORTANTE: A redação deve ter no mínimo 200 palavras. Se a redação for muito curta, incompleta ou não desenvolver o tema, atribua nota ZERO.

Analise a seguinte redação e atribua uma nota de 0 a 10 (escala de 0 a 10, não 0 a 1000):

TEMA: ${redacaoTema}

CRITÉRIOS DE AVALIAÇÃO (cada um de 0 a 2 pontos, totalizando 0 a 10):
1. Domínio da modalidade escrita (0-2 pontos)
2. Compreensão do tema (0-2 pontos)
3. Argumentação (0-2 pontos)
4. Estrutura textual (0-2 pontos)
5. Conhecimento sobre o cargo/concurso (0-2 pontos)

REDAÇÃO:
${redacaoTexto}

Retorne APENAS um objeto JSON (NOTA DE 0 A 10):
{
  "nota": 7.5,
  "criterios": {
    "dominio": 1.6,
    "compreensao": 1.7,
    "argumentacao": 1.8,
    "estrutura": 1.5,
    "conhecimento": 0.9
  },
  "feedback": "Feedback geral sobre a redação"
}

CRÍTICO: A nota total deve ser de 0 a 10 (não 0 a 1000). Cada critério de 0 a 2 pontos.`

      const result = await model.generateContent(analysisPrompt)
      let responseText = result.response.text().trim()

      let jsonText = responseText
      if (jsonText.includes('```json')) {
        jsonText = jsonText.split('```json')[1].split('```')[0].trim()
      } else if (jsonText.includes('```')) {
        jsonText = jsonText.split('```')[1].split('```')[0].trim()
      }

      const firstBrace = jsonText.indexOf('{')
      const lastBrace = jsonText.lastIndexOf('}')
      if (firstBrace !== -1 && lastBrace !== -1) {
        jsonText = jsonText.substring(firstBrace, lastBrace + 1)
      }

      const parsed = JSON.parse(jsonText)
      setRedacaoNota(parsed)
      finishSimulado(parsed)
    } catch (err) {
      console.error('Erro ao analisar redação:', err)
      finishSimulado()
    }
  }

  // Finalizar redação
  const finishRedacao = () => {
    setRedacaoIsRunning(false)
    if (redacaoTexto.trim()) {
      analyzeRedacao()
    } else {
      finishSimulado()
    }
  }

  // Finalizar simulado
  const finishSimulado = async (redacaoResult = null) => {
    setIsFinished(true)
    setShowRedacao(false)

    let correct = 0
    let wrong = 0
    const byMateria = {}

    questions.forEach((question, index) => {
      const userAnswer = answers[index]
      const isCorrect = userAnswer === question.correta

      if (isCorrect) {
        correct++
      } else {
        wrong++
      }

      const materia = question.materia || 'Outras'
      if (!byMateria[materia]) {
        byMateria[materia] = { correct: 0, wrong: 0 }
      }
      byMateria[materia].correct += isCorrect ? 1 : 0
      byMateria[materia].wrong += !isCorrect ? 1 : 0
    })

    const total = questions.length
    const objectiveAccuracy = total > 0 ? ((correct / total) * 100).toFixed(1) : 0
    // Nota objetiva (0-10) baseada na porcentagem de acerto
    const objectiveScore = total > 0 ? ((correct / total) * 10).toFixed(2) : 0

    let finalScore = parseFloat(objectiveScore)
    let finalScoreText = 'Apenas objetiva'

    if (redacaoResult && redacaoResult.nota !== undefined) {
      // Converter nota da redação para escala 0-10 se necessário
      let redacaoNota = parseFloat(redacaoResult.nota)
      
      // Se a nota vier em escala 0-1000, converter para 0-10
      if (redacaoNota > 10) {
        redacaoNota = redacaoNota / 100
      }
      
      const objectiveWeight = 0.7
      const redacaoWeight = 0.3
      finalScore = (parseFloat(objectiveScore) * objectiveWeight) + (redacaoNota * redacaoWeight)
      finalScoreText = 'Objetiva (70%) + Redação (30%)'
    }

    const resultsData = {
      correct,
      wrong,
      total,
      accuracy: parseFloat(objectiveAccuracy),
      objectiveScore: parseFloat(objectiveScore).toFixed(2),
      redacao: redacaoResult ? {
        ...redacaoResult,
        nota: redacaoResult.nota > 10 ? (redacaoResult.nota / 100).toFixed(2) : parseFloat(redacaoResult.nota).toFixed(2)
      } : null,
      finalScore: finalScore.toFixed(2),
      finalScoreText,
      byMateria,
      timeSpent: (simuladoData?.simuladoInfo?.tempoMinutos || 240) * 60 - timeLeft,
      redacaoTimeSpent: 3600 - redacaoTimeLeft,
      completedAt: new Date().toISOString(),
    }

    setResults(resultsData)

    // Atualizar tentativa como completa
    try {
      const simuladoRef = doc(db, 'sharedSimulados', simuladoId)
      const simuladoDoc = await getDoc(simuladoRef)
      const attempts = simuladoDoc.data().attempts || []
      const updatedAttempts = attempts.map(a => 
        a.visitorId === visitorId 
          ? { ...a, completed: true, finishedAt: new Date().toISOString(), results: resultsData }
          : a
      )
      await updateDoc(simuladoRef, { attempts: updatedAttempts })

      // Enviar email com resultado
      // Buscar email dos attempts caso não esteja no estado
      const attemptWithEmail = updatedAttempts.find(a => a.visitorId === visitorId && a.email)
      const emailToSend = userEmail || attemptWithEmail?.email
      
      if (emailToSend) {
        try {
          const emailFunctionUrl = 'https://us-central1-plegi-d84c2.cloudfunctions.net/sendSimuladoResultEmail'
          await fetch(emailFunctionUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              email: emailToSend,
              results: resultsData,
              simuladoName: simuladoData?.simuladoInfo?.descricao || '',
              courseName: simuladoData?.courseName || '',
            }),
          })
          console.log('Email de resultado enviado para:', emailToSend)
        } catch (emailErr) {
          console.error('Erro ao enviar email:', emailErr)
          // Não bloquear se o email falhar
        }
      }
    } catch (err) {
      console.error('Erro ao salvar resultado:', err)
    }
  }

  const formatTime = (seconds) => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`
  }

  const currentQuestion = questions[currentQuestionIndex]
  const progress = questions.length > 0 ? ((currentQuestionIndex + 1) / questions.length) * 100 : 0
  const answeredCount = Object.keys(answers).length

  // Loading
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-purple-50 dark:from-slate-900 dark:to-slate-800 p-4">
        <div className="max-w-md w-full bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-8 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-alego-600 border-t-transparent mx-auto mb-6"></div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Carregando Simulado</h2>
          <p className="text-slate-600 dark:text-slate-400 mb-6">{loadingStatus}</p>
          
          {/* Barra de progresso */}
          <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-3 mb-2">
            <div
              className="bg-gradient-to-r from-alego-600 to-alego-700 h-3 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${loadingProgress}%` }}
            />
          </div>
          
          {/* Porcentagem */}
          <p className="text-sm font-semibold text-alego-600 dark:text-alego-400">
            {loadingProgress}%
          </p>
        </div>
      </div>
    )
  }

  // Erro
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-8 text-center">
          <div className="text-5xl mb-4">❌</div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white mb-2">Erro</h1>
          <p className="text-slate-600 dark:text-slate-400">{error}</p>
        </div>
      </div>
    )
  }

  // Já tentou
  if (alreadyAttempted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-8 text-center">
          <div className="text-5xl mb-4">⚠️</div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white mb-2">
            Simulado já realizado
          </h1>
          <p className="text-slate-600 dark:text-slate-400 mb-6">
            Este simulado só pode ser realizado uma vez por link.
          </p>
          <button
            onClick={() => navigate('/')}
            className="bg-alego-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-alego-700"
          >
            Voltar ao início
          </button>
        </div>
      </div>
    )
  }

  // Tela de publicidade (após capturar email e ter questões)
  if (showAdScreen && emailSubmitted && questions.length > 0 && !isRunning) {
    return (
      <CourseAdScreen
        onSkip={() => {
          setShowAdScreen(false)
          setIsRunning(true)
        }}
        duration={10}
      />
    )
  }

  // Captura de email
  if (!emailSubmitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-purple-50 dark:from-slate-900 dark:to-slate-800 p-4">
        <div className="max-w-md w-full bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-8 text-center">
          <h1 className="text-3xl font-black text-blue-600 dark:text-blue-400 mb-4">
            Simulado {simuladoData?.courseName ? `para ${simuladoData.courseName}` : ''}
          </h1>
          <p className="text-slate-700 dark:text-slate-300 mb-6">
            Informe seu email para receber o resultado do simulado.
          </p>
          <form onSubmit={handleEmailSubmit} className="space-y-4">
            <div>
              <input
                type="email"
                placeholder="Seu Email"
                value={userEmail}
                onChange={(e) => setUserEmail(e.target.value)}
                className="w-full p-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <button
              type="submit"
              className="w-full bg-blue-600 text-white p-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
            >
              Iniciar Simulado
            </button>
          </form>
        </div>
      </div>
    )
  }

  // Tela de redação
  if (showRedacao && !isFinished) {
    const wordCount = redacaoTexto.trim() ? redacaoTexto.trim().split(/\s+/).length : 0
    const charCount = redacaoTexto.length

    return (
      <div className="min-h-screen py-4">
        <div className="max-w-4xl mx-auto px-4">
          <div className={`rounded-xl p-4 mb-4 ${darkMode ? 'bg-slate-800' : 'bg-white'} shadow-lg`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <ClockIcon className={`h-5 w-5 ${redacaoTimeLeft < 600 ? 'text-red-500' : 'text-alego-600'}`} />
                <span className={`font-bold text-lg ${redacaoTimeLeft < 600 ? 'text-red-500' : ''}`}>
                  {formatTime(redacaoTimeLeft)}
                </span>
              </div>
              <button
                onClick={() => setRedacaoIsRunning(!redacaoIsRunning)}
                className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                {redacaoIsRunning ? <PauseIcon className="h-5 w-5" /> : <PlayIcon className="h-5 w-5" />}
              </button>
            </div>
            <div className="flex items-center justify-between text-sm text-slate-600 dark:text-slate-400 mt-2">
              <span>{charCount} caracteres</span>
              <span>{wordCount} palavras</span>
            </div>
          </div>

          <div className={`rounded-xl p-6 mb-4 ${darkMode ? 'bg-slate-800' : 'bg-white'} shadow-lg border-2 border-alego-600`}>
            <h2 className="text-xl font-bold mb-2 text-alego-600">Tema da Redação</h2>
            <p className="text-lg font-medium text-slate-700 dark:text-slate-300">
              {redacaoTema || 'Carregando tema...'}
            </p>
          </div>

          <div className={`rounded-xl p-6 mb-4 ${darkMode ? 'bg-slate-800' : 'bg-white'} shadow-lg`}>
            <label className="block text-sm font-semibold mb-3 text-slate-700 dark:text-slate-300">
              Sua Redação
            </label>
            <textarea
              value={redacaoTexto}
              onChange={(e) => setRedacaoTexto(e.target.value)}
              placeholder="Comece a escrever sua redação aqui..."
              className="w-full h-96 p-4 rounded-lg border-2 border-slate-300 dark:border-slate-600 focus:border-alego-500 focus:outline-none bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-base leading-relaxed resize-none"
              disabled={analizingRedacao || redacaoTimeLeft === 0}
            />
          </div>

          <button
            onClick={finishRedacao}
            disabled={analizingRedacao || !redacaoTexto.trim()}
            className="w-full bg-green-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {analizingRedacao ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                Analisando redação...
              </>
            ) : (
              <>
                <TrophyIcon className="h-5 w-5" />
                Finalizar Redação
              </>
            )}
          </button>
        </div>
      </div>
    )
  }

  // Tela de resultados
  if (isFinished && results) {
    return (
      <div className="min-h-screen py-8">
        <div className="max-w-4xl mx-auto px-4">
          <div className={`rounded-2xl p-8 ${darkMode ? 'bg-slate-800' : 'bg-white'} shadow-lg`}>
            <h1 className="text-3xl font-bold mb-2 text-alego-600">Resultados do Simulado</h1>

            <div className="mb-6 p-6 bg-gradient-to-r from-alego-600 to-alego-700 rounded-xl text-white">
              <p className="text-sm opacity-90 mb-1">Nota Final</p>
              <p className="text-5xl font-black mb-2">{results.finalScore}</p>
              <p className="text-sm opacity-80">{results.finalScoreText} • Escala: 0 a 10</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 my-6">
              <div className="text-center p-4 bg-green-50 dark:bg-green-900/20 rounded-xl">
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Nota Objetiva</p>
                <p className="text-3xl font-bold text-green-600">{results.objectiveScore}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{results.accuracy}% de acerto</p>
              </div>
              {results.redacao ? (
                <div className="text-center p-4 bg-purple-50 dark:bg-purple-900/20 rounded-xl">
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Nota Redação</p>
                  <p className="text-3xl font-bold text-purple-600">{results.redacao.nota}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">de 10 pontos</p>
                </div>
              ) : null}
              <div className="text-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Acertos</p>
                <p className="text-3xl font-bold text-blue-600">{results.correct}/{results.total}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Questões objetivas</p>
              </div>
            </div>

            {results.redacao && (
              <div className="mb-6 p-6 bg-purple-50 dark:bg-purple-900/20 rounded-xl border border-purple-200 dark:border-purple-800">
                <h3 className="text-xl font-bold mb-4 text-purple-700 dark:text-purple-300">
                  Análise da Redação
                </h3>
                <div className="p-4 bg-white dark:bg-slate-800 rounded-lg">
                  <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed whitespace-pre-wrap">
                    {results.redacao.feedback}
                  </p>
                </div>
              </div>
            )}

            <div className="mb-6">
              <h3 className="font-semibold mb-3">Desempenho por Matéria:</h3>
              <div className="space-y-2">
                {Object.entries(results.byMateria).map(([materia, data]) => {
                  const total = data.correct + data.wrong
                  const accuracy = total > 0 ? ((data.correct / total) * 100).toFixed(1) : 0
                  return (
                    <div key={materia} className="p-3 bg-slate-100 dark:bg-slate-700 rounded-lg">
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-semibold">{materia}</span>
                        <span className="text-sm">{accuracy}%</span>
                      </div>
                      <div className="flex gap-2 text-sm">
                        <span className="text-green-600">✓ {data.correct}</span>
                        <span className="text-red-600">✗ {data.wrong}</span>
                        <span className="text-slate-500">Total: {total}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Exportar resultado */}
            <div className="mb-6">
              <ResultExport
                results={results}
                courseName={simuladoData?.courseName}
                leadName={userEmail ? userEmail.split('@')[0] : 'Candidato'}
              />
            </div>

            <button
              onClick={() => navigate('/')}
              className="w-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-6 py-3 rounded-xl font-semibold hover:bg-slate-300 dark:hover:bg-slate-600"
            >
              Voltar ao início
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Tela do simulado em andamento
  return (
    <div className="min-h-screen py-4">
      <div className="max-w-4xl mx-auto px-4">
        <div className={`rounded-xl p-4 mb-4 ${darkMode ? 'bg-slate-800' : 'bg-white'} shadow-lg`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <ClockIcon className={`h-5 w-5 ${timeLeft < 300 ? 'text-red-500' : 'text-alego-600'}`} />
              <span className={`font-bold text-lg ${timeLeft < 300 ? 'text-red-500' : ''}`}>
                {formatTime(timeLeft)}
              </span>
            </div>
            <button
              onClick={() => setIsRunning(!isRunning)}
              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
            >
              {isRunning ? <PauseIcon className="h-5 w-5" /> : <PlayIcon className="h-5 w-5" />}
            </button>
          </div>
          <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
            <div
              className="bg-alego-600 h-2 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">
            Questão {currentQuestionIndex + 1} de {questions.length} • {answeredCount} respondidas
          </p>
        </div>

        {currentQuestion && (
          <div className={`rounded-xl p-6 mb-4 ${darkMode ? 'bg-slate-800' : 'bg-white'} shadow-lg`}>
            <div className="mb-4">
              <span className="text-sm text-slate-500 dark:text-slate-400">
                {currentQuestion.materia}
              </span>
              <h2 className="text-xl font-bold mt-2">{currentQuestion.enunciado}</h2>
            </div>

            <div className="space-y-3">
              {Object.entries(currentQuestion.alternativas).map(([letra, texto]) => {
                const isSelected = answers[currentQuestionIndex] === letra
                return (
                  <button
                    key={letra}
                    onClick={() => {
                      setAnswers({ ...answers, [currentQuestionIndex]: letra })
                    }}
                    className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                      isSelected
                        ? 'border-alego-600 bg-alego-50 dark:bg-alego-900/20'
                        : 'border-slate-200 dark:border-slate-700 hover:border-alego-400'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-alego-600">{letra})</span>
                      <span>{texto}</span>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div className="flex gap-4">
          <button
            onClick={() => {
              if (currentQuestionIndex > 0) {
                setCurrentQuestionIndex(currentQuestionIndex - 1)
              }
            }}
            disabled={currentQuestionIndex === 0}
            className="flex-1 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-6 py-3 rounded-xl font-semibold hover:bg-slate-300 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <ArrowLeftIcon className="h-5 w-5" />
            Anterior
          </button>
          {currentQuestionIndex < questions.length - 1 ? (
            <button
              onClick={() => {
                if (currentQuestionIndex < questions.length - 1) {
                  setCurrentQuestionIndex(currentQuestionIndex + 1)
                }
              }}
              className="flex-1 bg-alego-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-alego-700 flex items-center justify-center gap-2"
            >
              Próxima
              <ArrowRightIcon className="h-5 w-5" />
            </button>
          ) : (
            <button
              onClick={finishObjectiveQuestions}
              className="flex-1 bg-green-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-green-700 flex items-center justify-center gap-2"
            >
              Finalizar Questões Objetivas
              <ArrowRightIcon className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default SimuladoShare

