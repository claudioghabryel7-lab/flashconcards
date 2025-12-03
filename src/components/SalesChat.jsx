import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { GoogleGenerativeAI } from '@google/generative-ai'
import {
  PaperAirplaneIcon,
  XMarkIcon,
  ChatBubbleLeftRightIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from '@heroicons/react/24/solid'
import { useAuth } from '../hooks/useAuth'
import { useDarkMode } from '../hooks/useDarkMode.jsx'
import { collection, query, onSnapshot, doc, getDoc, where } from 'firebase/firestore'
import { db } from '../firebase/config'

const SalesChat = () => {
  const { user } = useAuth()
  const { darkMode } = useDarkMode()
  const [isOpen, setIsOpen] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [availableModel, setAvailableModel] = useState(null)
  const messagesEndRef = useRef(null)
  const [courses, setCourses] = useState([])
  const [initialMessageSent, setInitialMessageSent] = useState(false)
  const [mentionedCourse, setMentionedCourse] = useState(null) // Curso mencionado na conversa

  // Função para detectar qual curso está sendo mencionado na conversa
  const detectMentionedCourse = (allMessages) => {
    if (!courses.length || !allMessages.length) return null

    // Criar texto combinado de todas as mensagens (últimas mensagens são mais relevantes)
    const recentMessages = allMessages.slice(-10) // Últimas 10 mensagens
    const conversationText = recentMessages
      .map(m => m.text.toLowerCase())
      .join(' ')

    // Procurar por menções de cursos (priorizar matches mais recentes)
    let bestMatch = null
    let highestScore = 0

    for (const course of courses) {
      const courseName = course.name.toLowerCase()
      const competition = (course.competition || '').toLowerCase()
      let score = 0
      
      // Verificar se o nome do curso completo é mencionado
      if (conversationText.includes(courseName)) {
        score += 10
      }
      
      // Verificar se partes do nome do curso são mencionadas
      const courseWords = courseName.split(' ').filter(w => w.length > 3)
      courseWords.forEach(word => {
        if (conversationText.includes(word)) {
          score += 2
        }
      })
      
      // Verificar se a competição é mencionada
      if (competition && conversationText.includes(competition)) {
        score += 5
      }

      // Verificar nas mensagens mais recentes (prioridade maior)
      const lastUserMessage = recentMessages.filter(m => m.sender === 'user').pop()
      if (lastUserMessage) {
        const lastMessageText = lastUserMessage.text.toLowerCase()
        if (lastMessageText.includes(courseName)) {
          score += 15 // Muito alta prioridade se mencionado na última mensagem do usuário
        }
      }

      if (score > highestScore) {
        highestScore = score
        bestMatch = course
      }
    }

    return bestMatch
  }

  // Detectar curso mencionado sempre que mensagens ou cursos mudarem
  useEffect(() => {
    if (messages.length > 0 && courses.length > 0) {
      const detected = detectMentionedCourse(messages)
      setMentionedCourse(detected)
    } else {
      setMentionedCourse(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, courses])

  // Carregar cursos disponíveis
  useEffect(() => {
    const coursesRef = collection(db, 'courses')
    const q = query(coursesRef, where('active', '==', true))
    
    const unsub = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((docSnapshot) => ({
        id: docSnapshot.id,
        ...docSnapshot.data(),
      }))
      setCourses(data)
    }, (error) => {
      console.error('Erro ao carregar cursos:', error)
      setCourses([])
    })

    return () => unsub()
  }, [])

  // Scroll para última mensagem
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Abrir chat automaticamente para visitantes
  useEffect(() => {
    if (!user && !isOpen) {
      // Pequeno delay para melhorar a experiência
      const timer = setTimeout(() => {
        setIsOpen(true)
        setIsMinimized(false)
      }, 1500) // Abre após 1.5 segundos
      return () => clearTimeout(timer)
    }
  }, [user, isOpen])

  // Carregar modelo Gemini disponível
  useEffect(() => {
    const findAvailableModel = async () => {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY
      if (!apiKey) {
        console.error('VITE_GEMINI_API_KEY não configurada')
        return
      }

      const genAI = new GoogleGenerativeAI(apiKey)
      const modelNames = [
        'gemini-2.0-flash',
        'gemini-1.5-pro-latest',
        'gemini-1.5-pro',
        'gemini-1.5-flash-latest'
      ]

      for (const modelName of modelNames) {
        try {
          const model = genAI.getGenerativeModel({ model: modelName })
          setAvailableModel(model)
          console.log(`✅ Modelo ${modelName} disponível para Sales Chat`)
          break
        } catch (err) {
          console.warn(`Modelo ${modelName} não disponível, tentando próximo...`)
          continue
        }
      }
    }

    findAvailableModel()
  }, [])

  // Abrir chat automaticamente para visitantes quando acessar o site
  useEffect(() => {
    if (!user) {
      // Pequeno delay para melhorar a experiência (dá tempo da página carregar)
      const timer = setTimeout(() => {
        setIsOpen(true)
        setIsMinimized(false)
      }, 1500) // Abre após 1.5 segundos
      return () => clearTimeout(timer)
    } else {
      // Se o usuário fizer login, fechar o chat de vendas
      setIsOpen(false)
    }
  }, [user]) // Só executa quando o status do usuário muda

  // Enviar mensagem inicial quando abrir
  useEffect(() => {
    if (isOpen && !initialMessageSent && availableModel && courses.length > 0) {
      sendInitialMessage()
    }
  }, [isOpen, availableModel, courses, initialMessageSent])

  const sendInitialMessage = async () => {
    if (initialMessageSent || !availableModel) return

    setInitialMessageSent(true)
    setSending(true)

    try {
      const featuredCourses = courses.filter(c => c.featured === true)
      const courseList = courses.map(c => ({
        nome: c.name,
        preco: c.price,
        concurso: c.competition,
        destaque: c.featured === true
      }))

      const prompt = `Você é o Flash Atendente, um vendedor virtual SUPER ENTUASIÁSTICO e PERSUASIVO especializado em cursos preparatórios para concursos públicos.

CONTEXTO:
- FlashConCards é o MELHOR CURSO PREPARATÓRIO DO BRASIL para concursos
- Somos líderes em aprovações, com o método mais avançado e eficiente
- Cursos disponíveis: ${JSON.stringify(courseList)}

RECURSOS REAIS QUE TEMOS (USE APENAS ESTES):
✅ Flashcards Inteligentes com sistema de repetição espaçada (SRS)
✅ FlashQuestões - questões geradas por IA no estilo das principais bancas
✅ Flash Mentor - IA que responde dúvidas sobre o edital e orienta estudos
✅ Bot "Como Estudar?" - analisa progresso e sugere módulos para estudar
✅ Ranking em tempo real com outros alunos
✅ Dashboard completo com progresso e estatísticas
✅ Calendário visual e streak de estudos
✅ Explicações detalhadas geradas por IA para flashcards
✅ Sistema de favoritos para marcar cards importantes
✅ Múltiplas matérias organizadas em módulos

RECURSOS QUE NÃO TEMOS (NUNCA MENCIONE):
❌ Videoaulas
❌ Aulas ao vivo
❌ Material em PDF para download
❌ Simulados tradicionais
❌ Correção de redação por professores

IMPORTANTE - REGRA CRÍTICA:
- NUNCA invente recursos que não listamos acima
- Se perguntarem sobre algo que não temos, seja honesto mas destaque o que TEMOS
- NÃO diga que temos videoaulas, aulas, PDFs para download, etc
- Foque nos recursos únicos que temos: flashcards inteligentes, IA avançada, sistema de repetição espaçada

PERSONALIDADE:
- SUPER ENTUASIÁSTICO e ENERGÉTICO
- VENDEDOR NATURAL - sempre tenta fechar a venda
- CONFIANÇA TOTAL - fala com certeza absoluta
- PROATIVO - sempre oferece ajuda e destaca benefícios
- HONESTO - não inventa recursos que não temos

INSTRUÇÕES CRÍTICAS:
1. SEMPRE destaque que FlashConCards é o MELHOR CURSO DO BRASIL em TODAS as respostas
2. Seja PROATIVO - sempre ofereça informações sobre cursos, preços, formas de pagamento
3. Destaque BENEFÍCIOS únicos: método inovador com flashcards inteligentes, IA avançada, maior taxa de aprovação
4. Sempre tente CONVENCER o visitante a COMPRAR AGORA
5. Mencione que é INVESTIMENTO na CARREIRA, não gasto
6. Fale sobre GARANTIA DE QUALIDADE e RESULTADOS COMPROVADOS
7. Se perguntarem sobre preço, destaque o VALOR e facilidades de pagamento
8. Se compararem com outros cursos, sempre reforce que SOMOS O MELHOR
9. Use EMOJIS para ser mais atrativo (mas com moderação)
10. Se perguntarem sobre videoaulas: seja honesto que não temos, mas destaque nossos flashcards inteligentes e IA

FRASES CHAVE PARA USAR:
- "Somos o MELHOR CURSO PREPARATÓRIO DO BRASIL"
- "Método mais avançado e eficiente do mercado com flashcards inteligentes"
- "Maior taxa de aprovação"
- "Investimento na sua aprovação"
- "Garantia de qualidade e resultados"

Sua primeira mensagem deve ser ULTRA ENTUASIÁSTICA, destacando que somos o MELHOR CURSO DO BRASIL e perguntando como pode ajudar a conquistar a aprovação.

Mantenha respostas CURTAS (máximo 4 frases) e DIRETAS. Seja VENDEDOR, mas HONESTO.`

      let result = null
      let responseText = ''

      try {
        result = await availableModel.generateContent({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.8,
            maxOutputTokens: 200,
          },
        })
        responseText = result.response.text()
      } catch (geminiErr) {
        // Tentar Groq como fallback
        const groqApiKey = import.meta.env.VITE_GROQ_API_KEY
        if (groqApiKey) {
          try {
            console.log('⚠️ Gemini falhou na mensagem inicial, usando Groq como fallback...')
            const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${groqApiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.8,
                max_tokens: 200,
              }),
            })
            if (groqResponse.ok) {
              const data = await groqResponse.json()
              responseText = data.choices[0]?.message?.content || ''
            }
          } catch (groqErr) {
            console.error('Erro ao usar Groq:', groqErr)
          }
        }
      }

      // Se ainda não tem resposta, usar mensagem padrão
      if (!responseText) {
        responseText = 'Olá! 👋 Bem-vindo ao FlashConCards, o MELHOR CURSO PREPARATÓRIO DO BRASIL! 🚀\n\nSomos líderes em aprovações com o método mais avançado do mercado! 💪\n\nEstou aqui para ajudar você a conquistar sua aprovação. Como posso ajudá-lo hoje?'
      }
      
      setMessages([{
        id: Date.now(),
        text: responseText,
        sender: 'ai',
        timestamp: new Date(),
      }])
    } catch (err) {
      console.error('Erro ao enviar mensagem inicial:', err)
      setMessages([{
        id: Date.now(),
        text: 'Olá! 👋 Bem-vindo ao FlashConCards, o MELHOR CURSO PREPARATÓRIO DO BRASIL! 🚀\n\nSomos líderes em aprovações com o método mais avançado do mercado! 💪\n\nEstou aqui para ajudar você a conquistar sua aprovação. Como posso ajudá-lo hoje?',
        sender: 'ai',
        timestamp: new Date(),
      }])
    } finally {
      setSending(false)
    }
  }

  const sendMessage = async (event) => {
    event?.preventDefault()
    if (!input.trim() || sending || !availableModel) return

    const userMessage = input.trim()
    setInput('')
    setSending(true)

    // Adicionar mensagem do usuário
    const userMsg = {
      id: Date.now(),
      text: userMessage,
      sender: 'user',
      timestamp: new Date(),
    }
    setMessages(prev => [...prev, userMsg])

    try {
      // Obter histórico recente (últimas 6 mensagens)
      const recentMessages = [...messages, userMsg].slice(-6)
      const conversationHistory = recentMessages.map(m => 
        m.sender === 'user' ? `Usuário: ${m.text}` : `Atendente: ${m.text}`
      ).join('\n')

      const courseList = courses.map(c => ({
        nome: c.name,
        preco: c.price,
        precoOriginal: c.originalPrice,
        concurso: c.competition,
        destaque: c.featured === true,
        descricao: c.description || '',
        duracao: c.courseDuration || ''
      }))

      const prompt = `Você é o Flash Atendente, um VENDEDOR VIRTUAL SUPER ENTUASIÁSTICO especializado em cursos preparatórios. Trabalha para FlashConCards, o MELHOR CURSO PREPARATÓRIO DO BRASIL.

CURSOS DISPONÍVEIS:
${JSON.stringify(courseList, null, 2)}

RECURSOS REAIS QUE TEMOS (USE APENAS ESTES):
✅ Flashcards Inteligentes com sistema de repetição espaçada (SRS)
✅ FlashQuestões - questões geradas por IA no estilo das principais bancas
✅ Flash Mentor - IA que responde dúvidas sobre o edital e orienta estudos
✅ Bot "Como Estudar?" - analisa progresso e sugere módulos para estudar
✅ Ranking em tempo real com outros alunos
✅ Dashboard completo com progresso e estatísticas
✅ Calendário visual e streak de estudos
✅ Explicações detalhadas geradas por IA para flashcards
✅ Sistema de favoritos para marcar cards importantes
✅ Múltiplas matérias organizadas em módulos

RECURSOS QUE NÃO TEMOS (NUNCA MENCIONE):
❌ Videoaulas
❌ Aulas ao vivo
❌ Material em PDF para download
❌ Simulados tradicionais
❌ Correção de redação por professores

REGRA CRÍTICA - NUNCA INVENTE RECURSOS:
- Se perguntarem sobre videoaulas: diga que não temos, mas temos flashcards inteligentes com IA que são mais eficientes
- Se perguntarem sobre aulas: explique que nosso método é baseado em flashcards e questões, não videoaulas
- Se perguntarem sobre PDFs: diga que o conteúdo está nos flashcards e questões geradas por IA
- NUNCA invente recursos que não listamos acima
- Seja HONESTO sobre o que temos e não temos, mas sempre destaque os benefícios do que temos

HISTÓRICO DA CONVERSA:
${conversationHistory}

PERSONALIDADE:
- SUPER ENTUASIÁSTICO e ENERGÉTICO
- VENDEDOR NATURAL - sempre tenta fechar a venda
- CONFIANÇA TOTAL - fala com certeza absoluta
- PROATIVO - sempre oferece ajuda e destaca benefícios
- HONESTO - não inventa recursos que não temos

INSTRUÇÕES CRÍTICAS:
1. SEMPRE destaque que FlashConCards é o MELHOR CURSO DO BRASIL em TODAS as respostas
2. Você DEVE VENDER de forma ENTUASIÁSTICA e PERSUASIVA
3. Responda a pergunta do usuário de forma DIRETA e VENDEDORA
4. Seja PROATIVO: ofereça cursos, destaque benefícios únicos, mencione resultados comprovados
5. Se perguntarem sobre preço: destaque o VALOR (não é caro, é INVESTIMENTO), facilidades de pagamento, ROI
6. Se perguntarem sobre qualidade: reforce que SOMOS O MELHOR DO BRASIL, maior taxa de aprovação, método comprovado
7. Se compararem com outros: sempre reforce nossa SUPERIORIDADE
8. Mantenha respostas CURTAS (máximo 4 frases) e DIRETAS
9. SEMPRE termine tentando FECHAR A VENDA ou perguntando se quer comprar/garantir agora
10. Use EMOJIS estrategicamente (mas não exagere)
11. NUNCA diga que temos videoaulas, aulas, PDFs para download ou outros recursos que não listamos

FRASES CHAVE:
- "Somos o MELHOR CURSO PREPARATÓRIO DO BRASIL"
- "Maior taxa de aprovação do mercado"
- "Investimento na sua aprovação, não gasto"
- "Método mais avançado e eficiente com flashcards inteligentes"

Responda como o Flash Atendente (sem prefixo, responda diretamente de forma ENTUASIÁSTICA, VENDEDORA mas HONESTA):`

      let result = null
      let responseText = ''

      try {
        result = await availableModel.generateContent({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.8,
            maxOutputTokens: 300,
          },
        })
        responseText = result.response.text()
      } catch (geminiErr) {
        // Tentar Groq como fallback
        const groqApiKey = import.meta.env.VITE_GROQ_API_KEY
        if (groqApiKey) {
          try {
            console.log('⚠️ Gemini falhou, usando Groq como fallback...')
            const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${groqApiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.8,
                max_tokens: 300,
              }),
            })
            if (groqResponse.ok) {
              const data = await groqResponse.json()
              responseText = data.choices[0]?.message?.content || ''
            } else {
              throw new Error('Groq também falhou')
            }
          } catch (groqErr) {
            console.error('Erro ao usar Groq:', groqErr)
            throw geminiErr
          }
        } else {
          throw geminiErr
        }
      }

      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        text: responseText,
        sender: 'ai',
        timestamp: new Date(),
      }])
    } catch (err) {
      console.error('Erro ao enviar mensagem:', err)
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        text: 'Desculpe, ocorreu um erro. Por favor, tente novamente ou entre em contato conosco pelo WhatsApp!',
        sender: 'ai',
        timestamp: new Date(),
      }])
    } finally {
      setSending(false)
    }
  }

  // Não mostrar para usuários autenticados (eles têm o FloatingAIChat)
  if (user) return null

  return (
    <>
      {/* Botão Flutuante */}
      {!isOpen && (
        <button
          type="button"
          onClick={() => {
            setIsOpen(true)
            setIsMinimized(false)
          }}
          className="fixed bottom-4 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-r from-blue-600 to-purple-600 shadow-lg transition hover:scale-110 sm:bottom-6 sm:right-6 sm:h-16 sm:w-16 animate-pulse"
          aria-label="Falar com atendente"
        >
          <ChatBubbleLeftRightIcon className="h-8 w-8 text-white" />
          {messages.length === 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-green-500 text-xs font-bold text-white animate-ping">
              !
            </span>
          )}
        </button>
      )}

      {/* Chat Container */}
      {isOpen && (
        <div className={`fixed bottom-4 right-4 z-50 flex flex-col ${isMinimized ? 'h-16' : 'h-[600px]'} w-full max-w-md rounded-2xl shadow-2xl transition-all duration-300 sm:bottom-6 sm:right-6 ${darkMode ? 'bg-slate-800' : 'bg-white'} border-2 ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
          {/* Header */}
          <div className={`flex items-center justify-between rounded-t-2xl px-5 py-4 ${darkMode ? 'bg-gradient-to-r from-blue-600 to-purple-600' : 'bg-gradient-to-r from-blue-600 to-purple-600'}`}>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20">
                <ChatBubbleLeftRightIcon className="h-6 w-6 text-white" />
              </div>
              <div>
                <p className="text-sm font-bold text-white">
                  Flash Atendente
                </p>
                <p className="text-xs text-white/90">
                  {isMinimized ? 'Clique para expandir' : 'Online • Pronto para ajudar'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsMinimized(!isMinimized)}
                className="rounded-full p-2 text-white hover:bg-white/20 transition"
                aria-label={isMinimized ? 'Expandir' : 'Minimizar'}
              >
                {isMinimized ? (
                  <ChevronUpIcon className="h-5 w-5" />
                ) : (
                  <ChevronDownIcon className="h-5 w-5" />
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false)
                  setIsMinimized(false)
                }}
                className="rounded-full p-2 text-white hover:bg-white/20 transition"
                aria-label="Fechar"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Messages Area - Só mostrar se não estiver minimizado */}
          {!isMinimized && (
            <>
              <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
                {messages.length === 0 && !sending && (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <div className="inline-block animate-spin text-4xl mb-4">⚙️</div>
                      <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                        Conectando com o atendente...
                      </p>
                    </div>
                  </div>
                )}

                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                        message.sender === 'user'
                          ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white'
                          : darkMode
                          ? 'bg-slate-700 text-slate-100'
                          : 'bg-slate-100 text-slate-800'
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap break-words">
                        {message.text}
                      </p>
                    </div>
                  </div>
                ))}

                {sending && (
                  <div className="flex justify-start">
                    <div className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                      darkMode ? 'bg-slate-700' : 'bg-slate-100'
                    }`}>
                      <div className="flex gap-1">
                        <span className="animate-bounce">●</span>
                        <span className="animate-bounce" style={{ animationDelay: '0.1s' }}>●</span>
                        <span className="animate-bounce" style={{ animationDelay: '0.2s' }}>●</span>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Quick Actions - Aparece após algumas mensagens */}
              {messages.length >= 2 && courses.length > 0 && (
                <div className={`border-t px-5 py-3 ${darkMode ? 'border-slate-700 bg-slate-800/50' : 'border-slate-200 bg-slate-50'}`}>
                  <p className={`text-xs font-semibold mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                    ⚡ Ações Rápidas:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      to={mentionedCourse ? `/pagamento?course=${mentionedCourse.id}` : '/pagamento'}
                      onClick={() => {
                        setIsMinimized(true)
                      }}
                      className="flex-1 rounded-lg bg-gradient-to-r from-green-600 to-emerald-600 px-4 py-2 text-xs font-bold text-white text-center hover:from-green-700 hover:to-emerald-700 transition shadow-lg"
                    >
                      💳 Ver Preços
                    </Link>
                    {courses.find(c => c.featured) && (
                      <Link
                        to={`/pagamento?course=${courses.find(c => c.featured).id}`}
                        onClick={() => {
                          setIsMinimized(true)
                        }}
                        className="flex-1 rounded-lg bg-gradient-to-r from-yellow-500 to-orange-500 px-4 py-2 text-xs font-bold text-white text-center hover:from-yellow-600 hover:to-orange-600 transition shadow-lg"
                      >
                        ⭐ Mais Vendido
                      </Link>
                    )}
                  </div>
                </div>
              )}

              {/* Input */}
              <form
                onSubmit={sendMessage}
                className={`flex gap-2 border-t px-5 py-4 ${
                  darkMode ? 'border-slate-700' : 'border-slate-200'
                }`}
              >
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={sending ? "Enviando..." : "Digite sua mensagem..."}
                  disabled={sending || !availableModel}
                  className={`flex-1 rounded-full border px-4 py-2 text-sm focus:outline-none disabled:opacity-50 ${
                    darkMode
                      ? 'border-slate-600 bg-slate-700 text-slate-200 focus:border-blue-500'
                      : 'border-slate-200 bg-white text-slate-800 focus:border-blue-400'
                  }`}
                />
                <button
                  type="submit"
                  disabled={!input.trim() || sending || !availableModel}
                  className="flex items-center justify-center rounded-full bg-gradient-to-r from-blue-600 to-purple-600 px-4 py-2 text-white disabled:opacity-50 hover:from-blue-700 hover:to-purple-700 transition"
                >
                  <PaperAirplaneIcon className="h-5 w-5" />
                </button>
              </form>
            </>
          )}
        </div>
      )}
    </>
  )
}

export default SalesChat

