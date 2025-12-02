import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { db } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'
import { useDarkMode } from '../hooks/useDarkMode.jsx'
import { FolderIcon, ChevronRightIcon, ChevronDownIcon, LightBulbIcon, CheckCircleIcon, XCircleIcon, HandThumbUpIcon, HandThumbDownIcon } from '@heroicons/react/24/outline'
import { 
  getOrCreateQuestionsCache, 
  saveQuestionsCache, 
  rateQuestionsCache,
  rateIndividualQuestion,
  removeBadQuestion,
  getOrCreateExplanationCache,
  saveExplanationCache,
  rateExplanationCache,
  autoRemoveBadCache
} from '../utils/cache'

const MATERIAS = [
  'Português',
  'Área de Atuação (PL)',
  'Raciocínio Lógico',
  'Constitucional',
  'Administrativo',
  'Legislação Estadual',
  'Realidade de Goiás',
  'Redação',
]

const FlashQuestoes = () => {
  const navigate = useNavigate()
  const { user, profile } = useAuth()
  const { darkMode } = useDarkMode()
  const [cards, setCards] = useState([])
  const [selectedMateria, setSelectedMateria] = useState(null)
  const [selectedModulo, setSelectedModulo] = useState(null)
  const [expandedMaterias, setExpandedMaterias] = useState({})
  const [questions, setQuestions] = useState([])
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [selectedAnswer, setSelectedAnswer] = useState(null)
  const [showResult, setShowResult] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [stats, setStats] = useState({ correct: 0, wrong: 0, byMateria: {} })
  const [showBizu, setShowBizu] = useState({})
  const [bizuLoading, setBizuLoading] = useState({})
  const [bizuText, setBizuText] = useState({})
  const [editalPrompt, setEditalPrompt] = useState('')
  const [questoesConfigPrompt, setQuestoesConfigPrompt] = useState('')
  const [bizuConfigPrompt, setBizuConfigPrompt] = useState('')
  const [selectedCourseId, setSelectedCourseId] = useState(null) // Curso selecionado (null = ALEGO padrão)
  const [availableCourses, setAvailableCourses] = useState([]) // Cursos disponíveis para o usuário
  const [selectedCourse, setSelectedCourse] = useState(null) // Dados completos do curso selecionado

  // Usar curso selecionado do perfil do usuário
  useEffect(() => {
    if (!profile) return
    
    // Usar curso selecionado do perfil (pode ser null para ALEGO padrão)
    const courseFromProfile = profile.selectedCourseId !== undefined ? profile.selectedCourseId : null
    setSelectedCourseId(courseFromProfile)
    
    // Carregar lista de cursos disponíveis (para mostrar no seletor de troca)
    const purchasedCourses = profile.purchasedCourses || []
    const isAdmin = profile.role === 'admin'
    
    const coursesRef = collection(db, 'courses')
    const unsub = onSnapshot(coursesRef, (snapshot) => {
      const allCourses = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }))
      
      // Filtrar apenas cursos comprados (ou todos se admin)
      const filtered = isAdmin 
        ? allCourses.filter(c => c.active !== false)
        : allCourses.filter(c => purchasedCourses.includes(c.id) && c.active !== false)
      
      setAvailableCourses(filtered)
      
      // Encontrar curso selecionado
      if (courseFromProfile) {
        const course = allCourses.find(c => c.id === courseFromProfile)
        setSelectedCourse(course || null)
      } else {
        setSelectedCourse(null) // ALEGO padrão
      }
    }, (error) => {
      console.error('Erro ao carregar cursos:', error)
      setAvailableCourses([])
      setSelectedCourse(null)
    })
    
    return () => unsub()
  }, [profile])
  
  // Carregar flashcards para obter módulos (filtrado por curso)
  useEffect(() => {
    if (!user || !profile) return
    
    const cardsRef = collection(db, 'flashcards')
    const unsub = onSnapshot(cardsRef, (snapshot) => {
      const purchasedCourses = profile.purchasedCourses || []
      const isAdmin = profile.role === 'admin'
      
      let data = snapshot.docs.map((docSnapshot) => ({
        id: docSnapshot.id,
        ...docSnapshot.data(),
      }))
      
      // Filtrar por curso selecionado
      if (selectedCourseId) {
        // Mostrar apenas flashcards do curso selecionado
        data = data.filter(card => card.courseId === selectedCourseId)
      } else {
        // Mostrar apenas flashcards sem courseId (ALEGO padrão)
        data = data.filter(card => !card.courseId)
      }
      
      // Admin vê todos, mas ainda filtra por curso selecionado
      if (!isAdmin && selectedCourseId) {
        // Verificar se o usuário comprou o curso selecionado
        if (!purchasedCourses.includes(selectedCourseId)) {
          data = []
        }
      }
      
      setCards(data)
    })
    return () => unsub()
  }, [user, profile, selectedCourseId])

  // Carregar edital/PDF (por curso)
  useEffect(() => {
    const fetchPrompt = async () => {
      try {
        const courseId = selectedCourseId || 'alego-default'
        const promptRef = doc(db, 'courses', courseId, 'prompts', 'edital')
        const promptDoc = await getDoc(promptRef)
        
        if (promptDoc.exists()) {
          const data = promptDoc.data()
          let combinedText = ''
          if (data.prompt || data.content) {
            combinedText += data.prompt || data.content || ''
          }
          if (data.pdfText) {
            if (combinedText) combinedText += '\n\n'
            const totalLength = data.pdfText.length
            if (totalLength <= 20000) {
              combinedText += data.pdfText
            } else {
              const inicio = data.pdfText.substring(0, 15000)
              const fim = data.pdfText.substring(totalLength - 5000)
              combinedText += `${inicio}\n\n[... conteúdo intermediário omitido ...]\n\n${fim}`
            }
          }
          setEditalPrompt(combinedText)
        } else {
          // Fallback para config antigo (migração)
          const oldPromptDoc = await getDoc(doc(db, 'config', 'edital'))
          if (oldPromptDoc.exists()) {
            const data = oldPromptDoc.data()
            let combinedText = ''
            if (data.prompt || data.content) {
              combinedText += data.prompt || data.content || ''
            }
            if (data.pdfText) {
              if (combinedText) combinedText += '\n\n'
              const totalLength = data.pdfText.length
              if (totalLength <= 20000) {
                combinedText += data.pdfText
              } else {
                const inicio = data.pdfText.substring(0, 15000)
                const fim = data.pdfText.substring(totalLength - 5000)
                combinedText += `${inicio}\n\n[... conteúdo intermediário omitido ...]\n\n${fim}`
              }
            }
            setEditalPrompt(combinedText)
          }
        }
      } catch (err) {
        console.error('Erro ao carregar edital:', err)
      }
    }
    fetchPrompt()
  }, [selectedCourseId])

  // Carregar configurações de questões e BIZUs (por curso)
  useEffect(() => {
    const fetchQuestoesConfig = async () => {
      try {
        const courseId = selectedCourseId || 'alego-default'
        const questoesRef = doc(db, 'courses', courseId, 'prompts', 'questoes')
        const questoesDoc = await getDoc(questoesRef)
        
        if (questoesDoc.exists()) {
          const data = questoesDoc.data()
          setQuestoesConfigPrompt(data.prompt || '')
          setBizuConfigPrompt(data.bizuPrompt || '')
        } else {
          // Fallback para config antigo (migração)
          const oldQuestoesDoc = await getDoc(doc(db, 'config', 'questoes'))
          if (oldQuestoesDoc.exists()) {
            const data = oldQuestoesDoc.data()
            setQuestoesConfigPrompt(data.prompt || '')
            setBizuConfigPrompt(data.bizuPrompt || '')
          }
        }
      } catch (err) {
        console.error('Erro ao carregar configuração de questões:', err)
      }
    }
    fetchQuestoesConfig()
  }, [selectedCourseId])

  // Carregar estatísticas do usuário (por curso)
  useEffect(() => {
    if (!user || (selectedCourseId === null && selectedCourseId !== null)) return // Aguardar curso ser carregado
    
    const courseKey = selectedCourseId || 'alego' // 'alego' para curso padrão
    const statsRef = doc(db, 'questoesStats', `${user.uid}_${courseKey}`)
    const unsub = onSnapshot(statsRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data()
        // Verificar se é do curso correto
        if (data.courseId === selectedCourseId || (!data.courseId && !selectedCourseId)) {
          setStats(data)
        } else {
          setStats({ correct: 0, wrong: 0, byMateria: {} })
        }
      } else {
        setStats({ correct: 0, wrong: 0, byMateria: {} })
      }
    })
    return () => unsub()
  }, [user, selectedCourseId])


  // Organizar módulos por matéria
  const organizedModules = useMemo(() => {
    const modulesByMateria = {}
    cards.forEach((card) => {
      if (card.materia && card.modulo) {
        if (!modulesByMateria[card.materia]) {
          modulesByMateria[card.materia] = []
        }
        if (!modulesByMateria[card.materia].includes(card.modulo)) {
          modulesByMateria[card.materia].push(card.modulo)
        }
      }
    })

    // Ordenar módulos numericamente
    Object.keys(modulesByMateria).forEach((materia) => {
      modulesByMateria[materia].sort((a, b) => {
        const extractNumber = (str) => {
          const match = str.match(/\d+/)
          return match ? parseInt(match[0], 10) : 999
        }
        const numA = extractNumber(a)
        const numB = extractNumber(b)
        if (numA !== 999 && numB !== 999) return numA - numB
        if (numA !== 999) return -1
        if (numB !== 999) return 1
        return a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' })
      })
    })

    return modulesByMateria
  }, [cards])

  // Função para chamar Groq API
  const callGroqAPI = async (prompt) => {
    const groqApiKey = import.meta.env.VITE_GROQ_API_KEY
    if (!groqApiKey) {
      throw new Error('VITE_GROQ_API_KEY não configurada')
    }

    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${groqApiKey}`,
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [
            {
              role: 'system',
              content: 'Você é um especialista em criar questões de concursos públicos no estilo FGV.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: 0.7,
          max_tokens: 4000,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error?.message || `Groq API error: ${response.status}`)
      }

      const data = await response.json()
      return data.choices[0]?.message?.content || ''
    } catch (err) {
      console.error('Erro ao chamar Groq API:', err)
      throw err
    }
  }

  // Estado para avaliações das questões
  const [questionsRating, setQuestionsRating] = useState({ liked: false, disliked: false })
  const [cacheInfo, setCacheInfo] = useState(null)
  
  // Estado para avaliação individual de cada questão
  const [individualRatings, setIndividualRatings] = useState({}) // { questionIndex: { liked: bool, disliked: bool, loading: bool } }
  const [questionScores, setQuestionScores] = useState({}) // { questionIndex: { likes, dislikes, score } }

  // Gerar questões com IA (COM CACHE INTELIGENTE)
  const generateQuestions = async () => {
    if (!selectedMateria || !selectedModulo) {
      alert('Selecione uma matéria e um módulo primeiro!')
      return
    }

    setGenerating(true)
    setQuestions([])
    setCurrentQuestionIndex(0)
    setSelectedAnswer(null)
    setShowResult(false)
    setQuestionsRating({ liked: false, disliked: false })
    setCacheInfo(null)
    setIndividualRatings({})
    setQuestionScores({})

    try {
      // 🔥 NOVO: VERIFICAR CACHE PRIMEIRO
      console.log('🔍 Verificando cache de questões...')
      const cachedData = await getOrCreateQuestionsCache(selectedMateria, selectedModulo)
      
      if (cachedData && cachedData.questoes && cachedData.questoes.length > 0) {
        console.log(`✅ Cache encontrado! Usando ${cachedData.questoes.length} questões do cache.`)
        const cacheInfoData = {
          likes: cachedData.likes,
          dislikes: cachedData.dislikes,
          score: cachedData.score,
          cached: true
        }
        
        // Verificar se precisa remover por score baixo
        await autoRemoveBadCache('questoesCache', `${selectedMateria}_${selectedModulo}`.replace(/[^a-zA-Z0-9_]/g, '_'))
        
        setGenerating(false)
        
        // Navegar para a página de responder questões
        navigate('/flashquestoes/responder', {
          state: {
            questions: cachedData.questoes,
            selectedMateria,
            selectedModulo,
            cacheInfo: cacheInfoData
          }
        })
        return // Sair da função - questões já foram carregadas do cache
      }

      console.log('📝 Cache não encontrado. Gerando novas questões com IA...')
      
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY
      const groqApiKey = import.meta.env.VITE_GROQ_API_KEY

      if (!apiKey && !groqApiKey) {
        throw new Error('Configure VITE_GEMINI_API_KEY ou VITE_GROQ_API_KEY no .env')
      }

      // 🔥 BUSCAR FLASHCARDS DO MÓDULO SELECIONADO
      const moduleFlashcards = cards.filter(
        (card) => card.materia === selectedMateria && card.modulo === selectedModulo
      )

      if (moduleFlashcards.length === 0) {
        throw new Error(`Nenhum flashcard encontrado para "${selectedMateria}" - "${selectedModulo}". Crie flashcards primeiro no painel administrativo.`)
      }

      // Formatar conteúdo dos flashcards para incluir no prompt
      const flashcardsContent = moduleFlashcards
        .map((card, idx) => {
          return `Flashcard ${idx + 1}:
Pergunta: ${card.pergunta || ''}
Resposta: ${card.resposta || ''}
${card.explicacao ? `Explicação: ${card.explicacao}` : ''}`
        })
        .join('\n\n')

      // Usar prompt configurado pelo admin ou prompt padrão
      const basePrompt = questoesConfigPrompt.trim() || `Você é um especialista em criar questões de concursos públicos no estilo FGV para o cargo de Policial Legislativo da ALEGO.

REGRAS PARA AS QUESTÕES:
- Estilo FGV: questões objetivas, claras, com alternativas bem elaboradas
- Cada questão deve ter 5 alternativas (A, B, C, D, E)
- Apenas UMA alternativa está correta
- As alternativas incorretas devem ser plausíveis (distratores inteligentes)
- Baseie-se PRIMARIAMENTE no conteúdo dos flashcards fornecidos abaixo
- Questões devem ser FICTÍCIAS (não são questões reais de provas anteriores)
- Foque em temas relevantes para o cargo de Policial Legislativo
- Dificuldade: nível FGV (intermediário a avançado)
- Enunciados claros e objetivos
- Alternativas com linguagem formal e técnica quando apropriado`

      const prompt = `${basePrompt}

${editalPrompt ? `CONTEXTO DO EDITAL (para referência):\n${editalPrompt}\n\n` : ''}

⚠️ CONTEÚDO PRINCIPAL - FLASHCARDS DO MÓDULO "${selectedModulo}" (${moduleFlashcards.length} flashcards):
Use ESTE conteúdo como base principal para criar as questões. As questões devem estar diretamente relacionadas ao conteúdo abaixo:

${flashcardsContent}

TAREFA: Criar 10 questões FICTÍCIAS de múltipla escolha no estilo FGV para a matéria "${selectedMateria}" no módulo "${selectedModulo}".

CRÍTICO:
- As questões devem ser baseadas NO CONTEÚDO DOS FLASHCARDS acima
- NÃO crie questões genéricas sobre o edital
- Foque no conteúdo específico dos flashcards fornecidos
- Cada questão deve testar o conhecimento sobre os conceitos apresentados nos flashcards

FORMATO DE RESPOSTA (OBRIGATÓRIO - APENAS JSON):
Retorne APENAS um objeto JSON válido no seguinte formato:

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
      "justificativa": "Explicação breve de por que a alternativa correta está certa"
    }
  ]
}

