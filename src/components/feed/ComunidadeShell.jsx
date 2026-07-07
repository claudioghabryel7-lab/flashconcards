import { Link } from 'react-router-dom'
import { ArrowLeft, Compass, Users } from 'lucide-react'
import UserAvatar from '../UserAvatar'
import TopicNotificationsButton from '../TopicNotificationsButton'

export default function ComunidadeShell({
  title = 'Comunidade',
  backHref = null,
  user,
  profile,
  children,
}) {
  return (
    <div className="mx-auto min-h-screen w-full max-w-3xl border-x border-cp-border bg-cp-bg pb-16 text-cp-text sm:max-w-[720px]">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-cp-border bg-cp-bg/95 px-4 py-3 backdrop-blur-md">
        <div className="flex min-w-0 items-center gap-2">
          {backHref && (
            <Link
              to={backHref}
              className="shrink-0 text-cp-muted transition hover:text-cp-text"
              aria-label="Voltar"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
          )}
          {!backHref && <Users className="h-5 w-5 shrink-0 text-cp-accent" />}
          <h1 className="truncate font-display text-lg font-bold tracking-tight text-cp-text">
            {title}
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          {user && <TopicNotificationsButton />}
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
      </header>
      {children}
    </div>
  )
}
