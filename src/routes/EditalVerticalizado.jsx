import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams, Link, useNavigate } from 'react-router-dom'
import { doc, onSnapshot, getDoc, updateDoc, collection, getDocs, query, where, orderBy, setDoc, serverTimestamp, writeBatch, deleteDoc } from 'firebase/firestore'
import dayjs from 'dayjs'
import {
  DocumentTextIcon,
  ChevronLeftIcon,
  BookOpenIcon,
  PencilIcon,
  XMarkIcon,
  CheckIcon,
  SparklesIcon,
  ArrowPathIcon,
  TrashIcon,
  PlusIcon,
  QuestionMarkCircleIcon,
  DocumentDuplicateIcon,
  FireIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline'
import { db } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'
import { useDarkMode } from '../hooks/useDarkMode.jsx'
import { generateAiJson, formatAiErrorForUser } from '../utils/geminiApi'
import AudioReader from '../components/AudioReader'
import { processIAContent, isHtmlContent } from '../utils/iaContentProcessor'
import { formatTopicoAsModulo } from '../utils/editalVerticalizadoLoader'
import { CONTENT_STATUS } from '../utils/contentStatus'
import {
  setTopicoPublishStatus,
  toggleTopicoPublishStatus,
  setDisciplinaIncidenciaPublishStatus,
  sanitizeDisciplinaName,
  buildTopicoPublishMapFromSnapshot,
  resolveTopicPublishStatus,
} from '../services/topicoPublishService'
import { normalizeTopicKeyForStorage } from '../utils/topicKeyFirestore'
import {
  canAccessTopicoContent,
  getFreeTopicKeys,
  hasPurchasedCourse,
  buildWhatsAppCourseUrl,
  formatCoursePrice,
  topicKeysMatch,
} from '../utils/courseAccess'

// Gera uma chave estável e mais específica para cada tópico do edital,
// combinando numeração + nome. Isso evita colisões entre tópicos diferentes
// que tenham a mesma numeração (ex: "1" em várias disciplinas).
const makeTopicKey = (topico) => {
  if (!topico) return ''
  const numero = (topico.numero || '').toString().trim()
  const nome = (topico.nome || '').toString().trim()

  // Mantém compatibilidade com dados antigos: se só tiver um dos dois, usa ele.
  if (!numero && !nome) return ''
  if (!numero || !nome) {
    const base = numero || nome
    return encodeURIComponent(base)
  }

  // Nova forma: "numero :: nome" (separador pouco provável de aparecer no texto)
  const combined = `${numero} :: ${nome}`
  return encodeURIComponent(combined)
}

// Função auxiliar para extrair contexto hierárquico
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
        curso: courseName || 'Curso não identificado'
      }
    }
  }
  
  return null
}

// Função auxiliar para processar conteúdo antes de renderizar
const processContentForDisplay = (content, contexto = null) => {
  if (!content) return content
  
  // Se já for HTML, processa com o processador IA incluindo contexto
  if (isHtmlContent(content)) {
    return processIAContent(content, contexto)
  }
  
  // Se for texto puro, converte para parágrafos HTML
  const paragraphs = content.split('\n\n').filter(p => p.trim())
  if (paragraphs.length > 1) {
    return paragraphs
      .map(p => `<p>${p.trim().replace(/\n/g, '<br>')}</p>`)
      .join('\n\n')
  }
  
  // Se for uma única linha, envolve em parágrafo
  return `<p>${content.trim()}</p>`
}

