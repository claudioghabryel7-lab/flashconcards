import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { doc, setDoc, onSnapshot } from 'firebase/firestore'
import { 
  CheckCircleIcon, 
  XCircleIcon, 
  HandThumbUpIcon, 
  HandThumbDownIcon,
  LightBulbIcon,
  ArrowLeftIcon,
  ArrowRightIcon
} from '@heroicons/react/24/outline'
import { db } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'
import { 
  rateIndividualQuestion,
  getOrCreateExplanationCache,
  saveExplanationCache,
  rateExplanationCache
} from '../utils/cache'
import { GoogleGenerativeAI } from '@google/generative-ai'

const QuestionView = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, profile } = useAuth()
  
  // Receber dados via location state
  const { 
    questions = [], 
    selectedMateria = '', 
    selectedModulo = '',
    cacheInfo = null,
    onQuestionsRatingChange = null
  } = location.state || {}
  
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [selectedAnswer, setSelectedAnswer] = useState(null)
  const [showResult, setShowResult] = useState(false)
  const [stats, setStats] = useState({ correct: 0, wrong: 0, byMateria: {} })
  const [showBizu, setShowBizu] = useState({})
  const [bizuLoading, setBizuLoading] = useState({})
  const [bizuText, setBizuText] = useState({})
  const [individualRatings, setIndividualRatings] = useState({})
  const [questionScores, setQuestionScores] = useState({})
  const [bizuRatings, setBizuRatings] = useState({})
  const [bizuCacheInfo, setBizuCacheInfo] = useState({})
  
  // Carregar estatísticas do usuário (por curso)
  useEffect(() => {
    if (!user || !profile) return
    
    const selectedCourseId = profile.selectedCourseId !== undefined ? profile.selectedCourseId : null
    const courseKey = selectedCourseId || 'alego' // 'alego' para curso padrão
    const statsRef = doc(db, 'questoesStats', `${user.uid}_${courseKey}`)
    const unsub = onSnapshot(statsRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data()
        // Verificar se é do curso correto (comparação mais robusta)
        const dataCourseId = data.courseId || null
        const currentCourseId = selectedCourseId || null
        
        if (dataCourseId === currentCourseId || (dataCourseId === null && currentCourseId === null)) {
          setStats(data)
        } else {
          // Se não é do curso correto, inicializar estatísticas vazias
          setStats({ correct: 0, wrong: 0, byMateria: {} })
        }
      } else {
        setStats({ correct: 0, wrong: 0, byMateria: {} })
      }
    })
    return () => unsub()
  }, [user, profile])
  
  // Redirecionar se não houver questões
  useEffect(() => {
    if (questions.length === 0) {
      navigate('/flashquestoes', { replace: true })
    }
  }, [questions, navigate])
  
  // Responder questão
  const handleAnswer = (answer) => {
    if (showResult) return
    
    setSelectedAnswer(answer)
    setShowResult(true)
    
    const currentQuestion = questions[currentQuestionIndex]
    const isCorrect = answer === currentQuestion.correta
    
    // Atualizar estatísticas
    const newStats = { ...stats }
    newStats.correct = (newStats.correct || 0) + (isCorrect ? 1 : 0)
    newStats.wrong = (newStats.wrong || 0) + (isCorrect ? 0 : 1)
    
    if (!newStats.byMateria[selectedMateria]) {
      newStats.byMateria[selectedMateria] = { correct: 0, wrong: 0 }
    }
    newStats.byMateria[selectedMateria].correct += isCorrect ? 1 : 0
    newStats.byMateria[selectedMateria].wrong += isCorrect ? 0 : 1
    
    setStats(newStats)
    
    // Salvar no Firestore (por curso)
    if (user && profile) {
      const selectedCourseId = profile.selectedCourseId !== undefined ? profile.selectedCourseId : null
      const courseKey = selectedCourseId || 'alego' // 'alego' para curso padrão
      const statsRef = doc(db, 'questoesStats', `${user.uid}_${courseKey}`)
      setDoc(statsRef, { ...newStats, courseId: selectedCourseId }, { merge: true })
    }
    
    // Scroll suave para o resultado
    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }, 100)
  }
  
  // Avaliar questão individual
  const handleRateIndividualQuestion = async (questionIndex, isLike) => {
    if (!selectedMateria || !selectedModulo) return
    
    setIndividualRatings(prev => ({
      ...prev,
      [questionIndex]: { liked: isLike, disliked: !isLike, loading: true }
    }))
    
    try {
      const selectedCourseId = profile?.selectedCourseId !== undefined ? profile.selectedCourseId : null
      const result = await rateIndividualQuestion(selectedMateria, selectedModulo, questionIndex, isLike, selectedCourseId)
      
      if (result.removed || result.cacheDeleted) {
        alert('Questão removida por baixa qualidade. Continuando com as questões restantes.')
        navigate('/flashquestoes', { replace: true })
        return
      } else {
        setQuestionScores(prev => ({
          ...prev,
          [questionIndex]: {
            likes: result.likes,
            dislikes: result.dislikes,
            score: result.score
          }
        }))
      }
    } catch (error) {
      console.error('Erro ao avaliar questão:', error)
      alert('Erro ao avaliar questão. Tente novamente.')
    } finally {
      setIndividualRatings(prev => ({
        ...prev,
        [questionIndex]: { ...prev[questionIndex], loading: false }
      }))
    }
  }
  
  // Próxima questão
  const nextQuestion = () => {
    const currentRating = individualRatings[currentQuestionIndex]
    if (!currentRating || (!currentRating.liked && !currentRating.disliked)) {
      alert('⚠️ Por favor, avalie esta questão (👍 ou 👎) antes de continuar!')
      return
    }
    
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1)
      setSelectedAnswer(null)
      setShowResult(false)
      setShowBizu({})
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }
  
  // Questão anterior
  const prevQuestion = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1)
      setSelectedAnswer(null)
      setShowResult(false)
      setShowBizu({})
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }
  
  // Gerar BIZU
  const generateBizu = async (questionIndex) => {
    const question = questions[questionIndex]
    if (!question) return
    
    setBizuLoading({ ...bizuLoading, [questionIndex]: true })
    setShowBizu({ ...showBizu, [questionIndex]: true })
    
    try {
      const questionId = `${selectedMateria}_${selectedModulo}_${questionIndex}_${question.enunciado.substring(0, 50).replace(/[^a-zA-Z0-9]/g, '_')}`
      
      const cachedExplanation = await getOrCreateExplanationCache(questionId)
      
      if (cachedExplanation && cachedExplanation.text) {
        setBizuText({ ...bizuText, [questionIndex]: cachedExplanation.text })
        setBizuCacheInfo({
          ...bizuCacheInfo,
          [questionIndex]: {
            likes: cachedExplanation.likes,
            dislikes: cachedExplanation.dislikes,
            score: cachedExplanation.score
          }
        })
        setBizuLoading({ ...bizuLoading, [questionIndex]: false })
        return
      }
      
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY
      const groqApiKey = import.meta.env.VITE_GROQ_API_KEY
      
      const prompt = `Você é um professor especialista em concursos públicos.

Questão:
${question.enunciado}

Alternativas:
${Object.entries(question.alternativas).map(([letra, texto]) => `${letra}) ${texto}`).join('\n')}

Alternativa correta: ${question.correta}

Forneça uma explicação didática e completa (BIZU) sobre esta questão.`

      let explanation = ''
      
      // Função auxiliar para chamar Groq API
      const callGroqAPI = async (promptText) => {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${groqApiKey}`,
          },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: [
              {
                role: 'system',
                content: 'Você é um professor especialista em concursos públicos.',
              },
              {
                role: 'user',
                content: promptText,
              },
            ],
            temperature: 0.7,
            max_tokens: 2000,
          }),
        })
        
        if (!response.ok) {
          throw new Error(`Groq API error: ${response.status}`)
        }
        
        const data = await response.json()
        return data.choices[0]?.message?.content || ''
      }
      
      if (apiKey) {
        try {
          const genAI = new GoogleGenerativeAI(apiKey)
          const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' })
          const result = await model.generateContent(prompt)
          explanation = result.response.text()
        } catch (geminiErr) {
          const errorMessage = geminiErr.message || String(geminiErr) || ''
          const isQuotaError = errorMessage.includes('429') || errorMessage.includes('quota')
          
          if (isQuotaError && groqApiKey) {
            explanation = await callGroqAPI(prompt)
          } else {
            throw geminiErr
          }
        }
      } else if (groqApiKey) {
        explanation = await callGroqAPI(prompt)
      }
      
      await saveExplanationCache(questionId, explanation)
      setBizuCacheInfo({
        ...bizuCacheInfo,
        [questionIndex]: { likes: 0, dislikes: 0, score: 100 }
      })
      
      setBizuText({ ...bizuText, [questionIndex]: explanation })
    } catch (err) {
      console.error('Erro ao gerar BIZU:', err)
      setBizuText({ ...bizuText, [questionIndex]: `Erro ao gerar explicação: ${err.message}` })
    } finally {
      setBizuLoading({ ...bizuLoading, [questionIndex]: false })
    }
  }
  
  // Avaliar BIZU
  const handleRateBizu = async (questionIndex, isLike) => {
    const question = questions[questionIndex]
    if (!question) return
    
    const questionId = `${selectedMateria}_${selectedModulo}_${questionIndex}_${question.enunciado.substring(0, 50).replace(/[^a-zA-Z0-9]/g, '_')}`
    
    setBizuRatings({
      ...bizuRatings,
      [questionIndex]: { liked: isLike, disliked: !isLike }
    })
    
    try {
      await rateExplanationCache(questionId, isLike)
      
      if (bizuCacheInfo[questionIndex]) {
        setBizuCacheInfo({
          ...bizuCacheInfo,
          [questionIndex]: {
            ...bizuCacheInfo[questionIndex],
            likes: isLike ? bizuCacheInfo[questionIndex].likes + 1 : bizuCacheInfo[questionIndex].likes,
            dislikes: !isLike ? bizuCacheInfo[questionIndex].dislikes + 1 : bizuCacheInfo[questionIndex].dislikes
          }
        })
      }
    } catch (error) {
      console.error('Erro ao avaliar BIZU:', error)
    }
  }
  
  // Calcular estatísticas por matéria
  const materiasStats = useMemo(() => {
    const materias = []
    Object.entries(stats.byMateria || {}).forEach(([materia, data]) => {
      const total = (data.correct || 0) + (data.wrong || 0)
      if (total > 0) {
        const accuracy = (data.correct || 0) / total
        materias.push({
          materia,
          accuracy: (accuracy * 100).toFixed(1),
          correct: data.correct || 0,
          wrong: data.wrong || 0,
          total,
          needsCalibration: accuracy < 0.7,
        })
      }
    })
    return materias.sort((a, b) => parseFloat(a.accuracy) - parseFloat(b.accuracy))
  }, [stats])

  // Matérias que precisam calibrar
  const needsCalibration = useMemo(() => {
    return materiasStats
      .filter(m => m.needsCalibration)
      .sort((a, b) => {
        if (b.wrong !== a.wrong) return b.wrong - a.wrong
        return parseFloat(a.accuracy) - parseFloat(b.accuracy)
      })
  }, [materiasStats])

  const currentQuestion = questions[currentQuestionIndex]
  const progress = ((currentQuestionIndex + 1) / questions.length) * 100
  const totalAnswered = (stats.correct || 0) + (stats.wrong || 0)
  const accuracy = totalAnswered > 0 ? ((stats.correct || 0) / totalAnswered * 100).toFixed(1) : 0
  
  if (questions.length === 0) {
    return null
  }
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/30 dark:from-slate-900 dark:via-blue-900/20 dark:to-purple-900/20">
      {/* Header Tecnológico */}
      <div className="relative overflow-hidden bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 shadow-lg">
        {/* Background decorativo */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-blue-500/10 via-purple-500/10 to-cyan-500/10 rounded-full blur-3xl -mr-48 -mt-48"></div>
        <div className="absolute bottom-0 left-0 w-72 h-72 bg-gradient-to-tr from-indigo-500/10 to-purple-500/10 rounded-full blur-3xl -ml-36 -mb-36"></div>
        
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/flashquestoes')}
                className="group relative inline-flex items-center gap-2 px-4 py-2 rounded-xl border-2 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 font-bold hover:bg-slate-50 dark:hover:bg-slate-700 transition-all"
              >
                <ArrowLeftIcon className="h-5 w-5" />
                <span>Voltar</span>
              </button>
              
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-blue-600 dark:text-blue-400 mb-1">
                  {selectedMateria}
                </p>
                <p className="text-sm font-bold text-slate-900 dark:text-white">
                  {selectedModulo}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              {/* Estatísticas em tempo real */}
              {totalAnswered > 0 && (
                <div className="hidden md:flex items-center gap-4 px-4 py-2 rounded-xl bg-gradient-to-r from-blue-500/10 to-purple-500/10 dark:from-blue-500/20 dark:to-purple-500/20 border border-blue-500/30 dark:border-blue-400/30">
                  <div className="text-center">
                    <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">Taxa de Acerto</p>
                    <p className="text-lg font-black text-blue-600 dark:text-blue-400">{accuracy}%</p>
                  </div>
                  <div className="h-8 w-px bg-slate-300 dark:bg-slate-600"></div>
                  <div className="text-center">
                    <p className="text-xs font-semibold text-green-600 dark:text-green-400">✓ {stats.correct || 0}</p>
                    <p className="text-xs font-semibold text-red-600 dark:text-red-400">✗ {stats.wrong || 0}</p>
                  </div>
                </div>
              )}
              
              {cacheInfo && (
                <div className="hidden sm:flex items-center gap-3 px-4 py-2 rounded-xl bg-gradient-to-r from-blue-500/10 to-purple-500/10 dark:from-blue-500/20 dark:to-purple-500/20 border border-blue-500/30 dark:border-blue-400/30">
                  {cacheInfo.cached && (
                    <span className="px-2 py-1 rounded-full bg-green-500/20 text-green-600 dark:text-green-400 text-xs font-bold">
                      ✅ Cache
                    </span>
                  )}
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                    👍 {cacheInfo.likes} | 👎 {cacheInfo.dislikes}
                  </span>
                </div>
              )}
            </div>
          </div>
          
          {/* Barra de progresso */}
          <div className="relative">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-black text-slate-900 dark:text-white">
                Questão {currentQuestionIndex + 1} de {questions.length}
              </p>
              <p className="text-sm font-bold text-blue-600 dark:text-blue-400">
                {Math.round(progress)}%
              </p>
            </div>
            <div className="relative h-3 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
              <div 
                className="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-500 via-purple-500 to-cyan-500 transition-all duration-500 ease-out rounded-full"
                style={{ width: `${progress}%` }}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-white/30 via-transparent to-white/30 animate-shimmer-slide"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Conteúdo principal */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {currentQuestion && (
          <div className="space-y-6">
            {/* Badge fictícia */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-yellow-500/20 border border-yellow-500/30 text-yellow-700 dark:text-yellow-400 text-sm font-bold">
              ⚠️ Questão FICTÍCIA gerada por IA
            </div>
            
            {/* Enunciado */}
            <div className="relative overflow-hidden bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-6 sm:p-8">
              <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-blue-500/5 to-purple-500/5 rounded-full blur-3xl -mr-32 -mt-32"></div>
              
              <p className="relative text-xl sm:text-2xl lg:text-3xl font-black text-slate-900 dark:text-white leading-relaxed">
                {currentQuestion.enunciado}
              </p>
            </div>
            
            {/* Alternativas */}
            <div className="space-y-3 sm:space-y-4">
              {Object.entries(currentQuestion.alternativas).map(([letra, texto]) => {
                const isSelected = selectedAnswer === letra
                const isCorrect = letra === currentQuestion.correta
                const showCorrect = showResult && isCorrect
                const showWrong = showResult && isSelected && !isCorrect
                
                return (
                  <button
                    key={letra}
                    type="button"
                    onClick={() => handleAnswer(letra)}
                    disabled={showResult}
                    className={`group relative w-full text-left p-5 sm:p-6 rounded-xl border-2 transition-all duration-300 overflow-hidden ${
                      showCorrect
                        ? 'bg-gradient-to-r from-green-500/20 to-emerald-500/20 border-green-500/50 shadow-lg shadow-green-500/20'
                        : showWrong
                        ? 'bg-gradient-to-r from-red-500/20 to-rose-500/20 border-red-500/50'
                        : isSelected
                        ? 'bg-gradient-to-r from-blue-500/10 to-purple-500/10 border-blue-500/50'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-blue-500/50 hover:bg-blue-50/50 dark:hover:bg-blue-900/20'
                    } ${showResult ? 'cursor-default' : 'cursor-pointer hover:scale-[1.02]'}`}
                  >
                    {!showResult && isSelected && (
                      <div className="absolute inset-0 bg-gradient-to-r from-blue-500/0 via-blue-500/10 to-purple-500/0 animate-shimmer-slide"></div>
                    )}
                    
                    <div className="relative flex items-start gap-4">
                      <span className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center font-black text-lg ${
                        showCorrect 
                          ? 'bg-green-500 text-white' 
                          : showWrong 
                          ? 'bg-red-500 text-white'
                          : isSelected
                          ? 'bg-gradient-to-r from-blue-500 to-purple-500 text-white'
                          : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                      }`}>
                        {letra}
                      </span>
                      <span className={`flex-1 text-base sm:text-lg ${
                        showCorrect || showWrong 
                          ? 'font-bold text-slate-900 dark:text-white' 
                          : 'text-slate-700 dark:text-slate-300'
                      }`}>
                        {texto}
                      </span>
                      {showCorrect && (
                        <CheckCircleIcon className="flex-shrink-0 h-7 w-7 text-green-500" />
                      )}
                      {showWrong && (
                        <XCircleIcon className="flex-shrink-0 h-7 w-7 text-red-500" />
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
            
            {/* Resultado */}
            {showResult && (
              <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                {/* Justificativa */}
                <div className="relative overflow-hidden bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 p-5 sm:p-6">
                  <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-blue-500/5 to-purple-500/5 rounded-full blur-3xl -mr-24 -mt-24"></div>
                  
                  <p className="relative text-sm font-black uppercase tracking-widest text-blue-600 dark:text-blue-400 mb-3">
                    ✓ Justificativa
                  </p>
                  <p className="relative text-sm sm:text-base text-slate-700 dark:text-slate-300 leading-relaxed">
                    {currentQuestion.justificativa}
                  </p>
                </div>
                
                {/* BIZU */}
                <button
                  type="button"
                  onClick={() => {
                    if (!showBizu[currentQuestionIndex]) {
                      generateBizu(currentQuestionIndex)
                    } else {
                      setShowBizu({ ...showBizu, [currentQuestionIndex]: !showBizu[currentQuestionIndex] })
                    }
                  }}
                  className="group relative w-full flex items-center justify-center gap-3 px-6 py-4 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-white font-bold shadow-lg hover:shadow-xl hover:scale-105 transition-all overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                  <LightBulbIcon className="h-5 w-5 relative z-10" />
                  <span className="relative z-10">
                    {showBizu[currentQuestionIndex] && bizuText[currentQuestionIndex] ? 'Ocultar BIZU' : '💡 Ver BIZU (Explicação Completa)'}
                  </span>
                </button>
                
                {showBizu[currentQuestionIndex] && (
                  <div className="relative overflow-hidden bg-gradient-to-br from-blue-50/50 via-purple-50/30 to-cyan-50/50 dark:from-blue-900/20 dark:via-purple-900/20 dark:to-cyan-900/20 rounded-xl border border-blue-200/50 dark:border-blue-800/50 p-5 sm:p-6">
                    <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-blue-500/5 to-purple-500/5 rounded-full blur-3xl -mr-24 -mt-24"></div>
                    
                    {bizuLoading[currentQuestionIndex] ? (
                      <div className="text-center py-8">
                        <div className="inline-block animate-spin text-blue-500 text-4xl mb-4">⚙️</div>
                        <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">Gerando BIZU...</p>
                      </div>
                    ) : bizuText[currentQuestionIndex] ? (
                      <div className="relative">
                        <div className="flex items-center justify-between mb-4">
                          <p className="text-sm font-black uppercase tracking-widest text-blue-600 dark:text-blue-400">
                            💡 BIZU
                          </p>
                          {bizuCacheInfo[currentQuestionIndex] && (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-slate-500 dark:text-slate-400">
                                👍 {bizuCacheInfo[currentQuestionIndex].likes} | 👎 {bizuCacheInfo[currentQuestionIndex].dislikes}
                              </span>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleRateBizu(currentQuestionIndex, true)}
                                  disabled={bizuRatings[currentQuestionIndex]?.liked || bizuRatings[currentQuestionIndex]?.disliked}
                                  className={`p-1.5 rounded-lg transition ${
                                    bizuRatings[currentQuestionIndex]?.liked
                                      ? 'bg-green-500 text-white'
                                      : 'bg-white dark:bg-slate-800 hover:bg-green-50 dark:hover:bg-green-900/20 text-slate-600 dark:text-slate-400'
                                  } ${bizuRatings[currentQuestionIndex]?.disliked ? 'opacity-50' : ''}`}
                                >
                                  <HandThumbUpIcon className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRateBizu(currentQuestionIndex, false)}
                                  disabled={bizuRatings[currentQuestionIndex]?.liked || bizuRatings[currentQuestionIndex]?.disliked}
                                  className={`p-1.5 rounded-lg transition ${
                                    bizuRatings[currentQuestionIndex]?.disliked
                                      ? 'bg-red-500 text-white'
                                      : 'bg-white dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-600 dark:text-slate-400'
                                  } ${bizuRatings[currentQuestionIndex]?.liked ? 'opacity-50' : ''}`}
                                >
                                  <HandThumbDownIcon className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                        <p className="text-sm sm:text-base text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                          {bizuText[currentQuestionIndex]}
                        </p>
                      </div>
                    ) : (
                      <p className="text-sm text-slate-600 dark:text-slate-400">Carregando...</p>
                    )}
                  </div>
                )}
                
                {/* Avaliação obrigatória */}
                <div className="relative overflow-hidden bg-gradient-to-r from-purple-500/10 via-pink-500/10 to-rose-500/10 rounded-xl border-2 border-purple-500/30 dark:border-purple-400/30 p-5 sm:p-6">
                  <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-purple-500/5 to-pink-500/5 rounded-full blur-3xl -mr-24 -mt-24"></div>
                  
                  <p className="relative text-sm font-black uppercase tracking-widest text-purple-700 dark:text-purple-400 mb-4 flex items-center gap-2">
                    ⭐ Avalie esta questão (obrigatório)
                  </p>
                  <div className="relative flex items-center justify-center gap-4">
                    <button
                      type="button"
                      onClick={() => handleRateIndividualQuestion(currentQuestionIndex, true)}
                      disabled={
                        individualRatings[currentQuestionIndex]?.liked ||
                        individualRatings[currentQuestionIndex]?.disliked ||
                        individualRatings[currentQuestionIndex]?.loading
                      }
                      className={`group/btn relative flex items-center gap-2 px-6 py-3 rounded-xl font-bold transition-all overflow-hidden ${
                        individualRatings[currentQuestionIndex]?.liked
                          ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white shadow-lg'
                          : 'bg-white dark:bg-slate-800 border-2 border-green-500/50 text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20'
                      } ${individualRatings[currentQuestionIndex]?.disliked || individualRatings[currentQuestionIndex]?.loading ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105'}`}
                    >
                      {individualRatings[currentQuestionIndex]?.liked && (
                        <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover/btn:translate-x-[100%] transition-transform duration-1000"></div>
                      )}
                      <HandThumbUpIcon className="h-5 w-5 relative z-10" />
                      <span className="relative z-10">👍 Boa questão</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRateIndividualQuestion(currentQuestionIndex, false)}
                      disabled={
                        individualRatings[currentQuestionIndex]?.liked ||
                        individualRatings[currentQuestionIndex]?.disliked ||
                        individualRatings[currentQuestionIndex]?.loading
                      }
                      className={`group/btn relative flex items-center gap-2 px-6 py-3 rounded-xl font-bold transition-all overflow-hidden ${
                        individualRatings[currentQuestionIndex]?.disliked
                          ? 'bg-gradient-to-r from-red-500 to-rose-500 text-white shadow-lg'
                          : 'bg-white dark:bg-slate-800 border-2 border-red-500/50 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
                      } ${individualRatings[currentQuestionIndex]?.liked || individualRatings[currentQuestionIndex]?.loading ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105'}`}
                    >
                      {individualRatings[currentQuestionIndex]?.disliked && (
                        <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover/btn:translate-x-[100%] transition-transform duration-1000"></div>
                      )}
                      <HandThumbDownIcon className="h-5 w-5 relative z-10" />
                      <span className="relative z-10">👎 Questão ruim</span>
                    </button>
                  </div>
                  {questionScores[currentQuestionIndex] && (
                    <p className="text-xs text-center text-slate-600 dark:text-slate-400 mt-3">
                      👍 {questionScores[currentQuestionIndex].likes} | 👎 {questionScores[currentQuestionIndex].dislikes} | Score: {questionScores[currentQuestionIndex].score}%
                    </p>
                  )}
                  {individualRatings[currentQuestionIndex]?.loading && (
                    <p className="text-xs text-center text-slate-500 mt-2">Salvando avaliação...</p>
                  )}
                </div>
                
                {/* Navegação */}
                <div className="flex items-center justify-between gap-4">
                  <button
                    type="button"
                    onClick={prevQuestion}
                    disabled={currentQuestionIndex === 0}
                    className="group relative flex items-center gap-2 px-5 py-3 rounded-xl border-2 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 font-bold hover:bg-slate-50 dark:hover:bg-slate-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-slate-500/0 via-slate-500/10 to-slate-500/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></div>
                    <ArrowLeftIcon className="h-5 w-5 relative z-10" />
                    <span className="relative z-10 hidden sm:inline">Anterior</span>
                  </button>
                  
                  {currentQuestionIndex < questions.length - 1 && (
                    <button
                      type="button"
                      onClick={nextQuestion}
                      disabled={!individualRatings[currentQuestionIndex] || (!individualRatings[currentQuestionIndex].liked && !individualRatings[currentQuestionIndex].disliked)}
                      className="group relative flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 text-white font-bold shadow-lg hover:shadow-xl hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden"
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                      <span className="relative z-10">Próxima Questão</span>
                      <ArrowRightIcon className="h-5 w-5 relative z-10" />
                    </button>
                  )}
                  
                  {currentQuestionIndex === questions.length - 1 && (
                    <button
                      type="button"
                      onClick={() => navigate('/flashquestoes')}
                      className="group relative flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 text-white font-bold shadow-lg hover:shadow-xl hover:scale-105 transition-all overflow-hidden"
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                      <span className="relative z-10">✓ Finalizar</span>
                    </button>
                  )}
                </div>
                
                {/* Resumo de Calibração - Mostrar ao final */}
                {currentQuestionIndex === questions.length - 1 && needsCalibration.length > 0 && (
                  <div className="mt-6 relative overflow-hidden bg-gradient-to-br from-orange-500/10 via-red-500/5 to-orange-500/10 rounded-xl border-2 border-orange-500/50 dark:border-orange-400/50 p-5 sm:p-6">
                    <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-orange-500/5 to-red-500/5 rounded-full blur-3xl -mr-24 -mt-24"></div>
                    
                    <div className="relative">
                      <div className="flex items-center gap-3 mb-4">
                        <span className="text-3xl">🎯</span>
                        <div>
                          <p className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">
                            O que precisa calibrar os estudos
                          </p>
                          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">
                            Foque nestas matérias para melhorar seu desempenho
                          </p>
                        </div>
                      </div>
                      <div className="space-y-3">
                        {needsCalibration.slice(0, 3).map((item, idx) => {
                          const priority = idx + 1
                          return (
                            <div
                              key={item.materia}
                              className="p-4 rounded-xl bg-gradient-to-r from-orange-500/20 to-red-500/20 border border-orange-500/50 dark:border-orange-400/50"
                            >
                              <div className="flex items-start gap-3">
                                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center text-white font-black text-sm">
                                  {priority}
                                </div>
                                <div className="flex-1">
                                  <p className="font-bold text-base sm:text-lg text-slate-900 dark:text-white mb-1">
                                    {item.materia}
                                  </p>
                                  <div className="flex flex-wrap items-center gap-3 text-xs sm:text-sm">
                                    <span className="text-red-600 dark:text-red-400 font-semibold">
                                      ⚠️ {item.wrong} erros
                                    </span>
                                    <span className="text-slate-600 dark:text-slate-400">
                                      Taxa: <span className="text-orange-600 dark:text-orange-400 font-bold">{item.accuracy}%</span>
                                    </span>
                                    <span className="text-slate-600 dark:text-slate-400">
                                      {item.correct}/{item.total} questões
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default QuestionView

