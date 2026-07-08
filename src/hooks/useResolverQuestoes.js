import { useEffect, useMemo, useState } from 'react'
import { collection, doc, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase/config'
import { loadEditalVerticalizado } from '../utils/editalVerticalizadoLoader'
import { isContentAvailable } from '../utils/contentStatus'
import {
  canAccessTopicoContent,
  hasPurchasedCourse,
} from '../utils/courseAccess'
import {
  buildTopicoPublishMapFromSnapshot,
  resolveTopicPublishStatus,
} from '../services/topicoPublishService'
import {
  extractContextFromEdital,
  flattenQuestoesFromPack,
  organizeQuestoesByMateria,
  filterOrganizedQuestoesWithContent,
  statsToChartData,
} from '../utils/resolverQuestoesUtils'
import { assignChartColors } from '../utils/progressChartColors'
import { normalizeQuestoesStatsCourseKey } from '../utils/questoesStats'

function parseNivelFromDocId(docId, data) {
  if (data?.nivel) return data.nivel
  const match = docId.match(/_nivel_(\d+)$/)
  return match ? parseInt(match[1], 10) : 1
}

function parseIncidenciaMateria(docId, data) {
  if (data?.disciplina) return data.disciplina
  const base = docId.split('_nivel_')[0] || ''
  if (!base) return 'Incidência'
  return base.replace(/_/g, ' ')
}

export function useResolverQuestoes(courseId, user, profile) {
  const [edital, setEdital] = useState(null)
  const [publishMap, setPublishMap] = useState({})
  const [topicoPacks, setTopicoPacks] = useState([])
  const [incidenciaPacks, setIncidenciaPacks] = useState([])
  const [stats, setStats] = useState({ correct: 0, wrong: 0, byMateria: {} })
  const [loadingEdital, setLoadingEdital] = useState(true)
  const [loadingQuestoes, setLoadingQuestoes] = useState(true)

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
        if (!cancelled) {
          setEdital(null)
          setLoadingEdital(false)
        }
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
      setTopicoPacks([])
      setIncidenciaPacks([])
      setLoadingQuestoes(false)
      return () => {}
    }

    setLoadingQuestoes(true)
    const topicoRef = collection(db, 'courses', resolvedId, 'questoesTopico')
    const incRef = collection(db, 'courses', resolvedId, 'questoesIncidencia')

    const unsubTopico = onSnapshot(
      topicoRef,
      (snap) => {
        setTopicoPacks(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
        setLoadingQuestoes(false)
      },
      () => setLoadingQuestoes(false),
    )

    const unsubInc = onSnapshot(incRef, (snap) => {
      setIncidenciaPacks(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    })

    return () => {
      unsubTopico()
      unsubInc()
    }
  }, [resolvedId, user, profile])

  useEffect(() => {
    if (!user?.uid) {
      setStats({ correct: 0, wrong: 0, byMateria: {} })
      return () => {}
    }

    const courseKey = normalizeQuestoesStatsCourseKey(resolvedId)
    const statsRef = doc(db, 'questoesStats', `${user.uid}_${courseKey}`)
    return onSnapshot(statsRef, (snap) => {
      if (!snap.exists()) {
        setStats({ correct: 0, wrong: 0, byMateria: {} })
        return
      }
      const data = snap.data()
      setStats({
        correct: data.correct || 0,
        wrong: data.wrong || 0,
        byMateria: data.byMateria || {},
      })
    })
  }, [user?.uid, resolvedId])

  const allItems = useMemo(() => {
    if (!profile) return []

    const items = []

    topicoPacks.forEach((pack) => {
      if (!isAdmin && !isContentAvailable(pack.status, false)) return

      const topicKey = pack.topicKey || pack.topico || ''
      const ctx = extractContextFromEdital(edital, topicKey)
      const materia = ctx?.disciplina || pack.disciplina || 'Geral'
      const moduloLabel = ctx?.topico
        ? `${ctx.topicoNumero ? `${ctx.topicoNumero} - ` : ''}${ctx.topico}`
        : pack.topico || 'Tópico'
      const nivel = parseNivelFromDocId(pack.id, pack)

      if (!isAdmin && topicKey) {
        const publishStatus = resolveTopicPublishStatus(publishMap, topicKey)
        if (
          !canAccessTopicoContent({
            profile,
            courseId: resolvedId,
            topicKey,
            edital,
            publishStatus,
          })
        ) {
          return
        }
      }

      items.push(
        ...flattenQuestoesFromPack(pack, {
          packId: pack.id,
          materia,
          modulo: `${moduloLabel} · Nv.${nivel}`,
          topicKey,
          source: 'topico',
          nivel,
        }),
      )
    })

    incidenciaPacks.forEach((pack) => {
      if (!isAdmin && !isContentAvailable(pack.status, false)) return
      if (!isAdmin && !hasPurchasedCourse(profile, resolvedId)) return

      const materia = parseIncidenciaMateria(pack.id, pack)
      const nivel = parseNivelFromDocId(pack.id, pack)

      items.push(
        ...flattenQuestoesFromPack(pack, {
          packId: pack.id,
          materia,
          modulo: `Incidência · Nv.${nivel}`,
          topicKey: null,
          source: 'incidencia',
          nivel,
        }),
      )
    })

    return items
  }, [topicoPacks, incidenciaPacks, edital, publishMap, profile, isAdmin, resolvedId])

  const organized = useMemo(
    () => filterOrganizedQuestoesWithContent(organizeQuestoesByMateria(allItems)),
    [allItems],
  )

  const totalQuestoes = allItems.length
  const totalAnswered = (stats.correct || 0) + (stats.wrong || 0)
  const accuracy =
    totalAnswered > 0 ? Math.round(((stats.correct || 0) / totalAnswered) * 100) : 0

  const acertosChart = useMemo(
    () => assignChartColors(statsToChartData(stats.byMateria, 'correct')),
    [stats.byMateria],
  )

  const errosChart = useMemo(
    () => assignChartColors(statsToChartData(stats.byMateria, 'wrong')),
    [stats.byMateria],
  )

  return {
    edital,
    organized,
    allItems,
    stats,
    totalQuestoes,
    totalAnswered,
    accuracy,
    acertosChart,
    errosChart,
    loading: loadingEdital || loadingQuestoes,
    hasEdital: !!edital?.disciplinas?.length,
    courseId: resolvedId,
  }
}
