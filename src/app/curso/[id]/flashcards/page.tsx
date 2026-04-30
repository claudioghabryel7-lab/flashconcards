'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, RotateCcw, CheckCircle, X, BookOpen, Brain, Target, TrendingUp } from 'lucide-react'
import { useRouter } from 'next/navigation'
import SimpleHeader from '@/components/SimpleHeader'
import Footer from '@/components/Footer'

export default function FlashcardsPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [courseData, setCourseData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [flashcards, setFlashcards] = useState<any[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isFlipped, setIsFlipped] = useState(false)
  const [studiedCards, setStudiedCards] = useState<Set<number>>(new Set())
  const [showStats, setShowStats] = useState(false)

  useEffect(() => {
    // Simular carregamento de flashcards gerados por IA
    const loadFlashcards = async () => {
      setLoading(true)
      
      // Flashcards mockados gerados por IA baseados no edital
      const mockFlashcards = [
        {
          id: 1,
          module: "Língua Portuguesa",
          topic: "Compreensão e interpretação de textos",
          front: "O que é coerência textual?",
          back: "Coerência textual é a conexão lógica e semântica entre as ideias de um texto, garantindo que as informações se organizem de forma clara e compreensível.",
          difficulty: "Fácil"
        },
        {
          id: 2,
          module: "Língua Portuguesa",
          topic: "Tipologia textual",
          front: "Quais são os principais tipos de texto?",
          back: "Os principais tipos de texto são: narrativo, descritivo, dissertativo-argumentativo, expositivo, injuntivo e dialogal.",
          difficulty: "Médio"
        },
        {
          id: 3,
          module: "Matemática",
          topic: "Porcentagem",
          front: "Como calcular 15% de 200?",
          back: "15% de 200 = (15/100) × 200 = 0,15 × 200 = 30",
          difficulty: "Fácil"
        },
        {
          id: 4,
          module: "Matemática",
          topic: "Regra de três",
          front: "O que é regra de três composta?",
          back: "Regra de três composta é um método para resolver problemas que envolvem mais de duas grandezas proporcionais, onde precisamos identificar as relações de proporcionalidade direta ou inversa.",
          difficulty: "Difícil"
        },
        {
          id: 5,
          module: "Noções de Informática",
          topic: "Hardware e software",
          front: "Diferença entre hardware e software?",
          back: "Hardware são os componentes físicos do computador (processador, memória, disco). Software são os programas e aplicações que rodam no hardware.",
          difficulty: "Fácil"
        },
        {
          id: 6,
          module: "Raciocínio Lógico",
          topic: "Estruturas lógicas",
          front: "O que é uma proposição lógica?",
          back: "Proposição lógica é uma sentença declarativa que pode ser avaliada como verdadeira (V) ou falsa (F), mas não ambas simultaneamente.",
          difficulty: "Médio"
        },
        {
          id: 7,
          module: "Atualidades",
          topic: "Meio ambiente",
          front: "O que é desenvolvimento sustentável?",
          back: "Desenvolvimento sustentável é o desenvolvimento que satisfaz as necessidades presentes sem comprometer a capacidade das futuras gerações de satisfazer suas próprias necessidades.",
          difficulty: "Médio"
        }
      ]

      const courseTitle = decodeURIComponent(params.id).replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
      
      setCourseData({
        id: params.id,
        title: courseTitle,
        organization: "Comissão de Concurso Público",
        status: "Aberto"
      })
      
      setFlashcards(mockFlashcards)
      setLoading(false)
    }

    loadFlashcards()
  }, [params.id])

  const flipCard = () => {
    setIsFlipped(!isFlipped)
  }

  const nextCard = () => {
    if (currentIndex < flashcards.length - 1) {
      setCurrentIndex(currentIndex + 1)
      setIsFlipped(false)
    }
  }

  const prevCard = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1)
      setIsFlipped(false)
    }
  }

  const markAsStudied = () => {
    setStudiedCards(new Set([...studiedCards, flashcards[currentIndex].id]))
    nextCard()
  }

  const resetProgress = () => {
    setStudiedCards(new Set())
    setCurrentIndex(0)
    setIsFlipped(false)
  }

  const shuffleCards = () => {
    const shuffled = [...flashcards].sort(() => Math.random() - 0.5)
    setFlashcards(shuffled)
    setCurrentIndex(0)
    setIsFlipped(false)
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
          <h1 className="text-2xl font-bold mb-4">Flashcards não encontrados</h1>
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

  const currentCard = flashcards[currentIndex]
  const progress = ((currentIndex + 1) / flashcards.length) * 100
  const studiedCount = studiedCards.size

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <SimpleHeader />
      
      <section className="relative py-20">
        {/* Background Pattern */}
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
              
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setShowStats(!showStats)}
                  className="px-4 py-2 bg-slate-800 rounded-lg hover:bg-slate-700 transition-colors flex items-center gap-2"
                >
                  <Brain className="w-4 h-4" />
                  Estatísticas
                </button>
                <button
                  onClick={resetProgress}
                  className="px-4 py-2 bg-slate-800 rounded-lg hover:bg-slate-700 transition-colors flex items-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  Reiniciar
                </button>
              </div>
            </div>

            <div className="text-center">
              <h1 className="text-3xl md:text-4xl font-bold mb-2 bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                Flashcards Inteligentes
              </h1>
              <p className="text-gray-300">
                {courseData.title} - Gerados por IA baseados no edital
              </p>
            </div>
          </motion.div>

          {/* Statistics */}
          {showStats && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-8 grid grid-cols-1 md:grid-cols-4 gap-4"
            >
              <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 text-center">
                <BookOpen className="w-6 h-6 text-blue-400 mx-auto mb-2" />
                <div className="text-xl font-bold">{flashcards.length}</div>
                <div className="text-sm text-gray-400">Total de Cards</div>
              </div>
              
              <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 text-center">
                <CheckCircle className="w-6 h-6 text-green-400 mx-auto mb-2" />
                <div className="text-xl font-bold">{studiedCount}</div>
                <div className="text-sm text-gray-400">Estudados</div>
              </div>
              
              <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 text-center">
                <Target className="w-6 h-6 text-orange-400 mx-auto mb-2" />
                <div className="text-xl font-bold">{flashcards.length - studiedCount}</div>
                <div className="text-sm text-gray-400">Restantes</div>
              </div>
              
              <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 text-center">
                <TrendingUp className="w-6 h-6 text-purple-400 mx-auto mb-2" />
                <div className="text-xl font-bold">{Math.round((studiedCount / flashcards.length) * 100)}%</div>
                <div className="text-sm text-gray-400">Progresso</div>
              </div>
            </motion.div>
          )}

          {/* Progress Bar */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="mb-8"
          >
            <div className="flex items-center justify-between text-sm mb-2">
              <span>Card {currentIndex + 1} de {flashcards.length}</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div className="w-full bg-slate-700 rounded-full h-2">
              <div 
                className="bg-gradient-to-r from-blue-500 to-purple-500 h-2 rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
          </motion.div>

          {/* Flashcard */}
          {currentCard && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="mb-8"
            >
              <div className="bg-slate-800 rounded-2xl border border-slate-700 p-8">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-4">
                    <span className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded-full text-sm">
                      {currentCard.module}
                    </span>
                    <span className="px-3 py-1 bg-purple-500/20 text-purple-400 rounded-full text-sm">
                      {currentCard.topic}
                    </span>
                    <span className={`px-3 py-1 rounded-full text-sm ${
                      currentCard.difficulty === 'Fácil' ? 'bg-green-500/20 text-green-400' :
                      currentCard.difficulty === 'Médio' ? 'bg-yellow-500/20 text-yellow-400' :
                      'bg-red-500/20 text-red-400'
                    }`}>
                      {currentCard.difficulty}
                    </span>
                  </div>
                  
                  {studiedCards.has(currentCard.id) && (
                    <CheckCircle className="w-6 h-6 text-green-400" />
                  )}
                </div>

                <div 
                  className="min-h-[200px] flex items-center justify-center cursor-pointer"
                  onClick={flipCard}
                >
                  <motion.div
                    animate={{ rotateY: isFlipped ? 180 : 0 }}
                    transition={{ duration: 0.6 }}
                    style={{ transformStyle: 'preserve-3d' }}
                    className="text-center"
                  >
                    {!isFlipped ? (
                      <div>
                        <h3 className="text-xl font-semibold mb-4">Frente</h3>
                        <p className="text-gray-300 text-lg">{currentCard.front}</p>
                      </div>
                    ) : (
                      <div style={{ transform: 'rotateY(180deg)' }}>
                        <h3 className="text-xl font-semibold mb-4">Verso</h3>
                        <p className="text-gray-300 text-lg">{currentCard.back}</p>
                      </div>
                    )}
                  </motion.div>
                </div>

                <div className="mt-6 text-center text-sm text-gray-400">
                  Clique no card para virar
                </div>
              </div>
            </motion.div>
          )}

          {/* Controls */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="flex items-center justify-center gap-4"
          >
            <button
              onClick={prevCard}
              disabled={currentIndex === 0}
              className="px-6 py-3 bg-slate-800 rounded-lg hover:bg-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Anterior
            </button>
            
            <button
              onClick={shuffleCards}
              className="px-6 py-3 bg-purple-500 rounded-lg hover:bg-purple-600 transition-colors"
            >
              Embaralhar
            </button>
            
            <button
              onClick={markAsStudied}
              className="px-6 py-3 bg-green-500 rounded-lg hover:bg-green-600 transition-colors flex items-center gap-2"
            >
              <CheckCircle className="w-4 h-4" />
              Estudado
            </button>
            
            <button
              onClick={nextCard}
              disabled={currentIndex === flashcards.length - 1}
              className="px-6 py-3 bg-slate-800 rounded-lg hover:bg-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Próximo
            </button>
          </motion.div>
        </div>
      </section>

      <Footer />
    </div>
  )
}
