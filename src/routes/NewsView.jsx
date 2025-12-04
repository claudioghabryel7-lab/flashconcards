import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import { ArrowLeftIcon } from '@heroicons/react/24/outline'
import { db } from '../firebase/config'
import { useDarkMode } from '../hooks/useDarkMode.jsx'

const NewsView = () => {
  const { postId } = useParams()
  const navigate = useNavigate()
  const { darkMode } = useDarkMode()
  const [news, setNews] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!postId) {
      setError('Notícia não encontrada')
      setLoading(false)
      return
    }

    const loadNews = async () => {
      try {
        const postRef = doc(db, 'posts', postId)
        const snap = await getDoc(postRef)

        if (!snap.exists()) {
          setError('Notícia não encontrada')
          setLoading(false)
          return
        }

        const data = snap.data()

        // Verificar se é uma notícia
        if (!data.isNews) {
          setError('Esta publicação não é uma notícia')
          setLoading(false)
          return
        }

        setNews({
          id: snap.id,
          ...data,
        })
        setLoading(false)
      } catch (err) {
        console.error('Erro ao carregar notícia:', err)
        setError('Erro ao carregar notícia. Tente novamente.')
        setLoading(false)
      }
    }

    loadNews()
  }, [postId])

  const formatDate = (timestamp) => {
    if (!timestamp) return 'Data não disponível'

    try {
      let date
      if (timestamp instanceof Date) {
        date = timestamp
      } else if (timestamp.toDate) {
        date = timestamp.toDate()
      } else if (timestamp.seconds) {
        date = new Date(timestamp.seconds * 1000)
      } else {
        return 'Data não disponível'
      }

      return date.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return 'Data não disponível'
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: darkMode ? '#000000' : '#ffffff' }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-alego-600 mx-auto mb-4"></div>
          <p className="text-slate-600 dark:text-slate-400">Carregando notícia...</p>
        </div>
      </div>
    )
  }

  if (error || !news) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: darkMode ? '#000000' : '#ffffff' }}>
        <div className="text-center max-w-md mx-auto px-4">
          <p className="text-lg font-semibold text-slate-900 dark:text-white mb-4">{error || 'Notícia não encontrada'}</p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-6 py-3 bg-alego-600 text-white font-semibold rounded-lg hover:bg-alego-700 transition"
          >
            <ArrowLeftIcon className="h-5 w-5" />
            Voltar para o início
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div 
      className="min-h-screen"
      style={{ backgroundColor: darkMode ? '#000000' : '#ffffff' }}
    >
      {/* Header simples */}
      <div className="border-b border-slate-300 dark:border-slate-800 sticky top-0 z-10 bg-white dark:bg-black">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-alego-600 hover:text-alego-700 dark:text-alego-400 font-semibold"
          >
            <ArrowLeftIcon className="h-5 w-5" />
            Voltar para o site
          </Link>
        </div>
      </div>

      {/* Conteúdo da notícia - Estilo portal de notícias */}
      <article className="max-w-4xl mx-auto px-4 py-8 md:py-12">
        {/* Cabeçalho da notícia */}
        <header className="mb-8">
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-slate-900 dark:text-white mb-4 leading-tight">
            {news.text || 'Notícia'}
          </h1>
          
          <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600 dark:text-slate-400">
            <div className="flex items-center gap-2">
              {news.authorAvatar ? (
                <img
                  src={news.authorAvatar}
                  alt={news.authorName}
                  className="h-8 w-8 rounded-full object-cover"
                />
              ) : (
                <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                  <span className="text-white font-bold text-xs">
                    {(news.authorName || 'U')[0].toUpperCase()}
                  </span>
                </div>
              )}
              <span className="font-semibold text-slate-900 dark:text-white">
                {news.authorName || 'Autor'}
              </span>
            </div>
            <span>•</span>
            <time>{formatDate(news.createdAt)}</time>
          </div>
        </header>

        {/* Imagem principal */}
        {news.imageBase64 && (
          <div className="mb-8 rounded-lg overflow-hidden">
            <img
              src={news.imageBase64}
              alt={news.text || 'Notícia'}
              className="w-full h-auto max-h-[600px] object-contain"
            />
          </div>
        )}

        {/* Conteúdo completo */}
        <div className="prose prose-lg dark:prose-invert max-w-none">
          <div className="text-lg leading-relaxed text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
            {news.fullText || news.text || ''}
          </div>
        </div>

        {/* Botão Voltar */}
        <div className="mt-12 pt-8 border-t border-slate-300 dark:border-slate-800">
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-8 py-4 bg-alego-600 text-white font-semibold rounded-lg hover:bg-alego-700 transition text-lg"
          >
            <ArrowLeftIcon className="h-6 w-6" />
            Voltar para a Plataforma
          </Link>
        </div>
      </article>
    </div>
  )
}

export default NewsView

