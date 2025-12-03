import { useEffect, useMemo, useState, useRef } from 'react'
import { collection, onSnapshot, doc, getDoc, setDoc, updateDoc, increment, serverTimestamp } from 'firebase/firestore'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { db } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'
import { FolderIcon, ChevronRightIcon, SparklesIcon, ArrowDownTrayIcon, ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline'

const MindMapView = () => {
  const { user, profile } = useAuth()
  const [cards, setCards] = useState([])
  const [selectedMateria, setSelectedMateria] = useState(null)
  const [selectedModulo, setSelectedModulo] = useState(null)
  const [expandedMaterias, setExpandedMaterias] = useState({})
  const [expandedThemes, setExpandedThemes] = useState({})
  const [expandedCards, setExpandedCards] = useState({})
  const [generating, setGenerating] = useState(false)
  const [generationProgress, setGenerationProgress] = useState('')
  const [selectedCourseId, setSelectedCourseId] = useState(null)
  const [selectedCourse, setSelectedCourse] = useState(null)
  const [availableCourses, setAvailableCourses] = useState([])
  const [cardsLoading, setCardsLoading] = useState(true)
  const [organizedThemes, setOrganizedThemes] = useState([])
  const [centralNodeTitle, setCentralNodeTitle] = useState('')
  const [mindMapLikes, setMindMapLikes] = useState(0)
  const [mindMapDislikes, setMindMapDislikes] = useState(0)
  const [mindMapScore, setMindMapScore] = useState(null)
  const [hasRated, setHasRated] = useState(false)
  const [currentCacheId, setCurrentCacheId] = useState(null)
  const [regenerationCount, setRegenerationCount] = useState(0)

  // Usar curso selecionado do perfil do usuário
  useEffect(() => {
    if (!profile) return
    
    const courseFromProfile = profile.selectedCourseId !== undefined ? profile.selectedCourseId : null
    setSelectedCourseId(courseFromProfile)
    
    const purchasedCourses = profile.purchasedCourses || []
    const isAdmin = profile.role === 'admin'
    
    const coursesRef = collection(db, 'courses')
    const unsub = onSnapshot(coursesRef, (snapshot) => {
      const allCourses = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }))
      
      const filtered = isAdmin 
        ? allCourses.filter(c => c.active !== false)
        : allCourses.filter(c => purchasedCourses.includes(c.id) && c.active !== false)
      
      setAvailableCourses(filtered)
      
      if (courseFromProfile) {
        const course = allCourses.find(c => c.id === courseFromProfile)
        setSelectedCourse(course || null)
      }
    })
    
    return () => unsub()
  }, [profile])

  // Carregar flashcards filtrados por curso
  useEffect(() => {
    if (!user || !profile) return
    
    setCardsLoading(true)
    const cardsRef = collection(db, 'flashcards')
    const unsub = onSnapshot(cardsRef, (snapshot) => {
      let data = snapshot.docs.map((docSnapshot) => ({
        id: docSnapshot.id,
        ...docSnapshot.data(),
      }))
      
      // Normalizar courseId para filtro
      if (selectedCourseId) {
        data = data.filter(card => {
          const cardCourseId = card.courseId
          return cardCourseId === selectedCourseId
        })
      } else {
        data = data.filter(card => {
          const cardCourseId = card.courseId
          return !cardCourseId || cardCourseId === null || cardCourseId === undefined || cardCourseId === ''
        })
      }
      
      setCards(data)
      setCardsLoading(false)
    })
    
    return () => unsub()
  }, [user, profile, selectedCourseId])

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

  const toggleMateria = (materia) => {
    setExpandedMaterias((prev) => ({
      ...prev,
      [materia]: !prev[materia],
    }))
  }

  const toggleTheme = (themeId) => {
    setExpandedThemes((prev) => ({
      ...prev,
      [themeId]: !prev[themeId],
    }))
  }

  const toggleCard = (cardId) => {
    setExpandedCards((prev) => ({
      ...prev,
      [cardId]: !prev[cardId],
    }))
  }

  // Gerar mapa mental interativo
  const generateMindMap = async (materia, modulo) => {
    if (!materia || !modulo) return
    
    setSelectedMateria(materia)
    setSelectedModulo(modulo)
    setGenerating(true)
    setGenerationProgress('Carregando flashcards...')
    setOrganizedThemes([])
    setExpandedThemes({})
    setExpandedCards({})
    
    try {
      // Buscar flashcards do módulo
      const moduleCards = organizedCards[materia]?.[modulo] || []
      
      if (moduleCards.length === 0) {
        throw new Error(`Nenhum flashcard encontrado para "${materia}" - "${modulo}".`)
      }
      
      console.log(`📚 Encontrados ${moduleCards.length} flashcards para ${materia} - ${modulo}`)
      
      // Validar flashcards
      const validCards = moduleCards.filter(card => {
        const question = String(card.pergunta || card.front || '').trim()
        const answer = String(card.resposta || card.back || '').trim()
        return question || answer
      })
      
      if (validCards.length === 0) {
        throw new Error('Os flashcards encontrados não têm conteúdo válido.')
      }
      
      // Definir título central
      setCentralNodeTitle((materia || 'TÓPICO PRINCIPAL').toUpperCase())
      
      // Organizar com Gemini (se disponível)
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY
      if (apiKey && validCards.length > 3) {
        try {
          setGenerationProgress('Organizando conteúdo com IA...')
          
          const cardsContent = validCards
            .slice(0, 20)
            .map((card, idx) => {
              const question = String(card.pergunta || card.front || '').trim()
              const answer = String(card.resposta || card.back || '').trim()
              return `Card ${idx + 1}:\nPergunta: ${question}\nResposta: ${answer}`
            }).join('\n\n')
          
          const genAI = new GoogleGenerativeAI(apiKey)
          const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })
          
          const prompt = `Analise os flashcards abaixo e organize-os em até 6 temas principais. Para cada tema, crie um título descritivo (máximo 60 caracteres) e liste os flashcards que pertencem a esse tema.

FLASHCARDS:
${cardsContent}

Retorne APENAS um JSON com esta estrutura:
{
  "temas": [
    {
      "nome": "Nome do Tema 1",
      "cardIndices": [1, 2, 3]
    },
    {
      "nome": "Nome do Tema 2",
      "cardIndices": [4, 5]
    }
  ]
}

IMPORTANTE: Use os índices dos cards (1, 2, 3...) conforme numerados acima.`

          const result = await model.generateContent({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 1000,
            },
          })
          
          const responseText = result.response.text().trim()
          let jsonText = responseText
          
          // Extrair JSON
          if (jsonText.includes('```json')) {
            jsonText = jsonText.split('```json')[1].split('```')[0].trim()
          } else if (jsonText.includes('```')) {
            jsonText = jsonText.split('```')[1].split('```')[0].trim()
          }
          
          const firstBrace = jsonText.indexOf('{')
          const lastBrace = jsonText.lastIndexOf('}')
          if (firstBrace !== -1 && lastBrace !== -1) {
            jsonText = jsonText.substring(firstBrace, lastBrace + 1)
            const parsed = JSON.parse(jsonText)
            if (parsed.temas && parsed.temas.length > 0) {
              // Organizar temas com os cards reais
              const themes = parsed.temas.map((tema, idx) => ({
                id: `theme-${idx}`,
                name: tema.nome,
                cards: tema.cardIndices
                  .map(i => validCards[i - 1]) // Converter índice (1-based) para array (0-based)
                  .filter(Boolean) // Remover undefined
              })).filter(t => t.cards.length > 0)
              
              // Adicionar cards não categorizados
              const categorizedIndices = new Set(parsed.temas.flatMap(t => t.cardIndices))
              const uncategorizedCards = validCards
                .map((card, idx) => ({ card, idx: idx + 1 }))
                .filter(({ idx }) => !categorizedIndices.has(idx))
                .map(({ card }) => card)
              
              if (uncategorizedCards.length > 0 && themes.length < 6) {
                themes.push({
                  id: 'theme-uncategorized',
                  name: 'Outros Tópicos',
                  cards: uncategorizedCards
                })
              }
              
              setOrganizedThemes(themes)
              
              // Salvar no cache
              await saveMindMapToCache(themes, validCards)
              
              setGenerating(false)
              setGenerationProgress('')
              return
            }
          }
        } catch (geminiErr) {
          console.warn('⚠️ Erro ao organizar com Gemini, usando organização padrão:', geminiErr)
        }
      }
      
      // Organização padrão (sem Gemini)
      setGenerationProgress('Organizando conteúdo...')
      
      const themes = organizeFlashcardsByThemes(validCards)
      setOrganizedThemes(themes)
      
      // Salvar no cache
      await saveMindMapToCache(themes, validCards)
      
      setGenerating(false)
      setGenerationProgress('')
      
    } catch (error) {
      console.error('❌ Erro ao gerar mapa mental:', error)
      setGenerationProgress(`Erro: ${error.message}`)
      setGenerating(false)
      alert(`Erro ao gerar mapa mental:\n\n${error.message}`)
    }
  }

  // Calcular score (0-100)
  const calculateScore = (likes, dislikes) => {
    const total = likes + dislikes
    if (total === 0) return 100 // Sem avaliações = neutro
    return Math.round((likes / total) * 100)
  }

  // Salvar mapa mental no cache
  const saveMindMapToCache = async (themes, flashcards) => {
    try {
      if (!selectedMateria || !selectedModulo) return
      
      const cacheId = `${selectedCourseId || 'alego-default'}_${selectedMateria}_${selectedModulo}`.replace(/[^a-zA-Z0-9_]/g, '_')
      setCurrentCacheId(cacheId)
      
      const cacheRef = doc(db, 'mindMapsCache', cacheId)
      
      await setDoc(cacheRef, {
        courseId: selectedCourseId || 'alego-default',
        materia: selectedMateria,
        modulo: selectedModulo,
        themes: themes.map(t => ({
          id: t.id,
          name: t.name,
          cardsCount: t.cards?.length || 0
        })),
        flashcardsCount: flashcards.length,
        likes: 0,
        dislikes: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }, { merge: false })
      
      // Buscar avaliações existentes
      const cacheSnap = await getDoc(cacheRef)
      if (cacheSnap.exists()) {
        const data = cacheSnap.data()
        setMindMapLikes(data.likes || 0)
        setMindMapDislikes(data.dislikes || 0)
        const score = calculateScore(data.likes || 0, data.dislikes || 0)
        setMindMapScore(score)
      } else {
        setMindMapLikes(0)
        setMindMapDislikes(0)
        setMindMapScore(null)
      }
      
      setHasRated(false)
      setRegenerationCount(0)
      
      console.log(`✅ Mapa mental salvo no cache: ${cacheId}`)
    } catch (error) {
      console.error('❌ Erro ao salvar mapa mental no cache:', error)
    }
  }

  // Avaliar mapa mental
  const rateMindMap = async (isLike) => {
    if (!currentCacheId || hasRated) {
      alert('Você já avaliou este mapa mental ou não há mapa para avaliar.')
      return
    }
    
    try {
      const cacheRef = doc(db, 'mindMapsCache', currentCacheId)
      
      const update = {
        updatedAt: serverTimestamp(),
      }
      
      if (isLike) {
        update.likes = increment(1)
        setMindMapLikes(prev => prev + 1)
      } else {
        update.dislikes = increment(1)
        setMindMapDislikes(prev => prev + 1)
      }
      
      await updateDoc(cacheRef, update)
      
      // Calcular novo score
      const newLikes = isLike ? mindMapLikes + 1 : mindMapLikes
      const newDislikes = isLike ? mindMapDislikes : mindMapDislikes + 1
      const score = calculateScore(newLikes, newDislikes)
      
      setMindMapScore(score)
      setHasRated(true)
      
      console.log(`✅ Avaliação registrada: ${isLike ? 'like' : 'dislike'}, Score: ${score}%`)
      
      // Se score < 50% e ainda não regenerou muitas vezes, gerar novo mapa
      if (score < 50 && regenerationCount < 2) {
        const newCount = regenerationCount + 1
        setRegenerationCount(newCount)
        alert(`Score atual: ${score}%\n\nGerando novo mapa mental para melhorar a qualidade... (Tentativa ${newCount}/2)`)
        setHasRated(false) // Permitir nova avaliação
        setGenerating(true)
        setGenerationProgress('Regenerando mapa mental...')
        await generateMindMap(selectedMateria, selectedModulo)
      } else {
        if (score < 50) {
          alert(`Obrigado pela avaliação!\n\nScore: ${score}%\n\nJá foram feitas ${regenerationCount} tentativas de melhoria.`)
        } else {
          alert(`Obrigado pela avaliação!\n\nScore: ${score}%`)
        }
      }
    } catch (error) {
      console.error('❌ Erro ao avaliar mapa mental:', error)
      alert('Erro ao registrar avaliação. Tente novamente.')
    }
  }

  // Organizar flashcards em temas (fallback)
  function organizeFlashcardsByThemes(flashcards) {
    const themes = []
    const themeMap = new Map()
    
    flashcards.forEach((card, idx) => {
      const question = String(card.pergunta || card.front || '').trim()
      const answer = String(card.resposta || card.back || '').trim()
      
      if (!question && !answer) return
      
      // Extrair palavras-chave
      const stopWords = ['qual', 'como', 'quando', 'onde', 'porque', 'para', 'com', 'sem', 'sobre', 'entre', 'que', 'qual', 'quais']
      const words = question
        .split(' ')
        .filter(w => w.length > 4 && !stopWords.includes(w.toLowerCase()))
        .slice(0, 4)
      
      const themeKey = words.join(' ').substring(0, 50) || 'Conceitos Gerais'
      
      if (!themeMap.has(themeKey)) {
        themeMap.set(themeKey, {
          id: `theme-${themeMap.size}`,
          name: themeKey,
          cards: []
        })
      }
      
      themeMap.get(themeKey).cards.push(card)
    })
    
    // Converter para array e ordenar
    themes.push(...Array.from(themeMap.values()))
    themes.sort((a, b) => b.cards.length - a.cards.length)
    
    // Limitar a 6 temas
    if (themes.length > 6) {
      const mainThemes = themes.slice(0, 5)
      const otherCards = themes.slice(5).flatMap(t => t.cards)
      
      if (otherCards.length > 0) {
        mainThemes.push({
          id: 'theme-others',
          name: 'Outros Tópicos',
          cards: otherCards
        })
      }
      
      return mainThemes
    }
    
    return themes
  }

  return (
    <div className="min-h-screen py-6">
      <div className="mx-auto max-w-7xl px-4">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-200 mb-2">
            Mapas Mentais Interativos
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            Gere mapas mentais dinâmicos e interativos com conteúdo completo dos flashcards
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Painel lateral - Estrutura */}
          <div className="lg:col-span-1">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-6">
              <h2 className="text-xl font-bold text-slate-700 dark:text-slate-300 mb-4">
                Estrutura de Estudo
              </h2>
              
              {cardsLoading ? (
                <div className="text-center py-8">
                  <p className="text-sm text-slate-500 dark:text-slate-400">Carregando...</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {Object.keys(organizedCards)
                    .sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }))
                    .map((materia) => {
                      const modulos = organizedCards[materia] ? Object.keys(organizedCards[materia]) : []
                      const isExpanded = expandedMaterias[materia]
                      
                      if (modulos.length === 0) return null
                      
                      return (
                        <div key={materia} className="space-y-2">
                          <button
                            onClick={() => toggleMateria(materia)}
                            className="w-full flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors"
                          >
                            <div className="flex items-center gap-2">
                              <FolderIcon className="h-5 w-5 text-slate-500 dark:text-slate-400" />
                              <span className="font-semibold text-slate-700 dark:text-slate-300">
                                {materia}
                              </span>
                            </div>
                            <ChevronRightIcon
                              className={`h-5 w-5 text-slate-500 dark:text-slate-400 transition-transform ${
                                isExpanded ? 'rotate-90' : ''
                              }`}
                            />
                          </button>
                          
                          {isExpanded && (
                            <div className="ml-4 space-y-1">
                              {modulos.map((modulo) => {
                                const isSelected = selectedMateria === materia && selectedModulo === modulo
                                const cardCount = organizedCards[materia][modulo].length
                                
                                return (
                                  <button
                                    key={modulo}
                                    onClick={() => generateMindMap(materia, modulo)}
                                    className={`w-full text-left p-2 rounded-lg transition-colors ${
                                      isSelected
                                        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                                        : 'hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400'
                                    }`}
                                  >
                                    <div className="flex items-center justify-between">
                                      <span className="text-sm font-medium">{modulo}</span>
                                      <span className="text-xs text-slate-500 dark:text-slate-500">
                                        {cardCount} cards
                                      </span>
                                    </div>
                                  </button>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })}
                </div>
              )}
            </div>
          </div>

          {/* Área principal - Mapa Mental Interativo */}
          <div className="lg:col-span-2">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-6">
              {generating ? (
                <div className="text-center py-12">
                  <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent mb-4"></div>
                  <p className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-2">
                    Gerando mapa mental...
                  </p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {generationProgress || 'Processando...'}
                  </p>
                </div>
              ) : organizedThemes.length > 0 ? (
                <div className="space-y-6">
                  {/* Título */}
                  <div>
                    <h2 className="text-4xl font-bold text-slate-900 dark:text-slate-100 mb-2">
                      {selectedModulo || selectedMateria || 'Mapa Mental'}
                    </h2>
                    <p className="text-lg text-slate-600 dark:text-slate-400">
                      Com base em {cards.filter(c => {
                        const materia = c.materia || 'Sem matéria'
                        const modulo = c.modulo || 'Sem módulo'
                        return materia === selectedMateria && modulo === selectedModulo
                      }).length} flashcards
                    </p>
                  </div>

                  {/* Mapa Mental Interativo */}
                  <div className="relative">
                    {/* Nó Central */}
                    <div className="mb-8">
                      <div className="inline-block px-6 py-4 rounded-xl bg-gradient-to-r from-purple-100 to-purple-200 dark:from-purple-900/30 dark:to-purple-800/30 border-2 border-purple-400 dark:border-purple-600 shadow-lg">
                        <h3 className="text-2xl font-bold text-purple-900 dark:text-purple-100">
                          {centralNodeTitle || (selectedMateria || 'TÓPICO PRINCIPAL').toUpperCase()}
                        </h3>
                      </div>
                    </div>

                    {/* Nós Secundários */}
                    <div className="space-y-4 ml-8">
                      {organizedThemes.map((theme, idx) => {
                        const isExpanded = expandedThemes[theme.id]
                        const themeCards = theme.cards || []
                        
                        return (
                          <div key={theme.id} className="relative">
                            {/* Linha conectora */}
                            <div className="absolute -left-8 top-1/2 w-8 h-0.5 bg-purple-400 dark:bg-purple-600"></div>
                            
                            {/* Nó do Tema */}
                            <div className="bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 rounded-xl border-2 border-blue-300 dark:border-blue-600 shadow-md overflow-hidden">
                              <button
                                onClick={() => toggleTheme(theme.id)}
                                className="w-full flex items-center justify-between p-4 hover:bg-blue-100/50 dark:hover:bg-blue-900/30 transition-colors"
                              >
                                <h4 className="text-xl font-bold text-blue-900 dark:text-blue-100 text-left">
                                  {theme.name.toUpperCase()}
                                </h4>
                                {isExpanded ? (
                                  <ChevronUpIcon className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                                ) : (
                                  <ChevronDownIcon className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                                )}
                              </button>
                              
                              {/* Conteúdo expandido */}
                              {isExpanded && (
                                <div className="px-4 pb-4 space-y-3 border-t border-blue-200 dark:border-blue-700">
                                  {themeCards.map((card) => {
                                    const isCardExpanded = expandedCards[card.id]
                                    const question = String(card.pergunta || card.front || '').trim()
                                    const answer = String(card.resposta || card.back || '').trim()
                                    
                                    return (
                                      <div
                                        key={card.id}
                                        className="bg-white dark:bg-slate-700 rounded-lg border border-blue-200 dark:border-blue-700 overflow-hidden"
                                      >
                                        <button
                                          onClick={() => toggleCard(card.id)}
                                          className="w-full text-left p-3 hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors flex items-center justify-between"
                                        >
                                          <span className="font-semibold text-slate-700 dark:text-slate-300 flex-1">
                                            {question.length > 80 ? question.substring(0, 80) + '...' : question}
                                          </span>
                                          {isCardExpanded ? (
                                            <ChevronUpIcon className="h-5 w-5 text-slate-400 ml-2 flex-shrink-0" />
                                          ) : (
                                            <ChevronDownIcon className="h-5 w-5 text-slate-400 ml-2 flex-shrink-0" />
                                          )}
                                        </button>
                                        
                                        {isCardExpanded && (
                                          <div className="px-3 pb-3 border-t border-slate-200 dark:border-slate-600">
                                            <div className="pt-3 space-y-2">
                                              <div>
                                                <p className="text-sm font-semibold text-slate-600 dark:text-slate-400 mb-1">
                                                  Pergunta:
                                                </p>
                                                <p className="text-slate-700 dark:text-slate-300">
                                                  {question}
                                                </p>
                                              </div>
                                              {answer && (
                                                <div>
                                                  <p className="text-sm font-semibold text-slate-600 dark:text-slate-400 mb-1">
                                                    Resposta:
                                                  </p>
                                                  <p className="text-slate-700 dark:text-slate-300">
                                                    {answer}
                                                  </p>
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Botões de Feedback */}
                  <div className="flex items-center gap-4 pt-6 border-t border-slate-200 dark:border-slate-700">
                    <button
                      onClick={() => rateMindMap(true)}
                      disabled={hasRated}
                      className={`flex items-center gap-2 px-4 py-2 rounded-full transition-colors ${
                        hasRated
                          ? 'bg-slate-200 dark:bg-slate-600 cursor-not-allowed opacity-50'
                          : 'bg-green-100 dark:bg-green-900/30 hover:bg-green-200 dark:hover:bg-green-900/50'
                      }`}
                    >
                      <span>👍</span>
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        Conteúdo bom {mindMapLikes > 0 && `(${mindMapLikes})`}
                      </span>
                    </button>
                    <button
                      onClick={() => rateMindMap(false)}
                      disabled={hasRated}
                      className={`flex items-center gap-2 px-4 py-2 rounded-full transition-colors ${
                        hasRated
                          ? 'bg-slate-200 dark:bg-slate-600 cursor-not-allowed opacity-50'
                          : 'bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50'
                      }`}
                    >
                      <span>👎</span>
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        Conteúdo ruim {mindMapDislikes > 0 && `(${mindMapDislikes})`}
                      </span>
                    </button>
                    {mindMapScore !== null && (
                      <div className="ml-auto flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-600 dark:text-slate-400">
                          Score:
                        </span>
                        <span className={`text-lg font-bold ${
                          mindMapScore >= 70 ? 'text-green-600 dark:text-green-400' :
                          mindMapScore >= 50 ? 'text-yellow-600 dark:text-yellow-400' :
                          'text-red-600 dark:text-red-400'
                        }`}>
                          {mindMapScore}%
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Disclaimer */}
                  <p className="text-sm text-slate-500 dark:text-slate-400 text-center">
                    O conteúdo pode conter erros. Por isso, verifique o conteúdo.
                  </p>
                </div>
              ) : (
                <div className="text-center py-12">
                  <SparklesIcon className="h-16 w-16 text-blue-600 dark:text-blue-400 mx-auto mb-4" />
                  <p className="text-xl font-bold text-slate-700 dark:text-slate-300 mb-2">
                    Selecione um módulo para gerar o mapa mental
                  </p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Escolha uma matéria e módulo na estrutura ao lado
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default MindMapView
