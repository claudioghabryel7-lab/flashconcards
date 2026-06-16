import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { collection, doc, getDoc, getDocs, query, where, limit, setDoc, serverTimestamp, orderBy } from 'firebase/firestore'
import { ArrowLeftIcon, PencilIcon, FireIcon, LightBulbIcon, ExclamationTriangleIcon, BookOpenIcon, ChevronDownIcon, ChevronUpIcon, CheckIcon, QuestionMarkCircleIcon } from '@heroicons/react/24/outline'
import { db } from '../firebase/config'
import { useDarkMode } from '../hooks/useDarkMode.jsx'
import { useAuth } from '../hooks/useAuth'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { callGeminiWithRetry, extractGeneratedText } from '../utils/geminiApi'
import ReactMarkdown from 'react-markdown'

// Função para gerar chave estável do tópico (mesma do EditalVerticalizado)
const makeTopicKey = (topico) => {
  if (!topico) return ''
  const numero = (topico.numero || '').toString().trim()
  const nome = (topico.nome || '').toString().trim()

  if (!numero && !nome) return ''
  if (!numero || !nome) {
    const base = numero || nome
    return encodeURIComponent(base)
  }

  const combined = `${numero} :: ${nome}`
  return encodeURIComponent(combined)
}

// Função para extrair contexto hierárquico do edital
const extractContextFromEdital = (editalData, topicoKey) => {
  if (!editalData?.disciplinas || !topicoKey) return null
  
  // Buscar em todas as disciplinas pelo tópico
  for (const disciplina of editalData.disciplinas) {
    if (!disciplina.topicos) continue
    
    const topico = disciplina.topicos.find(t => {
      const topicKey = makeTopicKey(t)
      return topicKey === topicoKey || 
             t.nome === topicoKey || 
             t.numero === topicoKey
    })
    
    if (topico) {
      return {
        disciplina: disciplina.nome || 'Disciplina não identificada',
        topico: topico.nome || topico.numero || 'Tópico não identificado',
        topicoNumero: topico.numero || '',
        curso: '' // Será preenchido depois
      }
    }
  }
  
  return null
}

const normalizeKey = (text = '') => {
  return decodeURIComponent(text || '').trim()
}

