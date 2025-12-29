import { Link, useOutletContext } from 'react-router-dom'
import { useState } from 'react'
import { motion } from 'framer-motion'
import { useArticles } from '../hooks/useArticles'
import { useAuth } from '../hooks/useAuth'
import { formatDate, calculateReadingTime } from '../utils/blogUtils'
import '../styles/blog-modern.css'

const ListaArtigos = () => {
  const { searchTerm = '', selectedCategory = 'TODAS' } = useOutletContext() || {}
  const { user, isAdmin, login, register, logout } = useAuth()
  
  // Garantir que usuários não logados sempre vejam apenas artigos publicados
  // isAdmin só será true se o usuário estiver logado E for admin
  const shouldShowAllArticles = Boolean(user && isAdmin)
  
  // Usar React Query para buscar artigos
  const { data: articles = [], isLoading: loading } = useArticles(selectedCategory, searchTerm, shouldShowAllArticles)
  const [showLogin, setShowLogin] = useState(false)
  const [isRegisterMode, setIsRegisterMode] = useState(false)
  const [authForm, setAuthForm] = useState({ email: '', password: '', name: '' })
  const [authError, setAuthError] = useState('')
  const [authLoading, setAuthLoading] = useState(false)

  // React Query gerencia o carregamento automaticamente

  // Handlers de autenticação
  const handleAuthSubmit = async (e) => {
    e.preventDefault()
    setAuthError('')
    setAuthLoading(true)
    
    try {
      if (isRegisterMode) {
        if (!authForm.name) {
          setAuthError('Por favor, preencha seu nome')
          setAuthLoading(false)
          return
        }
        await register(authForm.email, authForm.password, authForm.name)
      } else {
        await login(authForm.email, authForm.password)
      }
      setShowLogin(false)
      setAuthForm({ email: '', password: '', name: '' })
      setAuthError('')
    } catch (err) {
      setAuthError(err.message || 'Erro ao fazer login/cadastro')
    } finally {
      setAuthLoading(false)
    }
  }

  const featuredArticles = articles.filter(a => a.featured).slice(0, 3)
  const recentArticles = articles.slice(0, 6)

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '40px 20px' }}>
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: '#6b7280' }}>
          <div style={{ fontSize: '18px' }}>Carregando artigos...</div>
        </div>
      ) : (
        <>
          {/* Destaques */}
          {featuredArticles.length > 0 && (
            <section style={{ marginBottom: '60px' }}>
              <h2 style={{ fontSize: '32px', fontWeight: 'bold', marginBottom: '30px', color: '#1e3a8a' }}>
                📰 Destaques
              </h2>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr',
                gap: '30px',
                marginBottom: '40px'
              }}>
                {/* Primeiro card em destaque - MAIOR */}
                {featuredArticles[0] && (
                  <motion.article
                    initial={{ opacity: 0, y: 50 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                    onClick={() => window.location.href = `/blank/noticia/${featuredArticles[0].id}`}
                    whileHover={{ y: -10, scale: 1.02 }}
                    style={{
                      backgroundColor: 'white',
                      borderRadius: '20px',
                      overflow: 'hidden',
                      boxShadow: '0 12px 32px rgba(0,0,0,0.15)',
                      cursor: 'pointer',
                      border: '2px solid #e5e7eb',
                      position: 'relative'
                    }}
                    className="hover-lift hover-glow"
                  >
                    {featuredArticles[0].featuredImage && (
                      <div style={{ position: 'relative', overflow: 'hidden' }}>
                        <img
                          src={featuredArticles[0].featuredImage}
                          alt={featuredArticles[0].title}
                          style={{
                            width: '100%',
                            height: '450px',
                            objectFit: 'cover',
                            transition: 'transform 0.3s'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
                          onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                        />
                        <div style={{
                          position: 'absolute',
                          top: '20px',
                          left: '20px',
                          backgroundColor: '#1e3a8a',
                          color: 'white',
                          padding: '10px 20px',
                          borderRadius: '25px',
                          fontSize: '13px',
                          fontWeight: 'bold',
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px'
                        }}>
                          {featuredArticles[0].category}
                        </div>
                      </div>
                    )}
                    <div style={{ padding: '40px' }}>
                      {!featuredArticles[0].featuredImage && (
                        <div style={{
                          fontSize: '13px',
                          color: '#1e3a8a',
                          fontWeight: 'bold',
                          marginBottom: '15px',
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px'
                        }}>
                          {featuredArticles[0].category}
                        </div>
                      )}
                      <h3 style={{
                        fontSize: '36px',
                        fontWeight: '900',
                        marginBottom: '20px',
                        color: '#1f2937',
                        lineHeight: '1.2',
                        minHeight: '86px'
                      }}>
                        {featuredArticles[0].title}
                      </h3>
                      <p style={{
                        fontSize: '18px',
                        color: '#4b5563',
                        marginBottom: '30px',
                        lineHeight: '1.8',
                        display: '-webkit-box',
                        WebkitLineClamp: 4,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden'
                      }}>
                        {featuredArticles[0].excerpt}
                      </p>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingTop: '20px',
                        borderTop: '2px solid #e5e7eb',
                        flexWrap: 'wrap',
                        gap: '10px'
                      }}>
                        <div style={{
                          fontSize: '14px',
                          color: '#6b7280',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          flexWrap: 'wrap'
                        }}>
                          <span>📅 {formatDate(featuredArticles[0].createdAt)}</span>
                          <span>⏱️ {calculateReadingTime(featuredArticles[0].content)} min de leitura</span>
                        </div>
                        <div style={{
                          fontSize: '16px',
                          color: '#1e3a8a',
                          fontWeight: '700'
                        }}>
                          Ler notícia completa →
                        </div>
                      </div>
                    </div>
                  </motion.article>
                )}
              </div>
              
              {/* Outros destaques em grid */}
              {featuredArticles.length > 1 && (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))',
                  gap: '30px'
                }}>
                  {featuredArticles.slice(1).map(article => (
                    <article
                      key={article.id}
                      onClick={() => window.location.href = `/blank/noticia/${article.id}`}
                      style={{
                        backgroundColor: 'white',
                        borderRadius: '16px',
                        overflow: 'hidden',
                        boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                        cursor: 'pointer',
                        transition: 'all 0.3s ease',
                        border: '1px solid #e5e7eb'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-8px)'
                        e.currentTarget.style.boxShadow = '0 12px 32px rgba(0,0,0,0.18)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)'
                        e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.12)'
                      }}
                    >
                      {article.featuredImage && (
                        <div style={{ position: 'relative', overflow: 'hidden' }}>
                          <img
                            src={article.featuredImage}
                            alt={article.title}
                            style={{
                              width: '100%',
                              height: '280px',
                              objectFit: 'cover',
                              transition: 'transform 0.3s'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
                            onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                          />
                          <div style={{
                            position: 'absolute',
                            top: '12px',
                            left: '12px',
                            backgroundColor: '#1e3a8a',
                            color: 'white',
                            padding: '6px 14px',
                            borderRadius: '20px',
                            fontSize: '11px',
                            fontWeight: 'bold',
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px'
                          }}>
                            {article.category}
                          </div>
                        </div>
                      )}
                      <div style={{ padding: '28px' }}>
                        {!article.featuredImage && (
                          <div style={{
                            fontSize: '12px',
                            color: '#1e3a8a',
                            fontWeight: 'bold',
                            marginBottom: '12px',
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px'
                          }}>
                            {article.category}
                          </div>
                        )}
                        <h3 style={{
                          fontSize: '24px',
                          fontWeight: '900',
                          marginBottom: '12px',
                          color: '#1f2937',
                          lineHeight: '1.3',
                          minHeight: '62px'
                        }}>
                          {article.title}
                        </h3>
                        <p style={{
                          fontSize: '15px',
                          color: '#4b5563',
                          marginBottom: '20px',
                          lineHeight: '1.7',
                          display: '-webkit-box',
                          WebkitLineClamp: 3,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden'
                        }}>
                          {article.excerpt}
                        </p>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          paddingTop: '16px',
                          borderTop: '1px solid #e5e7eb',
                          flexWrap: 'wrap',
                          gap: '8px'
                        }}>
                          <div style={{
                            fontSize: '13px',
                            color: '#6b7280',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            flexWrap: 'wrap'
                          }}>
                            <span>📅 {formatDate(article.createdAt)}</span>
                            <span>⏱️ {calculateReadingTime(article.content)} min</span>
                          </div>
                          <div style={{
                            fontSize: '13px',
                            color: '#1e3a8a',
                            fontWeight: '600'
                          }}>
                            Ler mais →
                          </div>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}
          
          {/* Artigos Recentes */}
          <section>
            <h2 style={{ fontSize: '32px', fontWeight: 'bold', marginBottom: '30px', color: '#1e3a8a' }}>
              📚 Artigos Recentes
            </h2>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
              gap: '30px'
            }}>
              {recentArticles.map(article => (
                <article
                  key={article.id}
                  onClick={() => window.location.href = `/blank/noticia/${article.id}`}
                  style={{
                    backgroundColor: 'white',
                    borderRadius: '16px',
                    overflow: 'hidden',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
                    cursor: 'pointer',
                    transition: 'all 0.3s ease',
                    border: '1px solid #e5e7eb'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-6px)'
                    e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.15)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)'
                    e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.1)'
                  }}
                >
                  {article.featuredImage && (
                    <div style={{ position: 'relative', overflow: 'hidden' }}>
                      <img
                        src={article.featuredImage}
                        alt={article.title}
                        style={{
                          width: '100%',
                          height: '220px',
                          objectFit: 'cover',
                          transition: 'transform 0.3s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
                        onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                      />
                      <div style={{
                        position: 'absolute',
                        top: '10px',
                        left: '10px',
                        backgroundColor: '#1e3a8a',
                        color: 'white',
                        padding: '5px 12px',
                        borderRadius: '20px',
                        fontSize: '10px',
                        fontWeight: 'bold',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px'
                      }}>
                        {article.category}
                      </div>
                    </div>
                  )}
                  <div style={{ padding: '24px' }}>
                    {!article.featuredImage && (
                      <div style={{
                        fontSize: '11px',
                        color: '#1e3a8a',
                        fontWeight: 'bold',
                        marginBottom: '10px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px'
                      }}>
                        {article.category}
                      </div>
                    )}
                    <h3 style={{
                      fontSize: '20px',
                      fontWeight: '800',
                      marginBottom: '10px',
                      color: '#1f2937',
                      lineHeight: '1.4',
                      minHeight: '56px'
                    }}>
                      {article.title}
                    </h3>
                    <p style={{
                      fontSize: '14px',
                      color: '#4b5563',
                      marginBottom: '16px',
                      lineHeight: '1.6',
                      display: '-webkit-box',
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden'
                    }}>
                      {article.excerpt}
                    </p>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingTop: '14px',
                      borderTop: '1px solid #f3f4f6',
                      flexWrap: 'wrap',
                      gap: '8px'
                    }}>
                      <div style={{
                        fontSize: '12px',
                        color: '#6b7280',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        flexWrap: 'wrap'
                      }}>
                        <span>📅 {formatDate(article.createdAt)}</span>
                        <span>⏱️ {calculateReadingTime(article.content)} min</span>
                      </div>
                      <div style={{
                        fontSize: '12px',
                        color: '#1e3a8a',
                        fontWeight: '600'
                      }}>
                        Ler →
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
          
          {articles.length === 0 && (
            <div style={{
              textAlign: 'center',
              padding: '60px',
              color: '#6b7280'
            }}>
              <p style={{ fontSize: '18px', marginBottom: '10px' }}>📝</p>
              <p>Nenhum artigo encontrado.</p>
            </div>
          )}
        </>
      )}

      {/* Modal de Login/Cadastro */}
      {showLogin && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2000,
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            padding: '30px',
            width: '100%',
            maxWidth: '400px',
            boxShadow: '0 10px 40px rgba(0,0,0,0.3)'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '20px'
            }}>
              <h2 style={{
                fontSize: '24px',
                fontWeight: 'bold',
                color: '#1e3a8a',
                margin: 0
              }}>
                {isRegisterMode ? 'Criar Conta' : 'Login'}
              </h2>
              <button
                onClick={() => {
                  setShowLogin(false)
                  setAuthError('')
                  setAuthForm({ email: '', password: '', name: '' })
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  cursor: 'pointer',
                  color: '#6b7280'
                }}
              >
                ×
              </button>
            </div>
            
            {authError && (
              <div style={{
                padding: '12px',
                backgroundColor: '#fee2e2',
                color: '#dc2626',
                borderRadius: '8px',
                marginBottom: '15px',
                fontSize: '14px'
              }}>
                {authError}
              </div>
            )}
            
            <form onSubmit={handleAuthSubmit}>
              {isRegisterMode && (
                <div style={{ marginBottom: '15px' }}>
                  <label style={{
                    display: 'block',
                    marginBottom: '5px',
                    fontWeight: '500',
                    color: '#374151'
                  }}>
                    Nome Completo
                  </label>
                  <input
                    type="text"
                    value={authForm.name}
                    onChange={(e) => setAuthForm({ ...authForm, name: e.target.value })}
                    required
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      fontSize: '14px'
                    }}
                  />
                </div>
              )}
              
              <div style={{ marginBottom: '15px' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '5px',
                  fontWeight: '500',
                  color: '#374151'
                }}>
                  Email
                </label>
                <input
                  type="email"
                  value={authForm.email}
                  onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
                  required
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '14px'
                  }}
                />
              </div>
              
              <div style={{ marginBottom: '20px' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '5px',
                  fontWeight: '500',
                  color: '#374151'
                }}>
                  Senha
                </label>
                <input
                  type="password"
                  value={authForm.password}
                  onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
                  required
                  minLength={6}
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '14px'
                  }}
                />
              </div>
              
              <button
                type="submit"
                disabled={authLoading}
                style={{
                  width: '100%',
                  padding: '12px',
                  backgroundColor: authLoading ? '#9ca3af' : '#1e3a8a',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '16px',
                  fontWeight: 'bold',
                  cursor: authLoading ? 'not-allowed' : 'pointer',
                  marginBottom: '10px'
                }}
              >
                {authLoading ? 'Carregando...' : (isRegisterMode ? 'Cadastrar' : 'Entrar')}
              </button>
              
              <button
                type="button"
                onClick={() => {
                  setIsRegisterMode(!isRegisterMode)
                  setAuthError('')
                }}
                style={{
                  width: '100%',
                  padding: '10px',
                  backgroundColor: 'transparent',
                  color: '#1e3a8a',
                  border: '1px solid #1e3a8a',
                  borderRadius: '8px',
                  fontSize: '14px',
                  cursor: 'pointer'
                }}
              >
                {isRegisterMode ? 'Já tem conta? Fazer login' : 'Não tem conta? Cadastrar'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default ListaArtigos

