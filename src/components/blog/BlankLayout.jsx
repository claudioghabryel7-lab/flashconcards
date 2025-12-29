import { Outlet, useLocation } from 'react-router-dom'
import { useState, useEffect } from 'react'
import HeaderBlank from './HeaderBlank'
import FooterBlank from './FooterBlank'

const BlankLayout = () => {
  const location = useLocation()
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('TODAS')

  // Passar props para o outlet usando context ou state
  useEffect(() => {
    // Limpar busca ao mudar de rota
    if (location.pathname.startsWith('/blank/noticia')) {
      setSearchTerm('')
    }
  }, [location.pathname])

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc', display: 'flex', flexDirection: 'column' }}>
      <HeaderBlank
        onCategoryChange={setSelectedCategory}
        onSearchChange={setSearchTerm}
        searchTerm={searchTerm}
        selectedCategory={selectedCategory}
      />
      
      <main style={{ flex: 1 }}>
        <Outlet context={{ searchTerm, selectedCategory }} />
      </main>
      
      <FooterBlank />
    </div>
  )
}

export default BlankLayout

