import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase/config'
import { fetchFlashcardsForTopico } from '../services/topicoFlashcardsService'

const SharedFlashcardPIP = () => {
  const params = useParams()
  const [loading, setLoading] = useState(true)
  const [valid, setValid] = useState(false)
  const [expired, setExpired] = useState(false)
  const [flashcards, setFlashcards] = useState([])
  const [error, setError] = useState('')
  const [topicInfo, setTopicInfo] = useState({ disciplina: '', modulo: '' })

  useEffect(() => {
    const loadFlashcards = async () => {
      try {
        const token = params.token
        if (!token) {
          setError('Token inválido')
          setLoading(false)
          return
        }

        console.log('SharedFlashcardPIP: Buscando token no Firestore...', token)
        const shareRef = doc(db, 'sharedFlashcards', token)
        const shareDoc = await getDoc(shareRef)

        if (!shareDoc.exists()) {
          console.log('SharedFlashcardPIP: Token não encontrado')
          setError('Link não encontrado ou expirado')
          setLoading(false)
          return
        }

        const data = shareDoc.data()
        console.log('SharedFlashcardPIP: Dados do token:', data)
        
        // Verificar se está ativo
        if (data.active === false) {
          console.log('SharedFlashcardPIP: Link desativado')
          setError('Este link foi desativado')
          setLoading(false)
          return
        }

        // Verificar se expirou
        if (data.expiresAt) {
          const expiresAt = data.expiresAt.toDate()
          if (expiresAt < new Date()) {
            console.log('SharedFlashcardPIP: Link expirado')
            setExpired(true)
            setLoading(false)
            return
          }
        }

        setValid(true)
        setTopicInfo({ disciplina: data.disciplina, modulo: data.modulo })
        
        // Buscar flashcards
        const cards = await fetchFlashcardsForTopico(
          data.courseId,
          data.disciplina,
          data.modulo,
          data.topicKey
        )
        
        if (cards.length === 0) {
          setError('Nenhum flashcard encontrado')
        } else {
          setFlashcards(cards)
        }

      } catch (err) {
        console.error('Erro ao carregar flashcards:', err)
        setError('Erro ao carregar flashcards')
      } finally {
        setLoading(false)
      }
    }

    loadFlashcards()
  }, [params.token])

  const [currentIndex, setCurrentIndex] = useState(0)
  const [showAnswer, setShowAnswer] = useState(false)
  const [cardColor, setCardColor] = useState('bg-white')
  const [textColor, setTextColor] = useState('text-slate-900')
  const [borderColor, setBorderColor] = useState('border-white')
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [completed, setCompleted] = useState(false)

  const colorOptions = [
    { name: 'Branco Padrão', bg: 'bg-white', text: 'text-slate-900', border: 'border-white' },
    { name: 'Cinza Claro', bg: 'bg-slate-100', text: 'text-slate-900', border: 'border-slate-200' },
    { name: 'Cinza Médio', bg: 'bg-slate-200', text: 'text-slate-900', border: 'border-slate-300' },
    { name: 'Cinza Escuro', bg: 'bg-slate-700', text: 'text-white', border: 'border-slate-600' },
    { name: 'Preto', bg: 'bg-slate-900', text: 'text-white', border: 'border-slate-800' },
    { name: 'Azul Claro', bg: 'bg-blue-50', text: 'text-slate-900', border: 'border-blue-100' },
    { name: 'Azul Escuro', bg: 'bg-blue-900', text: 'text-white', border: 'border-blue-800' },
    { name: 'Verde Claro', bg: 'bg-green-50', text: 'text-slate-900', border: 'border-green-100' },
    { name: 'Verde Escuro', bg: 'bg-green-900', text: 'text-white', border: 'border-green-800' },
    { name: 'Roxo Claro', bg: 'bg-purple-50', text: 'text-slate-900', border: 'border-purple-100' },
    { name: 'Roxo Escuro', bg: 'bg-purple-900', text: 'text-white', border: 'border-purple-800' },
  ]

  // Embaralhar cards ao carregar
  useEffect(() => {
    if (flashcards.length > 0) {
      const shuffled = [...flashcards].sort(() => Math.random() - 0.5)
      setFlashcards(shuffled)
      setCurrentIndex(0)
      setShowAnswer(true)
    }
  }, [flashcards.length > 0])

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-white text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-white border-t-transparent mx-auto mb-4"></div>
          <p>Carregando flashcards...</p>
          {topicInfo.disciplina && (
            <p className="text-sm text-slate-300 mt-2">
              {topicInfo.disciplina} - {topicInfo.modulo}
            </p>
          )}
        </div>
      </div>
    )
  }

  if (expired) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg p-12 text-center max-w-md">
          <h2 className="text-3xl font-bold text-slate-900 mb-4">⏰ Link Expirado</h2>
          {topicInfo.disciplina && (
            <p className="text-lg text-slate-600 mb-4">
              {topicInfo.disciplina} - {topicInfo.modulo}
            </p>
          )}
          <p className="text-xl text-slate-700 mb-6">Este link expirou após 1 hora de uso.</p>
          <p className="text-lg text-slate-600 mb-8">Adquira o curso e tenha acesso completo a todos os flashcards!</p>
          <a
            href="/cursos"
            className="inline-block px-8 py-4 bg-slate-900 text-white rounded-lg font-bold hover:opacity-80 transition"
          >
            Ver Cursos
          </a>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg p-12 text-center max-w-md">
          <h2 className="text-3xl font-bold text-slate-900 mb-4">❌ Erro</h2>
          {topicInfo.disciplina && (
            <p className="text-lg text-slate-600 mb-4">
              {topicInfo.disciplina} - {topicInfo.modulo}
            </p>
          )}
          <p className="text-xl text-slate-700">{error}</p>
        </div>
      </div>
    )
  }

  if (!valid) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg p-12 text-center max-w-md">
          <h2 className="text-3xl font-bold text-slate-900 mb-4">🔒 Link Inválido</h2>
          {topicInfo.disciplina && (
            <p className="text-lg text-slate-600 mb-4">
              {topicInfo.disciplina} - {topicInfo.modulo}
            </p>
          )}
          <p className="text-xl text-slate-700 mb-6">Este link não é válido.</p>
          <p className="text-lg text-slate-600 mb-8">Adquira o curso e tenha acesso completo a todos os flashcards!</p>
          <a
            href="/cursos"
            className="inline-block px-8 py-4 bg-slate-900 text-white rounded-lg font-bold hover:opacity-80 transition"
          >
            Ver Cursos
          </a>
        </div>
      </div>
    )
  }

  if (flashcards.length === 0) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-white text-center">
          <p>Nenhum flashcard encontrado.</p>
        </div>
      </div>
    )
  }

  const currentCard = flashcards[currentIndex]

  const handleNext = () => {
    setShowAnswer(false)
    setTimeout(() => {
      if (currentIndex < flashcards.length - 1) {
        setCurrentIndex(prev => prev + 1)
      } else {
        setCompleted(true)
      }
    }, 300)
  }

  const handleColorChange = (option) => {
    setCardColor(option.bg)
    setTextColor(option.text)
    setBorderColor(option.border)
    setShowColorPicker(false)
  }

  const handleCardClick = () => {
    if (!showAnswer) {
      setShowAnswer(true)
    }
  }

  if (completed) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg p-12 text-center max-w-md">
          <h2 className="text-3xl font-bold text-slate-900 mb-4">🎉 Concluído!</h2>
          <p className="text-xl text-slate-700 mb-2">Você visualizou todos os flashcards.</p>
          <p className="text-slate-600 mb-6">Adquira o curso e tenha acesso completo a todos os flashcards!</p>
          <a
            href="/cursos"
            className="inline-block px-8 py-4 bg-slate-900 text-white rounded-lg font-bold hover:opacity-80 transition"
          >
            Ver Cursos
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4">
      {/* Progress indicator */}
      <div className="fixed top-4 left-4 text-white text-sm font-bold z-50">
        {currentIndex + 1} / {flashcards.length}
      </div>

      {/* Color picker button */}
      <div className="fixed top-4 right-4 z-50 flex gap-2">
        <button
          type="button"
          onClick={() => {
            const query = currentCard.pergunta || currentCard.frente
            const answer = currentCard.resposta || currentCard.verso
            const searchQuery = encodeURIComponent(`${topicInfo.disciplina}/${topicInfo.modulo}/${query}/${answer} esse flashcard está correto e atualizado?`)
            window.open(`https://www.google.com/search?q=${searchQuery}`, '_blank')
          }}
          className="p-3 rounded-lg bg-white text-slate-900 hover:opacity-80 transition"
          title="Pesquisar no Google"
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => setShowColorPicker(!showColorPicker)}
          className="p-3 rounded-lg bg-white text-slate-900 hover:opacity-80 transition"
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
          </svg>
        </button>
        
        {showColorPicker && (
          <div className="absolute top-14 right-0 bg-white rounded-lg shadow-2xl p-3 z-[100] w-64">
            <div className="grid grid-cols-2 gap-2">
              {colorOptions.map((option) => (
                <button
                  key={option.name}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleColorChange(option)
                  }}
                  className={`p-3 rounded-lg ${option.bg} ${option.text} text-xs font-medium hover:opacity-80 transition border border-slate-200`}
                >
                  {option.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Flashcard */}
      <div className="w-full max-w-4xl">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentIndex}
            initial={{ opacity: 0, x: 100 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -100 }}
            transition={{ duration: 0.3 }}
            className="relative"
          >
            <div 
              onClick={handleCardClick}
              className={`${cardColor} rounded-lg p-8 sm:p-12 md:p-16 shadow-2xl border-4 ${borderColor} min-h-[400px] sm:min-h-[500px] md:min-h-[600px] flex flex-col justify-center items-center text-center cursor-pointer`}
            >
              <h2 className={`text-2xl sm:text-3xl md:text-4xl font-bold ${textColor} mb-8 leading-relaxed`}>
                {currentCard.pergunta || currentCard.frente}
              </h2>

              {!showAnswer && (
                <p className={`${textColor === 'text-white' ? 'text-slate-300' : 'text-slate-500'} text-sm`}>Clique para ver a resposta</p>
              )}

              {showAnswer && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className={`mt-8 pt-8 border-t-4 ${textColor === 'text-white' ? 'border-white' : 'border-slate-900'}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className={`text-lg sm:text-xl md:text-2xl font-medium ${textColor === 'text-white' ? 'text-slate-200' : 'text-slate-700'} leading-relaxed mb-8`}>
                    {currentCard.resposta || currentCard.verso}
                  </div>
                  
                  <motion.button
                    type="button"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleNext}
                    className="px-8 py-4 rounded-lg bg-slate-900 text-white font-bold hover:opacity-80 transition"
                  >
                    Próximo
                  </motion.button>
                </motion.div>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* CTA para comprar curso */}
      <div className="mt-8 text-center">
        <p className="text-white text-lg mb-4">Gostou dos flashcards?</p>
        <a
          href="/cursos"
          className="inline-block px-8 py-4 bg-white text-slate-900 rounded-lg font-bold hover:opacity-80 transition"
        >
          Adquira o curso e tenha acesso completo!
        </a>
      </div>
    </div>
  )
}

export default SharedFlashcardPIP
