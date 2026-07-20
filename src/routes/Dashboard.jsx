import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AcademicCapIcon,
  ArrowRightIcon,
  BookOpenIcon,
  BoltIcon,
  ChartBarIcon,
  ClockIcon,
  DocumentTextIcon,
  FireIcon,
  MapIcon,
  SparklesIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline'
import { useAuth } from '../hooks/useAuth'
import LGPDConsent from '../components/LGPDConsent'
import OnlineNowBadge from '@/components/cp/OnlineNowBadge'
import MateriaDoDiaCard from '../components/dashboard/MateriaDoDiaCard'
import { getRedacaoSummary, getWeeklyRedacaoQuota } from '../services/redacaoStudentService'
import { MAX_REDACOES_POR_SEMANA } from '../utils/redacaoWeek'

const quickLinks = [
  {
    to: '/flashcards',
    title: 'Flashcards',
    desc: 'Repetição espaçada por tópico',
    icon: SparklesIcon,
    accent: 'cp-card-accent-violet',
  },
  {
    to: '/resolver-questoes',
    title: 'Questões',
    desc: 'Resolva e acompanhe seus acertos',
    icon: FireIcon,
    accent: 'cp-card-accent-cyan',
  },
  {
    to: '/edital-verticalizado',
    title: 'Edital',
    desc: 'Conteúdo verticalizado do concurso',
    icon: BookOpenIcon,
    accent: 'cp-card-accent-cyan',
  },
  {
    to: '/guia-mentorado',
    title: 'Guia Mentorado',
    desc: 'Cronograma até a prova',
    icon: AcademicCapIcon,
    accent: 'cp-card-accent-amber',
  },
  {
    to: '/vespera-de-prova',
    title: 'Véspera',
    desc: 'Revisão final antes da prova',
    icon: BoltIcon,
    accent: 'cp-card-accent-pink',
  },
  {
    to: '/trilha',
    title: 'Trilha',
    desc: 'Tempo líquido, ciclo e metas',
    icon: MapIcon,
    accent: 'cp-card-accent-cyan',
  },
  {
    to: '/comunidade',
    title: 'Comunidade',
    desc: 'Feed, seguidores e curtidas',
    icon: UserGroupIcon,
    accent: 'cp-card-accent-pink',
  },
  {
    to: '/calendario',
    title: 'Progresso',
    desc: 'Gráficos e histórico de estudo',
    icon: ChartBarIcon,
    accent: 'cp-card-accent-violet',
  },
]

