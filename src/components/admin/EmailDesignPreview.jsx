import { EMAIL_LOGO_URL } from '../../utils/adminEmailAi'

export function EmailDesignPreview({ model }) {  if (!model?.title && !model?.message) return null

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-inner dark:border-slate-600 dark:bg-slate-900">
      <p className="border-b border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-800">
        Pré-visualização do email
      </p>
      <div className="mx-auto max-w-[600px] bg-white shadow-lg">
        <div
          className="px-7 py-8 text-center text-white"
          style={{ background: 'linear-gradient(135deg,#7c3aed 0%,#0891b2 100%)' }}
        >
          <img
            src={EMAIL_LOGO_URL}
            alt="Concurseiro Preditivo"
            className="mx-auto mb-4 h-[72px] w-[72px] rounded-2xl shadow-lg"
          />
          <h3 className="text-2xl font-bold leading-tight">{model.title || 'Título'}</h3>
          {model.subtitle && (
            <p className="mt-2 text-sm opacity-90">{model.subtitle}</p>
          )}
        </div>

        <div className="space-y-4 px-7 py-8 text-slate-700">
          {model.highlight && (
            <div
              className="rounded-xl border-l-4 border-violet-600 px-4 py-3 text-sm font-semibold text-violet-800"
              style={{ background: 'linear-gradient(135deg,#f5f3ff,#ecfeff)' }}
            >
              {model.highlight}
            </div>
          )}

          {model.paragraphs?.map((paragraph, index) => (
            <p key={index} className="text-[15px] leading-relaxed text-slate-600">
              {paragraph}
            </p>
          ))}

          {model.bullets?.length > 0 && (
            <ul className="list-disc space-y-2 pl-5 text-[15px] text-slate-600">
              {model.bullets.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          )}

          {model.ctaLabel && model.ctaUrl && (
            <div className="pt-2 text-center">
              <span
                className="inline-block rounded-xl px-8 py-3 text-sm font-bold text-white"
                style={{ background: 'linear-gradient(135deg,#7c3aed,#0891b2)' }}
              >
                {model.ctaLabel}
              </span>
              <p className="mt-3 break-all text-xs text-violet-600">{model.ctaUrl}</p>
            </div>
          )}
        </div>

        <div className="border-t border-slate-200 bg-slate-50 px-7 py-6 text-center">
          <img
            src={EMAIL_LOGO_URL}
            alt=""
            className="mx-auto mb-2 h-9 w-9 rounded-lg opacity-80"
          />
          <p className="text-sm font-semibold text-slate-600">Equipe Concurseiro Preditivo</p>
          <p className="mt-1 text-xs text-slate-400">Este é um email automático do Concurseiro Preditivo.</p>
        </div>
      </div>
    </div>
  )
}

export default EmailDesignPreview