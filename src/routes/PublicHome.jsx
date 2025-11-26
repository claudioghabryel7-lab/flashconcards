import { Link } from 'react-router-dom'
import { ShieldCheckIcon, SparklesIcon } from '@heroicons/react/24/solid'

const benefits = [
  'Flashcards animados com sistema de repetição espaçada (SRS)',
  'Calendário inteligente e streak de estudos',
  'Seu Flash Mentor - orientação personalizada para seus estudos',
  'Mentoria intensiva com foco total na ALEGO',
]

const PublicHome = () => {
  return (
    <section className="space-y-12">
      <div className="grid gap-8 rounded-2xl bg-gradient-to-r from-alego-700 to-alego-500 p-10 text-white md:grid-cols-2">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-alego-100">
            Mentoria Intensiva
          </p>
          <h1 className="mt-4 text-4xl font-black leading-tight">
            Polícia Legislativa ALEGO
          </h1>
          <p className="mt-6 text-lg text-alego-50">
            Plataforma completa com rotina guiada, flashcards inteligentes,
            calendário de progresso e suporte de IA para acelerar seus ganhos.
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <Link
              to="/register"
              className="rounded-full bg-white px-6 py-3 text-sm font-semibold text-alego-600 shadow"
            >
              Começar agora
            </Link>
            <Link
              to="/login"
              className="rounded-full border border-white/60 px-6 py-3 text-sm font-semibold text-white"
            >
              Já tenho conta
            </Link>
          </div>
        </div>
        <div className="space-y-4 rounded-2xl bg-white/10 p-6">
          {benefits.map((benefit) => (
            <div
              key={benefit}
              className="flex items-center gap-3 rounded-2xl bg-white/20 px-4 py-3 text-sm font-semibold"
            >
              <ShieldCheckIcon className="h-6 w-6 text-alego-100" />
              {benefit}
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-8 md:grid-cols-3">
        {['Flashcards', 'Agenda e Streak', 'Seu Flash Mentor'].map((item) => (
          <div
            key={item}
            className="rounded-2xl bg-white p-6 shadow-sm shadow-alego-50"
          >
            <SparklesIcon className="h-8 w-8 text-alego-500" />
            <p className="mt-4 text-xl font-bold text-alego-700">{item}</p>
            <p className="mt-2 text-sm text-slate-500">
              Recursos criados para acelerar sua aprovação com foco total no
              edital da ALEGO.
            </p>
          </div>
        ))}
      </div>
    </section>
  )
}

export default PublicHome

