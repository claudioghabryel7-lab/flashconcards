import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChatBubbleLeftRightIcon, XMarkIcon, PaperAirplaneIcon } from '@heroicons/react/24/outline'
import { motion, AnimatePresence } from 'framer-motion'

const ATTENDANTS = [
  'Ana Silva',
  'Carlos Santos',
  'Mariana Costa',
  'João Oliveira',
  'Patricia Lima'
]

const SalesChatbot = ({ article, courses = [] }) => {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [inputValue, setInputValue] = useState('')
  const [currentAttendant, setCurrentAttendant] = useState('')
  const messagesEndRef = useRef(null)
  const navigate = useNavigate()

  // Selecionar atendente aleatório ao abrir
  useEffect(() => {
    if (isOpen && !currentAttendant) {
      const randomAttendant = ATTENDANTS[Math.floor(Math.random() * ATTENDANTS.length)]
      setCurrentAttendant(randomAttendant)
      
      // Mensagem inicial após 1 segundo
      setTimeout(() => {
        const course = courses[0] || null
        const competitionName = article?.concursoData?.concursoName || article?.concursoData?.orgao || 'este concurso'
        
        const initialMessage = {
          type: 'bot',
          text: `Olá! 👋 Eu sou ${randomAttendant}, atendente de plantão do FlashConCards! 🎓\n\nVi que você está lendo sobre ${competitionName}. Que tal conhecer nosso curso preparatório completo?`,
          timestamp: new Date()
        }
        setMessages([initialMessage])
        
        // Segunda mensagem com informações do curso
        setTimeout(() => {
          if (course) {
            const monthlyPrice = ((course.price || 99.90) / 10).toFixed(2)
            const courseInfo = {
              type: 'bot',
              text: `📚 **${course.name}**\n\n${course.description || 'Curso completo com flashcards interativos, questões comentadas e simulados.'}\n\n💰 Investimento: R$ ${course.price?.toFixed(2) || '99,90'}\n💳 Parcelamento em até 10x de R$ ${monthlyPrice} sem juros!\n\n✅ Flashcards interativos\n✅ Questões comentadas\n✅ Simulados completos\n✅ Assistente de IA 24/7\n\nQuer saber mais detalhes? 😊`,
              timestamp: new Date(),
              course: course
            }
            setMessages(prev => [...prev, courseInfo])
          }
        }, 2000)
      }, 1000)
    }
  }, [isOpen, currentAttendant, courses, article])

  // Scroll para última mensagem
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Detectar objeções e responder
  const handleSendMessage = () => {
    if (!inputValue.trim()) return

    const userMessage = {
      type: 'user',
      text: inputValue,
      timestamp: new Date()
    }

    setMessages(prev => [...prev, userMessage])
    setInputValue('')

    // Processar resposta após 1 segundo
    setTimeout(() => {
      const response = generateResponse(inputValue.toLowerCase(), courses[0])
      setMessages(prev => [...prev, response])
    }, 1000)
  }

  const generateResponse = (userInput, course) => {
    const courseName = course?.name || 'nosso curso'
    const coursePrice = course?.price || 99.90
    const monthlyPrice = (coursePrice / 10).toFixed(2)

    // Detectar objeções de preço
    if (userInput.includes('caro') || userInput.includes('preço') || userInput.includes('valor') || userInput.includes('custa') || userInput.includes('dinheiro')) {
      return {
        type: 'bot',
        text: `Entendo sua preocupação! 😊 Mas pense bem: este é um **investimento na sua aprovação**! 🎯\n\n💡 Você pode parcelar em **até 10x de R$ ${monthlyPrice}** sem juros!\n\n📊 Compare: um curso presencial custa muito mais e você não tem a flexibilidade de estudar quando e onde quiser.\n\n✅ Com o FlashConCards você tem:\n• Flashcards interativos\n• Questões comentadas\n• Simulados completos\n• Assistente de IA 24/7\n• Acesso vitalício após aprovação\n\n💰 R$ ${coursePrice.toFixed(2)} dividido em 10x = menos de R$ ${monthlyPrice} por mês! É menos que um café por dia! ☕\n\nQuer garantir sua aprovação? 🚀`,
        timestamp: new Date(),
        course: course
      }
    }

    // Detectar interesse em comprar
    if (userInput.includes('comprar') || userInput.includes('quero') || userInput.includes('interessado') || userInput.includes('sim') || userInput.includes('ok') || userInput.includes('vou comprar') || userInput.includes('feito')) {
      return {
        type: 'bot',
        text: `Excelente escolha! 🎉 Você está no caminho certo para sua aprovação! 🏆\n\nClique no botão abaixo para finalizar sua compra de forma segura:\n\n💳 Aceitamos cartão de crédito (até 10x sem juros)\n💵 PIX com desconto\n📱 Pagamento 100% seguro\n✅ Acesso imediato após pagamento\n\nVou te acompanhar até o final! 😊`,
        timestamp: new Date(),
        course: course,
        showButton: true
      }
    }

    // Detectar dúvidas sobre o curso
    if (userInput.includes('curso') || userInput.includes('conteúdo') || userInput.includes('o que') || userInput.includes('tem') || userInput.includes('inclui')) {
      return {
        type: 'bot',
        text: `Ótima pergunta! 📚 O **${courseName}** inclui:\n\n✅ **Flashcards Interativos** - Sistema de repetição espaçada (SRS) que adapta ao seu ritmo\n✅ **FlashQuestões** - Questões geradas por IA no estilo das principais bancas\n✅ **Simulados Completos** - Teste seus conhecimentos antes da prova\n✅ **Flash Mentor** - Assistente de IA que responde suas dúvidas 24/7\n✅ **Bot "Como Estudar?"** - Guia personalizado de estudos\n✅ **Progresso Completo** - Acompanhe seu desempenho com estatísticas\n✅ **Calendário de Estudos** - Organize sua rotina\n✅ **Acesso Vitalício** - Estude no seu ritmo, sem pressa!\n\nTudo isso por apenas R$ ${coursePrice.toFixed(2)} parcelado em até 10x! 💰\n\nQuer garantir sua vaga? 🎯`,
        timestamp: new Date(),
        course: course
      }
    }

    // Detectar dúvidas sobre garantia/confiança
    if (userInput.includes('garantia') || userInput.includes('confiança') || userInput.includes('seguro') || userInput.includes('funciona')) {
      return {
        type: 'bot',
        text: `Fico feliz que você queira se certificar! 😊\n\n✅ **Pagamento 100% Seguro** - Processado pelo Mercado Pago\n✅ **Acesso Imediato** - Após a compra, você já pode começar\n✅ **Suporte Completo** - Estamos aqui para ajudar você\n✅ **Milhares de Aprovados** - Nossa metodologia funciona!\n\n💡 Além disso, você pode parcelar em até 10x sem juros, então o investimento fica super acessível!\n\nNão perca esta oportunidade de garantir sua aprovação! 🚀`,
        timestamp: new Date(),
        course: course
      }
    }

    // Detectar hesitação/tempo
    if (userInput.includes('depois') || userInput.includes('pensar') || userInput.includes('talvez') || userInput.includes('ver') || userInput.includes('considerar')) {
      return {
        type: 'bot',
        text: `Entendo que você quer pensar bem! 😊 Mas não deixe passar esta oportunidade! ⏰\n\n🎯 **O concurso não espera** - Quanto antes você começar, melhor!\n💰 **Parcelamento em 10x** - Não precisa pagar tudo de uma vez\n📚 **Acesso Imediato** - Comece a estudar hoje mesmo\n🏆 **Sua aprovação vale muito mais** que este investimento!\n\n💡 Pense assim: R$ ${monthlyPrice} por mês é um investimento pequeno comparado ao salário que você vai receber após a aprovação!\n\nQue tal garantir agora? 😉`,
        timestamp: new Date(),
        course: course
      }
    }

    // Resposta padrão persuasiva
    return {
      type: 'bot',
      text: `Ótimo! 😊 Deixa eu te mostrar por que o **${courseName}** é a melhor escolha para sua aprovação! 🎓\n\n💡 Com nosso curso você tem:\n• Flashcards interativos com IA\n• Questões comentadas\n• Simulados completos\n• Assistente 24/7\n• Acesso vitalício\n\n💰 E o melhor: apenas R$ ${coursePrice.toFixed(2)} parcelado em **até 10x sem juros**!\n\nÉ um investimento na sua carreira! 🚀 Quer saber mais detalhes ou já está pronto para garantir sua vaga? 😉`,
      timestamp: new Date(),
      course: course
    }
  }

  const handleBuyClick = () => {
    // Priorizar courseLink do artigo se disponível
    if (article?.courseLink) {
      window.open(article.courseLink, '_blank')
    } else if (courses[0]) {
      navigate(`/pagamento?course=${courses[0].id}`)
    } else {
      navigate('/pagamento')
    }
    setIsOpen(false)
  }

  const formatTime = (date) => {
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  }

  if (!courses || courses.length === 0) {
    return null // Não mostrar chatbot se não houver cursos
  }

  return (
    <>
      {/* Botão flutuante */}
      {!isOpen && (
        <motion.button
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-50 bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-4 rounded-full shadow-2xl hover:shadow-blue-500/50 transition-all duration-300 flex items-center gap-2 group"
          aria-label="Abrir chat de vendas"
        >
          <ChatBubbleLeftRightIcon className="h-6 w-6" />
          <span className="hidden sm:block font-bold text-sm">Falar com Atendente</span>
          <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full h-6 w-6 flex items-center justify-center animate-pulse">
            !
          </span>
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
                  <div className="font-bold text-sm">{currentAttendant || 'Atendente'}</div>
                  <div className="text-xs text-blue-100">Atendente de plantão</div>
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
                    className={`max-w-[80%] rounded-2xl p-3 ${
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
                      <button
                        onClick={handleBuyClick}
                        className="mt-3 w-full bg-gradient-to-r from-green-500 to-green-600 text-white font-bold py-2 px-4 rounded-lg hover:from-green-600 hover:to-green-700 transition shadow-lg"
                      >
                        💳 Comprar Agora - Parcelado em 10x
                      </button>
                    )}
                  </div>
                </motion.div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                  placeholder="Digite sua mensagem..."
                  className="flex-1 px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-700 dark:text-white"
                />
                <button
                  onClick={handleSendMessage}
                  className="bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700 transition"
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

