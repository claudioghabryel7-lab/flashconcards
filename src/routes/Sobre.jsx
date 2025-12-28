import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  AcademicCapIcon,
  RocketLaunchIcon,
  LightBulbIcon,
  HeartIcon,
  UsersIcon,
  TrophyIcon,
} from '@heroicons/react/24/solid'
import { useDarkMode } from '../hooks/useDarkMode'

const Sobre = () => {
  const { darkMode } = useDarkMode()

  useEffect(() => {
    // Scroll para o topo quando a página carregar
    window.scrollTo(0, 0)
  }, [])

  const features = [
    {
      icon: AcademicCapIcon,
      title: 'Missão',
      description: 'Democratizar o acesso à educação de qualidade para concursos públicos, oferecendo ferramentas inovadoras e inteligentes que aceleram o aprendizado.',
      color: 'from-blue-500 to-blue-600',
    },
    {
      icon: RocketLaunchIcon,
      title: 'Visão',
      description: 'Ser a plataforma de referência em preparação para concursos, combinando tecnologia de ponta com metodologias comprovadas de aprendizado.',
      color: 'from-purple-500 to-purple-600',
    },
    {
      icon: LightBulbIcon,
      title: 'Inovação',
      description: 'Utilizamos inteligência artificial para personalizar o aprendizado, gerar questões contextualizadas e fornecer explicações detalhadas em tempo real.',
      color: 'from-green-500 to-green-600',
    },
    {
      icon: HeartIcon,
      title: 'Compromisso',
      description: 'Estamos comprometidos com o sucesso de cada aluno, oferecendo suporte contínuo e ferramentas que realmente fazem a diferença na aprovação.',
      color: 'from-pink-500 to-pink-600',
    },
    {
      icon: UsersIcon,
      title: 'Comunidade',
      description: 'Construímos uma comunidade de estudantes dedicados que compartilham conhecimento, experiências e motivação para alcançar seus objetivos.',
      color: 'from-indigo-500 to-indigo-600',
    },
    {
      icon: TrophyIcon,
      title: 'Resultados',
      description: 'Nossos alunos alcançam resultados excepcionais através de um método de estudo eficiente, focado e adaptado às suas necessidades individuais.',
      color: 'from-orange-500 to-orange-600',
    },
  ]

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-alego-600 via-alego-700 to-alego-800 text-white py-20 sm:py-28">
        <div className="absolute inset-0 bg-grid-white/[0.05] bg-[size:20px_20px]" />
        <div className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-black mb-6 animate-fade-in">
              Sobre o FlashConCards
            </h1>
            <p className="text-xl sm:text-2xl text-alego-100 max-w-3xl mx-auto leading-relaxed">
              Transformando a forma como você estuda para concursos públicos através de tecnologia e inovação
            </p>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-16 sm:py-20 bg-white dark:bg-slate-900">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {features.map((feature, index) => {
              const Icon = feature.icon
              return (
                <div
                  key={index}
                  className="group relative rounded-2xl bg-gradient-to-br p-8 shadow-lg hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-2 border border-slate-200 dark:border-slate-700"
                >
                  <div className={`inline-flex p-4 rounded-xl bg-gradient-to-r ${feature.color} mb-4`}>
                    <Icon className="h-8 w-8 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-3">
                    {feature.title}
                  </h3>
                  <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Story Section */}
      <section className="py-16 sm:py-20 bg-slate-50 dark:bg-slate-800">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white mb-4">
              Nossa História
            </h2>
            <div className="w-24 h-1 bg-gradient-to-r from-alego-600 to-alego-700 mx-auto rounded-full"></div>
          </div>
          
          <div className="prose prose-lg dark:prose-invert max-w-none">
            <p className="text-lg text-slate-700 dark:text-slate-300 leading-relaxed mb-6">
              O FlashConCards nasceu da necessidade de criar uma plataforma de estudos que realmente 
              funciona. Após anos de experiência em preparação para concursos, identificamos os 
              principais desafios enfrentados pelos estudantes e desenvolvemos soluções inovadoras 
              para superá-los.
            </p>
            <p className="text-lg text-slate-700 dark:text-slate-300 leading-relaxed mb-6">
              Combinamos técnicas comprovadas de aprendizado, como repetição espaçada e testes 
              práticos, com tecnologia de ponta, incluindo inteligência artificial para personalização 
              e geração de conteúdo contextualizado.
            </p>
            <p className="text-lg text-slate-700 dark:text-slate-300 leading-relaxed">
              Hoje, ajudamos milhares de estudantes a alcançarem seus objetivos, oferecendo uma 
              experiência de aprendizado completa, eficiente e adaptada às necessidades de cada aluno.
            </p>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 sm:py-20 bg-gradient-to-r from-alego-600 to-alego-700 text-white">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-black mb-6">
            Pronto para começar sua jornada?
          </h2>
          <p className="text-xl text-alego-100 mb-8 max-w-2xl mx-auto">
            Junte-se a milhares de estudantes que já estão transformando seus estudos e 
            alcançando a aprovação dos sonhos.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/pagamento"
              className="inline-flex items-center justify-center px-8 py-4 bg-white text-alego-700 font-bold rounded-xl hover:bg-alego-50 transition-all transform hover:scale-105 shadow-lg"
            >
              Começar Agora
            </Link>
            <Link
              to="/dashboard"
              className="inline-flex items-center justify-center px-8 py-4 bg-transparent border-2 border-white text-white font-bold rounded-xl hover:bg-white hover:text-alego-700 transition-all"
            >
              Fazer Login
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}

export default Sobre

