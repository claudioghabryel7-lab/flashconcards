import { useEffect, useState } from 'react'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  where,
} from 'firebase/firestore'
import { GoogleGenerativeAI } from '@google/generative-ai'
import {
  PaperAirplaneIcon,
  XMarkIcon,
  ChatBubbleLeftRightIcon,
} from '@heroicons/react/24/solid'
import { db } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'
import { useDarkMode } from '../hooks/useDarkMode.jsx'

const MATERIAS = [
  'Português',
  'Área de Atuação (PL)',
  'Raciocínio Lógico',
  'Constitucional',
  'Administrativo',
  'Legislação Estadual',
  'Realidade de Goiás',
  'Redação',
]

const FloatingAIChat = () => {
  const { user, profile } = useAuth()
  const { darkMode } = useDarkMode()
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [availableModel, setAvailableModel] = useState(null)
  const [modelError, setModelError] = useState(null)
  const [initialMessageSent, setInitialMessageSent] = useState(false)
  const [lastRequestTime, setLastRequestTime] = useState(0)
  const MIN_REQUEST_INTERVAL = 2000 // Mínimo de 2 segundos entre requisições
  
  // Dados de progresso para análise
  const [progressData, setProgressData] = useState([])
  const [cardProgress, setCardProgress] = useState({})
  const [allCards, setAllCards] = useState([])
  const [studyStats, setStudyStats] = useState({
    totalDays: 0,
    totalHours: 0,
    bySubject: {},
  })

  // Carregar flashcards
  useEffect(() => {
    const cardsRef = collection(db, 'flashcards')
    const unsub = onSnapshot(cardsRef, (snapshot) => {
      const data = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }))
      setAllCards(data)
    })
    return () => unsub()
  }, [])

  // Carregar progresso dos cards
  useEffect(() => {
    if (!user) return () => {}
    
    const userProgressRef = doc(db, 'userProgress', user.uid)
    const unsub = onSnapshot(
      userProgressRef,
      (snapshot) => {
        if (snapshot.exists()) {
          setCardProgress(snapshot.data().cardProgress || {})
        } else {
          setCardProgress({})
        }
      },
      (error) => {
        console.error('Erro ao carregar progresso dos cards:', error)
        setCardProgress({})
      }
    )
    return () => unsub()
  }, [user])

  // Carregar progresso de dias estudados
  useEffect(() => {
    if (!user) return () => {}
    
    const progressRef = collection(db, 'progress')
    const q = query(
      progressRef,
      where('uid', '==', user.uid),
      orderBy('date', 'desc'),
    )
    
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((doc) => doc.data())
        setProgressData(data)
      },
      (error) => {
        if (error.code === 'failed-precondition') {
          console.warn('Índice do Firestore não criado. Usando query sem orderBy.')
          const qSimple = query(progressRef, where('uid', '==', user.uid))
          onSnapshot(
            qSimple,
            (snapshot) => {
              const data = snapshot.docs.map((doc) => doc.data())
              data.sort((a, b) => {
                if (!a.date || !b.date) return 0
                return b.date.localeCompare(a.date)
              })
              setProgressData(data)
            },
            (err) => {
              console.error('Erro ao carregar progresso:', err)
              setProgressData([])
            }
          )
        } else {
          console.error('Erro ao carregar progresso:', error)
          setProgressData([])
        }
      }
    )
    return () => unsub()
  }, [user])

  // Calcular estatísticas
  useEffect(() => {
    if (!user) return

    const hoursFromDays = progressData.reduce((sum, item) => sum + (item.hours || 0), 0)
    const hoursFromCards = Object.values(cardProgress).reduce((sum, progress) => {
      return sum + ((progress.reviewCount || 0) * 0.083)
    }, 0)

    const stats = {
      totalDays: progressData.length,
      totalHours: hoursFromDays + hoursFromCards,
      bySubject: {},
    }

    MATERIAS.forEach((materia) => {
      stats.bySubject[materia] = {
        days: 0,
        hours: 0,
        totalCards: 0,
        studiedCards: 0,
        percentage: 0,
        difficulty: 0, // 0 = fácil, 1 = médio, 2 = difícil
      }
    })

    // Contar cards por matéria
    allCards.forEach((card) => {
      if (card.materia && stats.bySubject[card.materia]) {
        stats.bySubject[card.materia].totalCards += 1
        if (cardProgress[card.id] && cardProgress[card.id].reviewCount) {
          stats.bySubject[card.materia].studiedCards += 1
          
          // Calcular dificuldade média (baseado no stage - stage baixo = difícil)
          const stage = cardProgress[card.id].stage || 0
          if (stage < 2) stats.bySubject[card.materia].difficulty += 2
          else if (stage < 4) stats.bySubject[card.materia].difficulty += 1
        }
      }
    })

    // Calcular porcentagem e horas por matéria
    MATERIAS.forEach((materia) => {
      const subj = stats.bySubject[materia]
      if (subj.totalCards > 0) {
        subj.percentage = Math.round((subj.studiedCards / subj.totalCards) * 100)
        subj.hours = (subj.studiedCards * 0.083).toFixed(1)
      }
      if (subj.studiedCards > 0) {
        subj.difficulty = (subj.difficulty / subj.studiedCards).toFixed(1)
      }
    })

    setStudyStats(stats)
  }, [allCards, cardProgress, progressData, user])

  // Limpar mensagens antigas (mais de 1 hora) automaticamente
  useEffect(() => {
    if (!user) return () => {}
    
    const cleanOldMessages = async () => {
      try {
        const chatRef = collection(db, 'chats', user.uid, 'messages')
        const oneHourAgo = Date.now() - 60 * 60 * 1000 // 1 hora atrás em milissegundos
        
        // Buscar todas as mensagens (sem filtro para evitar necessidade de índice)
        const q = query(chatRef, orderBy('createdAt', 'asc'))
        const snapshot = await getDocs(q)
        
        if (snapshot.empty) return
        
        // Filtrar mensagens com mais de 1 hora e deletar
        const messagesToDelete = snapshot.docs.filter((docSnapshot) => {
          const data = docSnapshot.data()
          const createdAt = data.createdAt
          if (!createdAt) return false
          
          // Converter Timestamp do Firestore para milissegundos
          const msgTime = createdAt.toMillis ? createdAt.toMillis() : (createdAt.seconds * 1000)
          return msgTime < oneHourAgo
        })
        
        if (messagesToDelete.length === 0) return
        
        // Deletar mensagens antigas
        const deletePromises = messagesToDelete.map((docSnapshot) => 
          deleteDoc(doc(chatRef, docSnapshot.id))
        )
        await Promise.all(deletePromises)
        
        console.log(`🧹 Limpeza automática: ${messagesToDelete.length} mensagens antigas removidas`)
      } catch (err) {
        console.error('Erro ao limpar mensagens antigas:', err)
      }
    }
    
    // Limpar imediatamente ao carregar
    cleanOldMessages()
    
    // Limpar a cada 30 minutos (verifica e remove mensagens com mais de 1h)
    const cleanupInterval = setInterval(cleanOldMessages, 30 * 60 * 1000)
    
    return () => clearInterval(cleanupInterval)
  }, [user])

  // Carregar mensagens do chat
  useEffect(() => {
    if (!user || !isOpen) return () => {}
    const chatRef = collection(db, 'chats', user.uid, 'messages')
    const q = query(chatRef, orderBy('createdAt', 'asc'))
    const unsub = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }))
      setMessages(data)
    })
    return () => unsub()
  }, [user, isOpen])

  // Descobrir modelo disponível (executar apenas uma vez)
  useEffect(() => {
    if (availableModel) return // Já tem modelo, não precisa procurar novamente
    
    const findAvailableModel = async () => {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY
      if (!apiKey) {
        console.warn('⚠️ VITE_GEMINI_API_KEY não configurada')
        setModelError('API key do Gemini não configurada. Configure VITE_GEMINI_API_KEY no arquivo .env')
        return
      }

      console.log('🔍 Procurando modelo disponível...')
      
      // Tentar modelos conhecidos diretamente (mais rápido) - apenas os que funcionam
      const knownModels = ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-1.5-pro']
      const genAI = new GoogleGenerativeAI(apiKey)
      
      for (const modelName of knownModels) {
        try {
          console.log(`🧪 Testando modelo: ${modelName}`)
          const model = genAI.getGenerativeModel({ model: modelName })
          await model.generateContent({
            contents: [{ parts: [{ text: 'test' }] }],
          })
          console.log(`✅ Modelo encontrado: ${modelName}`)
          setAvailableModel(modelName)
          return
        } catch (err) {
          console.log(`❌ Modelo ${modelName} não disponível:`, err.message)
          continue
        }
      }
      
      // Se nenhum modelo conhecido funcionou, tentar listar da API
      console.log('🔍 Listando modelos da API...')
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
        )
        
        if (!response.ok) {
          console.error('❌ Erro ao listar modelos:', response.status)
          setModelError('Erro ao conectar com a API do Gemini')
          return
        }

        const data = await response.json()
        const models = data.models || []
        const generateModels = models.filter((model) => {
          return (model.supportedGenerationMethods || []).includes('generateContent')
        })

        if (generateModels.length === 0) {
          console.warn('⚠️ Nenhum modelo com generateContent encontrado')
          setModelError('Nenhum modelo disponível')
          return
        }

        // Tentar cada modelo da lista
        for (const modelData of generateModels) {
          try {
            const testModelName = modelData.name.replace('models/', '')
            const testModel = genAI.getGenerativeModel({ model: testModelName })
            await testModel.generateContent({
              contents: [{ parts: [{ text: 'test' }] }],
            })
            console.log(`✅ Modelo encontrado: ${testModelName}`)
            setAvailableModel(testModelName)
            return
          } catch {
            continue
          }
        }
        
        console.warn('⚠️ Nenhum modelo funcionou')
        setModelError('Nenhum modelo disponível funcionou')
      } catch (err) {
        console.error('❌ Erro ao descobrir modelo:', err)
        setModelError('Erro ao conectar com a API do Gemini. Verifique sua conexão e API key.')
      }
    }

    findAvailableModel()
  }, []) // Array vazio - executar apenas uma vez

  // Gerar análise inicial quando abrir o chat (apenas uma vez)
  useEffect(() => {
    if (!isOpen || !user) return
    
    // Se já tem mensagens, não enviar análise inicial novamente
    if (messages.length > 0) {
      setInitialMessageSent(true)
      return
    }
    
    // Se já enviou, não enviar novamente
    if (initialMessageSent) return
    
    // Aguardar modelo estar disponível
    if (!availableModel) {
      console.log('⏳ Aguardando modelo estar disponível...')
      return
    }

    console.log('✅ Preparando análise inicial...', {
      totalDays: studyStats.totalDays,
      cardProgressKeys: Object.keys(cardProgress).length,
      allCardsLength: allCards.length
    })

    const generateInitialAnalysis = async () => {
      try {
        console.log('🚀 Gerando análise inicial...')
        setInitialMessageSent(true)
        const analysis = analyzeProgress()
        console.log('📊 Análise gerada, tamanho:', analysis.length, 'caracteres')
        console.log('📤 Enviando análise para IA...')
        await sendAIMessage(analysis, true)
        console.log('✅ Análise enviada com sucesso!')
      } catch (err) {
        console.error('❌ Erro ao gerar análise inicial:', err)
        setInitialMessageSent(false) // Permitir tentar novamente
      }
    }

    // Aguardar um pouco para garantir que os dados estão carregados
    const timer = setTimeout(() => {
      if (messages.length === 0 && !initialMessageSent && availableModel) {
        generateInitialAnalysis()
      }
    }, 2000)

    return () => clearTimeout(timer)
  }, [isOpen, user, availableModel, initialMessageSent, messages.length])

  // Analisar progresso e gerar texto
  const analyzeProgress = () => {
    const subjects = MATERIAS.map((materia) => {
      const stats = studyStats.bySubject[materia] || {}
      return {
        name: materia,
        percentage: stats.percentage || 0,
        studiedCards: stats.studiedCards || 0,
        totalCards: stats.totalCards || 0,
        hours: parseFloat(stats.hours || 0),
        difficulty: parseFloat(stats.difficulty || 0),
      }
    })

    // Encontrar melhor, pior e mais pendente
    const sortedByPercentage = [...subjects].sort((a, b) => b.percentage - a.percentage)
    const sortedByDifficulty = [...subjects]
      .filter((s) => s.studiedCards > 0)
      .sort((a, b) => b.difficulty - a.difficulty)
    const sortedByPending = [...subjects].sort((a, b) => a.percentage - b.percentage)

    const best = sortedByPercentage[0] || subjects[0]
    const worst = sortedByDifficulty[0] || sortedByPending[sortedByPending.length - 1] || subjects[0]
    const mostPending = sortedByPending[0] || subjects[0]

    return `Analise meu progresso no concurso ALEGO Policial Legislativo:

DADOS GERAIS:
- Dias estudados: ${studyStats.totalDays}
- Horas totais: ${studyStats.totalHours.toFixed(1)}h
- Favoritos: ${profile?.favorites?.length || 0} cards

PROGRESSO POR MATÉRIA:
${subjects.map((s) => 
  `- ${s.name}: ${s.percentage}% (${s.studiedCards}/${s.totalCards} cards, ${s.hours}h)`
).join('\n')}

ANÁLISE:
- Melhor desempenho: ${best.name} (${best.percentage}%)
- Mais dificuldade: ${worst.name} (${worst.percentage}%, dificuldade: ${worst.difficulty.toFixed(1)})
- Mais pendente: ${mostPending.name} (${mostPending.percentage}%)

Me dê orientações sobre o que estudar hoje, o que preciso melhorar e sugestões práticas.`
  }

  // Enviar mensagem da IA
  const sendAIMessage = async (userMessage, isInitial = false) => {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY
    if (!apiKey) {
      console.error('❌ API key do Gemini não configurada')
      const chatRef = collection(db, 'chats', user.uid, 'messages')
      await addDoc(chatRef, {
        text: 'Erro: API key do Gemini não configurada. Configure VITE_GEMINI_API_KEY no arquivo .env',
        sender: 'ai',
        createdAt: serverTimestamp(),
      })
      return
    }
    if (!availableModel) {
      console.error('❌ Modelo não disponível ainda:', availableModel)
      setSending(false)
      return
    }
    
    console.log('✅ Enviando mensagem para IA...', { 
      isInitial, 
      messageLength: userMessage.length,
      model: availableModel,
      userId: user?.uid 
    })
    setSending(true)

    try {
      const genAI = new GoogleGenerativeAI(apiKey)
      const model = genAI.getGenerativeModel({ model: availableModel })

      // Carregar prompt do admin
      let editalPrompt = null
      try {
        const editalDoc = await getDoc(doc(db, 'config', 'edital'))
        if (editalDoc.exists()) {
          editalPrompt = editalDoc.data().prompt || editalDoc.data().content
        }
      } catch (err) {
        console.error('Erro ao carregar configuração:', err)
      }

      const editalContext = editalPrompt 
        ? `\n\nINFORMAÇÕES DO CONCURSO ALEGO POLICIAL LEGISLATIVO:\n${editalPrompt}\n\nUse APENAS essas informações para responder sobre o concurso.`
        : ''

      const mentorPrompt = `Você é o "Flash Mentor", mentor do concurso ALEGO Policial Legislativo.

REGRAS DE RESPOSTA:
- Respostas COMPLETAS e OBJETIVAS: 3-6 frases bem formadas
- Seja DIRETO mas COMPLETO - termine suas frases
- Foque em AÇÕES práticas
- SEMPRE termine suas respostas com pontuação final
- Responda APENAS sobre o concurso ALEGO Policial Legislativo
${editalContext}

MATÉRIAS: Português, Área de Atuação (PL), Raciocínio Lógico, Constitucional, Administrativo, Legislação Estadual, Realidade de Goiás, Redação.

Responda CURTO e OBJETIVO: ${userMessage}`

      // Tentar gerar resposta com retry em caso de quota (backoff exponencial)
      let result = null
      let retries = 0
      const maxRetries = 3
      const baseDelay = 2000 // 2 segundos base

      while (retries <= maxRetries) {
        try {
          result = await model.generateContent({
            contents: [{ parts: [{ text: mentorPrompt }] }],
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 800, // Aumentado para evitar cortes
              topP: 0.9,
              topK: 40,
            },
          })
          break // Sucesso
        } catch (apiErr) {
          const errorMessage = apiErr.message || String(apiErr) || ''
          const isQuotaError = 
            errorMessage.includes('429') || 
            errorMessage.includes('quota') ||
            errorMessage.includes('Too Many Requests') ||
            errorMessage.includes('RESOURCE_EXHAUSTED') ||
            errorMessage.includes('rate limit') ||
            apiErr.status === 429 ||
            apiErr.code === 429
          
          // Se for erro de quota e ainda temos tentativas, aguardar e tentar novamente
          if (isQuotaError && retries < maxRetries) {
            retries++
            // Backoff exponencial: 2s, 4s, 8s
            const waitTime = baseDelay * Math.pow(2, retries - 1)
            console.warn(`⚠️ Quota excedida (tentativa ${retries}/${maxRetries}). Aguardando ${waitTime/1000}s...`)
            await new Promise(resolve => setTimeout(resolve, waitTime))
            continue
          }
          
          // Se não for erro de quota ou já tentou demais, lança o erro
          throw apiErr
        }
      }

      if (!result) {
        throw new Error('Quota da API excedida. Aguarde alguns minutos antes de tentar novamente.')
      }

      const response = result.response
      
      // Extrair texto completo da resposta
      let text = ''
      try {
        // Método mais confiável: usar candidates diretamente
        if (response.candidates && response.candidates.length > 0) {
          const candidate = response.candidates[0]
          
          // Verificar se há bloqueio de conteúdo
          if (candidate.finishReason && candidate.finishReason !== 'STOP') {
            console.warn('⚠️ Finish reason:', candidate.finishReason)
            if (candidate.finishReason === 'SAFETY') {
              throw new Error('Resposta bloqueada por segurança. Tente reformular a pergunta.')
            }
          }
          
          if (candidate.content && candidate.content.parts) {
            text = candidate.content.parts
              .map(part => part.text || '')
              .join('')
              .trim()
          }
        }
        
        // Se candidates não funcionou, tentar response.text() como fallback
        if (!text || text.trim().length === 0) {
          try {
            const textMethod = response.text
            if (typeof textMethod === 'function') {
              text = await textMethod()
            } else {
              text = String(textMethod || '')
            }
          } catch (textErr) {
            console.warn('⚠️ response.text() falhou, usando candidates:', textErr)
          }
        }
        
        // Verificar se temos texto válido
        if (!text || text.trim().length === 0) {
          throw new Error('Resposta vazia da API')
        }
        
        text = text.trim()
        console.log('✅ Texto extraído da resposta:', text.substring(0, 100) + '...')
        
      } catch (textErr) {
        console.error('❌ Erro ao extrair texto:', textErr)
        // Última tentativa: verificar candidates manualmente
        try {
          if (response.candidates && response.candidates.length > 0) {
            const candidate = response.candidates[0]
            if (candidate.content && candidate.content.parts) {
              text = candidate.content.parts
                .map(part => part.text || '')
                .join('')
                .trim()
            }
          }
          
          if (!text || text.trim().length === 0) {
            throw new Error('Não foi possível extrair texto da resposta')
          }
        } catch {
          text = 'Desculpe, não consegui gerar uma resposta completa. Tente novamente.'
        }
      }

      // Garantir que o texto não está vazio antes de salvar
      if (!text || text.trim().length === 0) {
        throw new Error('Texto da resposta está vazio')
      }
      
      console.log('💾 Salvando resposta no Firestore...', { textLength: text.length, userId: user.uid })
      const chatRef = collection(db, 'chats', user.uid, 'messages')
      await addDoc(chatRef, {
        text: text.trim(),
        sender: 'ai',
        createdAt: serverTimestamp(),
      })
      
      console.log('✅ Resposta da IA salva com sucesso:', text.substring(0, 50) + '...')
      setSending(false)
    } catch (err) {
      console.error('❌ Erro ao chamar mentor:', err)
      setSending(false)
      const chatRef = collection(db, 'chats', user.uid, 'messages')
      
      let errorMessage = 'Desculpe, ocorreu um erro. Tente novamente em alguns instantes.'
      
      const errorMsg = err.message || String(err) || ''
      const isQuotaError = 
        errorMsg.includes('429') || 
        errorMsg.includes('quota') ||
        errorMsg.includes('Too Many Requests') ||
        errorMsg.includes('RESOURCE_EXHAUSTED') ||
        errorMsg.includes('rate limit') ||
        err.status === 429 ||
        err.code === 429
      
      if (isQuotaError) {
        errorMessage = '⏳ A quota da API foi excedida. Por favor, aguarde 2-3 minutos antes de tentar novamente. Isso acontece quando há muitas requisições em pouco tempo. O sistema tentará automaticamente novamente em alguns instantes.'
      } else if (errorMsg.includes('API key')) {
        errorMessage = 'Erro na configuração da API. Verifique a chave do Gemini.'
      }
      
      await addDoc(chatRef, {
        text: errorMessage,
        sender: 'ai',
        createdAt: serverTimestamp(),
      })
    }
  }

  // Enviar mensagem do usuário
  const sendMessage = async (event) => {
    event?.preventDefault()
    if (!input.trim() || !user || sending) return
    
    // Rate limiting: evitar muitas requisições seguidas
    const now = Date.now()
    const timeSinceLastRequest = now - lastRequestTime
    if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
      const waitTime = Math.ceil((MIN_REQUEST_INTERVAL - timeSinceLastRequest) / 1000)
      const chatRef = collection(db, 'chats', user.uid, 'messages')
      await addDoc(chatRef, {
        text: `⏳ Aguarde ${waitTime} segundo(s) antes de enviar outra mensagem para evitar exceder a quota da API.`,
        sender: 'ai',
        createdAt: serverTimestamp(),
      })
      return
    }
    
    const userMessage = input.trim()
    setSending(true)
    setLastRequestTime(now)
    const chatRef = collection(db, 'chats', user.uid, 'messages')
    
    try {
      await addDoc(chatRef, {
        text: userMessage,
        sender: 'user',
        createdAt: serverTimestamp(),
      })
      setInput('')

      await sendAIMessage(userMessage)
    } catch (err) {
      console.error('Erro ao enviar mensagem:', err)
    } finally {
      setSending(false)
    }
  }

  // Resetar quando fechar
  const handleClose = () => {
    setIsOpen(false)
    setInitialMessageSent(false)
  }

  if (!user) return null

  return (
    <>
      {/* Botão Flutuante */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-alego-600 shadow-lg transition hover:bg-alego-700 hover:scale-110 sm:bottom-6 sm:right-6 sm:h-16 sm:w-16"
        aria-label="Abrir chat com mentor"
      >
        <ChatBubbleLeftRightIcon className="h-8 w-8 text-white" />
        {messages.length > 0 && (
          <span className="absolute -top-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-rose-500 text-xs font-bold text-white">
            {messages.filter((m) => m.sender === 'user').length}
          </span>
        )}
      </button>

      {/* Modal do Chat */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center px-2 pb-4 pt-16 sm:px-4 sm:pb-6 sm:pt-24 md:items-center md:justify-center">
          {/* Overlay */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={handleClose}
          />

          {/* Chat Container */}
          <div
            className={`relative flex h-[70vh] w-full max-w-md flex-col rounded-2xl shadow-2xl ${
              darkMode ? 'bg-slate-800' : 'bg-white'
            }`}
          >
            {/* Header */}
            <div className={`flex items-center justify-between border-b px-5 py-4 ${
              darkMode ? 'border-slate-700' : 'border-slate-200'
            }`}>
              <div>
                <p className={`text-sm font-semibold uppercase tracking-wide ${
                  darkMode ? 'text-alego-400' : 'text-alego-500'
                }`}>
                  Seu Flash Mentor
                </p>
                <p className={`text-lg font-bold ${
                  darkMode ? 'text-alego-300' : 'text-alego-700'
                }`}>
                  Mentor do Concurso ALEGO
                </p>
              </div>
              <button
                type="button"
                onClick={handleClose}
                className={`rounded-full p-2 transition ${
                  darkMode ? 'hover:bg-slate-700' : 'hover:bg-slate-100'
                }`}
              >
                <XMarkIcon className={`h-5 w-5 ${
                  darkMode ? 'text-slate-300' : 'text-slate-600'
                }`} />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
              {messages.length === 0 && !sending && (
                <div className={`text-center text-sm ${
                  darkMode ? 'text-slate-400' : 'text-slate-500'
                }`}>
                  <p className="mb-2">👋 Analisando seu progresso...</p>
                </div>
              )}
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] sm:max-w-[80%] rounded-2xl px-4 py-2 text-sm break-words ${
                      message.sender === 'user'
                        ? 'bg-alego-600 text-white'
                        : darkMode
                        ? 'bg-slate-700 text-slate-200'
                        : 'bg-slate-100 text-slate-800'
                    }`}
                  >
                    {message.text}
                  </div>
                </div>
              ))}
              {sending && (
                <div className="flex justify-start">
                  <div
                    className={`max-w-[85%] sm:max-w-[80%] rounded-2xl px-4 py-2 text-sm break-words ${
                      darkMode
                        ? 'bg-slate-700 text-slate-200'
                        : 'bg-slate-100 text-slate-800'
                    }`}
                  >
                    <span className="inline-block animate-pulse">Pensando...</span>
                  </div>
                </div>
              )}
            </div>

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
                placeholder={initialMessageSent ? "Pergunte ao seu mentor..." : "Aguardando análise..."}
                disabled={sending || !availableModel || !initialMessageSent}
                className={`flex-1 rounded-full border px-4 py-2 text-sm focus:outline-none disabled:opacity-50 ${
                  darkMode
                    ? 'border-slate-600 bg-slate-700 text-slate-200 focus:border-alego-500'
                    : 'border-slate-200 bg-white text-slate-800 focus:border-alego-400'
                }`}
              />
              <button
                type="submit"
                disabled={!input.trim() || sending || !availableModel || !initialMessageSent}
                className="flex items-center gap-2 rounded-full bg-alego-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                <PaperAirplaneIcon className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

export default FloatingAIChat

