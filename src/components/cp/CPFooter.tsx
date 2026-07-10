import Link from 'next/link'
import CPLogo from './CPLogo'

type CPFooterProps = {
  fullBleed?: boolean
}

export default function CPFooter({ fullBleed = false }: CPFooterProps) {
  const inner = fullBleed ? 'cp-container-wide' : 'cp-container'

  return (
    <footer className="relative z-10 border-t border-cp-border bg-cp-bg/40 backdrop-blur-xl">
      <div className={`${inner} flex flex-col gap-10 py-14 md:flex-row md:items-start md:justify-between`}>
        <div>
          <CPLogo />
          <p className="mt-5 max-w-xs text-sm leading-relaxed text-cp-muted">
            <strong className="font-medium text-cp-text">Concurseiro Preditivo</strong> — plataforma
            preditiva de estudos para concursos. I.A calibrada no edital, na banca e no que cai na prova.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-10 text-sm sm:grid-cols-3">
          <div>
            <p className="mb-4 text-xs font-medium uppercase tracking-wider text-cp-muted">Estudar</p>
            <ul className="space-y-2.5 text-cp-muted">
              <li><Link href="/dashboard" className="transition hover:text-cp-text">Dashboard</Link></li>
              <li><Link href="/flashcards" className="transition hover:text-cp-text">Flashcards</Link></li>
              <li><Link href="/edital-verticalizado" className="transition hover:text-cp-text">Edital</Link></li>
            </ul>
          </div>
          <div>
            <p className="mb-4 text-xs font-medium uppercase tracking-wider text-cp-muted">Conta</p>
            <ul className="space-y-2.5 text-cp-muted">
              <li><Link href="/login" className="transition hover:text-cp-text">Entrar</Link></li>
              <li><Link href="/cursos" className="transition hover:text-cp-text">Cursos</Link></li>
              <li><Link href="/select-course" className="transition hover:text-cp-text">Selecionar curso</Link></li>
            </ul>
          </div>
          <div>
            <p className="mb-4 text-xs font-medium uppercase tracking-wider text-cp-muted">Legal</p>
            <ul className="space-y-2.5 text-cp-muted">
              <li><Link href="/politica-privacidade" className="transition hover:text-cp-text">Privacidade</Link></li>
            </ul>
          </div>
        </div>
      </div>

      <div className="border-t border-cp-border py-6 text-center text-xs text-cp-muted">
        © {new Date().getFullYear()} Concurseiro Preditivo
      </div>
    </footer>
  )
}
