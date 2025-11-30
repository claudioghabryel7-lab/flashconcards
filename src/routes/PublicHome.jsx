import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { 
  ShieldCheckIcon, 
  SparklesIcon, 
  ClockIcon,
  AcademicCapIcon,
  ChartBarIcon,
  TrophyIcon,
  LightBulbIcon,
  QuestionMarkCircleIcon,
  CalendarIcon,
  ChatBubbleLeftRightIcon,
  BookOpenIcon,
  RocketLaunchIcon
} from '@heroicons/react/24/solid'
import { trackButtonClick } from '../utils/googleAds'
import HomeBanner from '../components/HomeBanner'
import Reviews from '../components/Reviews'

const features = [
  {
    icon: BookOpenIcon,
    title: 'Flashcards Inteligentes',
    description: 'Sistema de repetição espaçada (SRS) que adapta o ritmo de estudos ao seu desempenho. Mais de 8 matérias completas com módulos organizados.',
    color: 'from-blue-500 to-blue-600'
  },
  {
    icon: QuestionMarkCircleIcon,
    title: 'FlashQuestões',
    description: 'Questões fictícias no estilo FGV ALEGO geradas por IA. 10 questões por módulo com explicações detalhadas (BIZUs) e índice de acerto.',
    color: 'from-purple-500 to-purple-600'
  },
  {
    icon: ChatBubbleLeftRightIcon,
    title: 'Flash Mentor - IA Personalizada',
    description: 'Assistente de IA que responde dúvidas sobre o edital, explica conceitos e orienta seus estudos 24/7. Baseado no edital do concurso.',
    color: 'from-green-500 to-green-600'
  },
  {
    icon: RocketLaunchIcon,
    title: 'Como Estudar? - Bot Guia',
    description: 'Bot inteligente que analisa seu progresso e sugere qual módulo estudar. Acompanha fases de estudo e calcula dias restantes para completar tudo.',
    color: 'from-orange-500 to-orange-600'
  },
  {
    icon: TrophyIcon,
    title: 'Ranking de Alunos',
    description: 'Competição saudável com ranking em tempo real. Veja sua posição, horas estudadas e dias de dedicação comparados com outros alunos.',
    color: 'from-yellow-500 to-yellow-600'
  },
  {
    icon: ChartBarIcon,
    title: 'Dashboard Completo',
    description: 'Acompanhe seu progresso com calendário visual, streak de estudos, estatísticas por matéria e visualização clara do que já foi estudado.',
    color: 'from-indigo-500 to-indigo-600'
  },
  {
    icon: CalendarIcon,
    title: 'Calendário de Progresso',
    description: 'Visualize todos os dias que você estudou em um calendário interativo. Mantenha sua sequência de estudos e aumente seu streak.',
    color: 'from-pink-500 to-pink-600'
  },
  {
    icon: LightBulbIcon,
    title: 'Explicações com IA',
    description: 'Receba explicações detalhadas de cada flashcard geradas por IA, contextualizadas com o edital do concurso para melhor compreensão.',
    color: 'from-teal-500 to-teal-600'
  }
]

const benefits = [
  'Flashcards com sistema de repetição espaçada (SRS)',
  'FlashQuestões geradas por IA no estilo FGV ALEGO',
  'Flash Mentor - IA que responde dúvidas sobre o edital',
  'Bot "Como Estudar?" - guia personalizado de estudos',
  'Ranking em tempo real com outros alunos',
  'Dashboard completo com progresso e estatísticas',
  'Calendário visual e streak de estudos',
  'Explicações detalhadas geradas por IA',
]

