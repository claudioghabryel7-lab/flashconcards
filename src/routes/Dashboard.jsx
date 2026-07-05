import { Link } from 'react-router-dom'
import {
  ClockIcon,
  LightBulbIcon,
  CheckCircleIcon,
  SparklesIcon,
} from '@heroicons/react/24/solid'
import { ArrowRightIcon as ArrowRightOutline, DocumentTextIcon } from '@heroicons/react/24/outline'
import { useAuth } from '../hooks/useAuth'
import LGPDConsent from '../components/LGPDConsent'

const quickLinks = [
  { to: '/flashcards', title: 'Flashcards com IA', desc: 'Repetição espaçada por tópico', icon: SparklesIcon, accent: 'cp-card-accent-violet' },
  { to: '/edital-verticalizado', title: 'Edital Verticalizado', desc: 'Conteúdo organizado do edital', icon: DocumentTextIcon, accent: 'cp-card-accent-cyan' },
  { to: '/guia-mentorado', title: 'Guia Mentorado', desc: 'Cronograma estratégico', icon: LightBulbIcon, accent: 'cp-card-accent-pink' },
  { to: '/vespera-de-prova', title: 'Véspera de Prova', desc: 'Revisão final antes da prova', icon: ClockIcon, accent: 'cp-card-accent-cyan' },
  { to: '/treino-redacao', title: 'Treino de Redação', desc: 'Pratique redações com IA', icon: DocumentTextIcon, accent: 'cp-card-accent-violet' },
  { to: '/materia-revisada', title: 'Matéria Revisada', desc: 'Registro do que você revisou', icon: CheckCircleIcon, accent: 'cp-card-accent-amber' },
]

const Dashboard = () => {
  const { user } = useAuth()

  return (
    <div className="pb-10">
      <div className="mb-8 animate-fade-in">
        <span className="cp-badge cp-badge-accent">Dashboard</span>
        <h1 className="cp-headline mt-4 text-3xl sm:text-4xl">
          Olá, <span className="cp-gradient-text">{user?.displayName?.split(' ')[0] || 'estudante'}</span>
        </h1>
        <p className="mt-2 text-cp-muted">Acesso rápido às ferramentas de estudo</p>
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
        </div>
      </div>

      <LGPDConsent />
    </div>
  )
}

export default Dashboard
