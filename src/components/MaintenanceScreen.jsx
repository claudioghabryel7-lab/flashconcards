import { WrenchScrewdriverIcon } from '@heroicons/react/24/outline'
import Logo from './Logo'

export default function MaintenanceScreen({ message }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-4 text-center">
      <div className="mb-8">
        <Logo className="mx-auto h-12 w-auto" />
      </div>

      <div className="max-w-md rounded-2xl border border-amber-500/30 bg-slate-800/80 p-8 shadow-2xl backdrop-blur">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/20">
          <WrenchScrewdriverIcon className="h-8 w-8 text-amber-400" />
        </div>

        <h1 className="mb-3 text-xl font-bold text-white">Manutenção temporária</h1>

        <p className="text-sm leading-relaxed text-slate-300">
          {message || 'O site está temporariamente em manutenção. Aguarde alguns minutos.'}
        </p>

        <p className="mt-6 text-xs text-slate-500">
          Esta página atualiza automaticamente quando o site voltar.
        </p>
      </div>
    </div>
  )
}
