import { Users } from 'lucide-react'
import { useSimulatedOnlineCount } from '@/hooks/useSimulatedOnlineCount'

type OnlineNowBadgeProps = {
  /** Filtrar por curso (páginas de curso). Omita ou use platformWide para contagem global. */
  courseId?: string | null
  /** Conta todos os alunos online na plataforma — mesmo número para todos os usuários. */
  platformWide?: boolean
  className?: string
  compact?: boolean
}

export default function OnlineNowBadge({
  courseId,
  platformWide = false,
  className = '',
  compact = false,
}: OnlineNowBadgeProps) {
  const onlineCount = useSimulatedOnlineCount({ courseId, platformWide })

  const title = platformWide
    ? 'Alunos estudando na plataforma agora'
    : courseId
      ? 'Alunos deste curso estudando agora'
      : 'Alunos estudando agora'

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 font-mono text-[10px] text-emerald-300 ${className}`}
      title={title}
    >
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
      </span>
      <Users className="h-3 w-3" />
      {onlineCount}
      {!compact && <span className="hidden sm:inline">online agora</span>}
    </span>
  )
}
