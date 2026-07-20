import { useEffect, useState } from 'react'
import {
  DevicePhoneMobileIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  RocketLaunchIcon,
} from '@heroicons/react/24/outline'
import {
  detectGoogleAiBridge,
  openFlashConCardsAndroidApp,
} from '../../services/googleAiBrowserVerifier'

/**
 * Card 1-clique no admin: gera o dia com dossiê do Modo IA via app Android.
 */
export default function AdminAndroidAutomationCard({
  courseId,
  courseName = '',
  busy = false,
  onAutomateToday,
}) {
  const [bridge, setBridge] = useState({ available: false, kind: null })
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setChecking(true)
      const status = await detectGoogleAiBridge()
      if (!cancelled) {
        setBridge(status)
        setChecking(false)
      }
    })()
    const timer = setInterval(async () => {
      const status = await detectGoogleAiBridge()
      if (!cancelled) setBridge(status)
    }, 4000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [])

  const ready = bridge.available
  const kindLabel =
    bridge.kind === 'android'
      ? 'App Android detectado'
      : bridge.kind === 'extension'
        ? 'Extensão Chrome detectada'
        : 'Ponte Google IA não detectada'

  return (
    <div className="cp-card space-y-4 !rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
            <DevicePhoneMobileIcon className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-cp-text">Android · Automatizar com Google IA</h3>
            <p className="mt-1 max-w-2xl text-sm text-cp-muted">
              Um clique: consulta o Modo IA, monta o dossiê e gera material, questões e flashcards
              de hoje{courseName ? ` em “${courseName}”` : ''}.
            </p>
          </div>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase ${
            ready
              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
              : 'bg-amber-500/15 text-amber-800 dark:text-amber-200'
          }`}
        >
          {checking ? (
            'Verificando…'
          ) : ready ? (
            <>
              <CheckCircleIcon className="h-3.5 w-3.5" />
              {kindLabel}
            </>
          ) : (
            <>
              <ExclamationTriangleIcon className="h-3.5 w-3.5" />
              {kindLabel}
            </>
          )}
        </span>
      </div>

      {!ready ? (
        <ol className="list-decimal space-y-1 pl-5 text-xs text-cp-muted">
          <li>Instale o app da pasta <code>android-admin</code> (APK via Android Studio).</li>
          <li>Abra o admin <strong>dentro do app</strong> (não no Chrome).</li>
          <li>Toque em <strong>Google / Login</strong> uma vez e volte.</li>
          <li>Volte aqui e use o botão verde.</li>
        </ol>
      ) : (
        <p className="text-xs text-cp-muted">
          Ponte pronta. Mantenha o app aberto enquanto gera. O Google abre sozinho a cada tópico.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || !courseId || !ready}
          onClick={() => onAutomateToday?.()}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RocketLaunchIcon className={`h-5 w-5 ${busy ? 'animate-pulse' : ''}`} />
          {busy ? 'Automatizando…' : 'Automatizar hoje (1 clique)'}
        </button>

        {!ready ? (
          <button
            type="button"
            onClick={openFlashConCardsAndroidApp}
            className="inline-flex items-center gap-2 rounded-xl border border-cp-border bg-cp-surface px-4 py-3 text-sm font-semibold text-cp-text transition hover:border-emerald-500/40"
          >
            <DevicePhoneMobileIcon className="h-5 w-5 text-emerald-600" />
            Abrir no app Android
          </button>
        ) : null}

        <button
          type="button"
          disabled={checking}
          onClick={async () => {
            setChecking(true)
            const status = await detectGoogleAiBridge()
            setBridge(status)
            setChecking(false)
          }}
          className="inline-flex items-center rounded-xl border border-cp-border px-4 py-3 text-sm font-semibold text-cp-muted transition hover:text-cp-text"
        >
          Reverificar ponte
        </button>
      </div>
    </div>
  )
}
