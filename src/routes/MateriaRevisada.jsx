import { useEffect, useState, useMemo } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { collection, doc, getDoc, onSnapshot, query, where } from 'firebase/firestore'
import {
  BookOpenIcon,
  DocumentTextIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  AcademicCapIcon,
  ScaleIcon,
  LightBulbIcon,
} from '@heroicons/react/24/outline'
import { db } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'
import { useDarkMode } from '../hooks/useDarkMode.jsx'
import { useSubjectOrder } from '../hooks/useSubjectOrder'
import { applySubjectOrder } from '../utils/subjectOrder'
import { FolderIcon } from '@heroicons/react/24/outline'

const MateriaRevisada = () => {
  const { user, profile } = useAuth()
  const { darkMode } = useDarkMode()
  const [searchParams, setSearchParams] = useSearchParams()
  const [materiasContent, setMateriasContent] = useState({})
  const [loading, setLoading] = useState(true)
  const [selectedMateria, setSelectedMateria] = useState(null)
  const [expandedMaterias, setExpandedMaterias] = useState({})
  const [selectedCourseId, setSelectedCourseId] = useState(null)
  const { subjectOrder } = useSubjectOrder()

  // Carregar curso selecionado
  useEffect(() => {
    if (!profile) return
    
    const courseFromProfile = profile.selectedCourseId !== undefined ? profile.selectedCourseId : null
    setSelectedCourseId(courseFromProfile || 'alego-default')
  }, [profile])

  // Carregar conteúdo das matérias
  useEffect(() => {
    if (!user || !selectedCourseId) {
      setLoading(false)
      return
    }

    const courseId = selectedCourseId || 'alego-default'
    const materiasRef = collection(db, 'courses', courseId, 'materiasRevisadas')
    
    const unsub = onSnapshot(
      materiasRef,
      (snapshot) => {
        const content = {}
        snapshot.docs.forEach((doc) => {
          const data = doc.data()
          content[data.materia] = {
            id: doc.id,
            ...data,
          }
        })
        setMateriasContent(content)
        setLoading(false)
      },
      (error) => {
        console.error('Erro ao carregar matérias revisadas:', error)
        setLoading(false)
      }
    )

    return () => unsub()
  }, [user, selectedCourseId])

  // Selecionar matéria da URL
  useEffect(() => {
    const materiaParam = searchParams.get('materia')
    if (materiaParam && materiasContent[materiaParam]) {
      setSelectedMateria(materiaParam)
    }
  }, [searchParams, materiasContent])

  // Obter lista de matérias disponíveis
  const materiasList = useMemo(() => {
    const materias = Object.keys(materiasContent)
    if (subjectOrder?.order) {
      return applySubjectOrder(materias, subjectOrder)
    }
    return materias.sort()
  }, [materiasContent, subjectOrder])

  const toggleMateria = (materia) => {
    setExpandedMaterias((prev) => ({
      ...prev,
      [materia]: !prev[materia],
    }))
  }

  const selectMateria = (materia) => {
    setSelectedMateria(materia)
    setSearchParams({ materia })
  }

  const currentContent = selectedMateria ? materiasContent[selectedMateria] : null

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-alego-600 border-t-transparent"></div>
          <p className="mt-4 text-lg font-semibold text-alego-600">Carregando matérias revisadas...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen py-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl">
              <BookOpenIcon className="h-8 w-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white">
                Matéria Revisada
              </h1>
              <p className="text-slate-600 dark:text-slate-400 mt-1">
                Conteúdo completo e técnico por matéria
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Sidebar - Lista de Matérias */}
          <div className="lg:col-span-1">
            <div className={`bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 p-6 sticky top-6`}>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                <AcademicCapIcon className="h-5 w-5 text-alego-600" />
                Matérias Disponíveis
              </h2>
              
              {materiasList.length === 0 ? (
                <div className="text-center py-8">
                  <DocumentTextIcon className="h-12 w-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Nenhuma matéria revisada disponível ainda.
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
                    O administrador precisa adicionar conteúdo revisado.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {materiasList.map((materia) => {
                    const isSelected = selectedMateria === materia
                    const content = materiasContent[materia]
                    
                    return (
                      <button
                        key={materia}
                        onClick={() => selectMateria(materia)}
                        className={`w-full text-left p-3 rounded-xl transition-all ${
                          isSelected
                            ? 'bg-gradient-to-r from-alego-600 to-alego-700 text-white shadow-lg'
                            : 'bg-slate-50 dark:bg-slate-700/50 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-sm">{materia}</span>
                          {isSelected && (
                            <ChevronRightIcon className="h-5 w-5" />
                          )}
                        </div>
                        {content?.updatedAt && (
                          <p className={`text-xs mt-1 ${isSelected ? 'text-white/80' : 'text-slate-500 dark:text-slate-400'}`}>
                            Atualizado recentemente
                          </p>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Conteúdo Principal */}
          <div className="lg:col-span-2">
            {!selectedMateria ? (
              <div className={`bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 p-12 text-center`}>
                <BookOpenIcon className="h-16 w-16 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
                  Selecione uma Matéria
                </h3>
                <p className="text-slate-600 dark:text-slate-400">
                  Escolha uma matéria no menu lateral para ver o conteúdo completo e técnico.
                </p>
              </div>
            ) : currentContent ? (
              <div className={`bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 p-6 sm:p-8`}>
                {/* Header da Matéria */}
                <div className="mb-6 pb-6 border-b border-slate-200 dark:border-slate-700">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white mb-2">
                        {selectedMateria}
                      </h2>
                      {currentContent.subtitle && (
                        <p className="text-slate-600 dark:text-slate-400">
                          {currentContent.subtitle}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {currentContent.tags?.map((tag, idx) => (
                        <span
                          key={idx}
                          className="px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-xs font-semibold"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Conteúdo Principal */}
                <div className="prose prose-slate dark:prose-invert max-w-none">
                  {currentContent.content ? (
                    <div
                      className="text-slate-700 dark:text-slate-300 leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: currentContent.content }}
                    />
                  ) : currentContent.text ? (
                    <div className="whitespace-pre-wrap text-slate-700 dark:text-slate-300 leading-relaxed">
                      {currentContent.text}
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <DocumentTextIcon className="h-12 w-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                      <p className="text-slate-500 dark:text-slate-400">
                        Conteúdo ainda não disponível para esta matéria.
                      </p>
                    </div>
                  )}
                </div>

                {/* Seções Adicionais */}
                {currentContent.secoes && currentContent.secoes.length > 0 && (
                  <div className="mt-8 space-y-6">
                    {currentContent.secoes.map((secao, idx) => (
                      <div
                        key={idx}
                        className="border-t border-slate-200 dark:border-slate-700 pt-6"
                      >
                        <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                          {secao.tipo === 'lei' && <ScaleIcon className="h-5 w-5 text-blue-600" />}
                          {secao.tipo === 'sumula' && <LightBulbIcon className="h-5 w-5 text-amber-600" />}
                          {secao.tipo === 'entendimento' && <AcademicCapIcon className="h-5 w-5 text-green-600" />}
                          {secao.titulo}
                        </h3>
                        <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4 mt-3">
                          {secao.conteudo ? (
                            <div
                              className="text-slate-700 dark:text-slate-300"
                              dangerouslySetInnerHTML={{ __html: secao.conteudo }}
                            />
                          ) : (
                            <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                              {secao.texto}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Footer */}
                {currentContent.updatedAt && (
                  <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400">
                    Última atualização: {currentContent.updatedAt.toDate?.().toLocaleDateString('pt-BR') || 'Data não disponível'}
                  </div>
                )}
              </div>
            ) : (
              <div className={`bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 p-12 text-center`}>
                <DocumentTextIcon className="h-16 w-16 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
                  Conteúdo não encontrado
                </h3>
                <p className="text-slate-600 dark:text-slate-400">
                  O conteúdo para esta matéria ainda não foi adicionado.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default MateriaRevisada

