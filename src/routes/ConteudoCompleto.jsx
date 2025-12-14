import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, query, getDocs, orderBy } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'
import { useDarkMode } from '../hooks/useDarkMode.jsx'

const ConteudoCompleto = () => {
  const { profile } = useAuth()
  const { darkMode } = useDarkMode()
  const navigate = useNavigate()
  const [conteudos, setConteudos] = useState([])
  const [loading, setLoading] = useState(true)

  const courseId = profile?.selectedCourseId || 'alego-default'

  useEffect(() => {
    const loadConteudos = async () => {
      try {
        setLoading(true)
        const conteudosRef = collection(db, 'courses', courseId, 'conteudosCompletos')
        
        // Tentar com orderBy primeiro, se falhar, buscar sem orderBy
        let snapshot
        try {
          const conteudosQuery = query(conteudosRef, orderBy('materia', 'asc'))
          snapshot = await getDocs(conteudosQuery)
        } catch (orderByError) {
          // Se falhar (provavelmente falta índice), buscar sem orderBy e ordenar localmente
          if (import.meta.env.DEV) {
            console.warn('orderBy falhou, buscando sem ordenação:', orderByError)
          }
          snapshot = await getDocs(conteudosRef)
        }
        
        const conteudosData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }))
        
        // Ordenar localmente por nome da matéria se não foi possível usar orderBy
        conteudosData.sort((a, b) => {
          const nomeA = (a.materia || '').toLowerCase()
          const nomeB = (b.materia || '').toLowerCase()
          return nomeA.localeCompare(nomeB)
        })
        
        setConteudos(conteudosData)
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        if (import.meta.env.DEV) {
          console.error('Erro ao carregar conteúdos completos:', errorMessage)
        }
        setConteudos([]) // Definir array vazio em caso de erro
      } finally {
        setLoading(false)
      }
    }

    if (courseId && db) {
      loadConteudos()
    } else {
      setLoading(false)
    }
  }, [courseId])

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-alego-600 border-t-transparent"></div>
          <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">Carregando conteúdos completos...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-6">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-alego-600 dark:text-alego-400 mb-2">
          📚 Conteúdo Completo de Matérias
        </h1>
        <p className="text-slate-600 dark:text-slate-400">
          Material completo e detalhado de todas as matérias baseado no edital do concurso
        </p>
      </div>

      {conteudos.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-slate-800 rounded-xl shadow-lg">
          <p className="text-slate-600 dark:text-slate-400">
            Nenhum conteúdo completo disponível ainda.
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-500 mt-2">
            O administrador ainda não gerou conteúdos completos para este curso.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {conteudos.map((conteudo) => (
            <div
              key={conteudo.id}
              className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-6 cursor-pointer hover:shadow-xl transition-all hover:scale-105"
              onClick={() => navigate(`/conteudo-completo/${conteudo.id}`)}
            >
              <h3 className="text-xl font-bold text-alego-600 dark:text-alego-400 mb-2">
                {conteudo.materia}
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
                Clique para ver o conteúdo completo
              </p>
              {conteudo.titulo && (
                <p className="text-xs text-slate-400 dark:text-slate-500 italic truncate">
                  {conteudo.titulo}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default ConteudoCompleto

