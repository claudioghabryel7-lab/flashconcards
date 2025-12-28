import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, onSnapshot, query } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useDarkMode } from '../hooks/useDarkMode.jsx'
import LazyImage from './LazyImage'

const NewsSection = () => {
  const { darkMode } = useDarkMode()
  const [news, setNews] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    if (!db) {
      setLoading(false)
      return
    }

    const postsRef = collection(db, 'posts')
    
    // Usar query simples sem índice composto - filtrar e ordenar no código
    const tryLoadNews = () => {
      try {
        // Query simples sem where/orderBy para evitar necessidade de índice
        // Buscar todos os posts e filtrar no código
        const q = query(postsRef)

        const unsub = onSnapshot(
          q,
          (snapshot) => {
            const data = snapshot.docs.map((doc) => ({
              id: doc.id,
              ...doc.data(),
            }))
            
            // Filtrar apenas isNews === true (garantir)
            const filteredData = data.filter(item => item.isNews === true)
            
            // Ordenar por data manualmente (sempre fazer isso no código)
            filteredData.sort((a, b) => {
              const aTime = a.createdAt?.toMillis?.() || (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0) || 0
              const bTime = b.createdAt?.toMillis?.() || (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0) || 0
              return bTime - aTime
            })
            
            setNews(filteredData)
            setLoading(false)
          },
          (error) => {
            // Ignorar erros de índice (pode ser cache do navegador)
            if (error.code === 'failed-precondition') {
              console.warn('Índice necessário. Limpe o cache do navegador ou crie o índice no Firebase Console.')
              // Tentar carregar sem filtro como fallback
              return
            }
            if (error.code === 'permission-denied') {
              console.warn('Permissão negada. Verifique as regras do Firestore.')
            } else {
              console.error('Erro ao carregar notícias:', error)
            }
            setNews([])
            setLoading(false)
          }
        )

        return unsub
      } catch (err) {
        console.error('Erro ao criar query:', err)
        setNews([])
        setLoading(false)
        return () => {}
      }
    }

    const unsub = tryLoadNews()
    return () => {
      if (unsub) unsub()
    }
  }, [])

  // Filtrar notícias por busca
  const filteredNews = news.filter((item) => {
    if (!searchTerm.trim()) return true
    const search = searchTerm.toLowerCase()
    return (
      item.text?.toLowerCase().includes(search) ||
      item.authorName?.toLowerCase().includes(search) ||
      item.fullText?.toLowerCase().includes(search)
    )
  })

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-alego-600 mx-auto"></div>
      </div>
    )
  }

  if (news.length === 0) {
    return null
  }

  return (
    <section className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl sm:text-3xl md:text-4xl font-black text-alego-700 dark:text-alego-300 mb-3">
          📰 Notícias
        </h2>
        <p className="text-slate-600 dark:text-slate-400 text-sm sm:text-base">
          Fique por dentro das últimas novidades
        </p>
      </div>

      {/* Busca */}
      <div className="max-w-2xl mx-auto">
        <div className="relative">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar notícias..."
            className="w-full rounded-full border-2 border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-6 py-3 pl-12 text-sm focus:border-alego-400 focus:outline-none"
          />
          <svg
            className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-slate-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>

      {/* Grid de Notícias */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {filteredNews.length === 0 ? (
          <div className="col-span-full text-center py-8">
            <p className="text-slate-600 dark:text-slate-400">
              {searchTerm ? 'Nenhuma notícia encontrada.' : 'Nenhuma notícia disponível.'}
            </p>
          </div>
        ) : (
          filteredNews.slice(0, 6).map((item) => (
            <Link
              key={item.id}
              to={`/noticia/${item.id}`}
              className="group block rounded-2xl bg-white dark:bg-slate-800 overflow-hidden shadow-lg hover:shadow-2xl transition border border-slate-200 dark:border-slate-700"
            >
              {/* Imagem da notícia */}
              {item.imageBase64 && (
                <div className="w-full h-48 overflow-hidden bg-black">
                  <LazyImage
                    src={item.imageBase64}
                    alt={item.text || 'Notícia'}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                  />
                </div>
              )}
              
              {/* Conteúdo */}
              <div className="p-6">
                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2 line-clamp-2 group-hover:text-alego-600 dark:group-hover:text-alego-400 transition">
                  {item.text || 'Notícia'}
                </h3>
                
                <div className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-400 mb-3">
                  {item.authorAvatar && (
                    <img
                      src={item.authorAvatar}
                      alt={item.authorName}
                      className="h-6 w-6 rounded-full object-cover"
                    />
                  )}
                  <span>{item.authorName || 'Autor'}</span>
                  <span>•</span>
                  <span>
                    {item.createdAt?.toDate?.().toLocaleDateString('pt-BR') || 'Data não disponível'}
                  </span>
                </div>
                
                <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-2">
                  {item.fullText || item.text || ''}
                </p>
                
                <div className="mt-4 text-alego-600 dark:text-alego-400 font-semibold text-sm">
                  Ler mais →
                </div>
              </div>
            </Link>
          ))
        )}
      </div>

      {/* Ver todas as notícias */}
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

