import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import {
  BookOpenIcon,
  CheckCircleIcon,
  SparklesIcon,
  FireIcon,
  ArrowRightIcon,
  CalendarDaysIcon,
  BoltIcon,
} from '@heroicons/react/24/outline'
import { CheckIcon } from '@heroicons/react/24/solid'
import { db } from '../../firebase/config'
import { loadEditalVerticalizado } from '../../utils/editalVerticalizadoLoader'
import { extractTopicsForMateriaDoDia } from '../../utils/guiaMentoradoTopics'
import { normalizeTopicKeyForStorage } from '../../utils/topicKeyFirestore'
import {
  getTopicCheckin,
  loadUserEditalProgress,
  toggleTopicCheckin,
  topicProgressKey,
} from '../../services/userEditalProgressService'

function todaySaoPaulo() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

function formatTodayLabel(iso) {
  try {
    const [y, m, d] = iso.split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    })
  } catch {
    return iso
  }
}

function CheckChip({ checked, label, onClick, disabled, accent }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-mono text-[10px] transition disabled:opacity-50 ${
        checked
          ? accent
          : 'border-cp-border bg-cp-surface text-cp-muted hover:border-cp-accent/30 hover:text-cp-text'
      }`}
      title={checked ? `${label} feito` : `Marcar ${label}`}
    >
      <span
        className={`flex h-3.5 w-3.5 items-center justify-center rounded-full border ${
          checked ? 'border-transparent bg-white/25' : 'border-current'
        }`}
      >
        {checked ? <CheckIcon className="h-2.5 w-2.5" /> : null}
      </span>
      {label}
    </button>
  )
}

export default function MateriaDoDiaCard({ user, courseId }) {
  const todayKey = useMemo(() => todaySaoPaulo(), [])
  const [loading, setLoading] = useState(true)
  const [dayMeta, setDayMeta] = useState(null)
  const [topics, setTopics] = useState([])
  const [progress, setProgress] = useState({})
  const [savingKey, setSavingKey] = useState(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!user?.uid || !courseId) {
      setLoading(false)
      setTopics([])
      setDayMeta(null)
      return
    }
    setLoading(true)
    setError('')
    try {
      const monthKey = todayKey.slice(0, 7)
      const [cronSnap, edital, progressMap] = await Promise.all([
        getDoc(doc(db, 'courses', courseId, 'cronograma', monthKey)),
        loadEditalVerticalizado(courseId).catch(() => null),
        loadUserEditalProgress(user.uid, courseId),
      ])

      const day = cronSnap.exists() ? cronSnap.data()?.days?.[todayKey] || null : null
      setDayMeta(
        day
          ? {
              tipo: day.tipo || day.type || 'estudo',
              descricao: day.descricao || '',
              incidencia: Boolean(day.incidencia || day.tipo === 'incidencia'),
            }
          : null,
      )
      setTopics(day ? extractTopicsForMateriaDoDia({ ...day, data: todayKey }, edital) : [])
      setProgress(progressMap || {})
    } catch (err) {
      console.error('[MateriaDoDia]', err)
      setError(err?.message || 'Não foi possível carregar a matéria do dia.')
      setTopics([])
      setDayMeta(null)
    } finally {
      setLoading(false)
    }
  }, [user?.uid, courseId, todayKey])

  useEffect(() => {
    load()
  }, [load])

  const handleToggle = async (topic, campo) => {
    const key = topicProgressKey(topic)
    if (!key || !user?.uid || !courseId) return
    setSavingKey(`${key}:${campo}`)
    try {
      const { progress: next } = await toggleTopicCheckin({
        uid: user.uid,
        courseId,
        topicKey: key,
        campo,
        disciplinaNome: topic.disciplina,
        topicoNome: topic.topicoNome,
      })
      setProgress(next)
    } catch (err) {
      console.error(err)
      alert(err?.message || 'Erro ao salvar check-in.')
    } finally {
      setSavingKey(null)
    }
  }

  const doneCount = topics.reduce((acc, t) => {
    if (t.incidencia || !topicProgressKey(t)) return acc
    const c = getTopicCheckin(progress, topicProgressKey(t))
    return acc + (c.flashcards && c.questoes && c.estudado ? 1 : 0)
  }, 0)

  const studyable = topics.filter((t) => !t.incidencia && topicProgressKey(t))

  return (
    <section
      className="dash-focus relative max-w-full min-w-0 overflow-hidden p-4 sm:p-5"
      style={{ '--dash-delay': '0ms' }}
    >
      <div className="relative z-[1] flex max-w-full min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-full flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-cp-accent-4">
              Hoje
            </span>
            {dayMeta?.incidencia ? (
              <span className="rounded-md border border-cp-accent2/30 bg-cp-accent2/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-cp-accent2">
                Incidência
              </span>
            ) : null}
          </div>
          <h2 className="cp-headline mt-1.5 break-words text-xl sm:text-2xl">
            {dayMeta?.incidencia ? 'Revisão de incidência' : 'Matéria do dia'}
          </h2>
          <p className="mt-1 flex items-center gap-1.5 text-xs capitalize text-cp-muted">
            <CalendarDaysIcon className="h-3.5 w-3.5 shrink-0" />
            {formatTodayLabel(todayKey)}
          </p>
        </div>

        {!loading && studyable.length > 0 ? (
          <div className="rounded-lg border border-cp-border/80 bg-cp-surface/60 px-3 py-2 text-right">
            <p className="font-mono text-[9px] uppercase tracking-wider text-cp-muted">Done</p>
            <p className="text-sm font-medium text-cp-text">
              {doneCount}/{studyable.length}
            </p>
          </div>
        ) : null}
      </div>

      {dayMeta?.descricao ? (
        <p className="relative mt-2 text-xs text-cp-muted line-clamp-1">{dayMeta.descricao}</p>
      ) : null}

      <div className="relative mt-4 space-y-2.5">
        {loading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl border border-cp-border bg-cp-surface" />
            ))}
          </div>
        ) : error ? (
          <p className="rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-3 text-sm text-red-500">
            {error}
          </p>
        ) : !courseId ? (
          <p className="rounded-xl border border-cp-border bg-cp-surface px-3 py-4 text-sm text-cp-muted">
            Selecione um curso no perfil para ver a matéria do dia.
          </p>
        ) : topics.length === 0 ? (
          <div className="rounded-xl border border-dashed border-cp-border bg-cp-surface/50 px-4 py-5">
            <p className="text-sm text-cp-text">Nada programado para hoje.</p>
            <Link
              to="/guia-mentorado"
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-cp-accent transition hover:gap-2"
            >
              Abrir Guia Mentorado
              <ArrowRightIcon className="h-3.5 w-3.5" />
            </Link>
          </div>
        ) : (
          topics.map((topic) => {
            const pKey = topicProgressKey(topic)
            const check = getTopicCheckin(progress, pKey)
            const topicKeyUrl = pKey
            const topicKeyParam = encodeURIComponent(normalizeTopicKeyForStorage(pKey || topic.topicKey || ''))
            const nome = encodeURIComponent(topic.topicoNome || '')
            const modulo = encodeURIComponent(topic.modulo || topic.topicoNome || '')
            const disc = encodeURIComponent(topic.disciplina || '')
            const busy = savingKey?.startsWith(`${pKey}:`)

            if (topic.incidencia) {
              const idx = Number.isInteger(topic.disciplinaIdx) ? topic.disciplinaIdx : -1
              const hasIdx = idx >= 0
              return (
                <div
                  key={`inc-${topic.disciplina}`}
                  className="rounded-xl border border-cp-accent2/25 bg-cp-accent2/5 p-3.5"
                >
                  <p className="font-mono text-[9px] uppercase tracking-wider text-cp-accent2">
                    1 matéria · revisão completa
                  </p>
                  <h3 className="mt-1 text-sm font-medium text-cp-text">{topic.disciplina}</h3>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {hasIdx ? (
                      <>
                        <Link
                          to={`/conteudo-incidencia/${courseId}/${idx}`}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-cp-accent2/30 bg-cp-accent2/15 px-2.5 py-1.5 font-mono text-[10px] text-cp-accent2 transition hover:bg-cp-accent2/25"
                        >
                          <BoltIcon className="h-3.5 w-3.5" />
                          Abrir revisão
                        </Link>
                        <Link
                          to={`/pratica-incidencia/${courseId}/${idx}`}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-cp-border px-2.5 py-1.5 font-mono text-[10px] text-cp-muted transition hover:border-cp-accent/30 hover:text-cp-text"
                        >
                          <FireIcon className="h-3.5 w-3.5" />
                          Praticar
                        </Link>
                      </>
                    ) : (
                      <Link
                        to={`/guia-mentorado/${courseId}/${todayKey}`}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-cp-border px-2.5 py-1.5 font-mono text-[10px] text-cp-muted transition hover:text-cp-text"
                      >
                        Ver no Guia
                      </Link>
                    )}
                  </div>
                </div>
              )
            }

            return (
              <article
                key={pKey || topic.topicKey}
                className="rounded-xl border border-cp-border/80 bg-cp-surface/50 p-3.5 transition hover:border-cp-accent/30"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="break-words font-mono text-[9px] uppercase tracking-wider text-cp-muted">
                      {topic.disciplina}
                    </p>
                    <h3 className="mt-0.5 break-words text-sm font-medium leading-snug text-cp-text">
                      {topic.topicoNome}
                    </h3>
                  </div>
                  {check.flashcards && check.questoes && check.estudado ? (
                    <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-[9px] text-emerald-600 dark:text-emerald-400">
                      <CheckCircleIcon className="h-3.5 w-3.5" />
                      Ok
                    </span>
                  ) : null}
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Link
                    to={`/conteudo-completo/topic/${courseId}/${topicKeyUrl}?nome=${nome}`}
                    className="inline-flex items-center gap-1 rounded-lg border border-cp-border bg-cp-bg-elevated px-2.5 py-1.5 font-mono text-[10px] text-cp-text transition hover:border-cp-accent/40 hover:text-cp-accent"
                  >
                    <BookOpenIcon className="h-3.5 w-3.5" />
                    Material
                  </Link>
                  <Link
                    to={`/flashcards/topico/${courseId}?disciplina=${disc}&modulo=${modulo}&topicKey=${topicKeyParam}`}
                    className="inline-flex items-center gap-1 rounded-lg border border-cp-accent/25 bg-cp-accent/10 px-2.5 py-1.5 font-mono text-[10px] text-cp-accent transition hover:bg-cp-accent/20"
                  >
                    <SparklesIcon className="h-3.5 w-3.5" />
                    Flash
                  </Link>
                  <Link
                    to={`/questoes-topic/${courseId}/${topicKeyUrl}?nome=${nome}`}
                    className="inline-flex items-center gap-1 rounded-lg border border-cp-accent2/25 bg-cp-accent2/10 px-2.5 py-1.5 font-mono text-[10px] text-cp-accent2 transition hover:bg-cp-accent2/20"
                  >
                    <FireIcon className="h-3.5 w-3.5" />
                    Questões
                  </Link>
                </div>

                <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-cp-border/60 pt-2.5">
                  <CheckChip
                    label="Material"
                    checked={check.estudado}
                    disabled={busy}
                    onClick={() => handleToggle(topic, 'estudado')}
                    accent="border-emerald-500/35 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                  />
                  <CheckChip
                    label="Flash"
                    checked={check.flashcards}
                    disabled={busy}
                    onClick={() => handleToggle(topic, 'flashcards')}
                    accent="border-cp-accent/40 bg-cp-accent/15 text-cp-accent"
                  />
                  <CheckChip
                    label="Questões"
                    checked={check.questoes}
                    disabled={busy}
                    onClick={() => handleToggle(topic, 'questoes')}
                    accent="border-cp-accent2/40 bg-cp-accent2/15 text-cp-accent2"
                  />
                </div>
              </article>
            )
          })
        )}
      </div>

      {courseId && topics.length > 0 ? (
        <Link
          to={`/guia-mentorado/${courseId}/${todayKey}`}
          className="relative mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-cp-accent transition hover:gap-2"
        >
          Dia completo no Guia
          <ArrowRightIcon className="h-3.5 w-3.5" />
        </Link>
      ) : null}
    </section>
  )
}
