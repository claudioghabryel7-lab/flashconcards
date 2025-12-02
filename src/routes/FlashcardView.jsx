import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { collection, doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore'
import dayjs from 'dayjs'
import FlashcardList from '../components/FlashcardList'
import { db } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'
import { useDarkMode } from '../hooks/useDarkMode.jsx'
import { useStudyTimer } from '../hooks/useStudyTimer'
import { FolderIcon, ChevronRightIcon, ChevronDownIcon, ClockIcon } from '@heroicons/react/24/outline'
import { GoogleGenerativeAI } from '@google/generative-ai'
import {
  getOrCreateExplanationCache,
  saveExplanationCache,
  rateExplanationCache,
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

// Estágios do SRS (Spaced Repetition System)
const STAGES = [
  { level: 1, intervalDays: 1 },
  { level: 2, intervalDays: 3 },
  { level: 3, intervalDays: 7 },
  { level: 4, intervalDays: 14 },
  { level: 5, intervalDays: 30 },
  { level: 6, intervalDays: 60 },
]

const FlashcardView = () => {
  const { user, favorites, updateFavorites, profile } = useAuth()
  const { darkMode } = useDarkMode()
  const [searchParams] = useSearchParams()
  const [cards, setCards] = useState([])
  const [cardProgress, setCardProgress] = useState({})
  const [currentIndex, setCurrentIndex] = useState(0)
  const [selectedMateria, setSelectedMateria] = useState(null)
  const [selectedModulo, setSelectedModulo] = useState(null)
  const [expandedMaterias, setExpandedMaterias] = useState({})
  const [sessionRatings, setSessionRatings] = useState({})
  const [moduleCompleted, setModuleCompleted] = useState(false)
  const [studyMode, setStudyMode] = useState('module')
  const [miniSimCards, setMiniSimCards] = useState([])
  const [explanationModal, setExplanationModal] = useState({
    open: false,
    loading: false,
    text: '',
    error: null,
    card: null,
  })
  const [editalPrompt, setEditalPrompt] = useState('')
  const [selectedCourseId, setSelectedCourseId] = useState(null) // Curso selecionado (null = ALEGO padrão)
  const [availableCourses, setAvailableCourses] = useState([]) // Cursos disponíveis para o usuário
  
  // Timer de estudo - ativo quando um módulo está selecionado
  const isStudying = !!selectedMateria && !!selectedModulo
  const { formattedTime, elapsedSeconds } = useStudyTimer(isStudying, user?.uid, selectedCourseId)

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
    }, (error) => {
      console.error('Erro ao carregar cursos:', error)
      setAvailableCourses([])
    })
    
    return () => unsub()
  }, [profile])
  
  // Carregar flashcards do Firestore - filtrar por curso selecionado
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
      const selectedCourse = (selectedCourseId || '').trim()
      
      if (selectedCourse) {
        // Mostrar apenas flashcards do curso selecionado
        // Comparar tanto com string quanto com null/undefined
        data = data.filter(card => {
          const cardCourseId = card.courseId || null
          return cardCourseId === selectedCourse || String(cardCourseId) === String(selectedCourse)
        })
        console.log(`🔍 FlashcardView - Filtrado por curso "${selectedCourse}": ${data.length} flashcards`)
      } else {
        // Mostrar apenas flashcards sem courseId (ALEGO padrão)
        // Incluir null, undefined e string vazia
        data = data.filter(card => {
          const cardCourseId = card.courseId
          return !cardCourseId || cardCourseId === '' || cardCourseId === null || cardCourseId === undefined
        })
        console.log(`🔍 FlashcardView - Filtrado para ALEGO padrão: ${data.length} flashcards`)
      }
      
      // Admin vê todos, mas ainda filtra por curso selecionado
      if (!isAdmin && selectedCourseId) {
        // Verificar se o usuário comprou o curso selecionado
        if (!purchasedCourses.includes(selectedCourseId)) {
          data = []
        }
      }
      
      data.sort((a, b) => {
        if (a.materia !== b.materia) {
          const indexA = MATERIAS.indexOf(a.materia || '')
          const indexB = MATERIAS.indexOf(b.materia || '')
          return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB)
        }
        if (a.modulo !== b.modulo) {
          return (a.modulo || '').localeCompare(b.modulo || '')
        }
        return 0
      })
      setCards(data)
    })
    return () => unsub()
  }, [user, profile, selectedCourseId])

  useEffect(() => {
    const fetchPrompt = async () => {
      try {
        const promptDoc = await getDoc(doc(db, 'config', 'edital'))
        if (promptDoc.exists()) {
          const data = promptDoc.data()
          // Combinar texto digitado + texto do PDF
          let combinedText = ''
          if (data.prompt || data.content) {
            combinedText += data.prompt || data.content || ''
          }
          if (data.pdfText) {
            if (combinedText) combinedText += '\n\n'
            // Estratégia inteligente: início + fim do PDF
            let limitedPdfText = ''
            const totalLength = data.pdfText.length
            if (totalLength <= 20000) {
              // PDF pequeno: usar tudo
              limitedPdfText = data.pdfText
            } else {
              // PDF grande: início (15000) + fim (5000)
              const inicio = data.pdfText.substring(0, 15000)
              const fim = data.pdfText.substring(totalLength - 5000)
              limitedPdfText = `${inicio}\n\n[... conteúdo intermediário omitido ...]\n\n${fim}`
            }
            combinedText += `CONTEÚDO DO PDF DO EDITAL:\n${limitedPdfText}`
          }
          setEditalPrompt(combinedText)
        }
      } catch (err) {
        console.error('Erro ao carregar prompt do edital:', err)
      }
    }

    fetchPrompt()
  }, [])

  // Carregar progresso dos cards do usuário
  useEffect(() => {
    if (!user) return () => {}
    
    const userProgressRef = doc(db, 'userProgress', user.uid)
    const unsub = onSnapshot(userProgressRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data()
        setCardProgress(data.cardProgress || {})
      } else {
        setCardProgress({})
      }
    })
    return () => unsub()
  }, [user])

  // Organizar cards por matéria e módulo
  const organizedCards = useMemo(() => {
    const organized = {}
    cards.forEach((card) => {
      const materia = card.materia || 'Sem matéria'
      const modulo = card.modulo || 'Sem módulo'
      if (!organized[materia]) {
        organized[materia] = {}
      }
      if (!organized[materia][modulo]) {
        organized[materia][modulo] = []
      }
      organized[materia][modulo].push(card)
    })
    return organized
  }, [cards])

  // Selecionar matéria e módulo baseado em query params
  useEffect(() => {
    const materiaParam = searchParams.get('materia')
    const moduloParam = searchParams.get('modulo')
    
    if (materiaParam && moduloParam && organizedCards[materiaParam]?.[moduloParam]) {
      setSelectedMateria(materiaParam)
      setSelectedModulo(moduloParam)
      setStudyMode('module')
      setCurrentIndex(0)
    }
  }, [searchParams, organizedCards])

  // Cards filtrados baseado na seleção
  const filteredCards = useMemo(() => {
    if (!selectedMateria || !selectedModulo || studyMode === 'miniSim') {
      return []
    }
    return organizedCards[selectedMateria]?.[selectedModulo] || []
  }, [selectedMateria, selectedModulo, organizedCards, studyMode])

  const activeCards = studyMode === 'miniSim' ? miniSimCards : filteredCards

  useEffect(() => {
    setSessionRatings({})
    setModuleCompleted(false)
  }, [selectedMateria, selectedModulo, studyMode])

  const checkModuleCompletion = (ratingsSnapshot) => {
    if (studyMode === 'miniSim') return false
    if (!selectedMateria || !selectedModulo) return false
    if (activeCards.length === 0) return false
    return activeCards.every((card) => ratingsSnapshot[card.id] === 'easy')
  }

  // Calcular próxima revisão com sistema retroativo
  const calculateNextReview = (currentProgress, difficulty, isRetroactive = false) => {
    const now = dayjs()
    let currentStage = currentProgress?.stage || 0
    let nextReview = currentProgress?.nextReview ? dayjs(currentProgress.nextReview) : now

    if (isRetroactive && nextReview.isBefore(now)) {
      const daysLate = now.diff(nextReview, 'day')
      if (daysLate > 0 && currentStage > 0) {
        const reduction = Math.min(Math.floor(daysLate / 3), currentStage)
        currentStage = Math.max(0, currentStage - reduction)
      }
    }

    if (difficulty === 'easy') {
      currentStage = Math.min(STAGES.length - 1, currentStage + (currentStage === 0 ? 2 : 1))
    } else if (difficulty === 'hard') {
      currentStage = Math.max(0, currentStage - 1)
    }

    const stage = STAGES[currentStage] || STAGES[0]
    const nextReviewDate = now.add(stage.intervalDays, 'day')

    return {
      stage: currentStage,
      nextReview: nextReviewDate.toISOString(),
      intervalDays: stage.intervalDays,
    }
  }

  const toggleMateria = (materia) => {
    setExpandedMaterias((prev) => ({
      ...prev,
      [materia]: !prev[materia],
    }))
  }

  const selectModulo = (materia, modulo) => {
    setStudyMode('module')
    setMiniSimCards([])
    setSelectedMateria(materia)
    setSelectedModulo(modulo)
    setCurrentIndex(0)
  }

  const startMiniSim = (materia) => {
    const cardsByModulo = organizedCards[materia] || {}
    const allCards = Object.values(cardsByModulo).flat()
    if (allCards.length === 0) return
    const shuffled = [...allCards].sort(() => Math.random() - 0.5)
    const selected = shuffled.slice(0, Math.min(10, shuffled.length))
    setStudyMode('miniSim')
    setMiniSimCards(selected)
    setSelectedMateria(materia)
    setSelectedModulo('Mini simulado')
    setCurrentIndex(0)
  }

  const goNext = () => {
    setCurrentIndex((prev) =>
      prev + 1 >= activeCards.length ? 0 : prev + 1,
    )
  }

  const goPrev = () => {
    setCurrentIndex((prev) =>
      prev - 1 < 0 ? activeCards.length - 1 : prev - 1,
    )
  }

  const toggleFavorite = async (id) => {
    const nextFavorites = favorites.includes(id)
      ? favorites.filter((fav) => fav !== id)
      : [...favorites, id]
    await updateFavorites(nextFavorites)
  }

  // Avaliar dificuldade
  const rateDifficulty = async (cardId, difficulty) => {
    if (!user) return
    
    const now = dayjs()
    const currentProgress = cardProgress[cardId] || {}
    const nextReviewDate = currentProgress.nextReview ? dayjs(currentProgress.nextReview) : null
    const isRetroactive = nextReviewDate && now.isAfter(nextReviewDate)
    
    const newProgressData = calculateNextReview(currentProgress, difficulty, isRetroactive)
    
    const newProgress = {
      ...currentProgress,
      ...newProgressData,
      difficulty,
      reviewCount: (currentProgress.reviewCount || 0) + 1,
      lastReviewed: now.toISOString(),
      isRetroactive: isRetroactive || false,
    }
    
    const userProgressRef = doc(db, 'userProgress', user.uid)
    await setDoc(
      userProgressRef,
      {
        cardProgress: {
          ...cardProgress,
          [cardId]: newProgress,
        },
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    )

    setSessionRatings((prevRatings) => {
      const updated = { ...prevRatings, [cardId]: difficulty }
      if (checkModuleCompletion(updated)) {
        setModuleCompleted(true)
      }
      return updated
    })
    
    // Avançar para próximo card após um pequeno delay
    setTimeout(() => {
      goNext()
    }, 300)
  }

  const resetModuleSession = () => {
    setSessionRatings({})
    setModuleCompleted(false)
    setCurrentIndex(0)
  }

  const handleReviewAgain = () => {
    resetModuleSession()
  }

  const handleExitModule = () => {
    resetModuleSession()
    setStudyMode('module')
    setMiniSimCards([])
    setSelectedMateria(null)
    setSelectedModulo(null)
  }

  const shuffle = () => {
    setCurrentIndex(0)
  }

  const viewedIds = useMemo(() => {
    return activeCards.slice(0, currentIndex + 1).map((c) => c.id)
  }, [activeCards, currentIndex])

  const currentCard = activeCards[currentIndex]
  const needsReview = true // Sempre mostra os botões de avaliação

  // Chamar Groq API como fallback
  const callGroqAPI = async (prompt) => {
    const groqApiKey = import.meta.env.VITE_GROQ_API_KEY
    if (!groqApiKey) {
      throw new Error('GROQ_API_KEY não configurada')
    }

    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${groqApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.7,
          max_tokens: 400,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error?.message || `Groq API error: ${response.status}`)
      }

      const data = await response.json()
      return data.choices[0]?.message?.content || 'Desculpe, não consegui gerar uma explicação.'
    } catch (err) {
      console.error('Erro ao chamar Groq API:', err)
      throw err
    }
  }

  const generateCardExplanation = async (card) => {
    // 🔥 NOVO: VERIFICAR CACHE PRIMEIRO
    console.log('🔍 Verificando cache de explicação para flashcard...')
    const cachedExplanation = await getOrCreateExplanationCache(card.id)
    
    if (cachedExplanation && cachedExplanation.text) {
      console.log('✅ Explicação encontrada no cache!')
      return cachedExplanation.text // Retornar explicação do cache
    }

    console.log('📝 Explicação não encontrada no cache. Gerando com IA...')

    const apiKey = import.meta.env.VITE_GEMINI_API_KEY
    if (!apiKey) {
      throw new Error('API do Gemini não configurada.')
    }

    const preferredModel = import.meta.env.VITE_GEMINI_MODEL || 'gemini-1.5-flash-latest'
    const fallbackModels = ['gemini-2.0-flash', 'gemini-1.5-pro-latest']
    const candidates = [preferredModel, ...fallbackModels].filter(
      (value, idx, arr) => value && arr.indexOf(value) === idx,
    )

    const prompt = `
Explique o conteúdo deste flashcard de forma clara, prática e em até 5 parágrafos curtos.

Matéria: ${card.materia || 'Não informado'}
Módulo: ${card.modulo || 'Não informado'}
Pergunta do flashcard: "${card.pergunta}"
Resposta correta: "${card.resposta}"

${editalPrompt ? `Contexto do concurso ALEGO:\n${editalPrompt}` : ''}

Regras:
- Seja didático, direto e motivador.
- Traga exemplos simples quando fizer sentido.
- Foque no entendimento do conceito, não apenas repetir a resposta.`.trim()

    const genAI = new GoogleGenerativeAI(apiKey)
    let lastError = null
    let isQuotaError = false
    let explanationText = ''

    for (const modelName of candidates) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName })

        const result = await model.generateContent({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 400,
          },
        })

        const text = result?.response?.text()
        if (!text) {
          throw new Error('Não foi possível gerar a explicação.')
        }
        explanationText = text
        
        // 🔥 NOVO: SALVAR NO CACHE
        console.log('💾 Salvando explicação no cache...')
        await saveExplanationCache(card.id, explanationText)
        
        return explanationText
      } catch (err) {
        lastError = err
        const errorMessage = err.message || String(err) || ''
        const errorString = JSON.stringify(err) || ''
        
        // Verificar se é erro de quota
        isQuotaError = 
          errorMessage.includes('429') || 
          errorMessage.includes('quota') ||
          errorMessage.includes('Quota exceeded') ||
          errorString.includes('429') ||
          errorString.includes('quota') ||
          errorString.includes('free_tier_requests')
        
        // Se for erro de quota, tentar Groq imediatamente
        if (isQuotaError) {
          console.warn('⚠️ Erro de quota detectado. Usando Groq como fallback para explicação...')
          const groqApiKey = import.meta.env.VITE_GROQ_API_KEY
          if (groqApiKey) {
            try {
              const groqResponse = await callGroqAPI(prompt)
              console.log('✅ Groq gerou explicação com sucesso!')
              
              // 🔥 NOVO: SALVAR NO CACHE também quando usar Groq
              console.log('💾 Salvando explicação (via Groq) no cache...')
              await saveExplanationCache(card.id, groqResponse)
              
              return groqResponse
            } catch (groqErr) {
              console.error('❌ Erro ao usar Groq como fallback:', groqErr)
              throw new Error('Limite de quota atingido. Tente novamente mais tarde.')
            }
          } else {
            throw new Error('Limite de quota atingido. Configure VITE_GROQ_API_KEY para usar fallback automático.')
          }
        }
        
        // tenta próximo modelo se for erro de modelo inválido/404
        if (
          err.message?.includes('404') ||
          err.message?.includes('not found') ||
          err.message?.includes('is not supported')
        ) {
          continue
        }
        throw err
      }
    }

    throw lastError || new Error('Não foi possível gerar a explicação.')
  }

  const handleExplainCard = async (card) => {
    setExplanationModal({
      open: true,
      loading: true,
      text: '',
      error: null,
      card,
    })

    try {
      const explanation = await generateCardExplanation(card)
      setExplanationModal((prev) => ({
        ...prev,
        loading: false,
        text: explanation,
      }))
    } catch (err) {
      setExplanationModal((prev) => ({
        ...prev,
        loading: false,
        error: err.message || 'Erro ao gerar explicação.',
      }))
    }
  }

  const closeExplanationModal = () => {
    setExplanationModal({
      open: false,
      loading: false,
      text: '',
      error: null,
      card: null,
    })
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
      {/* Header Tecnológico */}
      <div className="relative overflow-hidden bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-6 sm:p-8">
        {/* Background gradient decorativo */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-blue-500/10 via-purple-500/10 to-cyan-500/10 rounded-full blur-3xl -mr-48 -mt-48"></div>
        <div className="absolute bottom-0 left-0 w-72 h-72 bg-gradient-to-tr from-indigo-500/10 to-purple-500/10 rounded-full blur-3xl -ml-36 -mb-36"></div>
        
        <div className="relative">
          <div className="flex items-center gap-3 mb-3">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-purple-500 rounded-xl blur-lg opacity-50 animate-pulse"></div>
              <div className="relative rounded-xl bg-gradient-to-br from-blue-500 to-purple-500 p-3 shadow-lg">
                <span className="text-white font-bold text-xl">📚</span>
              </div>
            </div>
            <p className="text-xs sm:text-sm font-black uppercase tracking-widest text-blue-600 dark:text-blue-400">
              Sistema de Repetição Espaçada (SRS)
            </p>
          </div>
          
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex-1">
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black mb-3">
                <span className="bg-gradient-to-r from-blue-600 via-purple-600 to-cyan-600 dark:from-blue-400 dark:via-purple-400 dark:to-cyan-400 bg-clip-text text-transparent">
                  Flashcards Inteligentes
                </span>
              </h1>
              <p className="text-sm sm:text-base font-semibold text-slate-600 dark:text-slate-400">
                {isStudying 
                  ? (
                    <span>
                      Estudando: <span className="font-black text-blue-600 dark:text-blue-400">{selectedMateria}</span> • <span className="font-black text-purple-600 dark:text-purple-400">{selectedModulo}</span>
                    </span>
                  )
                  : 'Selecione uma matéria e módulo para começar a estudar'}
              </p>
            </div>
            {isStudying && (
              <div className="relative group inline-flex items-center gap-3 px-5 py-3 bg-gradient-to-r from-blue-500/10 to-purple-500/10 dark:from-blue-500/20 dark:to-purple-500/20 rounded-xl border border-blue-500/30 dark:border-blue-400/30 backdrop-blur-sm hover:border-blue-500/50 dark:hover:border-blue-400/50 transition-all">
                <div className="relative">
                  <div className="absolute inset-0 bg-blue-500 rounded-full blur-md opacity-50 group-hover:opacity-75 transition-opacity animate-pulse"></div>
                  <ClockIcon className="relative h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Tempo</p>
                  <p className="text-xl font-black bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400 bg-clip-text text-transparent">
                    {formattedTime}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-3">
        {/* Árvore de Pastas - Design Tecnológico */}
        <div className="relative overflow-hidden bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-5 sm:p-6">
          {/* Background decorativo */}
          <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-blue-500/5 to-purple-500/5 rounded-full blur-3xl -mr-24 -mt-24"></div>
          
          <div className="relative">
            <div className="flex items-center gap-3 mb-5">
              <FolderIcon className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              <p className="text-sm font-black uppercase tracking-widest text-blue-600 dark:text-blue-400">
                Estrutura de Estudo
              </p>
            </div>
          <div className="space-y-2">
            {/* Usar matérias dos flashcards organizados, não a lista fixa MATERIAS */}
            {Object.keys(organizedCards)
              .sort((a, b) => {
                // Ordenar: primeiro as que estão em MATERIAS (na ordem original), depois as outras alfabeticamente
                const indexA = MATERIAS.indexOf(a)
                const indexB = MATERIAS.indexOf(b)
                if (indexA !== -1 && indexB !== -1) return indexA - indexB
                if (indexA !== -1) return -1
                if (indexB !== -1) return 1
                return a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' })
              })
              .map((materia) => {
              const modulos = organizedCards[materia] ? Object.keys(organizedCards[materia]) : []
              const isExpanded = expandedMaterias[materia]
              const isSelected = selectedMateria === materia
              
              if (modulos.length === 0) return null
              
              return (
                <div key={materia} className="space-y-2">
                  <button
                    type="button"
                    onClick={() => toggleMateria(materia)}
                    className={`group relative flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-bold transition-all overflow-hidden ${
                      isSelected
                        ? 'bg-gradient-to-r from-blue-500/10 to-purple-500/10 dark:from-blue-500/20 dark:to-purple-500/20 text-blue-700 dark:text-blue-300 border border-blue-500/30 dark:border-blue-400/30'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50/50 dark:hover:bg-slate-700/50 border border-slate-200/50 dark:border-slate-700/50'
                    }`}
                  >
                    {/* Background hover */}
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-500/0 via-blue-500/5 to-purple-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                    
                    <div className={`relative flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-transform duration-300 ${
                      isExpanded ? 'rotate-90' : ''
                    } ${isSelected ? 'bg-blue-500 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'}`}>
                      <ChevronRightIcon className="h-4 w-4" />
                    </div>
                    <FolderIcon className={`h-5 w-5 flex-shrink-0 ${isSelected ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400'}`} />
                    <span className="flex-1 font-semibold">{materia}</span>
                    <span className={`rounded-full px-3 py-1 text-xs font-black ${
                      isSelected
                        ? 'bg-blue-500 text-white'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                    }`}>
                      {modulos.length}
                    </span>
                  </button>
                  
                  {isExpanded && (
                    <div className="ml-4 pl-4 border-l-2 border-slate-200 dark:border-slate-700 space-y-1.5 animate-in fade-in slide-in-from-top-2 duration-300">
                      {modulos
                        .sort((a, b) => {
                          const extractNumber = (str) => {
                            const match = str.match(/\d+/)
                            return match ? parseInt(match[0], 10) : 999
                          }
                          const numA = extractNumber(a)
                          const numB = extractNumber(b)
                          if (numA !== 999 && numB !== 999) {
                            return numA - numB
                          }
                          if (numA !== 999) return -1
                          if (numB !== 999) return 1
                          return a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' })
                        })
                        .map((modulo) => {
                        const cardsInModulo = organizedCards[materia][modulo] || []
                        const isModuloSelected =
                          studyMode === 'module' &&
                          selectedMateria === materia &&
                          selectedModulo === modulo
                        
                        return (
                          <button
                            key={modulo}
                            type="button"
                            onClick={() => selectModulo(materia, modulo)}
                            className={`group/module relative flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-semibold transition-all ${
                              isModuloSelected
                                ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg'
                                : 'text-slate-600 dark:text-slate-300 hover:bg-blue-50/50 dark:hover:bg-blue-900/20 border border-transparent hover:border-blue-500/30'
                            }`}
                          >
                            <span className="relative z-10">{modulo}</span>
                            <span className={`relative z-10 rounded-full px-2 py-0.5 text-xs font-bold ${
                              isModuloSelected
                                ? 'bg-white/20 text-white'
                                : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                            }`}>
                              {cardsInModulo.length}
                            </span>
                            {isModuloSelected && (
                              <div className="absolute inset-0 bg-gradient-to-r from-blue-500/0 via-white/10 to-purple-500/0 animate-shimmer-slide"></div>
                            )}
                          </button>
                        )
                      })}
                      <button
                        type="button"
                        onClick={() => startMiniSim(materia)}
                        className="group/btn relative w-full rounded-lg border-2 border-dashed border-blue-400 dark:border-blue-500 px-3 py-2 text-left text-xs font-bold text-blue-600 dark:text-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-900/20 transition-all overflow-hidden"
                      >
                        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/0 via-blue-500/5 to-purple-500/0 opacity-0 group-hover/btn:opacity-100 transition-opacity"></div>
                        <span className="relative z-10 flex items-center gap-2">
                          <span>⚡</span>
                          <span>Mini simulado (10 cards)</span>
                        </span>
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          </div>
        </div>

        {/* Área de Estudo - Design Tecnológico */}
        <div className="lg:col-span-2">
          {!selectedMateria || !selectedModulo ? (
            <div className="relative overflow-hidden bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-12 text-center">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-purple-500/5 to-cyan-500/5"></div>
              <div className="relative">
                <div className="inline-block mb-4 text-6xl animate-bounce">📚</div>
                <p className="text-xl font-black bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400 bg-clip-text text-transparent mb-2">
                  Selecione uma matéria e módulo para começar
                </p>
                <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
                  Navegue pela estrutura ao lado e escolha o conteúdo que deseja estudar
                </p>
              </div>
            </div>
          ) : activeCards.length === 0 ? (
            <div className="relative overflow-hidden bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-8 text-center">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-purple-500/5 to-cyan-500/5"></div>
              <p className="relative text-slate-600 dark:text-slate-400 font-semibold">Nenhum card encontrado neste módulo.</p>
            </div>
          ) : (
            <div className="relative overflow-hidden bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-6 sm:p-8">
              {/* Background decorativo */}
              <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-blue-500/10 to-purple-500/10 rounded-full blur-3xl -mr-32 -mt-32"></div>
              
              <div className="relative space-y-6">
                {/* Header do módulo */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-purple-500 rounded-xl blur-md opacity-50"></div>
                      <div className="relative rounded-xl bg-gradient-to-br from-blue-500 to-purple-500 p-2 shadow-lg">
                        <span className="text-white text-lg">⚡</span>
                      </div>
                    </div>
                    <div>
                      <p className="text-sm font-black uppercase tracking-widest text-blue-600 dark:text-blue-400">
                        {selectedMateria}
                      </p>
                      <p className="text-base font-bold text-slate-900 dark:text-white">
                        {selectedModulo}
                      </p>
                      {studyMode === 'miniSim' && (
                        <p className="text-xs font-semibold text-purple-600 dark:text-purple-400 mt-1">
                          ⚡ 10 cards aleatórios deste mini simulado
                        </p>
                      )}
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        {activeCards.length} {activeCards.length === 1 ? 'card' : 'cards'}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedMateria(null)
                      setSelectedModulo(null)
                      setStudyMode('module')
                      setMiniSimCards([])
                    }}
                    className="group/btn relative inline-flex items-center justify-center gap-2 px-4 py-2 border-2 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 font-bold rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-all overflow-hidden"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-slate-500/0 via-slate-500/10 to-slate-500/0 translate-x-[-100%] group-hover/btn:translate-x-[100%] transition-transform duration-700"></div>
                    <span className="relative z-10">← Voltar</span>
                  </button>
                </div>
              
                <FlashcardList
                  cards={activeCards}
                  currentIndex={currentIndex}
                  onSelect={setCurrentIndex}
                  onToggleFavorite={toggleFavorite}
                  onRateDifficulty={rateDifficulty}
                  favorites={favorites}
                  cardProgress={cardProgress}
                  onPrev={goPrev}
                  onNext={goNext}
                  onShuffle={shuffle}
                  viewedIds={viewedIds}
                  showRating={needsReview}
                  onExplainCard={handleExplainCard}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {studyMode === 'module' && moduleCompleted && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="relative max-w-md w-full rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            {/* Background decorativo */}
            <div className="absolute inset-0 bg-gradient-to-br from-green-500/10 via-emerald-500/10 to-teal-500/10"></div>
            
            <div className="relative p-8 text-center">
              <div className="inline-block mb-4 text-6xl animate-bounce">🎉</div>
              <h2 className="text-2xl sm:text-3xl font-black mb-3">
                <span className="bg-gradient-to-r from-green-600 via-emerald-600 to-teal-600 dark:from-green-400 dark:via-emerald-400 dark:to-teal-400 bg-clip-text text-transparent">
                  Módulo Finalizado!
                </span>
              </h2>
              <p className="text-sm font-semibold text-slate-600 dark:text-slate-400 mb-8">
                Você marcou todos os cards como &quot;Fácil&quot;. Deseja revisar este módulo novamente?
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={handleReviewAgain}
                  className="group/btn relative flex-1 rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 px-6 py-3 text-sm font-bold text-white shadow-lg hover:shadow-xl hover:shadow-green-500/50 hover:scale-105 transition-all overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover/btn:translate-x-[100%] transition-transform duration-1000"></div>
                  <span className="relative z-10">🔄 Revisar novamente</span>
                </button>
                <button
                  type="button"
                  onClick={handleExitModule}
                  className="group/btn relative flex-1 rounded-xl border-2 border-slate-300 dark:border-slate-600 px-6 py-3 text-sm font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-slate-500/0 via-slate-500/10 to-slate-500/0 translate-x-[-100%] group-hover/btn:translate-x-[100%] transition-transform duration-700"></div>
                  <span className="relative z-10">← Voltar aos módulos</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {explanationModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="relative max-w-3xl w-full rounded-2xl bg-white dark:bg-slate-900 shadow-2xl max-h-[85vh] overflow-hidden border border-slate-200 dark:border-slate-700">
            {/* Background decorativo */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-blue-500/10 to-purple-500/10 rounded-full blur-3xl -mr-32 -mt-32"></div>
            
            <div className="relative p-6 sm:p-8 max-h-[85vh] overflow-y-auto">
              <div className="flex items-start justify-between gap-4 mb-6">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="relative">
                      <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-purple-500 rounded-lg blur-md opacity-50"></div>
                      <div className="relative rounded-lg bg-gradient-to-br from-blue-500 to-purple-500 p-2">
                        <span className="text-white text-lg">💡</span>
                      </div>
                    </div>
                    <p className="text-xs font-black uppercase tracking-widest text-blue-600 dark:text-blue-400">
                      Explicação da IA
                    </p>
                  </div>
                  <h3 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white mb-2">
                    {explanationModal.card?.pergunta}
                  </h3>
                  {explanationModal.card?.materia && (
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-1 text-xs font-bold rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300">
                        {explanationModal.card.materia}
                      </span>
                      <span className="px-2 py-1 text-xs font-bold rounded-full bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300">
                        {explanationModal.card?.modulo}
                      </span>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={closeExplanationModal}
                  className="group relative flex-shrink-0 w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center transition-all hover:scale-110"
                >
                  <span className="text-lg font-bold text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white">✕</span>
                </button>
              </div>
              
              <div className="relative rounded-xl bg-gradient-to-br from-blue-50/50 via-purple-50/30 to-cyan-50/50 dark:from-blue-900/20 dark:via-purple-900/20 dark:to-cyan-900/20 p-6 border border-blue-200/50 dark:border-blue-800/50 backdrop-blur-sm">
                {explanationModal.loading && (
                  <div className="text-center py-8">
                    <div className="inline-block animate-spin text-blue-500 text-4xl mb-4">⚙️</div>
                    <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">Gerando explicação... aguarde alguns segundos.</p>
                  </div>
                )}
                {explanationModal.error && (
                  <div className="text-center py-8">
                    <p className="text-lg font-bold text-rose-600 dark:text-rose-400 mb-2">❌ Erro</p>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      {explanationModal.error}
                    </p>
                  </div>
                )}
                {!explanationModal.loading && !explanationModal.error && (
                  <p className="text-sm sm:text-base text-slate-700 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
                    {explanationModal.text}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  )
}

export default FlashcardView
