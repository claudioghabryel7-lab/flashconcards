import { useEffect, useMemo, useState } from 'react'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore'
import { DocumentTextIcon, TrashIcon, UserPlusIcon, PlusIcon, SparklesIcon, DocumentArrowUpIcon } from '@heroicons/react/24/outline'
import { createUserWithEmailAndPassword } from 'firebase/auth'
import { auth, db, storage } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import * as pdfjsLib from 'pdfjs-dist'

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


const AdminPanel = () => {
  const { isAdmin } = useAuth()
  const [cards, setCards] = useState([])
  const [users, setUsers] = useState([])
  const [presence, setPresence] = useState({}) // { uid: { status, lastSeen } }
  const [jsonInput, setJsonInput] = useState('')
  const [message, setMessage] = useState('')
  const [userForm, setUserForm] = useState({ email: '', password: '', name: '', role: 'student' })
  
  // Estado para gerenciar módulos
  const [selectedMateriaForModule, setSelectedMateriaForModule] = useState('')
  const [newModuleName, setNewModuleName] = useState('')
  const [modules, setModules] = useState({}) // { materia: [modulos] }
  
  // Estado para criação de flashcards
  const [flashcardForm, setFlashcardForm] = useState({
    materia: '',
    modulo: '',
    pergunta: '',
    resposta: '',
  })
  const [editalPrompt, setEditalPrompt] = useState('')
  const [savingPrompt, setSavingPrompt] = useState(false)
  const [promptStatus, setPromptStatus] = useState(null)
  const [pdfFile, setPdfFile] = useState(null)
  const [pdfText, setPdfText] = useState('')
  const [extractingPdf, setExtractingPdf] = useState(false)
  const [pdfUrl, setPdfUrl] = useState('')
  const [expandedCardMaterias, setExpandedCardMaterias] = useState({})
  const [expandedCardModulos, setExpandedCardModulos] = useState({})
  
  // Estado para geração automática com IA
  const [aiGenerationPrompt, setAiGenerationPrompt] = useState('')
  const [aiGenerationConfig, setAiGenerationConfig] = useState({
    materia: '',
    quantidadeModulos: 1,
    flashcardsPorModulo: 20,
  })
  const [generating, setGenerating] = useState(false)
  const [generationProgress, setGenerationProgress] = useState('')

  // Configurar PDF.js worker
  useEffect(() => {
    // Usar CDN do unpkg que é mais confiável
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`
  }, [])

  // Carregar edital e PDF salvo
  useEffect(() => {
    if (!isAdmin) return
    
    const loadEdital = async () => {
      try {
        const editalDoc = await getDoc(doc(db, 'config', 'edital'))
        if (editalDoc.exists()) {
          const data = editalDoc.data()
          setEditalPrompt(data.prompt || '')
          setPdfText(data.pdfText || '')
          setPdfUrl(data.pdfUrl || '')
          
          if (data.pdfText) {
            console.log('📄 Texto do PDF carregado:', data.pdfText.length, 'caracteres')
          }
        }
      } catch (err) {
        console.error('Erro ao carregar edital:', err)
      }
    }
    loadEdital()
  }, [isAdmin])

  // Extrair texto do PDF
  const extractTextFromPDF = async (file) => {
    setExtractingPdf(true)
    try {
      setMessage('📄 Carregando PDF...')
      const arrayBuffer = await file.arrayBuffer()
      
      setMessage('📄 Processando PDF (pode demorar para arquivos grandes)...')
      
      // Configurar worker antes de processar (com fallback)
      if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`
      }
      
      let pdf
      try {
        pdf = await pdfjsLib.getDocument({ 
          data: arrayBuffer,
          useSystemFonts: true,
          verbosity: 0,
        }).promise
      } catch (workerErr) {
        // Se falhar com worker, tentar sem worker (mais lento mas funciona)
        console.warn('Erro com worker, tentando sem worker...', workerErr)
        pdfjsLib.GlobalWorkerOptions.workerSrc = ''
        pdf = await pdfjsLib.getDocument({ 
          data: arrayBuffer,
          useSystemFonts: true,
          verbosity: 0,
        }).promise
      }
      
      let fullText = ''
      const numPages = pdf.numPages
      setMessage(`📄 Extraindo texto de ${numPages} página(s)...`)
      
      // Processar página por página com progresso
      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        try {
          setMessage(`📄 Processando página ${pageNum}/${numPages}...`)
          const page = await pdf.getPage(pageNum)
          const textContent = await page.getTextContent()
          const pageText = textContent.items
            .map(item => item.str)
            .filter(str => str && str.trim().length > 0)
            .join(' ')
          
          if (pageText.trim()) {
            fullText += `\n\n--- Página ${pageNum} ---\n\n${pageText}`
          }
          
          // Salvar até 100000 caracteres no Firestore (podemos usar estratégia inteligente depois)
          // Isso permite PDFs maiores sem perder informações importantes
          if (fullText.length > 100000) {
            // Para PDFs muito grandes, usar estratégia: início + fim
            const inicio = fullText.substring(0, 80000)
            const fim = fullText.substring(fullText.length - 20000)
            fullText = `${inicio}\n\n[... conteúdo intermediário omitido (${fullText.length - 100000} caracteres) ...]\n\n${fim}`
            setMessage(`⚠️ PDF muito grande. Salvando início + fim para preservar informações importantes.`)
            break
          }
        } catch (pageErr) {
          console.warn(`Erro ao processar página ${pageNum}:`, pageErr)
          // Continuar com próxima página
          continue
        }
      }
      
      const finalText = fullText.trim()
      setPdfText(finalText)
      setMessage(`✅ Texto extraído do PDF com sucesso! (${numPages} página(s), ${finalText.length} caracteres)`)
      return finalText
    } catch (err) {
      console.error('Erro ao extrair texto do PDF:', err)
      
      // Tentar mensagem de erro mais amigável
      let errorMsg = err.message || 'Erro desconhecido'
      if (errorMsg.includes('worker') || errorMsg.includes('Failed to fetch')) {
        errorMsg = 'Erro ao carregar biblioteca de PDF. Tente novamente ou use um PDF menor.'
      }
      
      setMessage(`❌ Erro ao extrair texto do PDF: ${errorMsg}`)
      throw err
    } finally {
      setExtractingPdf(false)
    }
  }

  // Upload e processar PDF
  const handlePdfUpload = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (file.type !== 'application/pdf') {
      setMessage('❌ Por favor, selecione um arquivo PDF.')
      return
    }

    if (file.size > 50 * 1024 * 1024) { // 50MB
      setMessage('❌ O arquivo PDF é muito grande. Máximo: 50MB')
      return
    }

    setPdfFile(file)
    setMessage('Processando PDF...')

    try {
      // Extrair texto do PDF
      const extractedText = await extractTextFromPDF(file)

      // Upload do PDF para Firebase Storage
      const storageRef = ref(storage, `edital/${Date.now()}_${file.name}`)
      await uploadBytes(storageRef, file)
      const downloadUrl = await getDownloadURL(storageRef)

      setPdfUrl(downloadUrl)
      setMessage(`✅ PDF processado e salvo com sucesso!`)
    } catch (err) {
      console.error('Erro ao processar PDF:', err)
      setMessage(`❌ Erro ao processar PDF: ${err.message}`)
      setPdfFile(null)
    }
  }

  useEffect(() => {
    const cardsRef = collection(db, 'flashcards')
    const unsubCards = onSnapshot(cardsRef, (snapshot) => {
      const data = snapshot.docs.map((docSnapshot) => ({
        id: docSnapshot.id,
        ...docSnapshot.data(),
      }))
      setCards(data)
      
      // Extrair módulos únicos por matéria dos cards existentes
      const modulesByMateria = {}
      data.forEach((card) => {
        if (card.materia && card.modulo) {
          if (!modulesByMateria[card.materia]) {
            modulesByMateria[card.materia] = []
          }
          if (!modulesByMateria[card.materia].includes(card.modulo)) {
            modulesByMateria[card.materia].push(card.modulo)
          }
        }
      })

      Object.keys(modulesByMateria).forEach((materia) => {
        modulesByMateria[materia].sort((a, b) =>
          a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' }),
        )
      })

      setModules(modulesByMateria)
    })

    const usersRef = collection(db, 'users')
    const unsubUsers = onSnapshot(usersRef, (snapshot) => {
      const data = snapshot.docs.map((docSnapshot) => ({
        uid: docSnapshot.id,
        ...docSnapshot.data(),
      }))
      setUsers(data)
    })

    // Carregar status online/offline dos usuários
    const presenceRef = collection(db, 'presence')
    const unsubPresence = onSnapshot(
      presenceRef, 
      (snapshot) => {
        const presenceData = {}
        snapshot.docs.forEach((docSnapshot) => {
          const data = docSnapshot.data()
          const uid = docSnapshot.id || data.uid // Usar ID do documento (que é o UID) ou data.uid como fallback
          if (uid) {
            presenceData[uid] = {
              status: data.status || 'offline',
              lastSeen: data.lastSeen,
              updatedAt: data.updatedAt,
            }
          }
        })
        console.log('Presence data atualizado:', presenceData)
        setPresence(presenceData)
      },
      (error) => {
        console.error('Erro ao carregar presence:', error)
      }
    )

    return () => {
      unsubCards()
      unsubUsers()
      unsubPresence()
    }
  }, [])

  const normalizeTags = (tags) => {
    if (Array.isArray(tags)) return tags
    if (!tags) return []
    return String(tags)
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean)
  }

  const cardsOrganized = useMemo(() => {
    const grouped = {}
    cards.forEach((card) => {
      const materia = card.materia || 'Sem matéria'
      const modulo = card.modulo || 'Sem módulo'
      if (!grouped[materia]) {
        grouped[materia] = {}
      }
      if (!grouped[materia][modulo]) {
        grouped[materia][modulo] = []
      }
      grouped[materia][modulo].push(card)
    })
    return grouped
  }, [cards])

  const toggleCardMateria = (materia) => {
    setExpandedCardMaterias((prev) => ({
      ...prev,
      [materia]: !prev[materia],
    }))
  }

  const toggleCardModulo = (materia, modulo) => {
    const key = `${materia}::${modulo}`
    setExpandedCardModulos((prev) => ({
      ...prev,
      [key]: !prev[key],
    }))
  }

  // Adicionar módulo a uma matéria
  const addModule = () => {
    if (!selectedMateriaForModule || !newModuleName.trim()) {
      setMessage('Selecione a matéria e digite o nome do módulo.')
      return
    }

    const moduleName = newModuleName.trim()
    
    // Verificar se o módulo já existe
    if (modules[selectedMateriaForModule]?.includes(moduleName)) {
      setMessage('Este módulo já existe nesta matéria.')
      return
    }

    setModules((prev) => ({
      ...prev,
      [selectedMateriaForModule]: [...(prev[selectedMateriaForModule] || []), moduleName],
    }))
    
    setNewModuleName('')
    setMessage(`Módulo "${moduleName}" adicionado a ${selectedMateriaForModule}!`)
  }

  // Remover módulo
  const removeModule = (materia, modulo) => {
    if (!window.confirm(`Deseja remover o módulo "${modulo}" de ${materia}?`)) return
    
    setModules((prev) => ({
      ...prev,
      [materia]: (prev[materia] || []).filter((m) => m !== modulo),
    }))
    setMessage(`Módulo "${modulo}" removido!`)
  }

  // Criar flashcard
  const createFlashcard = async () => {
    if (!flashcardForm.materia || !flashcardForm.modulo || !flashcardForm.pergunta || !flashcardForm.resposta) {
      setMessage('Preencha matéria, módulo, pergunta e resposta.')
      return
    }

    try {
      const cardsRef = collection(db, 'flashcards')
      await addDoc(cardsRef, {
        pergunta: flashcardForm.pergunta,
        resposta: flashcardForm.resposta,
        materia: flashcardForm.materia,
        modulo: flashcardForm.modulo,
        tags: [],
      })
      
      setFlashcardForm({
        materia: flashcardForm.materia, // Mantém a matéria selecionada
        modulo: flashcardForm.modulo, // Mantém o módulo selecionado
        pergunta: '',
        resposta: '',
      })
      setMessage('Flashcard criado com sucesso! Todos os usuários poderão vê-lo.')
    } catch (err) {
      setMessage('Erro ao criar flashcard.')
      console.error(err)
    }
  }

  const handleImport = async () => {
    try {
      const parsed = JSON.parse(jsonInput)
      const list = Array.isArray(parsed) ? parsed : [parsed]
      const cardsRef = collection(db, 'flashcards')
      await Promise.all(
        list.map((card) =>
          addDoc(cardsRef, {
            ...card,
            tags: normalizeTags(card.tags),
          }),
        ),
      )
      setJsonInput('')
      setMessage('Flashcards importados com sucesso!')
    } catch (err) {
      setMessage('JSON inválido. Verifique a estrutura.')
    }
  }

  const createUser = async () => {
    if (!userForm.email || !userForm.password) {
      setMessage('Preencha email e senha.')
      return
    }

    try {
      const email = userForm.email.toLowerCase().trim()
      
      // Criar usuário no Firebase Authentication
      const userCredential = await createUserWithEmailAndPassword(auth, email, userForm.password)
      const uid = userCredential.user.uid

      // Criar perfil no Firestore (sem campo deleted, garantindo acesso)
      const userRef = doc(db, 'users', uid)
      await setDoc(userRef, {
        uid,
        email,
        displayName: userForm.name || email,
        role: userForm.role || 'student',
        favorites: [],
        createdAt: serverTimestamp(),
        // Garantir que deleted não existe ou está false
        deleted: false,
      })

      setUserForm({ email: '', password: '', name: '', role: 'student' })
      setMessage('Usuário criado com sucesso! O novo aluno já pode fazer login.')
    } catch (err) {
      console.error('Erro ao criar usuário:', err)
      if (err.code === 'auth/email-already-in-use') {
        // Email já existe no Firebase Auth - pode ser um usuário que foi removido
        // Tentar encontrar o UID pelo email (não é possível diretamente, mas podemos informar)
        setMessage('Este email já está cadastrado no Firebase Authentication. Se o usuário foi removido, você precisa deletá-lo também no Firebase Console > Authentication antes de recriar, ou o usuário pode fazer login com a senha antiga.')
      } else if (err.code === 'auth/weak-password') {
        setMessage('Senha muito fraca. Use pelo menos 6 caracteres.')
      } else {
        setMessage(`Erro ao criar usuário: ${err.message}`)
      }
    }
  }

  const removeUser = async (userUid) => {
    if (!window.confirm(`Deseja realmente excluir este usuário? Esta ação não pode ser desfeita.`)) return
    try {
      // 1. Registrar na coleção deletedUsers ANTES de deletar (para bloquear recriação)
      const deletedUserRef = doc(db, 'deletedUsers', userUid)
      await setDoc(deletedUserRef, {
        uid: userUid,
        deletedAt: serverTimestamp(),
        deletedBy: 'admin',
      })
      
      // 2. Marcar como deletado no documento do usuário (para bloquear acesso imediato)
      const userRef = doc(db, 'users', userUid)
      await setDoc(userRef, { 
        deleted: true, 
        deletedAt: serverTimestamp() 
      }, { merge: true })
      
      // 3. Aguardar um momento para garantir que as marcações foram salvas
      await new Promise(resolve => setTimeout(resolve, 500))
      
      // 4. Deletar do Firestore
      await deleteDoc(userRef)
      
      // 5. Tentar deletar do Firebase Authentication usando API REST
      // Nota: Isso requer token de admin, então pode falhar silenciosamente
      // O importante é que o registro em deletedUsers impede a recriação
      try {
        const userDoc = await getDoc(userRef)
        const userData = userDoc.exists() ? userDoc.data() : null
        const userEmail = userData?.email
        
        if (userEmail) {
          // Tentar deletar via API REST do Firebase (requer configuração adicional)
          // Por enquanto, apenas informar que precisa deletar manualmente
          console.log(`Usuário ${userEmail} (${userUid}) marcado como deletado. Para remover completamente do Firebase Auth, delete manualmente no Console.`)
        }
      } catch (authErr) {
        console.warn('Não foi possível deletar do Firebase Auth automaticamente:', authErr)
      }
      
      setMessage('Usuário removido do sistema. O acesso foi bloqueado permanentemente. O usuário não conseguirá mais fazer login.')
    } catch (err) {
      console.error('Erro ao remover usuário:', err)
      setMessage(`Erro ao remover usuário: ${err.message}`)
    }
  }

  const removeCard = async (cardId) => {
    if (!window.confirm('Deseja realmente excluir este card?')) return
    await deleteDoc(doc(db, 'flashcards', cardId))
    setMessage('Card removido.')
  }

  // Salvar prompt/configuração do edital
  const handleSavePrompt = async () => {
    if (!editalPrompt.trim() && !pdfText.trim()) {
      setMessage('Digite as informações do concurso ou faça upload de um PDF.')
      return
    }

    setSavingPrompt(true)
    setMessage('Salvando configuração...')

    try {
      const editalRef = doc(db, 'config', 'edital')
      const dataToSave = {
        prompt: editalPrompt.trim(),
        updatedAt: serverTimestamp(),
      }

      // Adicionar texto do PDF se houver
      if (pdfText.trim()) {
        dataToSave.pdfText = pdfText.trim()
      }

      // Adicionar URL do PDF se houver
      if (pdfUrl) {
        dataToSave.pdfUrl = pdfUrl
      }

      await setDoc(editalRef, dataToSave)

      const infoText = pdfText.trim() 
        ? `Texto do PDF e informações do edital salvos com sucesso!`
        : 'Configuração salva com sucesso! A IA agora usará essas informações para responder perguntas.'
      
      setMessage(infoText)
      setPromptStatus({
        saved: true,
        savedAt: new Date().toISOString(),
      })
    } catch (err) {
      console.error('Erro ao salvar prompt:', err)
      setMessage(`Erro ao salvar: ${err.message}`)
    } finally {
      setSavingPrompt(false)
    }
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
          model: 'llama-3.3-70b-versatile',
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.7,
          max_tokens: 8000,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error?.message || `Groq API error: ${response.status}`)
      }

      const data = await response.json()
      return data.choices[0]?.message?.content || ''
    } catch (err) {
      console.error('Erro ao chamar Groq API:', err)
      throw err
    }
  }

  // Gerar módulos e flashcards automaticamente com IA
  const generateWithAI = async () => {
    if (!aiGenerationConfig.materia) {
      setMessage('Selecione uma matéria para gerar os módulos e flashcards.')
      return
    }

    setGenerating(true)
    setGenerationProgress('Iniciando geração...')
    setMessage('')

    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY
      const groqApiKey = import.meta.env.VITE_GROQ_API_KEY
      
      if (!apiKey && !groqApiKey) {
        throw new Error('Configure VITE_GEMINI_API_KEY ou VITE_GROQ_API_KEY no .env')
      }

      // Carregar informações do edital e PDF
      let editalInfo = ''
      let pdfTextContent = ''
      try {
        const editalDoc = await getDoc(doc(db, 'config', 'edital'))
        if (editalDoc.exists()) {
          const data = editalDoc.data()
          editalInfo = data.prompt || ''
          pdfTextContent = data.pdfText || ''
          
          if (pdfTextContent) {
            console.log('📄 Usando texto do PDF:', pdfTextContent.length, 'caracteres')
          }
        }
      } catch (err) {
        console.warn('Erro ao carregar edital/PDF:', err)
      }

      const { materia, quantidadeModulos, flashcardsPorModulo } = aiGenerationConfig
      const totalFlashcards = quantidadeModulos * flashcardsPorModulo

      // Estratégia inteligente para incluir mais conteúdo do PDF:
      // - Primeiros 50000 caracteres (geralmente tem informações principais, cronograma, etc.)
      // - Últimos 15000 caracteres (geralmente tem datas, requisitos finais, anexos, etc.)
      // Isso garante que informações importantes no início E no fim sejam incluídas
      // Total: até 65000 caracteres (muito mais que antes)
      let limitedPdfText = ''
      if (pdfTextContent) {
        const totalLength = pdfTextContent.length
        if (totalLength <= 65000) {
          // PDF pequeno/médio: usar tudo
          limitedPdfText = pdfTextContent
          console.log(`📄 PDF completo usado: ${totalLength} caracteres`)
        } else {
          // PDF grande: início (50000) + fim (15000) = 65000 chars
          const inicio = pdfTextContent.substring(0, 50000)
          const fim = pdfTextContent.substring(totalLength - 15000)
          limitedPdfText = `${inicio}\n\n[... conteúdo intermediário omitido (${totalLength - 65000} caracteres) para economizar tokens ...]\n\n${fim}`
          console.log(`📄 PDF grande (${totalLength} chars): usando início (50000) + fim (15000) = ${inicio.length + fim.length} chars`)
        }
      }

      // Prompt padrão obrigatório
      const defaultPrompt = `Gere módulos e flashcards completos, organizados conforme o conteúdo configurado acima, seguindo estas instruções:

📌 REGRAS GERAIS

1. Cada módulo deve conter ${flashcardsPorModulo} flashcards completos.

2. Cada flashcard deve ter:
• Pergunta objetiva
• Resposta clara, direta e completa
• Explicação aplicada a situações reais
• Linguagem simples e profissional
• Nível de dificuldade FGV

3. Todo o conteúdo deve ser:
• Didático
• Prático
• Correto
• 100% alinhado ao edital carregado na plataforma

4. Nunca adicionar conteúdo fora do edital.

5. Nada de respostas superficiais: sempre trazer a essência, os conceitos, os detalhes importantes, e o que ajuda o aluno a acertar questões.

⸻

📌 ESTRUTURA EXIGIDA DOS FLASHCARDS

Para cada flashcard, siga exatamente o formato:

Pergunta:
➤ Uma pergunta objetiva e direta sobre o tema do módulo.

Resposta:
➤ Explicação clara, completa, focada na prática.
➤ Sempre no estilo da banca FGV.
➤ Sem enrolar.
➤ Com exemplos práticos quando fizer sentido.

⸻

📌 COMPORTAMENTO DA IA

A IA deve:
• Organizar os flashcards de forma coerente, do básico ao avançado.
• Garantir que todo o conteúdo essencial esteja dentro dos ${flashcardsPorModulo} flashcards.
• Não repetir informações.
• Criar flashcards suficientes para que o aluno consiga aprender toda a matéria apenas por eles.
• Assumir que o aluno vai usar o material para um concurso altamente competitivo.
• Priorizar clareza, precisão e objetividade.

⸻

📌 INSTRUÇÃO FINAL

"Gere o módulo solicitado com ${flashcardsPorModulo} flashcards completos, profundos e específicos, seguindo integralmente as instruções acima e baseado somente no conteúdo do edital configurado nesta matéria."`

      // Combinar prompt padrão + instruções adicionais do admin (se houver)
      const combinedInstructions = aiGenerationPrompt.trim() 
        ? `${defaultPrompt}\n\n--- INSTRUÇÕES ADICIONAIS DO ADMIN ---\n${aiGenerationPrompt}\n\n`
        : defaultPrompt

      const systemPrompt = `Você é um assistente especializado em criar flashcards educacionais para concursos públicos.

TAREFA: Criar ${quantidadeModulos} módulo(s) e ${totalFlashcards} flashcards (${flashcardsPorModulo} por módulo) para a matéria "${materia}".

${editalInfo ? `INFORMAÇÕES DO CONCURSO (TEXTO DIGITADO):\n${editalInfo}\n\n` : ''}
${limitedPdfText ? `CONTEÚDO COMPLETO DO PDF DO EDITAL/CRONOGRAMA (EXTRAÍDO AUTOMATICAMENTE):
⚠️ IMPORTANTE: Leia e analise TODO o conteúdo abaixo. Ele contém informações essenciais como:
- Datas importantes (prova, inscrição, etc.)
- Requisitos e critérios
- Conteúdo programático completo
- Cronograma detalhado
- Todas as informações do edital

INÍCIO DO PDF:
${limitedPdfText}

⚠️ ATENÇÃO: Use TODAS as informações acima para criar os flashcards. Não ignore nenhuma parte do edital.` : ''}

${combinedInstructions}

FORMATO DE RESPOSTA (OBRIGATÓRIO - APENAS JSON):
Você DEVE retornar APENAS um objeto JSON válido no seguinte formato exato:

{
  "modulos": [
    {
      "nome": "MÓDULO 1 - Nome do Módulo",
      "flashcards": [
        {
          "pergunta": "Pergunta clara e objetiva",
          "resposta": "Resposta completa e didática"
        },
        {
          "pergunta": "Outra pergunta",
          "resposta": "Outra resposta"
        }
      ]
    }
  ]
}

REGRAS OBRIGATÓRIAS:
- Você DEVE criar exatamente ${quantidadeModulos} módulo(s)
- Cada módulo DEVE ter exatamente ${flashcardsPorModulo} flashcards
- Total de flashcards: ${totalFlashcards}
- Baseie-se EXCLUSIVAMENTE no edital/PDF fornecido acima
- NÃO invente informações que não estão no edital
- Use a matéria "${materia}" como base

CRÍTICO: 
- Retorne APENAS o JSON, sem markdown (sem \`\`\`json)
- Sem explicações antes ou depois
- Sem texto adicional
- Apenas o objeto JSON puro começando com { e terminando com }`

      setGenerationProgress('Chamando IA para gerar conteúdo...')
      
      let aiResponse = ''
      let useGroq = false

      // Tentar Gemini primeiro
      if (apiKey) {
        try {
          console.log('🤖 Tentando usar Gemini...')
          const genAI = new GoogleGenerativeAI(apiKey)
          const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })
          
          const result = await model.generateContent({
            contents: [{ parts: [{ text: systemPrompt }] }],
            generationConfig: {
              temperature: 0.8,
              maxOutputTokens: 8000,
            },
          })
          
          aiResponse = result.response.text()
          console.log('✅ Gemini respondeu com sucesso')
        } catch (geminiErr) {
          const errorMsg = geminiErr.message || String(geminiErr) || ''
          const isQuotaError = errorMsg.includes('429') || errorMsg.includes('quota')
          
          console.warn('⚠️ Erro no Gemini:', errorMsg.substring(0, 200))
          
          if (isQuotaError && groqApiKey) {
            console.warn('🔄 Gemini com quota, usando Groq como fallback...')
            useGroq = true
            aiResponse = await callGroqAPI(systemPrompt)
            console.log('✅ Groq respondeu com sucesso')
          } else {
            throw geminiErr
          }
        }
      } else if (groqApiKey) {
        console.log('🤖 Usando Groq diretamente...')
        useGroq = true
        aiResponse = await callGroqAPI(systemPrompt)
        console.log('✅ Groq respondeu com sucesso')
      } else {
        throw new Error('Nenhuma API key configurada. Configure VITE_GEMINI_API_KEY ou VITE_GROQ_API_KEY')
      }

      if (!aiResponse || aiResponse.trim().length === 0) {
        throw new Error('A IA não retornou nenhuma resposta. Tente novamente.')
      }

      setGenerationProgress('Processando resposta da IA...')
      console.log('📥 Resposta completa da IA recebida (primeiros 1000 chars):', aiResponse.substring(0, 1000))

      // Extrair JSON da resposta (pode vir com markdown ou texto adicional)
      let jsonText = aiResponse.trim()
      
      // Remover markdown code blocks se existirem
      jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      
      // Remover texto antes do primeiro {
      const firstBrace = jsonText.indexOf('{')
      if (firstBrace > 0) {
        jsonText = jsonText.substring(firstBrace)
      }
      
      // Remover texto depois do último }
      const lastBrace = jsonText.lastIndexOf('}')
      if (lastBrace > 0 && lastBrace < jsonText.length - 1) {
        jsonText = jsonText.substring(0, lastBrace + 1)
      }
      
      // Tentar encontrar JSON válido no texto
      let jsonMatch = jsonText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        jsonText = jsonMatch[0]
      }

      console.log('📝 JSON extraído (primeiros 500 chars):', jsonText.substring(0, 500))
      console.log('📏 Tamanho do JSON:', jsonText.length)

      if (!jsonText || jsonText.length < 10) {
        throw new Error('Não foi possível extrair JSON da resposta da IA. Resposta recebida: ' + aiResponse.substring(0, 200))
      }

      let generatedData
      try {
        generatedData = JSON.parse(jsonText)
        console.log('✅ JSON parseado com sucesso!')
        console.log('📊 Estrutura:', {
          modulos: generatedData.modulos?.length || 0,
          primeiroModulo: generatedData.modulos?.[0]?.nome || 'N/A',
          flashcardsPrimeiroModulo: generatedData.modulos?.[0]?.flashcards?.length || 0
        })
      } catch (parseErr) {
        console.error('❌ Erro ao fazer parse do JSON:', parseErr)
        console.error('JSON que falhou (primeiros 1000 chars):', jsonText.substring(0, 1000))
        console.error('Resposta completa da IA:', aiResponse)
        throw new Error(`Erro ao processar resposta da IA. A resposta não está em formato JSON válido. Erro: ${parseErr.message}. Verifique o console para ver a resposta completa.`)
      }

      if (!generatedData.modulos || !Array.isArray(generatedData.modulos)) {
        console.error('❌ Formato inválido. Dados recebidos:', generatedData)
        throw new Error('Resposta da IA não está no formato esperado. Esperado: { "modulos": [...] }')
      }

      console.log(`📊 Encontrados ${generatedData.modulos.length} módulo(s) para criar`)

      setGenerationProgress(`Criando ${generatedData.modulos.length} módulo(s) e flashcards...`)

      const cardsRef = collection(db, 'flashcards')
      let totalCreated = 0
      let totalErrors = 0

      // Criar flashcards para cada módulo
      for (let i = 0; i < generatedData.modulos.length; i++) {
        const modulo = generatedData.modulos[i]
        const moduloNome = modulo.nome || `MÓDULO ${i + 1}`
        
        console.log(`📦 Processando módulo ${i + 1}: "${moduloNome}"`)
        setGenerationProgress(`Criando módulo "${moduloNome}" (${i + 1}/${generatedData.modulos.length})...`)

        if (!modulo.flashcards || !Array.isArray(modulo.flashcards)) {
          console.warn(`⚠️ Módulo ${i + 1} não tem flashcards válidos. Dados:`, modulo)
          continue
        }

        console.log(`  📚 Encontrados ${modulo.flashcards.length} flashcards neste módulo`)

        // Criar todos os flashcards do módulo
        const flashcardPromises = modulo.flashcards.map(async (card, cardIndex) => {
          if (!card.pergunta || !card.resposta) {
            console.warn(`⚠️ Flashcard ${cardIndex + 1} inválido ignorado:`, card)
            totalErrors++
            return null
          }

          try {
            await addDoc(cardsRef, {
              pergunta: card.pergunta.trim(),
              resposta: card.resposta.trim(),
              materia: materia,
              modulo: moduloNome,
              tags: [],
            })
            totalCreated++
            console.log(`  ✅ Flashcard ${cardIndex + 1} criado: "${card.pergunta.substring(0, 50)}..."`)
            return true
          } catch (err) {
            console.error(`  ❌ Erro ao criar flashcard ${cardIndex + 1}:`, err)
            totalErrors++
            return false
          }
        })

        await Promise.all(flashcardPromises)
        console.log(`✅ Módulo "${moduloNome}" concluído: ${modulo.flashcards.length} flashcards processados`)
      }

      if (totalCreated > 0) {
        setMessage(`✅ Geração concluída! ${totalCreated} flashcards criados em ${generatedData.modulos.length} módulo(s) para "${materia}".${totalErrors > 0 ? ` (${totalErrors} erros)` : ''}`)
      } else {
        setMessage(`⚠️ Nenhum flashcard foi criado. Verifique o console para mais detalhes.${totalErrors > 0 ? ` (${totalErrors} erros encontrados)` : ''}`)
      }
      setGenerationProgress('')
      
      // Limpar formulário
      setAiGenerationPrompt('')
      setAiGenerationConfig({
        materia: '',
        quantidadeModulos: 1,
        flashcardsPorModulo: 20,
      })
    } catch (err) {
      console.error('❌ Erro completo na geração:', err)
      console.error('Stack trace:', err.stack)
      setMessage(`❌ Erro ao gerar: ${err.message}. Verifique o console para mais detalhes.`)
      setGenerationProgress('')
      
      // Mostrar resposta da IA se houver erro de parse
      if (err.message.includes('JSON') || err.message.includes('formato')) {
        console.error('Resposta completa da IA:', aiResponse)
      }
    } finally {
      setGenerating(false)
    }
  }


  if (!isAdmin) {
    return (
      <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
        <p className="text-lg font-semibold text-alego-600">
          Acesso restrito à coordenação da mentoria.
        </p>
      </div>
    )
  }

  return (
    <section className="space-y-8">
      <div className="rounded-2xl bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-alego-500">
          Painel administrativo
        </p>
        <h1 className="mt-2 text-3xl font-bold text-alego-700">
          Gerenciar flashcards e usuários
        </h1>
      </div>

      {message && (
        <div className="rounded-xl bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-600">
          {message}
        </div>
      )}

      {/* Configuração do Prompt da IA */}
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <p className="flex items-center gap-2 text-sm font-semibold text-alego-600">
          <DocumentTextIcon className="h-5 w-5" />
          Configuração da IA - Informações do Concurso
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Configure aqui as informações sobre o concurso ALEGO Policial Legislativo. A IA usará essas informações para responder perguntas dos alunos de forma precisa e objetiva.
        </p>
        
        {promptStatus?.saved && (
          <div className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm">
            <p className="font-semibold text-emerald-700">✓ Configuração salva</p>
            {promptStatus.savedAt && (
              <p className="text-xs text-emerald-600">
                Última atualização: {new Date(promptStatus.savedAt).toLocaleString('pt-BR')}
              </p>
            )}
          </div>
        )}

        <div className="mt-4">
          <label className="block text-xs font-semibold uppercase text-slate-500 mb-2">
            Informações do Concurso (Edital, Matérias, Datas, Requisitos, etc.)
          </label>
          <textarea
            value={editalPrompt}
            onChange={(e) => setEditalPrompt(e.target.value)}
            rows={15}
            placeholder="Exemplo de informações para incluir:

CONCURSO: ALEGO Policial Legislativo
ÓRGÃO: Assembleia Legislativa de Goiás
CARGO: Policial Legislativo

REQUISITOS:
- Ensino médio completo
- Idade mínima: 18 anos
- Idade máxima: 50 anos
- Altura mínima: 1,60m (homens) / 1,55m (mulheres)

MATÉRIAS DO CONCURSO:
1. Português
2. Área de Atuação (Polícia Legislativa)
3. Raciocínio Lógico
4. Direito Constitucional
5. Direito Administrativo
6. Legislação Estadual
7. Realidade de Goiás
8. Redação

DATAS IMPORTANTES:
- Inscrições: [data]
- Prova: [data]
- Resultado: [data]

INFORMAÇÕES ADICIONAIS:
[Adicione outras informações relevantes do edital, como salário, benefícios, número de vagas, etc.]"
            className="w-full rounded-xl border border-slate-200 p-4 text-sm focus:border-alego-400 focus:outline-none font-mono"
            disabled={savingPrompt}
          />
          <p className="mt-2 text-xs text-slate-400">
            💡 Dica: Cole aqui informações importantes do edital, como requisitos, datas, matérias cobradas, número de vagas, etc. A IA usará essas informações para responder perguntas dos alunos.
          </p>
        </div>

        {/* Upload de PDF */}
        <div className="mt-6 border-t border-slate-200 pt-6">
          <label className="block text-xs font-semibold uppercase text-slate-500 mb-2">
            <DocumentArrowUpIcon className="h-4 w-4 inline mr-2" />
            Upload de PDF do Edital/Cronograma (Opcional)
          </label>
          <div className="space-y-3">
            <div className="flex items-center gap-4">
              <label className="flex-1 cursor-pointer">
                <input
                  type="file"
                  accept=".pdf"
                  onChange={handlePdfUpload}
                  className="hidden"
                  disabled={extractingPdf || savingPrompt}
                />
                <div className="flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 px-6 py-4 hover:border-alego-400 transition cursor-pointer disabled:opacity-50">
                  <DocumentArrowUpIcon className="h-5 w-5 text-slate-400" />
                  <span className="text-sm font-semibold text-slate-600">
                    {pdfFile ? pdfFile.name : 'Clique para fazer upload do PDF'}
                  </span>
                </div>
              </label>
              {pdfFile && (
                <button
                  type="button"
                  onClick={() => {
                    setPdfFile(null)
                    setPdfText('')
                    setPdfUrl('')
                  }}
                  className="rounded-xl bg-rose-100 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-200"
                >
                  Remover
                </button>
              )}
            </div>
            
            {extractingPdf && (
              <div className="rounded-lg bg-blue-50 p-3">
                <p className="text-xs font-semibold text-blue-700">📄 Extraindo texto do PDF... Aguarde.</p>
              </div>
            )}

            {pdfText && (
              <div className="rounded-lg bg-emerald-50 p-3">
                <p className="text-xs font-semibold text-emerald-700 mb-2">
                  ✅ Texto extraído do PDF ({pdfText.length} caracteres)
                </p>
                <details className="text-xs text-emerald-600">
                  <summary className="cursor-pointer font-semibold">Ver texto extraído (primeiros 500 caracteres)</summary>
                  <pre className="mt-2 whitespace-pre-wrap break-words bg-white p-3 rounded border border-emerald-200 max-h-40 overflow-y-auto">
                    {pdfText.substring(0, 500)}...
                  </pre>
                </details>
              </div>
            )}

            {pdfUrl && (
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs text-slate-600">
                  📎 PDF salvo: <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className="text-alego-600 hover:underline">Abrir PDF</a>
                </p>
              </div>
            )}

            <p className="text-xs text-slate-400">
              💡 A IA usará o texto extraído do PDF + as informações digitadas acima para gerar flashcards mais precisos.
            </p>
          </div>
        </div>
        
        <button
          type="button"
          onClick={handleSavePrompt}
          disabled={(!editalPrompt.trim() && !pdfText.trim()) || savingPrompt || extractingPdf}
          className="mt-4 rounded-full bg-alego-600 px-6 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {savingPrompt ? 'Salvando...' : 'Salvar Configuração'}
        </button>
      </div>

      {/* Geração Automática com IA */}
      <div className="rounded-2xl bg-gradient-to-br from-purple-50 to-blue-50 p-6 shadow-sm border-2 border-purple-200">
        <p className="flex items-center gap-2 text-lg font-bold text-purple-700">
          <SparklesIcon className="h-6 w-6" />
          Geração Automática com IA
        </p>
        <p className="mt-1 text-sm text-slate-600">
          Use a IA para gerar automaticamente módulos e flashcards. Configure o prompt e a IA criará tudo para você!
        </p>

        {generationProgress && (
          <div className="mt-4 rounded-lg bg-blue-100 p-4">
            <p className="text-sm font-semibold text-blue-700">{generationProgress}</p>
          </div>
        )}

        <div className="mt-6 space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <label className="block text-sm font-semibold text-slate-700">
              Matéria *
              <select
                value={aiGenerationConfig.materia}
                onChange={(e) => setAiGenerationConfig(prev => ({ ...prev, materia: e.target.value }))}
                className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-purple-400 focus:outline-none"
                disabled={generating}
              >
                <option value="">Selecione a matéria</option>
                {MATERIAS.map((materia) => (
                  <option key={materia} value={materia}>
                    {materia}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-semibold text-slate-700">
              Quantidade de Módulos
              <input
                type="number"
                min="1"
                max="10"
                value={aiGenerationConfig.quantidadeModulos}
                onChange={(e) => setAiGenerationConfig(prev => ({ 
                  ...prev, 
                  quantidadeModulos: parseInt(e.target.value) || 1 
                }))}
                className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-purple-400 focus:outline-none"
                disabled={generating}
              />
            </label>
            <label className="block text-sm font-semibold text-slate-700">
              Flashcards por Módulo
              <input
                type="number"
                min="1"
                max="50"
                value={aiGenerationConfig.flashcardsPorModulo}
                onChange={(e) => setAiGenerationConfig(prev => ({ 
                  ...prev, 
                  flashcardsPorModulo: parseInt(e.target.value) || 20 
                }))}
                className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-purple-400 focus:outline-none"
                disabled={generating}
              />
            </label>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Instruções Adicionais (Opcional)
            </label>
            <textarea
              value={aiGenerationPrompt}
              onChange={(e) => setAiGenerationPrompt(e.target.value)}
              rows={6}
              placeholder="Instruções adicionais específicas (opcional):

Exemplo:
- Foque em questões de múltipla escolha
- Dificuldade: intermediária
- Priorize tópicos X, Y, Z

Se deixar em branco, a IA usará as regras padrão:
• 20 flashcards por módulo
• Nível FGV
• Baseado 100% no edital
• Perguntas objetivas e respostas completas"
              className="w-full rounded-xl border border-slate-200 p-4 text-sm focus:border-purple-400 focus:outline-none"
              disabled={generating}
            />
          </div>

          <button
            type="button"
            onClick={generateWithAI}
            disabled={!aiGenerationConfig.materia || generating}
            className="w-full rounded-full bg-gradient-to-r from-purple-600 to-blue-600 px-6 py-3 text-sm font-semibold text-white disabled:opacity-50 hover:from-purple-700 hover:to-blue-700 transition"
          >
            {generating ? 'Gerando...' : `✨ Gerar ${aiGenerationConfig.quantidadeModulos} Módulo(s) e ${aiGenerationConfig.quantidadeModulos * aiGenerationConfig.flashcardsPorModulo} Flashcards`}
          </button>
          <p className="text-xs text-slate-500 text-center mt-2">
            💡 O prompt padrão será usado automaticamente. Instruções adicionais são opcionais.
          </p>
        </div>
      </div>

      {/* Gerenciar Módulos */}
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <p className="flex items-center gap-2 text-lg font-bold text-alego-700">
          <PlusIcon className="h-6 w-6" />
          Gerenciar Módulos por Matéria
        </p>
        <p className="mt-1 text-sm text-slate-500">
          Primeiro, adicione os módulos dentro de cada matéria. Depois você poderá criar flashcards atribuindo-os aos módulos.
        </p>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <label className="block text-sm font-semibold text-slate-700">
            Selecionar Matéria
            <select
              value={selectedMateriaForModule}
              onChange={(e) => setSelectedMateriaForModule(e.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-alego-400 focus:outline-none"
            >
              <option value="">Selecione a matéria</option>
              {MATERIAS.map((materia) => (
                <option key={materia} value={materia}>
                  {materia}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-semibold text-slate-700">
            Nome do Módulo
            <div className="mt-2 flex gap-2">
              <input
                type="text"
                value={newModuleName}
                onChange={(e) => setNewModuleName(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && addModule()}
                placeholder="Ex: Módulo 1, Aula 1, Capítulo 1..."
                className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-alego-400 focus:outline-none"
              />
              <button
                type="button"
                onClick={addModule}
                disabled={!selectedMateriaForModule || !newModuleName.trim()}
                className="rounded-xl bg-alego-600 px-6 py-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                Adicionar
              </button>
            </div>
          </label>
        </div>

        {/* Lista de módulos por matéria */}
        <div className="mt-6 space-y-4">
          {MATERIAS.map((materia) => {
            const modulos = modules[materia] || []
            if (modulos.length === 0) return null
            
            // Ordenar módulos numericamente
            const sortedModulos = [...modulos].sort((a, b) => {
              // Extrair números dos módulos para ordenação numérica
              const extractNumber = (str) => {
                const match = str.match(/\d+/)
                return match ? parseInt(match[0], 10) : 999
              }
              const numA = extractNumber(a)
              const numB = extractNumber(b)
              
              // Se ambos têm números, ordenar numericamente
              if (numA !== 999 && numB !== 999) {
                return numA - numB
              }
              
              // Se apenas um tem número, o com número vem primeiro
              if (numA !== 999) return -1
              if (numB !== 999) return 1
              
              // Se nenhum tem número, ordenar alfabeticamente
              return a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' })
            })
            
            return (
              <div key={materia} className="rounded-xl border border-slate-200 p-4">
                <h3 className="mb-3 text-base font-bold text-alego-700">{materia}</h3>
                <div className="flex flex-wrap gap-2">
                  {sortedModulos.map((modulo) => (
                    <div
                      key={modulo}
                      className="flex items-center gap-2 rounded-full bg-alego-100 px-4 py-2"
                    >
                      <span className="text-sm font-semibold text-alego-700">{modulo}</span>
                      <button
                        type="button"
                        onClick={() => removeModule(materia, modulo)}
                        className="text-rose-600 hover:text-rose-700"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Criar Flashcard */}
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <p className="flex items-center gap-2 text-lg font-bold text-alego-700">
          <DocumentTextIcon className="h-6 w-6" />
          Criar Flashcard
        </p>
        <p className="mt-1 text-sm text-slate-500">
          Selecione a matéria e o módulo (que você já criou acima), depois preencha o flashcard.
        </p>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <label className="block text-sm font-semibold text-slate-700">
            Matéria *
            <select
              value={flashcardForm.materia}
              onChange={(e) => {
                setFlashcardForm((prev) => ({ ...prev, materia: e.target.value, modulo: '' }))
              }}
              className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-alego-400 focus:outline-none"
            >
              <option value="">Selecione a matéria</option>
              {MATERIAS.map((materia) => (
                <option key={materia} value={materia}>
                  {materia}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-semibold text-slate-700">
            Módulo *
            <select
              value={flashcardForm.modulo}
              onChange={(e) => setFlashcardForm((prev) => ({ ...prev, modulo: e.target.value }))}
              disabled={!flashcardForm.materia}
              className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-alego-400 focus:outline-none disabled:bg-slate-50"
            >
              <option value="">{flashcardForm.materia ? 'Selecione o módulo' : 'Primeiro selecione a matéria'}</option>
              {flashcardForm.materia && (modules[flashcardForm.materia] || [])
                .sort((a, b) => {
                  // Extrair números dos módulos para ordenação numérica
                  const extractNumber = (str) => {
                    const match = str.match(/\d+/)
                    return match ? parseInt(match[0], 10) : 999
                  }
                  const numA = extractNumber(a)
                  const numB = extractNumber(b)
                  
                  // Se ambos têm números, ordenar numericamente
                  if (numA !== 999 && numB !== 999) {
                    return numA - numB
                  }
                  
                  // Se apenas um tem número, o com número vem primeiro
                  if (numA !== 999) return -1
                  if (numB !== 999) return 1
                  
                  // Se nenhum tem número, ordenar alfabeticamente
                  return a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' })
                })
                .map((modulo) => (
                <option key={modulo} value={modulo}>
                  {modulo}
                </option>
              ))}
            </select>
            {flashcardForm.materia && (!modules[flashcardForm.materia] || modules[flashcardForm.materia].length === 0) && (
              <p className="mt-1 text-xs text-amber-600">
                Nenhum módulo criado para esta matéria. Crie módulos acima primeiro.
              </p>
            )}
          </label>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="block text-sm font-semibold text-slate-700">
            Pergunta *
            <input
              type="text"
              value={flashcardForm.pergunta}
              onChange={(e) => setFlashcardForm((prev) => ({ ...prev, pergunta: e.target.value }))}
              className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-alego-400 focus:outline-none"
              placeholder="Digite a pergunta..."
            />
          </label>
          <label className="block text-sm font-semibold text-slate-700">
            Resposta *
            <input
              type="text"
              value={flashcardForm.resposta}
              onChange={(e) => setFlashcardForm((prev) => ({ ...prev, resposta: e.target.value }))}
              className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-alego-400 focus:outline-none"
              placeholder="Digite a resposta..."
            />
          </label>
        </div>

        <button
          type="button"
          onClick={createFlashcard}
          disabled={!flashcardForm.materia || !flashcardForm.modulo || !flashcardForm.pergunta || !flashcardForm.resposta}
          className="mt-4 rounded-full bg-alego-600 px-6 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Criar Flashcard
        </button>
      </div>

      {/* Gerenciamento de usuários */}
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <p className="flex items-center gap-2 text-sm font-semibold text-alego-600">
          <UserPlusIcon className="h-5 w-5" />
          Criar novo usuário
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="text-xs font-semibold uppercase text-slate-500">
            Email
            <input
              type="email"
              value={userForm.email}
              onChange={(e) => setUserForm((prev) => ({ ...prev, email: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-alego-400 focus:outline-none"
              placeholder="usuario@email.com"
            />
          </label>
          <label className="text-xs font-semibold uppercase text-slate-500">
            Senha
            <input
              type="password"
              value={userForm.password}
              onChange={(e) => setUserForm((prev) => ({ ...prev, password: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-alego-400 focus:outline-none"
              placeholder="Senha do usuário"
            />
          </label>
          <label className="text-xs font-semibold uppercase text-slate-500">
            Nome
            <input
              type="text"
              value={userForm.name}
              onChange={(e) => setUserForm((prev) => ({ ...prev, name: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-alego-400 focus:outline-none"
              placeholder="Nome completo (opcional)"
            />
          </label>
          <label className="text-xs font-semibold uppercase text-slate-500">
            Tipo
            <input
              type="text"
              value="Aluno (padrão)"
              disabled
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500"
            />
            <p className="mt-1 text-xs text-slate-400">
              Todos os novos usuários são criados como alunos. Apenas o administrador principal tem acesso ao painel.
            </p>
          </label>
        </div>
        <button
          type="button"
          onClick={createUser}
          className="mt-4 rounded-full bg-alego-600 px-6 py-2 text-sm font-semibold text-white"
        >
          Criar usuário
        </button>
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold text-alego-600">
          {users.length} usuários cadastrados
        </p>
        <div className="mt-4 divide-y divide-slate-100">
          {users.map((user) => {
            const userPresence = presence[user.uid] || { status: 'offline' }
            // Verificar se está online baseado no status e no tempo desde última atualização
            const isOnline = userPresence.status === 'online'
            // Se não tiver dados de presença, considerar offline
            const hasPresenceData = presence[user.uid] !== undefined
            
            return (
            <div
              key={user.uid || user.email}
              className="flex flex-col gap-2 py-4 md:flex-row md:items-center md:justify-between"
            >
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className={`h-3 w-3 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                    {isOnline && (
                      <div className="absolute inset-0 h-3 w-3 animate-ping rounded-full bg-emerald-400 opacity-75" />
                    )}
                  </div>
              <div>
                <p className="font-semibold text-alego-700">{user.displayName || user.email}</p>
                <p className="text-sm text-slate-500">{user.email}</p>
                    <div className="mt-1 flex gap-2">
                      <span className="inline-block rounded-full bg-alego-100 px-2 py-1 text-xs font-semibold text-alego-600">
                  {user.role === 'admin' ? 'Admin' : 'Aluno'}
                </span>
                      <span className={`inline-block rounded-full px-2 py-1 text-xs font-semibold ${
                        isOnline && hasPresenceData
                          ? 'bg-emerald-100 text-emerald-700' 
                          : 'bg-slate-100 text-slate-600'
                      }`}>
                        {isOnline && hasPresenceData ? '🟢 Online' : '⚫ Offline'}
                      </span>
                    </div>
                  </div>
              </div>
              <button
                type="button"
                onClick={() => removeUser(user.uid || user.email)}
                className="flex items-center gap-1 rounded-full border border-rose-500 px-4 py-2 text-sm font-semibold text-rose-500"
              >
                <TrashIcon className="h-4 w-4" />
                Excluir
              </button>
            </div>
            )
          })}
        </div>
      </div>

      {/* Importar via JSON */}
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <p className="flex items-center gap-2 text-sm font-semibold text-alego-600">
          <DocumentTextIcon className="h-5 w-5" />
          Importar via JSON
        </p>
        <textarea
          value={jsonInput}
          onChange={(event) => setJsonInput(event.target.value)}
          rows={6}
          className="mt-3 w-full rounded-2xl border border-slate-200 p-4 text-sm focus:border-alego-400 focus:outline-none"
          placeholder='[{"pergunta":"...","resposta":"...","materia":"Português","modulo":"Módulo 1"}]'
        />
        <button
          type="button"
          onClick={handleImport}
          className="mt-4 rounded-full bg-alego-600 px-6 py-2 text-sm font-semibold text-white"
        >
          Importar flashcards
        </button>
      </div>

      {/* Lista de cards */}
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <p className="text-sm font-semibold text-alego-600">
            {cards.length} cards cadastrados
          </p>
          <p className="text-xs text-slate-500">
            Expanda a matéria e o módulo para visualizar e gerenciar os cards correspondentes.
          </p>
        </div>
        <div className="mt-4 space-y-3">
          {Object.keys(cardsOrganized).length === 0 && (
            <p className="text-sm text-slate-500">Nenhum card cadastrado ainda.</p>
          )}
          {Object.entries(cardsOrganized).map(([materia, modulos]) => {
            const totalCards = Object.values(modulos).reduce((acc, list) => acc + list.length, 0)
            const isMateriaOpen = expandedCardMaterias[materia]
            return (
              <div key={materia} className="rounded-2xl border border-slate-100 bg-slate-50/40 p-3">
                <button
                  type="button"
                  onClick={() => toggleCardMateria(materia)}
                  className="flex w-full items-center justify-between gap-3 rounded-xl bg-white px-4 py-3 text-left"
                >
                  <div>
                    <p className="text-sm font-semibold text-alego-700">{materia}</p>
                    <p className="text-[11px] uppercase tracking-wide text-slate-400">
                      {totalCards} {totalCards === 1 ? 'card' : 'cards'}
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-alego-500">
                    {isMateriaOpen ? 'Ocultar' : 'Ver módulos'}
                  </span>
                </button>

                {isMateriaOpen && (
                  <div className="mt-3 space-y-2">
                    {Object.entries(modulos)
                      .sort(([moduloA], [moduloB]) => {
                        // Extrair números dos módulos para ordenação numérica
                        const extractNumber = (str) => {
                          const match = str.match(/\d+/)
                          return match ? parseInt(match[0], 10) : 999
                        }
                        const numA = extractNumber(moduloA)
                        const numB = extractNumber(moduloB)
                        
                        // Se ambos têm números, ordenar numericamente
                        if (numA !== 999 && numB !== 999) {
                          return numA - numB
                        }
                        
                        // Se apenas um tem número, o com número vem primeiro
                        if (numA !== 999) return -1
                        if (numB !== 999) return 1
                        
                        // Se nenhum tem número, ordenar alfabeticamente
                        return moduloA.localeCompare(moduloB, 'pt-BR', { numeric: true, sensitivity: 'base' })
                      })
                      .map(([modulo, cardsList]) => {
                      const moduloKey = `${materia}::${modulo}`
                      const isModuloOpen = expandedCardModulos[moduloKey]
                      return (
                        <div key={modulo} className="rounded-xl border border-slate-100 bg-white">
                          <button
                            type="button"
                            onClick={() => toggleCardModulo(materia, modulo)}
                            className="flex w-full items-center justify-between px-4 py-3 text-left"
                          >
                            <div>
                              <p className="text-sm font-semibold text-slate-700">{modulo}</p>
                              <p className="text-[11px] uppercase tracking-wide text-slate-400">
                                {cardsList.length} {cardsList.length === 1 ? 'card' : 'cards'}
                              </p>
                            </div>
                            <span className="text-xs font-semibold text-alego-500">
                              {isModuloOpen ? 'Ocultar' : 'Ver cards'}
                            </span>
                          </button>

                          {isModuloOpen && (
                            <div className="border-t border-slate-100 p-3">
                              <div className="grid gap-3 md:grid-cols-2">
                                {cardsList.map((card) => (
                                  <div
                                    key={card.id}
                                    className="rounded-xl border border-slate-100 bg-slate-50 p-3"
                                  >
                                    <p className="text-sm font-semibold text-alego-700">
                                      {card.pergunta}
                                    </p>
                                    <p className="mt-2 text-xs text-slate-500">
                                      {card.resposta}
                                    </p>
                                    <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold">
                                      {card.tags?.map((tag) => (
                                        <span
                                          key={tag}
                                          className="rounded-full bg-alego-100 px-2 py-0.5 text-alego-700"
                                        >
                                          {tag}
                                        </span>
                                      ))}
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => removeCard(card.id)}
                                      className="mt-3 inline-flex items-center gap-1 rounded-full border border-rose-500 px-3 py-1 text-xs font-semibold text-rose-500"
                                    >
                                      <TrashIcon className="h-4 w-4" />
                                      Excluir
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

export default AdminPanel
