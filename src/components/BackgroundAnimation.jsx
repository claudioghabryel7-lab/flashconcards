import { useEffect, useState } from 'react'
import { collection, onSnapshot, query, where, orderBy, limit } from 'firebase/firestore'
import { db } from '../firebase/config'

const BackgroundAnimation = () => {
  const [animationType, setAnimationType] = useState('sparks') // sparks, fire, stars, none
  const [active, setActive] = useState(true)

  useEffect(() => {
    const configRef = collection(db, 'marketingHero')
    const q = query(configRef, where('active', '==', true), orderBy('order', 'asc'), limit(1))
    
    const unsub = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const data = snapshot.docs[0].data()
        setAnimationType(data.backgroundAnimationType || 'sparks')
        // Só ativar se explicitamente configurado como true
        setActive(data.backgroundAnimationActive === true && data.active === true)
      } else {
        // Se não houver configuração, desativar
        setActive(false)
        setAnimationType('sparks')
      }
    }, (error) => {
      console.error('Erro ao carregar configuração de animação:', error)
      // Em caso de erro, desativar
      setActive(false)
    })

    return () => unsub()
  }, [])

  if (!active || animationType === 'none') {
    return null
  }

  // Reduzir número de partículas para melhor performance
  const particleCount = animationType === 'fire' ? 15 : animationType === 'stars' ? 25 : 12

  // Mapear tipos de animação para classes CSS
  const particleClass = animationType === 'fire' ? 'fire-particle' : animationType === 'stars' ? 'stars-particle' : 'sparks-particle'
  const dotClass = animationType === 'fire' ? 'fire-dot' : animationType === 'stars' ? 'stars-dot' : 'sparks-dot'

  return (
    <div 
      className="fixed inset-0 z-0 pointer-events-none overflow-hidden"
      style={{ 
        willChange: 'contents',
        contain: 'layout style paint',
        transform: 'translateZ(0)' // Force GPU layer
      }}
    >
      {[...Array(particleCount)].map((_, i) => {
        // Pré-calcular valores aleatórios para evitar recálculo a cada render
        const left = Math.random() * 100
        const top = Math.random() * 100
        const delay = Math.random() * 3
        const duration = 2 + Math.random() * 2
        
        return (
          <div
            key={i}
            className={`absolute ${particleClass}`}
            style={{
              left: `${left}%`,
              top: `${top}%`,
              animationDelay: `${delay}s`,
              animationDuration: `${duration}s`,
            }}
          >
            <div className={dotClass}></div>
          </div>
        )
      })}
    </div>
  )
}

export default BackgroundAnimation

