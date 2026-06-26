import { createContext, useContext, useEffect, useState } from 'react'

const DarkModeContext = createContext(null)

export const DarkModeProvider = ({ children }) => {
  const [darkMode, setDarkMode] = useState(() => {
    try {
      const saved = localStorage.getItem('darkMode')
      if (saved !== null) {
        return JSON.parse(saved)
      }
    } catch (err) {
      console.error('Erro ao carregar dark mode:', err)
    }
    return false
  })

  useEffect(() => {
    const html = document.documentElement
    const body = document.body
    
    if (darkMode) {
      html.classList.add('dark')
      html.style.colorScheme = 'dark'
      body.style.backgroundColor = '#09090b'
      body.style.color = '#fafafa'
    } else {
      html.classList.remove('dark')
      html.style.colorScheme = 'dark'
      body.style.backgroundColor = '#09090b'
      body.style.color = '#fafafa'
    }
    
    try {
      localStorage.setItem('darkMode', JSON.stringify(darkMode))
    } catch (err) {
      console.error('Erro ao salvar dark mode:', err)
    }
  }, [darkMode])

  // Aplicar no carregamento inicial
  useEffect(() => {
    const html = document.documentElement
    const body = document.body
    
    if (darkMode) {
      html.classList.add('dark')
      html.style.colorScheme = 'dark'
      body.style.backgroundColor = '#09090b'
      body.style.color = '#fafafa'
    } else {
      html.classList.remove('dark')
      html.style.colorScheme = 'dark'
      body.style.backgroundColor = '#09090b'
      body.style.color = '#fafafa'
    }
  }, [])

  const toggleDarkMode = () => {
    setDarkMode((prev) => !prev)
  }

  return (
    <DarkModeContext.Provider value={{ darkMode, toggleDarkMode }}>
      {children}
    </DarkModeContext.Provider>
  )
}

export const useDarkMode = () => {
  const context = useContext(DarkModeContext)
  if (!context) {
    throw new Error('useDarkMode must be used within DarkModeProvider')
  }
  return context
}
