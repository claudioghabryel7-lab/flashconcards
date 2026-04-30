'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, HelpCircle, CheckCircle, X, Clock, Target, TrendingUp, Play } from 'lucide-react'
import { useRouter } from 'next/navigation'
import SimpleHeader from '@/components/SimpleHeader'
import Footer from '@/components/Footer'

export default function QuestoesPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [courseData, setCourseData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [questions, setQuestions] = useState<any[]>([])
  const [currentQuestion, setCurrentQuestion] = useState(0)
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null)
  const [showResult, setShowResult] = useState(false)
  const [answers, setAnswers] = useState<string[]>([])
  const [quizStarted, setQuizStarted] = useState(false)
  const [quizCompleted, setQuizCompleted] = useState(false)

  useEffect(() => {
    // Simular carregamento de questões baseadas na banca e concurso
    const loadQuestions = async () => {
      setLoading(true)
      
      // Questões mockadas baseadas no concurso
      const mockQuestions = [
        {
          id: 1,
          question: "Assinale a alternativa que completa corretamente a frase: 'O documento _____ importante para o processo'.",
          options: [
            "esta",
            "está",
            "são",
            "é",
            "ser"
          ],
          correctAnswer: "está",
          explanation: "O verbo 'estar' concorda com 'documento' (3ª pessoa singular) e indica estado temporário.",
          difficulty: "Fácil",
          topic: "Concordância Verbal"
        },
        {
          id: 2,
          question: "Qual é a principal função do hardware em um computador?",
          options: [
            "Executar programas",
            "Armazenar dados",
            "Processar informações",
            "Conectar à internet",
            "Exibir imagens"
          ],
          correctAnswer: "Processar informações",
          explanation: "O hardware é responsável pelo processamento físico das informações, sendo a base para todas as operações do computador.",
          difficulty: "Médio",
          topic: "Hardware e Software"
        },
        {
          id: 3,
          question: "Se 3 operários produzem 150 peças em 5 dias, quantos dias 6 operários levarão para produzir 300 peças?",
          options: [
            "5 dias",
            "6 dias",
            "8 dias",
            "10 dias",
            "12 dias"
          ],
          correctAnswer: "5 dias",
          explanation: "Regra de três: 3 op/5 dias = 6 op/x dias. Como o número de operários dobrou e a produção também, o tempo permanece o mesmo.",
          difficulty: "Médio",
          topic: "Regra de Três"
        },
        {
          id: 4,
          question: "Em uma proposição lógica, 'Se P então Q' é equivalente a:",
          options: [
            "Se não Q então não P",
            "Se P então não Q",
            "Se não P então Q",
            "P e Q",
            "Não P ou Q"
          ],
          correctAnswer: "Se não Q então não P",
          explanation: "A contrapositiva de 'Se P então Q' é 'Se não Q então não P', que é logicamente equivalente.",
          difficulty: "Difícil",
          topic: "Lógica Proposicional"
        },
        {
          id: 5,
          question: "O desenvolvimento sustentável busca equilibrar:",
          options: [
            "Apenas o crescimento econômico",
            "Apenas a preservação ambiental",
            "Economia, meio ambiente e sociedade",
            "Apenas o desenvolvimento social",
            "Tecnologia e lucro"
          ],
          correctAnswer: "Economia, meio ambiente e sociedade",
          explanation: "Desenvolvimento sustentável integra as três dimensões: econômica, ambiental e social, garantindo qualidade de vida presente e futura.",
          difficulty: "Fácil",
          topic: "Meio Ambiente"
        }
      ]

      const courseTitle = decodeURIComponent(params.id).replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
      
      setCourseData({
        id: params.id,
        title: courseTitle,
        organization: "Comissão de Concurso Público",
        banca: "FCC - Fundação Carlos Chagas",
        status: "Aberto"
      })
      
      setQuestions(mockQuestions)
      setLoading(false)
    }

    loadQuestions()
  }, [params.id])

  const startQuiz = () => {
    setQuizStarted(true)
    setCurrentQuestion(0)
    setSelectedAnswer(null)
    setShowResult(false)
    setAnswers([])
    setQuizCompleted(false)
  }

  const selectAnswer = (answer: string) => {
    if (!showResult) {
      setSelectedAnswer(answer)
    }
  }

  const submitAnswer = () => {
    if (selectedAnswer) {
      setShowResult(true)
      setAnswers([...answers, selectedAnswer])
    }
  }

  const nextQuestion = () => {
    if (currentQuestion < questions.length - 1) {
      setCurrentQuestion(currentQuestion + 1)
      setSelectedAnswer(null)
      setShowResult(false)
    } else {
      setQuizCompleted(true)
    }
  }

  const calculateScore = () => {
    let correct = 0
    questions.forEach((question, index) => {
      if (answers[index] === question.correctAnswer) {
        correct++
      }
    })
    return correct
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    )
  }

  if (!courseData) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Questões não encontradas</h1>
          <button
            onClick={() => router.push('/cursos')}
            className="px-6 py-2 bg-blue-500 rounded-lg hover:bg-blue-600 transition-colors"
          >
            Voltar para busca
          </button>
        </div>
      </div>
    )
  }

  if (!quizStarted) {
    return (
      <div className="min-h-screen bg-slate-900 text-white">
        <SimpleHeader />
        
        <section className="relative py-20">
          <div className="absolute inset-0">
            <div className="absolute inset-0 bg-gradient-to-b from-slate-900 to-slate-950"></div>
            <div className="absolute inset-0 opacity-20">
              <div className="absolute inset-0" style={{
                backgroundImage: `radial-gradient(circle at 1px 1px, rgba(255,255,255,0.15) 1px, transparent 1px)`,
                backgroundSize: '40px 40px'
              }}></div>
            </div>
          </div>

          <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <button
                onClick={() => router.push(`/curso/${params.id}`)}
                className="mb-6 inline-flex items-center text-gray-400 hover:text-white transition-colors"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Voltar para {courseData.title}
              </button>

              <HelpCircle className="w-20 h-20 text-blue-400 mx-auto mb-6" />
              
              <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                Questões Personalizadas
              </h1>
              
              <p className="text-xl text-gray-300 mb-8">
                {courseData.title} - Banca: {courseData.banca}
              </p>

              <div className="bg-slate-800 rounded-2xl border border-slate-700 p-8 mb-8">
                <h3 className="text-2xl font-semibold mb-4">Informações do Simulado</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-blue-400 mb-2">{questions.length}</div>
                    <div className="text-gray-400">Questões</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-green-400 mb-2">FCC</div>
                    <div className="text-gray-400">Banca</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-purple-400 mb-2">30 min</div>
                    <div className="text-gray-400">Duração</div>
                  </div>
                </div>

                <div className="space-y-4 text-left">
                  <div className="flex items-center">
                    <CheckCircle className="w-5 h-5 text-green-400 mr-3" />
                    <span>Questões baseadas no edital atualizado</span>
                  </div>
                  <div className="flex items-center">
                    <CheckCircle className="w-5 h-5 text-green-400 mr-3" />
                    <span>Conteúdo personalizado para {courseData.banca}</span>
                  </div>
                  <div className="flex items-center">
                    <CheckCircle className="w-5 h-5 text-green-400 mr-3" />
                    <span>Feedback instantâneo com explicações</span>
                  </div>
                  <div className="flex items-center">
                    <CheckCircle className="w-5 h-5 text-green-400 mr-3" />
                    <span>Distribuição equilibrada por dificuldade</span>
                  </div>
                </div>
              </div>

              <button
                onClick={startQuiz}
                className="px-8 py-4 bg-gradient-to-r from-blue-500 to-purple-500 rounded-xl hover:from-blue-600 hover:to-purple-600 transition-all duration-300 text-lg font-semibold flex items-center gap-3 mx-auto"
              >
                <Play className="w-6 h-6" />
                Iniciar Simulado
              </button>
            </motion.div>
          </div>
        </section>

        <Footer />
      </div>
    )
  }

  if (quizCompleted) {
    const score = calculateScore()
    const percentage = Math.round((score / questions.length) * 100)

    return (
      <div className="min-h-screen bg-slate-900 text-white">
        <SimpleHeader />
        
        <section className="relative py-20">
          <div className="absolute inset-0">
            <div className="absolute inset-0 bg-gradient-to-b from-slate-900 to-slate-950"></div>
          </div>

          <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6 }}
            >
              <div className="bg-slate-800 rounded-2xl border border-slate-700 p-8">
                <h1 className="text-3xl font-bold mb-6">Simulado Concluído!</h1>
                
                <div className={`text-6xl font-bold mb-4 ${
                  percentage >= 80 ? 'text-green-400' :
                  percentage >= 60 ? 'text-yellow-400' :
                  'text-red-400'
                }`}>
                  {score}/{questions.length}
                </div>
                
                <div className="text-2xl text-gray-300 mb-8">
                  {percentage}% de acerto
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                  <div className="bg-slate-700 rounded-lg p-4">
                    <div className="text-green-400 font-semibold">{score}</div>
                    <div className="text-sm text-gray-400">Acertos</div>
                  </div>
                  <div className="bg-slate-700 rounded-lg p-4">
                    <div className="text-red-400 font-semibold">{questions.length - score}</div>
                    <div className="text-sm text-gray-400">Erros</div>
                  </div>
                  <div className="bg-slate-700 rounded-lg p-4">
                    <div className="text-blue-400 font-semibold">{percentage}%</div>
                    <div className="text-sm text-gray-400">Aproveitamento</div>
                  </div>
                </div>

                <div className="flex gap-4 justify-center">
                  <button
                    onClick={() => router.push(`/curso/${params.id}`)}
                    className="px-6 py-3 bg-slate-700 rounded-lg hover:bg-slate-600 transition-colors"
                  >
                    Voltar ao Curso
                  </button>
                  <button
                    onClick={startQuiz}
                    className="px-6 py-3 bg-blue-500 rounded-lg hover:bg-blue-600 transition-colors"
                  >
                    Refazer Simulado
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        <Footer />
      </div>
    )
  }

  const question = questions[currentQuestion]
  const progress = ((currentQuestion + 1) / questions.length) * 100

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <SimpleHeader />
      
      <section className="relative py-20">
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-gradient-to-b from-slate-900 to-slate-950"></div>
          <div className="absolute inset-0 opacity-20">
            <div className="absolute inset-0" style={{
              backgroundImage: `radial-gradient(circle at 1px 1px, rgba(255,255,255,0.15) 1px, transparent 1px)`,
              backgroundSize: '40px 40px'
            }}></div>
          </div>
        </div>

        <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="mb-8"
          >
            <div className="flex items-center justify-between mb-6">
              <button
                onClick={() => router.push(`/curso/${params.id}`)}
                className="inline-flex items-center text-gray-400 hover:text-white transition-colors"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Voltar para {courseData.title}
              </button>
              
              <div className="text-sm text-gray-400">
                Questão {currentQuestion + 1} de {questions.length}
              </div>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-slate-700 rounded-full h-2">
              <div 
                className="bg-gradient-to-r from-blue-500 to-purple-500 h-2 rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
          </motion.div>

          {/* Question */}
          {question && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="bg-slate-800 rounded-xl border border-slate-700 p-8"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                  <span className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded-full text-sm">
                    {question.topic}
                  </span>
                  <span className={`px-3 py-1 rounded-full text-sm ${
                    question.difficulty === 'Fácil' ? 'bg-green-500/20 text-green-400' :
                    question.difficulty === 'Médio' ? 'bg-yellow-500/20 text-yellow-400' :
                    'bg-red-500/20 text-red-400'
                  }`}>
                    {question.difficulty}
                  </span>
                </div>
              </div>

              <h3 className="text-xl font-semibold mb-6">{question.question}</h3>

              <div className="space-y-3 mb-6">
                {question.options.map((option: string, index: number) => {
                  const isSelected = selectedAnswer === option
                  const isCorrect = question.correctAnswer === option
                  const showCorrect = showResult && isCorrect
                  const showWrong = showResult && isSelected && !isCorrect

                  return (
                    <motion.div
                      key={index}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <button
                        onClick={() => selectAnswer(option)}
                        disabled={showResult}
                        className={`w-full p-4 rounded-lg border text-left transition-all duration-300 ${
                          showCorrect ? 'bg-green-500/20 border-green-500 text-green-400' :
                          showWrong ? 'bg-red-500/20 border-red-500 text-red-400' :
                          isSelected ? 'bg-blue-500/20 border-blue-500 text-blue-400' :
                          'bg-slate-700 border-slate-600 hover:bg-slate-600 hover:border-slate-500 text-white'
                        } disabled:cursor-not-allowed`}
                      >
                        <div className="flex items-center">
                          <span className="font-semibold mr-3">{String.fromCharCode(65 + index)}.</span>
                          <span>{option}</span>
                          {showCorrect && <CheckCircle className="w-5 h-5 ml-auto" />}
                          {showWrong && <X className="w-5 h-5 ml-auto" />}
                        </div>
                      </button>
                    </motion.div>
                  )
                })}
              </div>

              {showResult && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`p-4 rounded-lg mb-6 ${
                    selectedAnswer === question.correctAnswer ? 'bg-green-500/20 border border-green-500' : 'bg-red-500/20 border border-red-500'
                  }`}
                >
                  <h4 className="font-semibold mb-2 flex items-center">
                    {selectedAnswer === question.correctAnswer ? (
                      <>
                        <CheckCircle className="w-5 h-5 mr-2 text-green-400" />
                        Resposta Correta!
                      </>
                    ) : (
                      <>
                        <X className="w-5 h-5 mr-2 text-red-400" />
                        Resposta Incorreta
                      </>
                    )}
                  </h4>
                  <p className="text-gray-300">{question.explanation}</p>
                </motion.div>
              )}

              <div className="flex justify-center">
                {!showResult ? (
                  <button
                    onClick={submitAnswer}
                    disabled={!selectedAnswer}
                    className="px-6 py-3 bg-blue-500 rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Responder
                  </button>
                ) : (
                  <button
                    onClick={nextQuestion}
                    className="px-6 py-3 bg-purple-500 rounded-lg hover:bg-purple-600 transition-colors"
                  >
                    {currentQuestion < questions.length - 1 ? 'Próxima Questão' : 'Ver Resultado'}
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </div>
      </section>

      <Footer />
    </div>
  )
}
