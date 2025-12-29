import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { collection, query, where, getDocs, limit, orderBy } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { formatDate } from '../../utils/blogUtils'

const Sidebar = ({ currentArticle, currentCategory }) => {
  const navigate = useNavigate()
  const [relatedArticles, setRelatedArticles] = useState([])
  const [popularArticles, setPopularArticles] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadSidebarContent = async () => {
      if (!db) {
        setLoading(false)
        return
      }

      try {
        const articlesRef = collection(db, 'blog_articles')
        
        // Carregar artigos relacionados (mesma categoria, excluindo o atual)
        if (currentCategory && currentCategory !== 'TODAS') {
          // Buscar apenas por status para evitar índice composto
          const relatedQuery = query(
            articlesRef,
            where('status', '==', 'published'),
            limit(20) // Buscar mais para filtrar por categoria no cliente
          )
          
          const relatedSnapshot = await getDocs(relatedQuery)
          const related = relatedSnapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(article => {
              // Filtrar por categoria no cliente e excluir o artigo atual
              return article.category === currentCategory && article.id !== currentArticle?.id
            })
            .sort((a, b) => {
              // Ordenar por data no cliente
              const dateA = a.createdAt?.toDate?.() || new Date(0)
              const dateB = b.createdAt?.toDate?.() || new Date(0)
              return dateB.getTime() - dateA.getTime()
            })
            .slice(0, 4)
          
          setRelatedArticles(related)
        }

        // Carregar artigos populares (mais recentes, com destaque)
        // SEM orderBy para evitar índice composto
        const popularQuery = query(
          articlesRef,
          where('status', '==', 'published'),
          limit(10) // Buscar mais para ordenar no cliente
        )
        
        const popularSnapshot = await getDocs(popularQuery)
        const popular = popularSnapshot.docs
          .map(doc => ({ id: doc.id, ...doc.data() }))
          .filter(article => article.id !== currentArticle?.id)
          .sort((a, b) => {
            // Ordenar por data no cliente
            const dateA = a.createdAt?.toDate?.() || new Date(0)
            const dateB = b.createdAt?.toDate?.() || new Date(0)
            return dateB.getTime() - dateA.getTime()
          })
          .slice(0, 4)
        
        setPopularArticles(popular)
      } catch (error) {
        console.error('Erro ao carregar sidebar:', error)
      } finally {
        setLoading(false)
      }
    }

    loadSidebarContent()
  }, [currentArticle, currentCategory])

  const handleArticleClick = (articleId) => {
    navigate(`/blank/noticia/${articleId}`)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <aside style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '24px'
    }}>
      {/* CTA Principal FlashConCards */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        whileHover={{ scale: 1.02, y: -4 }}
        style={{
          background: 'linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%)',
          borderRadius: '16px',
          padding: '24px',
          color: 'white',
          boxShadow: '0 8px 24px rgba(30, 58, 138, 0.3)',
          border: '2px solid #fbbf24',
          position: 'relative',
          overflow: 'hidden'
        }}
        className="pulse-glow"
      >
        {/* Shimmer Effect */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: '-100%',
          width: '100%',
          height: '100%',
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)',
          animation: 'shimmer 3s infinite'
        }}></div>
        <div style={{
          fontSize: '32px',
          marginBottom: '12px',
          textAlign: 'center'
        }}>
          ⚡
        </div>
        <h3 style={{
          fontSize: '20px',
          fontWeight: 'bold',
          marginBottom: '12px',
          textAlign: 'center',
          color: '#fbbf24'
        }}>
          FlashConCards
        </h3>
        <p style={{
          fontSize: '14px',
          lineHeight: '1.6',
          marginBottom: '20px',
          textAlign: 'center',
          opacity: 0.95
        }}>
          Prepare-se para concursos públicos com flashcards interativos, questões comentadas e simulados completos.
        </p>
        <a
          href={currentArticle?.courseLink || 'https://www.flashconcards.com.br'}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'block',
            width: '100%',
            padding: '12px 20px',
            backgroundColor: '#fbbf24',
            color: '#1e3a8a',
            textDecoration: 'none',
            borderRadius: '8px',
            fontWeight: 'bold',
            fontSize: '14px',
            textAlign: 'center',
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
          {currentArticle?.courseLink ? 'Acessar Curso Agora →' : 'Acessar Agora →'}
        </a>
      </motion.div>

      {/* CTA Newsletter/WhatsApp */}
      <div style={{
        backgroundColor: '#f0f9ff',
        borderRadius: '12px',
        padding: '20px',
        border: '2px solid #1e3a8a'
      }}>
        <h3 style={{
          fontSize: '18px',
          fontWeight: 'bold',
          marginBottom: '12px',
          color: '#1e3a8a'
        }}>
          📱 Receba Notícias
        </h3>
        <p style={{
          fontSize: '13px',
          lineHeight: '1.6',
          marginBottom: '16px',
          color: '#374151'
        }}>
          Receba as últimas notícias de concursos públicos diretamente no seu WhatsApp.
        </p>
        <a
          href="https://wa.me/5562981841878?text=Olá!%20Gostaria%20de%20receber%20notícias%20de%20concursos."
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'block',
            width: '100%',
            padding: '10px 16px',
            backgroundColor: '#25D366',
            color: 'white',
            textDecoration: 'none',
            borderRadius: '8px',
            fontWeight: 'bold',
            fontSize: '13px',
            textAlign: 'center',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => {
            e.target.style.backgroundColor = '#20BA5A'
            e.target.style.transform = 'translateY(-2px)'
          }}
          onMouseLeave={(e) => {
            e.target.style.backgroundColor = '#25D366'
            e.target.style.transform = 'translateY(0)'
          }}
        >
          📲 WhatsApp
        </a>
      </div>

      {/* Artigos Relacionados */}
      {relatedArticles.length > 0 && (
        <div style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          padding: '20px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
        }}>
          <h3 style={{
            fontSize: '18px',
            fontWeight: 'bold',
            marginBottom: '16px',
            color: '#1e3a8a',
            borderBottom: '2px solid #fbbf24',
            paddingBottom: '8px'
          }}>
            📰 Relacionados
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {relatedArticles.map(article => (
              <div
                key={article.id}
                onClick={() => handleArticleClick(article.id)}
                style={{
                  cursor: 'pointer',
                  padding: '12px',
                  borderRadius: '8px',
                  transition: 'all 0.2s',
                  border: '1px solid #e5e7eb'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#f9fafb'
                  e.currentTarget.style.borderColor = '#1e3a8a'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'white'
                  e.currentTarget.style.borderColor = '#e5e7eb'
                }}
              >
                <h4 style={{
                  fontSize: '14px',
                  fontWeight: 'bold',
                  marginBottom: '6px',
                  color: '#1f2937',
                  lineHeight: '1.4',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden'
                }}>
                  {article.title}
                </h4>
                <p style={{
                  fontSize: '12px',
                  color: '#6b7280',
                  margin: 0
                }}>
                  {formatDate(article.createdAt)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Artigos Populares */}
      {popularArticles.length > 0 && (
        <div style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          padding: '20px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
        }}>
          <h3 style={{
            fontSize: '18px',
            fontWeight: 'bold',
            marginBottom: '16px',
            color: '#1e3a8a',
            borderBottom: '2px solid #fbbf24',
            paddingBottom: '8px'
          }}>
            🔥 Populares
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {popularArticles.map(article => (
              <div
                key={article.id}
                onClick={() => handleArticleClick(article.id)}
                style={{
                  cursor: 'pointer',
                  padding: '12px',
                  borderRadius: '8px',
                  transition: 'all 0.2s',
                  border: '1px solid #e5e7eb'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#f9fafb'
                  e.currentTarget.style.borderColor = '#1e3a8a'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'white'
                  e.currentTarget.style.borderColor = '#e5e7eb'
                }}
              >
                <h4 style={{
                  fontSize: '14px',
                  fontWeight: 'bold',
                  marginBottom: '6px',
                  color: '#1f2937',
                  lineHeight: '1.4',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden'
                }}>
                  {article.title}
                </h4>
                <p style={{
                  fontSize: '12px',
                  color: '#6b7280',
                  margin: 0
                }}>
                  {formatDate(article.createdAt)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </aside>
  )
}

export default Sidebar

