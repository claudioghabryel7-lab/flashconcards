import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { collection, doc, getDoc, getDocs, query, where, limit, setDoc, serverTimestamp, orderBy } from 'firebase/firestore'
import { ArrowLeftIcon, PencilIcon, FireIcon, LightBulbIcon, ExclamationTriangleIcon, BookOpenIcon, ChevronDownIcon, ChevronUpIcon, CheckIcon } from '@heroicons/react/24/outline'
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
// Remove/substitui caracteres que podem ser interpretados como separadores de caminho
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
  // :: -> _DOUBLECOLON_ (mais curto e ainda único)
  // / -> _SLASH_
  // \ -> _BACKSLASH_
  // Manter outros caracteres especiais que são seguros (parênteses, números, etc)
  let sanitized = decoded
    .replace(/::/g, '_DOUBLECOLON_')
    .replace(/\//g, '_SLASH_')
    .replace(/\\/g, '_BACKSLASH_')
    .trim()
  
  // Limitar tamanho (Firestore tem limite de 1500 bytes para IDs, mas IDs muito longos são problemáticos)
  // Manter até 400 caracteres para deixar margem de segurança
  if (sanitized.length > 400) {
    sanitized = sanitized.substring(0, 400)
  }
  
  // Se após sanitização ficar vazio ou contiver apenas caracteres inválidos, criar um hash simples
  if (!sanitized || sanitized.trim() === '') {
    // Criar um hash simples baseado no topicKey original
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
    const sanitizedRef = doc(db, 'courses', courseId, 'conteudosCompletos', sanitizedKey)
    const sanitizedDoc = await getDoc(sanitizedRef)
    if (sanitizedDoc.exists()) {
      return { id: sanitizedDoc.id, ...sanitizedDoc.data() }
    }
  } catch (e) {
    // Ignorar erro se a chave sanitizada for inválida
  }
  
  // Tentar com a chave original (para compatibilidade com documentos antigos)
  // Mas apenas se não contiver caracteres problemáticos
  if (!topicKey.includes('::') && !topicKey.includes('/') && !topicKey.includes('\\')) {
    try {
      const originalRef = doc(db, 'courses', courseId, 'conteudosCompletos', topicKey)
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

// Extrai partes estruturadas da chave do tópico.
// Suporta tanto o formato antigo ("1", "Lei de Drogas ...")
// quanto o formato novo ("1 :: Lei de Drogas ...").
const parseTopicKey = (rawKey = '') => {
  const key = normalizeKey(rawKey)
  if (!key) return { numero: '', nome: '', raw: '' }

  const [numeroPart, ...rest] = key.split('::')
  if (rest.length === 0) {
    // Formato antigo: pode ser só número ou só nome
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

const ConteudoCompletoTopicoView = () => {
  const { courseId, topicKey } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { darkMode } = useDarkMode()
  const { user, profile } = useAuth()
  const [conteudo, setConteudo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [courseName, setCourseName] = useState('')
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState(0)
  const [validating, setValidating] = useState(false)
  const [validationMessage, setValidationMessage] = useState('')
  const [editingContent, setEditingContent] = useState(false)
  const [editedContent, setEditedContent] = useState('')

  // Função para registrar matéria estudada no calendário
  const registrarMateriaEstudada = async (materia) => {
    if (!user || !profile?.selectedCourseId) return
    
    try {
      const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD
      const courseKey = profile.selectedCourseId || 'alego'
      const progressDoc = doc(db, 'progress', `${user.uid}_${courseKey}_${today}`)
      
      // Verificar se já existe registro para hoje
      const existing = await getDoc(progressDoc)
      
      if (existing.exists()) {
        // Atualizar registro existente para adicionar matéria
        await setDoc(progressDoc, {
          ...existing.data(),
          materia: materia, // Adicionar/atualizar matéria
          lastUpdated: new Date().toTimeString(),
        }, { merge: true })
      } else {
        // Criar novo registro
        await setDoc(progressDoc, {
          uid: user.uid,
          date: today,
          hours: 0.1, // Mínimo para aparecer no calendário
          courseId: profile.selectedCourseId || null,
          materia: materia, // Adicionar matéria estudada
          lastUpdated: new Date().toTimeString(),
        })
      }
      
      console.log('✅ Matéria registrada no calendário:', materia)
    } catch (error) {
      console.error('Erro ao registrar matéria estudada:', error)
    }
  }

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

  // Substituir referências ao concurso pelo nome do curso
  const replaceConcursoWithCourse = (text) => {
    if (!text || !courseName) return text
    return text
      .replace(/Legislação Especial para o Concurso da [^<)]+/gi, `Legislação Especial para o ${courseName}`)
      .replace(/Câmara Municipal de [^<)]+/gi, courseName)
      .replace(/Concurso da Câmara Municipal de [^<)]+/gi, courseName)
      .replace(/Concurso público da [^<)]+/gi, courseName)
      .replace(/concurso público da [^<)]+/gi, courseName)
      .replace(/\s*\(Cargos?\s+\d+[^)]*\)/gi, '')
      .replace(/\s*\([^)]*Policial[^)]*\)/gi, '')
      .replace(/para os cargos [^<)]+/gi, `para o ${courseName}`)
      .replace(/para o cargo [^<)]+/gi, `para o ${courseName}`)
      .replace(/\s*-\s*[A-Z]{2}\s*/gi, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
  }

  useEffect(() => {
    const loadConteudo = async () => {
      if (!resolvedTopicKey || !resolvedCourseId) {
        setError('Conteúdo não encontrado')
        setLoading(false)
        return
      }

      // Validar que o topicKey não está vazio após decode
      const trimmedKey = resolvedTopicKey.trim()
      if (!trimmedKey || trimmedKey === '') {
        setError('Tópico inválido: identificação do tópico está vazia')
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        setError('')

        // 1) Tentar doc com ID = topicKey (forma mais segura e específica)
        // Validar que todos os segmentos estão presentes antes de criar a referência
        if (!resolvedCourseId || !trimmedKey) {
          throw new Error('Referência de documento inválida: faltam parâmetros necessários')
        }
        
        // Tentar encontrar documento usando função que sanitiza a chave
        const foundDoc = await findDocumentByTopicKey(resolvedCourseId, trimmedKey)
        if (foundDoc) {
          setConteudo(foundDoc)
          setLoading(false)
          return
        }

        // 2) Buscar por número do tópico (considerando possíveis duplicidades)
        const conteudosRef = collection(db, 'courses', resolvedCourseId, 'conteudosCompletos')

        const tryMatchFromSnapshot = (snap) => {
          if (snap.empty) return null

          // Se não tivermos nome alvo, volta o primeiro mesmo
          if (!effectiveTopicNome) {
            const docSnap = snap.docs[0]
            return { id: docSnap.id, ...docSnap.data() }
          }

          // Caso tenhamos o nome do tópico, tentamos achar o doc mais parecido
          const target = effectiveTopicNome.toLowerCase()

          // 1) Match exato em materia ou titulo
          const exact = snap.docs.find((d) => {
            const data = d.data() || {}
            const materia = (data.materia || '').toString().toLowerCase()
            const titulo = (data.titulo || '').toString().toLowerCase()
            return materia === target || titulo === target
          })
          if (exact) return { id: exact.id, ...exact.data() }

          // 2) Contém o texto do tópico
          const contains = snap.docs.find((d) => {
            const data = d.data() || {}
            const materia = (data.materia || '').toString().toLowerCase()
            const titulo = (data.titulo || '').toString().toLowerCase()
            return materia.includes(target) || titulo.includes(target)
          })
          if (contains) return { id: contains.id, ...contains.data() }

          // 3) Fallback: primeiro doc mesmo
          const first = snap.docs[0]
          return { id: first.id, ...first.data() }
        }

        if (topicNumeroFromKey) {
          const qNumero = query(conteudosRef, where('numero', '==', topicNumeroFromKey), limit(10))
          const numeroSnap = await getDocs(qNumero)
          const matchedFromNumero = tryMatchFromSnapshot(numeroSnap)
          if (matchedFromNumero) {
            setConteudo(matchedFromNumero)
            setLoading(false)
            return
          }
        }

        // 3) Buscar por nome/matéria se tivermos essa informação
        if (effectiveTopicNome) {
          const qMateria = query(conteudosRef, where('materia', '==', effectiveTopicNome), limit(10))
          const materiaSnap = await getDocs(qMateria)
          const matchedFromMateria = tryMatchFromSnapshot(materiaSnap)
          if (matchedFromMateria) {
            setConteudo(matchedFromMateria)
            setLoading(false)
            return
          }
        }

        setError('Chame o professor Flash, ele vai te mostrar o caminho. Aguarde até ele te entregar o conteúdo e não feche a página.')
        setLoading(false)
      } catch (err) {
        console.error('Não se preocupe, chame o professor Flash novamente e dará certo.', err)
        const errorMessage = err.message || String(err)
        
        // Tratar erros específicos do Firestore
        if (errorMessage.includes('Invalid document reference') || errorMessage.includes('even number of segments')) {
          setError('Erro: Tópico inválido. Por favor, verifique se o tópico possui identificação válida.')
        } else if (errorMessage.includes('Missing or insufficient permissions')) {
          setError('Erro de permissão. Por favor, verifique se você está autenticado e tente novamente.')
        } else {
          setError('Erro ao carregar conteúdo. Tente novamente.')
        }
        setLoading(false)
      }
    }

    loadConteudo()
  }, [resolvedTopicKey, resolvedCourseId])

  // Registrar automaticamente a matéria estudada quando o conteúdo for carregado
  useEffect(() => {
    if (conteudo && conteudo.materia && !loading) {
      // Registrar a matéria no calendário com um pequeno delay para garantir que o componente esteja montado
      const timer = setTimeout(() => {
        registrarMateriaEstudada(conteudo.materia)
      }, 2000) // 2 segundos após carregar

      return () => clearTimeout(timer)
    }
  }, [conteudo, loading])

  const handleValidateTopic = async () => {
    if (!resolvedCourseId || !resolvedTopicKey || !conteudo) return

    const apiKey = import.meta.env.VITE_GEMINI_API_KEY
    if (!apiKey) {
      setError('API Key não configurada.')
      return
    }

    try {
      setValidating(true)
      setValidationMessage('')

      const genAI = new GoogleGenerativeAI(apiKey)
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

      const resumoConteudo = [
        conteudo.materia || '',
        conteudo.titulo || '',
        conteudo.subtitulo || '',
        (conteudo.content || '').toString().replace(/<[^>]+>/g, ' ').slice(0, 1500),
      ]
        .join('\n')
        .trim()

      const validatorPrompt = `Você é um avaliador de aderência de conteúdo a tópicos de edital.

TÓPICO-ALVO DO EDITAL:
- chave bruta: "${resolvedTopicKey}"
- número (se houver): "${topicNumeroFromKey || ''}"
- nome (se houver): "${effectiveTopicNome || ''}"

CONTEÚDO GERADO (resumo):
${resumoConteudo || '[vazio]'}

TAREFA:
Verifique se o conteúdo acima realmente corresponde ao tópico do edital informado.

REGRAS:
- Considere que o conteúdo está "correto" se a MAIOR PARTE dele tratar diretamente do tópico.
- Marque como "incorreto" se o conteúdo falar de outra lei, outro assunto principal ou da matéria inteira de forma genérica.

RESPOSTA APENAS EM JSON VÁLIDO, no formato exato:
{
  "match": true|false,
  "reason": "explicação curta em português",
  "action": "keep" ou "regenerate"
}

ONDE:
- "match" deve ser false quando o conteúdo não estiver alinhado ao tópico.
- "action" deve ser "keep" quando estiver adequado e "regenerate" quando estiver inadequado.`

      const result = await model.generateContent(validatorPrompt)
      let text = result.response.text().trim()
      if (text.startsWith('```json')) {
        text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      } else if (text.startsWith('```')) {
        text = text.replace(/```\n?/g, '').trim()
      }
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) text = jsonMatch[0]

      const parsed = JSON.parse(text)
      const match = !!parsed.match
      const action = parsed.action === 'regenerate' ? 'regenerate' : 'keep'
      const reason = parsed.reason || ''

      if (match && action === 'keep') {
        setValidationMessage(
          reason
            ? `A IA analisou e entendeu que o conteúdo está coerente com este tópico: ${reason}`
            : 'A IA analisou e entendeu que o conteúdo está coerente com este tópico.'
        )
        return
      }

      // Conteúdo considerado inadequado para o tópico → regenerar
      const success = await handleGenerateContent()
      if (success) {
        setValidationMessage(
          reason
            ? `A IA detectou que o conteúdo não condizia bem com o tópico e gerou um novo material: ${reason}`
            : 'A IA detectou que o conteúdo não condizia bem com o tópico e gerou um novo material.'
        )
      } else {
        setValidationMessage('A IA indicou que o conteúdo não está adequado, mas houve erro ao tentar regenerar.')
      }
    } catch (err) {
      console.error('Erro ao validar tópico/conteúdo:', err)
      setValidationMessage('Não foi possível validar automaticamente este conteúdo agora. Tente novamente mais tarde.')
    } finally {
      setValidating(false)
    }
  }

  const handleGenerateContent = async () => {
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

          // Verificar se o edital está dividido em partes
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

      const prompt = `Você é um especialista em criar conteúdo técnico completo e ESPECÍFICO para cursos preparatórios de concursos públicos.

CONTEXTO (não cite estes nomes no texto final):
${banca ? `BANCA: ${banca}\n` : ''}${concursoName ? `CONCURSO: ${concursoName}\n` : ''}CURSO: ${
        courseName || 'Curso Preparatório'
      }
      
${contextoDisciplina ? `DISCIPLINA ESPECÍFICA: ${contextoDisciplina.disciplina}\n` : ''}TÓPICO ESPECÍFICO DO EDITAL (USE APENAS ESTE TÓPICO, NÃO MISTURE COM OUTROS): ${resolvedTopicKey}
NOME DO TÓPICO: ${effectiveTopicNome || resolvedTopicKey}

EDITAL BASE (trecho relevante para este tópico):
${editalText.substring(0, 8000)}${editalText.length > 8000 ? '\n\n[texto truncado...]' : ''}

⚠️⚠️⚠️ REGRAS CRÍTICAS - EVITE CONTEÚDO GENÉRICO ⚠️⚠️⚠️
1. FOCO 100% ESPECÍFICO: Crie conteúdo APENAS para o tópico "${effectiveTopicNome || resolvedTopicKey}"${contextoDisciplina ? ` DENTRO DA DISCIPLINA "${contextoDisciplina.disciplina}"` : ''}
2. NÃO CRIE conteúdo genérico sobre toda a matéria (ex: se tópico é "Conceitos" em "Direito Constitucional", não fale de todo Direito Constitucional)
3. SEJA ESPECÍFICO: Use artigos, leis, números, jurisprudência relacionados a ESTE tópico ${contextoDisciplina ? `nesta disciplina` : ''}
4. EVITE ASSUNTOS DIFERENTES: Não mencione outros tópicos do edital
5. CONTEÚDO TÉCNICO: Use linguagem formal, citations, artigos de lei
6. PROFUNDIDADE ADEQUADA: Nível técnico para concurso público, não básico
7. EXEMPLOS PRÁTICOS: Inclua exemplos concretos e aplicáveis

🚨🚨🚨 BANCA EXAMINADORA - OBRIGATÓRIO 🚨🚨🚨
BANCA DEFINIDA: ${banca || 'NÃO DEFINIDA'}
- ADAPTE TODO O CONTEÚDO ao estilo da banca "${banca || 'NÃO DEFINIDA'}"
- Se a banca for INSTITUTO AOCP: foco em artigos de lei na íntegra, questões de múltipla escolha diretas, interpretação literal
- Se a banca for FGV: foco em interpretação de texto, questões contextualizadas, análise crítica
- Se a banca for CESPE/CEBRASPE: foco em assertivas C/E, interpretação constitucional
- Se a banca for FCC: foco em legislação atualizada, questões de múltipla escolha, interpretação direta
- Se a banca for VUNESP: foco em interpretação de texto, questões contextualizadas, análise crítica
- SEJA FIEL À BANCA DEFINIDA ACIMA.

EXEMPLOS DO QUE EVITAR (ERRADO):
❌ Se tópico é "Conceitos" em "Direito Constitucional": 
   "O Direito Constitucional é o ramo do direito que estuda as constituições..."
INSTRUÇÕES:
Gere um material de revisão de "Véspera de Prova" para o tópico "${effectiveTopicNome || resolvedTopicKey}"${contextoDisciplina ? ` da disciplina "${contextoDisciplina.disciplina}"` : ''}.

🔍 VERIFICAÇÃO DE FONTES - OBRIGATÓRIO:
- Para CADA lei, decreto ou norma jurídica mencionada, VERIFIQUE a atualidade usando as ferramentas disponíveis
- Para CADA jurisprudência citada, VERIFIQUE se está vigente e atualizada
- Use as ferramentas de Function Calling para buscar em APIs oficiais (Senado, Datajud/CNJ)
- Sempre busque de fontes confiáveis: TJ,STF,LEI(E SUAS ATUALIZAÇÕES, NÃO PEGUE NADA ANTIGO OU DESATUALIZADO), GRAN CURSOS, QCONCURSOS, CONTEÚDOS JURÍDICOS, SITES DO PLANALTO, ENTENDIMENTOS ETC EM MATÉRIAS DE DIREITO... O FOCO É SEMPRE SER ATUALIZADO!
 Atualizações até o ano de agora ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })} até o exato momento
Sempre verifique atualizações de acordo com a data hora em ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })} , nunca dê conteúdo desatualizado... sempre atualizado. Verifique a veracidade da fonte em useGoogleSearch.
DATA ATUAL: ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
IMPORTANTE: Use apenas informações atualizadas até esta data. Verifique se há leis, decretos ou regulamentos recentes que possam afetar o conteúdo.

