import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { doc, getDoc, setDoc, serverTimestamp, collection, onSnapshot, addDoc, getDocs, query, where } from 'firebase/firestore'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { db } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'
import { useDarkMode } from '../hooks/useDarkMode.jsx'
import {
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
  PlayIcon,
  PauseIcon,
  ArrowRightIcon,
  ArrowLeftIcon,
  TrophyIcon,
  ArrowDownIcon,
  ShareIcon,
} from '@heroicons/react/24/outline'

const Simulado = () => {
  const navigate = useNavigate()
  const { user, profile } = useAuth()
  const { darkMode } = useDarkMode()
  const [loading, setLoading] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [simuladoInfo, setSimuladoInfo] = useState(null) // { totalQuestoes, tempoMinutos, materias, descricao }
  const [questions, setQuestions] = useState([])
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [answers, setAnswers] = useState({}) // { questionIndex: 'A' }
  const [timeLeft, setTimeLeft] = useState(0) // em segundos
  const [isRunning, setIsRunning] = useState(false)
  const [isFinished, setIsFinished] = useState(false)
  const [results, setResults] = useState(null)
  const [selectedCourseId, setSelectedCourseId] = useState(null)
  const [courseName, setCourseName] = useState('')
  const [courseCompetition, setCourseCompetition] = useState('')
  const [courseMaterias, setCourseMaterias] = useState([]) // Matérias do curso (dos flashcards)
  const [loadingTip, setLoadingTip] = useState('')
  
  // Estados para redação
  const [showRedacao, setShowRedacao] = useState(false)
  const [redacaoTema, setRedacaoTema] = useState('')
  const [redacaoTexto, setRedacaoTexto] = useState('')
  const [redacaoTimeLeft, setRedacaoTimeLeft] = useState(0)
  const [redacaoIsRunning, setRedacaoIsRunning] = useState(false)
  const [redacaoNota, setRedacaoNota] = useState(null)
  const [analizingRedacao, setAnalizingRedacao] = useState(false)
  const redacaoTextareaRef = useRef(null)
  const [showAdScreen, setShowAdScreen] = useState(false)

  // Dicas durante o carregamento
  const tips = [
    'Relaxe e respire fundo',
    'Leia as questões com atenção',
    'Não se apresse, você tem tempo',
    'Confie no seu conhecimento',
    'Mantenha a calma durante a prova',
    'Revise suas respostas se sobrar tempo',
    'Foque no que você sabe',
    'Não se preocupe com questões difíceis',
  ]

  useEffect(() => {
    if (loading || analyzing) {
      const interval = setInterval(() => {
        setLoadingTip(tips[Math.floor(Math.random() * tips.length)])
      }, 3000)
      return () => clearInterval(interval)
    } else {
      setLoadingTip('')
    }
  }, [loading, analyzing])

  // Carregar curso selecionado e matérias
  useEffect(() => {
    if (!profile) return
    
    const courseFromProfile = profile.selectedCourseId !== undefined ? profile.selectedCourseId : null
    setSelectedCourseId(courseFromProfile)
    
    const loadCourseData = async () => {
      try {
        const courseId = courseFromProfile || 'alego-default'
        const courseDoc = await getDoc(doc(db, 'courses', courseId))
        
        if (courseDoc.exists()) {
          const courseData = courseDoc.data()
          setCourseName(courseData.name || courseData.competition || '')
          setCourseCompetition(courseData.competition || courseData.name || '')
        } else {
          setCourseName('ALEGO Policial Legislativo')
          setCourseCompetition('ALEGO')
        }

        // Carregar matérias do curso (dos flashcards)
        const cardsRef = collection(db, 'flashcards')
        const unsub = onSnapshot(cardsRef, (snapshot) => {
          const cards = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }))

          // Filtrar flashcards do curso
          const courseCards = courseFromProfile
            ? cards.filter(card => card.courseId === courseFromProfile)
            : cards.filter(card => !card.courseId)

          // Extrair matérias únicas
          const materiasSet = new Set()
          courseCards.forEach(card => {
            if (card.materia) {
              materiasSet.add(card.materia)
            }
          })
          
          setCourseMaterias(Array.from(materiasSet))
        })

        return () => unsub()
      } catch (err) {
        console.error('Erro ao carregar dados do curso:', err)
      }
    }
    
    loadCourseData()
  }, [profile])

  // Finalizar questões objetivas e ir para redação
  const finishObjectiveQuestions = async () => {
    setIsRunning(false)
    
    // Calcular resultados das questões objetivas
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

    // Gerar tema de redação e iniciar redação
    await generateRedacaoTheme()
    
    // Definir tempo da redação (padrão: 1 hora = 3600 segundos)
    setRedacaoTimeLeft(3600)
    setRedacaoIsRunning(true)
    setShowRedacao(true)
  }

  // Gerar tema de redação baseado no curso
  const generateRedacaoTheme = async () => {
    try {
      const courseId = selectedCourseId || 'alego-default'
      const editalRef = doc(db, 'courses', courseId, 'prompts', 'edital')
      const editalDoc = await getDoc(editalRef)

      let editalText = ''
      if (editalDoc.exists()) {
        const data = editalDoc.data()
        editalText = (data.prompt || '') + '\n\n' + (data.pdfText || '')
      }

      const apiKey = import.meta.env.VITE_GEMINI_API_KEY
      if (!apiKey) {
        throw new Error('VITE_GEMINI_API_KEY não configurada')
      }

      const genAI = new GoogleGenerativeAI(apiKey)
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' })

      const themePrompt = `Você é um especialista em criar temas de redação para concursos públicos.

CONCURSO ESPECÍFICO: ${courseName || 'Concurso'}${courseCompetition ? ` (${courseCompetition})` : ''}
CARGO: ${courseCompetition || courseName || 'Cargo público'}

${editalText ? `CONTEXTO DO EDITAL:\n${editalText.substring(0, 30000)}\n\n` : ''}

Crie um tema de redação ESPECÍFICO e relevante para o concurso ${courseName || 'mencionado'}${courseCompetition ? ` (${courseCompetition})` : ''}.

INSTRUÇÕES:
- O tema deve ser atual e relevante para o cargo/concurso
- Deve estar relacionado com questões sociais, políticas ou administrativas pertinentes ao cargo
- Seja específico: não use temas genéricos
- O tema deve permitir uma dissertação argumentativa de 25-30 linhas
- Se você tiver conhecimento sobre este concurso específico, use temas típicos dessa área

Retorne APENAS o tema da redação, sem explicações, sem aspas, sem formatação especial.
O tema deve ser claro e direto.

CRÍTICO: Retorne APENAS o tema, nada mais.`

      const result = await model.generateContent(themePrompt)
      let theme = result.response.text().trim()
      
      // Limpar formatação
      theme = theme.replace(/TEMA:/gi, '').trim()
      theme = theme.replace(/"/g, '').trim()
      theme = theme.replace(/^[-•]\s*/, '').trim()
      
      setRedacaoTema(theme)
    } catch (err) {
      console.error('Erro ao gerar tema de redação:', err)
      setRedacaoTema(`A importância da eficiência no serviço público para o cargo de ${courseCompetition || courseName || 'servidor público'}`)
    }
  }

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

  // Analisar e corrigir redação
  const analyzeRedacao = async () => {
    if (!redacaoTexto.trim()) {
      alert('Por favor, escreva sua redação antes de finalizar.')
      return
    }

    // Validar tamanho mínimo da redação
    const wordCount = redacaoTexto.trim().split(/\s+/).length
    const charCount = redacaoTexto.trim().length
    
    if (wordCount < 50 || charCount < 200) {
      // Redação muito curta - dar nota zero
      const zeroResult = {
        nota: 0,
        criterios: {
          dominio: 0,
          compreensao: 0,
          argumentacao: 0,
          estrutura: 0,
          conhecimento: 0
        },
        feedback: `A redação está muito curta (${wordCount} palavras, ${charCount} caracteres). Uma redação de concurso público deve ter no mínimo 200 palavras e desenvolver adequadamente o tema proposto.`
      }
      setRedacaoNota(zeroResult)
      finishSimulado(zeroResult)
      return
    }

    setAnalizingRedacao(true)

    try {
      const courseId = selectedCourseId || 'alego-default'
      const editalRef = doc(db, 'courses', courseId, 'prompts', 'edital')
      const editalDoc = await getDoc(editalRef)

      let editalText = ''
      if (editalDoc.exists()) {
        const data = editalDoc.data()
        editalText = (data.prompt || '') + '\n\n' + (data.pdfText || '')
      }

      const apiKey = import.meta.env.VITE_GEMINI_API_KEY
      if (!apiKey) {
        throw new Error('VITE_GEMINI_API_KEY não configurada')
      }

      const genAI = new GoogleGenerativeAI(apiKey)
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' })

      const analysisPrompt = `Você é um corretor especializado em redações de concursos públicos.

CONCURSO: ${courseName || 'Concurso'}${courseCompetition ? ` (${courseCompetition})` : ''}
TEMA DA REDAÇÃO: ${redacaoTema}

${editalText ? `CONTEXTO DO EDITAL:\n${editalText.substring(0, 30000)}\n\n` : ''}

IMPORTANTE: A redação deve ter no mínimo 200 palavras. Se a redação for muito curta, incompleta ou não desenvolver o tema, atribua nota ZERO.

Analise a seguinte redação e atribua uma nota de 0 a 10 (escala de 0 a 10, não 0 a 1000), seguindo os critérios típicos de concursos públicos:

CRITÉRIOS DE AVALIAÇÃO (cada um de 0 a 2 pontos, totalizando 0 a 10):
1. Domínio da modalidade escrita (0-2 pontos): ortografia, acentuação, pontuação, uso adequado da língua
2. Compreensão do tema (0-2 pontos): adequação ao tema proposto, compreensão da proposta
3. Argumentação (0-2 pontos): qualidade dos argumentos, coerência, capacidade de defender pontos de vista
4. Estrutura textual (0-2 pontos): organização do texto, parágrafos, introdução, desenvolvimento, conclusão
5. Conhecimento sobre o cargo/concurso (0-2 pontos): demonstração de conhecimento sobre a área, atualidade, relevância

REDAÇÃO DO CANDIDATO:
${redacaoTexto}

Retorne APENAS um objeto JSON válido no seguinte formato (NOTA DE 0 A 10):

{
  "nota": 7.5,
  "criterios": {
    "dominio": 1.6,
    "compreensao": 1.7,
    "argumentacao": 1.8,
    "estrutura": 1.5,
    "conhecimento": 0.9
  },
  "feedback": "Feedback geral sobre a redação, destacando pontos positivos e áreas de melhoria (máximo 200 palavras)"
}

CRÍTICO: 
- A nota total deve ser de 0 a 10 (não 0 a 1000)
- Cada critério deve ser de 0 a 2 pontos
- Se a redação for muito curta ou não desenvolver o tema, dê nota ZERO
- Retorne APENAS o JSON, sem markdown, sem explicações.`

      const result = await model.generateContent(analysisPrompt)
      let responseText = result.response.text().trim()

      // Extrair JSON
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
      
      // Finalizar com nota da redação
      finishSimulado(parsed)
    } catch (err) {
      console.error('Erro ao analisar redação:', err)
      alert('Erro ao analisar redação. Tente novamente.')
      setAnalizingRedacao(false)
    }
  }

  // Finalizar redação (chamado quando tempo acaba ou usuário finaliza)
  const finishRedacao = () => {
    setRedacaoIsRunning(false)
    if (redacaoTexto.trim()) {
      analyzeRedacao()
    } else {
      // Se não escreveu nada, finalizar sem nota de redação
      finishSimulado(null)
    }
  }

  // Finalizar simulado completo (objetivo + redação)
  const finishSimulado = (redacaoResult = null) => {
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

    // Nota final combinada
    let finalScore = parseFloat(objectiveScore)
    let finalScoreText = 'Apenas objetiva'
    
    if (redacaoResult && redacaoResult.nota !== undefined) {
      // Converter nota da redação para escala 0-10 se necessário
      let redacaoNota = parseFloat(redacaoResult.nota)
      
      // Se a nota vier em escala 0-1000, converter para 0-10
      if (redacaoNota > 10) {
        redacaoNota = redacaoNota / 100
      }
      
      // Média ponderada: 70% objetiva + 30% redação
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
      timeSpent: simuladoInfo.tempoMinutos * 60 - timeLeft,
      redacaoTimeSpent: 3600 - redacaoTimeLeft,
      completedAt: new Date().toISOString(),
    }

    setResults(resultsData)

    // Salvar resultados no Firestore
    if (user) {
      const courseKey = selectedCourseId || 'alego'
      const statsRef = doc(db, 'questoesStats', `${user.uid}_${courseKey}`)
      setDoc(statsRef, {
        ...resultsData,
        courseId: selectedCourseId,
        type: 'simulado',
        updatedAt: serverTimestamp(),
      }, { merge: true })
    }
    
    setAnalizingRedacao(false)
  }

  // Timer
  useEffect(() => {
    if (!isRunning || timeLeft <= 0) {
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

  // Analisar edital e extrair informações do simulado
  const analyzeEdital = async () => {
    if (!selectedCourseId && selectedCourseId !== null) {
      alert('Selecione um curso primeiro')
      return
    }

    setAnalyzing(true)
    setLoading(true)

    try {
      const courseId = selectedCourseId || 'alego-default'
      const editalRef = doc(db, 'courses', courseId, 'prompts', 'edital')
      const editalDoc = await getDoc(editalRef)

      let editalText = ''
      if (editalDoc.exists()) {
        const data = editalDoc.data()
        editalText = (data.prompt || '') + '\n\n' + (data.pdfText || '')
      } else {
        // Fallback
        const oldEditalDoc = await getDoc(doc(db, 'config', 'edital'))
        if (oldEditalDoc.exists()) {
          const data = oldEditalDoc.data()
          editalText = (data.prompt || '') + '\n\n' + (data.pdfText || '')
        }
      }

      if (!editalText.trim()) {
        throw new Error('Edital não encontrado. Configure o edital do curso primeiro no painel administrativo.')
      }

      const apiKey = import.meta.env.VITE_GEMINI_API_KEY
      if (!apiKey) {
        throw new Error('VITE_GEMINI_API_KEY não configurada')
      }

      const genAI = new GoogleGenerativeAI(apiKey)
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' })

      // Informações do curso para contexto
      const courseContext = courseName ? `\n\nCONCURSO ESPECÍFICO: ${courseName}${courseCompetition && courseCompetition !== courseName ? ` (${courseCompetition})` : ''}` : ''
      const materiasContext = courseMaterias.length > 0 ? `\n\nMATÉRIAS DO CURSO (USE APENAS ESTAS): ${courseMaterias.join(', ')}` : ''

      const analysisPrompt = `Você é um especialista em análise de editais de concursos públicos.

${courseContext}

${materiasContext}

⚠️ REGRA CRÍTICA: Use APENAS as matérias listadas acima. NÃO invente matérias que não estão no curso.

INSTRUÇÕES IMPORTANTES:
- Este simulado é ESPECÍFICO para o concurso ${courseName || 'mencionado'}${courseCompetition ? ` (${courseCompetition})` : ''}
- Você DEVE analisar o edital pensando APENAS neste concurso específico
- NÃO use informações genéricas de outros concursos
- Baseie-se EXCLUSIVAMENTE no edital fornecido abaixo
- Se você tiver conhecimento sobre este concurso específico (de plataformas como GRAN, QConcurso, etc), use esse conhecimento para complementar a análise
- Considere o formato de prova, estilo da banca, e características específicas deste concurso
- Se o edital não especificar algo, use informações conhecidas sobre este concurso específico

Analise o edital abaixo e extraia as seguintes informações sobre a prova:

EDITAL:
${editalText.substring(0, 100000)}${editalText.length > 100000 ? '\n\n[... conteúdo truncado ...]' : ''}

TAREFA: Extrair informações sobre a prova objetiva do concurso ${courseName || 'especificado'}:

1. NÚMERO TOTAL DE QUESTÕES da prova objetiva
2. TEMPO DETERMINADO para a prova (em minutos)
3. MATÉRIAS que serão cobradas - APENAS as matérias que estão na lista acima
4. DISTRIBUIÇÃO DE QUESTÕES por matéria (quantas questões de cada matéria)
5. DESCRIÇÃO breve do formato da prova

IMPORTANTE:
- Se o edital não especificar o tempo, use 4 horas (240 minutos) como padrão
- Se não especificar número de questões, use 50 questões como padrão
- Liste APENAS as matérias que estão na lista de matérias do curso acima
- NÃO inclua matérias que não estão na lista
- Se não houver distribuição específica, distribua igualmente entre as matérias do curso
- Se o edital mencionar outras matérias que não estão na lista, IGNORE-AS

Retorne APENAS um objeto JSON válido no seguinte formato:

{
  "totalQuestoes": 50,
  "tempoMinutos": 240,
  "materias": [
    {
      "nome": "Português",
      "quantidadeQuestoes": 10
    },
    {
      "nome": "Matemática",
      "quantidadeQuestoes": 10
    }
  ],
  "descricao": "Prova objetiva com 50 questões, tempo de 4 horas"
}

CRÍTICO: Retorne APENAS o JSON, sem markdown, sem explicações.`

      const result = await model.generateContent(analysisPrompt)
      const responseText = result.response.text().trim()

      // Extrair JSON
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
      
      // Validar e filtrar matérias - APENAS as que estão no curso
      if (parsed.materias && Array.isArray(parsed.materias)) {
        if (courseMaterias.length > 0) {
          // Filtrar apenas matérias do curso
          const validMaterias = parsed.materias.filter(m => 
            courseMaterias.some(cm => 
              cm.toLowerCase().trim() === m.nome.toLowerCase().trim()
            )
          )
          
          if (validMaterias.length === 0) {
            throw new Error(`Nenhuma matéria válida encontrada. Matérias do curso: ${courseMaterias.join(', ')}. Matérias do edital: ${parsed.materias.map(m => m.nome).join(', ')}`)
          }
          
          // Recalcular distribuição se necessário
          const totalQuestoes = parsed.totalQuestoes || 50
          const questoesPorMateria = Math.floor(totalQuestoes / validMaterias.length)
          const resto = totalQuestoes % validMaterias.length
          
          parsed.materias = validMaterias.map((m, idx) => ({
            ...m,
            quantidadeQuestoes: questoesPorMateria + (idx < resto ? 1 : 0)
          }))
          
          parsed.totalQuestoes = parsed.materias.reduce((sum, m) => sum + m.quantidadeQuestoes, 0)
          
          console.log('✅ Matérias filtradas:', parsed.materias.map(m => `${m.nome} (${m.quantidadeQuestoes})`).join(', '))
        }
      }
      
      setSimuladoInfo(parsed)
    } catch (err) {
      console.error('Erro ao analisar edital:', err)
      alert(`Erro ao analisar edital: ${err.message}`)
    } finally {
      setAnalyzing(false)
      setLoading(false)
    }
  }

  // Gerar questões do simulado
  const generateSimulado = async () => {
    if (!simuladoInfo) return

    setLoading(true)

    try {
      const courseId = selectedCourseId || 'alego-default'
      
      // Buscar dados do curso (incluindo link de referência)
      const courseRef = doc(db, 'courses', courseId)
      const courseDoc = await getDoc(courseRef)
      const courseData = courseDoc.exists() ? courseDoc.data() : null
      const referenceLink = courseData?.referenceLink || ''
      
      // Buscar edital
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

      const apiKey = import.meta.env.VITE_GEMINI_API_KEY
      if (!apiKey) {
        throw new Error('VITE_GEMINI_API_KEY não configurada')
      }

      const genAI = new GoogleGenerativeAI(apiKey)
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' })

      // Filtrar matérias - APENAS as que estão no curso
      const validMaterias = simuladoInfo.materias.filter(m => 
        courseMaterias.length === 0 || courseMaterias.includes(m.nome)
      )

      if (validMaterias.length === 0) {
        throw new Error(`Nenhuma matéria válida encontrada. Matérias do curso: ${courseMaterias.join(', ') || 'nenhuma'}`)
      }

      // Gerar questões para cada matéria válida
      const allQuestions = []
      
      for (const materia of validMaterias) {
        if (!courseMaterias.includes(materia.nome) && courseMaterias.length > 0) {
          console.warn(`⚠️ Matéria "${materia.nome}" não está no curso, pulando...`)
          continue
        }

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

CONCURSO ESPECÍFICO: ${courseName || 'Concurso'}${courseCompetition ? ` (${courseCompetition})` : ''}

⚠️ ATENÇÃO CRÍTICA: Este simulado é para o concurso ${courseName || 'especificado'}${courseCompetition ? ` (${courseCompetition})` : ''}. 
Você DEVE criar questões ESPECÍFICAS para este concurso, baseadas PRINCIPALMENTE nos flashcards do curso.

${flashcardsContext}

${flashcardsText}

REGRAS CRÍTICAS PARA CRIAÇÃO DAS QUESTÕES:
1. BASEIE-SE PRINCIPALMENTE nos flashcards acima - as questões devem testar o conhecimento presente nos flashcards
2. Use o conteúdo dos flashcards como referência principal para criar questões relacionadas
3. As questões devem cobrir os mesmos tópicos e conceitos presentes nos flashcards
4. Se houver flashcards específicos da matéria "${materia.nome}", use APENAS esses como base
5. Se não houver flashcards específicos da matéria, use os flashcards gerais do curso

INSTRUÇÕES ESPECIAIS:
- Se você tiver conhecimento sobre este concurso específico (de plataformas como GRAN, QConcurso, Estratégia Concursos, etc), use esse conhecimento
- Considere o estilo da banca examinadora deste concurso
- Questões devem refletir o nível de dificuldade e formato típico deste concurso
- Use terminologia e contexto específicos deste concurso quando aplicável

Crie ${materia.quantidadeQuestoes} questões FICTÍCIAS de múltipla escolha no estilo FGV para a matéria "${materia.nome}" do concurso ${courseName || 'especificado'}${courseCompetition ? ` (${courseCompetition})` : ''}.

${linkContext}

${editalText ? `CONTEXTO DO EDITAL DO CONCURSO ${courseName || ''}:\n${editalText.substring(0, 30000)}\n\n` : ''}

REGRAS CRÍTICAS:
- Questões devem ser ESPECÍFICAS para o concurso ${courseName || 'mencionado'}
- Baseie-se EXCLUSIVAMENTE no edital fornecido acima
- NÃO use conteúdo de outros concursos ou matérias genéricas
- Estilo FGV: questões objetivas, claras, com alternativas bem elaboradas
- Cada questão deve ter 5 alternativas (A, B, C, D, E)
- Apenas UMA alternativa está correta
- As alternativas incorretas devem ser plausíveis (distratores inteligentes)
- Questões devem ser FICTÍCIAS (não são questões reais de provas anteriores)
- Dificuldade: nível FGV (intermediário a avançado)
- Enunciados claros e objetivos
- Foque no conteúdo específico do edital deste concurso
- Se o edital mencionar tópicos específicos para "${materia.nome}", use APENAS esses tópicos

FORMATO DE RESPOSTA (OBRIGATÓRIO - APENAS JSON):
Retorne APENAS um objeto JSON válido:

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
      setQuestions(allQuestions)
      setTimeLeft(simuladoInfo.tempoMinutos * 60)
      setIsRunning(true)
      setCurrentQuestionIndex(0)
      setAnswers({})
      setIsFinished(false)
      setResults(null)
    } catch (err) {
      console.error('Erro ao gerar simulado:', err)
      alert(`Erro ao gerar simulado: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  // Formatar tempo
  const formatTime = (seconds) => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`
  }

  // Função para inserir texto na posição do cursor
  const insertTextAtCursor = (textToInsert) => {
    const textarea = redacaoTextareaRef.current
    if (!textarea) return

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const textBefore = redacaoTexto.substring(0, start)
    const textAfter = redacaoTexto.substring(end)
    const newText = textBefore + textToInsert + textAfter

    setRedacaoTexto(newText)

    // Reposicionar cursor após o texto inserido
    setTimeout(() => {
      const newPosition = start + textToInsert.length
      textarea.focus()
      textarea.setSelectionRange(newPosition, newPosition)
    }, 0)
  }

  // Função para adicionar quebra de linha simples
  const addLineBreak = () => {
    insertTextAtCursor('\n')
  }

  const currentQuestion = questions[currentQuestionIndex]
  const progress = questions.length > 0 ? ((currentQuestionIndex + 1) / questions.length) * 100 : 0
  const answeredCount = Object.keys(answers).length

  // Tela de análise do edital
  if (!simuladoInfo && !analyzing) {
    return (
      <div className="min-h-screen py-8">
        <div className="max-w-4xl mx-auto px-4">
          <div className={`rounded-2xl p-8 ${darkMode ? 'bg-slate-800' : 'bg-white'} shadow-lg`}>
            <h1 className="text-3xl font-bold mb-2 text-alego-600">Simulado</h1>
            <p className="text-slate-600 dark:text-slate-400 mb-6">
              {courseName ? `Simulado para ${courseName}` : 'Simulado baseado no edital do curso'}
            </p>

            <div className="space-y-4">
              <p className="text-slate-700 dark:text-slate-300">
                A IA irá analisar o edital do curso <strong>{courseName || 'selecionado'}</strong> e extrair informações sobre:
              </p>
              <ul className="list-disc list-inside space-y-2 text-slate-600 dark:text-slate-400 ml-4">
                <li>Número total de questões da prova</li>
                <li>Tempo determinado para a prova</li>
                <li>Matérias que serão cobradas (apenas do curso)</li>
                <li>Distribuição de questões por matéria</li>
              </ul>

              {courseMaterias.length > 0 && (
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <p className="text-sm font-semibold text-blue-700 dark:text-blue-300 mb-2">
                    Matérias do curso:
                  </p>
                  <p className="text-sm text-blue-600 dark:text-blue-400">
                    {courseMaterias.join(', ')}
                  </p>
                </div>
              )}

              <button
                onClick={analyzeEdital}
                disabled={loading || analyzing}
                className="w-full mt-6 bg-alego-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-alego-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {analyzing ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                    Analisando edital...
                  </>
                ) : (
                  <>
                    <PlayIcon className="h-5 w-5" />
                    Analisar Edital e Preparar Simulado
                  </>
                )}
              </button>

              {analyzing && loadingTip && (
                <div className="mt-4 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                  <p className="text-sm text-green-700 dark:text-green-300 text-center font-medium">
                    💡 {loadingTip}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Tela de informações do simulado
  if (simuladoInfo && questions.length === 0) {
    return (
      <div className="min-h-screen py-8">
        <div className="max-w-4xl mx-auto px-4">
          <div className={`rounded-2xl p-8 ${darkMode ? 'bg-slate-800' : 'bg-white'} shadow-lg`}>
            <h1 className="text-3xl font-bold mb-2 text-alego-600">Simulado Preparado</h1>
            <p className="text-slate-600 dark:text-slate-400 mb-6">{simuladoInfo.descricao}</p>

            <div className="space-y-4 mb-6">
              <div className="flex items-center gap-2">
                <ClockIcon className="h-5 w-5 text-alego-600" />
                <span className="font-semibold">Tempo: {simuladoInfo.tempoMinutos} minutos</span>
              </div>
              <div className="flex items-center gap-2">
                <TrophyIcon className="h-5 w-5 text-alego-600" />
                <span className="font-semibold">Total de questões: {simuladoInfo.totalQuestoes}</span>
              </div>
            </div>

            <div className="mb-6">
              <h3 className="font-semibold mb-3">Matérias e distribuição:</h3>
              <div className="space-y-2">
                {simuladoInfo.materias.map((materia, idx) => (
                  <div key={idx} className="flex justify-between items-center p-3 bg-slate-100 dark:bg-slate-700 rounded-lg">
                    <span>{materia.nome}</span>
                    <span className="font-semibold">{materia.quantidadeQuestoes} questões</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              {profile?.role === 'admin' && (
                <button
                  onClick={async () => {
                    try {
                      // Salvar simulado no Firestore para compartilhamento (sem questões ainda)
                      const sharedSimuladoRef = collection(db, 'sharedSimulados')
                      const simuladoDoc = await addDoc(sharedSimuladoRef, {
                        simuladoInfo: simuladoInfo,
                        courseId: selectedCourseId,
                        courseName: courseName || courseCompetition,
                        hasRedacao: true, // Assumir que tem redação
                        sharedBy: user.uid,
                        sharedAt: serverTimestamp(),
                        attempts: [],
                        maxAttempts: 1,
                        questions: null, // Questões serão geradas quando alguém acessar
                      })

                      // Criar link compartilhável
                      const shareUrl = `${window.location.origin}/simulado-share/${simuladoDoc.id}`
                      
                      // Texto para WhatsApp
                      const whatsappText = `📝 Simulado: ${courseName || courseCompetition || 'Concurso'}\n\n${simuladoInfo?.totalQuestoes || 0} questões | ${simuladoInfo?.tempoMinutos || 240} minutos\n\nFaça o simulado: ${shareUrl}`
                      
                      // Abrir WhatsApp
                      window.open(`https://wa.me/?text=${encodeURIComponent(whatsappText)}`, '_blank')
                      
                      setMessage('✅ Simulado compartilhado! Link copiado para o WhatsApp.')
                    } catch (err) {
                      console.error('Erro ao compartilhar simulado:', err)
                      setMessage('❌ Erro ao compartilhar simulado. Tente novamente.')
                    }
                  }}
                  className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-green-600 to-green-700 text-white px-6 py-3 rounded-xl font-semibold hover:from-green-700 hover:to-green-800 shadow-lg hover:shadow-xl transition-all"
                >
                  <ShareIcon className="h-5 w-5" />
                  Compartilhar Simulado
                </button>
              )}
              <button
                onClick={() => {
                  setShowAdScreen(true)
                }}
                disabled={loading}
                className="flex-1 bg-alego-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-alego-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                    Gerando simulado...
                  </>
                ) : (
                  <>
                    <PlayIcon className="h-5 w-5" />
                    Iniciar Simulado
                  </>
                )}
              </button>
            </div>

            {loading && loadingTip && (
              <div className="mt-4 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                <p className="text-sm text-green-700 dark:text-green-300 text-center font-medium">
                  💡 {loadingTip}
                </p>
              </div>
            )}
          </div>
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
          {/* Header com timer */}
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

          {/* Tema da redação */}
          <div className={`rounded-xl p-6 mb-4 ${darkMode ? 'bg-slate-800' : 'bg-white'} shadow-lg border-2 border-alego-600`}>
            <h2 className="text-xl font-bold mb-2 text-alego-600">Tema da Redação</h2>
            <p className="text-lg font-medium text-slate-700 dark:text-slate-300">
              {redacaoTema || 'Carregando tema...'}
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
              Escreva uma dissertação argumentativa de 25 a 30 linhas sobre o tema proposto.
            </p>
          </div>

          {/* Editor de redação */}
          <div className={`rounded-xl p-6 mb-4 ${darkMode ? 'bg-slate-800' : 'bg-white'} shadow-lg`}>
            <label className="block text-sm font-semibold mb-3 text-slate-700 dark:text-slate-300">
              Sua Redação
            </label>
            <textarea
              ref={redacaoTextareaRef}
              value={redacaoTexto}
              onChange={(e) => setRedacaoTexto(e.target.value)}
              placeholder="Comece a escrever sua redação aqui..."
              className="w-full h-96 p-4 rounded-lg border-2 border-slate-300 dark:border-slate-600 focus:border-alego-500 focus:outline-none bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-base leading-relaxed resize-none font-serif"
              disabled={analizingRedacao || redacaoTimeLeft === 0}
            />
            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="text-slate-500 dark:text-slate-400">
                Mínimo recomendado: 25 linhas
              </span>
              <span className={`font-semibold ${wordCount < 200 ? 'text-orange-500' : wordCount > 500 ? 'text-blue-500' : 'text-green-500'}`}>
                {wordCount >= 200 && wordCount <= 500 ? '✓ Tamanho adequado' : wordCount < 200 ? '⚠ Muito curta' : '⚠ Muito longa'}
              </span>
            </div>
          </div>

          {/* Botões */}
          <div className="flex gap-4">
            <button
              onClick={finishRedacao}
              disabled={analizingRedacao || !redacaoTexto.trim()}
              className="flex-1 bg-green-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {analizingRedacao ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                  Analisando redação...
                </>
              ) : (
                <>
                  <TrophyIcon className="h-5 w-5" />
                  Finalizar Redação e Ver Resultado
                </>
              )}
            </button>
          </div>
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

            {/* Nota Final */}
            <div className="mb-6 p-6 bg-gradient-to-r from-alego-600 to-alego-700 rounded-xl text-white">
              <p className="text-sm opacity-90 mb-1">Nota Final</p>
              <p className="text-5xl font-black mb-2">{results.finalScore}</p>
              <p className="text-sm opacity-80">{results.finalScoreText}</p>
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
              ) : (
                <div className="text-center p-4 bg-slate-100 dark:bg-slate-700 rounded-xl">
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Nota Redação</p>
                  <p className="text-2xl font-bold text-slate-400">-</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Não realizada</p>
                </div>
              )}
              <div className="text-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Acertos</p>
                <p className="text-3xl font-bold text-blue-600">{results.correct}/{results.total}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Questões objetivas</p>
              </div>
            </div>

            {/* Feedback da Redação */}
            {results.redacao && (
              <div className="mb-6 p-6 bg-purple-50 dark:bg-purple-900/20 rounded-xl border border-purple-200 dark:border-purple-800">
                <h3 className="text-xl font-bold mb-4 text-purple-700 dark:text-purple-300">
                  Análise da Redação
                </h3>
                
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
                  <div className="text-center p-3 bg-white dark:bg-slate-800 rounded-lg">
                    <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">Domínio</p>
                    <p className="text-lg font-bold text-purple-600">{results.redacao.criterios.dominio}</p>
                  </div>
                  <div className="text-center p-3 bg-white dark:bg-slate-800 rounded-lg">
                    <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">Compreensão</p>
                    <p className="text-lg font-bold text-purple-600">{results.redacao.criterios.compreensao}</p>
                  </div>
                  <div className="text-center p-3 bg-white dark:bg-slate-800 rounded-lg">
                    <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">Argumentação</p>
                    <p className="text-lg font-bold text-purple-600">{results.redacao.criterios.argumentacao}</p>
                  </div>
                  <div className="text-center p-3 bg-white dark:bg-slate-800 rounded-lg">
                    <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">Estrutura</p>
                    <p className="text-lg font-bold text-purple-600">{results.redacao.criterios.estrutura}</p>
                  </div>
                  <div className="text-center p-3 bg-white dark:bg-slate-800 rounded-lg">
                    <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">Conhecimento</p>
                    <p className="text-lg font-bold text-purple-600">{results.redacao.criterios.conhecimento}</p>
                  </div>
                </div>

                <div className="p-4 bg-white dark:bg-slate-800 rounded-lg">
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                    Feedback:
                  </p>
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

            <div className="flex gap-4">
              {profile?.role === 'admin' && (
                <button
                  onClick={async () => {
                    try {
                      // Salvar simulado no Firestore para compartilhamento
                      const sharedSimuladoRef = collection(db, 'sharedSimulados')
                      const simuladoDoc = await addDoc(sharedSimuladoRef, {
                        questions: questions,
                        simuladoInfo: simuladoInfo,
                        courseId: selectedCourseId,
                        courseName: courseName || courseCompetition,
                        hasRedacao: !!results.redacao,
                        sharedBy: user.uid,
                        sharedAt: serverTimestamp(),
                        attempts: [],
                        maxAttempts: 1,
                      })

                      // Criar link compartilhável
                      const shareUrl = `${window.location.origin}/simulado-share/${simuladoDoc.id}`
                      
                      // Texto para WhatsApp
                      const whatsappText = `📝 Simulado: ${courseName || courseCompetition || 'Concurso'}\n\n${simuladoInfo?.totalQuestoes || questions.length} questões | ${simuladoInfo?.tempoMinutos || 240} minutos\n\nFaça o simulado: ${shareUrl}`
                      
                      // Abrir WhatsApp
                      window.open(`https://wa.me/?text=${encodeURIComponent(whatsappText)}`, '_blank')
                      
                      alert('✅ Simulado compartilhado! Link copiado para o WhatsApp.')
                    } catch (err) {
                      console.error('Erro ao compartilhar simulado:', err)
                      alert('❌ Erro ao compartilhar simulado. Tente novamente.')
                    }
                  }}
                  className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-green-600 to-green-700 text-white px-6 py-3 rounded-xl font-semibold hover:from-green-700 hover:to-green-800 shadow-lg hover:shadow-xl transition-all"
                >
                  <ShareIcon className="h-5 w-5" />
                  Compartilhar Simulado
                </button>
              )}
              <button
                onClick={() => {
                  setSimuladoInfo(null)
                  setQuestions([])
                  setResults(null)
                  setIsFinished(false)
                  setAnswers({})
                  setShowRedacao(false)
                  setRedacaoTema('')
                  setRedacaoTexto('')
                  setRedacaoTimeLeft(0)
                  setRedacaoIsRunning(false)
                  setRedacaoNota(null)
                  setAnalizingRedacao(false)
                }}
                className="flex-1 bg-alego-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-alego-700"
              >
                Fazer Novo Simulado
              </button>
              <button
                onClick={() => navigate('/dashboard')}
                className="flex-1 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-6 py-3 rounded-xl font-semibold hover:bg-slate-300 dark:hover:bg-slate-600"
              >
                Voltar ao Dashboard
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Tela de publicidade de cursos (antes de iniciar)
  if (showAdScreen && !loading && questions.length === 0) {
    return (
      <CourseAdScreen
        onSkip={() => {
          setShowAdScreen(false)
          generateSimulado()
        }}
        duration={10}
      />
    )
  }

  // Tela do simulado em andamento
  return (
    <div className="min-h-screen py-4">
      <div className="max-w-4xl mx-auto px-4">
        {/* Header com timer e progresso */}
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

        {/* Questão atual */}
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
                const isCorrect = letra === currentQuestion.correta
                const showResult = isFinished

                return (
                  <button
                    key={letra}
                    onClick={() => {
                      if (!showResult) {
                        setAnswers({ ...answers, [currentQuestionIndex]: letra })
                      }
                    }}
                    disabled={showResult}
                    className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                      isSelected
                        ? showResult
                          ? isCorrect
                            ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                            : 'border-red-500 bg-red-50 dark:bg-red-900/20'
                          : 'border-alego-600 bg-alego-50 dark:bg-alego-900/20'
                        : showResult && isCorrect
                        ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                        : 'border-slate-200 dark:border-slate-700 hover:border-alego-400'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-alego-600">{letra})</span>
                      <span>{texto}</span>
                      {showResult && isCorrect && (
                        <CheckCircleIcon className="h-5 w-5 text-green-500 ml-auto" />
                      )}
                      {showResult && isSelected && !isCorrect && (
                        <XCircleIcon className="h-5 w-5 text-red-500 ml-auto" />
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Navegação */}
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
              Finalizar Questões Objetivas e Ir para Redação
              <ArrowRightIcon className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default Simulado

