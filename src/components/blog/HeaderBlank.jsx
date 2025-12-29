import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'

const categories = [
  'TODAS',
  'CONCURSOS',
  'EDITAIS',
  'VAGAS',
  'POLÍCIA',
  'JUDICIÁRIO',
  'ADMINISTRATIVO',
  'TRIBUNAIS',
  'NOTÍCIAS GERAIS'
]

const HeaderBlank = ({ onCategoryChange, onSearchChange, searchTerm, selectedCategory: propSelectedCategory }) => {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, isAdmin, logout } = useAuth()
  const [selectedCategory, setSelectedCategory] = useState(propSelectedCategory || 'TODAS')
  const [showMobileMenu, setShowMobileMenu] = useState(false)

  // Sincronizar com prop
  useEffect(() => {
    if (propSelectedCategory) {
      setSelectedCategory(propSelectedCategory)
    }
  }, [propSelectedCategory])

  const handleCategoryClick = (category) => {
    setSelectedCategory(category)
    if (onCategoryChange) {
      onCategoryChange(category)
    }
    // Se estiver na página de artigo, voltar para lista
    if (location.pathname.startsWith('/blank/noticia')) {
      navigate('/blank')
    }
  }

  const handleSearch = (e) => {
    const value = e.target.value
    if (onSearchChange) {
      onSearchChange(value)
    }
  }

  return (
    <header style={{
      backgroundColor: '#1e3a8a',
      position: 'sticky',
      top: 0,
      zIndex: 1000,
      boxShadow: '0 4px 20px rgba(0,0,0,0.15)'
    }}>
      {/* Top Bar */}
      <div style={{
        backgroundColor: '#1e3a8a',
        padding: '16px 20px',
        borderBottom: '1px solid rgba(255,255,255,0.1)'
      }}>
        <div style={{
          maxWidth: '1400px',
          margin: '0 auto',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px'
        }}>
          {/* Logo */}
          <div 
            onClick={() => navigate('/blank')}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '12px',
              cursor: 'pointer'
            }}
          >
            <span style={{ color: '#fbbf24', fontSize: '32px' }}>⚡</span>
            <h1 style={{
              color: 'white',
              fontSize: '28px',
              fontWeight: '900',
              margin: 0,
              background: 'linear-gradient(to right, #fbbf24, #fcd34d)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent'
            }}>
              FlashNotícias
            </h1>
          </div>
          
          {/* Barra de Pesquisa */}
          <div style={{ flex: 1, maxWidth: '500px', minWidth: '250px' }}>
            <input
              type="text"
              placeholder="Buscar notícias..."
              value={searchTerm || ''}
              onChange={handleSearch}
              style={{
                width: '100%',
                padding: '12px 16px',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                outline: 'none',
                backgroundColor: 'rgba(255,255,255,0.95)',
                color: '#1f2937'
              }}
            />
          </div>
          
          {/* Actions */}
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            {isAdmin && (
              <button
                onClick={() => {
                  // Abrir BlankPage em modo admin (mantém funcionalidade antiga)
                  window.location.href = '/blank?admin=true'
                }}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#fbbf24',
                  color: '#1e3a8a',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  fontSize: '14px'
                }}
              >
                ⚙️ Admin
              </button>
            )}
            {user ? (
              <button
                onClick={logout}
                style={{
                  padding: '10px 20px',
                  backgroundColor: 'transparent',
                  color: 'white',
                  border: '1px solid white',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                Sair
              </button>
            ) : (
              <button
                onClick={() => navigate('/login')}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#fbbf24',
                  color: '#1e3a8a',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  fontSize: '14px'
                }}
              >
                Login
              </button>
            )}
            {/* Mobile Menu Toggle */}
            <button
              onClick={() => setShowMobileMenu(!showMobileMenu)}
              style={{
                display: 'none',
                padding: '8px',
                backgroundColor: 'transparent',
                border: '1px solid white',
                borderRadius: '6px',
                cursor: 'pointer',
                color: 'white',
                fontSize: '20px'
              }}
              className="mobile-menu-toggle"
            >
              ☰
            </button>
          </div>
        </div>
      </div>
      
      {/* Menu de Categorias */}
      <nav style={{
        backgroundColor: '#1e40af',
        padding: '12px 20px',
        borderTop: '1px solid rgba(255,255,255,0.1)'
      }}>
        <div style={{
          maxWidth: '1400px',
          margin: '0 auto',
          display: 'flex',
          gap: '8px',
          flexWrap: 'wrap',
          justifyContent: 'center',
          alignItems: 'center'
        }}>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => handleCategoryClick(cat)}
              style={{
                padding: '10px 20px',
                backgroundColor: selectedCategory === cat ? '#fbbf24' : 'transparent',
                color: selectedCategory === cat ? '#1e3a8a' : 'white',
                border: selectedCategory === cat ? 'none' : '1px solid rgba(255,255,255,0.3)',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: selectedCategory === cat ? 'bold' : '500',
                fontSize: '14px',
                transition: 'all 0.2s',
                whiteSpace: 'nowrap'
              }}
            >
              {cat}
            </button>
          ))}
        </div>
      </nav>

      {/* Mobile Menu e Responsividade */}
      <style>{`
        @media (max-width: 768px) {
          .mobile-menu-toggle {
            display: block !important;
          }
          nav {
            display: ${showMobileMenu ? 'block' : 'none'};
          }
          header > div:first-child {
            flex-direction: column;
            align-items: stretch;
          }
          header > div:first-child > div:first-child {
            justify-content: center;
          }
          header > div:first-child > div:last-child {
            width: 100%;
            justify-content: space-between;
          }
          header input[type="text"] {
            max-width: 100%;
            min-width: 100%;
            margin-top: 12px;
          }
        }
        @media (max-width: 480px) {
          header h1 {
            font-size: 20px !important;
          }
          nav button {
            padding: 8px 12px !important;
            font-size: 12px !important;
          }
        }
      `}</style>
    </header>
  )
}

export default HeaderBlank

