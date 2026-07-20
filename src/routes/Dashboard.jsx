import { Link } from 'react-router-dom'
import {
  ArrowRightIcon,
  BoltIcon,
  ChartBarSquareIcon,
  CommandLineIcon,
  CpuChipIcon,
  FlagIcon,
  FolderOpenIcon,
  MapIcon,
  PencilSquareIcon,
  QueueListIcon,
  RocketLaunchIcon,
  SignalIcon,
} from '@heroicons/react/24/outline'
import { useAuth } from '../hooks/useAuth'
import OnlineNowBadge from '@/components/cp/OnlineNowBadge'
import FloatingWhatsAppButton from '@/components/FloatingWhatsAppButton'
import { useTopicNotifications } from '../hooks/useTopicNotifications'
import RedacoesDashboardCard from '../components/RedacoesDashboardCard'

const quickLinks = [
  {
    to: '/flashcards',
    code: '01',
    title: 'Flashcards com IA',
    desc: 'Repetição espaçada por tópico',
    icon: CpuChipIcon,
    tone: 'violet',
  },
  {
    to: '/resolver-questoes',
    code: '02',
    title: 'Resolver Questões',
    desc: 'Questões liberadas com gráficos de acertos',
    icon: CommandLineIcon,
    tone: 'cyan',
  },
  {
    to: '/resolver-material',
    code: '03',
    title: 'Materiais Liberados',
    desc: 'Materiais do edital já disponíveis',
    icon: FolderOpenIcon,
    tone: 'violet',
  },
  {
    to: '/resolver-incidencia',
    code: '04',
    title: 'Incidência',
    desc: 'Estude conteúdo e prática por incidência das matérias',
    icon: BoltIcon,
    tone: 'pink',
  },
  {
    to: '/edital-verticalizado',
    code: '05',
    title: 'Edital Verticalizado',
    desc: 'Conteúdo organizado do edital',
    icon: QueueListIcon,
    tone: 'cyan',
  },
  {
    to: '/guia-mentorado',
    code: '06',
    title: 'Guia Mentorado',
    desc: 'Cronograma estratégico',
    icon: MapIcon,
    tone: 'pink',
  },
  {
    to: '/vespera-de-prova',
    code: '07',
    title: 'Véspera de Prova',
    desc: 'Revisão final antes da prova',
    icon: FlagIcon,
    tone: 'cyan',
  },
  {
    to: '/treino-redacao',
    code: '08',
    title: 'Treino de Redação',
    desc: 'Tema semanal · limite 2/semana · notas e evolução',
    icon: PencilSquareIcon,
    tone: 'violet',
  },
  {
    to: '/trilha',
    code: '09',
    title: 'Trilha',
    desc: 'Tempo líquido, ciclo e metas de estudo',
    icon: RocketLaunchIcon,
    tone: 'cyan',
  },
  {
    to: '/comunidade',
    code: '10',
    title: 'Comunidade',
    desc: 'Feed de estudos, seguidores e curtidas',
    icon: SignalIcon,
    tone: 'pink',
  },
  {
    to: '/calendario',
    code: '11',
    title: 'Progresso',
    desc: 'Gráficos, questões e flashcards por matéria',
    icon: ChartBarSquareIcon,
    tone: 'amber',
  },
]

