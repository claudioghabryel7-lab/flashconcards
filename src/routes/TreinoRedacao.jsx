import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { canAccessRedacao } from '../utils/trialLimits'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'
import { callGeminiWithRetry, extractGeneratedText } from '../utils/geminiApi'
import ContentPublishButton from '../components/ContentPublishButton'
import TechHubHeader from '../components/cp/TechHubHeader'
import { isContentAvailable, toggleContentStatus, defaultContentStatus } from '../utils/contentStatus'
import {
  ClockIcon,
  PlayIcon,
  PauseIcon,
  SparklesIcon,
  DocumentTextIcon,
  ArrowPathIcon,
  PencilSquareIcon,
  PencilIcon,
} from '@heroicons/react/24/outline'

/** Linhas que começam com exatamente 4 espaços = novo parágrafo (padrão do módulo). */
function detectParagraphs(text) {
  if (!text) return 0
  let paragraphCount = 0
  for (const line of text.split('\n')) {
    if (line.length >= 4 && line.substring(0, 4) === '    ' && (line.length === 4 || line[4] !== ' ')) {
      paragraphCount++
    }
  }
  return paragraphCount
}

function formatTime(seconds) {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`
}

const TreinoRedacao = () => {
  const { profile, isAdmin } = useAuth()
  const [loading, setLoading] = useState(false)
  const [configLoading, setConfigLoading] = useState(true)
  const [redacaoTema, setRedacaoTema] = useState('')
  const [guiaNota1000, setGuiaNota1000] = useState('')
  const [redacaoStatus, setRedacaoStatus] = useState(defaultContentStatus())
  const [editingTema, setEditingTema] = useState(false)
  const [savingTema, setSavingTema] = useState(false)
  const [redacaoTexto, setRedacaoTexto] = useState('')
  const [timeLeft, setTimeLeft] = useState(3600)
  const [isRunning, setIsRunning] = useState(false)
  const [resultado, setResultado] = useState(null)
  const [analizing, setAnalizing] = useState(false)
  const [selectedCourseId, setSelectedCourseId] = useState(null)
  const [courseName, setCourseName] = useState('')
  const [courseCompetition, setCourseCompetition] = useState('')
  const [courseBanca, setCourseBanca] = useState('')
  const textareaRef = useRef(null)
  const redacaoTextoRef = useRef('')
  const handleAnalyzeRef = useRef(null)

  const getCourseId = () => selectedCourseId || 'alego-default'
  const trialBlocked = !canAccessRedacao()

  useEffect(() => {
    redacaoTextoRef.current = redacaoTexto
  }, [redacaoTexto])

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
    const prompt = await (
      await import('../utils/unifiedPrompt')
    ).buildRedacaoModeloPrompt(courseId, tema, editalText ? editalText.substring(0, 30000) : '')

    const response = await callGeminiWithRetry(prompt, {
      courseId,
      generationConfig: { maxOutputTokens: 4096, temperature: 0.5 },
    })
    return extractGeneratedText(response).trim()
  }

  useEffect(() => {
    if (!profile) return

    const courseFromProfile = profile.selectedCourseId !== undefined ? profile.selectedCourseId : null
    setSelectedCourseId(courseFromProfile)

    const loadCourse = async () => {
      const courseId = courseFromProfile || 'alego-default'
      const docSnap = await getDoc(doc(db, 'courses', courseId))
      if (docSnap.exists()) {
        const data = docSnap.data()
        setCourseName(data.name || '')
        setCourseCompetition(data.competition || '')
        setCourseBanca(String(data.banca || '').trim())
      }
    }

    loadCourse()
  }, [profile])

  useEffect(() => {
    if (selectedCourseId === null && profile === undefined) return

    const loadConfig = async () => {
      setConfigLoading(true)
      try {
        const courseId = selectedCourseId || 'alego-default'
        const configSnap = await getDoc(doc(db, 'courses', courseId, 'config', 'redacao'))
        if (configSnap.exists()) {
          const data = configSnap.data()
          setRedacaoTema(data.tema || '')
          setGuiaNota1000(data.guiaNota1000 || '')
          setRedacaoStatus(data.status || defaultContentStatus())
        } else {
          setRedacaoStatus(defaultContentStatus())
          if (isAdmin) {
            await generateTheme({ persist: true, startTimer: false })
          }
        }
      } catch (err) {
        console.error(err)
      } finally {
        setConfigLoading(false)
      }
    }

    loadConfig()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- carrega config ao trocar curso/admin
  }, [selectedCourseId, profile, isAdmin])

  // Timer: depende só de isRunning (evita recriar intervalo a cada segundo)
  useEffect(() => {
    if (!isRunning) return undefined

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          setIsRunning(false)
          queueMicrotask(() => handleAnalyzeRef.current?.())
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [isRunning])

  const saveRedacaoConfig = async (tema = redacaoTema, status = redacaoStatus, guia = guiaNota1000) => {
    setSavingTema(true)
    try {
      const payload = {
        tema: String(tema || '').trim(),
        status,
        updatedAt: serverTimestamp(),
      }
      const guiaTrim = String(guia || '').trim()
      if (guiaTrim) payload.guiaNota1000 = guiaTrim

      await setDoc(doc(db, 'courses', getCourseId(), 'config', 'redacao'), payload, { merge: true })
      setRedacaoStatus(status)
      if (guiaTrim) setGuiaNota1000(guiaTrim)
      setEditingTema(false)
    } catch (err) {
      console.error(err)
      alert('Erro ao salvar tema')
    } finally {
      setSavingTema(false)
    }
  }

  const generateTheme = async ({ persist = isAdmin, startTimer = false } = {}) => {
    setLoading(true)
    try {
      const courseId = getCourseId()
      const editalText = await loadEditalText(courseId)

      const courseSnap = await getDoc(doc(db, 'courses', courseId))
      const courseData = courseSnap.exists() ? courseSnap.data() || {} : {}
      const banca = String(courseData.banca || courseBanca || '').trim()
      const cargo = String(courseData.competition || courseCompetition || '').trim()
      if (banca) setCourseBanca(banca)
      if (cargo) setCourseCompetition(cargo)

      const { buildRedacaoPrompt } = await import('../utils/unifiedPrompt')
      const baseThemePrompt = await buildRedacaoPrompt(
        courseId,
        editalText ? editalText.substring(0, 30000) : '',
      )

      const themePrompt = `${baseThemePrompt}

BANCA EXAMINADORA (use EXATAMENTE esta — campo do curso no admin): ${banca || 'banca do concurso'}
CARGO (use para calibrar a dificuldade e o enfoque do tema): ${cargo || courseName || 'Cargo público'}

Gere:
1) UM tema de redação dissertativa-argumentativa com alta probabilidade de cair nesta banca para este cargo (específico, atual, alinhado ao cargo). A dificuldade deve refletir o nível típico do cargo informado.
2) Um MATERIAL DE APOIO (guiaNota1000) explicando como fazer redação nota máxima segundo os critérios típicos da banca "${banca || 'informada'}" (estrutura, coerência, repertório, o que a banca valoriza/pune). Texto claro para o aluno estudar antes de escrever.

