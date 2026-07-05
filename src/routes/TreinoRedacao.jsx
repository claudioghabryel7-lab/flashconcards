import { readEnv, isDevEnv } from '@/lib/env.js'
import { useState, useEffect, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { canAccessRedacao, isTrialMode } from '../utils/trialLimits'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'
import { callGeminiWithRetry, extractGeneratedText } from '../utils/geminiApi'
import ContentPublishButton from '../components/ContentPublishButton'
import { isContentAvailable, toggleContentStatus, defaultContentStatus, CONTENT_STATUS } from '../utils/contentStatus'
import {
  ClockIcon,
  PlayIcon,
  PauseIcon,
  SparklesIcon,
  DocumentTextIcon,
  ArrowPathIcon,
  PencilSquareIcon,
} from '@heroicons/react/24/outline'

const TreinoRedacao = () => {
  const navigate = useNavigate()
  const { user, profile, isAdmin } = useAuth()
  const [loading, setLoading] = useState(false)
  const [configLoading, setConfigLoading] = useState(true)
  const [redacaoTema, setRedacaoTema] = useState('')
  const [redacaoStatus, setRedacaoStatus] = useState(defaultContentStatus())
  const [editingTema, setEditingTema] = useState(false)
  const [savingTema, setSavingTema] = useState(false)
  const [redacaoTexto, setRedacaoTexto] = useState('')
  const [timeLeft, setTimeLeft] = useState(3600) // 1 hora em segundos
  const [isRunning, setIsRunning] = useState(false)
  const [resultado, setResultado] = useState(null)
  const [analizing, setAnalizing] = useState(false)
  const [selectedCourseId, setSelectedCourseId] = useState(null)
  const [courseName, setCourseName] = useState('')
  const [courseCompetition, setCourseCompetition] = useState('')
  const [courseBanca, setCourseBanca] = useState('CESPE')
  const textareaRef = useRef(null)

  const getCourseId = () => selectedCourseId || 'alego-default'

  const loadEditalText = async (courseId) => {
    const editalRef = doc(db, 'courses', courseId, 'prompts', 'edital')
    const editalDoc = await getDoc(editalRef)
    if (!editalDoc.exists()) return ''
    const data = editalDoc.data()
    return (data.prompt || '') + '\n\n' + (data.pdfText || '')
  }

  const generateRedacaoModelo = async (tema) => {
    const courseId = getCourseId()
    const editalText = await loadEditalText(courseId)

    const { buildRedacaoModeloPrompt, getUnifiedPrompt } = await import('../utils/unifiedPrompt')
    const unified = await getUnifiedPrompt(courseId)
    if (unified?.banca) {
      setCourseBanca(unified.banca)
    }

    const prompt = await buildRedacaoModeloPrompt(
      courseId,
      tema,
      editalText ? editalText.substring(0, 30000) : ''
    )

    const response = await callGeminiWithRetry(prompt, {
      generationConfig: {
        maxOutputTokens: 4096,
        temperature: 0.85,
      },
      useGoogleSearch: true,
    })
    return extractGeneratedText(response).trim()
  }

  // Carregar curso do perfil
  useEffect(() => {
    if (!profile) return
    
    const courseFromProfile = profile.selectedCourseId !== undefined ? profile.selectedCourseId : null
    setSelectedCourseId(courseFromProfile)
    
    const loadCourse = async () => {
      const courseId = courseFromProfile || 'alego-default'
      const courseRef = doc(db, 'courses', courseId)
      const docSnap = await getDoc(courseRef)
      if (docSnap.exists()) {
        const data = docSnap.data()
        setCourseName(data.name || '')
        setCourseCompetition(data.competition || '')
        if (data.banca) setCourseBanca(data.banca)
      }

      const { getUnifiedPrompt } = await import('../utils/unifiedPrompt')
      const unified = await getUnifiedPrompt(courseId)
      if (unified?.banca) setCourseBanca(unified.banca)
    }

    loadCourse()
  }, [profile])

  // Carregar tema configurado pelo admin (ou gerar se admin sem tema)
  useEffect(() => {
    if (selectedCourseId === null && profile === undefined) return

    const loadConfig = async () => {
      setConfigLoading(true)
      try {
        const courseId = getCourseId()
        const configSnap = await getDoc(doc(db, 'courses', courseId, 'config', 'redacao'))
        if (configSnap.exists()) {
          const data = configSnap.data()
          setRedacaoTema(data.tema || '')
          setRedacaoStatus(data.status || defaultContentStatus())
        } else {
          setRedacaoStatus(defaultContentStatus())
          if (isAdmin) {
            await generateTheme()
          }
        }
      } catch (err) {
        console.error(err)
      } finally {
        setConfigLoading(false)
      }
    }

    loadConfig()
  }, [selectedCourseId, profile, isAdmin])

  // Timer
  useEffect(() => {
    if (!isRunning || timeLeft <= 0) {
      if (timeLeft === 0 && isRunning) {
        handleFinish()
      }
      return
    }

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          setIsRunning(false)
          handleFinish()
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [isRunning, timeLeft])

  // Função para detectar parágrafos (4 espaços no início da linha)
  const detectParagraphs = (text) => {
    if (!text) return 0
    const lines = text.split('\n')
    let paragraphCount = 0
    lines.forEach((line) => {
      // Verifica se a linha começa com exatamente 4 espaços (não mais, não menos)
      if (line.length >= 4 && line.substring(0, 4) === '    ' && (line.length === 4 || line[4] !== ' ')) {
        paragraphCount++
      }
    })
    return paragraphCount
  }

  // Gerar tema de redação
  const generateTheme = async () => {
    setLoading(true)
    try {
      const courseId = getCourseId()
      const editalText = await loadEditalText(courseId)

      const { buildRedacaoPrompt } = await import('../utils/unifiedPrompt')
      const baseThemePrompt = await buildRedacaoPrompt(
        courseId,
        editalText ? editalText.substring(0, 30000) : ''
      )
      
      const themePrompt = `${baseThemePrompt}

CARGO: ${courseCompetition || courseName || 'Cargo público'}

Crie um tema de redação ESPECÍFICO e relevante para o concurso ${courseName || 'mencionado'}${courseCompetition ? ` (${courseCompetition})` : ''}.

INSTRUÇÕES:
- O tema deve ser atual e relevante para o cargo/concurso
- Deve estar relacionado com questões sociais, políticas ou administrativas pertinentes ao cargo
- Seja específico: não use temas genéricos
- O tema deve permitir uma dissertação argumentativa de 25-30 linhas
- Se você tiver conhecimento sobre este concurso específico, use temas típicos dessa área.

Retorne APENAS o tema da redação, sem explicações, sem aspas, sem formatação especial.
O tema deve ser claro e direto.

CRÍTICO: Retorne APENAS o tema, nada mais.`

      const response = await callGeminiWithRetry(themePrompt, {
        generationConfig: {
          maxOutputTokens: 1024,
          temperature: 0.8,
        },
        useGoogleSearch: true,
      })
      let theme = extractGeneratedText(response).trim()
      
      // Limpar formatação
      theme = theme.replace(/TEMA:/gi, '').trim()
      theme = theme.replace(/"/g, '').trim()
      theme = theme.replace(/^[-•]\s*/, '').trim()
      
      setRedacaoTema(theme)
      if (isAdmin) {
        await saveRedacaoConfig(theme, redacaoStatus)
      }
      setIsRunning(true)
    } catch (err) {
      console.error('Erro ao gerar tema:', err)
      setRedacaoTema(`A importância da eficiência no serviço público para o cargo de ${courseCompetition || courseName || 'servidor público'}`)
      setIsRunning(true)
    } finally {
      setLoading(false)
    }
  }

  const saveRedacaoConfig = async (tema = redacaoTema, status = redacaoStatus) => {
    setSavingTema(true)
    try {
      await setDoc(
        doc(db, 'courses', getCourseId(), 'config', 'redacao'),
        { tema: tema.trim(), status, updatedAt: serverTimestamp() },
        { merge: true }
      )
      setRedacaoStatus(status)
      setEditingTema(false)
    } catch (err) {
      console.error(err)
      alert('Erro ao salvar tema')
    } finally {
      setSavingTema(false)
    }
  }

  const handleToggleRedacaoStatus = async () => {
    const novo = toggleContentStatus(redacaoStatus)
    setRedacaoStatus(novo)
    await saveRedacaoConfig(redacaoTema, novo)
  }

  // Gerar novo tema
  const handleNewTheme = () => {
    setRedacaoTexto('')
    setTimeLeft(3600)
    setIsRunning(false)
    setResultado(null) // Limpar resultado anterior
    setAnalizing(false) // Limpar estado de análise
    generateTheme()
  }

  // Finalizar redação e analisar
  const handleFinish = () => {
    console.log('🚨 handleFinish iniciado - analizing antes:', analizing)
    setIsRunning(false)
    setAnalizing(true)
    console.log('🚨 handleFinish - setAnalizing(true) aplicado')
    handleAnalyze()
  }

  // Analisar e avaliar redação
  const handleAnalyze = async () => {
    console.log('🚨 INÍCIO DA FUNÇÃO handleAnalyze - DEBUG INICIAL')
    console.log('🚨 analizing no início do handleAnalyze:', analizing)
    
    // Garantir que analizing seja true no início
    setAnalizing(true)
    console.log('🚨 setAnalizing(true) garantido no handleAnalyze')
    
    console.log('🚨 redacaoTexto:', redacaoTexto)
    console.log('🚨 redacaoTema:', redacaoTema)
    console.log('🚨 VITE_GEMINI_API_KEY existe:', !!readEnv('VITE_GEMINI_API_KEY'))
    
    if (!redacaoTexto.trim()) {
      console.log('🚨 Saindo - redação vazia')
      setAnalizing(false)
      alert('Digite sua redação antes de analisar.')
      return
    }

    // Validar tamanho mínimo da redação
    const wordCount = redacaoTexto.trim().split(/\s+/).length
    const charCount = redacaoTexto.trim().length
    
    console.log('🚨 DEBUG - wordCount:', wordCount, 'charCount:', charCount)
    console.log('🚨 DEBUG - wordCount < 50:', wordCount < 50, 'charCount < 200:', charCount < 200)
    
    if (wordCount < 50 || charCount < 200) {
      console.log('🚨 ENTRANDO NA VALIDAÇÃO DE TEXTO CURTO - VAI GERAR RESULTADO SEM REDAÇÃO MODELO')
      
      // Para textos muito curtos, atribuir nota zero automaticamente MAS GERAR REDAÇÃO MODELO
      const resultadoComModelo = {
        nota: 0,
        criterios: {
          dominio: 0,
          compreensao: 0,
          argumentacao: 0,
          estrutura: 0,
          conhecimento: 0
        },
        feedback: `Esta redação está muito curta (${wordCount} palavras, ${charCount} caracteres). Uma redação de concurso público deve ter no mínimo 200 palavras e desenvolver adequadamente o tema proposto. Por isso, a nota foi zerada.`,
        dicas: [
          'Escreva pelo menos 200 palavras para uma redação completa',
          'Desenvolva o tema com argumentos e exemplos',
          'Estruture sua redação com introdução, desenvolvimento e conclusão',
          'Use parágrafos (4 espaços no início da linha) para organizar suas ideias'
        ],
        paragraphCount: detectParagraphs(redacaoTexto),
        lines: redacaoTexto.split('\n').length,
        wordCount: wordCount,
        redacaoModelo: await generateRedacaoModelo(redacaoTema).catch((error) => {
          console.error('Erro ao gerar redação modelo:', error)
          return `Não foi possível gerar a redação modelo. Tema: "${redacaoTema}". Tente novamente.`
        }),
        tema: redacaoTema,
        courseId: getCourseId(),
      }
      
      setResultado(resultadoComModelo)
      setIsRunning(false)
      setAnalizing(false)
      return
    }

    setIsRunning(false)
    setAnalizing(true)

    try {
      const courseId = getCourseId()
      const editalText = await loadEditalText(courseId)

      // Contar parágrafos (linhas que começam com 4 espaços)
      const paragraphCount = detectParagraphs(redacaoTexto)
      const lines = redacaoTexto.split('\n').length
      const wordCount = redacaoTexto.trim() ? redacaoTexto.trim().split(/\s+/).length : 0

      // Usar prompt unificado
      const { buildRedacaoAnalysisPrompt } = await import('../utils/unifiedPrompt')
      const baseAnalysisPrompt = await buildRedacaoAnalysisPrompt(
        courseId,
        redacaoTema,
        editalText ? editalText.substring(0, 30000) : ''
      )
      
      const analysisPrompt = `${baseAnalysisPrompt}

⚠️⚠️⚠️ INSTRUÇÕES CRÍTICAS ⚠️⚠️⚠️
- Você DEVE analisar o CONTEÚDO REAL desta redação específica
- NÃO use notas genéricas ou padrões
- Cada redação é ÚNICA e deve ser avaliada individualmente
- A nota deve refletir REALMENTE a qualidade do texto fornecido abaixo
- Se a redação tiver erros, dê nota baixa. Se for boa, dê nota alta.
- VARIE as notas conforme a qualidade REAL do texto

IMPORTANTE: Esta redação usa 4 espaços no início da linha para indicar parágrafos. Linhas que começam com 4 espaços são parágrafos.

INFORMAÇÕES DA REDAÇÃO:
- Número de parágrafos (linhas com 4 espaços no início): ${paragraphCount}
- Total de linhas: ${lines}
- Total de palavras: ${wordCount}
- Tamanho do texto: ${redacaoTexto.length} caracteres

${wordCount < 200 ? '⚠️⚠️⚠️ CRÍTICO: Esta redação está MUITO CURTA (menos de 200 palavras). Uma redação de concurso deve ter no mínimo 200 palavras. Isso deve resultar em NOTA MUITO BAIXA ou ZERO, especialmente em estrutura e argumentação.' : ''}
${wordCount < 100 ? '⚠️⚠️⚠️ CRÍTICO: Esta redação está EXTREMAMENTE CURTA (menos de 100 palavras). Isso deve resultar em NOTA ZERO ou MUITO PRÓXIMA DE ZERO em TODOS os critérios.' : ''}
${paragraphCount < 3 ? '⚠️ ATENÇÃO: Esta redação tem poucos parágrafos. Isso deve impactar NEGATIVAMENTE a nota em estrutura textual.' : ''}
${paragraphCount === 0 ? '⚠️⚠️⚠️ CRÍTICO: Esta redação NÃO TEM PARÁGRAFOS. Isso deve resultar em NOTA ZERO em estrutura textual.' : ''}

REGRAS DE AVALIAÇÃO RIGOROSAS:
- Se a redação tiver menos de 200 palavras: NOTA MUITO BAIXA (máximo 200 pontos no total)
- Se a redação tiver menos de 100 palavras: NOTA ZERO ou MUITO PRÓXIMA DE ZERO
- Se a redação não tiver parágrafos: NOTA ZERO em estrutura
- Se a redação não desenvolver o tema: NOTA ZERO em compreensão
- Se a redação não tiver argumentos: NOTA ZERO em argumentação
- Se a redação for apenas texto sem sentido ou palavras soltas: NOTA ZERO em todos os critérios

Analise a seguinte redação e atribua uma nota de 0 a 1000, seguindo os critérios típicos de concursos públicos. SEJA RIGOROSO:

CRITÉRIOS DE AVALIAÇÃO (seja EXTREMAMENTE RIGOROSO):
1. Domínio da modalidade escrita (0-200 pontos): ortografia, acentuação, pontuação, uso adequado da língua
   - Texto sem sentido ou palavras soltas: NOTA ZERO
   - Erros graves de ortografia: reduzir drasticamente (máximo 50 pontos)
   - Pontuação incorreta: reduzir significativamente
   - Uso inadequado da língua: reduzir
   - Texto muito curto: NOTA ZERO ou muito baixa
   
2. Compreensão do tema (0-200 pontos): adequação ao tema proposto, compreensão da proposta
   - Se não desenvolver o tema: NOTA ZERO
   - Se fugir do tema: NOTA ZERO
   - Se for apenas texto sem sentido: NOTA ZERO
   - Se abordar parcialmente: nota muito baixa (máximo 50 pontos)
   - Se abordar completamente: nota alta
   
3. Argumentação (0-200 pontos): qualidade dos argumentos, coerência, capacidade de defender pontos de vista
   - Sem argumentos: NOTA ZERO
   - Texto sem sentido: NOTA ZERO
   - Argumentos fracos ou ausentes: nota muito baixa (máximo 30 pontos)
   - Argumentos sólidos e bem desenvolvidos: nota alta
   - Falta de coerência: NOTA ZERO ou muito baixa
   
4. Estrutura textual (0-200 pontos): organização do texto, parágrafos (linhas com 4 espaços), introdução, desenvolvimento, conclusão
   - Sem parágrafos: NOTA ZERO
   - Texto muito curto: NOTA ZERO
   - Sem introdução/desenvolvimento/conclusão: NOTA ZERO
   - Estrutura bem organizada: nota alta
   
5. Conhecimento sobre o cargo/concurso (0-200 pontos): demonstração de conhecimento sobre a área, atualidade, relevância
   - Texto sem sentido: NOTA ZERO
   - Sem conhecimento específico: NOTA ZERO
   - Conhecimento superficial: nota muito baixa (máximo 40 pontos)
   - Conhecimento profundo e atualizado: nota alta

REDAÇÃO DO CANDIDATO (ANALISE ESTE TEXTO ESPECÍFICO):
═══════════════════════════════════════════════════════════════════════════════
${redacaoTexto}
═══════════════════════════════════════════════════════════════════════════════

⚠️ AVALIAÇÃO REALISTA E INDIVIDUAL ⚠️:
- Esta é uma redação ÚNICA - analise o CONTEÚDO REAL apresentado
- Seja rigoroso: notas de 600+ são EXCELENTES e raras
- Notas de 400-599 são BOAS (acima da média)
- Notas de 200-399 são MÉDIAS (dentro do esperado)
- Notas abaixo de 200 são FRACAS (com muitos problemas)
- NOTA ZERO para textos sem sentido, fora do tema ou muito curtos
- A nota deve refletir EXATAMENTE a qualidade do texto específico

TABELA DE REFERÊNCIA REALISTA:
- 900-1000: Redação exemplar, perfeita ou quase perfeita
- 800-899: Excelente, com mínimos erros
- 700-799: Muito boa, com alguns pequenos erros
- 600-699: Boa, com erros moderados
- 500-599: Acima da média, com vários erros
- 400-499: Média, com problemas significativos
- 300-399: Abaixo da média, com muitos problemas
- 200-299: Fraca, com sérios problemas
- 100-199: Muito fraca, quase sem sentido
- 0-99: Sem sentido, fora do tema ou muito curta

Retorne APENAS um objeto JSON válido no seguinte formato:

{
  "nota": 450,
  "criterios": {
    "dominio": 80,
    "compreensao": 90,
    "argumentacao": 100,
    "estrutura": 90,
    "conhecimento": 90
  },
  "feedback": "Feedback DETALHADO e ESPECÍFICO sobre esta redação. Mencione os erros reais encontrados, pontos fortes específicos, e explique PORQUE a nota foi X. Seja rigoroso e honesto (máximo 300 palavras).",
  "dicas": [
    "Dica específica 1 baseada nos erros reais desta redação",
    "Dica específica 2 baseada nos erros reais desta redação",
    "Dica específica 3 para melhorar esta redação específica"
  ]
}

CRÍTICO: 
- Retorne APENAS o JSON, sem markdown, sem explicações
- A nota DEVE ser realista baseada na qualidade REAL do texto
- NÃO inclua redação modelo no JSON — será gerada separadamente
- Analise o CONTEÚDO REAL e específico desta redação`

      // Garantir que estamos analisando o texto atual (não um cache)
      const contentHash = redacaoTexto.substring(0, 50) + redacaoTexto.length + wordCount + paragraphCount
      console.log('📝 Analisando redação única:', {
        tema: redacaoTema,
        tamanho: redacaoTexto.length,
        palavras: wordCount,
        paragrafos: paragraphCount,
        hash: contentHash.substring(0, 20),
        preview: redacaoTexto.substring(0, 100) + '...'
      })

      // Usar configuração com temperatura mais alta para variabilidade
      const response = await callGeminiWithRetry(analysisPrompt, {
        generationConfig: {
          temperature: 0.9, // Alta temperatura para mais variabilidade nas avaliações
          maxOutputTokens: 4000, // Aumentado para caber a redação modelo
          topP: 0.95,
        },
        useGoogleSearch: true,
      })
      
      let responseText = extractGeneratedText(response).trim()
      
      console.log('🤖 Resposta da IA recebida (primeiros 300 chars):', responseText.substring(0, 300))

      // Extrair JSON
      let jsonText = responseText
      if (jsonText.includes('```json')) {
        jsonText = jsonText.split('```json')[1].split('```')[0].trim()
      } else if (jsonText.includes('```')) {
        jsonText = jsonText.split('```')[1].split('```')[0].trim()
      }

      const firstBrace = jsonText.indexOf('{')
      const lastBrace = jsonText.lastIndexOf('}')
      if (firstBrace !== -1 && lastBrace !== -1) {
        jsonText = jsonText.substring(firstBrace, lastBrace + 1)
      }

      // Tentar reparar JSON se necessário
      let parsed
      try {
        parsed = JSON.parse(jsonText)
      } catch (parseError) {
        console.warn('⚠️ Erro ao parsear JSON, tentando reparar...', parseError)
        try {
          // Tentar usar jsonrepair se disponível
          const { default: jsonrepair } = await import('jsonrepair')
          const repaired = jsonrepair(jsonText)
          parsed = JSON.parse(repaired)
        } catch (repairError) {
          console.error('❌ Erro ao reparar JSON:', repairError)
          throw new Error('Erro ao processar resposta da IA. Tente novamente.')
        }
      }

      // Validar que a nota faz sentido
      if (parsed.nota < 0 || parsed.nota > 1000) {
        console.warn('⚠️ Nota fora do range esperado, ajustando...', parsed.nota)
        parsed.nota = Math.max(0, Math.min(1000, parsed.nota))
      }

      // Validar critérios
      Object.keys(parsed.criterios || {}).forEach(key => {
        if (parsed.criterios[key] < 0 || parsed.criterios[key] > 200) {
          console.warn(`⚠️ Critério ${key} fora do range, ajustando...`, parsed.criterios[key])
          parsed.criterios[key] = Math.max(0, Math.min(200, parsed.criterios[key]))
        }
      })

      // Sempre gerar redação modelo nova para o curso e tema atuais
      let redacaoModelo = ''
      try {
        redacaoModelo = await generateRedacaoModelo(redacaoTema)
      } catch (modeloError) {
        console.error('Erro ao gerar redação modelo:', modeloError)
        redacaoModelo = `Não foi possível gerar a redação modelo para o tema "${redacaoTema}". Tente novamente.`
      }

      setResultado({
        ...parsed,
        redacaoModelo,
        paragraphCount,
        lines,
        wordCount,
        analyzedAt: new Date().toISOString(),
        contentHash: contentHash.substring(0, 30),
        tema: redacaoTema,
        courseId: getCourseId(),
      })
    } catch (err) {
      console.error('Erro ao analisar redação:', err)
      alert('Erro ao analisar redação. Tente novamente.')
    } finally {
      setAnalizing(false)
    }
  }

  // Formatação do tempo
  const formatTime = (seconds) => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`
  }

  // Contadores
  const wordCount = redacaoTexto.trim() ? redacaoTexto.trim().split(/\s+/).length : 0
  const charCount = redacaoTexto.length
  const paragraphCount = detectParagraphs(redacaoTexto)
  const lines = redacaoTexto.split('\n').length

  // Tela de resultados
  if (resultado) {
    return (
      <div className="space-y-6 pb-10">
        <div className="max-w-4xl mx-auto space-y-4">
          <div>
            <span className="cp-badge cp-badge-accent">Resultado</span>
            <h1 className="cp-headline mt-3 text-2xl">Treino de Redação</h1>
          </div>

          <div className="cp-card overflow-hidden p-0">
            <div className="bg-gradient-to-r from-cp-accent to-cp-accent2 p-6 text-white">
              <p className="font-mono text-[10px] uppercase tracking-wider opacity-80">Sua nota</p>
              <p className="mt-1 text-5xl font-black">{resultado.nota}</p>
              <p className="mt-1 text-sm opacity-80">de 1000 pontos</p>
            </div>

            <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-5">
              {[
                { label: 'Domínio', value: resultado.criterios.dominio },
                { label: 'Compreensão', value: resultado.criterios.compreensao },
                { label: 'Argumentação', value: resultado.criterios.argumentacao },
                { label: 'Estrutura', value: resultado.criterios.estrutura },
                { label: 'Conhecimento', value: resultado.criterios.conhecimento },
              ].map((c) => (
                <div key={c.label} className="cp-card !p-3 text-center">
                  <p className="font-mono text-[10px] uppercase text-cp-muted">{c.label}</p>
                  <p className="mt-1 text-xl font-semibold text-cp-accent">{c.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="cp-card p-4 text-center">
              <p className="font-mono text-[10px] uppercase text-cp-muted">Parágrafos</p>
              <p className="mt-1 text-xl font-semibold text-cp-text">{resultado.paragraphCount}</p>
            </div>
            <div className="cp-card p-4 text-center">
              <p className="font-mono text-[10px] uppercase text-cp-muted">Linhas</p>
              <p className="mt-1 text-xl font-semibold text-cp-text">{resultado.lines}</p>
            </div>
            <div className="cp-card p-4 text-center">
              <p className="font-mono text-[10px] uppercase text-cp-muted">Palavras</p>
              <p className="mt-1 text-xl font-semibold text-cp-text">{resultado.wordCount}</p>
            </div>
          </div>

          <div className="cp-card border-cp-accent/30 p-5 sm:p-6">
            <p className="font-mono text-[11px] uppercase tracking-wider text-cp-accent mb-3">Feedback geral</p>
            <p className="text-sm leading-relaxed text-cp-text whitespace-pre-wrap">{resultado.feedback}</p>
          </div>

          {resultado.dicas && resultado.dicas.length > 0 && (
            <div className="cp-card p-5 sm:p-6">
              <p className="mb-3 flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-emerald-600">
                <SparklesIcon className="h-4 w-4" />
                Dicas de melhoria
              </p>
              <ul className="space-y-2">
                {resultado.dicas.map((dica, index) => (
                  <li key={index} className="flex items-start gap-2 text-sm text-cp-text">
                    <span className="font-bold text-emerald-500">•</span>
                    <span>{dica}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="cp-card border-amber-500/30 p-5 sm:p-6">
            <p className="mb-2 flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-amber-600">
              <DocumentTextIcon className="h-4 w-4" />
              Redação nota 1000
            </p>
            {resultado.tema && (
              <p className="mb-3 text-xs font-medium text-cp-muted">Tema: {resultado.tema}</p>
            )}
            <div className="rounded-xl border border-cp-border bg-cp-bg/40 p-4">
              <p className="font-serif text-sm leading-relaxed text-cp-text whitespace-pre-wrap">
                {resultado?.redacaoModelo || 'Redação modelo não disponível. Tente analisar novamente.'}
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <button type="button" onClick={handleNewTheme} className="cp-btn-primary flex-1 !py-3">
              Novo tema
            </button>
            <button
              type="button"
              onClick={() => {
                setResultado(null)
                setRedacaoTexto('')
                setTimeLeft(3600)
                setIsRunning(false)
                setAnalizing(false)
                generateTheme()
              }}
              className="cp-btn-ghost flex-1 !py-3"
            >
              Treinar novamente
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-10">
      {configLoading ? (
        <div className="cp-card flex min-h-[40vh] items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-cp-accent border-t-transparent" />
        </div>
      ) : !isContentAvailable(redacaoStatus, isAdmin) ? (
        <div className="cp-card p-12 text-center max-w-lg mx-auto">
          <p className="text-4xl mb-3">🔒</p>
          <p className="font-medium text-cp-text">Redação em preparação</p>
          <p className="mt-2 text-sm text-cp-muted">O administrador ainda não disponibilizou o treino de redação.</p>
        </div>
      ) : (
      <div className="max-w-4xl mx-auto space-y-4">
        <div>
          <span className="cp-badge cp-badge-accent">Redação</span>
          <h1 className="cp-headline mt-3 text-2xl">Treino de Redação</h1>
          {courseName && <p className="mt-1 text-sm text-cp-muted">{courseName} · Banca {courseBanca}</p>}
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="cp-card p-4">
            <p className="font-mono text-[10px] uppercase text-cp-muted">Tempo</p>
            <p className={`mt-1 text-xl font-semibold ${timeLeft < 600 ? 'text-red-500' : 'text-cp-text'}`}>
              {formatTime(timeLeft)}
            </p>
            <button type="button" onClick={() => setIsRunning(!isRunning)} className="mt-2 cp-btn-ghost !py-1 !text-xs">
              {isRunning ? <><PauseIcon className="h-3 w-3" /> Pausar</> : <><PlayIcon className="h-3 w-3" /> Iniciar</>}
            </button>
          </div>
          <div className="cp-card p-4">
            <p className="font-mono text-[10px] uppercase text-cp-muted">Palavras</p>
            <p className="mt-1 text-xl font-semibold text-cp-text">{wordCount}</p>
          </div>
          <div className="cp-card p-4">
            <p className="font-mono text-[10px] uppercase text-cp-muted">Parágrafos</p>
            <p className="mt-1 text-xl font-semibold text-cp-text">{paragraphCount}</p>
          </div>
          <div className="cp-card p-4">
            <p className="font-mono text-[10px] uppercase text-cp-muted">Linhas</p>
            <p className="mt-1 text-xl font-semibold text-cp-text">{lines}</p>
          </div>
        </div>

        <div className="cp-card border-cp-accent/30 p-5 sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <p className="font-mono text-[11px] uppercase tracking-wider text-cp-accent">Tema proposto</p>
            <div className="flex flex-wrap gap-2">
              {isAdmin && (
                <>
                  <ContentPublishButton status={redacaoStatus} onToggle={handleToggleRedacaoStatus} size="xs" />
                  <button type="button" onClick={() => setEditingTema(!editingTema)} className="cp-btn-ghost !py-1 !text-xs">
                    <PencilSquareIcon className="h-3.5 w-3.5" />
                    Editar tema
                  </button>
                </>
              )}
              {isAdmin && (
                <button type="button" onClick={generateTheme} disabled={loading} className="cp-btn-ghost !py-1 !text-xs">
                  <ArrowPathIcon className="h-3.5 w-3.5" />
                  {loading ? 'Gerando...' : 'Gerar com IA'}
                </button>
              )}
            </div>
          </div>
          {editingTema && isAdmin ? (
            <div className="space-y-3">
              <textarea
                value={redacaoTema}
                onChange={(e) => setRedacaoTema(e.target.value)}
                rows={4}
                className="w-full rounded-xl border border-cp-border bg-cp-bg/60 p-3 text-sm text-cp-text"
              />
              <button type="button" onClick={() => saveRedacaoConfig()} disabled={savingTema} className="cp-btn-primary !py-2 !text-sm">
                {savingTema ? 'Salvando...' : 'Salvar tema'}
              </button>
            </div>
          ) : (
            <p className="text-base font-medium leading-relaxed text-cp-text sm:text-lg">
              {loading ? 'Gerando tema...' : redacaoTema || 'Tema não definido'}
            </p>
          )}
          <p className="mt-3 text-xs text-cp-muted">Dissertação argumentativa · 25–30 linhas · 4 espaços = novo parágrafo</p>
        </div>

        <div className="cp-card p-5 sm:p-6">
          <label className="mb-3 block text-sm font-medium text-cp-text">Sua redação</label>
          <textarea
            ref={textareaRef}
            value={redacaoTexto}
            onChange={(e) => setRedacaoTexto(e.target.value)}
            placeholder="Comece a escrever sua redação aqui..."
            className="min-h-[360px] w-full resize-none rounded-xl border border-cp-border bg-cp-bg/40 p-4 font-serif text-base leading-relaxed text-cp-text focus:border-cp-accent/40 focus:outline-none focus:ring-2 focus:ring-cp-accent/20"
            disabled={analizing || timeLeft === 0}
          />
          <div className="mt-3 flex items-center justify-between text-xs text-cp-muted">
            <span>{charCount} caracteres</span>
            <span className={wordCount < 200 ? 'text-amber-500' : 'text-emerald-500'}>
              {wordCount < 200 ? 'Muito curta' : 'Tamanho ok'}
            </span>
          </div>
        </div>

        {/* Overlay de carregamento */}
        {analizing && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-slate-800 rounded-xl p-8 max-w-md w-full mx-4 shadow-2xl">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-alego-600 border-t-transparent mx-auto mb-4"></div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">
                  Analisando sua redação
                </h3>
                <p className="text-slate-600 dark:text-slate-400 mb-4">
                  A IA está avaliando sua redação e gerando o modelo exemplar...
                </p>
                
                {/* Barra de progresso animada */}
                <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2 mb-4">
                  <div className="bg-alego-600 h-2 rounded-full animate-pulse" style={{width: '60%'}}></div>
                </div>
                
                <div className="space-y-2 text-sm text-slate-500 dark:text-slate-400">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                    <span>Analisando estrutura e argumentação</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" style={{animationDelay: '0.5s'}}></div>
                    <span>Calculando nota realista</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse" style={{animationDelay: '1s'}}></div>
                    <span>Gerando redação modelo personalizada</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Botões */}
        <div className="flex gap-4">
          <button
            onClick={handleFinish}
            disabled={analizing || !redacaoTexto.trim()}
            className="cp-btn-primary flex-1 !py-3"
          >
            {analizing ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                <span>Analisando redação...</span>
              </>
            ) : (
              <>
                <SparklesIcon className="h-5 w-5" />
                <span>Finalizar e Ver Resultado</span>
              </>
            )}
          </button>
        </div>
      </div>
      )}
    </div>
  )
}

export default TreinoRedacao

