import { EMAIL_DESIGN, EMAIL_FEATURE_CHIPS, EMAIL_LOGO_URL } from '../../utils/adminEmailAi'

function AuroraOrb({ className, color }) {
  return (
    <div
      className={`pointer-events-none absolute rounded-full blur-2xl ${className}`}
      style={{ background: `radial-gradient(circle, ${color} 0%, transparent 70%)` }}
    />
  )
}

function OrnamentDivider({ color = EMAIL_DESIGN.divider }) {
  return (
    <div className="mx-9 flex items-center gap-3">
      <div className="h-px flex-1" style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }} />
      <span className="text-[10px]" style={{ color: '#c4b5fd' }}>
        ◆
      </span>
      <div className="h-px flex-1" style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }} />
    </div>
  )
}

function BadgePill({ children, accent, border, bg }) {
  return (
    <span
      className="inline-block rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.08em]"
      style={{ color: accent, border: `1px solid ${border}`, background: bg }}
    >
      {children}
    </span>
  )
}

export function EmailDesignPreview({ model }) {
  if (!model?.title && !model?.message) return null

  const d = EMAIL_DESIGN

  return (
    <div
      className="overflow-hidden rounded-2xl border border-slate-200 shadow-inner dark:border-slate-600"
      style={{
        backgroundColor: d.bg,
        backgroundImage: `radial-gradient(${d.gridDot} 1px, transparent 1px)`,
        backgroundSize: '24px 24px',
      }}
    >
      <p className="border-b border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-800">
        Pré-visualização do email
      </p>

      <div className="p-4 sm:p-8">
        <div
          className="relative mx-auto max-w-[600px] overflow-hidden rounded-[20px] bg-white"
          style={{
            border: `1px solid ${d.border}`,
            boxShadow: d.cardShadow,
            fontFamily: 'var(--font-sans)',
          }}
        >
          <div className="h-1" style={{ background: d.gradientStrip }} />

          {/* Hero com auroras */}
          <div className="relative overflow-hidden px-9 pb-7 pt-8 text-center" style={{ background: d.heroBg }}>
            <AuroraOrb className="-left-8 -top-6 h-32 w-32 opacity-80" color={d.aurora1} />
            <AuroraOrb className="-right-6 top-0 h-28 w-28 opacity-70" color={d.aurora2} />
            <AuroraOrb className="bottom-0 left-1/3 h-24 w-40 opacity-60" color={d.aurora3} />

            <div className="relative z-10 flex flex-wrap items-center justify-center gap-2">
              <BadgePill accent={d.accent} border="rgba(124,58,237,0.22)" bg="rgba(124,58,237,0.08)">
                ✦ Comunicado
              </BadgePill>
              <BadgePill accent={d.accent2} border="rgba(8,145,178,0.22)" bg="rgba(8,145,178,0.08)">
                IA Preditiva
              </BadgePill>
            </div>

            <div
              className="relative z-10 mx-auto mt-5 inline-block rounded-[20px] p-1.5"
              style={{ background: 'linear-gradient(135deg, rgba(124,58,237,0.18), rgba(8,145,178,0.18))' }}
            >
              <div className="rounded-2xl bg-white p-3 shadow-[0_8px_24px_rgba(124,58,237,0.14)]">
                <img
                  src={EMAIL_LOGO_URL}
                  alt="Concurseiro Preditivo"
                  className="h-14 w-14 rounded-[14px]"
                />
              </div>
            </div>

            <p
              className="relative z-10 mt-4 text-[11px] font-bold uppercase tracking-[0.14em]"
              style={{ color: d.faint }}
            >
              Concurseiro Preditivo
            </p>

            <h3
              className="relative z-10 mt-2.5 bg-clip-text text-[28px] font-bold leading-tight tracking-tight text-transparent"
              style={{
                fontFamily: 'var(--font-display)',
                backgroundImage: d.gradientText,
              }}
            >
              {model.title || 'Título'}
            </h3>

            <div
              className="relative z-10 mx-auto mt-3 h-[3px] w-12 rounded-full"
              style={{ background: d.gradientStrip }}
            />

            {model.subtitle && (
              <p className="relative z-10 mx-auto mt-3 max-w-md text-[15px] leading-relaxed" style={{ color: d.muted }}>
                {model.subtitle}
              </p>
            )}
          </div>

          <OrnamentDivider />

          {/* Corpo */}
          <div className="space-y-5 px-9 py-7">
            {model.highlight && (
              <div
                className="overflow-hidden rounded-2xl border"
                style={{
                  borderColor: 'rgba(124,58,237,0.14)',
                  background: 'linear-gradient(135deg, rgba(124,58,237,0.07), rgba(8,145,178,0.05))',
                }}
              >
                <div className="h-0.5" style={{ background: d.gradientStrip }} />
                <div className="px-5 py-5">
                  <p
                    className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em]"
                    style={{ color: d.accent }}
                  >
                    ✦ Destaque
                  </p>
                  <p
                    className="text-[19px] font-semibold leading-snug tracking-tight"
                    style={{ fontFamily: 'var(--font-display)', color: d.text }}
                  >
                    {model.highlight}
                  </p>
                </div>
              </div>
            )}

            {model.paragraphs?.map((paragraph, index) => (
              <p key={index} className="text-[16px] leading-[1.8]" style={{ color: d.body }}>
                {paragraph}
              </p>
            ))}

            {model.bullets?.length > 0 && (
              <div className="space-y-2.5 pt-1">
                {model.bullets.map((item, index) => {
                  const accent = d.bulletAccents[index % d.bulletAccents.length]
                  return (
                    <div
                      key={index}
                      className="flex gap-3 rounded-xl border border-zinc-100 bg-[#fafafa] p-3.5"
                      style={{ borderTop: `2px solid ${accent}` }}
                    >
                      <span
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold"
                        style={{
                          fontFamily: 'var(--font-display)',
                          color: accent,
                          background: `${accent}18`,
                        }}
                      >
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <p className="pt-0.5 text-[15px] leading-relaxed" style={{ color: d.muted }}>
                        {item}
                      </p>
                    </div>
                  )
                })}
              </div>
            )}

            {model.ctaLabel && model.ctaUrl && (
              <div
                className="relative overflow-hidden rounded-2xl border px-6 py-7 text-center"
                style={{
                  borderColor: 'rgba(124,58,237,0.12)',
                  background:
                    'radial-gradient(ellipse 180px 100px at 15% 50%, rgba(124,58,237,0.10), transparent), radial-gradient(ellipse 160px 90px at 85% 50%, rgba(8,145,178,0.08), transparent), #f8f7ff',
                }}
              >
                <p
                  className="mb-4 text-[10px] font-bold uppercase tracking-[0.14em]"
                  style={{ color: d.faint }}
                >
                  Seu próximo passo
                </p>
                <span
                  className="inline-flex items-center gap-2 rounded-full px-8 py-3.5 text-[15px] font-semibold text-white"
                  style={{ background: d.gradient, boxShadow: d.glow }}
                >
                  {model.ctaLabel}
                  <span aria-hidden>→</span>
                </span>
                <p className="mt-4 text-xs leading-relaxed" style={{ color: d.faint }}>
                  Problemas com o botão?{' '}
                  <span className="font-semibold" style={{ color: d.accent }}>
                    Abrir no navegador →
                  </span>
                </p>
              </div>
            )}

            <div className="flex flex-wrap justify-center gap-2 pt-1">
              {EMAIL_FEATURE_CHIPS.map((chip) => (
                <span
                  key={chip}
                  className="rounded-full border px-3 py-1.5 text-[11px] font-medium"
                  style={{ borderColor: d.border, background: '#fff', color: d.muted }}
                >
                  {chip}
                </span>
              ))}
            </div>
          </div>

          {/* Rodapé */}
          <div className="border-t px-9 py-6 text-center" style={{ borderColor: d.divider, background: '#fafafa' }}>
            <div className="mx-auto mb-4 flex items-center justify-center gap-2">
              <img src={EMAIL_LOGO_URL} alt="" className="h-6 w-6 rounded-md opacity-80" />
              <span
                className="text-sm font-semibold"
                style={{ fontFamily: 'var(--font-display)', color: d.muted }}
              >
                Concurseiro Preditivo
              </span>
            </div>
            <p className="text-xs" style={{ color: d.faint }}>
              <a href="https://www.flashconcards.com.br" style={{ color: d.accent, textDecoration: 'none' }}>
                flashconcards.com.br
              </a>
              {' · '}
              Estudos inteligentes para concursos
            </p>
            <p className="mt-2 text-[11px]" style={{ color: '#d4d4d8' }}>
              Este é um email automático. Não responda diretamente a esta mensagem.
            </p>
          </div>
        </div>

        <p className="mx-auto mt-5 max-w-[600px] text-center text-[11px]" style={{ color: d.faint }}>
          © {new Date().getFullYear()} Concurseiro Preditivo
        </p>
      </div>
    </div>
  )
}

export default EmailDesignPreview
