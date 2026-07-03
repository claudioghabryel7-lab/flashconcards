import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { collection, doc, getDoc, getDocs, query, where, limit, setDoc, serverTimestamp, orderBy, deleteDoc } from 'firebase/firestore'
import { ArrowLeftIcon, FireIcon, CheckCircleIcon, XCircleIcon, TrashIcon, QuestionMarkCircleIcon, ChartBarIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import ReactMarkdown from 'react-markdown'
import { db } from '../firebase/config'
import { useDarkMode } from '../hooks/useDarkMode.jsx'
import { useAuth } from '../hooks/useAuth'
import { callGeminiWithRetry, extractGeneratedText } from '../utils/geminiApi'

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
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [selectedAnswer, setSelectedAnswer] = useState(null)
  const [showResult, setShowResult] = useState(false)
  const [answers, setAnswers] = useState([])
  const [desempenho, setDesempenho] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [nivelAtual, setNivelAtual] = useState(1)
  const [niveisDisponiveis, setNiveisDisponiveis] = useState([])
  const [mostrarSeletorNiveis, setMostrarSeletorNiveis] = useState(false)
  const [historicoNiveis, setHistoricoNiveis] = useState([])
  const [editandoQuestao, setEditandoQuestao] = useState(false)
  const [novoGabarito, setNovoGabarito] = useState('')
  const [novaExplicacao, setNovaExplicacao] = useState('')
  const [salvandoEdicao, setSalvandoEdicao] = useState(false)
  const [modoAdminNavegacao, setModoAdminNavegacao] = useState(false)
  const [termoBusca, setTermoBusca] = useState('')

  // Verificar se as questões têm a estrutura nova ou antiga
  const questoesArray = useMemo(() => {
    if (!questoes) return []
    // Estrutura nova: questoes.questoes
    if (questoes.questoes && Array.isArray(questoes.questoes)) {
      return questoes.questoes
    }
    // Estrutura antiga: questoes.questoesPreditivas
    if (questoes.questoesPreditivas && Array.isArray(questoes.questoesPreditivas)) {
      return questoes.questoesPreditivas
    }
    return []
  }, [questoes])

  // Questões filtradas por busca
  const questoesFiltradas = useMemo(() => {
    if (!termoBusca) return questoesArray
    const termo = termoBusca.toLowerCase()
    return questoesArray.filter((questao) => {
      const enunciado = (questao.enunciado || '').toLowerCase()
      const assunto = (questao.assunto || '').toLowerCase()
      const explicacao = (questao.explicacao || questao.gabaritoComentado || '').toLowerCase()
      return enunciado.includes(termo) || assunto.includes(termo) || explicacao.includes(termo)
    })
  }, [questoesArray, termoBusca])

  // Índice da questão atual nas questões filtradas
  const questoesParaExibir = modoAdminNavegacao && termoBusca ? questoesFiltradas : questoesArray
  const indiceQuestaoAtual = modoAdminNavegacao && termoBusca 
    ? questoesArray.indexOf(questoesParaExibir[currentQuestionIndex]) 
    : currentQuestionIndex

  const tipoProva = useMemo(() => {
    if (!questoes) return 'Múltipla Escolha'
    return questoes.tipoProva || 'Múltipla Escolha'
  }, [questoes])

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

        // Tentar encontrar documento usando função que sanitiza a chave (com nível)
        const sanitizedKey = sanitizeTopicKeyForFirestore(trimmedKey)
        
        // Carregar desempenho do usuário primeiro para saber o nível
        if (user) {
          const desempenhoRef = doc(db, 'users', user.uid, 'desempenhoTopico', sanitizedKey)
          const desempenhoDoc = await getDoc(desempenhoRef)
          if (desempenhoDoc.exists()) {
            const desempenhoData = desempenhoDoc.data()
            setNivelAtual(desempenhoData.nivel || 1)
          }
        }

        // Verificar quais níveis estão disponíveis
        const niveisDisponiveis = []
        for (let i = 1; i <= 10; i++) {
          const nivelDocRef = doc(db, 'courses', resolvedCourseId, 'questoesTopico', `${sanitizedKey}_nivel_${i}`)
          const nivelDoc = await getDoc(nivelDocRef)
          if (nivelDoc.exists()) {
            niveisDisponiveis.push(i)
          }
        }
        setNiveisDisponiveis(niveisDisponiveis)

        // Carregar histórico de desempenho por nível
        if (user) {
          const historico = []
          for (let i = 1; i <= 10; i++) {
            const desempenhoNivelRef = doc(db, 'users', user.uid, 'desempenhoTopico', `${sanitizedKey}_nivel_${i}`)
            const desempenhoNivelDoc = await getDoc(desempenhoNivelRef)
            if (desempenhoNivelDoc.exists()) {
              historico.push({
                nivel: i,
                ...desempenhoNivelDoc.data()
              })
            }
          }
          setHistoricoNiveis(historico)
        }
        
        // Tentar carregar do nível atual
        const docId = `${sanitizedKey}_nivel_${nivelAtual}`
        const questoesRef = doc(db, 'courses', resolvedCourseId, 'questoesTopico', docId)
        const questoesDoc = await getDoc(questoesRef)
        
        if (questoesDoc.exists()) {
          setQuestoes({ id: questoesDoc.id, ...questoesDoc.data() })
          setLoading(false)
          return
        }

        // Se não encontrar do nível atual, tentar sem nível (compatibilidade)
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
  }, [resolvedTopicKey, resolvedCourseId, user, nivelAtual])

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
      console.log('🔍 Buscando edital em:', editalRef.path)
      console.log('📋 courseId usado:', resolvedCourseId)
      const editalDoc = await getDoc(editalRef)
      console.log('📄 Edital existe?', editalDoc.exists())
      const editalData = editalDoc.exists() ? editalDoc.data() : {}
      console.log('📊 Dados do edital:', editalData)
      const editalText = (editalData.pdfText || editalData.prompt || '').toString()
      console.log('📝 Tamanho do editalText:', editalText.length)

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

      // Determinar tipo de prova baseado na banca
      const bancasCertoErrado = ['CESPE', 'CEBRASPE', 'FCC', 'VUNESP', 'FGV', 'IBFC', 'AOCP', 'CONSULPAM', 'FUNRIO', 'NUCEPE', 'QUADRIX', 'IDECAN']
      const tipoProva = bancasCertoErrado.some(b => banca.toUpperCase().includes(b)) ? 'Certo/Errado' : 'Múltipla Escolha'

      const prompt = `Você é um especialista em criar questões de concurso público baseadas em análise de incidência para um tópico específico.

CONTEXTO:
- CURSO: ${courseName || 'Curso Preparatório'}
- CARGO: ${courseData.cargo || courseData.competition || 'NÃO DEFINIDO'}
- BANCA EXAMINADORA: ${banca || 'NÃO DEFINIDA'}
- TIPO DE PROVA: ${tipoProva}
- DISCIPLINA: ${contextoDisciplina?.disciplina || effectiveTopicNome || resolvedTopicKey}
- TÓPICO: ${effectiveTopicNome || resolvedTopicKey}
- NÍVEL DE PRÁTICA: ${nivelAtual} (de 1 a 10, onde 1 é básico e 10 é avançado)

EDITAL BASE (trecho relevante para este tópico):
${editalText.substring(0, 8000)}${editalText.length > 8000 ? '\n\n[texto truncado...]' : ''}

INSTRUÇÕES SOBRE DIFICULDADE POR NÍVEL:
- Nível ${nivelAtual}: ${nivelAtual === 1 ? 'Questões básicas e diretas, foco em conceitos fundamentais' : nivelAtual <= 3 ? 'Questões de nível fácil a médio, com aplicação de conceitos básicos' : nivelAtual <= 6 ? 'Questões de nível médio, exigindo análise e interpretação' : nivelAtual <= 8 ? 'Questões de nível avançado, com casos complexos e detalhados' : 'Questões de nível especialista, com nuances jurídicas profundas e casos excepcionais'}
- Aumente progressivamente a dificuldade conforme o nível
- Nos níveis mais altos, inclua casos práticos, jurisprudência recente e questões de concursos anteriores

TAREFA:
Gere EXATAMENTE 50 questões de ${tipoProva} para o tópico "${effectiveTopicNome || resolvedTopicKey}".

INSTRUÇÕES CRÍTICAS - DISTRIBUIÇÃO DE QUESTÕES:
- Identifique os principais assuntos dentro deste tópico
- Distribua as questões entre os assuntos identificados
- Gere questões variadas cobrindo diferentes aspectos do tópico
- Gere EXATAMENTE 50 questões (nem mais, nem menos)

INSTRUÇÕES SOBRE TIPO DE PROVA:
${tipoProva === 'Certo/Errado' ? `
- Use formato Certo/Errado (C ou E)
- Cada questão deve ter um enunciado que pode ser Certo ou Errado
- Resposta deve ser "C" (Certo) ou "E" (Errado)
- Explicação deve detalhar POR QUE é certo ou errado
` : `
- Use formato Múltipla Escolha (A, B, C, D, E)
- Cada questão deve ter 5 alternativas
- Resposta deve ser uma das letras (A, B, C, D, E)
- Explicação deve detalhar a resposta correta
`}

INSTRUÇÕES GERAIS:
1. Use o estilo da banca ${banca || 'NÃO DEFINIDA'}
2. Cada questão deve ter:
   - Enunciado claro e direto
   ${tipoProva === 'Certo/Errado' ? `
   - Alternativa correta: "C" (Certo) ou "E" (Errado)
   ` : `
   - 5 alternativas (A, B, C, D, E)
   - Alternativa correta indicada
   `}
   - Explicação detalhada da resposta
3. Adapte o nível de dificuldade ao cargo ${courseData.cargo || courseData.competition || 'NÃO DEFINIDO'}
4. Gere EXATAMENTE 50 questões (nem mais, nem menos)
5. Para cada questão, identifique o assunto específico dentro do tópico
6. Atribua uma probabilidade de incidência (80-100% para assuntos centrais, 50-70% para assuntos importantes, 10-40% para assuntos secundários)

ESTRUTURA DO JSON:
{
  "disciplina": "${contextoDisciplina?.disciplina || effectiveTopicNome || resolvedTopicKey}",
  "banca": "${banca || 'NÃO DEFINIDA'}",
  "cargo": "${courseData.cargo || courseData.competition || 'NÃO DEFINIDO'}",
  "curso": "${courseName || 'Curso Preparatório'}",
  "topico": "${effectiveTopicNome || resolvedTopicKey}",
  "tipoProva": "${tipoProva}",
  "nivel": ${nivelAtual},
  "dataGeracao": "${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}",
  "questoes": [
    {
      "numero": 1,
      "assunto": "nome do assunto específico dentro do tópico",
      "probabilidade": 95,
      "enunciado": "texto da questão",
      ${tipoProva === 'Certo/Errado' ? `
      "respostaCorreta": "C",
      ` : `
      "alternativas": {
        "A": "texto da alternativa A",
        "B": "texto da alternativa B",
        "C": "texto da alternativa C",
        "D": "texto da alternativa D",
        "E": "texto da alternativa E"
      },
      "respostaCorreta": "A",
      `}
      "explicacao": "explicação detalhada da resposta correta"
    }
  ]
}

🚨 INSTRUÇÃO CRÍTICA - CONTEÚDO ATUALIZADO:
VOCÊ ESTÁ GERANDO CONTEÚDO AGORA, NA DATA ATUAL: ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
- PENSE: "Vou gerar agora de acordo com atualizações verídicas da data atual (${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })})"
- USE APENAS INFORMAÇÕES ATUALIZADAS E VIGENTES ATÉ ESTA DATA
- VERIFIQUE SE HOUVE ALTERAÇÕES RECENTES NAS LEIS, DECRETOS OU NORMAS
- NÃO USE INFORMAÇÕES DESATUALIZADAS OU REVOGADAS
- CITE SEMPRE A DATA DE ATUALIZAÇÃO QUANDO NECESSÁRIO

📅 CRONOLOGIA TEMPORAL OBRIGATÓRIA:
- Para CADA lei, decreto ou norma mencionada nas questões, você DEVE traçar uma cronologia desde sua criação até a data atual
- Exemplo: "Lei X, criada em 01/01/2000, alterada em 15/03/2010 pela Lei Y, modificada em 20/06/2015 pelo Decreto Z, atualizada em 10/02/2020 pela Medida Provisória W, vigente até ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}"
- Liste TODAS as alterações relevantes: leis, decretos, medidas provisórias, emendas constitucionais, súmulas, jurisprudências
- Sempre indique a data de cada alteração e o instrumento que a causou
- Se a lei foi revogada, indique a data de revogação e o instrumento que a revogou
- Mantenha as questões atualizadas considerando TODAS as alterações até a data atual

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
Para cada questão que você criar, você DEVE seguir OBRIGATORIAMENTE este processo de pensamento interno ANTES de gerar o conteúdo:

1. FAÇA UM RASCUNHO MENTAL dos pontos principais da lei/norma solicitada
2. QUESTIONE-SE RIGOROSAMENTE: "Estou inventando algum número de lei para os anos de 2025/2026? Estou inventando algum artigo que não existe no código/norma?"
3. SE PERCEBER QUE ESTÁ PRESTES A CITAR UM NÚMERO DE LEI FICTÍCIO para conceitos reais, PARE, REMOVA o número inventado e cite apenas o conceito doutrinário/jurisprudencial correto ou mencione que está em debate/reforma legislativa real, SEM INVENTAR DADOS
4. GARANTA QUE NÃO OMITIU alterações reais e históricas importantes
5. VERIFIQUE: "Esta lei/artigo foi recepcionado pela CF/88? Foi declarado inconstitucional pelo STF?"
6. VERIFIQUE: "A jurisprudência citada está atualizada? Houve alguma decisão recente do STF/STJ que alterou o entendimento?"
7. AUDITE-SE: "Todas as datas e números de leis citados são historicamente exatos e verificáveis?"

SÓ DEPOIS DE CONCLUIR ESTE PROCESSO DE VERIFICAÇÃO INTERNA, PROSSIGA PARA A GERAÇÃO DA QUESTÃO.

[DIRETRIZES DE SAÍDA - O QUE EXIBIR]
Gere questões de múltipla escolha com:
- Enunciados específicos e técnicos
- Alternativas plausíveis e bem elaboradas
- Gabarito comentado fundamentado estritamente na lei real vigente
- Se você não tiver certeza absoluta de um número de lei recente, cite o conceito técnico sem inventar o número do decreto
🔍 VERIFICAÇÃO DE FONTES - OBRIGATÓRIO:
- Para CADA lei, decreto ou norma jurídica mencionada, VERIFIQUE a atualidade usando as ferramentas disponíveis
- Para CADA jurisprudência citada, VERIFIQUE se está vigente e atualizada
- Use as ferramentas de Function Calling para buscar em APIs oficiais (Senado, Datajud/CNJ)
- Sempre busque de fontes confiáveis: TJ,STF,LEI(E SUAS ATUALIZAÇÕES, NÃO PEGUE NADA ANTIGO OU DESATUALIZADO), GRAN CURSOS, QCONCURSOS, CONTEÚDOS JURÍDICOS, SITES DO PLANALTO, ENTENDIMENTOS ETC EM MATÉRIAS DE DIREITO... O FOCO É SEMPRE SER ATUALIZADO!
 Atualizações até o ano de agora ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })} até o exato momento
Sempre verifique atualizações de acordo com a data hora em ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })} , nunca dê conteúdo desatualizado... sempre atualizado. Verifique a veracidade da fonte em useGoogleSearch.
DATA ATUAL: ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
IMPORTANTE: Use apenas informações atualizadas até esta data. Verifique se há leis, decretos ou regulamentos recentes que possam afetar o conteúdo.

REGRAS IMPORTANTES:
- Adapte o estilo ao da banca ${banca || 'NÃO DEFINIDA'}
- Seja específico e técnico nas questões
- Para disciplinas jurídicas: cite leis, artigos e jurisprudência
- Para disciplinas não jurídicas: foque em conceitos e aplicações práticas
- DATA ATUAL: ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
- Use apenas informações atualizadas até esta data
- GERE EXATAMENTE 50 QUESTÕES

⚠️ REGRAS CRÍTICAS PARA JSON VÁLIDO:
- NÃO use aspas duplas (") dentro das strings de alternativas ou enunciados. Use aspas simples (')
- NÃO use quebras de linha (\n) dentro das strings. Use espaço normal
- NÃO use caracteres especiais que possam quebrar o JSON (como \, /, etc)
- O JSON deve ser 100% válido e parseável

Retorne APENAS o JSON válido, sem texto adicional.`

      setProgress((prev) => Math.min(prev + 15, 70))
      console.log('🤖 [Questões Tópico] Iniciando geração com IA...')
      const response = await callGeminiWithRetry(prompt, {
        models: ['gemini-2.5-flash', 'gemini-2.5-pro'],
        generationConfig: { temperature: 0.7, maxOutputTokens: 32000 },
        useGoogleSearch: true,
      })

      const aiText = extractGeneratedText(response)
      console.log('📝 [Questões Tópico] Tamanho da resposta da IA:', aiText.length)
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
        parsed = JSON.parse(jsonText)
        console.log('✅ [Questões Tópico] JSON parseado com sucesso')
        console.log('📊 [Questões Tópico] Número de questões geradas:', parsed.questoes?.length || 0)
      } catch (parseError) {
        console.error('Erro ao fazer parse do JSON:', parseError.message)
        console.error('JSON extraído:', jsonText)
        
        let fixedJson = jsonText
          .replace(/,\s*}/g, '}')
          .replace(/,\s*]/g, ']')
          .replace(/\n\s*\}/g, '}')
          .replace(/\n\s*\]/g, ']')
        
        try {
          parsed = JSON.parse(fixedJson)
          console.log('JSON corrigido com sucesso')
        } catch (fixError) {
          throw new Error(`JSON inválido mesmo após correção: ${fixError.message}`)
        }
      }

      const payload = {
        ...parsed,
        topico: parsed.topico || effectiveTopicNome || resolvedTopicKey,
        nivel: nivelAtual,
        updatedAt: serverTimestamp(),
        generatedAt: serverTimestamp(),
      }

      const sanitizedKey = sanitizeTopicKeyForFirestore(resolvedTopicKey)
      
      const docId = `${sanitizedKey}_nivel_${nivelAtual}`

      try {
        await setDoc(doc(db, 'courses', resolvedCourseId, 'questoesTopico', docId), payload, {
          merge: true,
        })
      } catch (saveError) {
        console.error('Erro ao salvar questões:', saveError)
        if (saveError.message?.includes('Missing or insufficient permissions')) {
          throw new Error('Erro de permissão ao salvar questões. Verifique as regras do Firebase.')
        }
        throw saveError
      }

      setQuestoes({ id: docId, ...payload })
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

  const handleAnswer = (answer) => {
    if (showResult) return
    
    setSelectedAnswer(answer)
    setShowResult(true)
    
    const currentQuestion = questoesArray[currentQuestionIndex]
    const isCorrect = answer === (currentQuestion?.respostaCorreta || currentQuestion?.correta)
    
    setAnswers([...answers, {
      questionIndex: currentQuestionIndex,
      selectedAnswer: answer,
      correctAnswer: currentQuestion?.respostaCorreta || currentQuestion?.correta,
      isCorrect,
      assunto: currentQuestion?.assunto || '',
      probabilidade: currentQuestion?.probabilidade || 0
    }])
  }

  const handleNextQuestion = () => {
    if (currentQuestionIndex < (questoesArray.length - 1)) {
      setCurrentQuestionIndex(currentQuestionIndex + 1)
      setSelectedAnswer(null)
      setShowResult(false)
    } else {
      calcularDesempenho()
    }
  }

  const calcularDesempenho = () => {
    const totalQuestoes = answers.length
    const acertos = answers.filter(a => a.isCorrect).length
    const aproveitamento = Math.round((acertos / totalQuestoes) * 100)
    
    const precisaRevisar = answers
      .filter(a => !a.isCorrect && a.probabilidade >= 70)
      .map(a => a.assunto)
    
    // Verificar se completou todas as questões do nível
    const completouNivel = totalQuestoes >= 50
    
    // Avançar para o próximo nível se completou e não está no nível máximo
    const proximoNivel = completouNivel && nivelAtual < 10 ? nivelAtual + 1 : nivelAtual
    
    const desempenhoData = {
      totalQuestoes,
      acertos,
      erros: totalQuestoes - acertos,
      aproveitamento,
      precisaRevisar,
      respostas: answers,
      topicKey: resolvedTopicKey,
      nivel: nivelAtual,
      completouNivel,
      proximoNivel,
      updatedAt: serverTimestamp()
    }
    
    setDesempenho(desempenhoData)
    
    if (user) {
      const sanitizedKey = sanitizeTopicKeyForFirestore(resolvedTopicKey)
      
      // Salvar desempenho geral do tópico (para saber o nível atual)
      const desempenhoRef = doc(db, 'users', user.uid, 'desempenhoTopico', sanitizedKey)
      setDoc(desempenhoRef, desempenhoData, { merge: true })
      
      // Salvar desempenho específico do nível
      const desempenhoNivelRef = doc(db, 'users', user.uid, 'desempenhoTopico', `${sanitizedKey}_nivel_${nivelAtual}`)
      setDoc(desempenhoNivelRef, desempenhoData, { merge: true })
    }
  }

  const handleRestart = () => {
    setCurrentQuestionIndex(0)
    setSelectedAnswer(null)
    setShowResult(false)
    setAnswers([])
    setDesempenho(null)
  }

  const handleDeleteQuestoes = async () => {
    if (!resolvedCourseId || !resolvedTopicKey) return

    if (!window.confirm('Tem certeza que deseja apagar as questões geradas deste tópico?')) {
      return
    }

    try {
      setDeleting(true)
      
      const sanitizedKey = sanitizeTopicKeyForFirestore(resolvedTopicKey)
      
      // Apagar todos os níveis
      for (let i = 1; i <= 10; i++) {
        const questoesRef = doc(db, 'courses', resolvedCourseId, 'questoesTopico', `${sanitizedKey}_nivel_${i}`)
        await deleteDoc(questoesRef)
      }

      setQuestoes(null)
      setNivelAtual(1)
      setCurrentQuestionIndex(0)
      setSelectedAnswer(null)
      setShowResult(false)
      setAnswers([])
      setDesempenho(null)
    } catch (error) {
      console.error('Erro ao apagar questões:', error)
      setError(`Erro ao apagar: ${error.message || 'Erro desconhecido'}`)
    } finally {
      setDeleting(false)
    }
  }

  const handleAvancarNivel = () => {
    if (desempenho?.completouNivel && desempenho?.proximoNivel > nivelAtual) {
      setNivelAtual(desempenho.proximoNivel)
      setQuestoes(null)
      setDesempenho(null)
      setCurrentQuestionIndex(0)
      setSelectedAnswer(null)
      setShowResult(false)
      setAnswers([])
    }
  }

  const handleMudarNivel = (novoNivel) => {
    setNivelAtual(novoNivel)
    setQuestoes(null)
    setDesempenho(null)
    setCurrentQuestionIndex(0)
    setSelectedAnswer(null)
    setShowResult(false)
    setAnswers([])
    setMostrarSeletorNiveis(false)
  }

  const handleIniciarEdicao = () => {
    const questaoAtual = questoesArray[currentQuestionIndex]
    setNovoGabarito(questaoAtual.respostaCorreta || questaoAtual.correta || '')
    setNovaExplicacao(questaoAtual.explicacao || questaoAtual.gabaritoComentado || '')
    setEditandoQuestao(true)
  }

  const handleSalvarEdicao = async () => {
    if (!questoes || !questoes.id) return
    
    // Verificar se é admin
    if (profile?.role !== 'admin') {
      alert('Apenas administradores podem editar questões')
      return
    }
    
    try {
      setSalvandoEdicao(true)
      
      const questaoAtual = questoesArray[currentQuestionIndex]
      const questoesAtualizadas = [...questoesArray]
      questoesAtualizadas[currentQuestionIndex] = {
        ...questaoAtual,
        respostaCorreta: novoGabarito,
        correta: novoGabarito,
        explicacao: novaExplicacao,
        gabaritoComentado: novaExplicacao
      }
      
      const sanitizedKey = sanitizeTopicKeyForFirestore(resolvedTopicKey)
      const docId = `${sanitizedKey}_nivel_${nivelAtual}`
      
      await setDoc(doc(db, 'courses', resolvedCourseId, 'questoesTopico', docId), {
        ...questoes,
        questoes: questoesAtualizadas
      }, { merge: true })
      
      setQuestoes({
        ...questoes,
        questoes: questoesAtualizadas
      })
      
      setEditandoQuestao(false)
    } catch (error) {
      console.error('Erro ao salvar edição:', error)
      alert('Erro ao salvar edição: ' + error.message)
    } finally {
      setSalvandoEdicao(false)
    }
  }

  const handleCancelarEdicao = () => {
    setEditandoQuestao(false)
    setNovoGabarito('')
    setNovaExplicacao('')
  }

  const handleToggleModoAdmin = () => {
    setModoAdminNavegacao(!modoAdminNavegacao)
    // Resetar estado quando mudar de modo
    setShowResult(modoAdminNavegacao ? false : true)
    setSelectedAnswer(null)
  }

  const handlePesquisarGoogle = () => {
    const questaoAtual = questoesParaExibir[currentQuestionIndex]
    if (!questaoAtual) return
    const searchQuery = encodeURIComponent(`${questaoAtual.enunciado} ${questaoAtual.assunto || ''}`)
    window.open(`https://www.google.com/search?q=${searchQuery}`, '_blank')
  }

  const handlePreviousQuestion = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1)
      setShowResult(modoAdminNavegacao)
      setSelectedAnswer(null)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center space-y-4 w-full max-w-md px-6">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-alego-600 border-t-transparent"></div>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Carregando questões...
          </p>
        </div>
      </div>
    )
  }

  if (!questoes && error) {
    return (
      <div className="min-h-screen py-6">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <Link
            to="/edital-verticalizado"
            className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-alego-600 dark:hover:text-alego-400 mb-6"
          >
            <ArrowLeftIcon className="h-5 w-5" />
            Voltar ao Edital Verticalizado
          </Link>
          
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-8 text-center space-y-4">
            <QuestionMarkCircleIcon className="h-16 w-16 text-slate-300 dark:text-slate-600 mx-auto" />
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              Questões não disponíveis
            </h1>
            <p className="text-slate-600 dark:text-slate-400">
              {error}
            </p>
            <button
              onClick={handleGenerateQuestoes}
              disabled={generating}
              className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white font-medium rounded-lg hover:from-green-700 hover:to-emerald-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FireIcon className="h-5 w-5" />
              {generating ? 'Gerando Questões...' : 'Gerar Questões'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen py-6">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6">
          <Link
            to="/edital-verticalizado"
            className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-alego-600 dark:hover:text-alego-400 mb-4"
          >
            <ArrowLeftIcon className="h-5 w-5" />
            Voltar ao Edital Verticalizado
          </Link>
          
          <div className="flex items-center gap-3">
            <div className="p-3 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl flex-shrink-0">
              <FireIcon className="h-8 w-8 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white break-words">
                Prática de Questões - Tópico
              </h1>
              <p className="text-slate-600 dark:text-slate-400 mt-1">
                Tópico: <span className="font-semibold">{effectiveTopicNome || resolvedTopicKey}</span>
              </p>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-sm text-slate-500 dark:text-slate-500">
                  Nível Atual: <span className="font-bold text-alego-600 dark:text-alego-400">{nivelAtual}/10</span>
                </p>
                {niveisDisponiveis.length > 0 && (
                  <button
                    onClick={() => setMostrarSeletorNiveis(!mostrarSeletorNiveis)}
                    className="text-xs text-alego-600 dark:text-alego-400 hover:underline"
                  >
                    ({niveisDisponiveis.length} disponíveis)
                  </button>
                )}
              </div>
              {mostrarSeletorNiveis && niveisDisponiveis.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {niveisDisponiveis.map((nivel) => (
                    <button
                      key={nivel}
                      onClick={() => handleMudarNivel(nivel)}
                      className={`px-3 py-1 rounded-full text-sm font-medium transition-all ${
                        nivel === nivelAtual
                          ? 'bg-alego-600 text-white'
                          : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600'
                      }`}
                    >
                      Nível {nivel}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Conteúdo Principal */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-6 sm:p-8">
          {!desempenho ? (
            <div className="space-y-6">
              {!questoes ? (
                <div className="space-y-6">
                  {/* Informações sobre a geração */}
                  <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-6">
                    <h3 className="text-lg font-semibold text-green-900 dark:text-green-100 mb-4">
                      📝 Questões Baseadas no Tópico
                    </h3>
                    <div className="text-sm text-green-800 dark:text-green-200 space-y-2">
                      <p>• As questões serão geradas especificamente para este tópico</p>
                      <p>• Estilo adaptado à banca examinadora</p>
                      <p>• 50 questões (Certo/Errado ou Múltipla Escolha, conforme a banca)</p>
                    </div>
                  </div>

                  {/* Status da geração */}
                  {generating && (
                    <div className="bg-gray-50 dark:bg-gray-900/20 border border-gray-200 dark:border-gray-800 rounded-lg p-4">
                      <p className="text-sm text-gray-800 dark:text-gray-200">
                        Gerando questões com IA...
                      </p>
                      {progress > 0 && (
                        <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden mt-2">
                          <div
                            className="h-2 bg-green-600 dark:bg-green-400 transition-all duration-300"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Botão de ação */}
                  <div className="pt-4">
                    <button
                      onClick={handleGenerateQuestoes}
                      disabled={generating}
                      className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white font-medium rounded-lg hover:from-green-700 hover:to-emerald-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-lg"
                    >
                      <FireIcon className="h-6 w-6" />
                      {generating ? 'Gerando Questões...' : 'Gerar Questões'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Botão de excluir para admin */}
                  {profile?.role === 'admin' && (
                    <div className="flex justify-between items-center gap-2 flex-wrap">
                      <button
                        onClick={handleToggleModoAdmin}
                        className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                          modoAdminNavegacao
                            ? 'bg-purple-600 text-white hover:bg-purple-700'
                            : 'bg-gray-600 text-white hover:bg-gray-700'
                        }`}
                      >
                        {modoAdminNavegacao ? '🔒 Modo Prática' : '🔓 Modo Navegação'}
                      </button>
                      {modoAdminNavegacao && (
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="relative">
                            <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <input
                              type="text"
                              value={termoBusca}
                              onChange={(e) => setTermoBusca(e.target.value)}
                              placeholder="Buscar questões..."
                              className="pl-9 pr-4 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-slate-800 text-gray-900 dark:text-white w-64"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={handlePesquisarGoogle}
                            className="p-3 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white hover:opacity-80 transition shadow-lg"
                            title="Pesquisar no Google"
                          >
                            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                            </svg>
                          </button>
                          <select
                            value={nivelAtual}
                            onChange={(e) => handleMudarNivel(parseInt(e.target.value))}
                            className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
                          >
                            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                              <option key={n} value={n}>Nível {n}</option>
                            ))}
                          </select>
                          <button
                            onClick={handleGenerateQuestoes}
                            disabled={generating}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-all disabled:opacity-50"
                          >
                            <FireIcon className="h-4 w-4" />
                            {generating ? 'Gerando...' : 'Gerar Nível'}
                          </button>
                        </div>
                      )}
                      <button
                        onClick={handleDeleteQuestoes}
                        disabled={deleting}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <TrashIcon className="h-4 w-4" />
                        {deleting ? 'Apagando...' : 'Apagar Questões'}
                      </button>
                    </div>
                  )}

                  {/* Barra de progresso */}
                  {questoesParaExibir.length > 0 && (
                    <>
                      <div className="bg-gray-100 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
                        <div 
                          className="bg-gradient-to-r from-green-600 to-emerald-600 h-full transition-all duration-300"
                          style={{ width: `${((currentQuestionIndex + 1) / questoesParaExibir.length) * 100}%` }}
                        />
                      </div>
                      <p className="text-sm text-slate-600 dark:text-slate-400 text-center">
                        Questão {currentQuestionIndex + 1} de {questoesParaExibir.length}
                        {termoBusca && ` (${questoesArray.length} total)`}
                      </p>
                    </>
                  )}

                  {/* Questão atual */}
                  {questoesParaExibir[currentQuestionIndex] && (
                    <div className="space-y-4">
                      <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-semibold text-orange-900 dark:text-orange-100">
                            Assunto: {questoesParaExibir[currentQuestionIndex].assunto || 'Assunto não identificado'}
                          </span>
                          {questoesParaExibir[currentQuestionIndex].probabilidade && (
                            <span className="px-3 py-1 bg-orange-600 text-white text-xs font-bold rounded-full">
                              {questoesParaExibir[currentQuestionIndex].probabilidade}% de chance
                            </span>
                          )}
                        </div>
                        <p className="text-slate-900 dark:text-white font-medium">
                          {questoesParaExibir[currentQuestionIndex].enunciado}
                        </p>
                      </div>

                      {/* Alternativas - Certo/Errado ou Múltipla */}
                      {tipoProva === 'Certo/Errado' ? (
                        <div className="grid grid-cols-2 gap-4">
                          {['C', 'E'].map((key) => (
                            <button
                              key={key}
                              onClick={() => !modoAdminNavegacao && handleAnswer(key)}
                              disabled={showResult || modoAdminNavegacao}
                              className={`text-center p-6 rounded-lg border-2 transition-all ${
                                modoAdminNavegacao || showResult
                                  ? key === (questoesParaExibir[currentQuestionIndex].respostaCorreta || questoesParaExibir[currentQuestionIndex].correta)
                                    ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-800 opacity-50'
                                  : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-800 hover:border-green-500 hover:bg-green-50 dark:hover:bg-green-900/20'
                              }`}
                            >
                              <div className="flex flex-col items-center gap-2">
                                <span className="text-2xl font-bold text-slate-900 dark:text-white">{key === 'C' ? 'C' : 'E'}</span>
                                <span className="text-sm text-slate-700 dark:text-slate-300">{key === 'C' ? 'Certo' : 'Errado'}</span>
                                {(modoAdminNavegacao || showResult) && key === (questoesParaExibir[currentQuestionIndex].respostaCorreta || questoesParaExibir[currentQuestionIndex].correta) && (
                                  <CheckCircleIcon className="h-6 w-6 text-green-600" />
                                )}
                              </div>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {Object.entries(questoesParaExibir[currentQuestionIndex].alternativas || {}).map(([key, value]) => (
                            <button
                              key={key}
                              onClick={() => !modoAdminNavegacao && handleAnswer(key)}
                              disabled={showResult || modoAdminNavegacao}
                              className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                                modoAdminNavegacao || showResult
                                  ? key === (questoesParaExibir[currentQuestionIndex].respostaCorreta || questoesParaExibir[currentQuestionIndex].correta)
                                    ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-800 opacity-50'
                                  : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-800 hover:border-green-500 hover:bg-green-50 dark:hover:bg-green-900/20'
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <span className="font-bold text-slate-900 dark:text-white">{key})</span>
                                <span className="text-slate-700 dark:text-slate-300">{value}</span>
                                {(modoAdminNavegacao || showResult) && key === (questoesParaExibir[currentQuestionIndex].respostaCorreta || questoesParaExibir[currentQuestionIndex].correta) && (
                                  <CheckCircleIcon className="h-5 w-5 text-green-600 ml-auto" />
                                )}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Explicação */}
                      {(showResult || modoAdminNavegacao) && (
                        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="font-semibold text-blue-900 dark:text-blue-100">
                              💡 Explicação:
                            </h4>
                            {profile?.role === 'admin' && !editandoQuestao && (
                              <button
                                onClick={handleIniciarEdicao}
                                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                              >
                                Editar
                              </button>
                            )}
                          </div>
                          {editandoQuestao ? (
                            <div className="space-y-3">
                              <div>
                                <label className="block text-xs font-medium text-blue-900 dark:text-blue-100 mb-1">
                                  Gabarito:
                                </label>
                                <input
                                  type="text"
                                  value={novoGabarito}
                                  onChange={(e) => setNovoGabarito(e.target.value)}
                                  className="w-full px-3 py-2 text-sm border border-blue-300 dark:border-blue-700 rounded-md bg-white dark:bg-slate-800 text-blue-900 dark:text-blue-100"
                                  placeholder="Digite o gabarito correto"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-blue-900 dark:text-blue-100 mb-1">
                                  Explicação:
                                </label>
                                <textarea
                                  value={novaExplicacao}
                                  onChange={(e) => setNovaExplicacao(e.target.value)}
                                  className="w-full px-3 py-2 text-sm border border-blue-300 dark:border-blue-700 rounded-md bg-white dark:bg-slate-800 text-blue-900 dark:text-blue-100 min-h-[100px]"
                                  placeholder="Digite a explicação"
                                />
                              </div>
                              <div className="flex gap-2">
                                <button
                                  onClick={handleSalvarEdicao}
                                  disabled={salvandoEdicao}
                                  className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                                >
                                  {salvandoEdicao ? 'Salvando...' : 'Salvar'}
                                </button>
                                <button
                                  onClick={handleCancelarEdicao}
                                  className="px-3 py-1 text-xs bg-gray-600 text-white rounded hover:bg-gray-700"
                                >
                                  Cancelar
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="prose prose-sm dark:prose-invert max-w-none">
                              <ReactMarkdown>
                                {questoesParaExibir[currentQuestionIndex].explicacao || questoesParaExibir[currentQuestionIndex].gabaritoComentado || 'Explicação não disponível'}
                              </ReactMarkdown>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Botões de navegação */}
                      {showResult || modoAdminNavegacao ? (
                        <div className="flex gap-3">
                          {currentQuestionIndex > 0 && (
                            <button
                              onClick={handlePreviousQuestion}
                              className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-3 bg-gray-600 text-white font-medium rounded-lg hover:bg-gray-700 transition-all"
                            >
                              ← Anterior
                            </button>
                          )}
                          <button
                            onClick={handleNextQuestion}
                            className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white font-medium rounded-lg hover:from-green-700 hover:to-emerald-700 transition-all"
                          >
                            {currentQuestionIndex < questoesParaExibir.length - 1 ? 'Próxima Questão →' : 'Ver Resultado'}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              {/* Resultado final */}
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-6">
                <h3 className="text-xl font-semibold text-green-900 dark:text-green-100 mb-4 text-center">
                  🎉 Prática Concluída!
                </h3>
                
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-green-600 dark:text-green-400">{desempenho.acertos}</div>
                    <div className="text-sm text-green-800 dark:text-green-200">Acertos</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-red-600 dark:text-red-400">{desempenho.erros}</div>
                    <div className="text-sm text-red-800 dark:text-red-200">Erros</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">{desempenho.aproveitamento}%</div>
                    <div className="text-sm text-blue-800 dark:text-blue-200">Aproveitamento</div>
                  </div>
                </div>

                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-4">
                  <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
                    📊 Progresso de Níveis
                  </h4>
                  <p className="text-sm text-blue-800 dark:text-blue-200">
                    Nível Atual: <span className="font-bold">{desempenho.nivel}</span>/10
                  </p>
                  {desempenho.completouNivel && desempenho.proximoNivel > desempenho.nivel && (
                    <p className="text-sm text-green-800 dark:text-green-200 mt-2 font-semibold">
                      ✅ Você completou este nível! Pode avançar para o nível {desempenho.proximoNivel}.
                    </p>
                  )}
                </div>

                {historicoNiveis.length > 0 && (
                  <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4 mb-4">
                    <h4 className="font-semibold text-purple-900 dark:text-purple-100 mb-3">
                      📈 Histórico por Nível
                    </h4>
                    <div className="space-y-2">
                      {historicoNiveis.map((hist) => (
                        <div key={hist.nivel} className="flex items-center justify-between text-sm">
                          <span className="text-purple-800 dark:text-purple-200">
                            Nível {hist.nivel}
                          </span>
                          <div className="flex items-center gap-3">
                            <span className="text-purple-700 dark:text-purple-300">
                              {hist.acertos}/{hist.totalQuestoes} acertos
                            </span>
                            <span className={`font-semibold ${
                              hist.aproveitamento >= 70 ? 'text-green-600 dark:text-green-400' :
                              hist.aproveitamento >= 50 ? 'text-yellow-600 dark:text-yellow-400' :
                              'text-red-600 dark:text-red-400'
                            }`}>
                              {hist.aproveitamento}%
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {desempenho.precisaRevisar && desempenho.precisaRevisar.length > 0 && (
                  <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                    <h4 className="font-semibold text-yellow-900 dark:text-yellow-100 mb-3">
                      ⚠️ Precisa Revisar (Errou em assuntos com alta probabilidade):
                    </h4>
                    <ul className="list-disc list-inside space-y-1">
                      {desempenho.precisaRevisar.map((assunto, idx) => (
                        <li key={idx} className="text-sm text-yellow-800 dark:text-yellow-200">{assunto}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Botões de ação */}
              <div className="pt-4 space-y-3">
                {desempenho.completouNivel && desempenho.proximoNivel > desempenho.nivel && (
                  <button
                    onClick={handleAvancarNivel}
                    className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-medium rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all"
                  >
                    <ChartBarIcon className="h-5 w-5" />
                    Gerar mais 50 questões (Nível {desempenho.proximoNivel})
                  </button>
                )}
                
                <button
                  onClick={handleRestart}
                  className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white font-medium rounded-lg hover:from-green-700 hover:to-emerald-700 transition-all"
                >
                  <FireIcon className="h-5 w-5" />
                  Praticar Novamente
                </button>
                
                {profile?.role === 'admin' && (
                  <button
                    onClick={handleDeleteQuestoes}
                    disabled={deleting}
                    className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <TrashIcon className="h-5 w-5" />
                    {deleting ? 'Apagando...' : 'Apagar Questões'}
                  </button>
                )}
                
                <Link
                  to="/edital-verticalizado"
                  className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 bg-slate-600 text-white font-medium rounded-lg hover:bg-slate-700 transition-all"
                >
                  <ArrowLeftIcon className="h-5 w-5" />
                  Voltar ao Edital Verticalizado
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default QuestoesTopicoView
