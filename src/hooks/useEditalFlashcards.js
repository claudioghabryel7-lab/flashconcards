import { useEffect, useState, useMemo } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase/config'
import {
  loadEditalVerticalizado,
  normalizeFlashcard,
  buildNavigationFromEdital,
} from '../utils/editalVerticalizadoLoader'
import { CONTENT_STATUS } from '../utils/contentStatus'
import {
  hasPurchasedCourse,
  getFreeTopicKeys,
  topicKeysMatch,
} from '../utils/courseAccess'

/**
 * Carrega edital verticalizado + flashcards do curso (subcoleção) com fallback legado.
 */
export function useEditalFlashcards(selectedCourseId, user, profile) {
  const [cards, setCards] = useState([])
  const [edital, setEdital] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editalLoading, setEditalLoading] = useState(true)

  const courseId = selectedCourseId || 'alego-default'

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
    const ownsCourse = hasPurchasedCourse(profile, selectedCourseId)
    const freeTopicKeys =
      !isAdmin && !ownsCourse && edital
        ? getFreeTopicKeys(edital, user.uid, courseId)
        : []

    const applyAccessFilter = (data) => {
      if (isAdmin) return data

      let filtered = data.filter(
        (card) => !card.status || card.status === CONTENT_STATUS.AVAILABLE
      )

      if (selectedCourseId && ownsCourse) {
        return filtered
      }

      if (selectedCourseId && freeTopicKeys.length > 0) {
        return filtered.filter((card) =>
          freeTopicKeys.some((key) => topicKeysMatch(key, card.topicKey))
        )
      }

      if (selectedCourseId && !ownsCourse) {
        return []
      }

      return filtered
    }

    const mapDocs = (docs) =>
      docs.map((d) => normalizeFlashcard({ id: d.id, ...d.data() }))

    if (selectedCourseId) {
      const courseCardsRef = collection(db, 'courses', selectedCourseId, 'flashcards')
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
          let data = mapDocs(snapshot.docs).filter(
            (card) => card.courseId === selectedCourseId
          )
          globalData = data
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
    }

    const globalCardsRef = collection(db, 'flashcards')
    const unsub = onSnapshot(
      globalCardsRef,
      (snapshot) => {
        let data = mapDocs(snapshot.docs).filter(
          (card) =>
            !card.courseId ||
            card.courseId === '' ||
            card.courseId === 'alego-default'
        )
        setCards(applyAccessFilter(data))
        setLoading(false)
      },
      (error) => {
        console.error('Erro ao carregar flashcards:', error)
        setCards([])
        setLoading(false)
      }
    )

    return () => unsub()
  }, [user, profile, selectedCourseId, edital])

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
