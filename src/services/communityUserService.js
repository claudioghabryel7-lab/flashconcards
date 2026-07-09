import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { db } from '../firebase/config'

const BATCH_LIMIT = 400

function patchFeedComments(comments, userId, displayName, photoBase64) {
  if (!Array.isArray(comments) || !comments.length) {
    return { comments: comments || [], changed: false }
  }

  let changed = false
  const next = comments.map((comment) => {
    let patched = comment

    if (comment.authorId === userId) {
      changed = true
      patched = {
        ...patched,
        authorName: displayName,
        authorPhotoBase64: photoBase64 ?? comment.authorPhotoBase64 ?? null,
      }
    }

    const replies = (comment.replies || []).map((reply) => {
      if (reply.authorId !== userId) return reply
      changed = true
      return {
        ...reply,
        authorName: displayName,
        authorPhotoBase64: photoBase64 ?? reply.authorPhotoBase64 ?? null,
      }
    })

    if (replies !== comment.replies) {
      patched = { ...patched, replies }
    }

    return patched
  })

  return { comments: next, changed }
}

function stripUserComments(comments, userId) {
  if (!Array.isArray(comments) || !comments.length) {
    return { comments: comments || [], changed: false }
  }

  let changed = false
  const next = comments
    .map((comment) => {
      if (comment.authorId === userId) {
        changed = true
        return null
      }

      const replies = (comment.replies || []).filter((reply) => {
        if (reply.authorId === userId) {
          changed = true
          return false
        }
        return true
      })

      if (replies.length !== (comment.replies || []).length) {
        changed = true
        return { ...comment, replies }
      }

      return comment
    })
    .filter(Boolean)

  return { comments: next, changed }
}

async function runBatchedUpdates(updates) {
  if (!updates.length) return

  let batch = writeBatch(db)
  let ops = 0

  for (const { ref, data } of updates) {
    batch.update(ref, data)
    ops += 1
    if (ops >= BATCH_LIMIT) {
      await batch.commit()
      batch = writeBatch(db)
      ops = 0
    }
  }

  if (ops > 0) await batch.commit()
}

async function runBatchedDeletes(refs) {
  if (!refs.length) return

  let batch = writeBatch(db)
  let ops = 0

  for (const ref of refs) {
    batch.delete(ref)
    ops += 1
    if (ops >= BATCH_LIMIT) {
      await batch.commit()
      batch = writeBatch(db)
      ops = 0
    }
  }

  if (ops > 0) await batch.commit()
}

/** Atualiza nome/foto em posts, comentários e arquivos do perfil (mesmo UID). */
export async function syncUserCommunityIdentity(userId, { displayName, photoBase64 }) {
  if (!userId || !db || !displayName) return

  const feedSnap = await getDocs(collection(db, 'trilhaFeed'))
  const feedUpdates = []

  feedSnap.forEach((docSnap) => {
    const data = docSnap.data()
    const isAuthor = data.authorId === userId
    const { comments, changed: commentsChanged } = patchFeedComments(
      data.comments,
      userId,
      displayName,
      photoBase64,
    )

    if (!isAuthor && !commentsChanged) return

    const update = {}
    if (isAuthor) {
      update.authorName = displayName
      if (photoBase64 !== undefined) update.authorPhotoBase64 = photoBase64
    }
    if (commentsChanged) update.comments = comments
    feedUpdates.push({ ref: docSnap.ref, data: update })
  })

  await runBatchedUpdates(feedUpdates)

  const profilePostsSnap = await getDocs(collection(db, 'users', userId, 'profilePosts'))
  const profileUpdates = profilePostsSnap.docs.map((docSnap) => ({
    ref: docSnap.ref,
    data: {
      authorName: displayName,
      ...(photoBase64 !== undefined ? { authorPhotoBase64: photoBase64 } : {}),
    },
  }))
  await runBatchedUpdates(profileUpdates)

  const contentCommentsSnap = await getDocs(
    query(collectionGroup(db, 'contentComments'), where('userId', '==', userId)),
  )
  const commentUpdates = contentCommentsSnap.docs.map((docSnap) => ({
    ref: docSnap.ref,
    data: {
      userName: displayName,
      ...(photoBase64 !== undefined ? { userPhotoBase64: photoBase64 } : {}),
    },
  }))
  await runBatchedUpdates(commentUpdates)

  try {
    await updateDoc(doc(db, 'presence', userId), { displayName })
  } catch {
    /* presence pode não existir */
  }
}

/** Remove toda presença do usuário na comunidade (ao excluir conta). */
export async function purgeUserCommunityData(userId) {
  if (!userId || !db) return { deletedPosts: 0, cleanedPosts: 0 }

  let deletedPosts = 0
  let cleanedPosts = 0

  const ownPosts = await getDocs(query(collection(db, 'trilhaFeed'), where('authorId', '==', userId)))
  await runBatchedDeletes(ownPosts.docs.map((d) => d.ref))
  deletedPosts = ownPosts.size

  const allFeed = await getDocs(collection(db, 'trilhaFeed'))
  const feedUpdates = []

  allFeed.forEach((docSnap) => {
    const data = docSnap.data()
    const { comments, changed } = stripUserComments(data.comments, userId)
    if (!changed) return
    feedUpdates.push({ ref: docSnap.ref, data: { comments } })
    cleanedPosts += 1
  })
  await runBatchedUpdates(feedUpdates)

  const profilePosts = await getDocs(collection(db, 'users', userId, 'profilePosts'))
  await runBatchedDeletes(profilePosts.docs.map((d) => d.ref))

  const contentComments = await getDocs(
    query(collectionGroup(db, 'contentComments'), where('userId', '==', userId)),
  )
  await runBatchedDeletes(contentComments.docs.map((d) => d.ref))

  const followerSnap = await getDocs(query(collection(db, 'follows'), where('followerId', '==', userId)))
  const followingSnap = await getDocs(query(collection(db, 'follows'), where('followingId', '==', userId)))
  await runBatchedDeletes([
    ...followerSnap.docs.map((d) => d.ref),
    ...followingSnap.docs.map((d) => d.ref),
  ])

  const storiesSnap = await getDocs(query(collection(db, 'stories'), where('authorId', '==', userId)))
  await runBatchedDeletes(storiesSnap.docs.map((d) => d.ref))

  try {
    await deleteDoc(doc(db, 'presence', userId))
  } catch {
    /* ignore */
  }

  return { deletedPosts, cleanedPosts }
}

/** Remove posts de autores que não existem mais ou foram excluídos. */
export async function cleanupOrphanCommunityData() {
  if (!db) return { removedPosts: 0, removedAuthors: 0 }

  const feedSnap = await getDocs(collection(db, 'trilhaFeed'))
  const authorIds = [...new Set(feedSnap.docs.map((d) => d.data().authorId).filter(Boolean))]

  const orphanIds = new Set()
  await Promise.all(
    authorIds.map(async (uid) => {
      const snap = await getDoc(doc(db, 'users', uid))
      if (!snap.exists() || snap.data()?.deleted === true) orphanIds.add(uid)
    }),
  )

  const toDelete = feedSnap.docs.filter((d) => orphanIds.has(d.data().authorId))
  await runBatchedDeletes(toDelete.map((d) => d.ref))

  return { removedPosts: toDelete.length, removedAuthors: orphanIds.size }
}

export async function isActiveCommunityUser(userId) {
  if (!userId || !db) return false
  const snap = await getDoc(doc(db, 'users', userId))
  return snap.exists() && snap.data()?.deleted !== true
}
