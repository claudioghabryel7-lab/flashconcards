import { collection, getDocs, limit, query, where } from 'firebase/firestore'
import { db } from '../firebase/config'

function publicUserFields(docSnap) {
  const data = docSnap.data()
  return {
    uid: docSnap.id,
    displayName: data.displayName || data.email?.split('@')[0] || 'Aluno',
    photoBase64: data.photoBase64 || null,
    bio: data.bio || '',
    selectedCourseId: data.selectedCourseId || null,
  }
}

/**
 * Sugere alunos do mesmo curso para seguir (exclui self e já seguidos).
 */
export async function fetchCoursePeopleSuggestions({
  courseId,
  currentUserId,
  followingIds = [],
  max = 8,
}) {
  if (!courseId || !db) return []

  const followingSet = new Set([currentUserId, ...followingIds].filter(Boolean))
  const results = []
  const seen = new Set()

  const tryQuery = async (field, value) => {
    if (results.length >= max) return
    const q = query(collection(db, 'users'), where(field, '==', value), limit(24))
    const snap = await getDocs(q)
    snap.forEach((docSnap) => {
      if (results.length >= max) return
      if (followingSet.has(docSnap.id) || seen.has(docSnap.id)) return
      seen.add(docSnap.id)
      results.push(publicUserFields(docSnap))
    })
  }

  try {
    await tryQuery('selectedCourseId', courseId)
    if (results.length < max) {
      await tryQuery('purchasedCourses', courseId)
    }
  } catch (error) {
    console.warn('Sugestões de pessoas do curso:', error)
  }

  return results.slice(0, max)
}
