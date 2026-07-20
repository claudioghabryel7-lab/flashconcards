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
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] transition disabled:opacity-50 ${
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
    <section className="dash-tile dash-tile--amber relative overflow-hidden p-5 sm:p-6" style={{ '--dash-delay': '0ms' }}>
      <div className="dash-scanline opacity-40" aria-hidden />

      <div className="relative z-[1] flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="cp-badge" style={{ color: 'var(--cp-accent-4)', borderColor: 'color-mix(in srgb, var(--cp-accent-4) 35%, transparent)', background: 'color-mix(in srgb, var(--cp-accent-4) 12%, transparent)' }}>
              Matéria do dia
            </span>
            {dayMeta?.incidencia ? (
              <span className="cp-badge-cyan">Incidência</span>
            ) : null}
            <span className="cp-badge text-[9px]">Sync Edital</span>
          </div>
          <h2 className="cp-headline mt-3 text-xl sm:text-2xl">Estudo de hoje</h2>
          <p className="mt-1 flex items-center gap-1.5 text-xs capitalize text-cp-muted">
            <CalendarDaysIcon className="h-3.5 w-3.5 shrink-0" />
            {formatTodayLabel(todayKey)}
          </p>
        </div>

        {!loading && studyable.length > 0 ? (
          <div className="rounded-xl border border-cp-border bg-cp-surface px-3 py-2 text-right">
            <p className="font-mono text-[10px] uppercase tracking-wider text-cp-muted">Check-in</p>
            <p className="text-sm font-medium text-cp-text">
              {doneCount}/{studyable.length}
              <span className="ml-1 text-xs font-normal text-cp-muted">completos</span>
            </p>
          </div>
        ) : null}
      </div>

      {dayMeta?.descricao ? (
        <p className="relative mt-3 text-xs text-cp-muted line-clamp-2">{dayMeta.descricao}</p>
      ) : null}

      <div className="relative mt-4 space-y-3">
        {loading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-xl border border-cp-border bg-cp-surface" />
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
          <div className="rounded-xl border border-dashed border-cp-border bg-cp-surface px-4 py-5">
            <p className="text-sm text-cp-text">Nenhuma matéria programada para hoje.</p>
            <p className="mt-1 text-xs text-cp-muted">
              Gere ou confira o cronograma no Guia Mentorado.
            </p>
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
              return (
                <div
                  key={`inc-${topic.disciplina}`}
                  className="rounded-xl border border-cp-border bg-cp-surface/80 p-4"
                >
                  <p className="font-mono text-[10px] uppercase tracking-wider text-cp-muted">
                    Revisão · incidência
                  </p>
                  <h3 className="mt-1 text-sm font-medium text-cp-text">{topic.disciplina}</h3>
                  <p className="mt-0.5 text-xs text-cp-muted">{topic.topicoNome}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link
                      to="/edital-verticalizado"
                      className="inline-flex items-center gap-1 rounded-lg border border-cp-accent/25 bg-cp-accent/10 px-2.5 py-1.5 font-mono text-[10px] text-cp-accent transition hover:bg-cp-accent/20"
                    >
                      <BookOpenIcon className="h-3.5 w-3.5" />
                      Abrir edital
                    </Link>
                    <Link
                      to={`/guia-mentorado/${courseId}/${todayKey}`}
                      className="inline-flex items-center gap-1 rounded-lg border border-cp-border px-2.5 py-1.5 font-mono text-[10px] text-cp-muted transition hover:border-cp-accent/30 hover:text-cp-text"
                    >
                      Ver dia no Guia
                    </Link>
                  </div>
                </div>
              )
            }

            return (
              <article
                key={pKey || topic.topicKey}
                className="rounded-xl border border-cp-border bg-cp-surface/80 p-4 transition hover:border-cp-accent/25"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-[10px] uppercase tracking-wider text-cp-muted">
                      {topic.disciplina}
                    </p>
                    <h3 className="mt-0.5 text-sm font-medium leading-snug text-cp-text">
                      {topic.topicoNome}
                    </h3>
                  </div>
                  {check.flashcards && check.questoes && check.estudado ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] text-emerald-600 dark:text-emerald-400">
                      <CheckCircleIcon className="h-3.5 w-3.5" />
                      Dia ok
                    </span>
                  ) : null}
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
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
                    Flashcards
                  </Link>
                  <Link
                    to={`/questoes-topic/${courseId}/${topicKeyUrl}?nome=${nome}`}
                    className="inline-flex items-center gap-1 rounded-lg border border-cp-accent2/25 bg-cp-accent2/10 px-2.5 py-1.5 font-mono text-[10px] text-cp-accent2 transition hover:bg-cp-accent2/20"
                  >
                    <FireIcon className="h-3.5 w-3.5" />
                    Questões
                  </Link>
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5 border-t border-cp-border pt-3">
                  <CheckChip
                    label="Material"
                    checked={check.estudado}
                    disabled={busy}
                    onClick={() => handleToggle(topic, 'estudado')}
                    accent="border-emerald-500/35 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                  />
                  <CheckChip
                    label="Flashcards"
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
          className="relative mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-cp-accent transition hover:gap-2"
        >
          Ver dia completo no Guia
          <ArrowRightIcon className="h-3.5 w-3.5" />
        </Link>
      ) : null}
    </section>
  )
}
