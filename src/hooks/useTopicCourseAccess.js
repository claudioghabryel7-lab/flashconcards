import { useEffect, useState } from 'react'
import { loadEditalVerticalizado } from '../utils/editalVerticalizadoLoader'
import { loadTopicoPublishMap, resolveTopicPublishStatus } from '../services/topicoPublishService'
import { canAccessTopicoContent } from '../utils/courseAccess'
import { CONTENT_STATUS } from '../utils/contentStatus'

/** Verifica se o aluno pode acessar o tópico (curso comprado, preview grátis ou admin). */
export function useTopicCourseAccess(courseId, topicKey, profile) {
  const [edital, setEdital] = useState(null)
  const [publishStatus, setPublishStatus] = useState(CONTENT_STATUS.UNAVAILABLE)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!courseId) {
      setLoading(false)
      return () => {}
    }

    let cancelled = false
    setLoading(true)

    Promise.all([
      loadEditalVerticalizado(courseId),
      loadTopicoPublishMap(courseId),
    ])
      .then(([editalData, map]) => {
        if (cancelled) return
        setEdital(editalData)
        setPublishStatus(resolveTopicPublishStatus(map, topicKey))
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [courseId, topicKey])

  const canAccess = canAccessTopicoContent({
    profile,
    courseId,
    topicKey,
    edital,
    publishStatus,
  })

  return { canAccess, publishStatus, edital, loading }
}