PROIBIDO: inventar flashcards, questões ou material de edital de disciplinas.
PROIBIDO: trocar a banca por órgão/secretaria/instituição — a banca é "${banca || 'a do curso'}".

Retorne APENAS JSON válido:
{
  "tema": "texto do tema",
  "guiaNota1000": "material de apoio em texto corrido ou markdown curto"
}`

      const response = await callGeminiWithRetry(themePrompt, {
        courseId,
        generationConfig: { maxOutputTokens: 4096, temperature: 0.5 },
      })
      let raw = extractGeneratedText(response).trim()

      let theme = ''
      let guia = ''
      try {
        const cleaned = raw
          .replace(/^```json\s*/i, '')
          .replace(/^```\s*/i, '')
          .replace(/```$/i, '')
          .trim()
        const parsed = JSON.parse(cleaned)
        theme = String(parsed.tema || '').trim()
        guia = String(parsed.guiaNota1000 || '').trim()
      } catch {
        theme = raw
          .replace(/TEMA:/gi, '')
          .replace(/"/g, '')
          .replace(/^[-•]\s*/, '')
          .trim()
      }

      if (!theme) throw new Error('Tema vazio')

      setRedacaoTema(theme)
      if (guia) setGuiaNota1000(guia)

      if (persist) {
        await saveRedacaoConfig(theme, redacaoStatus, guia || guiaNota1000)
      }
      if (startTimer) setIsRunning(true)
    } catch (err) {
      console.error('Erro ao gerar tema:', err)
      setRedacaoTema(
        `A importância da eficiência no serviço público para o cargo de ${courseCompetition || courseName || 'servidor público'}`,
      )
    } finally {
      setLoading(false)
    }
  }

  const handleToggleRedacaoStatus = async () => {
    const novo = toggleContentStatus(redacaoStatus)
    setRedacaoStatus(novo)
    await saveRedacaoConfig(redacaoTema, novo)
  }

  const resetWritingSession = () => {
    setResultado(null)
    setRedacaoTexto('')
    setTimeLeft(3600)
    setIsRunning(false)
    setAnalizing(false)
  }

  const handleNewTheme = async () => {
    resetWritingSession()
    if (isAdmin) {
      await generateTheme({ persist: true, startTimer: false })
    }
  }

  const handleFinish = () => {
    setIsRunning(false)
    handleAnalyze()
  }

  const handleAnalyze = async () => {
    setAnalizing(true)
    const texto = redacaoTextoRef.current || redacaoTexto

    if (!texto.trim()) {
      setAnalizing(false)
      alert('Digite sua redação antes de analisar.')
      return
    }

    const wordCountLocal = texto.trim().split(/\s+/).length
    const charCountLocal = texto.trim().length

    if (wordCountLocal < 50 || charCountLocal < 200) {
      const resultadoComModelo = {
        nota: 0,
        criterios: {
          dominio: 0,
          compreensao: 0,
          argumentacao: 0,
          estrutura: 0,
          conhecimento: 0,
        },
        feedback: `Esta redação está muito curta (${wordCountLocal} palavras, ${charCountLocal} caracteres). Uma redação de concurso público deve ter no mínimo 200 palavras e desenvolver adequadamente o tema proposto. Por isso, a nota foi zerada.`,
        dicas: [
          'Escreva pelo menos 200 palavras para uma redação completa',
          'Desenvolva o tema com argumentos e exemplos',
          'Estruture sua redação com introdução, desenvolvimento e conclusão',
          'Use parágrafos (4 espaços no início da linha) para organizar suas ideias',
        ],
        paragraphCount: detectParagraphs(texto),
        lines: texto.split('\n').length,
        wordCount: wordCountLocal,
        redacaoModelo: await generateRedacaoModelo(redacaoTema).catch(() => {
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

    try {
      const courseId = getCourseId()
      const editalText = await loadEditalText(courseId)
      const paragraphCountLocal = detectParagraphs(texto)
      const linesLocal = texto.split('\n').length

      const { buildRedacaoAnalysisPrompt } = await import('../utils/unifiedPrompt')
      const baseAnalysisPrompt = await buildRedacaoAnalysisPrompt(
        courseId,
        redacaoTema,
        editalText ? editalText.substring(0, 30000) : '',
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
- Número de parágrafos (linhas com 4 espaços no início): ${paragraphCountLocal}
- Total de linhas: ${linesLocal}
- Total de palavras: ${wordCountLocal}
- Tamanho do texto: ${texto.length} caracteres

${wordCountLocal < 200 ? '⚠️⚠️⚠️ CRÍTICO: Esta redação está MUITO CURTA (menos de 200 palavras). Uma redação de concurso deve ter no mínimo 200 palavras. Isso deve resultar em NOTA MUITO BAIXA ou ZERO, especialmente em estrutura e argumentação.' : ''}
${wordCountLocal < 100 ? '⚠️⚠️⚠️ CRÍTICO: Esta redação está EXTREMAMENTE CURTA (menos de 100 palavras). Isso deve resultar em NOTA ZERO ou MUITO PRÓXIMA DE ZERO em TODOS os critérios.' : ''}
${paragraphCountLocal < 3 ? '⚠️ ATENÇÃO: Esta redação tem poucos parágrafos. Isso deve impactar NEGATIVAMENTE a nota em estrutura textual.' : ''}
${paragraphCountLocal === 0 ? '⚠️⚠️⚠️ CRÍTICO: Esta redação NÃO TEM PARÁGRAFOS. Isso deve resultar em NOTA ZERO em estrutura textual.' : ''}

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
2. Compreensão do tema (0-200 pontos): adequação ao tema proposto, compreensão da proposta
3. Argumentação (0-200 pontos): qualidade dos argumentos, coerência, capacidade de defender pontos de vista
4. Estrutura textual (0-200 pontos): organização do texto, parágrafos (linhas com 4 espaços), introdução, desenvolvimento, conclusão
5. Conhecimento sobre o cargo/concurso (0-200 pontos): demonstração de conhecimento sobre a área, atualidade, relevância

REDAÇÃO DO CANDIDATO (ANALISE ESTE TEXTO ESPECÍFICO):
═══════════════════════════════════════════════════════════════════════════════
${texto}
═══════════════════════════════════════════════════════════════════════════════

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
  "feedback": "Feedback DETALHADO e ESPECÍFICO sobre esta redação (máximo 300 palavras).",
  "dicas": [
    "Dica específica 1",
    "Dica específica 2",
    "Dica específica 3"
  ]
}

CRÍTICO:
- Retorne APENAS o JSON, sem markdown, sem explicações
- NÃO inclua redação modelo no JSON — será gerada separadamente`

      const contentHash = texto.substring(0, 50) + texto.length + wordCountLocal + paragraphCountLocal

      const response = await callGeminiWithRetry(analysisPrompt, {
        courseId,
        generationConfig: {
          temperature: 0.35,
          maxOutputTokens: 4000,
          topP: 0.95,
        },
      })

      let responseText = extractGeneratedText(response).trim()
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

      let parsed
      try {
        parsed = JSON.parse(jsonText)
      } catch {
        const { default: jsonrepair } = await import('jsonrepair')
        parsed = JSON.parse(jsonrepair(jsonText))
      }

      if (parsed.nota < 0 || parsed.nota > 1000) {
        parsed.nota = Math.max(0, Math.min(1000, parsed.nota))
      }

      Object.keys(parsed.criterios || {}).forEach((key) => {
        if (parsed.criterios[key] < 0 || parsed.criterios[key] > 200) {
          parsed.criterios[key] = Math.max(0, Math.min(200, parsed.criterios[key]))
        }
      })

      let redacaoModelo = ''
      try {
        redacaoModelo = await generateRedacaoModelo(redacaoTema)
      } catch {
        redacaoModelo = `Não foi possível gerar a redação modelo para o tema "${redacaoTema}". Tente novamente.`
      }

      setResultado({
        ...parsed,
        redacaoModelo,
        paragraphCount: paragraphCountLocal,
        lines: linesLocal,
        wordCount: wordCountLocal,
        analyzedAt: new Date().toISOString(),
        contentHash: contentHash.substring(0, 30),
        tema: redacaoTema,
        courseId,
      })
    } catch (err) {
      console.error('Erro ao analisar redação:', err)
      alert('Erro ao analisar redação. Tente novamente.')
    } finally {
      setAnalizing(false)
    }
  }

  handleAnalyzeRef.current = handleAnalyze

  const wordCount = redacaoTexto.trim() ? redacaoTexto.trim().split(/\s+/).length : 0
  const charCount = redacaoTexto.length
  const paragraphCount = detectParagraphs(redacaoTexto)
  const lines = redacaoTexto.split('\n').length

  const courseMeta = [
    courseName,
    courseBanca ? `Banca ${courseBanca}` : '',
    courseCompetition || '',
  ]
    .filter(Boolean)
    .join(' · ')

  const gridBg = (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10 opacity-50"
      style={{
        backgroundImage:
          'linear-gradient(var(--cp-grid-line) 1px, transparent 1px), linear-gradient(90deg, var(--cp-grid-line) 1px, transparent 1px)',
        backgroundSize: '28px 28px',
        maskImage: 'radial-gradient(ellipse 90% 60% at 50% 0%, black 20%, transparent 75%)',
      }}
    />
  )

  if (trialBlocked) {
    return (
      <div className="relative space-y-6 pb-10">
        {gridBg}
        <TechHubHeader
          badge="Redação"
          code="08"
          title="Treino de Redação"
          description="Disponível apenas para assinantes — o modo teste não inclui redação com IA."
          icon={PencilIcon}
          tone="violet"
        />
        <div className="cp-tech-card mx-auto max-w-lg p-8 text-center">
          <p className="font-display font-semibold text-cp-text">Modo teste ativo</p>
          <p className="mt-2 text-sm text-cp-muted">
            Faça upgrade da sua conta para praticar redações com correção por IA.
          </p>
          <Link to="/dashboard" className="cp-btn-primary mt-6 inline-flex">
            Voltar ao dashboard
          </Link>
        </div>
      </div>
    )
  }

  if (resultado) {
    return (
      <div className="relative space-y-6 pb-10">
        {gridBg}
        <TechHubHeader
          badge="Resultado"
          code="08"
          title="Treino de Redação"
          description="Correção por IA · nota de 0 a 1000"
          icon={SparklesIcon}
          tone="violet"
        />

        <div className="mx-auto max-w-4xl space-y-4 animate-fade-in">
          <div className="cp-tech-card overflow-hidden">
            <div className="relative bg-gradient-to-r from-[var(--cp-accent)] to-[var(--cp-accent-2)] p-6 text-white">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] opacity-80">Sua nota</p>
              <p className="mt-1 font-display text-5xl font-black tracking-tight">{resultado.nota}</p>
              <p className="mt-1 text-sm opacity-80">de 1000 pontos</p>
            </div>

            <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-5">
              {[
                { label: 'Domínio', value: resultado.criterios?.dominio },
                { label: 'Compreensão', value: resultado.criterios?.compreensao },
                { label: 'Argumentação', value: resultado.criterios?.argumentacao },
                { label: 'Estrutura', value: resultado.criterios?.estrutura },
                { label: 'Conhecimento', value: resultado.criterios?.conhecimento },
              ].map((c) => (
                <div key={c.label} className="rounded-xl border border-cp-border bg-cp-bg/40 p-3 text-center">
                  <p className="font-mono text-[10px] uppercase text-cp-muted">{c.label}</p>
                  <p className="mt-1 text-xl font-semibold text-[var(--cp-accent)]">{c.value ?? '—'}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Parágrafos', value: resultado.paragraphCount },
              { label: 'Linhas', value: resultado.lines },
              { label: 'Palavras', value: resultado.wordCount },
            ].map((s) => (
              <div key={s.label} className="cp-tech-card p-4 text-center">
                <p className="font-mono text-[10px] uppercase text-cp-muted">{s.label}</p>
                <p className="mt-1 text-xl font-semibold text-cp-text">{s.value}</p>
              </div>
            ))}
          </div>

          <div className="cp-tech-card border-[color-mix(in_srgb,var(--cp-accent)_35%,transparent)] p-5 sm:p-6">
            <p className="mb-3 font-mono text-[11px] uppercase tracking-wider text-[var(--cp-accent)]">
              Feedback geral
            </p>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-cp-text">{resultado.feedback}</p>
          </div>

          {resultado.dicas?.length > 0 && (
            <div className="cp-tech-card p-5 sm:p-6">
              <p className="mb-3 flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-emerald-500">
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

          <div className="cp-tech-card border-amber-500/30 p-5 sm:p-6">
            <p className="mb-2 flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-amber-500">
              <DocumentTextIcon className="h-4 w-4" />
              Redação nota 1000
            </p>
            {resultado.tema && (
              <p className="mb-3 text-xs font-medium text-cp-muted">Tema: {resultado.tema}</p>
            )}
            <div className="rounded-xl border border-cp-border bg-cp-bg/40 p-4">
              <p className="whitespace-pre-wrap font-serif text-sm leading-relaxed text-cp-text">
                {resultado?.redacaoModelo || 'Redação modelo não disponível. Tente analisar novamente.'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            {isAdmin && (
              <button type="button" onClick={handleNewTheme} disabled={loading} className="cp-btn-primary flex-1 !py-3">
                <ArrowPathIcon className="h-4 w-4" />
                {loading ? 'Gerando…' : 'Novo tema (IA)'}
              </button>
            )}
            <button
              type="button"
              onClick={resetWritingSession}
              className={`cp-btn-ghost flex-1 !py-3 ${isAdmin ? '' : 'cp-btn-primary'}`}
            >
              Treinar novamente
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="relative space-y-6 pb-10">
      {gridBg}

      {configLoading ? (
        <div className="cp-tech-card flex min-h-[40vh] items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-[var(--cp-accent)] border-t-transparent" />
        </div>
      ) : !isContentAvailable(redacaoStatus, isAdmin) ? (
        <>
          <TechHubHeader
            badge="Redação"
            code="08"
            title="Treino de Redação"
            description="Módulo ainda não liberado pelo administrador."
            icon={PencilIcon}
            tone="violet"
          />
          <div className="cp-tech-card mx-auto max-w-lg p-10 text-center">
            <p className="text-3xl mb-3">🔒</p>
            <p className="font-display font-semibold text-cp-text">Redação em preparação</p>
            <p className="mt-2 text-sm text-cp-muted">
              O administrador ainda não disponibilizou o treino de redação deste curso.
            </p>
          </div>
        </>
      ) : (
        <div className="mx-auto max-w-4xl space-y-4 animate-fade-in">
          <TechHubHeader
            badge="Redação"
            code="08"
            title="Treino de Redação"
            description={
              courseMeta || 'Dissertação argumentativa com correção por IA · 0 a 1000 pontos'
            }
            icon={PencilIcon}
            tone="violet"
          />

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="cp-tech-card p-4">
              <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase text-cp-muted">
                <ClockIcon className="h-3.5 w-3.5" />
                Tempo
              </p>
              <p
                className={`mt-1 font-display text-xl font-semibold tracking-tight ${
                  timeLeft < 600 ? 'text-red-500' : 'text-cp-text'
                }`}
              >
                {formatTime(timeLeft)}
              </p>
              <button
                type="button"
                onClick={() => setIsRunning(!isRunning)}
                className="mt-2 cp-btn-ghost !py-1 !text-xs"
              >
                {isRunning ? (
                  <>
                    <PauseIcon className="h-3 w-3" /> Pausar
                  </>
                ) : (
                  <>
                    <PlayIcon className="h-3 w-3" /> Iniciar
                  </>
                )}
              </button>
            </div>
            <div className="cp-tech-card p-4">
              <p className="font-mono text-[10px] uppercase text-cp-muted">Palavras</p>
              <p className="mt-1 font-display text-xl font-semibold text-cp-text">{wordCount}</p>
            </div>
            <div className="cp-tech-card p-4">
              <p className="font-mono text-[10px] uppercase text-cp-muted">Parágrafos</p>
              <p className="mt-1 font-display text-xl font-semibold text-cp-text">{paragraphCount}</p>
            </div>
            <div className="cp-tech-card p-4">
              <p className="font-mono text-[10px] uppercase text-cp-muted">Linhas</p>
              <p className="mt-1 font-display text-xl font-semibold text-cp-text">{lines}</p>
            </div>
          </div>

          {guiaNota1000 ? (
            <div className="cp-tech-card p-4 sm:p-5">
              <p className="font-mono text-[10px] uppercase tracking-wider text-cp-muted">
                Material de apoio
              </p>
              <p className="mt-1 text-sm font-semibold text-cp-text">
                Como fazer redação nota máxima ({courseBanca || 'sua banca'})
              </p>
              <div className="mt-3 max-h-64 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-cp-muted">
                {guiaNota1000}
              </div>
            </div>
          ) : null}

          <div className="cp-tech-card border-[color-mix(in_srgb,var(--cp-accent)_35%,transparent)] p-5 sm:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <p className="font-mono text-[11px] uppercase tracking-wider text-[var(--cp-accent)]">
                Tema proposto
              </p>
              {isAdmin && (
                <div className="flex flex-wrap gap-2">
                  <ContentPublishButton
                    status={redacaoStatus}
                    onToggle={handleToggleRedacaoStatus}
                    size="xs"
                  />
                  <button
                    type="button"
                    onClick={() => setEditingTema(!editingTema)}
                    className="cp-btn-ghost !py-1 !text-xs"
                  >
                    <PencilSquareIcon className="h-3.5 w-3.5" />
                    Editar tema
                  </button>
                  <button
                    type="button"
                    onClick={() => generateTheme({ persist: true, startTimer: false })}
                    disabled={loading}
                    className="cp-btn-ghost !py-1 !text-xs"
                  >
                    <ArrowPathIcon className="h-3.5 w-3.5" />
                    {loading ? 'Gerando…' : 'Gerar com IA'}
                  </button>
                </div>
              )}
            </div>
            {editingTema && isAdmin ? (
              <div className="space-y-3">
                <textarea
                  value={redacaoTema}
                  onChange={(e) => setRedacaoTema(e.target.value)}
                  rows={4}
                  className="w-full rounded-xl border border-cp-border bg-cp-bg/60 p-3 text-sm text-cp-text focus:border-[var(--cp-accent)]/40 focus:outline-none focus:ring-2 focus:ring-[var(--cp-accent)]/20"
                />
                <button
                  type="button"
                  onClick={() => saveRedacaoConfig()}
                  disabled={savingTema}
                  className="cp-btn-primary !py-2 !text-sm"
                >
                  {savingTema ? 'Salvando…' : 'Salvar tema'}
                </button>
              </div>
            ) : (
              <p className="text-base font-medium leading-relaxed text-cp-text sm:text-lg">
                {loading ? 'Gerando tema…' : redacaoTema || 'Tema não definido'}
              </p>
            )}
            <p className="mt-3 font-mono text-[10px] uppercase tracking-wider text-cp-muted">
              Dissertação argumentativa · 25–30 linhas · 4 espaços = novo parágrafo
            </p>
          </div>

          <div className="cp-tech-card p-5 sm:p-6">
            <label className="mb-3 block text-sm font-medium text-cp-text">Sua redação</label>
            <textarea
              ref={textareaRef}
              value={redacaoTexto}
              onChange={(e) => setRedacaoTexto(e.target.value)}
              placeholder="Comece a escrever sua redação aqui…"
              className="min-h-[360px] w-full resize-none rounded-xl border border-cp-border bg-cp-bg/40 p-4 font-serif text-base leading-relaxed text-cp-text focus:border-[var(--cp-accent)]/40 focus:outline-none focus:ring-2 focus:ring-[var(--cp-accent)]/20"
              disabled={analizing || timeLeft === 0}
            />
            <div className="mt-3 flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-cp-muted">
              <span>{charCount} caracteres</span>
              <span className={wordCount < 200 ? 'text-amber-500' : 'text-emerald-500'}>
                {wordCount < 200 ? 'Muito curta' : 'Tamanho ok'}
              </span>
            </div>
          </div>

          {analizing && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
              <div className="cp-tech-card mx-4 w-full max-w-md p-8 shadow-2xl">
                <div className="text-center">
                  <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-[var(--cp-accent)] border-t-transparent" />
                  <h3 className="font-display text-xl font-semibold text-cp-text">Analisando sua redação</h3>
                  <p className="mt-2 text-sm text-cp-muted">
                    A IA está avaliando o texto e gerando o modelo exemplar…
                  </p>
                  <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-cp-border">
                    <div
                      className="h-2 animate-pulse rounded-full bg-[var(--cp-accent)]"
                      style={{ width: '60%' }}
                    />
                  </div>
                  <div className="mt-4 space-y-2 text-left text-sm text-cp-muted">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                      <span>Analisando estrutura e argumentação</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div
                        className="h-2 w-2 animate-pulse rounded-full bg-[var(--cp-accent-2)]"
                        style={{ animationDelay: '0.5s' }}
                      />
                      <span>Calculando nota realista</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div
                        className="h-2 w-2 animate-pulse rounded-full bg-[var(--cp-accent)]"
                        style={{ animationDelay: '1s' }}
                      />
                      <span>Gerando redação modelo personalizada</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={handleFinish}
            disabled={analizing || !redacaoTexto.trim()}
            className="cp-btn-primary w-full !py-3"
          >
            {analizing ? (
              <>
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                <span>Analisando redação…</span>
              </>
            ) : (
              <>
                <SparklesIcon className="h-5 w-5" />
                <span>Finalizar e ver resultado</span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  )
}

export default TreinoRedacao
