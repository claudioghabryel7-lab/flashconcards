import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import { ArrowLeftIcon, CalendarIcon, CurrencyDollarIcon, UserGroupIcon, DocumentTextIcon, BuildingOfficeIcon } from '@heroicons/react/24/outline'
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

        const newsData = {
          id: snap.id,
          ...data,
        }
        setNews(newsData)
        setLoading(false)
        
        // SEO: Adicionar meta tags dinamicamente
        if (typeof window !== 'undefined' && typeof document !== 'undefined') {
          const seoTitle = newsData.seoTitle || newsData.text || 'Notícia de Concurso - FlashConCards'
          const seoDescription = newsData.seoDescription || newsData.fullText?.substring(0, 160) || newsData.text || ''
          
          // Atualizar título
          document.title = `${seoTitle} | FlashConCards`
          
          // Remover meta tags antigas
          const oldTags = document.querySelectorAll('meta[name="description"], meta[property^="og:"], meta[name^="twitter:"], script[type="application/ld+json"]')
          oldTags.forEach(tag => tag.remove())
          
          // Adicionar meta description
          const metaDesc = document.createElement('meta')
          metaDesc.name = 'description'
          metaDesc.content = seoDescription
          document.head.appendChild(metaDesc)
          
          // Open Graph
          const ogTags = [
            { property: 'og:type', content: 'article' },
            { property: 'og:title', content: seoTitle },
            { property: 'og:description', content: seoDescription },
            { property: 'og:url', content: window.location.href },
          ]
          if (newsData.imageBase64) {
            ogTags.push({ property: 'og:image', content: newsData.imageBase64 })
          }
          ogTags.forEach(tag => {
            const meta = document.createElement('meta')
            meta.setAttribute('property', tag.property)
            meta.content = tag.content
            document.head.appendChild(meta)
          })
          
          // Twitter Cards
          const twitterTags = [
            { name: 'twitter:card', content: 'summary_large_image' },
            { name: 'twitter:title', content: seoTitle },
            { name: 'twitter:description', content: seoDescription },
          ]
          if (newsData.imageBase64) {
            twitterTags.push({ name: 'twitter:image', content: newsData.imageBase64 })
          }
          twitterTags.forEach(tag => {
            const meta = document.createElement('meta')
            meta.setAttribute('name', tag.name)
            meta.content = tag.content
            document.head.appendChild(meta)
          })
          
          // Schema.org NewsArticle
          if (newsData.isConcursoNews && newsData.concursoData) {
            const schema = {
              '@context': 'https://schema.org',
              '@type': 'NewsArticle',
              headline: seoTitle,
              description: seoDescription,
              datePublished: newsData.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
              author: {
                '@type': 'Organization',
                name: 'FlashConCards'
              },
              publisher: {
                '@type': 'Organization',
                name: 'FlashConCards',
                logo: {
                  '@type': 'ImageObject',
                  url: `${window.location.origin}/logo.svg`
                }
              }
            }
            
            const schemaScript = document.createElement('script')
            schemaScript.type = 'application/ld+json'
            schemaScript.textContent = JSON.stringify(schema)
            document.head.appendChild(schemaScript)
          }
        }
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
            {news.seoTitle || news.text || 'Notícia'}
          </h1>
          
          <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600 dark:text-slate-400 mb-6">
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
          
          {/* Dados específicos de concurso */}
          {news.isConcursoNews && news.concursoData && (
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-slate-800 dark:to-slate-900 rounded-2xl p-6 mb-8 border border-blue-200 dark:border-slate-700">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                <DocumentTextIcon className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                Informações do Concurso
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {news.concursoData.orgao && (
                  <div className="flex items-start gap-3">
                    <BuildingOfficeIcon className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Órgão</p>
                      <p className="text-base font-bold text-slate-900 dark:text-white">{news.concursoData.orgao}</p>
                    </div>
                  </div>
                )}
                {news.concursoData.vagas && news.concursoData.vagas !== 'A definir' && (
                  <div className="flex items-start gap-3">
                    <UserGroupIcon className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Vagas</p>
                      <p className="text-base font-bold text-slate-900 dark:text-white">{news.concursoData.vagas}</p>
                    </div>
                  </div>
                )}
                {news.concursoData.remuneracao && news.concursoData.remuneracao !== 'A definir' && (
                  <div className="flex items-start gap-3">
                    <CurrencyDollarIcon className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Remuneração</p>
                      <p className="text-base font-bold text-slate-900 dark:text-white">{news.concursoData.remuneracao}</p>
                    </div>
                  </div>
                )}
                {news.concursoData.dataInscricaoFim && (
                  <div className="flex items-start gap-3">
                    <CalendarIcon className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Inscrições até</p>
                      <p className="text-base font-bold text-slate-900 dark:text-white">
                        {new Date(news.concursoData.dataInscricaoFim).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                  </div>
                )}
                {news.concursoData.banca && news.concursoData.banca !== 'A definir' && (
                  <div className="flex items-start gap-3">
                    <DocumentTextIcon className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase">Banca</p>
                      <p className="text-base font-bold text-slate-900 dark:text-white">{news.concursoData.banca}</p>
                    </div>
                  </div>
                )}
                {news.concursoData.linkEdital && (
                  <div className="md:col-span-2">
                    <a
                      href={news.concursoData.linkEdital}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition"
                    >
                      <DocumentTextIcon className="h-5 w-5" />
                      Ver Edital Completo
                    </a>
                  </div>
                )}
              </div>
              {news.concursoData.conteudoProgramatico && (
                <div className="mt-4 pt-4 border-t border-blue-200 dark:border-slate-700">
                  <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase mb-2">Conteúdo Programático</p>
                  <p className="text-sm text-slate-700 dark:text-slate-300">{news.concursoData.conteudoProgramatico}</p>
                </div>
              )}
            </div>
          )}
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
          <div 
            className="text-lg leading-relaxed text-slate-700 dark:text-slate-300"
            dangerouslySetInnerHTML={{ __html: news.fullText || news.text || '' }}
          />
        </div>
        
        {/* Tags e palavras-chave */}
        {news.tags && news.tags.length > 0 && (
          <div className="mt-8 pt-6 border-t border-slate-300 dark:border-slate-800">
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-400 mb-3">Tags:</p>
            <div className="flex flex-wrap gap-2">
              {news.tags.map((tag, index) => (
                <span
                  key={index}
                  className="px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-sm font-medium"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

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

