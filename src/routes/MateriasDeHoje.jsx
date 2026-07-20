import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import {
  AcademicCapIcon,
  BookOpenIcon,
  CheckCircleIcon,
  DocumentTextIcon,
  QueueListIcon,
  RectangleStackIcon,
} from '@heroicons/react/24/outline'
import { CheckCircleIcon as CheckCircleSolid } from '@heroicons/react/24/solid'
import { db } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'
import { CPPageHeader } from '@/components/cp/CPPageLayout'
import { loadEditalVerticalizado } from '../utils/editalVerticalizadoLoader'
import { extractTopicsFromCronogramaDay } from '../utils/guiaMentoradoTopics'
import { buildTopicContentLink } from '../utils/topicContentLinks'
import {
  getTopicCheckins,
  loadUserEditalProgress,
  toggleUserEditalCheckin,
} from '../services/userEditalCheckinService'

function todayKeySP() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

const CHECKIN_LABELS = {
  estudado: 'Material',
  questoes: 'Questões',
  flashcards: 'Flashcards',
}

const MateriasDeHoje = () => {
  const { user, profile } = useAuth()
  const courseId = profile?.selectedCourseId || ''

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [dayMeta, setDayMeta] = useState(null)
  const [topics, setTopics] = useState([])
  const [progressMap, setProgressMap] = useState({})
  const [savingKey, setSavingKey] = useState('')
  const todayKey = useMemo(() => todayKeySP(), [])

  const reload = useCallback(async () => {
    if (!courseId || !user?.uid) {
      setLoading(false)
      setTopics([])
      return
    }

    setLoading(true)
    setError('')
    try {
      const monthKey = todayKey.slice(0, 7)
      const [edital, cronSnap, progress] = await Promise.all([
        loadEditalVerticalizado(courseId),
        getDoc(doc(db, 'courses', courseId, 'cronograma', monthKey)),
        loadUserEditalProgress(user.uid, courseId),
      ])

      const dayEntry = cronSnap.exists() ? cronSnap.data()?.days?.[todayKey] || null : null
      setDayMeta(dayEntry)
      setProgressMap(progress || {})

      if (!dayEntry) {
        setTopics([])
        return
      }

      const tipo = dayEntry.tipo || dayEntry.type || 'estudo'
      if (tipo === 'simulado' || tipo === 'descanso') {
        setTopics([])
        return
      }

      const resolved = extractTopicsFromCronogramaDay(
        { ...dayEntry, data: todayKey, dayKey: todayKey },
        edital,
      )
      setTopics(resolved)
    } catch (err) {
      console.error('[MateriasDeHoje]', err)
      setError(err?.message || 'Não foi possível carregar as matérias de hoje.')
      setTopics([])
    } finally {
      setLoading(false)
    }
  }, [courseId, todayKey, user?.uid])

  useEffect(() => {
    reload()
  }, [reload])

  const handleToggle = async (topic, campo) => {
    if (!user?.uid || !courseId) return
    const meta = {
      topicoNumero: topic.topicoNumero,
      topicoNome: topic.topicoNome,
      topicKey: topic.topicKey,
    }
    const saveId = `${topic.topicKey}:${campo}`
    setSavingKey(saveId)
    try {
      const result = await toggleUserEditalCheckin({
        userId: user.uid,
        courseId,
        topicMeta: meta,
        campo,
        disciplinaNome: topic.disciplina || '',
      })
      setProgressMap(result.progress)
    } catch (err) {
      console.error(err)
      alert(err?.message || 'Erro ao salvar check-in.')
    } finally {
      setSavingKey('')
    }
  }

  const dayType = dayMeta?.tipo || dayMeta?.type || null
  const emptyReason = !dayMeta
    ? 'Sem matérias no cronograma para hoje.'
    : dayType === 'descanso'
      ? 'Hoje é dia de descanso no Guia Mentorado.'
      : dayType === 'simulado'
        ? 'Hoje é dia de simulado — sem tópicos de estudo listados.'
        : topics.length === 0
          ? 'Nenhum tópico resolvido para hoje.'
          : null

  const totalCheckins = topics.length * 3
  const doneCheckins = topics.reduce((sum, t) => {
    return sum + getTopicCheckins(progressMap, {
      topicoNumero: t.topicoNumero,
      topicoNome: t.topicoNome,
      topicKey: t.topicKey,
    }).doneCount
  }, 0)

  return (
    <div className="cp-legacy-root space-y-6 pb-10">
      <CPPageHeader
        badge="Hoje"
        title="Matérias de hoje"
        subtitle="Estude o material, as questões e os flashcards do dia e marque o check-in — o Edital Verticalizado sincroniza junto."
        backHref="/dashboard"
        backLabel="Dashboard"
      />

      <div className="flex flex-wrap items-center gap-2 text-sm text-cp-muted">
        <span className="rounded-lg border border-cp-border bg-cp-surface/60 px-2.5 py-1 font-mono text-[11px]">
          {todayKey}
        </span>
        {!loading && topics.length > 0 ? (
          <span className="rounded-lg border border-cp-border bg-cp-surface/60 px-2.5 py-1 text-xs">
            Check-ins: {doneCheckins}/{totalCheckins}
          </span>
        ) : null}
        <Link
          to="/edital-verticalizado"
          className="inline-flex items-center gap-1 text-xs text-[var(--cp-accent)] hover:underline"
        >
          <QueueListIcon className="h-3.5 w-3.5" />
          Ver Edital Verticalizado
        </Link>
      </div>

      {loading ? (
        <div className="cp-card p-6 text-sm text-cp-muted">Carregando matérias de hoje…</div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-300">
          {error}
        </div>
      ) : null}

      {!loading && !error && emptyReason ? (
        <div className="cp-card space-y-3 p-6">
          <p className="text-sm text-cp-muted">{emptyReason}</p>
          <Link
            to="/guia-mentorado"
            className="inline-flex text-sm font-medium text-[var(--cp-accent)] hover:underline"
          >
            Abrir Guia Mentorado
          </Link>
        </div>
      ) : null}

      {!loading && topics.length > 0 ? (
        <div className="space-y-4">
          {topics.map((topic) => {
            const checkins = getTopicCheckins(progressMap, {
              topicoNumero: topic.topicoNumero,
              topicoNome: topic.topicoNome,
              topicKey: topic.topicKey,
            })

            const links = [
              {
                key: 'estudado',
                label: 'Material',
                icon: BookOpenIcon,
                href: buildTopicContentLink({
                  courseId,
                  topicKey: topic.topicKey,
                  contentType: 'material',
                  disciplinaNome: topic.disciplina,
                  topicoNome: topic.topicoNome,
                  moduloLabel: topic.modulo,
                }),
              },
              {
                key: 'questoes',
                label: 'Questões',
                icon: DocumentTextIcon,
                href: buildTopicContentLink({
                  courseId,
                  topicKey: topic.topicKey,
                  contentType: 'questao',
                  disciplinaNome: topic.disciplina,
                  topicoNome: topic.topicoNome,
                  moduloLabel: topic.modulo,
                }),
              },
              {
                key: 'flashcards',
                label: 'Flashcards',
                icon: RectangleStackIcon,
                href: buildTopicContentLink({
                  courseId,
                  topicKey: topic.topicKey,
                  contentType: 'flashcard',
                  disciplinaNome: topic.disciplina,
                  topicoNome: topic.topicoNome,
                  moduloLabel: topic.modulo,
                }),
              },
            ]

            return (
              <div
                key={topic.topicKey}
                className={`cp-card space-y-4 overflow-hidden p-4 ${
                  checkins.allDone ? 'ring-1 ring-emerald-500/25' : ''
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-cp-muted">
                      {topic.disciplina || 'Disciplina'}
                    </p>
                    <h2 className="mt-1 font-display text-base font-bold text-cp-text">
                      {topic.modulo || topic.topicoNome}
                    </h2>
                  </div>
                  {checkins.allDone ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[10px] font-semibold uppercase text-emerald-700 dark:text-emerald-300">
                      <CheckCircleSolid className="h-3.5 w-3.5" />
                      Dia completo
                    </span>
                  ) : (
                    <span className="rounded-full border border-cp-border px-2.5 py-1 text-[10px] font-semibold uppercase text-cp-muted">
                      {checkins.doneCount}/3
                    </span>
                  )}
                </div>

                <div className="grid gap-2 sm:grid-cols-3">
                  {links.map(({ key, label, icon: Icon, href }) => {
                    const checked = checkins[key]
                    const busy = savingKey === `${topic.topicKey}:${key}`
                    return (
                      <div
                        key={key}
                        className="flex flex-col gap-2 rounded-xl border border-cp-border bg-cp-surface/40 p-3"
                      >
                        <Link
                          to={href}
                          className="inline-flex items-center gap-2 text-sm font-medium text-cp-text hover:text-[var(--cp-accent)]"
                        >
                          <Icon className="h-4 w-4 shrink-0 text-[var(--cp-accent)]" />
                          Estudar {label}
                        </Link>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleToggle(topic, key)}
                          className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
                            checked
                              ? 'border border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                              : 'border border-cp-border bg-cp-bg/40 text-cp-muted hover:border-[var(--cp-accent)]/40 hover:text-cp-text'
                          }`}
                          title={
                            checked
                              ? `Desmarcar ${CHECKIN_LABELS[key]} no Edital`
                              : `Marcar ${CHECKIN_LABELS[key]} no Edital`
                          }
                        >
                          {checked ? (
                            <CheckCircleSolid className="h-4 w-4" />
                          ) : (
                            <CheckCircleIcon className="h-4 w-4" />
                          )}
                          {busy
                            ? 'Salvando…'
                            : checked
                              ? `${CHECKIN_LABELS[key]} ✓`
                              : `Check-in ${CHECKIN_LABELS[key]}`}
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      ) : null}

      {!courseId ? (
        <div className="cp-card flex items-start gap-3 p-4 text-sm text-cp-muted">
          <AcademicCapIcon className="mt-0.5 h-5 w-5 text-[var(--cp-accent)]" />
          <div>
            Selecione um curso para ver as matérias de hoje.
            <div className="mt-2">
              <Link to="/select-course" className="text-[var(--cp-accent)] hover:underline">
                Escolher curso
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default MateriasDeHoje
