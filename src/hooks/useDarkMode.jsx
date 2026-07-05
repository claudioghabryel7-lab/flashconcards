import { createContext, useContext, useEffect, useState } from 'react'

const DarkModeContext = createContext(null)

export const DarkModeProvider = ({ children }) => {
  const [darkMode, setDarkMode] = useState(true)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    try {
      const saved = localStorage.getItem('darkMode')
      if (saved !== null) {
        setDarkMode(JSON.parse(saved))
      }
    } catch (err) {
      console.error('Erro ao carregar dark mode:', err)
    }
    setHydrated(true)
  }, [])

  useEffect(() => {
    const html = document.documentElement
    if (darkMode) {
      html.classList.add('dark')
      html.style.colorScheme = 'dark'
    } else {
      html.classList.remove('dark')
      html.style.colorScheme = 'light'
    }

    if (hydrated) {
      try {
        localStorage.setItem('darkMode', JSON.stringify(darkMode))
      } catch (err) {
        console.error('Erro ao salvar dark mode:', err)
      }
    }
  }, [darkMode, hydrated])

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
