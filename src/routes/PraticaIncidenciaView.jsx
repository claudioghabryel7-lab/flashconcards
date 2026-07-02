import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { doc, getDoc, setDoc, deleteDoc, serverTimestamp, getDocs, collection, query, where, orderBy } from 'firebase/firestore'
import { ArrowLeftIcon, FireIcon, CheckCircleIcon, XCircleIcon, ChartBarIcon, TrashIcon } from '@heroicons/react/24/outline'
import { db } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'
import { useDarkMode } from '../hooks/useDarkMode.jsx'
import { callGeminiWithRetry, extractGeneratedText } from '../utils/geminiApi'

const PraticaIncidenciaView = () => {
  const { courseId, disciplinaIdx } = useParams()
  const navigate = useNavigate()
  const { user, profile } = useAuth()
  const { darkMode } = useDarkMode()
  
  const [loading, setLoading] = useState(true)
  const [editalVerticalizado, setEditalVerticalizado] = useState(null)
  const [courseName, setCourseName] = useState('')
  const [conteudoIncidencia, setConteudoIncidencia] = useState(null)
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState('')
  const [questoes, setQuestoes] = useState(null)
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [selectedAnswer, setSelectedAnswer] = useState(null)
  const [showResult, setShowResult] = useState(false)
  const [answers, setAnswers] = useState([])
  const [error, setError] = useState('')
  const [desempenho, setDesempenho] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [nivelAtual, setNivelAtual] = useState(1)
  const [niveisDisponiveis, setNiveisDisponiveis] = useState([])
  const [mostrarSeletorNiveis, setMostrarSeletorNiveis] = useState(false)
  const [historicoNiveis, setHistoricoNiveis] = useState([])

  const disciplinaIndex = parseInt(disciplinaIdx)

  useEffect(() => {
    const loadData = async () => {
      if (!courseId || disciplinaIdx === undefined) {
        setError('Parâmetros inválidos')
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        setError('')

        // Carregar nome do curso
        const courseRef = doc(db, 'courses', courseId)
        const courseDoc = await getDoc(courseRef)
        if (courseDoc.exists()) {
          const data = courseDoc.data()
          setCourseName(data.name || data.competition || 'Curso Preparatório')
        }

        // Carregar edital verticalizado
        const editalRef = doc(db, 'courses', courseId, 'editalVerticalizado', 'principal')
        const editalDoc = await getDoc(editalRef)
        
        if (!editalDoc.exists()) {
          setError('Edital verticalizado não encontrado')
          setLoading(false)
          return
        }

        const editalData = editalDoc.data()
        
        // Verificar se o edital está dividido em partes
        if (editalData.temPartes && editalData.totalPartes > 1) {
          const partesRef = collection(db, 'courses', courseId, 'editalVerticalizado', 'principal', 'partes')
          const partesSnapshot = await getDocs(query(partesRef, orderBy('parte')))

          const todasDisciplinas = [...(editalData.disciplinas || [])]
          partesSnapshot.forEach((doc) => {
            const parteData = doc.data()
            if (parteData.disciplinas && Array.isArray(parteData.disciplinas)) {
              todasDisciplinas.push(...parteData.disciplinas)
            }
          })

          setEditalVerticalizado({
            ...editalData,
            disciplinas: todasDisciplinas,
          })
        } else {
          setEditalVerticalizado(editalData)
        }

        // Carregar conteúdo de incidência
        const disciplinas = editalData.temPartes && editalData.totalPartes > 1 
          ? [...(editalData.disciplinas || []), ...todasDisciplinas.slice(editalData.disciplinas?.length || 0)]
          : editalData.disciplinas
        
        const disciplina = disciplinas[disciplinaIndex]
        let sanitizedDisciplinaNome = ''
        
        if (disciplina?.nome) {
          sanitizedDisciplinaNome = disciplina.nome
            .replace(/[^a-zA-Z0-9]/g, '_')
            .substring(0, 100)

          const incidenciaRef = doc(db, 'courses', courseId, 'conteudosIncidencia', sanitizedDisciplinaNome)
          const incidenciaDoc = await getDoc(incidenciaRef)
          if (incidenciaDoc.exists()) {
            setConteudoIncidencia(incidenciaDoc.data())
          } else {
            setError('Conteúdo de incidência não encontrado. Gere o conteúdo de incidência primeiro.')
            setLoading(false)
            return
          }
        }

        // Carregar questões existentes do nível atual
        if (sanitizedDisciplinaNome) {
          const questoesRef = doc(db, 'courses', courseId, 'questoesIncidencia', `${sanitizedDisciplinaNome}_nivel_${nivelAtual}`)
          const questoesDoc = await getDoc(questoesRef)
          if (questoesDoc.exists()) {
            setQuestoes(questoesDoc.data())
          }
        }

        // Carregar desempenho do usuário
        if (user && sanitizedDisciplinaNome) {
          const desempenhoRef = doc(db, 'users', user.uid, 'desempenhoIncidencia', sanitizedDisciplinaNome)
          const desempenhoDoc = await getDoc(desempenhoRef)
          if (desempenhoDoc.exists()) {
            const desempenhoData = desempenhoDoc.data()
            setDesempenho(desempenhoData)
            setNivelAtual(desempenhoData.nivel || 1)
          }
        }

        // Verificar quais níveis estão disponíveis
        if (sanitizedDisciplinaNome) {
          const niveisDisponiveis = []
          for (let i = 1; i <= 10; i++) {
            const nivelDocRef = doc(db, 'courses', courseId, 'questoesIncidencia', `${sanitizedDisciplinaNome}_nivel_${i}`)
            const nivelDoc = await getDoc(nivelDocRef)
            if (nivelDoc.exists()) {
              niveisDisponiveis.push(i)
            }
          }
          setNiveisDisponiveis(niveisDisponiveis)
        }

        // Carregar histórico de desempenho por nível
        if (user && sanitizedDisciplinaNome) {
          const historico = []
          for (let i = 1; i <= 10; i++) {
            const desempenhoNivelRef = doc(db, 'users', user.uid, 'desempenhoIncidencia', `${sanitizedDisciplinaNome}_nivel_${i}`)
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

        setLoading(false)
      } catch (err) {
        console.error('Erro ao carregar dados:', err)
        setError('Erro ao carregar dados: ' + (err.message || 'Erro desconhecido'))
        setLoading(false)
      }
    }

    loadData()
  }, [courseId, disciplinaIdx, user])

  const handleGenerateQuestoes = async () => {
    if (!courseId || !conteudoIncidencia) return

    const apiKey = import.meta.env.VITE_GEMINI_API_KEY
    if (!apiKey) {
      setStatus('❌ API Key não configurada.')
      return
    }

    try {
      setGenerating(true)
      setProgress(5)
      setStatus('Preparando questões baseadas em incidência...')

      // Carregar dados do curso
      const courseRef = doc(db, 'courses', courseId)
      const courseDoc = await getDoc(courseRef)
      const courseData = courseDoc.exists() ? courseDoc.data() : {}
      const banca = courseData.banca || ''
      const cargo = courseData.cargo || courseData.competition || ''

      setProgress(20)
      setStatus('Gerando questões com IA...')

      // Determinar tipo de prova baseado na banca
      const bancasCertoErrado = ['CESPE', 'CEBRASPE', 'FCC', 'VUNESP', 'FGV', 'IBFC', 'AOCP', 'CONSULPAM', 'FUNRIO', 'NUCEPE', 'QUADRIX', 'IDECAN']
      const tipoProva = bancasCertoErrado.some(b => banca.toUpperCase().includes(b)) ? 'Certo/Errado' : 'Múltipla Escolha'

      // Preparar conteúdo de incidência para a IA
      const topAssuntos = conteudoIncidencia.topAssuntosGerais || []
      const analisePorTopico = conteudoIncidencia.analisePorTopico || []

      // Prompt para gerar questões
      const prompt = `Você é um especialista em criar questões de concurso público baseadas em análise de incidência.

CONTEXTO:
- CURSO: ${courseName || 'Curso Preparatório'}
- CARGO: ${cargo || 'NÃO DEFINIDO'}
- BANCA EXAMINADORA: ${banca || 'NÃO DEFINIDA'}
- TIPO DE PROVA: ${tipoProva}
- DISCIPLINA: ${conteudoIncidencia.disciplina || 'Disciplina'}
- NÍVEL DE PRÁTICA: ${nivelAtual} (de 1 a 10, onde 1 é básico e 10 é avançado)

ASSUNTOS COM MAIOR INCIDÊNCIA (Top Gerais):
${topAssuntos.map((a, i) => `${i + 1}. ${a.assunto} - ${a.probabilidade}% de chance\n   Revisão: ${a.revisao}`).join('\n\n')}

ANÁLISE POR TÓPICO:
${analisePorTopico.map(t => 
  `Tópico: ${t.topicoNumero} - ${t.topicoNome}\n` + 
  t.assuntos?.sort((a, b) => b.probabilidade - a.probabilidade)
    .map((a, i) => `  ${i + 1}. ${a.assunto} - ${a.probabilidade}%\n     Revisão: ${a.revisao}`)
    .join('\n')
).join('\n\n')}

INSTRUÇÕES SOBRE DIFICULDADE POR NÍVEL:
- Nível ${nivelAtual}: ${nivelAtual === 1 ? 'Questões básicas e diretas, foco em conceitos fundamentais' : nivelAtual <= 3 ? 'Questões de nível fácil a médio, com aplicação de conceitos básicos' : nivelAtual <= 6 ? 'Questões de nível médio, exigindo análise e interpretação' : nivelAtual <= 8 ? 'Questões de nível avançado, com casos complexos e detalhados' : 'Questões de nível especialista, com nuances jurídicas profundas e casos excepcionais'}
- Aumente progressivamente a dificuldade conforme o nível
- Nos níveis mais altos, inclua casos práticos, jurisprudência recente e questões de concursos anteriores

TAREFA:
Gere EXATAMENTE 50 questões de ${tipoProva} baseadas nos assuntos com maior probabilidade de incidência.

INSTRUÇÕES CRÍTICAS - DISTRIBUIÇÃO DE QUESTÕES POR PROBABILIDADE:
- Assuntos com probabilidade ALTA (80-100%): 20-25 questões (40-50% do total)
- Assuntos com probabilidade MÉDIA (50-70%): 15-20 questões (30-40% do total)
- Assuntos com probabilidade BAIXA (10-40%): 5-10 questões (10-20% do total)
- QUANTO MAIOR A PROBABILIDADE, MAIS QUESTÕES
- QUANTO MENOR A PROBABILIDADE, MENOS QUESTÕES

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
3. Ordene as questões pela probabilidade do assunto (maior para menor)
4. Adapte o nível de dificuldade ao cargo ${cargo || 'NÃO DEFINIDO'}
5. Gere EXATAMENTE 50 questões (nem mais, nem menos)

ESTRUTURA DO JSON:
{
  "disciplina": "${conteudoIncidencia.disciplina || 'Disciplina'}",
  "banca": "${banca || 'NÃO DEFINIDA'}",
  "cargo": "${cargo || 'NÃO DEFINIDO'}",
  "curso": "${courseName || 'Curso Preparatório'}",
  "tipoProva": "${tipoProva}",
  "nivel": ${nivelAtual},
  "questoes": [
    {
      "numero": 1,
      "assunto": "nome do assunto",
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

REGRAS IMPORTANTES:
- Use probabilidades reais baseadas no conteúdo de incidência
- Adapte o estilo ao da banca ${banca || 'NÃO DEFINIDA'}
- Distribua as questões conforme a probabilidade (mais questões para alta incidência)
- Seja específico e técnico nas questões
- Para disciplinas jurídicas: cite leis, artigos e jurisprudência
- Para disciplinas não jurídicas: foque em conceitos e aplicações práticas
- DATA ATUAL: ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
- Use apenas informações atualizadas até esta data
- GERE EXATAMENTE 50 QUESTÕES

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

⚠️ REGRAS CRÍTICAS PARA JSON VÁLIDO:
- NÃO use aspas duplas (") dentro das strings de alternativas ou enunciados. Use aspas simples (')
- NÃO use quebras de linha (\n) dentro das strings. Use espaço normal
- NÃO use caracteres especiais que possam quebrar o JSON (como \, /, etc)
- O JSON deve ser 100% válido e parseável

Retorne APENAS o JSON válido, sem texto adicional.`

      setProgress(50)
      setStatus('A IA está gerando as questões...')

      // Chamar API da IA
      const response = await callGeminiWithRetry(prompt, {
        models: ['gemini-2.5-flash', 'gemini-2.5-pro'],
        generationConfig: { temperature: 0.7, maxOutputTokens: 32000 },
        useGoogleSearch: true,
      })

      setProgress(75)
      setStatus('Processando questões...')

      const aiText = extractGeneratedText(response)

      let jsonText = aiText
      if (jsonText.startsWith('```json')) {
        jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/```\n?/g, '').trim()
      }
      const jsonMatch = jsonText.match(/\{[\s\S]*\}/)
      if (jsonMatch) jsonText = jsonMatch[0]

      const parsed = JSON.parse(jsonText)

      setProgress(90)
      setStatus('Salvando questões...')

      // Salvar no Firestore (compartilhado para todos, por nível)
      const disciplina = editalVerticalizado?.disciplinas[disciplinaIndex]
      const sanitizedDisciplinaNome = disciplina?.nome
        .replace(/[^a-zA-Z0-9]/g, '_')
        .substring(0, 100)

      const docId = `${sanitizedDisciplinaNome}_nivel_${nivelAtual}`

      const questoesRef = doc(db, 'courses', courseId, 'questoesIncidencia', docId)
      
      try {
        await setDoc(questoesRef, {
          ...parsed,
          disciplinaIdx: disciplinaIndex,
          nivel: nivelAtual,
          updatedAt: serverTimestamp(),
          generatedAt: serverTimestamp(),
        }, { merge: true })
      } catch (saveError) {
        console.error('Erro ao salvar questões:', saveError)
        if (saveError.message?.includes('Missing or insufficient permissions')) {
          throw new Error('Erro de permissão ao salvar questões. Verifique as regras do Firebase.')
        }
        throw saveError
      }

      setQuestoes(parsed)
      setProgress(100)
      setStatus('✅ Questões geradas com sucesso!')

    } catch (error) {
      console.error('Erro ao gerar questões:', error)
      setStatus(`❌ Erro: ${error.message || 'Erro desconhecido'}`)
    } finally {
      setGenerating(false)
      setTimeout(() => setProgress(0), 800)
    }
  }

  const handleAnswer = (answer) => {
    if (showResult) return
    
    setSelectedAnswer(answer)
    setShowResult(true)
    
    const currentQuestion = questoes?.questoes[currentQuestionIndex]
    const isCorrect = answer === currentQuestion?.respostaCorreta
    
    setAnswers([...answers, {
      questionIndex: currentQuestionIndex,
      selectedAnswer: answer,
      correctAnswer: currentQuestion?.respostaCorreta,
      isCorrect,
      assunto: currentQuestion?.assunto,
      probabilidade: currentQuestion?.probabilidade
    }])
  }

  const handleNextQuestion = () => {
    if (currentQuestionIndex < (questoes?.questoes?.length - 1)) {
      setCurrentQuestionIndex(currentQuestionIndex + 1)
      setSelectedAnswer(null)
      setShowResult(false)
    } else {
      // Finalizar e calcular desempenho
      calcularDesempenho()
    }
  }

  const calcularDesempenho = () => {
    const totalQuestoes = answers.length
    const acertos = answers.filter(a => a.isCorrect).length
    const aproveitamento = Math.round((acertos / totalQuestoes) * 100)
    
    // Calcular o que precisa revisar (errou em assuntos com alta probabilidade)
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
      disciplinaIdx,
      nivel: nivelAtual,
      completouNivel,
      proximoNivel,
      updatedAt: serverTimestamp()
    }
    
    setDesempenho(desempenhoData)
    
    // Salvar desempenho individual do usuário
    if (user) {
      const disciplina = editalVerticalizado?.disciplinas[disciplinaIndex]
      const sanitizedDisciplinaNome = disciplina?.nome
        .replace(/[^a-zA-Z0-9]/g, '_')
        .substring(0, 100)
      
      // Salvar desempenho geral da disciplina (para saber o nível atual)
      const desempenhoRef = doc(db, 'users', user.uid, 'desempenhoIncidencia', sanitizedDisciplinaNome)
      setDoc(desempenhoRef, desempenhoData, { merge: true })
      
      // Salvar desempenho específico do nível
      const desempenhoNivelRef = doc(db, 'users', user.uid, 'desempenhoIncidencia', `${sanitizedDisciplinaNome}_nivel_${nivelAtual}`)
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
    if (!courseId || !editalVerticalizado?.disciplinas) return

    if (!window.confirm('Tem certeza que deseja apagar as questões geradas desta disciplina?')) {
      return
    }

    try {
      setDeleting(true)
      setStatus('Apagando questões...')

      const disciplina = editalVerticalizado.disciplinas[disciplinaIndex]
      const sanitizedDisciplinaNome = disciplina?.nome
        .replace(/[^a-zA-Z0-9]/g, '_')
        .substring(0, 100)

      // Apagar todos os níveis
      for (let i = 1; i <= 10; i++) {
        const questoesRef = doc(db, 'courses', courseId, 'questoesIncidencia', `${sanitizedDisciplinaNome}_nivel_${i}`)
        await deleteDoc(questoesRef)
      }

      setQuestoes(null)
      setNivelAtual(1)
      setStatus('')
      setProgress(0)
    } catch (error) {
      console.error('Erro ao apagar questões:', error)
      setStatus(`❌ Erro ao apagar: ${error.message || 'Erro desconhecido'}`)
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

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-alego-600 border-t-transparent"></div>
          <p className="mt-4 text-lg font-semibold text-alego-600">Carregando dados...</p>
        </div>
      </div>
    )
  }

  if (error || !conteudoIncidencia) {
    return (
      <div className="max-w-4xl mx-auto p-4">
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-8 text-center space-y-4">
          <h2 className="text-2xl font-bold text-red-600 dark:text-red-400">
            {error || 'Dados não encontrados'}
          </h2>
          <Link
            to={`/conteudo-incidencia/${courseId}/${disciplinaIdx}`}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-white rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 transition"
          >
            <ArrowLeftIcon className="w-5 h-5" />
            Voltar ao Conteúdo de Incidência
          </Link>
        </div>
      </div>
    )
  }

  const disciplina = editalVerticalizado?.disciplinas[disciplinaIndex]

  return (
    <div className="min-h-screen py-6">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6">
          <Link
            to={`/conteudo-incidencia/${courseId}/${disciplinaIdx}`}
            className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-alego-600 dark:hover:text-alego-400 mb-4"
          >
            <ArrowLeftIcon className="h-5 w-5" />
            Voltar ao Conteúdo de Incidência
          </Link>
          
          <div className="flex items-center gap-3">
            <div className="p-3 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl flex-shrink-0">
              <FireIcon className="h-8 w-8 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white break-words">
                Prática de Questões - Incidência
              </h1>
              <p className="text-slate-600 dark:text-slate-400 mt-1">
                Disciplina: <span className="font-semibold">{disciplina?.nome || 'Não encontrada'}</span>
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
                      📝 Questões Baseadas em Incidência - Nível {nivelAtual}
                    </h3>
                    <div className="text-sm text-green-800 dark:text-green-200 space-y-2">
                      <p>• As questões serão geradas baseadas nos assuntos com maior probabilidade de incidência</p>
                      <p>• Distribuição por probabilidade: Alta (40-50%), Média (30-40%), Baixa (10-20%)</p>
                      <p>• Estilo adaptado à banca examinadora</p>
                      <p>• 50 questões (Certo/Errado ou Múltipla Escolha, conforme a banca)</p>
                      <p>• Dificuldade: {nivelAtual === 1 ? 'Básica' : nivelAtual <= 3 ? 'Fácil a Média' : nivelAtual <= 6 ? 'Média' : nivelAtual <= 8 ? 'Avançada' : 'Especialista'}</p>
                    </div>
                  </div>

                  {/* Status da geração */}
                  {status && (
                    <div className="bg-gray-50 dark:bg-gray-900/20 border border-gray-200 dark:border-gray-800 rounded-lg p-4">
                      <p className="text-sm text-gray-800 dark:text-gray-200">
                        {status}
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
                    <div className="flex justify-end">
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
                  <div className="bg-gray-100 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
                    <div 
                      className="bg-gradient-to-r from-green-600 to-emerald-600 h-full transition-all duration-300"
                      style={{ width: `${((currentQuestionIndex + 1) / questoes.questoes.length) * 100}%` }}
                    />
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-400 text-center">
                    Questão {currentQuestionIndex + 1} de {questoes.questoes.length}
                  </p>

                  {/* Questão atual */}
                  {questoes.questoes[currentQuestionIndex] && (
                    <div className="space-y-4">
                      <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-semibold text-orange-900 dark:text-orange-100">
                            Assunto: {questoes.questoes[currentQuestionIndex].assunto}
                          </span>
                          <span className="px-3 py-1 bg-orange-600 text-white text-xs font-bold rounded-full">
                            {questoes.questoes[currentQuestionIndex].probabilidade}% de chance
                          </span>
                        </div>
                        <p className="text-slate-900 dark:text-white font-medium">
                          {questoes.questoes[currentQuestionIndex].enunciado}
                        </p>
                      </div>

                      {/* Alternativas - Certo/Errado ou Múltipla */}
                      {questoes.tipoProva === 'Certo/Errado' ? (
                        <div className="grid grid-cols-2 gap-4">
                          {['C', 'E'].map((key) => (
                            <button
                              key={key}
                              onClick={() => handleAnswer(key)}
                              disabled={showResult}
                              className={`text-center p-6 rounded-lg border-2 transition-all ${
                                showResult
                                  ? key === questoes.questoes[currentQuestionIndex].respostaCorreta
                                    ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                                    : key === selectedAnswer
                                      ? 'border-red-500 bg-red-50 dark:bg-red-900/20'
                                      : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-800 opacity-50'
                                  : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-800 hover:border-green-500 hover:bg-green-50 dark:hover:bg-green-900/20'
                              }`}
                            >
                              <div className="flex flex-col items-center gap-2">
                                <span className="text-2xl font-bold text-slate-900 dark:text-white">{key === 'C' ? 'C' : 'E'}</span>
                                <span className="text-sm text-slate-700 dark:text-slate-300">{key === 'C' ? 'Certo' : 'Errado'}</span>
                                {showResult && key === questoes.questoes[currentQuestionIndex].respostaCorreta && (
                                  <CheckCircleIcon className="h-6 w-6 text-green-600" />
                                )}
                                {showResult && key === selectedAnswer && key !== questoes.questoes[currentQuestionIndex].respostaCorreta && (
                                  <XCircleIcon className="h-6 w-6 text-red-600" />
                                )}
                              </div>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {Object.entries(questoes.questoes[currentQuestionIndex].alternativas).map(([key, value]) => (
                            <button
                              key={key}
                              onClick={() => handleAnswer(key)}
                              disabled={showResult}
                              className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                                showResult
                                  ? key === questoes.questoes[currentQuestionIndex].respostaCorreta
                                    ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                                    : key === selectedAnswer
                                      ? 'border-red-500 bg-red-50 dark:bg-red-900/20'
                                      : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-800 opacity-50'
                                  : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-800 hover:border-green-500 hover:bg-green-50 dark:hover:bg-green-900/20'
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <span className="font-bold text-slate-900 dark:text-white">{key})</span>
                                <span className="text-slate-700 dark:text-slate-300">{value}</span>
                                {showResult && key === questoes.questoes[currentQuestionIndex].respostaCorreta && (
                                  <CheckCircleIcon className="h-5 w-5 text-green-600 ml-auto" />
                                )}
                                {showResult && key === selectedAnswer && key !== questoes.questoes[currentQuestionIndex].respostaCorreta && (
                                  <XCircleIcon className="h-5 w-5 text-red-600 ml-auto" />
                                )}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Explicação */}
                      {showResult && (
                        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                          <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
                            💡 Explicação:
                          </h4>
                          <p className="text-sm text-blue-800 dark:text-blue-200">
                            {questoes.questoes[currentQuestionIndex].explicacao}
                          </p>
                        </div>
                      )}

                      {/* Botão próxima */}
                      {showResult && (
                        <button
                          onClick={handleNextQuestion}
                          className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white font-medium rounded-lg hover:from-green-700 hover:to-emerald-700 transition-all"
                        >
                          {currentQuestionIndex < questoes.questoes.length - 1 ? 'Próxima Questão' : 'Ver Resultado'}
                        </button>
                      )}
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
                  to={`/conteudo-incidencia/${courseId}/${disciplinaIdx}`}
                  className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 bg-slate-600 text-white font-medium rounded-lg hover:bg-slate-700 transition-all"
                >
                  <ArrowLeftIcon className="h-5 w-5" />
                  Voltar ao Conteúdo de Incidência
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default PraticaIncidenciaView
