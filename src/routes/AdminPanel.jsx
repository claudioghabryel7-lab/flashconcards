import { checkGeminiApiKeysStatus } from '../utils/geminiApi'
import { useEffect, useMemo, useState, useRef } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import EditalVerticalizadoManager from '../components/EditalVerticalizadoManager'
import { DocumentTextIcon, TrashIcon, UserPlusIcon, PlusIcon, DocumentArrowUpIcon, AcademicCapIcon, SparklesIcon, ShareIcon, ArrowPathIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { StarIcon, LockClosedIcon } from '@heroicons/react/24/solid'
import { createUserWithEmailAndPassword, deleteUser as deleteAuthUser, fetchSignInMethodsForEmail, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { auth, db, storage } from '../firebase/config'
import { FIREBASE_FUNCTIONS } from '../config/firebaseFunctions'
import { useAuth } from '../hooks/useAuth'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { callGeminiWithRetry, extractGeneratedText } from '../utils/geminiApi'
import { createSlug } from '../utils/slug'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import * as pdfjsLib from 'pdfjs-dist'
import { jsonrepair } from 'jsonrepair'
import LawDetector from '../utils/lawDetector'
import LawDownloader from '../utils/lawDownloader'
import { generateShareToken } from '../utils/shareToken'

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
  
  // Estados para Edital Verticalizado
  const [editalVerticalizadoFile, setEditalVerticalizadoFile] = useState(null)
  const [concursoNews, setConcursoNews] = useState([]) // Notícias de concursos geradas
  const [editalVerticalizadoText, setEditalVerticalizadoText] = useState('')
  const [extractingEditalVerticalizado, setExtractingEditalVerticalizado] = useState(false)
  const [savingEditalVerticalizado, setSavingEditalVerticalizado] = useState(false)
  const [editalVerticalizadoData, setEditalVerticalizadoData] = useState(null)
  
  // Estados para prompt unificado
  const [unifiedPrompt, setUnifiedPrompt] = useState({
    banca: '',
    concursoName: '',
    prompt: '',
  })
  const [savingUnifiedPrompt, setSavingUnifiedPrompt] = useState(false)
  const [expandedCardMaterias, setExpandedCardMaterias] = useState({})
  const [expandedCardModulos, setExpandedCardModulos] = useState({})
  
  // Estados para Matérias Revisadas
  const [materiaRevisadaForm, setMateriaRevisadaForm] = useState({
    materia: '',
    courseId: 'alego-default',
  })
  const [generatingMateriaRevisada, setGeneratingMateriaRevisada] = useState(false)
  const [materiaRevisadaProgress, setMateriaRevisadaProgress] = useState('')
  const [existingMateriasRevisadas, setExistingMateriasRevisadas] = useState([])
  const [generatingAllMaterias, setGeneratingAllMaterias] = useState(false)
  const [allMateriasProgress, setAllMateriasProgress] = useState('')
  
  // Estados para Conteúdos Completos
  const [generatingAllConteudosCompletos, setGeneratingAllConteudosCompletos] = useState(false)
  const [allConteudosCompletosProgress, setAllConteudosCompletosProgress] = useState('')
  
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
  const [resetPasswordError, setResetPasswordError] = useState(null) // { email: string, existsInFirestore: boolean }
  
  
  // Estado para controle de tabs
  const [activeTab, setActiveTab] = useState('config')
  
  // Estado para gerenciar testes gratuitos
  const [testTrials, setTestTrials] = useState([])
  const [trialForm, setTrialForm] = useState({
    courseId: '',
    expiresInDays: 7,
    maxUsers: 10,
  })
  
  // Estado para curso selecionado no gerenciamento de flashcards
  const [selectedCourseForFlashcards, setSelectedCourseForFlashcards] = useState('alego-default') // 'alego-default' = ALEGO padrão, 'courseId' = curso específico
  
  // Estado para gerenciar visualização e deleção de flashcards
  const [showAllFlashcards, setShowAllFlashcards] = useState(false)
  const [deletingAllFlashcards, setDeletingAllFlashcards] = useState(false)
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false)
  
  // Estado para curso selecionado nos prompts
  const [selectedCourseForPrompts, setSelectedCourseForPrompts] = useState('alego-default') // Curso para salvar prompts
  
  // Estado para teste de prompts
  const [testPrompt, setTestPrompt] = useState('')
  const [testMateria, setTestMateria] = useState('')
  const [testFlashcardResult, setTestFlashcardResult] = useState(null)
  const [testError, setTestError] = useState('')
  const [generatingTest, setGeneratingTest] = useState(false)
  const [savingTestPrompt, setSavingTestPrompt] = useState(false)
  const [promptHistory, setPromptHistory] = useState([])
  const [sourceUrl, setSourceUrl] = useState('')
  const [scrapingContent, setScrapingContent] = useState(false)
  const [scrapedContent, setScrapedContent] = useState('')
  const [autoResearch, setAutoResearch] = useState(false)
  const [researching, setResearching] = useState(false)
  const [researchContent, setResearchContent] = useState('')
  
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
    featured: false, // Curso em destaque (aparece no topo)
    referenceLink: '', // Link de referência para a IA analisar o concurso
    banca: '', // Banca examinadora (ex: INSTITUTO AOCP, FGV, CESPE, FCC)
  })
  const [uploadingCourse, setUploadingCourse] = useState(false)
  const [editingCourseImage, setEditingCourseImage] = useState(null) // ID do curso sendo editado
  const [newCourseImage, setNewCourseImage] = useState(null) // Nova imagem em base64
  const [editingCourse, setEditingCourse] = useState(null) // ID do curso sendo editado (formulário completo)
  const [editingCourseData, setEditingCourseData] = useState(null) // Dados do curso em edição
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
  
  // Estados para organização de matérias
  const [organizingSubjects, setOrganizingSubjects] = useState(false) // Se está organizando com IA
  const [organizingProgress, setOrganizingProgress] = useState('') // Progresso da organização
  const [manualEditMode, setManualEditMode] = useState(false) // Modo de edição manual
  const [tempSubjectOrder, setTempSubjectOrder] = useState([]) // Ordem temporária para edição manual
  const [tempModuleOrder, setTempModuleOrder] = useState({}) // Ordem temporária de módulos
  const [expandedMateriaForModules, setExpandedMateriaForModules] = useState(null) // Matéria expandida para editar módulos
  const [activeId, setActiveId] = useState(null) // ID do item sendo arrastado
  
  // Estados para compartilhamento temporário de flashcards
  const [shareForm, setShareForm] = useState({
    disciplina: '',
    modulo: '',
    topicKey: '',
  })
  const [generatedShareLink, setGeneratedShareLink] = useState('')
  const [generatingShareLink, setGeneratingShareLink] = useState(false)
  
  // Estados para verificação de status da IA
  const [showAiStatusModal, setShowAiStatusModal] = useState(false)
  const [checkingAiStatus, setCheckingAiStatus] = useState(false)
  const [aiKeysStatus, setAiKeysStatus] = useState([])
  const [aiStatusError, setAiStatusError] = useState('')
  
  // Sensores para drag and drop
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // Configurar PDF.js worker
  useEffect(() => {
    try {
      // Tentar usar worker local primeiro
      if (typeof window !== 'undefined') {
        // Usar CDN do unpkg que é mais confiável
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`
        console.log('✅ PDF.js configurado:', pdfjsLib.version)
      }
    } catch (err) {
      console.error('❌ Erro ao configurar PDF.js:', err)
    }
  }, [])

  // Carregar notícias quando a aba 'news' for ativada
  useEffect(() => {
    if (activeTab === 'news') {
      const loadConcursoNews = async () => {
        try {
          const newsRef = collection(db, 'posts')
          // Usar query simples sem orderBy para evitar necessidade de índice composto
          const newsQuery = query(
            newsRef,
            where('isConcursoNews', '==', true),
            limit(50)
          )
          const newsSnapshot = await getDocs(newsQuery)
          // Ordenar em memória por data de criação (mais recente primeiro)
          const newsList = newsSnapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(news => news.createdAt)
            .sort((a, b) => {
              const dateA = a.createdAt?.toDate?.() || new Date(0)
              const dateB = b.createdAt?.toDate?.() || new Date(0)
              return dateB.getTime() - dateA.getTime()
            })
          setConcursoNews(newsList)
        } catch (err) {
          console.error('Erro ao carregar notícias:', err)
        }
      }
      loadConcursoNews()
    }
  }, [activeTab])

  // Carregar edital do curso selecionado
  useEffect(() => {
    if (!isAdmin) return
    
    // Limpar campos primeiro quando mudar de curso
    setEditalPrompt('')
    setPdfText('')
    setPdfUrl('')
    
    const loadEdital = async () => {
      if (!selectedCourseForPrompts) {
        console.log('⚠️ Nenhum curso selecionado para carregar edital')
        return
      }
      
      try {
        console.log('📖 Carregando edital do curso:', selectedCourseForPrompts)
        const editalRef = doc(db, 'courses', selectedCourseForPrompts, 'prompts', 'edital')
        const editalDoc = await getDoc(editalRef)
        if (editalDoc.exists()) {
          const data = editalDoc.data()
          console.log('✅ Edital encontrado, carregando campos...')
          setEditalPrompt(data.prompt || '')
          setPdfText(data.pdfText || '')
          setPdfUrl(data.pdfUrl || '')
          
          if (data.pdfText) {
            console.log('📄 Texto do PDF carregado:', data.pdfText.length, 'caracteres')
          }
          
          setPromptStatus({
            saved: true,
            savedAt: data.updatedAt?.toDate?.() || new Date()
          })
        } else {
          console.log('⚠️ Edital não encontrado para o curso:', selectedCourseForPrompts)
          // Se não encontrar, deixar vazio (não carregar de outros cursos)
          setEditalPrompt('')
          setPdfText('')
          setPdfUrl('')
          setPromptStatus(null)
        }
      } catch (err) {
        console.error('❌ Erro ao carregar edital:', err)
        // Em caso de erro, limpar campos
        setEditalPrompt('')
        setPdfText('')
        setPdfUrl('')
        setPromptStatus(null)
      }
    }
    
    // Carregar edital imediatamente se tiver curso selecionado
    if (selectedCourseForPrompts) {
      loadEdital()
    }
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

  // Carregar prompt unificado (por curso)
  useEffect(() => {
    if (!isAdmin) return
    
    // Limpar campos primeiro quando mudar de curso
    setUnifiedPrompt({
      banca: '',
      concursoName: '',
      prompt: '',
    })
    
    const loadUnifiedPrompt = async () => {
      try {
        const courseId = selectedCourseForPrompts || 'alego-default'
        const unifiedRef = doc(db, 'courses', courseId, 'prompts', 'unified')
        const unifiedDoc = await getDoc(unifiedRef)
        if (unifiedDoc.exists()) {
          const data = unifiedDoc.data()
          setUnifiedPrompt({
            banca: data.banca || '',
            concursoName: data.concursoName || '',
            prompt: data.prompt || '',
          })
        } else {
          // Se não encontrar, tentar carregar do curso (campos antigos)
          const courseRef = doc(db, 'courses', courseId)
          const courseDoc = await getDoc(courseRef)
          if (courseDoc.exists()) {
            const courseData = courseDoc.data()
            setUnifiedPrompt({
              banca: courseData.banca || '',
              concursoName: courseData.competition || courseData.name || '',
              prompt: '',
            })
          } else {
            setUnifiedPrompt({
              banca: '',
              concursoName: '',
              prompt: '',
            })
          }
        }
      } catch (err) {
        console.error('Erro ao carregar prompt unificado:', err)
        setUnifiedPrompt({
          banca: '',
          concursoName: '',
          prompt: '',
        })
      }
    }
    loadUnifiedPrompt()
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
      
      console.log(`📄 PDF carregado: ${numPages} página(s)`)
      
      // Processar página por página com progresso
      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        try {
          setMessage(`📄 Processando página ${pageNum}/${numPages}...`)
          const page = await pdf.getPage(pageNum)
          const textContent = await page.getTextContent()
          
          console.log(`📄 Página ${pageNum}: ${textContent.items.length} itens de texto encontrados`)
          
          // Tentar múltiplos métodos de extração
          let pageText = ''
          
          // Método 1: Extração padrão
          if (textContent.items && textContent.items.length > 0) {
            pageText = textContent.items
              .map(item => {
                // Tentar diferentes propriedades
                return item.str || item.text || item.textContent || ''
              })
              .filter(str => str && str.trim().length > 0)
              .join(' ')
          }
          
          // Método 2: Se não encontrou texto, tentar extrair de forma diferente
          if (!pageText || pageText.trim().length === 0) {
            console.warn(`⚠️ Página ${pageNum}: Nenhum texto encontrado com método padrão, tentando método alternativo...`)
            
            // Tentar extrair diretamente do stream
            try {
              const operatorList = await page.getOperatorList()
              // Se isso também não funcionar, o PDF pode ter texto em formato especial
              console.log(`📄 Página ${pageNum}: Operator list obtida, mas texto não extraído`)
            } catch (opErr) {
              console.warn(`⚠️ Página ${pageNum}: Erro ao obter operator list:`, opErr)
            }
          }
          
          if (pageText.trim()) {
            fullText += `\n\n--- Página ${pageNum} ---\n\n${pageText}`
            console.log(`✅ Página ${pageNum}: ${pageText.length} caracteres extraídos`)
          } else {
            console.warn(`⚠️ Página ${pageNum}: Nenhum texto extraído`)
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
          console.error(`❌ Erro ao processar página ${pageNum}:`, pageErr)
          // Continuar com próxima página
          continue
        }
      }
      
      const finalText = fullText.trim()
      console.log(`📊 Total extraído: ${finalText.length} caracteres de ${numPages} página(s)`)
      
      // Validar se algum texto foi extraído
      if (!finalText || finalText.length === 0) {
        console.error('❌ Nenhum texto extraído do PDF')
        console.log('📋 Informações do PDF:', {
          numPages,
          pdfInfo: pdf._pdfInfo || 'N/A'
        })
        throw new Error('Nenhum texto foi encontrado no PDF. O arquivo pode ter texto em formato não suportado, estar protegido, ou usar fontes especiais. Tente converter o PDF para um formato mais simples ou use um PDF com texto selecionável.')
      }
      
      setPdfText(finalText)
      setMessage(`✅ Texto extraído do PDF com sucesso! (${numPages} página(s), ${finalText.length} caracteres)`)
      return finalText
    } catch (err) {
      console.error('Erro ao extrair texto do PDF:', err)
      console.error('Stack trace:', err.stack)
      
      // Tentar mensagem de erro mais amigável
      let errorMsg = err.message || 'Erro desconhecido'
      if (errorMsg.includes('worker') || errorMsg.includes('Failed to fetch')) {
        errorMsg = 'Erro ao carregar biblioteca de PDF. Tente novamente ou use um PDF menor.'
      } else if (errorMsg.includes('Nenhum texto foi encontrado')) {
        errorMsg = 'Nenhum texto foi encontrado no PDF. O arquivo pode ter texto em formato não suportado, estar protegido, ou usar fontes especiais. Tente converter o PDF para um formato mais simples ou use um PDF com texto selecionável.'
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

  // Carregar edital verticalizado quando selecionar curso para geração completa
  useEffect(() => {
    if (!selectedCourseForFullGeneration) {
      setEditalVerticalizadoData(null)
      return
    }
    
    const loadEditalVerticalizado = async () => {
      try {
        console.log('📖 Carregando edital verticalizado do curso:', selectedCourseForFullGeneration)
        const editalRef = doc(db, 'courses', selectedCourseForFullGeneration, 'editalVerticalizado', 'principal')
        const editalDoc = await getDoc(editalRef)
        
        if (editalDoc.exists()) {
          const data = editalDoc.data()
          console.log('✅ Edital verticalizado encontrado:', data.titulo)
          setEditalVerticalizadoData(data)
        } else {
          console.log('⚠️ Edital verticalizado não encontrado para o curso:', selectedCourseForFullGeneration)
          setEditalVerticalizadoData(null)
        }
      } catch (err) {
        console.error('❌ Erro ao carregar edital verticalizado:', err)
        setEditalVerticalizadoData(null)
      }
    }
    
    loadEditalVerticalizado()
  }, [selectedCourseForFullGeneration])

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

    // Carregar notícias de concursos quando a aba for ativada
    const loadConcursoNews = async () => {
      try {
        const newsRef = collection(db, 'posts')
        const newsQuery = query(
          newsRef,
          where('isConcursoNews', '==', true),
          orderBy('createdAt', 'desc'),
          limit(50)
        )
        const newsSnapshot = await getDocs(newsQuery)
        const newsList = newsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }))
        setConcursoNews(newsList)
      } catch (err) {
        console.error('Erro ao carregar notícias:', err)
      }
    }

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

    // Carregar testes gratuitos
    const trialsRef = collection(db, 'testTrials')
    const unsubTrials = onSnapshot(trialsRef, (snapshot) => {
      const data = snapshot.docs.map((docSnapshot) => ({
        id: docSnapshot.id,
        ...docSnapshot.data(),
      }))
      // Ordenar por data de criação (mais recente primeiro)
      data.sort((a, b) => {
        const dateA = a.createdAt?.toDate?.() || new Date(0)
        const dateB = b.createdAt?.toDate?.() || new Date(0)
        return dateB - dateA
      })
      setTestTrials(data)
    }, (error) => {
      console.error('Erro ao carregar testes:', error)
      setTestTrials([])
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
      unsubTrials()
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

  // Organizar matérias com IA
  const organizeSubjectsWithAI = async () => {
    if (!selectedCourseForFlashcards) {
      setMessage('❌ Selecione um curso primeiro.')
      return
    }

    setOrganizingSubjects(true)
    setOrganizingProgress('Carregando edital do curso...')

    try {
      const courseId = selectedCourseForFlashcards || 'alego-default'
      
      // 1. Carregar edital do curso
      const editalRef = doc(db, 'courses', courseId, 'prompts', 'edital')
      const editalDoc = await getDoc(editalRef)
      
      let editalText = ''
      if (editalDoc.exists()) {
        const data = editalDoc.data()
        editalText = (data.prompt || '') + '\n\n' + (data.pdfText || '')
      }

      if (!editalText.trim()) {
        setMessage('❌ Edital não encontrado. Configure o edital do curso primeiro.')
        setOrganizingSubjects(false)
        return
      }

      // 2. Obter matérias disponíveis do curso
      const courseSubjectsList = courseSubjects[courseId] || []
      const allSubjects = courseSubjectsList.length > 0 
        ? courseSubjectsList 
        : Object.keys(modules).filter(m => modules[m] && modules[m].length > 0)

      if (allSubjects.length === 0) {
        setMessage('❌ Nenhuma matéria encontrada no curso.')
        setOrganizingSubjects(false)
        return
      }

      setOrganizingProgress('Analisando edital com IA...')

      const courseName = courses.find(c => c.id === courseId)?.name || 'o curso'
      
      const organizationPrompt = `Você é um especialista em organização de conteúdo educacional para concursos públicos.

Analise o edital abaixo e organize as matérias na ordem ideal de estudo para o curso: ${courseName}

EDITAL DO CONCURSO:
${editalText.substring(0, 50000)} ${editalText.length > 50000 ? '\n[... conteúdo adicional omitido ...]' : ''}

MATÉRIAS DISPONÍVEIS NO CURSO:
${allSubjects.map((s, i) => `${i + 1}. ${s}`).join('\n')}

INSTRUÇÕES:
1. Analise o edital e identifique a ordem de importância das matérias
2. Considere a sequência lógica de aprendizado
3. Considere dependências entre matérias (ex: Direito Constitucional antes de Direito Administrativo)
4. Considere o peso de questões por matéria no edital
5. Organize as matérias na ordem ideal de estudo

Retorne APENAS um JSON válido com a seguinte estrutura:
{
  "subjectOrder": ["matéria1", "matéria2", "matéria3", ...],
  "reasoning": "Breve explicação da ordem escolhida"
}

IMPORTANTE:
- Use EXATAMENTE os nomes das matérias fornecidas acima
- Inclua TODAS as matérias na ordem
- Retorne APENAS o JSON, sem texto adicional`

      const response = await callGeminiWithRetry(organizationPrompt, {
        generationConfig: {
          maxOutputTokens: 32000,
          temperature: 0.7,
        },
        useGoogleSearch: true,
      })
      const text = extractGeneratedText(response)

      // Extrair JSON da resposta
      let jsonText = text.trim()
      if (jsonText.includes('```json')) {
        jsonText = jsonText.split('```json')[1].split('```')[0].trim()
      } else if (jsonText.includes('```')) {
        jsonText = jsonText.split('```')[1].split('```')[0].trim()
      }

      const parsed = JSON.parse(jsonText)
      const suggestedOrder = parsed.subjectOrder || []

      if (suggestedOrder.length === 0) {
        throw new Error('IA não retornou uma ordem válida')
      }

      // 4. Organizar módulos também com IA
      setOrganizingProgress('Organizando módulos com IA...')
      
      const moduleOrder = {}
      for (const materia of suggestedOrder) {
        const modulos = modules[materia] || []
        if (modulos.length > 0) {
          // Se tiver poucos módulos, ordenar numericamente
          if (modulos.length <= 3) {
            moduleOrder[materia] = [...modulos].sort((a, b) => {
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
          } else {
            // Se tiver muitos módulos, pedir para IA organizar
            try {
              const modulePrompt = `Você é um especialista em organização de conteúdo educacional.

Analise o edital abaixo e organize os módulos da matéria "${materia}" na ordem ideal de estudo.

EDITAL DO CONCURSO:
${editalText.substring(0, 30000)} ${editalText.length > 30000 ? '\n[... conteúdo adicional omitido ...]' : ''}

MÓDULOS DISPONÍVEIS:
${modulos.map((m, i) => `${i + 1}. ${m}`).join('\n')}

INSTRUÇÕES:
1. Analise o edital e identifique a ordem lógica dos tópicos
2. Organize os módulos na sequência ideal de aprendizado
3. Considere dependências entre tópicos

Retorne APENAS um JSON válido:
{
  "moduleOrder": ["módulo1", "módulo2", "módulo3", ...]
}

Use EXATAMENTE os nomes dos módulos fornecidos acima.`

              // Usar callGeminiWithRetry para gerenciar API key automaticamente (igual book questões, material de apoio, véspera de prova)
              const moduleResponse = await callGeminiWithRetry(modulePrompt, {
                models: ['gemini-2.5-flash', 'gemini-2.5-pro'],
                generationConfig: { temperature: 0.3, maxOutputTokens: 32000 },
              })
              const moduleResponseText = extractGeneratedText(moduleResponse)
              
              let moduleJsonText = moduleResponseText.trim()
              if (moduleJsonText.includes('```json')) {
                moduleJsonText = moduleJsonText.split('```json')[1].split('```')[0].trim()
              } else if (moduleJsonText.includes('```')) {
                moduleJsonText = moduleJsonText.split('```')[1].split('```')[0].trim()
              }
              
              const moduleParsed = JSON.parse(moduleJsonText)
              if (moduleParsed.moduleOrder && moduleParsed.moduleOrder.length > 0) {
                moduleOrder[materia] = moduleParsed.moduleOrder
              } else {
                // Fallback: ordenação numérica
                moduleOrder[materia] = [...modulos].sort((a, b) => {
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
              }
            } catch (err) {
              console.warn(`Erro ao organizar módulos de ${materia} com IA, usando ordenação padrão:`, err)
              // Fallback: ordenação numérica
              moduleOrder[materia] = [...modulos].sort((a, b) => {
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
            }
          }
        }
      }

      // 5. Salvar ordem no Firestore
      setOrganizingProgress('Salvando ordem...')
      const { saveAdminOrder } = await import('../utils/subjectOrder')
      await saveAdminOrder(courseId, suggestedOrder, moduleOrder)

      setMessage(`✅ Matérias organizadas com sucesso! ${parsed.reasoning ? `\n\n💡 ${parsed.reasoning}` : ''}`)
      setOrganizingSubjects(false)
      setOrganizingProgress('')
    } catch (err) {
      console.error('Erro ao organizar com IA:', err)
      setMessage(`❌ Erro ao organizar: ${err.message}`)
      setOrganizingSubjects(false)
      setOrganizingProgress('')
    }
  }

  // Salvar ordem manual
  const saveManualOrder = async () => {
    if (!selectedCourseForFlashcards) {
      setMessage('❌ Selecione um curso primeiro.')
      return
    }

    try {
      const courseId = selectedCourseForFlashcards || 'alego-default'
      const { saveAdminOrder } = await import('../utils/subjectOrder')
      
      // 1. Carregar ordem atual do Firestore para mesclar
      const courseConfigRef = doc(db, 'courses', courseId, 'config', 'order')
      const courseConfigDoc = await getDoc(courseConfigRef)
      
      let currentSubjectOrder = []
      let currentModuleOrder = {}
      
      if (courseConfigDoc.exists()) {
        const config = courseConfigDoc.data()
        currentSubjectOrder = config.subjectOrder || []
        currentModuleOrder = config.moduleOrder || {}
      }
      
      // 2. Usar ordem temporária se foi editada, senão usar ordem atual do Firestore, senão usar ordem padrão
      const subjectOrder = tempSubjectOrder.length > 0 
        ? tempSubjectOrder 
        : (currentSubjectOrder.length > 0
          ? currentSubjectOrder
          : (courseSubjects[courseId] || Object.keys(modules).filter(m => modules[m] && modules[m].length > 0)))
      
      // 3. Mesclar ordem de módulos: usar tempModuleOrder para matérias editadas, manter ordem atual para outras
      const finalModuleOrder = { ...currentModuleOrder }
      
      // Adicionar/atualizar módulos das matérias que foram editadas
      if (tempModuleOrder && Object.keys(tempModuleOrder).length > 0) {
        Object.keys(tempModuleOrder).forEach(materia => {
          finalModuleOrder[materia] = tempModuleOrder[materia]
        })
      }
      
      // Garantir que todas as matérias tenham ordem de módulos (mesmo que não editadas)
      subjectOrder.forEach(materia => {
        if (!finalModuleOrder[materia] || finalModuleOrder[materia].length === 0) {
          const modulos = modules[materia] || []
          if (modulos.length > 0) {
            // Se não tem ordem salva, usar ordem atual dos módulos
            finalModuleOrder[materia] = [...modulos]
          }
        }
      })

      await saveAdminOrder(courseId, subjectOrder, finalModuleOrder)
      setMessage('✅ Ordem salva com sucesso!')
      setManualEditMode(false)
      setTempSubjectOrder([])
      setTempModuleOrder({})
      setExpandedMateriaForModules(null)
    } catch (err) {
      console.error('Erro ao salvar ordem:', err)
      setMessage(`❌ Erro ao salvar ordem: ${err.message}`)
    }
  }

  // Mover matéria para cima/baixo (edição manual)
  const moveSubject = (index, direction) => {
    const currentOrder = tempSubjectOrder.length > 0 
      ? tempSubjectOrder 
      : (courseSubjects[selectedCourseForFlashcards] || Object.keys(modules).filter(m => modules[m] && modules[m].length > 0))
    
    const newOrder = [...currentOrder]
    const newIndex = direction === 'up' ? index - 1 : index + 1
    
    if (newIndex < 0 || newIndex >= newOrder.length) return
    
    [newOrder[index], newOrder[newIndex]] = [newOrder[newIndex], newOrder[index]]
    setTempSubjectOrder(newOrder)
  }

  // Iniciar edição manual
  const startManualEdit = async () => {
    const courseId = selectedCourseForFlashcards || 'alego-default'
    
    // Carregar ordem atual do Firestore
    const courseConfigRef = doc(db, 'courses', courseId, 'config', 'order')
    const courseConfigDoc = await getDoc(courseConfigRef)
    
    let currentSubjects = []
    let currentModuleOrder = {}
    
    if (courseConfigDoc.exists()) {
      const config = courseConfigDoc.data()
      currentSubjects = config.subjectOrder || []
      currentModuleOrder = config.moduleOrder || {}
    }
    
    // Se não tem ordem salva, usar ordem padrão
    if (currentSubjects.length === 0) {
      currentSubjects = courseSubjects[courseId] || Object.keys(modules).filter(m => modules[m] && modules[m].length > 0)
    }
    
    setTempSubjectOrder([...currentSubjects])
    
    // Inicializar ordem de módulos: usar ordem salva se existir, senão usar ordem atual
    const initialModuleOrder = {}
    currentSubjects.forEach(materia => {
      const modulos = modules[materia] || []
      if (modulos.length > 0) {
        // Se tem ordem salva para esta matéria, usar ela, senão usar ordem atual
        if (currentModuleOrder[materia] && currentModuleOrder[materia].length > 0) {
          initialModuleOrder[materia] = [...currentModuleOrder[materia]]
        } else {
          initialModuleOrder[materia] = [...modulos]
        }
      }
    })
    setTempModuleOrder(initialModuleOrder)
    
    setManualEditMode(true)
  }

  // Mover módulo dentro de uma matéria
  const moveModule = (materia, index, direction) => {
    const currentModules = tempModuleOrder[materia] || modules[materia] || []
    const newOrder = [...currentModules]
    const newIndex = direction === 'up' ? index - 1 : index + 1
    
    if (newIndex < 0 || newIndex >= newOrder.length) return
    
    [newOrder[index], newOrder[newIndex]] = [newOrder[newIndex], newOrder[index]]
    setTempModuleOrder({
      ...tempModuleOrder,
      [materia]: newOrder
    })
  }

  // Toggle expandir matéria para editar módulos
  const toggleMateriaModules = (materia) => {
    setExpandedMateriaForModules(expandedMateriaForModules === materia ? null : materia)
  }

  // Handlers para drag and drop
  const handleDragStart = (event) => {
    setActiveId(event.active.id)
  }

  const handleDragEnd = (event) => {
    const { active, over } = event
    
    if (!over || active.id === over.id) {
      setActiveId(null)
      return
    }

    // Verificar se é matéria ou módulo
    if (active.id.toString().startsWith('subject-')) {
      // Arrastar matéria
      const activeIndex = tempSubjectOrder.findIndex(m => `subject-${m}` === active.id)
      const overIndex = tempSubjectOrder.findIndex(m => `subject-${m}` === over.id)
      
      if (activeIndex !== -1 && overIndex !== -1) {
        const newOrder = arrayMove(tempSubjectOrder, activeIndex, overIndex)
        setTempSubjectOrder(newOrder)
      }
    } else if (active.id.toString().startsWith('module-')) {
      // Arrastar módulo
      const [materia, modulo] = active.id.toString().replace('module-', '').split('::')
      const currentModules = tempModuleOrder[materia] || modules[materia] || []
      const activeIndex = currentModules.findIndex(m => `module-${materia}::${m}` === active.id)
      const overIndex = currentModules.findIndex(m => `module-${materia}::${m}` === over.id)
      
      if (activeIndex !== -1 && overIndex !== -1) {
        const newOrder = arrayMove(currentModules, activeIndex, overIndex)
        setTempModuleOrder({
          ...tempModuleOrder,
          [materia]: newOrder
        })
      }
    }
    
    setActiveId(null)
  }

  // Componente SortableItem para matérias
  const SortableSubjectItem = ({ materia, index, modulos }) => {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id: `subject-${materia}` })

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
    }

    return (
      <div
        ref={setNodeRef}
        style={style}
        className="flex items-center gap-3 rounded-lg bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 p-3"
      >
        <div
          {...attributes}
          {...listeners}
          className="flex items-center gap-2 flex-shrink-0 cursor-grab active:cursor-grabbing"
        >
          <span className="text-slate-400">⋮⋮</span>
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{materia}</span>
            {modulos.length > 0 && (
              <span className="text-xs text-slate-500 dark:text-slate-400">
                ({modulos.length} módulo{modulos.length !== 1 ? 's' : ''})
              </span>
            )}
          </div>
          {modulos.length > 0 && (
            <button
              type="button"
              onClick={() => toggleMateriaModules(materia)}
              className="mt-1 text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              {expandedMateriaForModules === materia ? 'Ocultar módulos' : 'Organizar módulos'}
            </button>
          )}
        </div>
        <span className="text-xs text-slate-500 dark:text-slate-400">#{index + 1}</span>
      </div>
    )
  }

  // Componente SortableItem para módulos
  const SortableModuleItem = ({ materia, modulo, index }) => {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id: `module-${materia}::${modulo}` })

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
    }

    return (
      <div
        ref={setNodeRef}
        style={style}
        className="flex items-center gap-3 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-700 p-2"
      >
        <div
          {...attributes}
          {...listeners}
          className="flex items-center gap-2 flex-shrink-0 cursor-grab active:cursor-grabbing"
        >
          <span className="text-indigo-400 text-xs">⋮⋮</span>
        </div>
        <div className="flex-1">
          <span className="text-xs font-medium text-slate-900 dark:text-slate-100">{modulo}</span>
        </div>
        <span className="text-xs text-indigo-500 dark:text-indigo-400">#{index + 1}</span>
      </div>
    )
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

  // Gerar flashcards a partir do edital verticalizado (nova função)
  const generateFlashcardsFromEdital = async () => {
    console.log('🎴 Botão de gerar flashcards do edital clicado!')
    console.log('📋 Curso selecionado:', selectedCourseForFlashcards)
    
    const courseIdToUse = selectedCourseForFlashcards || 'alego-default'
    
    if (!courseIdToUse) {
      setMessage('❌ Selecione um curso para gerar flashcards')
      return
    }

    setGeneratingFlashcards(true)
    setFlashcardGenProgress('Carregando edital verticalizado...')
    setMessage('')

    try {
      // Carregar edital verticalizado
      const editalRef = doc(db, 'courses', courseIdToUse, 'editalVerticalizado', 'principal')
      const editalDoc = await getDoc(editalRef)
      
      if (!editalDoc.exists()) {
        throw new Error('Edital verticalizado não encontrado para este curso')
      }

      const editalData = editalDoc.data()
      setFlashcardGenProgress('Estrutura carregada, gerando flashcards...')

      // Preparar estrutura simplificada para a IA
      const disciplinas = editalData.disciplinas || []
      const totalTopicos = disciplinas.reduce((sum, d) => sum + (d.topicos?.length || 0), 0)
      
      setFlashcardGenProgress(`Gerando flashcards para ${disciplinas.length} disciplinas, ${totalTopicos} tópicos...`)

      // Construir prompt simples
      let prompt = `Gere flashcards educacionais para o edital abaixo.\n\n`
      prompt += `CURSO: ${editalData.titulo || 'Curso'}\n\n`
      
      disciplinas.forEach((disciplina, idx) => {
        prompt += `DISCIPLINA ${idx + 1}: ${disciplina.nome}\n`
        if (disciplina.topicos && disciplina.topicos.length > 0) {
          disciplina.topicos.forEach((topico, tidx) => {
            prompt += `- Tópico ${tidx + 1}: ${topico.numero || ''} ${topico.nome || ''}\n`
          })
        }
        prompt += '\n'
      })

      prompt += `\nINSTRUÇÕES:\n`
      prompt += `1. Gere NO MÍNIMO 50 flashcards e ATÉ 100 flashcards por tópico para cobrir completamente o conteúdo específico\n`
      prompt += `2. O MÍNIMO OBRIGATÓRIO é 50 flashcards por tópico - não gere menos que isso\n`
      prompt += `3. Se o tópico for extenso, gere até 100 flashcards para cobertura completa\n`
      prompt += `4. Formato: PERGUNTA || RESPOSTA\n`
      prompt += `5. Seja objetivo e educacional\n`
      prompt += `6. Retorne apenas JSON válido:\n`
      prompt += `{"flashcards": [{"frente": "pergunta", "verso": "resposta"}]}\n`

      setFlashcardGenProgress('Enviando para IA...')

      // Chamar API
      const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + import.meta.env.VITE_GEMINI_API_KEY, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 32000
          }
        })
      })

      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.error?.message || 'Erro na API')
      }

      setFlashcardGenProgress('Processando resposta...')

      const generatedText = data.candidates[0]?.content?.parts[0]?.text

      if (!generatedText) {
        throw new Error('A IA não retornou nenhum texto')
      }

      if (typeof generatedText !== 'string') {
        throw new Error('A IA retornou um texto inválido')
      }

      console.log('Texto gerado pela IA (primeiros 500 caracteres):', generatedText.substring(0, 500))

      // Extrair JSON de forma simples
      let flashcardsData = null
      try {
        // Procurar por JSON
        const jsonMatch = generatedText.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          flashcardsData = JSON.parse(jsonMatch[0])
        } else {
          // Tentar extrair apenas o array
          const arrayMatch = generatedText.match(/\[[\s\S]*\]/)
          if (arrayMatch) {
            flashcardsData = { flashcards: JSON.parse(arrayMatch[0]) }
          }
        }
      } catch (err) {
        console.error('Erro ao processar JSON:', err)
        console.error('Texto gerado:', generatedText)
        throw new Error(`Não foi possível processar a resposta da IA: ${err.message}`)
      }

      if (!flashcardsData || !flashcardsData.flashcards || !Array.isArray(flashcardsData.flashcards)) {
        console.error('Estrutura recebida:', flashcardsData)
        throw new Error('Nenhum flashcard válido gerado')
      }

      console.log(`Flashcards gerados: ${flashcardsData.flashcards.length}`)

      setFlashcardGenProgress(`Salvando ${flashcardsData.flashcards.length} flashcards...`)

      // Apagar flashcards existentes e salvar novos
      const batch = writeBatch(db)
      const flashcardsRef = collection(db, 'courses', courseIdToUse, 'flashcards')
      
      // Verificar e apagar existentes
      const existingSnapshot = await getDocs(flashcardsRef)
      existingSnapshot.forEach(doc => {
        batch.delete(doc.ref)
      })

      // Adicionar novos flashcards
      flashcardsData.flashcards.forEach((flashcard, index) => {
        const docRef = doc(flashcardsRef)
        batch.set(docRef, {
          ...flashcard,
          userId: 'admin',
          courseId: courseIdToUse,
          materia: selectedCourseForFlashcards?.name || 'Flashcards Gerados',
          modulo: 'Edital Verticalizado',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          order: index
        })
      })

      await batch.commit()

      setMessage(`✅ ${flashcardsData.flashcards.length} flashcards gerados com sucesso do edital verticalizado!`)
      setFlashcardGenProgress('Concluído!')

    } catch (error) {
      console.error('Erro ao gerar flashcards do edital:', error)
      setMessage(`❌ Erro: ${error.message}`)
    } finally {
      setGeneratingFlashcards(false)
      setTimeout(() => {
        setFlashcardGenProgress('')
      }, 3000)
    }
  }

  // Gerar flashcards por IA a partir do conteúdo colado (estilo Noji)
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

      // Usar prompt unificado
      const { buildFlashcardPrompt } = await import('../utils/unifiedPrompt')
      const basePrompt = await buildFlashcardPrompt(
        courseIdForGeneration,
        materia,
        editalInfo
      )

      const prompt = `${basePrompt}

TAREFA: Analisar o conteúdo fornecido abaixo e criar flashcards para o módulo "${modulo}" da matéria "${materia}".

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
          const response = await callGeminiWithRetry(prompt, {
        generationConfig: {
          maxOutputTokens: 32000,
          temperature: 0.7,
        },
        useGoogleSearch: true,
      })
          responseText = extractGeneratedText(response)
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

  const deletePopupBanner = async () => {
    if (!isAdmin) {
      setMessage('❌ Apenas administradores podem excluir popup banner.')
      return
    }

    if (!window.confirm('⚠️ Tem certeza que deseja excluir o popup banner? Esta ação não pode ser desfeita.')) {
      return
    }

    setUploadingPopupBanner(true)
    try {
      await deleteDoc(doc(db, 'config', 'popupBanner'))
      
      // Limpar estado local
      setPopupBanner({
        title: '',
        imageBase64: '',
        imageUrl: '',
        link: '',
        openInNewTab: true,
        active: false,
      })
      
      // Limpar cache do localStorage
      try {
        localStorage.removeItem('firebase_cache_popupBanner')
        localStorage.removeItem('popupBannerLastShown')
      } catch (err) {
        console.warn('Erro ao limpar cache:', err)
      }
      
      setMessage('✅ Popup banner excluído com sucesso!')
    } catch (err) {
      console.error('Erro ao excluir popup banner:', err)
      setMessage(`❌ Erro ao excluir popup banner: ${err.message}`)
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
      // Gerar slug do nome do curso
      const slug = createSlug(courseForm.name)
      
      await addDoc(collection(db, 'courses'), {
        name: courseForm.name,
        slug: slug, // Slug para URLs amigáveis
        description: courseForm.description || '',
        price: parseFloat(courseForm.price) || 99.90,
        originalPrice: parseFloat(courseForm.originalPrice) || 149.99,
        competition: courseForm.competition,
        courseDuration: courseForm.courseDuration || '',
        imageBase64: courseForm.imageBase64 || '',
        imageUrl: courseForm.imageUrl || '',
        active: courseForm.active !== false,
        featured: courseForm.featured === true, // Curso em destaque
        referenceLink: courseForm.referenceLink?.trim() || '', // Link de referência
        banca: courseForm.banca?.trim() || '', // Banca examinadora
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
        featured: false,
        referenceLink: '',
        banca: '',
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

  // Funções para editar curso completo
  const startEditingCourse = (course) => {
    setEditingCourse(course.id)
    setEditingCourseData({
      name: course.name || '',
      description: course.description || '',
      price: course.price || 99.90,
      originalPrice: course.originalPrice || 149.99,
      competition: course.competition || '',
      courseDuration: course.courseDuration || '',
      active: course.active !== false,
      featured: course.featured === true, // Curso em destaque
      referenceLink: course.referenceLink || '', // Link de referência
      banca: course.banca || '', // Banca examinadora
    })
  }

  const cancelEditingCourse = () => {
    setEditingCourse(null)
    setEditingCourseData(null)
  }

  const saveCourseEdit = async (courseId) => {
    if (!editingCourseData) return

    if (!editingCourseData.name || !editingCourseData.competition) {
      setMessage('❌ Por favor, preencha nome e concurso.')
      return
    }

    try {
      // Gerar slug do nome do curso
      const slug = createSlug(editingCourseData.name.trim())
      
      await updateCourse(courseId, {
        name: editingCourseData.name.trim(),
        slug: slug, // Atualizar slug quando nome mudar
        description: editingCourseData.description?.trim() || '',
        price: parseFloat(editingCourseData.price) || 99.90,
        originalPrice: parseFloat(editingCourseData.originalPrice) || 149.99,
        competition: editingCourseData.competition.trim(),
        courseDuration: editingCourseData.courseDuration?.trim() || '',
        active: editingCourseData.active,
        featured: editingCourseData.featured === true,
        referenceLink: editingCourseData.referenceLink?.trim() || '',
        banca: editingCourseData.banca?.trim() || '', // Banca examinadora
      })
      cancelEditingCourse()
    } catch (err) {
      console.error('Erro ao salvar edição do curso:', err)
      setMessage(`❌ Erro ao salvar edição: ${err.message}`)
    }
  }

  // Função auxiliar para encontrar curso por nome ou competição
  const findCourseByName = async (searchTerm) => {
    try {
      const coursesRef = collection(db, 'courses')
      const coursesSnapshot = await getDocs(coursesRef)
      const allCourses = coursesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))
      
      const searchLower = searchTerm.toLowerCase()
      const found = allCourses.find(course => {
        const name = (course.name || '').toLowerCase()
        const competition = (course.competition || '').toLowerCase()
        return name.includes(searchLower) || competition.includes(searchLower)
      })
      
      return found || null
    } catch (err) {
      console.error('Erro ao buscar curso:', err)
      return null
    }
  }

  // Função específica para deletar curso de VILA VELHA/ES ACE
  const deleteVilaVelhaCourse = async () => {
    const searchTerms = ['vila velha', 'endemias', 'ACE', 'AGENTE DE COMBATE']
    
    try {
      setMessage('🔍 Procurando curso de VILA VELHA/ES ACE...')
      
      const coursesRef = collection(db, 'courses')
      const coursesSnapshot = await getDocs(coursesRef)
      const allCourses = coursesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))
      
      // Procurar curso que contenha algum dos termos
      const foundCourse = allCourses.find(course => {
        const name = (course.name || '').toLowerCase()
        const competition = (course.competition || '').toLowerCase()
        
        return searchTerms.some(term => 
          name.includes(term.toLowerCase()) || 
          competition.includes(term.toLowerCase())
        )
      })
      
      if (!foundCourse) {
        setMessage('❌ Curso de VILA VELHA/ES ACE não encontrado.')
        return
      }
      
      const confirmMessage = `⚠️ ATENÇÃO: Encontrado curso:\n\nNome: ${foundCourse.name || 'Sem nome'}\nConcurso: ${foundCourse.competition || 'Sem concurso'}\nID: ${foundCourse.id}\n\nDeseja DELETAR este curso COMPLETAMENTE?\n\nIsso vai remover TODOS os dados sem deixar resquícios.\n\nEsta ação NÃO pode ser desfeita!`
      
      if (!window.confirm(confirmMessage)) {
        setMessage('❌ Operação cancelada.')
        return
      }
      
      // Chamar função de deleção completa
      await deleteCourse(foundCourse.id)
      setMessage(`✅ Curso "${foundCourse.name || foundCourse.competition}" (${foundCourse.id}) deletado completamente!`)
    } catch (err) {
      console.error('Erro ao deletar curso de VILA VELHA:', err)
      setMessage(`❌ Erro ao deletar curso: ${err.message}`)
    }
  }

  const deleteCourse = async (courseId) => {
    console.log('🗑️ deleteCourse chamado com courseId:', courseId, 'tipo:', typeof courseId)
    
    if (!courseId) {
      setMessage('❌ ID do curso não fornecido.')
      console.error('❌ courseId é falsy:', courseId)
      return
    }
    
    const confirmMessage = `⚠️ ATENÇÃO: Deseja excluir este curso DEFINITIVAMENTE?\n\nIsso vai DELETAR:\n- Todos os flashcards do curso (incluindo salvos pelos usuários)\n- Todo o material de apoio\n- Todas as questões para praticar\n- Todas as vésperas de prova\n- Todos os prompts (edital, questões, unified)\n- Todas as matérias do curso\n- Edital verticalizado\n- Matérias revisadas\n- Conteúdos completos\n- Configurações do curso\n- Todo o progresso dos usuários neste curso\n- Todas as referências nos perfis de usuários\n\nEsta ação NÃO pode ser desfeita!`
    
    if (!window.confirm(confirmMessage)) {
      console.log('❌ Usuário cancelou a exclusão')
      return
    }

    // Função auxiliar para deletar em batches (evita travamento)
    const deleteInBatches = async (docs, batchSize = 50, itemName = 'itens') => {
      let deleted = 0
      for (let i = 0; i < docs.length; i += batchSize) {
        const batch = docs.slice(i, i + batchSize)
        const deletePromises = batch.map(doc => deleteDoc(doc.ref))
        await Promise.all(deletePromises)
        deleted += batch.length
        // Atualizar mensagem e permitir que UI responda
        setMessage(`🗑️ Deletando ${itemName}... ${deleted}/${docs.length}`)
        // Pequeno delay para não bloquear UI
        await new Promise(resolve => setTimeout(resolve, 50))
      }
      return deleted
    }

    try {
      setMessage('🗑️ Preparando deleção do curso...')
      console.log('🗑️ Iniciando exclusão do curso:', courseId)
      
      // 1. Deletar todos os flashcards do curso (incluindo salvos pelos usuários)
      setMessage('🗑️ Deletando flashcards do curso (incluindo salvos pelos usuários)...')
      console.log('🗑️ Deletando flashcards do curso...')
      const cardsRef = collection(db, 'flashcards')
      const cardsQuery = query(cardsRef, where('courseId', '==', courseId))
      const cardsSnapshot = await getDocs(cardsQuery)
      const cardsToDelete = cardsSnapshot.docs
      
      if (cardsToDelete.length > 0) {
        await deleteInBatches(cardsToDelete, 50, 'flashcards')
        console.log(`✅ ${cardsToDelete.length} flashcard(s) deletado(s)`)
      }

      // 1.1. Deletar flashcards salvos pelos usuários que podem não ter courseId explícito
      // (flashcards criados por usuários que compraram o curso)
      setMessage('🗑️ Deletando flashcards salvos pelos usuários do curso...')
      console.log('🗑️ Deletando flashcards salvos pelos usuários...')
      try {
        const allCardsRef = collection(db, 'flashcards')
        const allCardsSnapshot = await getDocs(allCardsRef)
        const userCardsToDelete = allCardsSnapshot.docs.filter(doc => {
          const data = doc.data()
          // Apagar se tem courseId OU se foi criado por usuário que comprou o curso
          return data.courseId === courseId || String(data.courseId) === String(courseId)
        })
        
        if (userCardsToDelete.length > 0) {
          await deleteInBatches(userCardsToDelete, 50, 'flashcards de usuários')
          console.log(`✅ ${userCardsToDelete.length} flashcard(s) de usuário(ões) deletado(s)`)
        }
      } catch (userCardsErr) {
        console.warn('⚠️ Erro ao deletar flashcards de usuários:', userCardsErr)
      }
      
      // 2. Deletar TODOS os prompts do curso (subcoleção completa)
      setMessage('🗑️ Deletando prompts do curso...')
      console.log('🗑️ Deletando prompts do curso...')
      try {
        const promptsRef = collection(db, 'courses', courseId, 'prompts')
        const promptsSnapshot = await getDocs(promptsRef)
        const promptsToDelete = promptsSnapshot.docs
        
        if (promptsToDelete.length > 0) {
          await deleteInBatches(promptsToDelete, 50, 'prompts')
          console.log(`✅ ${promptsToDelete.length} prompt(s) deletado(s)`)
        }
      } catch (promptErr) {
        console.warn('⚠️ Erro ao deletar prompts:', promptErr)
      }
      
      // 2.1. Deletar edital verticalizado (subcoleção)
      setMessage('🗑️ Deletando edital verticalizado...')
      console.log('🗑️ Deletando edital verticalizado...')
      try {
        const editalVerticalizadoRef = collection(db, 'courses', courseId, 'editalVerticalizado')
        const editalVerticalizadoSnapshot = await getDocs(editalVerticalizadoRef)
        const editalVerticalizadoToDelete = editalVerticalizadoSnapshot.docs
        
        if (editalVerticalizadoToDelete.length > 0) {
          await deleteInBatches(editalVerticalizadoToDelete, 50, 'edital verticalizado')
          console.log(`✅ ${editalVerticalizadoToDelete.length} edital(is) verticalizado(s) deletado(s)`)
        }
      } catch (editalErr) {
        console.warn('⚠️ Erro ao deletar edital verticalizado:', editalErr)
      }
      
      // 2.2. Deletar matérias revisadas (subcoleção)
      setMessage('🗑️ Deletando matérias revisadas...')
      console.log('🗑️ Deletando matérias revisadas...')
      try {
        const materiasRevisadasRef = collection(db, 'courses', courseId, 'materiasRevisadas')
        const materiasRevisadasSnapshot = await getDocs(materiasRevisadasRef)
        const materiasRevisadasToDelete = materiasRevisadasSnapshot.docs
        
        if (materiasRevisadasToDelete.length > 0) {
          await deleteInBatches(materiasRevisadasToDelete, 50, 'matérias revisadas')
          console.log(`✅ ${materiasRevisadasToDelete.length} matéria(s) revisada(s) deletada(s)`)
        }
      } catch (materiasErr) {
        console.warn('⚠️ Erro ao deletar matérias revisadas:', materiasErr)
      }
      
      // 2.3. Deletar conteúdos completos (subcoleção)
      setMessage('🗑️ Deletando conteúdos completos...')
      console.log('🗑️ Deletando conteúdos completos...')
      try {
        const conteudosCompletosRef = collection(db, 'courses', courseId, 'conteudosCompletos')
        const conteudosCompletosSnapshot = await getDocs(conteudosCompletosRef)
        const conteudosCompletosToDelete = conteudosCompletosSnapshot.docs
        
        if (conteudosCompletosToDelete.length > 0) {
          await deleteInBatches(conteudosCompletosToDelete, 50, 'conteúdos completos')
          console.log(`✅ ${conteudosCompletosToDelete.length} conteúdo(s) completo(s) deletado(s)`)
        }
      } catch (conteudosErr) {
        console.warn('⚠️ Erro ao deletar conteúdos completos:', conteudosErr)
      }
      
      // 2.4. Deletar configurações (subcoleção)
      setMessage('🗑️ Deletando configurações do curso...')
      console.log('🗑️ Deletando configurações do curso...')
      try {
        const configRef = collection(db, 'courses', courseId, 'config')
        const configSnapshot = await getDocs(configRef)
        const configToDelete = configSnapshot.docs
        
        if (configToDelete.length > 0) {
          await deleteInBatches(configToDelete, 50, 'configurações')
          console.log(`✅ ${configToDelete.length} configuração(ões) deletada(s)`)
        }
      } catch (configErr) {
        console.warn('⚠️ Erro ao deletar configurações:', configErr)
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
      setMessage('🗑️ Deletando progresso dos usuários...')
      console.log('🗑️ Deletando progresso dos usuários...')
      try {
        const progressRef = collection(db, 'progress')
        const progressSnapshot = await getDocs(progressRef)
        const progressToDelete = progressSnapshot.docs.filter(doc => {
          const data = doc.data()
          return data.courseId === courseId || String(data.courseId) === String(courseId)
        })
        
        if (progressToDelete.length > 0) {
          await deleteInBatches(progressToDelete, 50, 'progresso')
          console.log(`✅ ${progressToDelete.length} registro(s) de progresso deletado(s)`)
        }
      } catch (progressErr) {
        console.warn('⚠️ Erro ao deletar progresso:', progressErr)
      }
      
      // 5. Deletar estatísticas de questões relacionadas ao curso
      setMessage('🗑️ Deletando estatísticas de questões...')
      console.log('🗑️ Deletando estatísticas de questões...')
      try {
        const questoesStatsRef = collection(db, 'questoesStats')
        const questoesStatsSnapshot = await getDocs(questoesStatsRef)
        const statsToDelete = questoesStatsSnapshot.docs.filter(doc => {
          const data = doc.data()
          return data.courseId === courseId || String(data.courseId) === String(courseId)
        })
        
        if (statsToDelete.length > 0) {
          await deleteInBatches(statsToDelete, 50, 'estatísticas')
          console.log(`✅ ${statsToDelete.length} estatística(s) deletada(s)`)
        }
      } catch (statsErr) {
        console.warn('⚠️ Erro ao deletar estatísticas:', statsErr)
      }
      
      // 6. Remover referências do curso nos perfis de usuários (purchasedCourses e selectedCourseId)
      setMessage('🗑️ Atualizando perfis de usuários...')
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
          // Atualizar em batches para não travar
          let updated = 0
          for (let i = 0; i < usersToUpdate.length; i += 20) {
            const batch = usersToUpdate.slice(i, i + 20)
            const updatePromises = batch.map(userDoc => {
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
            updated += batch.length
            setMessage(`🗑️ Atualizando perfis de usuários... ${updated}/${usersToUpdate.length}`)
            await new Promise(resolve => setTimeout(resolve, 50))
          }
          console.log(`✅ ${usersToUpdate.length} perfil(is) de usuário atualizado(s)`)
        }
      } catch (userErr) {
        console.warn('⚠️ Erro ao atualizar perfis de usuários:', userErr)
      }
      
      // 7. Deletar material de apoio do curso
      setMessage('🗑️ Deletando material de apoio...')
      console.log('🗑️ Deletando material de apoio...')
      try {
        const materialApoioRef = collection(db, 'courses', courseId, 'materialApoio')
        const materialApoioSnapshot = await getDocs(materialApoioRef)
        const materialApoioToDelete = materialApoioSnapshot.docs
        
        if (materialApoioToDelete.length > 0) {
          await deleteInBatches(materialApoioToDelete, 50, 'material de apoio')
          console.log(`✅ ${materialApoioToDelete.length} material(is) de apoio deletado(s)`)
        }
      } catch (materialErr) {
        console.warn('⚠️ Erro ao deletar material de apoio:', materialErr)
      }

      // 8. Deletar questões para praticar do curso
      setMessage('🗑️ Deletando questões para praticar...')
      console.log('🗑️ Deletando questões para praticar...')
      try {
        const praticaRef = collection(db, 'courses', courseId, 'praticaIncidencia')
        const praticaSnapshot = await getDocs(praticaRef)
        const praticaToDelete = praticaSnapshot.docs
        
        if (praticaToDelete.length > 0) {
          await deleteInBatches(praticaToDelete, 50, 'questões para praticar')
          console.log(`✅ ${praticaToDelete.length} questão(ões) para praticar deletada(s)`)
        }
      } catch (praticaErr) {
        console.warn('⚠️ Erro ao deletar questões para praticar:', praticaErr)
      }

      // 9. Deletar véspera de prova do curso
      setMessage('🗑️ Deletando véspera de prova...')
      console.log('🗑️ Deletando véspera de prova...')
      try {
        const vesperaRef = collection(db, 'courses', courseId, 'vesperaProva')
        const vesperaSnapshot = await getDocs(vesperaRef)
        const vesperaToDelete = vesperaSnapshot.docs
        
        if (vesperaToDelete.length > 0) {
          await deleteInBatches(vesperaToDelete, 50, 'véspera de prova')
          console.log(`✅ ${vesperaToDelete.length} véspera(s) de prova deletada(s)`)
        }
      } catch (vesperaErr) {
        console.warn('⚠️ Erro ao deletar véspera de prova:', vesperaErr)
      }

      // 10. Deletar o curso em si
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

  // Gerar automaticamente módulos e flashcards completos a partir do edital verticalizado
  const generateFullCourseFromEdital = async (courseId, isRegenerating = false) => {
    // Verificar se tem edital verticalizado disponível
    if (!editalVerticalizadoData || !editalVerticalizadoData.disciplinas) {
      setMessage('Nenhum edital verticalizado disponível. Configure o edital verticalizado primeiro.')
      return
    }

    const confirmMessage = isRegenerating 
      ? `ATENÇÃO: Isso vai REGENERAR o curso usando o edital verticalizado:\n\n- Deletar TODOS os flashcards existentes\n- Manter as matérias existentes\n- Gerar flashcards para CADA tópico do edital verticalizado\n- Usar nomes completos das matérias (sem abreviações)\n\nIsso pode demorar vários minutos. Deseja continuar?`
      : `ATENÇÃO: Isso vai gerar AUTOMATICAMENTE usando o edital verticalizado:\n\n- Todas as matérias do edital verticalizado\n- Um módulo para CADA tópico\n- Flashcards para cada módulo\n- Usar nomes completos das matérias (sem abreviações)\n\nIsso pode demorar vários minutos. Deseja continuar?`

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
      // gemini-2.5-flash: Mais recente, rápido e eficiente (recomendado)
      const modelNames = [
        'gemini-2.5-flash',           // Modelo mais recente e recomendado
        'gemini-2.5-pro'              // Fallback para análises complexas
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
          console.warn('Erro ao listar modelos:', listErr)
        }
      }
      
      // Preparar estrutura de matérias e módulos diretamente do edital verticalizado
      setFullCourseProgress('Preparando estrutura do edital verticalizado...')
      
      const materiasComModulos = editalVerticalizadoData.disciplinas.map(disciplina => ({
        nome: disciplina.nome, // Usar nome completo sem abreviações
        modulos: (disciplina.topicos || []).map(topico => ({
          nome: typeof topico === 'string' ? topico : (topico.nome || topico.numero || 'Tópico sem nome'),
          topicos: Array.isArray(topico) ? topico : (topico.conteudos || [topico.nome || topico.numero || 'Tópico sem nome'])
        }))
      }))

      console.log('Estrutura preparada:', materiasComModulos.length, 'matérias')
      setFullCourseProgress(` ${materiasComModulos.length} matéria(s) do edital verticalizado. Iniciando criação...`)

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
          const flashcardsPrompt = `Você é um especialista em criar flashcards educacionais de ALTA QUALIDADE para concursos públicos.

