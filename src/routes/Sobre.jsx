import { useEffect } from 'react'
import { useDarkMode } from '../hooks/useDarkMode'

const Sobre = () => {
  const { darkMode } = useDarkMode()

  useEffect(() => {
    // Scroll para o topo quando a página carregar
    window.scrollTo(0, 0)
  }, [])

  return (
    <div className="min-h-screen">
      {/* Página em branco */}
    </div>
  )
}

export default Sobre

