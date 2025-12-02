import { useEffect, useMemo, useState, useRef } from 'react'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import { DocumentTextIcon, TrashIcon, UserPlusIcon, PlusIcon, DocumentArrowUpIcon, AcademicCapIcon, SparklesIcon, ShareIcon } from '@heroicons/react/24/outline'
import { StarIcon, LockClosedIcon } from '@heroicons/react/24/solid'
import { createUserWithEmailAndPassword, deleteUser as deleteAuthUser, fetchSignInMethodsForEmail, signInWithEmailAndPassword, signOut } from 'firebase/auth'
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
  const { isAdmin, user: currentAdminUser, profile } = useAuth()
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
  
  // Estado para gerenciar matérias por curso
  const [courseSubjects, setCourseSubjects] = useState({}) // { courseId: [materias] }
  const [newSubjectName, setNewSubjectName] = useState('')
  const [selectedSubjectForModule, setSelectedSubjectForModule] = useState('')
  
  // Estado para criação de flashcards
  const [flashcardForm, setFlashcardForm] = useState({
    materia: '',
    modulo: '',
    pergunta: '',
    resposta: '',
    courseId: '', // ID do curso ao qual o flashcard pertence
  })
  const [aiContentInput, setAiContentInput] = useState('') // Conteúdo para gerar flashcards por IA
  const [flashcardsQuantity, setFlashcardsQuantity] = useState(15) // Quantidade de flashcards a gerar
  const [generatingFlashcards, setGeneratingFlashcards] = useState(false)
  const [flashcardGenProgress, setFlashcardGenProgress] = useState('')
  const [editalPrompt, setEditalPrompt] = useState('')
  const [savingPrompt, setSavingPrompt] = useState(false)
  const [promptStatus, setPromptStatus] = useState(null)
  const [pdfFile, setPdfFile] = useState(null)
  const [pdfText, setPdfText] = useState('')
  const [extractingPdf, setExtractingPdf] = useState(false)
  const [pdfUrl, setPdfUrl] = useState('')
  const [questoesPrompt, setQuestoesPrompt] = useState('')
  const [bizuPrompt, setBizuPrompt] = useState('')
  const [savingQuestoesConfig, setSavingQuestoesConfig] = useState(false)
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
  
  // Estado para gerenciar banners
  const [banners, setBanners] = useState([])
  const [bannerForm, setBannerForm] = useState({
    title: '',
    imageBase64: '',
    link: '',
    order: 0,
    duration: 5000,
    active: true,
  })
  const [uploadingBanner, setUploadingBanner] = useState(false)
  
  // Estado para gerenciar avaliações
  const [reviews, setReviews] = useState([])
  
  // Estado para gerar link de redefinição
  const [resetEmail, setResetEmail] = useState('')
  const [generatedLink, setGeneratedLink] = useState('')
  const [generatingLink, setGeneratingLink] = useState(false)
  
  // Estado para controle de tabs
  const [activeTab, setActiveTab] = useState('config')
  
  // Estado para curso selecionado no gerenciamento de flashcards
  const [selectedCourseForFlashcards, setSelectedCourseForFlashcards] = useState('alego-default') // 'alego-default' = ALEGO padrão, 'courseId' = curso específico
  
  // Estado para curso selecionado nos prompts
  const [selectedCourseForPrompts, setSelectedCourseForPrompts] = useState('alego-default') // Curso para salvar prompts
  
  // Estado para gerenciar popup banner
  const [popupBanner, setPopupBanner] = useState({
    active: false,
    imageBase64: '',
    imageUrl: '',
    title: '',
    link: '',
    openInNewTab: true,
  })
  const [uploadingPopupBanner, setUploadingPopupBanner] = useState(false)
  
  // Estado para gerenciar cursos
  const [courses, setCourses] = useState([])
  const [courseForm, setCourseForm] = useState({
    name: '',
    description: '',
    price: 99.90,
    originalPrice: 149.99,
    competition: '',
    courseDuration: '', // Tempo do curso (ex: "6 meses", "1 ano", etc.)
    imageBase64: '',
    imageUrl: '',
    active: true,
  })
  const [uploadingCourse, setUploadingCourse] = useState(false)
  const [editingCourseImage, setEditingCourseImage] = useState(null) // ID do curso sendo editado
  const [newCourseImage, setNewCourseImage] = useState(null) // Nova imagem em base64
  const [recentlyDeletedCourses, setRecentlyDeletedCourses] = useState(new Set()) // IDs de cursos deletados recentemente
  const recentlyDeletedCoursesRef = useRef(new Set()) // Ref para acessar no onSnapshot
  
  // Estados para geração completa de curso com IA
  const [generatingFullCourse, setGeneratingFullCourse] = useState(false)
  const [fullCourseProgress, setFullCourseProgress] = useState('')
  const [editalPdfForGeneration, setEditalPdfForGeneration] = useState(null)
  const [editalPdfTextForGeneration, setEditalPdfTextForGeneration] = useState('')
  const [selectedCourseForFullGeneration, setSelectedCourseForFullGeneration] = useState(null)
  const [showFullGenerationModal, setShowFullGenerationModal] = useState(false)
  const [cargoForGeneration, setCargoForGeneration] = useState('') // Cargo específico para filtrar matérias
  const [regeneratingCourse, setRegeneratingCourse] = useState(false) // Se está regenerando curso existente
  
  // Estados para verificar e completar conteúdos
  const [materiasTextInput, setMateriasTextInput] = useState('') // Texto com matérias para verificar
  const [selectedCourseForVerification, setSelectedCourseForVerification] = useState('alego-default') // Curso para verificar
  const [verifyingContents, setVerifyingContents] = useState(false) // Se está verificando/completando
  const [verificationProgress, setVerificationProgress] = useState('') // Progresso da verificação
  
  // Estado para gerenciar cursos de usuários
  const [selectedUserForCourse, setSelectedUserForCourse] = useState(null) // Usuário selecionado para adicionar curso
  const [addingCourseToUser, setAddingCourseToUser] = useState(false) // Se está adicionando curso

  // Configurar PDF.js worker
  useEffect(() => {
    // Usar CDN do unpkg que é mais confiável
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`
  }, [])

  // Carregar edital e PDF salvo (por curso)
  useEffect(() => {
    if (!isAdmin) return
    
    // Limpar campos primeiro quando mudar de curso
    setEditalPrompt('')
    setPdfText('')
    setPdfUrl('')
    
    const loadEdital = async () => {
      try {
        const courseId = selectedCourseForPrompts || 'alego-default'
        const editalRef = doc(db, 'courses', courseId, 'prompts', 'edital')
        const editalDoc = await getDoc(editalRef)
        if (editalDoc.exists()) {
          const data = editalDoc.data()
          setEditalPrompt(data.prompt || '')
          setPdfText(data.pdfText || '')
          setPdfUrl(data.pdfUrl || '')
          
          if (data.pdfText) {
            console.log('📄 Texto do PDF carregado:', data.pdfText.length, 'caracteres')
          }
        } else {
          // Se não encontrar, deixar vazio (não carregar de outros cursos)
          setEditalPrompt('')
          setPdfText('')
          setPdfUrl('')
        }
      } catch (err) {
        console.error('Erro ao carregar edital:', err)
        // Em caso de erro, limpar campos
        setEditalPrompt('')
        setPdfText('')
        setPdfUrl('')
      }
    }
    loadEdital()
  }, [isAdmin, selectedCourseForPrompts])

  // Carregar configurações de questões e BIZUs (por curso)
  useEffect(() => {
    if (!isAdmin) return
    
    // Limpar campos primeiro quando mudar de curso
    setQuestoesPrompt('')
    setBizuPrompt('')
    
    const loadQuestoesConfig = async () => {
      try {
        const courseId = selectedCourseForPrompts || 'alego-default'
        const questoesRef = doc(db, 'courses', courseId, 'prompts', 'questoes')
        const questoesDoc = await getDoc(questoesRef)
        if (questoesDoc.exists()) {
          const data = questoesDoc.data()
          setQuestoesPrompt(data.prompt || '')
          setBizuPrompt(data.bizuPrompt || '')
        } else {
          // Se não encontrar, deixar vazio (não carregar de outros cursos)
          setQuestoesPrompt('')
          setBizuPrompt('')
        }
      } catch (err) {
        console.error('Erro ao carregar configuração de questões:', err)
        // Em caso de erro, limpar campos
        setQuestoesPrompt('')
        setBizuPrompt('')
      }
    }
    loadQuestoesConfig()
  }, [isAdmin, selectedCourseForPrompts])

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
      const allData = snapshot.docs.map((docSnapshot) => ({
        id: docSnapshot.id,
        ...docSnapshot.data(),
      }))
      
      // Filtrar flashcards por curso selecionado
      let filteredData = allData
      const selectedCourse = (selectedCourseForFlashcards || '').trim()
      
      if (selectedCourse) {
        // Se tem curso selecionado
        if (selectedCourse === 'alego-default') {
          // Se é o curso ALEGO padrão, mostrar flashcards sem courseId OU com courseId = 'alego-default'
          filteredData = allData.filter(card => {
            const cardCourseId = card.courseId
            // Incluir flashcards sem courseId (antigos) OU com courseId = 'alego-default'
            return !cardCourseId || cardCourseId === '' || cardCourseId === null || cardCourseId === undefined || cardCourseId === 'alego-default' || String(cardCourseId) === String('alego-default')
          })
          console.log(`🔍 Filtrado para ALEGO padrão (alego-default): ${filteredData.length} flashcards encontrados`)
        } else {
          // Se é outro curso, mostrar apenas flashcards desse curso específico
          filteredData = allData.filter(card => {
            const cardCourseId = card.courseId || null
            return cardCourseId === selectedCourse || String(cardCourseId) === String(selectedCourse)
          })
          console.log(`🔍 Filtrado por curso "${selectedCourse}": ${filteredData.length} flashcards encontrados`)
        }
      } else {
        // Se não tem curso selecionado (string vazia), mostrar apenas flashcards sem courseId (ALEGO padrão)
        // Incluir null, undefined e string vazia
        filteredData = allData.filter(card => {
          const cardCourseId = card.courseId
          return !cardCourseId || cardCourseId === '' || cardCourseId === null || cardCourseId === undefined
        })
        console.log(`🔍 Filtrado para ALEGO padrão (sem curso selecionado): ${filteredData.length} flashcards encontrados`)
      }
      
      // Salvar todos os cards (para uso em outras partes) e os filtrados
      setCards(filteredData)
      
      // Extrair módulos únicos por matéria dos cards filtrados
      const modulesByMateria = {}
      filteredData.forEach((card) => {
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
    
    return () => unsubCards()
  }, [selectedCourseForFlashcards])
  
  // Carregar matérias do curso selecionado
  useEffect(() => {
    if (!selectedCourseForFlashcards) {
      // Se não tem curso selecionado, usar MATERIAS padrão do ALEGO
      setCourseSubjects({})
      return
    }
    
    const courseSubjectsRef = collection(db, 'courses', selectedCourseForFlashcards, 'subjects')
    const unsub = onSnapshot(courseSubjectsRef, (snapshot) => {
      const subjects = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }))
      setCourseSubjects({
        [selectedCourseForFlashcards]: subjects.map(s => s.name)
      })
    }, (error) => {
      console.error('Erro ao carregar matérias do curso:', error)
      setCourseSubjects({})
    })
    
    return () => unsub()
  }, [selectedCourseForFlashcards])

  // Carregar usuários, banners, etc.
  useEffect(() => {
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

    // Carregar banners
    const bannersRef = collection(db, 'homeBanners')
    const unsubBanners = onSnapshot(bannersRef, (snapshot) => {
      const data = snapshot.docs.map((docSnapshot) => ({
        id: docSnapshot.id,
        ...docSnapshot.data(),
      }))
      setBanners(data.sort((a, b) => (a.order || 0) - (b.order || 0)))
    }, (error) => {
      console.error('Erro ao carregar banners:', error)
      setBanners([])
    })

    // Carregar popup banner
    const popupBannerRef = doc(db, 'config', 'popupBanner')
    const unsubPopupBanner = onSnapshot(popupBannerRef, (snapshot) => {
      if (snapshot.exists()) {
        setPopupBanner(snapshot.data())
      }
    }, (error) => {
      console.error('Erro ao carregar popup banner:', error)
    })

    // Carregar cursos
    const coursesRef = collection(db, 'courses')
    const unsubCourses = onSnapshot(coursesRef, (snapshot) => {
      const data = snapshot.docs.map((docSnapshot) => ({
        id: docSnapshot.id,
        ...docSnapshot.data(),
      }))
      
      // NÃO recriar curso ALEGO padrão automaticamente
      // Se foi deletado pelo admin, deve permanecer deletado
      // Removida a lógica de criação automática
      
      // Filtrar cursos que foram deletados recentemente (evitar recriação)
      const filteredData = data.filter(course => !recentlyDeletedCoursesRef.current.has(course.id))
      
      const sortedCourses = filteredData.sort((a, b) => {
        // Colocar curso padrão primeiro
        if (a.id === 'alego-default') return -1
        if (b.id === 'alego-default') return 1
        const dateA = a.createdAt?.toDate?.() || new Date(0)
        const dateB = b.createdAt?.toDate?.() || new Date(0)
        return dateB - dateA
      })
      
      setCourses(sortedCourses)
      
      // Se o admin não tem curso selecionado, selecionar o ALEGO padrão automaticamente
      if (profile && profile.selectedCourseId === undefined && sortedCourses.length > 0) {
        const alegoCourse = sortedCourses.find(c => c.id === 'alego-default')
        if (alegoCourse && selectedCourseForFlashcards === 'alego-default') {
          // Já está selecionado, não precisa fazer nada
        } else if (alegoCourse) {
          setSelectedCourseForFlashcards('alego-default')
        }
      } else if (profile && profile.selectedCourseId !== undefined) {
        // Sincronizar com curso do perfil
        const courseId = profile.selectedCourseId === null ? 'alego-default' : profile.selectedCourseId
        if (courseId && sortedCourses.find(c => c.id === courseId)) {
          setSelectedCourseForFlashcards(courseId)
        } else {
          // Se o curso do perfil não existe mais, usar ALEGO padrão
          setSelectedCourseForFlashcards('alego-default')
        }
      }
    }, (error) => {
      console.error('Erro ao carregar cursos:', error)
      setCourses([])
    })

    // Carregar avaliações
    const reviewsRef = collection(db, 'reviews')
    const unsubReviews = onSnapshot(reviewsRef, (snapshot) => {
      const data = snapshot.docs.map((docSnapshot) => ({
        id: docSnapshot.id,
        ...docSnapshot.data(),
      }))
      // Ordenar manualmente por data (mais recente primeiro)
      data.sort((a, b) => {
        const dateA = a.createdAt?.toDate?.() || new Date(0)
        const dateB = b.createdAt?.toDate?.() || new Date(0)
        return dateB - dateA
      })
      setReviews(data)
    }, (error) => {
      console.error('Erro ao carregar avaliações:', error)
      // Se der erro de índice, tentar sem orderBy
      if (error.code === 'failed-precondition') {
        const reviewsRefSimple = collection(db, 'reviews')
        onSnapshot(reviewsRefSimple, (snapshot) => {
          const data = snapshot.docs.map((docSnapshot) => ({
            id: docSnapshot.id,
            ...docSnapshot.data(),
          }))
          data.sort((a, b) => {
            const dateA = a.createdAt?.toDate?.() || new Date(0)
            const dateB = b.createdAt?.toDate?.() || new Date(0)
            return dateB - dateA
          })
          setReviews(data)
        }, (err) => {
          console.error('Erro ao carregar avaliações (fallback):', err)
          setReviews([])
        })
      } else {
        setReviews([])
      }
    })

    return () => {
      unsubUsers()
      unsubPresence()
      unsubBanners()
      unsubPopupBanner()
      unsubCourses()
      unsubReviews()
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

  // Adicionar matéria a um curso
  const addSubjectToCourse = async () => {
    if (!selectedCourseForFlashcards) {
      setMessage('❌ Selecione um curso primeiro.')
      return
    }
    
    if (!newSubjectName.trim()) {
      setMessage('❌ Digite o nome da matéria.')
      return
    }

    const subjectName = newSubjectName.trim()
    
    // Verificar se a matéria já existe no curso
    const existingSubjects = courseSubjects[selectedCourseForFlashcards] || []
    if (existingSubjects.includes(subjectName)) {
      setMessage('❌ Esta matéria já existe neste curso.')
      return
    }

    try {
      await addDoc(collection(db, 'courses', selectedCourseForFlashcards, 'subjects'), {
        name: subjectName,
        createdAt: serverTimestamp(),
      })
      
      setNewSubjectName('')
      setMessage(`✅ Matéria "${subjectName}" adicionada ao curso!`)
    } catch (err) {
      console.error('Erro ao adicionar matéria:', err)
      setMessage(`❌ Erro ao adicionar matéria: ${err.message}`)
    }
  }
  
  // Remover matéria de um curso
  const removeSubjectFromCourse = async (subjectId, subjectName) => {
    if (!selectedCourseForFlashcards) return
    if (!confirm(`Deseja remover a matéria "${subjectName}" deste curso?\n\n⚠️ ATENÇÃO: Todos os flashcards desta matéria serão DELETADOS permanentemente!`)) return
    
    try {
      // Buscar e deletar todos os flashcards desta matéria do curso
      const courseId = selectedCourseForFlashcards
      const cardsRef = collection(db, 'flashcards')
      const cardsQuery = query(
        cardsRef,
        where('materia', '==', subjectName),
        where('courseId', '==', courseId)
      )
      
      const cardsSnapshot = await getDocs(cardsQuery)
      const cardsToDelete = cardsSnapshot.docs
      
      if (cardsToDelete.length > 0) {
        // Deletar todos os flashcards
        const deletePromises = cardsToDelete.map(cardDoc => deleteDoc(cardDoc.ref))
        await Promise.all(deletePromises)
        setMessage(`✅ Matéria "${subjectName}" removida! ${cardsToDelete.length} flashcard(s) deletado(s).`)
      } else {
        setMessage(`✅ Matéria "${subjectName}" removida!`)
      }
      
      // Deletar a matéria do curso
      await deleteDoc(doc(db, 'courses', selectedCourseForFlashcards, 'subjects', subjectId))
    } catch (err) {
      console.error('Erro ao remover matéria:', err)
      setMessage(`❌ Erro ao remover matéria: ${err.message}`)
    }
  }

  // Limpar flashcards órfãos (de matérias/módulos que não existem mais)
  const cleanupOrphanFlashcards = async () => {
    if (!selectedCourseForFlashcards) {
      setMessage('❌ Selecione um curso primeiro.')
      return
    }

    if (!window.confirm(`Deseja limpar flashcards órfãos do curso selecionado?\n\n⚠️ Isso vai DELETAR permanentemente todos os flashcards cuja matéria ou módulo não existem mais no curso.`)) {
      return
    }

    try {
      setMessage('🔍 Verificando flashcards órfãos...')
      
      const courseId = selectedCourseForFlashcards
      
      // Buscar matérias válidas do curso
      let validSubjects = []
      try {
        const subjectsRef = collection(db, 'courses', courseId, 'subjects')
        const subjectsSnapshot = await getDocs(subjectsRef)
        validSubjects = subjectsSnapshot.docs.map(doc => doc.data().name)
      } catch (err) {
        console.warn('Erro ao buscar matérias do curso:', err)
        // Se não conseguir buscar, usar lista vazia (todos serão considerados órfãos)
      }
      
      // Buscar todos os flashcards do curso
      const cardsRef = collection(db, 'flashcards')
      let cardsQuery
      if (courseId === 'alego-default') {
        // Para ALEGO padrão, buscar cards sem courseId
        cardsQuery = query(cardsRef, where('materia', '!=', ''))
      } else {
        cardsQuery = query(cardsRef, where('courseId', '==', courseId))
      }
      
      const cardsSnapshot = await getDocs(cardsQuery)
      
      // Filtrar cards do curso correto (para ALEGO padrão, filtrar os sem courseId)
      const courseCards = cardsSnapshot.docs.filter(doc => {
        const card = doc.data()
        const cardCourseId = card.courseId || null
        
        if (courseId === 'alego-default') {
          return !cardCourseId || cardCourseId === '' || cardCourseId === null || cardCourseId === undefined
        }
        return cardCourseId === courseId || String(cardCourseId) === String(courseId)
      })
      
      // Usar módulos válidos do estado (que são baseados nos flashcards organizados)
      // Se não houver módulos no estado, usar os módulos dos flashcards como referência
      const validModulesFromState = modules || {}
      
      // Se não tem módulos no estado, construir a partir dos flashcards
      let validModules = { ...validModulesFromState }
      if (Object.keys(validModules).length === 0) {
        courseCards.forEach(doc => {
          const card = doc.data()
          const materia = card.materia
          const modulo = card.modulo
          if (materia && modulo) {
            if (!validModules[materia]) {
              validModules[materia] = []
            }
            if (!validModules[materia].includes(modulo)) {
              validModules[materia].push(modulo)
            }
          }
        })
      }
      
      // Identificar flashcards órfãos
      const orphanCards = courseCards.filter(doc => {
        const card = doc.data()
        const materia = card.materia
        const modulo = card.modulo
        
        // Se não tem matéria ou módulo, é órfão
        if (!materia || !modulo) {
          return true
        }
        
        // Se tem matérias válidas definidas e a matéria não existe, é órfão
        if (validSubjects.length > 0 && !validSubjects.includes(materia)) {
          return true
        }
        
        // Se o módulo não existe na matéria (verificar no estado de módulos), é órfão
        if (!validModules[materia] || !validModules[materia].includes(modulo)) {
          return true
        }
        
        return false
      })
      
      if (orphanCards.length === 0) {
        setMessage('✅ Nenhum flashcard órfão encontrado!')
        return
      }
      
      // Deletar flashcards órfãos
      const deletePromises = orphanCards.map(cardDoc => deleteDoc(cardDoc.ref))
      await Promise.all(deletePromises)
      
      setMessage(`✅ Limpeza concluída! ${orphanCards.length} flashcard(s) órfão(s) deletado(s).`)
    } catch (err) {
      console.error('Erro ao limpar flashcards órfãos:', err)
      setMessage(`❌ Erro ao limpar flashcards órfãos: ${err.message}`)
    }
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
  const removeModule = async (materia, modulo) => {
    if (!window.confirm(`Deseja remover o módulo "${modulo}" de ${materia}?\n\n⚠️ ATENÇÃO: Todos os flashcards deste módulo serão DELETADOS permanentemente!`)) return
    
    try {
      // Buscar e deletar todos os flashcards deste módulo
      const courseId = selectedCourseForFlashcards || null
      const cardsRef = collection(db, 'flashcards')
      
      // Buscar todos os cards da matéria e módulo (Firestore não permite where com null)
      const cardsQuery = query(
        cardsRef,
        where('materia', '==', materia),
        where('modulo', '==', modulo)
      )
      
      const cardsSnapshot = await getDocs(cardsQuery)
      const cardsToDelete = cardsSnapshot.docs.filter(doc => {
        const data = doc.data()
        const cardCourseId = data.courseId || null
        
        // Se não tem curso selecionado (ALEGO padrão), só deletar cards sem courseId
        if (!courseId || courseId === 'alego-default') {
          return !cardCourseId || cardCourseId === '' || cardCourseId === null || cardCourseId === undefined
        }
        // Se tem curso selecionado, só deletar cards desse curso
        return cardCourseId === courseId || String(cardCourseId) === String(courseId)
      })
      
      if (cardsToDelete.length > 0) {
        // Deletar todos os flashcards
        const deletePromises = cardsToDelete.map(cardDoc => deleteDoc(cardDoc.ref))
        await Promise.all(deletePromises)
        setMessage(`✅ Módulo "${modulo}" removido! ${cardsToDelete.length} flashcard(s) deletado(s).`)
      } else {
        setMessage(`✅ Módulo "${modulo}" removido!`)
      }
      
      // Remover do estado local
      setModules((prev) => ({
        ...prev,
        [materia]: (prev[materia] || []).filter((m) => m !== modulo),
      }))
    } catch (err) {
      console.error('Erro ao remover módulo:', err)
      setMessage(`❌ Erro ao remover módulo: ${err.message}`)
    }
  }

  // Gerar flashcards por IA a partir de conteúdo colado (estilo Noji)
  const generateFlashcardsFromContent = async () => {
    if (!flashcardForm.materia || !flashcardForm.modulo || !aiContentInput.trim()) {
      setMessage('❌ Selecione matéria, módulo e cole o conteúdo.')
      return
    }

    if (flashcardsQuantity < 5 || flashcardsQuantity > 50) {
      setMessage('❌ A quantidade deve estar entre 5 e 50 flashcards.')
      return
    }

    setGeneratingFlashcards(true)
    setFlashcardGenProgress('Iniciando geração de flashcards...')
    setMessage('')

    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY
      const groqApiKey = import.meta.env.VITE_GROQ_API_KEY
      
      if (!apiKey && !groqApiKey) {
        throw new Error('Configure VITE_GEMINI_API_KEY ou VITE_GROQ_API_KEY no .env')
      }

      const courseIdToUse = (flashcardForm.courseId || selectedCourseForFlashcards || '').trim() || null
      const materia = flashcardForm.materia
      const modulo = flashcardForm.modulo

      // Carregar edital se disponível (do curso selecionado)
      let editalInfo = ''
      try {
        const courseIdForGeneration = (flashcardForm.courseId || selectedCourseForFlashcards || '').trim() || 'alego-default'
        const editalRef = doc(db, 'courses', courseIdForGeneration, 'prompts', 'edital')
        const editalDoc = await getDoc(editalRef)
        if (editalDoc.exists()) {
          const data = editalDoc.data()
          editalInfo = data.prompt || ''
        } else {
          // Fallback para config antigo (migração)
          const oldEditalDoc = await getDoc(doc(db, 'config', 'edital'))
          if (oldEditalDoc.exists()) {
            const data = oldEditalDoc.data()
            editalInfo = data.prompt || ''
          }
        }
      } catch (err) {
        console.warn('Erro ao carregar edital:', err)
      }

      setFlashcardGenProgress('Analisando conteúdo e gerando flashcards...')

      // Prompt estilo Noji
      const prompt = `Você é um especialista em criar flashcards educacionais no estilo Noji (perguntas objetivas e respostas claras e diretas).

TAREFA: Analisar o conteúdo fornecido abaixo e criar flashcards para o módulo "${modulo}" da matéria "${materia}".

${editalInfo ? `CONTEXTO DO EDITAL:\n${editalInfo}\n\n` : ''}

CONTEÚDO PARA ANÁLISE:
${aiContentInput}

INSTRUÇÕES PARA OS FLASHCARDS (ESTILO NOJI):
1. Cada flashcard deve ter:
   - Pergunta: Objetiva, direta, focada em um conceito específico
   - Resposta: Clara, concisa, sem enrolação, com informações essenciais

2. Estilo Noji:
   - Perguntas devem ser diretas e práticas
   - Respostas devem ser curtas mas completas (2-4 frases)
   - Foco em conceitos importantes e aplicáveis
   - Linguagem simples e profissional
   - Evitar informações desnecessárias

3. Quantidade:
   - Crie exatamente ${flashcardsQuantity} flashcards baseados no conteúdo fornecido
   - Priorize os conceitos mais importantes
   - Garanta cobertura completa do conteúdo
   - Se o conteúdo for extenso, distribua os flashcards de forma equilibrada

4. Qualidade:
   - Cada flashcard deve ser independente e completo
   - Perguntas devem testar compreensão real do conceito
   - Respostas devem ser úteis para revisão rápida

FORMATO DE RESPOSTA (OBRIGATÓRIO - APENAS JSON):
Retorne APENAS um objeto JSON válido no seguinte formato:

{
  "flashcards": [
    {
      "pergunta": "Pergunta objetiva e direta",
      "resposta": "Resposta clara e concisa (2-4 frases)"
    },
    {
      "pergunta": "Outra pergunta",
      "resposta": "Outra resposta"
    }
  ]
}

REGRAS CRÍTICAS:
- Retorne APENAS o JSON, sem markdown (sem \`\`\`json)
- Sem explicações antes ou depois
- Sem texto adicional
- Apenas o objeto JSON puro começando com { e terminando com }
- Baseie-se EXCLUSIVAMENTE no conteúdo fornecido acima`

      let responseText = ''
      
      if (apiKey) {
        try {
          setFlashcardGenProgress('Chamando Gemini API...')
          const genAI = new GoogleGenerativeAI(apiKey)
          const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })
          const result = await model.generateContent(prompt)
          responseText = result.response.text()
        } catch (geminiError) {
          console.warn('Erro com Gemini, tentando Groq...', geminiError)
          if (groqApiKey) {
            setFlashcardGenProgress('Chamando Groq API...')
            responseText = await callGroqAPI(prompt)
          } else {
            throw geminiError
          }
        }
      } else if (groqApiKey) {
        setFlashcardGenProgress('Chamando Groq API...')
        responseText = await callGroqAPI(prompt)
      }

      setFlashcardGenProgress('Processando resposta da IA...')

      // Limpar resposta (remover markdown se houver)
      let cleanedResponse = responseText.trim()
      if (cleanedResponse.startsWith('```json')) {
        cleanedResponse = cleanedResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      } else if (cleanedResponse.startsWith('```')) {
        cleanedResponse = cleanedResponse.replace(/```\n?/g, '').trim()
      }

      // Parsear JSON
      const parsed = JSON.parse(cleanedResponse)
      const flashcards = parsed.flashcards || []

      if (flashcards.length === 0) {
        throw new Error('Nenhum flashcard foi gerado pela IA.')
      }

      setFlashcardGenProgress(`Criando ${flashcards.length} flashcards no banco de dados...`)

      // Criar flashcards no Firestore
      const cardsRef = collection(db, 'flashcards')
      let createdCount = 0

      for (const card of flashcards) {
        if (card.pergunta && card.resposta) {
          await addDoc(cardsRef, {
            pergunta: card.pergunta.trim(),
            resposta: card.resposta.trim(),
            materia: materia,
            modulo: modulo,
            courseId: courseIdToUse,
            tags: [],
          })
          createdCount++
        }
      }

      setMessage(`✅ ${createdCount} flashcard(s) gerado(s) com sucesso no módulo "${modulo}"!`)
      setAiContentInput('') // Limpar campo após sucesso
      setFlashcardGenProgress('')
    } catch (err) {
      console.error('Erro ao gerar flashcards:', err)
      setMessage(`❌ Erro ao gerar flashcards: ${err.message}`)
      setFlashcardGenProgress('')
    } finally {
      setGeneratingFlashcards(false)
    }
  }

  // Criar flashcard
  const createFlashcard = async () => {
    if (!flashcardForm.materia || !flashcardForm.modulo || !flashcardForm.pergunta || !flashcardForm.resposta) {
      setMessage('Preencha matéria, módulo, pergunta e resposta.')
      return
    }

    try {
      const cardsRef = collection(db, 'flashcards')
      // Usar curso selecionado no seletor se não tiver no formulário
      // Converter string vazia para null
      const courseIdToUse = (flashcardForm.courseId || selectedCourseForFlashcards || '').trim() || null
      
      console.log('📝 Criando flashcard:', {
        materia: flashcardForm.materia,
        modulo: flashcardForm.modulo,
        courseId: courseIdToUse,
        selectedCourseForFlashcards
      })
      
      await addDoc(cardsRef, {
        pergunta: flashcardForm.pergunta,
        resposta: flashcardForm.resposta,
        materia: flashcardForm.materia,
        modulo: flashcardForm.modulo,
        courseId: courseIdToUse, // ID do curso ao qual pertence (null para ALEGO padrão)
        tags: [],
      })
      
      setFlashcardForm({
        materia: flashcardForm.materia, // Mantém a matéria selecionada
        modulo: flashcardForm.modulo, // Mantém o módulo selecionado
        pergunta: '',
        resposta: '',
        courseId: courseIdToUse || '', // Mantém o curso selecionado
      })
      setMessage(`✅ Flashcard criado com sucesso! ${courseIdToUse ? `(Curso: ${courses.find(c => c.id === courseIdToUse)?.name || 'Selecionado'})` : '(Curso Padrão ALEGO)'}`)
    } catch (err) {
      setMessage('❌ Erro ao criar flashcard.')
      console.error('Erro ao criar flashcard:', err)
    }
  }

  const handleImport = async () => {
    try {
      const parsed = JSON.parse(jsonInput)
      const list = Array.isArray(parsed) ? parsed : [parsed]
      const cardsRef = collection(db, 'flashcards')
      // Usar curso selecionado se não tiver courseId no JSON
      const courseIdToUse = selectedCourseForFlashcards || null
      
      await Promise.all(
        list.map((card) =>
          addDoc(cardsRef, {
            ...card,
            tags: normalizeTags(card.tags),
            courseId: card.courseId || courseIdToUse, // Usar courseId do JSON ou do seletor
          }),
        ),
      )
      setJsonInput('')
      const courseName = courseIdToUse ? courses.find(c => c.id === courseIdToUse)?.name : 'Curso Padrão (ALEGO)'
      setMessage(`✅ ${list.length} flashcards importados com sucesso! (Curso: ${courseName})`)
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
      
      // Verificar se o email já existe no Firebase Auth
      const signInMethods = await fetchSignInMethodsForEmail(auth, email)
      
      if (signInMethods.length > 0) {
        // Email já existe no Firebase Auth
        // Buscar se existe no Firestore
        const usersRef = collection(db, 'users')
        const q = query(usersRef, where('email', '==', email))
        const userSnapshot = await getDocs(q)
        
        if (!userSnapshot.empty) {
          // Usuário existe em ambos - já está cadastrado
          setMessage('❌ Este email já está cadastrado no sistema. O usuário já pode fazer login.')
          return
        }
        
        // Email existe no Auth mas não no Firestore
        // Tentar fazer login com a senha fornecida para pegar o UID e criar perfil
        // Se a senha estiver correta, criamos o perfil. Se não, informamos o que fazer.
        try {
          // Fazer login temporário com o email/senha do usuário para pegar o UID
          const userCredential = await signInWithEmailAndPassword(auth, email, userForm.password)
          const uid = userCredential.user.uid
          
          // Criar perfil no Firestore
          const userRef = doc(db, 'users', uid)
          await setDoc(userRef, {
            uid,
            email,
            displayName: userForm.name || email,
            role: userForm.role || 'student',
            favorites: [],
            createdAt: serverTimestamp(),
            deleted: false,
          })
          
          // Fazer logout do usuário temporário
          await signOut(auth)
          
          setUserForm({ email: '', password: '', name: '', role: 'student' })
          setMessage('✅ Perfil sincronizado no Firestore com sucesso! Faça login novamente como admin. O usuário já pode fazer login.')
          
          // Redirecionar para login após 2 segundos
          setTimeout(() => {
            window.location.href = '/login'
          }, 2000)
          return
        } catch (loginErr) {
          // Senha incorreta ou outro erro
          if (loginErr.code === 'auth/wrong-password') {
            setMessage('⚠️ Este email já existe no Firebase Authentication, mas a senha fornecida está incorreta.\n\nSOLUÇÃO:\n1. Delete o usuário do Firebase Console > Authentication\n   (https://console.firebase.google.com/project/_/authentication/users)\n2. Depois tente criar novamente\n\nOU peça ao usuário para fazer login - o perfil será criado automaticamente.')
          } else {
            setMessage(`⚠️ Este email já existe no Firebase Authentication.\n\nSOLUÇÃO: Delete o usuário do Firebase Console > Authentication primeiro:\nhttps://console.firebase.google.com/project/_/authentication/users\n\nDepois tente criar novamente.`)
          }
          return
        }
      }
      
      // Email não existe no Auth - criar normalmente
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
      setMessage('✅ Usuário criado com sucesso! O novo aluno já pode fazer login.')
    } catch (err) {
      console.error('Erro ao criar usuário:', err)
      if (err.code === 'auth/email-already-in-use') {
        // Fallback caso fetchSignInMethodsForEmail não tenha capturado
        setMessage('⚠️ Este email já está cadastrado no Firebase Authentication. Para recadastrar, delete o usuário do Firebase Console > Authentication primeiro.')
      } else if (err.code === 'auth/weak-password') {
        setMessage('❌ Senha muito fraca. Use pelo menos 6 caracteres.')
      } else {
        setMessage(`❌ Erro ao criar usuário: ${err.message}`)
      }
    }
  }

  // Adicionar curso a um usuário manualmente
  const addCourseToUser = async (userId, courseId) => {
    if (!userId || !courseId) {
      setMessage('❌ Selecione um usuário e um curso.')
      return
    }

    setAddingCourseToUser(true)
    try {
      const userRef = doc(db, 'users', userId)
      const userDoc = await getDoc(userRef)
      
      if (!userDoc.exists()) {
        throw new Error('Usuário não encontrado')
      }

      const userData = userDoc.data()
      const purchasedCourses = userData.purchasedCourses || []
      
      // Verificar se o curso já está na lista
      if (purchasedCourses.includes(courseId)) {
        setMessage('⚠️ Este usuário já possui acesso a este curso.')
        setAddingCourseToUser(false)
        return
      }

      // Adicionar o curso à lista
      const updatedCourses = [...purchasedCourses, courseId]
      
      await updateDoc(userRef, {
        purchasedCourses: updatedCourses,
        updatedAt: serverTimestamp(),
      })

      // Atualizar o estado do usuário no modal
      setSelectedUserForCourse({
        ...selectedUserForCourse,
        purchasedCourses: updatedCourses,
      })

      setMessage(`✅ Curso adicionado com sucesso ao usuário ${userData.displayName || userData.email}!`)
    } catch (err) {
      console.error('Erro ao adicionar curso ao usuário:', err)
      setMessage(`❌ Erro ao adicionar curso: ${err.message}`)
    } finally {
      setAddingCourseToUser(false)
    }
  }

  // Remover curso de um usuário
  const removeCourseFromUser = async (userId, courseId) => {
    if (!window.confirm('Deseja realmente remover o acesso deste usuário a este curso?')) return

    try {
      const userRef = doc(db, 'users', userId)
      const userDoc = await getDoc(userRef)
      
      if (!userDoc.exists()) {
        throw new Error('Usuário não encontrado')
      }

      const userData = userDoc.data()
      const purchasedCourses = userData.purchasedCourses || []
      
      // Remover o curso da lista
      const updatedCourses = purchasedCourses.filter(id => id !== courseId)
      
      await updateDoc(userRef, {
        purchasedCourses: updatedCourses,
        updatedAt: serverTimestamp(),
      })

      // Atualizar o estado do usuário no modal
      setSelectedUserForCourse({
        ...selectedUserForCourse,
        purchasedCourses: updatedCourses,
      })

      setMessage(`✅ Acesso ao curso removido com sucesso!`)
    } catch (err) {
      console.error('Erro ao remover curso do usuário:', err)
      setMessage(`❌ Erro ao remover curso: ${err.message}`)
    }
  }

  const removeUser = async (userUid) => {
    if (!window.confirm(`Deseja realmente excluir este usuário DEFINITIVAMENTE? Esta ação não pode ser desfeita e o usuário será removido completamente do sistema.`)) return
    
    setMessage('Removendo usuário...')
    
    try {
      // Verificar se o usuário atual é admin
      const currentUser = auth.currentUser
      if (!currentUser) {
        throw new Error('Usuário não autenticado')
      }
      
      console.log('🔍 Verificando permissões de admin...')
      console.log('UID do usuário atual:', currentUser.uid)
      console.log('Email do usuário atual:', currentUser.email)
      
      const adminDoc = await getDoc(doc(db, 'users', currentUser.uid))
      if (!adminDoc.exists()) {
        console.error('❌ Documento do admin não encontrado no Firestore')
        throw new Error('Documento de usuário não encontrado. Faça logout e login novamente.')
      }
      
      const adminData = adminDoc.data()
      console.log('📋 Dados do admin:', adminData)
      
      if (adminData.role !== 'admin') {
        console.error('❌ Usuário não é admin. Role atual:', adminData.role)
        throw new Error(`Apenas administradores podem deletar usuários. Seu role atual: ${adminData.role || 'não definido'}`)
      }
      
      console.log('✅ Admin verificado. Iniciando remoção...')
      
      // 1. Obter dados do usuário antes de deletar
      const userRef = doc(db, 'users', userUid)
      const userDoc = await getDoc(userRef)
      if (!userDoc.exists()) {
        throw new Error('Usuário não encontrado')
      }
      const userData = userDoc.data()
      const userEmail = userData?.email || userUid
      
      console.log('📋 Dados do usuário obtidos:', userEmail)
      
      // 2. Forçar atualização do token de autenticação
      console.log('🔄 Atualizando token de autenticação...')
      try {
        await currentUser.getIdToken(true) // Força refresh do token
        console.log('✅ Token atualizado')
      } catch (tokenErr) {
        console.warn('⚠️ Erro ao atualizar token:', tokenErr)
        // Continua mesmo se falhar
      }
      
      // 3. Registrar na coleção deletedUsers ANTES de deletar (para bloquear recriação)
      console.log('📝 Registrando em deletedUsers...')
      try {
        const deletedUserRef = doc(db, 'deletedUsers', userUid)
        await setDoc(deletedUserRef, {
          uid: userUid,
          email: userEmail,
          deletedAt: serverTimestamp(),
          deletedBy: currentUser.email || 'admin',
        })
        console.log('✅ Registrado em deletedUsers')
      } catch (deletedUsersErr) {
        console.error('❌ Erro ao registrar em deletedUsers:', deletedUsersErr)
        console.error('Código do erro:', deletedUsersErr.code)
        console.error('Mensagem completa:', deletedUsersErr.message)
        
        // Se falhar em deletedUsers, tenta continuar mesmo assim
        console.warn('⚠️ Continuando sem registrar em deletedUsers...')
      }
      
      // 4. Marcar como deletado no documento do usuário (para bloquear acesso imediato)
      console.log('📝 Marcando usuário como deletado...')
      try {
        await setDoc(userRef, { 
          deleted: true, 
          deletedAt: serverTimestamp() 
        }, { merge: true })
        console.log('✅ Usuário marcado como deletado')
      } catch (updateErr) {
        console.error('❌ Erro ao atualizar usuário:', updateErr)
        throw new Error(`Erro ao atualizar usuário: ${updateErr.message}. Verifique se você tem permissão de admin.`)
      }
      
      // 5. Deletar dados relacionados do usuário
      console.log('🗑️ Deletando dados relacionados...')
      try {
        // Deletar progresso do usuário
        const progressRef = doc(db, 'userProgress', userUid)
        await deleteDoc(progressRef).catch(() => {
          console.log('⚠️ userProgress não existe ou já foi deletado')
        })
        console.log('✅ userProgress deletado')
        
        // Deletar estatísticas de questões
        const questoesStatsRef = doc(db, 'questoesStats', userUid)
        await deleteDoc(questoesStatsRef).catch(() => {
          console.log('⚠️ questoesStats não existe ou já foi deletado')
        })
        console.log('✅ questoesStats deletado')
        
        // Deletar mensagens do chat
        try {
          const chatsRef = collection(db, 'chats', userUid, 'messages')
          const chatSnapshot = await getDocs(chatsRef)
          if (!chatSnapshot.empty) {
            console.log(`📨 Encontradas ${chatSnapshot.docs.length} mensagens para deletar`)
            const deletePromises = chatSnapshot.docs.map(doc => deleteDoc(doc.ref))
            await Promise.all(deletePromises)
            console.log('✅ Mensagens do chat deletadas')
          } else {
            console.log('⚠️ Nenhuma mensagem encontrada')
          }
        } catch (chatErr) {
          console.warn('⚠️ Erro ao deletar mensagens do chat:', chatErr.message)
          // Continua mesmo se falhar
        }
      } catch (dataErr) {
        console.warn('⚠️ Erro ao deletar dados relacionados:', dataErr.message)
        // Continua mesmo se falhar
      }
      
      // 6. Deletar do Firestore
      console.log('🗑️ Deletando documento do usuário...')
      try {
        await deleteDoc(userRef)
        console.log('✅ Usuário deletado do Firestore')
      } catch (deleteErr) {
        console.error('❌ Erro ao deletar usuário:', deleteErr)
        throw new Error(`Erro ao deletar usuário: ${deleteErr.message}. Verifique se você tem permissão de admin.`)
      }
      
      // 7. Informar sobre Firebase Authentication
      setMessage(`✅ Usuário ${userEmail} removido do Firestore e bloqueado permanentemente. O usuário não conseguirá mais fazer login. Para remover completamente do Firebase Authentication, delete manualmente no Console do Firebase (Authentication > Users).`)
    } catch (err) {
      console.error('❌ Erro ao remover usuário:', err)
      console.error('Detalhes do erro:', {
        code: err.code,
        message: err.message,
        stack: err.stack
      })
      setMessage(`❌ Erro ao remover usuário: ${err.message}. Verifique o console para mais detalhes.`)
    }
  }

  // Funções para gerenciar banners
  const handleBannerImageUpload = (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setMessage('❌ Por favor, selecione uma imagem.')
      return
    }

    // Limitar tamanho (máximo 1MB para base64)
    if (file.size > 1024 * 1024) {
      setMessage('❌ A imagem é muito grande. Máximo: 1MB. Use imagens menores ou comprima antes de enviar.')
      return
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      setBannerForm(prev => ({
        ...prev,
        imageBase64: e.target.result
      }))
    }
    reader.readAsDataURL(file)
  }

  const addBanner = async () => {
    if (!isAdmin) {
      setMessage('❌ Apenas administradores podem adicionar banners.')
      return
    }

    if (!bannerForm.imageBase64) {
      setMessage('❌ Por favor, adicione uma imagem.')
      return
    }

    setUploadingBanner(true)
    try {
      const maxOrder = banners.length > 0 
        ? Math.max(...banners.map(b => b.order || 0))
        : 0

      await addDoc(collection(db, 'homeBanners'), {
        title: bannerForm.title || '',
        imageBase64: bannerForm.imageBase64,
        link: bannerForm.link || '',
        order: bannerForm.order || maxOrder + 1,
        duration: bannerForm.duration || 5000,
        active: bannerForm.active !== false,
        createdAt: serverTimestamp(),
      })

      setMessage('✅ Banner adicionado com sucesso!')
      setBannerForm({
        title: '',
        imageBase64: '',
        link: '',
        order: maxOrder + 2,
        duration: 5000,
        active: true,
      })
    } catch (err) {
      console.error('Erro ao adicionar banner:', err)
      setMessage(`❌ Erro ao adicionar banner: ${err.message}`)
    } finally {
      setUploadingBanner(false)
    }
  }

  const updateBanner = async (bannerId, updates) => {
    try {
      await updateDoc(doc(db, 'homeBanners', bannerId), {
        ...updates,
        updatedAt: serverTimestamp(),
      })
      setMessage('✅ Banner atualizado com sucesso!')
    } catch (err) {
      console.error('Erro ao atualizar banner:', err)
      setMessage(`❌ Erro ao atualizar banner: ${err.message}`)
    }
  }

  const deleteBanner = async (bannerId) => {
    if (!confirm('Tem certeza que deseja excluir este banner?')) return

    try {
      await deleteDoc(doc(db, 'homeBanners', bannerId))
      setMessage('✅ Banner excluído com sucesso!')
    } catch (err) {
      console.error('Erro ao excluir banner:', err)
      setMessage(`❌ Erro ao excluir banner: ${err.message}`)
    }
  }

  // Funções para gerenciar popup banner
  const handlePopupBannerImageUpload = (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setMessage('❌ Por favor, selecione uma imagem.')
      return
    }

    if (file.size > 2 * 1024 * 1024) {
      setMessage('❌ A imagem é muito grande. Máximo: 2MB.')
      return
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      setPopupBanner(prev => ({
        ...prev,
        imageBase64: e.target.result
      }))
    }
    reader.readAsDataURL(file)
  }

  const savePopupBanner = async () => {
    if (!isAdmin) {
      setMessage('❌ Apenas administradores podem salvar popup banner.')
      return
    }

    if (!popupBanner.imageBase64 && !popupBanner.imageUrl) {
      setMessage('❌ Por favor, adicione uma imagem.')
      return
    }

    setUploadingPopupBanner(true)
    try {
      await setDoc(doc(db, 'config', 'popupBanner'), {
        ...popupBanner,
        updatedAt: serverTimestamp(),
      })

      setMessage('✅ Popup banner salvo com sucesso!')
    } catch (err) {
      console.error('Erro ao salvar popup banner:', err)
      setMessage(`❌ Erro ao salvar popup banner: ${err.message}`)
    } finally {
      setUploadingPopupBanner(false)
    }
  }

  // Funções para gerenciar cursos
  // Handler para editar imagem de curso existente
  const handleEditCourseImage = (event, courseId) => {
    const file = event.target.files[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setMessage('❌ Por favor, selecione apenas imagens.')
      return
    }

    // Limitar tamanho (máximo 2MB)
    if (file.size > 2 * 1024 * 1024) {
      setMessage('❌ A imagem é muito grande. Máximo: 2MB.')
      return
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      setNewCourseImage(e.target.result)
      setEditingCourseImage(courseId)
    }
    reader.readAsDataURL(file)
  }

  // Salvar nova imagem do curso
  const saveCourseImage = async (courseId) => {
    if (!newCourseImage) {
      setMessage('❌ Nenhuma imagem selecionada.')
      return
    }

    setUploadingCourse(true)
    try {
      await updateDoc(doc(db, 'courses', courseId), {
        imageBase64: newCourseImage,
        imageUrl: '', // Limpar URL se houver
        updatedAt: serverTimestamp(),
      })
      setMessage('✅ Imagem do curso atualizada com sucesso!')
      setEditingCourseImage(null)
      setNewCourseImage(null)
    } catch (err) {
      console.error('Erro ao atualizar imagem do curso:', err)
      setMessage(`❌ Erro ao atualizar imagem: ${err.message}`)
    } finally {
      setUploadingCourse(false)
    }
  }

  // Cancelar edição de imagem
  const cancelEditCourseImage = () => {
    setEditingCourseImage(null)
    setNewCourseImage(null)
  }

  const handleCourseImageUpload = (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setMessage('❌ Por favor, selecione uma imagem.')
      return
    }

    if (file.size > 2 * 1024 * 1024) {
      setMessage('❌ A imagem é muito grande. Máximo: 2MB.')
      return
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      setCourseForm(prev => ({
        ...prev,
        imageBase64: e.target.result
      }))
    }
    reader.readAsDataURL(file)
  }

  const addCourse = async () => {
    if (!isAdmin) {
      setMessage('❌ Apenas administradores podem adicionar cursos.')
      return
    }

    if (!courseForm.name || !courseForm.competition) {
      setMessage('❌ Por favor, preencha nome e concurso.')
      return
    }

    if (!courseForm.imageBase64 && !courseForm.imageUrl) {
      setMessage('❌ Por favor, adicione uma imagem.')
      return
    }

    setUploadingCourse(true)
    try {
      await addDoc(collection(db, 'courses'), {
        name: courseForm.name,
        description: courseForm.description || '',
        price: parseFloat(courseForm.price) || 99.90,
        originalPrice: parseFloat(courseForm.originalPrice) || 149.99,
        competition: courseForm.competition,
        courseDuration: courseForm.courseDuration || '',
        imageBase64: courseForm.imageBase64 || '',
        imageUrl: courseForm.imageUrl || '',
        active: courseForm.active !== false,
        createdAt: serverTimestamp(),
      })

      setMessage('✅ Curso adicionado com sucesso!')
      setCourseForm({
        name: '',
        description: '',
        price: 99.90,
        originalPrice: 149.99,
        competition: '',
        courseDuration: '',
        imageBase64: '',
        imageUrl: '',
        active: true,
      })
    } catch (err) {
      console.error('Erro ao adicionar curso:', err)
      setMessage(`❌ Erro ao adicionar curso: ${err.message}`)
    } finally {
      setUploadingCourse(false)
    }
  }

  const updateCourse = async (courseId, updates) => {
    try {
      await updateDoc(doc(db, 'courses', courseId), {
        ...updates,
        updatedAt: serverTimestamp(),
      })
      setMessage('✅ Curso atualizado com sucesso!')
    } catch (err) {
      console.error('Erro ao atualizar curso:', err)
      setMessage(`❌ Erro ao atualizar curso: ${err.message}`)
    }
  }

  const deleteCourse = async (courseId) => {
    console.log('🗑️ deleteCourse chamado com courseId:', courseId, 'tipo:', typeof courseId)
    
    if (!courseId) {
      setMessage('❌ ID do curso não fornecido.')
      console.error('❌ courseId é falsy:', courseId)
      return
    }
    
    const confirmMessage = `⚠️ ATENÇÃO: Deseja excluir este curso DEFINITIVAMENTE?\n\nIsso vai DELETAR:\n- Todos os flashcards do curso\n- Todos os prompts (edital e questões)\n- Todas as matérias do curso\n- Todo o progresso dos usuários neste curso\n\nEsta ação NÃO pode ser desfeita!`
    
    if (!window.confirm(confirmMessage)) {
      console.log('❌ Usuário cancelou a exclusão')
      return
    }

    try {
      setMessage('🗑️ Deletando dados do curso...')
      console.log('🗑️ Iniciando exclusão do curso:', courseId)
      
      // 1. Deletar todos os flashcards do curso
      console.log('🗑️ Deletando flashcards do curso...')
      const cardsRef = collection(db, 'flashcards')
      const cardsQuery = query(cardsRef, where('courseId', '==', courseId))
      const cardsSnapshot = await getDocs(cardsQuery)
      const cardsToDelete = cardsSnapshot.docs
      
      if (cardsToDelete.length > 0) {
        const deleteCardsPromises = cardsToDelete.map(cardDoc => deleteDoc(cardDoc.ref))
        await Promise.all(deleteCardsPromises)
        console.log(`✅ ${cardsToDelete.length} flashcard(s) deletado(s)`)
      }
      
      // 2. Deletar prompts do curso (edital e questões)
      console.log('🗑️ Deletando prompts do curso...')
      try {
        const editalRef = doc(db, 'courses', courseId, 'prompts', 'edital')
        await deleteDoc(editalRef).catch(() => console.log('⚠️ Prompt edital não existe'))
        
        const questoesRef = doc(db, 'courses', courseId, 'prompts', 'questoes')
        await deleteDoc(questoesRef).catch(() => console.log('⚠️ Prompt questões não existe'))
        console.log('✅ Prompts deletados')
      } catch (promptErr) {
        console.warn('⚠️ Erro ao deletar prompts:', promptErr)
      }
      
      // 3. Deletar matérias do curso (subcoleção)
      console.log('🗑️ Deletando matérias do curso...')
      try {
        const subjectsRef = collection(db, 'courses', courseId, 'subjects')
        const subjectsSnapshot = await getDocs(subjectsRef)
        const subjectsToDelete = subjectsSnapshot.docs
        
        if (subjectsToDelete.length > 0) {
          const deleteSubjectsPromises = subjectsToDelete.map(subjectDoc => deleteDoc(subjectDoc.ref))
          await Promise.all(deleteSubjectsPromises)
          console.log(`✅ ${subjectsToDelete.length} matéria(s) deletada(s)`)
        }
      } catch (subjectErr) {
        console.warn('⚠️ Erro ao deletar matérias:', subjectErr)
      }
      
      // 4. Deletar progresso dos usuários relacionado ao curso
      console.log('🗑️ Deletando progresso dos usuários...')
      try {
        const progressRef = collection(db, 'progress')
        const progressSnapshot = await getDocs(progressRef)
        const progressToDelete = progressSnapshot.docs.filter(doc => {
          const data = doc.data()
          return data.courseId === courseId || String(data.courseId) === String(courseId)
        })
        
        if (progressToDelete.length > 0) {
          const deleteProgressPromises = progressToDelete.map(progressDoc => deleteDoc(progressDoc.ref))
          await Promise.all(deleteProgressPromises)
          console.log(`✅ ${progressToDelete.length} registro(s) de progresso deletado(s)`)
        }
      } catch (progressErr) {
        console.warn('⚠️ Erro ao deletar progresso:', progressErr)
      }
      
      // 5. Deletar estatísticas de questões relacionadas ao curso
      console.log('🗑️ Deletando estatísticas de questões...')
      try {
        const questoesStatsRef = collection(db, 'questoesStats')
        const questoesStatsSnapshot = await getDocs(questoesStatsRef)
        const statsToDelete = questoesStatsSnapshot.docs.filter(doc => {
          const data = doc.data()
          return data.courseId === courseId || String(data.courseId) === String(courseId)
        })
        
        if (statsToDelete.length > 0) {
          const deleteStatsPromises = statsToDelete.map(statDoc => deleteDoc(statDoc.ref))
          await Promise.all(deleteStatsPromises)
          console.log(`✅ ${statsToDelete.length} estatística(s) deletada(s)`)
        }
      } catch (statsErr) {
        console.warn('⚠️ Erro ao deletar estatísticas:', statsErr)
      }
      
      // 6. Remover referências do curso nos perfis de usuários (purchasedCourses e selectedCourseId)
      console.log('🗑️ Removendo referências do curso nos perfis de usuários...')
      try {
        const usersRef = collection(db, 'users')
        const usersSnapshot = await getDocs(usersRef)
        const usersToUpdate = usersSnapshot.docs.filter(doc => {
          const data = doc.data()
          const purchasedCourses = data.purchasedCourses || []
          const selectedCourseId = data.selectedCourseId
          return purchasedCourses.includes(courseId) || selectedCourseId === courseId || String(selectedCourseId) === String(courseId)
        })
        
        if (usersToUpdate.length > 0) {
          const updatePromises = usersToUpdate.map(userDoc => {
            const data = userDoc.data()
            const purchasedCourses = (data.purchasedCourses || []).filter(id => id !== courseId)
            const selectedCourseId = data.selectedCourseId === courseId || String(data.selectedCourseId) === String(courseId) 
              ? null // Resetar para ALEGO padrão se estava selecionado
              : data.selectedCourseId
            
            const updateData = {
              purchasedCourses: purchasedCourses
            }
            
            // Só atualizar selectedCourseId se estava selecionado
            if (selectedCourseId === null && data.selectedCourseId === courseId) {
              updateData.selectedCourseId = null
            }
            
            return updateDoc(userDoc.ref, updateData)
          })
          await Promise.all(updatePromises)
          console.log(`✅ ${usersToUpdate.length} perfil(is) de usuário atualizado(s)`)
        }
      } catch (userErr) {
        console.warn('⚠️ Erro ao atualizar perfis de usuários:', userErr)
      }
      
      // 7. Deletar o curso em si
      console.log('🗑️ Deletando documento do curso...')
      const courseRef = doc(db, 'courses', courseId)
      
      // Verificar se o curso existe antes de deletar
      const courseDoc = await getDoc(courseRef)
      if (!courseDoc.exists()) {
        setMessage('❌ Curso não encontrado. Pode já ter sido deletado.')
        return
      }
      
      await deleteDoc(courseRef)
      console.log('✅ Curso deletado do Firestore')
      
      // Marcar curso como deletado recentemente para evitar recriação automática
      const newSet = new Set(recentlyDeletedCoursesRef.current)
      newSet.add(courseId)
      recentlyDeletedCoursesRef.current = newSet
      setRecentlyDeletedCourses(newSet)
      
      // Remover da lista de deletados após 10 segundos (tempo suficiente para o onSnapshot atualizar)
      setTimeout(() => {
        const updatedSet = new Set(recentlyDeletedCoursesRef.current)
        updatedSet.delete(courseId)
        recentlyDeletedCoursesRef.current = updatedSet
        setRecentlyDeletedCourses(updatedSet)
      }, 10000)
      
      // O onSnapshot vai atualizar automaticamente a lista
      // Não precisamos recarregar manualmente
      
      const totalDeleted = cardsToDelete.length
      setMessage(`✅ Curso excluído com sucesso! ${totalDeleted} flashcard(s) e todos os dados relacionados foram removidos. A lista será atualizada automaticamente.`)
    } catch (err) {
      console.error('Erro ao excluir curso:', err)
      console.error('Detalhes do erro:', {
        code: err.code,
        message: err.message,
        stack: err.stack
      })
      const errorMessage = err.message || String(err)
      if (errorMessage.includes('permission') || errorMessage.includes('Permission') || err.code === 'permission-denied') {
        setMessage(`❌ Erro de permissão ao excluir curso. Verifique se você é administrador e se as regras do Firestore estão atualizadas.`)
      } else if (errorMessage.includes('not-found') || err.code === 'not-found') {
        setMessage('❌ Curso não encontrado. Pode já ter sido deletado.')
      } else {
        setMessage(`❌ Erro ao excluir curso: ${errorMessage}. Verifique o console para mais detalhes.`)
      }
    }
  }

  // Gerar automaticamente módulos e flashcards completos a partir do PDF do edital
  const generateFullCourseFromEdital = async (courseId, isRegenerating = false) => {
    if (!editalPdfTextForGeneration.trim()) {
      setMessage('❌ Faça upload do PDF do edital primeiro.')
      return
    }

    if (!cargoForGeneration.trim()) {
      setMessage('❌ Informe o cargo específico para filtrar as matérias corretas.')
      return
    }

    const confirmMessage = isRegenerating 
      ? `⚠️ ATENÇÃO: Isso vai REGENERAR o curso:\n\n- Deletar TODOS os flashcards existentes\n- Manter as matérias e módulos existentes\n- Gerar novos flashcards focados no CONTEÚDO (não no cargo)\n\nBaseado no edital do PDF.\n\nIsso pode demorar vários minutos. Deseja continuar?`
      : `⚠️ ATENÇÃO: Isso vai gerar AUTOMATICAMENTE:\n\n- Todas as matérias do cargo: ${cargoForGeneration}\n- Todos os módulos de cada matéria\n- Todos os flashcards de cada módulo (focados no CONTEÚDO)\n\nBaseado no edital do PDF.\n\nIsso pode demorar vários minutos. Deseja continuar?`

    if (!window.confirm(confirmMessage)) {
      return
    }

    // Se estiver regenerando, deletar flashcards antigos primeiro
    if (isRegenerating) {
      setFullCourseProgress('🗑️ Deletando flashcards antigos...')
      try {
        const cardsRef = collection(db, 'flashcards')
        const cardsQuery = query(cardsRef, where('courseId', '==', courseId))
        const cardsSnapshot = await getDocs(cardsQuery)
        const cardsToDelete = cardsSnapshot.docs
        
        if (cardsToDelete.length > 0) {
          const deletePromises = cardsToDelete.map(cardDoc => deleteDoc(cardDoc.ref))
          await Promise.all(deletePromises)
          setFullCourseProgress(`✅ ${cardsToDelete.length} flashcard(s) antigo(s) deletado(s). Gerando novos...`)
        }
      } catch (err) {
        console.warn('Erro ao deletar flashcards antigos:', err)
        setFullCourseProgress('⚠️ Erro ao deletar flashcards antigos, continuando...')
      }
    }

    setGeneratingFullCourse(true)
    setFullCourseProgress('Iniciando geração completa do curso...')
    setMessage('')

    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY
      if (!apiKey) {
        throw new Error('VITE_GEMINI_API_KEY não configurada. Configure no arquivo .env')
      }

      const genAI = new GoogleGenerativeAI(apiKey)
      
      // Modelos disponíveis na API paga do Gemini (ordem de prioridade: melhor primeiro)
      // gemini-2.0-flash: Mais recente, rápido e eficiente (recomendado)
      // gemini-1.5-pro-latest: Melhor para tarefas complexas que requerem mais contexto
      const modelNames = [
        'gemini-2.0-flash',           // Modelo mais recente e recomendado
        'gemini-1.5-pro-latest',      // Melhor para análises complexas
        'gemini-1.5-pro',             // Fallback Pro
        'gemini-1.5-flash-latest'    // Fallback Flash
      ]
      let model = null
      let lastError = null
      
      // Para API paga, tentar usar o melhor modelo primeiro
      // Simplificar: apenas criar o modelo e usar (sem teste prévio que pode falhar)
      for (const modelName of modelNames) {
        try {
          model = genAI.getGenerativeModel({ model: modelName })
          console.log(`✅ Tentando usar modelo: ${modelName}`)
          // Não testar antes - usar diretamente e deixar falhar na primeira chamada real se necessário
          // Isso evita falsos negativos no teste
          break
        } catch (err) {
          // Se nem conseguir criar o modelo, tentar próximo
          const errorMsg = err.message?.toLowerCase() || ''
          if (errorMsg.includes('not found') || errorMsg.includes('404') || errorMsg.includes('not available')) {
            console.warn(`⚠️ Modelo ${modelName} não disponível, tentando próximo...`)
            lastError = err
            continue
          } else {
            // Se for outro erro, ainda tentar usar
            console.log(`⚠️ Aviso ao criar modelo ${modelName}, mas tentando usar mesmo assim...`)
            model = genAI.getGenerativeModel({ model: modelName })
            break
          }
        }
      }
      
      if (!model) {
        // Se nenhum modelo funcionou, tentar listar modelos disponíveis da API
        try {
          console.log('🔍 Listando modelos disponíveis da API...')
          const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
          )
          
          if (response.ok) {
            const data = await response.json()
            const models = data.models || []
            const generateModels = models.filter((m) => {
              return (m.supportedGenerationMethods || []).includes('generateContent')
            })
            
            if (generateModels.length > 0) {
              // Usar o primeiro modelo disponível
              const firstModelName = generateModels[0].name.replace('models/', '')
              model = genAI.getGenerativeModel({ model: firstModelName })
              console.log(`✅ Usando modelo descoberto: ${firstModelName}`)
            }
          }
        } catch (listErr) {
          console.warn('⚠️ Erro ao listar modelos:', listErr)
        }
      }
      
      if (!model) {
        // Se nenhum modelo Gemini funcionar, tentar Groq como fallback
        const groqApiKey = import.meta.env.VITE_GROQ_API_KEY
        if (groqApiKey) {
          console.log('⚠️ Nenhum modelo Gemini disponível, usando Groq como fallback...')
          // Continuar com Groq (será usado mais tarde se necessário)
        } else {
          throw new Error('Nenhum modelo de IA disponível. Verifique se VITE_GEMINI_API_KEY está configurada corretamente no arquivo .env')
        }
      }

      // 1. Analisar o edital e extrair matérias e estrutura APENAS DO CARGO ESPECÍFICO
      setFullCourseProgress(`📄 Analisando o edital e extraindo matérias do cargo: ${cargoForGeneration}...`)
      const analysisPrompt = `Você é um especialista em análise de editais de concursos públicos.

Analise o edital abaixo e extraia APENAS as informações relevantes para o CARGO ESPECÍFICO mencionado.

CARGO ESPECÍFICO: ${cargoForGeneration}

EDITAL:
${editalPdfTextForGeneration.substring(0, 100000)}${editalPdfTextForGeneration.length > 100000 ? '\n\n[... conteúdo truncado ...]' : ''}

TAREFA CRÍTICA - EXTRAIR TODAS AS MATÉRIAS E MÓDULOS:
1. Identifique TODAS as matérias que serão cobradas para o cargo "${cargoForGeneration}"
2. IGNORE completamente matérias de outros cargos que possam estar no edital
3. Procure no edital a seção específica do cargo "${cargoForGeneration}" e suas matérias
4. Para CADA matéria identificada, encontre TODOS os tópicos/conteúdos principais mencionados no edital
5. Organize os tópicos em módulos lógicos (4-8 módulos por matéria, dependendo do tamanho)
6. Cada módulo deve ter um nome descritivo e claro
7. NÃO deixe nenhuma matéria sem módulos
8. NÃO deixe nenhum módulo sem tópicos
9. Seja COMPLETO e EXAUSTIVO - extraia TUDO que está no edital para este cargo

IMPORTANTE - FILTRO POR CARGO:
- O edital pode conter múltiplos cargos (ex: Policial, Escrivão, Delegado, etc.)
- Você DEVE filtrar e extrair APENAS as matérias do cargo "${cargoForGeneration}"
- Se o edital mencionar "Cargo: ${cargoForGeneration}" ou similar, foque APENAS nessa seção
- NÃO inclua matérias de outros cargos
- Se não encontrar matérias específicas para "${cargoForGeneration}", retorne um JSON vazio
- Seja ESPECÍFICO e DETALHADO, mas APENAS para o cargo informado
- Baseie-se EXCLUSIVAMENTE no conteúdo do edital
- Organize de forma lógica e pedagógica
- Módulos devem ter tamanho similar (não muito grandes, não muito pequenos)
- GARANTA que TODAS as matérias do edital para este cargo sejam incluídas
- GARANTA que CADA matéria tenha pelo menos 3 módulos

Retorne APENAS um JSON válido no seguinte formato:
{
  "materias": [
    {
      "nome": "Nome da Matéria",
      "modulos": [
        {
          "nome": "Nome do Módulo 1",
          "topicos": ["tópico 1", "tópico 2", "tópico 3", ...]
        },
        {
          "nome": "Nome do Módulo 2",
          "topicos": ["tópico 1", "tópico 2", "tópico 3", ...]
        }
      ]
    }
  ]
}

IMPORTANTE: Retorne TODAS as matérias e TODOS os módulos. Não deixe nada faltando. Retorne APENAS o JSON, sem markdown, sem explicações.`

      if (!model) {
        throw new Error('Modelo de IA não disponível. Verifique as configurações da API.')
      }

      // Tentar usar o modelo - se falhar, tentar próximo modelo
      let analysisResult = null
      let analysisText = ''
      
      // Função auxiliar para detectar erro de quota
      const isQuotaError = (err) => {
        const errorMsg = err.message?.toLowerCase() || ''
        const errorString = JSON.stringify(err) || ''
        return (
          errorMsg.includes('429') ||
          errorMsg.includes('quota') ||
          errorMsg.includes('quota exceeded') ||
          errorMsg.includes('free_tier_requests') ||
          errorMsg.includes('too many requests') ||
          errorMsg.includes('resource_exhausted') ||
          errorMsg.includes('rate limit') ||
          errorString.includes('429') ||
          errorString.includes('quota') ||
          errorString.includes('free_tier_requests') ||
          err.status === 429 ||
          err.code === 429
        )
      }
      
      // Função auxiliar para extrair tempo de espera do erro
      const extractWaitTime = (err) => {
        const errorMsg = err.message || ''
        const retryMatch = errorMsg.match(/retry in ([\d.]+)/i) || 
                          errorMsg.match(/(\d+\.?\d*)\s*seconds?/i)
        return retryMatch ? Math.ceil(parseFloat(retryMatch[1])) : null
      }
      
      try {
        analysisResult = await model.generateContent(analysisPrompt)
        analysisText = analysisResult.response.text().trim()
      } catch (modelErr) {
        // Verificar se é erro de quota
        if (isQuotaError(modelErr)) {
          const waitTime = extractWaitTime(modelErr)
          const waitSeconds = waitTime || 60
          
          setFullCourseProgress(`⏳ Quota excedida. Aguardando ${waitSeconds} segundos antes de tentar novamente...`)
          
          // Aguardar o tempo sugerido
          await new Promise(resolve => setTimeout(resolve, waitSeconds * 1000))
          
          // Tentar novamente uma vez
          try {
            analysisResult = await model.generateContent(analysisPrompt)
            analysisText = analysisResult.response.text().trim()
            setFullCourseProgress('✅ Retry bem-sucedido após aguardar quota!')
          } catch (retryErr) {
            if (isQuotaError(retryErr)) {
              throw new Error(`Quota da API excedida. Você atingiu o limite de 200 requisições/dia do plano gratuito. Aguarde até amanhã ou faça upgrade para um plano pago em https://ai.google.dev/pricing`)
            }
            throw retryErr
          }
        } else {
          // Se não for erro de quota, tentar outros modelos
          console.warn('⚠️ Primeiro modelo falhou, tentando outros...', modelErr.message)
          
          for (const fallbackModelName of modelNames.slice(1)) {
            try {
              const fallbackModel = genAI.getGenerativeModel({ model: fallbackModelName })
              analysisResult = await fallbackModel.generateContent(analysisPrompt)
              analysisText = analysisResult.response.text().trim()
              model = fallbackModel // Usar este modelo para as próximas chamadas
              console.log(`✅ Usando modelo alternativo: ${fallbackModelName}`)
              break
            } catch (fallbackErr) {
              // Se for erro de quota no fallback, parar e informar
              if (isQuotaError(fallbackErr)) {
                const waitTime = extractWaitTime(fallbackErr)
                const waitSeconds = waitTime || 60
                throw new Error(`Quota da API excedida. Aguarde ${waitSeconds} segundos ou faça upgrade para um plano pago em https://ai.google.dev/pricing`)
              }
              console.warn(`⚠️ Modelo ${fallbackModelName} também falhou, tentando próximo...`)
              continue
            }
          }
          
          if (!analysisResult) {
            throw new Error('Nenhum modelo de IA funcionou. Verifique sua API key e permissões.')
          }
        }
      }
      
      // Limpar markdown se houver
      if (analysisText.startsWith('```json')) {
        analysisText = analysisText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      } else if (analysisText.startsWith('```')) {
        analysisText = analysisText.replace(/```\n?/g, '').trim()
      }

      const analysis = JSON.parse(analysisText)
      const materias = analysis.materias || []

      if (materias.length === 0) {
        throw new Error('Nenhuma matéria foi identificada no edital.')
      }

      // Validar que todas as matérias têm módulos
      const materiasComModulos = materias.filter(m => m.modulos && m.modulos.length > 0)
      if (materiasComModulos.length < materias.length) {
        const materiasSemModulos = materias.filter(m => !m.modulos || m.modulos.length === 0)
        console.warn('⚠️ Algumas matérias não têm módulos:', materiasSemModulos.map(m => m.nome))
        setFullCourseProgress(`⚠️ ${materiasSemModulos.length} matéria(s) sem módulos detectada(s). Continuando com as que têm módulos...`)
      }

      setFullCourseProgress(`✅ ${materiasComModulos.length} matéria(s) identificada(s) com módulos. Iniciando criação...`)

      // 2. Criar matérias no curso (apenas se não estiver regenerando)
      const subjectsRef = collection(db, 'courses', courseId, 'subjects')
      const createdSubjects = []
      
      if (!isRegenerating) {
        for (const materia of materiasComModulos) {
          try {
            // Verificar se a matéria já existe
            const existingSubjectsSnapshot = await getDocs(subjectsRef)
            const existingSubject = existingSubjectsSnapshot.docs.find(doc => doc.data().name === materia.nome)
            
            if (!existingSubject) {
              await addDoc(subjectsRef, {
                name: materia.nome,
                createdAt: serverTimestamp(),
              })
              createdSubjects.push(materia.nome)
              setFullCourseProgress(`✅ Matéria "${materia.nome}" criada (${materia.modulos.length} módulos).`)
            } else {
              createdSubjects.push(materia.nome)
              setFullCourseProgress(`✅ Matéria "${materia.nome}" já existe (${materia.modulos.length} módulos).`)
            }
          } catch (err) {
            console.error(`Erro ao criar matéria ${materia.nome}:`, err)
            setFullCourseProgress(`⚠️ Erro ao criar matéria "${materia.nome}": ${err.message}`)
            // Continuar mesmo se falhar
          }
        }
      } else {
        // Se regenerando, apenas listar matérias existentes
        const existingSubjectsSnapshot = await getDocs(subjectsRef)
        createdSubjects.push(...existingSubjectsSnapshot.docs.map(doc => doc.data().name))
        setFullCourseProgress(`✅ Usando ${createdSubjects.length} matéria(s) existente(s). Gerando flashcards...`)
      }

      // 3. Gerar flashcards para cada módulo
      const cardsRef = collection(db, 'flashcards')
      let totalFlashcardsCreated = 0
      
      // Usar apenas matérias que têm módulos
      let materiasToProcess = materiasComModulos
      
      // Se regenerando, usar matérias existentes do curso
      if (isRegenerating) {
        // Buscar matérias existentes e mapear com os módulos do edital
        const existingSubjectsSnapshot = await getDocs(subjectsRef)
        const existingSubjects = existingSubjectsSnapshot.docs.map(doc => doc.data().name)
        
        // Filtrar apenas matérias que existem no curso E têm módulos
        materiasToProcess = materiasComModulos.filter(m => existingSubjects.includes(m.nome))
        
        if (materiasToProcess.length === 0) {
          throw new Error('Nenhuma matéria do edital corresponde às matérias existentes no curso.')
        }
        
        setFullCourseProgress(`✅ ${materiasToProcess.length} matéria(s) encontrada(s) com módulos. Gerando flashcards...`)
      }
      
      // Validar que todas as matérias têm módulos
      const materiasValidas = materiasToProcess.filter(m => m.modulos && m.modulos.length > 0)
      if (materiasValidas.length < materiasToProcess.length) {
        const semModulos = materiasToProcess.filter(m => !m.modulos || m.modulos.length === 0)
        console.warn('⚠️ Matérias sem módulos serão puladas:', semModulos.map(m => m.nome))
        setFullCourseProgress(`⚠️ ${semModulos.length} matéria(s) sem módulos será(ão) pulada(s).`)
      }
      
      const totalModulos = materiasValidas.reduce((acc, m) => acc + (m.modulos?.length || 0), 0)
      let currentModulo = 0

      for (const materia of materiasValidas) {
        if (!materia.modulos || materia.modulos.length === 0) {
          console.warn(`⚠️ Matéria "${materia.nome}" não tem módulos, pulando...`)
          continue
        }
        
        for (const modulo of materia.modulos) {
          if (!modulo.topicos || modulo.topicos.length === 0) {
            console.warn(`⚠️ Módulo "${modulo.nome}" da matéria "${materia.nome}" não tem tópicos, pulando...`)
            continue
          }
          
          currentModulo++
          setFullCourseProgress(`📝 Gerando flashcards para ${materia.nome} - ${modulo.nome} (${currentModulo}/${totalModulos})...`)

          // Gerar flashcards para este módulo
          const flashcardsPrompt = `Você é um especialista em criar flashcards educacionais para concursos públicos, seguindo o padrão de questões objetivas e diretas.

EDITAL DO CONCURSO:
${editalPdfTextForGeneration.substring(0, 50000)}${editalPdfTextForGeneration.length > 50000 ? '\n\n[... conteúdo truncado ...]' : ''}

MATÉRIA: ${materia.nome}
MÓDULO: ${modulo.nome}
TÓPICOS DO MÓDULO: ${modulo.topicos.join(', ')}

TAREFA:
Crie flashcards educacionais focados EXCLUSIVAMENTE no CONTEÚDO da matéria e módulo acima. Baseie-se no edital para entender o que será cobrado e crie flashcards no padrão de questões objetivas de concurso.

REGRAS CRÍTICAS PARA OS FLASHCARDS:
- FOCE 100% NO CONTEÚDO EDUCACIONAL: Os flashcards devem ENSINAR o conteúdo, como se fossem questões objetivas de concurso
- Estilo de questões objetivas: perguntas diretas e respostas claras e completas (2-4 frases)
- Baseie-se EXCLUSIVAMENTE no conteúdo do edital para identificar o que será cobrado
- Crie 18-25 flashcards por módulo (garanta cobertura completa de todos os tópicos)
- Cada flashcard deve cobrir um tópico/conceito específico do conteúdo
- Perguntas devem ser diretas, objetivas e práticas sobre o CONTEÚDO (como questões de prova)
- Respostas devem explicar o CONTEÚDO de forma clara, educacional e completa
- NÃO mencione o cargo (ex: evite "para policial legislativo", "para o cargo X")
- NÃO mencione a banca repetidamente (ex: evite "cai muito na FGV", "a banca X sempre cobra")
- Pode mencionar a banca APENAS quando for absolutamente necessário para contextualizar (ex: "A banca X costuma cobrar este tema de forma..."), mas máximo 1-2 vezes em todos os flashcards
- O foco deve ser 100% ENSINAR O CONTEÚDO, como se fosse uma questão de prova objetiva
- Seja natural: flashcards que ensinam o conteúdo, não que ficam repetindo informações sobre o concurso
- Use linguagem técnica e precisa, como em questões de concurso
- As perguntas devem ser formuladas como questões objetivas (ex: "O que é...?", "Quais são...?", "Explique...", "Qual a diferença entre...?")

EXEMPLOS DO QUE NÃO FAZER (ERRADO):
❌ "Por que estudar geopolítica para policial legislativo?"
❌ "Cai muito na FGV sobre geopolítica para policial legislativo"
❌ "Para policial legislativo, é importante saber sobre geopolítica porque..."
❌ "A banca FGV sempre cobra geopolítica para este cargo"

EXEMPLOS DO QUE FAZER (CORRETO):
✅ "O que é geopolítica?"
✅ "Quais são os principais fatores geopolíticos que influenciam as relações internacionais?"
✅ "Explique o conceito de poder geopolítico e sua importância nas relações entre Estados."
✅ "Qual a diferença entre geopolítica e geografia política?"

IMPORTANTE:
- Crie flashcards para TODOS os tópicos do módulo
- Não deixe nenhum tópico sem flashcard
- Garanta cobertura completa do conteúdo do módulo
- Os flashcards devem ser úteis para estudo, como questões de prova

Retorne APENAS um JSON válido:
{
  "flashcards": [
    {
      "pergunta": "Pergunta objetiva sobre o CONTEÚDO (estilo questão de prova)",
      "resposta": "Resposta educacional clara e completa explicando o CONTEÚDO (2-4 frases)"
    }
  ]
}

Retorne APENAS o JSON, sem markdown, sem explicações.`

          try {
            if (!model) {
              throw new Error('Modelo de IA não disponível. Verifique as configurações.')
            }
            
            let flashcardsResult = null
            let flashcardsText = ''
            
            // Tentar gerar flashcards com tratamento de quota
            try {
              flashcardsResult = await model.generateContent(flashcardsPrompt)
              flashcardsText = flashcardsResult.response.text().trim()
            } catch (quotaErr) {
              // Se for erro de quota, aguardar e tentar novamente
              if (isQuotaError(quotaErr)) {
                const waitTime = extractWaitTime(quotaErr)
                const waitSeconds = waitTime || 60
                
                setFullCourseProgress(`⏳ Quota excedida. Aguardando ${waitSeconds} segundos antes de continuar...`)
                await new Promise(resolve => setTimeout(resolve, waitSeconds * 1000))
                
                // Tentar novamente
                flashcardsResult = await model.generateContent(flashcardsPrompt)
                flashcardsText = flashcardsResult.response.text().trim()
                setFullCourseProgress(`📝 Retomando geração de flashcards para ${materia.nome} - ${modulo.nome}...`)
              } else {
                throw quotaErr
              }
            }
            
            // Limpar markdown se houver
            if (flashcardsText.startsWith('```json')) {
              flashcardsText = flashcardsText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
            } else if (flashcardsText.startsWith('```')) {
              flashcardsText = flashcardsText.replace(/```\n?/g, '').trim()
            }

            const flashcardsData = JSON.parse(flashcardsText)
            const flashcards = flashcardsData.flashcards || []

            if (flashcards.length === 0) {
              console.warn(`⚠️ Nenhum flashcard gerado para ${materia.nome} - ${modulo.nome}`)
              setFullCourseProgress(`⚠️ Nenhum flashcard gerado para ${materia.nome} - ${modulo.nome}. Tentando novamente...`)
              
              // Tentar novamente uma vez
              try {
                if (!model) {
                  throw new Error('Modelo de IA não disponível.')
                }
                
                let retryResult = null
                try {
                  retryResult = await model.generateContent(flashcardsPrompt)
                } catch (retryQuotaErr) {
                  if (isQuotaError(retryQuotaErr)) {
                    const waitTime = extractWaitTime(retryQuotaErr)
                    const waitSeconds = waitTime || 60
                    setFullCourseProgress(`⏳ Quota excedida no retry. Aguardando ${waitSeconds} segundos...`)
                    await new Promise(resolve => setTimeout(resolve, waitSeconds * 1000))
                    retryResult = await model.generateContent(flashcardsPrompt)
                  } else {
                    throw retryQuotaErr
                  }
                }
                let retryText = retryResult.response.text().trim()
                if (retryText.startsWith('```json')) {
                  retryText = retryText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
                } else if (retryText.startsWith('```')) {
                  retryText = retryText.replace(/```\n?/g, '').trim()
                }
                const retryData = JSON.parse(retryText)
                const retryFlashcards = retryData.flashcards || []
                
                if (retryFlashcards.length > 0) {
                  for (const flashcard of retryFlashcards) {
                    if (flashcard.pergunta && flashcard.resposta) {
                      await addDoc(cardsRef, {
                        pergunta: flashcard.pergunta.trim(),
                        resposta: flashcard.resposta.trim(),
                        materia: materia.nome,
                        modulo: modulo.nome,
                        courseId: courseId,
                        tags: [],
                      })
                      totalFlashcardsCreated++
                    }
                  }
                  setFullCourseProgress(`✅ ${retryFlashcards.length} flashcard(s) criado(s) para ${materia.nome} - ${modulo.nome} (tentativa 2)`)
                } else {
                  setFullCourseProgress(`⚠️ Nenhum flashcard gerado para ${materia.nome} - ${modulo.nome} mesmo após retry`)
                }
              } catch (retryErr) {
                console.error(`Erro no retry para ${materia.nome} - ${modulo.nome}:`, retryErr)
                setFullCourseProgress(`⚠️ Erro ao gerar flashcards para ${materia.nome} - ${modulo.nome}: ${retryErr.message}`)
              }
            } else {
              // Criar flashcards no Firestore
              for (const flashcard of flashcards) {
                if (flashcard.pergunta && flashcard.resposta) {
                  await addDoc(cardsRef, {
                    pergunta: flashcard.pergunta.trim(),
                    resposta: flashcard.resposta.trim(),
                    materia: materia.nome,
                    modulo: modulo.nome,
                    courseId: courseId,
                    tags: [],
                  })
                  totalFlashcardsCreated++
                }
              }

              setFullCourseProgress(`✅ ${flashcards.length} flashcard(s) criado(s) para ${materia.nome} - ${modulo.nome}`)
            }
          } catch (err) {
            console.error(`Erro ao gerar flashcards para ${materia.nome} - ${modulo.nome}:`, err)
            setFullCourseProgress(`⚠️ Erro ao gerar flashcards para ${materia.nome} - ${modulo.nome}: ${err.message}`)
            // Continuar com próximo módulo
          }

          // Pequeno delay para não sobrecarregar a API
          await new Promise(resolve => setTimeout(resolve, 1000))
        }
      }

      setFullCourseProgress('')
      setMessage(`✅ Geração completa concluída! ${createdSubjects.length} matéria(s), ${totalModulos} módulo(s) e ${totalFlashcardsCreated} flashcard(s) criado(s).`)
    } catch (err) {
      console.error('Erro ao gerar curso completo:', err)
      
      // Mensagem de erro amigável sem detalhes técnicos
      let errorMessage = 'Erro ao gerar curso completo.'
      
      if (err.message) {
        const msg = err.message.toLowerCase()
        if (msg.includes('modelo') || msg.includes('model') || msg.includes('not found') || msg.includes('404')) {
          errorMessage = 'Erro: Modelo de IA não disponível. Verifique as configurações da API no arquivo .env'
        } else if (msg.includes('quota') || msg.includes('429')) {
          errorMessage = 'Erro: Limite de uso da API atingido. Tente novamente mais tarde.'
        } else if (msg.includes('api key') || msg.includes('api_key')) {
          errorMessage = 'Erro: Chave da API não configurada. Configure VITE_GEMINI_API_KEY no arquivo .env'
        } else if (msg.includes('json') || msg.includes('parse')) {
          errorMessage = 'Erro: Resposta da IA em formato inválido. Tente novamente.'
        } else {
          // Mensagem genérica para outros erros
          errorMessage = 'Erro ao gerar curso. Verifique as configurações e tente novamente.'
        }
      }
      
      setMessage(`❌ ${errorMessage}`)
      setFullCourseProgress('')
    } finally {
      setGeneratingFullCourse(false)
    }
  }

  // Verificar e completar conteúdos do curso
  const verifyAndCompleteContents = async (courseId) => {
    if (!materiasTextInput.trim()) {
      setMessage('❌ Cole as matérias em texto primeiro.')
      return
    }

    if (!courseId) {
      setMessage('❌ Selecione um curso.')
      return
    }

    setVerifyingContents(true)
    setVerificationProgress('🔍 Iniciando verificação...')
    setMessage('')

    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY
      if (!apiKey) {
        throw new Error('VITE_GEMINI_API_KEY não configurada. Configure no arquivo .env')
      }

      const genAI = new GoogleGenerativeAI(apiKey)
      
      // Tentar modelos válidos (apenas modelos que funcionam)
      // Modelos disponíveis na API paga do Gemini (ordem de prioridade: melhor primeiro)
      const modelNames = [
        'gemini-2.0-flash',           // Modelo mais recente e recomendado
        'gemini-1.5-pro-latest',      // Melhor para análises complexas
        'gemini-1.5-pro',             // Fallback Pro
        'gemini-1.5-flash-latest'     // Fallback Flash
      ]
      let model = null
      let lastError = null
      
      // Para API paga, tentar usar o melhor modelo primeiro
      // Simplificar: apenas criar o modelo e usar (sem teste prévio)
      for (const modelName of modelNames) {
        try {
          model = genAI.getGenerativeModel({ model: modelName })
          console.log(`✅ Tentando usar modelo: ${modelName}`)
          // Não testar antes - usar diretamente
          break
        } catch (err) {
          // Se nem conseguir criar o modelo, tentar próximo
          const errorMsg = err.message?.toLowerCase() || ''
          if (errorMsg.includes('not found') || errorMsg.includes('404') || errorMsg.includes('not available')) {
            console.warn(`⚠️ Modelo ${modelName} não disponível, tentando próximo...`)
            lastError = err
            continue
          } else {
            // Se for outro erro, ainda tentar usar
            console.log(`⚠️ Aviso ao criar modelo ${modelName}, mas tentando usar mesmo assim...`)
            model = genAI.getGenerativeModel({ model: modelName })
            break
          }
        }
      }
      
      if (!model) {
        // Se nenhum modelo funcionou, tentar listar modelos disponíveis da API
        try {
          console.log('🔍 Listando modelos disponíveis da API...')
          const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
          )
          
          if (response.ok) {
            const data = await response.json()
            const models = data.models || []
            const generateModels = models.filter((m) => {
              return (m.supportedGenerationMethods || []).includes('generateContent')
            })
            
            if (generateModels.length > 0) {
              // Usar o primeiro modelo disponível
              const firstModelName = generateModels[0].name.replace('models/', '')
              model = genAI.getGenerativeModel({ model: firstModelName })
              console.log(`✅ Usando modelo descoberto: ${firstModelName}`)
            }
          }
        } catch (listErr) {
          console.warn('⚠️ Erro ao listar modelos:', listErr)
        }
      }
      
      if (!model) {
        throw new Error(`Nenhum modelo Gemini disponível. Último erro: ${lastError?.message || 'Desconhecido'}`)
      }

      // 1. Buscar matérias existentes no curso
      setVerificationProgress('📋 Verificando matérias existentes no curso...')
      // Usar courseId original para buscar subjects (não o normalizado)
      const courseIdForSubjects = courseId === 'alego-default' ? 'alego-default' : courseId
      const subjectsRef = collection(db, 'courses', courseIdForSubjects, 'subjects')
      const existingSubjectsSnapshot = await getDocs(subjectsRef)
      const existingSubjects = existingSubjectsSnapshot.docs.map(doc => doc.data().name)
      
      // 2. Buscar flashcards existentes para verificar módulos
      const cardsRef = collection(db, 'flashcards')
      // Normalizar courseId para busca: se for 'alego-default', usar null
      const normalizedCourseId = (courseId && courseId.trim() && courseId !== 'alego-default') 
        ? courseId.trim() 
        : null
      
      // Buscar flashcards: se normalizedCourseId for null, buscar todos sem courseId
      let existingCards = []
      if (normalizedCourseId) {
        const existingCardsQuery = query(cardsRef, where('courseId', '==', normalizedCourseId))
        const existingCardsSnapshot = await getDocs(existingCardsQuery)
        existingCards = existingCardsSnapshot.docs.map(doc => doc.data())
      } else {
        // Para ALEGO padrão, buscar flashcards sem courseId (null, undefined, string vazia)
        const allCardsSnapshot = await getDocs(cardsRef)
        existingCards = allCardsSnapshot.docs
          .map(doc => doc.data())
          .filter(card => !card.courseId || card.courseId === '' || card.courseId === null || card.courseId === undefined)
      }
      
      console.log(`📊 Encontrados ${existingCards.length} flashcard(s) existente(s) para o curso`)
      
      // Agrupar módulos existentes por matéria
      const existingModulesBySubject = {}
      existingCards.forEach(card => {
        if (card.materia && card.modulo) {
          if (!existingModulesBySubject[card.materia]) {
            existingModulesBySubject[card.materia] = new Set()
          }
          existingModulesBySubject[card.materia].add(card.modulo)
        }
      })

      // 3. Analisar o texto das matérias e identificar o que falta
      setVerificationProgress('🤖 Analisando matérias e identificando o que falta...')
      const analysisPrompt = `Você é um especialista em análise de conteúdos de cursos preparatórios.

MATÉRIAS FORNECIDAS (texto do usuário):
${materiasTextInput}

MATÉRIAS JÁ EXISTENTES NO CURSO:
${existingSubjects.join(', ') || 'Nenhuma'}

MÓDULOS JÁ EXISTENTES POR MATÉRIA:
${Object.entries(existingModulesBySubject).map(([materia, modulos]) => 
  `${materia}: ${Array.from(modulos).join(', ')}`
).join('\n') || 'Nenhum'}

TAREFA:
1. Analise as matérias fornecidas pelo usuário
2. Identifique quais matérias FALTAM no curso (não estão na lista de existentes)
3. Para cada matéria (nova ou existente), identifique quais módulos FALTAM
4. Organize os módulos faltantes de forma lógica (4-8 módulos por matéria)
5. Para cada módulo, liste os tópicos principais que devem ser cobertos

IMPORTANTE:
- Foque apenas no que FALTA, não recrie o que já existe
- Se uma matéria já existe mas não tem módulos/flashcards, crie módulos para ela
- Se uma matéria não existe, crie ela e seus módulos
- Organize de forma lógica e pedagógica
- Módulos devem ter tamanho similar (não muito grandes, não muito pequenos)

Retorne APENAS um JSON válido:
{
  "materiasParaAdicionar": [
    {
      "nome": "Nome da Matéria",
      "ehNova": true/false,
      "modulos": [
        {
          "nome": "Nome do Módulo",
          "topicos": ["tópico 1", "tópico 2", ...]
        }
      ]
    }
  ]
}

Retorne APENAS o JSON, sem markdown, sem explicações.`

      const analysisResult = await model.generateContent(analysisPrompt)
      let analysisText = analysisResult.response.text().trim()
      
      // Limpar markdown se houver
      if (analysisText.startsWith('```json')) {
        analysisText = analysisText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      } else if (analysisText.startsWith('```')) {
        analysisText = analysisText.replace(/```\n?/g, '').trim()
      }

      const analysis = JSON.parse(analysisText)
      const materiasParaAdicionar = analysis.materiasParaAdicionar || []

      if (materiasParaAdicionar.length === 0) {
        setVerificationProgress('✅ Todos os conteúdos já estão adicionados! Nada a fazer.')
        setMessage('✅ Verificação concluída! Todos os conteúdos já estão no curso.')
        return
      }

      setVerificationProgress(`📝 Encontradas ${materiasParaAdicionar.length} matéria(s) para adicionar/completar. Iniciando...`)

      // 4. Criar matérias que faltam
      let materiasCriadas = 0
      let modulosProcessados = 0
      let flashcardsCriados = 0
      const totalModulos = materiasParaAdicionar.reduce((acc, m) => acc + (m.modulos?.length || 0), 0)

      for (const materia of materiasParaAdicionar) {
        // Criar matéria se for nova
        if (materia.ehNova) {
          try {
            // Verificar se já existe
            const alreadyExists = existingSubjects.includes(materia.nome)
            if (!alreadyExists) {
              await addDoc(subjectsRef, {
                name: materia.nome,
                createdAt: serverTimestamp(),
              })
              materiasCriadas++
              setVerificationProgress(`✅ Matéria "${materia.nome}" criada.`)
            }
          } catch (err) {
            console.warn(`Erro ao criar matéria ${materia.nome}:`, err)
          }
        }

        // Gerar flashcards para cada módulo
        if (materia.modulos && materia.modulos.length > 0) {
          for (const modulo of materia.modulos) {
            modulosProcessados++
            setVerificationProgress(`📝 Gerando flashcards para ${materia.nome} - ${modulo.nome} (${modulosProcessados}/${totalModulos})...`)

            // Verificar se já existem flashcards para este módulo
            const existingCardsForModule = existingCards.filter(
              card => card.materia === materia.nome && card.modulo === modulo.nome
            )

            if (existingCardsForModule.length > 0) {
              setVerificationProgress(`⏭️ Módulo "${modulo.nome}" já tem ${existingCardsForModule.length} flashcard(s). Pulando...`)
              continue
            }

            // Gerar flashcards para este módulo
            const flashcardsPrompt = `Você é um especialista em criar flashcards educacionais para concursos públicos.

MATÉRIA: ${materia.nome}
MÓDULO: ${modulo.nome}
TÓPICOS DO MÓDULO: ${modulo.topicos?.join(', ') || 'Conteúdo geral do módulo'}

TAREFA:
Crie flashcards educacionais focados EXCLUSIVAMENTE no CONTEÚDO da matéria e módulo acima.

REGRAS CRÍTICAS:
- FOCE 100% NO CONTEÚDO EDUCACIONAL: flashcards que ENSINAM o conteúdo, como questões objetivas
- Estilo de questões objetivas: perguntas diretas e respostas claras (2-4 frases)
- Crie 18-25 flashcards por módulo (garanta cobertura completa)
- Cada flashcard deve cobrir um tópico/conceito específico
- Perguntas devem ser diretas, objetivas e práticas (ex: "O que é...?", "Quais são...?", "Explique...")
- Respostas devem explicar o CONTEÚDO de forma clara e completa
- NÃO mencione cargo ou banca repetidamente
- Use linguagem técnica e precisa, como em questões de concurso

Retorne APENAS um JSON válido:
{
  "flashcards": [
    {
      "pergunta": "Pergunta objetiva sobre o CONTEÚDO",
      "resposta": "Resposta educacional clara e completa (2-4 frases)"
    }
  ]
}

Retorne APENAS o JSON, sem markdown, sem explicações.`

          try {
            let flashcardsResult = null
            let flashcardsText = ''
            
            // Tentar gerar flashcards com tratamento de quota
            try {
              flashcardsResult = await model.generateContent(flashcardsPrompt)
              flashcardsText = flashcardsResult.response.text().trim()
            } catch (quotaErr) {
              // Se for erro de quota, aguardar e tentar novamente
              if (isQuotaError(quotaErr)) {
                const waitTime = extractWaitTime(quotaErr)
                const waitSeconds = waitTime || 60
                
                setFullCourseProgress(`⏳ Quota excedida ao gerar flashcards. Aguardando ${waitSeconds} segundos...`)
                await new Promise(resolve => setTimeout(resolve, waitSeconds * 1000))
                
                // Tentar novamente
                flashcardsResult = await model.generateContent(flashcardsPrompt)
                flashcardsText = flashcardsResult.response.text().trim()
                setFullCourseProgress(`📝 Retomando geração de flashcards para ${materia.nome} - ${modulo.nome}...`)
              } else {
                throw quotaErr
              }
            }
              
              if (flashcardsText.startsWith('```json')) {
                flashcardsText = flashcardsText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
              } else if (flashcardsText.startsWith('```')) {
                flashcardsText = flashcardsText.replace(/```\n?/g, '').trim()
              }

              const flashcardsData = JSON.parse(flashcardsText)
              const flashcards = flashcardsData.flashcards || []

              if (flashcards.length > 0) {
                // Normalizar courseId: se for 'alego-default' ou string vazia, usar null
                const normalizedCourseId = (courseId && courseId.trim() && courseId !== 'alego-default') 
                  ? courseId.trim() 
                  : null
                
                console.log(`📝 Criando ${flashcards.length} flashcard(s) para ${materia.nome} - ${modulo.nome} com courseId:`, normalizedCourseId)
                
                for (const flashcard of flashcards) {
                  if (flashcard.pergunta && flashcard.resposta) {
                    const flashcardData = {
                      pergunta: flashcard.pergunta.trim(),
                      resposta: flashcard.resposta.trim(),
                      materia: materia.nome,
                      modulo: modulo.nome,
                      courseId: normalizedCourseId,
                      tags: [],
                    }
                    
                    await addDoc(cardsRef, flashcardData)
                    flashcardsCriados++
                    console.log(`✅ Flashcard criado: "${flashcard.pergunta.substring(0, 50)}..." (courseId: ${normalizedCourseId || 'null'})`)
                  }
                }
                setVerificationProgress(`✅ ${flashcards.length} flashcard(s) criado(s) para ${materia.nome} - ${modulo.nome}`)
              }
            } catch (err) {
              console.error(`Erro ao gerar flashcards para ${materia.nome} - ${modulo.nome}:`, err)
              setVerificationProgress(`⚠️ Erro ao gerar flashcards para ${materia.nome} - ${modulo.nome}: ${err.message}`)
            }

            // Pequeno delay
            await new Promise(resolve => setTimeout(resolve, 1000))
          }
        }
      }

      setVerificationProgress('')
      setMessage(`✅ Verificação e completude concluídas! ${materiasCriadas} matéria(s) criada(s), ${modulosProcessados} módulo(s) processado(s) e ${flashcardsCriados} flashcard(s) criado(s).`)
    } catch (err) {
      console.error('Erro ao verificar e completar conteúdos:', err)
      setMessage(`❌ Erro ao verificar e completar conteúdos: ${err.message}`)
      setVerificationProgress('')
    } finally {
      setVerifyingContents(false)
    }
  }

  // Extrair texto do PDF para geração completa
  const extractPdfForFullGeneration = async (file) => {
    setExtractingPdf(true)
    setMessage('📄 Validando arquivo PDF...')
    
    try {
      // Validar arquivo
      if (!file) {
        throw new Error('Nenhum arquivo selecionado')
      }
      
      if (file.type !== 'application/pdf') {
        throw new Error('O arquivo deve ser um PDF (.pdf)')
      }
      
      if (file.size === 0) {
        throw new Error('O arquivo PDF está vazio (0 bytes). Verifique se o arquivo não está corrompido.')
      }
      
      if (file.size > 50 * 1024 * 1024) { // 50MB
        throw new Error('O arquivo PDF é muito grande (máximo 50MB). Tente um arquivo menor.')
      }
      
      setMessage('📄 Carregando PDF...')
      
      // Ler o arquivo e criar uma cópia independente do ArrayBuffer para evitar detached
      const arrayBuffer = await file.arrayBuffer()
      
      // Validar que o ArrayBuffer não está vazio
      if (!arrayBuffer || arrayBuffer.byteLength === 0) {
        throw new Error('O arquivo PDF está vazio ou corrompido. Tente fazer upload novamente.')
      }
      
      // Criar uma cópia completamente independente do ArrayBuffer
      // Isso evita o erro "detached ArrayBuffer"
      const uint8Array = new Uint8Array(arrayBuffer)
      const bufferCopy = new ArrayBuffer(uint8Array.length)
      new Uint8Array(bufferCopy).set(uint8Array)
      
      setMessage('📄 Processando PDF (pode demorar para arquivos grandes)...')
      
      // Configurar worker antes de processar
      if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`
      }

      let pdf
      try {
        pdf = await pdfjsLib.getDocument({ 
          data: bufferCopy,
          useSystemFonts: true,
          verbosity: 0,
        }).promise
      } catch (workerErr) {
        console.warn('Erro com worker, tentando sem worker...', workerErr)
        // Criar uma nova cópia independente para o fallback
        const bufferCopy2 = new ArrayBuffer(uint8Array.length)
        new Uint8Array(bufferCopy2).set(uint8Array)
        pdfjsLib.GlobalWorkerOptions.workerSrc = ''
        pdf = await pdfjsLib.getDocument({ 
          data: bufferCopy2,
          useSystemFonts: true,
          verbosity: 0,
        }).promise
      }

      // Validar que o PDF foi carregado
      if (!pdf || !pdf.numPages || pdf.numPages === 0) {
        throw new Error('O PDF não contém páginas válidas. Verifique se o arquivo não está corrompido.')
      }

      let fullText = ''
      const numPages = pdf.numPages
      setMessage(`📄 Extraindo texto de ${numPages} página(s)...`)

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
        } catch (pageErr) {
          console.warn(`Erro ao processar página ${pageNum}:`, pageErr)
          // Continuar com próxima página
          continue
        }
      }

      // Validar que extraímos algum texto
      if (!fullText.trim()) {
        throw new Error('Não foi possível extrair texto do PDF. O arquivo pode estar protegido ou ser uma imagem. Tente converter para PDF com texto selecionável.')
      }

      setEditalPdfTextForGeneration(fullText.trim())
      setEditalPdfForGeneration(file)
      setMessage(`✅ PDF processado! ${fullText.trim().length.toLocaleString()} caracteres extraídos de ${numPages} página(s).`)
    } catch (err) {
      console.error('Erro ao extrair PDF:', err)
      let errorMsg = err.message || 'Erro desconhecido ao processar PDF'
      
      // Mensagens de erro mais amigáveis
      if (errorMsg.includes('empty') || errorMsg.includes('zero bytes')) {
        errorMsg = 'O arquivo PDF está vazio. Verifique se o arquivo não está corrompido e tente fazer upload novamente.'
      } else if (errorMsg.includes('detached') || errorMsg.includes('ArrayBuffer')) {
        errorMsg = 'Erro ao processar o arquivo. Tente fazer upload novamente ou use um PDF menor.'
      } else if (errorMsg.includes('worker') || errorMsg.includes('Failed to fetch')) {
        errorMsg = 'Erro ao carregar biblioteca de PDF. Tente novamente ou recarregue a página.'
      }
      
      setMessage(`❌ ${errorMsg}`)
      setEditalPdfTextForGeneration('')
      setEditalPdfForGeneration(null)
    } finally {
      setExtractingPdf(false)
    }
  }

  // Funções para gerenciar avaliações
  const approveReview = async (reviewId) => {
    try {
      await updateDoc(doc(db, 'reviews', reviewId), {
        approved: true,
        updatedAt: serverTimestamp(),
      })
      setMessage('✅ Avaliação aprovada com sucesso!')
    } catch (err) {
      console.error('Erro ao aprovar avaliação:', err)
      setMessage(`❌ Erro ao aprovar avaliação: ${err.message}`)
    }
  }

  const rejectReview = async (reviewId) => {
    try {
      await updateDoc(doc(db, 'reviews', reviewId), {
        approved: false,
        updatedAt: serverTimestamp(),
      })
      setMessage('✅ Avaliação rejeitada.')
    } catch (err) {
      console.error('Erro ao rejeitar avaliação:', err)
      setMessage(`❌ Erro ao rejeitar avaliação: ${err.message}`)
    }
  }

  const deleteReview = async (reviewId) => {
    if (!confirm('Tem certeza que deseja excluir esta avaliação permanentemente?')) return

    try {
      await deleteDoc(doc(db, 'reviews', reviewId))
      setMessage('✅ Avaliação excluída permanentemente!')
    } catch (err) {
      console.error('Erro ao excluir avaliação:', err)
      setMessage(`❌ Erro ao excluir avaliação: ${err.message}`)
    }
  }

  // Gerar link de redefinição de senha
  const generateResetLink = async () => {
    if (!resetEmail.trim()) {
      setMessage('❌ Digite o email do usuário.')
      return
    }

    setGeneratingLink(true)
    setGeneratedLink('')
    setMessage('')

    try {
      // Verificar se o email existe
      const usersRef = collection(db, 'users')
      const q = query(usersRef, where('email', '==', resetEmail.toLowerCase().trim()))
      const userSnapshot = await getDocs(q)

      if (userSnapshot.empty) {
        setMessage('❌ Usuário com este email não encontrado.')
        setGeneratingLink(false)
        return
      }

      // Gerar token aleatório seguro
      const token = crypto.randomUUID() + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 15)
      
      // Criar token no Firestore (expira em 24 horas)
      const expiresAt = new Date()
      expiresAt.setHours(expiresAt.getHours() + 24)

      await setDoc(doc(db, 'passwordResetTokens', token), {
        email: resetEmail.toLowerCase().trim(),
        createdAt: serverTimestamp(),
        expiresAt: expiresAt,
        used: false,
      })

      // Gerar link completo
      const baseUrl = window.location.origin
      const resetLink = `${baseUrl}/reset/${token}`
      
      setGeneratedLink(resetLink)
      setMessage('✅ Link gerado com sucesso! Copie e envie para o usuário.')
    } catch (err) {
      console.error('Erro ao gerar link:', err)
      setMessage(`❌ Erro ao gerar link: ${err.message}`)
    } finally {
      setGeneratingLink(false)
    }
  }

  const removeCard = async (cardId) => {
    if (!window.confirm('Deseja realmente excluir este card?')) return
    await deleteDoc(doc(db, 'flashcards', cardId))
    setMessage('Card removido.')
  }

  // Salvar prompt/configuração do edital (por curso)
  const handleSavePrompt = async () => {
    if (!editalPrompt.trim() && !pdfText.trim()) {
      setMessage('Digite as informações do concurso ou faça upload de um PDF.')
      return
    }

    if (!selectedCourseForPrompts) {
      setMessage('Selecione um curso para salvar o prompt.')
      return
    }

    setSavingPrompt(true)
    setMessage('Salvando configuração...')

    try {
      const courseId = selectedCourseForPrompts || 'alego-default'
      
      // Verificar se o curso existe
      const courseRef = doc(db, 'courses', courseId)
      const courseDoc = await getDoc(courseRef)
      if (!courseDoc.exists()) {
        setMessage(`❌ Erro: O curso selecionado não existe no banco de dados. Por favor, crie o curso primeiro na aba "Cursos".`)
        setSavingPrompt(false)
        return
      }
      
      const editalRef = doc(db, 'courses', courseId, 'prompts', 'edital')
      const dataToSave = {
        prompt: editalPrompt.trim(),
        courseId: courseId,
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

      const courseName = courses.find(c => c.id === courseId)?.name || 'Curso selecionado'
      const infoText = pdfText.trim() 
        ? `Texto do PDF e informações do edital salvos com sucesso para ${courseName}!`
        : `Configuração salva com sucesso para ${courseName}! A IA agora usará essas informações para responder perguntas.`
      
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

  // Limpar/resetar prompt do edital
  const handleClearEditalPrompt = async () => {
    if (!selectedCourseForPrompts) {
      setMessage('Selecione um curso para limpar o prompt.')
      return
    }

    if (!window.confirm('⚠️ ATENÇÃO: Isso vai APAGAR COMPLETAMENTE todos os prompts do edital deste curso. Tem certeza?')) {
      return
    }

    try {
      const courseId = selectedCourseForPrompts || 'alego-default'
      const editalRef = doc(db, 'courses', courseId, 'prompts', 'edital')
      
      // Deletar o documento
      await deleteDoc(editalRef)
      
      // Limpar campos locais
      setEditalPrompt('')
      setPdfText('')
      setPdfUrl('')
      setPdfFile(null)
      
      const courseName = courses.find(c => c.id === courseId)?.name || 'Curso selecionado'
      setMessage(`✅ Prompt do edital limpo com sucesso para ${courseName}!`)
      setPromptStatus(null)
    } catch (err) {
      console.error('Erro ao limpar prompt:', err)
      setMessage(`Erro ao limpar: ${err.message}`)
    }
  }

  // Limpar/resetar prompts de questões
  const handleClearQuestoesPrompt = async () => {
    if (!selectedCourseForPrompts) {
      setMessage('Selecione um curso para limpar os prompts.')
      return
    }

    if (!window.confirm('⚠️ ATENÇÃO: Isso vai APAGAR COMPLETAMENTE todos os prompts de questões e BIZUs deste curso. Tem certeza?')) {
      return
    }

    try {
      const courseId = selectedCourseForPrompts || 'alego-default'
      const questoesRef = doc(db, 'courses', courseId, 'prompts', 'questoes')
      
      // Deletar o documento
      await deleteDoc(questoesRef)
      
      // Limpar campos locais
      setQuestoesPrompt('')
      setBizuPrompt('')
      
      const courseName = courses.find(c => c.id === courseId)?.name || 'Curso selecionado'
      setMessage(`✅ Prompts de questões limpos com sucesso para ${courseName}!`)
    } catch (err) {
      console.error('Erro ao limpar prompts:', err)
      setMessage(`Erro ao limpar: ${err.message}`)
    }
  }

  // Salvar configuração de questões e BIZUs (por curso)
  const handleSaveQuestoesConfig = async () => {
    if (!selectedCourseForPrompts) {
      setMessage('Selecione um curso para salvar o prompt.')
      return
    }

    setSavingQuestoesConfig(true)
    setMessage('Salvando configuração de questões...')

    try {
      const courseId = selectedCourseForPrompts || 'alego-default'
      
      // Verificar se o curso existe
      const courseRef = doc(db, 'courses', courseId)
      const courseDoc = await getDoc(courseRef)
      if (!courseDoc.exists()) {
        setMessage(`❌ Erro: O curso selecionado não existe no banco de dados. Por favor, crie o curso primeiro na aba "Cursos".`)
        setSavingQuestoesConfig(false)
        return
      }
      
      const questoesRef = doc(db, 'courses', courseId, 'prompts', 'questoes')
      
      // Buscar configuração existente
      const existingDoc = await getDoc(questoesRef)
      const existingData = existingDoc.exists() ? existingDoc.data() : {}
      
      // Preparar novos dados - fazer APPEND dos prompts ao invés de substituir
      const newPrompt = questoesPrompt.trim()
      const newBizuPrompt = bizuPrompt.trim()
      
      // Sempre adicionar ao final, nunca substituir completamente
      let finalPrompt = existingData.prompt || ''
      if (newPrompt) {
        if (finalPrompt && newPrompt !== finalPrompt && !finalPrompt.includes(newPrompt)) {
          // Adicionar novo prompt ao existente com separador e timestamp
          finalPrompt = `${finalPrompt}\n\n--- NOVO PROMPT ADICIONADO EM ${new Date().toLocaleString('pt-BR')} ---\n\n${newPrompt}`
        } else if (!finalPrompt) {
          // Primeiro prompt
          finalPrompt = newPrompt
        }
        // Se newPrompt === finalPrompt ou já está contido, mantém como está (não adiciona duplicado exato)
      }
      
      let finalBizuPrompt = existingData.bizuPrompt || ''
      if (newBizuPrompt) {
        if (finalBizuPrompt && newBizuPrompt !== finalBizuPrompt && !finalBizuPrompt.includes(newBizuPrompt)) {
          // Adicionar novo prompt ao existente com separador e timestamp
          finalBizuPrompt = `${finalBizuPrompt}\n\n--- NOVO PROMPT ADICIONADO EM ${new Date().toLocaleString('pt-BR')} ---\n\n${newBizuPrompt}`
        } else if (!finalBizuPrompt) {
          // Primeiro prompt
          finalBizuPrompt = newBizuPrompt
        }
        // Se newBizuPrompt === finalBizuPrompt ou já está contido, mantém como está (não adiciona duplicado exato)
      }
      
      await setDoc(questoesRef, {
        prompt: finalPrompt,
        bizuPrompt: finalBizuPrompt,
        courseId: courseId,
        updatedAt: serverTimestamp(),
      }, { merge: true })

      const courseName = courses.find(c => c.id === courseId)?.name || 'Curso selecionado'
      setMessage(`✅ Configuração de questões e BIZUs salva com sucesso para ${courseName}! Os prompts foram ADICIONADOS aos existentes.`)
      
      // Atualizar o estado local com o prompt final
      setQuestoesPrompt(finalPrompt)
      setBizuPrompt(finalBizuPrompt)
    } catch (err) {
      console.error('Erro ao salvar configuração de questões:', err)
      setMessage(`Erro ao salvar: ${err.message}`)
    } finally {
      setSavingQuestoesConfig(false)
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

      // Carregar informações do edital e PDF (do curso selecionado para flashcards)
      let editalInfo = ''
      let pdfTextContent = ''
      try {
        const courseIdForGeneration = (flashcardForm.courseId || selectedCourseForFlashcards || '').trim() || 'alego-default'
        const editalRef = doc(db, 'courses', courseIdForGeneration, 'prompts', 'edital')
        const editalDoc = await getDoc(editalRef)
        if (editalDoc.exists()) {
          const data = editalDoc.data()
          editalInfo = data.prompt || ''
          pdfTextContent = data.pdfText || ''
          
          if (pdfTextContent) {
            console.log('📄 Usando texto do PDF:', pdfTextContent.length, 'caracteres')
          }
        } else {
          // Fallback para config antigo (migração)
          const oldEditalDoc = await getDoc(doc(db, 'config', 'edital'))
          if (oldEditalDoc.exists()) {
            const data = oldEditalDoc.data()
            editalInfo = data.prompt || ''
            pdfTextContent = data.pdfText || ''
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
            // Usar curso selecionado se houver
            const courseIdToUse = (selectedCourseForFlashcards || '').trim() || null
            
            await addDoc(cardsRef, {
              pergunta: card.pergunta.trim(),
              resposta: card.resposta.trim(),
              materia: materia,
              modulo: moduloNome,
              courseId: courseIdToUse, // Associar ao curso selecionado
              tags: [],
            })
            totalCreated++
            console.log(`  ✅ Flashcard ${cardIndex + 1} criado: "${card.pergunta.substring(0, 50)}..." ${courseIdToUse ? `(Curso: ${courseIdToUse})` : '(ALEGO padrão)'}`)
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

  const tabs = [
    { id: 'config', label: '⚙️ Configurações', icon: '⚙️' },
    { id: 'flashcards', label: '📚 Flashcards', icon: '📚' },
    { id: 'users', label: '👥 Usuários', icon: '👥' },
    { id: 'banners', label: '🖼️ Banners', icon: '🖼️' },
    { id: 'popup', label: '🔔 Popup Banner', icon: '🔔' },
    { id: 'courses', label: '🎓 Cursos', icon: '🎓' },
    { id: 'reviews', label: '⭐ Avaliações', icon: '⭐' },
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/30 dark:from-slate-900 dark:via-blue-900/20 dark:to-purple-900/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Header Tecnológico */}
        <div className="relative overflow-hidden bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-6 sm:p-8 mb-6">
          {/* Background decorativo */}
          <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-blue-500/10 via-purple-500/10 to-cyan-500/10 rounded-full blur-3xl -mr-48 -mt-48"></div>
          <div className="absolute bottom-0 left-0 w-72 h-72 bg-gradient-to-tr from-indigo-500/10 to-purple-500/10 rounded-full blur-3xl -ml-36 -mb-36"></div>
          
          <div className="relative">
            <div className="flex items-center gap-3 mb-3">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-purple-500 rounded-xl blur-lg opacity-50 animate-pulse"></div>
                <div className="relative rounded-xl bg-gradient-to-br from-blue-500 to-purple-500 p-3 shadow-lg">
                  <span className="text-white font-bold text-xl">⚙️</span>
                </div>
              </div>
              <p className="text-xs sm:text-sm font-black uppercase tracking-widest text-blue-600 dark:text-blue-400">
                Painel Administrativo
              </p>
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black mb-2">
              <span className="bg-gradient-to-r from-blue-600 via-purple-600 to-cyan-600 dark:from-blue-400 dark:via-purple-400 dark:to-cyan-400 bg-clip-text text-transparent">
                Administração do Sistema
              </span>
            </h1>
            <p className="text-sm sm:text-base font-semibold text-slate-600 dark:text-slate-400">
              Gerencie flashcards, usuários, configurações e mais
            </p>
          </div>
        </div>

        {/* Mensagem de feedback */}
        {message && (
          <div className="mb-6 relative overflow-hidden rounded-xl bg-gradient-to-r from-emerald-500/10 to-green-500/10 border border-emerald-500/30 dark:border-emerald-400/30 px-4 py-3 backdrop-blur-sm">
            <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/5 via-green-500/5 to-emerald-500/5"></div>
            <p className="relative text-sm font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
              <span>✓</span> {message}
            </p>
          </div>
        )}

        {/* Tabs Navigation */}
        <div className="relative overflow-hidden bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 mb-6">
          <div className="flex flex-wrap gap-2 p-2 border-b border-slate-200 dark:border-slate-700">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`group relative flex items-center gap-2 px-4 sm:px-6 py-3 rounded-xl font-bold text-sm transition-all overflow-hidden ${
                  activeTab === tab.id
                    ? 'bg-gradient-to-r from-blue-500 to-purple-500 text-white shadow-lg'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                {activeTab === tab.id && (
                  <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                )}
                <span className="relative z-10">{tab.icon}</span>
                <span className="relative z-10 hidden sm:inline">{tab.label.replace(/^[^\s]+\s/, '')}</span>
              </button>
            ))}
          </div>

          {/* Conteúdo das Tabs */}
          <div className="p-4 sm:p-6">
            {/* Tab: Configurações */}
            {activeTab === 'config' && (
              <div className="space-y-6">
                {/* Configuração do Prompt da IA */}
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <p className="flex items-center gap-2 text-sm font-semibold text-alego-600">
          <DocumentTextIcon className="h-5 w-5" />
          Configuração da IA - Informações do Concurso
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Configure aqui as informações sobre o concurso. A IA usará essas informações para responder perguntas dos alunos de forma precisa e objetiva.
        </p>
        
        {/* Seletor de Curso */}
        <div className="mt-4">
          <label className="block text-xs font-semibold uppercase text-slate-500 mb-2">
            Curso para Configurar
          </label>
          <select
            value={selectedCourseForPrompts}
            onChange={(e) => setSelectedCourseForPrompts(e.target.value)}
            className="w-full rounded-xl border border-slate-200 p-3 text-sm focus:border-alego-400 focus:outline-none"
          >
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.name} {course.id === 'alego-default' ? '(Padrão)' : ''}
              </option>
            ))}
          </select>
          <p className="mt-2 text-xs text-slate-400">
            💡 Cada curso tem seus próprios prompts. Selecione o curso antes de salvar.
          </p>
        </div>
        
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
        
        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={handleSavePrompt}
            disabled={(!editalPrompt.trim() && !pdfText.trim()) || savingPrompt || extractingPdf}
            className="flex-1 rounded-full bg-alego-600 px-6 py-2 text-sm font-semibold text-white disabled:opacity-50 hover:bg-alego-700 transition"
          >
            {savingPrompt ? 'Salvando...' : 'Salvar Configuração'}
          </button>
          <button
            type="button"
            onClick={handleClearEditalPrompt}
            disabled={savingPrompt || extractingPdf}
            className="rounded-full bg-rose-500 px-6 py-2 text-sm font-semibold text-white disabled:opacity-50 hover:bg-rose-600 transition"
            title="Limpar todos os prompts do edital deste curso"
          >
            🗑️ Limpar
          </button>
        </div>
      </div>

      {/* Configuração de Questões e BIZUs */}
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <p className="flex items-center gap-2 text-sm font-semibold text-alego-600">
          <DocumentTextIcon className="h-5 w-5" />
          Configuração de Questões e BIZUs
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Configure como a IA deve gerar as questões fictícias e os BIZUs (explicações) no FlashQuestões.
        </p>
        
        {/* Seletor de Curso (mesmo curso selecionado acima) */}
        <div className="mt-4">
          <label className="block text-xs font-semibold uppercase text-slate-500 mb-2">
            Curso para Configurar
          </label>
          <select
            value={selectedCourseForPrompts}
            onChange={(e) => setSelectedCourseForPrompts(e.target.value)}
            className="w-full rounded-xl border border-slate-200 p-3 text-sm focus:border-alego-400 focus:outline-none"
          >
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.name} {course.id === 'alego-default' ? '(Padrão)' : ''}
              </option>
            ))}
          </select>
          <p className="mt-2 text-xs text-slate-400">
            💡 Cada curso tem seus próprios prompts. Selecione o curso antes de salvar.
          </p>
        </div>
        <div className="mt-3 rounded-lg bg-blue-50 border border-blue-200 p-3">
          <p className="text-xs font-semibold text-blue-800 mb-1">ℹ️ Como funciona:</p>
          <p className="text-xs text-blue-700">
            Quando você adicionar novos prompts, eles serão <strong>ADICIONADOS aos existentes</strong>, não substituídos. 
            Isso permite que você faça ajustes incrementais e mantenha um histórico das instruções.
          </p>
        </div>

        <div className="mt-6 space-y-6">
          {/* Prompt para Questões */}
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-500 mb-2">
              Prompt para Geração de Questões
            </label>
            <textarea
              value={questoesPrompt}
              onChange={(e) => setQuestoesPrompt(e.target.value)}
              rows={12}
              placeholder="Configure como as questões devem ser geradas. Exemplo:

Você é um especialista em criar questões de concursos públicos no estilo FGV para o cargo de Policial Legislativo da ALEGO.

REGRAS PARA AS QUESTÕES:
- Estilo FGV: questões objetivas, claras, com alternativas bem elaboradas
- Cada questão deve ter 5 alternativas (A, B, C, D, E)
- Apenas UMA alternativa está correta
- As alternativas incorretas devem ser plausíveis (distratores inteligentes)
- Baseie-se no conteúdo do edital e no módulo especificado
- Questões devem ser FICTÍCIAS (não são questões reais de provas anteriores)
- Foque em temas relevantes para o cargo de Policial Legislativo
- Dificuldade: nível FGV (intermediário a avançado)
- Enunciados claros e objetivos
- Alternativas com linguagem formal e técnica quando apropriado

FORMATO:
- Enunciado completo e claro
- 5 alternativas bem elaboradas
- Justificativa breve explicando a resposta correta"
              className="w-full rounded-xl border border-slate-200 p-4 text-sm focus:border-alego-400 focus:outline-none font-mono"
              disabled={savingQuestoesConfig}
            />
            <p className="mt-2 text-xs text-slate-400">
              💡 Este prompt será <strong>ADICIONADO</strong> aos prompts existentes. Se deixar em branco, não adicionará nada novo. 
              O sistema usará o prompt completo (todos os prompts anteriores + este novo).
            </p>
          </div>

          {/* Prompt para BIZUs */}
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-500 mb-2">
              Prompt para Geração de BIZUs (Explicações)
            </label>
            <textarea
              value={bizuPrompt}
              onChange={(e) => setBizuPrompt(e.target.value)}
              rows={12}
              placeholder="Configure como os BIZUs (explicações) devem ser gerados. Exemplo:

Você é um professor especialista em concursos públicos.

REGRAS PARA OS BIZUs:
- Explique por que a alternativa correta está certa
- Explique por que as outras alternativas estão incorretas
- Dê dicas e macetes relacionados ao tema
- Seja objetivo mas completo (3-5 parágrafos)
- Use linguagem didática e acessível
- Inclua exemplos práticos quando fizer sentido
- Relacione com o contexto do cargo de Policial Legislativo
- Destaque pontos importantes que podem cair em prova
- Seja motivador e encorajador

ESTRUTURA SUGERIDA:
1. Por que a resposta correta está certa
2. Por que as outras alternativas estão erradas
3. Dicas e macetes sobre o tema
4. Relação com o edital/conteúdo programático"
              className="w-full rounded-xl border border-slate-200 p-4 text-sm focus:border-alego-400 focus:outline-none font-mono"
              disabled={savingQuestoesConfig}
            />
            <p className="mt-2 text-xs text-slate-400">
              💡 Este prompt será <strong>ADICIONADO</strong> aos prompts existentes. Se deixar em branco, não adicionará nada novo. 
              O sistema usará o prompt completo (todos os prompts anteriores + este novo).
            </p>
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={handleSaveQuestoesConfig}
            disabled={savingQuestoesConfig}
            className="flex-1 rounded-full bg-alego-600 px-6 py-2 text-sm font-semibold text-white disabled:opacity-50 hover:bg-alego-700 transition"
          >
            {savingQuestoesConfig ? 'Salvando...' : 'Salvar Configuração de Questões'}
          </button>
          <button
            type="button"
            onClick={handleClearQuestoesPrompt}
            disabled={savingQuestoesConfig}
            className="rounded-full bg-rose-500 px-6 py-2 text-sm font-semibold text-white disabled:opacity-50 hover:bg-rose-600 transition"
            title="Limpar todos os prompts de questões e BIZUs deste curso"
          >
            🗑️ Limpar
          </button>
        </div>
      </div>
              </div>
            )}

            {/* Tab: Banners */}
            {activeTab === 'banners' && (
              <div className="space-y-6">
                <div className="relative overflow-hidden bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-6">
                  <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-blue-500/5 to-purple-500/5 rounded-full blur-3xl -mr-24 -mt-24"></div>
                  <div className="relative">
                    <p className="flex items-center gap-2 text-sm font-semibold text-alego-600 mb-4">
                      <DocumentTextIcon className="h-5 w-5" />
                      Gerenciar Banners da Página Inicial
                    </p>
                    <p className="text-xs text-slate-500 mb-6">
                      Adicione imagens ilustrativas que aparecerão no carrossel da página inicial. As imagens passam automaticamente.
                    </p>

                    {/* Formulário para adicionar banner */}
                    <div className="mb-6 rounded-xl border border-slate-200 p-4">
                      <h3 className="text-sm font-semibold text-alego-700 mb-4">Adicionar Novo Banner</h3>
                      
                      <div className="space-y-4">
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-2">
                            Imagem (máximo 1MB)
                          </label>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleBannerImageUpload}
                            className="w-full rounded-lg border border-slate-300 p-2 text-sm"
                          />
                          {bannerForm.imageBase64 && (
                            <div className="mt-2">
                              <img
                                src={bannerForm.imageBase64}
                                alt="Preview"
                                className="max-h-32 rounded-lg border border-slate-200"
                              />
                            </div>
                          )}
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-2">
                            Título (opcional)
                          </label>
                          <input
                            type="text"
                            value={bannerForm.title}
                            onChange={(e) => setBannerForm(prev => ({ ...prev, title: e.target.value }))}
                            placeholder="Ex: Assembleia Legislativa"
                            className="w-full rounded-lg border border-slate-300 p-2 text-sm"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-2">
                            Link de destino (opcional)
                          </label>
                          <input
                            type="text"
                            value={bannerForm.link}
                            onChange={(e) => setBannerForm(prev => ({ ...prev, link: e.target.value }))}
                            placeholder="Ex: /sobre ou https://..."
                            className="w-full rounded-lg border border-slate-300 p-2 text-sm"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-2">
                              Ordem
                            </label>
                            <input
                              type="number"
                              value={bannerForm.order}
                              onChange={(e) => setBannerForm(prev => ({ ...prev, order: parseInt(e.target.value) || 0 }))}
                              className="w-full rounded-lg border border-slate-300 p-2 text-sm"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-2">
                              Duração (ms)
                            </label>
                            <input
                              type="number"
                              value={bannerForm.duration}
                              onChange={(e) => setBannerForm(prev => ({ ...prev, duration: parseInt(e.target.value) || 5000 }))}
                              className="w-full rounded-lg border border-slate-300 p-2 text-sm"
                            />
                            <p className="text-xs text-slate-400 mt-1">Padrão: 5000ms (5 segundos)</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={bannerForm.active}
                            onChange={(e) => setBannerForm(prev => ({ ...prev, active: e.target.checked }))}
                            className="rounded"
                          />
                          <label className="text-xs text-slate-600">Banner ativo</label>
                        </div>

                        <button
                          type="button"
                          onClick={addBanner}
                          disabled={uploadingBanner || !bannerForm.imageBase64}
                          className="w-full rounded-lg bg-alego-600 px-4 py-2 text-sm font-semibold text-white hover:bg-alego-700 disabled:opacity-50"
                        >
                          {uploadingBanner ? 'Adicionando...' : 'Adicionar Banner'}
                        </button>
                      </div>
                    </div>

                    {/* Lista de banners existentes */}
                    <div>
                      <h3 className="text-sm font-semibold text-alego-700 mb-4">
                        Banners Existentes ({banners.length})
                      </h3>
                      
                      {banners.length === 0 ? (
                        <p className="text-sm text-slate-500">Nenhum banner adicionado ainda.</p>
                      ) : (
                        <div className="space-y-4">
                          {banners.map((banner) => (
                            <div
                              key={banner.id}
                              className="rounded-xl border border-slate-200 p-4"
                            >
                              <div className="flex items-start gap-4">
                                <img
                                  src={banner.imageBase64 || banner.imageUrl}
                                  alt={banner.title || 'Banner'}
                                  className="h-24 w-auto rounded-lg border border-slate-200 object-cover"
                                />
                                <div className="flex-1">
                                  <div className="flex items-start justify-between">
                                    <div>
                                      <p className="text-sm font-semibold text-slate-700">
                                        {banner.title || 'Sem título'}
                                      </p>
                                      <p className="text-xs text-slate-500 mt-1">
                                        Ordem: {banner.order || 0} • Duração: {banner.duration || 5000}ms
                                        {banner.link && ` • Link: ${banner.link}`}
                                      </p>
                                      <div className="mt-2 flex items-center gap-2">
                                        <span className={`rounded-full px-2 py-1 text-xs font-semibold ${
                                          banner.active !== false
                                            ? 'bg-emerald-100 text-emerald-700'
                                            : 'bg-slate-100 text-slate-600'
                                        }`}>
                                          {banner.active !== false ? 'Ativo' : 'Inativo'}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="flex gap-2">
                                      <button
                                        type="button"
                                        onClick={() => updateBanner(banner.id, { active: !(banner.active !== false) })}
                                        className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                      >
                                        {banner.active !== false ? 'Desativar' : 'Ativar'}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => deleteBanner(banner.id)}
                                        className="rounded-lg bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-200"
                                      >
                                        <TrashIcon className="h-4 w-4 inline" /> Excluir
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Tab: Popup Banner */}
            {activeTab === 'popup' && (
              <div className="space-y-6">
                <div className="relative overflow-hidden bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-6">
                  <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-blue-500/5 to-purple-500/5 rounded-full blur-3xl -mr-24 -mt-24"></div>
                  <div className="relative">
                    <p className="flex items-center gap-2 text-sm font-semibold text-alego-600 mb-4">
                      <DocumentTextIcon className="h-5 w-5" />
                      Gerenciar Popup Banner
                    </p>
                    <p className="text-xs text-slate-500 mb-6">
                      Configure o banner que aparece quando o usuário abre o site pela primeira vez no dia.
                    </p>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-2">
                          Imagem (máximo 2MB)
                        </label>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handlePopupBannerImageUpload}
                          className="w-full rounded-lg border border-slate-300 p-2 text-sm"
                        />
                        {(popupBanner.imageBase64 || popupBanner.imageUrl) && (
                          <div className="mt-2">
                            <img
                              src={popupBanner.imageBase64 || popupBanner.imageUrl}
                              alt="Preview"
                              className="max-h-48 rounded-lg border border-slate-200"
                            />
                          </div>
                        )}
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-2">
                          Título (opcional)
                        </label>
                        <input
                          type="text"
                          value={popupBanner.title}
                          onChange={(e) => setPopupBanner(prev => ({ ...prev, title: e.target.value }))}
                          placeholder="Ex: Promoção Especial"
                          className="w-full rounded-lg border border-slate-300 p-2 text-sm"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-2">
                          Link de destino (opcional)
                        </label>
                        <input
                          type="text"
                          value={popupBanner.link}
                          onChange={(e) => setPopupBanner(prev => ({ ...prev, link: e.target.value }))}
                          placeholder="Ex: /pagamento ou https://..."
                          className="w-full rounded-lg border border-slate-300 p-2 text-sm"
                        />
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={popupBanner.openInNewTab}
                          onChange={(e) => setPopupBanner(prev => ({ ...prev, openInNewTab: e.target.checked }))}
                          className="rounded"
                        />
                        <label className="text-xs text-slate-600">Abrir link em nova aba</label>
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={popupBanner.active}
                          onChange={(e) => setPopupBanner(prev => ({ ...prev, active: e.target.checked }))}
                          className="rounded"
                        />
                        <label className="text-xs text-slate-600">Popup ativo</label>
                      </div>

                      <button
                        type="button"
                        onClick={savePopupBanner}
                        disabled={uploadingPopupBanner || (!popupBanner.imageBase64 && !popupBanner.imageUrl)}
                        className="w-full rounded-lg bg-alego-600 px-4 py-2 text-sm font-semibold text-white hover:bg-alego-700 disabled:opacity-50"
                      >
                        {uploadingPopupBanner ? 'Salvando...' : 'Salvar Popup Banner'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Tab: Cursos */}
            {activeTab === 'courses' && (
              <div className="space-y-6">
                <div className="relative overflow-hidden bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-6">
                  <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-blue-500/5 to-purple-500/5 rounded-full blur-3xl -mr-24 -mt-24"></div>
                  <div className="relative">
                    <p className="flex items-center gap-2 text-sm font-semibold text-alego-600 mb-4">
                      <DocumentTextIcon className="h-5 w-5" />
                      Gerenciar Cursos Preparatórios
                    </p>
                    <p className="text-xs text-slate-500 mb-6">
                      Adicione cursos preparatórios para concursos específicos. Cada curso aparecerá na página inicial como um card clicável.
                    </p>

                    {/* Formulário para adicionar curso */}
                    <div className="mb-6 rounded-xl border border-slate-200 p-4">
                      <h3 className="text-sm font-semibold text-alego-700 mb-4">Adicionar Novo Curso</h3>
                      
                      <div className="space-y-4">
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-2">
                            Nome do Curso *
                          </label>
                          <input
                            type="text"
                            value={courseForm.name}
                            onChange={(e) => setCourseForm(prev => ({ ...prev, name: e.target.value }))}
                            placeholder="Ex: Polícia Legislativa ALEGO"
                            className="w-full rounded-lg border border-slate-300 p-2 text-sm"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-2">
                            Concurso/Competição *
                          </label>
                          <input
                            type="text"
                            value={courseForm.competition}
                            onChange={(e) => setCourseForm(prev => ({ ...prev, competition: e.target.value }))}
                            placeholder="Ex: ALEGO, TRT, etc."
                            className="w-full rounded-lg border border-slate-300 p-2 text-sm"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-2">
                            Descrição
                          </label>
                          <div className="flex gap-2">
                            <textarea
                              value={courseForm.description}
                              onChange={(e) => setCourseForm(prev => ({ ...prev, description: e.target.value }))}
                              placeholder="Descrição do curso... (ou clique em 'Gerar com IA' para criar automaticamente)"
                              rows={4}
                              className="flex-1 rounded-lg border border-slate-300 p-2 text-sm"
                            />
                            <button
                              type="button"
                              onClick={async () => {
                                if (!courseForm.name || !courseForm.competition) {
                                  setMessage('❌ Preencha o nome e o concurso primeiro para gerar a descrição.')
                                  return
                                }
                                
                                try {
                                  setMessage('🤖 Gerando descrição com IA...')
                                  
                                  const apiKey = import.meta.env.VITE_GEMINI_API_KEY
                                  const groqApiKey = import.meta.env.VITE_GROQ_API_KEY
                                  
                                  if (!apiKey && !groqApiKey) {
                                    setMessage('❌ Configure VITE_GEMINI_API_KEY ou VITE_GROQ_API_KEY no .env')
                                    return
                                  }
                                  
                                  const prompt = `Crie uma descrição atrativa e profissional para um curso preparatório online com as seguintes informações:

Nome do Curso: ${courseForm.name}
Concurso/Competição: ${courseForm.competition}

A descrição deve:
- Ser concisa (2-4 frases)
- Destacar os benefícios do curso
- Mencionar flashcards, questões e IA personalizada
- Ser atrativa e motivadora
- Usar linguagem profissional mas acessível

Retorne APENAS a descrição, sem títulos ou formatação adicional.`

                                  let description = ''
                                  
                                  if (apiKey) {
                                    try {
                                      const genAI = new GoogleGenerativeAI(apiKey)
                                      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })
                                      const result = await model.generateContent(prompt)
                                      description = result.response.text().trim()
                                    } catch (geminiErr) {
                                      if (groqApiKey) {
                                        description = await callGroqAPI(prompt)
                                      } else {
                                        throw geminiErr
                                      }
                                    }
                                  } else if (groqApiKey) {
                                    description = await callGroqAPI(prompt)
                                  }
                                  
                                  if (description) {
                                    setCourseForm(prev => ({ ...prev, description }))
                                    setMessage('✅ Descrição gerada com sucesso!')
                                  } else {
                                    setMessage('❌ Não foi possível gerar a descrição.')
                                  }
                                } catch (err) {
                                  console.error('Erro ao gerar descrição:', err)
                                  setMessage(`❌ Erro ao gerar descrição: ${err.message}`)
                                }
                              }}
                              disabled={!courseForm.name || !courseForm.competition || uploadingCourse}
                              className="rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 px-4 py-2 text-xs font-semibold text-white hover:from-purple-700 hover:to-pink-700 disabled:opacity-50 disabled:cursor-not-allowed transition whitespace-nowrap"
                              title="Gerar descrição automaticamente com IA baseada no nome e concurso"
                            >
                              ✨ Gerar com IA
                            </button>
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-2">
                            Imagem (máximo 2MB) *
                          </label>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleCourseImageUpload}
                            className="w-full rounded-lg border border-slate-300 p-2 text-sm"
                          />
                          {courseForm.imageBase64 && (
                            <div className="mt-2">
                              <img
                                src={courseForm.imageBase64}
                                alt="Preview"
                                className="max-h-32 rounded-lg border border-slate-200"
                              />
                            </div>
                          )}
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-2">
                            Tempo do Curso
                          </label>
                          <input
                            type="text"
                            value={courseForm.courseDuration}
                            onChange={(e) => setCourseForm(prev => ({ ...prev, courseDuration: e.target.value }))}
                            placeholder="Ex: 6 meses, 1 ano, 12 meses, etc."
                            className="w-full rounded-lg border border-slate-300 p-2 text-sm"
                          />
                          <p className="text-xs text-slate-500 mt-1">
                            Informe a duração do curso (ex: "6 meses", "1 ano", "12 meses")
                          </p>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-2">
                              Preço (R$)
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              value={courseForm.price}
                              onChange={(e) => setCourseForm(prev => ({ ...prev, price: parseFloat(e.target.value) || 0 }))}
                              className="w-full rounded-lg border border-slate-300 p-2 text-sm"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-2">
                              Preço Original (R$)
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              value={courseForm.originalPrice}
                              onChange={(e) => setCourseForm(prev => ({ ...prev, originalPrice: parseFloat(e.target.value) || 0 }))}
                              className="w-full rounded-lg border border-slate-300 p-2 text-sm"
                            />
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={courseForm.active}
                            onChange={(e) => setCourseForm(prev => ({ ...prev, active: e.target.checked }))}
                            className="rounded"
                          />
                          <label className="text-xs text-slate-600">Curso ativo</label>
                        </div>

                        <button
                          type="button"
                          onClick={addCourse}
                          disabled={uploadingCourse || !courseForm.name || !courseForm.competition || (!courseForm.imageBase64 && !courseForm.imageUrl)}
                          className="w-full rounded-lg bg-alego-600 px-4 py-2 text-sm font-semibold text-white hover:bg-alego-700 disabled:opacity-50"
                        >
                          {uploadingCourse ? 'Adicionando...' : 'Adicionar Curso'}
                        </button>
                      </div>
                    </div>

                    {/* Lista de cursos existentes */}
                    <div>
                      <h3 className="text-sm font-semibold text-alego-700 mb-4">
                        Cursos Existentes ({courses.length})
                      </h3>
                      
                      {courses.length === 0 ? (
                        <p className="text-sm text-slate-500">Nenhum curso adicionado ainda.</p>
                      ) : (
                        <div className="space-y-4">
                          {courses.map((course) => (
                            <div
                              key={course.id}
                              className="rounded-xl border border-slate-200 p-4"
                            >
                              <div className="flex items-start gap-4">
                                <div className="relative">
                                  {(course.imageBase64 || course.imageUrl) && (
                                    <img
                                      src={editingCourseImage === course.id && newCourseImage 
                                        ? newCourseImage 
                                        : (course.imageBase64 || course.imageUrl)}
                                      alt={course.name}
                                      className="h-24 w-32 rounded-lg border border-slate-200 object-cover"
                                    />
                                  )}
                                  {editingCourseImage === course.id ? (
                                    <div className="mt-2 space-y-2">
                                      <input
                                        type="file"
                                        accept="image/*"
                                        onChange={(e) => handleEditCourseImage(e, course.id)}
                                        className="text-xs"
                                        disabled={uploadingCourse}
                                      />
                                      {newCourseImage && (
                                        <div className="flex gap-2">
                                          <button
                                            type="button"
                                            onClick={() => saveCourseImage(course.id)}
                                            disabled={uploadingCourse}
                                            className="rounded-lg bg-green-600 px-3 py-1 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                                          >
                                            {uploadingCourse ? 'Salvando...' : 'Salvar'}
                                          </button>
                                          <button
                                            type="button"
                                            onClick={cancelEditCourseImage}
                                            disabled={uploadingCourse}
                                            className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                                          >
                                            Cancelar
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => setEditingCourseImage(course.id)}
                                      className="mt-2 w-full rounded-lg border border-blue-300 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                                    >
                                      📷 Trocar Foto
                                    </button>
                                  )}
                                </div>
                                <div className="flex-1">
                                  <div className="flex items-start justify-between">
                                    <div>
                                      <p className="text-sm font-semibold text-slate-700">
                                        {course.name}
                                      </p>
                                      <p className="text-xs text-slate-500 mt-1">
                                        Concurso: {course.competition} • R$ {course.price?.toFixed(2) || '0.00'}
                                        {course.originalPrice && course.originalPrice > course.price && (
                                          <span className="line-through ml-2">R$ {course.originalPrice.toFixed(2)}</span>
                                        )}
                                        {course.courseDuration && (
                                          <span className="ml-2">• Duração: {course.courseDuration}</span>
                                        )}
                                      </p>
                                      {course.description && (
                                        <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                                          {course.description}
                                        </p>
                                      )}
                                      <div className="mt-2 flex items-center gap-2">
                                        <span className={`rounded-full px-2 py-1 text-xs font-semibold ${
                                          course.active !== false
                                            ? 'bg-emerald-100 text-emerald-700'
                                            : 'bg-slate-100 text-slate-600'
                                        }`}>
                                          {course.active !== false ? 'Ativo' : 'Inativo'}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="flex gap-2 flex-wrap">
                                      <button
                                        type="button"
                                        onClick={() => updateCourse(course.id, { active: !(course.active !== false) })}
                                        className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                      >
                                        {course.active !== false ? 'Desativar' : 'Ativar'}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={async (e) => {
                                          e.preventDefault()
                                          e.stopPropagation()
                                          const shareUrl = `${window.location.origin}/curso/${course.id}`
                                          
                                          if (navigator.share) {
                                            try {
                                              await navigator.share({
                                                title: course.name,
                                                text: course.description || `Confira o curso ${course.name}`,
                                                url: shareUrl,
                                              })
                                            } catch (err) {
                                              if (err.name !== 'AbortError') {
                                                await navigator.clipboard.writeText(shareUrl)
                                                setMessage('✅ Link copiado para a área de transferência!')
                                              }
                                            }
                                          } else {
                                            await navigator.clipboard.writeText(shareUrl)
                                            setMessage('✅ Link copiado para a área de transferência!')
                                          }
                                        }}
                                        className="rounded-lg bg-green-100 px-3 py-1 text-xs font-semibold text-green-700 hover:bg-green-200"
                                        title="Compartilhar curso"
                                      >
                                        <ShareIcon className="h-4 w-4 inline" /> Compartilhar
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setSelectedCourseForFullGeneration(course.id)
                                          setShowFullGenerationModal(true)
                                          setRegeneratingCourse(false)
                                        }}
                                        className="rounded-lg bg-purple-100 px-3 py-1 text-xs font-semibold text-purple-700 hover:bg-purple-200"
                                        title="Gerar módulos e flashcards automaticamente a partir do PDF do edital"
                                      >
                                        🤖 Gerar com IA
                                      </button>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.preventDefault()
                                          e.stopPropagation()
                                          console.log('🔄 Botão Regenerar clicado para curso:', course.id, 'tipo:', typeof course.id)
                                          try {
                                            setSelectedCourseForFullGeneration(course.id)
                                            setShowFullGenerationModal(true)
                                            setRegeneratingCourse(true)
                                          } catch (err) {
                                            console.error('Erro ao abrir modal de regeneração:', err)
                                            setMessage(`❌ Erro ao abrir modal: ${err.message}`)
                                          }
                                        }}
                                        className="rounded-lg bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-200"
                                        title="Regenerar flashcards do curso (deleta antigos e gera novos focados no conteúdo)"
                                      >
                                        🔄 Regenerar
                                      </button>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.preventDefault()
                                          e.stopPropagation()
                                          console.log('🗑️ Botão Excluir clicado para curso:', course.id, 'tipo:', typeof course.id)
                                          try {
                                            deleteCourse(course.id)
                                          } catch (err) {
                                            console.error('Erro ao deletar curso:', err)
                                            setMessage(`❌ Erro ao deletar curso: ${err.message}`)
                                          }
                                        }}
                                        className="rounded-lg bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-200"
                                        title="Excluir curso"
                                      >
                                        <TrashIcon className="h-4 w-4 inline" /> Excluir
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Debug: Mostrar IDs dos cursos */}
                {process.env.NODE_ENV === 'development' && courses.length > 0 && (
                  <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="text-xs font-semibold text-yellow-800 mb-2">🔍 Debug - IDs dos Cursos:</p>
                    <ul className="text-xs text-yellow-700 space-y-1">
                      {courses.map(course => (
                        <li key={course.id}>
                          ID: <strong>{course.id}</strong> ({typeof course.id}) | Nome: {course.name} | 
                          É alego-default? {String(course.id === 'alego-default')} | 
                          String é alego-default? {String(String(course.id) === 'alego-default')}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Modal para Geração Completa com IA */}
                {showFullGenerationModal && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="relative w-full max-w-2xl rounded-2xl bg-white shadow-2xl border border-slate-200 p-6 max-h-[90vh] overflow-y-auto">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-bold text-slate-800">
                          {regeneratingCourse ? '🔄 Regenerar Curso com IA' : '🤖 Gerar Curso Completo com IA'}
                        </h3>
                        <button
                          type="button"
                          onClick={() => {
                            setShowFullGenerationModal(false)
                            setSelectedCourseForFullGeneration(null)
                            setEditalPdfForGeneration(null)
                            setEditalPdfTextForGeneration('')
                            setCargoForGeneration('')
                            setRegeneratingCourse(false)
                            setFullCourseProgress('')
                          }}
                          className="text-slate-400 hover:text-slate-600"
                          disabled={generatingFullCourse}
                        >
                          ✕
                        </button>
                      </div>

                      <div className="space-y-4">
                        <div>
                          <p className="text-sm text-slate-600 mb-4">
                            {regeneratingCourse 
                              ? 'Informe o cargo específico e faça upload do PDF do edital. A IA vai REGENERAR os flashcards focados no CONTEÚDO (não no cargo):'
                              : 'Informe o cargo específico e faça upload do PDF do edital. A IA vai analisar o documento e gerar automaticamente:'}
                          </p>
                          <ul className="text-xs text-slate-500 space-y-1 mb-4 ml-4 list-disc">
                            {regeneratingCourse ? (
                              <>
                                <li>Deletar todos os flashcards antigos do curso</li>
                                <li>Gerar novos flashcards focados no CONTEÚDO das matérias</li>
                                <li>Flashcards educacionais que ensinam, não que ficam repetindo o cargo/banca</li>
                              </>
                            ) : (
                              <>
                                <li>Apenas as matérias do cargo informado (filtrando outras matérias de outros cargos)</li>
                                <li>Todos os módulos de cada matéria</li>
                                <li>Todos os flashcards de cada módulo focados no CONTEÚDO (15-25 por módulo)</li>
                              </>
                            )}
                          </ul>
                        </div>

                        <div>
                          <label className="block text-sm font-semibold text-slate-700 mb-2">
                            Cargo Específico *
                          </label>
                          <input
                            type="text"
                            value={cargoForGeneration}
                            onChange={(e) => setCargoForGeneration(e.target.value)}
                            placeholder="Ex: Policial Legislativo, Escrivão, Delegado, etc."
                            disabled={generatingFullCourse}
                            className="w-full rounded-lg border border-slate-300 p-2 text-sm"
                          />
                          <p className="text-xs text-slate-500 mt-1">
                            Informe o cargo específico para a IA filtrar apenas as matérias corretas do edital.
                          </p>
                        </div>

                        <div>
                          <label className="block text-sm font-semibold text-slate-700 mb-2">
                            PDF do Edital *
                          </label>
                          <input
                            type="file"
                            accept=".pdf"
                            onChange={(e) => {
                              const file = e.target.files?.[0]
                              if (file) {
                                extractPdfForFullGeneration(file)
                              }
                            }}
                            disabled={generatingFullCourse || extractingPdf}
                            className="w-full rounded-lg border border-slate-300 p-2 text-sm"
                          />
                          {extractingPdf && (
                            <p className="text-xs text-blue-600 mt-2">📄 Extraindo texto do PDF...</p>
                          )}
                          {editalPdfTextForGeneration && !extractingPdf && (
                            <p className="text-xs text-green-600 mt-2">
                              ✅ PDF processado! {editalPdfTextForGeneration.length.toLocaleString()} caracteres extraídos.
                            </p>
                          )}
                        </div>

                        {fullCourseProgress && (
                          <div className="rounded-lg bg-blue-50 border border-blue-200 p-4">
                            <p className="text-sm text-blue-800 whitespace-pre-wrap">
                              {fullCourseProgress}
                            </p>
                          </div>
                        )}

                        <div className="flex gap-2 pt-4">
                          <button
                            type="button"
                            onClick={() => {
                              if (selectedCourseForFullGeneration) {
                                generateFullCourseFromEdital(selectedCourseForFullGeneration, regeneratingCourse)
                              }
                            }}
                            disabled={!editalPdfTextForGeneration || !cargoForGeneration.trim() || generatingFullCourse || extractingPdf}
                            className="flex-1 rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {generatingFullCourse ? 'Gerando...' : (regeneratingCourse ? '🔄 Regenerar Flashcards' : '🚀 Gerar Curso Completo')}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setShowFullGenerationModal(false)
                              setSelectedCourseForFullGeneration(null)
                              setEditalPdfForGeneration(null)
                              setEditalPdfTextForGeneration('')
                              setCargoForGeneration('')
                              setFullCourseProgress('')
                            }}
                            disabled={generatingFullCourse}
                            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                          >
                            Cancelar
                          </button>
                        </div>

                        {generatingFullCourse && (
                          <div className="mt-4 rounded-lg bg-yellow-50 border border-yellow-200 p-3">
                            <p className="text-xs text-yellow-800">
                              ⚠️ <strong>Atenção:</strong> Este processo pode demorar vários minutos dependendo do tamanho do edital. 
                              Não feche esta janela até a conclusão.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Seção: Verificar e Completar Conteúdos */}
                <div className="relative overflow-hidden bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-6 mt-6">
                  <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-green-500/5 to-emerald-500/5 rounded-full blur-3xl -mr-24 -mt-24"></div>
                  <div className="relative">
                    <p className="flex items-center gap-2 text-sm font-semibold text-alego-600 mb-4">
                      <DocumentTextIcon className="h-5 w-5" />
                      Verificar e Completar Conteúdos
                    </p>
                    <p className="text-xs text-slate-500 mb-6">
                      Cole as matérias em texto e a IA vai verificar o que falta e adicionar automaticamente (matérias, módulos e flashcards).
                    </p>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">
                          Curso para Verificar *
                        </label>
                        <select
                          value={selectedCourseForVerification}
                          onChange={(e) => setSelectedCourseForVerification(e.target.value)}
                          disabled={verifyingContents}
                          className="w-full rounded-lg border border-slate-300 p-2 text-sm"
                        >
                          {courses.map((course) => (
                            <option key={course.id} value={course.id}>
                              {course.name} {course.id === 'alego-default' ? '(Padrão)' : ''}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">
                          Matérias (uma por linha ou separadas por vírgula) *
                        </label>
                        <textarea
                          value={materiasTextInput}
                          onChange={(e) => setMateriasTextInput(e.target.value)}
                          placeholder="Exemplo:&#10;Português&#10;Matemática&#10;Direito Constitucional&#10;Direito Administrativo&#10;&#10;Ou: Português, Matemática, Direito Constitucional, Direito Administrativo"
                          rows={8}
                          disabled={verifyingContents}
                          className="w-full rounded-lg border border-slate-300 p-3 text-sm font-mono"
                        />
                        <p className="text-xs text-slate-500 mt-1">
                          Cole ou digite as matérias que devem estar no curso. A IA vai verificar o que falta e adicionar automaticamente.
                        </p>
                      </div>

                      {verificationProgress && (
                        <div className="rounded-lg bg-blue-50 border border-blue-200 p-4">
                          <p className="text-sm text-blue-800 whitespace-pre-wrap">
                            {verificationProgress}
                          </p>
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => verifyAndCompleteContents(selectedCourseForVerification)}
                        disabled={!materiasTextInput.trim() || verifyingContents}
                        className="w-full rounded-lg bg-green-600 px-4 py-3 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {verifyingContents ? 'Verificando e Completando...' : '✅ Verificar e Completar Conteúdos'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Tab: Avaliações */}
            {activeTab === 'reviews' && (
              <div className="space-y-6">
                {/* Gerenciar Avaliações */}
                <div className="relative overflow-hidden bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-6">
                  <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-blue-500/5 to-purple-500/5 rounded-full blur-3xl -mr-24 -mt-24"></div>
                  <div className="relative">
        <p className="flex items-center gap-2 text-sm font-semibold text-alego-600 mb-4">
          <DocumentTextIcon className="h-5 w-5" />
          Gerenciar Avaliações dos Alunos
        </p>
        <p className="text-xs text-slate-500 mb-6">
          Aprove, rejeite ou exclua avaliações dos alunos. Avaliações aprovadas aparecem na página inicial.
        </p>

        {reviews.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhuma avaliação ainda.</p>
        ) : (
          <div className="space-y-4">
            {reviews.map((review) => {
              const renderStars = (rating) => {
                return (
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <StarIcon
                        key={star}
                        className={`h-4 w-4 ${
                          star <= rating ? 'text-yellow-400' : 'text-gray-300'
                        }`}
                      />
                    ))}
                  </div>
                )
              }

              return (
                <div
                  key={review.id}
                  className={`rounded-xl border p-4 ${
                    review.approved
                      ? 'border-emerald-200 bg-emerald-50'
                      : 'border-amber-200 bg-amber-50'
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-semibold text-slate-900">
                        {review.userName || 'Aluno'}
                      </p>
                      <p className="text-xs text-slate-500">
                        {review.userEmail} • {review.createdAt?.toDate?.().toLocaleDateString('pt-BR') || 'Data não disponível'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {renderStars(review.rating)}
                      <span className={`rounded-full px-2 py-1 text-xs font-semibold ${
                        review.approved
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}>
                        {review.approved ? 'Aprovada' : 'Pendente'}
                      </span>
                    </div>
                  </div>
                  <p className="text-sm text-slate-700 mb-3">{review.comment}</p>
                  <div className="flex gap-2">
                    {!review.approved && (
                      <button
                        type="button"
                        onClick={() => approveReview(review.id)}
                        className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
                      >
                        Aprovar
                      </button>
                    )}
                    {review.approved && (
                      <button
                        type="button"
                        onClick={() => rejectReview(review.id)}
                        className="rounded-lg bg-amber-600 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-700"
                      >
                        Rejeitar
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => deleteReview(review.id)}
                      className="rounded-lg bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-200"
                    >
                      <TrashIcon className="h-4 w-4 inline" /> Excluir
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
                  </div>
                </div>
              </div>
            )}

            {/* Tab: Usuários */}
            {activeTab === 'users' && (
              <div className="space-y-6">
                {/* Gerar Link de Redefinição de Senha */}
                <div className="relative overflow-hidden bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-6">
                  <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-blue-500/5 to-purple-500/5 rounded-full blur-3xl -mr-24 -mt-24"></div>
                  <div className="relative">
                    <p className="flex items-center gap-2 text-sm font-semibold text-alego-600 mb-4">
                      <LockClosedIcon className="h-5 w-5" />
                      Gerar Link de Redefinição de Senha
                    </p>
                    <p className="text-xs text-slate-500 mb-6">
                      Gere um link seguro e oculto para usuários redefinirem suas senhas. O link expira em 24 horas.
                    </p>

                    <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-2">
              Email do Usuário
            </label>
            <div className="flex gap-2">
              <input
                type="email"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                placeholder="usuario@email.com"
                className="flex-1 rounded-lg border border-slate-300 p-2 text-sm"
              />
              <button
                type="button"
                onClick={generateResetLink}
                disabled={generatingLink || !resetEmail.trim()}
                className="rounded-lg bg-alego-600 px-4 py-2 text-sm font-semibold text-white hover:bg-alego-700 disabled:opacity-50"
              >
                {generatingLink ? 'Gerando...' : 'Gerar Link'}
              </button>
            </div>
          </div>

          {generatedLink && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4">
              <p className="text-xs font-semibold text-emerald-700 mb-2">
                ✅ Link gerado com sucesso!
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={generatedLink}
                  readOnly
                  className="flex-1 rounded-lg border border-emerald-300 bg-white p-2 text-xs font-mono"
                />
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(generatedLink)
                    setMessage('✅ Link copiado para a área de transferência!')
                  }}
                  className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                >
                  Copiar
                </button>
              </div>
              <p className="text-xs text-emerald-600 mt-2">
                ⚠️ Este link expira em 24 horas e só pode ser usado uma vez.
              </p>
            </div>
                    )}
                    </div>
                  </div>
                </div>
                
                {/* Gerenciamento de usuários */}
                <div className="relative overflow-hidden bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-6">
                  <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-blue-500/5 to-purple-500/5 rounded-full blur-3xl -mr-24 -mt-24"></div>
                  <div className="relative">
                    <p className="flex items-center gap-2 text-sm font-semibold text-alego-600 mb-4">
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
                </div>
                
                {/* Lista de usuários */}
                <div className="relative overflow-hidden bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-6">
                  <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-blue-500/5 to-purple-500/5 rounded-full blur-3xl -mr-24 -mt-24"></div>
                  <div className="relative">
                    <p className="text-sm font-semibold text-alego-600 mb-4">
                      {users.length} usuários cadastrados
                    </p>
                    <div className="mt-4 divide-y divide-slate-100">
                      {users.map((user) => {
                        const userPresence = presence[user.uid] || { status: 'offline' }
                        const isOnline = userPresence.status === 'online'
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
                                <div className="mt-1 flex gap-2 flex-wrap">
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
                                  {user.purchasedCourses && user.purchasedCourses.length > 0 && (
                                    <span className="inline-block rounded-full bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-600">
                                      {user.purchasedCourses.length} curso{user.purchasedCourses.length > 1 ? 's' : ''}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setSelectedUserForCourse(user)}
                                className="flex items-center gap-1 rounded-full border border-blue-500 px-4 py-2 text-sm font-semibold text-blue-500 hover:bg-blue-50"
                              >
                                <AcademicCapIcon className="h-4 w-4" />
                                Cursos
                              </button>
                              <button
                                type="button"
                                onClick={() => removeUser(user.uid || user.email)}
                                className="flex items-center gap-1 rounded-full border border-rose-500 px-4 py-2 text-sm font-semibold text-rose-500 hover:bg-rose-50"
                              >
                                <TrashIcon className="h-4 w-4" />
                                Excluir
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Modal para adicionar/remover cursos do usuário */}
            {selectedUserForCourse && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
                <div className="relative max-w-2xl w-full rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-blue-500/10 to-purple-500/10 rounded-full blur-3xl -mr-32 -mt-32"></div>
                  
                  <div className="relative p-6">
                    <div className="flex items-start justify-between gap-4 mb-6">
                      <div>
                        <h2 className="text-2xl font-black bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400 bg-clip-text text-transparent mb-2">
                          Gerenciar Cursos
                        </h2>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                          {selectedUserForCourse.displayName || selectedUserForCourse.email}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedUserForCourse(null)}
                        className="flex-shrink-0 w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center transition-all hover:scale-110"
                      >
                        <span className="text-lg font-bold text-slate-600 dark:text-slate-400">✕</span>
                      </button>
                    </div>

                    {/* Cursos já adquiridos */}
                    <div className="mb-6">
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
                        Cursos com acesso ({selectedUserForCourse.purchasedCourses?.length || 0})
                      </p>
                      {selectedUserForCourse.purchasedCourses && selectedUserForCourse.purchasedCourses.length > 0 ? (
                        <div className="space-y-2">
                          {selectedUserForCourse.purchasedCourses.map((courseId) => {
                            const course = courses.find(c => c.id === courseId)
                            if (!course) return null
                            return (
                              <div
                                key={courseId}
                                className="flex items-center justify-between p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800"
                              >
                                <div>
                                  <p className="font-semibold text-blue-900 dark:text-blue-100">{course.name}</p>
                                  <p className="text-xs text-blue-600 dark:text-blue-400">{course.competition}</p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => removeCourseFromUser(selectedUserForCourse.uid, courseId)}
                                  className="px-3 py-1.5 rounded-lg bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 text-xs font-semibold hover:bg-rose-200 dark:hover:bg-rose-900/50 transition-all"
                                >
                                  Remover
                                </button>
                              </div>
                            )
                          })}
                        </div>
                      ) : (
                        <p className="text-sm text-slate-500 dark:text-slate-400 italic">
                          Nenhum curso adicionado ainda.
                        </p>
                      )}
                    </div>

                    {/* Adicionar novo curso */}
                    <div>
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
                        Adicionar novo curso
                      </p>
                      <div className="space-y-2">
                        {courses.filter(c => c.active !== false && !selectedUserForCourse.purchasedCourses?.includes(c.id)).map((course) => (
                          <button
                            key={course.id}
                            type="button"
                            onClick={() => addCourseToUser(selectedUserForCourse.uid, course.id)}
                            disabled={addingCourseToUser}
                            className="w-full flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-blue-300 dark:hover:border-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <div>
                              <p className="font-semibold text-slate-900 dark:text-white">{course.name}</p>
                              <p className="text-xs text-slate-600 dark:text-slate-400">{course.competition}</p>
                            </div>
                            {addingCourseToUser ? (
                              <span className="text-sm text-slate-500">Adicionando...</span>
                            ) : (
                              <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">+ Adicionar</span>
                            )}
                          </button>
                        ))}
                        {courses.filter(c => c.active !== false && !selectedUserForCourse.purchasedCourses?.includes(c.id)).length === 0 && (
                          <p className="text-sm text-slate-500 dark:text-slate-400 italic">
                            Todos os cursos disponíveis já foram adicionados.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Tab: Flashcards */}
            {activeTab === 'flashcards' && (
              <div className="space-y-6">
                {/* Seletor de Curso */}
                <div className="relative overflow-hidden bg-gradient-to-r from-blue-500 to-purple-500 rounded-2xl shadow-xl border border-blue-400 p-6">
                  <div className="relative z-10">
                    <p className="flex items-center gap-2 text-lg font-bold text-white mb-4">
                      <AcademicCapIcon className="h-6 w-6" />
                      Selecionar Curso para Gerenciar
                    </p>
                    <p className="text-sm text-blue-100 mb-4">
                      Escolha o curso para adicionar flashcards. Os flashcards serão associados ao curso selecionado.
                    </p>
                    <div className="flex items-center gap-4">
                      <select
                        value={selectedCourseForFlashcards}
                        onChange={async (e) => {
                          const newCourseId = e.target.value
                          setSelectedCourseForFlashcards(newCourseId)
                          // Limpar seleção de matéria/módulo ao trocar de curso
                          setFlashcardForm(prev => ({ ...prev, materia: '', modulo: '', courseId: newCourseId || '' }))
                          
                          // Salvar curso selecionado no perfil do admin
                          if (currentAdminUser) {
                            try {
                              const userRef = doc(db, 'users', currentAdminUser.uid)
                              // Converter 'alego-default' para null para compatibilidade com outras páginas
                              const courseIdToSave = newCourseId === 'alego-default' ? null : newCourseId
                              await setDoc(userRef, {
                                selectedCourseId: courseIdToSave || null,
                              }, { merge: true })
                            } catch (err) {
                              console.error('Erro ao salvar curso selecionado:', err)
                            }
                          }
                        }}
                        className="flex-1 rounded-xl border-2 border-white/30 bg-white/90 px-4 py-3 text-sm font-semibold text-slate-800 focus:border-white focus:bg-white focus:outline-none"
                      >
                        {courses.filter(c => c.active !== false).map((course) => (
                          <option key={course.id} value={course.id}>
                            {course.id === 'alego-default' ? '📚' : '🎓'} {course.name} - {course.competition}
                          </option>
                        ))}
                      </select>
                      {selectedCourseForFlashcards && (
                        <div className="rounded-lg bg-white/20 backdrop-blur-sm px-4 py-2">
                          <p className="text-xs font-semibold text-white">
                            {(() => {
                              const course = courses.find(c => c.id === selectedCourseForFlashcards)
                              return course ? `${course.competition}` : ''
                            })()}
                          </p>
                        </div>
                      )}
                    </div>
                    {selectedCourseForFlashcards && (
                      <div className="mt-4 rounded-lg bg-white/20 backdrop-blur-sm p-3">
                        <p className="text-xs text-white">
                          <strong>Curso selecionado:</strong> {courses.find(c => c.id === selectedCourseForFlashcards)?.name}
                        </p>
                        <p className="text-xs text-blue-100 mt-1">
                          Todos os flashcards criados abaixo serão associados a este curso.
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Estatísticas do Curso Selecionado */}
                {selectedCourseForFlashcards && (() => {
                  const courseCards = cards.filter(card => card.courseId === selectedCourseForFlashcards)
                  const courseName = courses.find(c => c.id === selectedCourseForFlashcards)?.name || 'Curso'
                  return (
                    <div className="relative overflow-hidden bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-2xl shadow-xl border border-green-200 dark:border-green-700 p-6">
                      <div className="relative">
                        <p className="flex items-center gap-2 text-lg font-bold text-green-700 dark:text-green-300 mb-4">
                          📊 Estatísticas do Curso: {courseName}
                        </p>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-green-200 dark:border-green-700">
                            <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Total de Flashcards</p>
                            <p className="text-2xl font-bold text-green-600 dark:text-green-400">{courseCards.length}</p>
                          </div>
                          <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-green-200 dark:border-green-700">
                            <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Matérias</p>
                            <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                              {new Set(courseCards.map(c => c.materia).filter(Boolean)).size}
                            </p>
                          </div>
                          <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-green-200 dark:border-green-700">
                            <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Módulos</p>
                            <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                              {new Set(courseCards.map(c => `${c.materia}::${c.modulo}`).filter(Boolean)).size}
                            </p>
                          </div>
                          <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-green-200 dark:border-green-700">
                            <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Status</p>
                            <p className="text-sm font-bold text-green-600 dark:text-green-400">✅ Ativo</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })()}

                {/* Gerenciar Matérias do Curso (apenas para cursos personalizados) */}
                {selectedCourseForFlashcards && (
                  <div className="relative overflow-hidden bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-6">
                    <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-purple-500/5 to-pink-500/5 rounded-full blur-3xl -mr-24 -mt-24"></div>
                    <div className="relative">
                      <p className="flex items-center gap-2 text-lg font-bold text-purple-700 dark:text-purple-300">
                        <PlusIcon className="h-6 w-6" />
                        Gerenciar Matérias do Curso
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        Adicione as matérias específicas deste curso. Cada curso tem suas próprias matérias independentes.
                      </p>

                      <div className="mt-6 flex gap-2">
                        <input
                          type="text"
                          value={newSubjectName}
                          onChange={(e) => setNewSubjectName(e.target.value)}
                          onKeyPress={(e) => e.key === 'Enter' && addSubjectToCourse()}
                          placeholder="Ex: Direito Constitucional, Matemática..."
                          className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-purple-400 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={addSubjectToCourse}
                          disabled={!newSubjectName.trim()}
                          className="rounded-xl bg-purple-600 px-6 py-3 text-sm font-semibold text-white disabled:opacity-50"
                        >
                          Adicionar Matéria
                        </button>
                      </div>

                      {/* Lista de matérias do curso */}
                      <div className="mt-4">
                        <p className="text-sm font-semibold text-slate-700 mb-2">
                          Matérias do Curso ({courseSubjects[selectedCourseForFlashcards]?.length || 0})
                        </p>
                        {courseSubjects[selectedCourseForFlashcards]?.length > 0 ? (
                          <div className="space-y-2">
                            {courseSubjects[selectedCourseForFlashcards].map((subject) => (
                              <div
                                key={subject}
                                className="flex items-center justify-between rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-700 px-4 py-2"
                              >
                                <span className="text-sm font-semibold text-purple-700 dark:text-purple-300">
                                  {subject}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    // Buscar ID da matéria para deletar
                                    const courseSubjectsRef = collection(db, 'courses', selectedCourseForFlashcards, 'subjects')
                                    getDocs(courseSubjectsRef).then(snapshot => {
                                      const subjectDoc = snapshot.docs.find(doc => doc.data().name === subject)
                                      if (subjectDoc) {
                                        removeSubjectFromCourse(subjectDoc.id, subject)
                                      }
                                    })
                                  }}
                                  className="text-xs text-red-600 hover:text-red-700 font-semibold"
                                >
                                  Remover
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-slate-500">Nenhuma matéria adicionada ainda. Adicione matérias acima.</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Gerenciar Módulos */}
                <div className="relative overflow-hidden bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-6">
                  <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-blue-500/5 to-purple-500/5 rounded-full blur-3xl -mr-24 -mt-24"></div>
                  <div className="relative">
                    <p className="flex items-center gap-2 text-lg font-bold text-alego-700">
                      <PlusIcon className="h-6 w-6" />
                      Gerenciar Módulos por Matéria
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      {selectedCourseForFlashcards 
                        ? 'Adicione os módulos dentro de cada matéria do curso selecionado.'
                        : 'Primeiro, adicione os módulos dentro de cada matéria. Depois você poderá criar flashcards atribuindo-os aos módulos.'}
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
                          {selectedCourseForFlashcards 
                            ? (courseSubjects[selectedCourseForFlashcards] || []).map((materia) => (
                                <option key={materia} value={materia}>
                                  {materia}
                                </option>
                              ))
                            : MATERIAS.map((materia) => (
                                <option key={materia} value={materia}>
                                  {materia}
                                </option>
                              ))}
                        </select>
                        {selectedCourseForFlashcards && (!courseSubjects[selectedCourseForFlashcards] || courseSubjects[selectedCourseForFlashcards].length === 0) && (
                          <p className="mt-1 text-xs text-amber-600">
                            Adicione matérias ao curso primeiro na seção acima.
                          </p>
                        )}
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
                      {(selectedCourseForFlashcards 
                        ? (courseSubjects[selectedCourseForFlashcards] || [])
                        : MATERIAS
                      ).map((materia) => {
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
                        
                        // Contar flashcards por módulo (filtrado por curso selecionado)
                        const getFlashcardCount = (moduloName) => {
                          return cards.filter(card => {
                            const matchesMateria = card.materia === materia
                            const matchesModulo = card.modulo === moduloName
                            // Se nenhum curso selecionado, mostrar apenas flashcards sem courseId (ALEGO padrão)
                            // Se curso selecionado, mostrar apenas flashcards desse curso
                            const matchesCourse = selectedCourseForFlashcards 
                              ? card.courseId === selectedCourseForFlashcards
                              : !card.courseId // ALEGO padrão não tem courseId
                            return matchesMateria && matchesModulo && matchesCourse
                          }).length
                        }
                        
                        return (
                          <div key={materia} className="rounded-xl border border-slate-200 p-4">
                            <h3 className="mb-3 text-base font-bold text-alego-700">{materia}</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                              {sortedModulos.map((modulo) => {
                                const flashcardCount = getFlashcardCount(modulo)
                                // Truncar nome do módulo se muito longo (máximo 50 caracteres)
                                const displayName = modulo.length > 50 ? modulo.substring(0, 47) + '...' : modulo
                                
                                return (
                                  <div
                                    key={modulo}
                                    className="flex items-center justify-between gap-2 rounded-lg bg-alego-50 border border-alego-200 px-3 py-2 hover:bg-alego-100 transition-colors"
                                    title={modulo} // Tooltip com nome completo
                                  >
                                    <div className="flex-1 min-w-0">
                                      <span className="text-xs font-semibold text-alego-700 block truncate">
                                        {displayName}
                                      </span>
                                      {flashcardCount > 0 && (
                                        <span className="text-xs text-slate-500">
                                          {flashcardCount} flashcard{flashcardCount !== 1 ? 's' : ''}
                                        </span>
                                      )}
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => removeModule(materia, modulo)}
                                      className="flex-shrink-0 text-rose-600 hover:text-rose-700 transition-colors"
                                      title="Remover módulo"
                                    >
                                      <TrashIcon className="h-4 w-4" />
                                    </button>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
                
                {/* Criar Flashcard */}
                <div className="relative overflow-hidden bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-6">
                  <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-blue-500/5 to-purple-500/5 rounded-full blur-3xl -mr-24 -mt-24"></div>
                  <div className="relative">
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
                          disabled={selectedCourseForFlashcards && (!courseSubjects[selectedCourseForFlashcards] || courseSubjects[selectedCourseForFlashcards].length === 0)}
                        >
                          <option value="">Selecione a matéria</option>
                          {selectedCourseForFlashcards 
                            ? (courseSubjects[selectedCourseForFlashcards] || []).map((materia) => (
                                <option key={materia} value={materia}>
                                  {materia}
                                </option>
                              ))
                            : MATERIAS.map((materia) => (
                                <option key={materia} value={materia}>
                                  {materia}
                                </option>
                              ))}
                        </select>
                        {selectedCourseForFlashcards && (!courseSubjects[selectedCourseForFlashcards] || courseSubjects[selectedCourseForFlashcards].length === 0) && (
                          <p className="mt-1 text-xs text-amber-600">
                            Adicione matérias ao curso primeiro na seção "Gerenciar Matérias do Curso".
                          </p>
                        )}
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
                      <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 p-3">
                        <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-1">
                          Curso Selecionado:
                        </p>
                        <p className="text-sm font-bold text-blue-900 dark:text-blue-100">
                          {selectedCourseForFlashcards 
                            ? courses.find(c => c.id === selectedCourseForFlashcards)?.name || 'Carregando...'
                            : '📚 Curso Padrão (ALEGO)'}
                        </p>
                        <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                          O flashcard será adicionado ao curso selecionado acima.
                        </p>
                      </div>
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
                </div>

                {/* Gerar Flashcards por IA - Estilo Noji */}
                <div className="relative overflow-hidden bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-2xl shadow-xl border border-purple-200 dark:border-purple-700 p-6">
                  <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-purple-500/10 to-pink-500/10 rounded-full blur-3xl -mr-24 -mt-24"></div>
                  <div className="relative">
                    <p className="flex items-center gap-2 text-lg font-bold text-purple-700 dark:text-purple-300 mb-2">
                      <SparklesIcon className="h-6 w-6" />
                      Gerar Flashcards por IA (Estilo Noji)
                    </p>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                      Cole o conteúdo abaixo e a IA gerará flashcards automaticamente para o módulo selecionado.
                    </p>

                    <div className="mb-4 grid gap-4 md:grid-cols-3">
                      <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                        Matéria *
                        <select
                          value={flashcardForm.materia}
                          onChange={(e) => {
                            setFlashcardForm((prev) => ({ ...prev, materia: e.target.value, modulo: '' }))
                          }}
                          className="mt-2 w-full rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3 text-sm focus:border-purple-400 focus:outline-none bg-white dark:bg-slate-800"
                          disabled={selectedCourseForFlashcards && (!courseSubjects[selectedCourseForFlashcards] || courseSubjects[selectedCourseForFlashcards].length === 0)}
                        >
                          <option value="">Selecione a matéria</option>
                          {selectedCourseForFlashcards 
                            ? (courseSubjects[selectedCourseForFlashcards] || []).map((materia) => (
                                <option key={materia} value={materia}>
                                  {materia}
                                </option>
                              ))
                            : MATERIAS.map((materia) => (
                                <option key={materia} value={materia}>
                                  {materia}
                                </option>
                              ))}
                        </select>
                      </label>
                      <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                        Módulo *
                        <select
                          value={flashcardForm.modulo}
                          onChange={(e) => setFlashcardForm((prev) => ({ ...prev, modulo: e.target.value }))}
                          disabled={!flashcardForm.materia}
                          className="mt-2 w-full rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3 text-sm focus:border-purple-400 focus:outline-none disabled:bg-slate-50 dark:disabled:bg-slate-900 bg-white dark:bg-slate-800"
                        >
                          <option value="">{flashcardForm.materia ? 'Selecione o módulo' : 'Primeiro selecione a matéria'}</option>
                          {flashcardForm.materia && (modules[flashcardForm.materia] || [])
                            .sort((a, b) => {
                              const extractNumber = (str) => {
                                const match = str.match(/\d+/)
                                return match ? parseInt(match[0], 10) : 999
                              }
                              const numA = extractNumber(a)
                              const numB = extractNumber(b)
                              if (numA !== 999 && numB !== 999) return numA - numB
                              if (numA !== 999) return -1
                              if (numB !== 999) return 1
                              return a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' })
                            })
                            .map((modulo) => (
                            <option key={modulo} value={modulo}>
                              {modulo}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                        Quantidade de Flashcards *
                        <input
                          type="number"
                          min="5"
                          max="50"
                          value={flashcardsQuantity}
                          onChange={(e) => {
                            const value = parseInt(e.target.value) || 15
                            setFlashcardsQuantity(Math.max(5, Math.min(50, value)))
                          }}
                          className="mt-2 w-full rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3 text-sm focus:border-purple-400 focus:outline-none bg-white dark:bg-slate-800"
                          placeholder="15"
                          disabled={generatingFlashcards}
                        />
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          Entre 5 e 50 flashcards
                        </p>
                      </label>
                    </div>

                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                      Cole o conteúdo aqui *
                    </label>
                    <textarea
                      value={aiContentInput}
                      onChange={(e) => setAiContentInput(e.target.value)}
                      rows={8}
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3 text-sm focus:border-purple-400 focus:outline-none bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                      placeholder="Cole aqui o conteúdo do qual você quer gerar flashcards. Pode ser texto de PDF, apostila, resumo, etc..."
                      disabled={generatingFlashcards}
                    />
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                      💡 A IA analisará o conteúdo e criará flashcards no estilo Noji (perguntas objetivas e respostas claras).
                    </p>

                    {flashcardGenProgress && (
                      <div className="mt-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 p-3">
                        <p className="text-sm font-semibold text-blue-700 dark:text-blue-300">
                          {flashcardGenProgress}
                        </p>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={generateFlashcardsFromContent}
                      disabled={!flashcardForm.materia || !flashcardForm.modulo || !aiContentInput.trim() || generatingFlashcards || flashcardsQuantity < 5 || flashcardsQuantity > 50}
                      className="mt-4 w-full rounded-full bg-gradient-to-r from-purple-600 to-pink-600 px-6 py-3 text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed hover:from-purple-700 hover:to-pink-700 transition-all"
                    >
                      {generatingFlashcards ? `Gerando ${flashcardsQuantity} flashcards...` : `✨ Gerar ${flashcardsQuantity} Flashcards por IA`}
                    </button>
                  </div>
                </div>
                
                {/* Importar via JSON */}
                <div className="relative overflow-hidden bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-6">
                  <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-blue-500/5 to-purple-500/5 rounded-full blur-3xl -mr-24 -mt-24"></div>
                  <div className="relative">
                    <p className="flex items-center gap-2 text-sm font-semibold text-alego-600 mb-4">
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
                </div>
                
                {/* Lista de cards */}
                <div className="relative overflow-hidden bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-6">
                  <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-blue-500/5 to-purple-500/5 rounded-full blur-3xl -mr-24 -mt-24"></div>
                  <div className="relative">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <p className="text-sm font-semibold text-alego-600">
                        {cards.length} cards cadastrados
                      </p>
                      <div className="flex items-center gap-3">
                        {selectedCourseForFlashcards && (
                          <button
                            type="button"
                            onClick={cleanupOrphanFlashcards}
                            className="rounded-lg bg-rose-500 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-600 transition"
                            title="Remover flashcards de matérias/módulos que não existem mais no curso"
                          >
                            🗑️ Limpar Órfãos
                          </button>
                        )}
                        <p className="text-xs text-slate-500">
                          Expanda a matéria e o módulo para visualizar e gerenciar os cards correspondentes.
                        </p>
                      </div>
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
                                          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
                                          title={modulo} // Tooltip com nome completo
                                        >
                                          <div className="flex-1 min-w-0">
                                            <p className="text-sm font-semibold text-slate-700 truncate">{modulo}</p>
                                            <p className="text-[11px] uppercase tracking-wide text-slate-400">
                                              {cardsList.length} {cardsList.length === 1 ? 'card' : 'cards'}
                                            </p>
                                          </div>
                                          <span className="text-xs font-semibold text-alego-500 flex-shrink-0">
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
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default AdminPanel

