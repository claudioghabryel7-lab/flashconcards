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
  const { user, favorites, updateFavorites } = useAuth()
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
  
  // Timer de estudo - ativo quando um módulo está selecionado
  const isStudying = !!selectedMateria && !!selectedModulo
  const { formattedTime, elapsedSeconds } = useStudyTimer(isStudying, user?.uid)

  // Carregar flashcards do Firestore
  useEffect(() => {
    const cardsRef = collection(db, 'flashcards')
    const unsub = onSnapshot(cardsRef, (snapshot) => {
      const data = snapshot.docs.map((docSnapshot) => ({
        id: docSnapshot.id,
        ...docSnapshot.data(),
      }))
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
  }, [])

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
    <section className="space-y-4 sm:space-y-6 px-2 sm:px-0">
      <div 
        className="rounded-2xl p-4 sm:p-6 shadow-sm"
        style={{
          backgroundColor: darkMode ? '#1e293b' : '#ffffff',
          color: darkMode ? '#f1f5f9' : '#1e293b'
        }}
      >
        <p className="text-xs sm:text-sm font-semibold uppercase tracking-[0.2em] text-alego-500 dark:text-alego-400">
          Sistema de Repetição Espaçada (SRS)
        </p>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0">
          <div className="flex-1">
            <h1 className="mt-2 text-xl sm:text-2xl md:text-3xl font-bold text-alego-700 dark:text-alego-300">
              Flashcards Organizados por Matéria e Módulo
            </h1>
            <p className="mt-2 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              {isStudying 
                ? `Estudando: ${selectedMateria} - ${selectedModulo}`
                : 'Selecione uma matéria e módulo para começar a estudar'}
            </p>
          </div>
          {isStudying && (
            <div className="flex items-center gap-2 rounded-full bg-alego-100 dark:bg-alego-900 px-3 sm:px-4 py-2 self-start sm:self-auto">
              <ClockIcon className="h-4 w-4 sm:h-5 sm:w-5 text-alego-600 dark:text-alego-400" />
              <span className="text-xs sm:text-sm font-semibold text-alego-700 dark:text-alego-300">
                {formattedTime}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-3">
        {/* Árvore de Pastas */}
        <div 
          className="rounded-2xl p-4 sm:p-6 shadow-sm"
          style={{
            backgroundColor: darkMode ? '#1e293b' : '#ffffff',
            color: darkMode ? '#f1f5f9' : '#1e293b'
          }}
        >
          <p className="mb-3 sm:mb-4 text-xs sm:text-sm font-semibold text-alego-600 dark:text-alego-400">
            Estrutura de Estudo:
          </p>
          <div className="space-y-1">
            {MATERIAS.map((materia) => {
              const modulos = organizedCards[materia] ? Object.keys(organizedCards[materia]) : []
              const isExpanded = expandedMaterias[materia]
              const isSelected = selectedMateria === materia
              
              if (modulos.length === 0) return null
              
              return (
                <div key={materia}>
                  <button
                    type="button"
                    onClick={() => toggleMateria(materia)}
                    className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold transition ${
                      isSelected
                        ? 'bg-alego-100 dark:bg-alego-900 text-alego-700 dark:text-alego-300'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                    }`}
                  >
                    {isExpanded ? (
                      <ChevronDownIcon className="h-4 w-4" />
                    ) : (
                      <ChevronRightIcon className="h-4 w-4" />
                    )}
                    <FolderIcon className="h-5 w-5" />
                    <span className="flex-1">{materia}</span>
                    <span className="rounded-full bg-slate-200 dark:bg-slate-700 px-2 py-0.5 text-xs text-slate-700 dark:text-slate-300">
                      {modulos.length}
                    </span>
                  </button>
                  
                  {isExpanded && (
                    <div className="ml-6 mt-1 space-y-2">
                      {modulos
                        .sort((a, b) => {
                          // Extrair números dos módulos para ordenação numérica
                          const extractNumber = (str) => {
                            const match = str.match(/\d+/)
                            return match ? parseInt(match[0], 10) : 999
                          }
                          const numA = extractNumber(a)
                          const numB = extractNumber(b)
                          
                          // Se ambos têm números, ordenar numericamente
                          if (numA !== 999 && numB !== 999) {
                            return numA - numB
                          }
                          
                          // Se apenas um tem número, o com número vem primeiro
                          if (numA !== 999) return -1
                          if (numB !== 999) return 1
                          
                          // Se nenhum tem número, ordenar alfabeticamente
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
                            className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition ${
                              isModuloSelected
                                ? 'bg-alego-600 dark:bg-alego-700 text-white'
                                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                            }`}
                          >
                            <span>{modulo}</span>
                            <span className={`rounded-full px-2 py-0.5 text-xs ${
                              isModuloSelected
                                ? 'bg-white/20 text-white'
                                : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                            }`}>
                              {cardsInModulo.length}
                            </span>
                          </button>
                        )
                      })}
                      <button
                        type="button"
                        onClick={() => startMiniSim(materia)}
                        className="w-full rounded-lg border border-dashed border-alego-400 px-3 py-2 text-left text-sm font-semibold text-alego-600 dark:text-alego-300 hover:bg-alego-50/50 dark:hover:bg-slate-800"
                      >
                        Mini simulado (10 cards)
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Área de Estudo */}
        <div className="lg:col-span-2">
          {!selectedMateria || !selectedModulo ? (
            <div 
              className="rounded-2xl p-6 sm:p-8 md:p-12 text-center shadow-sm"
              style={{
                backgroundColor: darkMode ? '#1e293b' : '#ffffff',
                color: darkMode ? '#f1f5f9' : '#1e293b'
              }}
            >
              <p className="text-3xl sm:text-4xl mb-3 sm:mb-4">📚</p>
              <p className="text-base sm:text-lg font-semibold text-slate-600 dark:text-slate-300">
                Selecione uma matéria e módulo para começar
              </p>
              <p className="mt-2 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                Navegue pela estrutura ao lado e escolha o conteúdo que deseja estudar
              </p>
            </div>
          ) : activeCards.length === 0 ? (
            <div 
              className="rounded-2xl p-8 text-center shadow-sm"
              style={{
                backgroundColor: darkMode ? '#1e293b' : '#ffffff',
                color: darkMode ? '#cbd5e1' : '#64748b'
              }}
            >
              <p>Nenhum card encontrado neste módulo.</p>
            </div>
          ) : (
            <div 
              className="rounded-2xl p-4 sm:p-6 shadow-sm"
              style={{
                backgroundColor: darkMode ? '#1e293b' : '#ffffff',
                color: darkMode ? '#f1f5f9' : '#1e293b'
              }}
            >
              <div className="mb-3 sm:mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0">
                <div>
                  <p className="text-xs sm:text-sm font-semibold text-alego-600 dark:text-alego-400">
                    {selectedMateria} • {selectedModulo}
                  </p>
                  {studyMode === 'miniSim' && (
                    <p className="text-[11px] uppercase tracking-wide text-alego-500 dark:text-alego-400">
                      10 cards aleatórios deste mini simulado
                    </p>
                  )}
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {activeCards.length} {activeCards.length === 1 ? 'card' : 'cards'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedMateria(null)
                    setSelectedModulo(null)
                    setStudyMode('module')
                    setMiniSimCards([])
                  }}
                  className="rounded-full border border-slate-300 dark:border-slate-600 px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 self-start sm:self-auto"
                >
                  Voltar
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
          )}
        </div>
      </div>

      {studyMode === 'module' && moduleCompleted && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4">
          <div className="max-w-md w-full rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-2xl">
            <p className="text-4xl mb-4 text-center">🎉</p>
            <h2 className="text-xl font-bold text-center text-alego-700 dark:text-alego-300">
              Módulo finalizado!
            </h2>
            <p className="mt-2 text-sm text-center text-slate-600 dark:text-slate-300">
              Você marcou todos os cards como &quot;Fácil&quot;. Deseja revisar este módulo novamente?
            </p>
            <div className="mt-6 flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={handleReviewAgain}
                className="flex-1 rounded-full bg-alego-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-alego-700"
              >
                Revisar novamente
              </button>
              <button
                type="button"
                onClick={handleExitModule}
                className="flex-1 rounded-full border border-slate-300 dark:border-slate-600 px-4 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Voltar aos módulos
              </button>
            </div>
          </div>
        </div>
      )}

      {explanationModal.open && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4">
          <div className="max-w-2xl w-full rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-2xl max-h-[80vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-wide text-alego-500">Explicação da IA</p>
                <h3 className="text-xl font-bold text-alego-700 dark:text-alego-300">
                  {explanationModal.card?.pergunta}
                </h3>
                {explanationModal.card?.materia && (
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {explanationModal.card.materia} • {explanationModal.card?.modulo}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={closeExplanationModal}
                className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 text-sm font-semibold"
              >
                Fechar ✕
              </button>
            </div>
            <div className="mt-4 rounded-xl bg-slate-50 dark:bg-slate-800 p-4 text-sm text-slate-700 dark:text-slate-200 space-y-3">
              {explanationModal.loading && <p>Gerando explicação... aguarde alguns segundos.</p>}
              {explanationModal.error && (
                <p className="text-rose-600">
                  {explanationModal.error}
                </p>
              )}
              {!explanationModal.loading && !explanationModal.error && (
                <p className="whitespace-pre-wrap leading-relaxed">{explanationModal.text}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

export default FlashcardView
