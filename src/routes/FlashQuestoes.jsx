import { useEffect, useMemo, useState } from 'react'
import { collection, doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { db } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'
import { useDarkMode } from '../hooks/useDarkMode.jsx'
import { FolderIcon, ChevronRightIcon, ChevronDownIcon, LightBulbIcon, CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline'

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

const FlashQuestoes = () => {
  const { user } = useAuth()
  const { darkMode } = useDarkMode()
  const [cards, setCards] = useState([])
  const [selectedMateria, setSelectedMateria] = useState(null)
  const [selectedModulo, setSelectedModulo] = useState(null)
  const [expandedMaterias, setExpandedMaterias] = useState({})
  const [questions, setQuestions] = useState([])
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [selectedAnswer, setSelectedAnswer] = useState(null)
  const [showResult, setShowResult] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [stats, setStats] = useState({ correct: 0, wrong: 0, byMateria: {} })
  const [showBizu, setShowBizu] = useState({})
  const [bizuLoading, setBizuLoading] = useState({})
  const [bizuText, setBizuText] = useState({})
  const [editalPrompt, setEditalPrompt] = useState('')
  const [questoesConfigPrompt, setQuestoesConfigPrompt] = useState('')
  const [bizuConfigPrompt, setBizuConfigPrompt] = useState('')

  // Carregar flashcards para obter módulos
  useEffect(() => {
    const cardsRef = collection(db, 'flashcards')
    const unsub = onSnapshot(cardsRef, (snapshot) => {
      const data = snapshot.docs.map((docSnapshot) => ({
        id: docSnapshot.id,
        ...docSnapshot.data(),
      }))
      setCards(data)
    })
    return () => unsub()
  }, [])

  // Carregar edital/PDF
  useEffect(() => {
    const fetchPrompt = async () => {
      try {
        const promptDoc = await getDoc(doc(db, 'config', 'edital'))
        if (promptDoc.exists()) {
          const data = promptDoc.data()
          let combinedText = ''
          if (data.prompt || data.content) {
            combinedText += data.prompt || data.content || ''
          }
          if (data.pdfText) {
            if (combinedText) combinedText += '\n\n'
            const totalLength = data.pdfText.length
            if (totalLength <= 20000) {
              combinedText += data.pdfText
            } else {
              const inicio = data.pdfText.substring(0, 15000)
              const fim = data.pdfText.substring(totalLength - 5000)
              combinedText += `${inicio}\n\n[... conteúdo intermediário omitido ...]\n\n${fim}`
            }
          }
          setEditalPrompt(combinedText)
        }
      } catch (err) {
        console.error('Erro ao carregar edital:', err)
      }
    }
    fetchPrompt()
  }, [])

  // Carregar configurações de questões e BIZUs
  useEffect(() => {
    const fetchQuestoesConfig = async () => {
      try {
        const questoesDoc = await getDoc(doc(db, 'config', 'questoes'))
        if (questoesDoc.exists()) {
          const data = questoesDoc.data()
          setQuestoesConfigPrompt(data.prompt || '')
          setBizuConfigPrompt(data.bizuPrompt || '')
        }
      } catch (err) {
        console.error('Erro ao carregar configuração de questões:', err)
      }
    }
    fetchQuestoesConfig()
  }, [])

  // Carregar estatísticas do usuário
  useEffect(() => {
    if (!user) return
    const statsRef = doc(db, 'questoesStats', user.uid)
    const unsub = onSnapshot(statsRef, (snapshot) => {
      if (snapshot.exists()) {
        setStats(snapshot.data())
      }
    })
    return () => unsub()
  }, [user])

  // Organizar módulos por matéria
  const organizedModules = useMemo(() => {
    const modulesByMateria = {}
    cards.forEach((card) => {
      if (card.materia && card.modulo) {
        if (!modulesByMateria[card.materia]) {
          modulesByMateria[card.materia] = []
        }
        if (!modulesByMateria[card.materia].includes(card.modulo)) {
          modulesByMateria[card.materia].push(card.modulo)
        }
      }
    })

    // Ordenar módulos numericamente
    Object.keys(modulesByMateria).forEach((materia) => {
      modulesByMateria[materia].sort((a, b) => {
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
    })

    return modulesByMateria
  }, [cards])

  // Função para chamar Groq API
  const callGroqAPI = async (prompt) => {
    const groqApiKey = import.meta.env.VITE_GROQ_API_KEY
    if (!groqApiKey) {
      throw new Error('VITE_GROQ_API_KEY não configurada')
    }

    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${groqApiKey}`,
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [
            {
              role: 'system',
              content: 'Você é um especialista em criar questões de concursos públicos no estilo FGV.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: 0.7,
          max_tokens: 4000,
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

  // Gerar questões com IA
  const generateQuestions = async () => {
    if (!selectedMateria || !selectedModulo) {
      alert('Selecione uma matéria e um módulo primeiro!')
      return
    }

    setGenerating(true)
    setQuestions([])
    setCurrentQuestionIndex(0)
    setSelectedAnswer(null)
    setShowResult(false)

    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY
      const groqApiKey = import.meta.env.VITE_GROQ_API_KEY

      if (!apiKey && !groqApiKey) {
        throw new Error('Configure VITE_GEMINI_API_KEY ou VITE_GROQ_API_KEY no .env')
      }

      // Usar prompt configurado pelo admin ou prompt padrão
      const basePrompt = questoesConfigPrompt.trim() || `Você é um especialista em criar questões de concursos públicos no estilo FGV para o cargo de Policial Legislativo da ALEGO.

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
- Alternativas com linguagem formal e técnica quando apropriado`

      const prompt = `${basePrompt}

${editalPrompt ? `CONTEXTO DO EDITAL:\n${editalPrompt}\n\n` : ''}

TAREFA: Criar 10 questões FICTÍCIAS de múltipla escolha no estilo FGV para a matéria "${selectedMateria}" no módulo "${selectedModulo}".

IMPORTANTE:
- As questões são FICTÍCIAS (não são questões reais de provas anteriores)
- Baseie-se no conteúdo do edital e no módulo especificado

FORMATO DE RESPOSTA (OBRIGATÓRIO - APENAS JSON):
Retorne APENAS um objeto JSON válido no seguinte formato:

{
  "questoes": [
    {
      "enunciado": "Texto completo da questão",
      "alternativas": {
        "A": "Texto da alternativa A",
        "B": "Texto da alternativa B",
        "C": "Texto da alternativa C",
        "D": "Texto da alternativa D",
        "E": "Texto da alternativa E"
      },
      "correta": "A",
      "justificativa": "Explicação breve de por que a alternativa correta está certa"
    }
  ]
}

CRÍTICO: 
- Retorne APENAS o JSON, sem markdown (sem \`\`\`json)
- Sem explicações antes ou depois
- Sem texto adicional
- Apenas o objeto JSON puro começando com { e terminando com }`

      let aiResponse = ''

      // Tentar Gemini primeiro
      if (apiKey) {
        try {
          const genAI = new GoogleGenerativeAI(apiKey)
          const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' })
          const result = await model.generateContent(prompt)
          aiResponse = result.response.text()
        } catch (geminiErr) {
          const errorMessage = geminiErr.message || String(geminiErr) || ''
          const isQuotaError = errorMessage.includes('429') || errorMessage.includes('quota') || errorMessage.includes('Quota exceeded')
          
          if (isQuotaError && groqApiKey) {
            console.warn('⚠️ Erro de quota no Gemini. Usando Groq como fallback...')
            aiResponse = await callGroqAPI(prompt)
          } else {
            throw geminiErr
          }
        }
      } else if (groqApiKey) {
        aiResponse = await callGroqAPI(prompt)
      }

      // Extrair JSON da resposta
      let jsonText = aiResponse.trim()
      
      // Remover markdown se houver
      if (jsonText.includes('```json')) {
        jsonText = jsonText.split('```json')[1].split('```')[0].trim()
      } else if (jsonText.includes('```')) {
        jsonText = jsonText.split('```')[1].split('```')[0].trim()
      }

      // Remover texto antes do primeiro { e depois do último }
      const firstBrace = jsonText.indexOf('{')
      const lastBrace = jsonText.lastIndexOf('}')
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        jsonText = jsonText.substring(firstBrace)
        jsonText = jsonText.substring(0, lastBrace + 1)
      }

      const parsedData = JSON.parse(jsonText)
      
      if (!parsedData.questoes || !Array.isArray(parsedData.questoes)) {
        throw new Error('Formato de resposta inválido: esperado array "questoes"')
      }

      setQuestions(parsedData.questoes)
    } catch (err) {
      console.error('Erro ao gerar questões:', err)
      alert(`Erro ao gerar questões: ${err.message}`)
    } finally {
      setGenerating(false)
    }
  }

  // Responder questão
  const handleAnswer = (answer) => {
    if (showResult) return
    
    setSelectedAnswer(answer)
    setShowResult(true)

    const currentQuestion = questions[currentQuestionIndex]
    const isCorrect = answer === currentQuestion.correta

    // Atualizar estatísticas
    const newStats = { ...stats }
    newStats.correct = (newStats.correct || 0) + (isCorrect ? 1 : 0)
    newStats.wrong = (newStats.wrong || 0) + (isCorrect ? 0 : 1)
    
    if (!newStats.byMateria[selectedMateria]) {
      newStats.byMateria[selectedMateria] = { correct: 0, wrong: 0 }
    }
    newStats.byMateria[selectedMateria].correct += isCorrect ? 1 : 0
    newStats.byMateria[selectedMateria].wrong += isCorrect ? 0 : 1

    setStats(newStats)

    // Salvar no Firestore
    if (user) {
      const statsRef = doc(db, 'questoesStats', user.uid)
      setDoc(statsRef, newStats, { merge: true })
    }
  }

  // Próxima questão
  const nextQuestion = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1)
      setSelectedAnswer(null)
      setShowResult(false)
      setShowBizu({})
    }
  }

  // Gerar BIZU (explicação) da questão
  const generateBizu = async (questionIndex) => {
    const question = questions[questionIndex]
    if (!question) return

    setBizuLoading({ ...bizuLoading, [questionIndex]: true })
    setShowBizu({ ...showBizu, [questionIndex]: true })

    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY
      const groqApiKey = import.meta.env.VITE_GROQ_API_KEY

      // Usar prompt configurado pelo admin ou prompt padrão
      const baseBizuPrompt = bizuConfigPrompt.trim() || `Você é um professor especialista em concursos públicos.

REGRAS PARA OS BIZUs:
- Explique por que a alternativa correta está certa
- Explique por que as outras alternativas estão incorretas
- Dê dicas e macetes relacionados ao tema
- Seja objetivo mas completo (3-5 parágrafos)
- Use linguagem didática e acessível
- Inclua exemplos práticos quando fizer sentido
- Relacione com o contexto do cargo de Policial Legislativo
- Destaque pontos importantes que podem cair em prova
- Seja motivador e encorajador`

      const prompt = `${baseBizuPrompt}

Questão:
${question.enunciado}

Alternativas:
${Object.entries(question.alternativas).map(([letra, texto]) => `${letra}) ${texto}`).join('\n')}

Alternativa correta: ${question.correta}

${editalPrompt ? `\nContexto do edital:\n${editalPrompt}\n` : ''}

Forneça uma explicação didática e completa (BIZU) sobre esta questão seguindo as regras acima.`

      let explanation = ''

      if (apiKey) {
        try {
          const genAI = new GoogleGenerativeAI(apiKey)
          const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' })
          const result = await model.generateContent(prompt)
          explanation = result.response.text()
        } catch (geminiErr) {
          const errorMessage = geminiErr.message || String(geminiErr) || ''
          const isQuotaError = errorMessage.includes('429') || errorMessage.includes('quota')
          
          if (isQuotaError && groqApiKey) {
            explanation = await callGroqAPI(prompt)
          } else {
            throw geminiErr
          }
        }
      } else if (groqApiKey) {
        explanation = await callGroqAPI(prompt)
      }

      setBizuText({ ...bizuText, [questionIndex]: explanation })
    } catch (err) {
      console.error('Erro ao gerar BIZU:', err)
      setBizuText({ ...bizuText, [questionIndex]: `Erro ao gerar explicação: ${err.message}` })
    } finally {
      setBizuLoading({ ...bizuLoading, [questionIndex]: false })
    }
  }

  // Calcular déficit por matéria
  const deficitByMateria = useMemo(() => {
    const deficits = []
    Object.entries(stats.byMateria || {}).forEach(([materia, data]) => {
      const total = (data.correct || 0) + (data.wrong || 0)
      if (total > 0) {
        const accuracy = (data.correct || 0) / total
        if (accuracy < 0.7) { // Menos de 70% de acerto
          deficits.push({
            materia,
            accuracy: (accuracy * 100).toFixed(1),
            correct: data.correct || 0,
            wrong: data.wrong || 0,
            total,
          })
        }
      }
    })
    return deficits.sort((a, b) => parseFloat(a.accuracy) - parseFloat(b.accuracy))
  }, [stats])

  const toggleMateria = (materia) => {
    setExpandedMaterias((prev) => ({ ...prev, [materia]: !prev[materia] }))
  }

  const totalAnswered = (stats.correct || 0) + (stats.wrong || 0)
  const accuracy = totalAnswered > 0 ? ((stats.correct || 0) / totalAnswered * 100).toFixed(1) : 0

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-gradient-to-r from-alego-600 to-alego-500 p-6 text-white">
        <h1 className="text-2xl font-bold">FlashQuestões</h1>
        <p className="mt-2 text-sm text-alego-50">
          Pratique com questões fictícias geradas por IA no estilo FGV
        </p>
      </div>

      {/* Estatísticas */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl bg-white p-4 shadow-sm border border-slate-200">
          <p className="text-xs text-slate-500">Taxa de Acerto</p>
          <p className="text-2xl font-bold text-alego-600">{accuracy}%</p>
          <p className="text-xs text-slate-400 mt-1">
            {stats.correct || 0} acertos / {totalAnswered} questões
          </p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm border border-slate-200">
          <p className="text-xs text-slate-500">Acertos</p>
          <p className="text-2xl font-bold text-emerald-600">{stats.correct || 0}</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm border border-slate-200">
          <p className="text-xs text-slate-500">Erros</p>
          <p className="text-2xl font-bold text-rose-600">{stats.wrong || 0}</p>
        </div>
      </div>

      {/* Bot de Déficit */}
      {deficitByMateria.length > 0 && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-4">
          <p className="text-sm font-semibold text-amber-800 mb-2">⚠️ Matérias com Déficit:</p>
          <ul className="space-y-1">
            {deficitByMateria.map((item) => (
              <li key={item.materia} className="text-sm text-amber-700">
                • <strong>{item.materia}</strong>: {item.accuracy}% de acerto ({item.correct}/{item.total})
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Seleção de Módulo */}
      {questions.length === 0 && (
        <div className="rounded-2xl bg-white p-6 shadow-sm border border-slate-200">
          <h2 className="text-lg font-bold text-alego-700 mb-4">Selecione um Módulo</h2>
          <div className="space-y-3">
            {Object.entries(organizedModules).map(([materia, modulos]) => (
              <div key={materia} className="border border-slate-200 rounded-lg">
                <button
                  type="button"
                  onClick={() => toggleMateria(materia)}
                  className="w-full flex items-center justify-between p-3 hover:bg-slate-50"
                >
                  <span className="font-semibold text-alego-700">{materia}</span>
                  {expandedMaterias[materia] ? (
                    <ChevronDownIcon className="h-5 w-5" />
                  ) : (
                    <ChevronRightIcon className="h-5 w-5" />
                  )}
                </button>
                {expandedMaterias[materia] && (
                  <div className="p-3 pt-0 space-y-2">
                    {modulos.map((modulo) => (
                      <button
                        key={modulo}
                        type="button"
                        onClick={() => {
                          setSelectedMateria(materia)
                          setSelectedModulo(modulo)
                        }}
                        className={`w-full text-left p-3 rounded-lg border transition ${
                          selectedMateria === materia && selectedModulo === modulo
                            ? 'bg-alego-100 border-alego-300 text-alego-700'
                            : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        <FolderIcon className="h-4 w-4 inline mr-2" />
                        {modulo}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {selectedMateria && selectedModulo && (
            <div className="mt-6">
              <button
                type="button"
                onClick={generateQuestions}
                disabled={generating}
                className="w-full rounded-full bg-gradient-to-r from-alego-600 to-alego-500 px-6 py-3 text-white font-semibold disabled:opacity-50 hover:from-alego-700 hover:to-alego-600 transition"
              >
                {generating ? 'Gerando questões...' : '✨ Gerar 10 Questões Fictícias'}
              </button>
              <p className="text-xs text-slate-500 text-center mt-2">
                ⚠️ As questões são fictícias e geradas por IA
              </p>
            </div>
          )}
        </div>
      )}

      {/* Questões */}
      {questions.length > 0 && (
        <div className="space-y-6">
          <div className="rounded-2xl bg-white p-6 shadow-sm border border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-slate-500">
                Questão {currentQuestionIndex + 1} de {questions.length}
              </p>
              <button
                type="button"
                onClick={() => {
                  setQuestions([])
                  setCurrentQuestionIndex(0)
                  setSelectedAnswer(null)
                  setShowResult(false)
                }}
                className="text-xs text-slate-500 hover:text-slate-700"
              >
                Voltar
              </button>
            </div>

            {questions[currentQuestionIndex] && (
              <div className="space-y-4">
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <p className="text-xs font-semibold text-amber-800">
                    ⚠️ Questão FICTÍCIA gerada por IA
                  </p>
                </div>

                <div>
                  <p className="text-lg font-semibold text-slate-800 mb-4">
                    {questions[currentQuestionIndex].enunciado}
                  </p>

                  <div className="space-y-2">
                    {Object.entries(questions[currentQuestionIndex].alternativas).map(([letra, texto]) => {
                      const isSelected = selectedAnswer === letra
                      const isCorrect = letra === questions[currentQuestionIndex].correta
                      const showCorrect = showResult && isCorrect
                      const showWrong = showResult && isSelected && !isCorrect

                      return (
                        <button
                          key={letra}
                          type="button"
                          onClick={() => handleAnswer(letra)}
                          disabled={showResult}
                          className={`w-full text-left p-4 rounded-lg border-2 transition ${
                            showCorrect
                              ? 'bg-emerald-50 border-emerald-500'
                              : showWrong
                              ? 'bg-rose-50 border-rose-500'
                              : isSelected
                              ? 'bg-blue-50 border-blue-500'
                              : 'bg-white border-slate-200 hover:border-alego-300'
                          } ${showResult ? 'cursor-default' : 'cursor-pointer'}`}
                        >
                          <div className="flex items-start gap-3">
                            <span className="font-bold text-alego-600">{letra})</span>
                            <span className="flex-1">{texto}</span>
                            {showCorrect && <CheckCircleIcon className="h-5 w-5 text-emerald-600 flex-shrink-0" />}
                            {showWrong && <XCircleIcon className="h-5 w-5 text-rose-600 flex-shrink-0" />}
                          </div>
                        </button>
                      )
                    })}
                  </div>

                  {showResult && (
                    <div className="mt-4 space-y-3">
                      <div className="bg-slate-50 rounded-lg p-4">
                        <p className="text-sm font-semibold text-slate-700 mb-2">Justificativa:</p>
                        <p className="text-sm text-slate-600">
                          {questions[currentQuestionIndex].justificativa}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          if (!showBizu[currentQuestionIndex]) {
                            generateBizu(currentQuestionIndex)
                          } else {
                            setShowBizu({ ...showBizu, [currentQuestionIndex]: !showBizu[currentQuestionIndex] })
                          }
                        }}
                        className="flex items-center gap-2 px-4 py-2 bg-alego-600 text-white rounded-lg hover:bg-alego-700 transition"
                      >
                        <LightBulbIcon className="h-5 w-5" />
                        {showBizu[currentQuestionIndex] && bizuText[currentQuestionIndex] ? 'Ocultar BIZU' : 'BIZU'}
                      </button>

                      {showBizu[currentQuestionIndex] && (
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                          {bizuLoading[currentQuestionIndex] ? (
                            <p className="text-sm text-blue-700">Gerando BIZU...</p>
                          ) : bizuText[currentQuestionIndex] ? (
                            <div>
                              <p className="text-sm font-semibold text-blue-800 mb-2">💡 BIZU:</p>
                              <p className="text-sm text-blue-700 whitespace-pre-wrap">
                                {bizuText[currentQuestionIndex]}
                              </p>
                            </div>
                          ) : (
                            <p className="text-sm text-blue-700">Carregando...</p>
                          )}
                        </div>
                      )}

                      {currentQuestionIndex < questions.length - 1 && (
                        <button
                          type="button"
                          onClick={nextQuestion}
                          className="w-full rounded-full bg-gradient-to-r from-alego-600 to-alego-500 px-6 py-3 text-white font-semibold hover:from-alego-700 hover:to-alego-600 transition"
                        >
                          Próxima Questão →
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default FlashQuestoes

