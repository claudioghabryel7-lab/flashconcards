import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import { ShareIcon, ArrowLeftIcon } from '@heroicons/react/24/outline'
import { db } from '../firebase/config'

const BlogNewsView = () => {
  const { articleId } = useParams()
  const navigate = useNavigate()
  const [article, setArticle] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!articleId) {
      setError('Artigo não encontrado')
      setLoading(false)
      return
    }

    const loadArticle = async () => {
      try {
        const articleRef = doc(db, 'blog_articles', articleId)
        const snap = await getDoc(articleRef)

        if (!snap.exists()) {
          setError('Artigo não encontrado')
          setLoading(false)
          return
        }

        const data = snap.data()

        // Verificar se está publicado
        if (data.status !== 'published') {
          setError('Este artigo não está disponível')
          setLoading(false)
          return
        }

        setArticle({
          id: snap.id,
          ...data,
        })

        // SEO: Adicionar meta tags dinamicamente
        if (typeof window !== 'undefined' && typeof document !== 'undefined') {
          const seoTitle = data.metaTitle || data.title || 'Notícia de Concurso - FlashConCards'
          const seoDescription = data.metaDescription || data.excerpt || data.title || ''
          
          // Atualizar título
          document.title = `${seoTitle} | FlashNotícias`
          
          // Remover meta tags antigas
          const oldTags = document.querySelectorAll('meta[name="description"], meta[property^="og:"], meta[name^="twitter:"], link[rel="canonical"]')
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
          if (data.featuredImage) {
            ogTags.push({ property: 'og:image', content: data.featuredImage })
          }
          ogTags.forEach(tag => {
            const meta = document.createElement('meta')
            meta.setAttribute('property', tag.property)
            meta.content = tag.content
            document.head.appendChild(meta)
          })

          // Twitter Card
          const twitterTags = [
            { name: 'twitter:card', content: 'summary_large_image' },
            { name: 'twitter:title', content: seoTitle },
            { name: 'twitter:description', content: seoDescription },
          ]
          if (data.featuredImage) {
            twitterTags.push({ name: 'twitter:image', content: data.featuredImage })
          }
          twitterTags.forEach(tag => {
            const meta = document.createElement('meta')
            meta.setAttribute('name', tag.name)
            meta.content = tag.content
            document.head.appendChild(meta)
          })

          // Canonical URL
          const canonical = document.createElement('link')
          canonical.rel = 'canonical'
          canonical.href = window.location.href
          document.head.appendChild(canonical)
        }
        
        setLoading(false)
      } catch (err) {
        console.error('Erro ao carregar artigo:', err)
        setError('Erro ao carregar artigo')
        setLoading(false)
      }
    }

    loadArticle()
  }, [articleId])

  // Função para compartilhar
  const handleShare = async () => {
    const shareUrl = window.location.href
    const shareTitle = article?.title || 'Notícia FlashConCards'
    const shareText = article?.excerpt || article?.title || ''

    if (navigator.share) {
      try {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: shareUrl,
        })
      } catch (err) {
        if (err.name !== 'AbortError') {
          // Fallback: copiar para clipboard
          await navigator.clipboard.writeText(shareUrl)
          alert('Link copiado para a área de transferência!')
        }
      }
    } else {
      // Fallback: copiar para clipboard
      try {
        await navigator.clipboard.writeText(shareUrl)
        alert('Link copiado para a área de transferência!')
      } catch (err) {
        console.error('Erro ao copiar link:', err)
        alert('Erro ao copiar link. Tente copiar manualmente: ' + shareUrl)
      }
    }
  }

  // Formatar data
  const formatDate = (timestamp) => {
    if (!timestamp) return 'Data não disponível'
    
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
      return date.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric'
      })
    } catch (err) {
      return 'Data não disponível'
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '18px', color: '#1e3a8a', marginBottom: '10px' }}>Carregando...</div>
        </div>
      </div>
    )
  }

  if (error || !article) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '18px', color: '#dc2626', marginBottom: '10px' }}>{error || 'Artigo não encontrado'}</div>
          <button
            onClick={() => navigate('/blank')}
            style={{
              padding: '10px 20px',
              backgroundColor: '#1e3a8a',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            Voltar para FlashNotícias
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      {/* Header */}
      <header style={{
        backgroundColor: '#1e3a8a',
        padding: '15px 20px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
      }}>
        <div style={{
          maxWidth: '1200px',
          margin: '0 auto',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <button
            onClick={() => navigate('/blank')}
            style={{
              padding: '8px 16px',
              backgroundColor: 'transparent',
              color: 'white',
              border: '1px solid white',
              borderRadius: '6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '14px'
            }}
          >
            <ArrowLeftIcon style={{ width: '18px', height: '18px' }} />
            Voltar
          </button>
          <h1 style={{
            color: 'white',
            fontSize: '20px',
            fontWeight: 'bold',
            margin: 0
          }}>
            FlashNotícias
          </h1>
          <button
            onClick={handleShare}
            style={{
              padding: '8px 16px',
              backgroundColor: 'white',
              color: '#1e3a8a',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '14px',
              fontWeight: '600'
            }}
            aria-label="Compartilhar notícia"
          >
            <ShareIcon style={{ width: '18px', height: '18px' }} />
            Compartilhar
          </button>
        </div>
      </header>
      
      {/* Artigo */}
      <article style={{
        maxWidth: '800px',
        margin: '40px auto',
        padding: '0 20px'
      }}>
        <div style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          padding: '40px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
        }}>
          <div style={{
            fontSize: '14px',
            color: '#1e3a8a',
            fontWeight: 'bold',
            marginBottom: '15px',
            textTransform: 'uppercase'
          }}>
            {article.category}
          </div>
          
          <h1 style={{
            fontSize: '36px',
            fontWeight: '900',
            marginBottom: '20px',
            color: '#1f2937',
            lineHeight: '1.2'
          }}>
            {article.title}
          </h1>
          
          <div style={{
            fontSize: '14px',
            color: '#6b7280',
            marginBottom: '30px',
            paddingBottom: '20px',
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '10px'
          }}>
            <span>Por FlashConCards • {formatDate(article.createdAt)}</span>
            <button
              onClick={handleShare}
              style={{
                padding: '6px 12px',
                backgroundColor: '#f3f4f6',
                color: '#1e3a8a',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '13px',
                fontWeight: '500'
              }}
              aria-label="Compartilhar notícia"
            >
              <ShareIcon style={{ width: '16px', height: '16px' }} />
              Compartilhar
            </button>
          </div>
          
          {article.featuredImage && (
            <img
              src={article.featuredImage}
              alt={article.title}
              style={{
                width: '100%',
                borderRadius: '8px',
                marginBottom: '30px'
              }}
            />
          )}
          
          <div
            style={{
              fontSize: '18px',
              lineHeight: '1.9',
              color: '#374151',
              maxWidth: '100%'
            }}
            dangerouslySetInnerHTML={{ 
              __html: article.content
                .replace(/<p>/g, '<p style="margin-bottom: 24px; color: #374151; line-height: 1.9;">')
                .replace(/<h2>/g, '<h2 style="font-size: 28px; font-weight: 800; color: #1e3a8a; margin-top: 40px; margin-bottom: 20px; line-height: 1.3;">')
                .replace(/<h3>/g, '<h3 style="font-size: 22px; font-weight: 700; color: #1e40af; margin-top: 32px; margin-bottom: 16px; line-height: 1.4;">')
                .replace(/<ul>/g, '<ul style="margin: 20px 0; padding-left: 24px; list-style-type: disc;">')
                .replace(/<li>/g, '<li style="margin-bottom: 12px; line-height: 1.8;">')
                .replace(/<strong>/g, '<strong style="font-weight: 700; color: #1f2937;">')
            }}
          />
          
          {/* CTA FlashConCards */}
          <div style={{
            marginTop: '50px',
            padding: '30px',
            backgroundColor: '#1e3a8a',
            borderRadius: '12px',
            textAlign: 'center',
            color: 'white'
          }}>
            <h3 style={{
              fontSize: '24px',
              fontWeight: 'bold',
              marginBottom: '15px'
            }}>
              🎓 Prepare-se para este concurso!
            </h3>
            <p style={{
              fontSize: '16px',
              marginBottom: '20px',
              opacity: 0.9
            }}>
              Acesse o FlashConCards e tenha acesso a flashcards, questões e simulados completos
            </p>
            <a
              href="https://www.flashconcards.com.br"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-block',
                padding: '14px 32px',
                backgroundColor: '#fbbf24',
                color: '#1e3a8a',
                textDecoration: 'none',
                borderRadius: '8px',
                fontWeight: 'bold',
                fontSize: '16px'
              }}
            >
              Acessar FlashConCards →
            </a>
          </div>
          
          {/* Tags */}
          {article.tags && article.tags.length > 0 && (
            <div style={{
              marginTop: '40px',
              paddingTop: '30px',
              borderTop: '1px solid #e5e7eb'
            }}>
              <div style={{
                fontSize: '14px',
                fontWeight: 'bold',
                color: '#6b7280',
                marginBottom: '15px'
              }}>
                Tags:
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {article.tags.map((tag, index) => (
                  <span
                    key={index}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: '#e0e7ff',
                      color: '#1e3a8a',
                      borderRadius: '20px',
                      fontSize: '13px',
                      fontWeight: '500'
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </article>
    </div>
  )
}

export default BlogNewsView

