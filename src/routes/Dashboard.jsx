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
    tone: 'violet',
  },
  {
    to: '/resolver-questoes',
    title: 'Questões',
    desc: 'Resolva e acompanhe seus acertos',
    icon: FireIcon,
    tone: 'cyan',
  },
  {
    to: '/edital-verticalizado',
    title: 'Edital',
    desc: 'Conteúdo verticalizado do concurso',
    icon: BookOpenIcon,
    tone: 'success',
  },
  {
    to: '/guia-mentorado',
    title: 'Guia Mentorado',
    desc: 'Cronograma até a prova',
    icon: AcademicCapIcon,
    tone: 'amber',
  },
  {
    to: '/vespera-de-prova',
    title: 'Véspera',
    desc: 'Revisão final antes da prova',
    icon: BoltIcon,
    tone: 'pink',
  },
  {
    to: '/trilha',
    title: 'Trilha',
    desc: 'Tempo líquido, ciclo e metas',
    icon: MapIcon,
    tone: 'cyan',
  },
  {
    to: '/comunidade',
    title: 'Comunidade',
    desc: 'Feed, seguidores e curtidas',
    icon: UserGroupIcon,
    tone: 'pink',
  },
  {
    to: '/calendario',
    title: 'Progresso',
    desc: 'Gráficos e histórico de estudo',
    icon: ChartBarIcon,
    tone: 'violet',
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
    <div className="dash-tech-shell pb-10">
      <header className="dash-hero mb-5 p-4 sm:mb-7 sm:p-7">
        <div className="dash-hero-grid" aria-hidden />
        <div className="dash-hero-glow dash-hero-glow--a" aria-hidden />
        <div className="dash-hero-glow dash-hero-glow--b" aria-hidden />
        <div className="dash-hero-glow dash-hero-glow--c" aria-hidden />
        <div className="dash-scanline" aria-hidden />

        <div className="relative z-[1] min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="cp-badge-accent">FlashConCards</span>
            <span className="dash-chip-live">
              <span className="dash-live-dot" aria-hidden />
              Ao vivo
            </span>
            <span className="cp-badge">Dashboard</span>
          </div>
          <h1 className="cp-headline mt-3 break-words text-2xl sm:mt-4 sm:text-4xl md:text-[2.85rem]">
            Olá, <span className="cp-gradient-text">{firstName}</span>
          </h1>
          <p className="mt-2 max-w-xl text-sm text-cp-muted sm:text-base">
            Central tech do concurso — matéria do dia, check-in sincronizado com o Edital e atalhos.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2 sm:gap-3">
            <OnlineNowBadge courseId={courseId} />
            {courseId ? (
              <Link
                to="/guia-mentorado"
                className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-cp-accent2/30 bg-cp-accent2/10 px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-cp-accent2 transition hover:bg-cp-accent2/20"
              >
                <ClockIcon className="h-3.5 w-3.5" />
                Cronograma
              </Link>
            ) : null}
          </div>
        </div>
      </header>

      <div className="mb-6" style={{ animation: 'dash-rise 0.45s ease-out both' }}>
        <MateriaDoDiaCard user={user} courseId={courseId} />
      </div>

      <div className="mb-8">
        <Link
          to="/treino-redacao"
          className="dash-tile dash-tile--violet group block p-5"
          style={{ '--dash-delay': '60ms' }}
        >
          <div className="relative z-[1] flex items-start justify-between gap-4">
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
            <div className="dash-tile-icon shrink-0">
              <DocumentTextIcon className="h-5 w-5" />
            </div>
          </div>
          <ArrowRightIcon className="dash-tile-arrow relative z-[1] mt-3 h-4 w-4" />
        </Link>
      </div>

      <div>
        <div className="mb-4 flex items-center justify-between gap-2">
          <span className="cp-badge-cyan">Ferramentas</span>
          <span className="hidden font-mono text-[10px] uppercase tracking-wider text-cp-muted sm:inline">
            Acesso rápido
          </span>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {quickLinks.map((link, index) => {
            const Icon = link.icon
            return (
              <Link
                key={link.to}
                to={link.to}
                className={`dash-tile dash-tile--${link.tone} group p-5`}
                style={{ '--dash-delay': `${80 + index * 45}ms` }}
              >
                <div className="relative z-[1]">
                  <div className="dash-tile-icon mb-4">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-sm font-medium text-cp-text">{link.title}</h3>
                  <p className="mt-1 text-xs text-cp-muted">{link.desc}</p>
                  <ArrowRightIcon className="dash-tile-arrow mt-3 h-4 w-4" />
                </div>
              </Link>
            )
          })}
          <Link
            to="/treino-redacao"
            className="dash-tile dash-tile--violet group p-5"
            style={{ '--dash-delay': `${80 + quickLinks.length * 45}ms` }}
          >
            <div className="relative z-[1]">
              <div className="dash-tile-icon mb-4">
                <DocumentTextIcon className="h-5 w-5" />
              </div>
              <h3 className="text-sm font-medium text-cp-text">Redação</h3>
              <p className="mt-1 text-xs text-cp-muted">{redacaoDesc}</p>
              <ArrowRightIcon className="dash-tile-arrow mt-3 h-4 w-4" />
            </div>
          </Link>
        </div>
      </div>

      <LGPDConsent />
    </div>
  )
}

export default Dashboard
