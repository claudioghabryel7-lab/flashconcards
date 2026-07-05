import React, { useEffect, useState } from 'react'
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
} from '@heroicons/react/24/outline'
import { db } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'
import { useDarkMode } from '../hooks/useDarkMode.jsx'
import { callGeminiWithRetry, extractGeneratedText } from '../utils/geminiApi'
import AudioReader from '../components/AudioReader'
import { processIAContent, isHtmlContent } from '../utils/iaContentProcessor'
import { formatTopicoAsModulo } from '../utils/editalVerticalizadoLoader'

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
  const { user, profile } = useAuth()
  const { darkMode } = useDarkMode()
  const [searchParams] = useSearchParams()
  const [editalVerticalizado, setEditalVerticalizado] = useState(null)
  const [editalVerticalizadoBase, setEditalVerticalizadoBase] = useState(null) // Dados base do curso (sem progresso)
  const [userProgress, setUserProgress] = useState(null) // Progresso individual do usuário
  const [loading, setLoading] = useState(true)
  const [courseId, setCourseId] = useState(null)
  const [courseName, setCourseName] = useState('')
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

      setGenerationStatus('Enviando solicitação para a IA...')

      // Chamar API da IA com rotação de keys
      const response = await callGeminiWithRetry(prompt, {
        generationConfig: {
          maxOutputTokens: 32000,
          temperature: 0.7,
        },
      })

      setGenerationStatus('Processando resposta da IA...')
      
      const generatedText = extractGeneratedText(data)
      
      // Encontrar o início e fim do array flashcards
      const flashcardsStart = generatedText.indexOf('"flashcards"')
      const arrayStart = generatedText.indexOf('[', flashcardsStart)
      const arrayEnd = generatedText.lastIndexOf(']')
      
      if (flashcardsStart === -1 || arrayStart === -1 || arrayEnd === -1) {
        console.error('Texto gerado pela IA:', generatedText)
        throw new Error('Não foi possível encontrar o array de flashcards na resposta')
      }
      
      // Extrair apenas o array flashcards
      const flashcardsJson = '{"flashcards":' + generatedText.substring(arrayStart, arrayEnd + 1) + '}'
      
      setGenerationStatus('Validando estrutura dos flashcards...')
      
      let flashcardsData = null
      
      try {
        // Tentar fazer o parse direto
        flashcardsData = JSON.parse(flashcardsJson)
      } catch (parseError) {
        console.error('Erro ao fazer parse do JSON:', parseError.message)
        console.error('JSON extraído:', flashcardsJson)
        
        // Tentar corrigir problemas comuns de formatação
        let fixedJson = flashcardsJson
          .replace(/,\s*}/g, '}')  // Vírgula antes de fechar objeto
          .replace(/,\s*]/g, ']')  // Vírgula antes de fechar array
          .replace(/\n\s*\}/g, '}')  // Nova linha antes de fechar objeto
          .replace(/\n\s*\]/g, ']')  // Nova linha antes de fechar array
        
        try {
          flashcardsData = JSON.parse(fixedJson)
          console.log('JSON corrigido com sucesso')
        } catch (fixError) {
          throw new Error(`JSON inválido mesmo após correção: ${fixError.message}`)
        }
      }
      
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
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-alego-600 border-t-transparent"></div>
          <p className="mt-4 text-lg font-semibold text-alego-600">Carregando edital verticalizado...</p>
        </div>
      </div>
    )
  }

  if (!editalVerticalizado) {
    return (
      <div className="space-y-6">
        <div className={`bg-background-card rounded-2xl shadow-lg border border-slate-20late-70primpryxt-center`}>
          <DocumentTextIcon className="h-16 w-16 text-text-muted mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-text-primary mb-2">
            Edital Verticalizado não disponível
          </h2>
          <p className="text-text-secondary mb-6">
            O edital verticalizado ainda não foi configurado para este curso.
          </p>
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 px-6 py-3 bg-alego-600 text-white rounded-xl font-semibold hover:bg-alego-700 transition-all"
          >
            Voltar ao Dashboard
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {courseName && (
        <p className="text-sm font-semibold text-text-secondary">{courseName.toUpperCase()}</p>
      )}

      {/* Conteúdo Principal */}
        <div className={`bg-background-card rounded-xl sm:rounded-2xl shadow-lg border border-border-primary p-2 sm:p-3 md:p-4 lg:p-6`}>
          {/* Descrição removida conforme solicitado */}

          {/* Tabela de Edital Verticalizado */}
          {editalVerticalizado?.disciplinas && Array.isArray(editalVerticalizado.disciplinas) && editalVerticalizado.disciplinas.length > 0 ? (
            <>
              {/* Informações sobre o edital */}
              <div className="mb-3 sm:mb-4 pb-2 sm:pb-3 border-b border-border-primary">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3">
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-[10px] sm:text-xs text-text-secondary">
                    <span className="font-semibold text-text-primary text-xs sm:text-sm">
                      {editalVerticalizado.disciplinas.length} {editalVerticalizado.disciplinas.length === 1 ? 'disciplina' : 'disciplinas'}
                    </span>
                    <span className="font-semibold text-text-primary text-xs sm:text-sm">
                      {editalVerticalizado.disciplinas.reduce((sum, d) => sum + (d.topicos?.length || 0), 0)} {editalVerticalizado.disciplinas.reduce((sum, d) => sum + (d.topicos?.length || 0), 0) === 1 ? 'tópico' : 'tópicos'}
                    </span>
                  </div>
                  {profile?.role === 'admin' && (
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={openFlashcardsModal}
                        className="inline-flex items-center gap-1.5 px-3 py-2 sm:px-3 sm:py-1.5 bg-gradient-to-r from-accent-orange to-accent-cyan text-background-primary text-xs sm:text-xs font-semibold rounded-lg hover:from-accent-orange-dim hover:to-accent-cyan-dim transition-all shadow-lg shadow-accent-orange/20 border border-accent-orange/30 active:scale-95"
                      >
                        <SparklesIcon className="h-4 w-4 sm:h-4 sm:w-4" />
                        <span className="hidden sm:inline">Flashcards</span>
                        <span className="sm:hidden">Flash</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="overflow-x-auto -mx-2 sm:-mx-3 md:-mx-4 lg:mx-0 scrollbar-thin scrollbar-thumb-blue-500 scrollbar-track-background-card">
              <div className="min-w-full inline-block">
                <table className="w-full min-w-[400px] sm:min-w-[500px] md:min-w-[600px] lg:min-w-[640px] border-collapse border border-border-primary bg-background-card text-[10px] sm:text-xs md:text-sm">
                  <thead>
                    <tr className="bg-accent-cyan text-white">
                      <th className="border border-border-primary px-1.5 sm:px-2 md:px-3 lg:px-4 py-1.5 sm:py-2 md:py-2.5 text-left font-bold text-[9px] sm:text-xs md:text-sm">
                        <span className="sm:hidden">DISC.</span>
                        <span className="hidden sm:inline">DISCIPLINAS</span>
                      </th>
                      <th className="border border-border-primary px-1 sm:px-1.5 md:px-2 lg:px-3 py-1.5 sm:py-2 md:py-2.5 text-center font-bold text-[9px] sm:text-xs md:text-sm whitespace-nowrap">
                        <span className="hidden sm:inline">Estudado</span>
                        <span className="sm:hidden">Est.</span>
                      </th>
                      {profile?.role === 'admin' && (
                        <>
                          <th className="border border-border-primary px-1 sm:px-1.5 md:px-2 lg:px-3 py-1.5 sm:py-2 md:py-2.5 text-center font-bold text-[9px] sm:text-xs md:text-sm whitespace-nowrap">
                            <span className="hidden sm:inline">Editar</span>
                            <span className="sm:hidden">Ed</span>
                          </th>
                          <th className="border border-border-primary px-1 sm:px-1.5 md:px-2 lg:px-3 py-1.5 sm:py-2 md:py-2.5 text-center font-bold text-[9px] sm:text-xs md:text-sm whitespace-nowrap">
                            <span className="hidden sm:inline">Ações</span>
                            <span className="sm:hidden">Aç</span>
                          </th>
                        </>
                      )}
                    </tr>
                  </thead>
                <tbody>
                  {editalVerticalizado.disciplinas
                    .filter(disciplina => disciplina && disciplina.nome) // Filtrar disciplinas inválidas
                    .map((disciplina, idx) => {
                      // Log para debug (apenas no console, apenas para primeira disciplina)
                      if (idx === 0) {
                        // Logs removidos para limpar console
                      }
                      return (
                    <React.Fragment key={idx}>
                      {/* Linha principal da disciplina (destaque laranja) */}
                      <tr className="bg-accent-orange text-white font-bold">
                        <td className="border border-border-primary px-1.5 sm:px-2 md:px-3 lg:px-4 py-1.5 sm:py-2 md:py-2.5 text-[10px] sm:text-xs md:text-sm lg:text-base">
                          <div className="flex items-center gap-2">
                            <span className="font-bold break-words">{disciplina.nome || 'Disciplina sem nome'}</span>
                            {disciplina.totalQuestoes && (
                              <span className="block sm:inline text-[9px] sm:text-xs opacity-90 whitespace-nowrap">
                                ({disciplina.totalQuestoes} Q)
                              </span>
                            )}
                            <Link
                              to={`/conteudo-incidencia/${courseId || 'alego-default'}/${idx}`}
                              className="inline-flex items-center gap-1 px-2 py-1 bg-red-600 text-white text-[9px] sm:text-xs font-semibold rounded hover:bg-red-700 transition whitespace-nowrap active:scale-95"
                              title="Gerar Conteúdo de Maior Incidência"
                            >
                              <FireIcon className="h-3 w-3 sm:h-4 sm:w-4" />
                              <span className="hidden xs:inline sm:inline">Incidência</span>
                              <span className="xs:hidden sm:hidden">🔥</span>
                            </Link>
                          </div>
                        </td>
                        <td className="border border-border-primary px-1 sm:px-1.5 md:px-2 lg:px-3 py-1.5 sm:py-2 md:py-2.5 text-center"></td>
                        {profile?.role === 'admin' && (
                          <>
                            <td className="border border-border-primary px-1 sm:px-1.5 md:px-2 lg:px-3 py-1.5 sm:py-2 md:py-2.5 text-center"></td>
                            <td className="border border-border-primary px-1 sm:px-1.5 md:px-2 lg:px-3 py-1.5 sm:py-2 md:py-2.5 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  onClick={() => handleDeleteDisciplina(idx)}
                                  className="inline-flex items-center justify-center p-2 sm:p-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded transition-colors"
                                  title="Apagar disciplina"
                                >
                                  <TrashIcon className="h-4 w-4 sm:h-4 sm:w-4" />
                                </button>
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                      
                      {/* Tópicos da disciplina */}
                      {disciplina.topicos && Array.isArray(disciplina.topicos) && disciplina.topicos.length > 0 && disciplina.topicos
                        .filter(topico => topico && (topico.nome || topico.numero)) // Filtrar tópicos inválidos
                        .map((topico, topicoIdx) => {
                          // Log para debug (apenas no console, apenas para primeira disciplina)
                          if (idx === 0 && topicoIdx === 0) {
                            // Log removido para limpar console
                          }
                          if (!topico) return null // Proteção extra
                          
                          // Calcular indentação baseada na numeração (ex: 1.1 = nivel 0, 1.1.2 = nivel 1, 1.2.5.1 = nivel 2)
                          let nivelCalculado = topico.nivel || 0
                          if (topico.numero && typeof topico.numero === 'string') {
                            // Contar quantos níveis há na numeração (1.1 = 2 partes = nivel 0, 1.1.2 = 3 partes = nivel 1)
                            const partes = topico.numero.split('.').filter(p => p.trim())
                            nivelCalculado = Math.max(0, partes.length - 2)
                          }
                          // Ajustar indentação responsiva
                          const basePadding = 8
                          const nivelPadding = nivelCalculado * (nivelCalculado > 0 ? 10 : 12) // Menos padding em mobile para níveis profundos
                          const paddingLeft = basePadding + nivelPadding
                          
                          const isHighlighted = highlightedTopico && (
                            (topico.nome || '').toLowerCase().includes(highlightedTopico.toLowerCase()) ||
                            highlightedTopico.toLowerCase().includes((topico.nome || '').toLowerCase())
                          )
                          
                          return (
                            <tr key={`${idx}-${topicoIdx}`} id={`topico-${idx}-${topicoIdx}`} className={`${isHighlighted ? 'ring-2 ring-accent-orange bg-accent-orange/10' : ''} hover:bg-background-card-hover bg-background-card`}>
                              <td 
                                className="border border-border-primary px-1.5 sm:px-2 md:px-3 lg:px-4 py-1.5 sm:py-2 text-text-primary text-[9px] sm:text-xs md:text-sm break-words"
                                style={{ 
                                  paddingLeft: `${Math.max(paddingLeft - 4, 8)}px` // Reduzir padding em mobile
                                }}
                              >
                                <div className="flex flex-col gap-1.5 sm:gap-2">
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-start gap-1 sm:gap-2">
                                      {topico.numero && <span className="font-medium whitespace-nowrap text-[9px] sm:text-xs">{topico.numero} </span>}
                                      <span className="break-words leading-tight">{topico.nome || ''}</span>
                                    </div>
                                  </div>
                                  <div className="flex items-center justify-between gap-2">
                                    {(() => {
                                      const topicKey = makeTopicKey(topico)
                                      // Validar que o topicKey não está vazio antes de criar o link
                                      if (!topicKey || topicKey.trim() === '') {
                                        return (
                                          <span className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[10px] sm:text-xs font-semibold bg-background-card-hover text-text-muted cursor-not-allowed whitespace-nowrap flex-shrink-0 border border-border-primary" title="Tópico sem identificação válida">
                                            <BookOpenIcon className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                                            <span className="hidden xs:inline sm:inline">Estudar</span>
                                            <span className="xs:hidden sm:hidden">E</span>
                                          </span>
                                        )
                                      }
                                      const moduloLabel = formatTopicoAsModulo(topico)
                                      return (
                                        <>
                                          <Link
                                            to={`/flashcards/topico/${courseId || 'alego-default'}?disciplina=${encodeURIComponent(disciplina.nome || '')}&modulo=${encodeURIComponent(moduloLabel)}&topicKey=${encodeURIComponent(topicKey)}`}
                                            className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[10px] sm:text-xs font-semibold bg-gradient-to-r from-accent-orange to-accent-cyan text-background-primary hover:from-accent-orange-dim hover:to-accent-cyan-dim transition-all whitespace-nowrap flex-shrink-0 active:scale-95 shadow-lg shadow-accent-orange/20 border border-accent-orange/30"
                                            title="Flashcards deste tópico (gerados uma vez e salvos para todos)"
                                          >
                                            <SparklesIcon className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                                            <span className="hidden xs:inline sm:inline">Flashcards</span>
                                            <span className="xs:hidden sm:hidden">FC</span>
                                          </Link>
                                          <Link
                                            to={`/conteudo-completo/topic/${courseId || 'alego-default'}/${topicKey}?nome=${encodeURIComponent(topico.nome || '')}`}
                                            className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[10px] sm:text-xs font-semibold bg-background-card-hover text-accent-cyan hover:bg-background-card-hover hover:text-accent-cyan-dim transition-all whitespace-nowrap flex-shrink-0 active:scale-95 border border-accent-cyan/30"
                                            title="Estudar conteúdo deste tópico"
                                          >
                                            <BookOpenIcon className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                                            <span className="hidden xs:inline sm:inline">Estudar</span>
                                            <span className="xs:hidden sm:hidden">E</span>
                                          </Link>
                                          <Link
                                            to={`/questoes-topic/${courseId || 'alego-default'}/${topicKey}?nome=${encodeURIComponent(topico.nome || '')}`}
                                            className="inline-flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-[10px] sm:text-xs font-semibold bg-gradient-to-r from-accent-cyan to-accent-orange text-background-primary hover:from-accent-cyan-dim hover:to-accent-orange-dim transition-all whitespace-nowrap flex-shrink-0 active:scale-95 shadow-lg shadow-accent-cyan/20 border border-accent-cyan/30"
                                            title="Questões preditivas deste tópico (BOOK QUESTÕES)"
                                          >
                                            <FireIcon className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                                            <span className="hidden xs:inline sm:inline">Praticar</span>
                                            <span className="xs:hidden sm:hidden">Q</span>
                                          </Link>
                                          {profile?.role === 'admin' && (
                                            <button
                                              onClick={(e) => {
                                                e.preventDefault()
                                                e.stopPropagation()
                                                handleDeleteTopicContent(topicKey)
                                              }}
                                              className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[10px] sm:text-xs font-semibold bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all whitespace-nowrap flex-shrink-0 active:scale-95 border border-red-500/30"
                                              title="Apagar conteúdo deste tópico (apenas admin)"
                                            >
                                              <TrashIcon className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                                              <span className="hidden xs:inline sm:inline">Apagar</span>
                                              <span className="xs:hidden sm:hidden">X</span>
                                            </button>
                                          )}
                                        </>
                                      )
                                    })()}
                                  </div>
                                </div>
                              </td>
                              <td className="border border-border-primary px-1 sm:px-1.5 md:px-2 lg:px-3 py-1.5 sm:py-2 text-center">
                                <input
                                  type="checkbox"
                                  checked={!!topico.estudado}
                                  onChange={() => handleToggleCheckbox(idx, topicoIdx, 'estudado')}
                                  className="w-4 h-4 sm:w-5 sm:h-5 md:w-4 md:h-4 text-blue-600 bg-white bg-background-card border-gray-300 rounded focus:ring-blue-500 focus:ring-accent-cyan focus:ring-2 cursor-pointer touch-manipulation"
                                  style={{ touchAction: 'manipulation' }}
                                />
                              </td>
                              {profile?.role === 'admin' && (
                                <>
                                  <td className="border border-border-primary px-1 sm:px-1.5 md:px-2 lg:px-3 py-1.5 sm:py-2 text-center">
                                    <button
                                      onClick={() => handleEditTopico(idx, topicoIdx)}
                                      className="inline-flex items-center justify-center p-2 sm:p-1.5 text-accent-cyan hover:text-accent-cyan-dim hover:bg-accent-cyan/10 rounded transition-colors"
                                      title="Editar tópico"
                                    >
                                      <PencilIcon className="h-4 w-4 sm:h-4 sm:w-4" />
                                    </button>
                                  </td>
                                  <td className="border border-border-primary px-1 sm:px-1.5 md:px-2 lg:px-3 py-1.5 sm:py-2 text-center">
                                    <div className="flex items-center justify-center gap-1">
                                      <button
                                        onClick={() => handleDeleteTopico(idx, topicoIdx)}
                                        className="inline-flex items-center justify-center p-2 sm:p-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded transition-colors"
                                        title="Apagar tópico"
                                      >
                                        <TrashIcon className="h-4 w-4 sm:h-4 sm:w-4" />
                                      </button>
                                    </div>
                                  </td>
                                </>
                              )}
                            </tr>
                          )
                        })}

                        {/* Linha para adicionar novo tópico (apenas admin) */}
                        {profile?.role === 'admin' && (
                          <tr className="bg-background-card-hover">
                            <td className="border border-border-primary px-1.5 sm:px-2 md:px-3 lg:px-4 py-1.5 sm:py-2 md:py-2.5 text-[10px] sm:text-xs md:text-sm" style={{ paddingLeft: '16px' }}>
                              {addingTopico?.disciplinaIdx === idx ? (
                                <div className="flex gap-2">
                                  <input
                                    type="text"
                                    value={newTopicoNumero}
                                    onChange={(e) => setNewTopicoNumero(e.target.value)}
                                    placeholder="Número (opcional)"
                                    className="w-20 px-2 py-1 text-xs border border-border-primary rounded bg-background-card text-text-primary"
                                  />
                                  <input
                                    type="text"
                                    value={newTopicoNome}
                                    onChange={(e) => setNewTopicoNome(e.target.value)}
                                    placeholder="Nome do tópico"
                                    className="flex-1 px-2 py-1 text-xs border border-border-primary rounded bg-background-card text-text-primary"
                                    autoFocus
                                    onKeyPress={(e) => {
                                      if (e.key === 'Enter') handleAddTopico(idx)
                                      if (e.key === 'Escape') {
                                        setAddingTopico(null)
                                        setNewTopicoNome('')
                                        setNewTopicoNumero('')
                                      }
                                    }}
                                  />
                                  <button
                                    onClick={() => handleAddTopico(idx)}
                                    className="px-3 py-2 sm:px-2 sm:py-1 bg-accent-orange text-background-primary text-xs sm:text-xs rounded-lg hover:bg-accent-orange-dim transition-colors"
                                  >
                                    <CheckIcon className="h-4 w-4 sm:h-4 sm:w-4" />
                                  </button>
                                  <button
                                    onClick={() => {
                                      setAddingTopico(null)
                                      setNewTopicoNome('')
                                      setNewTopicoNumero('')
                                    }}
                                    className="px-3 py-2 sm:px-2 sm:py-1 bg-red-500/10 text-red-400 text-xs sm:text-xs rounded-lg hover:bg-red-500/20 transition-colors"
                                  >
                                    <XMarkIcon className="h-4 w-4 sm:h-4 sm:w-4" />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setAddingTopico({ disciplinaIdx: idx })}
                                  className="px-3 py-2 sm:px-2 sm:py-1 bg-accent-cyan text-background-primary text-xs sm:text-xs rounded-lg hover:bg-accent-cyan-dim transition"
                                >
                                  <PlusIcon className="h-4 w-4 sm:h-3 sm:w-3" />
                                  <span className="hidden sm:inline">Adicionar tópico</span>
                                  <span className="sm:hidden">Adicionar</span>
                                </button>
                              )}
                            </td>
                            <td className="border border-border-primary px-1 sm:px-1.5 md:px-2 lg:px-3 py-1.5 sm:py-2 md:py-2.5 text-center"></td>
                            {profile?.role === 'admin' && (
                              <>
                                <td className="border border-border-primary px-1 sm:px-1.5 md:px-2 lg:px-3 py-1.5 sm:py-2 md:py-2.5 text-center"></td>
                                <td className="border border-border-primary px-1 sm:px-1.5 md:px-2 lg:px-3 py-1.5 sm:py-2 md:py-2.5 text-center"></td>
                              </>
                            )}
                          </tr>
                        )}
                    </React.Fragment>
                      )
                    })}

                  {/* Linha para adicionar nova disciplina (apenas admin) */}
                  {profile?.role === 'admin' && (
                    <tr className="bg-background-card-hover">
                      <td className="border border-border-primary px-1.5 sm:px-2 md:px-3 lg:px-4 py-1.5 sm:py-2 md:py-2.5 text-[10px] sm:text-xs md:text-sm">
                        {addingDisciplina ? (
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={newDisciplinaNome}
                              onChange={(e) => setNewDisciplinaNome(e.target.value)}
                              placeholder="Nome da disciplina"
                              className="flex-1 px-2 py-1 text-xs border border-border-primary rounded bg-background-card text-text-primary"
                              autoFocus
                              onKeyPress={(e) => {
                                if (e.key === 'Enter') handleAddDisciplina()
                                if (e.key === 'Escape') {
                                  setAddingDisciplina(false)
                                  setNewDisciplinaNome('')
                                }
                              }}
                            />
                            <button
                              onClick={handleAddDisciplina}
                              className="px-3 py-2 sm:px-2 sm:py-1 bg-accent-orange text-background-primary text-xs sm:text-xs rounded-lg hover:bg-accent-orange-dim transition-colors"
                            >
                              <CheckIcon className="h-4 w-4 sm:h-4 sm:w-4" />
                            </button>
                            <button
                              onClick={() => {
                                setAddingDisciplina(false)
                                setNewDisciplinaNome('')
                              }}
                              className="px-3 py-2 sm:px-2 sm:py-1 bg-red-500/10 text-red-400 text-xs sm:text-xs rounded-lg hover:bg-red-500/20 transition-colors"
                            >
                              <XMarkIcon className="h-4 w-4 sm:h-4 sm:w-4" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setAddingDisciplina(true)}
                            className="inline-flex items-center gap-1 px-3 py-2 sm:px-2 sm:py-1 bg-accent-cyan text-background-primary text-xs sm:text-xs rounded-lg hover:bg-accent-cyan-dim transition"
                          >
                            <PlusIcon className="h-4 w-4 sm:h-3 sm:w-3" />
                            <span className="hidden sm:inline">Adicionar disciplina</span>
                            <span className="sm:hidden">Adicionar</span>
                          </button>
                        )}
                      </td>
                      <td className="border border-border-primary px-1 sm:px-1.5 md:px-2 lg:px-3 py-1.5 sm:py-2 md:py-2.5 text-center"></td>
                      {profile?.role === 'admin' && (
                        <>
                          <td className="border border-border-primary px-1 sm:px-1.5 md:px-2 lg:px-3 py-1.5 sm:py-2 md:py-2.5 text-center"></td>
                          <td className="border border-border-primary px-1 sm:px-1.5 md:px-2 lg:px-3 py-1.5 sm:py-2 md:py-2.5 text-center"></td>
                        </>
                      )}
                    </tr>
                  )}
                </tbody>
              </table>
                </div>
              </div>
            </>
          ) : editalVerticalizado?.secoes && Array.isArray(editalVerticalizado.secoes) && editalVerticalizado.secoes.length > 0 ? (
            <div className="space-y-4 sm:space-y-6">
              {editalVerticalizado.secoes.map((secao, idx) => (
<div
                  key={idx}
                  className="border-l-4 border-indigo-500 pl-3 sm:pl-4 md:pl-6 py-3 sm:py-4 bg-background-card-hover rounded-r-lg"
                >
                  <h2 className="text-base sm:text-lg md:text-xl font-bold text-text-primary mb-2 sm:mb-3 break-words">
                    {secao.titulo}
                  </h2>
                  {secao.subtitulo && (
                    <p className="text-xs sm:text-sm text-text-secondary mb-2 sm:mb-3 break-words">
                      {secao.subtitulo}
                    </p>
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
            <div className="ia-content-enhanced">
              <div
                dangerouslySetInnerHTML={{ 
                  __html: processContentForDisplay(editalVerticalizado.conteudo) 
                }}
              />
            </div>
          ) : (
            <div className="text-center py-12">
              <BookOpenIcon className="h-12 w-12 text-text-muted mx-auto mb-3" />
              <p className="text-text-secondary">
                Conteúdo ainda não disponível.
              </p>
            </div>
          )}

          {/* Footer */}
          {editalVerticalizado.updatedAt && (
            <div className="mt-4 sm:mt-6 md:mt-8 pt-4 sm:pt-6 border-t border-border-primary text-xs text-text-secondary">
              Última atualização: {editalVerticalizado.updatedAt.toDate?.().toLocaleDateString('pt-BR') || 'Data não disponível'}
            </div>
          )}
        </div>

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

