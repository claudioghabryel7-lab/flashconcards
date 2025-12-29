import { useCart } from '../hooks/useCart.jsx'
import { useNavigate } from 'react-router-dom'
import { XMarkIcon, TrashIcon, ShoppingCartIcon } from '@heroicons/react/24/outline'

const CartModal = ({ isOpen, onClose }) => {
  const { cartItems, removeFromCart, clearCart, getCartTotal } = useCart()
  const navigate = useNavigate()

  if (!isOpen) return null

  const handleCheckout = () => {
    if (cartItems.length === 0) return
    
    // Salvar cursos do carrinho no localStorage para a página de pagamento
    localStorage.setItem('checkoutCourses', JSON.stringify(cartItems))
    
    // Fechar modal
    onClose()
    
    // Navegar para página de pagamento
    navigate('/pagamento')
    
    // Aguardar um pouco para garantir que a navegação aconteceu, depois rolar até o fim
    setTimeout(() => {
      window.scrollTo({
        top: document.documentElement.scrollHeight,
        behavior: 'smooth'
      })
    }, 100)
  }

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value)
  }

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/50 z-50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-y-0 right-0 w-full sm:w-96 max-w-[90vw] bg-white dark:bg-slate-900 shadow-xl z-50 flex flex-col animate-slide-in-right">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            Carrinho ({cartItems.length})
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Fechar carrinho"
          >
            <XMarkIcon className="h-5 w-5 text-slate-600 dark:text-slate-400" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
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
          <div className="border-t border-slate-200 dark:border-slate-700 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-lg font-bold text-slate-900 dark:text-white">
                Total:
              </span>
              <span className="text-xl font-bold text-blue-600 dark:text-blue-400">
                {formatCurrency(getCartTotal())}
              </span>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={clearCart}
                className="flex-1 px-4 py-2 text-sm font-semibold text-red-600 dark:text-red-400 border border-red-600 dark:border-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                Limpar
              </button>
              <button
                type="button"
                onClick={handleCheckout}
                className="flex-1 px-4 py-2 text-sm font-bold text-white bg-blue-600 dark:bg-blue-500 rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors"
              >
                Finalizar Compra
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

export default CartModal