CRÍTICO: 
- Retorne APENAS o JSON, sem markdown (sem \`\`\`json)
- Sem explicações antes ou depois
- Sem texto adicional
- Apenas o objeto JSON puro começando com { e terminando com }`

      let aiResponse = ''

      // Tentar Gemini primeiro com fallback para modelos alternativos
      if (apiKey) {
        const genAI = new GoogleGenerativeAI(apiKey)
        const modelNames = ['gemini-2.0-flash-exp', 'gemini-1.5-pro', 'gemini-2.0-flash', 'gemini-1.5-flash']
        let lastError = null
        
        for (const modelName of modelNames) {
          try {
            console.log(`🔄 Tentando modelo: ${modelName}...`)
            const model = genAI.getGenerativeModel({ model: modelName })
            const result = await model.generateContent(prompt)
            aiResponse = result.response.text()
            console.log(`✅ Sucesso com modelo: ${modelName}`)
            break
          } catch (modelErr) {
            console.warn(`⚠️ Modelo ${modelName} falhou:`, modelErr.message)
            lastError = modelErr
            const errorMessage = modelErr.message || String(modelErr) || ''
            const isQuotaError = errorMessage.includes('429') || errorMessage.includes('quota') || errorMessage.includes('Quota exceeded')
            
            // Se for erro de quota e tiver Groq, usar Groq
            if (isQuotaError && groqApiKey) {
              console.warn('⚠️ Erro de quota no Gemini. Usando Groq como fallback...')
              try {
                aiResponse = await callGroqAPI(prompt)
                break
              } catch (groqErr) {
                console.error('Erro no Groq:', groqErr)
                throw groqErr
              }
            }
            
            // Se não for o último modelo, tentar próximo
            if (modelName !== modelNames[modelNames.length - 1]) {
              continue
            }
          }
        }
        
        // Se nenhum modelo funcionou e não usou Groq, lançar erro
        if (!aiResponse && lastError) {
          throw lastError
        }
      } else if (groqApiKey) {
        aiResponse = await callGroqAPI(prompt)
      } else {
        throw new Error('Nenhuma API key configurada. Configure VITE_GEMINI_API_KEY ou VITE_GROQ_API_KEY')
      }

      // Validar que temos uma resposta
      if (!aiResponse || !aiResponse.trim()) {
        throw new Error('A IA não retornou uma resposta. Tente novamente.')
      }

      // Extrair JSON da resposta
      let jsonText = aiResponse.trim()
      
      // Remover markdown se houver
      if (jsonText.includes('```json')) {
        jsonText = jsonText.split('```json')[1].split('```')[0].trim()
      } else if (jsonText.includes('```')) {
        jsonText = jsonText.split('```')[1].split('```')[0].trim()
      }

      // Remover texto antes do primeiro { e depois do último }
      const firstBrace = jsonText.indexOf('{')
      const lastBrace = jsonText.lastIndexOf('}')
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        jsonText = jsonText.substring(firstBrace, lastBrace + 1)
      }

      // Tentar fazer parse do JSON
      let parsedData
      try {
        parsedData = JSON.parse(jsonText)
      } catch (parseErr) {
        console.error('Erro ao fazer parse do JSON:', parseErr)
        console.error('Resposta da IA:', aiResponse.substring(0, 500))
        throw new Error(`Erro ao processar resposta da IA: ${parseErr.message}. A resposta pode estar em formato inválido.`)
      }
      
      if (!parsedData.questoes || !Array.isArray(parsedData.questoes)) {
        console.error('Formato inválido. Resposta:', parsedData)
        throw new Error('Formato de resposta inválido: esperado array "questoes". A IA pode não ter retornado o formato correto.')
      }

      if (parsedData.questoes.length === 0) {
        throw new Error('A IA não gerou nenhuma questão. Tente novamente.')
      }

      // 🔥 NOVO: SALVAR NO CACHE
      console.log('💾 Salvando questões no cache...')
      await saveQuestionsCache(selectedMateria, selectedModulo, parsedData.questoes)
      const newCacheInfo = { likes: 0, dislikes: 0, score: 100, cached: false }

      // Navegar para a página de responder questões
      navigate('/flashquestoes/responder', {
        state: {
          questions: parsedData.questoes,
          selectedMateria,
          selectedModulo,
          cacheInfo: newCacheInfo
        }
      })
    } catch (err) {
      console.error('Erro ao gerar questões:', err)
      alert(`Erro ao gerar questões: ${err.message}`)
    } finally {
      setGenerating(false)
    }
  }

  // Avaliar questões (like/dislike)
  const handleRateQuestions = async (isLike) => {
    if (!selectedMateria || !selectedModulo) return
    
    const newRating = isLike ? { liked: true, disliked: false } : { liked: false, disliked: true }
    setQuestionsRating(newRating)
    
    try {
      await rateQuestionsCache(selectedMateria, selectedModulo, isLike)
      
      // Atualizar cacheInfo
      if (cacheInfo) {
        setCacheInfo({
          ...cacheInfo,
          likes: isLike ? cacheInfo.likes + 1 : cacheInfo.likes,
          dislikes: !isLike ? cacheInfo.dislikes + 1 : cacheInfo.dislikes
        })
      }
    } catch (error) {
      console.error('Erro ao avaliar questões:', error)
    }
  }

  // Responder questão
  const handleAnswer = (answer) => {
    if (showResult) return
    
    setSelectedAnswer(answer)
    setShowResult(true)

    const currentQuestion = questions[currentQuestionIndex]
    const isCorrect = answer === currentQuestion.correta

    // Atualizar estatísticas
    const newStats = { ...stats }
    newStats.correct = (newStats.correct || 0) + (isCorrect ? 1 : 0)
    newStats.wrong = (newStats.wrong || 0) + (isCorrect ? 0 : 1)
    
    if (!newStats.byMateria[selectedMateria]) {
      newStats.byMateria[selectedMateria] = { correct: 0, wrong: 0 }
    }
    newStats.byMateria[selectedMateria].correct += isCorrect ? 1 : 0
    newStats.byMateria[selectedMateria].wrong += isCorrect ? 0 : 1

    setStats(newStats)

    // Salvar no Firestore (por curso)
    if (user) {
      const courseKey = selectedCourseId || 'alego' // 'alego' para curso padrão
      const statsRef = doc(db, 'questoesStats', `${user.uid}_${courseKey}`)
      setDoc(statsRef, { ...newStats, courseId: selectedCourseId }, { merge: true })
    }
  }

  // Avaliar questão individual (OBRIGATÓRIO)
  const handleRateIndividualQuestion = async (questionIndex, isLike) => {
    if (!selectedMateria || !selectedModulo) return
    
    setIndividualRatings(prev => ({
      ...prev,
      [questionIndex]: { liked: isLike, disliked: !isLike, loading: true }
    }))
    
    try {
      const result = await rateIndividualQuestion(selectedMateria, selectedModulo, questionIndex, isLike)
      
      if (result.removed || result.cacheDeleted) {
        // Questão foi removida do banco - remover também do array local
        const updatedQuestions = questions.filter((_, idx) => idx !== questionIndex)
        
        // Limpar avaliação da questão removida
        const updatedRatings = { ...individualRatings }
        delete updatedRatings[questionIndex]
        
        // Reorganizar avaliações (ajustar índices)
        const reorganizedRatings = {}
        Object.keys(updatedRatings).forEach((key) => {
          const idx = parseInt(key)
          if (idx > questionIndex) {
            reorganizedRatings[idx - 1] = updatedRatings[idx]
          } else {
            reorganizedRatings[idx] = updatedRatings[idx]
          }
        })
        
        setIndividualRatings(reorganizedRatings)
        setQuestions(updatedQuestions)
        
        // Ajustar índice se necessário
        if (result.cacheDeleted || updatedQuestions.length === 0) {
          // Todas as questões foram removidas
          setQuestions([])
          setCurrentQuestionIndex(0)
          setIndividualRatings({})
          setQuestionScores({})
          alert('Todas as questões foram removidas por baixa qualidade. Por favor, gere novas questões.')
          return
        } else if (currentQuestionIndex >= updatedQuestions.length) {
          // Se estava na última questão, volta para a nova última
          setCurrentQuestionIndex(updatedQuestions.length - 1)
        } else if (currentQuestionIndex > questionIndex) {
          // Se estava depois da removida, ajusta índice
          setCurrentQuestionIndex(currentQuestionIndex - 1)
        }
        
        // Limpar resultado para mostrar nova questão
        setSelectedAnswer(null)
        setShowResult(false)
        setShowBizu({})
        
        alert('Questão removida por baixa qualidade. Continuando com as questões restantes.')
        return
      } else {
        // Atualizar score da questão
        setQuestionScores(prev => ({
          ...prev,
          [questionIndex]: {
            likes: result.likes,
            dislikes: result.dislikes,
            score: result.score
          }
        }))
      }
    } catch (error) {
      console.error('Erro ao avaliar questão:', error)
      alert('Erro ao avaliar questão. Tente novamente.')
    } finally {
      setIndividualRatings(prev => ({
        ...prev,
        [questionIndex]: { ...prev[questionIndex], loading: false }
      }))
    }
  }

  // Próxima questão (EXIGE AVALIAÇÃO)
  const nextQuestion = () => {
    // Verificar se a questão atual foi avaliada
    const currentRating = individualRatings[currentQuestionIndex]
    if (!currentRating || (!currentRating.liked && !currentRating.disliked)) {
      alert('⚠️ Por favor, avalie esta questão (👍 ou 👎) antes de continuar!')
      return
    }
    
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1)
      setSelectedAnswer(null)
      setShowResult(false)
      setShowBizu({})
    }
  }

  // Estado para avaliações de BIZUs
  const [bizuRatings, setBizuRatings] = useState({}) // { questionIndex: { liked: bool, disliked: bool } }
  const [bizuCacheInfo, setBizuCacheInfo] = useState({}) // { questionIndex: { likes, dislikes, score } }

  // Gerar BIZU (explicação) da questão (COM CACHE)
  const generateBizu = async (questionIndex) => {
    const question = questions[questionIndex]
    if (!question) return

    setBizuLoading({ ...bizuLoading, [questionIndex]: true })
    setShowBizu({ ...showBizu, [questionIndex]: true })

    try {
      // Criar ID único para a questão (baseado no enunciado)
      const questionId = `${selectedMateria}_${selectedModulo}_${questionIndex}_${question.enunciado.substring(0, 50).replace(/[^a-zA-Z0-9]/g, '_')}`
      
      // 🔥 NOVO: VERIFICAR CACHE PRIMEIRO
      console.log('🔍 Verificando cache de BIZU...')
      const cachedExplanation = await getOrCreateExplanationCache(questionId)
      
      if (cachedExplanation && cachedExplanation.text) {
        console.log('✅ BIZU encontrado no cache!')
        setBizuText({ ...bizuText, [questionIndex]: cachedExplanation.text })
        setBizuCacheInfo({
          ...bizuCacheInfo,
          [questionIndex]: {
            likes: cachedExplanation.likes,
            dislikes: cachedExplanation.dislikes,
            score: cachedExplanation.score
          }
        })
        setBizuLoading({ ...bizuLoading, [questionIndex]: false })
        return // Sair - explicação já veio do cache
      }

      console.log('📝 BIZU não encontrado no cache. Gerando com IA...')

      const apiKey = import.meta.env.VITE_GEMINI_API_KEY
      const groqApiKey = import.meta.env.VITE_GROQ_API_KEY

      // Usar prompt configurado pelo admin ou prompt padrão
      const baseBizuPrompt = bizuConfigPrompt.trim() || `Você é um professor especialista em concursos públicos.

REGRAS PARA OS BIZUs:
- Explique por que a alternativa correta está certa
- Explique por que as outras alternativas estão incorretas
- Dê dicas e macetes relacionados ao tema
- Seja objetivo mas completo (3-5 parágrafos)
- Use linguagem didática e acessível
- Inclua exemplos práticos quando fizer sentido
- Relacione com o contexto do cargo de Policial Legislativo
- Destaque pontos importantes que podem cair em prova
- Seja motivador e encorajador`

      const prompt = `${baseBizuPrompt}

Questão:
${question.enunciado}

Alternativas:
${Object.entries(question.alternativas).map(([letra, texto]) => `${letra}) ${texto}`).join('\n')}

Alternativa correta: ${question.correta}

${editalPrompt ? `\nContexto do edital:\n${editalPrompt}\n` : ''}

Forneça uma explicação didática e completa (BIZU) sobre esta questão seguindo as regras acima.`

      let explanation = ''

      if (apiKey) {
        try {
          const genAI = new GoogleGenerativeAI(apiKey)
          const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' })
          const result = await model.generateContent(prompt)
          explanation = result.response.text()
        } catch (geminiErr) {
          const errorMessage = geminiErr.message || String(geminiErr) || ''
          const isQuotaError = errorMessage.includes('429') || errorMessage.includes('quota')
          
          if (isQuotaError && groqApiKey) {
            explanation = await callGroqAPI(prompt)
          } else {
            throw geminiErr
          }
        }
      } else if (groqApiKey) {
        explanation = await callGroqAPI(prompt)
      }

      // 🔥 NOVO: SALVAR NO CACHE
      console.log('💾 Salvando BIZU no cache...')
      await saveExplanationCache(questionId, explanation)
      setBizuCacheInfo({
        ...bizuCacheInfo,
        [questionIndex]: { likes: 0, dislikes: 0, score: 100 }
      })

      setBizuText({ ...bizuText, [questionIndex]: explanation })
    } catch (err) {
      console.error('Erro ao gerar BIZU:', err)
      setBizuText({ ...bizuText, [questionIndex]: `Erro ao gerar explicação: ${err.message}` })
    } finally {
      setBizuLoading({ ...bizuLoading, [questionIndex]: false })
    }
  }

  // Avaliar BIZU (like/dislike)
  const handleRateBizu = async (questionIndex, isLike) => {
    const question = questions[questionIndex]
    if (!question) return
    
    const questionId = `${selectedMateria}_${selectedModulo}_${questionIndex}_${question.enunciado.substring(0, 50).replace(/[^a-zA-Z0-9]/g, '_')}`
    
    const newRating = isLike ? { liked: true, disliked: false } : { liked: false, disliked: true }
    setBizuRatings({
      ...bizuRatings,
      [questionIndex]: newRating
    })
    
    try {
      await rateExplanationCache(questionId, isLike)
      
      // Atualizar cacheInfo
      if (bizuCacheInfo[questionIndex]) {
        setBizuCacheInfo({
          ...bizuCacheInfo,
          [questionIndex]: {
            ...bizuCacheInfo[questionIndex],
            likes: isLike ? bizuCacheInfo[questionIndex].likes + 1 : bizuCacheInfo[questionIndex].likes,
            dislikes: !isLike ? bizuCacheInfo[questionIndex].dislikes + 1 : bizuCacheInfo[questionIndex].dislikes
          }
        })
      }
    } catch (error) {
      console.error('Erro ao avaliar BIZU:', error)
    }
  }

  // Calcular déficit por matéria
  const deficitByMateria = useMemo(() => {
    const deficits = []
    Object.entries(stats.byMateria || {}).forEach(([materia, data]) => {
      const total = (data.correct || 0) + (data.wrong || 0)
      if (total > 0) {
        const accuracy = (data.correct || 0) / total
        if (accuracy < 0.7) { // Menos de 70% de acerto
          deficits.push({
            materia,
            accuracy: (accuracy * 100).toFixed(1),
            correct: data.correct || 0,
            wrong: data.wrong || 0,
            total,
          })
        }
      }
    })
    return deficits.sort((a, b) => parseFloat(a.accuracy) - parseFloat(b.accuracy))
  }, [stats])

  const toggleMateria = (materia) => {
    setExpandedMaterias((prev) => ({ ...prev, [materia]: !prev[materia] }))
  }

  const totalAnswered = (stats.correct || 0) + (stats.wrong || 0)
  const accuracy = totalAnswered > 0 ? ((stats.correct || 0) / totalAnswered * 100).toFixed(1) : 0

  return (
    <div className="space-y-6 stark-bg-primary min-h-screen p-4 sm:p-6 lg:p-8">
      {/* Header STARK */}
      <div className="stark-glass stark-animate-fade-in p-6 sm:p-8 lg:p-10 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-blue-500/5 to-purple-500/10"></div>
        <div className="relative z-10">
          <h1 className="stark-text-gradient text-3xl sm:text-4xl lg:text-5xl font-black mb-3 tracking-tight">
            FLASHQUESTÕES
          </h1>
          <p className="stark-text-secondary text-sm sm:text-base">
            {selectedCourse 
              ? `Pratique com questões fictícias geradas por IA para ${selectedCourse.name}`
              : 'Pratique com questões fictícias geradas por IA no estilo FGV'}
          </p>
        </div>
        <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-cyan-500/20 to-blue-500/20 rounded-full blur-3xl"></div>
      </div>

      {/* Estatísticas STARK */}
      <div className="stark-grid stark-animate-fade-in">
        <div className="stark-stats">
          <p className="stark-text-muted text-xs font-semibold uppercase tracking-wider mb-2">Taxa de Acerto</p>
          <p className="stark-text-gradient text-4xl sm:text-5xl font-black mb-2">{accuracy}%</p>
          <p className="stark-text-secondary text-xs sm:text-sm">
            {stats.correct || 0} acertos / {totalAnswered} questões
          </p>
        </div>
        <div className="stark-stats">
          <p className="stark-text-muted text-xs font-semibold uppercase tracking-wider mb-2">Acertos</p>
          <p className="text-4xl sm:text-5xl font-black mb-2" style={{ color: '#10b981' }}>{stats.correct || 0}</p>
          <p className="stark-text-secondary text-xs sm:text-sm">Questões corretas</p>
        </div>
        <div className="stark-stats">
          <p className="stark-text-muted text-xs font-semibold uppercase tracking-wider mb-2">Erros</p>
          <p className="text-4xl sm:text-5xl font-black mb-2" style={{ color: '#ef4444' }}>{stats.wrong || 0}</p>
          <p className="stark-text-secondary text-xs sm:text-sm">Questões incorretas</p>
        </div>
      </div>

      {/* Bot de Déficit STARK */}
      {deficitByMateria.length > 0 && (
        <div className="stark-card stark-animate-slide-in p-4 sm:p-6 border-orange-500/30">
          <p className="stark-text-primary text-sm sm:text-base font-bold mb-3 flex items-center gap-2">
            <span className="text-xl">⚠️</span> Matérias com Déficit
          </p>
          <ul className="space-y-2">
            {deficitByMateria.map((item, idx) => (
              <li key={item.materia} className="stark-text-secondary text-xs sm:text-sm flex items-start gap-2">
                <span className="text-orange-500 mt-1">▸</span>
                <span>
                  <strong className="stark-text-primary">{item.materia}</strong>: 
                  <span className="text-orange-500 font-semibold"> {item.accuracy}%</span> de acerto 
                  ({item.correct}/{item.total})
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Seleção de Módulo STARK */}
      {questions.length === 0 && (
        <div className="stark-card stark-animate-fade-in p-4 sm:p-6 lg:p-8">
          <h2 className="stark-text-gradient text-xl sm:text-2xl font-black mb-6 uppercase tracking-tight">
            Selecione um Módulo
          </h2>
          <div className="space-y-3">
            {Object.entries(organizedModules).map(([materia, modulos], idx) => (
              <div key={materia} className="stark-card border-2">
                <button
                  type="button"
                  onClick={() => toggleMateria(materia)}
                  className="w-full flex items-center justify-between p-4 stark-text-primary hover:stark-bg-hover transition-stark rounded-lg"
                >
                  <span className="font-bold text-base sm:text-lg">{materia}</span>
                  {expandedMaterias[materia] ? (
                    <ChevronDownIcon className="h-5 w-5 text-cyan-400" />
                  ) : (
                    <ChevronRightIcon className="h-5 w-5 text-cyan-400" />
                  )}
                </button>
                {expandedMaterias[materia] && (
                  <div className="p-3 pt-0 space-y-2 border-t border-cyan-500/20 mt-2">
                    {modulos.map((modulo) => (
                      <button
                        key={modulo}
                        type="button"
                        onClick={async () => {
                          // Limpar questões anteriores
                          setQuestions([])
                          setCurrentQuestionIndex(0)
                          setSelectedAnswer(null)
                          setShowResult(false)
                          setQuestionsRating({ liked: false, disliked: false })
                          setCacheInfo(null)
                          setIndividualRatings({})
                          setQuestionScores({})
                          // Selecionar módulo
                          setSelectedMateria(materia)
                          setSelectedModulo(modulo)
                          // Scroll suave para o topo
                          window.scrollTo({ top: 0, behavior: 'smooth' })
                          // Gerar questões automaticamente após um pequeno delay
                          setTimeout(() => {
                            generateQuestions()
                          }, 300)
                        }}
                        className={`w-full text-left p-3 sm:p-4 rounded-lg border-2 transition-stark ${
                          selectedMateria === materia && selectedModulo === modulo
                            ? 'stark-bg-hover border-cyan-500/50 stark-text-primary'
                            : 'stark-border stark-text-secondary hover:border-cyan-500/30 hover:stark-bg-hover'
                        }`}
                      >
                        <FolderIcon className="h-4 w-4 inline mr-2 text-cyan-400" />
                        <span className="text-sm sm:text-base font-semibold">{modulo}</span>
                        {selectedMateria === materia && selectedModulo === modulo && generating && (
                          <span className="ml-2 text-xs text-cyan-400 animate-pulse">⚙️ Gerando...</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {selectedMateria && selectedModulo && questions.length === 0 && (
            <div className="mt-8">
              {generating ? (
                <div className="stark-card p-6 text-center">
                  <div className="inline-block animate-spin text-4xl mb-4">⚙️</div>
                  <p className="stark-text-primary text-lg font-bold mb-2">Gerando questões...</p>
                  <p className="stark-text-secondary text-sm">
                    Por favor, aguarde enquanto a IA cria 10 questões personalizadas para você
                  </p>
                </div>
              ) : (
                <div className="stark-card p-6 text-center">
                  <p className="stark-text-primary text-sm font-semibold mb-3">
                    Módulo selecionado: <span className="text-cyan-400">{selectedModulo}</span>
                  </p>
                  <p className="stark-text-secondary text-xs">
                    ⚠️ As questões serão geradas automaticamente ao selecionar um módulo acima
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

    </div>
  )
}

export default FlashQuestoes

