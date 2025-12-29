import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChatBubbleLeftRightIcon, XMarkIcon, PaperAirplaneIcon } from '@heroicons/react/24/outline'
import { motion, AnimatePresence } from 'framer-motion'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { collection, query, where, getDocs } from 'firebase/firestore'
import { db } from '../firebase/config'

const SalesChatbot = ({ article }) => {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [inputValue, setInputValue] = useState('')
  const [sending, setSending] = useState(false)
  const [courses, setCourses] = useState([])
  const [userCompetition, setUserCompetition] = useState(null)
  const messagesEndRef = useRef(null)
  const navigate = useNavigate()

  // Carregar cursos ativos
  useEffect(() => {
    const loadCourses = async () => {
      try {
        const coursesRef = collection(db, 'courses')
        const q = query(coursesRef, where('active', '==', true))
        const snapshot = await getDocs(q)
        const coursesData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }))
        setCourses(coursesData)
      } catch (err) {
        console.error('Erro ao carregar cursos:', err)
      }
    }
    loadCourses()
  }, [])

  // Abrir automaticamente após 3 segundos
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsOpen(true)
    }, 3000)

    return () => clearTimeout(timer)
  }, [])

  // Mensagem inicial quando abre
  useEffect(() => {
    if (isOpen && messages.length === 0 && courses.length > 0) {
      const initialMessage = {
        type: 'bot',
        text: 'Olá! 👋 Qual concurso você está se preparando?',
        timestamp: new Date()
      }
      setMessages([initialMessage])
    }
  }, [isOpen, courses.length])

  // Scroll para última mensagem
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Gerar resposta com IA
  const getAIResponse = async (userMessage, conversationHistory) => {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY
    
    if (!apiKey) {
      return 'Desculpe, estou com problemas técnicos. Tente novamente mais tarde.'
    }

    try {
      const genAI = new GoogleGenerativeAI(apiKey)
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' })

      // Formatar cursos para o prompt
      const coursesList = courses.map(c => 
        `- ${c.name} (${c.competition || 'Concurso'}) - R$ ${c.price?.toFixed(2) || '99,90'} - Parcelado em até 10x`
      ).join('\n')

      // Construir histórico da conversa
      const historyText = conversationHistory.map(msg => 
        `${msg.type === 'user' ? 'Usuário' : 'Assistente'}: ${msg.text}`
      ).join('\n')

      const prompt = `Você é um assistente de vendas do FlashConCards, uma plataforma de flashcards para concursos públicos.

CURSOS DISPONÍVEIS:
${coursesList}

REGRAS IMPORTANTES:
- Seja DIRETO e OBJETIVO. Frases curtas, máximo 2 linhas por mensagem.
- NUNCA faça textões. Seja conciso.
- Se o usuário mencionar um concurso, identifique qual curso corresponde.
- Sempre mencione o parcelamento em 10x sem juros.
- Se perguntarem sobre preço, enfatize que é um investimento na aprovação.
- Se o usuário quiser comprar, direcione para a página de pagamento.

HISTÓRICO DA CONVERSA:
${historyText}

ÚLTIMA MENSAGEM DO USUÁRIO: ${userMessage}

Responda de forma CURTA e PERSUASIVA (máximo 2 linhas). Se o usuário mencionou um concurso, identifique o curso correspondente e fale sobre ele.`

      const result = await model.generateContent(prompt)
      const response = result.response.text()
      
      // Limpar resposta (remover markdown, etc)
      return response.trim().replace(/```[\s\S]*?```/g, '').trim()
    } catch (error) {
      console.error('Erro ao chamar IA:', error)
      return 'Desculpe, tive um problema. Pode repetir?'
    }
  }

  const handleSendMessage = async () => {
    if (!inputValue.trim() || sending) return

    const userMessage = {
      type: 'user',
      text: inputValue,
      timestamp: new Date()
    }

    setMessages(prev => [...prev, userMessage])
    setInputValue('')
    setSending(true)

    // Detectar se mencionou um concurso
    const inputLower = inputValue.toLowerCase()
    const mentionedCourse = courses.find(c => {
      const courseName = (c.name || '').toLowerCase()
      const competition = (c.competition || '').toLowerCase()
      return inputLower.includes(courseName) || 
             inputLower.includes(competition) ||
             courseName.includes(inputLower) ||
             competition.includes(inputLower)
    })

    if (mentionedCourse && !userCompetition) {
      setUserCompetition(mentionedCourse)
    }

    // Gerar resposta com IA
    try {
      const aiResponse = await getAIResponse(inputValue, messages)
      
      const botMessage = {
        type: 'bot',
        text: aiResponse,
        timestamp: new Date(),
        course: mentionedCourse || userCompetition
      }

      // Se mencionou interesse em comprar ou curso específico, adicionar botão
      if (inputLower.includes('comprar') || 
          inputLower.includes('quero') || 
          inputLower.includes('interessado') ||
          mentionedCourse) {
        botMessage.showButton = true
      }

      setMessages(prev => [...prev, botMessage])
    } catch (error) {
      console.error('Erro ao gerar resposta:', error)
      const errorMessage = {
        type: 'bot',
        text: 'Desculpe, tive um problema. Pode repetir?',
        timestamp: new Date()
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setSending(false)
    }
  }

  const handleBuyClick = (course) => {
    if (course) {
      navigate(`/pagamento?course=${course.id}`)
    } else if (userCompetition) {
      navigate(`/pagamento?course=${userCompetition.id}`)
    } else if (article?.courseLink) {
      window.open(article.courseLink, '_blank')
    } else {
      navigate('/pagamento')
    }
    setIsOpen(false)
  }

  const formatTime = (date) => {
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  }

  if (courses.length === 0) {
    return null
  }

  return (
    <>
      {/* Botão flutuante - posicionado de forma acessível */}
      {!isOpen && (
        <motion.button
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => setIsOpen(true)}
          className="fixed bottom-20 right-6 z-50 bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-4 rounded-full shadow-2xl hover:shadow-blue-500/50 transition-all duration-300 flex items-center gap-2"
          style={{ position: 'fixed' }}
          aria-label="Abrir chat"
        >
          <ChatBubbleLeftRightIcon className="h-6 w-6" />
          <span className="hidden sm:block font-bold text-sm">Falar com IA</span>
        </motion.button>
      )}

      {/* Chat Window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className="fixed bottom-6 right-6 z-50 w-96 max-w-[calc(100vw-2rem)] h-[600px] max-h-[calc(100vh-8rem)] bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border-2 border-blue-200 dark:border-blue-700 flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center">
                  <ChatBubbleLeftRightIcon className="h-6 w-6" />
                </div>
                <div>
                  <div className="font-bold text-sm">Assistente IA</div>
                  <div className="text-xs text-blue-100">FlashConCards</div>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 hover:bg-white/20 rounded-lg transition"
                aria-label="Fechar chat"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50 dark:bg-slate-900">
              {messages.map((msg, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl p-3 ${
                      msg.type === 'user'
                        ? 'bg-blue-600 text-white'
                        : 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-600'
                    }`}
                  >
                    <div className="text-sm whitespace-pre-line">{msg.text}</div>
                    <div className={`text-xs mt-1 ${msg.type === 'user' ? 'text-blue-100' : 'text-slate-500 dark:text-slate-400'}`}>
                      {formatTime(msg.timestamp)}
                    </div>
                    {msg.showButton && (msg.course || userCompetition) && (
                      <button
                        onClick={() => handleBuyClick(msg.course || userCompetition)}
                        className="mt-3 w-full bg-gradient-to-r from-green-500 to-green-600 text-white font-bold py-2 px-4 rounded-lg hover:from-green-600 hover:to-green-700 transition shadow-lg text-sm"
                      >
                        💳 Comprar Agora - 10x sem juros
                      </button>
                    )}
                  </div>
                </motion.div>
              ))}
              {sending && (
                <div className="flex justify-start">
                  <div className="bg-white dark:bg-slate-700 rounded-2xl p-3 border border-slate-200 dark:border-slate-600">
                    <div className="flex gap-1">
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
                  placeholder="Digite sua mensagem..."
                  disabled={sending}
                  className="flex-1 px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-700 dark:text-white disabled:opacity-50"
                />
                <button
                  onClick={handleSendMessage}
                  disabled={sending || !inputValue.trim()}
                  className="bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="Enviar mensagem"
                >
                  <PaperAirplaneIcon className="h-5 w-5" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

export default SalesChatbot
