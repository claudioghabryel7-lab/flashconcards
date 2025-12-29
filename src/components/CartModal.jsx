import { useCart } from '../hooks/useCart.jsx'
import { useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import { XMarkIcon, TrashIcon, ShoppingCartIcon } from '@heroicons/react/24/outline'

const CartModal = ({ isOpen, onClose }) => {
  const { cartItems, removeFromCart, clearCart, getCartTotal } = useCart()
  const navigate = useNavigate()

  // Bloquear scroll do body quando modal estiver aberto
  useEffect(() => {
    if (isOpen) {
      // Salvar posição atual do scroll
      const scrollY = window.scrollY
      document.body.style.position = 'fixed'
      document.body.style.top = `-${scrollY}px`
      document.body.style.width = '100%'
      document.body.style.overflow = 'hidden'
      
      return () => {
        // Restaurar scroll quando fechar
        document.body.style.position = ''
        document.body.style.top = ''
        document.body.style.width = ''
        document.body.style.overflow = ''
        window.scrollTo(0, scrollY)
      }
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleCheckout = () => {
    if (cartItems.length === 0) return
    
    // Salvar cursos do carrinho no localStorage para a página de pagamento
    localStorage.setItem('checkoutCourses', JSON.stringify(cartItems))
    
    // Fechar modal
    onClose()
    
    // Navegar para página de pagamento
    navigate('/pagamento')
    
    // A rolagem será feita na página de pagamento via useEffect
    // Não precisa rolar aqui pois a navegação ainda não aconteceu
  }

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value)
  }

  return (
    <div 
      className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4"
      style={{ 
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'auto'
      }}
      onClick={onClose}
    >
      {/* Modal Centralizado */}
      <div 
        className="relative w-full max-w-2xl max-h-[90vh] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl flex flex-col animate-fade-in-scale overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        style={{ 
          margin: 'auto',
          position: 'relative'
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
            Carrinho de Compras
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Fechar carrinho"
          >
            <XMarkIcon className="h-6 w-6 text-slate-600 dark:text-slate-400" />
          </button>
        </div>
        
        {/* Badge com quantidade */}
        {cartItems.length > 0 && (
          <div className="px-6 pt-4">
            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
              {cartItems.length} {cartItems.length === 1 ? 'item' : 'itens'}
            </span>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {cartItems.length === 0 ? (
            <div className="text-center py-12">
              <ShoppingCartIcon className="h-16 w-16 text-slate-400 mx-auto mb-4" />
              <p className="text-slate-600 dark:text-slate-400">
                Seu carrinho está vazio
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {cartItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                >
                  {item.imageUrl && (
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      className="w-16 h-16 object-cover rounded-lg"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-slate-900 dark:text-white text-sm mb-1 truncate">
                      {item.name}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                      {item.competition}
                    </p>
                    <p className="text-sm font-bold text-blue-600 dark:text-blue-400">
                      {formatCurrency(item.price)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFromCart(item.id)}
                    className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                    aria-label="Remover do carrinho"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {cartItems.length > 0 && (
          <div className="border-t border-slate-200 dark:border-slate-700 p-6 space-y-4 bg-slate-50 dark:bg-slate-800/50 rounded-b-2xl">
            <div className="flex items-center justify-between">
              <span className="text-xl font-bold text-slate-900 dark:text-white">
                Total:
              </span>
              <span className="text-2xl font-black text-blue-600 dark:text-blue-400">
                {formatCurrency(getCartTotal())}
              </span>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={clearCart}
                className="flex-1 px-6 py-3 text-sm font-semibold text-red-600 dark:text-red-400 border-2 border-red-600 dark:border-red-400 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 transition-all hover:scale-105"
              >
                Limpar Carrinho
              </button>
              <button
                type="button"
                onClick={handleCheckout}
                className="flex-1 px-6 py-3 text-base font-bold text-white bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl hover:from-blue-700 hover:to-purple-700 transition-all shadow-lg hover:shadow-xl transform hover:scale-105"
              >
                Finalizar Compra
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default CartModal

