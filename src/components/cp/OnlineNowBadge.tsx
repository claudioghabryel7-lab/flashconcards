import { Users } from 'lucide-react'
import { useCourseOnlineCount } from '@/hooks/useCourseOnlineCount'

type OnlineNowBadgeProps = {
  courseId?: string | null
  className?: string
  compact?: boolean
}

export default function OnlineNowBadge({
  courseId,
  className = '',
  compact = false,
}: OnlineNowBadgeProps) {
  const { displayCount } = useCourseOnlineCount(courseId || null, {
    fallbackSeed: courseId || 'global',
  })

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 font-mono text-[10px] text-emerald-300 ${className}`}
      title="Alunos online agora"
    >
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
      </span>
      <Users className="h-3 w-3" />
      {displayCount}
      {!compact && <span className="hidden sm:inline">online agora</span>}
    </span>
  )
}
