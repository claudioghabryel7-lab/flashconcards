import { useEffect, useMemo, useState, useCallback } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { collection, doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore'
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
import { FolderIcon, ChevronRightIcon, ChevronDownIcon, ClockIcon, LockClosedIcon } from '@heroicons/react/24/outline'
import { canAccessMateria, canAccessModulo, isTrialMode } from '../utils/trialLimits'
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
  const { user, favorites, updateFavorites, profile } = useAuth()
  const { darkMode } = useDarkMode()
  const [searchParams, setSearchParams] = useSearchParams()
  const [cards, setCards] = useState([])
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
  const [cardsLoading, setCardsLoading] = useState(true) // Estado para evitar flash de cards
  const [timerActive, setTimerActive] = useState(false) // Timer só inicia quando usuário clicar no relógio
  const [generatingFlashcards, setGeneratingFlashcards] = useState(false) // Estado para loading de geração
  const [selectedDifficulty, setSelectedDifficulty] = useState('') // Dificuldade selecionada para geração
  
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
    if (!user || !profile) {
      // Limpar cards se não tiver usuário/perfil
      setCards([])
      setCardsLoading(false)
      return
    }
    
    // Limpar cards e marcar como loading imediatamente quando mudar de curso
    setCards([])
    setCardsLoading(true)
    
    // Tentar carregar do cache primeiro (funciona offline)
    const cacheKey = `flashcards_${selectedCourseId || 'alego'}_${user.uid}`
    let cachedDataLoaded = false
    
    try {
      const cached = localStorage.getItem(`firebase_cache_${cacheKey}`)
      if (cached) {
        const { data: cachedData, timestamp } = JSON.parse(cached)
        const now = Date.now()
        // Usar cache se tiver menos de 24 horas (para funcionar offline por mais tempo)
        if (now - timestamp < 24 * 60 * 60 * 1000 && cachedData && cachedData.length > 0) {
          // Log removido para limpar console
          setCards(cachedData)
          setCardsLoading(false)
          cachedDataLoaded = true
        }
      }
    } catch (err) {
      // Log removido para limpar console
    }
    
    // Se estiver offline e já carregou do cache, não tenta buscar do Firebase
    if (!navigator.onLine && cachedDataLoaded) {
      return () => {} // Cleanup vazio se estiver offline e usando cache
    }
    
    const cardsRef = collection(db, 'flashcards')
    const unsub = onSnapshot(cardsRef, (snapshot) => {
      const purchasedCourses = profile.purchasedCourses || []
      const isAdmin = profile.role === 'admin'
      
      let data = snapshot.docs.map((docSnapshot) => ({
        id: docSnapshot.id,
        ...docSnapshot.data(),
      }))
      
      // Filtrar por curso selecionado ANTES de setar
      // Normalizar: null ou undefined = ALEGO padrão (flashcards sem courseId)
      const selectedCourse = selectedCourseId && selectedCourseId !== 'alego-default' 
        ? String(selectedCourseId).trim() 
        : null
      
      // Logs removidos para limpar console
      
      if (selectedCourse) {
        // Mostrar apenas flashcards do curso selecionado
        // Comparar de forma mais robusta: string, null, undefined
        data = data.filter(card => {
          const cardCourseId = card.courseId
          // Normalizar cardCourseId: null, undefined, string vazia ou 'alego-default' = null
          const normalizedCardCourseId = (!cardCourseId || cardCourseId === '' || cardCourseId === 'alego-default')
            ? null
            : String(cardCourseId).trim()
          
          // Comparar o curso normalizado
          return normalizedCardCourseId === selectedCourse
        })
      } else {
        // Mostrar apenas flashcards sem courseId (ALEGO padrão)
        // Incluir null, undefined, string vazia e 'alego-default'
        data = data.filter(card => {
          const cardCourseId = card.courseId
          return !cardCourseId || cardCourseId === '' || cardCourseId === null || cardCourseId === undefined || cardCourseId === 'alego-default'
        })
        // Logs removidos para limpar console
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
      
      // Só atualizar após filtrar completamente e marcar como não loading
      setCards(data)
      setCardsLoading(false)
      
      // Salvar no cache para uso offline (válido por 24 horas)
      try {
        localStorage.setItem(
          `firebase_cache_${cacheKey}`,
          JSON.stringify({
            data: data,
            timestamp: Date.now(),
          })
        )
      } catch (err) {
        // Log removido para limpar console
      }
    }, (error) => {
      console.error('Erro ao carregar flashcards:', error)
      // Se der erro e tiver cache, usar o cache
      if (cachedDataLoaded) {
        try {
          const cached = localStorage.getItem(`firebase_cache_${cacheKey}`)
          if (cached) {
            const { data: cachedData } = JSON.parse(cached)
            if (cachedData && cachedData.length > 0) {
              setCards(cachedData)
              setCardsLoading(false)
            }
          }
        } catch (err) {
          console.warn('Erro ao ler cache após erro:', err)
        }
      } else {
        setCardsLoading(false)
      }
    })
    return () => unsub()
  }, [user, profile, selectedCourseId])

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

  // Organizar cards por matéria e módulo (incluindo cards do usuário)
  const organizedCards = useMemo(() => {
    const organized = {}
    
    // Combinar cards do sistema com cards do usuário, evitando duplicatas
    const allCards = [...cards, ...userCards]
    console.log('🔍 Cards do sistema:', cards.length)
    console.log('🔍 Cards do usuário:', userCards.length)
    console.log('🔍 Total de cards combinados:', allCards.length)
    
    // Usar Set para evitar duplicatas baseado no ID do card
    const uniqueCards = allCards.filter((card, index, self) => 
      index === self.findIndex((c) => c.id === card.id)
    )
    
    console.log('🔍 Cards únicos após remoção de duplicatas:', uniqueCards.length)
    
    uniqueCards.forEach((card) => {
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
    
    // Log para debug de quantidades
    Object.keys(organized).forEach(materia => {
      Object.keys(organized[materia]).forEach(modulo => {
        console.log(`📊 ${materia} -> ${modulo}: ${organized[materia][modulo].length} cards`)
      })
    })
    
    return organized
  }, [cards, userCards])

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
    const materiaParam = searchParams.get('materia')
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
    const materiaParam = searchParams.get('materia')
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

  // Cards filtrados baseado na seleção - SIMPLIFICADO SEM SRS
  const filteredCards = useMemo(() => {
    if (!selectedMateria || !selectedModulo || studyMode === 'miniSim') {
      return []
    }
    
    // Mostrar TODOS os cards - SEM FILTRO SRS
    const allCards = organizedCards[selectedMateria]?.[selectedModulo] || []
    console.log('🔍 Total de cards no módulo:', allCards.length)
    return allCards
  }, [selectedMateria, selectedModulo, organizedCards, studyMode])

  const activeCards = studyMode === 'miniSim' ? miniSimCards : filteredCards

  useEffect(() => {
    setSessionRatings({})
    setModuleCompleted(false)
    // Resetar timer quando mudar de módulo
    setTimerActive(false)
  }, [selectedMateria, selectedModulo, studyMode])

  // Sistema SRS Simples - Verificação a cada 30 segundos
  useEffect(() => {
    if (!user || studyMode === 'miniSim') return

    // Log removido para performance
    // console.log('🔍 Iniciando SRS Simples - Verificação a cada 30 segundos')
    
    const interval = setInterval(() => {
      // Verificação SRS silenciosa para performance
      const dummy = new Date()
      // Logs removidos: console.log(`🔍 Verificação SRS - ${now.format('HH:mm:ss')}`)
      // console.log(`🔄 SRS: Verificando cards para reaparecerem...`)
    }, 30000) // 30 segundos - mais estável

    return () => clearInterval(interval)
  }, [user, studyMode, selectedMateria, selectedModulo, organizedCards, cardProgress])

  // Sistema SRS Simples - Cards nunca somem de forma inesperada

  const checkModuleCompletion = (ratingsSnapshot) => {
    if (studyMode === 'miniSim') return false
    if (!selectedMateria || !selectedModulo) return false
    if (activeCards.length === 0) return false
    return activeCards.every((card) => ratingsSnapshot[card.id] === 'easy')
  }

  // Calcular próxima revisão - SRS SIMPLES E FUNCIONAL
  const calculateNextReview = (currentProgress, difficulty) => {
    const now = dayjs()
    
    // Se é a primeira vez vendo o card
    if (!currentProgress || !currentProgress.nextReview) {
      const nextReview = now.add(1, 'minute')
      // Log removido para performance
      // console.log(`📝 Novo card - Próxima revisão: ${nextReview.format('HH:mm:ss')}`)
      return {
        easeFactor: 2.5,
        intervalMinutes: 1,
        nextReview: nextReview.toISOString(),
        reviewCount: 1,
        consecutiveCorrect: 1
      }
    }

    // Calcular nova revisão baseado na dificuldade
    let newInterval = 1
    let newStatus = 'hard'
    
    if (difficulty === 'hard') {
      // Difícil: 1 minuto
      newInterval = 1
      newStatus = 'hard'
      const nextReview = now.add(newInterval, 'minute')
      // Log removido para performance
      // console.log(`📊 Card marcado como DIFÍCIL - Próxima revisão: ${nextReview.format('HH:mm:ss')}`)
      return {
        easeFactor: 2.5,
        intervalMinutes: newInterval,
        nextReview: nextReview.toISOString(),
        reviewCount: (currentProgress.reviewCount || 0) + 1,
        consecutiveCorrect: 0,
        lastDifficulty: difficulty
      }
    } else if (difficulty === 'easy') {
      // Fácil: 15 minutos
      newInterval = 15
      newStatus = 'easy'
      const nextReview = now.add(newInterval, 'minute')
      // Log removido para performance
      // console.log(`📊 Card marcado como FÁCIL - Próxima revisão: ${nextReview.format('HH:mm:ss')}`)
      return {
        easeFactor: 2.5,
        intervalMinutes: newInterval,
        nextReview: nextReview.toISOString(),
        reviewCount: (currentProgress.reviewCount || 0) + 1,
        consecutiveCorrect: (currentProgress.consecutiveCorrect || 0) + 1,
        lastDifficulty: difficulty
      }
    }

    // Padrão: 1 minuto
    const nextReview = now.add(1, 'minute')
    return {
      easeFactor: 2.5,
      intervalMinutes: 1,
      nextReview: nextReview.toISOString(),
      reviewCount: (currentProgress.reviewCount || 0) + 1,
      consecutiveCorrect: 0,
      lastDifficulty: 'hard'
    }
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

  // Avaliar dificuldade - Sistema Noji/Anki simplificado
  const rateDifficulty = async (cardId, difficulty) => {
    if (!user) return
    
    const now = dayjs()
    const currentProgress = cardProgress[cardId] || {}
    
    // Calcular nova revisão usando algoritmo estilo Noji
    const newProgressData = calculateNextReview(currentProgress, difficulty)
    
    const newProgress = {
      ...currentProgress,
      ...newProgressData,
      lastDifficulty: difficulty,
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
    // Log removido para limpar console
    const cachedExplanation = await getOrCreateExplanationCache(card.id)
    
    if (cachedExplanation && cachedExplanation.text) {
      // Log removido para limpar console
      return cachedExplanation.text // Retornar explicação do cache
    }

    // Log removido para limpar console

    const apiKey = import.meta.env.VITE_GEMINI_API_KEY
    if (!apiKey) {
      throw new Error('API do Gemini não configurada.')
    }

    // Buscar prompt do curso correto do flashcard
    let courseEditalPrompt = ''
    try {
      const cardCourseId = card.courseId || selectedCourseId || 'alego-default'
      const promptRef = doc(db, 'courses', cardCourseId, 'prompts', 'edital')
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
          let limitedPdfText = ''
          if (totalLength <= 20000) {
            limitedPdfText = data.pdfText
          } else {
            const inicio = data.pdfText.substring(0, 15000)
            const fim = data.pdfText.substring(totalLength - 5000)
            limitedPdfText = `${inicio}\n\n[... conteúdo intermediário omitido ...]\n\n${fim}`
          }
          combinedText += `CONTEÚDO DO PDF DO EDITAL:\n${limitedPdfText}`
        }
        courseEditalPrompt = combinedText
      }
    } catch (err) {
      // Log removido para limpar console
      // Usar editalPrompt como fallback se houver
      courseEditalPrompt = editalPrompt || ''
    }

    const preferredModel = import.meta.env.VITE_GEMINI_MODEL || 'gemini-2.5-flash'
    const fallbackModels = ['gemini-1.5-pro-latest', 'gemini-1.5-pro', 'gemini-pro']
    const candidates = [preferredModel, ...fallbackModels].filter(
      (value, idx, arr) => value && arr.indexOf(value) === idx,
    )

    const prompt = `
Explique o conteúdo deste flashcard de forma clara, prática e em até 5 parágrafos curtos.

Matéria: ${card.materia || 'Não informado'}
Módulo: ${card.modulo || 'Não informado'}
Pergunta do flashcard: "${card.pergunta}"
Resposta correta: "${card.resposta}"

${courseEditalPrompt ? `Contexto do concurso:\n${courseEditalPrompt}` : ''}

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
        // Log removido para limpar console
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
              // Log removido para limpar console
              
              // 🔥 NOVO: SALVAR NO CACHE também quando usar Groq
              // Log removido para limpar console
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
QUANTIDADE: 10 flashcards

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
Crie exatamente 10 flashcards educacionais de nível ${difficulty} para o módulo "${selectedModulo}" da matéria "${selectedMateria}". 

IMPORTANTE: Cada flashcard deve ser único, original e explorar aspectos diferentes do conteúdo. Evite repetir perguntas ou respostas que já existam.

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
- ✅ 10 flashcards criados
- ✅ Todos do nível ${difficulty}
- ✅ Conteúdo 100% original e não repetido
- ✅ Linguagem apropriada para o nível
- ✅ Baseado no módulo específico
- ✅ Formato JSON válido

IMPORTANTE:
- Retorne APENAS o JSON válido, sem texto adicional
- Garanta que cada flashcard seja único e contributivo`

      // Chamar a API do Gemini
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY
      if (!apiKey) {
        throw new Error('VITE_GEMINI_API_KEY não configurada')
      }
      
      const genAI = new GoogleGenerativeAI(apiKey)
      
      // Usar apenas modelos confirmados que funcionam
      const modelNames = ['gemini-2.5-flash', 'gemini-1.5-pro-latest', 'gemini-1.5-pro', 'gemini-pro']
      let lastError = null
      let aiResponse = ''
      
      for (const modelName of modelNames) {
        try {
          const model = genAI.getGenerativeModel({ model: modelName })
          const result = await model.generateContent({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 4000,
            },
          })
          
          const response = await result.response
          const text = response.text()
          
          if (text && text.trim()) {
            aiResponse = text
            break
          }
        } catch (error) {
          console.warn(`Modelo ${modelName} falhou:`, error.message)
          lastError = error
          continue
        }
      }
      
      if (!aiResponse) {
        throw lastError || new Error('Todos os modelos Gemini falharam')
      }
      
      const text = aiResponse
      
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

        const cardRef = doc(collection(db, 'flashcards'))
        batch.push(setDoc(cardRef, cardData))
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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
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
            {/* Não renderizar enquanto está carregando para evitar flash */}
            {cardsLoading ? (
              <div className="text-center py-8">
                <p className="text-sm text-slate-500 dark:text-slate-400">Carregando...</p>
              </div>
            ) : (
              <>
            {/* Usar matérias dos flashcards organizados com ordem personalizada */}
            {(() => {
              const orderedSubjects = applySubjectOrder(organizedCards, subjectOrderConfig)
              return orderedSubjects.map((materia) => {
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
                      {(() => {
                        // Usar ordem de módulos carregada
                        const moduleOrderConfig = moduleOrderConfigs[materia] || { order: null, source: 'default', isCustom: false }
                        const orderedModules = applyModuleOrder(modulos, moduleOrderConfig)
                        return orderedModules.map((modulo) => {
                        const cardsInModulo = organizedCards[materia][modulo] || []
                        const isModuloSelected =
                          studyMode === 'module' &&
                          selectedMateria === materia &&
                          selectedModulo === modulo
                        const canAccessMod = !isTrialMode() || canAccessModulo(materia, modulo)
                        
                        return (
                          <button
                            key={modulo}
                            type="button"
                            onClick={() => selectModulo(materia, modulo)}
                            disabled={!canAccessMod && !isModuloSelected}
                            className={`group/module relative flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-semibold transition-all ${
                              !canAccessMod && !isModuloSelected
                                ? 'opacity-50 cursor-not-allowed'
                                : isModuloSelected
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
                      })})()}
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
            })})()}
              </>
            )}
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
            <div className="relative min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/30 dark:from-slate-900 dark:via-blue-900/20 dark:to-purple-900/20 overflow-hidden">
              {/* Background decorativo */}
              <div className="absolute inset-0 overflow-hidden">
                <div className="absolute top-0 left-0 w-96 h-96 bg-gradient-to-br from-blue-500/10 to-purple-500/10 rounded-full blur-3xl -ml-48 -mt-48"></div>
                <div className="absolute bottom-0 right-0 w-96 h-96 bg-gradient-to-br from-emerald-500/10 to-cyan-500/10 rounded-full blur-3xl -mr-48 -mb-48"></div>
              </div>
              
              {/* Header fixo */}
              <div className="sticky top-0 z-10 bg-white/80 dark:bg-slate-800/80 backdrop-blur-md border-b border-slate-200/50 dark:border-slate-700/50 px-4 py-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
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
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {activeCards.length} {activeCards.length === 1 ? 'card' : 'cards'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={shuffle}
                      className="group/btn relative inline-flex items-center justify-center gap-2 px-3 py-2 border-2 border-purple-500/30 dark:border-purple-400/30 text-purple-600 dark:text-purple-400 font-bold rounded-xl hover:bg-purple-50/50 dark:hover:bg-purple-900/20 transition-all overflow-hidden"
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-purple-500/0 via-purple-500/10 to-purple-500/0 translate-x-[-100%] group-hover/btn:translate-x-[100%] transition-transform duration-700"></div>
                      <span className="relative z-10 text-sm">🔀 Embaralhar</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedMateria(null)
                        setSelectedModulo(null)
                        setStudyMode('module')
                        setMiniSimCards([])
                      }}
                      className="group/btn relative inline-flex items-center justify-center gap-2 px-3 py-2 border-2 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 font-bold rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-all overflow-hidden"
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-slate-500/0 via-slate-500/10 to-slate-500/0 translate-x-[-100%] group-hover/btn:translate-x-[100%] transition-transform duration-700"></div>
                      <span className="relative z-10 text-sm">← Voltar</span>
                    </button>
                  </div>
                </div>
              </div>
              
              {/* Área do card - responsiva e fixa */}
              <div className="relative flex items-center justify-center min-h-[calc(100vh-120px)] px-2 sm:px-4 py-4">
                <div className="w-full max-w-2xl xl:max-w-3xl">
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
                    onDeleteFlashcard={handleDeleteFlashcard}
                  />
                </div>
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
    </div>
  )
}

export default FlashcardView