**MODO HACKER DOS CONCURSOS**

1. **RAIO-X DE PROBABILIDADE**:
   - Top Assuntos Quentes: Gere entre 5 a 15 tópicos com maior probabilidade de cair NO CONCURSO ${concursoName || 'mencionado'} (quantidade depende da extensão do conteúdo da disciplina)
   - O Padrão da Banca: Como a banca ${banca || 'NÃO DEFINIDA'} costuma cobrar esta disciplina especificamente no concurso.

2. **REVISÃO TURBO**:
   - 🚨 OBRIGATÓRIO: Gere UM RESUMO para CADA UM dos "Top Assuntos Quentes" listados no Raio-X de Probabilidade
   - Se houver 5 top assuntos quentes, gere 5 resumos (um para cada)
   - Se houver 10 top assuntos quentes, gere 10 resumos (um para cada)
   - Cada resumo deve corresponder EXATAMENTE a um dos top assuntos quentes listados
   - NÃO PULE nenhum top assunto quente - todos devem ter seu resumo
   - Cada resumo deve:
     * Explicar o conceito de forma clara e didática (NADA SUPERFICIAL, QUERO BEM COMPLETO)
     * Citar exemplos práticos do concurso ${concursoName || 'mencionado'}
     * Ser específico para o cargo de ${courseName || 'mencionado'}
     * Incluir dicas de memorização (nada genérico e vazio/vago)
     * Use texto limpo sem markdown (apenas tags HTML simples como <b> e <i> se necessário)
   - 3-4 pegadinhas ("Cuidado meu querido aluno!"):
     * Erros comuns que a banca ${banca || 'NÃO DEFINIDA'} costuma cobrar
     * Detalhes que passam despercebidos
     * Armadilhas específicas do concurso ${concursoName || 'mencionado'}
     * Use texto limpo sem markdown (apenas tags HTML simples como <b> e <i> se necessário)

