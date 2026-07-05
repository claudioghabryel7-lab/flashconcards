import { readEnv, isDevEnv } from '@/lib/env.js'
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'
import { useDarkMode } from '../hooks/useDarkMode.jsx'

const MateriaRevisada = () => {
  const { profile } = useAuth()
  const { darkMode } = useDarkMode()
  const navigate = useNavigate()
  const [materias, setMaterias] = useState([])
  const [loading, setLoading] = useState(true)

  const courseId = profile?.selectedCourseId || 'alego-default'

  useEffect(() => {
    const loadMaterias = async () => {
      try {
        setLoading(true)
        const materiasRef = collection(db, 'courses', courseId, 'materiasRevisadas')
        
        // Tentar com orderBy primeiro, se falhar, buscar sem orderBy
        let snapshot
        try {
          const materiasQuery = query(materiasRef, orderBy('materia', 'asc'))
          snapshot = await getDocs(materiasQuery)
        } catch (orderByError) {
          // Se falhar (provavelmente falta índice), buscar sem orderBy e ordenar localmente
          if (isDevEnv()) {
            console.warn('orderBy falhou, buscando sem ordenação:', orderByError)
          }
          snapshot = await getDocs(materiasRef)
        }
        
        const materiasData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }))
        
        // Ordenar localmente por nome da matéria se não foi possível usar orderBy
        materiasData.sort((a, b) => {
          const nomeA = (a.materia || '').toLowerCase()
          const nomeB = (b.materia || '').toLowerCase()
          return nomeA.localeCompare(nomeB)
        })
        
        setMaterias(materiasData)
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        if (isDevEnv()) {
          console.error('Erro ao carregar matérias revisadas:', errorMessage)
        }
        setMaterias([]) // Definir array vazio em caso de erro
      } finally {
        setLoading(false)
      }
    }

    if (courseId && db) {
      loadMaterias()
    } else {
      setLoading(false)
    }
  }, [courseId])

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-alego-600 border-t-transparent"></div>
          <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">Carregando matérias revisadas...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {materias.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-slate-800 rounded-xl shadow-lg">
          <p className="text-slate-600 dark:text-slate-400">
            Nenhuma matéria revisada disponível ainda.
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-500 mt-2">
            O administrador ainda não gerou matérias revisadas para este curso.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {materias.map((materia) => (
            <div
              key={materia.id}
              className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-6 cursor-pointer hover:shadow-xl transition-all hover:scale-105"
              onClick={() => navigate(`/materia-revisada/${materia.id}`)}
            >
              <h3 className="text-xl font-bold text-alego-600 dark:text-alego-400 mb-2">
                {materia.materia}
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
                Clique para ver detalhes completos
              </p>
              {materia.titulo && (
                <p className="text-xs text-slate-400 dark:text-slate-500 italic truncate">
                  {materia.titulo}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default MateriaRevisada