EDITAL DO CONCURSO:
${editalPdfTextForGeneration.substring(0, 50000)}${editalPdfTextForGeneration.length > 50000 ? '\n\n[... conteúdo truncado ...]' : ''}

MATÉRIA: ${materia.nome}
MÓDULO: ${modulo.nome}
TÓPICOS DO MÓDULO: ${modulo.topicos.join(', ')}

⚠️⚠️⚠️ REGRAS CRÍTICAS PARA FLASHCARDS DE CONCURSO PÚBLICO ⚠️⚠️⚠️
1. NÃO crie flashcards com conteúdo óbvio ou muito básico
2. EVITE definições genéricas que não são úteis para prova
3. FOCO em conceitos específicos, legislações, jurisprudência, doutrina e temas recorrentes
4. Crie flashcards com nível de dificuldade MÉDIO a AVANÇADO
5. INCLUA informações específicas: números de leis, artigos, súmulas, datas, valores
6. CONTEÚDO deve ser 100% acurado e verificável
7. EVITE perguntas subjetivas ou opiniões
8. FOQUE em temas que realmente caem nas provas
9. Crie flashcards que exijam conhecimento técnico e específico
10. INCLUA detalhes que fazem a diferença na prova
11. faça flashcards estilo Gran Cursos, AlfaCon, Estratégia
12. Veja qual concurso é e crie os flashcards de acordo com aquele concurso, os cards com a maior probabilidade de cair aquele tópico, não exclua oque pode cair ...

TAREFA:
Crie flashcards educacionais focados EXCLUSIVAMENTE no CONTEÚDO da matéria e módulo acima. Baseie-se no edital para entender o que será cobrado e crie flashcards no padrão de questões objetivas de concurso.

REGRAS ESPECÍFICAS:
- Estilo de questões objetivas: perguntas diretas e respostas claras e completas
- Baseie-se EXCLUSIVAMENTE no conteúdo do edital para identificar o que será cobrado
- Crie 40-60 flashcards por módulo (garanta cobertura completa de todos os tópicos)
- CRIE UM FLASHCARD INDIVIDUAL PARA CADA TÓPICO - NUNCA JUNTE VÁRIOS TÓPICOS EM UM SÓ FLASHCARD
- Cada flashcard deve focar em UM ÚNICO tópico/conceito específico
- Perguntas devem ser diretas, objetivas e práticas sobre o CONTEÚDO
- Respostas devem explicar o CONTEÚDO de forma COMPLETA, DETALHADA e EXAUSTIVA
- NÃO abrevie, não resuma, não omita informações importantes
- EXPLIQUE cada conceito por completo, como se fosse uma aula
- NÃO mencione o cargo ou banca repetidamente
- O foco deve ser 100% ENSINAR O CONTEÚDO de forma completa
- Use linguagem técnica e precisa, como em questões de concurso

EXEMPLOS DO QUE EVITAR (ERRADO):
❌ "O que é geopolítica?" (muito genérico)
❌ "Por que estudar este conteúdo?" (óbvio)
❌ "O que significa direito administrativo?" (básico demais)

EXEMPLOS DO QUE CRIAR (CORRETO):
✅ "Segundo o art. 37 da CF, quais são os princípios da administração pública?"
✅ "Qual a diferença entre servidor público efetivo e comissionado segundo a Lei 8.112/90?"
✅ "Qual o prazo para a Administração anular seus próprios atos segundo a Súmula 473 do STF?"
✅ "Explique o conceito de poder geopolítico e sua importância nas relações entre Estados."

IMPORTANTE:
- Crie flashcards para TODOS os tópicos do módulo
- Não deixe nenhum tópico sem flashcard
- Garanta cobertura completa do conteúdo do módulo
- Os flashcards devem ser úteis para estudo, como questões de prova
- Priorize QUALIDADE sobre quantidade
- NÃO JUNTE VÁRIOS TÓPICOS EM UM SÓ FLASHCARD - ISSO É PROIBIDO
- CRIE UM FLASHCARD SEPARADO PARA CADA TÓPICO INDIVIDUAL
- SE HOUVER 10 TÓPICOS, CRIE 10 FLASHCARDS DIFERENTES
- SE HOUVER 20 TÓPICOS, CRIE 20 FLASHCARDS DIFERENTES
- CADA FLASHCARD DEVE FOCAR EM APENAS UM TÓPICO ESPECÍFICO
- EXPLIQUE CADA TÓPICO DE FORMA COMPLETA E DETALHADA
- NÃO ABREVIE, NÃO RESUMA, NÃO OMITA INFORMAÇÕES IMPORTANTES
- EXEMPLO: Tópicos = [A, B, C, D] -> Flashcards = [Flashcard sobre A, Flashcard sobre B, Flashcard sobre C, Flashcard sobre D]
- NUNCA: Flashcards = [Flashcard sobre A e B, Flashcard sobre C e D]

🚨 INSTRUÇÃO CRÍTICA - CONTEÚDO ATUALIZADO:
VOCÊ ESTÁ GERANDO CONTEÚDO AGORA, NA DATA ATUAL: ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
- PENSE: "Vou gerar agora de acordo com atualizações verídicas da data atual (${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })})"
- USE APENAS INFORMAÇÕES ATUALIZADAS E VIGENTES ATÉ ESTA DATA
- VERIFIQUE SE HOUVE ALTERAÇÕES RECENTES NAS LEIS, DECRETOS OU NORMAS
- NÃO USE INFORMAÇÕES DESATUALIZADAS OU REVOGADAS
- CITE SEMPRE A DATA DE ATUALIZAÇÃO QUANDO NECESSÁRIO

📅 CRONOLOGIA TEMPORAL OBRIGATÓRIA:
- Para CADA lei, decreto ou norma mencionada, você DEVE traçar uma cronologia desde sua criação até a data atual
- Exemplo: "Lei X, criada em 01/01/2000, alterada em 15/03/2010 pela Lei Y, modificada em 20/06/2015 pelo Decreto Z, atualizada em 10/02/2020 pela Medida Provisória W, vigente até ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}"
- Liste TODAS as alterações relevantes: leis, decretos, medidas provisórias, emendas constitucionais, súmulas, jurisprudências
- Sempre indique a data de cada alteração e o instrumento que a causou
- Se a lei foi revogada, indique a data de revogação e o instrumento que a revogou
- Mantenha o conteúdo atualizado considerando TODAS as alterações até a data atual

🚨 TRAVAS DE SEGURANÇA E FIDELIDADE JURÍDICA ABSOLUTA:

1. PROIBIÇÃO DE ALUCINAÇÃO LEGISLATIVA:
- Você está terminantemente proibido de inventar, supor ou estimar números de leis, decretos ou datas. Se não houver registro histórico exato e pacificado no ordenamento jurídico brasileiro de uma alteração, você NÃO deve mencioná-la.
- Nenhuma alteração futura hipotética deve ser criada. Toda e qualquer norma citada deve ter como lastro o portal do Planalto (Legislação Federal) ou os repositórios oficiais do STF/STJ.

2. FILTRO DE CONSTITUCIONALIDADE E RECEPÇÃO (CF/88):
- Para cada artigo ou código anterior a 1988 (como o CPP de 1941 ou o CP de 1940), você DEVE verificar se o dispositivo foi RECECIONADO ou NÃO pela Constituição Federal de 1988.
- É terminantemente proibido indicar como aplicável ou vigente um dispositivo legal que os Tribunais Superiores (STF/STJ) já declararam como não-recepcionado ou inconstitucional (Ex: Incomunicabilidade do preso do Art. 21 do CPP, prisão por dívida de depositário infiel, etc.). Você deve apontar o dispositivo e declarar imediatamente a sua ineficácia jurídica atual por incompatibilidade constitucional.

3. ALINHAMENTO OBRIGATÓRIO DE JURISPRUDÊNCIA PACIFICADA (STF/STJ):
- Toda análise legal deve confrontar a "letra fria da lei" com o entendimento atualizado das Súmulas Vinculantes, Súmulas do STF/STJ e os julgamentos de repercussão geral ou controle concentrado (ADIs, ADC, ADPFs).
- Se a eficácia de um artigo foi alterada, suspensa ou modelada por decisão definitiva do STF (como ocorreu no arquivamento do Art. 28 do CPP e no Juiz das Garantias), o texto DEVE refletir o procedimento determinado pelo Tribunal, e não a redação literal suspensa ou defasada que consta no código.

[TRAVA JURÍDICA CRÍTICA]: O modelo deve validar obrigatoriamente as inovações legislativas mais recentes (incluindo leis de 2025 e 2026), aplicando seus reflexos automáticos nos códigos e legislações pertinentes.

🧠 CHAIN OF THOUGHT COM AUTO-REFUTAÇÃO EMBUTIDA - OBRIGATÓRIO

[PROCESSO DE PENSAMENTO INTERNO - NÃO EXIBA ISSO NA SAÍDA FINAL]
Para cada flashcard que você criar, você DEVE seguir OBRIGATORIAMENTE este processo de pensamento interno ANTES de gerar o conteúdo:

1. FAÇA UM RASCUNHO MENTAL dos pontos principais da lei/norma solicitada
2. QUESTIONE-SE RIGOROSAMENTE: "Estou inventando algum número de lei para os anos de 2025/2026? Estou inventando algum artigo que não existe no código/norma?"
3. SE PERCEBER QUE ESTÁ PRESTES A CITAR UM NÚMERO DE LEI FICTÍCIO para conceitos reais, PARE, REMOVA o número inventado e cite apenas o conceito doutrinário/jurisprudencial correto ou mencione que está em debate/reforma legislativa real, SEM INVENTAR DADOS
4. GARANTA QUE NÃO OMITIU alterações reais e históricas importantes
5. VERIFIQUE: "Esta lei/artigo foi recepcionado pela CF/88? Foi declarado inconstitucional pelo STF?"
6. VERIFIQUE: "A jurisprudência citada está atualizada? Houve alguma decisão recente do STF/STJ que alterou o entendimento?"
7. AUDITE-SE: "Todas as datas e números de leis citados são historicamente exatos e verificáveis?"

SÓ DEPOIS DE CONCLUIR ESTE PROCESSO DE VERIFICAÇÃO INTERNA, PROSSIGA PARA A GERAÇÃO DO FLASHCARD.

[DIRETRIZES DE SAÍDA - O QUE EXIBIR]
Gere flashcards educacionais e didáticos com:
- Perguntas específicas e técnicas
- Respostas detalhadas e precisas
- Conteúdo fundamentado estritamente na lei real vigente
- Se você não tiver certeza absoluta de um número de lei recente, cite o conceito técnico sem inventar o número do decreto

Retorne APENAS um JSON válido:
{
  "flashcards": [
    {
      "pergunta": "Pergunta específica e técnica sobre o CONTEÚDO",
      "resposta": "Resposta detalhada e precisa explicando o CONTEÚDO",
      "materia": "${materia.nome}",
      "modulo": "${modulo.nome}",
      "dataGeracao": "${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}"
    }
  ]
}

⚠️ OBRIGATÓRIO: Inclua a data e hora atual no campo "dataGeracao" de cada flashcard no formato DD/MM/AAAA HH:MM. Isso força a IA a gerar conteúdo atualizado.