3. **QUESTÕES PREDITIVAS**:
   - Gere EXATAMENTE 5 questões para este tópico
   - No estilo da banca ${banca || 'NÃO DEFINIDA'} (A, B, C, D, E ou Certo/Errado)
   - Contextualizadas com o concurso ${concursoName || 'mencionado'} e cargo ${courseName || 'mencionado'}
   - Gabarito Comentado: explique o porquê das outras estarem erradas
   - Use texto limpo sem markdown (apenas tags HTML simples como <b> e <i> se necessário)
   - Seja detalhado e completo nas explicações

FORMATO JSON:
{
  "validacaoArtigo": "Artigo, lei ou jurisprudência específica citada (texto literal com fonte)",
  "titulo": "Título específico do conteúdo",
  "materia": "${effectiveTopicNome || resolvedTopicKey}",
  "subtitulo": "Subtítulo específico opcional",
  "numero": "${resolvedTopicKey}",
  "raioXProbabilidade": {
    "topicosQuentes": ["assunto 1", "assunto 2", "assunto 3"],
    "padraoBanca": "descrição do padrão"
  },
  "revisaoTurbo": [
    {
      "titulo": "Título do resumo",
      "conteudo": "resumo detalhado 1"
    }
  ],
  "pegadinhas": [
    {
      "titulo": "Cuidado meu querido aluno!",
      "conteudo": "pegadinha 1"
    }
  ],
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
- Seja ESPECÍFICO do concurso ${concursoName || 'mencionado'} e cargo ${courseName || 'mencionado'}
- Cite o nome do concurso e cargo nos resumos e questões
- Preencha "validacaoArtigo" PRIMEIRO com o artigo/lei/jurisprudência literal antes de escrever o conteúdo
- Retorne APENAS o JSON válido, sem texto adicional
- Use texto limpo sem markdown (apenas tags HTML simples como <b> e <i> se necessário)`

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

      const parsed = JSON.parse(jsonText)
      const payload = {
        ...parsed,
        materia: parsed.materia || parsed.titulo || resolvedTopicKey,
        numero: parsed.numero || resolvedTopicKey,
        updatedAt: serverTimestamp(),
        generatedAt: serverTimestamp(),
      }

      // Sanitizar o topicKey para usar como ID de documento no Firestore
      const sanitizedKey = sanitizeTopicKeyForFirestore(resolvedTopicKey)
      
      await setDoc(doc(db, 'courses', resolvedCourseId, 'conteudosCompletos', sanitizedKey), payload, {
        merge: true,
      })
      setConteudo({ id: sanitizedKey, ...payload })
      setError('')
      setProgress(100)
      return true
    } catch (err) {
      console.error('Erro ao gerar conteúdo:', err)
      const message = err instanceof Error ? err.message : String(err)
      setError(message || 'Erro ao gerar conteúdo.')
      return false
    } finally {
      setGenerating(false)
      setLoading(false)
      setTimeout(() => setProgress(0), 800)
    }
  }

  const handleEditContent = () => {
    // Editar todo o objeto JSON do conteúdo
    const contentToEdit = {
      ...conteudo,
      updatedAt: undefined,
      generatedAt: undefined,
    }
    setEditedContent(JSON.stringify(contentToEdit, null, 2))
    setEditingContent(true)
  }

  const handleSaveContent = async () => {
    try {
      const sanitizedKey = sanitizeTopicKeyForFirestore(resolvedTopicKey)
      const contentRef = doc(db, 'courses', resolvedCourseId, 'conteudosCompletos', sanitizedKey)
      
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
      
      setConteudo(parsedContent)
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
            Carregando conteúdo completo...
          </p>
          {generating && (
            <>
              <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-2 bg-alego-600 dark:bg-alego-400 transition-all duration-300"
                  style={{ width: `${Math.max(progress, 10)}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                A IA está gerando o conteúdo deste tópico. Não feche nem atualize a página até concluir.
              </p>
            </>
          )}
        </div>
      </div>
    )
  }

  if (error || !conteudo) {
    return (
      <div className="max-w-4xl mx-auto p-4">
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-8 text-center space-y-4">
          <h2 className="text-2xl font-bold text-red-600 dark:text-red-400">
            {error || 'Conteúdo não encontrado'}
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Tópico: <span className="font-semibold">{resolvedTopicKey}</span>
          </p>
          {generating && (
            <div className="space-y-3">
              <div className="w-full max-w-md mx-auto h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-2 bg-alego-600 dark:bg-alego-400 transition-all duration-300"
                  style={{ width: `${Math.max(progress, 15)}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Gerando conteúdo específico deste tópico. Isso pode levar alguns instantes, não feche a página.
              </p>
            </div>
          )}
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              type="button"
              onClick={handleGenerateContent}
              disabled={generating}
              className="inline-flex items-center gap-2 px-4 py-2 bg-alego-600 text-white rounded-lg hover:bg-alego-700 transition disabled:opacity-60"
            >
              {generating ? (
                <>
                  <span className="inline-block h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Gerando conteúdo...
                </>
              ) : (
                <>
                  <span role="img" aria-label="raio">⚡</span>
                  Chamar o professor!
                </>
              )}
            </button>
            <Link
              to="/conteudo-completo"
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-white rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 transition"
            >
              <ArrowLeftIcon className="w-5 h-5" />
              Biblioteca de Conteúdos
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 lg:p-8">
      <Link
        to="/edital-verticalizado"
        className="inline-flex items-center gap-2 mb-6 text-alego-600 dark:text-alego-400 hover:text-alego-700 dark:hover:text-alego-300 transition"
      >
        <ArrowLeftIcon className="w-5 h-5" />
        <span>Voltar ao Edital Verticalizado</span>
      </Link>

      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-6 sm:p-8 lg:p-10">
        <div className="mb-8 pb-6 border-b border-slate-200 dark:border-slate-700">
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">Material de Apoio</p>
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold text-alego-600 dark:text-alego-400 mb-2 break-words">
                {conteudo.materia || conteudo.titulo || resolvedTopicKey}
              </h1>
              {conteudo.titulo && conteudo.titulo !== conteudo.materia && (
                <h2 className="text-2xl sm:text-3xl font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  {conteudo.titulo}
                </h2>
              )}
              {conteudo.subtitulo && (
                <p className="text-lg text-slate-600 dark:text-slate-400 italic">
                  {replaceConcursoWithCourse(conteudo.subtitulo)}
                </p>
              )}
            </div>

            <div className="flex flex-col items-start gap-2 lg:items-end">
              <div className="flex gap-2 flex-wrap">
                {isAdmin && (
                  <button
                    type="button"
                    onClick={handleEditContent}
                    disabled={editingContent}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed transition"
                  >
                    <PencilIcon className="w-4 h-4" />
                    {editingContent ? 'Editando...' : 'Editar Conteúdo'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleValidateTopic}
                  disabled={validating || generating || editingContent}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed transition"
                >
                  {validating
                    ? 'Analisando matéria…'
                    : 'Reportar Matéria'}
                </button>
              </div>
              {validationMessage && (
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 max-w-md text-left lg:text-right">
                  {validationMessage}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="max-w-none">
          {courseName && (
            <div className="mb-6 p-4 bg-alego-50 dark:bg-alego-900/20 border-l-4 border-alego-500 rounded-r-lg">
              <p className="text-slate-700 dark:text-slate-300 text-base leading-relaxed">
                <strong className="font-bold text-slate-900 dark:text-slate-100">Este material foi elaborado para o curso <span className="text-alego-600 dark:text-alego-400 font-semibold">{courseName}</span>.</strong> Use-o para estudar este tópico específico do edital.
              </p>
            </div>
          )}

          {editingContent && isAdmin ? (
            <div className="space-y-4">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Editando todo o conteúdo em formato JSON. Você pode modificar qualquer campo: content, secoes, titulo, subtitulo, etc.
              </p>
              <textarea
                value={editedContent}
                onChange={(e) => setEditedContent(e.target.value)}
                className="w-full p-4 rounded-lg border-2 border-blue-300 dark:border-blue-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 min-h-[600px] resize-y font-mono text-sm"
                placeholder="Conteúdo JSON completo"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSaveContent}
                  className="px-4 py-2 bg-green-500 text-white rounded-lg font-bold hover:bg-green-600 transition"
                >
                  Salvar
                </button>
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="px-4 py-2 bg-slate-500 text-white rounded-lg font-bold hover:bg-slate-600 transition"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Raio-X de Probabilidade */}
              {conteudo.raioXProbabilidade && (
                <div className="bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/20 rounded-xl p-6 mb-8">
                  <div className="flex items-center gap-2 mb-4">
                    <FireIcon className="h-6 w-6 text-orange-600" />
                    <h4 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                      Raio-X de Probabilidade
                    </h4>
                  </div>
                  
                  <div className="space-y-4">
                    {conteudo.raioXProbabilidade.topicosQuentes && (
                      <div>
                        <h5 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                          🔥 Top Assuntos Quentes:
                        </h5>
                        <ul className="space-y-1">
                          {conteudo.raioXProbabilidade.topicosQuentes.map((assunto, aIdx) => (
                            <li key={aIdx} className="text-sm text-slate-600 dark:text-slate-400 flex items-center gap-2">
                              <span className="text-orange-600 font-bold">{aIdx + 1}.</span>
                              {assunto}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    
                    {conteudo.raioXProbabilidade.padraoBanca && (
                      <div>
                        <h5 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                          📊 O Padrão da Banca:
                        </h5>
                        <div 
                          className="text-sm text-slate-600 dark:text-slate-400"
                          dangerouslySetInnerHTML={{ __html: replaceConcursoWithCourse(conteudo.raioXProbabilidade.padraoBanca) }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}
              
              {/* Revisão Turbo */}
              {conteudo.revisaoTurbo && Array.isArray(conteudo.revisaoTurbo) && conteudo.revisaoTurbo.length > 0 && (
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl p-6 mb-8">
                  <div className="flex items-center gap-2 mb-4">
                    <LightBulbIcon className="h-6 w-6 text-blue-600" />
                    <h4 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                      Revisão Turbo
                    </h4>
                  </div>
                  
                  <div className="space-y-4">
                    {conteudo.revisaoTurbo.map((resumo, rIdx) => (
                      <div key={rIdx} className="text-sm text-slate-600 dark:text-slate-400">
                        <h5 className="font-semibold text-slate-700 dark:text-slate-300 mb-2">
                          {resumo.titulo}
                        </h5>
                        <div 
                          className="ia-content-enhanced text-sm text-slate-600 dark:text-slate-400"
                          dangerouslySetInnerHTML={{ __html: replaceConcursoWithCourse(resumo.conteudo) }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Pegadinhas */}
              {conteudo.pegadinhas && Array.isArray(conteudo.pegadinhas) && conteudo.pegadinhas.length > 0 && (
                <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-6 mb-8">
                  <div className="flex items-center gap-2 mb-4">
                    <ExclamationTriangleIcon className="h-6 w-6 text-red-600" />
                    <h4 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                      Cuidado, Caçapa!
                    </h4>
                  </div>
                  
                  <div className="space-y-4">
                    {conteudo.pegadinhas.map((pegadinha, pIdx) => (
                      <div key={pIdx} className="text-sm text-red-600 dark:text-red-400">
                        <h5 className="font-semibold mb-2">
                          {pegadinha.titulo}
                        </h5>
                        <div 
                          className="ia-content-enhanced text-sm text-red-600 dark:text-red-400"
                          dangerouslySetInnerHTML={{ __html: replaceConcursoWithCourse(pegadinha.conteudo) }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Questões Preditivas */}
              {conteudo.questoesPreditivas && Array.isArray(conteudo.questoesPreditivas) && conteudo.questoesPreditivas.length > 0 && (
                <div className="mb-8">
                  <div className="flex items-center gap-2 mb-4">
                    <BookOpenIcon className="h-6 w-6 text-alego-600" />
                    <h4 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                      Questões Preditivas
                    </h4>
                  </div>
                  
                  <div className="space-y-6">
                    {conteudo.questoesPreditivas.map((questao, qIdx) => (
                      <div
                        key={qIdx}
                        className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-6"
                      >
                        <div className="mb-4">
                          <span className="text-xs font-semibold text-alego-600 mb-2 block">
                            Aposta {qIdx + 1} de {conteudo.questoesPreditivas.length}
                          </span>
                          <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-line">
                            {questao.enunciado}
                          </p>
                        </div>
                        
                        {questao.alternativas && (
                          <div className="space-y-2 mb-4">
                            {Object.entries(questao.alternativas).map(([letra, alt]) => (
                              <div
                                key={letra}
                                className={`p-3 rounded-lg text-sm ${
                                  letra === questao.correta
                                    ? 'bg-green-100 dark:bg-green-900/30 border-2 border-green-500 text-green-800 dark:text-green-300'
                                    : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300'
                                }`}
                              >
                                {letra}) {alt}
                              </div>
                            ))}
                          </div>
                        )}
                        
                        {questao.gabaritoComentado && (
                          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                            <h5 className="text-sm font-semibold text-blue-700 dark:text-blue-400 mb-2">
                              💡 Gabarito Comentado:
                            </h5>
                            <div 
                              className="text-sm text-blue-600 dark:text-blue-300 ia-content-enhanced"
                              dangerouslySetInnerHTML={{ __html: replaceConcursoWithCourse(questao.gabaritoComentado) }}
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Conteúdo original (para compatibilidade) */}
              {conteudo.content && (
                <div className="mb-8">
                  <div 
                    className="ia-content-enhanced"
                    dangerouslySetInnerHTML={{ __html: replaceConcursoWithCourse(conteudo.content) }}
                  />
                </div>
              )}

              {conteudo.secoes && Array.isArray(conteudo.secoes) && conteudo.secoes.length > 0 && (
                <div className="space-y-8 mt-8">
                  {conteudo.secoes.map((secao, index) => (
                    <div
                      key={index}
                      className="border-l-4 border-alego-500 pl-6 py-3 bg-slate-50 dark:bg-slate-900/50 rounded-r-lg"
                    >
                      <h3 className="text-xl sm:text-2xl font-semibold text-alego-600 dark:text-alego-400 mb-3">
                        {secao.titulo || `Seção ${index + 1}`}
                        {secao.tipo && (
                          <span className="ml-3 text-sm bg-alego-100 dark:bg-alego-900 text-alego-700 dark:text-alego-300 px-3 py-1 rounded-full">
                            {secao.tipo}
                          </span>
                        )}
                      </h3>
                      {secao.conteudo && (
                        <div 
                          className="ia-content-enhanced"
                          dangerouslySetInnerHTML={{ __html: replaceConcursoWithCourse(secao.conteudo) }}
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default ConteudoCompletoTopicoView

