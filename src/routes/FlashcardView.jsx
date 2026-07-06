import { useEffect, useMemo, useState, useCallback } from 'react'
import { useSearchParams, Link, useNavigate } from 'react-router-dom'
import { collection, doc, getDoc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore'
import { useEditalFlashcards } from '../hooks/useEditalFlashcards'
import {
  buildOrganizedCardsFromEdital,
  cardMatchesModule,
  countCardsInModule,
} from '../utils/editalVerticalizadoLoader'
import dayjs from 'dayjs'
import FlashcardList from '../components/FlashcardList'
import { userFlashcardsService } from '../services/userFlashcardsService'
import { db } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'
import { useDarkMode } from '../hooks/useDarkMode.jsx'
import { useStudyTimer } from '../hooks/useStudyTimer'
import { useStudySession } from '../hooks/useStudySession'
import { useSubjectOrder } from '../hooks/useSubjectOrder'
import { applySubjectOrder, applyModuleOrder, getModuleOrder } from '../utils/subjectOrder'
import { ChevronRightIcon, ChevronDownIcon, ClockIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { canAccessMateria, canAccessModulo, isTrialMode } from '../utils/trialLimits'
import { callGeminiWithRetry, extractGeneratedText } from '../utils/geminiApi'
import { CPPageHeader } from '@/components/cp/CPPageLayout'
import {
  calculateNextReview,
  isCardDue,
} from '../utils/spacedRepetition'
import { CONTENT_STATUS } from '../utils/contentStatus'
import AnkiExportService from '../services/ankiExportService'
import {
  filterOrganizedCardsWithContent,
} from '../utils/courseAccess'

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

// Mapeamento de nomes alternativos para nomes exatos
const MATERIA_ALIASES = {
  'língua portuguesa': 'Português',
  'lingua portuguesa': 'Português',
  'português': 'Português',
  'portugues': 'Português',
  'língua portuguesa interpretação de texto': 'Português',
  'direito constitucional': 'DIREITO CONSTITUCIONAL',
  'direito administrativo': 'DIREITO ADMINISTRATIVO',
  'direito penal': 'DIREITO PENAL',
  'administração': 'ADMINISTRAÇÃO',
}

// Mapeamento de módulos alternativos (normalizar variações comuns)
const normalizeModuloName = (moduloName, materiaName) => {
  if (!moduloName) return moduloName
  
  const normalized = moduloName.trim().toLowerCase()
  
  // Mapeamentos comuns para Português
  if (materiaName && (materiaName.toLowerCase().includes('português') || materiaName.toLowerCase().includes('portuguesa'))) {
    const moduloAliases = {
      'interpretação de texto': 'Compreensão e Interpretação Textual',
      'interpretacao de texto': 'Compreensão e Interpretação Textual',
      'compreensão textual': 'Compreensão e Interpretação Textual',
      'compreensao textual': 'Compreensão e Interpretação Textual',
      'interpretação textual': 'Compreensão e Interpretação Textual',
      'interpretacao textual': 'Compreensão e Interpretação Textual',
    }
    
    if (moduloAliases[normalized]) {
      return moduloAliases[normalized]
    }
  }
  
  return moduloName // Retornar original se não houver mapeamento
}

// Sistema SRS - Repetição Espaçada estilo Noji/Anki
const SRS_INTERVALS = {
  // Hard/Difícil: Repetir em 1 minuto
  hard: { minutes: 1 },
  // Easy/Fácil: Repetir em 15 minutos  
  easy: { minutes: 15 }
}

const FlashcardView = () => {
  const navigate = useNavigate()
  const { user, favorites, updateFavorites, profile } = useAuth()
  const { darkMode } = useDarkMode()
  const [searchParams, setSearchParams] = useSearchParams()
  const [userCards, setUserCards] = useState([]) // Flashcards individuais do usuário
  const [cardProgress, setCardProgress] = useState({})
  const [currentIndex, setCurrentIndex] = useState(0)
  const [selectedMateria, setSelectedMateria] = useState(null)
  const [selectedModulo, setSelectedModulo] = useState(null)
  const [expandedMaterias, setExpandedMaterias] = useState({})
  const [sessionRatings, setSessionRatings] = useState({})
  const [moduleCompleted, setModuleCompleted] = useState(false)
  const [studyMode, setStudyMode] = useState('module')
  const [miniSimCards, setMiniSimCards] = useState([])
  const [editalPrompt, setEditalPrompt] = useState('')
  const [selectedCourseId, setSelectedCourseId] = useState(null) // Curso selecionado (null = ALEGO padrão)
  const [availableCourses, setAvailableCourses] = useState([]) // Cursos disponíveis para o usuário
  const [timerActive, setTimerActive] = useState(false) // Timer só inicia quando usuário clicar no relógio

  const isAdmin = profile?.role === 'admin'

  const {
    cards,
    edital,
    loading: cardsLoading,
    hasEdital,
  } = useEditalFlashcards(selectedCourseId, user, profile)
  const [generatingFlashcards, setGeneratingFlashcards] = useState(false) // Estado para loading de geração
  const [selectedDifficulty, setSelectedDifficulty] = useState('') // Dificuldade selecionada para geração
  const [sidebarSearch, setSidebarSearch] = useState('')
  const [srsNow, setSrsNow] = useState(() => dayjs())
  
  // Hook de rastreamento de sessão de estudo
  const { sessionActive, sessionStartTime, resetInactivityTimeout } = useStudySession(
    user?.uid, 
    selectedMateria
  )
  
  // Função para recarregar flashcards do usuário
  const loadUserFlashcards = async () => {
    if (!user) return
    try {
      console.log('🔍 Carregando flashcards do usuário:', user.uid, 'curso:', selectedCourseId)
      const userFlashcards = await userFlashcardsService.getUserFlashcards(user.uid, selectedCourseId)
      console.log('📝 Flashcards do usuário carregados:', userFlashcards.length, userFlashcards)
      setUserCards(userFlashcards)
    } catch (error) {
      console.error('Erro ao carregar flashcards do usuário:', error)
    }
  }
  
  // Timer de estudo - ativo apenas quando usuário clicar no relógio
  const isStudying = !!selectedMateria && !!selectedModulo
  const { formattedTime, elapsedSeconds } = useStudyTimer(timerActive && isStudying, user?.uid, selectedCourseId)
  
  // Carregar ordem de matérias e módulos
  const { subjectOrderConfig, moduleOrderConfigs, loadModuleOrder } = useSubjectOrder(selectedCourseId, user?.uid)

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
      
      // Filtrar cursos: admin vê comprados; aluno vê comprados + curso selecionado (preview)
      const filtered = isAdmin 
        ? allCourses.filter(c => c.active !== false)
        : allCourses.filter(c => {
            if (c.active === false) return false
            if (purchasedCourses.includes(c.id)) return true
            if (courseFromProfile && c.id === courseFromProfile) return true
            return c.id === 'alego-default'
          })
      
      setAvailableCourses(filtered)
    }, (error) => {
      console.error('Erro ao carregar cursos:', error)
      setAvailableCourses([])
    })
    
    return () => unsub()
  }, [profile])
  
  // Carregar flashcards do usuário quando mudar o usuário ou curso
  useEffect(() => {
    if (user && profile) {
      loadUserFlashcards()
    }
  }, [user, profile, selectedCourseId])

  useEffect(() => {
    // Limpar prompt primeiro quando mudar de curso
    setEditalPrompt('')
    
    const fetchPrompt = async () => {
      try {
        // Usar courseId do curso selecionado
        const courseId = selectedCourseId || 'alego-default'
        const promptRef = doc(db, 'courses', courseId, 'prompts', 'edital')
        const promptDoc = await getDoc(promptRef)
        
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
        } else {
          // Se não encontrar, deixar vazio (não carregar de outros cursos)
          setEditalPrompt('')
        }
      } catch (err) {
        console.error('Erro ao carregar prompt do edital:', err)
        // Em caso de erro, limpar
        setEditalPrompt('')
      }
    }

    fetchPrompt()
  }, [selectedCourseId])

  // Carregar progresso dos cards do usuário - FILTRADO POR CURSO
  useEffect(() => {
    if (!user) return () => {}
    
    const userProgressRef = doc(db, 'userProgress', user.uid)
    const unsub = onSnapshot(userProgressRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data()
        const allCardProgress = data.cardProgress || {}
        
        // Filtrar progresso apenas dos cards do curso selecionado
        const filteredProgress = {}
        const currentCourseId = selectedCourseId || null
        
        // Se temos cards carregados, filtrar pelo curso deles
        cards.forEach(card => {
          const progress = allCardProgress[card.id]
          if (progress) {
            const cardCourseId = card.courseId || null
            // Incluir se o curso do card corresponde ao curso selecionado
            if (cardCourseId === currentCourseId) {
              filteredProgress[card.id] = progress
            }
          }
        })
        
        // Também incluir progressos de cards que ainda não foram carregados mas pertencem ao curso
        Object.keys(allCardProgress).forEach(cardId => {
          if (!filteredProgress[cardId]) {
            // Incluir temporariamente, será filtrado quando os cards carregarem
            filteredProgress[cardId] = allCardProgress[cardId]
          }
        })
        
        setCardProgress(filteredProgress)
        // Log removido para limpar console
      } else {
        setCardProgress({})
      }
    })
    return () => unsub()
  }, [user, selectedCourseId, cards])

  // Organizar por edital verticalizado (disciplinas/tópicos) + cards do usuário
  const organizedCards = useMemo(() => {
    const publishedCards = [...cards, ...userCards].filter((card, index, self) => {
      const isUnique = index === self.findIndex((c) => c.id === card.id)
      if (!isUnique) return false
      if (isAdmin) return true
      return !card.status || card.status === CONTENT_STATUS.AVAILABLE
    })
    const organized = buildOrganizedCardsFromEdital(edital, publishedCards)
    return isAdmin ? organized : filterOrganizedCardsWithContent(organized)
  }, [cards, userCards, edital, isAdmin])

  // Carregar ordens de módulos para todas as matérias quando necessário
  useEffect(() => {
    if (!subjectOrderConfig || !organizedCards) return
    Object.keys(organizedCards).forEach(materia => {
      if (!moduleOrderConfigs[materia]) {
        loadModuleOrder(materia).catch(err => console.error('Erro ao carregar ordem de módulos:', err))
      }
    })
  }, [organizedCards, subjectOrderConfig, moduleOrderConfigs, loadModuleOrder])

  // Selecionar matéria e módulo baseado em query params
  useEffect(() => {
    const materiaParam = searchParams.get('materia') || searchParams.get('disciplina')
    const moduloParam = searchParams.get('modulo')
    
    // Log removido para limpar console
    
    // Se não há parâmetros, não fazer nada
    if (!materiaParam || !moduloParam) {
      // Log removido para limpar console
      return
    }
    
    // Aguardar até que os cards estejam organizados
    if (Object.keys(organizedCards).length === 0) {
      // Log removido para limpar console
      return
    }
    
    // Logs removidos para limpar console
    
    // Decodificar os parâmetros (podem vir codificados da URL)
    const decodedMateria = decodeURIComponent(materiaParam)
    const decodedModulo = decodeURIComponent(moduloParam)
    
    // Log removido para limpar console
    
    // Normalizar nome da matéria usando aliases
    const normalizedMateriaName = MATERIA_ALIASES[decodedMateria.trim().toLowerCase()] || decodedMateria.trim()
    
    // Buscar matéria correspondente (case-insensitive e com normalização de espaços)
    let materiaMatch = Object.keys(organizedCards).find(m => {
      const match = m.trim().toLowerCase() === normalizedMateriaName.toLowerCase() ||
                    m.trim().toLowerCase() === decodedMateria.trim().toLowerCase()
      if (match) {
        // Log removido para limpar console
      }
      return match
    })
    
    // Se não encontrou exato, tentar busca parcial
    if (!materiaMatch) {
      materiaMatch = Object.keys(organizedCards).find(m => {
        const mLower = m.trim().toLowerCase()
        const searchLower = decodedMateria.trim().toLowerCase()
        const match = mLower.includes(searchLower) || searchLower.includes(mLower)
        if (match) {
          // Log removido para limpar console
        }
        return match
      })
    }
    
    if (materiaMatch) {
      const modulos = organizedCards[materiaMatch] || {}
      // Log removido para limpar console
      
      // Normalizar nome do módulo primeiro
      const normalizedModuloName = normalizeModuloName(decodedModulo, materiaMatch)
      // Log removido para limpar console
      
      // Buscar módulo correspondente (case-insensitive e com normalização)
      let moduloMatch = Object.keys(modulos).find(m => {
        const match = m.trim().toLowerCase() === normalizedModuloName.trim().toLowerCase() ||
                      m.trim().toLowerCase() === decodedModulo.trim().toLowerCase()
        if (match) {
          // Log removido para limpar console
        }
        return match
      })
      
      // Se não encontrou, tentar busca parcial
      if (!moduloMatch) {
        moduloMatch = Object.keys(modulos).find(m => {
          const mLower = m.trim().toLowerCase()
          const searchLower = normalizedModuloName.trim().toLowerCase()
          const originalLower = decodedModulo.trim().toLowerCase()
          const match = mLower.includes(searchLower) || searchLower.includes(mLower) ||
                       mLower.includes(originalLower) || originalLower.includes(mLower)
          if (match) {
            // Log removido para limpar console
          }
          return match
        })
      }
      
      if (moduloMatch) {
        // Criar uma chave única para os parâmetros da URL (para detectar mudanças)
        const urlKey = `${materiaMatch}::${moduloMatch}`
        const currentKey = selectedMateria && selectedModulo 
          ? `${selectedMateria}::${selectedModulo}` 
          : null
        
        // Log removido para limpar console
        
        // Se a URL mudou, atualizar a seleção (mesmo que seja uma matéria/módulo diferente)
        if (currentKey !== urlKey) {
          // Log removido para limpar console
          setSelectedMateria(materiaMatch)
          setSelectedModulo(moduloMatch)
          setStudyMode('module')
          setCurrentIndex(0)
          // Expandir a matéria para mostrar o módulo selecionado
          setExpandedMaterias(prev => ({ ...prev, [materiaMatch]: true }))
        } else {
          // Log removido para limpar console
          // Já está selecionado, mas garantir que está expandido
          setExpandedMaterias(prev => ({ ...prev, [materiaMatch]: true }))
        }
      } else {
        // Logs removidos para limpar console
        
        // Tentar busca parcial (contém o texto)
        const partialMatch = Object.keys(modulos).find(m => 
          m.toLowerCase().includes(decodedModulo.toLowerCase()) ||
          decodedModulo.toLowerCase().includes(m.toLowerCase())
        )
        
        if (partialMatch) {
          // Log removido para limpar console
          setSelectedMateria(materiaMatch)
          setSelectedModulo(partialMatch)
          setStudyMode('module')
          setCurrentIndex(0)
          setExpandedMaterias(prev => ({ ...prev, [materiaMatch]: true }))
        }
      }
    } else {
      // Logs removidos para limpar console
      
      // Tentar busca parcial (contém o texto)
      const partialMateriaMatch = Object.keys(organizedCards).find(m => 
        m.toLowerCase().includes(decodedMateria.toLowerCase()) ||
        decodedMateria.toLowerCase().includes(m.toLowerCase())
      )
      
      if (partialMateriaMatch) {
        // Log removido para limpar console
        const modulos = organizedCards[partialMateriaMatch] || {}
        const moduloMatch = Object.keys(modulos).find(m => 
          m.trim().toLowerCase() === decodedModulo.trim().toLowerCase()
        ) || Object.keys(modulos).find(m => 
          m.toLowerCase().includes(decodedModulo.toLowerCase()) ||
          decodedModulo.toLowerCase().includes(m.toLowerCase())
        )
        
        if (moduloMatch) {
          // Log removido para limpar console
          setSelectedMateria(partialMateriaMatch)
          setSelectedModulo(moduloMatch)
          setStudyMode('module')
          setCurrentIndex(0)
          setExpandedMaterias(prev => ({ ...prev, [partialMateriaMatch]: true }))
        }
      }
    }
  }, [searchParams, organizedCards, selectedMateria, selectedModulo, cards.length])
  
  // Forçar tentativa novamente quando cards mudarem (retry mechanism)
  useEffect(() => {
    const materiaParam = searchParams.get('materia') || searchParams.get('disciplina')
    const moduloParam = searchParams.get('modulo')
    
    if (!materiaParam || !moduloParam) return
    if (selectedMateria && selectedModulo) return // Já selecionado
    if (Object.keys(organizedCards).length === 0) return // Ainda não tem cards
    
    // Se chegou aqui, tem parâmetros mas não selecionou ainda
    // Tentar novamente após um pequeno delay
    const retryTimeout = setTimeout(() => {
      // Log removido para limpar console
      const decodedMateria = decodeURIComponent(materiaParam)
      const decodedModulo = decodeURIComponent(moduloParam)
      
      const normalizedMateriaName = MATERIA_ALIASES[decodedMateria.trim().toLowerCase()] || decodedMateria.trim()
      
      let materiaMatch = Object.keys(organizedCards).find(m => 
        m.trim().toLowerCase() === normalizedMateriaName.toLowerCase() ||
        m.trim().toLowerCase() === decodedMateria.trim().toLowerCase()
      )
      
      if (!materiaMatch) {
        materiaMatch = Object.keys(organizedCards).find(m => {
          const mLower = m.trim().toLowerCase()
          const searchLower = decodedMateria.trim().toLowerCase()
          return mLower.includes(searchLower) || searchLower.includes(mLower)
        })
      }
      
      if (materiaMatch) {
        const modulos = organizedCards[materiaMatch] || {}
        let moduloMatch = Object.keys(modulos).find(m => 
          m.trim().toLowerCase() === decodedModulo.trim().toLowerCase()
        )
        
        if (!moduloMatch) {
          moduloMatch = Object.keys(modulos).find(m => {
            const mLower = m.trim().toLowerCase()
            const searchLower = decodedModulo.trim().toLowerCase()
            return mLower.includes(searchLower) || searchLower.includes(mLower)
          })
        }
        
        if (moduloMatch) {
          // Log removido para limpar console
          setSelectedMateria(materiaMatch)
          setSelectedModulo(moduloMatch)
          setStudyMode('module')
          setCurrentIndex(0)
          setExpandedMaterias(prev => ({ ...prev, [materiaMatch]: true }))
        }
      }
    }, 500) // Tentar novamente após 500ms
    
    return () => clearTimeout(retryTimeout)
  }, [cards.length, organizedCards, searchParams, selectedMateria, selectedModulo])

  // Cards do módulo — SRS: só exibe cards novos ou com revisão vencida
  const moduleAllCards = useMemo(() => {
    if (!selectedMateria || !selectedModulo) return []
    return organizedCards[selectedMateria]?.[selectedModulo] || []
  }, [selectedMateria, selectedModulo, organizedCards])

  const filteredCards = useMemo(() => {
    if (studyMode === 'miniSim' || !selectedMateria || !selectedModulo) return []
    return moduleAllCards.filter((card) => isCardDue(cardProgress[card.id], srsNow))
  }, [selectedMateria, selectedModulo, moduleAllCards, cardProgress, studyMode, srsNow])

  const moduleStats = useMemo(() => {
    const total = moduleAllCards.length
    const due = moduleAllCards.filter((c) => isCardDue(cardProgress[c.id], srsNow)).length
    const nextDue = moduleAllCards
      .map((c) => cardProgress[c.id]?.nextReview)
      .filter(Boolean)
      .map((d) => dayjs(d))
      .filter((d) => d.isValid() && d.isAfter(srsNow))
      .sort((a, b) => a.diff(b))[0]
    return { total, due, nextDue }
  }, [moduleAllCards, cardProgress, srsNow])

  const activeCards = studyMode === 'miniSim' ? miniSimCards : filteredCards

  useEffect(() => {
    setSessionRatings({})
    setModuleCompleted(false)
    // Resetar timer quando mudar de módulo
    setTimerActive(false)
  }, [selectedMateria, selectedModulo, studyMode])

  // Atualizar fila SRS periodicamente (cards difíceis voltam em ~1 min)
  useEffect(() => {
    if (!user || studyMode === 'miniSim') return
    const interval = setInterval(() => setSrsNow(dayjs()), 15000)
    return () => clearInterval(interval)
  }, [user, studyMode])

  const checkModuleCompletion = (ratingsSnapshot) => {
    if (studyMode === 'miniSim') return false
    if (!selectedMateria || !selectedModulo) return false
    if (activeCards.length === 0) return false
    return activeCards.every((card) => ratingsSnapshot[card.id] === 'easy')
  }

  const toggleMateria = (materia) => {
    setExpandedMaterias((prev) => ({
      ...prev,
      [materia]: !prev[materia],
    }))
  }

  const selectModulo = (materia, modulo) => {
    // Verificar limitações de teste
    if (isTrialMode()) {
      if (!canAccessMateria(materia)) {
        alert('⚠️ No teste gratuito você pode acessar apenas 1 matéria. Desbloqueie o plano completo para acessar todas as matérias!')
        return
      }
      if (!canAccessModulo(materia, modulo)) {
        alert('⚠️ No teste gratuito você pode acessar apenas 1 módulo. Desbloqueie o plano completo para acessar todos os módulos!')
        return
      }
    }

    setSelectedMateria(materia)
    setSelectedModulo(modulo)
    setStudyMode('module')
    setCurrentIndex(0)
    setExpandedMaterias((prev) => ({ ...prev, [materia]: true }))
    setSearchParams({ materia, modulo })
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
    resetInactivityTimeout() // Resetar timeout de inatividade
    setCurrentIndex((prev) =>
      prev + 1 >= activeCards.length ? 0 : prev + 1,
    )
  }

  const goPrev = () => {
    resetInactivityTimeout() // Resetar timeout de inatividade
    setCurrentIndex((prev) =>
      prev - 1 < 0 ? activeCards.length - 1 : prev - 1,
    )
  }

  const toggleFavorite = async (id) => {
    resetInactivityTimeout() // Resetar timeout de inatividade
    const nextFavorites = favorites.includes(id)
      ? favorites.filter((fav) => fav !== id)
      : [...favorites, id]
    await updateFavorites(nextFavorites)
  }

  const handleDeleteFlashcard = async (flashcardId) => {
    if (!user) return
    
    try {
      // Deletar flashcard usando o serviço
      await userFlashcardsService.deleteFlashcard(flashcardId)
      
      // Remover da lista de cards local
      setCards((prevCards) => prevCards.filter(card => card.id !== flashcardId))
      
      // Resetar índice se necessário
      setCurrentIndex((prevIndex) => {
        const newIndex = prevIndex >= cards.length - 1 ? Math.max(0, cards.length - 2) : prevIndex
        return newIndex
      })
      
      // Remover dos favoritos se estiver lá
      if (favorites.includes(flashcardId)) {
        const newFavorites = favorites.filter(fav => fav !== flashcardId)
        await updateFavorites(newFavorites)
      }
      
      // Remover do progresso se existir
      if (cardProgress[flashcardId]) {
        const newCardProgress = { ...cardProgress }
        delete newCardProgress[flashcardId]
        setCardProgress(newCardProgress)
        
        // Atualizar no Firestore
        const userProgressRef = doc(db, 'userProgress', user.uid)
        await setDoc(
          userProgressRef,
          {
            cardProgress: newCardProgress,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        )
      }
      
    } catch (error) {
      console.error('Erro ao deletar flashcard:', error)
    }
  }

  const handleEditFlashcard = async (cardId, newPergunta, newResposta) => {
    if (!isAdmin || !selectedCourseId) return
    try {
      const cardRef = doc(db, 'courses', selectedCourseId, 'flashcards', cardId)
      await setDoc(
        cardRef,
        {
          pergunta: newPergunta,
          resposta: newResposta,
          frente: newPergunta,
          verso: newResposta,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      )
      setCards((prev) =>
        prev.map((card) =>
          card.id === cardId
            ? { ...card, pergunta: newPergunta, resposta: newResposta, frente: newPergunta, verso: newResposta }
            : card,
        ),
      )
    } catch (error) {
      console.error('Erro ao editar flashcard:', error)
      alert('Erro ao editar flashcard. Tente novamente.')
    }
  }

  const handleExportAnki = () => {
    if (!activeCards.length) return
    AnkiExportService.exportToText(activeCards)
  }

  // Avaliar dificuldade - Sistema Noji/Anki simplificado
  const rateDifficulty = async (cardId, difficulty) => {
    if (!user) return

    const now = dayjs()
    const currentProgress = cardProgress[cardId] || {}
    const newProgressData = calculateNextReview(currentProgress, difficulty, now)

    const newProgress = {
      ...currentProgress,
      ...newProgressData,
      lastReviewed: now.toISOString(),
    }
    
    // Salvar progresso do usuário (filtrado por curso se necessário)
    const userProgressRef = doc(db, 'userProgress', user.uid)
    const currentCardProgress = { ...cardProgress, [cardId]: newProgress }
    
    await setDoc(
      userProgressRef,
      {
        cardProgress: currentCardProgress,
        updatedAt: new Date().toISOString(),
        // Adicionar metadata do curso para filtragem
        courseId: selectedCourseId || null,
      },
      { merge: true },
    )

    // Atualizar estado local
    setCardProgress(currentCardProgress)
    setSrsNow(dayjs())

    setSessionRatings((prevRatings) => {
      const updated = { ...prevRatings, [cardId]: difficulty }
      if (checkModuleCompletion(updated)) {
        setModuleCompleted(true)
      }
      return updated
    })
    
    // Avançar para próximo card após um pequeno delay (sempre avança)
    setTimeout(() => {
      goNext()
    }, 200) // Reduzido para melhor responsividade
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
    setSearchParams({})
  }

  const exitStudySession = () => {
    handleExitModule()
  }

  const shuffle = () => {
    setCurrentIndex(0)
    // Embaralhar os cards ativos
    setCards((prevCards) => {
      const shuffled = [...prevCards].sort(() => Math.random() - 0.5)
      return shuffled
    })
  }

  const viewedIds = useMemo(() => {
    return activeCards.slice(0, currentIndex + 1).map((c) => c.id)
  }, [activeCards, currentIndex])

  const currentCard = activeCards[currentIndex]
  const needsReview = true // Sempre mostra os botões de avaliação

  // Função para gerar 10 flashcards por IA
  const generateFlashcardsByDifficulty = async (difficulty) => {
    if (!selectedMateria || !selectedModulo) {
      alert('Selecione uma matéria e módulo primeiro!')
      return
    }

    if (!user) {
      alert('Faça login para gerar flashcards!')
      return
    }

    setGeneratingFlashcards(true)
    setSelectedDifficulty(difficulty)

    try {
      // Importar a função de prompt unificado
      const { buildFlashcardPrompt } = await import('../utils/unifiedPrompt')
      
      // Construir o prompt base
      const basePrompt = await buildFlashcardPrompt(
        selectedCourseId || 'alego-default',
        selectedMateria,
        editalPrompt || ''
      )

      // Prompt específico para gerar 10 flashcards com dificuldade
      const prompt = `${basePrompt}

═══════════════════════════════════════════════════════════════════════════════
GERAÇÃO DE FLASHCARDS - NÍVEL ${difficulty.toUpperCase()} - CONTEÚDO NOVO
═══════════════════════════════════════════════════════════════════════════════

MÓDULO ESPECÍFICO: ${selectedModulo}
NÍVEL DE DIFICULDADE: ${difficulty}
QUANTIDADE: A quantidade necessária para cobrir completamente o conteúdo do módulo

⚠️ INSTRUÇÃO CRÍTICA - CRIE CONTEÚDO 100% NOVO:
- NÃO repita flashcards existentes
- Crie perguntas e respostas completamente originais
- Use diferentes ângulos e perspectivas do conteúdo
- Explore conceitos que ainda não foram abordados
- Seja criativo e inovador nas abordagens

REGRAS ESPECÍFICAS PARA NÍVEL ${difficulty.toUpperCase()}:
${difficulty === 'médio' ? `
- Questões de complexidade intermediária
- Exigem raciocínio e aplicação de conceitos
- Podem envolver múltiplos passos de raciocínio
- Linguagem técnica mas acessível
- Foco em situações práticas e casos concretos
- Crie cenários e exemplos diferentes dos habituais
` : `
- Questões de alta complexidade
- Exigem conhecimento profundo e detalhado
- Podem envolver exceções, detalhes técnicos ou casos complexos
- Linguagem altamente técnica e específica
- Foco em situações complexas, exceções ou casos raros
- Podem exigir análise comparativa ou interpretação sofricada
- Explore nuances e detalhes pouco abordados
`}

ESTRATÉGIAS PARA CRIAR CONTEÚDO NOVO:
1. Diferentes perspectivas do mesmo conceito
2. Casos práticos e situações hipotéticas
3. Comparações e contrastes entre conceitos
4. Aplicações em contextos variados
5. Análise de exceções e casos especiais
6. Interconexões entre diferentes tópicos
7. Evolução histórica ou contextualização
8. Implicações práticas e teóricas

TAREFA:
Crie NO MÍNIMO 50 flashcards e ATÉ 100 flashcards educacionais de nível ${difficulty} para o módulo "${selectedModulo}" da matéria "${selectedMateria}". 

IMPORTANTE: Cada flashcard deve ser único, original e explorar aspectos diferentes do conteúdo. Evite repetir perguntas ou respostas que já existam.
O MÍNIMO OBRIGATÓRIO é 50 flashcards - não gere menos que isso.
Se o módulo for extenso, gere até 100 flashcards para cobertura completa.

FORMATO DE RESPOSTA (OBRIGATÓRIO - APENAS JSON VÁLIDO):
{
  "flashcards": [
    {
      "pergunta": "Pergunta única e original",
      "resposta": "Resposta completa e precisa",
      "materia": "${selectedMateria}",
      "modulo": "${selectedModulo}",
      "dificuldade": "${difficulty}",
      "explicacao": "Explicação detalhada que acrescenta conhecimento"
    }
  ]
}

VALIDAÇÃO FINAL:
- ✅ Flashcards criados em quantidade suficiente para cobrir o conteúdo
- ✅ Todos do nível ${difficulty}
- ✅ Conteúdo 100% original e não repetido
- ✅ Linguagem apropriada para o nível
- ✅ Baseado no módulo específico
- ✅ Formato JSON válido

IMPORTANTE:
- Retorne APENAS o JSON válido, sem texto adicional
- Garanta que cada flashcard seja único e contributivo`

      // Chamar API com pipeline central (banca, curso, verificação)
      const response = await callGeminiWithRetry(prompt, {
        courseId: selectedCourseId || 'alego-default',
        generationConfig: {
          temperature: 0.35,
          maxOutputTokens: 2048,
        },
      })

      const text = extractGeneratedText(response)
      if (!text?.trim()) {
        throw new Error('A IA não retornou flashcards válidos')
      }
      
      // Extrair JSON da resposta
      let flashcardsData
      try {
        // Tentar encontrar JSON na resposta
        const jsonMatch = text.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          flashcardsData = JSON.parse(jsonMatch[0])
        } else {
          throw new Error('JSON não encontrado na resposta')
        }
      } catch (error) {
        console.error('Erro ao parsear JSON:', error)
        throw new Error('Erro ao processar resposta da IA')
      }

      // Salvar flashcards gerados
      const flashcards = flashcardsData.flashcards || []
      if (flashcards.length === 0) {
        throw new Error('Nenhum flashcard gerado')
      }

      // Salvar cada flashcard no Firestore
      const batch = []
      const existingCardsInModule = activeCards || []
      
      for (let i = 0; i < flashcards.length; i++) {
        const flashcard = flashcards[i]
        
        // Verificar se já existe um flashcard muito similar
        const isDuplicate = existingCardsInModule.some(existingCard => {
          const existingQuestion = (existingCard.pergunta || '').toLowerCase().trim()
          const newQuestion = (flashcard.pergunta || '').toLowerCase().trim()
          
          // Verificar similaridade básica
          return existingQuestion === newQuestion || 
                 existingQuestion.includes(newQuestion.substring(0, 20)) ||
                 newQuestion.includes(existingQuestion.substring(0, 20))
        })
        
        if (isDuplicate) {
          console.warn(`Flashcard duplicado ignorado: ${flashcard.pergunta}`)
          continue // Pular flashcards duplicados
        }
        
        const cardData = {
          pergunta: flashcard.pergunta,
          resposta: flashcard.resposta,
          materia: flashcard.materia || selectedMateria,
          modulo: flashcard.modulo || selectedModulo,
          dificuldade: flashcard.dificuldade || difficulty,
          explicacao: flashcard.explicacao || '',
          userId: user.uid,
          courseId: selectedCourseId || 'alego-default',
          createdAt: new Date().toISOString(),
          isAIGenerated: true,
          generationDifficulty: difficulty,
        }

        const flashcardsColl = selectedCourseId
          ? collection(db, 'courses', selectedCourseId, 'flashcards')
          : collection(db, 'flashcards')
        const cardRef = doc(flashcardsColl)
        batch.push(
          setDoc(cardRef, {
            ...cardData,
            disciplina: cardData.materia,
            topico: cardData.modulo,
            frente: cardData.pergunta,
            verso: cardData.resposta,
          })
        )
      }

      if (batch.length === 0) {
        throw new Error('Todos os flashcards gerados já existem. Tente novamente para criar conteúdo novo.')
      }

      // Executar todas as operações em lote
      await Promise.all(batch)

      alert(`✅ ${batch.length} flashcards de nível ${difficulty} gerados e salvos com sucesso!`)
      
      // Recarregar flashcards para mostrar os novos
      // (isso será feito pelo useEffect existente)

    } catch (error) {
      console.error('Erro ao gerar flashcards:', error)
      alert(`❌ Erro ao gerar flashcards: ${error.message}`)
    } finally {
      setGeneratingFlashcards(false)
      setSelectedDifficulty('')
    }
  }

  return (
    <div className="space-y-6">
      <CPPageHeader
        badge="Noji · SRS"
        title="Flashcards"
        subtitle={
          isStudying
            ? `${selectedMateria} › ${selectedModulo}`
            : 'Biblioteca de decks com repetição espaçada'
        }
        backHref="/dashboard"
        actions={
          isStudying ? (
            <button
              type="button"
              onClick={() => setTimerActive(!timerActive)}
              className={`relative group inline-flex items-center gap-3 px-5 py-3 rounded-xl border backdrop-blur-sm transition-all cursor-pointer ${
                timerActive
                  ? 'bg-gradient-to-r from-green-500/20 to-emerald-500/20 dark:from-green-500/30 dark:to-emerald-500/30 border-green-500/50 dark:border-green-400/50 hover:border-green-500/70 dark:hover:border-green-400/70'
                  : 'bg-gradient-to-r from-blue-500/10 to-purple-500/10 dark:from-blue-500/20 dark:to-purple-500/20 border-blue-500/30 dark:border-blue-400/30 hover:border-blue-500/50 dark:hover:border-blue-400/50'
              }`}
              title={timerActive ? 'Clique para pausar o timer' : 'Clique para iniciar o timer'}
            >
              <div className="relative">
                <div className={`absolute inset-0 rounded-full blur-md transition-opacity ${
                  timerActive
                    ? 'bg-green-500 opacity-50 group-hover:opacity-75 animate-pulse'
                    : 'bg-blue-500 opacity-50 group-hover:opacity-75'
                }`}></div>
                <ClockIcon className={`relative h-6 w-6 ${
                  timerActive
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-blue-600 dark:text-blue-400'
                }`} />
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                  {timerActive ? 'Contando...' : 'Clique para contar'}
                </p>
                <p className={`text-xl font-black bg-clip-text text-transparent ${
                  timerActive
                    ? 'bg-gradient-to-r from-green-600 to-emerald-600 dark:from-green-400 dark:to-emerald-400'
                    : 'bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400'
                }`}>
                  {formattedTime}
                </p>
              </div>
            </button>
          ) : undefined
        }
      />

      {/* Banner de Conversão para Teste */}
      {isTrialMode() && (
        <div className="rounded-2xl p-4 bg-gradient-to-r from-alego-600 to-alego-700 text-white shadow-xl">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <p className="font-bold text-lg mb-1">🎁 Você está no Teste Gratuito</p>
              <p className="text-sm text-alego-100">Acesso limitado: 1 matéria e 1 módulo</p>
            </div>
            <Link
              to="/pagamento"
              className="px-6 py-2 bg-white text-alego-600 rounded-xl font-bold hover:bg-alego-50 transition-colors whitespace-nowrap"
            >
              Desbloquear Completo →
            </Link>
          </div>
        </div>
      )}

      {!cardsLoading && !hasEdital && (
        <div className="rounded-xl p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
          <p className="font-semibold text-amber-800 dark:text-amber-200 mb-2">
            Edital verticalizado não configurado
          </p>
          <p className="text-sm text-amber-700 dark:text-amber-300 mb-3">
            Os flashcards seguem a estrutura do edital. Gere o edital e os cards com IA no Edital Verticalizado.
          </p>
          <Link
            to="/edital-verticalizado"
            className="inline-flex px-4 py-2 rounded-lg bg-alego-600 text-white text-sm font-semibold hover:bg-alego-700"
          >
            Ir para Edital Verticalizado
          </Link>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(260px,320px)_1fr]">
        {/* Biblioteca de decks — estilo Noji */}
        <div className="noji-deck-panel cp-card flex flex-col overflow-hidden lg:max-h-[calc(100vh-12rem)]">
          <div className="border-b border-cp-border p-4">
            <div className="mb-1 flex items-center justify-between">
              <p className="text-sm font-semibold text-cp-text">Meus decks</p>
              <span className="rounded-full bg-indigo-500/10 px-2 py-0.5 font-mono text-[10px] font-medium text-indigo-500">
                SRS
              </span>
            </div>
            <p className="mb-3 text-[11px] text-cp-muted">Matérias e tópicos do edital</p>
            <div className="relative">
              <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cp-muted" />
              <input
                type="search"
                value={sidebarSearch}
                onChange={(e) => setSidebarSearch(e.target.value)}
                placeholder="Buscar deck..."
                className="w-full rounded-xl border border-cp-border bg-cp-bg/60 py-2.5 pl-9 pr-3 text-sm text-cp-text placeholder:text-cp-muted focus:border-indigo-400/50 focus:outline-none focus:ring-2 focus:ring-indigo-400/20"
              />
            </div>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto p-3">
            {cardsLoading ? (
              <p className="py-8 text-center font-mono text-xs text-cp-muted">Carregando...</p>
            ) : (
              applySubjectOrder(organizedCards, subjectOrderConfig)
                .filter((materia) => {
                  if (!sidebarSearch.trim()) return true
                  const q = sidebarSearch.trim().toLowerCase()
                  if (materia.toLowerCase().includes(q)) return true
                  const modulos = organizedCards[materia] ? Object.keys(organizedCards[materia]) : []
                  return modulos.some((m) => m.toLowerCase().includes(q))
                })
                .map((materia) => {
                  const modulos = organizedCards[materia] ? Object.keys(organizedCards[materia]) : []
                  const isExpanded = expandedMaterias[materia]
                  const isSelected = selectedMateria === materia
                  const q = sidebarSearch.trim().toLowerCase()
                  const filteredModulos = q
                    ? modulos.filter(
                        (m) => m.toLowerCase().includes(q) || materia.toLowerCase().includes(q)
                      )
                    : modulos

                  if (modulos.length === 0 && !hasEdital) return null

                  const deckHue = [...materia].reduce((a, c) => a + c.charCodeAt(0), 0) % 360
                  const totalDue = modulos.reduce((acc, m) => {
                    const cardsInMod = organizedCards[materia][m] || []
                    return acc + cardsInMod.filter((c) => isCardDue(cardProgress[c.id], srsNow)).length
                  }, 0)

                  return (
                    <div key={materia} className="overflow-hidden rounded-2xl border border-cp-border/80 bg-cp-bg/20">
                      <button
                        type="button"
                        onClick={() => toggleMateria(materia)}
                        className={`flex w-full items-center gap-2.5 px-3 py-3 text-left text-sm transition ${
                          isSelected ? 'bg-indigo-500/10' : 'hover:bg-cp-surface/50'
                        }`}
                      >
                        <span
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white shadow-sm"
                          style={{ background: `hsl(${deckHue}, 65%, 52%)` }}
                        >
                          {materia.charAt(0).toUpperCase()}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={`block truncate font-medium ${isSelected ? 'text-indigo-600 dark:text-indigo-400' : 'text-cp-text'}`}>
                            {materia}
                          </span>
                          <span className="text-[10px] text-cp-muted">{modulos.length} tópicos</span>
                        </span>
                        {totalDue > 0 ? (
                          <span className="shrink-0 rounded-full bg-indigo-500 px-2 py-0.5 text-[10px] font-bold text-white">
                            {totalDue}
                          </span>
                        ) : (
                          <span className="shrink-0 font-mono text-[10px] text-cp-muted">{modulos.length}</span>
                        )}
                        {isExpanded ? (
                          <ChevronDownIcon className="h-4 w-4 shrink-0 text-cp-muted" />
                        ) : (
                          <ChevronRightIcon className="h-4 w-4 shrink-0 text-cp-muted" />
                        )}
                      </button>

                      {isExpanded && (
                        <div className="space-y-0.5 border-t border-cp-border/50 px-2 py-2">
                          {(() => {
                            const moduleOrderConfig = moduleOrderConfigs[materia] || {
                              order: null,
                              source: 'default',
                              isCustom: false,
                            }
                            const orderedModules = applyModuleOrder(filteredModulos, moduleOrderConfig)
                            return orderedModules.map((modulo) => {
                              const cardsInModulo = organizedCards[materia][modulo] || []
                              const dueInModulo = cardsInModulo.filter((c) =>
                                isCardDue(cardProgress[c.id], srsNow)
                              ).length
                              const isModuloSelected =
                                studyMode === 'module' &&
                                selectedMateria === materia &&
                                selectedModulo === modulo
                              const canAccessMod =
                                !isTrialMode() || canAccessModulo(materia, modulo)

                              return (
                                <button
                                  key={modulo}
                                  type="button"
                                  onClick={() => selectModulo(materia, modulo)}
                                  disabled={!canAccessMod && !isModuloSelected}
                                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs transition ${
                                    !canAccessMod && !isModuloSelected
                                      ? 'cursor-not-allowed opacity-40'
                                      : isModuloSelected
                                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20'
                                        : dueInModulo > 0
                                          ? 'bg-indigo-500/5 text-cp-text hover:bg-indigo-500/10'
                                          : 'text-cp-muted hover:bg-cp-surface/80 hover:text-cp-text'
                                  }`}
                                >
                                  <span className="mr-2 min-w-0 flex-1 truncate">{modulo}</span>
                                  <span
                                    className={`shrink-0 rounded-lg px-2 py-0.5 font-mono text-[10px] font-semibold ${
                                      isModuloSelected
                                        ? 'bg-white/20 text-white'
                                        : dueInModulo > 0
                                          ? 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400'
                                          : 'bg-cp-surface text-cp-muted'
                                    }`}
                                  >
                                    {dueInModulo}/{cardsInModulo.length}
                                  </span>
                                </button>
                              )
                            })
                          })()}
                          <button
                            type="button"
                            onClick={() => startMiniSim(materia)}
                            className="w-full rounded-xl border border-dashed border-indigo-400/30 px-3 py-2.5 text-left text-[11px] font-medium text-indigo-600 transition hover:bg-indigo-500/5 dark:text-indigo-400"
                          >
                            ⚡ Revisão rápida (10 cards)
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })
            )}
          </div>
        </div>

        {/* Sessão de estudo — estilo Noji */}
        <div className="min-h-[520px] lg:min-h-[calc(100vh-12rem)]">
          {!selectedMateria || !selectedModulo ? (
            <div className="noji-empty cp-card flex h-full min-h-[480px] flex-col items-center justify-center p-12 text-center">
              <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-indigo-500 to-violet-600 text-3xl shadow-lg shadow-indigo-500/25">
                📚
              </div>
              <p className="text-xl font-semibold text-cp-text">Escolha um deck</p>
              <p className="mt-2 max-w-sm text-sm text-cp-muted">
                Selecione uma matéria e um tópico na biblioteca para iniciar a revisão com repetição espaçada
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3 text-[11px] text-cp-muted">
                <span className="rounded-full border border-cp-border px-3 py-1">Toque para virar</span>
                <span className="rounded-full border border-cp-border px-3 py-1">Difícil · 1 min</span>
                <span className="rounded-full border border-cp-border px-3 py-1">Fácil · SRS progressivo</span>
              </div>
            </div>
          ) : activeCards.length === 0 ? (
            <div className="noji-empty cp-card flex h-full min-h-[480px] flex-col items-center justify-center p-10 text-center">
              <div className="mb-4 text-5xl">✨</div>
              <p className="text-lg font-semibold text-cp-text">Tudo em dia!</p>
              <p className="mt-2 max-w-md text-sm text-cp-muted">
                {moduleStats.total > 0
                  ? moduleStats.due === 0 && moduleStats.nextDue
                    ? `Próxima revisão em ${moduleStats.nextDue.format('DD/MM [às] HH:mm')}`
                    : `${moduleStats.total} cards neste deck · nenhum pendente agora`
                  : 'Este tópico ainda não tem flashcards.'}
              </p>
              <button
                type="button"
                onClick={exitStudySession}
                className="mt-6 rounded-xl border border-cp-border px-5 py-2.5 text-sm font-medium text-cp-text transition hover:bg-cp-surface"
              >
                ← Voltar aos decks
              </button>
            </div>
          ) : (
            <div className="noji-session cp-card flex h-full min-h-[520px] flex-col overflow-hidden lg:min-h-[calc(100vh-12rem)]">
              {/* Header da sessão */}
              <div className="flex shrink-0 items-center justify-between gap-3 border-b border-cp-border px-4 py-3 sm:px-6">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] font-semibold uppercase tracking-wider text-indigo-500 dark:text-indigo-400">
                    {selectedMateria}
                  </p>
                  <p className="truncate text-base font-semibold text-cp-text">{selectedModulo}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="hidden rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 sm:inline">
                    {activeCards.length} para revisar
                  </span>
                  <button
                    type="button"
                    onClick={handleExportAnki}
                    className="hidden rounded-xl border border-cp-border px-3 py-1.5 text-xs font-medium text-cp-muted transition hover:bg-cp-surface hover:text-cp-text sm:inline"
                  >
                    Exportar Anki
                  </button>
                  <button
                    type="button"
                    onClick={exitStudySession}
                    className="rounded-xl border border-cp-border px-3 py-1.5 text-xs font-medium text-cp-muted transition hover:bg-cp-surface hover:text-cp-text"
                  >
                    Sair
                  </button>
                </div>
              </div>

              {/* Área do card */}
              <div className="flex flex-1 flex-col px-4 py-4 sm:px-6 sm:py-6">
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
                  onDeleteFlashcard={handleDeleteFlashcard}
                  onEditFlashcard={isAdmin ? handleEditFlashcard : null}
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

      {/* Modal de Loading para Geração de Flashcards */}
      {generatingFlashcards && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-8 max-w-md mx-4 shadow-2xl border border-slate-200 dark:border-slate-700">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent mb-4"></div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
                Gerando Flashcards
              </h3>
              <p className="text-slate-600 dark:text-slate-400 mb-4">
                Criando 10 flashcards de nível <span className="font-bold text-blue-600 dark:text-blue-400">{selectedDifficulty}</span> para o módulo "{selectedModulo}"
              </p>
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 border border-blue-200 dark:border-blue-800">
                <p className="text-xs text-blue-700 dark:text-blue-300">
                  🤖 A IA está analisando o conteúdo e gerando flashcards personalizados...
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default FlashcardView
