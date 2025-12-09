import { useState, useEffect, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { canAccessRedacao, isTrialMode } from '../utils/trialLimits'
import { doc, getDoc } from 'firebase/firestore'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { db } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'
import { useDarkMode } from '../hooks/useDarkMode.jsx'
import {
  ClockIcon,
  PlayIcon,
  PauseIcon,
  TrophyIcon,
  ArrowDownIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline'

const TreinoRedacao = () => {
  const navigate = useNavigate()
  const { user, profile } = useAuth()
  const { darkMode } = useDarkMode()
  const [loading, setLoading] = useState(false)
  const [redacaoTema, setRedacaoTema] = useState('')
  const [redacaoTexto, setRedacaoTexto] = useState('')
  const [timeLeft, setTimeLeft] = useState(3600) // 1 hora em segundos
  const [isRunning, setIsRunning] = useState(false)
  const [resultado, setResultado] = useState(null)
  const [analizing, setAnalizing] = useState(false)
  const [selectedCourseId, setSelectedCourseId] = useState(null)
  const [courseName, setCourseName] = useState('')
  const [courseCompetition, setCourseCompetition] = useState('')
  const textareaRef = useRef(null)

  // Carregar curso do perfil
  useEffect(() => {
    if (!profile) return
    
    const courseFromProfile = profile.selectedCourseId !== undefined ? profile.selectedCourseId : null
    setSelectedCourseId(courseFromProfile)
    
    if (courseFromProfile) {
      const courseRef = doc(db, 'courses', courseFromProfile)
      getDoc(courseRef).then((docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data()
          setCourseName(data.name || '')
          setCourseCompetition(data.competition || '')
        }
      })
    }
  }, [profile])

  // Gerar tema de redação ao carregar
  useEffect(() => {
    generateTheme()
  }, [selectedCourseId])

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
      const courseId = selectedCourseId || 'alego-default'
      const editalRef = doc(db, 'courses', courseId, 'prompts', 'edital')
      const editalDoc = await getDoc(editalRef)

      let editalText = ''
      if (editalDoc.exists()) {
        const data = editalDoc.data()
        editalText = (data.prompt || '') + '\n\n' + (data.pdfText || '')
      }

      const apiKey = import.meta.env.VITE_GEMINI_API_KEY
      if (!apiKey) {
        throw new Error('VITE_GEMINI_API_KEY não configurada')
      }

      const genAI = new GoogleGenerativeAI(apiKey)
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' })

      const themePrompt = `Você é um especialista em criar temas de redação para concursos públicos.

CONCURSO ESPECÍFICO: ${courseName || 'Concurso'}${courseCompetition ? ` (${courseCompetition})` : ''}
CARGO: ${courseCompetition || courseName || 'Cargo público'}

${editalText ? `CONTEXTO DO EDITAL:\n${editalText.substring(0, 30000)}\n\n` : ''}

Crie um tema de redação ESPECÍFICO e relevante para o concurso ${courseName || 'mencionado'}${courseCompetition ? ` (${courseCompetition})` : ''}.

INSTRUÇÕES:
- O tema deve ser atual e relevante para o cargo/concurso
- Deve estar relacionado com questões sociais, políticas ou administrativas pertinentes ao cargo
- Seja específico: não use temas genéricos
- O tema deve permitir uma dissertação argumentativa de 25-30 linhas
- Se você tiver conhecimento sobre este concurso específico, use temas típicos dessa área

Retorne APENAS o tema da redação, sem explicações, sem aspas, sem formatação especial.
O tema deve ser claro e direto.

CRÍTICO: Retorne APENAS o tema, nada mais.`

      const result = await model.generateContent(themePrompt)
      let theme = result.response.text().trim()
      
      // Limpar formatação
      theme = theme.replace(/TEMA:/gi, '').trim()
      theme = theme.replace(/"/g, '').trim()
      theme = theme.replace(/^[-•]\s*/, '').trim()
      
      setRedacaoTema(theme)
      setIsRunning(true)
    } catch (err) {
      console.error('Erro ao gerar tema:', err)
      setRedacaoTema(`A importância da eficiência no serviço público para o cargo de ${courseCompetition || courseName || 'servidor público'}`)
      setIsRunning(true)
    } finally {
      setLoading(false)
    }
  }

  // Gerar novo tema
  const handleNewTheme = () => {
    setRedacaoTexto('')
    setTimeLeft(3600)
    setIsRunning(false)
    setResultado(null)
    generateTheme()
  }

  // Analisar e avaliar redação
  const handleFinish = async () => {
    if (!redacaoTexto.trim()) {
      alert('Por favor, escreva sua redação antes de finalizar.')
      return
    }

    setIsRunning(false)
    setAnalizing(true)

    try {
      const courseId = selectedCourseId || 'alego-default'
      const editalRef = doc(db, 'courses', courseId, 'prompts', 'edital')
      const editalDoc = await getDoc(editalRef)

      let editalText = ''
      if (editalDoc.exists()) {
        const data = editalDoc.data()
        editalText = (data.prompt || '') + '\n\n' + (data.pdfText || '')
      }

      const apiKey = import.meta.env.VITE_GEMINI_API_KEY
      if (!apiKey) {
        throw new Error('VITE_GEMINI_API_KEY não configurada')
      }

      const genAI = new GoogleGenerativeAI(apiKey)
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' })

      // Contar parágrafos (linhas que começam com 4 espaços)
      const paragraphCount = detectParagraphs(redacaoTexto)
      const lines = redacaoTexto.split('\n').length
      const wordCount = redacaoTexto.trim() ? redacaoTexto.trim().split(/\s+/).length : 0

      const analysisPrompt = `Você é um corretor especializado em redações de concursos públicos.

CONCURSO: ${courseName || 'Concurso'}${courseCompetition ? ` (${courseCompetition})` : ''}
TEMA DA REDAÇÃO: ${redacaoTema}

${editalText ? `CONTEXTO DO EDITAL:\n${editalText.substring(0, 30000)}\n\n` : ''}

IMPORTANTE: Esta redação usa 4 espaços no início da linha para indicar parágrafos. Linhas que começam com 4 espaços são parágrafos.

INFORMAÇÕES DA REDAÇÃO:
- Número de parágrafos (linhas com 4 espaços no início): ${paragraphCount}
- Total de linhas: ${lines}
- Total de palavras: ${wordCount}

Analise a seguinte redação e atribua uma nota de 0 a 1000, seguindo os critérios típicos de concursos públicos:

CRITÉRIOS DE AVALIAÇÃO:
1. Domínio da modalidade escrita (0-200 pontos): ortografia, acentuação, pontuação, uso adequado da língua
2. Compreensão do tema (0-200 pontos): adequação ao tema proposto, compreensão da proposta
3. Argumentação (0-200 pontos): qualidade dos argumentos, coerência, capacidade de defender pontos de vista
4. Estrutura textual (0-200 pontos): organização do texto, parágrafos (linhas com 4 espaços), introdução, desenvolvimento, conclusão
5. Conhecimento sobre o cargo/concurso (0-200 pontos): demonstração de conhecimento sobre a área, atualidade, relevância

REDAÇÃO DO CANDIDATO:
${redacaoTexto}

Retorne APENAS um objeto JSON válido no seguinte formato:

{
  "nota": 750,
  "criterios": {
    "dominio": 160,
    "compreensao": 170,
    "argumentacao": 180,
    "estrutura": 150,
    "conhecimento": 90
  },
  "feedback": "Feedback geral sobre a redação, destacando pontos positivos e áreas de melhoria (máximo 300 palavras). Seja específico sobre o uso de parágrafos (4 espaços) e dê dicas práticas de melhoria.",
  "dicas": [
    "Dica específica 1 de melhoria",
    "Dica específica 2 de melhoria",
    "Dica específica 3 de melhoria"
  ]
}

CRÍTICO: Retorne APENAS o JSON, sem markdown, sem explicações.`

      const result = await model.generateContent(analysisPrompt)
      let responseText = result.response.text().trim()

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

      const parsed = JSON.parse(jsonText)
      setResultado({
        ...parsed,
        paragraphCount,
        lines,
        wordCount,
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
      <div className="min-h-screen py-8">
        <div className="max-w-4xl mx-auto px-4">
          <div className={`rounded-2xl p-8 ${darkMode ? 'bg-slate-800' : 'bg-white'} shadow-lg`}>
            <h1 className="text-3xl font-bold mb-6 text-alego-600">Resultado do Treino de Redação</h1>

            {/* Nota */}
            <div className="mb-6 p-6 bg-gradient-to-r from-alego-600 to-alego-700 rounded-xl text-white">
              <p className="text-sm opacity-90 mb-1">Sua Nota</p>
              <p className="text-5xl font-black mb-2">{resultado.nota}</p>
              <p className="text-sm opacity-80">de 1000 pontos</p>
            </div>

            {/* Critérios */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
              <div className="text-center p-4 bg-purple-50 dark:bg-purple-900/20 rounded-xl">
                <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">Domínio</p>
                <p className="text-2xl font-bold text-purple-600">{resultado.criterios.dominio}</p>
              </div>
              <div className="text-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
                <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">Compreensão</p>
                <p className="text-2xl font-bold text-blue-600">{resultado.criterios.compreensao}</p>
              </div>
              <div className="text-center p-4 bg-green-50 dark:bg-green-900/20 rounded-xl">
                <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">Argumentação</p>
                <p className="text-2xl font-bold text-green-600">{resultado.criterios.argumentacao}</p>
              </div>
              <div className="text-center p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-xl">
                <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">Estrutura</p>
                <p className="text-2xl font-bold text-yellow-600">{resultado.criterios.estrutura}</p>
              </div>
              <div className="text-center p-4 bg-orange-50 dark:bg-orange-900/20 rounded-xl">
                <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">Conhecimento</p>
                <p className="text-2xl font-bold text-orange-600">{resultado.criterios.conhecimento}</p>
              </div>
            </div>

            {/* Estatísticas */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="text-center p-4 bg-slate-50 dark:bg-slate-700 rounded-xl">
                <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">Parágrafos</p>
                <p className="text-2xl font-bold">{resultado.paragraphCount}</p>
              </div>
              <div className="text-center p-4 bg-slate-50 dark:bg-slate-700 rounded-xl">
                <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">Linhas</p>
                <p className="text-2xl font-bold">{resultado.lines}</p>
              </div>
              <div className="text-center p-4 bg-slate-50 dark:bg-slate-700 rounded-xl">
                <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">Palavras</p>
                <p className="text-2xl font-bold">{resultado.wordCount}</p>
              </div>
            </div>

            {/* Feedback */}
            <div className="mb-6 p-6 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800">
              <h3 className="text-xl font-bold mb-4 text-blue-700 dark:text-blue-300">
                Feedback Geral
              </h3>
              <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                {resultado.feedback}
              </p>
            </div>

            {/* Dicas de Melhoria */}
            {resultado.dicas && resultado.dicas.length > 0 && (
              <div className="mb-6 p-6 bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-200 dark:border-green-800">
                <h3 className="text-xl font-bold mb-4 text-green-700 dark:text-green-300 flex items-center gap-2">
                  <SparklesIcon className="h-6 w-6" />
                  Dicas de Melhoria
                </h3>
                <ul className="space-y-2">
                  {resultado.dicas.map((dica, index) => (
                    <li key={index} className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
                      <span className="text-green-600 dark:text-green-400 font-bold mt-0.5">•</span>
                      <span>{dica}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Botões */}
            <div className="flex gap-4">
              <button
                onClick={handleNewTheme}
                className="flex-1 bg-alego-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-alego-700 flex items-center justify-center gap-2"
              >
                Novo Tema
              </button>
              <button
                onClick={() => {
                  setResultado(null)
                  setRedacaoTexto('')
                  setTimeLeft(3600)
                  setIsRunning(false)
                }}
                className="flex-1 bg-slate-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-slate-700 flex items-center justify-center gap-2"
              >
                Treinar Novamente
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen py-4">
      <div className="max-w-4xl mx-auto px-4">
        {/* Header com timer */}
        <div className={`rounded-xl p-4 mb-4 ${darkMode ? 'bg-slate-800' : 'bg-white'} shadow-lg`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <ClockIcon className={`h-5 w-5 ${timeLeft < 600 ? 'text-red-500' : 'text-alego-600'}`} />
              <span className={`font-bold text-lg ${timeLeft < 600 ? 'text-red-500' : ''}`}>
                {formatTime(timeLeft)}
              </span>
            </div>
            <button
              onClick={() => setIsRunning(!isRunning)}
              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
            >
              {isRunning ? <PauseIcon className="h-5 w-5" /> : <PlayIcon className="h-5 w-5" />}
            </button>
          </div>
          <div className="flex items-center justify-between text-sm text-slate-600 dark:text-slate-400 mt-2">
            <span>{charCount} caracteres</span>
            <span>{wordCount} palavras</span>
            <span>{paragraphCount} parágrafos</span>
            <span>{lines} linhas</span>
          </div>
        </div>

        {/* Tema da redação */}
        <div className={`rounded-xl p-6 mb-4 ${darkMode ? 'bg-slate-800' : 'bg-white'} shadow-lg border-2 border-alego-600`}>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xl font-bold text-alego-600">Tema da Redação</h2>
            <button
              onClick={generateTheme}
              disabled={loading}
              className="text-sm px-3 py-1 bg-alego-600 text-white rounded-lg hover:bg-alego-700 disabled:opacity-50"
            >
              {loading ? 'Gerando...' : 'Novo Tema'}
            </button>
          </div>
          <p className="text-lg font-medium text-slate-700 dark:text-slate-300">
            {loading ? 'Gerando tema...' : (redacaoTema || 'Carregando tema...')}
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
            Escreva uma dissertação argumentativa de 25 a 30 linhas sobre o tema proposto.
          </p>
          <p className="text-sm text-alego-600 dark:text-alego-400 mt-2 font-semibold">
            💡 Dica: Use 4 espaços no início de uma linha para criar um parágrafo.
          </p>
        </div>

        {/* Editor de redação */}
        <div className={`rounded-xl p-6 mb-4 ${darkMode ? 'bg-slate-800' : 'bg-white'} shadow-lg`}>
          <div className="flex items-center justify-between mb-3">
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
              Sua Redação
            </label>
            <button
              type="button"
              onClick={() => {
                const textarea = textareaRef.current
                if (!textarea) return
                const start = textarea.selectionStart
                const end = textarea.selectionEnd
                const textBefore = redacaoTexto.substring(0, start)
                const textAfter = redacaoTexto.substring(end)
                const newText = textBefore + '\n' + textAfter
                setRedacaoTexto(newText)
                setTimeout(() => {
                  const newPosition = start + 1
                  textarea.focus()
                  textarea.setSelectionRange(newPosition, newPosition)
                }, 0)
              }}
              disabled={analizing || timeLeft === 0}
              className="flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Inserir quebra de linha"
            >
              <ArrowDownIcon className="h-4 w-4" />
              Quebra de Linha
            </button>
          </div>
          <textarea
            ref={textareaRef}
            value={redacaoTexto}
            onChange={(e) => setRedacaoTexto(e.target.value)}
            placeholder="Comece a escrever sua redação aqui...

Lembre-se: use 4 espaços no início de uma linha para criar um parágrafo.

    Exemplo: Este é um parágrafo porque começa com 4 espaços."
            className="w-full h-96 p-4 rounded-lg border-2 border-slate-300 dark:border-slate-600 focus:border-alego-500 focus:outline-none bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-base leading-relaxed resize-none font-serif font-mono"
            disabled={analizing || timeLeft === 0}
            style={{
              tabSize: 4,
            }}
          />
          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="text-slate-500 dark:text-slate-400">
              Mínimo recomendado: 25 linhas | Parágrafos: {paragraphCount}
            </span>
            <span className={`font-semibold ${wordCount < 200 ? 'text-orange-500' : wordCount > 500 ? 'text-blue-500' : 'text-green-500'}`}>
              {wordCount >= 200 && wordCount <= 500 ? '✓ Tamanho adequado' : wordCount < 200 ? '⚠ Muito curta' : '⚠ Muito longa'}
            </span>
          </div>
        </div>

        {/* Botões */}
        <div className="flex gap-4">
          <button
            onClick={handleFinish}
            disabled={analizing || !redacaoTexto.trim()}
            className="flex-1 bg-green-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {analizing ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                Analisando redação...
              </>
            ) : (
              <>
                <TrophyIcon className="h-5 w-5" />
                Finalizar e Ver Resultado
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

export default TreinoRedacao

