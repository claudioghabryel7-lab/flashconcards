import { useEffect, useMemo, useState, startTransition } from 'react'
import { Link } from 'react-router-dom'
import dayjs from 'dayjs'
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore'
import {
  TrophyIcon,
  BookOpenIcon,
  ClockIcon,
  ChartBarIcon,
  LightBulbIcon,
  AcademicCapIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/solid'
import { db } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'
import { useDarkMode } from '../hooks/useDarkMode.jsx'
import { useSubjectOrder } from '../hooks/useSubjectOrder'
import { applySubjectOrder } from '../utils/subjectOrder'
import ProgressCalendar from '../components/ProgressCalendar'
import { isTrialMode, getTrialData } from '../utils/trialLimits'

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

const Dashboard = () => {
  const { user, profile } = useAuth()
  const { darkMode } = useDarkMode()
  const [progressData, setProgressData] = useState([])
  const [saving, setSaving] = useState(false)
  const [cardProgress, setCardProgress] = useState({})
  const [allCards, setAllCards] = useState([])
  const [loading, setLoading] = useState(true)
  const [isInitialLoad, setIsInitialLoad] = useState(true)
  const [studyStats, setStudyStats] = useState({
    totalDays: 0,
    totalHours: 0,
    bySubject: {},
  })
  const [studiedModules, setStudiedModules] = useState({}) // { materia: { modulo: true } }
  const [suggestedModule, setSuggestedModule] = useState(null) // { materia, modulo }
  const [studyPhase, setStudyPhase] = useState(1) // Fase atual (1, 2, 3...)
  const [expandedMaterias, setExpandedMaterias] = useState({}) // { materia: true/false }
  const [selectedCourseId, setSelectedCourseId] = useState(null) // Curso selecionado (null = ALEGO padrão)
  const [availableCourses, setAvailableCourses] = useState([]) // Cursos disponíveis para o usuário
  const [selectedCourse, setSelectedCourse] = useState(null) // Dados completos do curso selecionado
  const [trialCourse, setTrialCourse] = useState(null) // Curso do trial para banner de conversão
  const [trialDaysLeft, setTrialDaysLeft] = useState(null) // Dias restantes do trial

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

  // Carregar informações do trial e curso para banner de conversão
  useEffect(() => {
    if (!isTrialMode() || !profile) {
      setTrialCourse(null)
      setTrialDaysLeft(null)
      return
    }

    const trialData = getTrialData()
    if (!trialData?.courseId) {
      setTrialCourse(null)
      setTrialDaysLeft(null)
      return
    }

    // Calcular dias restantes
    if (trialData.expiresAt) {
      const expiresAt = new Date(trialData.expiresAt)
      const now = new Date()
      const diffTime = expiresAt - now
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
      setTrialDaysLeft(diffDays > 0 ? diffDays : 0)
    }

    // Carregar informações do curso
    const loadTrialCourse = async () => {
      try {
        const courseRef = doc(db, 'courses', trialData.courseId)
        const courseDoc = await getDoc(courseRef)
        if (courseDoc.exists()) {
          setTrialCourse({
            id: courseDoc.id,
            ...courseDoc.data()
          })
        }
      } catch (err) {
        console.error('Erro ao carregar curso do trial:', err)
      }
    }

    loadTrialCourse()
  }, [profile])
  
  // Carregar flashcards filtrados por curso selecionado com cache
  useEffect(() => {
    if (!user || !profile) return
    
    // Tentar carregar do cache primeiro
    const cacheKey = `flashcards_${selectedCourseId || 'alego'}_${user.uid}`
    try {
      const cached = localStorage.getItem(`firebase_cache_${cacheKey}`)
      if (cached) {
        const { data: cachedData, timestamp } = JSON.parse(cached)
        const now = Date.now()
        // Usar cache se tiver menos de 5 minutos
        if (now - timestamp < 5 * 60 * 1000 && cachedData) {
          startTransition(() => {
          setAllCards(cachedData)
          setLoading(false)
            setIsInitialLoad(false) // Permitir scroll imediatamente
          })
        }
      }
    } catch (err) {
      console.warn('Erro ao ler cache:', err)
    }
    
    const cardsRef = collection(db, 'flashcards')
    let retryCount = 0
    const maxRetries = 3
    
    const loadData = () => {
    const unsub = onSnapshot(
      cardsRef,
      (snapshot) => {
        const purchasedCourses = profile.purchasedCourses || []
        const isAdmin = profile.role === 'admin'
        
        let data = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
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
          console.log(`🔍 Dashboard - Filtrado por curso "${selectedCourse}": ${data.length} flashcards`)
        } else {
          // Mostrar apenas flashcards sem courseId (ALEGO padrão)
          // Incluir null, undefined e string vazia
          data = data.filter(card => {
            const cardCourseId = card.courseId
            return !cardCourseId || cardCourseId === '' || cardCourseId === null || cardCourseId === undefined
          })
          console.log(`🔍 Dashboard - Filtrado para ALEGO padrão: ${data.length} flashcards`)
        }
        
        // Admin vê todos, mas ainda filtra por curso selecionado
        if (!isAdmin && selectedCourseId) {
          // Verificar se o usuário comprou o curso selecionado
          if (!purchasedCourses.includes(selectedCourseId)) {
            data = []
          }
        }
        
        // Usar startTransition para atualizações não críticas
        startTransition(() => {
        setAllCards(data)
        setLoading(false)
          setIsInitialLoad(false)
        })
        
          retryCount = 0
          
        // Salvar no cache de forma assíncrona para não bloquear
        setTimeout(() => {
          try {
            localStorage.setItem(`firebase_cache_${cacheKey}`, JSON.stringify({
              data,
              timestamp: Date.now(),
            }))
          } catch (err) {
            console.warn('Erro ao salvar cache:', err)
          }
        }, 0)
      },
      (error) => {
        console.error('Erro ao carregar flashcards:', error)
          
          // Retry logic
          if (retryCount < maxRetries) {
            retryCount++
            setTimeout(() => {
              loadData()
            }, 1000 * retryCount)
          } else {
        setAllCards([])
        setLoading(false)
          }
      }
    )
      return unsub
    }
    
    const unsub = loadData()
    return () => unsub()
  }, [user, profile, selectedCourseId])

  // Carregar progresso dos cards do usuário com cache
  useEffect(() => {
    if (!user) return () => {}
    
    // Tentar carregar do cache primeiro
    const cacheKey = `userProgress_${user.uid}`
    try {
      const cached = localStorage.getItem(`firebase_cache_${cacheKey}`)
      if (cached) {
        const { data: cachedData, timestamp } = JSON.parse(cached)
        const now = Date.now()
        if (now - timestamp < 5 * 60 * 1000 && cachedData) {
          startTransition(() => {
          setCardProgress(cachedData.cardProgress || {})
          setStudiedModules(cachedData.studiedModules || {})
          setStudyPhase(cachedData.studyPhase || 1)
          })
        }
      }
    } catch (err) {
      console.warn('Erro ao ler cache de progresso:', err)
    }
    
    const userProgressRef = doc(db, 'userProgress', user.uid)
    let retryCount = 0
    const maxRetries = 3
    
    const loadData = () => {
    const unsub = onSnapshot(
      userProgressRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data()
          startTransition(() => {
          setCardProgress(data.cardProgress || {})
          setStudiedModules(data.studiedModules || {})
          setStudyPhase(data.studyPhase || 1)
          })
            
            // Salvar no cache de forma assíncrona
            setTimeout(() => {
            try {
              localStorage.setItem(`firebase_cache_${cacheKey}`, JSON.stringify({
                data: {
                  cardProgress: data.cardProgress || {},
                  studiedModules: data.studiedModules || {},
                  studyPhase: data.studyPhase || 1,
                },
                timestamp: Date.now(),
              }))
            } catch (err) {
              console.warn('Erro ao salvar cache de progresso:', err)
            }
            }, 0)
        } else {
          startTransition(() => {
          setCardProgress({})
          setStudiedModules({})
          setStudyPhase(1)
          })
        }
          retryCount = 0
      },
      (error) => {
        console.error('Erro ao carregar progresso dos cards:', error)
          
          // Retry logic
          if (retryCount < maxRetries) {
            retryCount++
            setTimeout(() => {
              loadData()
            }, 1000 * retryCount)
          } else {
        setCardProgress({})
        setStudiedModules({})
        setStudyPhase(1)
          }
      }
    )
      return unsub
    }
    
    const unsub = loadData()
    return () => unsub()
  }, [user])

  useEffect(() => {
    if (!user) return () => {}
    
    const progressRef = collection(db, 'progress')
    const q = query(
      progressRef,
      where('uid', '==', user.uid),
      orderBy('date', 'desc'),
    )
    
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((docSnapshot) => ({
          id: docSnapshot.id,
          ...docSnapshot.data(),
        }))
        
        // Filtrar por curso selecionado
        const selectedCourse = (selectedCourseId || '').trim()
        const filtered = data.filter(item => {
          const itemCourseId = item.courseId
          if (selectedCourse) {
            // Se tem curso selecionado, mostrar apenas progresso desse curso
            return itemCourseId === selectedCourse || String(itemCourseId) === String(selectedCourse)
          } else {
            // Se não tem curso selecionado, mostrar apenas progresso sem courseId (ALEGO padrão)
            return !itemCourseId || itemCourseId === '' || itemCourseId === null || itemCourseId === undefined
          }
        })
        
        console.log('📅 ProgressData atualizado:', { 
          total: data.length, 
          filtered: filtered.length, 
          selectedCourse,
          dates: filtered.map(p => p.date).slice(0, 5)
        })
        
        setProgressData(filtered)
      },
      (error) => {
        // Se der erro de índice, tentar sem orderBy
        if (error.code === 'failed-precondition') {
          console.warn('Índice do Firestore não criado. Usando query sem orderBy.')
          const qSimple = query(progressRef, where('uid', '==', user.uid))
          onSnapshot(
            qSimple,
            (snapshot) => {
              const data = snapshot.docs.map((docSnapshot) => ({
                id: docSnapshot.id,
                ...docSnapshot.data(),
              }))
              
              // Filtrar por curso selecionado
              const selectedCourse = (selectedCourseId || '').trim()
              const filtered = data.filter(item => {
                const itemCourseId = item.courseId
                if (selectedCourse) {
                  return itemCourseId === selectedCourse || String(itemCourseId) === String(selectedCourse)
                } else {
                  return !itemCourseId || itemCourseId === '' || itemCourseId === null || itemCourseId === undefined
                }
              })
              
              // Ordenar manualmente por data
              filtered.sort((a, b) => {
                if (!a.date || !b.date) return 0
                return b.date.localeCompare(a.date)
              })
              setProgressData(filtered)
            },
            (err) => console.error('Erro ao carregar progresso:', err)
          )
        } else {
          console.error('Erro ao carregar progresso:', error)
        }
      }
    )
    
    return () => unsub()
  }, [user, selectedCourseId])

  // Carregar ordem de matérias e módulos
  const { subjectOrderConfig } = useSubjectOrder(selectedCourseId, user?.uid)

  // Organizar matérias e módulos dos flashcards (otimizado)
  const organizedModules = useMemo(() => {
    // Se ainda está carregando e não há cards, retornar objeto vazio
    if (loading && allCards.length === 0) {
      return {}
    }
    
    const organized = {}
    allCards.forEach((card) => {
      if (card.materia && card.modulo) {
        if (!organized[card.materia]) {
          organized[card.materia] = new Set()
        }
        organized[card.materia].add(card.modulo)
      }
    })
    
    // Converter Sets para Arrays e ordenar
    const result = {}
    Object.keys(organized).forEach((materia) => {
      result[materia] = Array.from(organized[materia]).sort((a, b) => {
        // Extrair números dos módulos para ordenação numérica
        const numA = parseInt(a.match(/\d+/)?.[0] || '0')
        const numB = parseInt(b.match(/\d+/)?.[0] || '0')
        if (numA !== numB) return numA - numB
        return a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' })
      })
    })
    return result
  }, [allCards, loading])

  // Calcular estatísticas de módulos
  const modulesStats = useMemo(() => {
    let totalModules = 0
    let studiedCount = 0
    
    Object.keys(organizedModules).forEach((materia) => {
      const modulos = organizedModules[materia] || []
      totalModules += modulos.length
      
      modulos.forEach((modulo) => {
        if (studiedModules[materia]?.[modulo] === true) {
          studiedCount++
        }
      })
    })
    
    const remaining = totalModules - studiedCount
    const daysRemaining = remaining // 1 módulo por dia
    
    return {
      total: totalModules,
      studied: studiedCount,
      remaining,
      daysRemaining,
      percentage: totalModules > 0 ? Math.round((studiedCount / totalModules) * 100) : 0
    }
  }, [organizedModules, studiedModules])

  // Calcular progresso do módulo sugerido
  const moduleProgress = useMemo(() => {
    if (!suggestedModule || !allCards.length) return { studied: 0, total: 0, percentage: 0 }
    
    const cardsInModule = allCards.filter(
      card => card.materia === suggestedModule.materia && card.modulo === suggestedModule.modulo
    )
    
    const studiedCards = cardsInModule.filter(card => {
      const progress = cardProgress[card.id]
      return progress && progress.reviewCount > 0
    })
    
    return {
      studied: studiedCards.length,
      total: cardsInModule.length,
      percentage: cardsInModule.length > 0 ? Math.round((studiedCards.length / cardsInModule.length) * 100) : 0
    }
  }, [suggestedModule, allCards, cardProgress])

  // Sugerir próximo módulo para estudar
  useEffect(() => {
    if (!organizedModules || Object.keys(organizedModules).length === 0) {
      setSuggestedModule(null)
      return
    }

    // Encontrar o primeiro módulo não estudado, seguindo ordem das matérias e módulos
    // Usar ordem personalizada
    const materiasReais = applySubjectOrder(organizedModules, subjectOrderConfig)
    
    for (const materia of materiasReais) {
      const modulos = organizedModules[materia] || []
      if (modulos.length === 0) continue

      for (const modulo of modulos) {
        const isStudied = studiedModules[materia]?.[modulo] === true
        if (!isStudied) {
          setSuggestedModule({ materia, modulo })
          return
        }
      }
    }

    // Se todos foram estudados, sugerir o primeiro módulo da primeira matéria
    const firstMateria = materiasReais.find(m => organizedModules[m]?.length > 0)
    if (firstMateria && organizedModules[firstMateria]?.length > 0) {
      setSuggestedModule({
        materia: firstMateria,
        modulo: organizedModules[firstMateria][0]
      })
    } else {
      setSuggestedModule(null)
    }
  }, [organizedModules, studiedModules])

  // Marcar módulo como estudado
  const markModuleAsStudied = async () => {
    if (!user || !suggestedModule) return

    try {
      const userProgressRef = doc(db, 'userProgress', user.uid)
      const currentData = await getDoc(userProgressRef)
      let currentStudiedModules = currentData.exists() 
        ? (currentData.data().studiedModules || {})
        : {}
      const currentPhase = currentData.exists() 
        ? (currentData.data().studyPhase || 1)
        : 1

      // Atualizar estrutura - marcar módulo atual como estudado
      if (!currentStudiedModules[suggestedModule.materia]) {
        currentStudiedModules[suggestedModule.materia] = {}
      }
      currentStudiedModules[suggestedModule.materia][suggestedModule.modulo] = true

      // Atualização otimista - atualizar estado local imediatamente para sincronizar dias restantes
      setStudiedModules({ ...currentStudiedModules })

      // Verificar se todos os módulos foram estudados (após marcar o atual)
      let allStudied = true
      Object.keys(organizedModules).forEach((materia) => {
        const modulos = organizedModules[materia] || []
        modulos.forEach((modulo) => {
          if (!currentStudiedModules[materia]?.[modulo]) {
            allStudied = false
          }
        })
      })

      // Se todos foram estudados, resetar e incrementar fase
      if (allStudied) {
        // Resetar todos os módulos estudados para começar nova fase
        const resetModules = {}
        Object.keys(organizedModules).forEach((materia) => {
          resetModules[materia] = {}
          organizedModules[materia].forEach((modulo) => {
            resetModules[materia][modulo] = false
          })
        })
        
        await setDoc(userProgressRef, {
          studiedModules: resetModules,
          studyPhase: currentPhase + 1,
          updatedAt: serverTimestamp(),
        }, { merge: true })

        setStudiedModules(resetModules)
        setStudyPhase(currentPhase + 1)
      } else {
        await setDoc(userProgressRef, {
          studiedModules: currentStudiedModules,
          studyPhase: currentPhase,
          updatedAt: serverTimestamp(),
        }, { merge: true })

        setStudiedModules(currentStudiedModules)
      }
    } catch (err) {
      console.error('Erro ao marcar módulo como estudado:', err)
    }
  }

      // Calcular estatísticas baseadas em cards estudados (deferido para não bloquear)
      useEffect(() => {
        // Se ainda está carregando inicialmente, adiar o cálculo
        if (isInitialLoad && loading) {
          return
        }
        
        // Usar setTimeout para adiar cálculos pesados e não bloquear o thread principal
        const timeoutId = setTimeout(() => {
          startTransition(() => {
        // Horas dos dias registrados (tempo real rastreado)
        const hoursFromDays = progressData.reduce((sum, item) => {
          const hours = parseFloat(item.hours || 0)
          return sum + hours
        }, 0)
        
        console.log('📊 Atualizando estatísticas:', { 
          progressDataLength: progressData.length, 
          hoursFromDays: hoursFromDays.toFixed(2) 
        })
        
        const stats = {
          totalDays: progressData.length,
          totalHours: hoursFromDays, // Usar apenas horas reais do Firestore (rastreadas pelo timer)
          bySubject: {},
        }
    
    // Inicializar todas as matérias
    MATERIAS.forEach((materia) => {
      stats.bySubject[materia] = {
        days: 0,
        hours: 0,
        totalCards: 0,
        studiedCards: 0,
        percentage: 0,
      }
    })
    
    // Contar cards por matéria e calcular progresso (já filtrado por curso em allCards)
    allCards.forEach((card) => {
      if (card.materia) {
        // Usar matérias reais dos flashcards, não apenas MATERIAS fixas
        if (!stats.bySubject[card.materia]) {
          stats.bySubject[card.materia] = {
            days: 0,
            hours: 0,
            totalCards: 0,
            studiedCards: 0,
            percentage: 0,
          }
        }
        stats.bySubject[card.materia].totalCards += 1
        const progress = cardProgress[card.id]
        if (progress && progress.reviewCount > 0) {
          stats.bySubject[card.materia].studiedCards += 1
          // Horas por matéria serão calculadas proporcionalmente ao tempo total
          // Por enquanto, não adicionamos horas por matéria individualmente
        }
      }
    })
    
    // Calcular porcentagem por matéria
    MATERIAS.forEach((materia) => {
      const subj = stats.bySubject[materia]
      if (subj.totalCards > 0) {
        subj.percentage = Math.round((subj.studiedCards / subj.totalCards) * 100)
      }
    })
    
    setStudyStats(stats)
          })
        }, isInitialLoad ? 100 : 0) // Adiar um pouco no carregamento inicial
        
        return () => clearTimeout(timeoutId)
      }, [allCards, cardProgress, progressData, isInitialLoad, loading])

  // Extrair datas únicas do progressData e normalizar para YYYY-MM-DD
  const progressDates = useMemo(() => {
    const datesSet = new Set()
    
    progressData.forEach((item) => {
      if (item.date) {
        // Normalizar data para formato YYYY-MM-DD
        let normalizedDate = item.date
        if (typeof normalizedDate === 'string') {
          // Se já está no formato YYYY-MM-DD, usar direto
          if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)) {
            // Tentar parsear com dayjs
            const parsed = dayjs(normalizedDate)
            if (parsed.isValid()) {
              normalizedDate = parsed.format('YYYY-MM-DD')
            }
          }
        }
        datesSet.add(normalizedDate)
      }
    })
    
    // Retornar array ordenado de datas únicas
    const dates = Array.from(datesSet).sort()
    
    console.log('📆 ProgressDates recalculado:', { 
      totalDates: dates.length, 
      dates: dates.slice(-5) // Últimas 5 datas
    })
    
    return dates
  }, [progressData])

  // Calcular sequência (streak) de dias consecutivos
  const streak = useMemo(() => {
    if (progressDates.length === 0) return 0
    
    const studiedSet = new Set(progressDates.map(date => {
      // Garantir que a data está no formato correto
      const parsed = dayjs(date)
      return parsed.isValid() ? parsed.format('YYYY-MM-DD') : date
    }))
    
    let count = 0
    let cursor = dayjs().startOf('day')
    
    // Verificar se hoje estudou
    const todayKey = cursor.format('YYYY-MM-DD')
    if (!studiedSet.has(todayKey)) {
      // Se não estudou hoje, verifica desde ontem
      cursor = cursor.subtract(1, 'day')
    }
    
    // Contar dias consecutivos retrocedendo até encontrar um dia sem estudo
    while (studiedSet.has(cursor.format('YYYY-MM-DD'))) {
      count += 1
      cursor = cursor.subtract(1, 'day')
    }
    
    return count
  }, [progressDates])

  const totalProgress = useMemo(() => {
    // Calcular progresso total como média das porcentagens de cada matéria
    const percentages = MATERIAS.map((materia) => {
      return studyStats.bySubject[materia]?.percentage || 0
    })
    
    if (percentages.length === 0) return 0
    
    const sum = percentages.reduce((acc, pct) => acc + pct, 0)
    return sum / percentages.length
  }, [studyStats])

  const handleStudyToday = async () => {
    if (!user) return
    setSaving(true)
    try {
      const todayKey = dayjs().format('YYYY-MM-DD')
      const now = dayjs()
      // Incluir courseId no ID do documento para separar por curso
      const courseKey = selectedCourseId || 'alego'
      const progressDoc = doc(db, 'progress', `${user.uid}_${courseKey}_${todayKey}`)
      
      const existing = progressData.find((p) => {
        // Comparar também o courseId para garantir que é do mesmo curso
        const itemCourseId = p.courseId || null
        const selectedCourse = selectedCourseId || null
        const courseMatches = itemCourseId === selectedCourse || 
          (!itemCourseId && !selectedCourse) ||
          String(itemCourseId) === String(selectedCourse)
        return p.date === todayKey && courseMatches
      })
      
      const currentHours = existing?.hours || 0
      const newHours = currentHours + 0.5 // Adiciona 30 minutos
      
      console.log('💾 Salvando progresso de hoje:', { 
        todayKey, 
        courseKey, 
        existing: !!existing, 
        newHours,
        courseId: selectedCourseId || null
      })
      
      // Atualização otimista - adicionar à lista imediatamente
      const newProgressItem = {
        id: progressDoc.id,
        uid: user.uid,
        date: todayKey,
        hours: newHours,
        courseId: selectedCourseId || null,
        lastUpdated: now.format('HH:mm'),
        createdAt: existing?.createdAt || null,
        updatedAt: null,
      }
      
      // Atualização otimista - adicionar à lista imediatamente
      setProgressData(prev => {
        // Remover item existente se houver
        const filtered = prev.filter(p => {
          const itemCourseId = p.courseId || null
          const selectedCourse = selectedCourseId || null
          const courseMatches = itemCourseId === selectedCourse || 
            (!itemCourseId && !selectedCourse) ||
            String(itemCourseId) === String(selectedCourse)
          return !(p.date === todayKey && courseMatches)
        })
        const updated = [...filtered, newProgressItem]
        console.log('🔄 Atualização otimista:', { 
          before: prev.length, 
          after: updated.length, 
          todayKey,
          newItem: newProgressItem
        })
        return updated
      })
      
      await setDoc(
        progressDoc,
        {
          uid: user.uid,
          date: todayKey,
          hours: newHours,
          courseId: selectedCourseId || null, // null para ALEGO padrão
          lastUpdated: now.format('HH:mm'),
          createdAt: existing?.createdAt || serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      )
      
      console.log('✅ Progresso salvo com sucesso!')
    } catch (err) {
      console.error('❌ Erro ao salvar progresso:', err)
    } finally {
      setSaving(false)
    }
  }

  // Mostrar loading apenas no carregamento inicial muito rápido
  // Após isso, permitir scroll mesmo com dados ainda carregando
  if (loading && isInitialLoad && allCards.length === 0) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin text-blue-500 text-4xl mb-4">⚙️</div>
          <p className="text-lg font-semibold text-slate-700 dark:text-slate-300">Carregando dados...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
      {/* Banner de Conversão para Usuários Trial */}
      {isTrialMode() && trialCourse && trialDaysLeft !== null && (
        <div className="relative overflow-hidden bg-gradient-to-r from-alego-600 via-alego-700 to-alego-800 rounded-2xl shadow-2xl border-2 border-alego-500">
          <div className="absolute inset-0 bg-black/10"></div>
          <div className="relative p-6 sm:p-8">
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-3">
                  <span className="px-3 py-1 bg-white/20 backdrop-blur-sm rounded-full text-white text-xs font-bold uppercase tracking-wider">
                    ⚡ Teste Gratuito
                  </span>
                  {trialDaysLeft > 0 && (
                    <span className="px-3 py-1 bg-red-500/90 rounded-full text-white text-xs font-bold">
                      {trialDaysLeft} {trialDaysLeft === 1 ? 'dia restante' : 'dias restantes'}
                    </span>
                  )}
                </div>
                <h2 className="text-2xl sm:text-3xl font-black text-white mb-2">
                  🎯 Não perca seu acesso ao {trialCourse.name}!
                </h2>
                <p className="text-alego-100 text-base sm:text-lg mb-4">
                  {trialDaysLeft > 0 
                    ? `Você tem ${trialDaysLeft} ${trialDaysLeft === 1 ? 'dia' : 'dias'} para garantir seu acesso completo. Compre agora e continue estudando sem interrupções!`
                    : 'Seu período de teste está expirando! Garanta seu acesso completo agora e continue estudando sem interrupções.'
                  }
                </p>
                <div className="flex flex-wrap items-center gap-4 text-white/90 text-sm">
                  <span className="flex items-center gap-2">
                    <CheckCircleIcon className="h-5 w-5 text-green-300" />
                    Acesso permanente
                  </span>
                  <span className="flex items-center gap-2">
                    <CheckCircleIcon className="h-5 w-5 text-green-300" />
                    Todos os recursos desbloqueados
                  </span>
                  <span className="flex items-center gap-2">
                    <CheckCircleIcon className="h-5 w-5 text-green-300" />
                    Suporte completo
                  </span>
                </div>
              </div>
              <div className="flex flex-col gap-3 min-w-[200px]">
                {trialCourse.price && (
                  <div className="text-center mb-2">
                    {trialCourse.originalPrice && trialCourse.originalPrice > trialCourse.price && (
                      <p className="text-alego-200 text-sm line-through mb-1">
                        De R$ {trialCourse.originalPrice.toFixed(2)}
                      </p>
                    )}
                    <p className="text-3xl font-black text-white">
                      R$ {trialCourse.price.toFixed(2)}
                    </p>
                    {trialCourse.originalPrice && trialCourse.originalPrice > trialCourse.price && (
                      <p className="text-green-300 text-xs font-semibold mt-1">
                        Economia de R$ {(trialCourse.originalPrice - trialCourse.price).toFixed(2)}
                      </p>
                    )}
                  </div>
                )}
                <Link
                  to={`/pagamento?course=${trialCourse.id}`}
                  className="w-full px-6 py-4 bg-white text-alego-700 rounded-xl font-black text-lg text-center hover:bg-alego-50 transition-all shadow-lg hover:shadow-xl transform hover:scale-105 active:scale-95"
                >
                  Comprar Agora
                </Link>
                <p className="text-alego-200 text-xs text-center">
                  💳 Pagamento seguro • Acesso imediato
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header Limpo */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 p-6 sm:p-8">
        <p className="text-xs sm:text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
          Bem-vindo(a), {profile?.displayName || user?.email || 'Aluno'}
        </p>
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-slate-900 dark:text-white mb-6">
          {selectedCourse 
            ? `Sua mentoria para ${selectedCourse.name} está organizada aqui.`
            : 'Sua mentoria para a Polícia Legislativa está organizada aqui.'}
        </h1>
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <Link
            to="/flashcards"
            className="inline-flex items-center justify-center px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-500 text-white font-semibold rounded-xl hover:from-blue-700 hover:to-blue-600 transition-all shadow-md hover:shadow-lg"
          >
            Ir para os flashcards
          </Link>
          <button
            type="button"
            onClick={handleStudyToday}
            disabled={saving}
            className="inline-flex items-center justify-center px-6 py-3 border-2 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 font-semibold rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Salvando...' : 'Marcar estudo de hoje'}
          </button>
        </div>

        {/* Seção "Como estudar?" - Movida para dentro do header */}
        <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl blur-lg opacity-50 animate-pulse"></div>
                <div className="relative rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 p-3 shadow-lg">
                  <AcademicCapIcon className="h-6 w-6 text-white" />
                </div>
              </div>
              <div>
                <h2 className="text-xl sm:text-2xl font-black bg-gradient-to-r from-blue-600 to-cyan-600 dark:from-blue-400 dark:to-cyan-400 bg-clip-text text-transparent">
                  Como estudar?
                </h2>
                {studyPhase > 1 && (
                  <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 mt-1 flex items-center gap-1">
                    <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-blue-100 dark:bg-blue-900/50 text-xs">↻</span>
                    Estudando pela {studyPhase}ª vez
                  </p>
                )}
              </div>
            </div>
            {modulesStats.total > 0 && (
              <div className="flex items-center gap-3">
                {modulesStats.daysRemaining > 0 ? (
                  <div className="group relative inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500/10 to-cyan-500/10 dark:from-blue-500/20 dark:to-cyan-500/20 rounded-lg border border-blue-500/30 dark:border-blue-400/30 backdrop-blur-sm hover:border-blue-500/50 dark:hover:border-blue-400/50 transition-all">
                    <div className="relative">
                      <div className="absolute inset-0 bg-blue-500 rounded-full blur-md opacity-50 group-hover:opacity-75 transition-opacity"></div>
                      <span className="relative text-blue-600 dark:text-blue-400 font-black text-xl">{modulesStats.daysRemaining}</span>
                    </div>
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      {modulesStats.daysRemaining === 1 ? 'dia restante' : 'dias restantes'}
                    </span>
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-500/10 to-emerald-500/10 dark:from-green-500/20 dark:to-emerald-500/20 rounded-lg border border-green-500/30 dark:border-green-400/30 backdrop-blur-sm">
                    <div className="relative">
                      <div className="absolute inset-0 bg-green-500 rounded-full blur-md opacity-50 animate-pulse"></div>
                      <span className="relative text-green-600 dark:text-green-400 font-bold">✓</span>
                    </div>
                    <span className="text-xs font-semibold text-green-600 dark:text-green-400">Todos completos!</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {suggestedModule ? (
            <div className="space-y-4">
              <div className="relative group overflow-hidden bg-gradient-to-br from-blue-500/10 via-cyan-500/5 to-indigo-500/10 dark:from-blue-500/20 dark:via-cyan-500/10 dark:to-indigo-500/20 rounded-xl border border-blue-500/30 dark:border-blue-400/30 backdrop-blur-sm p-5 hover:border-blue-500/50 dark:hover:border-blue-400/50 transition-all duration-300">
                <div className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full">
                  <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></span>
                  <span className="text-xs font-bold text-white">RECOMENDADO</span>
                </div>
                
                <div className="relative space-y-4 pr-20">
                  <p className="text-base text-slate-900 dark:text-white font-medium leading-relaxed">
                    Olá! Que tal estudarmos o{' '}
                    <span className="font-black bg-gradient-to-r from-blue-600 to-cyan-600 dark:from-blue-400 dark:to-cyan-400 bg-clip-text text-transparent">
                      {suggestedModule.modulo}
                    </span>
                    {' '}de{' '}
                    <span className="font-black bg-gradient-to-r from-blue-600 to-cyan-600 dark:from-blue-400 dark:to-cyan-400 bg-clip-text text-transparent">
                      {suggestedModule.materia}
                    </span>
                    {' '}hoje?
                  </p>
                  
                  {moduleProgress.total > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/50 text-xs font-bold text-blue-600 dark:text-blue-400">
                            {moduleProgress.studied}
                          </span>
                          / {moduleProgress.total} cards estudados
                        </span>
                        <span className="text-lg font-black bg-gradient-to-r from-blue-600 to-cyan-600 dark:from-blue-400 dark:to-cyan-400 bg-clip-text text-transparent">
                          {moduleProgress.percentage}%
                        </span>
                      </div>
                      <div className="relative h-3 w-full overflow-hidden rounded-full bg-slate-200/50 dark:bg-slate-700/50 backdrop-blur-sm border border-slate-300/50 dark:border-slate-600/50">
                        <div
                          className="relative h-full bg-gradient-to-r from-blue-500 via-cyan-500 to-blue-500 transition-all duration-700 ease-out rounded-full shadow-lg"
                          style={{ width: `${moduleProgress.percentage}%` }}
                        >
                          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer-slide"></div>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  <div className="flex flex-col sm:flex-row gap-3 pt-2">
                    <Link
                      to={`/flashcards?materia=${encodeURIComponent(suggestedModule.materia)}&modulo=${encodeURIComponent(suggestedModule.modulo)}`}
                      className="group/btn relative flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-bold rounded-xl hover:from-blue-500 hover:to-cyan-500 transition-all shadow-lg hover:shadow-xl hover:shadow-blue-500/50 hover:scale-[1.02] active:scale-[0.98] overflow-hidden"
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover/btn:translate-x-[100%] transition-transform duration-1000"></div>
                      <span className="relative z-10 flex items-center gap-2">
                        <BookOpenIcon className="h-5 w-5" />
                        Ir estudar
                      </span>
                    </Link>
                    <button
                      type="button"
                      onClick={markModuleAsStudied}
                      disabled={moduleProgress.studied < moduleProgress.total || moduleProgress.total === 0}
                      className="group/btn relative flex items-center justify-center gap-2 px-5 py-3 border-2 border-green-500 text-green-600 dark:text-green-400 font-bold rounded-xl bg-green-50/50 dark:bg-green-900/20 hover:bg-green-500 hover:text-white dark:hover:bg-green-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-green-50/50 disabled:hover:text-green-600 overflow-hidden"
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-green-500/0 via-green-500/10 to-green-500/0 translate-x-[-100%] group-hover/btn:translate-x-[100%] transition-transform duration-700 disabled:translate-x-[-100%]"></div>
                      <CheckCircleIcon className="h-5 w-5 relative z-10" />
                      <span className="relative z-10">Estudado</span>
                    </button>
                  </div>
                  {moduleProgress.studied < moduleProgress.total && moduleProgress.total > 0 && (
                    <p className="text-xs text-center text-slate-500 dark:text-slate-400 font-medium">
                      Complete todos os <span className="font-bold text-blue-600 dark:text-blue-400">{moduleProgress.total}</span> cards para marcar como estudado
                    </p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-slate-500 dark:text-slate-400">
              <p>Carregando módulos...</p>
            </div>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Card SRS - Limpo */}
        <div className="lg:col-span-1 bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 p-6">
          <div className="flex items-start gap-4 mb-4">
            <div className="rounded-full bg-blue-100 dark:bg-blue-900/30 p-3 flex-shrink-0">
              <LightBulbIcon className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              Memorização Espaçada (SRS)
            </h3>
          </div>
          <div className="space-y-3 text-sm text-slate-600 dark:text-slate-400">
            <p>
              <strong className="text-slate-900 dark:text-white">🎯 O que é:</strong> Sistema que mostra os cards no momento ideal para revisão, baseado na ciência da memória.
            </p>
            <p>
              <strong className="text-slate-900 dark:text-white">📈 Como funciona:</strong>
            </p>
            <ul className="ml-4 space-y-2 list-disc">
              <li><strong>Fácil:</strong> Card "sobe de nível" - próxima revisão em mais tempo</li>
              <li><strong>Difícil:</strong> Card "desce de nível" - próxima revisão em menos tempo</li>
            </ul>
            <div className="pt-3 mt-3 border-t border-slate-200 dark:border-slate-700">
              <p>
                <strong className="text-green-600 dark:text-green-400">💡 Dica:</strong> Se você não revisar um card por muito tempo, o sistema automaticamente reduz o nível!
              </p>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
          {/* Estatísticas - Grid Limpo */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-md border border-slate-200 dark:border-slate-700 p-5">
              <TrophyIcon className="h-7 w-7 text-amber-500 mb-2" />
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                Dias seguidos
              </p>
              <p className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">{streak}🔥</p>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-md border border-slate-200 dark:border-slate-700 p-5">
              <BookOpenIcon className="h-7 w-7 text-purple-500 mb-2" />
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                Favoritos
              </p>
              <p className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
                {(() => {
                  // Filtrar favoritos apenas dos cards do curso selecionado
                  if (!profile?.favorites || !allCards.length) return 0
                  const selectedCourse = (selectedCourseId || '').trim()
                  const courseCardIds = allCards.map(c => c.id)
                  const courseFavorites = profile.favorites.filter(favId => {
                    // Verificar se o favorito é um card do curso atual
                    if (!courseCardIds.includes(favId)) return false
                    // Se não tem curso selecionado, mostrar apenas favoritos de cards sem courseId
                    if (!selectedCourse) {
                      const card = allCards.find(c => c.id === favId)
                      return card && (!card.courseId || card.courseId === '' || card.courseId === null || card.courseId === undefined)
                    }
                    // Se tem curso selecionado, mostrar apenas favoritos de cards desse curso
                    const card = allCards.find(c => c.id === favId)
                    return card && (card.courseId === selectedCourse || String(card.courseId) === String(selectedCourse))
                  })
                  return courseFavorites.length
                })()}
              </p>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-md border border-slate-200 dark:border-slate-700 p-5">
              <ClockIcon className="h-7 w-7 text-blue-500 mb-2" />
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                Horas estudadas
              </p>
              <p className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
                {studyStats.totalHours.toFixed(1)}h
              </p>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-md border border-slate-200 dark:border-slate-700 p-5">
              <ChartBarIcon className="h-7 w-7 text-green-500 mb-2" />
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                Progresso total
              </p>
              <p className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
                {totalProgress.toFixed(0)}%
              </p>
            </div>
          </div>

          {/* Calendário - Já tem seu próprio card */}
          <ProgressCalendar 
            dates={progressDates} 
            streak={streak} 
            bySubject={studyStats.bySubject}
          />
        </div>
      </div>

      {/* Seção "Como estudar?" foi movida para dentro do header acima */}

      {/* Progresso por Matéria - Compacto e Tecnológico */}
      <div className="relative overflow-hidden bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-4 sm:p-5">
        {/* Background gradient decorativo */}
        <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-purple-500/5 to-blue-500/5 rounded-full blur-3xl -mr-24 -mt-24"></div>
        
        <div className="relative">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg sm:text-xl font-black bg-gradient-to-r from-purple-600 to-blue-600 dark:from-purple-400 dark:to-blue-400 bg-clip-text text-transparent">
              Progresso por Matéria
            </h2>
            <ChartBarIcon className="h-5 w-5 text-purple-500 dark:text-purple-400" />
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Usar matérias reais dos flashcards com ordem personalizada */}
            {applySubjectOrder(organizedModules, subjectOrderConfig).map((materia) => {
              const stats = studyStats.bySubject[materia] || { days: 0, hours: 0, percentage: 0, studiedCards: 0, totalCards: 0 }
              const progress = stats.percentage || 0
              const hasProgress = stats.totalCards > 0
              
              return (
                <div 
                  key={materia} 
                  className="group relative p-3 rounded-xl bg-gradient-to-br from-slate-50 to-slate-100/50 dark:from-slate-800/50 dark:to-slate-700/50 border border-slate-200/50 dark:border-slate-600/50 hover:border-purple-500/50 dark:hover:border-purple-400/50 transition-all hover:shadow-md"
                >
                  {/* Background hover */}
                  <div className="absolute inset-0 bg-gradient-to-r from-purple-500/0 via-purple-500/5 to-blue-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-xl"></div>
                  
                  <div className="relative space-y-2">
                    {/* Nome e percentual */}
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs font-bold text-slate-900 dark:text-white leading-tight flex-1 min-w-0">
                        {materia}
                      </span>
                      {hasProgress && (
                        <span className="text-xs font-black bg-gradient-to-r from-purple-600 to-blue-600 dark:from-purple-400 dark:to-blue-400 bg-clip-text text-transparent whitespace-nowrap">
                          {progress}%
                        </span>
                      )}
                    </div>
                    
                    {/* Barra de progresso compacta */}
                    {hasProgress ? (
                      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-slate-200/50 dark:bg-slate-700/50">
                        <div className="absolute inset-0 bg-gradient-to-r from-purple-500/10 to-blue-500/10"></div>
                        <div
                          className="relative h-full bg-gradient-to-r from-purple-500 via-blue-500 to-cyan-500 transition-all duration-700 ease-out rounded-full"
                          style={{ width: `${progress}%` }}
                        >
                          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent animate-shimmer-slide"></div>
                        </div>
                      </div>
                    ) : (
                      <div className="h-1.5 w-full rounded-full bg-slate-200/30 dark:bg-slate-700/30"></div>
                    )}
                    
                    {/* Stats compactas */}
                    <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
                      <span className="font-semibold">
                        {stats.studiedCards || 0}/{stats.totalCards || 0}
                      </span>
                      {stats.hours > 0 && (
                        <span className="font-medium">
                          {stats.hours.toFixed(1)}h
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
      </div>
    </div>
  )
}

export default Dashboard
