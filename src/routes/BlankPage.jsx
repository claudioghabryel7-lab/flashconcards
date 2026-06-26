import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { collection, onSnapshot, query, where, orderBy, doc, getDoc, addDoc, updateDoc, deleteDoc, serverTimestamp, limit, Timestamp } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { FIREBASE_FUNCTIONS } from '../config/firebaseFunctions'

const BlankPage = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user, isAdmin, login, register, logout } = useAuth()
  
  // Verificar se veio com parâmetro admin
  const isAdminMode = searchParams.get('admin') === 'true' && isAdmin
  
  // Estados principais
  const [view, setView] = useState(isAdminMode ? 'admin' : 'home') // 'home', 'article', 'admin'
  const [selectedArticle, setSelectedArticle] = useState(null)
  const [articles, setArticles] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedCategory, setSelectedCategory] = useState('TODAS')
  const [searchTerm, setSearchTerm] = useState('')
  
  // Estados de autenticação
  const [showLogin, setShowLogin] = useState(false)
  const [isRegisterMode, setIsRegisterMode] = useState(false)
  const [authForm, setAuthForm] = useState({ email: '', password: '', name: '' })
  const [authError, setAuthError] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  
  // Estados do Admin
  const [showAdmin, setShowAdmin] = useState(false)
  const [editingArticle, setEditingArticle] = useState(null)
  const [articleForm, setArticleForm] = useState({
    title: '',
    content: '',
    excerpt: '',
    category: '',
    tags: [],
    metaTitle: '',
    metaDescription: '',
    slug: '',
    featuredImage: '',
    scheduledDate: '',
    scheduledTime: '',
    status: 'draft', // 'draft', 'published', 'scheduled'
    courseLink: '' // Link para o curso preparatório da matéria
  })
  
  // Estados da IA
  const [aiGenerating, setAiGenerating] = useState(false)
  const [aiForm, setAiForm] = useState({
    topic: '',
    referenceUrl: '',
    tone: 'formal',
    keywords: ''
  })
  
  // Estados de upload de imagem
  const [uploadingImage, setUploadingImage] = useState(false)
  const imageInputRef = useRef(null)
  
  // Categorias
  const categories = [
    'TODAS',
    'CONCURSOS',
    'EDITAIS',
    'VAGAS',
    'POLÍCIA',
    'JUDICIÁRIO',
    'ADMINISTRATIVO',
    'TRIBUNAIS',
    'NOTÍCIAS GERAIS'
  ]
  
  // Carregar artigos
  useEffect(() => {
    if (!db) {
      setLoading(false)
      return
    }
    
    const articlesRef = collection(db, 'blog_articles')
    
    // Carregar artigos - usar query com filtro de status para evitar problemas de permissão
    const tryLoadArticles = () => {
      let q
      try {
        // Para usuários normais: filtrar apenas artigos publicados
        // Para admin: carregar todos (sem filtro de status)
        if (isAdmin) {
          // Admin pode ver todos os artigos (incluindo drafts)
          if (selectedCategory !== 'TODAS') {
            q = query(articlesRef, where('category', '==', selectedCategory))
          } else {
            q = query(articlesRef)
          }
        } else {
          // Usuários normais só veem publicados
          if (selectedCategory !== 'TODAS') {
            q = query(articlesRef, where('category', '==', selectedCategory), where('status', '==', 'published'))
          } else {
            q = query(articlesRef, where('status', '==', 'published'))
          }
        }
        
        const unsubscribe = onSnapshot(
          q,
          (snapshot) => {
            const data = snapshot.docs
              .map((doc) => ({
                id: doc.id,
                ...doc.data(),
              }))
              .filter(article => {
                // Admin vê todos
                if (isAdmin) return true
                // Usuários normais (com ou sem login) só veem publicados ou agendados (se já passou a data)
                if (article.status === 'published') return true
                if (article.status === 'scheduled') {
                  const scheduled = article.scheduledAt?.toDate?.()
                  return scheduled && scheduled <= new Date()
                }
                return false
              })
              .filter(article => {
                // Filtrar por busca
                if (!searchTerm) return true
                const search = searchTerm.toLowerCase()
                return (
                  article.title?.toLowerCase().includes(search) ||
                  article.excerpt?.toLowerCase().includes(search) ||
                  article.content?.toLowerCase().includes(search) ||
                  article.tags?.some(tag => tag.toLowerCase().includes(search))
                )
              })
            
            // Ordenar manualmente por data (mais recente primeiro)
            data.sort((a, b) => {
              const dateA = a.createdAt?.toDate?.() || a.updatedAt?.toDate?.() || new Date(0)
              const dateB = b.createdAt?.toDate?.() || b.updatedAt?.toDate?.() || new Date(0)
              return dateB.getTime() - dateA.getTime()
            })
            
            setArticles(data)
            setLoading(false)
          },
          (error) => {
            console.error('Erro ao carregar artigos:', error)
            // Se falhar por falta de índice, tentar sem filtro de status
            if (error.code === 'failed-precondition' && !isAdmin) {
              console.warn('Índice não criado. Tentando sem filtro de status...')
              // Fallback: tentar sem filtro de status (mas filtrar no código)
              const qFallback = selectedCategory !== 'TODAS' 
                ? query(articlesRef, where('category', '==', selectedCategory))
                : query(articlesRef)
              
              onSnapshot(
                qFallback,
                (snapshot) => {
                  const data = snapshot.docs
                    .map((doc) => ({
                      id: doc.id,
                      ...doc.data(),
                    }))
                    .filter(article => article.status === 'published')
                    .filter(article => {
                      if (!searchTerm) return true
                      const search = searchTerm.toLowerCase()
                      return (
                        article.title?.toLowerCase().includes(search) ||
                        article.excerpt?.toLowerCase().includes(search) ||
                        article.content?.toLowerCase().includes(search) ||
                        article.tags?.some(tag => tag.toLowerCase().includes(search))
                      )
                    })
                  
                  data.sort((a, b) => {
                    const dateA = a.createdAt?.toDate?.() || a.updatedAt?.toDate?.() || new Date(0)
                    const dateB = b.createdAt?.toDate?.() || b.updatedAt?.toDate?.() || new Date(0)
                    return dateB.getTime() - dateA.getTime()
                  })
                  
                  setArticles(data)
                  setLoading(false)
                },
                (err) => {
                  console.error('Erro ao carregar artigos (fallback):', err)
                  setArticles([])
                  setLoading(false)
                }
              )
              return
            }
            // Se for erro de permissão
            if (error.code === 'permission-denied') {
              console.warn('Permissão negada. Verifique se as regras do Firestore permitem leitura pública de artigos publicados.')
            }
            setArticles([])
            setLoading(false)
          }
        )
        
        return unsubscribe
      } catch (err) {
        console.error('Erro ao criar query:', err)
        setArticles([])
        setLoading(false)
        return () => {}
      }
    }
    
    const unsubscribe = tryLoadArticles()
    return () => {
      if (unsubscribe) unsubscribe()
    }
  }, [selectedCategory, searchTerm, isAdmin])
  
  // Gerar slug do título
  const generateSlug = (title) => {
    return title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
  }
  
  // Regenerar notícia (usando dados do artigo atual)
  const handleRegenerateArticle = async () => {
    if (!editingArticle) {
      alert('Nenhum artigo selecionado para regenerar')
      return
    }
    
    if (!confirm('Deseja regenerar o conteúdo deste artigo? O conteúdo atual será substituído.')) {
      return
    }
    
    // Preencher formulário de IA com dados do artigo atual
    setAiForm({
      topic: editingArticle.title || articleForm.title || '',
      referenceUrl: editingArticle.referenceUrl || aiForm.referenceUrl || '',
      tone: 'formal',
      keywords: editingArticle.keywords || articleForm.keywords || ''
    })
    
    // Chamar função de geração
    await handleGenerateWithAI(true)
  }
  
  // Gerar conteúdo com IA
  const handleGenerateWithAI = async (isRegenerating = false) => {
    const topicToUse = isRegenerating ? (editingArticle?.title || articleForm.title || aiForm.topic) : aiForm.topic
    
    if (!topicToUse) {
      alert('Por favor, insira o tópico da notícia')
      return
    }
    
    setAiGenerating(true)
    
    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY
      if (!apiKey) {
        throw new Error('VITE_GEMINI_API_KEY não configurada')
      }
      
      const genAI = new GoogleGenerativeAI(apiKey)
      const model = genAI.getGenerativeModel({ 
        model: 'gemini-2.5-flash',
        generationConfig: {
          maxOutputTokens: 8000,
          temperature: 0.7,
        }
      })
      
      // URL de referência será passada para a IA processar
      // Não fazemos scraping no frontend para evitar CORS
      
      const topicToUse = isRegenerating ? (editingArticle?.title || articleForm.title || aiForm.topic) : aiForm.topic
      const referenceUrlToUse = isRegenerating ? (editingArticle?.referenceUrl || aiForm.referenceUrl) : aiForm.referenceUrl
      const keywordsToUse = isRegenerating ? (editingArticle?.keywords || articleForm.keywords || aiForm.keywords) : aiForm.keywords
      
      const prompt = `Você é um especialista em concursos públicos brasileiros e jornalista de notícias.

${referenceUrlToUse ? `URL DE REFERÊNCIA PARA EXTRAIR INFORMAÇÕES: ${referenceUrlToUse}\nUse esta URL APENAS para extrair informações sobre o tópico. Acesse e analise o conteúdo completo do link fornecido para obter dados sobre o concurso.\n\n` : ''}TÓPICO DA NOTÍCIA: ${topicToUse}
${keywordsToUse ? `PALAVRAS-CHAVE PRIMÁRIAS: ${keywordsToUse}\n` : ''}ESTILO DE TOM: ${aiForm.tone}

REFERÊNCIA OBRIGATÓRIA:
- A referência desta notícia é SEMPRE o FlashConCards (https://www.flashconcards.com.br)
- FlashConCards é uma plataforma especializada em flashcards para concursos públicos
- Ao final do artigo, mencione que o FlashConCards oferece materiais de estudo para este concurso
- Inclua links contextuais para o FlashConCards quando mencionar matérias ou áreas de estudo

TAREFA:
Crie um artigo completo e profissional sobre o tópico acima, seguindo o estilo ${aiForm.tone}.

OBRIGATÓRIO INCLUIR NO CONTEÚDO:
1. **Conteúdo Programático Completo**: Liste todas as matérias/disciplinas que serão cobradas no concurso
2. **Quantidade de Barras/Vagas**: Informe quantas vagas estão disponíveis (se disponível no link)
3. **Distribuição de Vagas**: Se houver distribuição por cargo ou área, inclua
4. **Matérias por Área**: Organize as matérias por área de conhecimento (se aplicável)
5. **Peso das Matérias**: Se houver informações sobre peso ou pontuação de cada matéria, inclua
6. **REQUISITOS DO CARGO (OBRIGATÓRIO E DETALHADO)**: 
   - Escolaridade mínima exigida (ensino médio, superior, etc.)
   - Idade mínima e máxima (se houver)
   - Experiência profissional exigida
   - Certificações ou cursos específicos necessários
   - Altura mínima (para cargos policiais/militares)
   - CNH (Carteira Nacional de Habilitação) - categoria exigida
   - Outros requisitos específicos do cargo
   - IMPORTANTE: Crie uma seção específica <h2>Requisitos do Cargo</h2> com TODOS os requisitos detalhados
7. **Remuneração Completa**: Salário base, benefícios, progressão de carreira
8. **Etapas do Concurso**: Todas as fases (prova objetiva, discursiva, física, psicológica, etc.)
9. **Banca Organizadora**: Nome completo da banca
10. **Datas Importantes**: Inscrições, provas, resultados, etc.

FORMATO DE RESPOSTA (JSON VÁLIDO):
{
  "title": "Título otimizado para SEO (H1)",
  "excerpt": "Resumo curto em 2-3 frases para chamada",
  "content": "Conteúdo completo em HTML formatado. Use <h2> para seções principais (OBRIGATÓRIO: 'Requisitos do Cargo' como primeira seção, depois 'Conteúdo Programático', 'Vagas e Remuneração', 'Etapas do Concurso'), <h3> para subseções, <p> para parágrafos, <ul><li> para listas de matérias e requisitos, <strong> para negrito, <table> para tabelas se necessário. Seja EXTREMAMENTE detalhado sobre os requisitos do cargo (escolaridade, idade, experiência, CNH, altura, etc.) e sobre o conteúdo programático, listando TODAS as matérias encontradas no link de referência.",
  "metaTitle": "Meta title otimizado (máx 60 caracteres)",
  "metaDescription": "Meta description otimizada (máx 160 caracteres)",
  "tags": ["tag1", "tag2", "tag3"],
  "keywords": "palavras-chave, separadas, por vírgula"
}

ESTRUTURA DO CONTEÚDO (HTML):
- Use <h2>Requisitos do Cargo</h2> como PRIMEIRA seção obrigatória, com lista detalhada de TODOS os requisitos (escolaridade, idade, experiência, CNH, altura, etc.)
- Use <h2>Conteúdo Programático</h2> seguido de uma lista completa de todas as matérias
- Use <h2>Vagas e Remuneração</h2> com informações detalhadas
- Use <h2>Etapas do Concurso</h2> com todas as fases
- Organize as matérias em listas <ul><li> ou tabelas quando apropriado
- Se houver distribuição de vagas, crie uma seção específica para isso
- IMPORTANTE: A seção "Requisitos do Cargo" DEVE aparecer no conteúdo e ser detalhada

IMPORTANTE:
- O conteúdo deve ser factual e baseado EXCLUSIVAMENTE nas informações do link fornecido
- A REFERÊNCIA é sempre o FlashConCards (https://www.flashconcards.com.br)
- Inclua menções ao FlashConCards como plataforma de estudo para o concurso
- Use HTML para formatação (não markdown)
- O título deve ser atrativo e otimizado para SEO
- **OBRIGATÓRIO**: Inclua uma seção <h2>Requisitos do Cargo</h2> com TODOS os requisitos detalhados (escolaridade, idade, experiência, CNH, altura, etc.) - esta seção é ESSENCIAL e deve aparecer no conteúdo
- Seja EXTREMAMENTE detalhado sobre o conteúdo programático - liste TODAS as matérias encontradas
- Inclua informações sobre quantidade de barras/vagas se disponível no link
- Ao mencionar matérias ou áreas de estudo, inclua links contextuais para o FlashConCards
- Retorne APENAS o JSON válido, sem markdown, sem explicações
- Comece diretamente com { e termine com }
- DATA ATUAL: ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
- Use apenas informações atualizadas até esta data
      
      const result = await model.generateContent(prompt)
      const response = result.response.text()
      
      // Limpar resposta de forma robusta
      let jsonText = response.trim()
      
      // Remover markdown code blocks
      jsonText = jsonText.replace(/```json\n?/gi, '').replace(/```\n?/g, '')
      
      // Encontrar o primeiro { e último } para extrair apenas o JSON válido
      const firstBrace = jsonText.indexOf('{')
      const lastBrace = jsonText.lastIndexOf('}')
      
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        jsonText = jsonText.substring(firstBrace, lastBrace + 1)
      }
      
      // Tentar parsear o JSON
      let aiData
      try {
        aiData = JSON.parse(jsonText)
      } catch (parseError) {
        // Se falhar, tentar corrigir problemas comuns de formatação
        console.warn('Erro ao parsear JSON, tentando corrigir...', parseError.message)
        
        // Remover vírgulas extras antes de } ou ]
        jsonText = jsonText.replace(/,\s*([}\]])/g, '$1')
        
        // Tentar parsear novamente
        try {
          aiData = JSON.parse(jsonText)
        } catch (secondError) {
          // Log do JSON problemático para debug
          console.error('JSON problemático (primeiros 1000 caracteres):', jsonText.substring(0, 1000))
          throw new Error(`Erro ao processar resposta da IA: ${parseError.message}. A resposta pode estar mal formatada. Tente gerar novamente.`)
        }
      }
      
      // Preencher formulário com dados da IA
      setArticleForm({
        ...articleForm,
        title: aiData.title || '',
        content: aiData.content || '',
        excerpt: aiData.excerpt || '',
        metaTitle: aiData.metaTitle || aiData.title || '',
        metaDescription: aiData.metaDescription || aiData.excerpt || '',
        slug: generateSlug(aiData.title || ''),
        tags: aiData.tags || [],
        keywords: aiData.keywords || ''
      })
      
      alert('✅ Conteúdo gerado com sucesso! Revise e ajuste antes de publicar.')
    } catch (error) {
      console.error('Erro ao gerar conteúdo:', error)
      alert(`Erro ao gerar conteúdo: ${error.message}`)
    } finally {
      setAiGenerating(false)
    }
  }
  
  // Salvar artigo
  const handleSaveArticle = async () => {
    if (!user) {
      alert('Você precisa estar logado para salvar artigos')
      return
    }
    
    if (!articleForm.title || !articleForm.content) {
      alert('Preencha título e conteúdo')
      return
    }
    
    if (!db) {
      alert('Firebase não está configurado')
      return
    }
    
    try {
      const articleData = {
        ...articleForm,
        slug: articleForm.slug || generateSlug(articleForm.title),
        authorId: user.uid,
        authorName: 'FlashConCards',
        updatedAt: serverTimestamp(),
        keywords: articleForm.keywords || '',
        referenceUrl: aiForm.referenceUrl || editingArticle?.referenceUrl || '' // Salvar URL de referência
      }
      
      // Se for agendado, adicionar timestamp
      if (articleForm.status === 'scheduled' && articleForm.scheduledDate && articleForm.scheduledTime) {
        const [year, month, day] = articleForm.scheduledDate.split('-')
        const [hours, minutes] = articleForm.scheduledTime.split(':')
        const scheduledDate = new Date(year, month - 1, day, hours, minutes)
        articleData.scheduledAt = Timestamp.fromDate(scheduledDate)
      }
      
      // Garantir que o status seja sempre salvo
      articleData.status = articleForm.status || 'draft'
      
      if (editingArticle) {
        // Manter createdAt original ao editar
        articleData.createdAt = editingArticle.createdAt || serverTimestamp()
        await updateDoc(doc(db, 'blog_articles', editingArticle.id), articleData)
        alert(`✅ Artigo ${articleData.status === 'published' ? 'publicado' : 'atualizado'} com sucesso!`)
      } else {
        articleData.createdAt = serverTimestamp()
        await addDoc(collection(db, 'blog_articles'), articleData)
        alert(`✅ Artigo ${articleData.status === 'published' ? 'publicado' : 'salvo'} com sucesso!`)
      }
      
      // Limpar formulário
      setArticleForm({
        title: '',
        content: '',
        excerpt: '',
        category: '',
        tags: [],
        metaTitle: '',
        metaDescription: '',
        slug: '',
        featuredImage: '',
        scheduledDate: '',
        scheduledTime: '',
        status: 'draft'
      })
      setEditingArticle(null)
      setShowAdmin(false)
    } catch (error) {
      console.error('Erro ao salvar artigo:', error)
      if (error.code === 'permission-denied') {
        alert('❌ Erro de permissão. Verifique se você está logado e tem permissão para criar/editar artigos.')
      } else {
        alert(`❌ Erro ao salvar artigo: ${error.message}`)
      }
    }
  }
  
  // Deletar artigo
  const handleDeleteArticle = async (articleId) => {
    if (!confirm('Tem certeza que deseja deletar este artigo? Esta ação não pode ser desfeita.')) {
      return
    }
    
    try {
      await deleteDoc(doc(db, 'blog_articles', articleId))
      alert('✅ Artigo deletado com sucesso!')
      
      // Se estava editando este artigo, limpar formulário
      if (editingArticle?.id === articleId) {
        setEditingArticle(null)
        setArticleForm({
          title: '',
          content: '',
          excerpt: '',
          category: '',
          tags: [],
          metaTitle: '',
          metaDescription: '',
          slug: '',
          featuredImage: '',
          scheduledDate: '',
          scheduledTime: '',
          status: 'draft',
          courseLink: ''
        })
      }
    } catch (error) {
      console.error('Erro ao deletar artigo:', error)
      if (error.code === 'permission-denied') {
        alert('❌ Erro de permissão. Verifique se você está logado e tem permissão para deletar este artigo.')
      } else {
        alert(`❌ Erro ao deletar artigo: ${error.message}`)
      }
    }
  }
  
  // Comprimir imagem antes de converter para base64
  const compressImage = (file, maxWidth = 1200, maxHeight = 1200, quality = 0.7, attempt = 0) => {
    return new Promise((resolve, reject) => {
      // Limitar tentativas para evitar loop infinito
      if (attempt > 5) {
        reject(new Error('Não foi possível comprimir a imagem suficientemente. Tente uma imagem menor.'))
        return
      }
      
      const reader = new FileReader()
      reader.onload = (e) => {
        const img = new Image()
        img.onload = () => {
          // Calcular novas dimensões mantendo proporção
          let width = img.width
          let height = img.height
          
          if (width > maxWidth || height > maxHeight) {
            if (width > height) {
              height = Math.round((height * maxWidth) / width)
              width = maxWidth
            } else {
              width = Math.round((width * maxHeight) / height)
              height = maxHeight
            }
          }
          
          // Criar canvas e redimensionar
          const canvas = document.createElement('canvas')
          canvas.width = width
          canvas.height = height
          const ctx = canvas.getContext('2d')
          
          // Melhorar qualidade do redimensionamento
          ctx.imageSmoothingEnabled = true
          ctx.imageSmoothingQuality = 'high'
          ctx.drawImage(img, 0, 0, width, height)
          
          // Converter para base64 com qualidade reduzida
          const base64 = canvas.toDataURL('image/jpeg', quality)
          
          // Verificar tamanho (limite do Firestore: ~1MB, usar 800KB para dar margem)
          const maxSize = 800000 // ~800KB
          if (base64.length > maxSize) {
            // Tentar com qualidade menor
            if (quality > 0.4) {
              resolve(compressImage(file, maxWidth, maxHeight, quality - 0.15, attempt + 1))
            } else if (maxWidth > 800) {
              // Reduzir dimensões se ainda for muito grande
              resolve(compressImage(file, Math.round(maxWidth * 0.85), Math.round(maxHeight * 0.85), 0.5, attempt + 1))
            } else {
              reject(new Error('A imagem é muito grande mesmo após compressão. Tente uma imagem menor.'))
            }
          } else {
            resolve(base64)
          }
        }
        img.onerror = () => reject(new Error('Erro ao carregar a imagem'))
        img.src = e.target.result
      }
      reader.onerror = () => reject(new Error('Erro ao ler o arquivo'))
      reader.readAsDataURL(file)
    })
  }
  
  // Upload de imagem (salvar como base64 no Firestore)
  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    if (!file.type.startsWith('image/')) {
      alert('Por favor, selecione apenas imagens.')
      return
    }
    
    setUploadingImage(true)
    
    try {
      // Comprimir imagem antes de converter para base64
      const compressedBase64 = await compressImage(file)
      setArticleForm({ ...articleForm, featuredImage: compressedBase64 })
      alert('✅ Imagem carregada e comprimida com sucesso!')
    } catch (error) {
      console.error('Erro ao fazer upload:', error)
      alert('❌ Erro ao carregar imagem: ' + error.message)
    } finally {
      setUploadingImage(false)
    }
  }
  
  // Abrir artigo - navegar para rota específica
  const handleOpenArticle = (articleId) => {
    // Navegar para rota específica da notícia
    navigate(`/blank/noticia/${articleId}`)
  }
  
  // Formatar data
  const formatDate = (timestamp) => {
    if (!timestamp) return ''
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
      return date.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric'
      })
    } catch {
      return ''
    }
  }
  
  // Handlers de autenticação
  const handleAuthSubmit = async (e) => {
    e.preventDefault()
    setAuthError('')
    setAuthLoading(true)
    
    try {
      if (isRegisterMode) {
        if (!authForm.name) {
          setAuthError('Por favor, preencha seu nome')
          setAuthLoading(false)
          return
        }
        await register(authForm.email, authForm.password, authForm.name)
      } else {
        await login(authForm.email, authForm.password)
      }
      setShowLogin(false)
      setAuthForm({ email: '', password: '', name: '' })
      setAuthError('')
    } catch (err) {
      setAuthError(err.message || 'Erro ao fazer login/cadastro')
    } finally {
      setAuthLoading(false)
    }
  }
  
  // Renderizar página inicial
  if (view === 'home') {
    const featuredArticles = articles.filter(a => a.featured).slice(0, 3)
    const recentArticles = articles.slice(0, 6)
    
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
        {/* Header */}
        <header style={{
          backgroundColor: '#1e3a8a',
          padding: '20px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
          position: 'sticky',
          top: 0,
          zIndex: 1000
        }}>
          <div style={{
            maxWidth: '1200px',
            margin: '0 auto',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '20px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ color: '#fbbf24', fontSize: '32px' }}>⚡</span>
              <h1 style={{
                color: 'white',
                fontSize: '28px',
                fontWeight: '900',
                margin: 0,
                background: 'linear-gradient(to right, #fbbf24, #fcd34d)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent'
              }}>
                FlashNotícias
              </h1>
            </div>
            
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="text"
                placeholder="Buscar artigos..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  padding: '10px 16px',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  minWidth: '250px',
                  outline: 'none'
                }}
              />
              {isAdmin && (
                <button
                  onClick={() => {
                    setShowAdmin(true)
                    setView('admin')
                  }}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: '#fbbf24',
                    color: '#1e3a8a',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: 'bold'
                  }}
                >
                  ⚙️ Admin
                </button>
              )}
              {user ? (
                <button
                  onClick={logout}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: 'transparent',
                    color: 'white',
                    border: '1px solid white',
                    borderRadius: '8px',
                    cursor: 'pointer'
                  }}
                >
                  Sair
                </button>
              ) : (
                <button
                  onClick={() => setShowLogin(true)}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: '#fbbf24',
                    color: '#1e3a8a',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: 'bold'
                  }}
                >
                  Login
                </button>
              )}
            </div>
          </div>
          
          {/* Navegação */}
          <nav style={{
            maxWidth: '1200px',
            margin: '20px auto 0',
            display: 'flex',
            gap: '8px',
            flexWrap: 'wrap',
            justifyContent: 'center'
          }}>
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                style={{
                  padding: '10px 20px',
                  backgroundColor: selectedCategory === cat ? '#fbbf24' : 'transparent',
                  color: selectedCategory === cat ? '#1e3a8a' : 'white',
                  border: selectedCategory === cat ? 'none' : '1px solid rgba(255,255,255,0.3)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: selectedCategory === cat ? 'bold' : '500',
                  fontSize: '14px',
                  transition: 'all 0.2s'
                }}
              >
                {cat}
              </button>
            ))}
          </nav>
        </header>
        
        {/* Conteúdo */}
        <main style={{ maxWidth: '1200px', margin: '40px auto', padding: '0 20px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px', color: '#6b7280' }}>
              Carregando artigos...
            </div>
          ) : (
            <>
              {/* Destaques */}
              {featuredArticles.length > 0 && (
                <section style={{ marginBottom: '60px' }}>
                  <h2 style={{ fontSize: '32px', fontWeight: 'bold', marginBottom: '30px', color: '#1e3a8a' }}>
                    📰 Destaques
                  </h2>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr',
                    gap: '30px',
                    marginBottom: '40px'
                  }}>
                    {/* Primeiro card em destaque - MAIOR */}
                    {featuredArticles[0] && (
                      <article
                        onClick={() => handleOpenArticle(featuredArticles[0].id)}
                        style={{
                          backgroundColor: 'white',
                          borderRadius: '20px',
                          overflow: 'hidden',
                          boxShadow: '0 12px 32px rgba(0,0,0,0.15)',
                          cursor: 'pointer',
                          transition: 'all 0.3s ease',
                          border: '2px solid #e5e7eb'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = 'translateY(-10px)'
                          e.currentTarget.style.boxShadow = '0 16px 40px rgba(0,0,0,0.2)'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = 'translateY(0)'
                          e.currentTarget.style.boxShadow = '0 12px 32px rgba(0,0,0,0.15)'
                        }}
                      >
                        {featuredArticles[0].featuredImage && (
                          <div style={{ position: 'relative', overflow: 'hidden' }}>
                            <img
                              src={featuredArticles[0].featuredImage}
                              alt={featuredArticles[0].title}
                              style={{
                                width: '100%',
                                height: '450px',
                                objectFit: 'cover',
                                transition: 'transform 0.3s'
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
                              onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                            />
                            <div style={{
                              position: 'absolute',
                              top: '20px',
                              left: '20px',
                              backgroundColor: '#1e3a8a',
                              color: 'white',
                              padding: '10px 20px',
                              borderRadius: '25px',
                              fontSize: '13px',
                              fontWeight: 'bold',
                              textTransform: 'uppercase',
                              letterSpacing: '0.5px'
                            }}>
                              {featuredArticles[0].category}
                            </div>
                          </div>
                        )}
                        <div style={{ padding: '40px' }}>
                          {!featuredArticles[0].featuredImage && (
                            <div style={{
                              fontSize: '13px',
                              color: '#1e3a8a',
                              fontWeight: 'bold',
                              marginBottom: '15px',
                              textTransform: 'uppercase',
                              letterSpacing: '0.5px'
                            }}>
                              {featuredArticles[0].category}
                            </div>
                          )}
                          <h3 style={{
                            fontSize: '36px',
                            fontWeight: '900',
                            marginBottom: '20px',
                            color: '#1f2937',
                            lineHeight: '1.2',
                            minHeight: '86px'
                          }}>
                            {featuredArticles[0].title}
                          </h3>
                          <p style={{
                            fontSize: '18px',
                            color: '#4b5563',
                            marginBottom: '30px',
                            lineHeight: '1.8',
                            display: '-webkit-box',
                            WebkitLineClamp: 4,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden'
                          }}>
                            {featuredArticles[0].excerpt}
                          </p>
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            paddingTop: '20px',
                            borderTop: '2px solid #e5e7eb'
                          }}>
                            <div style={{
                              fontSize: '14px',
                              color: '#6b7280',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px'
                            }}>
                              <span>📅</span>
                              <span>{formatDate(featuredArticles[0].createdAt)}</span>
                            </div>
                            <div style={{
                              fontSize: '16px',
                              color: '#1e3a8a',
                              fontWeight: '700'
                            }}>
                              Ler notícia completa →
                            </div>
                          </div>
                        </div>
                      </article>
                    )}
                  </div>
                  
                  {/* Outros destaques em grid */}
                  {featuredArticles.length > 1 && (
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))',
                      gap: '30px'
                    }}>
                    {featuredArticles.slice(1).map(article => (
                      <article
                        key={article.id}
                        onClick={() => handleOpenArticle(article.id)}
                        style={{
                          backgroundColor: 'white',
                          borderRadius: '16px',
                          overflow: 'hidden',
                          boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                          cursor: 'pointer',
                          transition: 'all 0.3s ease',
                          border: '1px solid #e5e7eb'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = 'translateY(-8px)'
                          e.currentTarget.style.boxShadow = '0 12px 32px rgba(0,0,0,0.18)'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = 'translateY(0)'
                          e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.12)'
                        }}
                      >
                        {article.featuredImage && (
                          <div style={{ position: 'relative', overflow: 'hidden' }}>
                            <img
                              src={article.featuredImage}
                              alt={article.title}
                              style={{
                                width: '100%',
                                height: '280px',
                                objectFit: 'cover',
                                transition: 'transform 0.3s'
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
                              onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                            />
                            <div style={{
                              position: 'absolute',
                              top: '12px',
                              left: '12px',
                              backgroundColor: '#1e3a8a',
                              color: 'white',
                              padding: '6px 14px',
                              borderRadius: '20px',
                              fontSize: '11px',
                              fontWeight: 'bold',
                              textTransform: 'uppercase',
                              letterSpacing: '0.5px'
                            }}>
                              {article.category}
                            </div>
                          </div>
                        )}
                        <div style={{ padding: '28px' }}>
                          {!article.featuredImage && (
                            <div style={{
                              fontSize: '12px',
                              color: '#1e3a8a',
                              fontWeight: 'bold',
                              marginBottom: '12px',
                              textTransform: 'uppercase',
                              letterSpacing: '0.5px'
                            }}>
                              {article.category}
                            </div>
                          )}
                          <h3 style={{
                            fontSize: '24px',
                            fontWeight: '900',
                            marginBottom: '12px',
                            color: '#1f2937',
                            lineHeight: '1.3',
                            minHeight: '62px'
                          }}>
                            {article.title}
                          </h3>
                          <p style={{
                            fontSize: '15px',
                            color: '#4b5563',
                            marginBottom: '20px',
                            lineHeight: '1.7',
                            display: '-webkit-box',
                            WebkitLineClamp: 3,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden'
                          }}>
                            {article.excerpt}
                          </p>
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            paddingTop: '16px',
                            borderTop: '1px solid #e5e7eb'
                          }}>
                            <div style={{
                              fontSize: '13px',
                              color: '#6b7280',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px'
                            }}>
                              <span>📅</span>
                              <span>{formatDate(article.createdAt)}</span>
                            </div>
                            <div style={{
                              fontSize: '13px',
                              color: '#1e3a8a',
                              fontWeight: '600'
                            }}>
                              Ler mais →
                            </div>
                          </div>
                        </div>
                      </article>
                    ))}
                    </div>
                  )}
                </section>
              )}
              
              {/* Artigos Recentes */}
              <section>
                <h2 style={{ fontSize: '32px', fontWeight: 'bold', marginBottom: '30px', color: '#1e3a8a' }}>
                  📚 Artigos Recentes
                </h2>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
                  gap: '30px'
                }}>
                  {recentArticles.map(article => (
                    <article
                      key={article.id}
                      onClick={() => handleOpenArticle(article.id)}
                      style={{
                        backgroundColor: 'white',
                        borderRadius: '16px',
                        overflow: 'hidden',
                        boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
                        cursor: 'pointer',
                        transition: 'all 0.3s ease',
                        border: '1px solid #e5e7eb'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-6px)'
                        e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.15)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)'
                        e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.1)'
                      }}
                    >
                      {article.featuredImage && (
                        <div style={{ position: 'relative', overflow: 'hidden' }}>
                          <img
                            src={article.featuredImage}
                            alt={article.title}
                            style={{
                              width: '100%',
                              height: '220px',
                              objectFit: 'cover',
                              transition: 'transform 0.3s'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
                            onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                          />
                          <div style={{
                            position: 'absolute',
                            top: '10px',
                            left: '10px',
                            backgroundColor: '#1e3a8a',
                            color: 'white',
                            padding: '5px 12px',
                            borderRadius: '20px',
                            fontSize: '10px',
                            fontWeight: 'bold',
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px'
                          }}>
                            {article.category}
                          </div>
                        </div>
                      )}
                      <div style={{ padding: '24px' }}>
                        {!article.featuredImage && (
                          <div style={{
                            fontSize: '11px',
                            color: '#1e3a8a',
                            fontWeight: 'bold',
                            marginBottom: '10px',
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px'
                          }}>
                            {article.category}
                          </div>
                        )}
                        <h3 style={{
                          fontSize: '20px',
                          fontWeight: '800',
                          marginBottom: '10px',
                          color: '#1f2937',
                          lineHeight: '1.4',
                          minHeight: '56px'
                        }}>
                          {article.title}
                        </h3>
                        <p style={{
                          fontSize: '14px',
                          color: '#4b5563',
                          marginBottom: '16px',
                          lineHeight: '1.6',
                          display: '-webkit-box',
                          WebkitLineClamp: 3,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden'
                        }}>
                          {article.excerpt}
                        </p>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          paddingTop: '14px',
                          borderTop: '1px solid #f3f4f6'
                        }}>
                          <div style={{
                            fontSize: '12px',
                            color: '#6b7280',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '5px'
                          }}>
                            <span>📅</span>
                            <span>{formatDate(article.createdAt)}</span>
                          </div>
                          <div style={{
                            fontSize: '12px',
                            color: '#1e3a8a',
                            fontWeight: '600'
                          }}>
                            Ler →
                          </div>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
              
              {articles.length === 0 && (
                <div style={{
                  textAlign: 'center',
                  padding: '60px',
                  color: '#6b7280'
                }}>
                  <p style={{ fontSize: '18px', marginBottom: '10px' }}>📝</p>
                  <p>Nenhum artigo encontrado.</p>
                </div>
              )}
            </>
          )}
        </main>
        
        {/* Modal de Login/Cadastro */}
        {showLogin && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
            padding: '20px'
          }}>
            <div style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              padding: '30px',
              width: '100%',
              maxWidth: '400px',
              boxShadow: '0 10px 40px rgba(0,0,0,0.3)'
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '20px'
              }}>
                <h2 style={{
                  fontSize: '24px',
                  fontWeight: 'bold',
                  color: '#1e3a8a',
                  margin: 0
                }}>
                  {isRegisterMode ? 'Criar Conta' : 'Login'}
                </h2>
                <button
                  onClick={() => {
                    setShowLogin(false)
                    setAuthError('')
                    setAuthForm({ email: '', password: '', name: '' })
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: '24px',
                    cursor: 'pointer',
                    color: '#6b7280'
                  }}
                >
                  ×
                </button>
              </div>
              
              {authError && (
                <div style={{
                  padding: '12px',
                  backgroundColor: '#fee2e2',
                  color: '#dc2626',
                  borderRadius: '8px',
                  marginBottom: '15px',
                  fontSize: '14px'
                }}>
                  {authError}
                </div>
              )}
              
              <form onSubmit={handleAuthSubmit}>
                {isRegisterMode && (
                  <div style={{ marginBottom: '15px' }}>
                    <label style={{
                      display: 'block',
                      marginBottom: '5px',
                      fontWeight: '500',
                      color: '#374151'
                    }}>
                      Nome Completo
                    </label>
                    <input
                      type="text"
                      value={authForm.name}
                      onChange={(e) => setAuthForm({ ...authForm, name: e.target.value })}
                      required
                      style={{
                        width: '100%',
                        padding: '12px',
                        border: '1px solid #d1d5db',
                        borderRadius: '8px',
                        fontSize: '14px'
                      }}
                    />
                  </div>
                )}
                
                <div style={{ marginBottom: '15px' }}>
                  <label style={{
                    display: 'block',
                    marginBottom: '5px',
                    fontWeight: '500',
                    color: '#374151'
                  }}>
                    Email
                  </label>
                  <input
                    type="email"
                    value={authForm.email}
                    onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
                    required
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      fontSize: '14px'
                    }}
                  />
                </div>
                
                <div style={{ marginBottom: '20px' }}>
                  <label style={{
                    display: 'block',
                    marginBottom: '5px',
                    fontWeight: '500',
                    color: '#374151'
                  }}>
                    Senha
                  </label>
                  <input
                    type="password"
                    value={authForm.password}
                    onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
                    required
                    minLength={6}
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      fontSize: '14px'
                    }}
                  />
                </div>
                
                <button
                  type="submit"
                  disabled={authLoading}
                  style={{
                    width: '100%',
                    padding: '12px',
                    backgroundColor: authLoading ? '#9ca3af' : '#1e3a8a',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '16px',
                    fontWeight: 'bold',
                    cursor: authLoading ? 'not-allowed' : 'pointer',
                    marginBottom: '10px'
                  }}
                >
                  {authLoading ? 'Carregando...' : (isRegisterMode ? 'Cadastrar' : 'Entrar')}
                </button>
                
                <button
                  type="button"
                  onClick={() => {
                    setIsRegisterMode(!isRegisterMode)
                    setAuthError('')
                  }}
                  style={{
                    width: '100%',
                    padding: '10px',
                    backgroundColor: 'transparent',
                    color: '#1e3a8a',
                    border: '1px solid #1e3a8a',
                    borderRadius: '8px',
                    fontSize: '14px',
                    cursor: 'pointer'
                  }}
                >
                  {isRegisterMode ? 'Já tem conta? Fazer login' : 'Não tem conta? Cadastrar'}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    )
  }
  
  // Renderizar página de artigo
  if (view === 'article' && selectedArticle) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
        {/* Header simplificado */}
        <header style={{
          backgroundColor: '#1e3a8a',
          padding: '15px 20px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
        }}>
          <div style={{
            maxWidth: '1200px',
            margin: '0 auto',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <button
              onClick={() => {
                setView('home')
                setSelectedArticle(null)
              }}
              style={{
                padding: '8px 16px',
                backgroundColor: 'transparent',
                color: 'white',
                border: '1px solid white',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              ← Voltar
            </button>
            <h1 style={{
              color: 'white',
              fontSize: '20px',
              fontWeight: 'bold',
              margin: 0
            }}>
              FlashNotícias
            </h1>
            <div style={{ width: '100px' }}></div>
          </div>
        </header>
        
        {/* Artigo */}
        <article style={{
          maxWidth: '800px',
          margin: '40px auto',
          padding: '0 20px'
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            padding: '40px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
          }}>
            <div style={{
              fontSize: '14px',
              color: '#1e3a8a',
              fontWeight: 'bold',
              marginBottom: '15px',
              textTransform: 'uppercase'
            }}>
              {selectedArticle.category}
            </div>
            
            <h1 style={{
              fontSize: '36px',
              fontWeight: '900',
              marginBottom: '20px',
              color: '#1f2937',
              lineHeight: '1.2'
            }}>
              {selectedArticle.title}
            </h1>
            
            <div style={{
              fontSize: '14px',
              color: '#6b7280',
              marginBottom: '30px',
              paddingBottom: '20px',
              borderBottom: '1px solid #e5e7eb'
            }}>
              Por FlashConCards • {formatDate(selectedArticle.createdAt)}
            </div>
            
            {selectedArticle.featuredImage && (
              <img
                src={selectedArticle.featuredImage}
                alt={selectedArticle.title}
                style={{
                  width: '100%',
                  borderRadius: '8px',
                  marginBottom: '30px'
                }}
              />
            )}
            
            <div
              style={{
                fontSize: '18px',
                lineHeight: '1.9',
                color: '#374151',
                maxWidth: '100%'
              }}
              dangerouslySetInnerHTML={{ 
                __html: selectedArticle.content
                  .replace(/<p>/g, '<p style="margin-bottom: 24px; color: #374151; line-height: 1.9;">')
                  .replace(/<h2>/g, '<h2 style="font-size: 28px; font-weight: 800; color: #1e3a8a; margin-top: 40px; margin-bottom: 20px; line-height: 1.3;">')
                  .replace(/<h3>/g, '<h3 style="font-size: 22px; font-weight: 700; color: #1e40af; margin-top: 32px; margin-bottom: 16px; line-height: 1.4;">')
                  .replace(/<ul>/g, '<ul style="margin: 20px 0; padding-left: 24px; list-style-type: disc;">')
                  .replace(/<li>/g, '<li style="margin-bottom: 12px; line-height: 1.8;">')
                  .replace(/<strong>/g, '<strong style="font-weight: 700; color: #1f2937;">')
              }}
            />
            
            {/* CTA FlashConCards */}
            <div style={{
              marginTop: '50px',
              padding: '30px',
              backgroundColor: '#1e3a8a',
              borderRadius: '12px',
              textAlign: 'center',
              color: 'white'
            }}>
              <h3 style={{
                fontSize: '24px',
                fontWeight: 'bold',
                marginBottom: '15px'
              }}>
                🎓 Prepare-se para este concurso!
              </h3>
              <p style={{
                fontSize: '16px',
                marginBottom: '20px',
                opacity: 0.9
              }}>
                Acesse o FlashConCards e tenha acesso a flashcards, questões e simulados completos
              </p>
              <a
                href="https://www.flashconcards.com.br"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-block',
                  padding: '14px 32px',
                  backgroundColor: '#fbbf24',
                  color: '#1e3a8a',
                  textDecoration: 'none',
                  borderRadius: '8px',
                  fontWeight: 'bold',
                  fontSize: '16px'
                }}
              >
                Acessar FlashConCards →
              </a>
            </div>
            
            {/* Tags */}
            {selectedArticle.tags && selectedArticle.tags.length > 0 && (
              <div style={{
                marginTop: '40px',
                paddingTop: '30px',
                borderTop: '1px solid #e5e7eb'
              }}>
                <div style={{
                  fontSize: '14px',
                  fontWeight: 'bold',
                  color: '#6b7280',
                  marginBottom: '15px'
                }}>
                  Tags:
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {selectedArticle.tags.map((tag, index) => (
                    <span
                      key={index}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: '#e0e7ff',
                        color: '#1e3a8a',
                        borderRadius: '20px',
                        fontSize: '13px',
                        fontWeight: '500'
                      }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </article>
      </div>
    )
  }
  
  // Renderizar painel admin
  if (view === 'admin' && isAdmin) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc', padding: '20px' }}>
        <div style={{
          maxWidth: '1400px',
          margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: '300px 1fr',
          gap: '30px'
        }}>
          {/* Sidebar Admin */}
          <aside style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            padding: '20px',
            height: 'fit-content',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
          }}>
            <h2 style={{
              fontSize: '24px',
              fontWeight: 'bold',
              marginBottom: '20px',
              color: '#1e3a8a'
            }}>
              ⚙️ Painel Admin
            </h2>
            
            <button
              onClick={() => {
                setView('home')
                setShowAdmin(false)
              }}
              style={{
                width: '100%',
                padding: '12px',
                marginBottom: '10px',
                backgroundColor: '#1e3a8a',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
            >
              ← Voltar
            </button>
            
            <div style={{
              marginTop: '30px',
              paddingTop: '20px',
              borderTop: '1px solid #e5e7eb'
            }}>
              <h3 style={{
                fontSize: '16px',
                fontWeight: 'bold',
                marginBottom: '15px',
                color: '#374151'
              }}>
                Artigos ({articles.length})
              </h3>
              <div style={{
                maxHeight: '400px',
                overflowY: 'auto'
              }}>
                {articles.map(article => (
                  <div
                    key={article.id}
                    style={{
                      padding: '12px',
                      marginBottom: '8px',
                      backgroundColor: editingArticle?.id === article.id ? '#e0e7ff' : '#f3f4f6',
                      borderRadius: '8px',
                      border: editingArticle?.id === article.id ? '2px solid #1e3a8a' : 'none',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '10px'
                    }}
                  >
                    <div
                      onClick={() => {
                        setEditingArticle(article)
                        setArticleForm({
                          title: article.title || '',
                          content: article.content || '',
                          excerpt: article.excerpt || '',
                          category: article.category || '',
                          tags: article.tags || [],
                          metaTitle: article.metaTitle || '',
                          metaDescription: article.metaDescription || '',
                          slug: article.slug || '',
                          featuredImage: article.featuredImage || '',
                          scheduledDate: article.scheduledAt ? article.scheduledAt.toDate().toISOString().split('T')[0] : '',
                          scheduledTime: article.scheduledAt ? article.scheduledAt.toDate().toTimeString().slice(0, 5) : '',
                          status: article.status || 'draft',
                          keywords: article.keywords || '',
                          courseLink: article.courseLink || ''
                        })
                        // Carregar referenceUrl no formulário de IA também
                        setAiForm({
                          ...aiForm,
                          referenceUrl: article.referenceUrl || '',
                          topic: article.title || '',
                          keywords: article.keywords || ''
                        })
                      }}
                      style={{
                        flex: 1,
                        cursor: 'pointer'
                      }}
                    >
                      <div style={{
                        fontSize: '14px',
                        fontWeight: 'bold',
                        marginBottom: '4px',
                        color: '#1f2937'
                      }}>
                        {article.title || 'Sem título'}
                      </div>
                      <div style={{
                        fontSize: '12px',
                        color: '#6b7280',
                        display: 'flex',
                        gap: '8px',
                        alignItems: 'center'
                      }}>
                        <span style={{
                          padding: '2px 8px',
                          backgroundColor: article.status === 'published' ? '#10b981' : article.status === 'scheduled' ? '#f59e0b' : '#6b7280',
                          color: 'white',
                          borderRadius: '12px',
                          fontSize: '10px',
                          fontWeight: 'bold'
                        }}>
                          {article.status === 'published' ? '✓ Publicado' : article.status === 'scheduled' ? '⏰ Agendado' : '📝 Rascunho'}
                        </span>
                        <span>•</span>
                        <span>{formatDate(article.createdAt)}</span>
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeleteArticle(article.id)
                      }}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: '#dc2626',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: 'bold',
                        flexShrink: 0
                      }}
                      title="Deletar artigo"
                    >
                      🗑️
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </aside>
          
          {/* Editor */}
          <main style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            padding: '30px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
          }}>
            <h2 style={{
              fontSize: '28px',
              fontWeight: 'bold',
              marginBottom: '30px',
              color: '#1e3a8a'
            }}>
              {editingArticle ? '✏️ Editar Artigo' : '📝 Novo Artigo'}
            </h2>
            
            {/* Gerador de IA */}
            <div style={{
              backgroundColor: '#f0f9ff',
              padding: '20px',
              borderRadius: '12px',
              marginBottom: '30px',
              border: '2px solid #1e3a8a'
            }}>
              <h3 style={{
                fontSize: '18px',
                fontWeight: 'bold',
                marginBottom: '15px',
                color: '#1e3a8a'
              }}>
                🤖 Gerar Conteúdo com IA
              </h3>
              
              <div style={{ display: 'grid', gap: '15px', marginBottom: '15px' }}>
                <input
                  type="text"
                  placeholder="Tópico da Notícia (ex: Edital PM-GO)"
                  value={aiForm.topic}
                  onChange={(e) => setAiForm({ ...aiForm, topic: e.target.value })}
                  style={{
                    padding: '12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '14px'
                  }}
                />
                <input
                  type="url"
                  placeholder="URL de Referência (opcional)"
                  value={aiForm.referenceUrl}
                  onChange={(e) => setAiForm({ ...aiForm, referenceUrl: e.target.value })}
                  style={{
                    padding: '12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '14px'
                  }}
                />
                <select
                  value={aiForm.tone}
                  onChange={(e) => setAiForm({ ...aiForm, tone: e.target.value })}
                  style={{
                    padding: '12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '14px'
                  }}
                >
                  <option value="formal">Formal</option>
                  <option value="analitico">Analítico</option>
                  <option value="urgente">Urgente</option>
                  <option value="informativo">Informativo</option>
                </select>
                <input
                  type="text"
                  placeholder="Palavras-chave primárias (separadas por vírgula)"
                  value={aiForm.keywords}
                  onChange={(e) => setAiForm({ ...aiForm, keywords: e.target.value })}
                  style={{
                    padding: '12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '14px'
                  }}
                />
              </div>
              
              <button
                onClick={handleGenerateWithAI}
                disabled={aiGenerating}
                style={{
                  padding: '12px 24px',
                  backgroundColor: aiGenerating ? '#9ca3af' : '#1e3a8a',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: aiGenerating ? 'not-allowed' : 'pointer',
                  fontWeight: 'bold'
                }}
              >
                {aiGenerating ? '⏳ Gerando...' : '🤖 Gerar Conteúdo'}
              </button>
            </div>
            
            {/* Formulário */}
            <div style={{ display: 'grid', gap: '20px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#374151' }}>
                  Título *
                </label>
                <input
                  type="text"
                  value={articleForm.title}
                  onChange={(e) => {
                    setArticleForm({
                      ...articleForm,
                      title: e.target.value,
                      slug: generateSlug(e.target.value)
                    })
                  }}
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '16px'
                  }}
                />
              </div>
              
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#374151' }}>
                  Slug (URL)
                </label>
                <input
                  type="text"
                  value={articleForm.slug}
                  onChange={(e) => setArticleForm({ ...articleForm, slug: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '14px'
                  }}
                />
              </div>
              
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#374151' }}>
                  Resumo (Excerpt)
                </label>
                <textarea
                  value={articleForm.excerpt}
                  onChange={(e) => setArticleForm({ ...articleForm, excerpt: e.target.value })}
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '14px',
                    resize: 'vertical'
                  }}
                />
              </div>
              
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#374151' }}>
                  Conteúdo (HTML) *
                </label>
                <textarea
                  value={articleForm.content}
                  onChange={(e) => setArticleForm({ ...articleForm, content: e.target.value })}
                  rows={20}
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontFamily: 'monospace',
                    resize: 'vertical'
                  }}
                  placeholder="Use HTML para formatação: <h2>Título</h2><p>Parágrafo</p><ul><li>Item</li></ul>"
                />
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#374151' }}>
                    Categoria
                  </label>
                  <select
                    value={articleForm.category}
                    onChange={(e) => setArticleForm({ ...articleForm, category: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      fontSize: '14px'
                    }}
                  >
                    <option value="">Selecione...</option>
                    {categories.filter(c => c !== 'TODAS').map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#374151' }}>
                    Status
                  </label>
                  <select
                    value={articleForm.status}
                    onChange={(e) => setArticleForm({ ...articleForm, status: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      fontSize: '14px'
                    }}
                  >
                    <option value="draft">Rascunho</option>
                    <option value="published">Publicado</option>
                    <option value="scheduled">Agendado</option>
                  </select>
                </div>
              </div>
              
              {articleForm.status === 'scheduled' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#374151' }}>
                      Data de Publicação
                    </label>
                    <input
                      type="date"
                      value={articleForm.scheduledDate}
                      onChange={(e) => setArticleForm({ ...articleForm, scheduledDate: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '12px',
                        border: '1px solid #d1d5db',
                        borderRadius: '8px',
                        fontSize: '14px'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#374151' }}>
                      Hora de Publicação
                    </label>
                    <input
                      type="time"
                      value={articleForm.scheduledTime}
                      onChange={(e) => setArticleForm({ ...articleForm, scheduledTime: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '12px',
                        border: '1px solid #d1d5db',
                        borderRadius: '8px',
                        fontSize: '14px'
                      }}
                    />
                  </div>
                </div>
              )}
              
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#374151' }}>
                  Tags (separadas por vírgula)
                </label>
                <input
                  type="text"
                  value={articleForm.tags.join(', ')}
                  onChange={(e) => setArticleForm({
                    ...articleForm,
                    tags: e.target.value.split(',').map(t => t.trim()).filter(t => t)
                  })}
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '14px'
                  }}
                  placeholder="concurso público, PMGO, edital"
                />
              </div>
              
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#374151' }}>
                  Meta Title (SEO)
                </label>
                <input
                  type="text"
                  value={articleForm.metaTitle}
                  onChange={(e) => setArticleForm({ ...articleForm, metaTitle: e.target.value })}
                  maxLength={60}
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '14px'
                  }}
                />
                <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                  {articleForm.metaTitle.length}/60 caracteres
                </div>
              </div>
              
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#374151' }}>
                  Meta Description (SEO)
                </label>
                <textarea
                  value={articleForm.metaDescription}
                  onChange={(e) => setArticleForm({ ...articleForm, metaDescription: e.target.value })}
                  maxLength={160}
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '14px',
                    resize: 'vertical'
                  }}
                />
                <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                  {articleForm.metaDescription.length}/160 caracteres
                </div>
              </div>
              
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#374151' }}>
                  🔗 Link do Curso Preparatório
                </label>
                <input
                  type="url"
                  value={articleForm.courseLink}
                  onChange={(e) => setArticleForm({ ...articleForm, courseLink: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '14px'
                  }}
                  placeholder="https://www.flashconcards.com.br/pagamento?course=..."
                />
                <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                  Link que será usado no botão "Acessar Agora" do artigo. Se vazio, usará o link padrão do FlashConCards.
                </div>
              </div>
              
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#374151' }}>
                  Imagem em Destaque
                </label>
                <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    style={{ display: 'none' }}
                  />
                  <button
                    type="button"
                    onClick={() => imageInputRef.current?.click()}
                    disabled={uploadingImage}
                    style={{
                      padding: '10px 20px',
                      backgroundColor: uploadingImage ? '#9ca3af' : '#1e3a8a',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: uploadingImage ? 'not-allowed' : 'pointer',
                      fontWeight: 'bold',
                      fontSize: '14px'
                    }}
                  >
                    {uploadingImage ? '⏳ Carregando...' : '📷 Fazer Upload'}
                  </button>
                  <input
                    type="url"
                    value={articleForm.featuredImage}
                    onChange={(e) => setArticleForm({ ...articleForm, featuredImage: e.target.value })}
                    style={{
                      flex: 1,
                      padding: '10px',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      fontSize: '14px'
                    }}
                    placeholder="Ou cole a URL da imagem"
                  />
                </div>
                {articleForm.featuredImage && (
                  <div style={{ marginTop: '15px', position: 'relative' }}>
                    <img
                      src={articleForm.featuredImage}
                      alt="Preview"
                      style={{
                        width: '100%',
                        maxHeight: '400px',
                        objectFit: 'cover',
                        borderRadius: '12px',
                        border: '2px solid #e5e7eb'
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setArticleForm({ ...articleForm, featuredImage: '' })}
                      style={{
                        position: 'absolute',
                        top: '10px',
                        right: '10px',
                        padding: '8px 12px',
                        backgroundColor: '#dc2626',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontWeight: 'bold',
                        fontSize: '12px'
                      }}
                    >
                      ✕ Remover
                    </button>
                  </div>
                )}
              </div>
              
              <div style={{ display: 'flex', gap: '15px', marginTop: '20px', flexWrap: 'wrap' }}>
                <button
                  onClick={handleSaveArticle}
                  style={{
                    padding: '14px 28px',
                    backgroundColor: '#1e3a8a',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    fontSize: '16px'
                  }}
                >
                  {editingArticle ? '💾 Atualizar' : '💾 Salvar'}
                </button>
                {editingArticle && (
                  <>
                    <button
                      onClick={handleRegenerateArticle}
                      disabled={aiGenerating}
                      style={{
                        padding: '14px 28px',
                        backgroundColor: aiGenerating ? '#9ca3af' : '#10b981',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: aiGenerating ? 'not-allowed' : 'pointer',
                        fontWeight: 'bold',
                        fontSize: '16px'
                      }}
                    >
                      {aiGenerating ? '⏳ Regenerando...' : '🔄 Regenerar Notícia'}
                    </button>
                    <button
                      onClick={() => {
                        setEditingArticle(null)
                        setArticleForm({
                          title: '',
                          content: '',
                          excerpt: '',
                          category: '',
                          tags: [],
                          metaTitle: '',
                          metaDescription: '',
                          slug: '',
                          featuredImage: '',
                          scheduledDate: '',
                          scheduledTime: '',
                          status: 'draft',
                          courseLink: ''
                        })
                      }}
                      style={{
                        padding: '14px 28px',
                        backgroundColor: '#6b7280',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontWeight: 'bold',
                      fontSize: '16px'
                    }}
                  >
                    ✕ Cancelar
                  </button>
                  </>
                )}
              </div>
            </div>
          </main>
        </div>
      </div>
    )
  }
  
  return null
}

export default BlankPage
