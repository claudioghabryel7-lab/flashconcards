import { useMemo } from 'react'
import { normalizeIllustration } from '../utils/stemVisualContent'

const COLORS = ['#0ea5e9', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#14b8a6', '#f97316', '#6366f1']

function ChartFrame({ title, caption, children, dark = false }) {
  return (
    <figure
      className={`my-3 w-full overflow-hidden rounded-xl border px-3 py-3 sm:px-4 sm:py-4 ${
        dark
          ? 'border-white/15 bg-white/5 text-white'
          : 'border-cp-border bg-cp-bg/60 text-cp-text'
      }`}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {title ? (
        <figcaption
          className={`mb-2 text-center text-[11px] font-semibold uppercase tracking-wide sm:text-xs ${
            dark ? 'text-white/70' : 'text-cp-muted'
          }`}
        >
          {title}
        </figcaption>
      ) : null}
      <div className="mx-auto w-full max-w-md">{children}</div>
      {caption ? (
        <p className={`mt-2 text-center text-[10px] leading-snug sm:text-[11px] ${dark ? 'text-white/55' : 'text-cp-muted'}`}>
          {caption}
        </p>
      ) : null}
    </figure>
  )
}

function BarsSvg({ labels, valores, unidade, stroke }) {
  const max = Math.max(...valores, 1)
  const w = 320
  const h = 160
  const pad = 28
  const barW = (w - pad * 2) / valores.length
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-auto w-full" role="img" aria-label="Gráfico de barras">
      <line x1={pad} y1={h - pad} x2={w - 12} y2={h - pad} stroke={stroke} strokeWidth="1.5" opacity="0.35" />
      <line x1={pad} y1={12} x2={pad} y2={h - pad} stroke={stroke} strokeWidth="1.5" opacity="0.35" />
      {valores.map((v, i) => {
        const bh = ((v / max) * (h - pad - 20)) || 0
        const x = pad + i * barW + barW * 0.15
        const y = h - pad - bh
        return (
          <g key={`b-${i}`}>
            <rect x={x} y={y} width={barW * 0.7} height={bh} rx="4" fill={COLORS[i % COLORS.length]} opacity="0.9" />
            <text x={x + barW * 0.35} y={y - 4} textAnchor="middle" fontSize="9" fill={stroke}>
              {v}
              {unidade ? ` ${unidade}` : ''}
            </text>
            <text x={x + barW * 0.35} y={h - 10} textAnchor="middle" fontSize="9" fill={stroke} opacity="0.8">
              {(labels[i] || '').slice(0, 8)}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

function LineSvg({ labels, valores, stroke }) {
  const max = Math.max(...valores, 1)
  const min = Math.min(...valores, 0)
  const w = 320
  const h = 160
  const pad = 28
  const span = max - min || 1
  const pts = valores.map((v, i) => {
    const x = pad + (i / Math.max(valores.length - 1, 1)) * (w - pad - 12)
    const y = h - pad - ((v - min) / span) * (h - pad - 20)
    return { x, y, v, label: labels[i] }
  })
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-auto w-full" role="img" aria-label="Gráfico de linha">
      <line x1={pad} y1={h - pad} x2={w - 12} y2={h - pad} stroke={stroke} strokeWidth="1.5" opacity="0.35" />
      <line x1={pad} y1={12} x2={pad} y2={h - pad} stroke={stroke} strokeWidth="1.5" opacity="0.35" />
      <path d={d} fill="none" stroke={COLORS[0]} strokeWidth="2.5" />
      {pts.map((p, i) => (
        <g key={`p-${i}`}>
          <circle cx={p.x} cy={p.y} r="4" fill={COLORS[0]} />
          <text x={p.x} y={h - 10} textAnchor="middle" fontSize="9" fill={stroke} opacity="0.8">
            {(p.label || '').slice(0, 8)}
          </text>
        </g>
      ))}
    </svg>
  )
}

function PizzaSvg({ labels, valores, stroke }) {
  const total = valores.reduce((a, b) => a + b, 0) || 1
  const cx = 100
  const cy = 90
  const r = 70
  let angle = -Math.PI / 2
  const slices = valores.map((v, i) => {
    const a = (v / total) * Math.PI * 2
    const x1 = cx + r * Math.cos(angle)
    const y1 = cy + r * Math.sin(angle)
    angle += a
    const x2 = cx + r * Math.cos(angle)
    const y2 = cy + r * Math.sin(angle)
    const large = a > Math.PI ? 1 : 0
    return {
      d: `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`,
      color: COLORS[i % COLORS.length],
      label: labels[i] || String.fromCharCode(65 + i),
      pct: Math.round((v / total) * 100),
    }
  })
  return (
    <div className="flex flex-col items-center gap-2 sm:flex-row sm:items-start sm:justify-center sm:gap-4">
      <svg viewBox="0 0 200 180" className="h-36 w-36 sm:h-40 sm:w-40" role="img" aria-label="Gráfico de pizza">
        {slices.map((s, i) => (
          <path key={`s-${i}`} d={s.d} fill={s.color} stroke={stroke} strokeWidth="1" opacity="0.92" />
        ))}
      </svg>
      <ul className="space-y-1 text-left text-[11px]">
        {slices.map((s, i) => (
          <li key={`l-${i}`} className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
            <span>
              {s.label}: {s.pct}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function AxesSvg({ pontos, segmentos, stroke }) {
  const allX = [...pontos.map((p) => p.x), ...segmentos.flatMap((s) => [s.x1, s.x2]), 0, 1]
  const allY = [...pontos.map((p) => p.y), ...segmentos.flatMap((s) => [s.y1, s.y2]), 0, 1]
  const minX = Math.min(...allX)
  const maxX = Math.max(...allX)
  const minY = Math.min(...allY)
  const maxY = Math.max(...allY)
  const w = 280
  const h = 180
  const pad = 30
  const sx = (x) => pad + ((x - minX) / (maxX - minX || 1)) * (w - pad * 2)
  const sy = (y) => h - pad - ((y - minY) / (maxY - minY || 1)) * (h - pad * 2)
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-auto w-full" role="img" aria-label="Plano cartesiano">
      <line x1={pad} y1={h - pad} x2={w - 12} y2={h - pad} stroke={stroke} strokeWidth="1.5" />
      <line x1={pad} y1={12} x2={pad} y2={h - pad} stroke={stroke} strokeWidth="1.5" />
      {segmentos.map((s, i) => (
        <line
          key={`sg-${i}`}
          x1={sx(s.x1)}
          y1={sy(s.y1)}
          x2={sx(s.x2)}
          y2={sy(s.y2)}
          stroke={COLORS[i % COLORS.length]}
          strokeWidth="2.5"
        />
      ))}
      {pontos.map((p, i) => (
        <g key={`pt-${i}`}>
          <circle cx={sx(p.x)} cy={sy(p.y)} r="4.5" fill={COLORS[i % COLORS.length]} />
          <text x={sx(p.x) + 6} y={sy(p.y) - 6} fontSize="9" fill={stroke}>
            {p.rotulo || `(${p.x},${p.y})`}
          </text>
        </g>
      ))}
    </svg>
  )
}

function ContaBlock({ passos, dark }) {
  return (
    <ol
      className={`space-y-1.5 rounded-lg border px-3 py-2.5 font-mono text-[11px] leading-relaxed sm:text-xs ${
        dark ? 'border-white/15 bg-black/20 text-emerald-200' : 'border-emerald-500/25 bg-emerald-500/5 text-cp-text'
      }`}
    >
      {passos.map((passo, i) => (
        <li key={`c-${i}`} className="flex gap-2">
          <span className={dark ? 'text-white/40' : 'text-cp-muted'}>{i + 1}.</span>
          <span className="whitespace-pre-wrap break-words">{passo}</span>
        </li>
      ))}
    </ol>
  )
}

function TabelaBlock({ cabecalhos, linhas, dark }) {
  return (
    <div className="overflow-x-auto">
      <table className={`w-full min-w-[220px] border-collapse text-left text-[11px] sm:text-xs ${dark ? 'text-white' : 'text-cp-text'}`}>
        <thead>
          <tr>
            {cabecalhos.map((h, i) => (
              <th
                key={`h-${i}`}
                className={`border px-2 py-1.5 font-semibold ${dark ? 'border-white/20 bg-white/10' : 'border-cp-border bg-cp-surface'}`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((row, ri) => (
            <tr key={`r-${ri}`}>
              {cabecalhos.map((_, ci) => (
                <td key={`c-${ri}-${ci}`} className={`border px-2 py-1.5 ${dark ? 'border-white/15' : 'border-cp-border'}`}>
                  {row[ci] ?? ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function FluxoBlock({ etapas, dark }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5">
      {etapas.map((et, i) => (
        <div key={`f-${i}`} className="flex items-center gap-1.5">
          <span
            className={`rounded-lg border px-2.5 py-1.5 text-center text-[11px] font-medium sm:text-xs ${
              dark ? 'border-sky-400/40 bg-sky-400/15 text-sky-100' : 'border-sky-500/30 bg-sky-500/10 text-cp-text'
            }`}
          >
            {et}
          </span>
          {i < etapas.length - 1 ? (
            <span className={`text-sm ${dark ? 'text-white/40' : 'text-cp-muted'}`} aria-hidden>
              →
            </span>
          ) : null}
        </div>
      ))}
    </div>
  )
}

function EsquemaBlock({ itens, dark }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {itens.map((it, i) => (
        <div
          key={`e-${i}`}
          className={`rounded-lg border px-2.5 py-2 text-left ${
            dark ? 'border-violet-400/30 bg-violet-400/10' : 'border-violet-500/25 bg-violet-500/8'
          }`}
        >
          <p className="text-[11px] font-semibold sm:text-xs">{it.rotulo}</p>
          {it.detalhe ? (
            <p className={`mt-0.5 text-[10px] leading-snug ${dark ? 'text-white/60' : 'text-cp-muted'}`}>{it.detalhe}</p>
          ) : null}
        </div>
      ))}
    </div>
  )
}

/**
 * Renderiza ilustração STEM (gráfico/conta/diagrama/imagem) a partir do JSON normalizado.
 */
export default function StudyIllustration({ ilustracao, dark = false, className = '' }) {
  const data = useMemo(() => normalizeIllustration(ilustracao), [ilustracao])
  if (!data) return null

  const stroke = dark ? 'rgba(255,255,255,0.75)' : 'currentColor'
  const { preset, params, titulo, caption, imageUrl } = data

  let body = null
  if (preset === 'barras') {
    body = <BarsSvg labels={params.labels} valores={params.valores} unidade={params.unidade} stroke={stroke} />
  } else if (preset === 'linha') {
    body = <LineSvg labels={params.labels} valores={params.valores} stroke={stroke} />
  } else if (preset === 'pizza') {
    body = <PizzaSvg labels={params.labels} valores={params.valores} stroke={stroke} />
  } else if (preset === 'eixos') {
    body = <AxesSvg pontos={params.pontos} segmentos={params.segmentos} stroke={stroke} />
  } else if (preset === 'conta') {
    body = <ContaBlock passos={params.passos} dark={dark} />
  } else if (preset === 'tabela') {
    body = <TabelaBlock cabecalhos={params.cabecalhos} linhas={params.linhas} dark={dark} />
  } else if (preset === 'fluxo') {
    body = <FluxoBlock etapas={params.etapas} dark={dark} />
  } else if (preset === 'esquema') {
    body = <EsquemaBlock itens={params.itens} dark={dark} />
  } else if (preset === 'imagem' && imageUrl) {
    body = (
      <img
        src={imageUrl}
        alt={titulo || caption || 'Ilustração do conteúdo'}
        className="mx-auto max-h-48 w-auto max-w-full rounded-lg object-contain"
        loading="lazy"
        referrerPolicy="no-referrer"
      />
    )
  }

  if (!body) return null

  return (
    <div className={className}>
      <ChartFrame title={titulo} caption={caption} dark={dark}>
        {body}
      </ChartFrame>
    </div>
  )
}
