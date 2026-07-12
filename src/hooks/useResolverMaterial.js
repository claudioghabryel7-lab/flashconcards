import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../firebase/config'
import { loadEditalVerticalizado } from '../utils/editalVerticalizadoLoader'
import { CONTENT_STATUS } from '../utils/contentStatus'
import { buildTopicoPublishMapFromSnapshot } from '../services/topicoPublishService'
import {
  buildOrganizedMaterialFromEdital,
  filterOrganizedMaterialWithContent,
  isMaterialAccessible,
  materialDocToItem,
} from '../utils/resolverMaterialUtils'

export function useResolverMaterial(courseId, user, profile) {
  const [edital, setEdital] = useState(null)
  const [publishMap, setPublishMap] = useState({})
  const [materialDocs, setMaterialDocs] = useState([])
  const [loadingEdital, setLoadingEdital] = useState(true)
  const [loadingMaterial, setLoadingMaterial] = useState(true)

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
    const ref = collection(db, 'courses', resolvedId, 'topicoStatus')
    return onSnapshot(ref, (snap) => setPublishMap(buildTopicoPublishMapFromSnapshot(snap)))
  }, [resolvedId])

  useEffect(() => {
    if (!user || !profile) {
      setMaterialDocs([])
      setLoadingMaterial(false)
      return () => {}
    }

    setLoadingMaterial(true)
    const ref = collection(db, 'courses', resolvedId, 'conteudosCompletos')
    // Mesma lógica dos flashcards: aluno só lista status == disponivel (exigência das rules)
    const materialQuery = isAdmin
      ? ref
      : query(ref, where('status', '==', CONTENT_STATUS.AVAILABLE))

    return onSnapshot(
      materialQuery,
      (snap) => {
        setMaterialDocs(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
        setLoadingMaterial(false)
      },
      (err) => {
        console.error('Erro ao carregar materiais:', err)
        setLoadingMaterial(false)
      },
    )
  }, [resolvedId, user, profile, isAdmin])

  const accessibleItems = useMemo(() => {
    if (!profile) return []

    return materialDocs
      .map((doc) => {
        const item = materialDocToItem(doc.id, doc, edital)
        const accessible = isMaterialAccessible({
          doc,
          profile,
          courseId: resolvedId,
          topicKey: item.topicKey,
          edital,
          publishMap,
          isAdmin,
        })
        return accessible ? item : null
      })
      .filter(Boolean)
  }, [materialDocs, edital, publishMap, profile, isAdmin, resolvedId])

  const allItems = accessibleItems

  const organized = useMemo(() => {
    const fromEdital = filterOrganizedMaterialWithContent(
      buildOrganizedMaterialFromEdital(edital, allItems),
    )
    return fromEdital
  }, [edital, allItems])

  const totalMateriais = allItems.length

  return {
    edital,
    organized,
    allItems,
    totalMateriais,
    loading: loadingEdital || loadingMaterial,
    hasEdital: !!edital?.disciplinas?.length,
    courseId: resolvedId,
  }
}
