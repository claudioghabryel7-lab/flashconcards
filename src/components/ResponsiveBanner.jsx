import { useEffect, useState } from 'react'

const ResponsiveBanner = ({ children, className = '' }) => {
  const [orientation, setOrientation] = useState('landscape')
  const [screenSize, setScreenSize] = useState('desktop')

  useEffect(() => {
    const updateOrientation = () => {
      const width = window.innerWidth
      const height = window.innerHeight
      
      // Determinar orientação
      if (height > width) {
        setOrientation('portrait')
      } else {
        setOrientation('landscape')
      }
      
      // Determinar tamanho da tela
      if (width < 640) {
        setScreenSize('mobile')
      } else if (width < 1024) {
        setScreenSize('tablet')
      } else {
        setScreenSize('desktop')
      }
    }

    updateOrientation()
    window.addEventListener('resize', updateOrientation)
    
    return () => window.removeEventListener('resize', updateOrientation)
  }, [])

  // Classes dinâmicas baseadas no dispositivo e orientação
  const getDynamicClasses = () => {
    let classes = 'banner-container '
    
    if (screenSize === 'mobile') {
      classes += orientation === 'portrait' ? 'mobile-portrait ' : 'mobile-landscape '
    } else if (screenSize === 'tablet') {
      classes += 'tablet-'
      classes += orientation + ' '
    } else {
      classes += 'desktop-'
      classes += orientation + ' '
    }
    
    return classes + className
  }

  return (
    <div className={getDynamicClasses()}>
      {children}
    </div>
  )
}

export default ResponsiveBanner
