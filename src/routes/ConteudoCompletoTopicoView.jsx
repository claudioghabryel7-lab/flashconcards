import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { collection, doc, getDoc, getDocs, query, where, limit, setDoc, serverTimestamp } from 'firebase/firestore'
import { ArrowLeftIcon } from '@heroicons/react/24/outline'
import { db } from '../firebase/config'
import { useDarkMode } from '../hooks/useDarkMode.jsx'
import { GoogleGenerativeAI } from '@google/generative-ai'

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
  const [conteudo, setConteudo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [courseName, setCourseName] = useState('')
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState(0)
  const [validating, setValidating] = useState(false)
  const [validationMessage, setValidationMessage] = useState('')

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

        setError('Conteúdo completo não encontrado ou não corresponde a este tópico.')
        setLoading(false)
      } catch (err) {
        console.error('Erro ao carregar conteúdo completo:', err)
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
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })

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

      if (!editalText || editalText.trim().length === 0) {
        throw new Error('Edital não encontrado para este curso. Gere o edital primeiro.')
      }

      const unifiedRef = doc(db, 'courses', resolvedCourseId, 'prompts', 'unified')
      const unifiedDoc = await getDoc(unifiedRef)
      const unifiedData = unifiedDoc.exists() ? unifiedDoc.data() : {}
      const banca = unifiedData.banca || ''
      const concursoName = unifiedData.concursoName || ''
      setProgress(25)

      const genAI = new GoogleGenerativeAI(apiKey)
      const modelNames = ['gemini-2.0-flash', 'gemini-1.5-pro-latest', 'gemini-1.5-flash-latest']
      let aiText = ''
      let lastError = null

      const prompt = `Você é um especialista em criar conteúdo técnico completo para cursos preparatórios.

CONTEXTO (não cite estes nomes no texto final):
${banca ? `BANCA: ${banca}\n` : ''}${concursoName ? `CONCURSO: ${concursoName}\n` : ''}CURSO: ${
        courseName || 'Curso Preparatório'
      }
TÓPICO DO EDITAL (use APENAS este tópico, sem misturar com outros): ${resolvedTopicKey}

EDITAL BASE (trecho):
${editalText.substring(0, 6000)}${editalText.length > 6000 ? '\n\n[texto truncado]' : ''}

TAREFA:
Crie um conteúdo COMPLETO e DETALHADO para o tópico acima, com linguagem técnica e formal.

FORMATO DE RESPOSTA (APENAS JSON VÁLIDO):
{
  "titulo": "Título do conteúdo",
  "materia": "Nome da matéria ou tópico",
  "subtitulo": "Subtítulo opcional",
  "numero": "Mesma numeração do tópico do edital, se aplicável",
  "content": "Conteúdo principal em HTML",
  "secoes": [
    {
      "titulo": "Nome da seção",
      "tipo": "lei|sumula|entendimento|conceito",
      "conteudo": "Conteúdo HTML da seção"
    }
  ],
  "tags": ["lista", "de", "tags"]
}

REGRAS:
- O conteúdo DEVE ser específico para o tópico acima. Não faça um texto genérico da matéria inteira.
- Não inclua assuntos que pertençam a outros tópicos do edital.
- Não mencione concurso, prefeitura ou banca no texto final.
- Se usar numeração, mantenha a mesma numeração do tópico.
- Use HTML sem markdown.
- Comece diretamente com { e termine com } (JSON parseável).`

      for (const modelName of modelNames) {
        try {
          setProgress((prev) => Math.min(prev + 15, 70))
          const model = genAI.getGenerativeModel({ model: modelName })
          const result = await model.generateContent(prompt)
          aiText = result.response.text().trim()
          if (aiText) break
        } catch (err) {
          lastError = err
          continue
        }
      }

      if (!aiText) {
        throw lastError || new Error('Falha ao gerar conteúdo com a IA.')
      }
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
                  Gerar conteúdo agora
                </>
              )}
            </button>
            <Link
              to="/conteudo-completo"
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-white rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 transition"
            >
              <ArrowLeftIcon className="w-5 h-5" />
              Voltar para Conteúdos Completos
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
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">Tópico</p>
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
              <button
                type="button"
                onClick={handleValidateTopic}
                disabled={validating || generating}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed transition"
              >
                {validating
                  ? 'Analisando matéria…'
                  : 'Matéria errada? Validar e regenerar'}
              </button>
              {validationMessage && (
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 max-w-md text-left lg:text-right">
                  {validationMessage}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="prose prose-lg dark:prose-invert max-w-none">
          {courseName && (
            <div className="mb-6 p-4 bg-alego-50 dark:bg-alego-900/20 border-l-4 border-alego-500 rounded-r-lg">
              <p className="text-slate-700 dark:text-slate-300 text-base leading-relaxed">
                <strong>Este material foi elaborado para o curso <span className="text-alego-600 dark:text-alego-400 font-semibold">{courseName}</span>.</strong> Use-o para estudar este tópico específico do edital.
              </p>
            </div>
          )}

          {conteudo.content && (
            <div
              className="mb-8 text-slate-700 dark:text-slate-300"
              dangerouslySetInnerHTML={{ __html: replaceConcursoWithCourse(conteudo.content) }}
            />
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
                      className="text-slate-700 dark:text-slate-300"
                      dangerouslySetInnerHTML={{ __html: replaceConcursoWithCourse(secao.conteudo) }}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default ConteudoCompletoTopicoView