const Dashboard = () => {
  const { user, profile } = useAuth()
  const courseId = profile?.selectedCourseId || null
  const firstName = user?.displayName?.split(' ')[0] || 'estudante'
  const [redacaoStats, setRedacaoStats] = useState({
    total: null,
    weekUsed: null,
    weekMax: MAX_REDACOES_POR_SEMANA,
  })

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!user?.uid || !courseId) {
        if (!cancelled) {
          setRedacaoStats({ total: null, weekUsed: null, weekMax: MAX_REDACOES_POR_SEMANA })
        }
        return
      }
      try {
        const [summary, quota] = await Promise.all([
          getRedacaoSummary(user.uid, courseId),
          getWeeklyRedacaoQuota(user.uid, courseId),
        ])
        if (cancelled) return
        setRedacaoStats({
          total: Number(summary?.total ?? 0) || 0,
          weekUsed: Number(quota?.used ?? 0) || 0,
          weekMax: Number(quota?.max ?? MAX_REDACOES_POR_SEMANA) || MAX_REDACOES_POR_SEMANA,
        })
      } catch {
        if (!cancelled) {
          setRedacaoStats({ total: 0, weekUsed: 0, weekMax: MAX_REDACOES_POR_SEMANA })
        }
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [user?.uid, courseId])

  const redacaoDesc =
    redacaoStats.total == null
      ? 'Tema semanal com correção por IA'
      : `${redacaoStats.total} redação${redacaoStats.total === 1 ? '' : 'ões'} · semana ${redacaoStats.weekUsed}/${redacaoStats.weekMax}`

  return (
    <div className="pb-10">
      <header className="relative mb-8 overflow-hidden rounded-2xl border border-cp-border bg-cp-bg-elevated p-5 sm:p-7 animate-fade-in">
        <div
          className="pointer-events-none absolute inset-0 opacity-90"
          style={{
            background:
              'radial-gradient(ellipse 80% 60% at 100% 0%, color-mix(in srgb, var(--cp-accent) 18%, transparent), transparent 55%), radial-gradient(ellipse 50% 40% at 0% 100%, color-mix(in srgb, var(--cp-accent-2) 14%, transparent), transparent 50%)',
          }}
          aria-hidden
        />
        <div className="relative">
          <div className="flex flex-wrap items-center gap-2">
            <span className="cp-badge-accent">FlashConCards</span>
            <span className="cp-badge">Dashboard</span>
          </div>
          <h1 className="cp-headline mt-4 text-3xl sm:text-4xl md:text-[2.75rem]">
            Olá, <span className="cp-gradient-text">{firstName}</span>
          </h1>
          <p className="mt-2 max-w-xl text-sm text-cp-muted sm:text-base">
            Sua central de estudo — matéria do dia, check-in e atalhos do concurso.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <OnlineNowBadge courseId={courseId} />
            {courseId ? (
              <Link
                to="/guia-mentorado"
                className="inline-flex items-center gap-1.5 rounded-full border border-cp-border bg-cp-surface px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-cp-muted transition hover:border-cp-accent/30 hover:text-cp-accent"
              >
                <ClockIcon className="h-3.5 w-3.5" />
                Cronograma
              </Link>
            ) : null}
          </div>
        </div>
      </header>

      <div className="mb-6 animate-fade-in">
        <MateriaDoDiaCard user={user} courseId={courseId} />
      </div>

      <div className="mb-8 animate-fade-in">
        <Link
          to="/treino-redacao"
          className="cp-card cp-card-accent-violet group relative block overflow-hidden p-5 transition"
        >
          <div
            className="pointer-events-none absolute -right-10 top-0 h-32 w-32 rounded-full opacity-50"
            style={{
              background:
                'radial-gradient(circle, color-mix(in srgb, var(--cp-accent) 40%, transparent), transparent 70%)',
            }}
            aria-hidden
          />
          <div className="relative flex items-start justify-between gap-4">
            <div>
              <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-cp-muted">
                Treino de Redação
              </p>
              <h2 className="text-lg font-medium text-cp-text">
                {redacaoStats.total == null
                  ? 'Pratique redação'
                  : `${redacaoStats.total} redação${redacaoStats.total === 1 ? '' : 'ões'} feitas`}
              </h2>
              <p className="mt-1 text-xs text-cp-muted">
                {redacaoStats.weekUsed == null
                  ? 'Tema semanal do Guia Mentorado / Professor IA'
                  : `Nesta semana: ${redacaoStats.weekUsed} de ${redacaoStats.weekMax} · novo tema a cada 7 dias`}
              </p>
            </div>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-cp-accent/25 bg-cp-accent/10 text-cp-accent transition group-hover:shadow-cp-glow">
              <DocumentTextIcon className="h-5 w-5" />
            </div>
          </div>
          <ArrowRightIcon className="relative mt-3 h-4 w-4 text-cp-accent transition group-hover:translate-x-1" />
        </Link>
      </div>

      <div className="animate-fade-in">
        <div className="mb-4 flex items-center justify-between gap-2">
          <span className="cp-badge">Ferramentas</span>
          <span className="hidden font-mono text-[10px] uppercase tracking-wider text-cp-muted sm:inline">
            Acesso rápido
          </span>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {quickLinks.map((link) => {
            const Icon = link.icon
            return (
              <Link
                key={link.to}
                to={link.to}
                className={`cp-card group relative overflow-hidden p-5 transition ${link.accent}`}
              >
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-cp-border bg-cp-surface text-cp-accent transition group-hover:border-cp-accent/35 group-hover:shadow-cp-glow">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="text-sm font-medium text-cp-text">{link.title}</h3>
                <p className="mt-1 text-xs text-cp-muted">{link.desc}</p>
                <ArrowRightIcon className="mt-3 h-4 w-4 text-cp-accent transition group-hover:translate-x-1" />
              </Link>
            )
          })}
          <Link
            to="/treino-redacao"
            className="cp-card cp-card-accent-violet group relative overflow-hidden p-5 transition"
          >
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-cp-accent/25 bg-cp-accent/10 text-cp-accent transition group-hover:shadow-cp-glow">
              <DocumentTextIcon className="h-5 w-5" />
            </div>
            <h3 className="text-sm font-medium text-cp-text">Redação</h3>
            <p className="mt-1 text-xs text-cp-muted">{redacaoDesc}</p>
            <ArrowRightIcon className="mt-3 h-4 w-4 text-cp-accent transition group-hover:translate-x-1" />
          </Link>
        </div>
      </div>

      <LGPDConsent />
    </div>
  )
}

export default Dashboard
