import { readEnv, isDevEnv } from '@/lib/env.js'
import { useEffect, useState, useMemo, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { doc, getDoc, setDoc, deleteDoc, serverTimestamp, getDocs, collection, query, where, orderBy } from 'firebase/firestore'
import { ArrowLeftIcon, FireIcon, CheckCircleIcon, XCircleIcon, ChartBarIcon, TrashIcon, MagnifyingGlassIcon, QuestionMarkCircleIcon } from '@heroicons/react/24/outline'
import ReactMarkdown from 'react-markdown'
import { db } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'
import { useDarkMode } from '../hooks/useDarkMode.jsx'
import { formatAiErrorForUser } from '../utils/geminiApi'
import {
  buildQuestoesExamHeader,
  generateQuestoesInBatches,
} from '../utils/questoesGeneration'
import { appendVisualMediaAppendix } from '../utils/stemVisualContent'
import { startBackgroundGeneration } from '../services/aiGenerationRunner'
import { isContentAvailable, CONTENT_STATUS, toggleContentStatus } from '../utils/contentStatus'
import ContentPublishButton from '../components/ContentPublishButton'
import { QuestaoEnunciadoCard } from '../components/QuestoesPraticaCP'
import {
  buildIncidenciaQuestaoContentId,
  buildLegacyIncidenciaQuestaoContentId,
} from '../utils/contentCommentIds'
import { mapOrderedAlternativas } from '../utils/questaoAlternativas'

const PraticaIncidenciaView = () => {
  const { courseId, disciplinaIdx } = useParams()
  const navigate = useNavigate()
  const { user, profile, isAdmin } = useAuth()
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
  const [editandoQuestao, setEditandoQuestao] = useState(false)
  const [novoGabarito, setNovoGabarito] = useState('')
  const [novaExplicacao, setNovaExplicacao] = useState('')
  const [salvandoEdicao, setSalvandoEdicao] = useState(false)
  const [modoAdminNavegacao, setModoAdminNavegacao] = useState(false)
  const [termoBusca, setTermoBusca] = useState('')
  const [carregandoNivel, setCarregandoNivel] = useState(false)
  const desempenhoNivelInicial = useRef(false)

  const disciplinaIndex = parseInt(disciplinaIdx)

  const sanitizedDisciplinaNome = useMemo(() => {
    const disciplina = editalVerticalizado?.disciplinas?.[disciplinaIndex]
    if (!disciplina?.nome) return ''
    return disciplina.nome.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 100)
  }, [editalVerticalizado, disciplinaIndex])

  const todosNiveis = useMemo(() => Array.from({ length: 10 }, (_, i) => i + 1), [])

  // Questões filtradas por busca
  const questoesFiltradas = useMemo(() => {
    if (!questoes || !questoes.questoes) return []
    if (!termoBusca) return questoes.questoes
    const termo = termoBusca.toLowerCase()
    return questoes.questoes.filter((questao) => {
      const enunciado = (questao.enunciado || '').toLowerCase()
      const assunto = (questao.assunto || '').toLowerCase()
      const explicacao = (questao.explicacao || questao.gabaritoComentado || '').toLowerCase()
      return enunciado.includes(termo) || assunto.includes(termo) || explicacao.includes(termo)
    })
  }, [questoes, termoBusca])

  // Questões para exibir
  const questoesParaExibir = modoAdminNavegacao && termoBusca ? questoesFiltradas : (questoes?.questoes || [])

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
        let todasDisciplinas = editalData.disciplinas || []

        // Verificar se o edital está dividido em partes
        if (editalData.temPartes && editalData.totalPartes > 1) {
          const partesRef = collection(db, 'courses', courseId, 'editalVerticalizado', 'principal', 'partes')
          const partesSnapshot = await getDocs(query(partesRef, orderBy('parte')))

          todasDisciplinas = [...(editalData.disciplinas || [])]
          partesSnapshot.forEach((parteDoc) => {
            const parteData = parteDoc.data()
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
        const disciplinas = todasDisciplinas
        
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

        // Restaurar apenas o nível salvo — não bloquear a tela de prática com resultado antigo
        if (user && sanitizedDisciplinaNome && !desempenhoNivelInicial.current) {
          const desempenhoRef = doc(db, 'users', user.uid, 'desempenhoIncidencia', sanitizedDisciplinaNome)
          const desempenhoDoc = await getDoc(desempenhoRef)
          if (desempenhoDoc.exists()) {
            const desempenhoData = desempenhoDoc.data()
            setNivelAtual(desempenhoData.nivel || 1)
          }
          desempenhoNivelInicial.current = true
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

  useEffect(() => {
    if (!courseId || !sanitizedDisciplinaNome) return

    let cancelled = false

    const loadQuestoesNivel = async () => {
      setCarregandoNivel(true)
      setQuestoes(null)
      setCurrentQuestionIndex(0)
      setSelectedAnswer(null)
      setShowResult(false)
      setAnswers([])

      try {
        const questoesRef = doc(
          db,
          'courses',
          courseId,
          'questoesIncidencia',
          `${sanitizedDisciplinaNome}_nivel_${nivelAtual}`
        )
        const questoesDoc = await getDoc(questoesRef)
        if (cancelled) return
        setQuestoes(questoesDoc.exists() ? questoesDoc.data() : null)
      } catch (err) {
        console.error('Erro ao carregar questões do nível:', err)
        if (!cancelled) setQuestoes(null)
      } finally {
        if (!cancelled) setCarregandoNivel(false)
      }
    }

    loadQuestoesNivel()
    return () => {
      cancelled = true
    }
  }, [courseId, sanitizedDisciplinaNome, nivelAtual])

  const handleGenerateQuestoes = async () => {
    if (!courseId || !conteudoIncidencia) return
    if (profile?.role !== 'admin') {
      setStatus('❌ Apenas administradores podem gerar questões.')
      return
    }

    const apiKey = readEnv('VITE_GEMINI_API_KEY')
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

      // Tipo de prova pela banca (CESPE/CEBRASPE = C/E; demais = A–E)
      const examHeader = buildQuestoesExamHeader({
        banca,
        cargo,
        concursoName: courseData.competition || courseName,
        courseName: courseName || courseData.name,
        competition: courseData.competition,
        nivel: courseData.nivel || courseData.escolaridade,
        area: courseData.area,
      })
      const { exam, tipoProva, tipoLabel, fidelityBlock, formatInstructions, schemaSnippet } =
        examHeader

      const topAssuntos = conteudoIncidencia.topAssuntosGerais || []
      const analisePorTopico = conteudoIncidencia.analisePorTopico || []

      const buildBatchPrompt = ({ batchNumber, batches, count }) =>
        appendVisualMediaAppendix(
          `${fidelityBlock}
Você é um especialista em criar questões de concurso público baseadas em análise de incidência.

CONTEXTO:
- CURSO: ${courseName || 'Curso Preparatório'}
- CARGO: ${exam.cargo || 'NÃO DEFINIDO'}
- BANCA EXAMINADORA: ${exam.banca || 'NÃO DEFINIDA'}
- TIPO DE PROVA DA BANCA: ${tipoLabel}
- DISCIPLINA: ${conteudoIncidencia.disciplina || 'Disciplina'}
- NÍVEL DE PRÁTICA: ${nivelAtual} (1 básico → 10 avançado)
- LOTE: ${batchNumber}/${batches} — gere EXATAMENTE ${count} questões neste lote

ASSUNTOS COM MAIOR INCIDÊNCIA (Top Gerais):
${topAssuntos.map((a, i) => `${i + 1}. ${a.assunto} - ${a.probabilidade}%\n   Revisão: ${a.revisao}`).join('\n\n')}

ANÁLISE POR TÓPICO (resumo):
${analisePorTopico
  .slice(0, 8)
  .map(
    (t) =>
      `Tópico: ${t.topicoNumero} - ${t.topicoNome}\n` +
      (t.assuntos || [])
        .sort((a, b) => b.probabilidade - a.probabilidade)
        .slice(0, 3)
        .map((a, i) => `  ${i + 1}. ${a.assunto} - ${a.probabilidade}%`)
        .join('\n'),
  )
  .join('\n\n')}

${formatInstructions}

INSTRUÇÕES DE DIFICULDADE:
- Nível ${nivelAtual}: ${nivelAtual === 1 ? 'básicas' : nivelAtual <= 3 ? 'fácil/médio' : nivelAtual <= 6 ? 'médio' : nivelAtual <= 8 ? 'avançado' : 'especialista'}
- Priorize assuntos de alta incidência; adapte ao cargo ${exam.cargo || 'do edital'}

TAREFA:
Gere EXATAMENTE ${count} questões no formato ${tipoLabel}, baseadas nos assuntos de maior incidência.
Não repita enunciados. Distribua por probabilidade (mais questões nos assuntos quentes).

Cada questão:
- Enunciado claro
${
  tipoProva === 'Certo/Errado'
    ? '- Gabarito C ou E (sem A–E)'
    : '- 5 alternativas A–E e gabarito A–E'
}
- Explicação detalhada
- Campos assunto + probabilidade

ESTRUTURA DO JSON:
{
  "disciplina": "${conteudoIncidencia.disciplina || 'Disciplina'}",
  "banca": "${exam.banca || 'NÃO DEFINIDA'}",
  "cargo": "${exam.cargo || 'NÃO DEFINIDO'}",
  "curso": "${courseName || 'Curso Preparatório'}",
  "tipoProva": "${tipoLabel}",
  "nivel": ${nivelAtual},
  "questoes": [
    {
      "numero": 1,
      "assunto": "nome do assunto",
      "probabilidade": 95,
      ${schemaSnippet}
    }
  ]
}

REGRAS:
- Fidelidade 100% à banca ${exam.banca || 'indicada'} e ao cargo ${exam.cargo || 'do edital'}
- Formato ${tipoLabel} — sem misturar
- DATA ATUAL: ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
- Retorne APENAS JSON válido`,
          conteudoIncidencia.disciplina || 'Disciplina',
          conteudoIncidencia.disciplina || '',
          'questoes',
        )

      setProgress(50)
      setStatus('Gerando em segundo plano… Você pode sair desta tela.')

      const { promise } = await startBackgroundGeneration({
        userId: user?.uid,
        courseId,
        jobType: 'questoes_incidencia',
        topicKey: String(disciplinaIdx),
        metadata: { nivel: nivelAtual, disciplina: sanitizedDisciplinaNome, tipoProva: tipoLabel },
        task: async ({ updateProgress }) => {
          await updateProgress(50, `Gerando questões (${tipoLabel}) em lotes…`)
          const batchResult = await generateQuestoesInBatches({
            buildBatchPrompt,
            total: 50,
            batchSize: 10,
            examCtx: exam,
            aiOptions: {
              courseId,
              isLegalContent: true,
              useRAG: true,
              useGoogleSearch: true,
              verifyContent: false,
            },
            onBatchProgress: async ({ batchNumber, batches }) => {
              await updateProgress(
                50 + Math.round((batchNumber / batches) * 35),
                `Lote ${batchNumber}/${batches} (${tipoLabel})…`,
              )
            },
          })

          const parsed = {
            disciplina: conteudoIncidencia.disciplina || 'Disciplina',
            banca: exam.banca || 'NÃO DEFINIDA',
            cargo: exam.cargo || 'NÃO DEFINIDO',
            curso: courseName || 'Curso Preparatório',
            tipoProva: tipoLabel,
            nivel: nivelAtual,
            questoes: batchResult.questoes,
          }

          await updateProgress(90, 'Salvando questões…')

          const disciplinaLocal = editalVerticalizado?.disciplinas[disciplinaIndex]
          const discKey = disciplinaLocal?.nome
            ?.replace(/[^a-zA-Z0-9]/g, '_')
            .substring(0, 100)
          const docId = `${discKey}_nivel_${nivelAtual}`
          const questoesRef = doc(db, 'courses', courseId, 'questoesIncidencia', docId)

          const initialStatus = isContentAvailable(conteudoIncidencia?.status, true)
            ? CONTENT_STATUS.AVAILABLE
            : CONTENT_STATUS.UNAVAILABLE

          await setDoc(
            questoesRef,
            {
              ...parsed,
              disciplinaIdx: disciplinaIndex,
              nivel: nivelAtual,
              status: initialStatus,
              updatedAt: serverTimestamp(),
              generatedAt: serverTimestamp(),
            },
            { merge: true },
          )

          return parsed
        },
      })

      promise
        .then((parsed) => {
          setQuestoes(parsed)
          setNiveisDisponiveis((prev) =>
            prev.includes(nivelAtual) ? prev : [...prev, nivelAtual].sort((a, b) => a - b)
          )
          setProgress(100)
          setStatus('✅ Questões geradas com sucesso!')
        })
        .catch((error) => {
          console.error('Erro ao gerar questões:', error)
          setStatus(`❌ ${formatAiErrorForUser(error)}`)
        })
        .finally(() => {
          setGenerating(false)
          setTimeout(() => setProgress(0), 800)
        })

      return

    } catch (error) {
      console.error('Erro ao gerar questões:', error)
      setStatus(`❌ ${formatAiErrorForUser(error)}`)
      setGenerating(false)
      setTimeout(() => setProgress(0), 800)
    }
  }

  const handleAnswer = (answer) => {
    if (!canPractice) return
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
    
    // Verificar se completou todas as questões do nível (considerando o total disponível)
    const totalQuestoesDisponiveis = questoes?.questoes?.length || 0
    const completouNivel = totalQuestoes >= totalQuestoesDisponiveis
    
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
    if (novoNivel === nivelAtual) return
    setNivelAtual(novoNivel)
    setQuestoes(null)
    setDesempenho(null)
    setCurrentQuestionIndex(0)
    setSelectedAnswer(null)
    setShowResult(false)
    setAnswers([])
    setMostrarSeletorNiveis(false)
    setStatus('')
  }

  const handleIniciarEdicao = () => {
    const questaoAtual = questoes.questoes[currentQuestionIndex]
    setNovoGabarito(questaoAtual.respostaCorreta || questaoAtual.correta || '')
    setNovaExplicacao(questaoAtual.explicacao || questaoAtual.gabaritoComentado || '')
    setEditandoQuestao(true)
  }

  const handleSalvarEdicao = async () => {
    if (!questoes) return
    
    // Verificar se é admin
    if (profile?.role !== 'admin') {
      alert('Apenas administradores podem editar questões')
      return
    }
    
    try {
      setSalvandoEdicao(true)
      
      const questaoAtual = questoes.questoes[currentQuestionIndex]
      const questoesAtualizadas = [...questoes.questoes]
      questoesAtualizadas[currentQuestionIndex] = {
        ...questaoAtual,
        respostaCorreta: novoGabarito,
        correta: novoGabarito,
        explicacao: novaExplicacao,
        gabaritoComentado: novaExplicacao
      }
      
      const disciplina = editalVerticalizado?.disciplinas[disciplinaIndex]
      const sanitizedDisciplinaNome = disciplina?.nome
        .replace(/[^a-zA-Z0-9]/g, '_')
        .substring(0, 100)
      
      const docId = `${sanitizedDisciplinaNome}_nivel_${nivelAtual}`
      
      await setDoc(doc(db, 'courses', courseId, 'questoesIncidencia', docId), {
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
    setShowResult(modoAdminNavegacao ? false : true)
    setSelectedAnswer(null)
  }

  const handlePesquisarGoogle = () => {
    const questaoAtual = questoesParaExibir[currentQuestionIndex]
    if (!questaoAtual) return
    const searchQuery = encodeURIComponent(`${questaoAtual.enunciado} ${questaoAtual.assunto || ''}`)
    window.open(`https://www.google.com/search?q=${searchQuery}`, '_blank')
  }

  const handleToggleStatus = async () => {
    if (!questoes) return
    
    try {
      const novoStatus = toggleContentStatus(questoes.status)
      const disciplina = editalVerticalizado?.disciplinas[disciplinaIndex]
      const sanitizedDisciplinaNome = disciplina?.nome
        .replace(/[^a-zA-Z0-9]/g, '_')
        .substring(0, 100)
      
      const docId = `${sanitizedDisciplinaNome}_nivel_${nivelAtual}`
      
      await setDoc(doc(db, 'courses', courseId, 'questoesIncidencia', docId), {
        ...questoes,
        status: novoStatus,
        updatedAt: serverTimestamp(),
      }, { merge: true })
      
      setQuestoes({
        ...questoes,
        status: novoStatus,
      })
    } catch (error) {
      console.error('Erro ao alterar status:', error)
      alert('Erro ao alterar status: ' + error.message)
    }
  }

  const handleShareQuestao = async () => {
    // Verificar se é admin
    if (profile?.role !== 'admin') {
      alert('Apenas administradores podem compartilhar questões')
      return
    }
    
    if (!questoes || !questoes.questoes || questoes.questoes.length === 0) {
      alert('Não há questões para compartilhar')
      return
    }
    
    try {
      const sharedQuestaoRef = doc(collection(db, 'sharedQuestoes'))
      const questaoId = sharedQuestaoRef.id
      
      await setDoc(sharedQuestaoRef, {
        id: questaoId,
        questoes: questoes.questoes,
        tipoProva: questoes.tipoProva,
        disciplina: conteudoIncidencia?.disciplina || 'Disciplina',
        courseId: courseId,
        nivel: nivelAtual,
        totalQuestoes: questoes.questoes.length,
        sharedBy: profile?.email || 'admin',
        sharedAt: serverTimestamp(),
        status: 'ativo',
      })
      
      const shareUrl = `${window.location.origin}/share-questao/${questaoId}`
      
      // Copiar para clipboard
      await navigator.clipboard.writeText(shareUrl)
      alert(`Link copiado para a área de transferência!\n\n${questoes.questoes.length} questões compartilhadas.`)
    } catch (error) {
      console.error('Erro ao compartilhar questões:', error)
      alert('Erro ao compartilhar questões: ' + error.message)
    }
  }

  const handlePreviousQuestion = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1)
      setShowResult(modoAdminNavegacao)
      setSelectedAnswer(null)
    }
  }

  const canPractice =
    isAdmin ||
    (isContentAvailable(conteudoIncidencia?.status, false) &&
      questoes &&
      isContentAvailable(questoes.status, false))

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-10 w-10 animate-spin rounded-full border-2 border-cp-accent border-t-transparent" />
          <p className="mt-4 text-sm text-cp-muted">Carregando questões…</p>
        </div>
      </div>
    )
  }

  if (error || !conteudoIncidencia) {
    return (
      <div className="max-w-lg mx-auto p-8">
        <div className="cp-card p-10 text-center space-y-4">
          <p className="font-medium text-red-400">{error || 'Dados não encontrados'}</p>
          <Link to={`/conteudo-incidencia/${courseId}/${disciplinaIdx}`} className="cp-btn-ghost inline-flex">
            <ArrowLeftIcon className="w-5 h-5" />
            Voltar ao conteúdo de incidência
          </Link>
        </div>
      </div>
    )
  }

  const disciplina = editalVerticalizado?.disciplinas[disciplinaIndex]

  return (
    <div className="space-y-6">
      {courseName && (
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-cp-muted">{courseName}</p>
      )}

      <Link
        to={`/conteudo-incidencia/${courseId}/${disciplinaIdx}`}
        className="inline-flex items-center gap-2 text-sm text-cp-muted hover:text-cp-accent transition"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        Voltar ao conteúdo de incidência
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-cp-accent2/30 bg-cp-accent2/10">
            <FireIcon className="h-6 w-6 text-cp-accent2" />
          </div>
          <div>
            <span className="cp-badge cp-badge-accent mb-2">Questões por incidência</span>
            <h1 className="cp-headline text-xl sm:text-2xl">{disciplina?.nome || 'Disciplina'}</h1>
            <p className="mt-1 text-sm text-cp-muted">
              Nível <span className="font-mono text-cp-accent2">{nivelAtual}</span>/10
              <button type="button" onClick={() => setMostrarSeletorNiveis(!mostrarSeletorNiveis)} className="ml-2 text-cp-accent hover:underline text-xs">
                (escolher nível{niveisDisponiveis.length > 0 ? ` · ${niveisDisponiveis.length} gerados` : ''})
              </button>
            </p>
          </div>
        </div>
      </div>

      {mostrarSeletorNiveis && (
        <div className="flex flex-wrap gap-2">
          {todosNiveis.map((nivel) => (
            <button
              key={nivel}
              type="button"
              onClick={() => handleMudarNivel(nivel)}
              className={`rounded-lg px-3 py-1.5 font-mono text-xs transition ${
                nivel === nivelAtual
                  ? 'border border-cp-accent2/40 bg-cp-accent2/15 text-cp-accent2'
                  : niveisDisponiveis.includes(nivel)
                    ? 'border border-cp-border bg-cp-surface text-cp-muted hover:border-cp-accent/30'
                    : 'border border-dashed border-cp-border/70 bg-cp-bg/40 text-cp-muted/70 hover:border-cp-accent/30'
              }`}
            >
              Nível {nivel}
            </button>
          ))}
        </div>
      )}

      <div className="cp-card p-6 sm:p-8">
          {carregandoNivel ? (
            <div className="py-12 text-center">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-cp-accent border-t-transparent" />
              <p className="mt-3 text-sm text-cp-muted">Carregando nível {nivelAtual}…</p>
            </div>
          ) : !desempenho ? (
            <div className="space-y-6">
              {!questoes ? (
                <div className="space-y-6">
                  {/* Informações sobre a geração */}
                  <div className="cp-card !border-cp-accent2/20 p-5 space-y-4">
                    <p className="font-mono text-[10px] uppercase text-cp-muted">Geração — nível {nivelAtual}</p>
                    <ul className="text-sm text-cp-muted space-y-1">
                      <li>• Baseadas nos assuntos de maior incidência</li>
                      <li>• 50 questões no estilo da banca</li>
                      <li>• Dificuldade progressiva por nível</li>
                    </ul>
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
                    <button type="button" onClick={handleGenerateQuestoes} disabled={generating} className="cp-btn-primary w-full justify-center">
                      <FireIcon className="h-5 w-5" />
                      {generating ? 'Gerando questões…' : 'Gerar questões'}
                    </button>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Status do conteúdo para usuários */}
                  {profile?.role !== 'admin' && questoes && (
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg ${
                        questoes.status === 'disponivel'
                          ? 'bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-200'
                          : 'bg-orange-100 dark:bg-orange-900/20 text-orange-800 dark:text-orange-200'
                      }`}>
                        {questoes.status === 'disponivel' ? '✅ Disponível' : '⏳ Conteúdo Pendente'}
                      </span>
                    </div>
                  )}

                  {/* Bloqueio de acesso para conteúdo indisponível */}
                  {!isAdmin && questoes && !isContentAvailable(questoes.status, isAdmin) ? (
                    <div className="cp-card p-8 text-center">
                      <QuestionMarkCircleIcon className="h-10 w-10 text-amber-600 dark:text-amber-400 mx-auto mb-3" />
                      <p className="font-medium text-cp-text">Questões em preparação</p>
                      <p className="mt-2 text-sm text-cp-muted">O administrador ainda não liberou este nível.</p>
                    </div>
                  ) : (
                    <>
                      {/* Botão de excluir para admin */}
                      {isAdmin && (
                    <div className="flex justify-between items-center gap-2 flex-wrap mb-4">
                      <button
                        type="button"
                        onClick={handleToggleModoAdmin}
                        className={`cp-btn-ghost !text-xs ${modoAdminNavegacao ? '!border-cp-accent/40 !text-cp-accent' : ''}`}
                      >
                        {modoAdminNavegacao ? 'Modo prática' : 'Modo navegação'}
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
                            onClick={handleShareQuestao}
                            className="p-3 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition shadow-lg"
                            title="Compartilhar Questão"
                          >
                            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"></path>
                            </svg>
                          </button>
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
                      <ContentPublishButton status={questoes?.status} onToggle={handleToggleStatus} />
                      <button type="button" onClick={handleDeleteQuestoes} disabled={deleting} className="cp-btn-ghost !text-xs !text-red-400">
                        <TrashIcon className="h-4 w-4" />
                        {deleting ? 'Apagando…' : 'Apagar'}
                      </button>
                    </div>
                  )}
                      </>
                    )}

                  {/* Barra de progresso */}
                  <div className="h-1.5 overflow-hidden rounded-full bg-cp-border mb-2">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-cp-accent to-cp-accent2 transition-all duration-300"
                      style={{ width: `${((currentQuestionIndex + 1) / questoesParaExibir.length) * 100}%` }}
                    />
                  </div>
                  <p className="text-xs font-mono text-cp-muted text-center mb-4">
                    Questão {currentQuestionIndex + 1} de {questoesParaExibir.length}
                    {termoBusca && ` (${questoes.questoes.length} total)`}
                  </p>

                  {questoesParaExibir[currentQuestionIndex] && (
                    <div className="mb-3 flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={handlePesquisarGoogle}
                        className="noji-tool-btn"
                        title="Pesquisar no Google"
                      >
                        <MagnifyingGlassIcon className="h-4 w-4" />
                      </button>
                    </div>
                  )}

                  {questoesParaExibir[currentQuestionIndex] && (() => {
                    const questaoAtual = questoesParaExibir[currentQuestionIndex]
                    const questaoContentId = buildIncidenciaQuestaoContentId({
                      courseId,
                      disciplinaKey: sanitizedDisciplinaNome,
                      nivel: nivelAtual,
                      questao: questaoAtual,
                      questionIndex: currentQuestionIndex,
                    })
                    const legacyQuestaoContentId = buildLegacyIncidenciaQuestaoContentId({
                      disciplinaKey: sanitizedDisciplinaNome,
                      nivel: nivelAtual,
                      questionIndex: currentQuestionIndex,
                    })

                    return (
                    <div className="space-y-4">
                      <QuestaoEnunciadoCard
                        assunto={questaoAtual.assunto}
                        probabilidade={questaoAtual.probabilidade}
                        enunciado={questaoAtual.enunciado}
                        questionNumber={currentQuestionIndex + 1}
                        courseId={courseId}
                        topicKey={`incidencia_${disciplinaIdx}`}
                        contentId={questaoContentId}
                        alternateContentIds={
                          legacyQuestaoContentId !== questaoContentId ? [legacyQuestaoContentId] : []
                        }
                        ilustracao={questaoAtual.ilustracao}
                        textoBase={questaoAtual.textoBase}
                      />

                      {/* Alternativas - Certo/Errado ou Múltipla */}
                      {questoes.tipoProva === 'Certo/Errado' ? (
                        <div className="grid grid-cols-2 gap-4">
                          {['C', 'E'].map((key) => (
                            <button
                              key={key}
                              onClick={() => !modoAdminNavegacao && handleAnswer(key)}
                              disabled={showResult || modoAdminNavegacao}
                              className={`text-center p-6 rounded-lg border-2 transition-all ${
                                modoAdminNavegacao || showResult
                                  ? key === questoesParaExibir[currentQuestionIndex].respostaCorreta
                                    ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-800 opacity-50'
                                  : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-800 hover:border-green-500 hover:bg-green-50 dark:hover:bg-green-900/20'
                              }`}
                            >
                              <div className="flex flex-col items-center gap-2">
                                <span className="text-2xl font-bold text-slate-900 dark:text-white">{key === 'C' ? 'C' : 'E'}</span>
                                <span className="text-sm text-slate-700 dark:text-slate-300">{key === 'C' ? 'Certo' : 'Errado'}</span>
                                {(modoAdminNavegacao || showResult) && key === questoesParaExibir[currentQuestionIndex].respostaCorreta && (
                                  <CheckCircleIcon className="h-6 w-6 text-green-600" />
                                )}
                              </div>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {mapOrderedAlternativas(questoesParaExibir[currentQuestionIndex].alternativas).map(([key, value]) => (
                            <button
                              key={key}
                              onClick={() => !modoAdminNavegacao && handleAnswer(key)}
                              disabled={showResult || modoAdminNavegacao}
                              className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                                modoAdminNavegacao || showResult
                                  ? key === questoesParaExibir[currentQuestionIndex].respostaCorreta
                                    ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-800 opacity-50'
                                  : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-800 hover:border-green-500 hover:bg-green-50 dark:hover:bg-green-900/20'
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <span className="font-bold text-slate-900 dark:text-white">{key})</span>
                                <span className="text-slate-700 dark:text-slate-300">{value}</span>
                                {(modoAdminNavegacao || showResult) && key === questoesParaExibir[currentQuestionIndex].respostaCorreta && (
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
                            {isAdmin && !editandoQuestao && (
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
                                {questoesParaExibir[currentQuestionIndex].explicacao}
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
                    )
                  })()}
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
                
                {isAdmin && (
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
  )
}

export default PraticaIncidenciaView
