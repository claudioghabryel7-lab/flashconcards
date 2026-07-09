import { Users } from 'lucide-react'
import { useCourseOnlineDisplay } from '@/hooks/useCourseOnlineDisplay'

type OnlineNowBadgeProps = {
  /** Filtrar por curso (páginas de curso). Omita ou use platformWide para contagem global. */
  courseId?: string | null
  /** Conta todos os alunos online na plataforma — sempre tempo real. */
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
  const { count, loading, isSimulated } = useCourseOnlineDisplay({
    courseId,
    platformWide,
  })

  const title = platformWide
    ? 'Alunos online na plataforma agora (tempo real)'
    : isSimulated
      ? 'Alunos online neste curso (contagem simulada)'
      : courseId
        ? 'Alunos deste curso online agora (tempo real)'
        : 'Alunos online agora (tempo real)'

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
      {loading ? '…' : count}
      {!compact && <span className="hidden sm:inline">online agora</span>}
    </span>
  )
}
