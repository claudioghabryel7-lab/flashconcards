import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import { ArrowLeftIcon, CalendarIcon, CurrencyDollarIcon, UserGroupIcon, DocumentTextIcon, BuildingOfficeIcon, ShareIcon, ClockIcon } from '@heroicons/react/24/outline'
import { db } from '../firebase/config'
import { useDarkMode } from '../hooks/useDarkMode.jsx'
import Header from '../components/Header'

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
              {/* Badge de categoria */}
              {news.isConcursoNews && (
                <div className="mb-4">
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                    📰 Notícia de Concurso
                  </span>
                </div>
              )}
              
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-black text-slate-900 dark:text-white mb-6 leading-tight">
                {news.seoTitle || news.text || 'Notícia'}
              </h1>
              
              {/* Meta informações */}
              <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600 dark:text-slate-400 mb-6 pb-6 border-b border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-2">
                  {news.authorAvatar ? (
                    <img
                      src={news.authorAvatar}
                      alt={news.authorName}
                      className="h-10 w-10 rounded-full object-cover"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                      <span className="text-white font-bold text-sm">
                        {(news.authorName || 'U')[0].toUpperCase()}
                      </span>
                    </div>
                  )}
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-white">
                      {news.authorName || 'FlashConCards'}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {news.isConcursoNews ? 'Equipe FlashConCards' : 'Autor'}
                    </p>
                  </div>
                </div>
                <span className="hidden sm:inline text-slate-300 dark:text-slate-600">•</span>
                <div className="flex items-center gap-1">
                  <ClockIcon className="h-4 w-4" />
                  <time>{formatDate(news.createdAt)}</time>
                </div>
                <span className="hidden sm:inline text-slate-300 dark:text-slate-600">•</span>
                <button
                  onClick={async () => {
                    if (navigator.share) {
                      try {
                        await navigator.share({
                          title: news.seoTitle || news.text,
                          text: news.seoDescription || news.text,
                          url: window.location.href,
                        })
                      } catch (err) {
                        // Usuário cancelou
                      }
                    } else {
                      await navigator.clipboard.writeText(window.location.href)
                      alert('Link copiado para a área de transferência!')
                    }
                  }}
                  className="flex items-center gap-1 hover:text-alego-600 dark:hover:text-alego-400 transition"
                >
                  <ShareIcon className="h-4 w-4" />
                  <span>Compartilhar</span>
                </button>
              </div>
          
            {/* Dados específicos de concurso - Card destacado */}
            {news.isConcursoNews && news.concursoData && (
              <div className="bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-slate-800 dark:via-slate-800 dark:to-slate-900 rounded-2xl p-6 md:p-8 mb-8 border-2 border-blue-200 dark:border-blue-800 shadow-lg">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-3 bg-blue-600 rounded-xl">
                    <DocumentTextIcon className="h-6 w-6 text-white" />
                  </div>
                  <h2 className="text-2xl font-black text-slate-900 dark:text-white">
                    Informações do Concurso
                  </h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {news.concursoData.orgao && (
                    <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
                      <div className="flex items-center gap-3 mb-2">
                        <BuildingOfficeIcon className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                        <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Órgão</p>
                      </div>
                      <p className="text-lg font-black text-slate-900 dark:text-white">{news.concursoData.orgao}</p>
                    </div>
                  )}
                  {news.concursoData.vagas && news.concursoData.vagas !== 'A definir' && (
                    <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
                      <div className="flex items-center gap-3 mb-2">
                        <UserGroupIcon className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                        <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Vagas</p>
                      </div>
                      <p className="text-lg font-black text-slate-900 dark:text-white">{news.concursoData.vagas}</p>
                    </div>
                  )}
                  {news.concursoData.remuneracao && news.concursoData.remuneracao !== 'A definir' && (
                    <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
                      <div className="flex items-center gap-3 mb-2">
                        <CurrencyDollarIcon className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                        <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Remuneração</p>
                      </div>
                      <p className="text-lg font-black text-slate-900 dark:text-white">{news.concursoData.remuneracao}</p>
                    </div>
                  )}
                  {news.concursoData.dataInscricaoFim && (
                    <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
                      <div className="flex items-center gap-3 mb-2">
                        <CalendarIcon className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                        <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Inscrições até</p>
                      </div>
                      <p className="text-lg font-black text-slate-900 dark:text-white">
                        {new Date(news.concursoData.dataInscricaoFim).toLocaleDateString('pt-BR', {
                          day: '2-digit',
                          month: 'long',
                          year: 'numeric'
                        })}
                      </p>
                    </div>
                  )}
                  {news.concursoData.banca && news.concursoData.banca !== 'A definir' && (
                    <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
                      <div className="flex items-center gap-3 mb-2">
                        <DocumentTextIcon className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                        <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Banca</p>
                      </div>
                      <p className="text-lg font-black text-slate-900 dark:text-white">{news.concursoData.banca}</p>
                    </div>
                  )}
                  {news.concursoData.linkEdital && (
                    <div className="md:col-span-2">
                      <a
                        href={news.concursoData.linkEdital}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold rounded-xl hover:from-blue-700 hover:to-indigo-700 transition shadow-lg"
                      >
                        <DocumentTextIcon className="h-5 w-5" />
                        Ver Edital Completo
                      </a>
                    </div>
                  )}
              </div>
                  {news.concursoData.conteudoProgramatico && (
                    <div className="md:col-span-2 bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
                      <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Conteúdo Programático</p>
                      <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{news.concursoData.conteudoProgramatico}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {/* Imagem principal */}
            {news.imageBase64 && (
              <div className="mb-8 rounded-2xl overflow-hidden shadow-xl">
                <img
                  src={news.imageBase64}
                  alt={news.seoTitle || news.text || 'Notícia'}
                  className="w-full h-auto object-cover"
                />
              </div>
            )}

            {/* Conteúdo completo */}
            <div className="prose prose-lg prose-slate dark:prose-invert max-w-none mb-8">
              <div 
                className="text-lg leading-relaxed text-slate-700 dark:text-slate-300"
                dangerouslySetInnerHTML={{ __html: news.fullText || news.text || '' }}
              />
            </div>
            
            {/* Tags e palavras-chave */}
            {news.tags && news.tags.length > 0 && (
              <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-700">
                <p className="text-sm font-bold text-slate-600 dark:text-slate-400 mb-3 uppercase tracking-wide">Tags relacionadas:</p>
                <div className="flex flex-wrap gap-2">
                  {news.tags.map((tag, index) => (
                    <span
                      key={index}
                      className="px-4 py-2 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-sm font-semibold hover:bg-blue-200 dark:hover:bg-blue-900/50 transition"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Botão CTA */}
            <div className="mt-12 pt-8 border-t border-slate-200 dark:border-slate-700">
              <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-8 text-center text-white">
                <h3 className="text-2xl font-black mb-3">Prepare-se para este concurso!</h3>
                <p className="text-blue-100 mb-6">Acesse nossos cursos preparatórios e garanta sua aprovação</p>
                <Link
                  to="/"
                  className="inline-flex items-center gap-2 px-8 py-4 bg-white text-blue-600 font-bold rounded-xl hover:bg-blue-50 transition shadow-lg"
                >
                  Ver Cursos Disponíveis
                </Link>
              </div>
            </div>
          </article>

          {/* Sidebar */}
          <aside className="lg:col-span-1">
            <div className="sticky top-8 space-y-6">
              {/* Card de CTA */}
              <div className="bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl p-6 text-white">
                <h3 className="text-xl font-black mb-3">🚀 Prepare-se Agora!</h3>
                <p className="text-blue-100 mb-4 text-sm">
                  Acesse nossos cursos preparatórios com flashcards, questões e simulados.
                </p>
                <Link
                  to="/"
                  className="block w-full text-center px-4 py-3 bg-white text-blue-600 font-bold rounded-lg hover:bg-blue-50 transition"
                >
                  Ver Cursos
                </Link>
              </div>

              {/* Informações adicionais */}
              {news.isConcursoNews && news.concursoData && (
                <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700">
                  <h4 className="font-bold text-slate-900 dark:text-white mb-4">📋 Resumo</h4>
                  <div className="space-y-3 text-sm">
                    {news.concursoData.concursoName && (
                      <div>
                        <p className="text-slate-500 dark:text-slate-400 font-semibold">Concurso</p>
                        <p className="text-slate-900 dark:text-white font-bold">{news.concursoData.concursoName}</p>
                      </div>
                    )}
                    {news.concursoData.status && (
                      <div>
                        <p className="text-slate-500 dark:text-slate-400 font-semibold">Status</p>
                        <p className="text-slate-900 dark:text-white font-bold capitalize">{news.concursoData.status}</p>
                      </div>
                    )}
                    {news.concursoData.requisitos && (
                      <div>
                        <p className="text-slate-500 dark:text-slate-400 font-semibold">Requisitos</p>
                        <p className="text-slate-900 dark:text-white">{news.concursoData.requisitos}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}

export default NewsView

