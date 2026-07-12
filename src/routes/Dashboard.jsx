import { Link } from 'react-router-dom'
import {
  ClockIcon,
  LightBulbIcon,
  SparklesIcon,
} from '@heroicons/react/24/solid'
import { ArrowRightIcon as ArrowRightOutline, DocumentTextIcon, UserGroupIcon, ChartBarIcon } from '@heroicons/react/24/outline'
import { useAuth } from '../hooks/useAuth'
import OnlineNowBadge from '@/components/cp/OnlineNowBadge'
import FloatingWhatsAppButton from '@/components/FloatingWhatsAppButton'
import { useTopicNotifications } from '../hooks/useTopicNotifications'

const quickLinks = [
  { to: '/flashcards', title: 'Flashcards com IA', desc: 'Repetição espaçada por tópico', icon: SparklesIcon, accent: 'cp-card-accent-violet' },
  { to: '/resolver-questoes', title: 'Resolver Questões', desc: 'Questões liberadas com gráficos de acertos', icon: ChartBarIcon, accent: 'cp-card-accent-cyan' },
  { to: '/resolver-material', title: 'Materiais Liberados', desc: 'Materiais do edital já disponíveis', icon: DocumentTextIcon, accent: 'cp-card-accent-violet' },
  { to: '/edital-verticalizado', title: 'Edital Verticalizado', desc: 'Conteúdo organizado do edital', icon: DocumentTextIcon, accent: 'cp-card-accent-cyan' },
  { to: '/guia-mentorado', title: 'Guia Mentorado', desc: 'Cronograma estratégico', icon: LightBulbIcon, accent: 'cp-card-accent-pink' },
  { to: '/vespera-de-prova', title: 'Véspera de Prova', desc: 'Revisão final antes da prova', icon: ClockIcon, accent: 'cp-card-accent-cyan' },
  { to: '/treino-redacao', title: 'Treino de Redação', desc: 'Pratique redações com IA', icon: DocumentTextIcon, accent: 'cp-card-accent-violet' },
  { to: '/trilha', title: 'Trilha', desc: 'Tempo líquido, ciclo e metas de estudo', icon: ClockIcon, accent: 'cp-card-accent-cyan' },
  { to: '/comunidade', title: 'Comunidade', desc: 'Feed de estudos, seguidores e curtidas', icon: UserGroupIcon, accent: 'cp-card-accent-pink' },
  { to: '/calendario', title: 'Progresso', desc: 'Gráficos, questões e flashcards por matéria', icon: ClockIcon, accent: 'cp-card-accent-pink' },
]

const Dashboard = () => {
  const { user, profile } = useAuth()
  const courseId = profile?.selectedCourseId || 'alego-default'
  const { notifications, unreadCount } = useTopicNotifications(user?.uid, courseId)

  const badgeFor = (contentType) => {
    const count = notifications.filter((n) => !n.read && n.contentType === contentType).length
    return count > 0 ? count : null
  }

  const cardBadges = {
    '/flashcards': badgeFor('flashcards'),
    '/resolver-material': badgeFor('material'),
    '/resolver-questoes': badgeFor('questoes'),
    '/vespera-de-prova': notifications.filter((n) => !n.read && n.contentType === 'vespera').length || null,
  }

  return (
    <div className="pb-10">
      <div className="mb-8 animate-fade-in">
        <span className="cp-badge cp-badge-accent">Dashboard</span>
        <h1 className="cp-headline mt-4 text-3xl sm:text-4xl">
          Olá, <span className="cp-gradient-text">{user?.displayName?.split(' ')[0] || 'estudante'}</span>
        </h1>
        <p className="mt-2 text-cp-muted">Acesso rápido às ferramentas de estudo</p>
        <div className="mt-4">
          <OnlineNowBadge platformWide />
        </div>
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
                <h3 className="text-sm font-medium text-cp-text flex items-center gap-2">
                  {link.title}
                  {cardBadges[link.to] ? (
                    <span className="rounded-full bg-cp-accent px-2 py-0.5 text-[10px] font-bold text-cp-bg">
                      {cardBadges[link.to]}
                    </span>
                  ) : null}
                </h3>
                <p className="mt-1 text-xs text-cp-muted">{link.desc}</p>
                <ArrowRightOutline className="mt-3 h-4 w-4 text-cp-accent transition group-hover:translate-x-1" />
              </Link>
            )
          })}
        </div>
      </div>
      <FloatingWhatsAppButton />
    </div>
  )
}

export default Dashboard
