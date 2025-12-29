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
  }, [isOpen, courses.length, messages.length])

  // Scroll para última mensagem
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
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
        `- ${c.name} (${c.competition || 'Concurso'}) - R$ ${c.price?.toFixed(2) || '99,90'} - Parcelado em até 10x sem juros`
      ).join('\n')

      // Construir histórico da conversa
      const historyText = conversationHistory.map(msg => 
        `${msg.type === 'user' ? 'Usuário' : 'Assistente'}: ${msg.text}`
      ).join('\n')

      // Detectar se mencionou preço caro
      const userLower = userMessage.toLowerCase()
      const isPriceObjection = userLower.includes('caro') || 
                               userLower.includes('caro demais') || 
                               userLower.includes('muito caro') ||
                               userLower.includes('preço') && (userLower.includes('alto') || userLower.includes('caro'))

      const prompt = `Você é um assistente de vendas do FlashConCards, uma plataforma de flashcards para concursos públicos.

CURSOS DISPONÍVEIS:
${coursesList}

REGRAS CRÍTICAS:
- Seja EXTREMAMENTE DIRETO. Máximo 2 linhas por mensagem.
- NUNCA faça textões. Seja conciso e objetivo.
- Se o usuário mencionar um concurso, identifique qual curso corresponde.
- Se o usuário disser que está caro ou mencionar preço alto:
  * Mencione que pode parcelar em até 10x sem juros
  * Enfatize que é um investimento na aprovação
  * Seja persuasivo mas respeitoso
- Se o usuário demonstrar interesse em comprar, incentive a compra.
- Se não encontrar curso específico mas o usuário quiser comprar, sugira falar no WhatsApp.

HISTÓRICO DA CONVERSA:
${historyText}

ÚLTIMA MENSAGEM DO USUÁRIO: ${userMessage}
${isPriceObjection ? '\nATENÇÃO: O usuário está reclamando do preço. Seja persuasivo sobre parcelamento e investimento na aprovação.' : ''}

Responda de forma CURTA (máximo 2 linhas) e PERSUASIVA.`

      const result = await model.generateContent(prompt)
      const response = result.response.text()
      
      // Limpar resposta (remover markdown, etc)
      return response.trim().replace(/```[\s\S]*?```/g, '').trim().split('\n').slice(0, 2).join('\n')
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
    const currentInput = inputValue
    setInputValue('')
    setSending(true)

    // Detectar se mencionou um concurso
    const inputLower = currentInput.toLowerCase()
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
      const aiResponse = await getAIResponse(currentInput, messages)
      
      // Detectar se a resposta da IA menciona interesse em comprar
      const aiResponseLower = aiResponse.toLowerCase()
      const showsInterest = inputLower.includes('comprar') || 
                           inputLower.includes('quero') || 
                           inputLower.includes('interessado') ||
                           inputLower.includes('vou comprar') ||
                           inputLower.includes('quanto custa') ||
                           aiResponseLower.includes('comprar') ||
                           aiResponseLower.includes('curso')
      
      const botMessage = {
        type: 'bot',
        text: aiResponse,
        timestamp: new Date(),
        course: mentionedCourse || userCompetition,
        showButton: showsInterest
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
    const targetCourse = course || userCompetition
    
    if (targetCourse) {
      navigate(`/curso/${targetCourse.id}`)
    } else if (article?.courseLink) {
      window.open(article.courseLink, '_blank')
    } else {
      navigate('/')
    }
    setIsOpen(false)
  }

  const handleWhatsAppClick = () => {
    const whatsappNumber = '5562981841878'
    const message = encodeURIComponent('Olá! Gostaria de saber mais sobre os cursos disponíveis.')
    window.open(`https://wa.me/${whatsappNumber}?text=${message}`, '_blank')
    setIsOpen(false)
  }

  const formatTime = (date) => {
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  }

  if (courses.length === 0) {
    return null
  }

  return (
    <div style={{ width: '100%', marginTop: '24px', position: 'static', display: 'block' }}>
      <div style={{ display: 'flex', flexDirection: 'column', position: 'static', width: '100%' }}>
        {/* Botão flutuante */}
        {!isOpen && (
          <button
            onClick={() => setIsOpen(true)}
            style={{
              position: 'static',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '12px 16px',
              background: 'linear-gradient(to right, #2563eb, #4f46e5)',
              color: 'white',
              borderRadius: '12px',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.3s',
              width: '100%',
              fontWeight: 'bold',
              fontSize: '14px'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)'
              e.currentTarget.style.boxShadow = '0 6px 16px rgba(59, 130, 246, 0.4)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)'
            }}
            aria-label="Abrir chat"
          >
            <ChatBubbleLeftRightIcon className="h-5 w-5" />
            <span>Falar com IA</span>
          </button>
        )}

        {/* Chat Window */}
        {isOpen && (
          <div
            style={{
              position: 'static',
              display: 'flex',
              flexDirection: 'column',
              width: '100%',
              height: '500px',
              maxHeight: '500px',
              backgroundColor: 'white',
              borderRadius: '12px',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
              border: '2px solid #bfdbfe',
              overflow: 'hidden'
            }}
            className="dark:bg-slate-800 dark:border-blue-700"
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
                      {msg.showButton && (
                        <>
                          {(msg.course || userCompetition) ? (
                            <button
                              onClick={() => handleBuyClick(msg.course || userCompetition)}
                              className="mt-3 w-full bg-gradient-to-r from-green-500 to-green-600 text-white font-bold py-2 px-4 rounded-lg hover:from-green-600 hover:to-green-700 transition shadow-lg text-sm"
                            >
                              💳 Ver Curso - 10x sem juros
                            </button>
                          ) : (
                            <button
                              onClick={handleWhatsAppClick}
                              className="mt-3 w-full bg-gradient-to-r from-green-500 to-green-600 text-white font-bold py-2 px-4 rounded-lg hover:from-green-600 hover:to-green-700 transition shadow-lg text-sm"
                            >
                              💬 Falar no WhatsApp
                            </button>
                          )}
                        </>
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
            </div>
          )}
      </div>
    </div>
  )
}

export default SalesChatbot
