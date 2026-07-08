import { CONTENT_STATUS } from '../utils/contentStatus'

const ContentPublishButton = ({
  status,
  onToggle,
  disabled = false,
  size = 'sm',
  className = '',
  hint = null,
}) => {
  const isAvailable = status === CONTENT_STATUS.AVAILABLE
  const sizeClass =
    size === 'xs'
      ? 'px-2 py-1 text-[10px]'
      : 'px-3 py-1.5 text-xs'

  return (
    <div className={`inline-flex flex-col items-end gap-0.5 ${className}`}>
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        className={`inline-flex items-center gap-1 rounded-lg font-semibold transition disabled:opacity-50 ${sizeClass} ${
          isAvailable
            ? 'border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400'
            : 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
        }`}
      >
        {isAvailable ? '🔒 Ocultar' : '🔓 Disponibilizar'}
      </button>
      {hint ? <span className="text-[10px] text-cp-muted max-w-[200px] text-right">{hint}</span> : null}
    </div>
  )
}

export default ContentPublishButton
