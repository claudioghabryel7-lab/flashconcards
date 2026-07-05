import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, getDocs, orderBy, query, where } from 'firebase/firestore'
import { BookOpenIcon, ChevronRightIcon } from '@heroicons/react/24/outline'
import { db } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'
import { isContentAvailable, CONTENT_STATUS } from '../utils/contentStatus'

const MateriaRevisada = () => {
  const { profile, isAdmin } = useAuth()
  const navigate = useNavigate()
  const [materias, setMaterias] = useState([])
  const [loading, setLoading] = useState(true)

  const courseId = profile?.selectedCourseId || 'alego-default'

  useEffect(() => {
    const loadMaterias = async () => {
      try {
        setLoading(true)
        const materiasRef = collection(db, 'courses', courseId, 'materiasRevisadas')
        let snapshot
        if (isAdmin) {
          try {
            snapshot = await getDocs(query(materiasRef, orderBy('materia', 'asc')))
          } catch {
            snapshot = await getDocs(materiasRef)
          }
        } else {
          try {
            snapshot = await getDocs(
              query(
                materiasRef,
                where('status', '==', CONTENT_STATUS.AVAILABLE),
                orderBy('materia', 'asc')
              )
            )
          } catch {
            snapshot = await getDocs(
              query(materiasRef, where('status', '==', CONTENT_STATUS.AVAILABLE))
            )
          }
        }

        const materiasData = snapshot.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((m) => isContentAvailable(m.status, isAdmin))
          .sort((a, b) => (a.materia || '').localeCompare(b.materia || ''))

        setMaterias(materiasData)
      } catch {
        setMaterias([])
      } finally {
        setLoading(false)
      }
    }

    if (courseId && db) loadMaterias()
    else setLoading(false)
  }, [courseId, isAdmin])

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-cp-accent border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-10">
      <div>
        <span className="cp-badge cp-badge-accent">Revisão</span>
        <h1 className="cp-headline mt-3 text-2xl sm:text-3xl">Matérias Revisadas</h1>
        <p className="mt-2 text-sm text-cp-muted">Conteúdo técnico condensado por disciplina</p>
      </div>

      {materias.length === 0 ? (
        <div className="cp-card p-12 text-center">
          <BookOpenIcon className="mx-auto mb-4 h-12 w-12 text-cp-muted" />
          <p className="font-medium text-cp-text">Nenhuma matéria disponível</p>
          <p className="mt-2 text-sm text-cp-muted">
            {isAdmin
              ? 'Gere matérias no painel admin e clique em Disponibilizar.'
              : 'O administrador ainda não liberou matérias revisadas para este curso.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {materias.map((materia, idx) => {
            const hue = [...(materia.materia || 'M')].reduce((a, c) => a + c.charCodeAt(0), 0) % 360
            return (
              <button
                key={materia.id}
                type="button"
                onClick={() => navigate(`/materia-revisada/${materia.id}`)}
                className="cp-card group p-5 text-left transition hover:border-cp-accent/30"
              >
                <div className="mb-4 flex items-start justify-between gap-2">
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white"
                    style={{ background: `hsl(${hue}, 60%, 50%)` }}
                  >
                    {(materia.materia || 'M').charAt(0).toUpperCase()}
                  </span>
                  {isAdmin && materia.status !== CONTENT_STATUS.AVAILABLE && (
                    <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600">
                      Rascunho
                    </span>
                  )}
                </div>
                <h3 className="text-sm font-semibold text-cp-text group-hover:text-cp-accent">{materia.materia}</h3>
                {materia.titulo && (
                  <p className="mt-1 line-clamp-2 text-xs text-cp-muted">{materia.titulo}</p>
                )}
                <ChevronRightIcon className="mt-3 h-4 w-4 text-cp-accent opacity-0 transition group-hover:opacity-100" />
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default MateriaRevisada