// Sanitiza o topicKey para ser usado como ID de documento no Firestore
const sanitizeTopicKeyForFirestore = (topicKey = '') => {
  if (!topicKey) return ''
  
  // Decodificar primeiro se estiver codificado
  let decoded = topicKey
  try {
    decoded = decodeURIComponent(topicKey)
  } catch (e) {
    decoded = topicKey
  }
  
  // Substituir apenas caracteres problemáticos que o Firestore interpreta como separadores
  let sanitized = decoded
    .replace(/::/g, '_DOUBLECOLON_')
    .replace(/\//g, '_SLASH_')
    .replace(/\\/g, '_BACKSLASH_')
    .trim()
  
  // Limitar tamanho
  if (sanitized.length > 400) {
    sanitized = sanitized.substring(0, 400)
  }
  
  // Se após sanitização ficar vazio, criar um hash simples
  if (!sanitized || sanitized.trim() === '') {
    const hash = topicKey.split('').reduce((acc, char) => {
      return ((acc << 5) - acc) + char.charCodeAt(0)
    }, 0)
    return 'topic_' + Math.abs(hash).toString(36)
  }
  
  return sanitized
}

// Função reversa para buscar documentos: tenta encontrar por topicKey sanitizado ou original
const findDocumentByTopicKey = async (courseId, topicKey) => {
  // Tentar com a chave sanitizada primeiro
  const sanitizedKey = sanitizeTopicKeyForFirestore(topicKey)
  try {
    const sanitizedRef = doc(db, 'courses', courseId, 'questoesTopico', sanitizedKey)
    const sanitizedDoc = await getDoc(sanitizedRef)
    if (sanitizedDoc.exists()) {
      return { id: sanitizedDoc.id, ...sanitizedDoc.data() }
    }
  } catch (e) {
    // Ignorar erro se a chave sanitizada for inválida
  }
  
  // Tentar com a chave original (para compatibilidade com documentos antigos)
  if (!topicKey.includes('::') && !topicKey.includes('/') && !topicKey.includes('\\')) {
    try {
      const originalRef = doc(db, 'courses', courseId, 'questoesTopico', topicKey)
      const originalDoc = await getDoc(originalRef)
      if (originalDoc.exists()) {
        return { id: originalDoc.id, ...originalDoc.data() }
      }
    } catch (e) {
      // Ignorar erro se a chave original for inválida
    }
  }
  
  return null
}

// Extrai partes estruturadas da chave do tópico
const parseTopicKey = (rawKey = '') => {
  const key = normalizeKey(rawKey)
  if (!key) return { numero: '', nome: '', raw: '' }

  const [numeroPart, ...rest] = key.split('::')
  if (rest.length === 0) {
    const trimmed = numeroPart.trim()
    const isNumericLike = /^\d+(\.\d+)*$/.test(trimmed)
    return {
      numero: isNumericLike ? trimmed : '',
      nome: isNumericLike ? '' : trimmed,
      raw: trimmed,
    }
  }

  const numero = numeroPart.trim()
  const nome = rest.join('::').trim()
  return { numero, nome, raw: key }
}

const QuestoesTopicoView = () => {
  const { courseId, topicKey } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { darkMode } = useDarkMode()
  const { user, profile } = useAuth()
  const [questoes, setQuestoes] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [courseName, setCourseName] = useState('')
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState(0)
  const [validating, setValidating] = useState(false)
  const [validationMessage, setValidationMessage] = useState('')
  const [editingContent, setEditingContent] = useState(false)
  const [editedContent, setEditedContent] = useState('')

  const resolvedCourseId = useMemo(() => courseId || 'alego-default', [courseId])
  const resolvedTopicKey = useMemo(() => normalizeKey(topicKey), [topicKey])
  const { numero: topicNumeroFromKey, nome: topicNomeFromKey } = useMemo(
    () => parseTopicKey(topicKey),
    [topicKey]
  )
  const topicNomeFromQuery = useMemo(
    () => normalizeKey(searchParams.get('nome') || ''),
    [searchParams]
  )

  const effectiveTopicNome = topicNomeFromQuery || topicNomeFromKey
  const isAdmin = profile?.role === 'admin'

  // Carregar nome do curso
  useEffect(() => {
    const loadCourseName = async () => {
      try {
        const courseDoc = await getDoc(doc(db, 'courses', resolvedCourseId))
        if (courseDoc.exists()) {
          const data = courseDoc.data()
          setCourseName(data.name || data.competition || 'Curso Preparatório')
        } else {
          setCourseName('Curso Preparatório')
        }
      } catch (err) {
        console.error('Erro ao carregar nome do curso:', err)
        setCourseName('Curso Preparatório')
      }
    }

    if (resolvedCourseId && db) {
      loadCourseName()
    }
  }, [resolvedCourseId])

  useEffect(() => {
    const loadQuestoes = async () => {
      if (!resolvedTopicKey || !resolvedCourseId) {
        setError('Questões não encontradas')
        setLoading(false)
        return
      }

      const trimmedKey = resolvedTopicKey.trim()
      if (!trimmedKey || trimmedKey === '') {
        setError('Tópico inválido: identificação do tópico está vazia')
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        setError('')

        // Tentar encontrar documento usando função que sanitiza a chave
        const foundDoc = await findDocumentByTopicKey(resolvedCourseId, trimmedKey)
        if (foundDoc) {
          setQuestoes(foundDoc)
          setLoading(false)
          return
        }

        setError('Chame o professor Flash, ele vai te mostrar o caminho. Aguarde até ele te entregar as questões e não feche a página.')
        setLoading(false)
      } catch (err) {
        console.error('Não se preocupe, chame o professor Flash novamente e dará certo.', err)
        const errorMessage = err.message || String(err)
        
        if (errorMessage.includes('Invalid document reference') || errorMessage.includes('even number of segments')) {
          setError('Erro: Tópico inválido. Por favor, verifique se o tópico possui identificação válida.')
        } else if (errorMessage.includes('Missing or insufficient permissions')) {
          setError('Erro de permissão. Por favor, verifique se você está autenticado e tente novamente.')
        } else {
          setError('Erro ao carregar questões. Tente novamente.')
        }
        setLoading(false)
      }
    }

    loadQuestoes()
  }, [resolvedTopicKey, resolvedCourseId])

  const handleGenerateQuestoes = async () => {
    if (!resolvedCourseId || !resolvedTopicKey) return false
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY
    if (!apiKey) {
      setError('API Key não configurada.')
      return
    }

    try {
      setGenerating(true)
      setProgress(5)
      setError('')

      // Carregar edital e prompt unificado para contexto
      const editalRef = doc(db, 'courses', resolvedCourseId, 'prompts', 'edital')
      const editalDoc = await getDoc(editalRef)
      const editalData = editalDoc.exists() ? editalDoc.data() : {}
      const editalText = (editalData.pdfText || editalData.prompt || '').toString()

      // Carregar dados do curso para obter a banca examinadora
      const courseRef = doc(db, 'courses', resolvedCourseId)
      const courseDoc = await getDoc(courseRef)
      const courseData = courseDoc.exists() ? courseDoc.data() : {}
      const banca = courseData.banca || ''

      // Carregar edital verticalizado para extrair contexto da disciplina
      let editalVerticalizado = null
      try {
        const editalVerticalRef = doc(db, 'courses', resolvedCourseId, 'editalVerticalizado', 'principal')
        const editalVerticalDoc = await getDoc(editalVerticalRef)
        if (editalVerticalDoc.exists()) {
          const data = editalVerticalDoc.data()

          if (data.temPartes && data.totalPartes > 1) {
            const partesRef = collection(db, 'courses', resolvedCourseId, 'editalVerticalizado', 'principal', 'partes')
            const partesSnapshot = await getDocs(query(partesRef, orderBy('parte')))

            const todasDisciplinas = [...(data.disciplinas || [])]
            partesSnapshot.forEach((doc) => {
              const parteData = doc.data()
              if (parteData.disciplinas && Array.isArray(parteData.disciplinas)) {
                todasDisciplinas.push(...parteData.disciplinas)
              }
            })

            editalVerticalizado = {
              ...data,
              disciplinas: todasDisciplinas,
            }
          } else {
            editalVerticalizado = data
          }
        }
      } catch (err) {
        console.warn('Erro ao carregar edital verticalizado para contexto:', err)
      }

      if (!editalText || editalText.trim().length === 0) {
        throw new Error('Edital não encontrado para este curso. Gere o edital primeiro.')
      }

      const unifiedRef = doc(db, 'courses', resolvedCourseId, 'prompts', 'unified')
      const unifiedDoc = await getDoc(unifiedRef)
      const unifiedData = unifiedDoc.exists() ? unifiedDoc.data() : {}
      const concursoName = unifiedData.concursoName || ''
      setProgress(25)

      // Extrair contexto hierárquico do edital
      let contextoDisciplina = null
      if (editalVerticalizado) {
        contextoDisciplina = extractContextFromEdital(editalVerticalizado, resolvedTopicKey)
        if (contextoDisciplina) {
          contextoDisciplina.curso = courseName || concursoName || 'Curso Preparatório'
        }
      }

      const prompt = `Você é um especialista em criar questões preditivas de "Véspera de Prova" para cursos preparatórios de concursos públicos.

CONTEXTO (não cite estes nomes no texto final):
${banca ? `BANCA: ${banca}\n` : ''}${concursoName ? `CONCURSO: ${concursoName}\n` : ''}CURSO: ${
        courseName || 'Curso Preparatório'
      }
      
${contextoDisciplina ? `DISCIPLINA ESPECÍFICA: ${contextoDisciplina.disciplina}\n` : ''}TÓPICO ESPECÍFICO DO EDITAL (USE APENAS ESTE TÓPICO, NÃO MISTURE COM OUTROS): ${resolvedTopicKey}
NOME DO TÓPICO: ${effectiveTopicNome || resolvedTopicKey}

EDITAL BASE (trecho relevante para este tópico):
${editalText.substring(0, 8000)}${editalText.length > 8000 ? '\n\n[texto truncado...]' : ''}

⚠️⚠️⚠️ BANCA EXAMINADORA - OBRIGATÓRIO 🚨🚨🚨
BANCA DEFINIDA: ${banca || 'NÃO DEFINIDA'}
- ADAPTE TODAS AS QUESTÕES ao estilo da banca "${banca || 'NÃO DEFINIDA'}"
- Se a banca for INSTITUTO AOCP: questões de múltipla escolha diretas (A, B, C, D, E), interpretação literal
- Se a banca for FGV: questões contextualizadas, análise crítica, interpretação de texto
- Se a banca for CESPE/CEBRASPE: assertivas C/E (Certo/Errado), interpretação constitucional
- Se a banca for FCC: questões de múltipla escolha (A, B, C, D, E), legislação atualizada
- Se a banca for VUNESP: questões contextualizadas, análise crítica, interpretação de texto
- SEJA FIEL À BANCA DEFINIDA ACIMA.

INSTRUÇÕES:
Gere questões preditivas de "Véspera de Prova" para o tópico "${effectiveTopicNome || resolvedTopicKey}"${contextoDisciplina ? ` da disciplina "${contextoDisciplina.disciplina}"` : ''}.

DATA ATUAL: ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
IMPORTANTE: Use apenas informações atualizadas até esta data. Verifique se há leis, decretos ou regulamentos recentes que possam afetar o conteúdo.

**MODO HACKER DOS CONCURSOS**

1. **RAIO-X DE PROBABILIDADE**:
   - Top Assuntos Quentes: Identifique os assuntos com maior probabilidade de cair NO CONCURSO ${concursoName || 'mencionado'}
   - O Padrão da Banca: Como a banca ${banca || 'NÃO DEFINIDA'} costuma cobrar este tópico especificamente no concurso

2. **QUESTÕES PREDITIVAS**:
   - Gere EXATAMENTE 40 a 50 questões preditivas para este tópico
   - O MÍNIMO OBRIGATÓRIO é 40 questões - não gere menos que isso
   - Se o tópico for extenso, gere até 50 questões para cobertura completa
   - No estilo da banca ${banca || 'NÃO DEFINIDA'} (A, B, C, D, E ou Certo/Errado)
   - Contextualizadas com o concurso ${concursoName || 'mencionado'}
   - Gabarito Comentado: explique o porquê das outras estarem erradas
   - **USE FORMATAÇÃO RICA no gabarito**: Use **negrito** para resposta correta, *itálico* para explicações, e formatação visual para destacar pontos importantes
   - **NÃO ECONOMIZE TEXTO**: Seja detalhado e completo nas explicações, mas não excessivamente extenso

3. **CONTEÚDO ESPECÍFICO**:
   - Conteúdo específico para o concurso — nada genérico, LETRA de lei
   - Não invente nada, seja literal e fiel a matéria com fontes firmes
   - Se for direito gere as questões de acordo com a lei sem inventar nada, seja fiel a lei
   - Não invente nada, seja direto nas questões e com conteúdo fiel
   - Linguagem formal, nível concurso público
   - 🚨 BANCA EXAMINADORA: Use EXCLUSIVAMENTE o estilo da banca "${banca || 'NÃO DEFINIDA'}"

FORMATO JSON:
{
  "titulo": "Título específico do conteúdo",
  "materia": "${effectiveTopicNome || resolvedTopicKey}",
  "subtitulo": "Subtítulo específico opcional",
  "numero": "${resolvedTopicKey}",
  "raioXProbabilidade": {
    "topicosQuentes": ["assunto 1", "assunto 2", "assunto 3"],
    "padraoBanca": "descrição do padrão"
  },
  "questoesPreditivas": [
    {
      "enunciado": "texto da questão",
      "alternativas": {
        "A": "Alternativa A",
        "B": "Alternativa B",
        "C": "Alternativa C",
        "D": "Alternativa D",
        "E": "Alternativa E"
      },
      "correta": "A",
      "gabaritoComentado": "explicação detalhada"
    }
  ]
}

REGRAS:
- Use tom focado e direto
- Seja ESPECÍFICO do concurso ${concursoName || 'mencionado'}
- Cite o nome do concurso nas questões
- Retorne APENAS o JSON válido, sem texto adicional
- NÃO use caracteres de markdown (como **, *, •, __, ~~, \` etc.) nos textos`

      setProgress((prev) => Math.min(prev + 15, 70))
      const response = await callGeminiWithRetry(prompt, {
        maxRetries: 3,
        baseDelay: 2000,
        models: ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'],
        generationConfig: { temperature: 0.7, maxOutputTokens: 32000 },
        useGoogleSearch: true,
      })

      const aiText = extractGeneratedText(response)
      setProgress(75)

      let jsonText = aiText
      if (jsonText.startsWith('```json')) {
        jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/```\n?/g, '').trim()
      }
      const jsonMatch = jsonText.match(/\{[\s\S]*\}/)
      if (jsonMatch) jsonText = jsonMatch[0]

      let parsed = null
      try {
        // Tentar fazer o parse direto
        parsed = JSON.parse(jsonText)
      } catch (parseError) {
        console.error('Erro ao fazer parse do JSON:', parseError.message)
        console.error('JSON extraído:', jsonText)
        
        // Tentar corrigir problemas comuns de formatação
        let fixedJson = jsonText
          .replace(/,\s*}/g, '}')  // Vírgula antes de fechar objeto
          .replace(/,\s*]/g, ']')  // Vírgula antes de fechar array
          .replace(/\n\s*\}/g, '}')  // Nova linha antes de fechar objeto
          .replace(/\n\s*\]/g, ']')  // Nova linha antes de fechar array
          .replace(/\\n/g, '\\n')  // Corrigir quebras de linha em strings
          .replace(/\\t/g, '\\t')  // Corrigir tabulações em strings
        
        try {
          parsed = JSON.parse(fixedJson)
          console.log('JSON corrigido com sucesso')
        } catch (fixError) {
          throw new Error(`JSON inválido mesmo após correção: ${fixError.message}`)
        }
      }
      const payload = {
        ...parsed,
        materia: parsed.materia || parsed.titulo || resolvedTopicKey,
        numero: parsed.numero || resolvedTopicKey,
        updatedAt: serverTimestamp(),
        generatedAt: serverTimestamp(),
      }

      // Sanitizar o topicKey para usar como ID de documento no Firestore
      const sanitizedKey = sanitizeTopicKeyForFirestore(resolvedTopicKey)
      
      await setDoc(doc(db, 'courses', resolvedCourseId, 'questoesTopico', sanitizedKey), payload, {
        merge: true,
      })
      setQuestoes({ id: sanitizedKey, ...payload })
      setError('')
      setProgress(100)
      return true
    } catch (err) {
      console.error('Erro ao gerar questões:', err)
      const message = err instanceof Error ? err.message : String(err)
      setError(message || 'Erro ao gerar questões.')
      return false
    } finally {
      setGenerating(false)
      setLoading(false)
      setTimeout(() => setProgress(0), 800)
    }
  }

  const handleEditContent = () => {
    const contentToEdit = {
      ...questoes,
      updatedAt: undefined,
      generatedAt: undefined,
    }
    setEditedContent(JSON.stringify(contentToEdit, null, 2))
    setEditingContent(true)
  }

  const handleSaveContent = async () => {
    try {
      const sanitizedKey = sanitizeTopicKeyForFirestore(resolvedTopicKey)
      const contentRef = doc(db, 'courses', resolvedCourseId, 'questoesTopico', sanitizedKey)
      
      let parsedContent
      try {
        parsedContent = JSON.parse(editedContent)
      } catch (e) {
        alert('Erro: JSON inválido. Verifique a formatação.')
        return
      }
      
      await setDoc(contentRef, {
        ...parsedContent,
        updatedAt: serverTimestamp(),
      }, { merge: true })
      
      setQuestoes(parsedContent)
      setEditingContent(false)
    } catch (error) {
      console.error('Erro ao salvar conteúdo:', error)
      alert('Erro ao salvar conteúdo. Tente novamente.')
    }
  }

  const handleCancelEdit = () => {
    setEditingContent(false)
    setEditedContent('')
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center space-y-4 w-full max-w-md px-6">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-alego-600 border-t-transparent"></div>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Carregando questões preditivas...
          </p>
          {generating && (
            <>
              <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-alego-600 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {progress}% concluído
              </p>
            </>
          )}
        </div>
      </div>
    )
  }

  if (!questoes && error) {
    return (
      <div className="min-h-screen py-6">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <Link
            to="/edital-verticalizado"
            className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-alego-600 dark:hover:text-alego-400 mb-6"
          >
            <ArrowLeftIcon className="h-5 w-5" />
            Voltar ao Edital Verticalizado
          </Link>
          
          <div className={`bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 p-12 text-center`}>
            <QuestionMarkCircleIcon className="h-16 w-16 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
              Questões Preditivas não disponíveis
            </h1>
            <p className="text-slate-600 dark:text-slate-400 mb-6">
              {error}
            </p>
            {isAdmin && (
              <button
                onClick={handleGenerateQuestoes}
                disabled={generating}
                className="inline-flex items-center gap-2 px-6 py-3 bg-alego-600 text-white rounded-xl font-semibold hover:bg-alego-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {generating ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                    Gerando Questões... ({progress}%)
                  </>
                ) : (
                  <>
                    <QuestionMarkCircleIcon className="h-5 w-5" />
                    Gerar Questões Preditivas
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen py-6">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6">
          <Link
            to="/edital-verticalizado"
            className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-alego-600 dark:hover:text-alego-400 mb-4"
          >
            <ArrowLeftIcon className="h-5 w-5" />
            Voltar ao Edital Verticalizado
          </Link>
          
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white mb-2">
                📚 BOOK QUESTÕES
              </h1>
              <p className="text-slate-600 dark:text-slate-400">
                {questoes?.materia || effectiveTopicNome}
              </p>
            </div>
            {isAdmin && !editingContent && (
              <button
                onClick={handleEditContent}
                className="inline-flex items-center gap-2 px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
              >
                <PencilIcon className="h-4 w-4" />
                Editar
              </button>
            )}
          </div>
        </div>

        {/* Conteúdo Principal */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 p-6">
          {editingContent ? (
            <div className="space-y-4">
              <textarea
                value={editedContent}
                onChange={(e) => setEditedContent(e.target.value)}
                className="w-full h-96 p-4 font-mono text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                spellCheck={false}
              />
              <div className="flex gap-3">
                <button
                  onClick={handleSaveContent}
                  className="px-4 py-2 bg-alego-600 text-white rounded-lg hover:bg-alego-700 transition-colors"
                >
                  Salvar
                </button>
                <button
                  onClick={handleCancelEdit}
                  className="px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Raio-X de Probabilidade */}
              {questoes?.raioXProbabilidade && (
                <div className="bg-gradient-to-r from-orange-50 to-red-50 dark:from-orange-900/20 dark:to-red-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <FireIcon className="h-6 w-6 text-orange-600 dark:text-orange-400" />
                    <h3 className="text-lg font-bold text-orange-900 dark:text-orange-100">
                      Raio-X de Probabilidade
                    </h3>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <h4 className="font-semibold text-orange-800 dark:text-orange-200 mb-2">Top Assuntos Quentes:</h4>
                      <ul className="list-disc list-inside text-orange-700 dark:text-orange-300 space-y-1">
                        {questoes.raioXProbabilidade.topicosQuentes?.map((assunto, idx) => (
                          <li key={idx}>{assunto}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <h4 className="font-semibold text-orange-800 dark:text-orange-200 mb-2">Padrão da Banca:</h4>
                      <p className="text-orange-700 dark:text-orange-300">{questoes.raioXProbabilidade.padraoBanca}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Questões Preditivas */}
              {questoes?.questoesPreditivas && questoes.questoesPreditivas.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 mb-4">
                    <QuestionMarkCircleIcon className="h-6 w-6 text-green-600 dark:text-green-400" />
                    <h3 className="text-lg font-bold text-green-900 dark:text-green-100">
                      Questões Preditivas ({questoes.questoesPreditivas.length})
                    </h3>
                  </div>
                  
                  {questoes.questoesPreditivas.map((questao, idx) => (
                    <div key={idx} className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-6">
                      <div className="mb-4">
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">Questão {idx + 1}</p>
                        <p className="text-slate-900 dark:text-white font-medium">{questao.enunciado}</p>
                      </div>
                      
                      <div className="space-y-2 mb-4">
                        {Object.entries(questao.alternativas || {}).map(([letra, texto]) => (
                          <div 
                            key={letra}
                            className={`p-3 rounded-lg border ${
                              letra === questao.correta
                                ? 'bg-green-50 dark:bg-green-900/20 border-green-500 dark:border-green-500'
                                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                            }`}
                          >
                            <span className="font-semibold text-slate-700 dark:text-slate-300 mr-2">{letra})</span>
                            <span className="text-slate-900 dark:text-white">{texto}</span>
                          </div>
                        ))}
                      </div>
                      
                      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                        <p className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">
                          Gabarito: {questao.correta}
                        </p>
                        <div className="text-blue-800 dark:text-blue-200 text-sm">
                          <ReactMarkdown>{questao.gabaritoComentado}</ReactMarkdown>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default QuestoesTopicoView
