import { useEffect, useMemo, useState } from 'react'
import { loadEditalVerticalizado, formatTopicoAsModulo } from '../utils/editalVerticalizadoLoader'

export function useTrilhaEditalOptions(courseId) {
  const [edital, setEdital] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    loadEditalVerticalizado(courseId || 'alego-default')
      .then((data) => {
        if (!cancelled) setEdital(data)
      })
      .catch(() => {
        if (!cancelled) setEdital(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [courseId])

  const materias = useMemo(() => {
    if (!edital?.disciplinas) return []
    return edital.disciplinas
      .filter((d) => d.ativo !== false && d.nome?.trim())
      .map((d) => d.nome.trim())
  }, [edital])

  const topicosByMateria = useMemo(() => {
    const map = {}
    if (!edital?.disciplinas) return map
    edital.disciplinas.forEach((disciplina) => {
      if (disciplina.ativo === false || !disciplina.nome?.trim()) return
      const nome = disciplina.nome.trim()
      map[nome] = (disciplina.topicos || [])
        .filter((t) => t.ativo !== false)
        .map((t) => formatTopicoAsModulo(t))
    })
    return map
  }, [edital])

  return { edital, materias, topicosByMateria, loading }
}

export const TRILHA_MODALIDADES = [
  { value: 'teoria', label: 'Teoria' },
  { value: 'questoes', label: 'Questões' },
  { value: 'flashcards', label: 'FlashCards' },
]

export const TRILHA_MODALIDADE_LABELS = {
  teoria: 'Teoria',
  questoes: 'Questões',
  flashcards: 'FlashCards',
}
