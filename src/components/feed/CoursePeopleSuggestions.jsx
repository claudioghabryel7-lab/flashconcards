import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import UserAvatar from '../UserAvatar'
import { fetchCoursePeopleSuggestions } from '../../services/coursePeopleService'
import { followUser, subscribeIsFollowing, unfollowUser } from '../../services/followService'
import toast from 'react-hot-toast'

export default function CoursePeopleSuggestions({ courseId, currentUserId }) {
  const [people, setPeople] = useState([])
  const [followingMap, setFollowingMap] = useState({})
  const [loadingId, setLoadingId] = useState(null)

  useEffect(() => {
    if (!courseId || !currentUserId) {
      setPeople([])
      return () => {}
    }

    let cancelled = false
    fetchCoursePeopleSuggestions({ courseId, currentUserId }).then((rows) => {
      if (!cancelled) setPeople(rows)
    })

    return () => {
      cancelled = true
    }
  }, [courseId, currentUserId])

  useEffect(() => {
    const unsubs = people.map((person) =>
      subscribeIsFollowing(currentUserId, person.uid, (isFollowing) => {
        setFollowingMap((prev) => ({ ...prev, [person.uid]: isFollowing }))
      }),
    )
    return () => unsubs.forEach((fn) => fn?.())
  }, [people, currentUserId])

  if (!currentUserId || people.length === 0) return null

  const handleFollow = async (targetId) => {
    if (!currentUserId || loadingId) return
    setLoadingId(targetId)
    try {
      if (followingMap[targetId]) await unfollowUser(currentUserId, targetId)
      else await followUser(currentUserId, targetId)
    } catch {
      toast.error('Erro ao seguir.')
    } finally {
      setLoadingId(null)
    }
  }

  return (
    <div className="border-b border-cp-border bg-cp-surface/40 px-4 py-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-cp-muted">
        Sugestões do curso
      </p>
      <div className="flex gap-3 overflow-x-auto scrollbar-hide">
        {people.map((person) => (
          <div
            key={person.uid}
            className="flex w-[88px] shrink-0 flex-col items-center gap-2 text-center"
          >
            <Link to={`/profile/${person.uid}`}>
              <UserAvatar
                photoBase64={person.photoBase64}
                name={person.displayName}
                size="md"
                className="!h-14 !w-14"
              />
            </Link>
            <Link
              to={`/profile/${person.uid}`}
              className="max-w-full truncate text-[11px] font-medium text-cp-text"
            >
              {person.displayName?.split(' ')[0]}
            </Link>
            <button
              type="button"
              onClick={() => handleFollow(person.uid)}
              disabled={loadingId === person.uid}
              className={`w-full rounded-md px-2 py-1 text-[10px] font-semibold transition ${
                followingMap[person.uid]
                  ? 'border border-cp-border bg-cp-surface text-cp-muted'
                  : 'bg-cp-accent text-white'
              }`}
            >
              {loadingId === person.uid ? '...' : followingMap[person.uid] ? 'Seguindo' : 'Seguir'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
