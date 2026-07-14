/**
 * Cabeçalho tech compartilhado das rotas hub (dashboard → módulos).
 */
export default function TechHubHeader({
  badge = 'Módulo',
  title,
  description,
  icon: Icon,
  code,
  tone = 'violet',
  children,
}) {
  const toneClass =
    {
      violet: 'text-[var(--cp-accent)] border-[color-mix(in_srgb,var(--cp-accent)_35%,transparent)] bg-[color-mix(in_srgb,var(--cp-accent)_10%,transparent)]',
      cyan: 'text-[var(--cp-accent-2)] border-[color-mix(in_srgb,var(--cp-accent-2)_35%,transparent)] bg-[color-mix(in_srgb,var(--cp-accent-2)_10%,transparent)]',
      pink: 'text-[var(--cp-accent-3)] border-[color-mix(in_srgb,var(--cp-accent-3)_35%,transparent)] bg-[color-mix(in_srgb,var(--cp-accent-3)_10%,transparent)]',
      amber: 'text-[var(--cp-accent-4)] border-[color-mix(in_srgb,var(--cp-accent-4)_35%,transparent)] bg-[color-mix(in_srgb,var(--cp-accent-4)_10%,transparent)]',
      red: 'text-red-400 border-red-400/35 bg-red-400/10',
    }[tone] || ''

  return (
    <section className="cp-tech-card relative overflow-hidden p-4 sm:p-6">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.5]"
        style={{
          backgroundImage:
            'linear-gradient(var(--cp-grid-line) 1px, transparent 1px), linear-gradient(90deg, var(--cp-grid-line) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
          maskImage: 'radial-gradient(ellipse 80% 70% at 0% 0%, black 10%, transparent 70%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full blur-3xl"
        style={{ background: 'var(--cp-aurora-1)' }}
      />

      <div className="relative flex flex-wrap items-start gap-4">
        {Icon ? (
          <div
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border ${toneClass}`}
          >
            <Icon className="h-6 w-6" strokeWidth={1.75} />
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="cp-badge cp-badge-accent">{badge}</span>
            {code ? (
              <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-cp-muted">
                MOD //{code}
              </span>
            ) : null}
          </div>
          <h2 className="cp-headline text-xl sm:text-2xl">{title}</h2>
          {description ? <p className="mt-1.5 text-sm text-cp-muted">{description}</p> : null}
          {children}
        </div>
      </div>
    </section>
  )
}
