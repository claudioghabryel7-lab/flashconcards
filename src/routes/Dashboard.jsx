import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ClockIcon,
  LightBulbIcon,
  SparklesIcon,
} from '@heroicons/react/24/solid'
import { ArrowRightIcon as ArrowRightOutline, DocumentTextIcon, UserGroupIcon, ChartBarIcon } from '@heroicons/react/24/outline'
import { useAuth } from '../hooks/useAuth'
import LGPDConsent from '../components/LGPDConsent'
import OnlineNowBadge from '@/components/cp/OnlineNowBadge'
import { getRedacaoSummary, getWeeklyRedacaoQuota } from '../services/redacaoStudentService'
import { MAX_REDACOES_POR_SEMANA } from '../utils/redacaoWeek'

const quickLinks = [
  { to: '/flashcards', title: 'Flashcards com IA', desc: 'Repetição espaçada por tópico', icon: SparklesIcon, accent: 'cp-card-accent-violet' },
  { to: '/resolver-questoes', title: 'Resolver Questões', desc: 'Questões liberadas com gráficos de acertos', icon: ChartBarIcon, accent: 'cp-card-accent-cyan' },
  { to: '/edital-verticalizado', title: 'Edital Verticalizado', desc: 'Conteúdo organizado do edital', icon: DocumentTextIcon, accent: 'cp-card-accent-cyan' },
  { to: '/guia-mentorado', title: 'Guia Mentorado', desc: 'Cronograma estratégico', icon: LightBulbIcon, accent: 'cp-card-accent-pink' },
  { to: '/vespera-de-prova', title: 'Véspera de Prova', desc: 'Revisão final antes da prova', icon: ClockIcon, accent: 'cp-card-accent-cyan' },
  { to: '/trilha', title: 'Trilha', desc: 'Tempo líquido, ciclo e metas de estudo', icon: ClockIcon, accent: 'cp-card-accent-cyan' },
  { to: '/comunidade', title: 'Comunidade', desc: 'Feed de estudos, seguidores e curtidas', icon: UserGroupIcon, accent: 'cp-card-accent-pink' },
  { to: '/calendario', title: 'Progresso', desc: 'Gráficos, questões e flashcards por matéria', icon: ClockIcon, accent: 'cp-card-accent-pink' },
]

const Dashboard = () => {
  const { user, profile } = useAuth()
  const courseId = profile?.selectedCourseId || null
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
      ? 'Pratique redações com IA'
      : `${redacaoStats.total} redação${redacaoStats.total === 1 ? '' : 'ões'} · semana ${redacaoStats.weekUsed}/${redacaoStats.weekMax}`

  return (
    <div className="pb-10">
      <div className="mb-8 animate-fade-in">
        <span className="cp-badge cp-badge-accent">Dashboard</span>
        <h1 className="cp-headline mt-4 text-3xl sm:text-4xl">
          Olá, <span className="cp-gradient-text">{user?.displayName?.split(' ')[0] || 'estudante'}</span>
        </h1>
        <p className="mt-2 text-cp-muted">Acesso rápido às ferramentas de estudo</p>
        <div className="mt-4">
          <OnlineNowBadge courseId={profile?.selectedCourseId ?? null} />
        </div>
      </div>

      <div className="animate-fade-in mb-6">
        <Link
          to="/treino-redacao"
          className="cp-card cp-card-accent-violet group block p-5 transition"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-wider text-cp-muted mb-1">
                Treino de Redação
              </p>
              <h2 className="text-lg font-medium text-cp-text">
                {redacaoStats.total == null
                  ? 'Suas redações'
                  : `${redacaoStats.total} redação${redacaoStats.total === 1 ? '' : 'ões'} feitas`}
              </h2>
              <p className="mt-1 text-xs text-cp-muted">
                {redacaoStats.weekUsed == null
                  ? 'Tema semanal gerado pelo Guia Mentorado / Professor IA'
                  : `Nesta semana: ${redacaoStats.weekUsed} de ${redacaoStats.weekMax} · novo tema a cada 7 dias`}
              </p>
            </div>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cp-border bg-cp-surface text-cp-accent transition group-hover:border-cp-accent/30">
              <DocumentTextIcon className="h-5 w-5" />
            </div>
          </div>
          <ArrowRightOutline className="mt-3 h-4 w-4 text-cp-accent transition group-hover:translate-x-1" />
        </Link>
      </div>

      <div className="animate-fade-in">
        <div className="mb-4 flex items-center gap-2">
          <span className="cp-badge">Acesso rápido</span>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {quickLinks.map((link) => {
            const Icon = link.icon
            return (
              <Link
                key={link.to}
                to={link.to}
                className={`cp-card group p-5 transition ${link.accent}`}
              >
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl border border-cp-border bg-cp-surface text-cp-accent transition group-hover:border-cp-accent/30 group-hover:shadow-cp-glow">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="text-sm font-medium text-cp-text">{link.title}</h3>
                <p className="mt-1 text-xs text-cp-muted">{link.desc}</p>
                <ArrowRightOutline className="mt-3 h-4 w-4 text-cp-accent transition group-hover:translate-x-1" />
              </Link>
            )
          })}
          <Link
            to="/treino-redacao"
            className="cp-card group p-5 transition cp-card-accent-violet"
          >
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl border border-cp-border bg-cp-surface text-cp-accent transition group-hover:border-cp-accent/30 group-hover:shadow-cp-glow">
              <DocumentTextIcon className="h-5 w-5" />
            </div>
            <h3 className="text-sm font-medium text-cp-text">Treino de Redação</h3>
            <p className="mt-1 text-xs text-cp-muted">{redacaoDesc}</p>
            <ArrowRightOutline className="mt-3 h-4 w-4 text-cp-accent transition group-hover:translate-x-1" />
          </Link>
        </div>
      </div>

      <LGPDConsent />
    </div>
  )
}

export default Dashboard
