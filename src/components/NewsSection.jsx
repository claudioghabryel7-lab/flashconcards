import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, onSnapshot, query } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useDarkMode } from '../hooks/useDarkMode'
import LazyImage from './LazyImage'

const NewsSection = () => {
  const { darkMode } = useDarkMode()
  const [news, setNews] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!db) {
      setLoading(false)
      setError('Erro de conexão com o banco de dados')
      return
    }

    const postsRef = collection(db, 'posts')
    
    const tryLoadNews = () => {
      try {
        const q = query(postsRef)

        const unsub = onSnapshot(
          q,
          (snapshot) => {
            try {
              const newsData = snapshot.docs.map(doc => {
                const data = doc.data()
                return {
                  id: doc.id,
                  ...data,
                  title: data.title || 'Sem título',
                  text: data.text || '',
                  fullText: data.fullText || data.text || '',
                  imageUrl: data.imageUrl || data.imageBase64 || null,
                  createdAt: data.createdAt || null,
                  category: data.category || 'Geral'
                }
              })
              
              const filteredAndSorted = newsData
                .filter(item => item.active !== false)
                .sort((a, b) => {
                  const dateA = a.createdAt?.toMillis?.() || 0
                  const dateB = b.createdAt?.toMillis?.() || 0
                  return dateB - dateA
                })

              setNews(filteredAndSorted)
              setLoading(false)
              setError(null)
            } catch (err) {
              console.error('[NewsSection] Erro ao processar dados:', err)
              setError('Erro ao processar notícias')
              setLoading(false)
            }
          },
          (err) => {
            console.error('[NewsSection] Erro no listener:', err)
            setError('Erro ao carregar notícias')
            setLoading(false)
          }
        )

        return unsub
      } catch (err) {
        console.error('[NewsSection] Erro ao carregar notícias:', err)
        setError('Erro ao configurar carregamento')
        setLoading(false)
      }
    }

    const unsubscribe = tryLoadNews()
    
    return () => {
      if (unsubscribe && typeof unsubscribe === 'function') {
        unsubscribe()
      }
    }
  }, [])

  const filteredNews = news.filter(item => {
    if (!searchTerm.trim()) return true
    const searchLower = searchTerm.toLowerCase()
    return (
      (item.title || '').toLowerCase().includes(searchLower) ||
      (item.text || '').toLowerCase().includes(searchLower) ||
      (item.category || '').toLowerCase().includes(searchLower)
    )
  })

  if (error) {
    return (
      <section className="py-12">
        <div className="text-center">
          <div className="text-6xl mb-4">⚠️</div>
          <h3 className="text-xl font-semibold text-slate-700 dark:text-slate-300 mb-2">
            Erro ao carregar notícias
          </h3>
          <p className="text-slate-500 dark:text-slate-400 mb-4">
            {error}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-3 bg-alego-600 text-white font-semibold rounded-lg hover:bg-alego-700 transition"
          >
            Tentar novamente
          </button>
        </div>
      </section>
    )
  }

  if (loading) {
    return (
      <section className="py-12">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-alego-600 border-t-transparent"></div>
          <p className="mt-4 text-slate-600 dark:text-slate-400">Carregando notícias...</p>
        </div>
      </section>
    )
  }

  if (filteredNews.length === 0) {
    return (
      <section className="py-12">
        <div className="text-center">
          <div className="text-6xl mb-4">📰</div>
          <h3 className="text-xl font-semibold text-slate-700 dark:text-slate-300 mb-2">
            Nenhuma notícia encontrada
          </h3>
          <p className="text-slate-500 dark:text-slate-400">
            {searchTerm ? 'Tente buscar com outros termos.' : 'Nenhuma notícia disponível no momento.'}
          </p>
        </div>
      </section>
    )
  }

  return (
    <section className="py-12">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-4">
          Últimas Notícias
        </h2>
        <p className="text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
          Fique por dentro das novidades sobre concursos públicos e dicas de estudo
        </p>
      </div>

      <div className="max-w-md mx-auto mb-8">
        <input
          type="text"
          placeholder="Buscar notícias..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-alego-500 dark:bg-slate-800 dark:text-white"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredNews.slice(0, 6).map((item, index) => (
          <Link
            key={item.id}
            to={`/noticia/${item.id}`}
            className="group bg-white dark:bg-slate-800 rounded-xl shadow-lg hover:shadow-xl transition-all hover:scale-105 overflow-hidden border border-slate-200 dark:border-slate-700"
          >
            <div className="aspect-w-16 aspect-h-9 bg-slate-100 dark:bg-slate-700">
              {item.imageUrl ? (
                <LazyImage
                  src={item.imageUrl}
                  alt={item.title}
                  className="w-full h-48 object-cover group-hover:scale-110 transition-transform duration-500"
                  width={400}
                  height={225}
                  quality={75}
                />
              ) : (
                <div className="w-full h-48 bg-gradient-to-br from-alego-500 to-alego-600 flex items-center justify-center">
                  <div className="text-center text-white p-4">
                    <div className="text-4xl mb-2">📰</div>
                    <span className="text-sm">Notícia</span>
                  </div>
                </div>
              )}
            </div>
            
            <div className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-semibold text-alego-600 dark:text-alego-400 bg-alego-100 dark:bg-alego-900/30 px-2 py-1 rounded">
                  {item.category}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {item.createdAt?.toDate?.().toLocaleDateString('pt-BR') || 'Data não disponível'}
                </span>
              </div>
              
              <h3 className="font-semibold text-slate-900 dark:text-white mb-2 line-clamp-2">
                {item.title}
              </h3>
              
              <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-2">
                {item.fullText || item.text || ''}
              </p>
              
              <div className="mt-4 text-alego-600 dark:text-alego-400 font-semibold text-sm">
                Ler mais →
              </div>
            </div>
          </Link>
        ))}
      </div>

      {filteredNews.length > 6 && (
        <div className="text-center">
          <Link
            to="/noticias"
            className="inline-block px-6 py-3 bg-alego-600 text-white font-semibold rounded-lg hover:bg-alego-700 transition"
          >
            Ver todas as notícias ({filteredNews.length})
          </Link>
        </div>
      )}
    </section>
  )
}

export default NewsSection

