import { useEffect, useState, useMemo } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase/config'
import {
  loadEditalVerticalizado,
  normalizeFlashcard,
  buildNavigationFromEdital,
  resolveTopicKeyFromEdital,
} from '../utils/editalVerticalizadoLoader'
import { CONTENT_STATUS } from '../utils/contentStatus'
import { canAccessTopicoContent } from '../utils/courseAccess'
import { buildTopicoPublishMapFromSnapshot, resolveTopicPublishStatus } from '../services/topicoPublishService'

/**
 * Carrega edital verticalizado + flashcards do curso (subcoleção) com fallback legado.
 */
export function useEditalFlashcards(selectedCourseId, user, profile) {
  const [cards, setCards] = useState([])
  const [edital, setEdital] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editalLoading, setEditalLoading] = useState(true)
  const [publishMap, setPublishMap] = useState({})

  const courseId = selectedCourseId || 'alego-default'

  useEffect(() => {
    const ref = collection(db, 'courses', courseId, 'topicoStatus')
    return onSnapshot(ref, (snap) => setPublishMap(buildTopicoPublishMapFromSnapshot(snap)))
  }, [courseId])

  useEffect(() => {
    let cancelled = false
    setEditalLoading(true)

    loadEditalVerticalizado(courseId)
      .then((data) => {
        if (!cancelled) {
          setEdital(data)
          setEditalLoading(false)
        }
      })
      .catch((err) => {
        console.error('Erro ao carregar edital verticalizado:', err)
        if (!cancelled) {
          setEdital(null)
          setEditalLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [courseId])

  useEffect(() => {
    if (!user || !profile) {
      setCards([])
      setLoading(false)
      return () => {}
    }

    setLoading(true)
    const isAdmin = profile.role === 'admin'

    const applyAccessFilter = (data) => {
      if (isAdmin) return data

      return data.filter((card) => {
        if (card.status === CONTENT_STATUS.UNAVAILABLE) return false
        if (card.status === CONTENT_STATUS.AVAILABLE) return true

        const topicKey =
          card.topicKey || resolveTopicKeyFromEdital(edital, card.materia, card.modulo)
        if (!topicKey) return false

        return canAccessTopicoContent({
          profile,
          courseId,
          topicKey,
          edital,
          publishStatus: resolveTopicPublishStatus(publishMap, topicKey),
        })
      })
    }

    const mapDocs = (docs) =>
      docs.map((d) => normalizeFlashcard({ id: d.id, ...d.data() }))

    const belongsToCourse = (card) =>
      card.courseId === courseId ||
      (!card.courseId && courseId === 'alego-default') ||
      card.courseId === '' ||
      card.courseId === 'alego-default'

    const courseCardsRef = collection(db, 'courses', courseId, 'flashcards')
    const globalCardsRef = collection(db, 'flashcards')

    let courseData = []
    let globalData = []

    const mergeAndSet = () => {
      const byId = new Map()
      ;[...courseData, ...globalData].forEach((card) => {
        if (card.id) byId.set(card.id, card)
      })
      setCards(applyAccessFilter(Array.from(byId.values())))
      setLoading(false)
    }

    const unsubCourse = onSnapshot(
      courseCardsRef,
      (snapshot) => {
        courseData = mapDocs(snapshot.docs)
        mergeAndSet()
      },
      (error) => {
        console.error('Erro ao carregar flashcards do curso:', error)
        mergeAndSet()
      }
    )

    const unsubGlobal = onSnapshot(
      globalCardsRef,
      (snapshot) => {
        globalData = mapDocs(snapshot.docs).filter(belongsToCourse)
        mergeAndSet()
      },
      (error) => {
        console.error('Erro ao carregar flashcards globais:', error)
        mergeAndSet()
      }
    )

    return () => {
      unsubCourse()
      unsubGlobal()
    }
  }, [user, profile, courseId, edital, publishMap])

  const organizedModules = useMemo(
    () => buildNavigationFromEdital(edital, cards),
    [edital, cards]
  )

  const hasEdital = Boolean(edital?.disciplinas?.length)

  return {
    cards,
    edital,
    organizedModules,
    loading,
    editalLoading,
    hasEdital,
  }
}