const EditalVerticalizado = () => {
  const { user, profile, isAdmin } = useAuth()
  const { darkMode } = useDarkMode()
  const [searchParams] = useSearchParams()
  const [editalVerticalizado, setEditalVerticalizado] = useState(null)
  const [editalVerticalizadoBase, setEditalVerticalizadoBase] = useState(null) // Dados base do curso (sem progresso)
  const [userProgress, setUserProgress] = useState(null) // Progresso individual do usuário
  const [loading, setLoading] = useState(true)
  const [courseId, setCourseId] = useState(null)
  const [courseName, setCourseName] = useState('')
  const [coursePrice, setCoursePrice] = useState(null)
  const [highlightedDisciplina, setHighlightedDisciplina] = useState(null)
  const [highlightedTopico, setHighlightedTopico] = useState(null)
  
  // Estados para edição de tópicos
  const [editingTopico, setEditingTopico] = useState(null)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editNome, setEditNome] = useState('')
  const [editNumero, setEditNumero] = useState('')
  const [editLoading, setEditLoading] = useState(false)

  // Estados para geração de flashcards
  const [generatingFlashcards, setGeneratingFlashcards] = useState(false)
  const [flashcardsModalOpen, setFlashcardsModalOpen] = useState(false)
  const [generationStatus, setGenerationStatus] = useState('')
  const [existingFlashcards, setExistingFlashcards] = useState(null)

  // Estados para adicionar/apagar disciplinas e tópicos
  const [addingDisciplina, setAddingDisciplina] = useState(false)
  const [addingTopico, setAddingTopico] = useState(null) // { disciplinaIdx }
  const [newDisciplinaNome, setNewDisciplinaNome] = useState('')
  const [newTopicoNome, setNewTopicoNome] = useState('')
  const [newTopicoNumero, setNewTopicoNumero] = useState('')

  const [searchQuery, setSearchQuery] = useState('')
  const [expandedDisciplinas, setExpandedDisciplinas] = useState(new Set())
  const [topicPublishMap, setTopicPublishMap] = useState({})
  const [publishingTopicKey, setPublishingTopicKey] = useState(null)
  const [disciplinaIncidenciaMap, setDisciplinaIncidenciaMap] = useState({})
  const [publishingDisciplinaIdx, setPublishingDisciplinaIdx] = useState(null)

  const expandedStorageKey = useMemo(
    () => `edital-expanded-disciplinas-${courseId || 'default'}`,
    [courseId]
  )

  const ownsCourse = hasPurchasedCourse(profile, courseId)
  const freeTopicKeys = useMemo(
    () => (profile?.uid && editalVerticalizadoBase ? getFreeTopicKeys(editalVerticalizadoBase, profile.uid, courseId) : []),
    [profile?.uid, editalVerticalizadoBase, courseId]
  )

  const normalizedSearch = searchQuery.trim().toLowerCase()

  const editalStats = useMemo(() => {
    const disciplinas = editalVerticalizado?.disciplinas?.filter((d) => d?.nome) || []
    const totalTopicos = disciplinas.reduce((sum, d) => sum + (d.topicos?.length || 0), 0)
    const estudados = disciplinas.reduce(
      (sum, d) => sum + (d.topicos?.filter((t) => t?.estudado)?.length || 0),
      0
    )
    return {
      disciplinas: disciplinas.length,
      totalTopicos,
      estudados,
      pct: totalTopicos ? Math.round((estudados / totalTopicos) * 100) : 0,
    }
  }, [editalVerticalizado])

  const filteredDisciplinas = useMemo(() => {
    if (!editalVerticalizado?.disciplinas) return []
    const valid = editalVerticalizado.disciplinas
      .map((disciplina, originalIdx) => ({ disciplina, originalIdx }))
      .filter(({ disciplina }) => disciplina && disciplina.nome)

    if (!normalizedSearch) {
      return valid.map(({ disciplina, originalIdx }) => ({
        disciplina,
        originalIdx,
        topicos: (disciplina.topicos || [])
          .map((topico, topicoIdx) => ({ topico, topicoIdx }))
          .filter(({ topico }) => topico && (topico.nome || topico.numero)),
      }))
    }

    return valid
      .map(({ disciplina, originalIdx }) => {
        const disciplinaMatch = (disciplina.nome || '').toLowerCase().includes(normalizedSearch)
        const topicosFiltrados = (disciplina.topicos || [])
          .map((topico, topicoIdx) => ({ topico, topicoIdx }))
          .filter(({ topico }) => {
            if (!topico || (!topico.nome && !topico.numero)) return false
            const nome = (topico.nome || '').toLowerCase()
            const numero = (topico.numero || '').toString().toLowerCase()
            return nome.includes(normalizedSearch) || numero.includes(normalizedSearch)
          })

        if (disciplinaMatch) {
          return {
            disciplina,
            originalIdx,
            topicos: (disciplina.topicos || [])
              .map((topico, topicoIdx) => ({ topico, topicoIdx }))
              .filter(({ topico }) => topico && (topico.nome || topico.numero)),
          }
        }
        if (topicosFiltrados.length > 0) {
          return { disciplina, originalIdx, topicos: topicosFiltrados }
        }
        return null
      })
      .filter(Boolean)
  }, [editalVerticalizado, normalizedSearch])

  const toggleDisciplina = useCallback((idx) => {
    setExpandedDisciplinas((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }, [])

  useEffect(() => {
    if (!courseId) return
    try {
      const saved = localStorage.getItem(expandedStorageKey)
      if (!saved) return
      const parsed = JSON.parse(saved)
      if (Array.isArray(parsed)) {
        setExpandedDisciplinas(new Set(parsed.filter((n) => Number.isInteger(n))))
      }
    } catch {
      /* ignore */
    }
  }, [courseId, expandedStorageKey])

  useEffect(() => {
    if (!courseId) return
    try {
      localStorage.setItem(expandedStorageKey, JSON.stringify([...expandedDisciplinas]))
    } catch {
      /* ignore */
    }
  }, [expandedDisciplinas, courseId, expandedStorageKey])

  const expandAllDisciplinas = useCallback(() => {
    if (!editalVerticalizado?.disciplinas) return
    setExpandedDisciplinas(
      new Set(
        editalVerticalizado.disciplinas
          .map((d, i) => (d?.nome ? i : null))
          .filter((i) => i !== null)
      )
    )
  }, [editalVerticalizado])

  const collapseAllDisciplinas = useCallback(() => {
    setExpandedDisciplinas(new Set())
  }, [])

  useEffect(() => {
    if (!normalizedSearch || filteredDisciplinas.length === 0) return
    setExpandedDisciplinas(new Set(filteredDisciplinas.map((item) => item.originalIdx)))
  }, [normalizedSearch, filteredDisciplinas])

  useEffect(() => {
    if (!highlightedDisciplina || !editalVerticalizado?.disciplinas) return
    const idx = editalVerticalizado.disciplinas.findIndex(
      (disc) =>
        (disc.nome || '').toLowerCase().includes(highlightedDisciplina.toLowerCase()) ||
        highlightedDisciplina.toLowerCase().includes((disc.nome || '').toLowerCase())
    )
    if (idx >= 0) {
      setExpandedDisciplinas((prev) => new Set([...prev, idx]))
    }
  }, [highlightedDisciplina, editalVerticalizado])

  // Determinar courseId e destacar disciplina/tópico se vier dos links
  useEffect(() => {
    const courseFromUrl = searchParams.get('course')
    const courseFromProfile = profile?.selectedCourseId
    
    const finalCourseId = courseFromUrl || courseFromProfile || 'alego-default'
    setCourseId(finalCourseId)
    
    // Verificar se há parâmetros de disciplina/tópico para destacar
    const disciplinaParam = searchParams.get('disciplina')
    const topicoParam = searchParams.get('topico')
    
    if (disciplinaParam) {
      setHighlightedDisciplina(decodeURIComponent(disciplinaParam))
    }
    if (topicoParam) {
      setHighlightedTopico(decodeURIComponent(topicoParam))
    }
  }, [searchParams, profile])

  // Scroll para o tópico destacado quando o edital carregar
  useEffect(() => {
    if (highlightedTopico && editalVerticalizado && !loading) {
      setTimeout(() => {
        // Primeiro, tentar encontrar pela disciplina destacada
        if (highlightedDisciplina && editalVerticalizado.disciplinas) {
          const disciplinaIndex = editalVerticalizado.disciplinas.findIndex(
            (disc) => (disc.nome || '').toLowerCase().includes(highlightedDisciplina.toLowerCase()) ||
                      highlightedDisciplina.toLowerCase().includes((disc.nome || '').toLowerCase())
          )
          
          if (disciplinaIndex >= 0 && editalVerticalizado.disciplinas[disciplinaIndex].topicos) {
            // Procurar o tópico dentro da disciplina encontrada
            const topicoIndex = editalVerticalizado.disciplinas[disciplinaIndex].topicos.findIndex(
              (topico) => {
                const topicoNome = (topico.nome || '').toLowerCase().trim()
                const topicoNumero = (topico.numero || '').toString().toLowerCase().trim()
                const highlighted = highlightedTopico.toLowerCase().trim()
                return topicoNome === highlighted || 
                       topicoNome.includes(highlighted) || 
                       highlighted.includes(topicoNome) ||
                       topicoNumero === highlighted
              }
            )
            
            if (topicoIndex >= 0) {
              const rowId = `topico-${disciplinaIndex}-${topicoIndex}`
              const row = document.getElementById(rowId)
              if (row) {
                row.scrollIntoView({ behavior: 'smooth', block: 'center' })
                return
              }
            }
          }
        }
        
        // Fallback: procurar em todas as linhas
        const allRows = document.querySelectorAll('[id^="topico-"]')
        for (const row of allRows) {
          const rowText = row.textContent || ''
          const highlighted = highlightedTopico.toLowerCase().trim()
          if (rowText.toLowerCase().includes(highlighted) || highlighted.includes(rowText.toLowerCase().substring(0, 50))) {
            row.scrollIntoView({ behavior: 'smooth', block: 'center' })
            break
          }
        }
      }, 1000)
    }
  }, [highlightedTopico, highlightedDisciplina, editalVerticalizado, loading])

  // Carregar nome do curso
  useEffect(() => {
    if (!courseId) return

    const loadCourseName = async () => {
      try {
        const courseDoc = await getDoc(doc(db, 'courses', courseId))
        if (courseDoc.exists()) {
          const data = courseDoc.data()
          setCourseName(data.name || data.competition || '')
          setCoursePrice(data.price ?? null)
        }
      } catch (err) {
        console.error('Erro ao carregar nome do curso:', err)
      }
    }

    loadCourseName()
  }, [courseId])

  // Carregar edital verticalizado
  useEffect(() => {
    if (!courseId) {
      console.log('❌ EditalVerticalizado: courseId está vazio')
      setLoading(false)
      return
    }

    console.log('🎯 EditalVerticalizado: Iniciando carregamento para courseId:', courseId)

    const editalRef = doc(db, 'courses', courseId, 'editalVerticalizado', 'principal')
    
    const loadEditalCompleto = async () => {
      try {
        console.log('📋 EditalVerticalizado: Carregando edital do courseId:', courseId)
        const snapshot = await getDoc(editalRef)
        if (!snapshot.exists()) {
          console.log('❌ EditalVerticalizado: Documento não encontrado')
          setEditalVerticalizado(null)
          setLoading(false)
          return
        }
        
        const data = snapshot.data()
        console.log('📊 EditalVerticalizado: Dados carregados:', {
          temPartes: data.temPartes,
          totalPartes: data.totalPartes,
          disciplinasPrincipais: data.disciplinas?.length || 0
        })
        
        // Verificar se o edital está dividido em partes
        if (data.temPartes && data.totalPartes > 1) {
          console.log('📦 EditalVerticalizado: Carregando edital dividido em partes...')
          
          // Carregar todas as partes
          const partesRef = collection(db, 'courses', courseId, 'editalVerticalizado', 'principal', 'partes')
          const partesSnapshot = await getDocs(query(partesRef, orderBy('parte')))
          
          const todasDisciplinas = [...(data.disciplinas || [])]
          
          partesSnapshot.forEach((doc) => {
            const parteData = doc.data()
            if (parteData.disciplinas && Array.isArray(parteData.disciplinas)) {
              todasDisciplinas.push(...parteData.disciplinas)
              console.log(`📋 Parte ${parteData.parte}: ${parteData.disciplinas.length} disciplinas`)
            }
          })
          
          // Combinar todas as disciplinas
          const editalCompleto = {
            ...data,
            disciplinas: todasDisciplinas,
          }
          
          const totalDisciplinas = todasDisciplinas.length
          const totalTopicos = todasDisciplinas.reduce((sum, d) => sum + (d.topicos?.length || 0), 0)
          console.log(`✅ EditalVerticalizado: Carregado com sucesso - ${totalDisciplinas} disciplinas, ${totalTopicos} tópicos`)
          
          setEditalVerticalizadoBase(editalCompleto)
          // Carregar progresso individual do usuário
          await loadUserProgress(editalCompleto)
        } else {
          // Edital normal (não dividido)
          console.log('📋 EditalVerticalizado: Carregando edital normal...')
          const jsonString = JSON.stringify(data)
          const sizeMB = (new Blob([jsonString]).size / 1024 / 1024).toFixed(2)
          console.log(`📊 EditalVerticalizado: Edital normal (${sizeMB} MB)`)
          
          const totalDisciplinas = data.disciplinas?.length || 0
          const totalTopicos = data.disciplinas?.reduce((sum, d) => sum + (d.topicos?.length || 0), 0) || 0
          console.log(`✅ EditalVerticalizado: Carregado com sucesso - ${totalDisciplinas} disciplinas, ${totalTopicos} tópicos`)
          
          setEditalVerticalizadoBase(data)
          // Carregar progresso individual do usuário
          await loadUserProgress(data)
        }
        
        setLoading(false)
      } catch (error) {
        console.error('Erro ao carregar edital verticalizado:', error)
        setEditalVerticalizado(null)
        setLoading(false)
      }
    }
    
    // Carregar uma vez
    loadEditalCompleto()
    
    // Escutar mudanças
    const unsub = onSnapshot(
      editalRef,
      async (snapshot) => {
        console.log('🔄 EditalVerticalizado: Mudança detectada no Firestore')
        if (snapshot.exists()) {
          console.log('📋 EditalVerticalizado: Documento existe, recarregando...')
          
          // Forçar atualização limpando o estado primeiro
          setEditalVerticalizado(null)
          setLoading(true)
          
          // Pequeno delay para garantir que o estado seja limpo
          setTimeout(async () => {
            await loadEditalCompleto()
          }, 100)
        } else {
          console.log('❌ EditalVerticalizado: Documento não existe')
          setEditalVerticalizado(null)
          setLoading(false)
        }
      },
      (error) => {
        console.error('Erro ao escutar mudanças no edital:', error)
      }
    )

    return () => unsub()
  }, [courseId])

  useEffect(() => {
    if (!courseId) return () => {}

    const resolvedId = courseId || 'alego-default'
    const unsubscribe = onSnapshot(
      collection(db, 'courses', resolvedId, 'topicoStatus'),
      (snapshot) => {
        setTopicPublishMap(buildTopicoPublishMapFromSnapshot(snapshot))
      },
      (err) => console.error('Erro ao carregar status dos tópicos:', err),
    )

    return () => unsubscribe()
  }, [courseId])

  useEffect(() => {
    if (!courseId) return
    getDocs(collection(db, 'courses', courseId || 'alego-default', 'conteudosIncidencia'))
      .then((snap) => {
        const map = {}
        snap.docs.forEach((d) => {
          map[d.id] = d.data().status || CONTENT_STATUS.UNAVAILABLE
        })
        setDisciplinaIncidenciaMap(map)
      })
      .catch((err) => console.error('Erro ao carregar incidência das disciplinas:', err))
  }, [courseId, editalVerticalizado])

  const handleToggleTopicoPublish = async (topicKey, disciplinaNome, moduloLabel) => {
    if (!isAdmin || !courseId || !topicKey || publishingTopicKey) return

    const current = resolveTopicPublishStatus(topicPublishMap, topicKey)
    const next = toggleTopicoPublishStatus(current)
    const actionLabel = next === CONTENT_STATUS.AVAILABLE ? 'liberar' : 'bloquear'

    const incidenciaNote = disciplinaNome
      ? `\n\nInclui também conteúdo de revisão por incidência, questões e matéria revisada de "${disciplinaNome}".`
      : ''

    if (
      !window.confirm(
        `${next === CONTENT_STATUS.AVAILABLE ? 'Liberar' : 'Bloquear'} todos os recursos deste tópico (flashcards, estudar, questões preditivas e revisão por incidência)?${incidenciaNote}\n\nNão é necessário clicar em "Disponibilizar" em cada tela — tudo será atualizado automaticamente.`
      )
    ) {
      return
    }

    setPublishingTopicKey(topicKey)
    try {
      const result = await setTopicoPublishStatus(courseId, topicKey, next, {
        disciplinaNome,
        moduloLabel,
      })
      setTopicPublishMap((prev) => ({ ...prev, [topicKey]: next }))
      const parts = []
      if (result.flashcards) parts.push(`${result.flashcards} flashcards`)
      if (result.questoes) parts.push(`${result.questoes} níveis de questões preditivas`)
      if (result.conteudo) parts.push('material de apoio')
      if (result.incidencia) parts.push(`${result.incidencia} itens de incidência`)
      if (result.materiasRevisadas) parts.push(`${result.materiasRevisadas} matéria(s) revisada(s)`)
      const detail = parts.length
        ? `\n\nAtualizado: ${parts.join(', ')}.`
        : '\n\nNenhum conteúdo gerado encontrado ainda para este tópico.'
      alert(next === CONTENT_STATUS.AVAILABLE ? `✅ Tópico liberado!${detail}` : `🔒 Tópico bloqueado!${detail}`)
    } catch (err) {
      console.error(err)
      alert(`Erro ao ${actionLabel} tópico: ${err.message}`)
    } finally {
      setPublishingTopicKey(null)
    }
  }

  const handleToggleDisciplinaIncidencia = async (disciplinaIdx, disciplinaNome) => {
    if (!isAdmin || !courseId || publishingDisciplinaIdx !== null) return

    const discKey = sanitizeDisciplinaName(disciplinaNome)
    const current = disciplinaIncidenciaMap[discKey] || CONTENT_STATUS.UNAVAILABLE
    const next = toggleTopicoPublishStatus(current)
    const actionLabel = next === CONTENT_STATUS.AVAILABLE ? 'liberar' : 'bloquear'

    if (
      !window.confirm(
        `${next === CONTENT_STATUS.AVAILABLE ? 'Liberar' : 'Bloquear'} conteúdo de revisão por incidência, questões e matéria revisada de "${disciplinaNome}"?`
      )
    ) {
      return
    }

    setPublishingDisciplinaIdx(disciplinaIdx)
    try {
      const result = await setDisciplinaIncidenciaPublishStatus(courseId, disciplinaNome, next)
      setDisciplinaIncidenciaMap((prev) => ({ ...prev, [discKey]: next }))
      const parts = []
      if (result.conteudoIncidencia) parts.push('conteúdo de incidência')
      if (result.questoesIncidencia) parts.push(`${result.questoesIncidencia} níveis de questões`)
      if (result.materiasRevisadas) parts.push(`${result.materiasRevisadas} matéria(s) revisada(s)`)
      const detail = parts.length ? `\n\nAtualizado: ${parts.join(', ')}.` : '\n\nNenhum conteúdo gerado encontrado.'
      alert(next === CONTENT_STATUS.AVAILABLE ? `✅ Disciplina liberada!${detail}` : `🔒 Disciplina bloqueada!${detail}`)
    } catch (err) {
      console.error(err)
      alert(`Erro ao ${actionLabel} incidência: ${err.message}`)
    } finally {
      setPublishingDisciplinaIdx(null)
    }
  }

  // Função para carregar progresso individual do usuário
  const loadUserProgress = async (editalBase) => {
    if (!user || !courseId || !editalBase?.disciplinas) return
    
    try {
      console.log('👤 Carregando progresso individual do usuário:', user.uid)
      
      // Carregar progresso do usuário
      const userProgressRef = doc(db, 'userEditalProgress', user.uid, 'courses', courseId)
      const userProgressDoc = await getDoc(userProgressRef)
      
      let userProgressData = {}
      if (userProgressDoc.exists()) {
        userProgressData = userProgressDoc.data().progress || {}
        console.log('📊 Progresso do usuário carregado:', Object.keys(userProgressData).length, 'tópicos')
      }
      
      // Combinar dados base com progresso individual
      const editalComProgresso = {
        ...editalBase,
        disciplinas: editalBase.disciplinas.map(disciplina => ({
          ...disciplina,
          topicos: disciplina.topicos.map(topico => {
            const topicKey = makeTopicKey(topico)
            const progressoTopico = userProgressData[topicKey] || {}
            
            return {
              ...topico,
              flashcards: progressoTopico.flashcards || false,
              questoes: progressoTopico.questoes || false,
              estudado: progressoTopico.estudado || false
            }
          })
        }))
      }
      
      setEditalVerticalizado(editalComProgresso)
      setUserProgress(userProgressData)
      
    } catch (error) {
      console.error('Erro ao carregar progresso do usuário:', error)
      // Em caso de erro, usar apenas os dados base
      setEditalVerticalizado(editalBase)
    }
  }

  // Função para salvar progresso individual do usuário
  const saveUserProgress = async (disciplinaIdx, topicoIdx, campo, novoValor) => {
    if (!user || !courseId || !editalVerticalizadoBase?.disciplinas) return
    
    try {
      const topico = editalVerticalizadoBase.disciplinas[disciplinaIdx].topicos[topicoIdx]
      const topicKey = makeTopicKey(topico)
      
      // Referência ao documento de progresso do usuário
      const userProgressRef = doc(db, 'userEditalProgress', user.uid, 'courses', courseId)
      
      // Carregar progresso atual
      const userProgressDoc = await getDoc(userProgressRef)
      let progressData = {}
      
      if (userProgressDoc.exists()) {
        progressData = userProgressDoc.data().progress || {}
      }
      
      // Atualizar progresso do tópico específico
      if (!progressData[topicKey]) {
        progressData[topicKey] = {}
      }
      
      progressData[topicKey][campo] = novoValor
      
      // Salvar no Firestore
      await setDoc(userProgressRef, {
        userId: user.uid,
        courseId: courseId,
        progress: progressData,
        updatedAt: serverTimestamp()
      }, { merge: true })
      
      console.log('✅ Progresso individual salvo:', { topicKey, campo, novoValor })
      
      // Atualizar estado local
      setUserProgress(progressData)
      
    } catch (error) {
      console.error('Erro ao salvar progresso do usuário:', error)
      throw error
    }
  }

  // Função para atualizar checkbox do tópico
  const handleToggleCheckbox = async (disciplinaIdx, topicoIdx, campo) => {
    if (!courseId || !editalVerticalizado?.disciplinas || !user) return

    try {
      const disciplinas = [...editalVerticalizado.disciplinas]
      const topico = disciplinas[disciplinaIdx].topicos[topicoIdx]
      const disciplina = disciplinas[disciplinaIdx]
      
      // Alternar o valor do checkbox
      const novoValor = !topico[campo]
      
      // Salvar progresso individual do usuário
      await saveUserProgress(disciplinaIdx, topicoIdx, campo, novoValor)
      
      // Atualizar estado local imediatamente
      disciplinas[disciplinaIdx].topicos[topicoIdx] = {
        ...topico,
        [campo]: novoValor
      }
      setEditalVerticalizado({
        ...editalVerticalizado,
        disciplinas: disciplinas
      })

      // 🔥 NOVO: Registrar matéria no calendário se checkbox "estudado" for marcado
      if (campo === 'estudado' && novoValor) {
        try {
          const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD
          const courseKey = courseId || 'alego'
          const progressDoc = doc(db, 'progress', `${user.uid}_${courseKey}_${today}`)
          
          // 🔥 DEBUG: Mostrar dados que estão sendo salvos
          console.log('📅 EditalVerticalizado - Salvando matéria:', {
            today,
            courseKey,
            materia: disciplina.nome,
            userId: user.uid
          })
          
          // Verificar se já existe registro para hoje
          const { getDoc } = await import('firebase/firestore')
          const existing = await getDoc(progressDoc)
          
          if (existing.exists()) {
            // Atualizar registro existente para adicionar matéria
            await setDoc(progressDoc, {
              ...existing.data(),
              materia: disciplina.nome, // Adicionar/atualizar matéria
              lastUpdated: new Date().toTimeString(),
            }, { merge: true })
            console.log('📅 EditalVerticalizado - Matéria atualizada no calendário:', disciplina.nome)
          } else {
            // Criar novo registro
            await setDoc(progressDoc, {
              uid: user.uid,
              date: today,
              hours: 0.1, // Mínimo para aparecer no calendário
              courseId: courseId || null,
              materia: disciplina.nome, // Adicionar matéria estudada
              lastUpdated: new Date().toTimeString(),
            })
            console.log('📅 EditalVerticalizado - Matéria criada no calendário:', disciplina.nome)
          }
          
          console.log('✅ Matéria registrada no calendário:', disciplina.nome)
        } catch (calendarError) {
          console.error('Erro ao registrar matéria no calendário:', calendarError)
        }
      }

      // Verificar se todas as 3 caixas foram marcadas (flashcards, questões, estudado)
      // Usar o novo valor atualizado para verificar
      const flashcardsMarcado = campo === 'flashcards' ? novoValor : topico.flashcards
      const questoesMarcado = campo === 'questoes' ? novoValor : topico.questoes
      const estudadoMarcado = campo === 'estudado' ? novoValor : topico.estudado
      const todasMarcadas = flashcardsMarcado && questoesMarcado && estudadoMarcado
      
      if (todasMarcadas) {
          // Salvar progresso do tópico estudado hoje
          const today = dayjs().format('YYYY-MM-DD')
          const topicKey = makeTopicKey(topico)
          const progressKey = `${user.uid}_${courseId}_${today}_${topicKey}`
          
          const progressRef = doc(db, 'editalProgress', progressKey)
          await setDoc(progressRef, {
            userId: user.uid,
            courseId: courseId,
            date: today,
            disciplina: disciplina.nome,
            topico: topico.nome || topico.numero,
            topicKey: topicKey,
            flashcards: true,
            questoes: true,
            estudado: true,
            completedAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          }, { merge: true })
        }
    } catch (error) {
      console.error('Erro ao atualizar checkbox:', error)
    }
  }

  // Função para apagar conteúdo específico de um tópico
  const handleDeleteTopicContent = async (topicKey) => {
    if (!courseId || !topicKey) return
    if (!window.confirm(`⚠️ ATENÇÃO: Isso vai apagar o CONTEÚDO e as QUESTÕES gerados para este tópico.\n\nEsta ação não pode ser desfeita. Deseja continuar?`)) {
      return
    }

    try {
      // Sanitizar o topicKey para usar como ID de documento no Firestore (mesma lógica do ConteudoCompletoTopicoView)
      let decoded = topicKey
      try {
        decoded = decodeURIComponent(topicKey)
      } catch (e) {
        decoded = topicKey
      }
      
      let sanitizedKey = decoded
        .replace(/::/g, '_DOUBLECOLON_')
        .replace(/\//g, '_SLASH_')
        .replace(/\\/g, '_BACKSLASH_')
        .trim()
      
      // Limitar tamanho
      if (sanitizedKey.length > 400) {
        sanitizedKey = sanitizedKey.substring(0, 400)
      }

      console.log('🗑️ Tentando apagar conteúdo e questões:', {
        courseId,
        topicKey,
        decoded,
        sanitizedKey,
        path: `courses/${courseId}/conteudosCompletos/${sanitizedKey}`
      })

      // Apagar conteúdo completo
      const contentRef = doc(db, 'courses', courseId, 'conteudosCompletos', sanitizedKey)
      await deleteDoc(contentRef)
      console.log('✅ Conteúdo apagado com sucesso!')

      // Apagar questões do tópico (questoesTopico)
      const questoesTopicoRef = doc(db, 'courses', courseId, 'questoesTopico', sanitizedKey)
      await deleteDoc(questoesTopicoRef)
      console.log('✅ Questões do tópico apagadas com sucesso!')

      // Apagar questões na coleção questoes que correspondem ao topicKey
      const questoesRef = collection(db, 'courses', courseId, 'questoes')
      const questoesQuery = query(questoesRef, where('topicKey', '==', topicKey))
      const questoesSnapshot = await getDocs(questoesQuery)
      
      if (!questoesSnapshot.empty) {
        const batch = writeBatch(db)
        questoesSnapshot.forEach((doc) => {
          batch.delete(doc.ref)
        })
        await batch.commit()
        console.log(`✅ ${questoesSnapshot.size} questões apagadas da coleção questoes`)
      }
      
      alert('✅ Conteúdo e questões apagados com sucesso!')
    } catch (error) {
      console.error('❌ Erro ao apagar conteúdo/questões:', error)
      alert('❌ Erro ao apagar: ' + (error.message || 'Erro desconhecido'))
    }
  }

  // Função para abrir modal de edição de tópico
  const handleEditTopico = (disciplinaIdx, topicoIdx) => {
    const topico = editalVerticalizado.disciplinas[disciplinaIdx].topicos[topicoIdx]
    setEditingTopico({ disciplinaIdx, topicoIdx })
    setEditNome(topico.nome || '')
    setEditNumero(topico.numero || '')
    setEditModalOpen(true)
  }

  // Função para salvar alterações do tópico
  const handleSaveTopico = async () => {
    if (!editingTopico || !courseId || !editalVerticalizadoBase) return

    try {
      setEditLoading(true)
      
      // Atualizar apenas os dados base (não o progresso)
      const disciplinasBase = [...editalVerticalizadoBase.disciplinas]
      
      // Atualizar o tópico nos dados base
      disciplinasBase[editingTopico.disciplinaIdx].topicos[editingTopico.topicoIdx] = {
        ...disciplinasBase[editingTopico.disciplinaIdx].topicos[editingTopico.topicoIdx],
        nome: editNome.trim(),
        numero: editNumero.trim()
      }

      // Atualizar no Firestore (apenas dados base)
      const editalRef = doc(db, 'courses', courseId, 'editalVerticalizado', 'principal')
      await updateDoc(editalRef, {
        disciplinas: disciplinasBase
      })

      // Atualizar estado base
      const novoEditalBase = {
        ...editalVerticalizadoBase,
        disciplinas: disciplinasBase
      }
      setEditalVerticalizadoBase(novoEditalBase)

      // Recarregar progresso do usuário com os novos dados base
      await loadUserProgress(novoEditalBase)

      // Fechar modal
      setEditModalOpen(false)
      setEditingTopico(null)
      setEditNome('')
      setEditNumero('')
    } catch (error) {
      console.error('Erro ao salvar tópico:', error)
    } finally {
      setEditLoading(false)
    }
  }

  // Função para cancelar edição
  const handleCancelEdit = () => {
    setEditModalOpen(false)
    setEditingTopico(null)
    setEditNome('')
    setEditNumero('')
  }

  // Função para verificar flashcards existentes
  const checkExistingFlashcards = async () => {
    if (!courseId || !editalVerticalizadoBase?.disciplinas) return

    try {
      const flashcardsRef = collection(db, 'courses', courseId, 'flashcards')
      const flashcardsSnapshot = await getDocs(flashcardsRef)
      const existing = []
      
      flashcardsSnapshot.forEach(doc => {
        existing.push({
          id: doc.id,
          ...doc.data()
        })
      })
      
      setExistingFlashcards(existing)
    } catch (error) {
      console.error('Erro ao verificar flashcards existentes:', error)
    }
  }

  // Função para gerar flashcards baseada na estrutura do edital (sempre apaga existentes)
  const generateFlashcardsFromEdital = async () => {
    if (!courseId || !editalVerticalizadoBase?.disciplinas) return

    setGeneratingFlashcards(true)
    setGenerationStatus('Preparando estrutura do edital...')
    
    try {
      // Preparar estrutura do edital para a IA
      const editalStructure = {
        curso: courseName,
        disciplinas: editalVerticalizadoBase.disciplinas.map(disciplina => ({
          nome: disciplina.nome,
          topicos: disciplina.topicos?.map(topico => ({
            numero: topico.numero,
            nome: topico.nome
          })) || []
        }))
      }
      
      setGenerationStatus(`Estrutura preparada: ${editalStructure.disciplinas.length} disciplinas, ${editalStructure.disciplinas.reduce((sum, d) => sum + d.topicos.length, 0)} tópicos...`)

      // Prompt para a IA gerar flashcards idênticos à estrutura
      const prompt = `Gere flashcards educacionais e didáticos para cada tópico do edital abaixo.

ESTRUTURA DO EDITAL:
${JSON.stringify(editalStructure, null, 2)}

🚨 INSTRUÇÃO CRÍTICA - CONTEÚDO ATUALIZADO:
VOCÊ ESTÁ GERANDO CONTEÚDO AGORA, NA DATA ATUAL: ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
- PENSE: "Vou gerar agora de acordo com atualizações verídicas da data atual (${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })})"
- USE APENAS INFORMAÇÕES ATUALIZADAS E VIGENTES ATÉ ESTA DATA
- VERIFIQUE SE HOUVE ALTERAÇÕES RECENTES NAS LEIS, DECRETOS OU NORMAS
- NÃO USE INFORMAÇÕES DESATUALIZADAS OU REVOGADAS
- CITE SEMPRE A DATA DE ATUALIZAÇÃO QUANDO NECESSÁRIO

📅 CRONOLOGIA TEMPORAL OBRIGATÓRIA:
- Para CADA lei, decreto ou norma mencionada nos flashcards, você DEVE traçar uma cronologia desde sua criação até a data atual
- Exemplo: "Lei X, criada em 01/01/2000, alterada em 15/03/2010 pela Lei Y, modificada em 20/06/2015 pelo Decreto Z, atualizada em 10/02/2020 pela Medida Provisória W, vigente até ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}"
- Liste TODAS as alterações relevantes: leis, decretos, medidas provisórias, emendas constitucionais, súmulas, jurisprudências
- Sempre indique a data de cada alteração e o instrumento que a causou
- Se a lei foi revogada, indique a data de revogação e o instrumento que a revogou
- Mantenha os flashcards atualizados considerando TODAS as alterações até a data atual

🚨 TRAVAS DE SEGURANÇA E FIDELIDADE JURÍDICA ABSOLUTA:

1. PROIBIÇÃO DE ALUCINAÇÃO LEGISLATIVA:
- Você está terminantemente proibido de inventar, supor ou estimar números de leis, decretos ou datas. Se não houver registro histórico exato e pacificado no ordenamento jurídico brasileiro de uma alteração, você NÃO deve mencioná-la.
- Nenhuma alteração futura hipotética deve ser criada. Toda e qualquer norma citada deve ter como lastro o portal do Planalto (Legislação Federal) ou os repositórios oficiais do STF/STJ.

2. FILTRO DE CONSTITUCIONALIDADE E RECEPÇÃO (CF/88):
- Para cada artigo ou código anterior a 1988 (como o CPP de 1941 ou o CP de 1940), você DEVE verificar se o dispositivo foi RECECIONADO ou NÃO pela Constituição Federal de 1988.
- É terminantemente proibido indicar como aplicável ou vigente um dispositivo legal que os Tribunais Superiores (STF/STJ) já declararam como não-recepcionado ou inconstitucional (Ex: Incomunicabilidade do preso do Art. 21 do CPP, prisão por dívida de depositário infiel, etc.). Você deve apontar o dispositivo e declarar imediatamente a sua ineficácia jurídica atual por incompatibilidade constitucional.

3. ALINHAMENTO OBRIGATÓRIO DE JURISPRUDÊNCIA PACIFICADA (STF/STJ):
- Toda análise legal deve confrontar a "letra fria da lei" com o entendimento atualizado das Súmulas Vinculantes, Súmulas do STF/STJ e os julgamentos de repercussão geral ou controle concentrado (ADIs, ADC, ADPFs).
- Se a eficácia de um artigo foi alterada, suspensa ou modelada por decisão definitiva do STF (como ocorreu no arquivamento do Art. 28 do CPP e no Juiz das Garantias), o texto DEVE refletir o procedimento determinado pelo Tribunal, e não a redação literal suspensa ou defasada que consta no código.

[TRAVA JURÍDICA CRÍTICA]: O modelo deve validar obrigatoriamente as inovações legislativas mais recentes (incluindo leis de 2025 e 2026), aplicando seus reflexos automáticos nos códigos e legislações pertinentes.

🧠 CHAIN OF THOUGHT COM AUTO-REFUTAÇÃO EMBUTIDA - OBRIGATÓRIO

[PROCESSO DE PENSAMENTO INTERNO - NÃO EXIBA ISSO NA SAÍDA FINAL]
Para cada flashcard que você criar, você DEVE seguir OBRIGATORIAMENTE este processo de pensamento interno ANTES de gerar o conteúdo:

1. FAÇA UM RASCUNHO MENTAL dos pontos principais da lei/norma solicitada
2. QUESTIONE-SE RIGOROSAMENTE: "Estou inventando algum número de lei para os anos de 2025/2026? Estou inventando algum artigo que não existe no código/norma?"
3. SE PERCEBER QUE ESTÁ PRESTES A CITAR UM NÚMERO DE LEI FICTÍCIO para conceitos reais, PARE, REMOVA o número inventado e cite apenas o conceito doutrinário/jurisprudencial correto ou mencione que está em debate/reforma legislativa real, SEM INVENTAR DADOS
4. GARANTA QUE NÃO OMITIU alterações reais e históricas importantes
5. VERIFIQUE: "Esta lei/artigo foi recepcionado pela CF/88? Foi declarado inconstitucional pelo STF?"
6. VERIFIQUE: "A jurisprudência citada está atualizada? Houve alguma decisão recente do STF/STJ que alterou o entendimento?"
7. AUDITE-SE: "Todas as datas e números de leis citados são historicamente exatos e verificáveis?"

SÓ DEPOIS DE CONCLUIR ESTE PROCESSO DE VERIFICAÇÃO INTERNA, PROSSIGA PARA A GERAÇÃO DO FLASHCARD.

[DIRETRIZES DE SAÍDA - O QUE EXIBIR]
Gere flashcards educacionais e didáticos com:
- Perguntas específicas e técnicas
- Respostas detalhadas e explicativas
- Conteúdo fundamentado estritamente na lei real vigente
- Se você não tiver certeza absoluta de um número de lei recente, cite o conceito técnico sem inventar o número do decreto

INSTRUÇÕES:
1. Gere os flashcards seguindo a estrutura acima - disciplina por disciplina, tópico por tópico
2. Para CADA tópico, gere NO MÍNIMO 50 flashcards e ATÉ 100 flashcards para cobrir completamente o conteúdo específico
3. O MÍNIMO OBRIGATÓRIO é 50 flashcards por tópico - não gere menos que isso
4. Se o tópico for extenso, gere até 100 flashcards para cobertura completa
5. Os flashcards devem ser educacionais, didáticos e focados no aprendizado
6. Formato JSON:
{
  "flashcards": [
    {
      "disciplina": "nome da disciplina",
      "topico": "nome do tópico",
      "topicoNumero": "número do tópico",
      "frente": "pergunta ou conceito claro",
      "verso": "resposta detalhada e explicativa",
      "dificuldade": "fácil|médio|difícil"
    }
  ]
}

REGRAS IMPORTANTES:
- Mantenha EXATAMENTE a mesma estrutura de disciplinas e tópicos
- Cada flashcard deve referenciar sua disciplina e tópico corretamente
- Seja claro e objetivo na frente, detalhado no verso
- Adapte o conteúdo para estudo e memorização
- Não invente disciplinas ou tópicos que não existem na estrutura
- Use linguagem formal e educacional
- FOCE 100% NO CONTEÚDO EDUCACIONAL: flashcards que ENSINAM o conteúdo, como questões objetivas
- Estilo de questões objetivas: perguntas diretas e respostas claras e completas
- Garanta Cobertura completa
- Cada flashcard deve cobrir um tópico/conceito específico
- Perguntas devem ser diretas, objetivas e práticas sobre o CONTEÚDO
- Respostas devem explicar o CONTEÚDO de forma clara, educacional e completa
- NÃO mencione cargo ou banca repetidamente
- Use linguagem técnica e precisa, como em questões de concurso
- Não gere conteúdo genérico ou flashcards óbvios
- Gere conteúdos atualizados e relevantes para o concurso`

      setGenerationStatus('Gerando flashcards com IA…')

      const flashcardsData = await generateAiJson(prompt, {
        courseId: courseId || 'alego-default',
      })
      
      if (!flashcardsData.flashcards || !Array.isArray(flashcardsData.flashcards)) {
        console.error('Estrutura recebida:', flashcardsData)
        throw new Error('Formato de flashcards inválido - esperado array em flashcards')
      }

      setGenerationStatus(`Encontrados ${flashcardsData.flashcards.length} flashcards. Preparando para salvar...`)

      // Salvar flashcards no Firestore
      const batch = writeBatch(db)
      const flashcardsRef = collection(db, 'courses', courseId, 'flashcards')
      
      // SEMPRE apagar os flashcards existentes antes de gerar novos
      if (existingFlashcards?.length > 0) {
        setGenerationStatus(`Apagando ${existingFlashcards.length} flashcards existentes...`)
        existingFlashcards.forEach(flashcard => {
          const docRef = doc(db, 'courses', courseId, 'flashcards', flashcard.id)
          batch.delete(docRef)
        })
      }

      setGenerationStatus(`Salvando ${flashcardsData.flashcards.length} novos flashcards...`)
      
      // Adicionar novos flashcards
      flashcardsData.flashcards.forEach((flashcard, index) => {
        const docRef = doc(flashcardsRef)
        const disciplinaNome = flashcard.disciplina || ''
        const topicoNome = flashcard.topico || ''
        const topicoNumero = flashcard.topicoNumero || ''
        const topicKey = makeTopicKey({ numero: topicoNumero, nome: topicoNome })
        const modulo = formatTopicoAsModulo({ numero: topicoNumero, nome: topicoNome })
        batch.set(docRef, {
          ...flashcard,
          materia: disciplinaNome,
          modulo,
          topicKey,
          pergunta: flashcard.frente || flashcard.pergunta || '',
          resposta: flashcard.verso || flashcard.resposta || '',
          shared: true,
          status: CONTENT_STATUS.UNAVAILABLE,
          userId: user.uid,
          courseId: courseId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          order: index,
        })
      })

      setGenerationStatus('Executando operação no banco de dados...')
      await batch.commit()
      
      setGenerationStatus(`✅ ${flashcardsData.flashcards.length} flashcards gerados com sucesso!`)
      
      // Atualizar lista de flashcards existentes
      await checkExistingFlashcards()
      
      // Fechar modal após 2 segundos
      setTimeout(() => {
        setFlashcardsModalOpen(false)
        setGenerationStatus('')
      }, 2000)

    } catch (error) {
      console.error('Erro ao gerar flashcards:', error)
      setGenerationStatus(`❌ Erro: ${error.message}`)
    } finally {
      setGeneratingFlashcards(false)
    }
  }

  // Abrir modal de flashcards
  const openFlashcardsModal = async () => {
    await checkExistingFlashcards()
    setFlashcardsModalOpen(true)
    setGenerationStatus('')
  }

  // Função para apagar disciplina
  const handleDeleteDisciplina = async (disciplinaIdx) => {
    if (!courseId || !editalVerticalizadoBase?.disciplinas) return

    if (!window.confirm('Tem certeza que deseja apagar esta disciplina e todos os seus tópicos?')) {
      return
    }

    try {
      const disciplinasBase = [...editalVerticalizadoBase.disciplinas]
      disciplinasBase.splice(disciplinaIdx, 1)

      const editalRef = doc(db, 'courses', courseId, 'editalVerticalizado', 'principal')
      await updateDoc(editalRef, {
        disciplinas: disciplinasBase
      })

      const novoEditalBase = {
        ...editalVerticalizadoBase,
        disciplinas: disciplinasBase
      }
      setEditalVerticalizadoBase(novoEditalBase)
      await loadUserProgress(novoEditalBase)
    } catch (error) {
      console.error('Erro ao apagar disciplina:', error)
    }
  }

  // Função para apagar tópico
  const handleDeleteTopico = async (disciplinaIdx, topicoIdx) => {
    if (!courseId || !editalVerticalizadoBase?.disciplinas) return

    if (!window.confirm('Tem certeza que deseja apagar este tópico?')) {
      return
    }

    try {
      const disciplinasBase = [...editalVerticalizadoBase.disciplinas]
      disciplinasBase[disciplinaIdx].topicos.splice(topicoIdx, 1)

      const editalRef = doc(db, 'courses', courseId, 'editalVerticalizado', 'principal')
      await updateDoc(editalRef, {
        disciplinas: disciplinasBase
      })

      const novoEditalBase = {
        ...editalVerticalizadoBase,
        disciplinas: disciplinasBase
      }
      setEditalVerticalizadoBase(novoEditalBase)
      await loadUserProgress(novoEditalBase)
    } catch (error) {
      console.error('Erro ao apagar tópico:', error)
    }
  }

  // Função para adicionar nova disciplina
  const handleAddDisciplina = async () => {
    if (!courseId || !editalVerticalizadoBase || !newDisciplinaNome.trim()) return

    try {
      const disciplinasBase = [...editalVerticalizadoBase.disciplinas]
      disciplinasBase.push({
        nome: newDisciplinaNome.trim(),
        topicos: []
      })

      const editalRef = doc(db, 'courses', courseId, 'editalVerticalizado', 'principal')
      await updateDoc(editalRef, {
        disciplinas: disciplinasBase
      })

      const novoEditalBase = {
        ...editalVerticalizadoBase,
        disciplinas: disciplinasBase
      }
      setEditalVerticalizadoBase(novoEditalBase)
      await loadUserProgress(novoEditalBase)

      setNewDisciplinaNome('')
      setAddingDisciplina(false)
    } catch (error) {
      console.error('Erro ao adicionar disciplina:', error)
    }
  }

  // Função para adicionar novo tópico
  const handleAddTopico = async (disciplinaIdx) => {
    if (!courseId || !editalVerticalizadoBase || !newTopicoNome.trim()) return

    try {
      const disciplinasBase = [...editalVerticalizadoBase.disciplinas]
      disciplinasBase[disciplinaIdx].topicos.push({
        nome: newTopicoNome.trim(),
        numero: newTopicoNumero.trim()
      })

      const editalRef = doc(db, 'courses', courseId, 'editalVerticalizado', 'principal')
      await updateDoc(editalRef, {
        disciplinas: disciplinasBase
      })

      const novoEditalBase = {
        ...editalVerticalizadoBase,
        disciplinas: disciplinasBase
      }
      setEditalVerticalizadoBase(novoEditalBase)
      await loadUserProgress(novoEditalBase)

      setNewTopicoNome('')
      setNewTopicoNumero('')
      setAddingTopico(null)
    } catch (error) {
      console.error('Erro ao adicionar tópico:', error)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-cp-accent border-t-transparent" />
          <p className="mt-4 font-mono text-sm text-cp-muted">Carregando edital...</p>
        </div>
      </div>
    )
  }

  if (!editalVerticalizado) {
    return (
      <div className="cp-card p-10 text-center">
        <DocumentTextIcon className="mx-auto mb-4 h-14 w-14 text-cp-muted" />
        <h2 className="text-xl font-medium text-cp-text">Edital não disponível</h2>
        <p className="mt-2 text-sm text-cp-muted">
          O edital verticalizado ainda não foi configurado para este curso.
        </p>
        <Link to="/dashboard" className="cp-btn-primary mt-6 inline-flex">
          Voltar ao Dashboard
        </Link>
      </div>
    )
  }

  const getTopicoNivelPadding = (topico) => {
    let nivel = topico.nivel || 0
    if (topico.numero && typeof topico.numero === 'string') {
      const partes = topico.numero.split('.').filter((p) => p.trim())
      nivel = Math.max(0, partes.length - 2)
    }
    return 12 + nivel * 14
  }

  const renderTopicoRow = (disciplina, disciplinaIdx, topico, topicoIdx) => {
    if (!topico) return null

    const topicKey = makeTopicKey(topico)
    const topicKeyParam = encodeURIComponent(normalizeTopicKeyForStorage(topicKey))
    const isHighlighted =
      highlightedTopico &&
      ((topico.nome || '').toLowerCase().includes(highlightedTopico.toLowerCase()) ||
        highlightedTopico.toLowerCase().includes((topico.nome || '').toLowerCase()))
    const moduloLabel = formatTopicoAsModulo(topico)
    const paddingLeft = getTopicoNivelPadding(topico)
    const publishStatus = resolveTopicPublishStatus(topicPublishMap, topicKey)
    const isPublished = publishStatus === CONTENT_STATUS.AVAILABLE
    const canUseTopic = canAccessTopicoContent({
      profile,
      courseId,
      topicKey,
      edital: editalVerticalizadoBase,
      publishStatus,
    })
    const isFreePreview = !ownsCourse && !isAdmin && isPublished && freeTopicKeys.some((k) => topicKeysMatch(k, topicKey))
    const isPublishing = publishingTopicKey === topicKey

    const topicLinkClass = (accent) =>
      canUseTopic || isAdmin
        ? accent
        : 'border-cp-border/60 bg-cp-surface/50 text-cp-muted/60 pointer-events-none opacity-60'

    return (
      <div
        key={`${disciplinaIdx}-${topicoIdx}`}
        id={`topico-${disciplinaIdx}-${topicoIdx}`}
        className={`group flex flex-col gap-2 px-4 py-3 transition sm:flex-row sm:items-center sm:gap-3 ${
          isHighlighted ? 'bg-cp-accent/10 ring-1 ring-inset ring-cp-accent/30' : 'hover:bg-cp-surface/50'
        }`}
        style={{ paddingLeft: `${Math.min(paddingLeft, 48)}px` }}
      >
        <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3 sm:items-center">
          <input
            type="checkbox"
            checked={!!topico.estudado}
            onChange={() => handleToggleCheckbox(disciplinaIdx, topicoIdx, 'estudado')}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-cp-border text-cp-accent focus:ring-cp-accent/40 sm:mt-0"
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm leading-snug text-cp-text">
              {topico.numero && (
                <span className="mr-2 font-mono text-xs text-cp-accent">{topico.numero}</span>
              )}
              <span className={topico.estudado ? 'text-cp-muted line-through' : ''}>{topico.nome || ''}</span>
              {isFreePreview && (
                <span className="ml-2 rounded bg-cp-accent/15 px-1.5 py-0.5 font-mono text-[9px] text-cp-accent">Grátis</span>
              )}
            </p>
          </div>
        </label>

        <div className="flex flex-wrap items-center gap-1.5 pl-7 sm:shrink-0 sm:pl-0">
          {!topicKey || topicKey.trim() === '' ? (
            <span className="rounded-lg border border-cp-border px-2 py-1 font-mono text-[10px] text-cp-muted">
              Sem ID
            </span>
          ) : (
            <>
              <Link
                to={`/flashcards/topico/${courseId || 'alego-default'}?disciplina=${encodeURIComponent(disciplina.nome || '')}&modulo=${encodeURIComponent(moduloLabel)}&topicKey=${topicKeyParam}`}
                className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1.5 font-mono text-[10px] transition ${topicLinkClass(
                  'border-cp-accent/25 bg-cp-accent/10 text-cp-accent hover:bg-cp-accent/20'
                )}`}
                title={canUseTopic || isAdmin ? 'Flashcards' : 'Aguarde o administrador liberar este tópico'}
                aria-disabled={!canUseTopic && !isAdmin}
                onClick={(e) => {
                  if (!canUseTopic && !isAdmin) e.preventDefault()
                }}
              >
                <SparklesIcon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Flash</span>
              </Link>
              <Link
                to={`/conteudo-completo/topic/${courseId || 'alego-default'}/${topicKey}?nome=${encodeURIComponent(topico.nome || '')}`}
                className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1.5 font-mono text-[10px] transition ${topicLinkClass(
                  'border-cp-border bg-cp-surface text-cp-text hover:border-cp-accent/30'
                )}`}
                title={canUseTopic || isAdmin ? 'Estudar conteúdo' : 'Aguarde o administrador liberar este tópico'}
                aria-disabled={!canUseTopic && !isAdmin}
                onClick={(e) => {
                  if (!canUseTopic && !isAdmin) e.preventDefault()
                }}
              >
                <BookOpenIcon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Estudar</span>
              </Link>
              <Link
                to={`/questoes-topic/${courseId || 'alego-default'}/${topicKey}?nome=${encodeURIComponent(topico.nome || '')}`}
                className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1.5 font-mono text-[10px] transition ${topicLinkClass(
                  'border-cp-accent2/25 bg-cp-accent2/10 text-cp-accent2 hover:bg-cp-accent2/20'
                )}`}
                title={canUseTopic || isAdmin ? 'Questões preditivas' : 'Questões ainda não liberadas pelo administrador'}
                aria-disabled={!canUseTopic && !isAdmin}
                onClick={(e) => {
                  if (!canUseTopic && !isAdmin) e.preventDefault()
                }}
              >
                <FireIcon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Questões</span>
              </Link>
              {isAdmin && (
                <>
                  <button
                    type="button"
                    onClick={() => handleToggleTopicoPublish(topicKey, disciplina.nome, moduloLabel)}
                    disabled={isPublishing}
                    className={`rounded-lg px-2.5 py-1.5 font-mono text-[10px] font-semibold transition disabled:opacity-50 ${
                      isPublished
                        ? 'border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                        : 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    }`}
                    title={isPublished ? 'Bloquear conteúdo do tópico' : 'Liberar conteúdo do tópico'}
                  >
                    {isPublishing ? '...' : isPublished ? 'Bloquear' : 'Liberar'}
                  </button>
                  <button
                    onClick={() => handleEditTopico(disciplinaIdx, topicoIdx)}
                    className="rounded-lg border border-cp-border p-1.5 text-cp-muted transition hover:border-cp-accent/30 hover:text-cp-accent"
                    title="Editar tópico"
                  >
                    <PencilIcon className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleDeleteTopico(disciplinaIdx, topicoIdx)}
                    className="rounded-lg border border-red-500/20 p-1.5 text-red-400/80 transition hover:bg-red-500/10"
                    title="Apagar tópico"
                  >
                    <TrashIcon className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleDeleteTopicContent(topicKey)}
                    className="rounded-lg border border-red-500/20 p-1.5 text-red-400/60 transition hover:bg-red-500/10"
                    title="Apagar conteúdo IA"
                  >
                    <XMarkIcon className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    )
  }

  const hasDisciplinas =
    editalVerticalizado?.disciplinas &&
    Array.isArray(editalVerticalizado.disciplinas) &&
    editalVerticalizado.disciplinas.length > 0

  const accentBorders = [
    'border-cp-accent/40 text-cp-accent',
    'border-cp-accent2/40 text-cp-accent2',
    'border-cp-accent3/40 text-cp-accent3',
    'border-cp-accent4/40 text-cp-accent4',
  ]

  return (
    <div className="space-y-6">
      {courseName && (
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-cp-muted">{courseName}</p>
      )}

      {!ownsCourse && !isAdmin && courseId && courseId !== 'alego-default' && (
        <div className="cp-card flex flex-col gap-3 border-cp-accent/25 bg-cp-accent/5 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-cp-text">Preview gratuito ativo</p>
            <p className="mt-1 text-xs text-cp-muted">
              Você tem acesso a {freeTopicKeys.length} tópicos liberados (flashcards, conteúdo e questões) e ao Guia Mentorado.
              Adquira o curso completo por {formatCoursePrice(coursePrice)}.
            </p>
          </div>
          <a
            href={buildWhatsAppCourseUrl(courseName)}
            target="_blank"
            rel="noopener noreferrer"
            className="cp-btn-primary shrink-0 !text-xs"
          >
            Comprar via WhatsApp
          </a>
        </div>
      )}

      {hasDisciplinas ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="cp-card p-4">
              <p className="font-mono text-[10px] uppercase tracking-wider text-cp-muted">Disciplinas</p>
              <p className="mt-1 text-2xl font-medium text-cp-text">{editalStats.disciplinas}</p>
            </div>
            <div className="cp-card p-4">
              <p className="font-mono text-[10px] uppercase tracking-wider text-cp-muted">Tópicos</p>
              <p className="mt-1 text-2xl font-medium text-cp-text">{editalStats.totalTopicos}</p>
            </div>
            <div className="cp-card p-4">
              <p className="font-mono text-[10px] uppercase tracking-wider text-cp-muted">Estudados</p>
              <p className="mt-1 text-2xl font-medium text-cp-accent">{editalStats.estudados}</p>
            </div>
            <div className="cp-card p-4">
              <p className="font-mono text-[10px] uppercase tracking-wider text-cp-muted">Progresso</p>
              <p className="mt-1 text-2xl font-medium text-cp-accent2">{editalStats.pct}%</p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-cp-border">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cp-accent to-cp-accent2 transition-all"
                  style={{ width: `${editalStats.pct}%` }}
                />
              </div>
            </div>
          </div>

          <div className="cp-card p-4 sm:p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="relative min-w-0 flex-1">
                <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cp-muted" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar disciplina ou tópico..."
                  className="w-full rounded-xl border border-cp-border bg-cp-bg/60 py-2.5 pl-10 pr-10 text-sm text-cp-text placeholder:text-cp-muted focus:border-cp-accent/40 focus:outline-none focus:ring-1 focus:ring-cp-accent/25"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-cp-muted transition hover:text-cp-text"
                    aria-label="Limpar busca"
                  >
                    <XMarkIcon className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={expandAllDisciplinas} className="cp-btn-ghost !px-3 !py-2 !text-xs">
                  Expandir tudo
                </button>
                <button type="button" onClick={collapseAllDisciplinas} className="cp-btn-ghost !px-3 !py-2 !text-xs">
                  Recolher tudo
                </button>
                {profile?.role === 'admin' && (
                  <button type="button" onClick={openFlashcardsModal} className="cp-btn-primary !px-3 !py-2 !text-xs">
                    <SparklesIcon className="h-4 w-4" />
                    Flashcards IA
                  </button>
                )}
              </div>
            </div>
            {normalizedSearch && (
              <p className="mt-3 font-mono text-xs text-cp-muted">
                {filteredDisciplinas.length} disciplina(s) · busca: &quot;{searchQuery}&quot;
              </p>
            )}
          </div>

          <div className="space-y-3">
            {filteredDisciplinas.length === 0 ? (
              <div className="cp-card p-10 text-center">
                <MagnifyingGlassIcon className="mx-auto mb-3 h-10 w-10 text-cp-muted" />
                <p className="text-sm text-cp-muted">Nenhum resultado para &quot;{searchQuery}&quot;</p>
              </div>
            ) : (
              filteredDisciplinas.map(({ disciplina, originalIdx: idx, topicos }) => {
                const isExpanded = expandedDisciplinas.has(idx)
                const total = topicos.length
                const estudados = topicos.filter(({ topico }) => topico.estudado).length
                const pct = total ? Math.round((estudados / total) * 100) : 0
                const accent = accentBorders[idx % accentBorders.length]

                return (
                  <div
                    key={idx}
                    className={`cp-card overflow-hidden transition ${isExpanded ? 'ring-1 ring-cp-accent/15' : ''}`}
                  >
                    <div className="flex items-stretch">
                      <button
                        type="button"
                        onClick={() => toggleDisciplina(idx)}
                        className="flex min-w-0 flex-1 items-center gap-3 p-4 text-left transition hover:bg-cp-surface/40"
                      >
                        <div
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border bg-cp-bg/80 font-mono text-xs font-semibold ${accent}`}
                        >
                          {String(idx + 1).padStart(2, '0')}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="truncate text-sm font-medium text-cp-text sm:text-base">{disciplina.nome}</h3>
                          <div className="mt-1.5 flex flex-wrap items-center gap-2">
                            <span className="cp-badge !py-0.5 !text-[10px]">{total} tópicos</span>
                            {disciplina.totalQuestoes ? (
                              <span className="font-mono text-[10px] text-cp-muted">{disciplina.totalQuestoes} Q</span>
                            ) : null}
                            <span className="font-mono text-[10px] text-cp-muted">
                              {estudados}/{total} concluídos
                            </span>
                          </div>
                          <div className="mt-2 h-1 w-full max-w-[200px] overflow-hidden rounded-full bg-cp-border">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-cp-accent to-cp-accent2"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                        {isExpanded ? (
                          <ChevronDownIcon className="h-5 w-5 shrink-0 text-cp-muted" />
                        ) : (
                          <ChevronRightIcon className="h-5 w-5 shrink-0 text-cp-muted" />
                        )}
                      </button>
                      <div className="flex shrink-0 flex-col items-center justify-center gap-1 border-l border-cp-border px-2 sm:px-3 py-2">
                        {(() => {
                          const discKey = sanitizeDisciplinaName(disciplina.nome || '')
                          const incStatus = disciplinaIncidenciaMap[discKey] || CONTENT_STATUS.UNAVAILABLE
                          const incPublished = incStatus === CONTENT_STATUS.AVAILABLE
                          const isPublishingDisc = publishingDisciplinaIdx === idx
                          return (
                            <>
                              <span
                                className={`cp-badge !py-0.5 !text-[9px] ${
                                  incPublished
                                    ? '!border-emerald-500/30 !bg-emerald-500/10 !text-emerald-500'
                                    : '!border-amber-500/30 !bg-amber-500/10 !text-amber-500'
                                }`}
                                title={incPublished ? 'Incidência liberada' : 'Incidência pendente'}
                              >
                                {incPublished ? 'Incid. OK' : 'Incid.'}
                              </span>
                              <div className="flex items-center gap-1">
                                <Link
                                  to={`/conteudo-incidencia/${courseId || 'alego-default'}/${idx}`}
                                  className="rounded-lg border border-red-500/25 bg-red-500/10 p-2 text-red-400 transition hover:bg-red-500/20"
                                  title="Conteúdo e prática por incidência"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <FireIcon className="h-4 w-4" />
                                </Link>
                                {isAdmin && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleToggleDisciplinaIncidencia(idx, disciplina.nome)
                                    }}
                                    disabled={isPublishingDisc}
                                    className={`rounded-lg px-2 py-1.5 font-mono text-[9px] font-semibold transition disabled:opacity-50 ${
                                      incPublished
                                        ? 'border border-amber-500/30 bg-amber-500/10 text-amber-500'
                                        : 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-500'
                                    }`}
                                    title={incPublished ? 'Bloquear incidência da disciplina' : 'Liberar incidência da disciplina'}
                                  >
                                    {isPublishingDisc ? '…' : incPublished ? 'Bloq.' : 'Lib.'}
                                  </button>
                                )}
                              </div>
                            </>
                          )
                        })()}
                        {profile?.role === 'admin' && (
                          <button
                            type="button"
                            onClick={() => handleDeleteDisciplina(idx)}
                            className="rounded-lg border border-red-500/20 p-1.5 text-red-400/70 transition hover:bg-red-500/10"
                            title="Apagar disciplina"
                          >
                            <TrashIcon className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="border-t border-cp-border bg-cp-bg/20">
                        <div className="divide-y divide-cp-border/50">
                          {topicos.map(({ topico, topicoIdx }) =>
                            renderTopicoRow(disciplina, idx, topico, topicoIdx)
                          )}
                        </div>
                        {profile?.role === 'admin' && (
                          <div className="border-t border-cp-border/50 px-4 py-3">
                            {addingTopico?.disciplinaIdx === idx ? (
                              <div className="flex flex-wrap gap-2">
                                <input
                                  type="text"
                                  value={newTopicoNumero}
                                  onChange={(e) => setNewTopicoNumero(e.target.value)}
                                  placeholder="Nº"
                                  className="w-16 rounded-lg border border-cp-border bg-cp-surface px-2 py-1.5 font-mono text-xs text-cp-text"
                                />
                                <input
                                  type="text"
                                  value={newTopicoNome}
                                  onChange={(e) => setNewTopicoNome(e.target.value)}
                                  placeholder="Nome do tópico"
                                  className="min-w-[140px] flex-1 rounded-lg border border-cp-border bg-cp-surface px-2 py-1.5 text-xs text-cp-text"
                                  autoFocus
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleAddTopico(idx)
                                    if (e.key === 'Escape') {
                                      setAddingTopico(null)
                                      setNewTopicoNome('')
                                      setNewTopicoNumero('')
                                    }
                                  }}
                                />
                                <button type="button" onClick={() => handleAddTopico(idx)} className="cp-btn-primary !px-3 !py-1.5 !text-xs">
                                  <CheckIcon className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setAddingTopico(null)
                                    setNewTopicoNome('')
                                    setNewTopicoNumero('')
                                  }}
                                  className="rounded-lg border border-cp-border px-3 py-1.5 text-xs text-cp-muted"
                                >
                                  <XMarkIcon className="h-4 w-4" />
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setAddingTopico({ disciplinaIdx: idx })}
                                className="cp-btn-ghost !px-3 !py-1.5 !text-xs"
                              >
                                <PlusIcon className="h-4 w-4" />
                                Adicionar tópico
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>

          {profile?.role === 'admin' && (
            <div className="cp-card p-4">
              {addingDisciplina ? (
                <div className="flex flex-wrap gap-2">
                  <input
                    type="text"
                    value={newDisciplinaNome}
                    onChange={(e) => setNewDisciplinaNome(e.target.value)}
                    placeholder="Nome da disciplina"
                    className="min-w-[160px] flex-1 rounded-lg border border-cp-border bg-cp-surface px-3 py-2 text-sm text-cp-text"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddDisciplina()
                      if (e.key === 'Escape') {
                        setAddingDisciplina(false)
                        setNewDisciplinaNome('')
                      }
                    }}
                  />
                  <button type="button" onClick={handleAddDisciplina} className="cp-btn-primary !px-3 !py-2 !text-xs">
                    <CheckIcon className="h-4 w-4" />
                    Salvar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAddingDisciplina(false)
                      setNewDisciplinaNome('')
                    }}
                    className="cp-btn-ghost !px-3 !py-2 !text-xs"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => setAddingDisciplina(true)} className="cp-btn-ghost !text-xs">
                  <PlusIcon className="h-4 w-4" />
                  Adicionar disciplina
                </button>
              )}
            </div>
          )}

          {editalVerticalizado.updatedAt && (
            <p className="text-center font-mono text-[10px] text-cp-muted">
              Atualizado em{' '}
              {editalVerticalizado.updatedAt.toDate?.().toLocaleDateString('pt-BR') || '—'}
            </p>
          )}
        </>
      ) : editalVerticalizado?.secoes && Array.isArray(editalVerticalizado.secoes) && editalVerticalizado.secoes.length > 0 ? (
            <div className="space-y-4">
              {editalVerticalizado.secoes.map((secao, idx) => (
                <div key={idx} className="cp-card border-l-2 border-cp-accent p-4 sm:p-6">
                  <h2 className="text-base font-medium text-cp-text sm:text-lg">{secao.titulo}</h2>
                  {secao.subtitulo && (
                    <p className="mt-1 text-sm text-cp-muted">{secao.subtitulo}</p>
                  )}
                  {secao.conteudo ? (
                    <>
                      <div
                        className="ia-content-enhanced text-xs sm:text-sm md:text-base"
                        dangerouslySetInnerHTML={{ 
                          __html: processContentForDisplay(secao.conteudo) 
                        }}
                      />
                      {/* Leitura de Áudio */}
                      <div className="mt-4">
                        <AudioReader 
                          text={secao.conteudo.replace(/<[^>]*>/g, '')} // Remover HTML para leitura
                          className="w-full"
                        />
                      </div>
                    </>
                  ) : secao.texto ? (
                    <>
                      <div className="text-xs sm:text-sm md:text-base text-text-primary whitespace-pre-wrap leading-relaxed break-words">
                        {secao.texto}
                      </div>
                      {/* Leitura de Áudio */}
                      <div className="mt-4">
                        <AudioReader 
                          text={secao.texto}
                          className="w-full"
                        />
                      </div>
                    </>
                  ) : null}
                  
                  {/* Subseções */}
                  {secao.subsecoes && secao.subsecoes.length > 0 && (
                    <div className="mt-3 sm:mt-4 space-y-3 sm:space-y-4 ml-2 sm:ml-4">
                      {secao.subsecoes.map((subsecao, subIdx) => (
                        <div
                          key={subIdx}
                          className="border-l-2 border-border-primary pl-2 sm:pl-4"
                        >
                          <h3 className="text-sm sm:text-base font-semibold text-text-primary mb-1 sm:mb-2 break-words">
                            {subsecao.titulo}
                          </h3>
                          {subsecao.conteudo ? (
                            <>
                              <div
                                className="ia-content-enhanced text-xs sm:text-sm"
                                dangerouslySetInnerHTML={{ 
                                  __html: processContentForDisplay(subsecao.conteudo) 
                                }}
                              />
                              {/* Leitura de Áudio */}
                              <div className="mt-3">
                                <AudioReader 
                                  text={subsecao.conteudo.replace(/<[^>]*>/g, '')} // Remover HTML para leitura
                                  className="w-full"
                                />
                              </div>
                            </>
                          ) : subsecao.texto ? (
                            <>
                              <p className="text-xs sm:text-sm text-text-secondary whitespace-pre-wrap break-words">
                                {subsecao.texto}
                              </p>
                              {/* Leitura de Áudio */}
                              <div className="mt-3">
                                <AudioReader 
                                  text={subsecao.texto}
                                  className="w-full"
                                />
                              </div>
                            </>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : editalVerticalizado?.conteudo ? (
            <div className="cp-card ia-content-enhanced p-4 sm:p-6">
              <div
                dangerouslySetInnerHTML={{
                  __html: processContentForDisplay(editalVerticalizado.conteudo),
                }}
              />
            </div>
          ) : (
            <div className="cp-card p-10 text-center">
              <BookOpenIcon className="mx-auto mb-3 h-12 w-12 text-cp-muted" />
              <p className="text-sm text-cp-muted">Conteúdo ainda não disponível.</p>
            </div>
          )}

      {/* Modal de Edição de Tópico */}
      {editModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-background-card rounded-xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-text-primary">
                Editar Tópico
              </h3>
              <button
                onClick={handleCancelEdit}
                className="text-text-muted transition-colors"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Numeração
                </label>
                <input
                  type="text"
                  value={editNumero}
                  onChange={(e) => setEditNumero(e.target.value)}
                  className="w-full px-3 py-2 border border-border-primary rounded-lg focus:ring-2 focus:ring-alego-500 focus:border-alego-500 bg-background-card text-text-primary"
                  placeholder="Ex: 1.1, 1.2.3, etc."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Nome do Tópico
                </label>
                <input
                  type="text"
                  value={editNome}
                  onChange={(e) => setEditNome(e.target.value)}
                  className="w-full px-3 py-2 border border-border-primary rounded-lg focus:ring-2 focus:ring-alego-500 focus:border-alego-500 bg-background-card text-text-primary"
                  placeholder="Nome do tópico"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleCancelEdit}
                className="flex-1 px-4 py-3 sm:px-4 sm:py-2 text-text-primary bg-background-card-hover rounded-lg font-medium transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveTopico}
                disabled={editLoading || !editNome.trim()}
                className="flex-1 px-4 py-3 sm:px-4 sm:py-2 bg-alego-600 text-white rounded-lg font-medium hover:bg-alego-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {editLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                    Salvando...
                  </>
                ) : (
                  <>
                    <CheckIcon className="h-4 w-4" />
                    Salvar
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Geração de Flashcards */}
      {flashcardsModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-background-card rounded-xl shadow-xl max-w-lg w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-text-primary">
                🎴 Gerar Flashcards com IA
              </h3>
              <button
                onClick={() => setFlashcardsModalOpen(false)}
                className="text-text-muted transition-colors"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Informações sobre o edital */}
              <div className="bg-accent-cyan/10 border border-accent-cyan/30 rounded-lg p-4">
                <h4 className="font-semibold text-text-primary mb-2">
                  📋 Estrutura do Edital
                </h4>
                <div className="text-sm text-text-secondary space-y-1">
                  <p><strong>Curso:</strong> {courseName}</p>
                  <p><strong>Disciplinas:</strong> {editalVerticalizadoBase?.disciplinas?.length || 0}</p>
                  <p><strong>Tópicos:</strong> {editalVerticalizadoBase?.disciplinas?.reduce((sum, d) => sum + (d.topicos?.length || 0), 0) || 0}</p>
                </div>
              </div>

              {/* Status de flashcards existentes */}
              {existingFlashcards !== null && (
                <div className="bg-accent-orange/10 border border-accent-orange/30 rounded-lg p-4">
                  <h4 className="font-semibold text-text-primary mb-2">
                    📚 Flashcards Existentes
                  </h4>
                  <p className="text-sm text-text-secondary">
                    {existingFlashcards.length === 0 
                      ? 'Nenhum flashcard encontrado. Serão gerados novos flashcards.'
                      : `Encontrados ${existingFlashcards.length} flashcards. Eles serão APAGADOS e substituídos por novos.`
                    }
                  </p>
                </div>
              )}

              {/* Status da geração */}
              {generationStatus && (
                <div className="bg-background-card-hover border border-border-primary rounded-lg p-4">
                  <p className="text-sm text-text-secondary">
                    {generationStatus}
                  </p>
                </div>
              )}

              {/* Botão de ação */}
              <div className="pt-2">
                <button
                  onClick={() => generateFlashcardsFromEdital()}
                  disabled={generatingFlashcards}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 sm:px-4 sm:py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-medium rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <SparklesIcon className="h-5 w-5 sm:h-5 sm:w-5" />
                  {generatingFlashcards ? 'Gerando Flashcards...' : 'Gerar Flashcards'}
                </button>
              </div>

              {/* Informações importantes */}
              <div className="text-xs text-text-secondary space-y-1">
                <p>• <strong>⚠️ ATENÇÃO:</strong> Todos os flashcards existentes serão APAGADOS</p>
                <p>• A IA seguirá exatamente a estrutura do edital (disciplinas e tópicos)</p>
                <p>• Serão gerados 3-5 flashcards por tópico</p>
                <p>• O processo é irreversível - faça backup se necessário</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default EditalVerticalizado