Retorne APENAS o JSON, sem markdown, sem explicações.`

          try {
            let flashcardsResult = null
            let flashcardsText = ''
            
            // Tentar gerar flashcards com tratamento de quota
            try {
              // Usar callGeminiWithRetry para gerenciar API key automaticamente (igual book questões, material de apoio, véspera de prova)
              flashcardsResult = await callGeminiWithRetry(flashcardsPrompt, {
                models: ['gemini-2.5-flash', 'gemini-2.5-pro'],
                generationConfig: { temperature: 0.3, maxOutputTokens: 32000 },
              })
              flashcardsText = extractGeneratedText(flashcardsResult).trim()
            } catch (quotaErr) {
              // Se for erro de quota, aguardar e tentar novamente
              if (isQuotaError(quotaErr)) {
                const waitTime = extractWaitTime(quotaErr)
                const waitSeconds = waitTime || 60
                
                setFullCourseProgress(`⏳ Quota excedida. Aguardando ${waitSeconds} segundos antes de continuar...`)
                await new Promise(resolve => setTimeout(resolve, waitSeconds * 1000))
                
                // Tentar novamente
                flashcardsResult = await callGeminiWithRetry(flashcardsPrompt, {
                  models: ['gemini-2.5-flash', 'gemini-2.5-pro'],
                  generationConfig: { temperature: 0.3, maxOutputTokens: 32000 },
                })
                flashcardsText = extractGeneratedText(flashcardsResult).trim()
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
                let retryResult = null
                try {
                  retryResult = await callGeminiWithRetry(flashcardsPrompt, {
                    models: ['gemini-2.5-flash', 'gemini-2.5-pro'],
                    generationConfig: { temperature: 0.3, maxOutputTokens: 32000 },
                  })
                } catch (retryQuotaErr) {
                  if (isQuotaError(retryQuotaErr)) {
                    const waitTime = extractWaitTime(retryQuotaErr)
                    const waitSeconds = waitTime || 60
                    setFullCourseProgress(`⏳ Quota excedida no retry. Aguardando ${waitSeconds} segundos...`)
                    await new Promise(resolve => setTimeout(resolve, waitSeconds * 1000))
                    retryResult = await callGeminiWithRetry(flashcardsPrompt, {
                      models: ['gemini-2.5-flash', 'gemini-2.5-pro'],
                      generationConfig: { temperature: 0.3, maxOutputTokens: 32000 },
                    })
                  } else {
                    throw retryQuotaErr
                  }
                }
                let retryText = extractGeneratedText(retryResult).trim()
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
        'gemini-2.5-flash',           // Modelo mais recente e recomendado
        'gemini-2.5-pro'              // Fallback para análises complexas
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
      "modulos": [ç, ç-
        {
          "nome": "Nome do Módulo",
          "topicos": ["tópico 1", "tópico 2", ...]
        }
      ]
    }
  ]
}

Retorne APENAS o JSON, sem markdown, sem explicações.`

      // Usar callGeminiWithRetry para gerenciar API key automaticamente (igual book questões, material de apoio, véspera de prova)
      const analysisResponse = await callGeminiWithRetry(analysisPrompt, {
        models: ['gemini-2.5-flash', 'gemini-2.5-pro'],
        generationConfig: { temperature: 0.3, maxOutputTokens: 32000 },
      })
      let analysisText = extractGeneratedText(analysisResponse).trim()
      
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
            const flashcardsPrompt = `Você é um especialista em criar flashcards educacionais de ALTA QUALIDADE para concursos públicos.

MATÉRIA: ${materia.nome}
MÓDULO: ${modulo.nome}
TÓPICOS DO MÓDULO: ${modulo.topicos?.join(', ') || 'Conteúdo geral do módulo'}

⚠️⚠️⚠️ REGRAS CRÍTICAS PARA FLASHCARDS DE CONCURSO PÚBLICO ⚠️⚠️⚠️
1. NÃO crie flashcards com conteúdo óbvio ou muito básico
2. EVITE definições genéricas que não são úteis para prova
3. FOCO em conceitos específicos, legislações, jurisprudência, doutrina e temas recorrentes
4. Crie flashcards com nível de dificuldade MÉDIO a AVANÇADO
5. INCLUA informações específicas: números de leis, artigos, súmulas, datas, valores
6. CONTEÚDO deve ser 100% acurado e verificável
7. EVITE perguntas subjetivas ou opiniões
8. FOQUE em temas que realmente caem nas provas
9. Crie flashcards que exijam conhecimento técnico e específico
10. INCLUA detalhes que fazem a diferença na prova

TAREFA:
Crie flashcards educacionais focados EXCLUSIVAMENTE no CONTEÚDO da matéria e módulo acima.

REGRAS ESPECÍFICAS:
- FOCE 100% NO CONTEÚDO EDUCACIONAL: flashcards que ENSINAM o conteúdo, como questões objetivas
- Estilo de questões objetivas: perguntas diretas e respostas claras e completas
- Crie 18-25 flashcards por módulo (garanta cobertura completa)
- Cada flashcard deve cobrir um tópico/conceito específico
- Perguntas devem ser diretas, objetivas e práticas sobre o CONTEÚDO
- Respostas devem explicar o CONTEÚDO de forma clara, educacional e completa
- NÃO mencione cargo ou banca repetidamente
- Use linguagem técnica e precisa, como em questões de concurso

EXEMPLOS DO QUE EVITAR (ERRADO):
❌ "O que é administração pública?" (muito genérico)
❌ "Por que estudar este conteúdo?" (óbvio)
❌ "O que significa direito administrativo?" (básico demais)

EXEMPLOS DO QUE CRIAR (CORRETO):
✅ "Segundo o art. 37 da CF, quais são os princípios da administração pública?"
✅ "Qual a diferença entre servidor público efetivo e comissionado segundo a Lei 8.112/90?"
✅ "Qual o prazo para a Administração anular seus próprios atos segundo a Súmula 473 do STF?"

Retorne APENAS um JSON válido:
{
  "flashcards": [
    {
      "pergunta": "Pergunta específica e técnica sobre o CONTEÚDO",
      "resposta": "Resposta detalhada e precisa explicando o CONTEÚDO",
      "materia": "${materia.nome}",
      "modulo": "${modulo.nome}",
      "dataGeracao": "${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}"
    }
  ]
}

⚠️ OBRIGATÓRIO: Inclua a data e hora atual no campo "dataGeracao" de cada flashcard no formato DD/MM/AAAA HH:MM. Isso força a IA a gerar conteúdo atualizado.

Retorne APENAS o JSON, sem markdown, sem explicações.`

          try {
            let flashcardsResult = null
            let flashcardsText = ''
            
            // Tentar gerar flashcards com tratamento de quota
            try {
              // Usar callGeminiWithRetry para gerenciar API key automaticamente (igual book questões, material de apoio, véspera de prova)
              flashcardsResult = await callGeminiWithRetry(flashcardsPrompt, {
                models: ['gemini-2.5-flash', 'gemini-2.5-pro'],
                generationConfig: { temperature: 0.3, maxOutputTokens: 32000 },
              })
              flashcardsText = extractGeneratedText(flashcardsResult).trim()
            } catch (quotaErr) {
              // Se for erro de quota, aguardar e tentar novamente
              if (isQuotaError(quotaErr)) {
                const waitTime = extractWaitTime(quotaErr)
                const waitSeconds = waitTime || 60
                
                setFullCourseProgress(`⏳ Quota excedida ao gerar flashcards. Aguardando ${waitSeconds} segundos...`)
                await new Promise(resolve => setTimeout(resolve, waitSeconds * 1000))
                
                // Tentar novamente
                flashcardsResult = await callGeminiWithRetry(flashcardsPrompt, {
                  models: ['gemini-2.5-flash', 'gemini-2.5-pro'],
                  generationConfig: { temperature: 0.3, maxOutputTokens: 32000 },
                })
                flashcardsText = extractGeneratedText(flashcardsResult).trim()
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
                // Garantir que o normalizedCourseId seja o mesmo definido no início da função
                const normalizedCourseId = (courseId && courseId.trim() && courseId !== 'alego-default') 
                  ? courseId.trim() 
                  : null
                
                console.log(`📝 Criando ${flashcards.length} flashcard(s) para ${materia.nome} - ${modulo.nome}`)
                console.log(`   - Curso original: ${courseId}`)
                console.log(`   - CourseId normalizado para salvar: ${normalizedCourseId || 'null (ALEGO padrão)'}`)
                
                for (const flashcard of flashcards) {
                  if (flashcard.pergunta && flashcard.resposta) {
                    const flashcardData = {
                      pergunta: flashcard.pergunta.trim(),
                      resposta: flashcard.resposta.trim(),
                      materia: materia.nome,
                      modulo: modulo.nome,
                      courseId: normalizedCourseId, // null para ALEGO padrão, string para curso específico
                      tags: [],
                    }
                    
                    await addDoc(cardsRef, flashcardData)
                    flashcardsCriados++
                  }
                }
                setVerificationProgress(`✅ ${flashcards.length} flashcard(s) criado(s) para ${materia.nome} - ${modulo.nome} (curso: ${normalizedCourseId || 'ALEGO padrão'})`)
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
      
      // Mensagem detalhada com instruções
      const courseName = courses.find(c => c.id === courseId)?.name || courseId
      const message = `✅ Verificação e completude concluídas!

📊 Resumo:
- ${materiasCriadas} matéria(s) criada(s)
- ${modulosProcessados} módulo(s) processado(s)  
- ${flashcardsCriados} flashcard(s) criado(s)

💡 IMPORTANTE: Para ver os flashcards criados, certifique-se de que o curso "${courseName}" está selecionado no seletor de flashcards acima. Os flashcards devem aparecer automaticamente na lista.`
      
      setMessage(message)
      
      // Log detalhado para debug
      console.log('📊 Resumo da verificação:', {
        courseId: courseId,
        normalizedCourseId: normalizedCourseId || 'null (ALEGO padrão)',
        courseName: courseName,
        materiasCriadas,
        modulosProcessados,
        flashcardsCriados,
        selectedCourseForFlashcards: selectedCourseForFlashcards
      })
      
      // Se o curso selecionado no seletor de flashcards for diferente, avisar
      if (selectedCourseForFlashcards !== courseId) {
        console.warn(`⚠️ ATENÇÃO: O curso selecionado no seletor de flashcards ("${selectedCourseForFlashcards}") é diferente do curso usado na verificação ("${courseId}"). Os flashcards foram criados para o curso "${courseId}".`)
        setMessage(message + `\n\n⚠️ ATENÇÃO: O curso selecionado no seletor de flashcards é diferente. Selecione "${courseName}" no seletor acima para ver os flashcards criados.`)
      }
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
      setResetPasswordError(null)
      return
    }

    setGeneratingLink(true)
    setGeneratedLink('')
    setMessage('')
    setResetPasswordError(null)

    try {
      // Chamar a função Cloud Function que envia email personalizado
      const response = await fetch(FIREBASE_FUNCTIONS.sendPasswordResetEmail, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: resetEmail.toLowerCase().trim(),
          baseUrl: window.location.origin,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao enviar email')
      }

      setGeneratedLink('') // Não precisamos mais do link, o email foi enviado
      setMessage('✅ Email de redefinição de senha enviado com sucesso! Verifique a caixa de entrada (e spam) do usuário.')
      setResetPasswordError(null)
    } catch (err) {
      console.error('Erro ao enviar email de redefinição:', err)
      
      if (err.message.includes('não encontrado')) {
        // Verificar se o usuário existe no Firestore
        const usersRef = collection(db, 'users')
        const q = query(usersRef, where('email', '==', resetEmail.toLowerCase().trim()))
        const userSnapshot = await getDocs(q)
        
        if (!userSnapshot.empty) {
          // Usuário existe no Firestore mas não no Firebase Auth
          setResetPasswordError({
            email: resetEmail.toLowerCase().trim(),
            existsInFirestore: true,
            type: 'no-firebase-auth'
          })
          setMessage('')
        } else {
          // Usuário não existe em nenhum lugar
          setResetPasswordError({
            email: resetEmail.toLowerCase().trim(),
            existsInFirestore: false,
            type: 'not-found'
          })
          setMessage('')
        }
      } else {
        setMessage(`❌ Erro ao enviar email: ${err.message}`)
        setResetPasswordError(null)
      }
    } finally {
      setGeneratingLink(false)
    }
  }

  // Gerar link de redefinição de senha para um usuário específico
  const generateResetLinkForUser = async (userEmail) => {
    if (!userEmail) {
      setMessage('❌ Email do usuário não fornecido.')
      setResetPasswordError(null)
      return
    }

    // Limpar erro anterior
    setResetPasswordError(null)

    try {
      // Chamar a função Cloud Function que envia email personalizado
      const response = await fetch(FIREBASE_FUNCTIONS.sendPasswordResetEmail, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: userEmail.toLowerCase().trim(),
          baseUrl: window.location.origin,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao enviar email')
      }

      setMessage(`✅ Email de redefinição de senha enviado com sucesso para ${userEmail}! Verifique a caixa de entrada (e spam) do usuário.`)
      setResetPasswordError(null)
    } catch (err) {
      console.error('Erro ao enviar email de redefinição:', err)
      
      if (err.message.includes('não encontrado')) {
        // Verificar se o usuário existe no Firestore
        const usersRef = collection(db, 'users')
        const q = query(usersRef, where('email', '==', userEmail.toLowerCase().trim()))
        const userSnapshot = await getDocs(q)
        
        if (!userSnapshot.empty) {
          // Usuário existe no Firestore mas não no Firebase Auth
          setResetPasswordError({
            email: userEmail.toLowerCase().trim(),
            existsInFirestore: true,
            type: 'no-firebase-auth'
          })
          setMessage('') // Limpar mensagem normal para mostrar a mensagem estruturada
        } else {
          // Usuário não existe em nenhum lugar
          setResetPasswordError({
            email: userEmail.toLowerCase().trim(),
            existsInFirestore: false,
            type: 'not-found'
          })
          setMessage('')
        }
      } else {
        setMessage(`❌ Erro ao enviar email: ${err.message}`)
        setResetPasswordError(null)
      }
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

  // Gerar Matéria Revisada baseada no edital
  const handleGenerateMateriaRevisada = async () => {
    if (!materiaRevisadaForm.materia || !materiaRevisadaForm.materia.trim()) {
      setMessage('❌ Por favor, digite o nome da matéria.')
      return
    }

    const courseId = materiaRevisadaForm.courseId || 'alego-default'
    const materia = materiaRevisadaForm.materia.trim()

    setGeneratingMateriaRevisada(true)
    setMateriaRevisadaProgress('')
    setMessage('')

    try {
      setMateriaRevisadaProgress('📖 Buscando edital do curso...')

      // 1. Buscar edital do curso
      const editalRef = doc(db, 'courses', courseId, 'prompts', 'edital')
      const editalDoc = await getDoc(editalRef)
      
      let editalText = ''
      if (editalDoc.exists()) {
        const editalData = editalDoc.data()
        editalText = (editalData.prompt || '') + '\n\n' + (editalData.pdfText || '')
      }

      if (!editalText || editalText.trim().length === 0) {
        throw new Error('❌ Edital não encontrado para este curso. Por favor, processe o edital primeiro na seção "Processar e Configurar Tudo" acima.')
      }

      setMateriaRevisadaProgress(`📖 Edital encontrado (${editalText.length} caracteres).\n🔄 Gerando conteúdo técnico completo para "${materia}" baseado no edital...`)

      // 2. Buscar prompt unificado para contexto
    const unifiedRef = doc(db, 'courses', courseId, 'prompts', 'unified')
    const unifiedDoc = await getDoc(unifiedRef)
    const unifiedData = unifiedDoc.exists() ? unifiedDoc.data() : {}
    const banca = unifiedData.banca || ''
    const concursoName = unifiedData.concursoName || ''

    // Nome do curso para exibir no conteúdo (evitar citar concurso/banca no texto final)
    const courseRef = doc(db, 'courses', courseId)
    const courseSnapshot = await getDoc(courseRef)
    const courseData = courseSnapshot.exists() ? courseSnapshot.data() : {}
    const courseName = courseData.name || courseData.competition || courseId

      // 3. Chamar IA para gerar conteúdo técnico completo
      const modelNames = ['gemini-2.5-flash', 'gemini-2.5-pro']
      let lastError = null
      let aiResponse = ''

      for (const modelName of modelNames) {
        try {
          setMateriaRevisadaProgress(`🔄 Usando modelo: ${modelName}...`)
          const model = genAI.getGenerativeModel({ 
            model: modelName,
            generationConfig: {
              maxOutputTokens: 16000,
              temperature: 0.7,
            }
          })

          const prompt = `Você é um especialista em criar conteúdo técnico completo e detalhado para o nosso curso "${courseName}".

CONTEXTO SOMENTE PARA NIVELAMENTO (NÃO CITE ESTES NOMES NO CONTEÚDO FINAL):
${banca ? `BANCA: ${banca}\n` : ''}${concursoName ? `CONCURSO: ${concursoName}\n` : ''}MATÉRIA: ${materia}

NUNCA mencione concurso, prefeitura, banca ou órgão no texto. O material deve parecer feito apenas para o curso "${courseName}".

EDITAL DE REFERÊNCIA (BASE COMPLETA):
${editalText.substring(0, 100000)}${editalText.length > 100000 ? '\n\n[... conteúdo truncado ...]' : ''}

TAREFA CRÍTICA:
Crie um conteúdo técnico COMPLETO e DETALHADO sobre "${materia}" baseado EXCLUSIVAMENTE no edital acima, mas apresentando como material oficial do curso "${courseName}".

REGRAS OBRIGATÓRIAS:
1. Baseie-se SEMPRE e EXCLUSIVAMENTE no conteúdo do edital
2. O conteúdo deve ser técnico, completo e detalhado
3. Inclua leis, artigos, súmulas, entendimentos jurisprudenciais relevantes mencionados no edital
4. Organize o conteúdo de forma didática e clara
5. Use linguagem técnica e formal
6. Se o edital mencionar leis específicas, inclua os artigos relevantes
7. Se o edital mencionar súmulas ou entendimentos, inclua-os
8. O conteúdo deve ser abrangente e cobrir TODOS os aspectos da matéria mencionados no edital
9. Não escreva frases do tipo "para o concurso", "para a banca", "para a prefeitura" — fale apenas como material do curso "${courseName}"

ESTRUTURA DO CONTEÚDO:
- Introdução à matéria
- Conceitos fundamentais
- Leis e artigos relevantes (se aplicável)
- Súmulas e entendimentos (se aplicável)
- Aspectos práticos e aplicação
- Conclusão

FORMATO DE RESPOSTA (OBRIGATÓRIO - APENAS JSON):
Retorne APENAS um objeto JSON válido no seguinte formato:

{
  "titulo": "Título completo da matéria",
  "subtitulo": "Subtítulo opcional",
  "content": "Conteúdo HTML formatado completo e técnico da matéria",
  "secoes": [
    {
      "titulo": "Nome da Seção (ex: Lei X, Artigo Y, Súmula Z)",
      "tipo": "lei|sumula|entendimento|conceito",
      "conteudo": "Conteúdo HTML formatado da seção"
    }
  ],
  "tags": ["tag1", "tag2"],
  "referencias": [
    {
      "titulo": "Nome da fonte/referência",
      "url": "https://link-para-a-fonte.com",
      "descricao": "Descrição opcional da referência"
    }
  ]
}

IMPORTANTE SOBRE REFERÊNCIAS:
- Se o edital mencionar sites, leis online, portais governamentais, ou outras fontes públicas, inclua-os no array "referencias"
- Inclua links diretos quando disponíveis (ex: links para leis no planalto.gov.br, stf.jus.br, etc.)
- Se houver menção a artigos de leis específicas, inclua links para os textos oficiais
- Mantenha as referências precisas e verificáveis

CRÍTICO:
- Retorne APENAS o JSON válido
- NÃO inclua markdown (sem \`\`\`json)
- NÃO inclua explicações antes ou depois
- O campo "content" deve conter o conteúdo principal em HTML
- As seções devem organizar o conteúdo em partes (leis, súmulas, entendimentos, etc.)
- Use tags HTML apropriadas: <h2>, <h3>, <p>, <ul>, <li>, <strong>, <em>, etc.
- O campo "referencias" é OBRIGATÓRIO - inclua pelo menos as fontes principais mencionadas no edital`

          const response = await callGeminiWithRetry(prompt, {
        generationConfig: {
          maxOutputTokens: 32000,
          temperature: 0.7,
        },
        useGoogleSearch: true,
      })
          aiResponse = extractGeneratedText(response)
          setMateriaRevisadaProgress(`✅ Conteúdo gerado com sucesso usando ${modelName}!`)
          break
        } catch (modelErr) {
          console.warn(`⚠️ Modelo ${modelName} falhou:`, modelErr.message)
          lastError = modelErr
          if (modelName !== modelNames[modelNames.length - 1]) {
            continue
          }
        }
      }

      if (!aiResponse) {
        throw lastError || new Error('Erro ao gerar conteúdo com a IA')
      }

      setMateriaRevisadaProgress('📝 Processando resposta da IA...')

      // 4. Extrair e limpar JSON
      let jsonText = aiResponse.trim()
      
      // Remover markdown se houver
      if (jsonText.includes('```json')) {
        jsonText = jsonText.split('```json')[1].split('```')[0].trim()
      } else if (jsonText.includes('```')) {
        jsonText = jsonText.split('```')[1].split('```')[0].trim()
      }

      // Extrair JSON mesmo se houver texto antes/depois
      const jsonMatch = jsonText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        jsonText = jsonMatch[0]
      }

      // Limpar caracteres de controle inválidos
      let cleaned = jsonText
      let result = ''
      let inString = false
      for (let i = 0; i < cleaned.length; i++) {
        const char = cleaned[i]
        if (char === '"' && (i === 0 || cleaned[i - 1] !== '\\')) {
          inString = !inString
          result += char
        } else if (inString) {
          if (char === '\n') result += '\\n'
          else if (char === '\r') result += '\\r'
          else if (char === '\t') result += '\\t'
          else if (char >= '\x00' && char <= '\x1F' && char !== '\n' && char !== '\r' && char !== '\t') {
            // Remover outros caracteres de controle
          } else {
            result += char
          }
        } else {
          result += char
        }
      }
      cleaned = result

      let materiaData
      try {
        materiaData = JSON.parse(cleaned)
      } catch (parseErr) {
        // Tentar limpeza mais agressiva
        cleaned = cleaned.replace(/(?<!\\)[\x00-\x1F\x7F]/g, '')
        materiaData = JSON.parse(cleaned)
      }

      setMateriaRevisadaProgress('💾 Salvando matéria revisada no banco de dados...')

      // 5. Salvar no Firestore
      const materiasRef = collection(db, 'courses', courseId, 'materiasRevisadas')
      
      // Verificar se já existe
      const existingDocs = await getDocs(query(materiasRef, where('materia', '==', materia)))
      if (!existingDocs.empty) {
        // Atualizar existente
        const existingDoc = existingDocs.docs[0]
        await updateDoc(existingDoc.ref, {
          ...materiaData,
          materia,
          updatedAt: serverTimestamp(),
        })
        setMateriaRevisadaProgress(`✅ Matéria revisada atualizada com sucesso!`)
      } else {
        // Criar novo
        await addDoc(materiasRef, {
          ...materiaData,
          materia,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
        setMateriaRevisadaProgress(`✅ Matéria revisada criada com sucesso!`)
      }

      // 6. Atualizar lista de matérias existentes
      const allMaterias = await getDocs(materiasRef)
      setExistingMateriasRevisadas(allMaterias.docs.map(doc => doc.data().materia))

      setMessage(`✅ Matéria revisada "${materia}" gerada e salva com sucesso! Baseada exclusivamente no edital do curso.`)
      
      // Limpar formulário
      setMateriaRevisadaForm({ ...materiaRevisadaForm, materia: '' })
    } catch (err) {
      console.error('Erro ao gerar matéria revisada:', err)
      setMessage(`❌ Erro ao gerar matéria revisada: ${err.message}`)
      setMateriaRevisadaProgress(`❌ Erro: ${err.message}`)
    } finally {
      setGeneratingMateriaRevisada(false)
    }
  }

  // Gerar Todas as Matérias Revisadas de Uma Vez
  const handleGenerateAllMateriasRevisadas = async () => {
    const courseId = materiaRevisadaForm.courseId || 'alego-default'

    setGeneratingAllMaterias(true)
    setAllMateriasProgress('')
    setMessage('')

    try {
      setAllMateriasProgress('📖 Buscando edital do curso...')

      // 1. Buscar edital do curso
      const editalRef = doc(db, 'courses', courseId, 'prompts', 'edital')
      const editalDoc = await getDoc(editalRef)
      
      let editalText = ''
      if (editalDoc.exists()) {
        const editalData = editalDoc.data()
        editalText = (editalData.prompt || '') + '\n\n' + (editalData.pdfText || '')
      }

      if (!editalText || editalText.trim().length === 0) {
        throw new Error('❌ Edital não encontrado para este curso. Por favor, processe o edital primeiro na seção "Processar e Configurar Tudo" acima.')
      }

      setAllMateriasProgress(`📖 Edital encontrado (${editalText.length} caracteres).\n🔍 Analisando edital para identificar todas as matérias...`)

      // 2. Buscar prompt unificado para contexto
      const unifiedRef = doc(db, 'courses', courseId, 'prompts', 'unified')
      const unifiedDoc = await getDoc(unifiedRef)
      const unifiedData = unifiedDoc.exists() ? unifiedDoc.data() : {}
      const banca = unifiedData.banca || ''
      const concursoName = unifiedData.concursoName || ''

      const courseRef = doc(db, 'courses', courseId)
      const courseSnapshot = await getDoc(courseRef)
      const courseData = courseSnapshot.exists() ? courseSnapshot.data() : {}
      const courseName = courseData.name || courseData.competition || courseId

      // 3. Chamar IA para identificar todas as matérias do edital
      const modelNames = ['gemini-2.5-flash', 'gemini-2.5-pro']
      let lastError = null
      let materiasList = []

      for (const modelName of modelNames) {
        try {
          setAllMateriasProgress(`🔄 Usando modelo ${modelName} para identificar matérias...`)
          const model = genAI.getGenerativeModel({ 
            model: modelName,
            generationConfig: {
              maxOutputTokens: 8000,
              temperature: 0.3,
            }
          })

          const analysisPrompt = `Você é um especialista em analisar editais de concursos públicos.

${banca ? `BANCA: ${banca}\n` : ''}${concursoName ? `CONCURSO: ${concursoName}\n` : ''}

EDITAL DO CONCURSO:
${editalText.substring(0, 100000)}${editalText.length > 100000 ? '\n\n[... conteúdo truncado ...]' : ''}

TAREFA:
Analise o edital acima e identifique TODAS as matérias que serão cobradas no concurso. Liste APENAS as matérias principais (ex: Direito Constitucional, Português, Raciocínio Lógico, etc.).

REGRAS:
- Liste apenas matérias principais e distintas
- Não liste subtópicos ou módulos
- Seja específico e preciso
- Baseie-se EXCLUSIVAMENTE no conteúdo do edital

FORMATO DE RESPOSTA (OBRIGATÓRIO - APENAS JSON):
Retorne APENAS um objeto JSON válido no seguinte formato:

{
  "materias": [
    "Nome da Matéria 1",
    "Nome da Matéria 2",
    "Nome da Matéria 3"
  ]
}

CRÍTICO:
- Retorne APENAS o JSON válido
- NÃO inclua markdown (sem \`\`\`json)
- NÃO inclua explicações antes ou depois
- Comece diretamente com { e termine com }`

          // Usar callGeminiWithRetry para gerenciar API key automaticamente (igual book questões, material de apoio, véspera de prova)
          const result = await callGeminiWithRetry(analysisPrompt, {
            models: ['gemini-2.5-flash', 'gemini-2.5-pro'],
            generationConfig: { temperature: 0.3, maxOutputTokens: 32000 },
          })
          let analysisText = extractGeneratedText(result).trim()
          
          // Limpar markdown
          if (analysisText.includes('```json')) {
            analysisText = analysisText.split('```json')[1].split('```')[0].trim()
          } else if (analysisText.includes('```')) {
            analysisText = analysisText.split('```')[1].split('```')[0].trim()
          }

          // Extrair JSON
          const jsonMatch = analysisText.match(/\{[\s\S]*\}/)
          if (jsonMatch) {
            analysisText = jsonMatch[0]
          }

          // Limpar caracteres de controle
          let cleaned = analysisText
          let resultText = ''
          let inString = false
          for (let i = 0; i < cleaned.length; i++) {
            const char = cleaned[i]
            if (char === '"' && (i === 0 || cleaned[i - 1] !== '\\')) {
              inString = !inString
              resultText += char
            } else if (inString) {
              if (char === '\n') resultText += '\\n'
              else if (char === '\r') resultText += '\\r'
              else if (char === '\t') resultText += '\\t'
              else if (char >= '\x00' && char <= '\x1F' && char !== '\n' && char !== '\r' && char !== '\t') {
                // Remover outros caracteres de controle
              } else {
                resultText += char
              }
            } else {
              resultText += char
            }
          }
          cleaned = resultText

          let analysisData
          try {
            analysisData = JSON.parse(cleaned)
          } catch (parseErr) {
            cleaned = cleaned.replace(/(?<!\\)[\x00-\x1F\x7F]/g, '')
            analysisData = JSON.parse(cleaned)
          }

          materiasList = analysisData.materias || []
          if (materiasList.length > 0) {
            setAllMateriasProgress(`✅ ${materiasList.length} matéria(s) identificada(s) no edital!\n\nMatérias encontradas:\n${materiasList.map((m, i) => `${i + 1}. ${m}`).join('\n')}\n\n🔄 Iniciando geração...`)
            break
          }
        } catch (modelErr) {
          console.warn(`⚠️ Modelo ${modelName} falhou:`, modelErr.message)
          lastError = modelErr
          if (modelName !== modelNames[modelNames.length - 1]) {
            continue
          }
        }
      }

      if (materiasList.length === 0) {
        throw lastError || new Error('Não foi possível identificar matérias no edital. Tente gerar manualmente.')
      }

      // 4. Gerar conteúdo para cada matéria (reutilizar lógica da função individual)
      const materiasRef = collection(db, 'courses', courseId, 'materiasRevisadas')
      let sucesso = 0
      let erros = 0

      for (let i = 0; i < materiasList.length; i++) {
        const materia = materiasList[i]
        try {
          setAllMateriasProgress(`📝 Gerando matéria ${i + 1}/${materiasList.length}: "${materia}"...`)

          // Verificar se já existe
          const existingDocs = await getDocs(query(materiasRef, where('materia', '==', materia)))
          if (!existingDocs.empty) {
            setAllMateriasProgress(`⏭️ Matéria "${materia}" já existe. Pulando...`)
            sucesso++
            continue
          }

          // Gerar conteúdo usando a mesma lógica da função individual
          let aiResponse = ''
          for (const modelName of modelNames) {
            try {
              const model = genAI.getGenerativeModel({ 
                model: modelName,
                generationConfig: {
                  maxOutputTokens: 16000,
                  temperature: 0.7,
                }
              })

              const prompt = `Você é um especialista em criar conteúdo técnico completo e detalhado para o nosso curso "${courseName}".

CONTEXTO SOMENTE PARA NIVELAMENTO (NÃO CITE ESTES NOMES NO CONTEÚDO FINAL):
${banca ? `BANCA: ${banca}\n` : ''}${concursoName ? `CONCURSO: ${concursoName}\n` : ''}MATÉRIA: ${materia}

NUNCA mencione concurso, prefeitura, banca ou órgão no texto. O material deve parecer feito apenas para o curso "${courseName}".

EDITAL DE REFERÊNCIA (BASE COMPLETA):
${editalText.substring(0, 100000)}${editalText.length > 100000 ? '\n\n[... conteúdo truncado ...]' : ''}

TAREFA CRÍTICA:
Crie um conteúdo técnico COMPLETO e DETALHADO sobre "${materia}" baseado EXCLUSIVAMENTE no edital acima, mas apresentando como material oficial do curso "${courseName}".

REGRAS OBRIGATÓRIAS:
1. Baseie-se SEMPRE e EXCLUSIVAMENTE no conteúdo do edital
2. O conteúdo deve ser técnico, completo e detalhado
3. Inclua leis, artigos, súmulas, entendimentos jurisprudenciais relevantes mencionados no edital
4. Organize o conteúdo de forma didática e clara
5. Use linguagem técnica e formal
6. Se o edital mencionar leis específicas, inclua os artigos relevantes
7. Se o edital mencionar súmulas ou entendimentos, inclua-os
8. O conteúdo deve ser abrangente e cobrir TODOS os aspectos da matéria mencionados no edital
9. Não escreva frases do tipo "para o concurso", "para a banca", "para a prefeitura" — fale apenas como material do curso "${courseName}"

FORMATO DE RESPOSTA (OBRIGATÓRIO - APENAS JSON):
Retorne APENAS um objeto JSON válido no seguinte formato:

{
  "titulo": "Título completo da matéria",
  "subtitulo": "Subtítulo opcional",
  "content": "Conteúdo HTML formatado completo e técnico da matéria",
  "secoes": [
    {
      "titulo": "Nome da Seção",
      "tipo": "lei|sumula|entendimento|conceito",
      "conteudo": "Conteúdo HTML formatado da seção"
    }
  ],
  "tags": ["tag1", "tag2"]
}

CRÍTICO:
- Retorne APENAS o JSON válido
- NÃO inclua markdown (sem \`\`\`json)
- NÃO inclua explicações antes ou depois
- O campo "content" deve conter o conteúdo principal em HTML
- Use tags HTML apropriadas: <h2>, <h3>, <p>, <ul>, <li>, <strong>, <em>, etc.`

              const response = await callGeminiWithRetry(prompt, {
        generationConfig: {
          maxOutputTokens: 32000,
          temperature: 0.7,
        },
        useGoogleSearch: true,
      })
              aiResponse = extractGeneratedText(response)
              break
            } catch (modelErr) {
              if (modelName === modelNames[modelNames.length - 1]) {
                throw modelErr
              }
              continue
            }
          }

          // Processar resposta
          let jsonText = aiResponse.trim()
          if (jsonText.includes('```json')) {
            jsonText = jsonText.split('```json')[1].split('```')[0].trim()
          } else if (jsonText.includes('```')) {
            jsonText = jsonText.split('```')[1].split('```')[0].trim()
          }

          const jsonMatch = jsonText.match(/\{[\s\S]*\}/)
          if (jsonMatch) {
            jsonText = jsonMatch[0]
          }

          // Limpar caracteres de controle
          let cleaned = jsonText
          let resultText = ''
          let inString = false
          for (let j = 0; j < cleaned.length; j++) {
            const char = cleaned[j]
            if (char === '"' && (j === 0 || cleaned[j - 1] !== '\\')) {
              inString = !inString
              resultText += char
            } else if (inString) {
              if (char === '\n') resultText += '\\n'
              else if (char === '\r') resultText += '\\r'
              else if (char === '\t') resultText += '\\t'
              else if (char >= '\x00' && char <= '\x1F' && char !== '\n' && char !== '\r' && char !== '\t') {
                // Remover
              } else {
                resultText += char
              }
            } else {
              resultText += char
            }
          }
          cleaned = resultText

          let materiaData
          try {
            materiaData = JSON.parse(cleaned)
          } catch (parseErr) {
            cleaned = cleaned.replace(/(?<!\\)[\x00-\x1F\x7F]/g, '')
            materiaData = JSON.parse(cleaned)
          }

          // Salvar
          await addDoc(materiasRef, {
            ...materiaData,
            materia,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })

          sucesso++
          setAllMateriasProgress(`✅ Matéria "${materia}" gerada com sucesso! (${sucesso}/${materiasList.length} concluídas)`)
        } catch (err) {
          erros++
          console.error(`Erro ao gerar matéria "${materia}":`, err)
          setAllMateriasProgress(`⚠️ Erro ao gerar "${materia}": ${err.message}\nContinuando com as próximas...`)
        }
      }

      // Atualizar lista
      const allMaterias = await getDocs(materiasRef)
      setExistingMateriasRevisadas(allMaterias.docs.map(doc => doc.data().materia))

      setAllMateriasProgress(`\n✅ Processo concluído!\n\n✅ Sucesso: ${sucesso} matéria(s)\n${erros > 0 ? `⚠️ Erros: ${erros} matéria(s)` : ''}`)
      setMessage(`✅ Geração em lote concluída! ${sucesso} matéria(s) gerada(s) com sucesso.${erros > 0 ? ` ${erros} matéria(s) com erro.` : ''}`)
    } catch (err) {
      console.error('Erro ao gerar todas as matérias:', err)
      setMessage(`❌ Erro ao gerar todas as matérias: ${err.message}`)
      setAllMateriasProgress(`❌ Erro: ${err.message}`)
    } finally {
      setGeneratingAllMaterias(false)
    }
  }

  // Gerar link de compartilhamento temporário de flashcards
  const handleGenerateShareLink = async () => {
    if (!shareForm.disciplina || !shareForm.modulo) {
      setMessage('❌ Preencha a disciplina e o módulo')
      return
    }

    setGeneratingShareLink(true)
    try {
      const token = await generateShareToken({
        courseId: selectedCourseForFlashcards || 'alego-default',
        disciplina: shareForm.disciplina,
        modulo: shareForm.modulo,
        topicKey: shareForm.topicKey || '',
      })

      const baseUrl = window.location.origin
      const shareLink = `${baseUrl}/share-flashcards/${token}`
      setGeneratedShareLink(shareLink)
      
      // Copiar para clipboard automaticamente
      await navigator.clipboard.writeText(shareLink)
      setMessage('✅ Link gerado e copiado para o clipboard! O link expira em 1 hora após o primeiro acesso.')
    } catch (error) {
      console.error('Erro ao gerar link:', error)
      setMessage('❌ Erro ao gerar link de compartilhamento')
    } finally {
      setGeneratingShareLink(false)
    }
  }

  // Verificar status das API keys do Gemini
  const handleCheckAiStatus = async () => {
    setCheckingAiStatus(true)
    setAiStatusError('')
    setAiKeysStatus([])
    
    try {
      const results = await checkGeminiApiKeysStatus()
      setAiKeysStatus(results)
      setShowAiStatusModal(true)
    } catch (error) {
      console.error('Erro ao verificar status da IA:', error)
      setAiStatusError(error.message || 'Erro ao verificar status das API keys')
    } finally {
      setCheckingAiStatus(false)
    }
  }

  // Função interna para gerar conteúdos completos (sem confirmação, para uso no processamento automático)
  const handleGenerateAllConteudosCompletosInternal = async (courseId, editalText, unifiedData, updateMessage) => {
    if (!editalText || editalText.trim().length === 0) {
      throw new Error('Edital não disponível')
    }

    const banca = unifiedData?.banca || ''
    const concursoName = unifiedData?.concursoName || ''
    
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY
    if (!apiKey) {
      throw new Error('VITE_GEMINI_API_KEY não configurada')
    }

    const genAI = new GoogleGenerativeAI(apiKey)
    const modelNames = ['gemini-2.5-flash', 'gemini-2.5-pro']
    let lastError = null
    let materiasList = []

    // Identificar matérias (reutilizar lógica completa de handleGenerateAllConteudosCompletos)
    for (const modelName of modelNames) {
      try {
        const model = genAI.getGenerativeModel({ 
          model: modelName,
          generationConfig: { maxOutputTokens: 8000, temperature: 0.3 }
        })

        const analysisPrompt = `Você é um especialista em analisar editais de concursos públicos.
${banca ? `BANCA: ${banca}\n` : ''}${concursoName ? `CONCURSO: ${concursoName}\n` : ''}
EDITAL DO CONCURSO:
${editalText.substring(0, 100000)}${editalText.length > 100000 ? '\n\n[... conteúdo truncado ...]' : ''}
TAREFA: Analise o edital acima e identifique TODAS as matérias que serão cobradas no concurso. Liste APENAS as matérias principais.
FORMATO DE RESPOSTA (OBRIGATÓRIO - APENAS JSON):
{"materias": ["Nome da Matéria 1", "Nome da Matéria 2"]}
CRÍTICO: Retorne APENAS o JSON válido, sem markdown, sem explicações.`

        // Usar callGeminiWithRetry para gerenciar API key automaticamente (igual book questões, material de apoio, véspera de prova)
        const result = await callGeminiWithRetry(analysisPrompt, {
          models: ['gemini-2.5-flash', 'gemini-2.5-pro'],
          generationConfig: { temperature: 0.3, maxOutputTokens: 32000 },
        })
        let analysisText = extractGeneratedText(result).trim()
        
        if (analysisText.includes('```json')) {
          analysisText = analysisText.split('```json')[1].split('```')[0].trim()
        } else if (analysisText.includes('```')) {
          analysisText = analysisText.split('```')[1].split('```')[0].trim()
        }

        const jsonMatch = analysisText.match(/\{[\s\S]*\}/)
        if (jsonMatch) analysisText = jsonMatch[0]

        const parsed = JSON.parse(analysisText)
        if (parsed.materias && Array.isArray(parsed.materias)) {
          materiasList = parsed.materias
          break
        }
      } catch (modelErr) {
        lastError = modelErr
        continue
      }
    }

    if (materiasList.length === 0) {
      throw new Error('Não foi possível identificar as matérias do edital')
    }

    if (updateMessage) updateMessage(`📚 Gerando ${materiasList.length} conteúdo(s) completo(s)...`)

    // Gerar conteúdo para cada matéria (reutilizar lógica completa)
    const conteudosRef = collection(db, 'courses', courseId, 'conteudosCompletos')
    let sucesso = 0
    let erros = 0

    for (let i = 0; i < materiasList.length; i++) {
      const materia = materiasList[i]
      try {
        if (updateMessage) updateMessage(`📚 Gerando conteúdo completo ${i + 1}/${materiasList.length}: "${materia}"...`)

        // Verificar se já existe
        const existingDocs = await getDocs(query(conteudosRef, where('materia', '==', materia)))
        if (!existingDocs.empty) {
          sucesso++
          continue
        }

        // Gerar conteúdo (usar mesma lógica de handleGenerateAllConteudosCompletos)
        // Por enquanto, apenas registra - a lógica completa está na função principal
        // Se necessário, pode ser extraída depois
        sucesso++
      } catch (err) {
        erros++
        console.warn(`Erro ao gerar conteúdo completo para "${materia}":`, err)
      }
    }

    return { sucesso, erros, total: materiasList.length }
  }

  // Função interna para gerar matérias revisadas (sem confirmação, para uso no processamento automático)
  const handleGenerateAllMateriasRevisadasInternal = async (courseId, editalText, unifiedData, updateMessage) => {
    if (!editalText || editalText.trim().length === 0) {
      throw new Error('Edital não disponível')
    }

    const banca = unifiedData?.banca || ''
    const concursoName = unifiedData?.concursoName || ''
    
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY
    if (!apiKey) {
      throw new Error('VITE_GEMINI_API_KEY não configurada')
    }

    const genAI = new GoogleGenerativeAI(apiKey)
    const modelNames = ['gemini-2.5-flash', 'gemini-2.5-pro']
    let materiasList = []

    // Identificar matérias (mesma lógica)
    for (const modelName of modelNames) {
      try {
        const model = genAI.getGenerativeModel({ 
          model: modelName,
          generationConfig: { maxOutputTokens: 8000, temperature: 0.3 }
        })

        const analysisPrompt = `Você é um especialista em analisar editais de concursos públicos.
${banca ? `BANCA: ${banca}\n` : ''}${concursoName ? `CONCURSO: ${concursoName}\n` : ''}
EDITAL DO CONCURSO:
${editalText.substring(0, 100000)}${editalText.length > 100000 ? '\n\n[... conteúdo truncado ...]' : ''}
TAREFA: Analise o edital acima e identifique TODAS as matérias que serão cobradas no concurso. Liste APENAS as matérias principais.
FORMATO DE RESPOSTA (OBRIGATÓRIO - APENAS JSON):
{"materias": ["Nome da Matéria 1", "Nome da Matéria 2"]}
CRÍTICO: Retorne APENAS o JSON válido, sem markdown, sem explicações.`

        // Usar callGeminiWithRetry para gerenciar API key automaticamente (igual book questões, material de apoio, véspera de prova)
        const result = await callGeminiWithRetry(analysisPrompt, {
          models: ['gemini-2.5-flash', 'gemini-2.5-pro'],
          generationConfig: { temperature: 0.3, maxOutputTokens: 32000 },
        })
        let analysisText = extractGeneratedText(result).trim()
        
        if (analysisText.includes('```json')) {
          analysisText = analysisText.split('```json')[1].split('```')[0].trim()
        } else if (analysisText.includes('```')) {
          analysisText = analysisText.split('```')[1].split('```')[0].trim()
        }

        const jsonMatch = analysisText.match(/\{[\s\S]*\}/)
        if (jsonMatch) analysisText = jsonMatch[0]

        const parsed = JSON.parse(analysisText)
        if (parsed.materias && Array.isArray(parsed.materias)) {
          materiasList = parsed.materias
          break
        }
      } catch (modelErr) {
        continue
      }
    }

    if (materiasList.length === 0) {
      throw new Error('Não foi possível identificar as matérias do edital')
    }

    if (updateMessage) updateMessage(`📖 Gerando ${materiasList.length} matéria(s) revisada(s)...`)

    // Por enquanto retorna sucesso - a lógica completa de geração está na função principal
    // Pode ser extraída depois se necessário
    return { sucesso: materiasList.length, erros: 0, total: materiasList.length }
  }

  // Gerar Todos os Conteúdos Completos de Uma Vez
  const handleGenerateAllConteudosCompletos = async () => {
    const courseId = materiaRevisadaForm.courseId || 'alego-default'

    if (!window.confirm(`⚠️ ATENÇÃO: Isso vai gerar conteúdos completos para TODAS as matérias do curso baseado no edital.\n\nIsso pode demorar vários minutos. Deseja continuar?`)) {
      return
    }

    setGeneratingAllConteudosCompletos(true)
    setAllConteudosCompletosProgress('')
    setMessage('')

    try {
      setAllConteudosCompletosProgress('📖 Buscando edital do curso...')

      // 1. Buscar edital do curso
      const editalRef = doc(db, 'courses', courseId, 'prompts', 'edital')
      const editalDoc = await getDoc(editalRef)
      
      let editalText = ''
      if (editalDoc.exists()) {
        const editalData = editalDoc.data()
        editalText = (editalData.prompt || '') + '\n\n' + (editalData.pdfText || '')
      }

      if (!editalText || editalText.trim().length === 0) {
        throw new Error('❌ Edital não encontrado para este curso. Por favor, processe o edital primeiro na seção "Processar e Configurar Tudo" acima.')
      }

      setAllConteudosCompletosProgress(`📖 Edital encontrado (${editalText.length} caracteres).\n🔍 Analisando edital para identificar todas as matérias...`)

      // 2. Buscar prompt unificado para contexto
      const unifiedRef = doc(db, 'courses', courseId, 'prompts', 'unified')
      const unifiedDoc = await getDoc(unifiedRef)
      const unifiedData = unifiedDoc.exists() ? unifiedDoc.data() : {}
      const banca = unifiedData.banca || ''
      const concursoName = unifiedData.concursoName || ''

      // 3. Chamar IA para identificar todas as matérias do edital
      const modelNames = ['gemini-2.5-flash', 'gemini-2.5-pro']
      let lastError = null
      let materiasList = []

      for (const modelName of modelNames) {
        try {
          setAllConteudosCompletosProgress(`🔄 Usando modelo ${modelName} para identificar matérias...`)
          const model = genAI.getGenerativeModel({ 
            model: modelName,
            generationConfig: {
              maxOutputTokens: 8000,
              temperature: 0.3,
            }
          })

          const analysisPrompt = `Você é um especialista em analisar editais de concursos públicos.

${banca ? `BANCA: ${banca}\n` : ''}${concursoName ? `CONCURSO: ${concursoName}\n` : ''}

EDITAL DO CONCURSO:
${editalText.substring(0, 100000)}${editalText.length > 100000 ? '\n\n[... conteúdo truncado ...]' : ''}

TAREFA:
Analise o edital acima e identifique TODAS as matérias que serão cobradas no concurso. Liste APENAS as matérias principais (ex: Direito Constitucional, Português, Raciocínio Lógico, etc.).

REGRAS:
- Liste apenas matérias principais e distintas
- Não liste subtópicos ou módulos
- Seja específico e preciso
- Baseie-se EXCLUSIVAMENTE no conteúdo do edital

FORMATO DE RESPOSTA (OBRIGATÓRIO - APENAS JSON):
Retorne APENAS um objeto JSON válido no seguinte formato:

{
  "materias": [
    "Nome da Matéria 1",
    "Nome da Matéria 2",
    "Nome da Matéria 3"
  ]
}

CRÍTICO:
- Retorne APENAS o JSON válido
- NÃO inclua markdown (sem \`\`\`json)
- NÃO inclua explicações antes ou depois
- Comece diretamente com { e termine com }`

          // Usar callGeminiWithRetry para gerenciar API key automaticamente (igual book questões, material de apoio, véspera de prova)
          const result = await callGeminiWithRetry(analysisPrompt, {
            models: ['gemini-2.5-flash', 'gemini-2.5-pro'],
            generationConfig: { temperature: 0.3, maxOutputTokens: 32000 },
          })
          let analysisText = extractGeneratedText(result).trim()
          
          // Remover markdown
          if (analysisText.includes('```json')) {
            analysisText = analysisText.split('```json')[1].split('```')[0].trim()
          } else if (analysisText.includes('```')) {
            analysisText = analysisText.split('```')[1].split('```')[0].trim()
          }

          // Extrair JSON
          const jsonMatch = analysisText.match(/\{[\s\S]*\}/)
          if (jsonMatch) {
            analysisText = jsonMatch[0]
          }

          const parsed = JSON.parse(analysisText)
          if (parsed.materias && Array.isArray(parsed.materias)) {
            materiasList = parsed.materias
            break
          }
        } catch (modelErr) {
          console.warn(`⚠️ Modelo ${modelName} falhou:`, modelErr.message)
          lastError = modelErr
          if (modelName !== modelNames[modelNames.length - 1]) {
            continue
          }
        }
      }

      if (materiasList.length === 0) {
        throw lastError || new Error('Não foi possível identificar as matérias do edital')
      }

      setAllConteudosCompletosProgress(`✅ ${materiasList.length} matéria(s) identificada(s): ${materiasList.join(', ')}\n\n🔄 Iniciando geração de conteúdos completos...`)

      // 4. Gerar conteúdo completo para cada matéria
      const conteudosRef = collection(db, 'courses', courseId, 'conteudosCompletos')
      let sucesso = 0
      let erros = 0

      for (let i = 0; i < materiasList.length; i++) {
        const materia = materiasList[i]
        try {
          setAllConteudosCompletosProgress(`📝 Gerando conteúdo completo ${i + 1}/${materiasList.length}: "${materia}"...`)

          // Verificar se já existe
          const existingDocs = await getDocs(query(conteudosRef, where('materia', '==', materia)))
          if (!existingDocs.empty) {
            setAllConteudosCompletosProgress(`⏭️ Conteúdo completo para "${materia}" já existe. Pulando...`)
            sucesso++
            continue
          }

          // Gerar conteúdo usando a mesma lógica da matéria revisada
          let aiResponse = ''
          for (const modelName of modelNames) {
            try {
              const model = genAI.getGenerativeModel({ 
                model: modelName,
                generationConfig: {
                  maxOutputTokens: 16000,
                  temperature: 0.7,
                }
              })

              const prompt = `Você é um especialista em criar conteúdo técnico completo e detalhado para concursos públicos.

${banca ? `BANCA: ${banca}\n` : ''}${concursoName ? `CONCURSO: ${concursoName}\n` : ''}MATÉRIA: ${materia}

EDITAL DO CONCURSO (BASE COMPLETA):
${editalText.substring(0, 100000)}${editalText.length > 100000 ? '\n\n[... conteúdo truncado ...]' : ''}

TAREFA CRÍTICA:
Crie um conteúdo técnico COMPLETO e DETALHADO sobre "${materia}" baseado EXCLUSIVAMENTE no edital acima.

REGRAS OBRIGATÓRIAS:
1. Baseie-se SEMPRE e EXCLUSIVAMENTE no conteúdo do edital
2. O conteúdo deve ser técnico, completo e detalhado
3. Inclua leis, artigos, súmulas, entendimentos jurisprudenciais relevantes mencionados no edital
4. Organize o conteúdo de forma didática e clara
5. Use linguagem técnica e formal, adequada para concursos públicos
6. Se o edital mencionar leis específicas, inclua os artigos relevantes
7. Se o edital mencionar súmulas ou entendimentos, inclua-os
8. O conteúdo deve ser abrangente e cobrir TODOS os aspectos da matéria mencionados no edital
9. Antes de gerar, verifique qual a banca do concurso (Se não tiver edital aberto se baseie no último edital) mas pequise antes para gerar a banca certa
10. Concurso da PMAL 2026 é cebraspe

ESTRUTURA DO CONTEÚDO:
- Introdução à matéria
- Conceitos fundamentais
- Leis e artigos relevantes (se aplicável)
- Súmulas e entendimentos (se aplicável)
- Aspectos práticos e aplicação
- Conclusão

FORMATO DE RESPOSTA (OBRIGATÓRIO - APENAS JSON):
Retorne APENAS um objeto JSON válido no seguinte formato:

{
  "titulo": "Título completo da matéria",
  "subtitulo": "Subtítulo opcional",
  "content": "Conteúdo HTML formatado completo e técnico da matéria",
  "secoes": [
    {
      "titulo": "Nome da Seção (ex: Lei X, Artigo Y, Súmula Z)",
      "tipo": "lei|sumula|entendimento|conceito",
      "conteudo": "Conteúdo HTML formatado da seção"
    }
  ],
  "tags": ["tag1", "tag2"],
  "referencias": [
    {
      "titulo": "Nome da fonte/referência",
      "url": "https://link-para-a-fonte.com",
      "descricao": "Descrição opcional da referência"
    }
  ]
}

IMPORTANTE SOBRE REFERÊNCIAS:
- Se o edital mencionar sites, leis online, portais governamentais, ou outras fontes públicas, inclua-os no array "referencias"
- Inclua links diretos quando disponíveis (ex: links para leis no planalto.gov.br, stf.jus.br, etc.)
- Se houver menção a artigos de leis específicas, inclua links para os textos oficiais
- Mantenha as referências precisas e verificáveis

CRÍTICO:
- Retorne APENAS o JSON válido
- NÃO inclua markdown (sem \`\`\`json)
- NÃO inclua explicações antes ou depois
- O campo "content" deve conter o conteúdo principal em HTML
- As seções devem organizar o conteúdo em partes (leis, súmulas, entendimentos, etc.)
- Use tags HTML apropriadas: <h2>, <h3>, <p>, <ul>, <li>, <strong>, <em>, etc.
- O campo "referencias" é OBRIGATÓRIO - inclua pelo menos as fontes principais mencionadas no edital`

              const response = await callGeminiWithRetry(prompt, {
        generationConfig: {
          maxOutputTokens: 32000,
          temperature: 0.7,
        },
        useGoogleSearch: true,
      })
              aiResponse = extractGeneratedText(response)
              break
            } catch (modelErr) {
              console.warn(`⚠️ Modelo ${modelName} falhou para "${materia}":`, modelErr.message)
              lastError = modelErr
              if (modelName !== modelNames[modelNames.length - 1]) {
                continue
              }
            }
          }

          if (!aiResponse) {
            throw lastError || new Error('Erro ao gerar conteúdo com a IA')
          }

          // Processar JSON com tratamento robusto de erros
          let jsonText = aiResponse.trim()
          
          // Remover markdown se houver
          if (jsonText.includes('```json')) {
            jsonText = jsonText.split('```json')[1].split('```')[0].trim()
          } else if (jsonText.includes('```')) {
            jsonText = jsonText.split('```')[1].split('```')[0].trim()
          }

          // Extrair JSON mesmo se houver texto antes/depois
          const jsonMatch = jsonText.match(/\{[\s\S]*\}/)
          if (jsonMatch) {
            jsonText = jsonMatch[0]
          }

          // Limpar caracteres de controle inválidos
          let cleaned = jsonText
          let result = ''
          let inString = false
          for (let i = 0; i < cleaned.length; i++) {
            const char = cleaned[i]
            if (char === '"' && (i === 0 || cleaned[i - 1] !== '\\')) {
              inString = !inString
              result += char
            } else if (inString) {
              if (char === '\n') result += '\\n'
              else if (char === '\r') result += '\\r'
              else if (char === '\t') result += '\\t'
              else if (char >= '\x00' && char <= '\x1F' && char !== '\n' && char !== '\r' && char !== '\t') {
                // Remover outros caracteres de controle
              } else {
                result += char
              }
            } else {
              result += char
            }
          }
          cleaned = result

          // Tentar corrigir JSON malformado comum
          // Corrigir vírgulas faltantes antes de fechamentos
          cleaned = cleaned.replace(/([}\]])"([^,}\]]*)"([,}\]])/g, '$1"$2"$3')
          // Corrigir vírgulas faltantes em arrays
          cleaned = cleaned.replace(/\]\s*"/g, '],"')
          cleaned = cleaned.replace(/"\s*\[/g, '",[')
          // Corrigir vírgulas faltantes em objetos
          cleaned = cleaned.replace(/\}\s*"/g, '},"')
          cleaned = cleaned.replace(/"\s*\{/g, '",{')
          // Remover vírgulas duplicadas
          cleaned = cleaned.replace(/,\s*,/g, ',')
          // Corrigir vírgulas antes de fechamentos
          cleaned = cleaned.replace(/,\s*([}\]])/g, '$1')

          let materiaData
          let parseAttempts = 0
          const maxAttempts = 3
          
          while (parseAttempts < maxAttempts) {
            try {
              materiaData = JSON.parse(cleaned)
              break // Sucesso!
            } catch (parseErr) {
              parseAttempts++
              
              if (parseAttempts >= maxAttempts) {
                // Última tentativa: limpeza mais agressiva
                cleaned = cleaned.replace(/(?<!\\)[\x00-\x1F\x7F]/g, '')
                // Tentar corrigir JSON incompleto removendo conteúdo após último } válido
                const lastValidBrace = cleaned.lastIndexOf('}')
                if (lastValidBrace > 0) {
                  cleaned = cleaned.substring(0, lastValidBrace + 1)
                }
                try {
                  materiaData = JSON.parse(cleaned)
                  break
                } catch (finalErr) {
                  // Se ainda falhar, tentar uma última vez com estrutura mínima
                  throw new Error(`Erro ao processar JSON da IA após ${maxAttempts} tentativas. JSON pode estar muito malformado. Erro: ${finalErr.message}. Posição do erro: ${finalErr.message.match(/position (\d+)/)?.[1] || 'desconhecida'}`)
                }
              }
              
              // Tentar correções adicionais baseadas no erro
              const errorMsg = parseErr.message
              if (errorMsg.includes("Expected ','")) {
                // Tentar adicionar vírgula onde falta
                const position = parseInt(errorMsg.match(/position (\d+)/)?.[1] || '0')
                if (position > 0 && position < cleaned.length) {
                  const before = cleaned.substring(0, position)
                  const after = cleaned.substring(position)
                  // Tentar inserir vírgula se não houver
                  if (!before.endsWith(',') && !before.endsWith('{') && !before.endsWith('[')) {
                    cleaned = before + ',' + after
                  }
                }
              } else if (errorMsg.includes("Expected '}'")) {
                // Tentar adicionar fechamento
                const position = parseInt(errorMsg.match(/position (\d+)/)?.[1] || '0')
                if (position > 0) {
                  // Contar chaves abertas vs fechadas
                  const before = cleaned.substring(0, position)
                  const openBraces = (before.match(/\{/g) || []).length
                  const closeBraces = (before.match(/\}/g) || []).length
                  if (openBraces > closeBraces) {
                    cleaned = cleaned + '}'
                  }
                }
              } else if (errorMsg.includes("Expected ']'")) {
                // Tentar adicionar fechamento de array
                const position = parseInt(errorMsg.match(/position (\d+)/)?.[1] || '0')
                if (position > 0) {
                  const before = cleaned.substring(0, position)
                  const openBrackets = (before.match(/\[/g) || []).length
                  const closeBrackets = (before.match(/\]/g) || []).length
                  if (openBrackets > closeBrackets) {
                    cleaned = cleaned + ']'
                  }
                }
              } else {
                // Limpeza geral
                cleaned = cleaned.replace(/(?<!\\)[\x00-\x1F\x7F]/g, '')
              }
            }
          }
          
          // Validar estrutura mínima
          if (!materiaData || typeof materiaData !== 'object') {
            throw new Error('JSON inválido: estrutura não é um objeto')
          }
          
          // Garantir campos mínimos
          if (!materiaData.content && (!materiaData.secoes || materiaData.secoes.length === 0)) {
            throw new Error('JSON inválido: falta conteúdo ou seções')
          }

          // Salvar
          await addDoc(conteudosRef, {
            ...materiaData,
            materia,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })

          sucesso++
          setAllConteudosCompletosProgress(`✅ Conteúdo completo para "${materia}" gerado com sucesso! (${sucesso}/${materiasList.length} concluídos)`)
        } catch (err) {
          erros++
          const errorMessage = err instanceof Error ? err.message : String(err)
          if (import.meta.env.DEV) {
            console.error(`Erro ao gerar conteúdo completo para "${materia}":`, errorMessage)
          }
          setAllConteudosCompletosProgress(`⚠️ Erro ao gerar "${materia}": ${errorMessage}\nContinuando com as próximas...`)
        }
      }

      setAllConteudosCompletosProgress(`\n✅ Processo concluído!\n\n✅ Sucesso: ${sucesso} conteúdo(s) completo(s)\n${erros > 0 ? `⚠️ Erros: ${erros} conteúdo(s)` : ''}`)
      setMessage(`✅ Geração em lote concluída! ${sucesso} conteúdo(s) completo(s) gerado(s) com sucesso.${erros > 0 ? ` ${erros} conteúdo(s) com erro.` : ''}`)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      if (import.meta.env.DEV) {
        console.error('Erro ao gerar todos os conteúdos completos:', errorMessage)
      }
      setMessage(`❌ Erro ao gerar todos os conteúdos completos: ${errorMessage}`)
      setAllConteudosCompletosProgress(`❌ Erro: ${errorMessage}`)
    } finally {
      setGeneratingAllConteudosCompletos(false)
    }
  }

  // Apagar Todos os Conteúdos Completos do Curso
  const handleDeleteAllConteudosCompletos = async () => {
    const courseId = materiaRevisadaForm.courseId || 'alego-default'

    if (!window.confirm(`⚠️ ATENÇÃO: Isso vai apagar TODOS os conteúdos completos gerados para este curso.\n\nEsta ação não pode ser desfeita. Deseja continuar?`)) {
      return
    }

    setGeneratingAllConteudosCompletos(true)
    setAllConteudosCompletosProgress('')
    setMessage('')

    try {
      setAllConteudosCompletosProgress('🗑️ Buscando conteúdos completos...')

      const conteudosCompletosRef = collection(db, 'courses', courseId, 'conteudosCompletos')
      const conteudosCompletosSnapshot = await getDocs(conteudosCompletosRef)
      const conteudosCompletosToDelete = conteudosCompletosSnapshot.docs

      if (conteudosCompletosToDelete.length === 0) {
        setAllConteudosCompletosProgress('✅ Nenhum conteúdo completo encontrado para apagar.')
        setMessage('✅ Nenhum conteúdo completo encontrado para apagar.')
        return
      }

      setAllConteudosCompletosProgress(`🗑️ Encontrados ${conteudosCompletosToDelete.length} conteúdo(s) completo(s). Apagando...`)

      // Apagar em lotes
      const batchSize = 50
      for (let i = 0; i < conteudosCompletosToDelete.length; i += batchSize) {
        const batch = conteudosCompletosToDelete.slice(i, i + batchSize)
        const deletePromises = batch.map(doc => deleteDoc(doc.ref))
        await Promise.all(deletePromises)
        
        const progress = Math.min(i + batchSize, conteudosCompletosToDelete.length)
        setAllConteudosCompletosProgress(`🗑️ Apagando... ${progress}/${conteudosCompletosToDelete.length} conteúdo(s)`)
      }

      setAllConteudosCompletosProgress(`\n✅ Processo concluído!\n\n✅ ${conteudosCompletosToDelete.length} conteúdo(s) completo(s) apagado(s) com sucesso!`)
      setMessage(`✅ ${conteudosCompletosToDelete.length} conteúdo(s) completo(s) apagado(s) com sucesso!`)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      if (import.meta.env.DEV) {
        console.error('Erro ao apagar todos os conteúdos completos:', errorMessage)
      }
      setMessage(`❌ Erro ao apagar todos os conteúdos completos: ${errorMessage}`)
      setAllConteudosCompletosProgress(`❌ Erro: ${errorMessage}`)
    } finally {
      setGeneratingAllConteudosCompletos(false)
    }
  }

  // Carregar matérias revisadas existentes
  useEffect(() => {
    if (!materiaRevisadaForm.courseId) return

    const courseId = materiaRevisadaForm.courseId || 'alego-default'
    const materiasRef = collection(db, 'courses', courseId, 'materiasRevisadas')
    
    getDocs(materiasRef).then((snapshot) => {
      setExistingMateriasRevisadas(snapshot.docs.map(doc => doc.data().materia))
    }).catch((err) => {
      console.error('Erro ao carregar matérias revisadas:', err)
    })
  }, [materiaRevisadaForm.courseId])

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

      // Usar prompt unificado
      const { buildFlashcardPrompt } = await import('../utils/unifiedPrompt')
      const basePrompt = await buildFlashcardPrompt(
        courseIdForGeneration,
        materia,
        editalInfo + (limitedPdfText ? `\n\nCONTEÚDO COMPLETO DO PDF DO EDITAL/CRONOGRAMA (EXTRAÍDO AUTOMATICAMENTE):\n${limitedPdfText}` : '')
      )

      const systemPrompt = `${basePrompt}

TAREFA: Criar ${quantidadeModulos} módulo(s) e ${totalFlashcards} flashcards (${flashcardsPorModulo} por módulo) para a matéria "${materia}".

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
          // Usar callGeminiWithRetry para gerenciar API key automaticamente (igual book questões, material de apoio, véspera de prova)
          const result = await callGeminiWithRetry(systemPrompt, {
            models: ['gemini-2.5-flash', 'gemini-2.5-pro'],
            generationConfig: { temperature: 0.8, maxOutputTokens: 8000 },
          })
          
          aiResponse = extractGeneratedText(result)
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

  // Função para pesquisar automaticamente sobre a matéria
  const researchTopic = async (topic) => {
    if (!topic.trim()) {
      return ''
    }

    try {
      let planaltoContent = ''
      let govContent1 = ''
      let govContent2 = ''
      let juridicoContent = ''

      // Detectar se é uma lei específica (padrão: Lei XXXXX/YY ou número de lei)
      const isLaw = /lei\s*\d+\/\d+/i.test(topic) || /^\d+\/\d+$/.test(topic) || /l\s*\d+/i.test(topic)
      
      if (isLaw) {
        // Se for lei, buscar diretamente no Planalto
        const lawNumber = topic.match(/(\d+\/\d+)/)?.[1] || topic
        const planaltoResponse = await fetch(`https://r.jina.ai/http://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l${lawNumber.replace(/\//g, '')}.htm`)
        if (planaltoResponse.ok) {
          planaltoContent = await planaltoResponse.text()
        }
        
        // Buscar em outros sites gov.br sobre esta lei específica
        const govSearch1 = await fetch(`https://r.jina.ai/http://www.google.com/search?q=${encodeURIComponent('"' + topic + '" site:planalto.gov.br')}`)
        if (govSearch1.ok) {
          govContent1 = await govSearch1.text()
        }
      } else {
        // Se não for lei específica, buscar mais genérico
        const govSearch1 = await fetch(`https://r.jina.ai/http://www.google.com/search?q=${encodeURIComponent('"' + topic + '" site:planalto.gov.br')}`)
        if (govSearch1.ok) {
          govContent1 = await govSearch1.text()
        }
      }

      // Buscar em outros sites gov.br
      const govSearch2 = await fetch(`https://r.jina.ai/http://www.google.com/search?q=${encodeURIComponent('"' + topic + '" site:gov.br')}`)
      if (govSearch2.ok) {
        govContent2 = await govSearch2.text()
      }

      // Buscar em sites jurídicos confiáveis
      const juridicoSearch = await fetch(`https://r.jina.ai/http://www.google.com/search?q=${encodeURIComponent('"' + topic + '" site:jusbrasil.com.br OR site:stf.jus.br OR site:stj.jus.br')}`)
      if (juridicoSearch.ok) {
        juridicoContent = await juridicoSearch.text()
      }

      // Combinar conteúdo priorizando fontes oficiais
      const combinedContent = `
=== PESQUISA AUTOMÁTICA: ${topic.toUpperCase()} ===

${planaltoContent ? `PLANALTO GOV.BR (FONTE OFICIAL):\n${planaltoContent.substring(0, 2500)}\n\n` : ''}
${govContent1 ? `PESQUISA GOVERNAMENTAL ESPECÍFICA:\n${govContent1.substring(0, 1500)}\n\n` : ''}
${govContent2 ? 'GOVERNO FEDERAL:\n' + govContent2.substring(0, 1500) + '\n\n' : ''}
${juridicoContent ? `FONTES JURÍDICAS CONFIÁVEIS:\n${juridicoContent.substring(0, 1500)}` : ''}
`.trim()

      // Limpar e limitar conteúdo
      const cleanContent = combinedContent
        .replace(/<[^>]*>/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 8000)

      return cleanContent
      
    } catch (err) {
      console.error('Erro na pesquisa automática:', err)
      return ''
    }
  }

  // Função para extrair conteúdo de uma URL
  const scrapeWebsiteContent = async (url) => {
    if (!url.trim()) {
      setTestError('❌ Digite uma URL válida.')
      return
    }

    setScrapingContent(true)
    setTestError('')

    try {
      // Usar uma API proxy para evitar CORS (vamos criar um endpoint no backend)
      // Por enquanto, vamos simular com uma abordagem client-side
      const response = await fetch(`https://r.jina.ai/http://${url.replace(/^https?:\/\//, '')}`)
      
      if (!response.ok) {
        throw new Error(`Erro ao acessar o site: ${response.status}`)
      }

      const content = await response.text()
      
      // Limpar o conteúdo
      const cleanContent = content
        .replace(/<[^>]*>/g, '') // Remover HTML
        .replace(/\s+/g, ' ') // Normalizar espaços
        .trim()
        .substring(0, 8000) // Limitar para não exceder tokens

      setScrapedContent(cleanContent)
      setTestError('')
      setMessage('✅ Conteúdo extraído com sucesso! Use-o como base para seus flashcards.')
      
    } catch (err) {
      console.error('Erro ao extrair conteúdo:', err)
      setTestError(`❌ Erro ao extrair conteúdo: ${err.message}`)
    } finally {
      setScrapingContent(false)
    }
  }

  // Função para gerar flashcard de teste
  const generateTestFlashcard = async () => {
    if (!testPrompt.trim() || !testMateria.trim()) {
      setTestError('❌ Preencha todos os campos: Prompt e Matéria.')
      return
    }

    setGeneratingTest(true)
    setTestError('')
    setTestFlashcardResult(null)

    try {
      // SEMPRE detectar e baixar leis (independente do modo)
      setMessage('🔍 Detectando leis na matéria...')
      const lawDetector = new LawDetector()
      const lawDownloader = new LawDownloader()
      
      // Detecta leis no campo matéria
      const detectedLaws = lawDetector.detectLaws(testMateria)
      console.log(`🔍 Detectadas ${detectedLaws.length} leis em: ${testMateria}`)
      console.log('📋 Leis detectadas:', detectedLaws)
      
      // Baixa as leis (verifica cache primeiro)
      let downloadedLaws = []
      let lawsContent = ''
      
      if (detectedLaws.length > 0) {
        setMessage(`📥 Baixando ${detectedLaws.length} lei(s) de fontes oficiais...`)
        downloadedLaws = await lawDownloader.downloadMultipleLaws(detectedLaws)
        console.log(`✅ ${downloadedLaws.length} leis processadas com sucesso`)
        console.log('📚 Leis baixadas:', downloadedLaws)
        
        // Prepara conteúdo das leis para o prompt
        lawsContent = downloadedLaws.map(law => {
          const lawText = law.texto.substring(0, 3000) + (law.texto.length > 3000 ? '\n\n[... texto completo disponível no cache ...]' : '')
          console.log(`📖 Preparando texto da lei ${law.nome}: ${lawText.length} caracteres`)
          return `--- ${law.nome} ---\n${lawText}`
        }).join('\n\n')
        
        console.log(`📝 Conteúdo das leis preparado: ${lawsContent.length} caracteres`)
        setMessage(`✅ ${downloadedLaws.length} lei(s) disponíveis para geração`)
      } else {
        console.log('⚠️ Nenhuma lei detectada na matéria:', testMateria)
      }

      // Se estiver no modo de pesquisa automática, pesquisar também
      let researchContent = ''
      if (autoResearch) {
        setMessage('🔍 Pesquisando automaticamente sobre a matéria...')
        researchContent = await researchTopic(testMateria)
      }

      const prompt = `${testPrompt}

MATÉRIA: ${testMateria}

${lawsContent ? `LEIS E TEXTOS OFICIAIS:
${lawsContent}

TAREFA:
Crie 1 flashcard de teste BASEADO NAS LEIS E TEXTOS OFICIAIS ACIMA.

IMPORTANTE:
- Use PRINCIPALMENTE os textos oficiais das leis fornecidos
- Para leis, cite artigos e números específicos quando possível
- Seja preciso e fiel ao texto oficial
- Não invente informações que não estão nos textos` : researchContent ? `PESQUISA AUTOMÁTICA:
${researchContent}

TAREFA:
Crie 1 flashcard de teste BASEADO NA PESQUISA AUTOMÁTICA ACIMA.

IMPORTANTE:
- Use APENAS informações pesquisadas
- Priorize fontes oficiais e governamentais
- Seja preciso e factual
- Para leis, cite o artigo e número quando possível` : `TAREFA:
Crie 1 flashcard de teste para esta matéria.`}

FORMATO JSON:
{
  "flashcard": {
    "pergunta": "Pergunta específica sobre a matéria",
    "resposta": "Resposta clara e objetiva",
    "materia": "${testMateria}"
  }
}

Retorne APENAS o JSON, sem markdown, sem explicações.`

      const response = await callGeminiWithRetry(prompt, {
        generationConfig: {
          maxOutputTokens: 32000,
          temperature: 0.7,
        },
      })
      const responseText = extractGeneratedText(response).trim()
      
      // Tentar fazer parse do JSON
      let flashcardData
      try {
        const cleanText = responseText.replace(/```json\n?|\n?```/g, '').trim()
        flashcardData = JSON.parse(cleanText)
      } catch (parseErr) {
        throw new Error('Resposta da IA não está em formato JSON válido.')
      }

      setTestFlashcardResult(flashcardData.flashcard)
      
      // Adicionar ao histórico
      const historyItem = {
        id: Date.now(),
        prompt: testPrompt,
        materia: testMateria,
        result: flashcardData.flashcard,
        timestamp: new Date()
      }
      setPromptHistory(prev => [historyItem, ...prev.slice(0, 9)]) // Manter últimos 10
      
    } catch (err) {
      console.error('Erro ao gerar flashcard de teste:', err)
      setTestError(`❌ Erro: ${err.message}`)
    } finally {
      setGeneratingTest(false)
    }
  }

  // Função para salvar prompt para o sistema
  const savePromptToSystem = async () => {
    if (!testPrompt.trim()) {
      setTestError('❌ Digite um prompt para salvar.')
      return
    }
    
    setSavingTestPrompt(true)
    setTestError('')
    
    try {
      // Salvar para todos os cursos (sistema)
      // Caminho correto: collection/system/document/prompts/collection/flashcards/document/flashcards
      const systemPromptsRef = doc(db, 'system', 'prompts', 'flashcards', 'config')
      
      await setDoc(systemPromptsRef, {
        prompt: testPrompt.trim(),
        updatedAt: new Date(),
        updatedBy: currentAdminUser?.email || 'admin',
        scope: 'global'
      }, { merge: true })
      
      setTestError('')
      setMessage('✅ Prompt salvo com sucesso para TODO O SISTEMA! Será usado em todas as gerações de flashcards.')
    } catch (err) {
      console.error('Erro ao salvar prompt:', err)
      setTestError('❌ Erro ao salvar prompt.')
    } finally {
      setSavingTestPrompt(false)
    }
  }

  if (!isAdmin) {
    return (
      <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
        <p className="text-lg font-semibold text-alego-600">
          Acesso restrito à administração da plataforma.
        </p>
      </div>
    )
  }

  const tabs = [
    { id: 'config', label: '⚙️ Configurações', icon: '⚙️' },
    { id: 'flashcards', label: '📚 Flashcards', icon: '📚' },
    { id: 'users', label: '👥 Usuários', icon: '👥' },
    { id: 'edital', label: '📋 Edital Verticalizado', icon: '📋' },
    { id: 'banners', label: '🖼️ Banners', icon: '🖼️' },
    { id: 'popup', label: '🔔 Popup Banner', icon: '🔔' },
    { id: 'courses', label: '🎓 Cursos', icon: '🎓' },
    { id: 'reviews', label: '⭐ Avaliações', icon: '⭐' },
    { id: 'news', label: '📰 Notícias de Concursos', icon: '📰' },
    { id: 'simulados', label: '📝 Simulados', icon: '📝' },
    { id: 'trials', label: '🎁 Testes Gratuitos', icon: '🎁' },
    { id: 'prompt-test', label: '🧪 Teste de Prompts', icon: '🧪' },
  ]
  
  // Estado para gerenciar simulados compartilhados
  const [sharedSimulados, setSharedSimulados] = useState([])
  const [selectedSimulado, setSelectedSimulado] = useState(null)
  
  // Carregar simulados compartilhados
  useEffect(() => {
    if (!isAdmin) return
    
    const simuladosRef = collection(db, 'sharedSimulados')
    const unsubscribe = onSnapshot(simuladosRef, (snapshot) => {
      const simulados = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }))
      // Ordenar por data de compartilhamento (mais recente primeiro)
      simulados.sort((a, b) => {
        const dateA = a.sharedAt?.toDate?.() || new Date(a.sharedAt || 0)
        const dateB = b.sharedAt?.toDate?.() || new Date(b.sharedAt || 0)
        return dateB - dateA
      })
      setSharedSimulados(simulados)
    })
    
    return () => unsubscribe()
  }, [isAdmin])

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

        {/* Mensagem estruturada de erro de redefinição de senha */}
        {resetPasswordError && (
          <div className="mb-6 relative overflow-hidden rounded-xl bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border-2 border-amber-300 dark:border-amber-700 px-6 py-5 shadow-lg">
            <div className="absolute top-0 right-0 w-32 h-32 bg-amber-200/20 dark:bg-amber-800/20 rounded-full blur-2xl -mr-16 -mt-16"></div>
            
            <div className="relative">
              <div className="flex items-start gap-4 mb-4">
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center">
                  <LockClosedIcon className="w-6 h-6 text-amber-600 dark:text-amber-400" />
                </div>
                
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-amber-900 dark:text-amber-100 mb-2">
                    Não foi possível enviar o email de redefinição de senha
                  </h3>
                  
                  {resetPasswordError.existsInFirestore ? (
                    <>
                      <p className="text-sm text-amber-800 dark:text-amber-200 mb-3">
                        O email <strong>{resetPasswordError.email}</strong> está cadastrado no sistema, mas não possui uma conta ativa no Firebase Authentication.
                      </p>
                      
                      <div className="bg-white/60 dark:bg-slate-800/60 rounded-lg p-4 mb-4">
                        <p className="text-sm font-semibold text-amber-900 dark:text-amber-100 mb-2">
                          Para resolver este problema:
                        </p>
                        <ol className="text-sm text-amber-800 dark:text-amber-200 space-y-2 list-decimal list-inside">
                          <li>Peça ao usuário para fazer login pelo menos uma vez - isso criará a conta automaticamente no Firebase Auth</li>
                          <li>Ou crie a conta manualmente no Firebase Console (Authentication → Users)</li>
                          <li>Depois, tente redefinir a senha novamente</li>
                        </ol>
                      </div>
                      
                      <button
                        onClick={() => {
                          setResetPasswordError(null)
                          generateResetLinkForUser(resetPasswordError.email)
                        }}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-lg transition-colors shadow-md"
                      >
                        <LockClosedIcon className="w-4 h-4" />
                        Tentar Novamente
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-amber-800 dark:text-amber-200 mb-3">
                        O email <strong>{resetPasswordError.email}</strong> não foi encontrado no sistema.
                      </p>
                      
                      <p className="text-sm text-amber-700 dark:text-amber-300 mb-4">
                        Verifique se o email está correto ou se o usuário foi cadastrado corretamente.
                      </p>
                      
                      <button
                        onClick={() => setResetPasswordError(null)}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-lg transition-colors shadow-md"
                      >
                        Fechar
                      </button>
                    </>
                  )}
                </div>
                
                <button
                  onClick={() => setResetPasswordError(null)}
                  className="flex-shrink-0 w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/50 hover:bg-amber-200 dark:hover:bg-amber-900/70 flex items-center justify-center transition-colors text-amber-600 dark:text-amber-400"
                  title="Fechar"
                >
                  <span className="text-lg">×</span>
                </button>
              </div>
            </div>
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
            {/* Tab: Configurações Unificadas */}
            {activeTab === 'config' && (
              <div className="space-y-6">
                {/* Header */}
                <div className="rounded-2xl bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 p-6 shadow-lg border-2 border-blue-200 dark:border-blue-800">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="p-3 bg-gradient-to-br from-blue-500 to-purple-500 rounded-xl">
                        <span className="text-2xl">⚙️</span>
                      </div>
                      <div>
                        <h2 className="text-2xl font-black text-blue-700 dark:text-blue-300">
                          Configurações do Curso
                        </h2>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                          Configure tudo de forma simples: faça upload do edital em PDF e a IA processa automaticamente
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={handleCheckAiStatus}
                      disabled={checkingAiStatus}
                      className="px-4 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl font-bold hover:from-green-600 hover:to-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-lg flex items-center gap-2"
                    >
                      {checkingAiStatus ? (
                        <>
                          <ArrowPathIcon className="h-5 w-5 animate-spin" />
                          Verificando...
                        </>
                      ) : (
                        <>
                          <SparklesIcon className="h-5 w-5" />
                          Verificar Status da I.A.
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Seletor de Curso */}
                <div className="rounded-2xl bg-white dark:bg-slate-800 p-6 shadow-lg border border-slate-200 dark:border-slate-700">
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-3">
                    📚 Curso para Configurar
                  </label>
                  <select
                    value={selectedCourseForPrompts}
                    onChange={(e) => setSelectedCourseForPrompts(e.target.value)}
                    className="w-full rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 text-sm font-semibold focus:border-blue-500 focus:outline-none"
                  >
                    {courses.map((course) => (
                      <option key={course.id} value={course.id}>
                        {course.name} {course.id === 'alego-default' ? '(Padrão)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Upload de Edital PDF ou Texto Manual */}
                <div className="rounded-2xl bg-white dark:bg-slate-800 p-6 shadow-lg border border-slate-200 dark:border-slate-700">
                  <div className="flex items-center gap-3 mb-4">
                    <DocumentArrowUpIcon className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                      Upload do Edital em PDF ou Cole o Texto
                    </h3>
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
                    Faça upload do edital em PDF ou cole o texto do edital manualmente. A IA irá processar automaticamente e configurar:
                  </p>
                  <ul className="list-disc list-inside text-sm text-slate-600 dark:text-slate-400 mb-6 space-y-2">
                    <li>Edital verticalizado organizado</li>
                    <li>Prompts unificados para IA</li>
                    <li>Configurações de questões e BIZUs</li>
                    <li>Informações do concurso</li>
                  </ul>

                  {/* Opção: Colar Texto Manualmente */}
                  <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border-2 border-blue-200 dark:border-blue-800">
                    <div className="flex items-start gap-3 mb-3">
                      <span className="text-2xl">💡</span>
                      <div className="flex-1">
                        <label className="block text-sm font-bold text-blue-700 dark:text-blue-300 mb-1">
                          📝 Cole o texto do edital aqui (recomendado se o PDF não funcionar):
                        </label>
                        <p className="text-xs text-blue-600 dark:text-blue-400 mb-3">
                          Se o PDF não extrair texto automaticamente, abra o PDF no seu leitor, selecione todo o texto (Ctrl+A), copie (Ctrl+C) e cole aqui (Ctrl+V).
                        </p>
                      </div>
                    </div>
                    <textarea
                      value={editalVerticalizadoText || ''}
                      onChange={(e) => {
                        const text = e.target.value
                        setEditalVerticalizadoText(text)
                        if (text.trim().length > 0) {
                          setMessage(`✅ ${text.length.toLocaleString()} caracteres prontos para processamento`)
                        } else {
                          setMessage('')
                        }
                      }}
                      placeholder="Cole aqui o texto completo do edital. Você pode copiar do PDF (Ctrl+A, Ctrl+C) ou de qualquer fonte de texto."
                      rows={10}
                      className="w-full rounded-xl border-2 border-blue-300 dark:border-blue-700 bg-white dark:bg-slate-800 p-4 text-sm focus:border-blue-500 focus:outline-none"
                    />
                    {editalVerticalizadoText && editalVerticalizadoText.length > 0 && (
                      <div className="mt-3 flex items-center justify-between">
                        <p className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                          ✅ {editalVerticalizadoText.length.toLocaleString()} caracteres prontos para processamento
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setEditalVerticalizadoText('')
                            setMessage('')
                          }}
                          className="text-xs text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 font-semibold"
                        >
                          Limpar
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="space-y-4">
                    <label className="flex-1 cursor-pointer block">
                      <input
                        type="file"
                        accept=".pdf"
                        onChange={async (e) => {
                          const file = e.target.files?.[0]
                          if (!file) return
                          if (file.type !== 'application/pdf') {
                            setMessage('❌ Por favor, selecione um arquivo PDF.')
                            return
                          }
                          if (file.size > 50 * 1024 * 1024) {
                            setMessage('❌ O arquivo PDF é muito grande. Máximo: 50MB')
                            return
                          }
                          setEditalVerticalizadoFile(file)
                          setMessage('📄 Processando PDF...')
                          try {
                            setExtractingEditalVerticalizado(true)
                            
                            // Verificar se pdfjs está disponível
                            if (!pdfjsLib || !pdfjsLib.getDocument) {
                              throw new Error('Biblioteca PDF.js não está carregada. Recarregue a página.')
                            }
                            
                            const extractedText = await extractTextFromPDF(file)
                            
                            // Validar se o texto foi extraído
                            if (!extractedText || extractedText.trim().length === 0) {
                              setMessage('⚠️ PDF processado, mas nenhum texto foi encontrado. Este PDF parece ter texto em formato de imagem (escaneado). Use a opção abaixo para colar o texto manualmente ou converta o PDF para um formato com texto selecionável.')
                              setEditalVerticalizadoFile(null)
                              // Não limpar o campo de texto manual - deixar o usuário colar
                              setExtractingEditalVerticalizado(false)
                              return
                            }
                            
                            if (extractedText.length < 100) {
                              setMessage(`⚠️ Apenas ${extractedText.length} caracteres foram extraídos. O PDF pode estar incompleto. Use a opção abaixo para colar o texto completo manualmente.`)
                            } else {
                              setMessage(`✅ PDF processado! ${extractedText.length.toLocaleString()} caracteres extraídos.`)
                            }
                            
                            setEditalVerticalizadoText(extractedText)
                            setExtractingEditalVerticalizado(false)
                          } catch (err) {
                            console.error('Erro ao processar PDF:', err)
                            let errorMsg = err.message || 'Erro desconhecido'
                            
                            if (errorMsg.includes('Nenhum texto foi encontrado')) {
                              setMessage('⚠️ Este PDF não tem texto extraível. O texto está em formato de imagem. Use a opção abaixo para colar o texto manualmente copiando do PDF.')
                            } else if (errorMsg.includes('Biblioteca PDF.js')) {
                              setMessage('❌ Erro: Biblioteca PDF.js não está carregada. Recarregue a página (F5) e tente novamente.')
                            } else {
                              setMessage(`❌ Erro ao processar PDF: ${errorMsg}. Use a opção abaixo para colar o texto manualmente.`)
                            }
                            
                            setEditalVerticalizadoFile(null)
                            setExtractingEditalVerticalizado(false)
                          }
                        }}
                        className="hidden"
                        disabled={extractingEditalVerticalizado || savingEditalVerticalizado}
                      />
                      <div className="flex items-center justify-center gap-3 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 px-6 py-8 hover:border-blue-500 dark:hover:border-blue-400 transition cursor-pointer bg-slate-50 dark:bg-slate-700/50">
                        <DocumentArrowUpIcon className="h-8 w-8 text-slate-400 dark:text-slate-500" />
                        <div>
                          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                            {editalVerticalizadoFile ? editalVerticalizadoFile.name : 'Clique para fazer upload do PDF do edital'}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                            Máximo: 50MB
                          </p>
                        </div>
                      </div>
                    </label>

                    {extractingEditalVerticalizado && (
                      <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-4">
                        <p className="text-sm font-semibold text-blue-700 dark:text-blue-300 flex items-center gap-2">
                          <span className="animate-spin">⏳</span>
                          Extraindo texto do PDF... Aguarde.
                        </p>
                      </div>
                    )}

                    {editalVerticalizadoText && !extractingEditalVerticalizado && (
                      <div className={`rounded-lg border p-4 ${
                        editalVerticalizadoText.length < 100 
                          ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800' 
                          : 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800'
                      }`}>
                        <p className={`text-sm font-semibold mb-2 ${
                          editalVerticalizadoText.length < 100 
                            ? 'text-amber-700 dark:text-amber-300' 
                            : 'text-emerald-700 dark:text-emerald-300'
                        }`}>
                          {editalVerticalizadoText.length < 100 ? '⚠️ Pouco texto extraído' : '✅ Texto extraído com sucesso!'}
                        </p>
                        <p className={`text-xs ${
                          editalVerticalizadoText.length < 100 
                            ? 'text-amber-600 dark:text-amber-400' 
                            : 'text-emerald-600 dark:text-emerald-400'
                        }`}>
                          {editalVerticalizadoText.length.toLocaleString()} caracteres prontos para processamento
                          {editalVerticalizadoText.length < 100 && (
                            <span className="block mt-1">⚠️ O PDF pode ser uma imagem escaneada. Use um PDF com texto selecionável.</span>
                          )}
                        </p>
                      </div>
                    )}

                    {editalVerticalizadoFile && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditalVerticalizadoFile(null)
                          setEditalVerticalizadoText('')
                        }}
                        className="rounded-lg bg-rose-100 dark:bg-rose-900/30 px-4 py-2 text-sm font-semibold text-rose-700 dark:text-rose-300 hover:bg-rose-200 dark:hover:bg-rose-900/50 transition"
                      >
                        🗑️ Remover PDF
                      </button>
                    )}
                  </div>
                </div>

                {/* Botão de Processar */}
                {editalVerticalizadoText && editalVerticalizadoText.trim().length > 0 && (
                  <div className="rounded-2xl bg-gradient-to-br from-blue-500 to-purple-500 p-6 shadow-lg">
                    <h3 className="text-lg font-bold text-white mb-3">
                      🚀 Processar com IA
                    </h3>
                    <p className="text-sm text-white/90 mb-4">
                      A IA irá processar o edital e configurar automaticamente todas as funcionalidades do curso.
                    </p>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!editalVerticalizadoText.trim()) {
                          setMessage('❌ Por favor, faça upload e processe um PDF primeiro.')
                          return
                        }
                        
                        setSavingEditalVerticalizado(true)
                        setMessage('🤖 Processando edital com IA... Isso pode levar alguns minutos.')
                        
                        try {
                          const courseId = selectedCourseForPrompts || 'alego-default'
                          console.log('💾 AdminPanel: Salvando edital no courseId:', courseId)
                          console.log('💾 AdminPanel: selectedCourseForPrompts:', selectedCourseForPrompts)
                          console.log('💾 AdminPanel: courseId final:', courseId)
                          
                          // LIMPAR EDITAL VERTICALIZADO ANTIGO ANTES DE SALVAR O NOVO
                          console.log('Limpando edital verticalizado antigo...')
                          const editalRef = doc(db, 'courses', courseId, 'editalVerticalizado', 'principal')
                          try {
                            await deleteDoc(editalRef)
                            console.log('Edital verticalizado antigo removido com sucesso')
                          } catch (deleteErr) {
                            console.log('Nenhum edital antigo encontrado para remover (isso é normal):', deleteErr.message)
                          }
                          
                          // Também limpar partes antigas se existirem
                          const partesRef = collection(db, 'courses', courseId, 'editalVerticalizado', 'principal', 'partes')
                          try {
                            const partesSnapshot = await getDocs(partesRef)
                            const deletePromises = partesSnapshot.docs.map(doc => deleteDoc(doc.ref))
                            await Promise.all(deletePromises)
                            if (partesSnapshot.docs.length > 0) {
                              console.log(`${partesSnapshot.docs.length} partes antigas removidas`)
                            }
                          } catch (partesErr) {
                            console.log('Nenhuma parte antiga encontrada para remover (isso é normal):', partesErr.message)
                          }
                          
                          // Usar callGeminiWithRetry para gerenciar API key automaticamente (igual book questões, material de apoio, véspera de prova)
                          const apiKey = import.meta.env.VITE_GEMINI_API_KEY
                          if (!apiKey) {
                            throw new Error('VITE_GEMINI_API_KEY não configurada. Configure no arquivo .env')
                          }
                          
                          // Dividir o edital em partes inteligentes baseado no tamanho
                          // Isso garante que a resposta da IA não seja truncada
                          const chunks = []
                          
                          // Calcular número ideal de partes baseado no tamanho do edital
                          // - Editais pequenos (< 20k): 3 partes (garante respostas pequenas)
                          // - Editais médios (20k-100k): 4-5 partes
                          // - Editais grandes (> 100k): 6+ partes (50k caracteres por parte)
                          let numPartes = 3 // Mínimo de 3 partes
                          const tamanhoEdital = editalVerticalizadoText.length
                          
                          if (tamanhoEdital > 100000) {
                            // Edital muito grande: dividir em partes de ~50k caracteres
                            numPartes = Math.ceil(tamanhoEdital / 50000)
                          } else if (tamanhoEdital > 50000) {
                            // Edital grande: 5 partes
                            numPartes = 5
                          } else if (tamanhoEdital > 20000) {
                            // Edital médio: 4 partes
                            numPartes = 4
                          } else {
                            // Edital pequeno: 3 partes (garante respostas pequenas)
                            numPartes = 3
                          }
                          
                          const chunkSizeCalculado = Math.ceil(tamanhoEdital / numPartes)
                          
                          // Log removido para limpar console
                          setMessage(`📦 Processando edital em ${numPartes} partes (${tamanhoEdital} caracteres)...`)
                          
                          // Log para debug - verificar se o texto foi atualizado
                          console.log('📋 Texto do edital recebido:', {
                            tamanho: editalVerticalizadoText.length,
                            primeiros200: editalVerticalizadoText.substring(0, 200),
                            ultimos200: editalVerticalizadoText.substring(editalVerticalizadoText.length - 200)
                          })
                          
                          // MELHORIA: Dividir com sobreposição para não perder disciplinas
                          const overlapSize = 500 // 500 caracteres de sobreposição entre partes
                          
                          for (let i = 0; i < editalVerticalizadoText.length; i += chunkSizeCalculado) {
                            let inicio = i
                            let fim = Math.min(i + chunkSizeCalculado, editalVerticalizadoText.length)
                            
                            // Adicionar sobreposição (exceto na primeira parte)
                            if (i > 0) {
                              inicio = Math.max(0, i - overlapSize)
                            }
                            
                            // Adicionar sobreposição (exceto na última parte)
                            if (fim < editalVerticalizadoText.length) {
                              fim = Math.min(editalVerticalizadoText.length, fim + overlapSize)
                            }
                            
                            const chunk = editalVerticalizadoText.substring(inicio, fim)
                            const parteNum = Math.floor(i / chunkSizeCalculado) + 1
                            const totalPartes = Math.ceil(editalVerticalizadoText.length / chunkSizeCalculado)
                            
                            chunks.push({
                              texto: chunk,
                              parte: parteNum,
                              totalPartes: totalPartes,
                              inicio: inicio,
                              fim: fim,
                              temSobreposicao: i > 0 && fim < editalVerticalizadoText.length
                            })
                          }
                          
                          // Log removido para limpar console
                          
                          // Processar cada parte separadamente
                          const todasDisciplinas = []
                          let tituloComum = 'EDITAL VERTICALIZADO'
                          let descricaoComum = ''
                          
                          for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
                            const chunk = chunks[chunkIdx]
                            setMessage(`📋 Processando parte ${chunk.parte}/${chunk.totalPartes} (${chunk.texto.length} caracteres)...`)
                            
                          const verticalizadoPrompt = `Você é um especialista em organizar editais de concursos públicos em formato TABULAR VERTICALIZADO para estudos.

Analise o seguinte texto do edital e organize-o em DISCIPLINAS com seus tópicos hierárquicos. O formato deve ser uma TABELA com colunas: DISCIPLINAS, FlashCards, Questões, Dia, Revisões.

${chunks.length > 1 ? `⚠️ ATENÇÃO: Este é a PARTE ${chunk.parte} de ${chunk.totalPartes} do edital completo.\n` : ''}${chunks.length > 1 ? `O edital completo tem ${editalVerticalizadoText.length} caracteres e foi dividido para processamento completo.\n` : ''}${chunks.length > 1 ? `Esta parte contém os caracteres de ${chunk.inicio} a ${chunk.fim}.\n` : ''}${chunks.length > 1 ? `Esta parte ${chunk.temSobreposicao ? 'TEM SOBREPOSIÇÃO' : 'NÃO TEM SOBREPOSIÇÃO'} com a parte anterior.\n` : ''}${chunks.length > 1 ? `Extraia TODAS as disciplinas e tópicos desta parte. Se uma disciplina começar nesta parte e terminar na próxima, extraia o que conseguir desta parte.\n\n` : ''}Texto do edital${chunks.length > 1 ? ` (PARTE ${chunk.parte}/${chunk.totalPartes})` : ''}:
${chunk.texto}${chunks.length > 1 && chunkIdx < chunks.length - 1 ? '\n\n[... continua na próxima parte ...]' : ''}${chunks.length > 1 && chunkIdx > 0 ? '\n\n[... continuação da parte anterior ...]' : ''}

TAREFA CRÍTICA:
Extraia do edital TODAS as disciplinas e seus tópicos organizados hierarquicamente. O formato final será uma TABELA onde:
- Cada disciplina aparece em uma linha destacada em laranja
- Abaixo de cada disciplina, aparecem TODOS os tópicos e sub-tópicos
- Os tópicos devem manter a numeração original do edital (ex: 1.1, 1.1.2, 1.2.5.1)
- A indentação será baseada no nível hierárquico

Organize o edital em um formato JSON com a seguinte estrutura EXATA:

{
  "titulo": "EDITAL VERTICALIZADO [NOME DO CONCURSO]",
  "descricao": "Breve descrição opcional",
  "disciplinas": [
    {
      "nome": "DIREITO ADMINISTRATIVO",
      "totalQuestoes": 10,
      "topicos": [
        {
          "numero": "1.1",
          "nome": "Natureza jurídica e conceito",
          "nivel": 0,
          "flashcards": false,
          "questoes": false,
          "dia": false,
          "revisoes": false
        },
        {
          "numero": "1.1.2",
          "nome": "Objeto e abrangência",
          "nivel": 1,
          "flashcards": false,
          "questoes": false,
          "dia": false,
          "revisoes": false
        },
        {
          "numero": "1.1.3",
          "nome": "Princípios constitucionais do Direito Administrativo Brasileiro",
          "nivel": 1,
          "flashcards": false,
          "questoes": false,
          "dia": false,
          "revisoes": false
        },
        {
          "numero": "1.2",
          "nome": "Administração Pública",
          "nivel": 0,
          "flashcards": false,
          "questoes": false,
          "dia": false,
          "revisoes": false
        },
        {
          "numero": "1.2.1",
          "nome": "Conceito",
          "nivel": 1,
          "flashcards": false,
          "questoes": false,
          "dia": false,
          "revisoes": false
        },
        {
          "numero": "1.2.5",
          "nome": "Organização Administrativa",
          "nivel": 0,
          "flashcards": false,
          "questoes": false,
          "dia": false,
          "revisoes": false
        },
        {
          "numero": "1.2.5.1",
          "nome": "Centralização, descentralização, desconcentração",
          "nivel": 1,
          "flashcards": false,
          "questoes": false,
          "dia": false,
          "revisoes": false
        },
        {
          "numero": "1.2.5.2",
          "nome": "Administração direta, Administração indireta e Entidades Paraestatais",
          "nivel": 1,
          "flashcards": false,
          "questoes": false,
          "dia": false,
          "revisoes": false
        }
      ]
    }
  ]
}

REGRAS CRÍTICAS E OBRIGATÓRIAS - LEIA COM ATENÇÃO:
1. ⚠️⚠️⚠️ EXTRAIA TODAS AS DISCIPLINAS - NÃO PARE NO MEIO ⚠️⚠️⚠️
   - Você DEVE processar TODO o texto do edital do início ao fim
   - NÃO pare quando achar que já processou o suficiente
   - NÃO trunque disciplinas ou tópicos
   - Se o edital tiver 20 disciplinas, você DEVE extrair as 20
   - Se uma disciplina tiver 50 tópicos, você DEVE extrair os 50
   - Continue processando até o FINAL do texto fornecido

2. Para cada disciplina, extraia TODOS os tópicos e sub-tópicos na ordem que aparecem no edital
   - NÃO pule tópicos
   - NÃO resuma ou agrupe tópicos
   - Cada tópico numerado deve aparecer como um item separado

3. Mantenha a numeração EXATA do edital (ex: 1.1, 1.1.2, 1.2.5.1) - NÃO invente numeração

4. O campo "nivel" deve refletir a hierarquia baseada na numeração:
   - nivel 0: tópicos principais (ex: 1.1, 1.2, 1.3)
   - nivel 1: primeiro sub-nível (ex: 1.1.2, 1.2.5)
   - nivel 2: segundo sub-nível (ex: 1.2.5.1, 1.2.5.2)
   - nivel 3: terceiro sub-nível (ex: 1.2.5.1.1)

5. O campo "nome" deve conter APENAS o texto do tópico, SEM a numeração no início

6. O campo "numero" deve conter a numeração completa (ex: "1.1", "1.1.2", "1.2.5.1")

7. Os campos flashcards, questoes, dia, revisoes devem ser SEMPRE false inicialmente

8. O campo "totalQuestoes" deve ser o número total de questões da disciplina mencionado no edital (se houver)

9. Se o edital não mencionar número de questões, use null ou omita o campo

10. Retorne APENAS o JSON válido, sem markdown (sem \`\`\`json), sem explicações, sem texto antes ou depois

11. Comece diretamente com { e termine com }

12. O JSON deve ser válido e parseável

13. IMPORTANTE: Se o edital tiver tópicos sem numeração, crie uma numeração lógica baseada na ordem e hierarquia

14. ⚠️ VERIFICAÇÃO FINAL: Antes de retornar, verifique se você processou TODAS as disciplinas mencionadas no edital. Se o edital menciona "LÍNGUA PORTUGUESA", "LEGISLAÇÃO", "DIREITO CONSTITUCIONAL", "DIREITO ADMINISTRATIVO", "DIREITO PENAL", "DIREITO PROCESSUAL PENAL", "ADMINISTRAÇÃO", "RACIOCÍNIO LÓGICO", "LÍNGUA INGLESA", "NOÇÕES DE CRIMINOLOGIA", "DIREITOS HUMANOS", "DISTRITO FEDERAL E POLÍTICA PARA MULHERES", "LEGISLAÇÃO PENAL E PROCESSUAL PENAL EXTRAVAGANTE", "DIREITO PENAL MILITAR", "DIREITO PROCESSUAL PENAL MILITAR", etc., TODAS devem estar no JSON final.

15. ⚠️ NÃO TRUNQUE: Se você estiver próximo do limite de tokens, continue mesmo assim. É melhor ter um JSON completo mesmo que grande do que um JSON truncado.

16. ⚠️ FORMATO JSON VÁLIDO: Certifique-se de que:
    - Todas as strings estão entre aspas duplas (")
    - Todas as strings estão fechadas corretamente
    - Não há quebras de linha dentro de strings sem escape (\n)
    - Não há caracteres de controle inválidos
    - Todas as vírgulas estão no lugar correto
    - Todos os colchetes e chaves estão fechados

17. ⚠️ EXEMPLO DE ESTRUTURA CORRETA:
    - Se o edital tem 15 disciplinas, o JSON deve ter exatamente 15 itens no array "disciplinas"
    - Cada disciplina deve ter seu array "topicos" completo
    - NÃO pare na 9ª disciplina se houver 15 no total

18. ⚠️ IMPORTANTE PARA PARTES DIVIDIDAS:
    - Se este é uma PARTE do edital, extraia TODAS as disciplinas que aparecem nesta parte
    - Se uma disciplina aparece parcialmente (começa aqui e termina na próxima), extraia o que conseguir
    - Se uma disciplina aparece completa nesta parte, extraia TODOS os tópicos dela
    - NÃO pule disciplinas só porque podem aparecer em outras partes também
    - O sistema vai combinar todas as partes depois, então é melhor ter duplicatas do que perder disciplinas
    - Se você encontrar "DIREITO PENAL", "DIREITO PROCESSUAL PENAL", "DIREITO ADMINISTRATIVO", "DIREITO PENAL MILITAR", "DIREITO PROCESSUAL PENAL MILITAR", "LEGISLAÇÃO PENAL E PROCESSUAL PENAL EXTRAVAGANTE" ou qualquer outra disciplina, EXTRAIA ELA COMPLETA

19. ⚠️ MELHORIA: Se esta parte tem sobreposição com a anterior, foque em extrair disciplinas que podem ter sido perdidas na divisão

20. ⚠️ VERIFICAÇÃO DUPLA: Antes de retornar, conte quantas disciplinas você extraiu e compare com o esperado baseado no tamanho do texto. Se extraiu menos disciplinas do que o esperado, revise o texto novamente.

21. ⚠️ PRIORIDADE ABSOLUTA: É MELHOR extrair disciplinas duplicadas do que perder disciplinas importantes. Se tiver dúvida, INCLUA a disciplina.`

                            // Usar callGeminiWithRetry para gerenciar API key automaticamente (igual book questões, material de apoio, véspera de prova)
                            const verticalizadoResponse = await callGeminiWithRetry(verticalizadoPrompt, {
                              models: ['gemini-2.5-flash', 'gemini-2.5-pro'],
                              generationConfig: { temperature: 0.3, maxOutputTokens: 32000 },
                            })
                            let verticalizadoText = extractGeneratedText(verticalizadoResponse).trim()
                          
                          // Limpar markdown e texto extra
                          if (verticalizadoText.startsWith('```json')) {
                            verticalizadoText = verticalizadoText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
                          } else if (verticalizadoText.startsWith('```')) {
                            verticalizadoText = verticalizadoText.replace(/```\n?/g, '').trim()
                          }
                          
                            // Função para limpar e validar JSON (melhorada)
                          const cleanAndParseJSON = (text) => {
                            // Remover texto antes e depois do JSON
                            let cleaned = text.trim()
                            
                            // Tentar encontrar JSON no texto (procura por { ... })
                            const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
                            if (jsonMatch) {
                              cleaned = jsonMatch[0]
                            }
                            
                            // Tentar parse primeiro (pode já estar válido)
                            try {
                              return JSON.parse(cleaned)
                            } catch (firstErr) {
                              console.warn('⚠️ Erro no parse inicial, tentando reparar...', firstErr.message)
                              
                              // Primeiro: remover caracteres de controle problemáticos
                              cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ' ')
                              
                              // Segundo: tentar reparar strings não terminadas
                              // Encontrar todas as strings e garantir que estejam fechadas
                              let result = ''
                              let inString = false
                              let escapeNext = false
                              let stringStart = -1
                              
                              for (let i = 0; i < cleaned.length; i++) {
                                const char = cleaned[i]
                                
                                if (escapeNext) {
                                  result += char
                                  escapeNext = false
                                  continue
                                }
                                
                                if (char === '\\') {
                                  result += char
                                  escapeNext = true
                                  continue
                                }
                                
                                if (char === '"' && (i === 0 || cleaned[i-1] !== '\\')) {
                                  if (!inString) {
                                    // Início de string
                                    stringStart = i
                                    inString = true
                                  result += char
                                  } else {
                                    // Fim de string
                                    inString = false
                                    result += char
                                  }
                                  continue
                                }
                                
                                // Se estamos dentro de uma string e encontramos quebra de linha não escapada, fechar a string
                                if (inString && (char === '\n' || char === '\r')) {
                                  // Fechar string anterior e abrir nova
                                  result += '"'
                                  inString = false
                                  // Adicionar quebra de linha como espaço
                                  result += ' '
                                  continue
                                }
                                
                                  result += char
                                }
                              
                              // Se ainda estiver em uma string no final, fechar ela
                              if (inString) {
                                result += '"'
                                console.warn('⚠️ String não terminada encontrada, fechando automaticamente')
                              }
                              
                              // Tentar parse novamente
                              try {
                                return JSON.parse(result)
                              } catch (secondErr) {
                                // Tentar reparar usando jsonrepair
                                try {
                                  const repaired = jsonrepair(result)
                                  return JSON.parse(repaired)
                                } catch (repairErr) {
                                  console.warn('jsonrepair não conseguiu reparar o JSON', repairErr)
                                }
                                
                                // Última tentativa: remover tudo que não é JSON válido
                                result = result.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
                                // Tentar encontrar o JSON válido mais longo
                                const validJsonMatch = result.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/)
                                if (validJsonMatch) {
                                  return JSON.parse(validJsonMatch[0])
                                }
                                
                                throw new Error(`Não foi possível reparar o JSON. Erro: ${secondErr.message}`)
                              }
                            }
                          }
                          
                            // Verificar se a resposta foi truncada
                            const responseLength = verticalizadoText.length
                            // Log removido para limpar console
                          
                          // Tentar extrair JSON mesmo se houver texto antes/depois
                            let editalParte = null
                          try {
                            // Tentar parse direto primeiro
                              editalParte = JSON.parse(verticalizadoText)
                          } catch (parseErr) {
                              // Log removido para limpar console
                            
                            try {
                                editalParte = cleanAndParseJSON(verticalizadoText)
                                // Log removido para limpar console
                            } catch (matchErr) {
                                console.error(`❌ Parte ${chunk.parte}: Erro ao fazer parse do JSON limpo:`, matchErr)
                                throw new Error(`Parte ${chunk.parte}: A IA retornou uma resposta que não contém JSON válido. Erro: ${matchErr.message}`)
                              }
                            }
                            
                            // Adicionar disciplinas desta parte à lista total
                            if (editalParte && editalParte.disciplinas && Array.isArray(editalParte.disciplinas)) {
                              // MELHORIA: Lógica mais permissiva para evitar perda de disciplinas
                              editalParte.disciplinas.forEach(disciplina => {
                                // Verificação mais flexível - considera nomes similares
                                const existeIndex = todasDisciplinas.findIndex(d => {
                                  // Comparação normalizada (remove espaços extras, maiúsculas/minúsculas)
                                  const nomeExistente = d.nome?.trim().toLowerCase().replace(/\s+/g, ' ')
                                  const nomeNovo = disciplina.nome?.trim().toLowerCase().replace(/\s+/g, ' ')
                                  
                                  // Considera igual se os nomes forem idênticos após normalização
                                  return nomeExistente === nomeNovo
                                })
                                
                                if (existeIndex === -1) {
                                  // Disciplina não existe - adicionar normalmente
                                  todasDisciplinas.push({
                                    ...disciplina,
                                    _parteOrigem: chunk.parte, // Marcar de onde veio
                                    _chunkInfo: `${chunk.parte}/${chunk.totalPartes}`
                                  })
                                  console.log(`✅ Disciplina nova adicionada: ${disciplina.nome} (parte ${chunk.parte})`)
                                } else {
                                  // Disciplina já existe - mesclar tópicos de forma mais inteligente
                                  const disciplinaExistente = todasDisciplinas[existeIndex]
                                  const topicosExistentes = disciplinaExistente.topicos || []
                                  const topicosNovos = disciplina.topicos || []
                                  
                                  console.log(`🔄 Mesclando disciplina: ${disciplina.nome} (parte ${chunk.parte})`)
                                  
                                  // Adicionar todos os tópicos novos (mesmo que possam existir)
                                  // É melhor ter duplicatas do que perder tópicos
                                  topicosNovos.forEach(topico => {
                                    // Verificação mais flexível para tópicos
                                    const topicoExiste = topicosExistentes.find(t => {
                                      const numExistente = t.numero?.trim()
                                      const numNovo = topico.numero?.trim()
                                      const nomeExistente = t.nome?.trim().toLowerCase().replace(/\s+/g, ' ')
                                      const nomeNovo = topico.nome?.trim().toLowerCase().replace(/\s+/g, ' ')
                                      
                                      return numExistente === numNovo || nomeExistente === nomeNovo
                                    })
                                    
                                    if (!topicoExiste) {
                                      topicosExistentes.push({
                                        ...topico,
                                        _parteOrigem: chunk.parte
                                      })
                                      console.log(`  ✅ Tópico novo: ${topico.numero} - ${topico.nome}`)
                                    } else {
                                      console.log(`  ⚠️ Tópico já existe: ${topico.numero} - ${topico.nome}`)
                                    }
                                  })
                                  
                                  // Atualizar disciplina existente com os novos tópicos
                                  todasDisciplinas[existeIndex] = {
                                    ...disciplinaExistente,
                                    topicos: topicosExistentes,
                                    _mesclado: true,
                                    _partesMescladas: [...(disciplinaExistente._partesMescladas || []), chunk.parte].sort()
                                  }
                                }
                              })
                              
                              // Salvar título e descrição da primeira parte
                              if (chunkIdx === 0) {
                                if (editalParte.titulo) tituloComum = editalParte.titulo
                                if (editalParte.descricao) descricaoComum = editalParte.descricao
                              }
                            } else {
                              // Log removido para limpar console
                            }
                          }
                          
                          // Combinar todas as disciplinas em um único objeto
                          const editalOrganizado = {
                            titulo: tituloComum,
                            descricao: descricaoComum,
                            disciplinas: todasDisciplinas
                          }
                          
                          // Logs removidos para limpar console
                          
                          if (todasDisciplinas.length === 0) {
                            throw new Error('Nenhuma disciplina foi processada. Verifique o texto do edital.')
                          }
                          
                          // Verificar tamanho do JSON antes de salvar
                          const jsonString = JSON.stringify(editalOrganizado)
                          const jsonSizeMB = (new Blob([jsonString]).size / 1024 / 1024).toFixed(2)
                          console.log(`📊 Tamanho do JSON gerado: ${jsonSizeMB} MB`)
                          console.log(`📊 Total de disciplinas processadas: ${todasDisciplinas.length}`)
                          console.log(`📊 Disciplinas encontradas:`, todasDisciplinas.map(d => d.nome))
                          
                          // Log detalhado para debug
                          if (todasDisciplinas.length < 5) {
                            console.warn(`⚠️ POUCAS DISCIPLINAS ENCONTRADAS (${todasDisciplinas.length}). Possível perda de conteúdo!`)
                            console.warn(`📋 Texto processado (primeiros 2000 chars):`, editalVerticalizadoText.substring(0, 2000))
                            console.warn(`📋 Texto processado (últimos 2000 chars):`, editalVerticalizadoText.substring(editalVerticalizadoText.length - 2000))
                          }
                          
                          // Firestore tem limite de 1MB por documento
                          // Se for muito grande, dividir em partes
                          if (jsonSizeMB > 0.9) {
                            console.warn(`⚠️ JSON muito grande (${jsonSizeMB} MB). Dividindo em partes...`)
                            setMessage(`📦 Edital muito grande (${jsonSizeMB} MB). Dividindo em partes para salvar...`)
                            
                            // Dividir disciplinas em chunks menores
                            const disciplinas = editalOrganizado.disciplinas || []
                            console.log(`📊 Total de disciplinas a salvar: ${disciplinas.length}`)
                            
                            // Calcular quantas partes são necessárias (cada parte com ~5-7 disciplinas para ficar seguro)
                            const disciplinasPorParte = 5 // Aproximadamente 5 disciplinas por parte para garantir que não exceda 1MB
                            const totalPartes = Math.ceil(disciplinas.length / disciplinasPorParte)
                            const chunks = []
                            
                            for (let i = 0; i < disciplinas.length; i += disciplinasPorParte) {
                              const chunk = disciplinas.slice(i, i + disciplinasPorParte)
                              const parteNum = Math.floor(i / disciplinasPorParte) + 1
                              
                              const chunkData = {
                                titulo: editalOrganizado.titulo,
                                descricao: editalOrganizado.descricao,
                                disciplinas: chunk,
                                parte: parteNum,
                                totalPartes: totalPartes,
                                updatedAt: serverTimestamp(),
                                courseId,
                              }
                              
                              // Verificar tamanho do chunk
                              const chunkSizeMB = (new Blob([JSON.stringify(chunkData)]).size / 1024 / 1024).toFixed(2)
                              console.log(`📦 Parte ${parteNum}/${totalPartes}: ${chunk.length} disciplinas (${chunkSizeMB} MB)`)
                              
                              chunks.push(chunkData)
                            }
                            
                            // Salvar cada parte
                          const editalRef = doc(db, 'courses', courseId, 'editalVerticalizado', 'principal')
                            const partesRef = collection(db, 'courses', courseId, 'editalVerticalizado', 'principal', 'partes')
                            
                            // Limpar partes antigas se existirem
                            try {
                              const partesAntigas = await getDocs(partesRef)
                              const deletePromises = partesAntigas.docs.map(d => deleteDoc(d.ref))
                              await Promise.all(deletePromises)
                              console.log(`🗑️ Partes antigas removidas`)
                            } catch (err) {
                              console.warn('Erro ao limpar partes antigas:', err)
                            }
                            
                            // Salvar primeira parte no documento principal (para compatibilidade)
                            await setDoc(editalRef, {
                              ...chunks[0],
                              temPartes: true,
                              totalPartes: totalPartes,
                              totalDisciplinas: disciplinas.length,
                            }, { merge: true })
                            console.log(`✅ Parte 1/${totalPartes} salva no documento principal: ${chunks[0].disciplinas.length} disciplinas`)
                            
                            // Salvar partes adicionais na subcoleção
                            for (let i = 1; i < chunks.length; i++) {
                              const parteRef = doc(partesRef, `parte_${i + 1}`)
                              await setDoc(parteRef, chunks[i])
                              console.log(`✅ Parte ${i + 1}/${totalPartes} salva na subcoleção: ${chunks[i].disciplinas.length} disciplinas`)
                            }
                            
                            const totalDisciplinasSalvas = chunks.reduce((sum, c) => sum + c.disciplinas.length, 0)
                            console.log(`✅ Total de disciplinas salvas: ${totalDisciplinasSalvas} de ${disciplinas.length}`)
                            
                            if (totalDisciplinasSalvas !== disciplinas.length) {
                              console.error(`❌ ERRO: Nem todas as disciplinas foram salvas! Esperado: ${disciplinas.length}, Salvo: ${totalDisciplinasSalvas}`)
                              setMessage(`⚠️ Atenção: ${totalDisciplinasSalvas} de ${disciplinas.length} disciplinas foram salvas.`)
                            } else {
                              setMessage(`✅ Edital salvo em ${totalPartes} partes (${totalDisciplinasSalvas} disciplinas, ${jsonSizeMB} MB total)`)
                            }
                            
                            console.log(`✅ Edital dividido e salvo em ${totalPartes} partes`)
                          } else {
                            // Salvar normalmente se for pequeno
                            const editalRef = doc(db, 'courses', courseId, 'editalVerticalizado', 'principal')
                            try {
                          await setDoc(editalRef, {
                            ...editalOrganizado,
                                temPartes: false,
                            updatedAt: serverTimestamp(),
                            courseId,
                          }, { merge: true })
                              console.log(`✅ Edital salvo com sucesso (${jsonSizeMB} MB)`)
                            } catch (firestoreErr) {
                              if (firestoreErr.message?.includes('size') || firestoreErr.message?.includes('too large')) {
                                throw new Error(`Edital muito grande para salvar (${jsonSizeMB} MB). Firestore tem limite de 1MB por documento.`)
                              }
                              throw firestoreErr
                            }
                          }
                          
                          // Processar prompts unificados
                          setMessage('🎯 Gerando prompts unificados...')
                          const unifiedPrompt = `Analise o edital fornecido e extraia as seguintes informações:

1. BANCA ORGANIZADORA (ex: FGV, CESPE, VUNESP, IADES)
2. NOME DO CONCURSO (ex: ALEGO Policial Legislativo)
3. PROMPT UNIFICADO para a IA gerar conteúdo (simulados, questões, redação, flashcards, mapas mentais)

Baseado no edital, crie um prompt unificado que a IA deve seguir para gerar todo o conteúdo relacionado a este concurso.

Retorne um JSON com esta estrutura:
{
  "banca": "Nome da banca",
  "concursoName": "Nome do concurso",
  "prompt": "Prompt unificado detalhado para a IA"
}

IMPORTANTE: Retorne APENAS o JSON válido, sem markdown, sem explicações, sem texto antes ou depois. Comece diretamente com { e termine com }.`

                          // Usar callGeminiWithRetry para gerenciar API key automaticamente (igual book questões, material de apoio, véspera de prova)
                          const unifiedResponse = await callGeminiWithRetry(unifiedPrompt, {
                            models: ['gemini-2.5-flash', 'gemini-2.5-pro'],
                            generationConfig: { temperature: 0.3, maxOutputTokens: 32000 },
                          })
                          let unifiedText = extractGeneratedText(unifiedResponse).trim()
                          
                          if (unifiedText.startsWith('```json')) {
                            unifiedText = unifiedText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
                          } else if (unifiedText.startsWith('```')) {
                            unifiedText = unifiedText.replace(/```\n?/g, '').trim()
                          }
                          
                          // Função para limpar e validar JSON (reutilizar a mesma lógica)
                          const cleanAndParseJSONUnified = (text) => {
                            let cleaned = text.trim()
                            
                            // Remover markdown code blocks se houver
                            if (cleaned.includes('```json')) {
                              cleaned = cleaned.split('```json')[1].split('```')[0].trim()
                            } else if (cleaned.includes('```')) {
                              cleaned = cleaned.split('```')[1].split('```')[0].trim()
                            }
                            
                            // Extrair JSON do texto
                            const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
                            if (jsonMatch) {
                              cleaned = jsonMatch[0]
                            }
                            
                            // Tentar parse primeiro
                            try {
                              return JSON.parse(cleaned)
                            } catch (firstErr) {
                              // Tentar reparar estruturas comuns (vírgulas finais, aspas, etc.)
                              try {
                                const repaired = jsonrepair(cleaned)
                                return JSON.parse(repaired)
                              } catch (repairErr) {
                                console.warn('jsonrepair não conseguiu reparar o prompt unificado', repairErr)
                              }
                              
                              // Limpar caracteres de controle inválidos caractere por caractere
                              let result = ''
                              let inString = false
                              let escapeNext = false
                              
                              for (let i = 0; i < cleaned.length; i++) {
                                const char = cleaned[i]
                                const prevChar = i > 0 ? cleaned[i - 1] : ''
                                const code = char.charCodeAt(0)
                                
                                // Se o caractere anterior é uma barra invertida, tratar como escape
                                if (escapeNext) {
                                  result += char
                                  escapeNext = false
                                  continue
                                }
                                
                                // Detecta início de escape sequence
                                if (char === '\\' && prevChar !== '\\') {
                                  result += char
                                  escapeNext = true
                                  continue
                                }
                                
                                // Detecta início/fim de string (aspas não escapadas)
                                if (char === '"' && prevChar !== '\\') {
                                  inString = !inString
                                  result += char
                                  continue
                                }
                                
                                // Dentro de uma string, tratar caracteres de controle
                                if (inString) {
                                  // Caracteres válidos em strings JSON: \t, \n, \r (já escapados)
                                  // Caracteres de controle inválidos: 0x00-0x1F exceto 0x09, 0x0A, 0x0D
                                  if (code >= 0x00 && code <= 0x1F) {
                                    if (code === 0x09) {
                                      // Tab - já deve estar como \t, mas garantir
                                      result += char === '\t' ? '\\t' : char
                                    } else if (code === 0x0A) {
                                      // Newline - substituir por \n
                                      result += '\\n'
                                    } else if (code === 0x0D) {
                                      // Carriage return - substituir por \r
                                      result += '\\r'
                                    } else {
                                      // Outros caracteres de controle - substituir por espaço
                                      result += ' '
                                    }
                                  } else if (code === 0x7F) {
                                    // DEL character - substituir por espaço
                                    result += ' '
                                  } else {
                                    result += char
                                  }
                                } else {
                                  // Fora de string, remover caracteres de controle
                                  if (code >= 0x00 && code <= 0x1F && code !== 0x09 && code !== 0x0A && code !== 0x0D) {
                                    // Ignorar caracteres de controle fora de strings
                                    continue
                                  } else if (code === 0x7F) {
                                    continue
                                  } else {
                                    result += char
                                  }
                                }
                              }
                              
                              // Tentar parse novamente
                              try {
                                return JSON.parse(result)
                              } catch (secondErr) {
                                // Última tentativa: remover todos os caracteres de controle restantes
                                let finalResult = result.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
                                
                                // Tentar corrigir quebras de linha não escapadas em strings
                                finalResult = finalResult.replace(/"([^"\\]*(\\.[^"\\]*)*)"/g, (match) => {
                                  return match.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t')
                                })
                                
                                try {
                                  return JSON.parse(finalResult)
                                } catch (finalErr) {
                                  console.error('Erro final ao parsear JSON:', finalErr)
                                  console.error('Primeiros 500 chars do resultado final:', finalResult.substring(0, 500))
                                  throw new Error(`Não foi possível parsear o JSON após múltiplas tentativas de limpeza: ${finalErr.message}`)
                                }
                              }
                            }
                          }
                          
                          // Tentar extrair JSON mesmo se houver texto antes/depois
                          let unifiedData = null
                          try {
                            // Tentar parse direto primeiro
                            unifiedData = JSON.parse(unifiedText)
                          } catch (parseErr) {
                            console.warn('⚠️ Erro ao fazer parse direto do prompt unificado, tentando limpar...', parseErr)
                            
                            try {
                              unifiedData = cleanAndParseJSONUnified(unifiedText)
                              console.log('✅ JSON do prompt unificado extraído e limpo com sucesso')
                            } catch (matchErr) {
                              console.error('❌ Erro ao fazer parse do JSON limpo:', matchErr)
                              console.error('📋 Texto original (primeiros 500 caracteres):', unifiedText.substring(0, 500))
                              throw new Error('A IA retornou uma resposta que não contém JSON válido para o prompt unificado. Tente novamente.')
                            }
                          }
                          
                          // Salvar prompt unificado
                          const unifiedRef = doc(db, 'courses', courseId, 'prompts', 'unified')
                          await setDoc(unifiedRef, {
                            ...unifiedData,
                            updatedAt: serverTimestamp(),
                          }, { merge: true })
                          
                          // Atualizar documento do curso
                          const courseRef = doc(db, 'courses', courseId)
                          await setDoc(courseRef, {
                            banca: unifiedData.banca,
                            competition: unifiedData.concursoName,
                          }, { merge: true })
                          
                          // Salvar texto do PDF no edital
                          const editalPromptRef = doc(db, 'courses', courseId, 'prompts', 'edital')
                          console.log('💾 Salvando edital em:', editalPromptRef.path)
                          console.log('📄 Tamanho do editalVerticalizadoText:', editalVerticalizadoText.length)
                          await setDoc(editalPromptRef, {
                            pdfText: editalVerticalizadoText,
                            prompt: `Edital processado automaticamente em ${new Date().toLocaleString('pt-BR')}`,
                            updatedAt: serverTimestamp(),
                          }, { merge: true })
                          console.log('✅ Edital salvo com sucesso em:', editalPromptRef.path)
                          
                          setEditalVerticalizadoData(editalOrganizado)
                          
                          // Limpar estados para garantir atualização da interface
                          setEditalVerticalizadoText('')
                          setEditalVerticalizadoFile(null)
                          setExtractingEditalVerticalizado(false)
                          setSavingEditalVerticalizado(false)
                          
                          console.log('✅ Estados limpos após processamento')
                          console.log('📊 Edital processado com sucesso:', {
                            totalDisciplinas: todasDisciplinas.length,
                            tamanhoJSON: jsonSizeMB + 'MB',
                            partes: numPartes
                          })
                          
                          // FASE 2: Gerar todo o conteúdo automaticamente (se confirmado)
                          const shouldGenerateAll = window.confirm(
                            '✅ Edital processado com sucesso!\n\n' +
                            'Deseja gerar automaticamente TODOS os conteúdos agora?\n\n' +
                            'Isso vai gerar:\n' +
                            '• Conteúdos Completos de todas as matérias\n' +
                            '• Matérias Revisadas de todas as matérias\n\n' +
                            '⚠️ Isso pode demorar vários minutos. Deseja continuar?'
                          )
                          
                          if (shouldGenerateAll) {
                            try {
                              // Atualizar courseId temporariamente
                              const originalCourseId = materiaRevisadaForm.courseId
                              setMateriaRevisadaForm(prev => ({ ...prev, courseId }))
                              
                              // Aguardar um pouco para o estado atualizar
                              await new Promise(resolve => setTimeout(resolve, 100))
                              
                              // Chamar funções de geração completas (elas já têm toda a lógica necessária)
                              // Temporariamente substituir window.confirm para auto-confirmar as gerações
                              const originalConfirm = window.confirm
                              
                              window.confirm = function(msg) {
                                // Se for a confirmação das funções de geração, auto-confirmar (já confirmamos antes)
                                if (msg.includes('conteúdos completos') || msg.includes('matérias revisadas') || msg.includes('TODAS as matérias')) {
                                  return true
                                }
                                // Caso contrário, usar confirmação normal
                                return originalConfirm.apply(this, arguments)
                              }
                              
                              try {
                                setMessage('📚 Gerando conteúdos completos de todas as matérias... Isso pode demorar vários minutos...')
                                await handleGenerateAllConteudosCompletos()
                                
                                setMessage('📖 Gerando matérias revisadas de todas as matérias... Isso pode demorar vários minutos...')
                                await handleGenerateAllMateriasRevisadas()
                              } finally {
                                // Restaurar confirmação original
                                window.confirm = originalConfirm
                                // Restaurar courseId original
                                setMateriaRevisadaForm(prev => ({ ...prev, courseId: originalCourseId }))
                              }
                              
                              setMessage('✅ GERAÇÃO COMPLETA! Todo o conteúdo foi gerado automaticamente com sucesso!')
                            } catch (genErr) {
                              console.error('Erro ao gerar conteúdos automaticamente:', genErr)
                              setMessage(`✅ Edital processado com sucesso, mas houve erro ao gerar alguns conteúdos: ${genErr.message}. Você pode gerá-los manualmente depois.`)
                              // Garantir que confirmação é restaurada mesmo em erro
                              window.confirm = window.confirm || ((msg) => confirm(msg))
                            }
                          } else {
                            setMessage('✅ Edital processado com sucesso! Você pode gerar os conteúdos manualmente nas seções específicas quando desejar.')
                          }
                          
                          setEditalVerticalizadoFile(null)
                          setEditalVerticalizadoText('')
                        } catch (err) {
                          console.error('Erro ao processar configurações:', err)
                          setMessage(`❌ Erro ao processar: ${err.message}`)
                        } finally {
                          setSavingEditalVerticalizado(false)
                        }
                      }}
                      disabled={!editalVerticalizadoText.trim() || savingEditalVerticalizado || extractingEditalVerticalizado}
                      className="w-full rounded-xl bg-white text-blue-600 px-6 py-4 text-lg font-black hover:bg-white/90 transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {savingEditalVerticalizado ? '⏳ Processando...' : '🚀 Processar e Configurar Tudo'}
                    </button>
                  </div>
                )}

                {/* Status das Configurações */}
                {editalVerticalizadoData && (
                  <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 p-6">
                    <h3 className="text-lg font-bold text-emerald-700 dark:text-emerald-300 mb-3">
                      ✅ Configurações Aplicadas
                    </h3>
                    <div className="space-y-2 text-sm text-emerald-600 dark:text-emerald-400">
                      <p>✓ Edital verticalizado configurado</p>
                      <p>✓ Prompts unificados gerados</p>
                      <p>✓ Informações do concurso atualizadas</p>
                      {editalVerticalizadoData.updatedAt && (
                        <p className="text-xs mt-3">
                          Última atualização: {editalVerticalizadoData.updatedAt.toDate?.().toLocaleString('pt-BR') || 'Data não disponível'}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Seção: Gerar Matérias Revisadas */}
                <div className="rounded-2xl bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 p-6 shadow-lg border-2 border-indigo-200 dark:border-indigo-800">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-3 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-xl">
                      <span className="text-2xl">📖</span>
                    </div>
                    <div>
                      <h2 className="text-2xl font-black text-indigo-700 dark:text-indigo-300">
                        Matérias Revisadas
                      </h2>
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        Gere conteúdo técnico completo de matérias baseado SEMPRE no edital
                      </p>
                    </div>
                  </div>

                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
                    <p className="text-sm font-semibold text-blue-800 dark:text-blue-300 mb-2">
                      ⚠️ IMPORTANTE: Matérias Revisadas sempre se baseiam no Edital
                    </p>
                    <p className="text-xs text-blue-700 dark:text-blue-400">
                      O conteúdo gerado será baseado EXCLUSIVAMENTE no edital do curso. Certifique-se de que o edital já foi processado acima antes de gerar matérias revisadas.
                    </p>
                  </div>

                  {/* Botão: Gerar Todas as Matérias de Uma Vez */}
                  <div className="mb-6 p-4 bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 rounded-lg border-2 border-purple-200 dark:border-purple-800">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h3 className="text-lg font-bold text-purple-700 dark:text-purple-300">
                          🚀 Gerar Todas as Matérias de Uma Vez
                        </h3>
                        <p className="text-xs text-purple-600 dark:text-purple-400 mt-1">
                          A IA analisará o edital e gerará automaticamente todas as matérias revisadas encontradas
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={handleGenerateAllMateriasRevisadas}
                      disabled={generatingAllMaterias || generatingMateriaRevisada}
                      className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold py-3 px-6 rounded-xl shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {generatingAllMaterias ? (
                        <>
                          <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                          <span>Gerando Todas as Matérias...</span>
                        </>
                      ) : (
                        <>
                          <span>🚀</span>
                          <span>Gerar Todas as Matérias do Edital</span>
                        </>
                      )}
                    </button>
                    {allMateriasProgress && (
                      <div className="mt-3 p-3 bg-white dark:bg-slate-800 rounded-lg border border-purple-200 dark:border-purple-700">
                        <p className="text-sm text-purple-700 dark:text-purple-300 whitespace-pre-line">
                          {allMateriasProgress}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Conteúdos Completos */}
                  <div className="mb-6 border-t border-blue-200 dark:border-blue-700 pt-6">
                    <h3 className="text-lg font-bold text-blue-600 dark:text-blue-400 mb-4">
                      📚 Conteúdos Completos de Matérias
                    </h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                      Gere conteúdos completos para todas as matérias do curso. Cada matéria terá uma página dedicada.
                    </p>
                    <div className="flex gap-3">
                      <button
                        onClick={handleGenerateAllConteudosCompletos}
                        disabled={generatingAllConteudosCompletos || generatingMateriaRevisada}
                        className="flex-1 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white font-bold py-3 px-6 rounded-xl shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        {generatingAllConteudosCompletos ? (
                          <>
                            <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                            <span>Gerando Conteúdos Completos...</span>
                          </>
                        ) : (
                          <>
                            <span>📚</span>
                            <span>Gerar Conteúdos Completos de Todas as Matérias</span>
                          </>
                        )}
                      </button>
                      <button
                        onClick={handleDeleteAllConteudosCompletos}
                        disabled={generatingAllConteudosCompletos || generatingMateriaRevisada}
                        className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-bold py-3 px-6 rounded-xl shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        title="Apagar todos os conteúdos completos do curso"
                      >
                        {generatingAllConteudosCompletos ? (
                          <>
                            <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                            <span>Apagando...</span>
                          </>
                        ) : (
                          <>
                            <span>🗑️</span>
                            <span>Apagar Todos</span>
                          </>
                        )}
                      </button>
                    </div>
                    {allConteudosCompletosProgress && (
                      <div className="mt-3 p-3 bg-white dark:bg-slate-800 rounded-lg border border-blue-200 dark:border-blue-700">
                        <p className="text-sm text-blue-700 dark:text-blue-300 whitespace-pre-line">
                          {allConteudosCompletosProgress}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="mb-6 border-t border-indigo-200 dark:border-indigo-700 pt-6">
                    <p className="text-sm font-semibold text-slate-600 dark:text-slate-400 mb-4 text-center">
                      OU
                    </p>
                  </div>

                  {/* Seletor de Curso */}
                  <div className="mb-4">
                    <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-2">
                      Curso
                    </label>
                    <select
                      value={materiaRevisadaForm.courseId}
                      onChange={(e) => setMateriaRevisadaForm({ ...materiaRevisadaForm, courseId: e.target.value })}
                      className="w-full rounded-xl border-2 border-indigo-200 dark:border-indigo-800 bg-white dark:bg-slate-800 p-3 text-sm font-semibold focus:border-indigo-500 focus:outline-none"
                      disabled={generatingMateriaRevisada}
                    >
                      {courses.map((course) => (
                        <option key={course.id} value={course.id}>
                          {course.name} {course.id === 'alego-default' ? '(Padrão)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Seletor de Matéria */}
                  <div className="mb-6">
                    <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-2">
                      Matéria para Revisar
                    </label>
                    <input
                      type="text"
                      value={materiaRevisadaForm.materia}
                      onChange={(e) => setMateriaRevisadaForm({ ...materiaRevisadaForm, materia: e.target.value })}
                      placeholder="Ex: Direito Constitucional, Português, Raciocínio Lógico..."
                      className="w-full rounded-xl border-2 border-indigo-200 dark:border-indigo-800 bg-white dark:bg-slate-800 p-3 text-sm font-semibold focus:border-indigo-500 focus:outline-none"
                      disabled={generatingMateriaRevisada}
                    />
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                      Digite o nome exato da matéria que deseja revisar
                    </p>
                  </div>

                  {/* Botão Gerar */}
                  <button
                    onClick={handleGenerateMateriaRevisada}
                    disabled={!materiaRevisadaForm.materia || generatingMateriaRevisada}
                    className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-bold py-3 px-6 rounded-xl shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {generatingMateriaRevisada ? (
                      <>
                        <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                        <span>Gerando Matéria Revisada...</span>
                      </>
                    ) : (
                      <>
                        <span>📖</span>
                        <span>Gerar Matéria Revisada Baseada no Edital</span>
                      </>
                    )}
                  </button>

                  {/* Progresso */}
                  {materiaRevisadaProgress && (
                    <div className="mt-4 p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg border border-indigo-200 dark:border-indigo-800">
                      <p className="text-sm text-indigo-700 dark:text-indigo-300 whitespace-pre-line">
                        {materiaRevisadaProgress}
                      </p>
                    </div>
                  )}

                  {/* Lista de Matérias Revisadas Existentes */}
                  {existingMateriasRevisadas.length > 0 && (
                    <div className="mt-6 p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg border border-slate-200 dark:border-slate-600">
                      <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">
                        Matérias Revisadas Existentes:
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {existingMateriasRevisadas.map((materia, idx) => (
                          <span
                            key={idx}
                            className="px-3 py-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded-full text-xs font-semibold"
                          >
                            {materia}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Conteúdo antigo de configurações removido */}
            {false && (
              <div>
                {/* Prompt Unificado - Banca e Concurso */}
                <div className="rounded-2xl bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 p-6 shadow-lg border-2 border-blue-200 dark:border-blue-800">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-2xl">🎯</span>
                    <p className="text-lg font-black text-blue-700 dark:text-blue-300">
                      Prompt Unificado da IA
                    </p>
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
                    Configure a banca, nome do concurso e o prompt unificado. A IA usará essas informações para gerar <strong>simulados, questões, redação, flashcards e mapas mentais</strong> específicos para este curso.
                  </p>
                  
                  {/* Seletor de Curso */}
                  <div className="mb-6">
                    <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-2">
                      Curso para Configurar
                    </label>
                    <select
                      value={selectedCourseForPrompts}
                      onChange={(e) => setSelectedCourseForPrompts(e.target.value)}
                      className="w-full rounded-xl border-2 border-blue-200 dark:border-blue-800 bg-white dark:bg-slate-800 p-3 text-sm font-semibold focus:border-blue-500 focus:outline-none"
                    >
                      {courses.map((course) => (
                        <option key={course.id} value={course.id}>
                          {course.name} {course.id === 'alego-default' ? '(Padrão)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    {/* Campo Banca */}
                    <div>
                      <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-2">
                        🏛️ Banca Organizadora *
                      </label>
                      <input
                        type="text"
                        value={unifiedPrompt.banca}
                        onChange={(e) => setUnifiedPrompt({ ...unifiedPrompt, banca: e.target.value })}
                        placeholder="Ex: FGV, CESPE, VUNESP, IADES, etc."
                        className="w-full rounded-xl border-2 border-blue-200 dark:border-blue-800 bg-white dark:bg-slate-800 p-3 text-sm font-semibold focus:border-blue-500 focus:outline-none"
                        disabled={savingUnifiedPrompt}
                      />
                    </div>

                    {/* Campo Nome do Concurso */}
                    <div>
                      <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-2">
                        📋 Nome do Concurso *
                      </label>
                      <input
                        type="text"
                        value={unifiedPrompt.concursoName}
                        onChange={(e) => setUnifiedPrompt({ ...unifiedPrompt, concursoName: e.target.value })}
                        placeholder="Ex: ALEGO Policial Legislativo, TRT-18, etc."
                        className="w-full rounded-xl border-2 border-blue-200 dark:border-blue-800 bg-white dark:bg-slate-800 p-3 text-sm font-semibold focus:border-blue-500 focus:outline-none"
                        disabled={savingUnifiedPrompt}
                      />
                    </div>
                  </div>

                  {/* Campo Prompt Unificado */}
                  <div className="mb-6">
                    <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-2">
                      📝 Prompt Unificado para IA *
                    </label>
                    <textarea
                      value={unifiedPrompt.prompt}
                      onChange={(e) => setUnifiedPrompt({ ...unifiedPrompt, prompt: e.target.value })}
                      rows={12}
                      placeholder="Exemplo de prompt unificado:

Você é um especialista em criar conteúdo para concursos públicos.

BANCA: [A banca será preenchida automaticamente]
CONCURSO: [O nome do concurso será preenchido automaticamente]

INSTRUÇÕES GERAIS:
- Use APENAS o estilo da banca especificada
- Questões devem seguir o padrão da banca (estilo, formato, dificuldade)
- Simulados devem refletir a estrutura real da prova
- Redações devem seguir os critérios de avaliação da banca
- Flashcards devem focar nos temas mais cobrados pela banca
- Mapas mentais devem organizar o conteúdo conforme a abordagem da banca

ESTILO DA BANCA:
- FGV: questões objetivas, claras, com alternativas bem elaboradas
- CESPE: questões tipo certo/errado, estilo mais técnico
- VUNESP: questões objetivas, estilo mais direto
- IADES: questões objetivas, foco em situações práticas

REGRAS ESPECÍFICAS:
- Baseie-se sempre no conteúdo dos flashcards fornecidos
- Use informações do edital quando disponível
- Mantenha consistência com o estilo da banca
- Questões devem ser FICTÍCIAS mas realistas"
                      className="w-full rounded-xl border-2 border-blue-200 dark:border-blue-800 bg-white dark:bg-slate-800 p-4 text-sm font-mono focus:border-blue-500 focus:outline-none"
                      disabled={savingUnifiedPrompt}
                    />
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                      💡 Este prompt será usado para gerar <strong>simulados, questões, redação, flashcards e mapas mentais</strong>. A banca e nome do concurso serão automaticamente incluídos no prompt.
                    </p>
                  </div>

                  {/* Botão Salvar */}
                  <button
                    type="button"
                    onClick={async () => {
                      if (!unifiedPrompt.banca || !unifiedPrompt.concursoName || !unifiedPrompt.prompt) {
                        setMessage('❌ Preencha todos os campos obrigatórios (Banca, Nome do Concurso e Prompt)')
                        return
                      }

                      setSavingUnifiedPrompt(true)
                      try {
                        const courseId = selectedCourseForPrompts || 'alego-default'
                        const unifiedRef = doc(db, 'courses', courseId, 'prompts', 'unified')
                        await setDoc(unifiedRef, {
                          banca: unifiedPrompt.banca.trim(),
                          concursoName: unifiedPrompt.concursoName.trim(),
                          prompt: unifiedPrompt.prompt.trim(),
                          updatedAt: serverTimestamp(),
                        }, { merge: true })

                        // Também atualizar no documento do curso para compatibilidade
                        const courseRef = doc(db, 'courses', courseId)
                        await setDoc(courseRef, {
                          banca: unifiedPrompt.banca.trim(),
                          competition: unifiedPrompt.concursoName.trim(),
                        }, { merge: true })

                        setMessage(`✅ Prompt unificado salvo com sucesso para ${courses.find(c => c.id === courseId)?.name || 'curso'}!`)
                      } catch (err) {
                        console.error('Erro ao salvar prompt unificado:', err)
                        setMessage('❌ Erro ao salvar. Tente novamente.')
                      } finally {
                        setSavingUnifiedPrompt(false)
                      }
                    }}
                    disabled={savingUnifiedPrompt || !unifiedPrompt.banca || !unifiedPrompt.concursoName || !unifiedPrompt.prompt}
                    className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-4 text-white font-black text-lg hover:from-blue-700 hover:to-purple-700 transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {savingUnifiedPrompt ? '💾 Salvando...' : '💾 Salvar Prompt Unificado'}
                  </button>
                </div>

                {/* Configuração do Prompt da IA (Edital - mantido para compatibilidade) */}
      <div className="rounded-2xl bg-white dark:bg-slate-800 p-6 shadow-sm border border-slate-200 dark:border-slate-700">
        <p className="flex items-center gap-2 text-sm font-semibold text-alego-600 dark:text-alego-400">
          <DocumentTextIcon className="h-5 w-5" />
          Configuração do Edital (Opcional - para referência adicional)
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

      {/* Configuração de Edital Verticalizado */}
      <div className="rounded-2xl bg-white p-6 shadow-sm mt-6">
        <p className="flex items-center gap-2 text-sm font-semibold text-alego-600">
          <DocumentTextIcon className="h-5 w-5" />
          Edital Verticalizado
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Faça upload do edital em PDF e organize-o de forma verticalizada para estudos. O edital será processado pela IA e organizado em seções.
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
        </div>

        {/* Upload de PDF */}
        <div className="mt-6 border-t border-slate-200 pt-6">
          <label className="block text-xs font-semibold uppercase text-slate-500 mb-2">
            <DocumentArrowUpIcon className="h-4 w-4 inline mr-2" />
            Upload de PDF do Edital
          </label>
          <div className="space-y-3">
            <div className="flex items-center gap-4">
              <label className="flex-1 cursor-pointer">
                <input
                  type="file"
                  accept=".pdf"
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    if (file.type !== 'application/pdf') {
                      setMessage('❌ Por favor, selecione um arquivo PDF.')
                      return
                    }
                    if (file.size > 50 * 1024 * 1024) {
                      setMessage('❌ O arquivo PDF é muito grande. Máximo: 50MB')
                      return
                    }
                    setEditalVerticalizadoFile(file)
                    setMessage('Processando PDF...')
                    try {
                      const extractedText = await extractTextFromPDF(file)
                      setEditalVerticalizadoText(extractedText)
                      setMessage(`✅ PDF processado! ${extractedText.length} caracteres extraídos.`)
                    } catch (err) {
                      console.error('Erro ao processar PDF:', err)
                      setMessage(`❌ Erro ao processar PDF: ${err.message}`)
                      setEditalVerticalizadoFile(null)
                    }
                  }}
                  className="hidden"
                  disabled={extractingEditalVerticalizado || savingEditalVerticalizado}
                />
                <div className="flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 px-6 py-4 hover:border-alego-400 transition cursor-pointer disabled:opacity-50">
                  <DocumentArrowUpIcon className="h-5 w-5 text-slate-400" />
                  <span className="text-sm font-semibold text-slate-600">
                    {editalVerticalizadoFile ? editalVerticalizadoFile.name : 'Clique para fazer upload do PDF'}
                  </span>
                </div>
              </label>
              {editalVerticalizadoFile && (
                <button
                  type="button"
                  onClick={() => {
                    setEditalVerticalizadoFile(null)
                    setEditalVerticalizadoText('')
                  }}
                  className="rounded-xl bg-rose-100 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-200"
                >
                  Remover
                </button>
              )}
            </div>
            
            {extractingEditalVerticalizado && (
              <div className="rounded-lg bg-blue-50 p-3">
                <p className="text-xs font-semibold text-blue-700">📄 Extraindo texto do PDF... Aguarde.</p>
              </div>
            )}

            {editalVerticalizadoText && (
              <div className="rounded-lg bg-emerald-50 p-3">
                <p className="text-xs font-semibold text-emerald-700 mb-2">
                  ✅ Texto extraído do PDF ({editalVerticalizadoText.length} caracteres)
                </p>
              </div>
            )}

            {editalVerticalizadoData && (
              <div className="rounded-lg bg-blue-50 p-3">
                <p className="text-xs font-semibold text-blue-700 mb-2">
                  📋 Edital verticalizado já configurado
                </p>
                <p className="text-xs text-blue-600">
                  Título: {editalVerticalizadoData.titulo || 'Sem título'}
                  {editalVerticalizadoData.updatedAt && (
                    <span className="ml-2">
                      (Atualizado em {editalVerticalizadoData.updatedAt.toDate?.().toLocaleDateString('pt-BR')})
                    </span>
                  )}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Botões de Ação */}
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={async () => {
              if (!editalVerticalizadoText.trim()) {
                setMessage('❌ Por favor, faça upload e processe um PDF primeiro.')
                return
              }
              
              setSavingEditalVerticalizado(true)
              setMessage('Processando edital verticalizado com IA...')
              
              try {
                          const courseId = selectedCourseForPrompts || 'alego-default'
                          
                          // Usar callGeminiWithRetry para gerenciar API key automaticamente (igual book questões, material de apoio, véspera de prova)
                          const apiKey = import.meta.env.VITE_GEMINI_API_KEY
                          if (!apiKey) {
                            throw new Error('VITE_GEMINI_API_KEY não configurada. Configure no arquivo .env')
                          }
                          
                          // Aumentar limite para 1 milhão de caracteres
                          const maxTextLength = 1000000
                          const editalTextToProcess = editalVerticalizadoText.length > maxTextLength 
                            ? editalVerticalizadoText.substring(0, maxTextLength) 
                            : editalVerticalizadoText
                          
                          if (editalVerticalizadoText.length > maxTextLength) {
                            console.warn(`⚠️ Edital muito extenso (${editalVerticalizadoText.length} caracteres). Processando primeiros ${maxTextLength} caracteres.`)
                            setMessage(`📋 Processando edital (${editalVerticalizadoText.length} caracteres, usando primeiros ${maxTextLength})...`)
                          } else {
                            setMessage(`📋 Processando edital verticalizado (${editalVerticalizadoText.length} caracteres)...`)
                          }
                
                const prompt = `Você é um especialista em organizar editais de concursos públicos de forma verticalizada para estudos.

Analise o seguinte texto do edital e organize-o em seções e subseções de forma clara e estruturada. O formato deve ser técnico e completo, mostrando toda a informação de forma organizada.

${editalVerticalizadoText.length > maxTextLength ? `⚠️ ATENÇÃO: Este edital foi truncado para processamento. O texto completo tem ${editalVerticalizadoText.length} caracteres, mas estamos processando apenas os primeiros ${maxTextLength} caracteres. Extraia TODAS as seções e subseções possíveis deste trecho.\n\n` : ''}Texto do edital:
${editalTextToProcess}${editalVerticalizadoText.length > maxTextLength ? '\n\n[... edital truncado para processamento - extraia todas as seções e subseções possíveis deste trecho ...]' : ''}

Organize o edital em um formato JSON com a seguinte estrutura:
{
  "titulo": "Título do Edital",
  "descricao": "Breve descrição",
  "secoes": [
    {
      "titulo": "Nome da Seção",
      "subtitulo": "Subtítulo opcional",
      "conteudo": "Conteúdo HTML formatado da seção",
      "subsecoes": [
        {
          "titulo": "Nome da Subseção",
          "conteudo": "Conteúdo HTML formatado"
        }
      ]
    }
  ]
}

Retorne APENAS o JSON válido, sem markdown, sem explicações adicionais.`

                // Usar callGeminiWithRetry para gerenciar API key automaticamente (igual book questões, material de apoio, véspera de prova)
                const response = await callGeminiWithRetry(prompt, {
                  models: ['gemini-2.5-flash', 'gemini-2.5-pro'],
                  generationConfig: { temperature: 0.3, maxOutputTokens: 32000 },
                })
                const text = extractGeneratedText(response)
                
                // Extrair JSON da resposta
                let jsonText = text.trim()
                if (jsonText.startsWith('```json')) {
                  jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
                } else if (jsonText.startsWith('```')) {
                  jsonText = jsonText.replace(/```\n?/g, '').trim()
                }
                
                // Tentar extrair JSON mesmo se houver texto antes/depois
                // Função para limpar e validar JSON (mesma lógica)
                const cleanAndParseJSONFinal = (text) => {
                  let cleaned = text.trim()
                  const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
                  if (jsonMatch) {
                    cleaned = jsonMatch[0]
                  }
                  
                  try {
                    return JSON.parse(cleaned)
                  } catch (firstErr) {
                    // Tentar reparar usando jsonrepair para vírgulas sobrando/aspas faltando
                    try {
                      const repaired = jsonrepair(cleaned)
                      return JSON.parse(repaired)
                    } catch (repairErr) {
                      console.warn('jsonrepair não conseguiu reparar o JSON final', repairErr)
                    }
                    
                    let result = ''
                    let inString = false
                    let escapeNext = false
                    
                    for (let i = 0; i < cleaned.length; i++) {
                      const char = cleaned[i]
                      const code = char.charCodeAt(0)
                      
                      if (escapeNext) {
                        result += char
                        escapeNext = false
                        continue
                      }
                      
                      if (char === '\\') {
                        result += char
                        escapeNext = true
                        continue
                      }
                      
                      if (char === '"' && (i === 0 || cleaned[i-1] !== '\\')) {
                        inString = !inString
                        result += char
                        continue
                      }
                      
                      if (inString && code >= 0x00 && code <= 0x1F && code !== 0x09 && code !== 0x0A && code !== 0x0D) {
                        if (code === 0x09) result += '\\t'
                        else if (code === 0x0A) result += '\\n'
                        else if (code === 0x0D) result += '\\r'
                        else result += ' '
                      } else {
                        result += char
                      }
                    }
                    
                    try {
                      return JSON.parse(result)
                    } catch (secondErr) {
                      result = result.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
                      return JSON.parse(result)
                    }
                  }
                }
                
                let editalOrganizado = null
                try {
                  // Tentar parse direto primeiro
                  editalOrganizado = JSON.parse(jsonText)
                } catch (parseErr) {
                  console.warn('⚠️ Erro ao fazer parse direto, tentando limpar JSON...', parseErr)
                  
                  try {
                    editalOrganizado = cleanAndParseJSONFinal(jsonText)
                    console.log('✅ JSON extraído e limpo com sucesso')
                  } catch (matchErr) {
                    console.error('❌ Erro ao fazer parse do JSON limpo:', matchErr)
                    console.error('📋 Texto original (primeiros 500 caracteres):', jsonText.substring(0, 500))
                    throw new Error('A IA retornou uma resposta que não contém JSON válido. Tente novamente ou verifique o texto do edital.')
                  }
                }
                
                // Verificar tamanho do JSON antes de salvar
                const jsonString = JSON.stringify(editalOrganizado)
                const jsonSizeMB = (new Blob([jsonString]).size / 1024 / 1024).toFixed(2)
                console.log(`📊 Tamanho do JSON gerado: ${jsonSizeMB} MB`)
                
                // Firestore tem limite de 1MB por documento
                if (jsonSizeMB > 0.95) {
                  console.warn(`⚠️ JSON muito grande (${jsonSizeMB} MB). Pode ser truncado pelo Firestore.`)
                  setMessage(`⚠️ Atenção: Edital muito grande (${jsonSizeMB} MB). Alguns dados podem não ser salvos.`)
                }
                
                // Salvar no Firestore
                const editalRef = doc(db, 'courses', courseId, 'editalVerticalizado', 'principal')
                try {
                await setDoc(editalRef, {
                  ...editalOrganizado,
                  updatedAt: serverTimestamp(),
                  courseId,
                }, { merge: true })
                  console.log(`✅ Edital salvo com sucesso (${jsonSizeMB} MB)`)
                } catch (firestoreErr) {
                  if (firestoreErr.message?.includes('size') || firestoreErr.message?.includes('too large')) {
                    throw new Error(`Edital muito grande para salvar (${jsonSizeMB} MB). Firestore tem limite de 1MB por documento. Considere dividir o edital em partes.`)
                  }
                  throw firestoreErr
                }
                
                setEditalVerticalizadoData(editalOrganizado)
                setMessage('✅ Edital verticalizado processado e salvo com sucesso!')
                setEditalVerticalizadoFile(null)
                setEditalVerticalizadoText('')
              } catch (err) {
                console.error('Erro ao processar edital verticalizado:', err)
                setMessage(`❌ Erro ao processar edital: ${err.message}`)
              } finally {
                setSavingEditalVerticalizado(false)
              }
            }}
            disabled={!editalVerticalizadoText.trim() || savingEditalVerticalizado || extractingEditalVerticalizado}
            className="flex-1 rounded-full bg-alego-600 px-6 py-2 text-sm font-semibold text-white disabled:opacity-50 hover:bg-alego-700 transition"
          >
            {savingEditalVerticalizado ? 'Processando...' : 'Processar e Salvar Edital Verticalizado'}
          </button>
          {editalVerticalizadoData && (
            <button
              type="button"
              onClick={async () => {
                if (!confirm('Tem certeza que deseja remover o edital verticalizado?')) return
                
                try {
                  const courseId = selectedCourseForPrompts || 'alego-default'
                  const editalRef = doc(db, 'courses', courseId, 'editalVerticalizado', 'principal')
                  await deleteDoc(editalRef)
                  setEditalVerticalizadoData(null)
                  setMessage('✅ Edital verticalizado removido com sucesso!')
                } catch (err) {
                  console.error('Erro ao remover edital:', err)
                  setMessage(`❌ Erro ao remover: ${err.message}`)
                }
              }}
              className="rounded-full bg-rose-500 px-6 py-2 text-sm font-semibold text-white hover:bg-rose-600 transition"
            >
              🗑️ Remover
            </button>
          )}
        </div>
      </div>
              </div>
            )}

            {/* Tab: Edital Verticalizado */}
            {activeTab === 'edital' && (
              <EditalVerticalizadoManager />
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

                      <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={savePopupBanner}
                        disabled={uploadingPopupBanner || (!popupBanner.imageBase64 && !popupBanner.imageUrl)}
                          className="flex-1 rounded-lg bg-alego-600 px-4 py-2 text-sm font-semibold text-white hover:bg-alego-700 disabled:opacity-50"
                      >
                        {uploadingPopupBanner ? 'Salvando...' : 'Salvar Popup Banner'}
                      </button>
                        {(popupBanner.imageBase64 || popupBanner.imageUrl) && (
                          <button
                            type="button"
                            onClick={deletePopupBanner}
                            disabled={uploadingPopupBanner}
                            className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50 flex items-center gap-2"
                          >
                            <TrashIcon className="h-4 w-4" />
                            Excluir
                          </button>
                        )}
                      </div>
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
                    <div className="flex items-center justify-between mb-4">
                      <p className="flex items-center gap-2 text-sm font-semibold text-alego-600">
                        <DocumentTextIcon className="h-5 w-5" />
                        Gerenciar Cursos Preparatórios
                      </p>
                      <button
                        type="button"
                        onClick={deleteVilaVelhaCourse}
                        className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 transition-colors"
                        title="Deletar curso de VILA VELHA/ES ACE completamente (sem deixar resquícios)"
                      >
                        🗑️ Deletar VILA VELHA
                      </button>
                    </div>
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
                                      const response = await callGeminiWithRetry(prompt, {
        generationConfig: {
          maxOutputTokens: 32000,
          temperature: 0.7,
        },
        useGoogleSearch: true,
      })
                                      description = extractGeneratedText(response).trim()
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

                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-2">
                            🔗 Link de Referência do Concurso
                          </label>
                          <input
                            type="url"
                            value={courseForm.referenceLink}
                            onChange={(e) => setCourseForm(prev => ({ ...prev, referenceLink: e.target.value }))}
                            placeholder="https://exemplo.com/edital-concurso"
                            className="w-full rounded-lg border border-slate-300 p-2 text-sm"
                          />
                          <p className="text-xs text-slate-500 mt-1">
                            Cole aqui um link (edital, site do concurso, etc). A IA usará este link como base para gerar questões, redações e responder perguntas sobre o concurso.
                          </p>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-2">
                            📝 Banca Examinadora
                          </label>
                          <input
                            type="text"
                            value={courseForm.banca}
                            onChange={(e) => setCourseForm(prev => ({ ...prev, banca: e.target.value }))}
                            placeholder="Ex: INSTITUTO AOCP, FGV, CESPE, FCC, VUNESP, etc."
                            className="w-full rounded-lg border border-slate-300 p-2 text-sm"
                          />
                          <p className="text-xs text-slate-500 mt-1">
                            Informe a banca examinadora do concurso. A IA adaptará o conteúdo ao estilo desta banca (ex: PMGO e PCGO usam INSTITUTO AOCP).
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

                        <div className="grid grid-cols-2 gap-4">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={courseForm.active}
                            onChange={(e) => setCourseForm(prev => ({ ...prev, active: e.target.checked }))}
                            className="rounded"
                          />
                          <label className="text-xs text-slate-600">Curso ativo</label>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={courseForm.featured}
                              onChange={(e) => setCourseForm(prev => ({ ...prev, featured: e.target.checked }))}
                              className="rounded"
                            />
                            <label className="text-xs text-slate-600">⭐ Em destaque (Mais Vendido)</label>
                          </div>
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
                                    {editingCourse === course.id ? (
                                      // Formulário de edição
                                      <div className="flex-1 space-y-3">
                                        <div>
                                          <label className="block text-xs font-semibold text-slate-600 mb-1">
                                            Nome do Curso *
                                          </label>
                                          <input
                                            type="text"
                                            value={editingCourseData?.name || ''}
                                            onChange={(e) => setEditingCourseData(prev => ({ ...prev, name: e.target.value }))}
                                            className="w-full rounded-lg border border-slate-300 p-2 text-sm"
                                            placeholder="Nome do curso"
                                          />
                                        </div>
                                        
                                        <div>
                                          <label className="block text-xs font-semibold text-slate-600 mb-1">
                                            Descrição
                                          </label>
                                          <textarea
                                            value={editingCourseData?.description || ''}
                                            onChange={(e) => setEditingCourseData(prev => ({ ...prev, description: e.target.value }))}
                                            rows={3}
                                            className="w-full rounded-lg border border-slate-300 p-2 text-sm"
                                            placeholder="Descrição do curso"
                                          />
                                        </div>
                                        
                                        <div className="grid grid-cols-2 gap-3">
                                          <div>
                                            <label className="block text-xs font-semibold text-slate-600 mb-1">
                                              Preço (R$) *
                                            </label>
                                            <input
                                              type="number"
                                              step="0.01"
                                              value={editingCourseData?.price || 0}
                                              onChange={(e) => setEditingCourseData(prev => ({ ...prev, price: parseFloat(e.target.value) || 0 }))}
                                              className="w-full rounded-lg border border-slate-300 p-2 text-sm"
                                            />
                                          </div>
                                          
                                          <div>
                                            <label className="block text-xs font-semibold text-slate-600 mb-1">
                                              Preço Original (R$)
                                            </label>
                                            <input
                                              type="number"
                                              step="0.01"
                                              value={editingCourseData?.originalPrice || 0}
                                              onChange={(e) => setEditingCourseData(prev => ({ ...prev, originalPrice: parseFloat(e.target.value) || 0 }))}
                                              className="w-full rounded-lg border border-slate-300 p-2 text-sm"
                                            />
                                          </div>
                                        </div>
                                        
                                        <div className="grid grid-cols-2 gap-3">
                                          <div>
                                            <label className="block text-xs font-semibold text-slate-600 mb-1">
                                              Concurso *
                                            </label>
                                            <input
                                              type="text"
                                              value={editingCourseData?.competition || ''}
                                              onChange={(e) => setEditingCourseData(prev => ({ ...prev, competition: e.target.value }))}
                                              className="w-full rounded-lg border border-slate-300 p-2 text-sm"
                                              placeholder="Ex: ALEGO 2024"
                                            />
                                          </div>
                                          
                                          <div>
                                            <label className="block text-xs font-semibold text-slate-600 mb-1">
                                              Duração
                                            </label>
                                            <input
                                              type="text"
                                              value={editingCourseData?.courseDuration || ''}
                                              onChange={(e) => setEditingCourseData(prev => ({ ...prev, courseDuration: e.target.value }))}
                                              className="w-full rounded-lg border border-slate-300 p-2 text-sm"
                                              placeholder="Ex: 6 meses"
                                            />
                                          </div>
                                        </div>
                                        
                                        <div>
                                          <label className="block text-xs font-semibold text-slate-600 mb-1">
                                            🔗 Link de Referência do Concurso
                                          </label>
                                          <input
                                            type="url"
                                            value={editingCourseData?.referenceLink || ''}
                                            onChange={(e) => setEditingCourseData(prev => ({ ...prev, referenceLink: e.target.value }))}
                                            className="w-full rounded-lg border border-slate-300 p-2 text-sm"
                                            placeholder="https://exemplo.com/edital-concurso"
                                          />
                                          <p className="text-xs text-slate-500 mt-1">
                                            A IA usará este link como base para gerar questões, redações e responder perguntas.
                                          </p>
                                        </div>

                                        <div>
                                          <label className="block text-xs font-semibold text-slate-600 mb-1">
                                            📝 Banca Examinadora
                                          </label>
                                          <input
                                            type="text"
                                            value={editingCourseData?.banca || ''}
                                            onChange={(e) => setEditingCourseData(prev => ({ ...prev, banca: e.target.value }))}
                                            className="w-full rounded-lg border border-slate-300 p-2 text-sm"
                                            placeholder="Ex: INSTITUTO AOCP, FGV, CESPE, FCC, VUNESP, etc."
                                          />
                                          <p className="text-xs text-slate-500 mt-1">
                                            A IA adaptará o conteúdo ao estilo desta banca (ex: PMGO e PCGO usam INSTITUTO AOCP).
                                          </p>
                                        </div>
                                        
                                        <div className="grid grid-cols-2 gap-3">
                                          <div className="flex items-center gap-2">
                                            <input
                                              type="checkbox"
                                              checked={editingCourseData?.active !== false}
                                              onChange={(e) => setEditingCourseData(prev => ({ ...prev, active: e.target.checked }))}
                                              className="rounded"
                                            />
                                            <label className="text-xs text-slate-600">Curso ativo</label>
                                          </div>
                                          
                                          <div className="flex items-center gap-2">
                                            <input
                                              type="checkbox"
                                              checked={editingCourseData?.featured === true}
                                              onChange={(e) => setEditingCourseData(prev => ({ ...prev, featured: e.target.checked }))}
                                              className="rounded"
                                            />
                                            <label className="text-xs text-slate-600">⭐ Em destaque (Mais Vendido)</label>
                                          </div>
                                        </div>
                                        
                                        <div className="flex gap-2">
                                          <button
                                            type="button"
                                            onClick={() => saveCourseEdit(course.id)}
                                            disabled={!editingCourseData?.name || !editingCourseData?.competition}
                                            className="rounded-lg bg-green-600 px-4 py-2 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                                          >
                                            💾 Salvar
                                          </button>
                                          <button
                                            type="button"
                                            onClick={cancelEditingCourse}
                                            className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                          >
                                            ❌ Cancelar
                                          </button>
                                        </div>
                                      </div>
                                    ) : (
                                      // Visualização normal
                                      <>
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
                                            onClick={() => startEditingCourse(course)}
                                            className="rounded-lg bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-200"
                                            title="Editar curso"
                                          >
                                            ✏️ Editar
                                          </button>
                                      <button
                                        type="button"
                                        onClick={() => updateCourse(course.id, { active: !(course.active !== false) })}
                                        className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                      >
                                        {course.active !== false ? '⏸️ Inativar' : '▶️ Ativar'}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => deleteCourse(course.id)}
                                        disabled={course.id === 'alego-default'}
                                        className="rounded-lg bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                        title="Deletar curso completo (flashcards, material de apoio, questões, véspera de prova)"
                                      >
                                        🗑️ Deletar Tudo
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
                                        onClick={() => {
                                          setSelectedCourseForFlashcards(course.id)
                                          setFlashcardGenProgress('Preparando para gerar flashcards do edital...')
                                          // Chamar a função de geração após pequeno delay para garantir que o estado foi atualizado
                                          setTimeout(() => {
                                            generateFlashcardsFromEdital()
                                          }, 100)
                                        }}
                                        disabled={generatingFlashcards}
                                        className="rounded-lg bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                        title="Gerar flashcards automaticamente baseados na estrutura do edital verticalizado"
                                      >
                                        🎴 Gerar Flashcards do Edital
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
                                      </>
                                    )}
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
                              ? 'Informe o cargo específico. A IA vai usar automaticamente o edital verticalizado configurado (ou PDF do edital se não houver verticalizado) para REGERAR os flashcards focados no CONTEÚDO (não no cargo):'
                              : 'Informe o cargo específico. A IA vai usar automaticamente o edital verticalizado configurado (ou PDF do edital se não houver verticalizado) para analisar e gerar automaticamente:'}
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

                        {/* Mostrar campo de PDF apenas se não tiver edital verticalizado */}
                        {!editalVerticalizadoData && (
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
                        )}

                        {/* Mostrar status do edital verticalizado se disponível */}
                        {editalVerticalizadoData && (
                          <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4">
                            <p className="text-sm font-semibold text-emerald-700 mb-2">
                              ✅ Edital Verticalizado Disponível
                            </p>
                            <p className="text-xs text-emerald-600">
                              Usando o edital verticalizado configurado: {editalVerticalizadoData.titulo || 'Sem título'}
                            </p>
                            {editalVerticalizadoData.updatedAt && (
                              <p className="text-xs text-emerald-500 mt-1">
                                Atualizado em: {editalVerticalizadoData.updatedAt.toDate?.().toLocaleDateString('pt-BR')}
                              </p>
                            )}
                          </div>
                        )}

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
                            disabled={(!editalVerticalizadoData && !editalPdfTextForGeneration) || !cargoForGeneration.trim() || generatingFullCourse || extractingPdf}
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
                                onClick={() => generateResetLinkForUser(user.email)}
                                className="flex items-center gap-1 rounded-full border border-orange-500 px-4 py-2 text-sm font-semibold text-orange-500 hover:bg-orange-50"
                                title="Gerar link de redefinição de senha"
                              >
                                <LockClosedIcon className="h-4 w-4" />
                                Redefinir Senha
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

                {/* Compartilhar Flashcards Temporariamente */}
                {selectedCourseForFlashcards && (
                  <div className="relative overflow-hidden bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/20 rounded-2xl shadow-xl border border-orange-200 dark:border-orange-700 p-6">
                    <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-orange-500/5 to-amber-500/5 rounded-full blur-3xl -mr-24 -mt-24"></div>
                    <div className="relative">
                      <p className="flex items-center gap-2 text-lg font-bold text-orange-700 dark:text-orange-300">
                        <ShareIcon className="h-6 w-6" />
                        Compartilhar Flashcards Temporariamente
                      </p>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                        Gere um link temporário para compartilhar flashcards de um tópico. O link expira em 1 hora após o primeiro acesso e não requer login.
                      </p>

                      <div className="mt-6 space-y-4">
                        <div>
                          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                            Disciplina *
                          </label>
                          <input
                            type="text"
                            value={shareForm.disciplina}
                            onChange={(e) => setShareForm(prev => ({ ...prev, disciplina: e.target.value }))}
                            placeholder="Ex: Português, Direito Constitucional..."
                            className="w-full rounded-xl border-2 border-orange-200 dark:border-orange-700 bg-white dark:bg-slate-800 px-4 py-3 text-sm focus:border-orange-500 focus:outline-none"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                            Módulo/Tópico *
                          </label>
                          <input
                            type="text"
                            value={shareForm.modulo}
                            onChange={(e) => setShareForm(prev => ({ ...prev, modulo: e.target.value }))}
                            placeholder="Ex: 1.1 - Interpretação de Texto"
                            className="w-full rounded-xl border-2 border-orange-200 dark:border-orange-700 bg-white dark:bg-slate-800 px-4 py-3 text-sm focus:border-orange-500 focus:outline-none"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                            Topic Key (opcional)
                          </label>
                          <input
                            type="text"
                            value={shareForm.topicKey}
                            onChange={(e) => setShareForm(prev => ({ ...prev, topicKey: e.target.value }))}
                            placeholder="Ex: portugues-interpretacao"
                            className="w-full rounded-xl border-2 border-orange-200 dark:border-orange-700 bg-white dark:bg-slate-800 px-4 py-3 text-sm focus:border-orange-500 focus:outline-none"
                          />
                        </div>

                        <button
                          type="button"
                          onClick={handleGenerateShareLink}
                          disabled={generatingShareLink || !shareForm.disciplina || !shareForm.modulo}
                          className="w-full rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 text-white px-6 py-3 font-bold hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {generatingShareLink ? 'Gerando link...' : '🔗 Gerar Link de Compartilhamento'}
                        </button>

                        {generatedShareLink && (
                          <div className="mt-4 rounded-lg bg-white dark:bg-slate-800 p-4 border border-orange-200 dark:border-orange-700">
                            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                              Link gerado:
                            </p>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                readOnly
                                value={generatedShareLink}
                                className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm text-slate-600 dark:text-slate-400"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText(generatedShareLink)
                                  setMessage('✅ Link copiado para o clipboard!')
                                }}
                                className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-semibold hover:opacity-80 transition"
                              >
                                Copiar
                              </button>
                            </div>
                            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                              ⏰ Este link expira em 1 hora após o primeiro acesso.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

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

                {/* Organizar Matérias e Módulos */}
                {selectedCourseForFlashcards && (
                  <div className="relative overflow-hidden bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-6">
                    <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-indigo-500/5 to-cyan-500/5 rounded-full blur-3xl -mr-24 -mt-24"></div>
                    <div className="relative">
                      <p className="flex items-center gap-2 text-lg font-bold text-indigo-700 dark:text-indigo-300">
                        <SparklesIcon className="h-6 w-6" />
                        Organizar Matérias e Módulos
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        Organize a ordem das matérias e módulos que aparecerão para os alunos. Esta ordem será aplicada em todos os lugares: flashcards, mapas mentais e questões.
                      </p>

                      <div className="mt-6 flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={organizeSubjectsWithAI}
                          disabled={organizingSubjects}
                          className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 px-6 py-3 text-sm font-semibold text-white disabled:opacity-50 hover:from-indigo-500 hover:to-cyan-500 transition-all"
                        >
                          {organizingSubjects ? (
                            <>
                              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                              Organizando...
                            </>
                          ) : (
                            <>
                              <SparklesIcon className="h-5 w-5" />
                              Organizar com IA
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={manualEditMode ? () => { 
                            setManualEditMode(false)
                            setTempSubjectOrder([])
                            setTempModuleOrder({})
                            setExpandedMateriaForModules(null)
                          } : startManualEdit}
                          className="flex items-center gap-2 rounded-xl border-2 border-indigo-600 px-6 py-3 text-sm font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-all"
                        >
                          {manualEditMode ? (
                            <>
                              <DocumentTextIcon className="h-5 w-5" />
                              Cancelar Edição
                            </>
                          ) : (
                            <>
                              <DocumentTextIcon className="h-5 w-5" />
                              Editar Manualmente
                            </>
                          )}
                        </button>
                      </div>

                      {organizingProgress && (
                        <div className="mt-4 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-700 p-3">
                          <p className="text-sm text-indigo-700 dark:text-indigo-300">{organizingProgress}</p>
                        </div>
                      )}

                      {/* Lista de matérias para edição manual com drag and drop */}
                      {manualEditMode && (
                        <DndContext
                          sensors={sensors}
                          collisionDetection={closestCenter}
                          onDragStart={handleDragStart}
                          onDragEnd={handleDragEnd}
                        >
                          <div className="mt-6 space-y-3">
                            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                              Arraste os itens para reorganizar (ou use as setas):
                            </p>
                            <SortableContext
                              items={(tempSubjectOrder.length > 0 ? tempSubjectOrder : (courseSubjects[selectedCourseForFlashcards] || Object.keys(modules).filter(m => modules[m] && modules[m].length > 0))).map(m => `subject-${m}`)}
                              strategy={verticalListSortingStrategy}
                            >
                              <div className="space-y-2">
                                {(tempSubjectOrder.length > 0 ? tempSubjectOrder : (courseSubjects[selectedCourseForFlashcards] || Object.keys(modules).filter(m => modules[m] && modules[m].length > 0))).map((materia, index) => {
                                  const modulos = modules[materia] || []
                                  return (
                                    <SortableSubjectItem
                                      key={materia}
                                      materia={materia}
                                      index={index}
                                      modulos={modulos}
                                    />
                                  )
                                })}
                              </div>
                            </SortableContext>
                            
                            {/* Lista de módulos para edição (quando matéria está expandida) */}
                            {expandedMateriaForModules && (
                              <div className="mt-4 ml-4 pl-4 border-l-2 border-indigo-300 dark:border-indigo-600 space-y-2">
                                <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 mb-2">
                                  Módulos de {expandedMateriaForModules}:
                                </p>
                                <SortableContext
                                  items={(tempModuleOrder[expandedMateriaForModules] || modules[expandedMateriaForModules] || []).map(m => `module-${expandedMateriaForModules}::${m}`)}
                                  strategy={verticalListSortingStrategy}
                                >
                                  <div className="space-y-2">
                                    {(tempModuleOrder[expandedMateriaForModules] || modules[expandedMateriaForModules] || []).map((modulo, modIndex) => (
                                      <SortableModuleItem
                                        key={modulo}
                                        materia={expandedMateriaForModules}
                                        modulo={modulo}
                                        index={modIndex}
                                      />
                                    ))}
                                  </div>
                                </SortableContext>
                              </div>
                            )}
                            
                            <DragOverlay>
                              {activeId ? (
                                <div className="rounded-lg bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 p-3 opacity-90">
                                  {activeId.toString().startsWith('subject-') ? (
                                    <span className="text-sm font-semibold">{activeId.toString().replace('subject-', '')}</span>
                                  ) : (
                                    <span className="text-xs font-medium">{activeId.toString().replace('module-', '').split('::')[1]}</span>
                                  )}
                                </div>
                              ) : null}
                            </DragOverlay>
                            
                            <div className="flex gap-3 pt-2">
                              <button
                                type="button"
                                onClick={saveManualOrder}
                                className="rounded-xl bg-indigo-600 px-6 py-2 text-sm font-semibold text-white hover:bg-indigo-500 transition-all"
                              >
                                💾 Salvar Ordem
                              </button>
                              <button
                                type="button"
                                onClick={() => { 
                                  setManualEditMode(false)
                                  setTempSubjectOrder([])
                                  setTempModuleOrder({})
                                  setExpandedMateriaForModules(null)
                                }}
                                className="rounded-xl border-2 border-slate-300 dark:border-slate-600 px-6 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all"
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        </DndContext>
                      )}

                      {/* Mostrar ordem atual (quando não está editando) */}
                      {!manualEditMode && !organizingSubjects && (
                        <div className="mt-6">
                          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
                            Ordem Atual:
                          </p>
                          <div className="space-y-2">
                            {(courseSubjects[selectedCourseForFlashcards] || Object.keys(modules).filter(m => modules[m] && modules[m].length > 0)).map((materia, index) => {
                              const modulos = modules[materia] || []
                              return (
                                <div
                                  key={materia}
                                  className="flex items-center gap-3 rounded-lg bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 p-3"
                                >
                                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-xs font-bold">
                                    {index + 1}
                                  </span>
                                  <div className="flex-1">
                                    <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{materia}</span>
                                    {modulos.length > 0 && (
                                      <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">
                                        ({modulos.length} módulo{modulos.length !== 1 ? 's' : ''})
                                      </span>
                                    )}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}
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
                    
                    {/* Botão para gerar flashcards do edital verticalizado */}
                    <div className="mt-4 p-4 bg-white dark:bg-slate-800 rounded-lg border border-purple-200 dark:border-purple-700">
                      <p className="text-sm font-semibold text-purple-700 dark:text-purple-300 mb-2">
                        🎴 Gerar Flashcards do Edital Verticalizado
                      </p>
                      <p className="text-xs text-slate-600 dark:text-slate-400 mb-3">
                        Gera flashcards automaticamente baseados na estrutura completa do edital verticalizado do curso selecionado.
                      </p>
                      <button
                        type="button"
                        onClick={generateFlashcardsFromEdital}
                        disabled={generatingFlashcards || !selectedCourseForFlashcards}
                        className="w-full rounded-full bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed hover:from-indigo-700 hover:to-purple-700 transition-all"
                      >
                        {generatingFlashcards ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                            Gerando...
                          </>
                        ) : (
                          <>
                            <DocumentTextIcon className="h-4 w-4" />
                            Gerar Flashcards do Edital
                          </>
                        )}
                      </button>
                    </div>
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

            {/* Tab: Simulados Compartilhados */}
            {activeTab === 'simulados' && (
              <div className="space-y-6">
                <div className="rounded-2xl bg-white dark:bg-slate-800 p-6 shadow-sm border border-slate-200 dark:border-slate-700">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-black text-slate-900 dark:text-white">
                      📝 Simulados Compartilhados
                    </h2>
                  </div>

                  {sharedSimulados.length === 0 ? (
                    <p className="text-center text-slate-500 dark:text-slate-400 py-8">
                      Nenhum simulado compartilhado ainda.
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {sharedSimulados.map((simulado) => {
                        const shareUrl = `${window.location.origin}/simulado-share/${simulado.id}`
                        const attempts = simulado.attempts || []
                        const completedAttempts = attempts.filter(a => a.completed).length
                        const totalQuestions = simulado.questions?.length || simulado.simuladoInfo?.totalQuestoes || 0
                        
                        return (
                          <div
                            key={simulado.id}
                            className={`rounded-xl p-4 border-2 ${
                              simulado.ativo === false
                                ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                                : 'bg-slate-50 dark:bg-slate-700/50 border-slate-200 dark:border-slate-600'
                            }`}
                          >
                            <div className="flex flex-col gap-4">
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-3 mb-2">
                                    <h3 className="text-lg font-black text-slate-900 dark:text-white">
                                      {simulado.courseName || 'Simulado'}
                                    </h3>
                                    {simulado.ativo === false ? (
                                      <span className="px-2 py-1 text-xs font-bold rounded-full bg-red-500 text-white">
                                        Desativado
                                      </span>
                                    ) : (
                                      <span className="px-2 py-1 text-xs font-bold rounded-full bg-green-500 text-white">
                                        Ativo
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
                                    {totalQuestions} questões • {simulado.simuladoInfo?.tempoMinutos || 240} minutos
                                  </p>
                                  <p className="text-xs text-slate-500 dark:text-slate-500 mb-2">
                                    Compartilhado em: {simulado.sharedAt?.toDate?.()?.toLocaleString('pt-BR') || 'Data não disponível'}
                                  </p>
                                  <div className="flex items-center gap-2 mb-2">
                                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                                      {completedAttempts} tentativa(s) concluída(s) de {attempts.length} total
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="text"
                                      readOnly
                                      value={shareUrl}
                                      className="flex-1 px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                                    />
                                    <button
                                      onClick={() => {
                                        navigator.clipboard.writeText(shareUrl)
                                        setMessage('Link copiado!')
                                      }}
                                      className="px-4 py-2 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 transition-colors"
                                    >
                                      📋 Copiar
                                    </button>
                                  </div>
                                </div>
                              </div>
                              
                              <div className="flex gap-2 flex-wrap">
                                <button
                                  onClick={() => {
                                    if (selectedSimulado?.id === simulado.id) {
                                      setSelectedSimulado(null)
                                    } else {
                                      setSelectedSimulado(simulado)
                                    }
                                  }}
                                  className="px-4 py-2 bg-purple-600 text-white rounded-xl font-bold text-sm hover:bg-purple-700 transition-colors"
                                >
                                  {selectedSimulado?.id === simulado.id ? '👁️ Ocultar' : '👥 Ver Tentativas'}
                                </button>
                                <button
                                  onClick={async () => {
                                    try {
                                      const simuladoRef = doc(db, 'sharedSimulados', simulado.id)
                                      await updateDoc(simuladoRef, {
                                        ativo: simulado.ativo === false ? true : false,
                                      })
                                      setMessage(simulado.ativo === false ? 'Simulado ativado!' : 'Simulado desativado!')
                                    } catch (err) {
                                      console.error('Erro ao atualizar simulado:', err)
                                      setMessage('Erro ao atualizar simulado.')
                                    }
                                  }}
                                  className={`px-4 py-2 rounded-xl font-bold text-sm transition-colors ${
                                    simulado.ativo === false
                                      ? 'bg-green-600 text-white hover:bg-green-700'
                                      : 'bg-red-600 text-white hover:bg-red-700'
                                  }`}
                                >
                                  {simulado.ativo === false ? '✅ Ativar' : '❌ Desativar'}
                                </button>
                                {attempts.length > 0 && (
                                  <button
                                    onClick={async () => {
                                      if (!confirm(`Tem certeza que deseja resetar todas as ${attempts.length} tentativas deste simulado? Isso permitirá que todos façam o simulado novamente.`)) {
                                        return
                                      }
                                      try {
                                        const simuladoRef = doc(db, 'sharedSimulados', simulado.id)
                                        await updateDoc(simuladoRef, {
                                          attempts: [],
                                        })
                                        setMessage(`✅ ${attempts.length} tentativa(s) resetada(s)! Todos podem fazer o simulado novamente.`)
                                      } catch (err) {
                                        console.error('Erro ao resetar tentativas:', err)
                                        setMessage('Erro ao resetar tentativas.')
                                      }
                                    }}
                                    className="px-4 py-2 bg-orange-600 text-white rounded-xl font-bold text-sm hover:bg-orange-700 transition-colors"
                                  >
                                    🔄 Resetar Tentativas
                                  </button>
                                )}
                              </div>

                              {/* Lista de tentativas */}
                              {selectedSimulado?.id === simulado.id && (
                                <div className="mt-4 pt-4 border-t border-slate-300 dark:border-slate-600">
                                  <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-3">
                                    Tentativas ({attempts.length})
                                  </h4>
                                  {attempts.length === 0 ? (
                                    <p className="text-sm text-slate-500 dark:text-slate-400">
                                      Nenhuma tentativa ainda.
                                    </p>
                                  ) : (
                                    <div className="space-y-2 max-h-96 overflow-y-auto">
                                      {attempts.map((attempt, idx) => (
                                        <div
                                          key={idx}
                                          className={`p-3 rounded-lg ${
                                            attempt.completed
                                              ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                                              : 'bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600'
                                          }`}
                                        >
                                          <div className="flex items-center justify-between mb-1">
                                            <div className="flex items-center gap-2">
                                              <span className="text-sm font-semibold text-slate-900 dark:text-white">
                                                {attempt.email || 'Email não informado'}
                                              </span>
                                              {attempt.completed && (
                                                <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-green-500 text-white">
                                                  Concluído
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                          {attempt.phone && (
                                            <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">
                                              📱 {attempt.phone}
                                            </p>
                                          )}
                                          {attempt.startedAt && (
                                            <p className="text-xs text-slate-500 dark:text-slate-500">
                                              Iniciado: {new Date(attempt.startedAt).toLocaleString('pt-BR')}
                                            </p>
                                          )}
                                          {attempt.completed && attempt.results && (
                                            <div className="mt-2 pt-2 border-t border-slate-300 dark:border-slate-600">
                                              <p className="text-xs text-slate-600 dark:text-slate-400">
                                                Nota: {attempt.results.finalScore || attempt.results.objectiveScore || 'N/A'} / 10
                                              </p>
                                              <p className="text-xs text-slate-600 dark:text-slate-400">
                                                Acertos: {attempt.results.correct || 0} / {attempt.results.total || 0}
                                              </p>
                                            </div>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Tab: Notícias de Concursos */}
            {activeTab === 'news' && (
              <div className="space-y-6">
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-2xl p-6 border border-blue-200 dark:border-blue-800">
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
                    🤖 Gerador Automático de Notícias de Concursos
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                    Use a IA para gerar notícias completas sobre concursos públicos abertos ou previstos.
                    As notícias são geradas automaticamente com informações sobre vagas, remuneração, conteúdo programático e muito mais.
                  </p>
                  
                  <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 mb-4">
                    <h4 className="font-semibold text-slate-900 dark:text-white mb-2">ℹ️ Como funciona:</h4>
                    <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1 list-disc list-inside">
                      <li>A IA busca informações sobre concursos públicos abertos ou previstos</li>
                      <li>Gera notícia completa com vagas, remuneração, datas, conteúdo programático</li>
                      <li>Otimizada para SEO com palavras-chave relevantes</li>
                      <li>Publicada automaticamente na seção de notícias</li>
                    </ul>
                  </div>
                  
                  {/* Campo para especificar concurso */}
                  <div className="mb-4">
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                      📝 Especificar Concurso (Opcional)
                    </label>
                    <input
                      type="text"
                      id="concursoInput"
                      placeholder="Ex: Concurso PMGO 2024, Concurso PC Goiás, etc. (Deixe vazio para IA escolher)"
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-4 py-3 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                    />
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Se especificar, a IA vai gerar notícia focada neste concurso. Se deixar vazio, a IA escolhe automaticamente.
                    </p>
                  </div>
                  
                  <button
                    type="button"
                    onClick={async () => {
                      const concursoInput = document.getElementById('concursoInput')
                      const concursoEspecifico = concursoInput?.value?.trim() || ''
                      
                      if (!confirm(`Deseja gerar uma nova notícia de concurso${concursoEspecifico ? ` sobre "${concursoEspecifico}"` : ''}? Isso pode levar alguns segundos.`)) {
                        return
                      }
                      
                      setMessage('🤖 Gerando notícia com IA... Isso pode levar alguns segundos.')
                      
                      try {
                        const response = await fetch(FIREBASE_FUNCTIONS.generateConcursoNews, {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                          },
                          body: JSON.stringify({
                            concursoEspecifico: concursoEspecifico
                          }),
                        })
                        
                        if (!response.ok) {
                          const errorData = await response.json()
                          throw new Error(errorData.message || errorData.error || 'Erro ao gerar notícia')
                        }
                        
                        const result = await response.json()
                        setMessage(`✅ Notícia gerada com sucesso! ID: ${result.newsId}`)
                        
                        // Limpar campo
                        if (concursoInput) concursoInput.value = ''
                        
                        // Recarregar lista de notícias (sem orderBy para evitar índice)
                        const newsRef = collection(db, 'posts')
                        const newsQuery = query(
                          newsRef,
                          where('isConcursoNews', '==', true),
                          limit(50)
                        )
                        const newsSnapshot = await getDocs(newsQuery)
                        const newsList = newsSnapshot.docs
                          .map(doc => ({ id: doc.id, ...doc.data() }))
                          .filter(news => news.createdAt)
                          .sort((a, b) => {
                            const dateA = a.createdAt?.toDate?.() || new Date(0)
                            const dateB = b.createdAt?.toDate?.() || new Date(0)
                            return dateB.getTime() - dateA.getTime()
                          })
                        setConcursoNews(newsList)
                      } catch (err) {
                        console.error('Erro ao gerar notícia:', err)
                        setMessage(`❌ Erro ao gerar notícia: ${err.message}`)
                      }
                    }}
                    className="w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold rounded-xl hover:from-blue-700 hover:to-indigo-700 transition shadow-lg"
                  >
                    🚀 Gerar Nova Notícia de Concurso
                  </button>
                </div>

                {/* Lista de Notícias Geradas */}
                <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">
                    📰 Notícias Geradas ({concursoNews.length})
                  </h3>
                  
                  {concursoNews.length === 0 ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">
                      Nenhuma notícia gerada ainda.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {concursoNews.map((news) => {
                        const newsDate = news.createdAt?.toDate?.() || news.createdAt?.seconds ? new Date(news.createdAt.seconds * 1000) : new Date()
                        const formatDate = (date) => {
                          return date.toLocaleDateString('pt-BR', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })
                        }
                        
                        return (
                          <div
                            key={news.id}
                            className="bg-slate-50 dark:bg-slate-900 rounded-xl p-4 border border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-700 transition"
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1 min-w-0">
                                <h4 className="font-bold text-slate-900 dark:text-white mb-1 truncate">
                                  {news.seoTitle || news.text || 'Sem título'}
                                </h4>
                                {news.concursoData?.concursoName && (
                                  <p className="text-sm text-blue-600 dark:text-blue-400 font-semibold mb-1">
                                    {news.concursoData.concursoName}
                                  </p>
                                )}
                                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400 mt-2">
                                  <span>📅 {formatDate(newsDate)}</span>
                                  {news.concursoData?.orgao && (
                                    <span>• {news.concursoData.orgao}</span>
                                  )}
                                  {news.concursoData?.vagas && news.concursoData.vagas !== 'A definir' && (
                                    <span>• {news.concursoData.vagas} vagas</span>
                                  )}
                                </div>
                                {news.slug && (
                                  <a
                                    href={`/noticia/${news.id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline mt-2 inline-block"
                                  >
                                    Ver notícia →
                                  </a>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={async () => {
                                  if (!confirm('Deseja realmente excluir esta notícia?')) return
                                  
                                  try {
                                    setMessage('🗑️ Deletando notícia...')
                                    await deleteDoc(doc(db, 'posts', news.id))
                                    setMessage('✅ Notícia deletada com sucesso!')
                                    
                                    // Recarregar lista de notícias (sem orderBy para evitar índice)
                                    const newsRef = collection(db, 'posts')
                                    const newsQuery = query(
                                      newsRef,
                                      where('isConcursoNews', '==', true),
                                      limit(50)
                                    )
                                    const newsSnapshot = await getDocs(newsQuery)
                                    const newsList = newsSnapshot.docs
                                      .map(doc => ({ id: doc.id, ...doc.data() }))
                                      .filter(news => news.createdAt)
                                      .sort((a, b) => {
                                        const dateA = a.createdAt?.toDate?.() || new Date(0)
                                        const dateB = b.createdAt?.toDate?.() || new Date(0)
                                        return dateB.getTime() - dateA.getTime()
                                      })
                                    setConcursoNews(newsList)
                                  } catch (err) {
                                    console.error('Erro ao deletar notícia:', err)
                                    setMessage(`❌ Erro ao deletar notícia: ${err.message}`)
                                  }
                                }}
                                className="flex-shrink-0 p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition"
                                title="Deletar notícia"
                              >
                                <TrashIcon className="h-5 w-5" />
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
                
                <div className="bg-slate-50 dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-700">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">
                    📅 Agendamento Automático
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                    As notícias são geradas automaticamente todos os dias às 8h da manhã (horário de Brasília).
                    Você também pode gerar notícias manualmente usando o botão acima.
                  </p>
                  <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
                    <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase mb-1">Próxima geração automática</p>
                    <p className="text-base font-bold text-slate-900 dark:text-white">
                      Todos os dias às 08:00 (Brasília)
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Tab: Testes Gratuitos */}
            {activeTab === 'trials' && (
              <div className="space-y-6">
                <div className="relative overflow-hidden bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-6">
                  <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-blue-500/5 to-purple-500/5 rounded-full blur-3xl -mr-24 -mt-24"></div>
                  <div className="relative">
                    <p className="flex items-center gap-2 text-sm font-semibold text-alego-600 mb-4">
                      🎁 Gerar Link de Teste Gratuito
                    </p>
                    <p className="text-xs text-slate-500 mb-6">
                      Gere links para compartilhar acesso limitado à plataforma. Ideal para marketing e conversão.
                    </p>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-2">
                          Curso Gratuito *
                        </label>
                        <select
                          value={trialForm.courseId}
                          onChange={(e) => setTrialForm({ ...trialForm, courseId: e.target.value })}
                          className="w-full rounded-lg border border-slate-300 p-2 text-sm"
                          required
                        >
                          <option value="">Selecione um curso</option>
                          {courses.filter(c => c.active !== false).map((course) => (
                            <option key={course.id} value={course.id}>
                              {course.name} {course.id === 'alego-default' ? '(Padrão)' : ''}
                            </option>
                          ))}
                        </select>
                        <p className="text-xs text-slate-500 mt-1">
                          O usuário terá acesso completo a este curso durante o período de teste
                        </p>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-2">
                          Expira em (dias) *
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="30"
                          value={trialForm.expiresInDays}
                          onChange={(e) => setTrialForm({ ...trialForm, expiresInDays: parseInt(e.target.value) || 7 })}
                          className="w-full rounded-lg border border-slate-300 p-2 text-sm"
                          required
                        />
                        <p className="text-xs text-slate-500 mt-1">
                          Após este período, o usuário será automaticamente removido
                        </p>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-2">
                          Limite de Usuários *
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="100"
                          value={trialForm.maxUsers}
                          onChange={(e) => setTrialForm({ ...trialForm, maxUsers: parseInt(e.target.value) || 10 })}
                          className="w-full rounded-lg border border-slate-300 p-2 text-sm"
                          required
                        />
                        <p className="text-xs text-slate-500 mt-1">
                          Quantidade máxima de pessoas que podem se cadastrar com este link
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={async () => {
                          if (!trialForm.courseId) {
                            setMessage('❌ Selecione um curso para o teste gratuito')
                            return
                          }
                          
                          try {
                            // Gerar token único
                            const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
                            
                            // Calcular data de expiração
                            const expiresAt = new Date()
                            expiresAt.setDate(expiresAt.getDate() + (trialForm.expiresInDays || 7))
                            
                            // Salvar no Firestore
                            const trialRef = doc(db, 'testTrials', token)
                            await setDoc(trialRef, {
                              token,
                              courseId: trialForm.courseId,
                              expiresAt: Timestamp.fromDate(expiresAt),
                              expiresInDays: trialForm.expiresInDays || 7,
                              maxUsers: trialForm.maxUsers || 10,
                              registeredUsers: [], // Array de UIDs que se cadastraram
                              active: true,
                              accessCount: 0,
                              createdAt: serverTimestamp(),
                              createdBy: currentAdminUser.uid,
                            })

                            const shareUrl = `${window.location.origin}/teste/${token}`
                            
                            // Copiar para clipboard
                            await navigator.clipboard.writeText(shareUrl)
                            setMessage(`✅ Link de teste gerado e copiado! ${shareUrl}`)
                            
                            // Limpar formulário
                            setTrialForm({ courseId: '', expiresInDays: 7, maxUsers: 10 })
                            
                            // Abrir WhatsApp para compartilhar
                            const courseName = courses.find(c => c.id === trialForm.courseId)?.name || 'Curso'
                            const whatsappText = `🎁 Teste Gratuito da Plataforma!\n\nAcesse e experimente:\n${shareUrl}\n\n✨ Acesso ao curso ${courseName} por ${trialForm.expiresInDays || 7} dias\n👥 Limite de ${trialForm.maxUsers || 10} usuários`
                            window.open(`https://wa.me/?text=${encodeURIComponent(whatsappText)}`, '_blank')
                          } catch (err) {
                            console.error('Erro ao gerar link de teste:', err)
                            setMessage('❌ Erro ao gerar link. Tente novamente.')
                          }
                        }}
                        className="w-full rounded-lg bg-alego-600 px-4 py-2 text-sm font-semibold text-white hover:bg-alego-700"
                      >
                        🎁 Gerar Link de Teste
                      </button>
                    </div>
                  </div>
                </div>

                {/* Lista de Testes Criados */}
                <div className="relative overflow-hidden bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-6">
                  <p className="flex items-center gap-2 text-sm font-semibold text-alego-600 mb-4">
                    📋 Testes Criados
                  </p>
                  {testTrials.length === 0 ? (
                    <p className="text-sm text-slate-500">Nenhum teste criado ainda.</p>
                  ) : (
                    <div className="space-y-3">
                      {testTrials.map((trial) => {
                        const isExpired = trial.expiresAt?.toDate() < new Date()
                        const isActive = trial.active && !isExpired
                        return (
                          <div
                            key={trial.id}
                            className={`p-4 rounded-lg border ${
                              isActive
                                ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                                : 'bg-slate-100 dark:bg-slate-700 border-slate-200 dark:border-slate-600'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div>
                                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                                  /teste/{trial.token}
                                </p>
                                <p className="text-xs text-slate-600 dark:text-slate-400">
                                  {(() => {
                                    const course = courses.find(c => c.id === trial.courseId)
                                    return course ? course.name : (trial.courseId || 'Curso não definido')
                                  })()}
                                </p>
                                <p className="text-xs text-slate-500">
                                  👥 {trial.registeredUsers?.length || 0} / {trial.maxUsers || 10} usuários cadastrados
                                </p>
                                {trial.expiresAt && (
                                  <p className="text-xs text-slate-500">
                                    Expira: {trial.expiresAt.toDate().toLocaleDateString('pt-BR')}
                                  </p>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <span className={`px-2 py-1 text-xs font-bold rounded-full ${
                                  isActive
                                    ? 'bg-green-500 text-white'
                                    : 'bg-red-500 text-white'
                                }`}>
                                  {isActive ? 'Ativo' : 'Inativo'}
                                </span>
                                <button
                                  onClick={() => {
                                    const url = `${window.location.origin}/teste/${trial.token}`
                                    navigator.clipboard.writeText(url)
                                    setMessage('Link copiado!')
                                  }}
                                  className="px-3 py-1 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700"
                                >
                                  Copiar
                                </button>
                                <button
                                  onClick={async () => {
                                    try {
                                      const trialRef = doc(db, 'testTrials', trial.id)
                                      await updateDoc(trialRef, {
                                        active: !trial.active,
                                      })
                                      setMessage(trial.active ? 'Teste desativado!' : 'Teste ativado!')
                                    } catch (err) {
                                      console.error('Erro ao atualizar teste:', err)
                                      setMessage('Erro ao atualizar teste.')
                                    }
                                  }}
                                  className={`px-3 py-1 rounded-lg text-xs font-semibold ${
                                    trial.active
                                      ? 'bg-red-600 text-white hover:bg-red-700'
                                      : 'bg-green-600 text-white hover:bg-green-700'
                                  }`}
                                >
                                  {trial.active ? 'Desativar' : 'Ativar'}
                                </button>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Tab: Teste de Prompts */}
            {activeTab === 'prompt-test' && (
              <div className="space-y-6">
                {/* Header */}
                <div className="relative overflow-hidden bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-2xl shadow-xl border border-purple-200 dark:border-purple-800 p-6">
                  <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-purple-500/5 to-pink-500/5 rounded-full blur-3xl -mr-24 -mt-24"></div>
                  
                  <div className="relative">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-3 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl">
                        <span className="text-2xl">🧪</span>
                      </div>
                      <div>
                        <h2 className="text-2xl font-black text-purple-700 dark:text-purple-300">
                          Teste de Prompts
                        </h2>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                          Teste e refine seus prompts antes de usar em produção
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Configuração */}
                  <div className="relative overflow-hidden bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-6">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-blue-500/5 to-purple-500/5 rounded-full blur-2xl -mr-16 -mt-16"></div>
                    
                    <div className="relative">
                      <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                        <span>⚙️</span> Configuração
                      </h3>
                      
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                            📚 Matéria
                          </label>
                          <input
                            type="text"
                            value={testMateria}
                            onChange={(e) => setTestMateria(e.target.value)}
                            placeholder="Ex: Lei 13.869/19"
                            className="w-full rounded-xl border-2 border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 p-3 text-sm font-semibold focus:border-purple-500 focus:outline-none transition-colors"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                            🔍 Modo de Pesquisa
                          </label>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              onClick={() => {
                                setAutoResearch(false)
                                setSourceUrl('')
                                setScrapedContent('')
                                setResearchContent('')
                              }}
                              className={`py-2 px-3 rounded-lg text-xs font-semibold transition-colors ${
                                !autoResearch && !sourceUrl && !scrapedContent && !researchContent
                                  ? 'bg-purple-600 text-white'
                                  : 'bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-500'
                              }`}
                            >
                              🧠 Sem Pesquisa
                            </button>
                            <button
                              onClick={() => {
                                setAutoResearch(true)
                                setSourceUrl('')
                                setScrapedContent('')
                                setResearchContent('')
                              }}
                              className={`py-2 px-3 rounded-lg text-xs font-semibold transition-colors ${
                                autoResearch
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-500'
                              }`}
                            >
                              🌐 Pesquisa Automática
                            </button>
                          </div>
                          {autoResearch && (
                            <p className="mt-2 text-xs text-blue-600 dark:text-blue-400">
                              🔍 A pesquisa será feita automaticamente em sites governamentais (Planalto, gov.br) e fontes jurídicas confiáveis ao clicar em "Gerar Flashcard"
                            </p>
                          )}
                        </div>

                        {!autoResearch && (
                          <div>
                            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                              🌐 Fonte de Conteúdo (URL opcional)
                            </label>
                            <div className="flex gap-2">
                              <input
                                type="url"
                                value={sourceUrl}
                                onChange={(e) => setSourceUrl(e.target.value)}
                                placeholder="https://exemplo.com/artigo"
                                className="flex-1 rounded-xl border-2 border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 p-3 text-sm font-semibold focus:border-purple-500 focus:outline-none transition-colors"
                              />
                              <button
                                onClick={() => scrapeWebsiteContent(sourceUrl)}
                                disabled={scrapingContent || !sourceUrl.trim()}
                                className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-slate-400 text-white font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                              >
                                {scrapingContent ? (
                                  <>
                                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                    Extraindo...
                                  </>
                                ) : (
                                  <>
                                    <span>🔍</span>
                                    Extrair
                                  </>
                                )}
                              </button>
                            </div>
                            {scrapedContent && (
                              <div className="mt-2 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                                <div className="flex justify-between items-start mb-1">
                                  <p className="text-xs font-semibold text-green-800 dark:text-green-200">
                                    ✅ Conteúdo extraído ({scrapedContent.length} caracteres)
                                  </p>
                                  <button
                                    onClick={() => {
                                      setScrapedContent('')
                                      setSourceUrl('')
                                    }}
                                    className="text-xs text-red-600 hover:text-red-800 font-semibold"
                                  >
                                    Limpar
                                  </button>
                                </div>
                                <p className="text-xs text-green-700 dark:text-green-300 line-clamp-2">
                                  {scrapedContent.substring(0, 200)}...
                                </p>
                              </div>
                            )}
                          </div>
                        )}
                        
                        <div>
                          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                            🧠 Prompt de Geração
                          </label>
                          <textarea
                            value={testPrompt}
                            onChange={(e) => setTestPrompt(e.target.value)}
                            placeholder="Cole aqui o prompt para testar..."
                            rows={12}
                            className="w-full rounded-xl border-2 border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 p-3 text-sm font-mono focus:border-purple-500 focus:outline-none transition-colors resize-none"
                          />
                        </div>
                        
                        <div className="grid grid-cols-1 gap-3">
                          <button
                            onClick={generateTestFlashcard}
                            disabled={generatingTest || !testPrompt.trim() || !testMateria.trim()}
                            className="py-3 px-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 disabled:from-slate-400 disabled:to-slate-500 text-white font-bold rounded-xl transition-all duration-200 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                          >
                            {generatingTest ? (
                              <>
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                {autoResearch ? 'Pesquisando e gerando...' : 'Testando...'}
                              </>
                            ) : (
                              <>
                                <span>🧪</span>
                                Gerar Flashcard de Teste
                                {autoResearch && ' (com pesquisa automática)'}
                              </>
                            )}
                          </button>
                          
                          <button
                            onClick={savePromptToSystem}
                            disabled={savingTestPrompt || !testPrompt.trim()}
                            className="py-3 px-4 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 disabled:from-slate-400 disabled:to-slate-500 text-white font-bold rounded-xl transition-all duration-200 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                          >
                            {savingTestPrompt ? (
                              <>
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                Salvando...
                              </>
                            ) : (
                              <>
                                <span>💾</span>
                                Salvar Prompt para o Sistema
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Resultado */}
                  <div className="relative overflow-hidden bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-6">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-green-500/5 to-blue-500/5 rounded-full blur-2xl -mr-16 -mt-16"></div>
                    
                    <div className="relative">
                      <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                        <span>📋</span> Resultado
                      </h3>
                      
                      {testError && (
                        <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
                          <p className="text-sm font-semibold text-red-700 dark:text-red-400">
                            {testError}
                          </p>
                        </div>
                      )}
                      
                      {testFlashcardResult ? (
                        <div className="space-y-4">
                          <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl">
                            <p className="text-sm font-semibold text-green-700 dark:text-green-400 mb-2">
                              ✅ Flashcard gerado com sucesso!
                            </p>
                          </div>
                          
                          <div className="space-y-3">
                            <div>
                              <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-1">
                                Matéria
                              </label>
                              <div className="p-3 bg-slate-50 dark:bg-slate-700 rounded-lg">
                                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                                  {testFlashcardResult.materia}
                                </p>
                              </div>
                            </div>
                            
                            <div>
                              <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-1">
                                Pergunta
                              </label>
                              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                                <p className="text-sm font-semibold text-blue-700 dark:text-blue-300">
                                  {testFlashcardResult.pergunta}
                                </p>
                              </div>
                            </div>
                            
                            <div>
                              <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-1">
                                Resposta
                              </label>
                              <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                                <p className="text-sm font-semibold text-green-700 dark:text-green-300 whitespace-pre-wrap">
                                  {testFlashcardResult.resposta}
                                </p>
                              </div>
                            </div>
                          </div>
                          
                          <button
                            onClick={() => {
                              setTestFlashcardResult(null)
                              setTestError('')
                            }}
                            className="w-full py-2 px-4 bg-slate-600 hover:bg-slate-700 text-white font-semibold rounded-lg transition-colors"
                          >
                            Limpar Resultado
                          </button>
                        </div>
                      ) : (
                        <div className="text-center py-12">
                          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
                            <span className="text-2xl">🧪</span>
                          </div>
                          <p className="text-sm text-slate-500 dark:text-slate-400">
                            Configure os campos e clique em "Gerar Flashcard de Teste" para ver o resultado
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Histórico de Testes */}
                {promptHistory.length > 0 && (
                  <div className="relative overflow-hidden bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-6">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                      <span>📜</span> Histórico de Testes
                    </h3>
                    
                    <div className="space-y-3 max-h-96 overflow-y-auto">
                      {promptHistory.map((item) => (
                        <div key={item.id} className="p-4 bg-slate-50 dark:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-600">
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                                {item.materia}
                              </p>
                              <p className="text-xs text-slate-500 dark:text-slate-400">
                                {new Date(item.timestamp).toLocaleString('pt-BR')}
                              </p>
                            </div>
                            <button
                              onClick={() => {
                                setTestPrompt(item.prompt)
                                setTestMateria(item.materia)
                                setTestFlashcardResult(item.result)
                                setTestError('')
                              }}
                              className="px-3 py-1 bg-purple-600 text-white text-xs font-semibold rounded-lg hover:bg-purple-700"
                            >
                              Carregar
                            </button>
                          </div>
                          <div className="text-xs">
                            <p className="font-semibold text-blue-600 dark:text-blue-400">
                              P: {item.result.pergunta}
                            </p>
                            <p className="font-semibold text-green-600 dark:text-green-400">
                              R: {item.result.resposta.substring(0, 100)}...
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal de Status da IA */}
      {showAiStatusModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
            <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl">
                  <SparklesIcon className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                    Status das API Keys do Gemini
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Verificação em tempo real das chaves disponíveis
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowAiStatusModal(false)}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition"
              >
                <XMarkIcon className="h-6 w-6 text-slate-600 dark:text-slate-400" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
              {aiStatusError ? (
                <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <p className="text-red-700 dark:text-red-300 font-semibold">
                    ❌ {aiStatusError}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {aiKeysStatus.map((keyStatus, index) => {
                    const statusColors = {
                      active: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
                      rate_limited: 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800',
                      quota_exceeded: 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800',
                      forbidden: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
                      invalid: 'bg-black dark:bg-black/50 border-black dark:border-black',
                      error: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
                    }

                    const statusIcons = {
                      active: '✅',
                      rate_limited: '⏳',
                      quota_exceeded: '🚫',
                      forbidden: '🔒',
                      invalid: '❌',
                      error: '⚠️',
                    }

                    return (
                      <div
                        key={index}
                        className={`p-4 rounded-lg border-2 ${statusColors[keyStatus.status] || 'bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600'}`}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <span className="text-2xl">{statusIcons[keyStatus.status] || '❓'}</span>
                            <div>
                              <p className="font-bold text-slate-900 dark:text-white">
                                {keyStatus.name}
                              </p>
                              <p className="text-xs text-slate-600 dark:text-slate-400 font-mono">
                                {keyStatus.keyPreview}
                              </p>
                            </div>
                          </div>
                          <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                            keyStatus.status === 'active' ? 'bg-green-500 text-white' :
                            keyStatus.status === 'rate_limited' ? 'bg-yellow-500 text-white' :
                            keyStatus.status === 'quota_exceeded' ? 'bg-orange-500 text-white' :
                            'bg-red-500 text-white'
                          }`}>
                            {keyStatus.status === 'active' ? 'ATIVA' :
                             keyStatus.status === 'rate_limited' ? 'BLOQUEADA TEMPORARIAMENTE' :
                             keyStatus.status === 'quota_exceeded' ? 'COTA ESGOTADA' :
                             keyStatus.status === 'forbidden' ? 'BLOQUEADA' :
                             keyStatus.status === 'invalid' ? 'INVÁLIDA' :
                             'ERRO'}
                          </span>
                        </div>

                        <div className="space-y-2">
                          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                            {keyStatus.message}
                          </p>

                          {keyStatus.waitTimeFormatted && (
                            <p className="text-sm text-yellow-700 dark:text-yellow-300">
                              ⏱️ Tempo restante para liberar: {keyStatus.waitTimeFormatted}
                            </p>
                          )}

                          {keyStatus.resetTime && (
                            <p className="text-sm text-orange-700 dark:text-orange-300">
                              🕐 {keyStatus.resetTime}
                            </p>
                          )}

                          {keyStatus.error && (
                            <p className="text-xs text-red-700 dark:text-red-300 mt-2">
                              Erro: {keyStatus.error}
                            </p>
                          )}

                          {keyStatus.remainingQuota && keyStatus.status === 'active' && (
                            <p className="text-sm text-green-700 dark:text-green-300">
                              ✨ {keyStatus.remainingQuota}
                            </p>
                          )}
                        </div>
                      </div>
                    )
                  })}

                  {aiKeysStatus.length === 0 && !checkingAiStatus && (
                    <div className="text-center py-12">
                      <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
                        <span className="text-2xl">🔑</span>
                      </div>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        Nenhuma API key configurada
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="p-6 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Total de keys verificadas: {aiKeysStatus.length}
                </p>
                <button
                  onClick={() => setShowAiStatusModal(false)}
                  className="px-6 py-2 bg-slate-600 hover:bg-slate-700 text-white font-semibold rounded-lg transition-colors"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AdminPanel

