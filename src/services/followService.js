import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore'
import { db } from '../firebase/config'

export function followDocId(followerId, followingId) {
  return `${followerId}_${followingId}`
}

export async function followUser(followerId, followingId) {
  if (!db || !followerId || !followingId || followerId === followingId) return
  await setDoc(doc(db, 'follows', followDocId(followerId, followingId)), {
    followerId,
    followingId,
    createdAt: serverTimestamp(),
  })
}

export async function unfollowUser(followerId, followingId) {
  if (!db || !followerId || !followingId) return
  await deleteDoc(doc(db, 'follows', followDocId(followerId, followingId)))
}

export async function isFollowing(followerId, followingId) {
  if (!db || !followerId || !followingId) return false
  const snap = await getDoc(doc(db, 'follows', followDocId(followerId, followingId)))
  return snap.exists()
}

export function subscribeIsFollowing(followerId, followingId, callback) {
  if (!db || !followerId || !followingId) {
    callback(false)
    return () => {}
  }
  return onSnapshot(doc(db, 'follows', followDocId(followerId, followingId)), (snap) => {
    callback(snap.exists())
  })
}

export function subscribeFollowCounts(userId, callback) {
  if (!db || !userId) {
    callback({ followers: 0, following: 0 })
    return () => {}
  }

  let followers = 0
  let following = 0

  const emit = () => callback({ followers, following })

  const unsubFollowers = onSnapshot(
    query(collection(db, 'follows'), where('followingId', '==', userId)),
    (snap) => {
      followers = snap.size
      emit()
    },
    () => emit(),
  )

  const unsubFollowing = onSnapshot(
    query(collection(db, 'follows'), where('followerId', '==', userId)),
    (snap) => {
      following = snap.size
      emit()
    },
    () => emit(),
  )

  return () => {
    unsubFollowers()
    unsubFollowing()
  }
}
