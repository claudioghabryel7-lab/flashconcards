import { useParams } from 'react-router-dom'

const SharedFlashcardPIP = () => {
  const params = useParams()
  
  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg p-12 text-center max-w-md">
        <h1 className="text-3xl font-bold text-slate-900 mb-4">🚀 Teste de Rota</h1>
        <p className="text-xl text-slate-700">Token: {params.token}</p>
        <p className="text-sm text-slate-500 mt-4">Se você está vendo isso, a rota está funcionando!</p>
      </div>
    </div>
  )
}

export default SharedFlashcardPIP
