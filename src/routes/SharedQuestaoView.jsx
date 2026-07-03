import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { doc, getDoc, setDoc, serverTimestamp, collection, addDoc } from 'firebase/firestore'
import { ArrowLeftIcon, CheckCircleIcon, QuestionMarkCircleIcon } from '@heroicons/react/24/outline'
import ReactMarkdown from 'react-markdown'
import { db } from '../firebase/config'

export default function SharedQuestaoView() {
  const { questaoId } = useParams()
  const navigate = useNavigate()
  const [questao, setQuestao] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showAccessForm, setShowAccessForm] = useState(true)
  const [accessData, setAccessData] = useState({ nome: '', telefone: '' })
  const [submitting, setSubmitting] = useState(false)
  const [accessGranted, setAccessGranted] = useState(false)
  const [selectedAnswer, setSelectedAnswer] = useState(null)
  const [showResult, setShowResult] = useState(false)

  useEffect(() => {
    loadQuestao()
  }, [questaoId])

  const loadQuestao = async () => {
    try {
      setLoading(true)
      const questaoRef = doc(db, 'sharedQuestoes', questaoId)
      const questaoDoc = await getDoc(questaoRef)
      
      if (!questaoDoc.exists()) {
        setError('Questão não encontrada ou expirou.')
        return
      }
      
      setQuestao(questaoDoc.data())
    } catch (err) {
      console.error('Erro ao carregar questão:', err)
      setError('Erro ao carregar questão: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleAccessSubmit = async (e) => {
    e.preventDefault()
    
    if (!accessData.nome || !accessData.telefone) {
      alert('Por favor, preencha todos os campos.')
      return
    }

    try {
      setSubmitting(true)
      
      // Registrar acesso
      await addDoc(collection(db, 'sharedQuestoesAccess'), {
        questaoId,
        nome: accessData.nome,
        telefone: accessData.telefone,
        accessedAt: serverTimestamp(),
      })
      
      setAccessGranted(true)
      setShowAccessForm(false)
    } catch (err) {
      console.error('Erro ao registrar acesso:', err)
      alert('Erro ao registrar acesso: ' + err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleAnswer = (answer) => {
    setSelectedAnswer(answer)
    setShowResult(true)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-alego-600 mx-auto mb-4"></div>
          <p className="text-slate-600 dark:text-slate-400">Carregando questão...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-4">
          <QuestionMarkCircleIcon className="h-16 w-16 text-red-600 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">Erro</h2>
          <p className="text-slate-600 dark:text-slate-400">{error}</p>
        </div>
      </div>
    )
  }

  if (showAccessForm && !accessGranted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-gradient-to-br from-alego-500 to-alego-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <QuestionMarkCircleIcon className="h-8 w-8 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
              Questão Compartilhada
            </h2>
            <p className="text-slate-600 dark:text-slate-400">
              Para acessar esta questão, por favor, identifique-se
            </p>
          </div>

          <form onSubmit={handleAccessSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Nome Completo *
              </label>
              <input
                type="text"
                value={accessData.nome}
                onChange={(e) => setAccessData({ ...accessData, nome: e.target.value })}
                required
                className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-alego-500 focus:border-transparent"
                placeholder="Digite seu nome completo"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Telefone *
              </label>
              <input
                type="tel"
                value={accessData.telefone}
                onChange={(e) => setAccessData({ ...accessData, telefone: e.target.value })}
                required
                className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-alego-500 focus:border-transparent"
                placeholder="(00) 00000-0000"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full px-6 py-3 bg-gradient-to-r from-alego-600 to-alego-700 text-white font-medium rounded-lg hover:from-alego-700 hover:to-alego-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Processando...' : 'Acessar Questão'}
            </button>
          </form>

          <p className="text-xs text-slate-500 dark:text-slate-500 text-center mt-4">
            Seus dados serão usados apenas para controle de acesso
          </p>
        </div>
      </div>
    )
  }

  if (!questao) {
    return null
  }

  const isCorrect = selectedAnswer === (questao.respostaCorreta || questao.correta)
  const tipoProva = questao.tipoProva || 'Múltipla Escolha'

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 py-6">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => navigate('/')}
            className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-alego-600 dark:hover:text-alego-400 mb-4"
          >
            <ArrowLeftIcon className="h-5 w-5" />
            Voltar
          </button>
          
          <div className="flex items-center gap-3">
            <div className="p-3 bg-gradient-to-br from-alego-500 to-alego-600 rounded-xl flex-shrink-0">
              <QuestionMarkCircleIcon className="h-8 w-8 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white break-words">
                Questão Compartilhada
              </h1>
              <p className="text-slate-600 dark:text-slate-400 mt-1">
                Assunto: <span className="font-semibold">{questao.assunto || 'Assunto não identificado'}</span>
              </p>
            </div>
          </div>
        </div>

        {/* Questão */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-6 sm:p-8 space-y-6">
          {/* Enunciado */}
          <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-4">
            <p className="text-slate-900 dark:text-white font-medium text-lg">
              {questao.enunciado}
            </p>
          </div>

          {/* Alternativas */}
          {!showResult ? (
            tipoProva === 'Certo/Errado' ? (
              <div className="grid grid-cols-2 gap-4">
                {['C', 'E'].map((key) => (
                  <button
                    key={key}
                    onClick={() => handleAnswer(key)}
                    className="text-center p-6 rounded-lg border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-alego-500 hover:bg-alego-50 dark:hover:bg-alego-900/20 transition-all"
                  >
                    <div className="flex flex-col items-center gap-2">
                      <span className="text-2xl font-bold text-slate-900 dark:text-white">{key === 'C' ? 'C' : 'E'}</span>
                      <span className="text-sm text-slate-700 dark:text-slate-300">{key === 'C' ? 'Certo' : 'Errado'}</span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {Object.entries(questao.alternativas || {}).map(([key, value]) => (
                  <button
                    key={key}
                    onClick={() => handleAnswer(key)}
                    className="w-full text-left p-4 rounded-lg border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-alego-500 hover:bg-alego-50 dark:hover:bg-alego-900/20 transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-slate-900 dark:text-white">{key})</span>
                      <span className="text-slate-700 dark:text-slate-300">{value}</span>
                    </div>
                  </button>
                ))}
              </div>
            )
          ) : (
            /* Resultado */
            <div className="space-y-6">
              <div className={`p-6 rounded-lg border-2 ${
                isCorrect
                  ? 'bg-green-50 dark:bg-green-900/20 border-green-500'
                  : 'bg-red-50 dark:bg-red-900/20 border-red-500'
              }`}>
                <div className="flex items-center gap-3 mb-2">
                  {isCorrect ? (
                    <CheckCircleIcon className="h-8 w-8 text-green-600" />
                  ) : (
                    <QuestionMarkCircleIcon className="h-8 w-8 text-red-600" />
                  )}
                  <h3 className="text-xl font-semibold text-slate-900 dark:text-white">
                    {isCorrect ? 'Correto!' : 'Incorreto'}
                  </h3>
                </div>
                <p className="text-slate-700 dark:text-slate-300">
                  {isCorrect
                    ? 'Você acertou a resposta!'
                    : `A resposta correta é: ${questao.respostaCorreta || questao.correta}`}
                </p>
              </div>

              {/* Explicação */}
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
                  💡 Explicação:
                </h4>
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown>
                    {questao.explicacao || questao.gabaritoComentado || 'Explicação não disponível'}
                  </ReactMarkdown>
                </div>
              </div>

              <button
                onClick={() => {
                  setSelectedAnswer(null)
                  setShowResult(false)
                }}
                className="w-full px-6 py-3 bg-gradient-to-r from-alego-600 to-alego-700 text-white font-medium rounded-lg hover:from-alego-700 hover:to-alego-800 transition-all"
              >
                Tentar Novamente
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
