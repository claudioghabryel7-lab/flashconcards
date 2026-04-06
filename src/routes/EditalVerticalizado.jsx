import React, { useEffect, useState } from 'react'
import { useSearchParams, Link, useNavigate } from 'react-router-dom'
import { doc, onSnapshot, getDoc, updateDoc, collection, getDocs, query, orderBy, setDoc, serverTimestamp } from 'firebase/firestore'
import dayjs from 'dayjs'
import {
  DocumentTextIcon,
  ChevronLeftIcon,
  BookOpenIcon,
  PencilIcon,
  XMarkIcon,
  CheckIcon,
} from '@heroicons/react/24/outline'
import { db } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'
import { useDarkMode } from '../hooks/useDarkMode.jsx'
import AudioReader from '../components/AudioReader'
import { processIAContent, isHtmlContent } from '../utils/iaContentProcessor'

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
          
          setEditalVerticalizado(editalCompleto)
        } else {
          // Edital normal (não dividido)
          console.log('📋 EditalVerticalizado: Carregando edital normal...')
          const jsonString = JSON.stringify(data)
          const sizeMB = (new Blob([jsonString]).size / 1024 / 1024).toFixed(2)
          console.log(`📊 EditalVerticalizado: Edital normal (${sizeMB} MB)`)
          
          const totalDisciplinas = data.disciplinas?.length || 0
          const totalTopicos = data.disciplinas?.reduce((sum, d) => sum + (d.topicos?.length || 0), 0) || 0
          console.log(`✅ EditalVerticalizado: Carregado com sucesso - ${totalDisciplinas} disciplinas, ${totalTopicos} tópicos`)
          
          setEditalVerticalizado(data)
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

  // Função para atualizar checkbox do tópico
  const handleToggleCheckbox = async (disciplinaIdx, topicoIdx, campo) => {
    if (!courseId || !editalVerticalizado?.disciplinas || !user) return

    try {
      const editalRef = doc(db, 'courses', courseId, 'editalVerticalizado', 'principal')
      const disciplinas = [...editalVerticalizado.disciplinas]
      const topico = disciplinas[disciplinaIdx].topicos[topicoIdx]
      const disciplina = disciplinas[disciplinaIdx]
      
      // Alternar o valor do checkbox
      const novoValor = !topico[campo]
      
      // Atualizar o tópico
      disciplinas[disciplinaIdx].topicos[topicoIdx] = {
        ...topico,
        [campo]: novoValor
      }

      // Atualizar no Firestore
      await updateDoc(editalRef, {
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
    if (!editingTopico || !courseId || !editalVerticalizado) return

    try {
      setEditLoading(true)
      const editalRef = doc(db, 'courses', courseId, 'editalVerticalizado', 'principal')
      const disciplinas = [...editalVerticalizado.disciplinas]
      
      // Atualizar o tópico
      disciplinas[editingTopico.disciplinaIdx].topicos[editingTopico.topicoIdx] = {
        ...disciplinas[editingTopico.disciplinaIdx].topicos[editingTopico.topicoIdx],
        nome: editNome.trim(),
        numero: editNumero.trim()
      }

      // Atualizar no Firestore
      await updateDoc(editalRef, {
        disciplinas: disciplinas
      })

      // Atualizar estado local
      setEditalVerticalizado({
        ...editalVerticalizado,
        disciplinas: disciplinas
      })

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
      <div className="min-h-screen py-6">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-alego-600 dark:hover:text-alego-400 mb-6"
          >
            <ChevronLeftIcon className="h-5 w-5" />
            Voltar ao Dashboard
          </Link>
          
          <div className={`bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 p-12 text-center`}>
            <DocumentTextIcon className="h-16 w-16 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
              Edital Verticalizado não disponível
            </h1>
            <p className="text-slate-600 dark:text-slate-400 mb-6">
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
      </div>
    )
  }

  return (
    <div className="min-h-screen py-4 sm:py-6">
      <div className="max-w-5xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-4 sm:mb-6 md:mb-8">
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-alego-600 dark:hover:text-alego-400 mb-3 sm:mb-4 text-sm sm:text-base"
          >
            <ChevronLeftIcon className="h-4 w-4 sm:h-5 sm:w-5" />
            <span className="hidden sm:inline">Voltar ao Dashboard</span>
            <span className="sm:hidden">Voltar</span>
          </Link>
          
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="p-2 sm:p-3 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-lg sm:rounded-xl flex-shrink-0">
              <DocumentTextIcon className="h-6 w-6 sm:h-8 sm:w-8 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-black text-slate-900 dark:text-white break-words">
                {courseName ? `EDITAL VERTICALIZADO ${courseName.toUpperCase()}` : (editalVerticalizado.titulo || 'EDITAL VERTICALIZADO')}
              </h1>
            </div>
          </div>
        </div>

        {/* Conteúdo Principal */}
        <div className={`bg-white dark:bg-slate-800 rounded-xl sm:rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 p-3 sm:p-4 md:p-6 lg:p-8`}>
          {/* Descrição removida conforme solicitado */}

          {/* Tabela de Edital Verticalizado */}
          {editalVerticalizado?.disciplinas && Array.isArray(editalVerticalizado.disciplinas) && editalVerticalizado.disciplinas.length > 0 ? (
            <>
              {/* Informações sobre o edital */}
              <div className="mb-4 sm:mb-6 pb-3 sm:pb-4 border-b border-slate-200 dark:border-slate-700">
                <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    📚 {editalVerticalizado.disciplinas.length} {editalVerticalizado.disciplinas.length === 1 ? 'disciplina' : 'disciplinas'}
                  </span>
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    📝 {editalVerticalizado.disciplinas.reduce((sum, d) => sum + (d.topicos?.length || 0), 0)} {editalVerticalizado.disciplinas.reduce((sum, d) => sum + (d.topicos?.length || 0), 0) === 1 ? 'tópico' : 'tópicos'}
                  </span>
                </div>
              </div>
              
              <div className="overflow-x-auto -mx-3 sm:-mx-4 md:mx-0 scrollbar-thin scrollbar-thumb-blue-500 scrollbar-track-slate-200 dark:scrollbar-track-slate-700">
              <div className="min-w-full inline-block">
                <table className="w-full min-w-[500px] sm:min-w-[600px] md:min-w-[640px] border-collapse border border-black dark:border-slate-600 bg-white dark:bg-slate-800 text-xs sm:text-sm">
                  <thead>
                    <tr className="bg-blue-700 dark:bg-blue-800 text-white">
                      <th className="border border-black dark:border-slate-600 px-2 sm:px-3 md:px-4 py-2 sm:py-2.5 md:py-3 text-left font-bold text-[10px] sm:text-xs md:text-sm">
                        DISCIPLINAS
                      </th>
                      <th className="border border-black dark:border-slate-600 px-1.5 sm:px-2 md:px-3 py-2 sm:py-2.5 md:py-3 text-center font-bold text-[10px] sm:text-xs md:text-sm whitespace-nowrap">
                        <span className="hidden sm:inline">FlashCards</span>
                        <span className="sm:hidden">FC</span>
                      </th>
                      <th className="border border-black dark:border-slate-600 px-1.5 sm:px-2 md:px-3 py-2 sm:py-2.5 md:py-3 text-center font-bold text-[10px] sm:text-xs md:text-sm whitespace-nowrap">
                        <span className="hidden sm:inline">Questões</span>
                        <span className="sm:hidden">Q</span>
                      </th>
                      <th className="border border-black dark:border-slate-600 px-1.5 sm:px-2 md:px-3 py-2 sm:py-2.5 md:py-3 text-center font-bold text-[10px] sm:text-xs md:text-sm whitespace-nowrap">
                        <span className="hidden sm:inline">Estudado</span>
                        <span className="sm:hidden">Est.</span>
                      </th>
                      <th className="border border-black dark:border-slate-600 px-1.5 sm:px-2 md:px-3 py-2 sm:py-2.5 md:py-3 text-center font-bold text-[10px] sm:text-xs md:text-sm whitespace-nowrap">
                        <span className="hidden sm:inline">Revisões</span>
                        <span className="sm:hidden">Rev</span>
                      </th>
                      {profile?.role === 'admin' && (
                        <th className="border border-black dark:border-slate-600 px-1.5 sm:px-2 md:px-3 py-2 sm:py-2.5 md:py-3 text-center font-bold text-[10px] sm:text-xs md:text-sm whitespace-nowrap">
                          <span className="hidden sm:inline">Editar</span>
                          <span className="sm:hidden">Ed</span>
                        </th>
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
                      <tr className="bg-orange-500 dark:bg-orange-600 text-white font-bold">
                        <td className="border border-black dark:border-slate-600 px-2 sm:px-3 md:px-4 py-2 sm:py-2.5 md:py-3 text-[11px] sm:text-xs md:text-sm lg:text-base">
                          <span className="break-words">{disciplina.nome || 'Disciplina sem nome'}</span>
                          {disciplina.totalQuestoes && (
                            <span className="block sm:inline sm:ml-1 text-[10px] sm:text-xs">
                              ({disciplina.totalQuestoes} Questões)
                            </span>
                          )}
                        </td>
                        <td className="border border-black dark:border-slate-600 px-1.5 sm:px-2 md:px-3 py-2 sm:py-2.5 md:py-3 text-center"></td>
                        <td className="border border-black dark:border-slate-600 px-1.5 sm:px-2 md:px-3 py-2 sm:py-2.5 md:py-3 text-center"></td>
                        <td className="border border-black dark:border-slate-600 px-1.5 sm:px-2 md:px-3 py-2 sm:py-2.5 md:py-3 text-center"></td>
                        <td className="border border-black dark:border-slate-600 px-1.5 sm:px-2 md:px-3 py-2 sm:py-2.5 md:py-3 text-center"></td>
                        {profile?.role === 'admin' && (
                          <td className="border border-black dark:border-slate-600 px-1.5 sm:px-2 md:px-3 py-2 sm:py-2.5 md:py-3 text-center"></td>
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
                            <tr key={`${idx}-${topicoIdx}`} id={`topico-${idx}-${topicoIdx}`} className={`${isHighlighted ? 'ring-2 ring-yellow-400 dark:ring-yellow-500 bg-yellow-50 dark:bg-yellow-900/20' : ''} hover:bg-slate-50 dark:hover:bg-slate-700/50 bg-white dark:bg-slate-800`}>
                              <td 
                                className="border border-black dark:border-slate-600 px-2 sm:px-3 md:px-4 py-2 sm:py-2.5 text-slate-900 dark:text-white text-[11px] sm:text-xs md:text-sm break-words"
                                style={{ 
                                  paddingLeft: `${paddingLeft}px`
                                }}
                              >
                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                  <div className="min-w-0 flex-1">
                                    {topico.numero && <span className="font-medium whitespace-nowrap text-[10px] sm:text-xs">{topico.numero} </span>}
                                    <span className="break-words">{topico.nome || ''}</span>
                                  </div>
                                  {(() => {
                                    const topicKey = makeTopicKey(topico)
                                    // Validar que o topicKey não está vazio antes de criar o link
                                    if (!topicKey || topicKey.trim() === '') {
                                      return (
                                        <span className="inline-flex items-center gap-1 px-2 py-1.5 sm:py-1 rounded-md text-[10px] sm:text-xs font-semibold bg-slate-400 text-white cursor-not-allowed whitespace-nowrap flex-shrink-0" title="Tópico sem identificação válida">
                                          <BookOpenIcon className="h-3 w-3 sm:h-4 sm:w-4" />
                                          <span className="hidden sm:inline">Estudar</span>
                                          <span className="sm:hidden">Est.</span>
                                        </span>
                                      )
                                    }
                                    return (
                                      <Link
                                        to={`/conteudo-completo/topic/${courseId || 'alego-default'}/${topicKey}?nome=${encodeURIComponent(topico.nome || '')}`}
                                        className="inline-flex items-center gap-1 px-2 py-1.5 sm:py-1 rounded-md text-[10px] sm:text-xs font-semibold bg-alego-600 text-white hover:bg-alego-700 transition whitespace-nowrap flex-shrink-0 active:scale-95"
                                        title="Estudar conteúdo deste tópico"
                                      >
                                        <BookOpenIcon className="h-3 w-3 sm:h-4 sm:w-4" />
                                        <span className="hidden sm:inline">Estudar</span>
                                        <span className="sm:hidden">Est.</span>
                                      </Link>
                                    )
                                  })()}
                                </div>
                              </td>
                              <td className="border border-black dark:border-slate-600 px-1.5 sm:px-2 md:px-3 py-2 sm:py-2.5 text-center">
                                <input
                                  type="checkbox"
                                  checked={!!topico.flashcards}
                                  onChange={() => handleToggleCheckbox(idx, topicoIdx, 'flashcards')}
                                  className="w-5 h-5 sm:w-5 sm:h-5 md:w-4 md:h-4 text-blue-600 bg-white dark:bg-slate-700 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-slate-800 focus:ring-2 dark:border-slate-600 cursor-pointer touch-manipulation"
                                  style={{ touchAction: 'manipulation' }}
                                />
                              </td>
                              <td className="border border-black dark:border-slate-600 px-1.5 sm:px-2 md:px-3 py-2 sm:py-2.5 text-center">
                                <input
                                  type="checkbox"
                                  checked={!!topico.questoes}
                                  onChange={() => handleToggleCheckbox(idx, topicoIdx, 'questoes')}
                                  className="w-5 h-5 sm:w-5 sm:h-5 md:w-4 md:h-4 text-blue-600 bg-white dark:bg-slate-700 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-slate-800 focus:ring-2 dark:border-slate-600 cursor-pointer touch-manipulation"
                                  style={{ touchAction: 'manipulation' }}
                                />
                              </td>
                              <td className="border border-black dark:border-slate-600 px-1.5 sm:px-2 md:px-3 py-2 sm:py-2.5 text-center">
                                <input
                                  type="checkbox"
                                  checked={!!topico.estudado}
                                  onChange={() => handleToggleCheckbox(idx, topicoIdx, 'estudado')}
                                  className="w-5 h-5 sm:w-5 sm:h-5 md:w-4 md:h-4 text-blue-600 bg-white dark:bg-slate-700 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-slate-800 focus:ring-2 dark:border-slate-600 cursor-pointer touch-manipulation"
                                  style={{ touchAction: 'manipulation' }}
                                />
                              </td>
                              <td className="border border-black dark:border-slate-600 px-1.5 sm:px-2 md:px-3 py-2 sm:py-2.5 text-center">
                                <input
                                  type="checkbox"
                                  checked={!!topico.revisoes}
                                  onChange={() => handleToggleCheckbox(idx, topicoIdx, 'revisoes')}
                                  className="w-5 h-5 sm:w-5 sm:h-5 md:w-4 md:h-4 text-blue-600 bg-white dark:bg-slate-700 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-slate-800 focus:ring-2 dark:border-slate-600 cursor-pointer touch-manipulation"
                                  style={{ touchAction: 'manipulation' }}
                                />
                              </td>
                              {profile?.role === 'admin' && (
                                <td className="border border-black dark:border-slate-600 px-1.5 sm:px-2 md:px-3 py-2 sm:py-2.5 text-center">
                                  <button
                                    onClick={() => handleEditTopico(idx, topicoIdx)}
                                    className="inline-flex items-center justify-center p-1.5 sm:p-2 text-blue-600 hover:text-blue-800 hover:bg-blue-50 dark:hover:text-blue-400 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                                    title="Editar tópico"
                                  >
                                    <PencilIcon className="h-4 w-4 sm:h-5 sm:w-5" />
                                  </button>
                                </td>
                              )}
                            </tr>
                          )
                        })}
                    </React.Fragment>
                      )
                    })}
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
                  className="border-l-4 border-indigo-500 pl-3 sm:pl-4 md:pl-6 py-3 sm:py-4 bg-slate-50 dark:bg-slate-700/50 rounded-r-lg"
                >
                  <h2 className="text-base sm:text-lg md:text-xl font-bold text-slate-900 dark:text-white mb-2 sm:mb-3 break-words">
                    {secao.titulo}
                  </h2>
                  {secao.subtitulo && (
                    <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mb-2 sm:mb-3 break-words">
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
                      <div className="text-xs sm:text-sm md:text-base text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed break-words">
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
                          className="border-l-2 border-slate-300 dark:border-slate-600 pl-2 sm:pl-4"
                        >
                          <h3 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white mb-1 sm:mb-2 break-words">
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
                              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap break-words">
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
              <BookOpenIcon className="h-12 w-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
              <p className="text-slate-500 dark:text-slate-400">
                Conteúdo ainda não disponível.
              </p>
            </div>
          )}

          {/* Footer */}
          {editalVerticalizado.updatedAt && (
            <div className="mt-4 sm:mt-6 md:mt-8 pt-4 sm:pt-6 border-t border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400">
              Última atualização: {editalVerticalizado.updatedAt.toDate?.().toLocaleDateString('pt-BR') || 'Data não disponível'}
            </div>
          )}
        </div>
      </div>

      {/* Modal de Edição de Tópico */}
      {editModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                Editar Tópico
              </h3>
              <button
                onClick={handleCancelEdit}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Numeração
                </label>
                <input
                  type="text"
                  value={editNumero}
                  onChange={(e) => setEditNumero(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-alego-500 focus:border-alego-500 dark:bg-slate-700 dark:text-white"
                  placeholder="Ex: 1.1, 1.2.3, etc."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Nome do Tópico
                </label>
                <input
                  type="text"
                  value={editNome}
                  onChange={(e) => setEditNome(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-alego-500 focus:border-alego-500 dark:bg-slate-700 dark:text-white"
                  placeholder="Nome do tópico"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleCancelEdit}
                className="flex-1 px-4 py-2 text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg font-medium transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveTopico}
                disabled={editLoading || !editNome.trim()}
                className="flex-1 px-4 py-2 bg-alego-600 text-white rounded-lg font-medium hover:bg-alego-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
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
    </div>
  )
}

export default EditalVerticalizado

