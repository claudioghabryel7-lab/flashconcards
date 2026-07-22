import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ChevronDownIcon,
  ChevronRightIcon,
  MagnifyingGlassIcon,
  ChartBarIcon,
  ChartPieIcon,
  ListBulletIcon,
  CheckCircleIcon,
  XCircleIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline'
import { useAuth } from '../hooks/useAuth'
import { useResolverQuestoes } from '../hooks/useResolverQuestoes'
import { incrementQuestoesStats } from '../utils/questoesStats'
import SubjectMetricChart from '../components/SubjectMetricChart'
import {
  QuestaoEnunciadoCard,
  QuestaoAlternativas,
  QuestaoExplicacao,
  resolveQuestaoExplicacao,
  resolveQuestaoGabarito,
} from '../components/QuestoesPraticaCP'
import { buildQuestaoContentId } from '../utils/contentCommentIds'

const CHART_TYPES = [
  { id: 'pie', label: 'Pizza', icon: ChartPieIcon },
  { id: 'bar', label: 'Barras', icon: ChartBarIcon },
  { id: 'simple', label: 'Simples', icon: ListBulletIcon },
]

const ResolverQuestoesView = () => {
  const { user, profile } = useAuth()
  const courseId = profile?.selectedCourseId || 'alego-default'

  const {
    organized,
    allItems,
    stats,
    totalQuestoes,
    totalAnswered,
    accuracy,
    acertosChart,
    errosChart,
    loading,
    hasEdital,
  } = useResolverQuestoes(courseId, user, profile)

  const [chartType, setChartType] = useState('pie')
  const [sidebarSearch, setSidebarSearch] = useState('')
  const [expandedMaterias, setExpandedMaterias] = useState({})
  const [selectedMateria, setSelectedMateria] = useState(null)
  const [selectedModulo, setSelectedModulo] = useState(null)
  const [deckItems, setDeckItems] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [selectedAnswer, setSelectedAnswer] = useState(null)
  const [showResult, setShowResult] = useState(false)
  const [sessionStats, setSessionStats] = useState({ correct: 0, wrong: 0 })

  const materias = useMemo(() => Object.keys(organized).sort(), [organized])

  const selectDeck = useCallback((materia, modulo, items) => {
    setSelectedMateria(materia)
    setSelectedModulo(modulo)
    setDeckItems(items)
    setCurrentIndex(0)
    setSelectedAnswer(null)
    setShowResult(false)
    setSessionStats({ correct: 0, wrong: 0 })
  }, [])

  const selectAllQuestoes = useCallback(() => {
    selectDeck('Todas', 'Todas as questões', allItems)
  }, [allItems, selectDeck])

  useEffect(() => {
    if (!selectedMateria && allItems.length > 0 && materias.length > 0) {
      const firstMateria = materias[0]
      const firstModulo = Object.keys(organized[firstMateria] || {})[0]
      if (firstModulo) {
        selectDeck(firstMateria, firstModulo, organized[firstMateria][firstModulo])
      }
    }
  }, [allItems.length, materias, organized, selectDeck, selectedMateria])

  const currentItem = deckItems[currentIndex]
  const currentQuestao = currentItem?.questao

  const handleAnswer = async (answer) => {
    if (showResult || !currentQuestao || !currentItem) return

    setSelectedAnswer(answer)
    setShowResult(true)

    const correta = resolveQuestaoGabarito(currentQuestao)
    const isCorrect = answer === correta

    setSessionStats((prev) => ({
      correct: prev.correct + (isCorrect ? 1 : 0),
      wrong: prev.wrong + (isCorrect ? 0 : 1),
    }))

    if (user?.uid) {
      await incrementQuestoesStats(
        user.uid,
        courseId,
        currentItem.materia,
        isCorrect ? 1 : 0,
        isCorrect ? 0 : 1,
      )
    }
  }

  const handleNext = () => {
    if (currentIndex < deckItems.length - 1) {
      setCurrentIndex((i) => i + 1)
      setSelectedAnswer(null)
      setShowResult(false)
    }
  }

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex((i) => i - 1)
      setSelectedAnswer(null)
      setShowResult(false)
    }
  }

  const handleShuffle = () => {
    setDeckItems((prev) => [...prev].sort(() => Math.random() - 0.5))
    setCurrentIndex(0)
    setSelectedAnswer(null)
    setShowResult(false)
  }

  const handlePesquisarGoogle = () => {
    if (!currentQuestao) return
    const q = encodeURIComponent(`${currentQuestao.enunciado} ${currentQuestao.assunto || ''}`)
    window.open(`https://www.google.com/search?q=${q}`, '_blank')
  }

  const toggleMateria = (materia) => {
    setExpandedMaterias((prev) => ({ ...prev, [materia]: !prev[materia] }))
  }

  const filteredMaterias = useMemo(() => {
    const q = sidebarSearch.trim().toLowerCase()
    if (!q) return materias
    return materias.filter((materia) => {
      if (materia.toLowerCase().includes(q)) return true
      const modulos = Object.keys(organized[materia] || {})
      return modulos.some((mod) => mod.toLowerCase().includes(q))
    })
  }, [materias, organized, sidebarSearch])

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

  return (
    <div className="space-y-5 pb-6">
      {/* Resumo + gráficos */}
      <section className="dash-focus !border-t-[2px] p-4 sm:p-5" style={{ borderTopColor: 'var(--cp-accent)' }}>
        <div className="relative z-[1] mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-cp-muted">Desempenho</p>
            <p className="mt-1 text-sm text-cp-muted">
              {totalQuestoes} disponíveis · {totalAnswered} resolvidas
            </p>
          </div>
          <div className="flex rounded-lg border border-cp-border bg-cp-surface p-1">
            {CHART_TYPES.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setChartType(id)}
                className={`flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  chartType === id
                    ? 'bg-cp-accent text-white shadow-cp-glow'
                    : 'text-cp-muted hover:bg-cp-surface hover:text-cp-text'
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="relative z-[1] mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
          <div className="rounded-xl border border-cp-border bg-cp-surface/40 p-3 text-center sm:p-4">
            <p className="font-mono text-[10px] uppercase text-cp-muted">Disponíveis</p>
            <p className="mt-1 text-xl font-bold text-cp-text sm:text-2xl">{totalQuestoes}</p>
          </div>
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-center sm:p-4">
            <p className="font-mono text-[10px] uppercase text-emerald-500">Acertos</p>
            <p className="mt-1 text-2xl font-bold text-emerald-500">{stats.correct || 0}</p>
          </div>
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-center">
            <p className="font-mono text-[10px] uppercase text-red-500">Erros</p>
            <p className="mt-1 text-2xl font-bold text-red-500">{stats.wrong || 0}</p>
          </div>
          <div className="rounded-xl border border-cp-accent/30 bg-cp-accent/10 p-4 text-center">
            <p className="font-mono text-[10px] uppercase text-cp-accent">Aproveitamento</p>
            <p className="mt-1 text-2xl font-bold text-cp-accent">{accuracy}%</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <SubjectMetricChart
            title="Acertos por Matéria"
            data={acertosChart}
            chartType={chartType}
            unit="q"
            emptyMessage="Resolva questões para ver seus acertos por matéria."
          />
          <SubjectMetricChart
            title="Erros por Matéria"
            data={errosChart}
            chartType={chartType}
            unit="q"
            emptyMessage="Resolva questões para ver seus erros por matéria."
          />
        </div>
      </section>

      {totalQuestoes === 0 && (
        <div className="cp-card p-8 text-center">
          <p className="font-medium text-cp-text">Nenhuma questão liberada ainda</p>
          <p className="mt-2 text-sm text-cp-muted">
            O administrador precisa gerar e liberar questões no Edital Verticalizado.
          </p>
          <Link to="/edital-verticalizado" className="cp-btn-primary mt-6 inline-flex">
            Ir ao Edital Verticalizado
          </Link>
        </div>
      )}

      {totalQuestoes > 0 && (
        <div className="grid gap-4 lg:grid-cols-[minmax(260px,320px)_1fr]">
          {/* Sidebar */}
          <div className="noji-deck-panel cp-card flex flex-col overflow-hidden lg:max-h-[calc(100vh-12rem)]">
            <div className="border-b border-cp-border p-4">
              <p className="text-sm font-semibold text-cp-text">Questões por matéria</p>
              <p className="mb-3 text-[11px] text-cp-muted">Tópicos e incidência liberados</p>
              <div className="relative">
                <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cp-muted" />
                <input
                  type="search"
                  value={sidebarSearch}
                  onChange={(e) => setSidebarSearch(e.target.value)}
                  placeholder="Buscar matéria..."
                  className="w-full rounded-xl border border-cp-border bg-cp-bg/60 py-2.5 pl-9 pr-3 text-sm text-cp-text placeholder:text-cp-muted focus:border-cp-accent/50 focus:outline-none focus:ring-2 focus:ring-cp-accent/20"
                />
              </div>
              <button
                type="button"
                onClick={selectAllQuestoes}
                className={`mt-3 w-full rounded-xl border px-3 py-2.5 text-left text-xs font-medium transition ${
                  selectedMateria === 'Todas'
                    ? 'border-cp-accent/40 bg-cp-accent/15 text-cp-accent'
                    : 'border-cp-border bg-cp-bg/40 text-cp-text hover:border-cp-accent/30'
                }`}
              >
                Todas as questões ({allItems.length})
              </button>
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto p-3">
              {filteredMaterias.map((materia) => {
                const modulos = Object.keys(organized[materia] || {})
                const isExpanded = expandedMaterias[materia]
                const totalInMateria = modulos.reduce(
                  (acc, mod) => acc + (organized[materia][mod]?.length || 0),
                  0,
                )
                const deckHue = [...materia].reduce((a, c) => a + c.charCodeAt(0), 0) % 360

                return (
                  <div
                    key={materia}
                    className="overflow-hidden rounded-2xl border border-cp-border/80 bg-cp-bg/20"
                  >
                    <button
                      type="button"
                      onClick={() => toggleMateria(materia)}
                      className="flex w-full items-center gap-2.5 px-3 py-3 text-left text-sm transition hover:bg-cp-surface/50"
                    >
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white shadow-sm"
                        style={{ background: `hsl(${deckHue}, 65%, 52%)` }}
                      >
                        {materia.charAt(0).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-cp-text">{materia}</span>
                        <span className="text-[10px] text-cp-muted">
                          {modulos.length} grupos · {totalInMateria} questões
                        </span>
                      </span>
                      <span className="shrink-0 font-mono text-[10px] text-cp-muted">
                        {totalInMateria}
                      </span>
                      {isExpanded ? (
                        <ChevronDownIcon className="h-4 w-4 shrink-0 text-cp-muted" />
                      ) : (
                        <ChevronRightIcon className="h-4 w-4 shrink-0 text-cp-muted" />
                      )}
                    </button>

                    {isExpanded && (
                      <div className="space-y-0.5 border-t border-cp-border/50 px-2 py-2">
                        {modulos.map((modulo) => {
                          const items = organized[materia][modulo] || []
                          const isSelected =
                            selectedMateria === materia && selectedModulo === modulo

                          return (
                            <button
                              key={modulo}
                              type="button"
                              onClick={() => selectDeck(materia, modulo, items)}
                              className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs transition ${
                                isSelected
                                  ? 'bg-cp-accent text-white shadow-md'
                                  : 'text-cp-text hover:bg-cp-accent/10'
                              }`}
                            >
                              <span className="min-w-0 flex-1 truncate pr-2">{modulo}</span>
                              <span
                                className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] ${
                                  isSelected ? 'bg-white/20' : 'bg-cp-border/60 text-cp-muted'
                                }`}
                              >
                                {items.length}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Área de prática */}
          <div className="cp-card p-4 sm:p-6">
            {deckItems.length === 0 ? (
              <p className="py-12 text-center text-sm text-cp-muted">
                Selecione uma matéria para começar.
              </p>
            ) : currentQuestao ? (
              <div className="space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wider text-cp-accent">
                      {selectedMateria}
                    </p>
                    <p className="text-sm font-semibold text-cp-text">{selectedModulo}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-cp-muted">
                      {currentIndex + 1}/{deckItems.length}
                    </span>
                    <button
                      type="button"
                      onClick={handlePesquisarGoogle}
                      className="noji-tool-btn"
                      title="Pesquisar no Google"
                    >
                      <MagnifyingGlassIcon className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={handleShuffle}
                      className="noji-tool-btn"
                      title="Embaralhar"
                    >
                      <ArrowPathIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="h-1.5 overflow-hidden rounded-full bg-cp-border/60">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cp-accent to-cp-accent2 transition-all"
                    style={{
                      width: `${((currentIndex + 1) / deckItems.length) * 100}%`,
                    }}
                  />
                </div>

                {(sessionStats.correct > 0 || sessionStats.wrong > 0) && (
                  <div className="flex flex-wrap gap-3 text-xs">
                    <span className="inline-flex items-center gap-1 text-emerald-500">
                      <CheckCircleIcon className="h-4 w-4" />
                      {sessionStats.correct} acertos nesta sessão
                    </span>
                    <span className="inline-flex items-center gap-1 text-red-500">
                      <XCircleIcon className="h-4 w-4" />
                      {sessionStats.wrong} erros nesta sessão
                    </span>
                  </div>
                )}

                <QuestaoEnunciadoCard
                  assunto={currentQuestao.assunto || currentItem.materia}
                  probabilidade={currentQuestao.probabilidade}
                  enunciado={currentQuestao.enunciado}
                  questionNumber={currentIndex + 1}
                  courseId={courseId}
                  contentId={buildQuestaoContentId({
                    topicKey: currentItem.topicKey || currentItem.materia || 'resolver',
                    nivel: currentItem.nivel || 1,
                    questao: currentQuestao,
                    questionIndex: currentItem.questionIndex ?? currentIndex,
                    packId: currentItem.packId,
                  })}
                  alternateContentIds={[currentItem.id, currentItem.packId].filter(Boolean)}
                  topicKey={currentItem.topicKey || null}
                  ilustracao={currentQuestao.ilustracao}
                  textoBase={currentQuestao.textoBase}
                />

                {!showResult ? (
                  <QuestaoAlternativas
                    tipoProva={currentItem.tipoProva}
                    questao={currentQuestao}
                    showResult={false}
                    modoAdminNavegacao={false}
                    selectedAnswer={selectedAnswer}
                    onAnswer={handleAnswer}
                  />
                ) : (
                  <>
                    <QuestaoAlternativas
                      tipoProva={currentItem.tipoProva}
                      questao={currentQuestao}
                      showResult
                      modoAdminNavegacao={false}
                      selectedAnswer={selectedAnswer}
                      onAnswer={handleAnswer}
                    />
                    <QuestaoExplicacao
                      explicacao={resolveQuestaoExplicacao(currentQuestao)}
                    />
                    <div className="flex gap-3">
                      {currentIndex > 0 && (
                        <button
                          type="button"
                          onClick={handlePrev}
                          className="cp-btn-ghost flex-1 justify-center"
                        >
                          ← Anterior
                        </button>
                      )}
                      {currentIndex < deckItems.length - 1 ? (
                        <button
                          type="button"
                          onClick={handleNext}
                          className="cp-btn-primary flex-1 justify-center"
                        >
                          Próxima →
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setCurrentIndex(0)
                            setSelectedAnswer(null)
                            setShowResult(false)
                          }}
                          className="cp-btn-primary flex-1 justify-center"
                        >
                          Recomeçar deck
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}

      {!hasEdital && totalQuestoes > 0 && (
        <p className="text-center text-xs text-cp-muted">
          Algumas questões podem aparecer sem agrupamento completo — configure o edital para melhor organização.
        </p>
      )}
    </div>
  )
}

export default ResolverQuestoesView
