import { Link } from 'react-router-dom'
import { ShieldCheckIcon, SparklesIcon, ClockIcon } from '@heroicons/react/24/solid'

const benefits = [
  'Flashcards animados com sistema de repetição espaçada (SRS)',
  'Calendário inteligente e streak de estudos',
  'Seu Flash Mentor - orientação personalizada para seus estudos',
  'Mentoria intensiva com foco total na ALEGO',
]

const PublicHome = () => {
  // Número do WhatsApp (formato: código do país + DDD + número, sem espaços ou caracteres especiais)
  const whatsappNumber = '5562981841878'
  const whatsappMessage = encodeURIComponent('Olá! Gostaria de garantir a promoção de R$ 59,99 para a mentoria ALEGO Policial Legislativo.')
  const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${whatsappMessage}`

  return (
    <section className="space-y-6 sm:space-y-8 md:space-y-12 px-2 sm:px-0">
      {/* Promoção */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-rose-500 via-pink-500 to-rose-600 p-6 sm:p-8 shadow-xl">
        <div className="relative z-10 text-center">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/20 px-4 py-1.5 text-xs sm:text-sm font-bold text-white backdrop-blur-sm">
            <ClockIcon className="h-4 w-4 animate-pulse" />
            <span>PROMOÇÃO POR TEMPO LIMITADO</span>
          </div>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-black text-white mb-4">
            De <span className="line-through opacity-70">R$ 149,99</span> por apenas
          </h2>
          <div className="mb-4">
            <span className="text-5xl sm:text-6xl md:text-7xl font-black text-white">R$ 59,99</span>
            <p className="mt-2 text-sm sm:text-base text-white/90">
              Economize <span className="font-bold text-white">R$ 90,00</span> agora!
            </p>
          </div>
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block rounded-full bg-white px-8 py-3 sm:px-10 sm:py-4 text-base sm:text-lg font-black text-rose-600 shadow-2xl hover:bg-rose-50 transition-all transform hover:scale-105"
          >
            Garantir Promoção Agora
          </a>
          <p className="mt-4 text-xs sm:text-sm text-white/80">
            ⚡ Oferta válida por tempo limitado. Não perca esta oportunidade!
          </p>
        </div>
        <div className="absolute top-0 right-0 -mt-4 -mr-4 h-32 w-32 rounded-full bg-white/10 blur-2xl"></div>
        <div className="absolute bottom-0 left-0 -mb-4 -ml-4 h-24 w-24 rounded-full bg-white/10 blur-xl"></div>
      </div>
      <div className="grid gap-6 sm:gap-8 rounded-2xl bg-gradient-to-r from-alego-700 to-alego-500 p-6 sm:p-8 md:p-10 text-white md:grid-cols-2">
        <div>
          <p className="text-xs sm:text-sm font-semibold uppercase tracking-[0.3em] text-alego-100">
            Mentoria Intensiva
          </p>
          <h1 className="mt-3 sm:mt-4 text-2xl sm:text-3xl md:text-4xl font-black leading-tight">
            Polícia Legislativa ALEGO
          </h1>
          <p className="mt-4 sm:mt-6 text-base sm:text-lg text-alego-50">
            Plataforma completa com rotina guiada, flashcards inteligentes,
            calendário de progresso e suporte de IA para acelerar seus ganhos.
          </p>
          <div className="mt-6 sm:mt-8 flex flex-col sm:flex-row flex-wrap gap-3 sm:gap-4">
            <Link
              to="/register"
              className="rounded-full bg-white px-5 sm:px-6 py-2.5 sm:py-3 text-sm font-semibold text-alego-600 shadow text-center"
            >
              Começar agora
            </Link>
            <Link
              to="/login"
              className="rounded-full border border-white/60 px-5 sm:px-6 py-2.5 sm:py-3 text-sm font-semibold text-white text-center"
            >
              Já tenho conta
            </Link>
          </div>
        </div>
        <div className="space-y-3 sm:space-y-4 rounded-2xl bg-white/10 p-4 sm:p-6">
          {benefits.map((benefit) => (
            <div
              key={benefit}
              className="flex items-start sm:items-center gap-2 sm:gap-3 rounded-2xl bg-white/20 px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm font-semibold"
            >
              <ShieldCheckIcon className="h-5 w-5 sm:h-6 sm:w-6 text-alego-100 flex-shrink-0 mt-0.5 sm:mt-0" />
              <span>{benefit}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:gap-6 md:gap-8 md:grid-cols-3">
        {['Flashcards', 'Agenda e Streak', 'Seu Flash Mentor'].map((item) => (
          <div
            key={item}
            className="rounded-2xl bg-white p-4 sm:p-6 shadow-sm shadow-alego-50"
          >
            <SparklesIcon className="h-6 w-6 sm:h-8 sm:w-8 text-alego-500" />
            <p className="mt-3 sm:mt-4 text-lg sm:text-xl font-bold text-alego-700">{item}</p>
            <p className="mt-2 text-xs sm:text-sm text-slate-500">
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

