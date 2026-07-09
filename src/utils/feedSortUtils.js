export function isPostPinned(post) {
  if (!post?.pinnedUntil) return false
  const until = post.pinnedUntil?.toDate?.() || new Date(post.pinnedUntil)
  return until.getTime() > Date.now()
}

export function sortFeedPosts(posts = []) {
  return [...posts].sort((a, b) => {
    const aPinned = isPostPinned(a) ? 1 : 0
    const bPinned = isPostPinned(b) ? 1 : 0
    if (bPinned !== aPinned) return bPinned - aPinned
    const at = a.createdAt?.toMillis?.() || a.createdAt?.seconds * 1000 || 0
    const bt = b.createdAt?.toMillis?.() || b.createdAt?.seconds * 1000 || 0
    return bt - at
  })
}
