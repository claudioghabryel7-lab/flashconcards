import React, { useEffect, useState } from 'react'
import { useSearchParams, Link, useNavigate } from 'react-router-dom'
import { doc, onSnapshot, getDoc, updateDoc } from 'firebase/firestore'
import {
  DocumentTextIcon,
  ChevronLeftIcon,
  BookOpenIcon,
} from '@heroicons/react/24/outline'
import { db } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'
import { useDarkMode } from '../hooks/useDarkMode.jsx'

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

const EditalVerticalizado = () => {
  const { user, profile } = useAuth()
  const { darkMode } = useDarkMode()
  const [searchParams] = useSearchParams()
  const [editalVerticalizado, setEditalVerticalizado] = useState(null)
  const [loading, setLoading] = useState(true)
  const [courseId, setCourseId] = useState(null)
  const [courseName, setCourseName] = useState('')

  // Determinar courseId
  useEffect(() => {
    const courseFromUrl = searchParams.get('course')
    const courseFromProfile = profile?.selectedCourseId
    
    const finalCourseId = courseFromUrl || courseFromProfile || 'alego-default'
    setCourseId(finalCourseId)
  }, [searchParams, profile])

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
      setLoading(false)
      return
    }

    const editalRef = doc(db, 'courses', courseId, 'editalVerticalizado', 'principal')
    const unsub = onSnapshot(
      editalRef,
      (snapshot) => {
        if (snapshot.exists()) {
          setEditalVerticalizado(snapshot.data())
        } else {
          setEditalVerticalizado(null)
        }
        setLoading(false)
      },
      (error) => {
        console.error('Erro ao carregar edital verticalizado:', error)
        setEditalVerticalizado(null)
        setLoading(false)
      }
    )

    return () => unsub()
  }, [courseId])

  // Função para atualizar checkbox do tópico
  const handleToggleCheckbox = async (disciplinaIdx, topicoIdx, campo) => {
    if (!courseId || !editalVerticalizado?.disciplinas) return

    try {
      const editalRef = doc(db, 'courses', courseId, 'editalVerticalizado', 'principal')
      const disciplinas = [...editalVerticalizado.disciplinas]
      const topico = disciplinas[disciplinaIdx].topicos[topicoIdx]
      
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
    } catch (error) {
      console.error('Erro ao atualizar checkbox:', error)
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
                {editalVerticalizado.titulo || 'Edital Verticalizado'}
              </h1>
              {courseName && (
                <p className="text-xs sm:text-sm md:text-base text-slate-600 dark:text-slate-400 mt-1 break-words">
                  {courseName}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Conteúdo Principal */}
        <div className={`bg-white dark:bg-slate-800 rounded-xl sm:rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 p-3 sm:p-4 md:p-6 lg:p-8`}>
          {editalVerticalizado.descricao && (
            <div className="mb-4 sm:mb-6 pb-4 sm:pb-6 border-b border-slate-200 dark:border-slate-700">
              <p className="text-xs sm:text-sm md:text-base text-slate-600 dark:text-slate-400 leading-relaxed break-words">
                {editalVerticalizado.descricao}
              </p>
            </div>
          )}

          {/* Tabela de Edital Verticalizado */}
          {editalVerticalizado?.disciplinas && Array.isArray(editalVerticalizado.disciplinas) && editalVerticalizado.disciplinas.length > 0 ? (
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
                        Dia
                      </th>
                      <th className="border border-black dark:border-slate-600 px-1.5 sm:px-2 md:px-3 py-2 sm:py-2.5 md:py-3 text-center font-bold text-[10px] sm:text-xs md:text-sm whitespace-nowrap">
                        <span className="hidden sm:inline">Revisões</span>
                        <span className="sm:hidden">Rev</span>
                      </th>
                    </tr>
                  </thead>
                <tbody>
                  {editalVerticalizado.disciplinas.map((disciplina, idx) => (
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
                      </tr>
                      
                      {/* Tópicos da disciplina */}
                      {disciplina.topicos && Array.isArray(disciplina.topicos) && disciplina.topicos.length > 0 && disciplina.topicos
                        .filter(topico => topico && (topico.nome || topico.numero)) // Filtrar tópicos inválidos
                        .map((topico, topicoIdx) => {
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
                          
                          return (
                            <tr key={`${idx}-${topicoIdx}`} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 bg-white dark:bg-slate-800">
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
                                  checked={!!topico.dia}
                                  onChange={() => handleToggleCheckbox(idx, topicoIdx, 'dia')}
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
                            </tr>
                          )
                        })}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
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
                    <div
                      className="prose prose-slate dark:prose-invert max-w-none text-xs sm:text-sm md:text-base text-slate-700 dark:text-slate-300 prose-headings:text-sm sm:prose-headings:text-base md:prose-headings:text-lg"
                      dangerouslySetInnerHTML={{ __html: secao.conteudo }}
                    />
                  ) : secao.texto ? (
                    <div className="text-xs sm:text-sm md:text-base text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed break-words">
                      {secao.texto}
                    </div>
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
                            <div
                              className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 break-words"
                              dangerouslySetInnerHTML={{ __html: subsecao.conteudo }}
                            />
                          ) : subsecao.texto ? (
                            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap break-words">
                              {subsecao.texto}
                            </p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : editalVerticalizado?.conteudo ? (
            <div className="prose prose-slate dark:prose-invert max-w-none">
              <div
                className="text-slate-700 dark:text-slate-300 leading-relaxed"
                dangerouslySetInnerHTML={{ __html: editalVerticalizado.conteudo }}
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
    </div>
  )
}

export default EditalVerticalizado

