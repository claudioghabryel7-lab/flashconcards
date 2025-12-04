import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'
import { useDarkMode } from '../hooks/useDarkMode.jsx'

const StoriesBar = () => {
  const { user } = useAuth()
  const { darkMode } = useDarkMode()
  const [stories, setStories] = useState([])

  useEffect(() => {
    if (!user) return

    const storiesRef = collection(db, 'stories')
    
    // Buscar todas as stories e filtrar por expiração no cliente
    const unsub = onSnapshot(storiesRef, (snapshot) => {
      const now = new Date()
      const data = snapshot.docs
        .map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }))
        .filter(story => {
          // Filtrar stories que ainda não expiraram
          if (!story.expiresAt) return false
          const expiresAt = story.expiresAt?.toDate ? story.expiresAt.toDate() : new Date(story.expiresAt)
          return expiresAt > now
        })

      // Agrupar stories por autor
      const storiesByAuthor = {}
      data.forEach(story => {
        if (!storiesByAuthor[story.authorId]) {
          storiesByAuthor[story.authorId] = {
            authorId: story.authorId,
            authorName: story.authorName,
            authorAvatar: story.authorAvatar,
            stories: []
          }
        }
        storiesByAuthor[story.authorId].stories.push(story)
      })

      setStories(Object.values(storiesByAuthor))
    })

    return () => unsub()
  }, [user])

  if (stories.length === 0) return null

  return (
    <div className="mb-6 bg-white dark:bg-black border-b border-slate-300 dark:border-slate-800 px-4 py-6">
      <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-2">
        {stories.map((authorStories) => (
          <Link
            key={authorStories.authorId}
            to={`/stories/${authorStories.authorId}`}
            className="flex-shrink-0 flex flex-col items-center gap-2 cursor-pointer"
          >
            <div className="relative">
              <div className="h-16 w-16 rounded-full bg-gradient-to-br from-yellow-400 via-pink-500 to-purple-600 p-0.5">
                {authorStories.authorAvatar ? (
                  <img
                    src={authorStories.authorAvatar}
                    alt={authorStories.authorName}
                    className="w-full h-full rounded-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full rounded-full bg-slate-800 flex items-center justify-center">
                    <span className="text-white font-bold text-lg">
                      {authorStories.authorName?.[0]?.toUpperCase() || 'U'}
                    </span>
                  </div>
                )}
              </div>
              <div className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-blue-500 border-2 border-white dark:border-black"></div>
            </div>
            <p className="text-xs text-slate-900 dark:text-white truncate max-w-[70px]">
              {authorStories.authorName || 'Usuário'}
            </p>
          </Link>
        ))}
      </div>
    </div>
  )
}

export default StoriesBar

