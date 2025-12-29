import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ShareIcon, ArrowLeftIcon } from '@heroicons/react/24/outline'
import { useArticle } from '../hooks/useArticles'
import Sidebar from '../components/blog/Sidebar'
import SalesChatbot from '../components/SalesChatbot'
import { formatDate, calculateReadingTime, extractCompetitionName } from '../utils/blogUtils'
import { collection, query, where, getDocs, limit } from 'firebase/firestore'
import { db } from '../firebase/config'
import '../styles/blog-modern.css'

const BlogNewsView = () => {
  const { articleId } = useParams()
  const navigate = useNavigate()
  
  // Usar React Query para buscar artigo
  const { data: article, isLoading: loading, error: queryError } = useArticle(articleId)
  const [error, setError] = useState('')
  const [courses, setCourses] = useState([])

  useEffect(() => {
    if (queryError) {
      setError('Erro ao carregar artigo')
    } else if (!loading && !article) {
      setError('Artigo não encontrado')
    }
  }, [queryError, loading, article])

  // Carregar cursos relacionados
  useEffect(() => {
    const loadCourses = async () => {
      try {
        const coursesRef = collection(db, 'courses')
        const q = query(coursesRef, where('active', '==', true), limit(3))
        const coursesSnapshot = await getDocs(q)
        const coursesData = coursesSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }))
        setCourses(coursesData)
      } catch (err) {
        console.error('Erro ao carregar cursos:', err)
      }
    }
    loadCourses()
  }, [])

  useEffect(() => {
    if (!article) return

    // SEO: Adicionar meta tags dinamicamente
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      const seoTitle = article.metaTitle || article.title || 'Notícia de Concurso - FlashConCards'
      const seoDescription = article.metaDescription || article.excerpt || article.title || ''
      
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
      // Usar featuredImage do upload como imagem do compartilhamento
      if (article.featuredImage) {
        ogTags.push({ property: 'og:image', content: article.featuredImage })
        ogTags.push({ property: 'og:image:type', content: article.featuredImage.startsWith('data:') ? 'image/jpeg' : 'image/png' })
        ogTags.push({ property: 'og:image:width', content: '1200' })
        ogTags.push({ property: 'og:image:height', content: '630' })
        ogTags.push({ property: 'og:image:alt', content: seoTitle })
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
      // Usar featuredImage do upload como imagem do compartilhamento
      if (article.featuredImage) {
        twitterTags.push({ name: 'twitter:image', content: article.featuredImage })
        twitterTags.push({ name: 'twitter:image:alt', content: seoTitle })
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
  }, [article])

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

  // Extrair nome do concurso para CTA contextual
  const competitionName = article ? extractCompetitionName(article.content || '', article.title || '') : ''

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '18px', color: '#1e3a8a', marginBottom: '10px' }}>Carregando...</div>
        </div>
      </div>
    )
  }

  if (error || (!loading && !article)) {
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

  if (!article) {
    return null
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      {/* Layout 2 Colunas: 70% Conteúdo / 30% Sidebar */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
        style={{
          maxWidth: '1400px',
          margin: '0 auto',
          padding: '40px 20px',
          display: 'grid',
          gridTemplateColumns: '1fr 350px',
          gap: '40px',
          alignItems: 'start'
        }}
        className="article-layout"
      >
        {/* Coluna Principal - Artigo (70%) */}
        <motion.article
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          style={{
            backgroundColor: 'white',
            borderRadius: '16px',
            padding: '40px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.1)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255,255,255,0.2)'
          }}
          className="glass-card smooth-transition"
        >
          {/* Categoria */}
          <div style={{
            fontSize: '14px',
            color: '#1e3a8a',
            fontWeight: 'bold',
            marginBottom: '15px',
            textTransform: 'uppercase',
            letterSpacing: '0.5px'
          }}>
            {article.category}
          </div>
          
          {/* Título H1 para SEO */}
          <h1 style={{
            fontSize: '42px',
            fontWeight: '900',
            marginBottom: '20px',
            color: '#1f2937',
            lineHeight: '1.2'
          }}>
            {article.title}
          </h1>
          
          {/* Meta informações */}
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
            gap: '12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
              <span>Por FlashConCards</span>
              <span>•</span>
              <span>📅 {formatDate(article.createdAt)}</span>
              <span>•</span>
              <span>⏱️ {calculateReadingTime(article.content)} min de leitura</span>
            </div>
            <button
              onClick={handleShare}
              style={{
                padding: '8px 16px',
                backgroundColor: '#f3f4f6',
                color: '#1e3a8a',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '14px',
                fontWeight: '600',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.target.style.backgroundColor = '#e5e7eb'
              }}
              onMouseLeave={(e) => {
                e.target.style.backgroundColor = '#f3f4f6'
              }}
              aria-label="Compartilhar notícia"
            >
              <ShareIcon style={{ width: '18px', height: '18px' }} />
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
          
          {/* CTA Contextual FlashConCards */}
          <div style={{
            marginTop: '50px',
            padding: '30px',
            background: 'linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%)',
            borderRadius: '12px',
            textAlign: 'center',
            color: 'white',
            boxShadow: '0 8px 24px rgba(30, 58, 138, 0.3)'
          }}>
            <h3 style={{
              fontSize: '24px',
              fontWeight: 'bold',
              marginBottom: '15px',
              color: '#fbbf24'
            }}>
              🎓 {competitionName ? `Prepare-se para ${competitionName}!` : 'Prepare-se para este concurso!'}
            </h3>
            <p style={{
              fontSize: '16px',
              marginBottom: '20px',
              opacity: 0.95,
              lineHeight: '1.6'
            }}>
              {competitionName 
                ? `Acesse o FlashConCards e tenha acesso a flashcards, questões e simulados completos para ${competitionName}.`
                : 'Acesse o FlashConCards e tenha acesso a flashcards, questões e simulados completos para concursos públicos.'
              }
            </p>
            <a
              href={article.courseLink || 'https://www.flashconcards.com.br'}
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
                fontSize: '16px',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.target.style.backgroundColor = '#fcd34d'
                e.target.style.transform = 'translateY(-2px)'
              }}
              onMouseLeave={(e) => {
                e.target.style.backgroundColor = '#fbbf24'
                e.target.style.transform = 'translateY(0)'
              }}
            >
              {article.courseLink ? 'Acessar Curso Agora →' : 'Acessar FlashConCards →'}
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

          {/* Chatbot de Vendas - DENTRO do conteúdo */}
          <SalesChatbot article={article} courses={courses} />
        </motion.article>

        {/* Sidebar (30%) */}
        <motion.div
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          style={{
            position: 'sticky',
            top: '100px',
            alignSelf: 'start'
          }}
        >
          <Sidebar 
            currentArticle={article}
            currentCategory={article?.category}
          />
        </motion.div>
      </motion.div>

      {/* Responsive CSS */}
      <style>{`
        @media (max-width: 1024px) {
          .article-layout {
            grid-template-columns: 1fr !important;
            gap: 24px !important;
          }
          .article-layout > div:last-child {
            position: static !important;
            top: auto !important;
          }
        }
        @media (max-width: 768px) {
          .article-layout {
            padding: 20px 16px !important;
          }
          .article-layout article {
            padding: 24px !important;
          }
          .article-layout article h1 {
            font-size: 28px !important;
          }
        }
      `}</style>
    </div>
  )
}

export default BlogNewsView