const toneStyles = {
  violet: {
    border: 'hover:border-[color-mix(in_srgb,var(--cp-accent)_45%,transparent)]',
    glow: 'group-hover:shadow-[0_0_28px_color-mix(in_srgb,var(--cp-accent)_18%,transparent)]',
    icon: 'text-[var(--cp-accent)] border-[color-mix(in_srgb,var(--cp-accent)_35%,transparent)] bg-[color-mix(in_srgb,var(--cp-accent)_10%,transparent)]',
    bar: 'bg-[var(--cp-accent)]',
    code: 'text-[var(--cp-accent)]',
  },
  cyan: {
    border: 'hover:border-[color-mix(in_srgb,var(--cp-accent-2)_45%,transparent)]',
    glow: 'group-hover:shadow-[0_0_28px_color-mix(in_srgb,var(--cp-accent-2)_18%,transparent)]',
    icon: 'text-[var(--cp-accent-2)] border-[color-mix(in_srgb,var(--cp-accent-2)_35%,transparent)] bg-[color-mix(in_srgb,var(--cp-accent-2)_10%,transparent)]',
    bar: 'bg-[var(--cp-accent-2)]',
    code: 'text-[var(--cp-accent-2)]',
  },
  pink: {
    border: 'hover:border-[color-mix(in_srgb,var(--cp-accent-3)_45%,transparent)]',
    glow: 'group-hover:shadow-[0_0_28px_color-mix(in_srgb,var(--cp-accent-3)_18%,transparent)]',
    icon: 'text-[var(--cp-accent-3)] border-[color-mix(in_srgb,var(--cp-accent-3)_35%,transparent)] bg-[color-mix(in_srgb,var(--cp-accent-3)_10%,transparent)]',
    bar: 'bg-[var(--cp-accent-3)]',
    code: 'text-[var(--cp-accent-3)]',
  },
  amber: {
    border: 'hover:border-[color-mix(in_srgb,var(--cp-accent-4)_45%,transparent)]',
    glow: 'group-hover:shadow-[0_0_28px_color-mix(in_srgb,var(--cp-accent-4)_18%,transparent)]',
    icon: 'text-[var(--cp-accent-4)] border-[color-mix(in_srgb,var(--cp-accent-4)_35%,transparent)] bg-[color-mix(in_srgb,var(--cp-accent-4)_10%,transparent)]',
    bar: 'bg-[var(--cp-accent-4)]',
    code: 'text-[var(--cp-accent-4)]',
  },
}

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
    '/vespera-de-prova':
      notifications.filter((n) => !n.read && n.contentType === 'vespera').length || null,
  }

  return (
    <div className="relative pb-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.55]"
        style={{
          backgroundImage:
            'linear-gradient(var(--cp-grid-line) 1px, transparent 1px), linear-gradient(90deg, var(--cp-grid-line) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
          maskImage: 'radial-gradient(ellipse 90% 70% at 50% 20%, black 15%, transparent 75%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-20 top-0 -z-10 h-56 w-56 rounded-full blur-3xl"
        style={{ background: 'var(--cp-aurora-1)' }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 top-24 -z-10 h-48 w-48 rounded-full blur-3xl"
        style={{ background: 'var(--cp-aurora-2)' }}
      />

      <div className="mb-8 animate-fade-in">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <img
            src="/course-icons/logo.png"
            alt="FlashConCards"
            width={48}
            height={48}
            className="h-12 w-12 rounded-xl object-contain ring-1 ring-[color-mix(in_srgb,var(--cp-accent)_30%,transparent)] shadow-[0_0_24px_color-mix(in_srgb,var(--cp-accent)_22%,transparent)]"
            onError={(e) => {
              e.currentTarget.src = '/course-icons/logosite.png'
            }}
          />
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-[var(--cp-accent)]">
              FlashConCards // SYS
            </p>
            <span className="cp-badge cp-badge-accent mt-1">Dashboard</span>
          </div>
        </div>
        <h1 className="cp-headline text-3xl sm:text-4xl">
          Olá,{' '}
          <span className="cp-gradient-text">
            {user?.displayName?.split(' ')[0] || 'estudante'}
          </span>
        </h1>
        <p className="mt-2 max-w-xl text-sm text-cp-muted sm:text-base">
          Acesso rápido às ferramentas de estudo — módulos sincronizados com o seu curso.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <OnlineNowBadge platformWide />
          {unreadCount > 0 ? (
            <span className="rounded-lg border border-[color-mix(in_srgb,var(--cp-accent)_35%,transparent)] bg-[color-mix(in_srgb,var(--cp-accent)_10%,transparent)] px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--cp-accent)]">
              {unreadCount} novidade{unreadCount !== 1 ? 's' : ''}
            </span>
          ) : null}
        </div>
      </div>

      <div className="animate-fade-in">
        <div className="mb-4 flex items-center justify-between gap-3">
          <span className="cp-badge">Acesso rápido</span>
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-cp-muted">
            {quickLinks.length} módulos
          </span>
        </div>

        <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <RedacoesDashboardCard />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {quickLinks.map((link) => {
            const Icon = link.icon
            const tone = toneStyles[link.tone] || toneStyles.violet
            const badge = cardBadges[link.to]

            return (
              <Link
                key={link.to}
                to={link.to}
                className={`cp-tech-card group relative overflow-hidden p-5 ${tone.border} ${tone.glow}`}
              >
                <div className={`absolute left-0 top-0 h-full w-[2px] ${tone.bar} opacity-80`} />
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                  style={{
                    background:
                      'linear-gradient(135deg, color-mix(in srgb, var(--cp-accent) 6%, transparent), transparent 55%)',
                  }}
                />

                <div className="relative flex items-start justify-between gap-3">
                  <div
                    className={`flex h-11 w-11 items-center justify-center rounded-xl border transition duration-300 group-hover:scale-[1.04] ${tone.icon}`}
                  >
                    <Icon className="h-5 w-5" strokeWidth={1.75} />
                  </div>
                  <span className={`font-mono text-[10px] tracking-[0.18em] ${tone.code}`}>
                    #{link.code}
                  </span>
                </div>

                <h3 className="relative mt-4 flex items-center gap-2 font-display text-sm font-bold tracking-tight text-cp-text sm:text-[15px]">
                  {link.title}
                  {badge ? (
                    <span className="rounded-md bg-[var(--cp-accent)] px-1.5 py-0.5 font-mono text-[10px] font-bold text-[var(--cp-bg)]">
                      {badge}
                    </span>
                  ) : null}
                </h3>
                <p className="relative mt-1.5 text-xs leading-relaxed text-cp-muted">{link.desc}</p>

                <div className="relative mt-4 flex items-center justify-between">
                  <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-cp-muted transition group-hover:text-cp-text">
                    Abrir módulo
                  </span>
                  <ArrowRightIcon className="h-4 w-4 text-cp-muted transition duration-300 group-hover:translate-x-1 group-hover:text-[var(--cp-accent)]" />
                </div>
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
