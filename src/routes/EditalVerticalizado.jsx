import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { doc, onSnapshot, getDoc } from 'firebase/firestore'
import {
  DocumentTextIcon,
  ChevronLeftIcon,
  BookOpenIcon,
} from '@heroicons/react/24/outline'
import { db } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'
import { useDarkMode } from '../hooks/useDarkMode.jsx'
import { Link } from 'react-router-dom'

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
    <div className="min-h-screen py-6">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-alego-600 dark:hover:text-alego-400 mb-4"
          >
            <ChevronLeftIcon className="h-5 w-5" />
            Voltar ao Dashboard
          </Link>
          
          <div className="flex items-center gap-3">
            <div className="p-3 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl">
              <DocumentTextIcon className="h-8 w-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white">
                {editalVerticalizado.titulo || 'Edital Verticalizado'}
              </h1>
              {courseName && (
                <p className="text-slate-600 dark:text-slate-400 mt-1">
                  {courseName}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Conteúdo Principal */}
        <div className={`bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 p-6 sm:p-8`}>
          {editalVerticalizado.descricao && (
            <div className="mb-6 pb-6 border-b border-slate-200 dark:border-slate-700">
              <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                {editalVerticalizado.descricao}
              </p>
            </div>
          )}

          {/* Seções Organizadas */}
          {editalVerticalizado.secoes && editalVerticalizado.secoes.length > 0 ? (
            <div className="space-y-6">
              {editalVerticalizado.secoes.map((secao, idx) => (
                <div
                  key={idx}
                  className="border-l-4 border-indigo-500 pl-6 py-4 bg-slate-50 dark:bg-slate-700/50 rounded-r-lg"
                >
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-3">
                    {secao.titulo}
                  </h2>
                  {secao.subtitulo && (
                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
                      {secao.subtitulo}
                    </p>
                  )}
                  {secao.conteudo ? (
                    <div
                      className="prose prose-slate dark:prose-invert max-w-none text-slate-700 dark:text-slate-300"
                      dangerouslySetInnerHTML={{ __html: secao.conteudo }}
                    />
                  ) : secao.texto ? (
                    <div className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                      {secao.texto}
                    </div>
                  ) : null}
                  
                  {/* Subseções */}
                  {secao.subsecoes && secao.subsecoes.length > 0 && (
                    <div className="mt-4 space-y-4 ml-4">
                      {secao.subsecoes.map((subsecao, subIdx) => (
                        <div
                          key={subIdx}
                          className="border-l-2 border-slate-300 dark:border-slate-600 pl-4"
                        >
                          <h3 className="font-semibold text-slate-900 dark:text-white mb-2">
                            {subsecao.titulo}
                          </h3>
                          {subsecao.conteudo ? (
                            <div
                              className="text-sm text-slate-600 dark:text-slate-300"
                              dangerouslySetInnerHTML={{ __html: subsecao.conteudo }}
                            />
                          ) : subsecao.texto ? (
                            <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap">
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
          ) : editalVerticalizado.conteudo ? (
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
            <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400">
              Última atualização: {editalVerticalizado.updatedAt.toDate?.().toLocaleDateString('pt-BR') || 'Data não disponível'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default EditalVerticalizado

