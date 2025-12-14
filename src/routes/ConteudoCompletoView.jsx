import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import { ArrowLeftIcon } from '@heroicons/react/24/outline'
import { db } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'
import { useDarkMode } from '../hooks/useDarkMode.jsx'

const ConteudoCompletoView = () => {
  const { conteudoId } = useParams()
  const { profile } = useAuth()
  const { darkMode } = useDarkMode()
  const [conteudo, setConteudo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [courseName, setCourseName] = useState('')

  const courseId = profile?.selectedCourseId || 'alego-default'

  // Carregar nome do curso
  useEffect(() => {
    const loadCourseName = async () => {
      try {
        const courseDoc = await getDoc(doc(db, 'courses', courseId))
        if (courseDoc.exists()) {
          const data = courseDoc.data()
          setCourseName(data.name || data.competition || 'Curso Preparatório')
        } else {
          setCourseName('Curso Preparatório')
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err)
        if (import.meta.env.DEV) {
          console.error('Erro ao carregar nome do curso:', errorMessage)
        }
        setCourseName('Curso Preparatório')
      }
    }

    if (courseId && db) {
      loadCourseName()
    }
  }, [courseId])

  // Função para substituir referências ao concurso pelo nome do curso
  const replaceConcursoWithCourse = (text) => {
    if (!text || !courseName) return text
    
    return text
      // Substituir "Legislação Especial para o Concurso da [qualquer coisa]" por "Legislação Especial para o [curso]"
      .replace(/Legislação Especial para o Concurso da [^<)]+/gi, `Legislação Especial para o ${courseName}`)
      // Substituir "Câmara Municipal de [qualquer coisa]" por nome do curso
      .replace(/Câmara Municipal de [^<)]+/gi, courseName)
      // Substituir "Concurso da Câmara Municipal de [qualquer coisa]" por nome do curso
      .replace(/Concurso da Câmara Municipal de [^<)]+/gi, courseName)
      // Substituir "Concurso público da [qualquer coisa]" por nome do curso
      .replace(/Concurso público da [^<)]+/gi, courseName)
      // Substituir "concurso público da [qualquer coisa]" por nome do curso
      .replace(/concurso público da [^<)]+/gi, courseName)
      // Remover padrões como "(Cargos 401 e 402)" ou "(Policial Penal)"
      .replace(/\s*\(Cargos?\s+\d+[^)]*\)/gi, '')
      .replace(/\s*\([^)]*Policial[^)]*\)/gi, '')
      // Substituir "para os cargos [qualquer coisa]" por nome do curso
      .replace(/para os cargos [^<)]+/gi, `para o ${courseName}`)
      .replace(/para o cargo [^<)]+/gi, `para o ${courseName}`)
      // Remover referências específicas como "- MG" ou outros estados
      .replace(/\s*-\s*[A-Z]{2}\s*/gi, ' ')
      // Limpar espaços duplos
      .replace(/\s{2,}/g, ' ')
      .trim()
  }

  useEffect(() => {
    if (!conteudoId || !courseId) {
      setError('Conteúdo não encontrado')
      setLoading(false)
      return
    }

    const loadConteudo = async () => {
      try {
        setLoading(true)
        setError('')
        const conteudoRef = doc(db, 'courses', courseId, 'conteudosCompletos', conteudoId)
        const conteudoDoc = await getDoc(conteudoRef)

        if (!conteudoDoc.exists()) {
          setError('Conteúdo completo não encontrado')
          setLoading(false)
          return
        }

        setConteudo({
          id: conteudoDoc.id,
          ...conteudoDoc.data(),
        })
        setLoading(false)
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err)
        if (import.meta.env.DEV) {
          console.error('Erro ao carregar conteúdo completo:', errorMessage)
        }
        setError('Erro ao carregar conteúdo. Tente novamente.')
        setLoading(false)
      }
    }

    if (courseId && db) {
      loadConteudo()
    } else {
      setLoading(false)
    }
  }, [conteudoId, courseId])

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-alego-600 border-t-transparent"></div>
          <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">Carregando conteúdo completo...</p>
        </div>
      </div>
    )
  }

  if (error || !conteudo) {
    return (
      <div className="max-w-4xl mx-auto p-4">
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-8 text-center">
          <h2 className="text-2xl font-bold text-red-600 dark:text-red-400 mb-4">
            {error || 'Conteúdo não encontrado'}
          </h2>
          <Link
            to="/conteudo-completo"
            className="inline-flex items-center gap-2 px-4 py-2 bg-alego-600 text-white rounded-lg hover:bg-alego-700 transition"
          >
            <ArrowLeftIcon className="w-5 h-5" />
            Voltar para Conteúdos Completos
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 lg:p-8">
      {/* Botão Voltar */}
      <Link
        to="/conteudo-completo"
        className="inline-flex items-center gap-2 mb-6 text-alego-600 dark:text-alego-400 hover:text-alego-700 dark:hover:text-alego-300 transition"
      >
        <ArrowLeftIcon className="w-5 h-5" />
        <span>Voltar para Conteúdos Completos</span>
      </Link>

      {/* Conteúdo Principal */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-6 sm:p-8 lg:p-10">
        {/* Título */}
        <div className="mb-8 pb-6 border-b border-slate-200 dark:border-slate-700">
          <h1 className="text-3xl sm:text-4xl font-bold text-alego-600 dark:text-alego-400 mb-3">
            {conteudo.materia || conteudo.titulo || 'Conteúdo Completo'}
          </h1>
          {conteudo.titulo && conteudo.titulo !== conteudo.materia && (
            <h2 className="text-2xl sm:text-3xl font-semibold text-slate-700 dark:text-slate-300 mb-2">
              {conteudo.titulo}
            </h2>
          )}
          {conteudo.subtitulo && (
            <p className="text-lg text-slate-600 dark:text-slate-400 italic">
              {replaceConcursoWithCourse(conteudo.subtitulo)}
            </p>
          )}
        </div>

        {/* Conteúdo */}
        <div className="prose prose-lg dark:prose-invert max-w-none">
          {/* Informação sobre o curso */}
          {courseName && (
            <div className="mb-6 p-4 bg-alego-50 dark:bg-alego-900/20 border-l-4 border-alego-500 rounded-r-lg">
              <p className="text-slate-700 dark:text-slate-300 text-base leading-relaxed">
                <strong>Este material foi elaborado com base no edital do curso preparatório <span className="text-alego-600 dark:text-alego-400 font-semibold">{courseName}</span> que você está estudando.</strong> O objetivo é fornecer um conteúdo completo e detalhado, utilizando linguagem técnica e formal, adequado para a preparação do candidato.
              </p>
            </div>
          )}
          
          {/* Conteúdo principal em HTML */}
          {conteudo.content && (
            <div 
              className="mb-8 text-slate-700 dark:text-slate-300"
              dangerouslySetInnerHTML={{ __html: replaceConcursoWithCourse(conteudo.content) }}
            />
          )}
          
          {/* Seções adicionais */}
          {conteudo.secoes && Array.isArray(conteudo.secoes) && conteudo.secoes.length > 0 && (
            <div className="space-y-8 mt-8">
              {conteudo.secoes.map((secao, index) => (
                <div 
                  key={index} 
                  className="border-l-4 border-alego-500 pl-6 py-3 bg-slate-50 dark:bg-slate-900/50 rounded-r-lg"
                >
                  <h3 className="text-xl sm:text-2xl font-semibold text-alego-600 dark:text-alego-400 mb-3">
                    {secao.titulo || `Seção ${index + 1}`}
                    {secao.tipo && (
                      <span className="ml-3 text-sm bg-alego-100 dark:bg-alego-900 text-alego-700 dark:text-alego-300 px-3 py-1 rounded-full">
                        {secao.tipo}
                      </span>
                    )}
                  </h3>
                  {secao.conteudo && (
                    <div 
                      className="text-slate-700 dark:text-slate-300"
                      dangerouslySetInnerHTML={{ __html: replaceConcursoWithCourse(secao.conteudo) }}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
          
          {/* Tags */}
          {conteudo.tags && Array.isArray(conteudo.tags) && conteudo.tags.length > 0 && (
            <div className="mt-10 pt-6 border-t border-slate-200 dark:border-slate-700">
              <h4 className="text-sm font-semibold text-slate-600 dark:text-slate-400 mb-3 uppercase tracking-wide">
                Tags
              </h4>
              <div className="flex flex-wrap gap-2">
                {conteudo.tags.map((tag, index) => (
                  <span
                    key={index}
                    className="px-4 py-2 bg-alego-100 dark:bg-alego-900 text-alego-700 dark:text-alego-300 rounded-full text-sm font-medium"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Referências */}
          {conteudo.referencias && Array.isArray(conteudo.referencias) && conteudo.referencias.length > 0 && (
            <div className="mt-10 pt-6 border-t border-slate-200 dark:border-slate-700">
              <h4 className="text-lg font-semibold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                <span>📚</span>
                Referências e Fontes
              </h4>
              <div className="space-y-3">
                {conteudo.referencias.map((ref, index) => (
                  <div
                    key={index}
                    className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 mt-1">
                        <span className="text-xl">🔗</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h5 className="font-semibold text-slate-800 dark:text-white mb-1">
                          {ref.titulo}
                        </h5>
                        {ref.descricao && (
                          <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
                            {ref.descricao}
                          </p>
                        )}
                        {ref.url && (
                          <a
                            href={ref.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-alego-600 dark:text-alego-400 hover:text-alego-700 dark:hover:text-alego-300 underline break-all"
                          >
                            {ref.url}
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Fallback: se não houver conteúdo estruturado */}
          {!conteudo.content && (!conteudo.secoes || conteudo.secoes.length === 0) && (
            <div className="mb-4">
              <p className="text-slate-500 dark:text-slate-400 mb-4">
                Conteúdo em formato não estruturado:
              </p>
              <pre className="text-sm bg-slate-100 dark:bg-slate-900 p-6 rounded-lg overflow-auto max-h-96 border border-slate-200 dark:border-slate-700">
                {JSON.stringify(conteudo, null, 2)}
              </pre>
            </div>
          )}
        </div>

        {/* Botão Voltar no final */}
        <div className="mt-12 pt-8 border-t border-slate-200 dark:border-slate-700">
          <Link
            to="/conteudo-completo"
            className="inline-flex items-center gap-2 px-6 py-3 bg-alego-600 text-white rounded-lg hover:bg-alego-700 transition font-semibold"
          >
            <ArrowLeftIcon className="w-5 h-5" />
            Voltar para Conteúdos Completos
          </Link>
        </div>
      </div>
    </div>
  )
}

export default ConteudoCompletoView

