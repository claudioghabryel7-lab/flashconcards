const FooterBlank = () => {
  return (
    <footer style={{
      backgroundColor: '#1e3a8a',
      color: 'white',
      padding: '40px 20px',
      marginTop: '60px',
      borderTop: '3px solid #fbbf24'
    }}>
      <div style={{
        maxWidth: '1400px',
        margin: '0 auto',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
        gap: '40px'
      }}>
        {/* Sobre */}
        <div>
          <h3 style={{
            fontSize: '18px',
            fontWeight: 'bold',
            marginBottom: '16px',
            color: '#fbbf24'
          }}>
            FlashNotícias
          </h3>
          <p style={{
            fontSize: '14px',
            lineHeight: '1.6',
            color: 'rgba(255,255,255,0.9)',
            marginBottom: '16px'
          }}>
            Portal de notícias especializado em concursos públicos. Mantenha-se atualizado com as últimas informações sobre editais, vagas e oportunidades.
          </p>
        </div>

        {/* Links Rápidos */}
        <div>
          <h3 style={{
            fontSize: '18px',
            fontWeight: 'bold',
            marginBottom: '16px',
            color: '#fbbf24'
          }}>
            Links Rápidos
          </h3>
          <ul style={{
            listStyle: 'none',
            padding: 0,
            margin: 0
          }}>
            <li style={{ marginBottom: '10px' }}>
              <a
                href="/blank"
                style={{
                  color: 'rgba(255,255,255,0.9)',
                  textDecoration: 'none',
                  fontSize: '14px',
                  transition: 'color 0.2s'
                }}
                onMouseEnter={(e) => e.target.style.color = '#fbbf24'}
                onMouseLeave={(e) => e.target.style.color = 'rgba(255,255,255,0.9)'}
              >
                Início
              </a>
            </li>
            <li style={{ marginBottom: '10px' }}>
              <a
                href="https://www.flashconcards.com.br"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: 'rgba(255,255,255,0.9)',
                  textDecoration: 'none',
                  fontSize: '14px',
                  transition: 'color 0.2s'
                }}
                onMouseEnter={(e) => e.target.style.color = '#fbbf24'}
                onMouseLeave={(e) => e.target.style.color = 'rgba(255,255,255,0.9)'}
              >
                FlashConCards
              </a>
            </li>
            <li style={{ marginBottom: '10px' }}>
              <a
                href="/login"
                style={{
                  color: 'rgba(255,255,255,0.9)',
                  textDecoration: 'none',
                  fontSize: '14px',
                  transition: 'color 0.2s'
                }}
                onMouseEnter={(e) => e.target.style.color = '#fbbf24'}
                onMouseLeave={(e) => e.target.style.color = 'rgba(255,255,255,0.9)'}
              >
                Login
              </a>
            </li>
          </ul>
        </div>

        {/* Contato */}
        <div>
          <h3 style={{
            fontSize: '18px',
            fontWeight: 'bold',
            marginBottom: '16px',
            color: '#fbbf24'
          }}>
            Contato
          </h3>
          <p style={{
            fontSize: '14px',
            lineHeight: '1.6',
            color: 'rgba(255,255,255,0.9)',
            marginBottom: '12px'
          }}>
            📧 contato@flashconcards.com.br
          </p>
          <p style={{
            fontSize: '14px',
            lineHeight: '1.6',
            color: 'rgba(255,255,255,0.9)'
          }}>
            💬 WhatsApp: (62) 98184-1878
          </p>
        </div>
      </div>

      {/* Copyright */}
      <div style={{
        marginTop: '40px',
        paddingTop: '20px',
        borderTop: '1px solid rgba(255,255,255,0.1)',
        textAlign: 'center'
      }}>
        <p style={{
          fontSize: '13px',
          color: 'rgba(255,255,255,0.7)',
          margin: 0
        }}>
          © {new Date().getFullYear()} FlashConCards. Todos os direitos reservados.
        </p>
      </div>
    </footer>
  )
}

export default FooterBlank


