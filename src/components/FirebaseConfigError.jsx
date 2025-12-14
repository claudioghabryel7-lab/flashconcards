import { firebaseError, firebaseInitialized } from '../firebase/config'

const FirebaseConfigError = () => {
  const errorMessage = firebaseError?.message || 'Firebase não está configurado corretamente.'
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 p-4">
      <div className="max-w-2xl w-full bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-6 sm:p-8">
        <div className="text-center">
          <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100 dark:bg-red-900/20 mb-6">
            <svg
              className="h-8 w-8 text-red-600 dark:text-red-400"
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
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white mb-4">
            ⚠️ Configuração do Firebase Necessária
          </h1>
          <p className="text-lg text-slate-600 dark:text-slate-400 mb-6">
            {errorMessage}
          </p>
          
          <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-6 text-left mb-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
              📝 Como resolver:
            </h2>
            <ol className="space-y-3 text-sm text-slate-700 dark:text-slate-300 list-decimal list-inside">
              <li>
                Crie um arquivo <code className="bg-slate-200 dark:bg-slate-700 px-2 py-1 rounded">.env</code> na raiz do projeto
              </li>
              <li>
                Adicione as seguintes variáveis de ambiente:
                <pre className="mt-2 bg-slate-800 text-green-400 p-4 rounded-lg overflow-x-auto text-xs">
{`VITE_FIREBASE_API_KEY=sua_api_key_aqui
VITE_FIREBASE_AUTH_DOMAIN=seu_projeto.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=seu_projeto_id
VITE_FIREBASE_STORAGE_BUCKET=seu_projeto.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=seu_sender_id
VITE_FIREBASE_APP_ID=seu_app_id`}
                </pre>
              </li>
              <li>
                Obtenha essas informações no{' '}
                <a
                  href="https://console.firebase.google.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Firebase Console
                </a>
                {' '}(Configurações do projeto → Seus apps)
              </li>
              <li>Reinicie o servidor de desenvolvimento</li>
            </ol>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => window.location.reload()}
              className="rounded-lg bg-alego-600 px-6 py-3 text-sm font-semibold text-white hover:bg-alego-700 transition"
            >
              🔄 Recarregar Página
            </button>
            <a
              href="https://console.firebase.google.com"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-slate-300 dark:border-slate-600 px-6 py-3 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition text-center"
            >
              🔥 Abrir Firebase Console
            </a>
          </div>

          {firebaseError && (
            <details className="text-left mt-6">
              <summary className="text-sm text-slate-500 dark:text-slate-400 cursor-pointer mb-2">
                Detalhes técnicos do erro
              </summary>
              <pre className="text-xs bg-slate-100 dark:bg-slate-900 p-4 rounded overflow-auto max-h-40">
                {firebaseError.toString()}
              </pre>
            </details>
          )}
        </div>
      </div>
    </div>
  )
}

export default FirebaseConfigError
































