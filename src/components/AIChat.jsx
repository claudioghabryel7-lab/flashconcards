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
import { PaperAirplaneIcon } from '@heroicons/react/24/solid'
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

const AIChat = () => {
  const { user, profile } = useAuth()
  const { darkMode } = useDarkMode()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [availableModel, setAvailableModel] = useState(null)
  const [modelError, setModelError] = useState(null)
  const [userProgress, setUserProgress] = useState(null)
  const [lastRequestTime, setLastRequestTime] = useState(0)
  const MIN_REQUEST_INTERVAL = 2000 // Mínimo de 2 segundos entre requisições

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

  useEffect(() => {
    if (!user) return () => {}
    const chatRef = collection(db, 'chats', user.uid, 'messages')
    const q = query(chatRef, orderBy('createdAt', 'asc'))
    const unsub = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((docSnapshot) => ({
        id: docSnapshot.id,
        ...docSnapshot.data(),
      }))
      setMessages(data)
    })
    return () => unsub()
  }, [user])

  // Carregar progresso do usuário para contexto
  useEffect(() => {
    if (!user) return () => {}
    
    const progressRef = collection(db, 'progress')
    
    // Tentar com orderBy primeiro, se falhar, usar sem orderBy
    const q = query(
      progressRef,
      where('uid', '==', user.email),
      orderBy('date', 'desc'),
    )
    
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((doc) => doc.data())
        const totalDays = data.length
        const totalHours = data.reduce((sum, item) => sum + (item.hours || 0), 0)
        const studiedCards = profile?.studiedCards?.length || 0
        const favorites = profile?.favorites?.length || 0
        
        setUserProgress({
          totalDays,
          totalHours,
          studiedCards,
          favorites,
          recentDates: data.slice(0, 7).map((item) => item.date),
        })
      },
      (error) => {
        // Se der erro de índice, tentar sem orderBy
        if (error.code === 'failed-precondition') {
          console.warn('Índice do Firestore não criado. Usando query sem orderBy.')
          const qSimple = query(progressRef, where('uid', '==', user.email))
          onSnapshot(
            qSimple,
            (snapshot) => {
              const data = snapshot.docs.map((doc) => doc.data())
              // Ordenar manualmente
              data.sort((a, b) => {
                if (!a.date || !b.date) return 0
                return b.date.localeCompare(a.date)
              })
              const totalDays = data.length
              const totalHours = data.reduce((sum, item) => sum + (item.hours || 0), 0)
              const studiedCards = profile?.studiedCards?.length || 0
              const favorites = profile?.favorites?.length || 0
              
              setUserProgress({
                totalDays,
                totalHours,
                studiedCards,
                favorites,
                recentDates: data.slice(0, 7).map((item) => item.date),
              })
            },
            (err) => console.error('Erro ao carregar progresso:', err)
          )
        } else {
          console.error('Erro ao carregar progresso:', error)
        }
      }
    )
    
    return () => unsub()
  }, [user, profile])

  // Descobrir qual modelo está disponível
  useEffect(() => {
    const findAvailableModel = async () => {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY
      if (!apiKey || availableModel) return

      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
        )
        
        if (!response.ok) {
          throw new Error('Não foi possível listar modelos')
        }

        const data = await response.json()
        const models = data.models || []
        
        const generateModels = models.filter((model) => {
          const methods = model.supportedGenerationMethods || []
          return methods.includes('generateContent')
        })

        if (generateModels.length === 0) {
          setModelError('Nenhum modelo de geração disponível. Verifique sua API key.')
          return
        }

        const genAI = new GoogleGenerativeAI(apiKey)
        const modelName = generateModels[0].name.replace('models/', '')
        
        try {
          const model = genAI.getGenerativeModel({ model: modelName })
          await model.generateContent({
            contents: [{ parts: [{ text: 'test' }] }],
          })
          setAvailableModel(modelName)
        } catch (testErr) {
          for (let i = 1; i < generateModels.length; i++) {
            try {
              const testModelName = generateModels[i].name.replace('models/', '')
              const testModel = genAI.getGenerativeModel({ model: testModelName })
              await testModel.generateContent({
                contents: [{ parts: [{ text: 'test' }] }],
              })
              setAvailableModel(testModelName)
              return
            } catch (err) {
              continue
            }
          }
          setModelError('Nenhum modelo funcionou. Verifique sua API key e permissões.')
        }
      } catch (err) {
        console.error('Erro ao descobrir modelo:', err)
        setModelError('Erro ao conectar com a API. Verifique sua API key.')
      }
    }

    findAvailableModel()
  }, [availableModel])

  const getMentorResponse = async (userMessage) => {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY
    
    if (!apiKey) {
      return 'API key não configurada. Configure VITE_GEMINI_API_KEY no arquivo .env'
    }

    if (!availableModel) {
      return modelError || 'Aguardando configuração... Tente novamente em alguns segundos.'
    }

    try {
      const genAI = new GoogleGenerativeAI(apiKey)
      const model = genAI.getGenerativeModel({ model: availableModel })

      // Carregar prompt/configuração do edital se disponível
      let editalPrompt = null
      try {
        const editalDoc = await getDoc(doc(db, 'config', 'edital'))
        if (editalDoc.exists()) {
          editalPrompt = editalDoc.data().prompt || editalDoc.data().content
        }
      } catch (err) {
        console.error('Erro ao carregar configuração:', err)
      }

      // Construir contexto do aluno
      const progressInfo = userProgress
        ? `Progresso: ${userProgress.totalDays} dias, ${userProgress.totalHours.toFixed(1)}h, ${userProgress.studiedCards} cards.`
        : 'Aluno iniciante.'

      // Construir prompt curto e objetivo
      const editalContext = editalPrompt 
        ? `\n\nINFORMAÇÕES DO CONCURSO ALEGO POLICIAL LEGISLATIVO:\n${editalPrompt}\n\nUse APENAS essas informações para responder sobre o concurso.`
        : ''

      const mentorPrompt = `Você é o "Flash Mentor", mentor do concurso ALEGO Policial Legislativo.

REGRAS DE RESPOSTA:
- Respostas CURTAS: máximo 3-4 frases
- Seja DIRETO e OBJETIVO
- Foque em AÇÕES práticas
- Responda APENAS sobre o concurso ALEGO Policial Legislativo
${editalContext}

MATÉRIAS: Português, Área de Atuação (PL), Raciocínio Lógico, Constitucional, Administrativo, Legislação Estadual, Realidade de Goiás, Redação.

${progressInfo}

Responda CURTO e OBJETIVO: ${userMessage}`

      // Adicionar histórico recente se houver (limitado a 3 mensagens para economizar tokens)
      // Filtrar apenas mensagens das últimas 2 horas para evitar contexto muito antigo
      const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000
      const recentMessages = messages
        .filter((msg) => {
          const msgTime = msg.createdAt?.toMillis?.() || msg.createdAt?.seconds * 1000 || 0
          return msgTime > twoHoursAgo
        })
        .slice(-3) // Apenas 3 mensagens mais recentes (reduz tokens)
      
      let fullPrompt = mentorPrompt
      
      if (recentMessages.length > 0) {
        const history = recentMessages
          .map((msg) => `${msg.sender === 'user' ? 'Aluno' : 'Flash Mentor'}: ${msg.text}`)
          .join('\n\n')
        fullPrompt = `${mentorPrompt}\n\nHISTÓRICO RECENTE (últimas 3 mensagens):\n${history}`
      }

      // Tentar gerar resposta com retry em caso de quota (backoff exponencial)
      let result = null
      let retries = 0
      const maxRetries = 3
      const baseDelay = 2000 // 2 segundos base
      
      while (retries <= maxRetries) {
        try {
          result = await model.generateContent({
            contents: [{ parts: [{ text: fullPrompt }] }],
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 300, // Respostas curtas
              topP: 0.9,
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
      const text = response.text()
      return text
    } catch (err) {
      console.error('Erro ao chamar mentor:', err)
      
      // Mensagens de erro mais específicas para quota
      const errorMessage = err.message || String(err) || ''
      const isQuotaError = 
        errorMessage.includes('429') || 
        errorMessage.includes('quota') || 
        errorMessage.includes('Too Many Requests') ||
        errorMessage.includes('RESOURCE_EXHAUSTED') ||
        errorMessage.includes('rate limit') ||
        err.status === 429 ||
        err.code === 429
      
      if (isQuotaError) {
        return '⏳ A quota da API foi excedida. Por favor, aguarde 2-3 minutos antes de tentar novamente. Isso acontece quando há muitas requisições em pouco tempo. O sistema tentará automaticamente novamente em alguns instantes.'
      }
      
      if (err.message?.includes('API key')) {
        return 'Erro na configuração da API. Verifique se a chave do Gemini está configurada corretamente.'
      }
      
      return `Desculpe, ocorreu um erro ao processar sua mensagem: ${err.message || 'Erro desconhecido'}. Tente novamente em alguns instantes.`
    }
  }

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

      const mentorResponse = await getMentorResponse(userMessage)

      await addDoc(chatRef, {
        text: mentorResponse,
        sender: 'ai',
        createdAt: serverTimestamp(),
      })
    } catch (err) {
      console.error('Erro ao enviar mensagem:', err)
      await addDoc(chatRef, {
        text: 'Desculpe, ocorreu um erro ao processar sua mensagem. Tente novamente.',
        sender: 'ai',
        createdAt: serverTimestamp(),
      })
    } finally {
      setSending(false)
    }
  }

  return (
    <div 
      className="flex h-[28rem] flex-col rounded-2xl shadow-sm"
      style={{
        backgroundColor: darkMode ? '#1e293b' : '#ffffff',
        color: darkMode ? '#f1f5f9' : '#1e293b'
      }}
    >
      <div className="border-b border-slate-100 px-5 py-4">
        <p className="text-sm font-semibold uppercase tracking-wide text-alego-500">
          Seu Flash Mentor
        </p>
        <p className="text-lg font-bold text-alego-700">
          Seu mentor pessoal para o concurso ALEGO
        </p>
        {!availableModel && !modelError && (
          <p className="mt-1 text-xs text-amber-600">
            Configurando mentor... Aguarde alguns segundos.
          </p>
        )}
        {modelError && (
          <p className="mt-1 text-xs text-rose-600">
            ⚠️ {modelError}
          </p>
        )}
        {availableModel && (
          <p className="mt-1 text-xs text-emerald-600">
            ✓ Mentor pronto para orientar seus estudos
          </p>
        )}
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
        {messages.length === 0 && (
          <div className="text-center text-sm text-slate-500">
            <p className="mb-2">👋 Olá! Sou seu Flash Mentor.</p>
            <p>Pergunte sobre o que estudar hoje, peça dicas ou orientações sobre sua preparação!</p>
          </div>
        )}
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-xs rounded-2xl px-4 py-2 text-sm ${
                message.sender === 'user'
                  ? 'bg-alego-600 text-white'
                  : 'bg-slate-100 text-slate-800'
              }`}
            >
              {message.text}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="max-w-xs rounded-2xl bg-slate-100 px-4 py-2 text-sm text-slate-800">
              <span className="inline-block animate-pulse">Pensando...</span>
            </div>
          </div>
        )}
      </div>
      <form onSubmit={sendMessage} className="flex gap-2 border-t border-slate-100 px-5 py-4">
        <input
          type="text"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Pergunte ao seu mentor..."
          disabled={sending || !availableModel}
          className="flex-1 rounded-full border border-slate-200 px-4 py-2 text-sm focus:border-alego-400 focus:outline-none disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!input.trim() || sending || !availableModel}
          className="flex items-center gap-2 rounded-full bg-alego-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          <PaperAirplaneIcon className="h-4 w-4" />
          Enviar
        </button>
      </form>
    </div>
  )
}

export default AIChat
