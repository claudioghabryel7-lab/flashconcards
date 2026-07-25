import { readEnv, isDevEnv } from '@/lib/env.js'
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
  const [quotaCooldown, setQuotaCooldown] = useState(0) // Tempo restante de cooldown por quota
  const [quotaDailyLimit, setQuotaDailyLimit] = useState(false) // Limite diário atingido
  const [usingGroq, setUsingGroq] = useState(false) // Se está usando Groq como fallback
  const MIN_REQUEST_INTERVAL = 5000 // Mínimo de 5 segundos entre requisições (aumentado)

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
      const apiKey = readEnv('VITE_GEMINI_API_KEY')
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
        
        const preferred = [
          'gemini-3.5-flash-lite',
          'gemini-3.6-flash',
          'gemini-3.5-flash',
          'gemini-flash-latest',
        ]
        const generateModels = models
          .filter((model) => {
            const methods = model.supportedGenerationMethods || []
            return methods.includes('generateContent')
          })
          .sort((a, b) => {
            const an = a.name.replace('models/', '')
            const bn = b.name.replace('models/', '')
            const ai = preferred.indexOf(an)
            const bi = preferred.indexOf(bn)
            if (ai === -1 && bi === -1) return 0
            if (ai === -1) return 1
            if (bi === -1) return -1
            return ai - bi
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
            contents: [{ parts: [{ text: 'ok' }] }],
            generationConfig: {
              maxOutputTokens: 1,
              thinkingConfig: { thinkingLevel: 'minimal' },
            },
          })
          setAvailableModel(modelName)
        } catch (testErr) {
          for (let i = 1; i < generateModels.length; i++) {
            try {
              const testModelName = generateModels[i].name.replace('models/', '')
              // Pular Pro no chat (thinking caro)
              if (/pro/i.test(testModelName)) continue
              const testModel = genAI.getGenerativeModel({ model: testModelName })
              await testModel.generateContent({
                contents: [{ parts: [{ text: 'ok' }] }],
                generationConfig: {
                  maxOutputTokens: 1,
                  thinkingConfig: { thinkingLevel: 'minimal' },
                },
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

  // Chamar Groq API como fallback
  const callGroqAPI = async (prompt) => {
    const groqApiKey = readEnv('VITE_GROQ_API_KEY')
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
          max_tokens: 300,
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

  const getMentorResponse = async (userMessage) => {
    const apiKey = readEnv('VITE_GEMINI_API_KEY')
    
    if (!apiKey) {
      return 'API key não configurada. Configure VITE_GEMINI_API_KEY no arquivo .env'
    }

    if (!availableModel) {
      return modelError || 'Aguardando configuração... Tente novamente em alguns segundos.'
    }

    try {
      const genAI = new GoogleGenerativeAI(apiKey)
      const model = genAI.getGenerativeModel({ model: availableModel })

      // Carregar prompt/configuração do edital e texto do PDF (por curso)
      let editalPrompt = null
      let pdfText = null
      let courseName = 'o concurso'
      try {
        // Usar curso selecionado do perfil, ou primeiro curso comprado, ou alego-default
        let courseId = profile?.selectedCourseId
        if (!courseId && profile?.purchasedCourses?.length > 0) {
          courseId = profile.purchasedCourses[0]
        }
        courseId = courseId || 'alego-default'
        
        console.log('📋 Carregando edital para curso:', courseId, 'do perfil:', profile?.selectedCourseId)
        
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
        // Buscar dados do curso (incluindo link de referência)
        let referenceLink = ''
        if (courseId !== 'alego-default') {
          const courseDoc = await getDoc(doc(db, 'courses', courseId))
          if (courseDoc.exists()) {
            const courseData = courseDoc.data()
            courseName = courseData.name || courseData.competition || 'o concurso'
            referenceLink = courseData.referenceLink || ''
          }
        }
        
        // Obter contexto do link de referência
        let linkContext = ''
        if (referenceLink) {
          const { getLinkContextForAI } = await import('../utils/linkContent.js')
          linkContext = await getLinkContextForAI(referenceLink)
        } else {
          courseName = 'ALEGO Policial Legislativo'
        }
      } catch (err) {
        console.error('❌ Erro ao carregar configuração:', err)
      }

      // Construir contexto do aluno
      const progressInfo = userProgress
        ? `Progresso: ${userProgress.totalDays} dias, ${userProgress.totalHours.toFixed(1)}h, ${userProgress.studiedCards} cards.`
        : 'Aluno iniciante.'

      // Combinar texto digitado + texto do PDF + link de referência
      let editalContext = ''
      if (editalPrompt || pdfText || linkContext) {
        editalContext = '\n\n═══════════════════════════════════════════════════════════\n'
        editalContext += `📋 INFORMAÇÕES COMPLETAS DO CONCURSO: ${courseName}\n`
        editalContext += '═══════════════════════════════════════════════════════════\n\n'
        
        // Adicionar contexto do link de referência primeiro (mais importante)
        if (linkContext) {
          editalContext += linkContext + '\n'
        }
        
        if (editalPrompt) {
          editalContext += `📝 TEXTO CONFIGURADO PELO ADMIN:\n${editalPrompt}\n\n`
        }
        
        if (pdfText) {
          console.log('📄 PDF carregado para o chat:', pdfText.length, 'caracteres')
          
          // Estratégia inteligente: início + fim do PDF
          // Isso garante que informações importantes (datas, requisitos) sejam incluídas
          let limitedPdfText = ''
          const totalLength = pdfText.length
          const MAX_PDF_CHARS = 18000
          if (totalLength <= MAX_PDF_CHARS) {
            limitedPdfText = pdfText
            console.log('✅ Usando PDF completo:', totalLength, 'caracteres')
          } else {
            const head = 14000
            const tail = 4000
            const inicio = pdfText.substring(0, head)
            const fim = pdfText.substring(totalLength - tail)
            limitedPdfText = `${inicio}\n\n[... conteúdo intermediário omitido (${totalLength - MAX_PDF_CHARS} caracteres) ...]\n\n${fim}`
            console.log('📄 PDF grande: usando início+fim =', head + tail, 'caracteres')
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
- Respostas CURTAS: máximo 3-4 frases
- Seja DIRETO e OBJETIVO
- Foque em AÇÕES práticas
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

${progressInfo}

Pergunta do aluno: ${userMessage}

⚠️ Lembre-se: Leia o edital/PDF acima ANTES de responder!`

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
              maxOutputTokens: 300,
              topP: 0.9,
              thinkingConfig: { thinkingLevel: 'minimal' },
            },
          })
          break // Sucesso
        } catch (apiErr) {
          // Capturar erro de forma mais robusta
          const errorMessage = apiErr.message || String(apiErr) || ''
          const errorString = JSON.stringify(apiErr) || ''
          
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
            apiErr.status === 429 ||
            apiErr.code === 429 ||
            (apiErr.response && apiErr.response.status === 429)
          
          if (!isQuotaError) {
            // Se não for erro de quota, lança o erro normalmente
            throw apiErr
          }
          
          // Qualquer erro de quota = tentar Groq imediatamente (sem retry com Gemini)
          console.warn('⚠️ Erro de quota detectado. Usando Groq como fallback...')
          setQuotaDailyLimit(true)
          
          // Tentar usar Groq se disponível
          const groqApiKey = readEnv('VITE_GROQ_API_KEY')
          if (groqApiKey) {
            try {
              setUsingGroq(true)
              const groqResponse = await callGroqAPI(fullPrompt)
              // Se Groq funcionou, retornar a resposta
              console.log('✅ Groq respondeu com sucesso!')
              return groqResponse
            } catch (groqErr) {
              console.error('❌ Erro ao usar Groq como fallback:', groqErr)
              setUsingGroq(false)
              // Se Groq também falhar, lançar erro
              throw new Error('QUOTA_DAILY_LIMIT')
            }
          } else {
            // Se não tem Groq configurado, lançar erro
            console.error('❌ Groq API key não configurada')
            throw new Error('QUOTA_DAILY_LIMIT')
          }
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
      
      if (errorMessage === 'QUOTA_DAILY_LIMIT' || errorMessage.includes('QUOTA_DAILY_LIMIT')) {
        return `⏳ LIMITE DIÁRIO ATINGIDO

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
      }
      
      if (isQuotaError) {
        // Tentar extrair o tempo de espera do erro
        const retryMatch = errorMessage.match(/retry in ([\d.]+)s/i) || 
                          errorMessage.match(/(\d+\.?\d*)\s*seconds?/i)
        const waitSeconds = retryMatch ? Math.ceil(parseFloat(retryMatch[1])) : 60
        
        return `⏳ Quota temporária excedida. Aguarde ${waitSeconds} segundos antes de tentar novamente.`
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
        {usingGroq && (
          <p className="mt-1 text-xs text-emerald-600">
            ⚡ Usando Groq (fallback automático)
          </p>
        )}
      </div>
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
          placeholder={quotaDailyLimit ? "Limite diário atingido. Tente amanhã." : "Pergunte ao seu mentor..."}
          disabled={sending || !availableModel || quotaDailyLimit || quotaCooldown > 0}
          className="flex-1 rounded-full border border-slate-200 px-4 py-2 text-sm focus:border-alego-400 focus:outline-none disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!input.trim() || sending || !availableModel || quotaCooldown > 0 || quotaDailyLimit}
          className="flex items-center gap-2 rounded-full bg-alego-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          aria-label={
            quotaDailyLimit ? 'Limite diário atingido' :
            quotaCooldown > 0 ? `Aguarde ${quotaCooldown} segundos` :
            sending ? 'Enviando mensagem...' :
            !input.trim() ? 'Digite uma mensagem para enviar' :
            'Enviar mensagem'
          }
        >
          <PaperAirplaneIcon className="h-4 w-4" aria-hidden="true" />
          {quotaCooldown > 0 ? `Aguarde ${quotaCooldown}s` : (quotaDailyLimit ? '⏳' : 'Enviar')}
        </button>
      </form>
    </div>
  )
}

export default AIChat
