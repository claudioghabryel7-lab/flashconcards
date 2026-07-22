import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AcademicCapIcon,
  ArrowRightIcon,
  BookOpenIcon,
  BoltIcon,
  ChartBarIcon,
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
import { getWeeklyRedacaoQuota } from '../services/redacaoStudentService'
import { MAX_REDACOES_POR_SEMANA } from '../utils/redacaoWeek'
import { SITE_NAME } from '@/lib/site'

const railLinks = [
  { to: '/flashcards', title: 'Flashcards', icon: SparklesIcon, tone: 'violet' },
  { to: '/resolver-questoes', title: 'Questões', icon: FireIcon, tone: 'cyan' },
  { to: '/edital-verticalizado', title: 'Edital', icon: BookOpenIcon, tone: 'success' },
  { to: '/guia-mentorado', title: 'Guia', icon: AcademicCapIcon, tone: 'amber' },
  { to: '/vespera-de-prova', title: 'Véspera', icon: BoltIcon, tone: 'pink' },
  { to: '/trilha', title: 'Trilha', icon: MapIcon, tone: 'cyan' },
  { to: '/comunidade', title: 'Comunidade', icon: UserGroupIcon, tone: 'pink' },
  { to: '/calendario', title: 'Progresso', icon: ChartBarIcon, tone: 'violet' },
  { to: '/treino-redacao', title: 'Redação', icon: DocumentTextIcon, tone: 'violet' },
]

const Dashboard = () => {
  const { user, profile } = useAuth()
  const courseId = profile?.selectedCourseId || null
  const firstName = user?.displayName?.split(' ')[0] || 'estudante'
  const [redacaoWeek, setRedacaoWeek] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!user?.uid || !courseId) {
        if (!cancelled) setRedacaoWeek(null)
        return
      }
      try {
        const quota = await getWeeklyRedacaoQuota(user.uid, courseId)
        if (!cancelled) {
          setRedacaoWeek({
            used: Number(quota?.used ?? 0) || 0,
            max: Number(quota?.max ?? MAX_REDACOES_POR_SEMANA) || MAX_REDACOES_POR_SEMANA,
          })
        }
      } catch {
        if (!cancelled) setRedacaoWeek({ used: 0, max: MAX_REDACOES_POR_SEMANA })
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [user?.uid, courseId])

  return (
    <div className="dash-tech-shell dash-perf w-full max-w-full min-w-0 overflow-x-clip pb-10">
      <header className="dash-hero mb-5 max-w-full overflow-hidden p-4 sm:mb-6 sm:p-6">
        <div className="dash-hero-grid" aria-hidden />
        <div className="dash-hero-glow dash-hero-glow--a" aria-hidden />
        <div className="dash-hero-glow dash-hero-glow--b" aria-hidden />
        <div className="dash-scanline" aria-hidden />

        <div className="relative z-[1] flex min-w-0 max-w-full flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-cp-accent">
              {SITE_NAME}
            </p>
            <h1 className="cp-headline mt-2 break-words text-2xl sm:text-3xl md:text-[2.4rem]">
              Olá, <span className="cp-gradient-text">{firstName}</span>
            </h1>
            <p className="mt-1.5 max-w-md text-sm text-cp-muted">
              Foque no que importa hoje — estudo, check-in e ritmo.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <OnlineNowBadge courseId={courseId} />
            {courseId ? (
              <Link
                to="/guia-mentorado"
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-cp-accent2/30 bg-cp-accent2/10 px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-cp-accent2 transition hover:bg-cp-accent2/20"
              >
                Cronograma
                <ArrowRightIcon className="h-3.5 w-3.5" />
              </Link>
            ) : null}
          </div>
        </div>
      </header>

      <div className="mb-5" style={{ animation: 'dash-rise 0.4s ease-out both' }}>
        <MateriaDoDiaCard user={user} courseId={courseId} />
      </div>

      <section className="mb-6" style={{ animation: 'dash-rise 0.45s ease-out both', animationDelay: '60ms' }}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-cp-muted">
            Atalhos
          </span>
          {redacaoWeek ? (
            <Link
              to="/treino-redacao"
              className="font-mono text-[10px] uppercase tracking-wider text-cp-accent transition hover:opacity-80"
            >
              Redação {redacaoWeek.used}/{redacaoWeek.max}
            </Link>
          ) : null}
        </div>
        <div className="dash-rail">
          {railLinks.map((link, index) => {
            const Icon = link.icon
            return (
              <Link
                key={link.to}
                to={link.to}
                className={`dash-rail-item dash-tile--${link.tone}`}
                style={{ '--dash-delay': `${40 + index * 30}ms` }}
              >
                <span className="dash-rail-icon">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="dash-rail-label">{link.title}</span>
              </Link>
            )
          })}
        </div>
      </section>

      <LGPDConsent />
    </div>
  )
}

export default Dashboard
