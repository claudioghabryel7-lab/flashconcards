import { createContext, useContext, useState, useEffect, useCallback } from 'react'

const CartContext = createContext(null)

export const CartProvider = ({ children }) => {
  const [cartItems, setCartItems] = useState([])

  // Carregar carrinho do localStorage ao inicializar
  useEffect(() => {
    try {
      const savedCart = localStorage.getItem('flashconcards_cart')
      if (savedCart) {
        const parsed = JSON.parse(savedCart)
        setCartItems(parsed || [])
      }
    } catch (err) {
      console.warn('Erro ao carregar carrinho do localStorage:', err)
    }
  }, [])

  // Salvar carrinho no localStorage sempre que mudar
  useEffect(() => {
    try {
      localStorage.setItem('flashconcards_cart', JSON.stringify(cartItems))
    } catch (err) {
      if (err.name === 'QuotaExceededError') {
        console.warn('Quota excedida ao salvar carrinho')
      } else {
        console.warn('Erro ao salvar carrinho:', err)
      }
    }
  }, [cartItems])

  const addToCart = useCallback((course) => {
    setCartItems((prev) => {
      // Verificar se o curso já está no carrinho
      const exists = prev.find((item) => item.id === course.id)
      if (exists) {
        // Se já existe, retornar o array sem mudanças (ou mostrar mensagem)
        return prev
      }
      // Adicionar curso ao carrinho
      return [
        ...prev,
        {
          id: course.id,
          name: course.name,
          price: course.price || 99.90,
          originalPrice: course.originalPrice,
          imageUrl: course.imageUrl,
          competition: course.competition,
        },
      ]
    })
  }, [])

  const removeFromCart = useCallback((courseId) => {
    setCartItems((prev) => prev.filter((item) => item.id !== courseId))
  }, [])

  const clearCart = useCallback(() => {
    setCartItems([])
  }, [])

  const getCartTotal = useCallback(() => {
    return cartItems.reduce((total, item) => total + (item.price || 0), 0)
  }, [cartItems])

  const getCartCount = useCallback(() => {
    return cartItems.length
  }, [cartItems])

  const isInCart = useCallback((courseId) => {
    return cartItems.some((item) => item.id === courseId)
  }, [cartItems])

  const value = {
    cartItems,
    addToCart,
    removeFromCart,
    clearCart,
    getCartTotal,
    getCartCount,
    isInCart,
  }

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export const useCart = () => {
  const context = useContext(CartContext)
  if (!context) {
    throw new Error('useCart deve ser usado dentro de CartProvider')
  }
  return context
}

