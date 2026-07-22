import { Link } from 'react-router-dom'
import { ArrowLeft, Compass, Users } from 'lucide-react'
import UserAvatar from '../UserAvatar'
import CommunityNotificationsButton from './CommunityNotificationsButton'
import { SITE_NAME } from '@/lib/site'

export default function ComunidadeShell({
  title = 'Comunidade',
  backHref = null,
  user,
  profile,
  children,
}) {
  return (
    <div className="dash-tech-shell mx-auto min-h-screen w-full max-w-3xl overflow-hidden border-x border-cp-border bg-cp-bg pb-16 text-cp-text sm:max-w-[720px]">
      <header className="dash-hero sticky top-0 z-20 !mb-0 !rounded-none border-x-0 border-t-0 p-3 sm:p-4">
        <div className="dash-hero-grid opacity-30" aria-hidden />
        <div className="dash-hero-glow dash-hero-glow--a !opacity-30" aria-hidden />
        <div className="relative z-[1] flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            {backHref ? (
              <Link
                to={backHref}
                className="shrink-0 text-cp-muted transition hover:text-cp-text"
                aria-label="Voltar"
              >
                <ArrowLeft className="h-5 w-5" />
              </Link>
            ) : (
              <Users className="h-4 w-4 shrink-0 text-cp-accent" />
            )}
            <div className="min-w-0">
              <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-cp-accent">
                {SITE_NAME}
              </p>
              <h1 className="truncate font-display text-base font-bold tracking-tight text-cp-text sm:text-lg">
                {title}
              </h1>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2.5">
            {user && <CommunityNotificationsButton userId={user.uid} />}
            <Link
              to="/trilha"
              className="text-cp-muted transition hover:text-cp-accent"
              title="Ir para a Trilha"
            >
              <Compass className="h-5 w-5" />
            </Link>
            {user && (
              <Link to={`/profile/${user.uid}`}>
                <UserAvatar
                  photoBase64={profile?.photoBase64}
                  name={profile?.displayName || user.email}
                  size="sm"
                />
              </Link>
            )}
          </div>
        </div>
      </header>
      {children}
    </div>
  )
}