const PublicHome = () => {
  // Número do WhatsApp (formato: código do país + DDD + número, sem espaços ou caracteres especiais)
  const whatsappNumber = '5562981841878'
  const whatsappMessage = encodeURIComponent('Olá! Gostaria de garantir a promoção de R$ 99,90 para a mentoria ALEGO Policial Legislativo.')
  const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${whatsappMessage}`

  return (
    <section className="space-y-6 sm:space-y-8 md:space-y-12 px-2 sm:px-0">
      {/* Carrossel de Banners */}
      <HomeBanner />
      
      {/* Promoção */}
      <motion.div 
        className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-rose-500 via-pink-500 to-rose-600 p-6 sm:p-8 shadow-xl"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
      >
        <div className="relative z-10 text-center">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/20 px-4 py-1.5 text-xs sm:text-sm font-bold text-white backdrop-blur-sm">
            <ClockIcon className="h-4 w-4 animate-pulse" />
            <span>PROMOÇÃO POR TEMPO LIMITADO</span>
          </div>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-black text-white mb-4">
            De <span className="line-through opacity-70">R$ 149,99</span> por apenas
          </h2>
          <div className="mb-4">
            <span className="text-5xl sm:text-6xl md:text-7xl font-black text-white">R$ 99,90</span>
            <p className="mt-2 text-sm sm:text-base text-white/90">
              Economize <span className="font-bold text-white">R$ 50,09</span> agora!
            </p>
            <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-red-500/90 px-4 py-1.5 text-xs sm:text-sm font-bold text-white">
              <span>🔥 SOMENTE 100 VAGAS</span>
            </div>
          </div>
          <Link
            to="/pagamento"
            onClick={trackButtonClick}
            className="inline-block rounded-full bg-white px-8 py-3 sm:px-10 sm:py-4 text-base sm:text-lg font-black text-rose-600 shadow-2xl hover:bg-rose-50 transition-all transform hover:scale-105"
          >
            Garantir Promoção Agora
          </Link>
          <p className="mt-4 text-xs sm:text-sm text-white/80">
            ⚡ Oferta válida por tempo limitado. Não perca esta oportunidade!
          </p>
        </div>
        <motion.div 
          className="absolute top-0 right-0 -mt-4 -mr-4 h-32 w-32 rounded-full bg-white/10 blur-2xl"
          animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.5, 0.3] }}
          transition={{ duration: 4, repeat: Infinity }}
        ></motion.div>
        <motion.div 
          className="absolute bottom-0 left-0 -mb-4 -ml-4 h-24 w-24 rounded-full bg-white/10 blur-xl"
          animate={{ scale: [1, 1.3, 1], opacity: [0.3, 0.5, 0.3] }}
          transition={{ duration: 5, repeat: Infinity, delay: 1 }}
        ></motion.div>
      </motion.div>

      {/* Hero Section */}
      <div className="grid gap-6 sm:gap-8 rounded-3xl bg-gradient-to-br from-alego-700 via-alego-600 to-alego-500 p-6 sm:p-8 md:p-10 text-white md:grid-cols-2 shadow-xl border border-alego-600/20">
        <div>
          <p className="text-xs sm:text-sm font-semibold uppercase tracking-[0.3em] text-alego-100">
            Mentoria Intensiva
          </p>
          <h1 className="mt-3 sm:mt-4 text-2xl sm:text-3xl md:text-4xl font-black leading-tight">
            Polícia Legislativa ALEGO
          </h1>
          <p className="mt-4 sm:mt-6 text-base sm:text-lg text-alego-50">
            Plataforma completa com IA, flashcards inteligentes, questões personalizadas,
            ranking em tempo real e suporte 24/7 para acelerar sua aprovação.
          </p>
          <div className="mt-6 sm:mt-8 flex flex-col sm:flex-row flex-wrap gap-3 sm:gap-4 justify-center items-center">
            <Link
              to="/login"
              className="rounded-full bg-white px-5 sm:px-6 py-2.5 sm:py-3 text-sm font-semibold text-alego-600 shadow text-center hover:bg-alego-50 transition whitespace-nowrap"
            >
              Começar agora
            </Link>
            <Link
              to="/login"
              className="rounded-full border border-white/60 px-5 sm:px-6 py-2.5 sm:py-3 text-sm font-semibold text-white text-center hover:bg-white/10 transition whitespace-nowrap"
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

      {/* Features Grid */}
      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
      >
        <div className="text-center mb-8">
          <motion.h2 
            className="text-2xl sm:text-3xl md:text-4xl font-black text-alego-700 dark:text-alego-300 mb-3"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            Tudo que você precisa para sua aprovação
          </motion.h2>
          <motion.p 
            className="text-slate-600 dark:text-slate-400 text-sm sm:text-base"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            Plataforma completa com inteligência artificial e recursos avançados
          </motion.p>
        </div>
        <div className="grid gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-4">
          {features.map((feature, index) => {
            const Icon = feature.icon
            return (
              <motion.div
                key={index}
                className="group relative overflow-hidden rounded-2xl bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl p-6 shadow-lg hover:shadow-2xl border border-slate-200/50 dark:border-slate-700/50"
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                whileHover={{ scale: 1.03, y: -8 }}
              >
                <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${feature.color} opacity-10 rounded-full blur-2xl group-hover:opacity-30 transition-all duration-500`}></div>
                <div className="relative z-10">
                  <motion.div 
                    className={`inline-flex p-3 rounded-xl bg-gradient-to-br ${feature.color} mb-4 shadow-lg`}
                    whileHover={{ scale: 1.1, rotate: 5 }}
                    transition={{ type: "spring", stiffness: 300 }}
                  >
                    <Icon className="h-6 w-6 text-white" />
                  </motion.div>
                  <h3 className="text-lg font-bold text-alego-700 dark:text-alego-300 mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              </motion.div>
            )
          })}
        </div>
      </motion.div>

      {/* Avaliações dos Alunos */}
      <div className="rounded-2xl bg-white dark:bg-slate-800 p-6 sm:p-8 shadow-sm">
        <Reviews />
      </div>

      {/* CTA Final */}
      <div className="rounded-2xl bg-gradient-to-r from-alego-600 to-alego-700 p-8 sm:p-10 text-center text-white">
        <AcademicCapIcon className="h-12 w-12 sm:h-16 sm:w-16 mx-auto mb-4 text-alego-100" />
        <h2 className="text-2xl sm:text-3xl md:text-4xl font-black mb-4">
          Pronto para começar sua jornada?
        </h2>
        <p className="text-alego-100 mb-6 text-sm sm:text-base max-w-2xl mx-auto">
          Junte-se a centenas de alunos que já estão se preparando para a ALEGO com nossa plataforma completa.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center flex-wrap">
          <Link
            to="/login"
            className="inline-block rounded-full bg-white px-8 py-3 sm:px-10 sm:py-4 text-base sm:text-lg font-black text-alego-600 shadow-2xl hover:bg-alego-50 transition-all transform hover:scale-105 whitespace-nowrap"
          >
            Começar Agora
          </Link>
          <Link
            to="/pagamento"
            onClick={trackButtonClick}
            className="inline-block rounded-full bg-white px-8 py-3 sm:px-10 sm:py-4 text-base sm:text-lg font-black text-alego-600 shadow-2xl hover:bg-alego-50 transition-all transform hover:scale-105 whitespace-nowrap"
          >
            Garantir Promoção
          </Link>
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block rounded-full border-2 border-white px-8 py-3 sm:px-10 sm:py-4 text-base sm:text-lg font-black text-white hover:bg-white/10 transition-all whitespace-nowrap"
          >
            Falar no WhatsApp
          </a>
        </div>
      </div>
    </section>
  )
}

export default PublicHome
