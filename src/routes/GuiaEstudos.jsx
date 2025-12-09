import { Link } from 'react-router-dom'
import {
  BookOpenIcon,
  QuestionMarkCircleIcon,
  ClipboardDocumentCheckIcon,
  PencilSquareIcon,
  ChartBarIcon,
  LightBulbIcon,
  TrophyIcon,
  CheckCircleIcon,
  ArrowRightIcon,
} from '@heroicons/react/24/outline'
import { useDarkMode } from '../hooks/useDarkMode'

const GuiaEstudos = () => {
  const { darkMode } = useDarkMode()

  const steps = [
    {
      icon: BookOpenIcon,
      title: '1. Estude os Flashcards',
      description: 'Base teórica de todo o conteúdo',
      details: [
        'Complete todos os módulos na ordem sugerida',
        'Revise os cards até dominar completamente',
        'O sistema usa repetição espaçada para fixar o conteúdo',
        'Marque os módulos como estudados quando terminar',
      ],
      link: '/flashcards',
      linkText: 'Ir para Flashcards',
      color: 'blue',
    },
    {
      icon: QuestionMarkCircleIcon,
      title: '2. Pratique com FlashQuestões',
      description: 'Aplique o conhecimento em questões',
      details: [
        'Resolva questões de todas as matérias',
        'Use o diagnóstico de calibração para focar nos pontos fracos',
        'Revise os erros e entenda o motivo',
        'Objetivo: 90%+ de acerto em todas as matérias',
      ],
      link: '/flashquestoes',
      linkText: 'Ir para FlashQuestões',
      color: 'green',
    },
    {
      icon: ClipboardDocumentCheckIcon,
      title: '3. Faça Simulados',
      description: 'Avalie seu desempenho completo',
      details: [
        'Faça simulados completos regularmente',
        'Use o diagnóstico final para identificar pontos fracos',
        'Estude as matérias que precisam de calibração',
        'Treine o tempo de prova',
      ],
      link: '/simulado',
      linkText: 'Ir para Simulados',
      color: 'purple',
    },
    {
      icon: PencilSquareIcon,
      title: '4. Treine Redação',
      description: 'Domine a escrita dissertativa',
      details: [
        'Pratique redações com temas do edital',
        'Use o feedback da IA para melhorar',
        'Foque nos critérios: domínio, compreensão, argumentação, estrutura, conhecimento',
        'Objetivo: 9+ em todos os critérios',
      ],
      link: '/treino-redacao',
      linkText: 'Ir para Treino Redação',
      color: 'pink',
    },
    {
      icon: LightBulbIcon,
      title: '5. Use Mapas Mentais',
      description: 'Revise e fixe o conteúdo',
      details: [
        'Use para revisão rápida antes das provas',
        'Crie conexões entre os temas',
        'Visualize a estrutura do conteúdo',
        'Ideal para memorização',
      ],
      link: '/mapas-mentais',
      linkText: 'Ir para Mapas Mentais',
      color: 'yellow',
    },
  ]

  const metrics = [
    {
      icon: ChartBarIcon,
      title: 'Taxa de Acerto por Matéria',
      target: '90%+',
      description: 'Acompanhe no Dashboard e FlashQuestões. Foque nas matérias abaixo de 90%.',
    },
    {
      icon: BookOpenIcon,
      title: 'Módulos Estudados',
      target: '100%',
      description: 'Complete todos os módulos de todas as matérias antes da prova.',
    },
    {
      icon: TrophyIcon,
      title: 'Dias de Estudo Consecutivos',
      target: 'Máximo possível',
      description: 'Mantenha a sequência de estudos. Consistência é fundamental.',
    },
    {
      icon: PencilSquareIcon,
      title: 'Nota de Redação',
      target: '9+ em todos os critérios',
      description: 'Use o Treino de Redação e melhore com base no feedback da IA.',
    },
  ]

  const cycle = [
    {
      step: 1,
      title: 'Estude Flashcards',
      description: 'Base teórica',
    },
    {
      step: 2,
      title: 'Pratique Questões',
      description: 'Aplicação',
    },
    {
      step: 3,
      title: 'Faça Simulados',
      description: 'Avaliação',
    },
    {
      step: 4,
      title: 'Calibre Estudos',
      description: 'Foco nos pontos fracos',
    },
    {
      step: 5,
      title: 'Repita',
      description: 'Até dominar tudo',
    },
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <h1 className="text-4xl sm:text-5xl font-black text-slate-900 dark:text-white">
            📚 Guia de Estudos
          </h1>
          <p className="text-lg sm:text-xl text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
            Aprenda como usar a plataforma para alcançar 100% de acerto na prova e redação perfeita
          </p>
        </div>

        {/* Ciclo de Estudos */}
        <div className={`rounded-2xl p-6 sm:p-8 ${darkMode ? 'bg-slate-800' : 'bg-white'} shadow-xl`}>
          <h2 className="text-2xl sm:text-3xl font-bold mb-6 text-slate-900 dark:text-white flex items-center gap-3">
            <ChartBarIcon className="h-8 w-8 text-alego-600" />
            Ciclo de Estudos Recomendado
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
            {cycle.map((item, index) => (
              <div key={item.step} className="relative">
                <div
                  className={`rounded-xl p-4 text-center ${
                    darkMode ? 'bg-slate-700' : 'bg-gradient-to-br from-alego-50 to-alego-100'
                  }`}
                >
                  <div className="w-12 h-12 rounded-full bg-alego-600 text-white flex items-center justify-center font-bold text-xl mx-auto mb-3">
                    {item.step}
                  </div>
                  <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white mb-1">
                    {item.title}
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400">{item.description}</p>
                </div>
                {index < cycle.length - 1 && (
                  <div className="hidden sm:block absolute top-1/2 -right-2 transform -translate-y-1/2 z-10">
                    <ArrowRightIcon className="h-6 w-6 text-alego-600" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Passos Detalhados */}
        <div className="space-y-6">
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white text-center">
            Como Usar Cada Ferramenta
          </h2>
          {steps.map((step, index) => {
            const Icon = step.icon
            const colorClasses = {
              blue: 'from-blue-500 to-blue-600',
              green: 'from-green-500 to-green-600',
              purple: 'from-purple-500 to-purple-600',
              pink: 'from-pink-500 to-pink-600',
              yellow: 'from-yellow-500 to-yellow-600',
            }
            return (
              <div
                key={index}
                className={`rounded-2xl p-6 sm:p-8 ${
                  darkMode ? 'bg-slate-800' : 'bg-white'
                } shadow-xl border-2 border-slate-200 dark:border-slate-700`}
              >
                <div className="flex flex-col sm:flex-row gap-6">
                  <div className="flex-shrink-0">
                    <div
                      className={`w-16 h-16 rounded-xl bg-gradient-to-br ${colorClasses[step.color]} flex items-center justify-center shadow-lg`}
                    >
                      <Icon className="h-8 w-8 text-white" />
                    </div>
                  </div>
                  <div className="flex-1 space-y-4">
                    <div>
                      <h3 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mb-2">
                        {step.title}
                      </h3>
                      <p className="text-slate-600 dark:text-slate-400 text-lg">{step.description}</p>
                    </div>
                    <ul className="space-y-2">
                      {step.details.map((detail, idx) => (
                        <li key={idx} className="flex items-start gap-3">
                          <CheckCircleIcon className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                          <span className="text-slate-700 dark:text-slate-300">{detail}</span>
                        </li>
                      ))}
                    </ul>
                    <Link
                      to={step.link}
                      className={`inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-br ${colorClasses[step.color]} text-white font-semibold hover:shadow-lg transition-all hover:scale-105`}
                    >
                      {step.linkText}
                      <ArrowRightIcon className="h-5 w-5" />
                    </Link>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Métricas e Resultados */}
        <div className={`rounded-2xl p-6 sm:p-8 ${darkMode ? 'bg-slate-800' : 'bg-white'} shadow-xl`}>
          <h2 className="text-2xl sm:text-3xl font-bold mb-6 text-slate-900 dark:text-white flex items-center gap-3">
            <TrophyIcon className="h-8 w-8 text-alego-600" />
            Como Saber se Está Tendo Resultados
          </h2>
          <p className="text-slate-600 dark:text-slate-400 mb-6 text-lg">
            Acompanhe essas métricas no seu Dashboard e use o diagnóstico de calibração para focar nos pontos fracos:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {metrics.map((metric, index) => {
              const Icon = metric.icon
              return (
                <div
                  key={index}
                  className={`rounded-xl p-6 ${
                    darkMode ? 'bg-slate-700' : 'bg-gradient-to-br from-slate-50 to-slate-100'
                  } border-2 border-slate-200 dark:border-slate-600`}
                >
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0">
                      <div className="w-12 h-12 rounded-xl bg-alego-600 flex items-center justify-center">
                        <Icon className="h-6 w-6 text-white" />
                      </div>
                    </div>
                    <div className="flex-1">
                      <h3 className="font-bold text-lg text-slate-900 dark:text-white mb-1">
                        {metric.title}
                      </h3>
                      <p className="text-2xl font-black text-alego-600 mb-2">{metric.target}</p>
                      <p className="text-sm text-slate-600 dark:text-slate-400">{metric.description}</p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Dica Final */}
        <div
          className={`rounded-2xl p-6 sm:p-8 ${
            darkMode ? 'bg-gradient-to-br from-alego-900/30 to-alego-800/30' : 'bg-gradient-to-br from-alego-50 to-alego-100'
          } border-2 border-alego-300 dark:border-alego-700 shadow-xl`}
        >
          <div className="flex items-start gap-4">
            <LightBulbIcon className="h-8 w-8 text-alego-600 flex-shrink-0" />
            <div>
              <h3 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mb-3">
                💡 Dica Final
              </h3>
              <p className="text-lg text-slate-700 dark:text-slate-300 leading-relaxed">
                Use o <strong>diagnóstico de calibração</strong> que aparece após cada simulado e nas FlashQuestões. 
                Ele mostra exatamente quais matérias precisam de mais estudo. Foque nessas matérias até atingir 
                90%+ de acerto em todas. A plataforma te guia — siga as recomendações!
              </p>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="text-center space-y-4">
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-3 px-8 py-4 rounded-xl bg-gradient-to-br from-alego-600 to-alego-700 text-white font-bold text-lg hover:shadow-xl transition-all hover:scale-105"
          >
            <TrophyIcon className="h-6 w-6" />
            Começar a Estudar Agora
            <ArrowRightIcon className="h-6 w-6" />
          </Link>
        </div>
      </div>
    </div>
  )
}

export default GuiaEstudos

