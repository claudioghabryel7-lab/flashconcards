import { Component } from 'react'

class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('Erro capturado pelo ErrorBoundary:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 p-4">
          <div className="max-w-md w-full bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-6 sm:p-8">
            <div className="text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 dark:bg-red-900/20 mb-4">
                <svg
                  className="h-6 w-6 text-red-600 dark:text-red-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                Ops! Algo deu errado
              </h1>
              <p className="text-slate-600 dark:text-slate-400 mb-6">
                Ocorreu um erro ao carregar a aplicação. Por favor, recarregue a página.
              </p>
              <div className="space-y-3">
                <button
                  onClick={() => window.location.reload()}
                  className="w-full rounded-lg bg-alego-600 px-4 py-2 text-sm font-semibold text-white hover:bg-alego-700 transition"
                >
                  Recarregar Página
                </button>
                {this.state.error && (
                  <details className="text-left mt-4">
                    <summary className="text-sm text-slate-500 dark:text-slate-400 cursor-pointer mb-2">
                      Detalhes do erro
                    </summary>
                    <pre className="text-xs bg-slate-100 dark:bg-slate-900 p-3 rounded overflow-auto max-h-40">
                      {this.state.error.toString()}
                    </pre>
                  </details>
                )}
              </div>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary











