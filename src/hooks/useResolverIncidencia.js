import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../firebase/config'
import { loadEditalVerticalizado } from '../utils/editalVerticalizadoLoader'
import { CONTENT_STATUS } from '../utils/contentStatus'
import { sanitizeDisciplinaName } from '../services/topicoPublishService'

/**
 * Lista matérias com incidência liberada (ou todas para admin).
 */
export function useResolverIncidencia(courseId, user, profile) {
  const [edital, setEdital] = useState(null)
  const [incidenciaDocs, setIncidenciaDocs] = useState([])
  const [loadingEdital, setLoadingEdital] = useState(true)
  const [loadingIncidencia, setLoadingIncidencia] = useState(true)

  const resolvedId = courseId || 'alego-default'
  const isAdmin = profile?.role === 'admin'

  useEffect(() => {
    let cancelled = false
    setLoadingEdital(true)
    loadEditalVerticalizado(resolvedId)
      .then((data) => {
        if (!cancelled) {
          setEdital(data)
          setLoadingEdital(false)
        }
      })
      .catch(() => {
        if (!cancelled) setLoadingEdital(false)
      })
    return () => {
      cancelled = true
    }
  }, [resolvedId])

  useEffect(() => {
    if (!user || !profile) {
      setIncidenciaDocs([])
      setLoadingIncidencia(false)
      return () => {}
    }

    setLoadingIncidencia(true)
    const ref = collection(db, 'courses', resolvedId, 'conteudosIncidencia')
    const q = isAdmin
      ? ref
      : query(ref, where('status', '==', CONTENT_STATUS.AVAILABLE))

    return onSnapshot(
      q,
      (snap) => {
        setIncidenciaDocs(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
        setLoadingIncidencia(false)
      },
      (err) => {
        console.error('Erro ao carregar incidências:', err)
        setLoadingIncidencia(false)
      },
    )
  }, [resolvedId, user, profile, isAdmin])

  const statusByKey = useMemo(() => {
    const map = {}
    incidenciaDocs.forEach((doc) => {
      map[doc.id] = doc.status || CONTENT_STATUS.UNAVAILABLE
    })
    return map
  }, [incidenciaDocs])

  const materias = useMemo(() => {
    const disciplinas = edital?.disciplinas || []
    return disciplinas
      .map((disciplina, idx) => {
        const nome = disciplina?.nome || `Matéria ${idx + 1}`
        const key = sanitizeDisciplinaName(nome)
        const status = statusByKey[key] || CONTENT_STATUS.UNAVAILABLE
        const hasContent = Boolean(incidenciaDocs.find((d) => d.id === key))
        const available =
          isAdmin || status === CONTENT_STATUS.AVAILABLE
        return {
          idx,
          nome,
          key,
          status,
          hasContent,
          available,
        }
      })
      // Aluno: só liberadas com conteúdo. Admin: todas (pode abrir/gerar).
      .filter((m) => isAdmin || (m.available && m.hasContent))
  }, [edital, statusByKey, incidenciaDocs, isAdmin])

  return {
    materias,
    totalMaterias: materias.length,
    loading: loadingEdital || loadingIncidencia,
    hasEdital: Boolean(edital?.disciplinas?.length),
  }
}
