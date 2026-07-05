import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { doc, getDoc, updateDoc, serverTimestamp, collection, addDoc } from 'firebase/firestore'
import { ArrowLeftIcon, QuestionMarkCircleIcon } from '@heroicons/react/24/outline'
import { db } from '../firebase/config'
import {
  QuestoesLoading,
  QuestoesHeader,
  QuestoesProgressBar,
  QuestaoEnunciadoCard,
  QuestaoAlternativas,
  QuestaoExplicacao,
  ResultadoDesempenho,
} from '../components/QuestoesPraticaCP'

export default function SharedQuestaoView() {
  const { questaoId } = useParams()
  const navigate = useNavigate()
  const [questoesData, setQuestoesData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showAccessForm, setShowAccessForm] = useState(true)
  const [accessData, setAccessData] = useState({ nome: '' })
  const [accessDocId, setAccessDocId] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [accessGranted, setAccessGranted] = useState(false)
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [selectedAnswer, setSelectedAnswer] = useState(null)
  const [showResult, setShowResult] = useState(false)
  const [answers, setAnswers] = useState([])
  const [desempenho, setDesempenho] = useState(null)

  useEffect(() => {
    loadQuestoes()
  }, [questaoId])

  const loadQuestoes = async () => {
    try {
      setLoading(true)
      const questaoRef = doc(db, 'sharedQuestoes', questaoId)
      const questaoDoc = await getDoc(questaoRef)

      if (!questaoDoc.exists()) {
        setError('Questões não encontradas ou expiraram.')
        return
      }

      const data = questaoDoc.data()
      if (data.status === 'inativo') {
        setError('Este link foi desativado pelo administrador.')
        return
      }

      setQuestoesData(data)
    } catch (err) {
      console.error('Erro ao carregar questões:', err)
      setError('Erro ao carregar questões: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleAccessSubmit = async (e) => {
    e.preventDefault()
    if (!accessData.nome?.trim()) {
      alert('Por favor, preencha seu nome.')
      return
    }

    try {
      setSubmitting(true)
      const ref = await addDoc(collection(db, 'sharedQuestoesAccess'), {
        questaoId,
        nome: accessData.nome.trim(),
        accessedAt: serverTimestamp(),
        completed: false,
      })
      setAccessDocId(ref.id)
      setAccessGranted(true)
      setShowAccessForm(false)
    } catch (err) {
      console.error('Erro ao registrar acesso:', err)
      alert('Erro ao registrar acesso: ' + err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleAnswer = (answer) => {
    const questao = questoesData.questoes[currentQuestionIndex]
    const correta = questao.respostaCorreta || questao.correta
    setSelectedAnswer(answer)
    setAnswers((prev) => [
      ...prev,
      {
        isCorrect: answer === correta,
        assunto: questao.assunto || '',
        probabilidade: questao.probabilidade || 0,
      },
    ])
    setShowResult(true)
  }

  const calcularDesempenho = async () => {
    const totalQuestoes = answers.length
    const acertos = answers.filter((a) => a.isCorrect).length
    const erros = totalQuestoes - acertos
    const aproveitamento = totalQuestoes > 0 ? Math.round((acertos / totalQuestoes) * 100) : 0

    const result = { totalQuestoes, acertos, erros, aproveitamento }
    setDesempenho(result)

    if (accessDocId) {
      try {
        await updateDoc(doc(db, 'sharedQuestoesAccess', accessDocId), {
          completed: true,
          acertos,
          erros,
          aproveitamento,
          totalQuestoes,
          completedAt: serverTimestamp(),
        })
      } catch (err) {
        console.error('Erro ao salvar conclusão:', err)
      }
    }
  }

  const handleNextQuestion = () => {
    if (currentQuestionIndex < questoesData.questoes.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1)
      setSelectedAnswer(null)
      setShowResult(false)
    } else {
      calcularDesempenho()
    }
  }

  const tipoProva = questoesData?.tipoProva || 'Múltipla Escolha'
  const questaoAtual = questoesData?.questoes?.[currentQuestionIndex]
  const total = questoesData?.questoes?.length || 0

  if (loading) return <QuestoesLoading />

  if (error) {
    return (
      <div className="max-w-lg mx-auto p-8">
        <div className="cp-card p-10 text-center">
          <QuestionMarkCircleIcon className="h-10 w-10 text-red-400 mx-auto mb-3" />
          <p className="font-medium text-cp-text">{error}</p>
        </div>
      </div>
    )
  }

  if (showAccessForm && !accessGranted) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-4">
        <div className="cp-card max-w-md w-full p-8">
          <div className="text-center mb-6">
            <span className="cp-badge cp-badge-accent mb-3">Link compartilhado</span>
            <h2 className="cp-headline text-xl">Identifique-se</h2>
            <p className="mt-2 text-sm text-cp-muted">Informe seu nome para acessar as questões</p>
          </div>
          <form onSubmit={handleAccessSubmit} className="space-y-4">
            <div>
              <label className="font-mono text-[10px] uppercase text-cp-muted">Nome completo</label>
              <input
                type="text"
                value={accessData.nome}
                onChange={(e) => setAccessData({ nome: e.target.value })}
                required
                className="mt-1 w-full rounded-xl border border-cp-border bg-cp-bg/60 px-3 py-2.5 text-sm text-cp-text"
                placeholder="Seu nome"
              />
            </div>
            <button type="submit" disabled={submitting} className="cp-btn-primary w-full justify-center">
              {submitting ? 'Processando…' : 'Acessar questões'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  if (!questoesData?.questoes) return null

  if (desempenho) {
    return (
      <div className="space-y-6 max-w-3xl mx-auto p-4">
        <button type="button" onClick={() => navigate('/')} className="cp-btn-ghost !px-0">
          <ArrowLeftIcon className="h-4 w-4" />
          Voltar
        </button>
        <ResultadoDesempenho desempenho={desempenho} />
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto p-4">
      <QuestoesHeader
        badge="Questões compartilhadas"
        title={questoesData.topico || questoesData.disciplina || 'Prática'}
        subtitle={`Nível ${questoesData.nivel || 1} · ${total} questões · ${accessData.nome}`}
        backLink={
          <button type="button" onClick={() => navigate('/')} className="cp-btn-ghost !px-0 mb-2">
            <ArrowLeftIcon className="h-4 w-4" />
            Voltar
          </button>
        }
      />

      <div className="cp-card p-6 sm:p-8 space-y-4">
        <QuestoesProgressBar current={currentQuestionIndex} total={total} />

        {questaoAtual && (
          <>
            <QuestaoEnunciadoCard
              assunto={questaoAtual.assunto}
              probabilidade={questaoAtual.probabilidade}
              enunciado={questaoAtual.enunciado}
            />

            {!showResult ? (
              <QuestaoAlternativas
                tipoProva={tipoProva}
                questao={questaoAtual}
                showResult={showResult}
                modoAdminNavegacao={false}
                onAnswer={handleAnswer}
              />
            ) : (
              <div className="space-y-4">
                <QuestaoAlternativas
                  tipoProva={tipoProva}
                  questao={questaoAtual}
                  showResult
                  modoAdminNavegacao={false}
                  onAnswer={() => {}}
                />
                <QuestaoExplicacao
                  explicacao={questaoAtual.explicacao || questaoAtual.gabaritoComentado}
                />
                <button type="button" onClick={handleNextQuestion} className="cp-btn-primary w-full justify-center">
                  {currentQuestionIndex < total - 1 ? 'Próxima questão →' : 'Ver resultado'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
