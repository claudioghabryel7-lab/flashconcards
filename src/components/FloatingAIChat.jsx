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
  const [quotaCooldown, setQuotaCooldown] = useState(0) // Tempo restante de cooldown por quota
  const [quotaDailyLimit, setQuotaDailyLimit] = useState(false) // Limite diário atingido
  const [usingGroq, setUsingGroq] = useState(false) // Se está usando Groq como fallback
  const [courseName, setCourseName] = useState('ALEGO') // Nome do curso para exibição
  const MIN_REQUEST_INTERVAL = 5000 // Mínimo de 5 segundos entre requisições (aumentado)
  
  // Dados de progresso para análise
  const [progressData, setProgressData] = useState([])
  const [cardProgress, setCardProgress] = useState({})
  const [allCards, setAllCards] = useState([])
  const [studyStats, setStudyStats] = useState({
    totalDays: 0,
    totalHours: 0,
    bySubject: {},
  })
  
  // Carregar nome do curso
  useEffect(() => {
    const loadCourseName = async () => {
      try {
        const courseId = profile?.selectedCourseId || 'alego-default'
        if (courseId !== 'alego-default') {
          const courseDoc = await getDoc(doc(db, 'courses', courseId))
          if (courseDoc.exists()) {
            const name = courseDoc.data().name || courseDoc.data().competition || 'ALEGO'
            setCourseName(name)
          }
        } else {
          setCourseName('ALEGO')
        }
      } catch (err) {
        console.error('Erro ao carregar nome do curso:', err)
      }
    }
    if (profile) {
      loadCourseName()
    }
  }, [profile])

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
        const analysis = await analyzeProgress()
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
  const analyzeProgress = async () => {
    // Buscar nome do curso
    let courseName = 'o concurso'
    try {
      const courseId = profile?.selectedCourseId || 'alego-default'
      if (courseId !== 'alego-default') {
        const courseDoc = await getDoc(doc(db, 'courses', courseId))
        if (courseDoc.exists()) {
          courseName = courseDoc.data().name || courseDoc.data().competition || 'o concurso'
        }
      } else {
        courseName = 'ALEGO Policial Legislativo'
      }
    } catch (err) {
      console.error('Erro ao buscar nome do curso:', err)
    }
    
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

    return `Analise meu progresso em ${courseName}:

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

  // Chamar Groq API como fallback
  const callGroqAPI = async (prompt) => {
    const groqApiKey = import.meta.env.VITE_GROQ_API_KEY
    if (!groqApiKey) {
      throw new Error('GROQ_API_KEY não configurada')
    }

    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${groqApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile', // Modelo rápido e eficiente
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.7,
          max_tokens: 800,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error?.message || `Groq API error: ${response.status}`)
      }

      const data = await response.json()
      return data.choices[0]?.message?.content || 'Desculpe, não consegui gerar uma resposta.'
    } catch (err) {
      console.error('Erro ao chamar Groq API:', err)
      throw err
    }
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

      // Carregar prompt do admin e texto do PDF (por curso)
      let editalPrompt = null
      let pdfText = null
      let courseName = 'o concurso'
      try {
        const courseId = profile?.selectedCourseId || 'alego-default'
        const editalRef = doc(db, 'courses', courseId, 'prompts', 'edital')
        const editalDoc = await getDoc(editalRef)
        
        if (editalDoc.exists()) {
          const data = editalDoc.data()
          editalPrompt = data.prompt || data.content || ''
          pdfText = data.pdfText || ''
          
          // Log para debug
          console.log('📋 Edital carregado para o chat:')
          console.log('  - Curso:', courseId)
          console.log('  - Texto digitado:', editalPrompt ? `${editalPrompt.length} caracteres` : 'não há')
          console.log('  - Texto do PDF:', pdfText ? `${pdfText.length} caracteres` : 'não há')
          
          if (!pdfText && !editalPrompt) {
            console.warn('⚠️ ATENÇÃO: Nenhum edital/PDF encontrado no Firestore!')
          }
        } else {
          // Fallback para config antigo (migração)
          const oldEditalDoc = await getDoc(doc(db, 'config', 'edital'))
          if (oldEditalDoc.exists()) {
            const data = oldEditalDoc.data()
            editalPrompt = data.prompt || data.content || ''
            pdfText = data.pdfText || ''
          } else {
            console.warn('⚠️ Documento de edital não existe no Firestore!')
          }
        }
        
        // Buscar nome do curso
        if (courseId !== 'alego-default') {
          const courseDoc = await getDoc(doc(db, 'courses', courseId))
          if (courseDoc.exists()) {
            courseName = courseDoc.data().name || courseDoc.data().competition || 'o concurso'
          }
        } else {
          courseName = 'ALEGO Policial Legislativo'
        }
      } catch (err) {
        console.error('❌ Erro ao carregar configuração:', err)
      }

      // Combinar texto digitado + texto do PDF
      let editalContext = ''
      if (editalPrompt || pdfText) {
        editalContext = '\n\n═══════════════════════════════════════════════════════════\n'
        editalContext += `📋 INFORMAÇÕES COMPLETAS DO CONCURSO: ${courseName}\n`
        editalContext += '═══════════════════════════════════════════════════════════\n\n'
        
        if (editalPrompt) {
          editalContext += `📝 TEXTO CONFIGURADO PELO ADMIN:\n${editalPrompt}\n\n`
        }
        
        if (pdfText) {
          console.log('📄 PDF carregado para o chat:', pdfText.length, 'caracteres')
          
          // Estratégia inteligente: início + fim do PDF
          // Isso garante que informações importantes (datas, requisitos) sejam incluídas
          let limitedPdfText = ''
          const totalLength = pdfText.length
          if (totalLength <= 50000) {
            // PDF pequeno/médio: usar tudo
            limitedPdfText = pdfText
            console.log('✅ Usando PDF completo:', totalLength, 'caracteres')
          } else {
            // PDF grande: início (40000) + fim (10000)
            const inicio = pdfText.substring(0, 40000)
            const fim = pdfText.substring(totalLength - 10000)
            limitedPdfText = `${inicio}\n\n[... conteúdo intermediário omitido (${totalLength - 50000} caracteres) ...]\n\n${fim}`
            console.log('📄 PDF grande: usando início (40000) + fim (10000) =', inicio.length + fim.length, 'caracteres')
          }
          
          editalContext += `📄 CONTEÚDO COMPLETO DO PDF DO EDITAL/CRONOGRAMA:\n`
          editalContext += `⚠️ ATENÇÃO: Leia e analise TODO o conteúdo abaixo com MUITA ATENÇÃO.\n`
          editalContext += `Este PDF contém TODAS as informações do edital, incluindo:\n`
          editalContext += `- Datas importantes (prova, inscrição, etc.)\n`
          editalContext += `- Número de questões\n`
          editalContext += `- Conteúdo programático completo\n`
          editalContext += `- Requisitos e critérios\n`
          editalContext += `- Cronograma detalhado\n`
          editalContext += `- Tópicos específicos de cada matéria\n\n`
          editalContext += `${limitedPdfText}\n\n`
        }
        
        editalContext += '═══════════════════════════════════════════════════════════\n'
        editalContext += '⚠️ REGRA CRÍTICA: Use APENAS as informações acima para responder.\n'
        editalContext += 'Se a informação estiver no edital/PDF acima, você DEVE usá-la.\n'
        editalContext += 'NUNCA diga "não há informação" se a informação estiver no texto acima.\n'
        editalContext += 'Leia o edital com atenção antes de responder qualquer pergunta.\n'
        editalContext += '═══════════════════════════════════════════════════════════\n'
      } else {
        console.warn('⚠️ Nenhum edital/PDF carregado para o chat')
      }

      const mentorPrompt = `Você é o "Flash Mentor", mentor ${courseName}.

REGRAS DE RESPOSTA:
- Respostas COMPLETAS e OBJETIVAS: 3-6 frases bem formadas
- Seja DIRETO mas COMPLETO - termine suas frases
- Foque em AÇÕES práticas
- SEMPRE termine suas respostas com pontuação final
- Responda APENAS sobre ${courseName}

${editalContext}

INSTRUÇÕES CRÍTICAS:
1. ANTES de responder qualquer pergunta, LEIA TODO o edital/PDF acima com atenção
2. PROCURE a informação no edital/PDF antes de dizer que não sabe
3. Se a informação estiver no edital/PDF, você DEVE usá-la na resposta
4. NUNCA diga "não há informação" se a informação estiver no edital/PDF
5. Se perguntarem sobre:
   - Datas → procure no edital/PDF
   - Número de questões → procure no edital/PDF
   - Tópicos de matérias → procure no edital/PDF
   - Requisitos → procure no edital/PDF
   - Qualquer coisa sobre o concurso → procure no edital/PDF primeiro

MATÉRIAS: Português, Área de Atuação (PL), Raciocínio Lógico, Constitucional, Administrativo, Legislação Estadual, Realidade de Goiás, Redação.

Pergunta do aluno: ${userMessage}

⚠️ Lembre-se: Leia o edital/PDF acima ANTES de responder!`

      // Tentar gerar resposta com Gemini primeiro
      let result = null
      let useGroqFallback = false
      
      try {
        result = await model.generateContent({
          contents: [{ parts: [{ text: mentorPrompt }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 800,
            topP: 0.9,
            topK: 40,
          },
        })
      } catch (apiErr) {
        // Capturar erro de forma mais robusta
        const errorMessage = apiErr.message || String(apiErr) || ''
        const errorString = JSON.stringify(apiErr) || ''
        
        console.log('🔍 Erro capturado:', {
          message: errorMessage.substring(0, 200),
          status: apiErr.status,
          code: apiErr.code,
          hasQuota: errorMessage.includes('quota') || errorString.includes('quota'),
          has429: errorMessage.includes('429') || errorString.includes('429')
        })
        
        // Verificar se é erro de quota (429 ou mensagens relacionadas)
        const isQuotaError = 
          errorMessage.includes('429') || 
          errorMessage.includes('quota') ||
          errorMessage.includes('Quota exceeded') ||
          errorMessage.includes('Too Many Requests') ||
          errorMessage.includes('RESOURCE_EXHAUSTED') ||
          errorMessage.includes('rate limit') ||
          errorString.includes('429') ||
          errorString.includes('quota') ||
          errorString.includes('Quota exceeded') ||
          errorString.includes('free_tier_requests') ||
          apiErr.status === 429 ||
          apiErr.code === 429 ||
          (apiErr.response && apiErr.response.status === 429)
        
        if (isQuotaError) {
          // Qualquer erro de quota = tentar Groq imediatamente
          console.warn('⚠️ Erro de quota detectado. Usando Groq como fallback...')
          useGroqFallback = true
        } else {
          // Se não for erro de quota, lança o erro normalmente
          console.log('❌ Erro não é de quota, lançando erro original')
          throw apiErr
        }
      }
      
      // Se detectou erro de quota, usar Groq como fallback
      if (useGroqFallback) {
        const groqApiKey = import.meta.env.VITE_GROQ_API_KEY
        if (groqApiKey) {
          try {
            console.log('🔄 Tentando usar Groq como fallback...')
            setUsingGroq(true)
            setQuotaDailyLimit(true)
            
            const groqResponse = await callGroqAPI(mentorPrompt)
            
            // Se Groq funcionou, salvar resposta e retornar
            const chatRef = collection(db, 'chats', user.uid, 'messages')
            await addDoc(chatRef, {
              text: groqResponse,
              sender: 'ai',
              createdAt: serverTimestamp(),
            })
            
            console.log('✅ Groq respondeu com sucesso!')
            setSending(false)
            return // Sucesso com Groq
          } catch (groqErr) {
            console.error('❌ Erro ao usar Groq como fallback:', groqErr)
            setUsingGroq(false)
            // Se Groq também falhar, continuar para mostrar erro
            throw new Error('QUOTA_DAILY_LIMIT')
          }
        } else {
          // Se não tem Groq configurado, lançar erro
          console.error('❌ Groq API key não configurada')
          throw new Error('QUOTA_DAILY_LIMIT')
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
      const errorString = JSON.stringify(err) || ''
      const isQuotaError = 
        errorMsg.includes('429') || 
        errorMsg.includes('quota') ||
        errorMsg.includes('Quota exceeded') ||
        errorMsg.includes('Too Many Requests') ||
        errorMsg.includes('RESOURCE_EXHAUSTED') ||
        errorMsg.includes('rate limit') ||
        errorString.includes('429') ||
        errorString.includes('quota') ||
        errorString.includes('Quota exceeded') ||
        err.status === 429 ||
        err.code === 429
      
      // Verificar se é limite diário
      const isDailyLimit = errorMsg === 'QUOTA_DAILY_LIMIT' || 
                          errorMsg.includes('QUOTA_DAILY_LIMIT') ||
                          errorMsg.includes('free_tier_requests') ||
                          errorString.includes('free_tier_requests') ||
                          (errorMsg.includes('200') && errorMsg.includes('quota'))
      
      if (isDailyLimit) {
        setQuotaDailyLimit(true)
        errorMessage = `⏳ LIMITE DIÁRIO ATINGIDO

Você atingiu o limite de 200 requisições/dia do plano gratuito do Google Gemini API.

📋 COMO RESOLVER:

1. AGUARDAR: O limite será resetado automaticamente amanhã (meia-noite UTC)

2. FAZER UPGRADE (RECOMENDADO):
   - Acesse: https://ai.google.dev/pricing
   - Faça upgrade para um plano pago
   - Planos pagos têm limites muito maiores (milhares de requisições/dia)
   - O custo é baixo: ~$0.0001 por requisição

3. CONFIGURAR NOVA API KEY:
   - Após fazer upgrade, gere uma nova API key no Google AI Studio
   - Substitua a VITE_GEMINI_API_KEY no arquivo .env
   - Reinicie o servidor

O chat estará disponível novamente amanhã ou após configurar um plano pago.`
      } else if (isQuotaError) {
        // Tentar extrair o tempo de espera do erro
        const retryMatch = errorMsg.match(/retry in ([\d.]+)s/i) || 
                          errorMsg.match(/(\d+\.?\d*)\s*seconds?/i)
        const waitSeconds = retryMatch ? Math.ceil(parseFloat(retryMatch[1])) : 60
        
        errorMessage = `⏳ Quota temporária excedida. Aguarde ${waitSeconds} segundos antes de tentar novamente.`
      } else if (errorMsg.includes('API key')) {
        errorMessage = 'Erro na configuração da API. Verifique a chave do Gemini.'
      }
      
      // Sempre salvar a mensagem de erro no chat
      try {
        await addDoc(chatRef, {
          text: errorMessage,
          sender: 'ai',
          createdAt: serverTimestamp(),
        })
      } catch (saveErr) {
        console.error('Erro ao salvar mensagem de erro:', saveErr)
      }
    }
  }

  // Enviar mensagem do usuário
  const sendMessage = async (event) => {
    event?.preventDefault()
    if (!input.trim() || !user || sending) return
    
    // Verificar se está em cooldown de quota
    if (quotaCooldown > 0) {
      const chatRef = collection(db, 'chats', user.uid, 'messages')
      await addDoc(chatRef, {
        text: `⏳ Quota excedida. Aguarde ${quotaCooldown} segundo(s) antes de tentar novamente.`,
        sender: 'ai',
        createdAt: serverTimestamp(),
      })
      return
    }
    
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
                  Mentor do Concurso {courseName}
                </p>
                {usingGroq && (
                  <p className={`text-xs ${
                    darkMode ? 'text-emerald-400' : 'text-emerald-600'
                  }`}>
                    ⚡ Usando Groq (fallback)
                  </p>
                )}
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
              {quotaDailyLimit && (
                <div className={`rounded-lg border-2 p-4 mb-4 ${
                  darkMode 
                    ? 'border-amber-500/50 bg-amber-900/20 text-amber-200' 
                    : 'border-amber-500 bg-amber-50 text-amber-800'
                }`}>
                  <p className="font-bold mb-2">⏳ Limite Diário Atingido</p>
                  <p className="text-xs mb-2">
                    Você atingiu o limite de 200 requisições/dia do plano gratuito.
                  </p>
                  <p className="text-xs font-semibold mb-1">Para remover o limite:</p>
                  <ol className="text-xs list-decimal list-inside space-y-1 mb-2">
                    <li>Acesse <a href="https://ai.google.dev/pricing" target="_blank" rel="noopener noreferrer" className="underline">ai.google.dev/pricing</a></li>
                    <li>Faça upgrade para um plano pago</li>
                    <li>Configure a nova API key no .env</li>
                  </ol>
                  <p className="text-xs">
                    O limite será resetado amanhã automaticamente.
                  </p>
                </div>
              )}
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
                placeholder={quotaDailyLimit ? "Limite diário atingido. Tente amanhã." : (initialMessageSent ? "Pergunte ao seu mentor..." : "Aguardando análise...")}
                disabled={sending || !availableModel || !initialMessageSent || quotaDailyLimit || quotaCooldown > 0}
                className={`flex-1 rounded-full border px-4 py-2 text-sm focus:outline-none disabled:opacity-50 ${
                  darkMode
                    ? 'border-slate-600 bg-slate-700 text-slate-200 focus:border-alego-500'
                    : 'border-slate-200 bg-white text-slate-800 focus:border-alego-400'
                }`}
              />
              <button
                type="submit"
                disabled={!input.trim() || sending || !availableModel || !initialMessageSent || quotaCooldown > 0 || quotaDailyLimit}
                className="flex items-center gap-2 rounded-full bg-alego-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                <PaperAirplaneIcon className="h-4 w-4" />
                {quotaCooldown > 0 && <span className="text-xs">{quotaCooldown}s</span>}
                {quotaDailyLimit && <span className="text-xs">⏳</span>}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

export default FloatingAIChat

